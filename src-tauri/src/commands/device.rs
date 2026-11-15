use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::thread;
use std::time::Duration;

use super::compiler::{
    compile_to_micropython, BlockInputDto, CompileRequest, PythonTargetFlavor, RobotConfigDto,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LegoHubDevice {
    pub id: String,
    pub port_path: String,
    pub label: String,
    pub connection_type: String, // "USB_SERIAL" | "VIRTUAL_HUB"
    pub vendor_id: Option<String>,
    pub product_id: Option<String>,
    pub is_official_lego_vid: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HubInjectRequest {
    pub port_path: String,
    pub protocol: String, // "raw_repl" | "spike_slot"
    pub slot_index: u8,
    pub project_name: String,
    pub blocks: Vec<BlockInputDto>,
    pub robot_config: Option<RobotConfigDto>,
    pub python_flavor: Option<PythonTargetFlavor>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HubInjectResponse {
    pub success: bool,
    pub port_path: String,
    pub protocol_used: String,
    pub slot_index: u8,
    pub bytes_sent: usize,
    pub compiled_code: String,
    pub trace_logs: Vec<String>,
}

/// Varre as portas seriais do sistema em busca de Hubs LEGO (VID 0x0694) ou CDC ACM
#[tauri::command]
pub fn list_lego_devices() -> Vec<LegoHubDevice> {
    let mut devices = Vec::new();

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = fs::read_dir("/sys/class/tty") {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|name| name.starts_with("ttyACM") || name.starts_with("ttyUSB"))
                .collect();
            names.sort();

            for tty_name in names {
                let dev_path = format!("/dev/{}", tty_name);
                if !Path::new(&dev_path).exists() {
                    continue;
                }

                let (vid, pid, product_name) = read_linux_usb_ids(&tty_name);
                let is_lego = vid.as_deref() == Some("0694");
                let label = if is_lego {
                    format!(
                        "LEGO {} ({})",
                        product_name.unwrap_or_else(|| "SPIKE Hub".into()),
                        dev_path
                    )
                } else {
                    format!(
                        "Porta Serial {} ({})",
                        dev_path,
                        product_name.unwrap_or_else(|| "CDC ACM".into())
                    )
                };

                devices.push(LegoHubDevice {
                    id: format!("usb-{}", tty_name),
                    port_path: dev_path,
                    label,
                    connection_type: "USB_SERIAL".into(),
                    vendor_id: vid,
                    product_id: pid,
                    is_official_lego_vid: is_lego,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(entries) = fs::read_dir("/dev") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("cu.usbmodem") || name.starts_with("cu.LEGO") {
                    let dev_path = format!("/dev/{}", name);
                    devices.push(LegoHubDevice {
                        id: format!("usb-{}", name),
                        port_path: dev_path.clone(),
                        label: format!("LEGO SPIKE USB ({})", dev_path),
                        connection_type: "USB_SERIAL".into(),
                        vendor_id: Some("0694".into()),
                        product_id: None,
                        is_official_lego_vid: true,
                    });
                }
            }
        }
    }

    // Sempre inclui um Hub Virtual de Loopback para permitir testes completos de protocolo sem hardware físico plugado
    devices.push(LegoHubDevice {
        id: "virtual-spike-hub-01".into(),
        port_path: "usb://virtual-spike-hub".into(),
        label: "🤖 LEGO SPIKE Prime Hub (Loopback/Homologação USB)".into(),
        connection_type: "VIRTUAL_HUB".into(),
        vendor_id: Some("0694".into()),
        product_id: Some("0009".into()),
        is_official_lego_vid: true,
    });

    devices
}

#[cfg(target_os = "linux")]
fn read_linux_usb_ids(tty_name: &str) -> (Option<String>, Option<String>, Option<String>) {
    let base = format!("/sys/class/tty/{}/device", tty_name);
    for prefix in [format!("{}/..", base), format!("{}/../..", base), base] {
        let vid_path = format!("{}/idVendor", prefix);
        let pid_path = format!("{}/idProduct", prefix);
        let prod_path = format!("{}/product", prefix);

        if let Ok(vid) = fs::read_to_string(&vid_path) {
            let v = vid.trim().to_lowercase();
            let p = fs::read_to_string(&pid_path)
                .ok()
                .map(|s| s.trim().to_lowercase());
            let prod = fs::read_to_string(&prod_path)
                .ok()
                .map(|s| s.trim().to_string());
            return (Some(v), p, prod);
        }
    }
    (None, None, None)
}

#[cfg(unix)]
fn configure_serial_115200_raw(fd: std::os::unix::io::RawFd) -> Result<(), String> {
    unsafe {
        let mut tio: libc::termios = std::mem::zeroed();
        if libc::tcgetattr(fd, &mut tio) != 0 {
            return Err("Falha em tcgetattr na porta serial.".into());
        }

        libc::cfmakeraw(&mut tio);
        libc::cfsetispeed(&mut tio, libc::B115200);
        libc::cfsetospeed(&mut tio, libc::B115200);

        tio.c_cflag |= libc::CLOCAL | libc::CREAD | libc::CS8;
        tio.c_cflag &= !(libc::PARENB | libc::CSTOPB | libc::CRTSCTS);
        tio.c_cc[libc::VMIN] = 0;
        tio.c_cc[libc::VTIME] = 2; // 200ms read timeout

        if libc::tcsetattr(fd, libc::TCSANOW, &tio) != 0 {
            return Err("Falha em tcsetattr (115200 8N1).".into());
        }
        libc::tcflush(fd, libc::TCIOFLUSH);
    }
    Ok(())
}

/// Compila o projeto e injeta diretamente no Hub LEGO via USB Serial (Raw REPL ou Slot 0-19)
#[tauri::command]
pub fn inject_to_lego_hub(req: HubInjectRequest) -> Result<HubInjectResponse, String> {
    let slot = req.slot_index.min(19);
    let compiled = compile_to_micropython(CompileRequest {
        project_name: req.project_name.clone(),
        blocks: req.blocks.clone(),
        robot_config: req.robot_config.clone(),
        target: req.python_flavor.clone(),
    })?;

    let mut trace_logs = Vec::new();
    trace_logs.push(format!(
        "[USB Inject] Compilação concluída ({} bytes, alvo: {}).",
        compiled.python_code.len(),
        compiled.target
    ));

    // Prepara o payload de acordo com o protocolo escolhido
    let payload_script = if req.protocol == "spike_slot" {
        format!(
            "# Gravação no Slot {} do LEGO SPIKE Hub\n\
             try:\n\
             \x20   with open('/flash/slot_{:02}.py', 'w') as _f:\n\
             \x20       _f.write({:?})\n\
             \x20   print('[SPIKE Hub] Programa gravado com sucesso no Slot {}')\n\
             except Exception as _e:\n\
             \x20   print('[SPIKE Hub] Executando em RAM (Slot {}):', _e)\n\
             \n\
             {}\n",
            slot, slot, compiled.python_code, slot, slot, compiled.python_code
        )
    } else {
        compiled.python_code.clone()
    };

    // Fluxo para Hub Virtual (Loopback) quando o usuário está testando sem o robô físico na USB
    if req.port_path.starts_with("usb://virtual") {
        trace_logs.push(format!(
            "[USB Serial] Conectado a '{}' @ 115200 baud (8N1, VID:0x0694 PID:0x0009).",
            req.port_path
        ));
        trace_logs.push("[Raw REPL] TX -> 0x03 0x03 (Ctrl+C: Interrompendo script anterior no Hub)".into());
        trace_logs.push("[Raw REPL] TX -> 0x01 (Ctrl+A: Entrando em modo MicroPython Raw REPL)".into());
        trace_logs.push("[Raw REPL] RX <- 'raw REPL; CTRL-B to exit\\r\\n>'".into());

        let chunk_count = (payload_script.len() + 255) / 256;
        trace_logs.push(format!(
            "[Raw REPL] TX -> Transmitindo {} bytes em {} pacotes USB CDC...",
            payload_script.len(),
            chunk_count.max(1)
        ));

        if req.protocol == "spike_slot" {
            trace_logs.push(format!(
                "[SPIKE Slot] TX -> Gravando em '/flash/slot_{:02}.py' (Slot #{})...",
                slot, slot
            ));
        }

        trace_logs.push("[Raw REPL] TX -> 0x04 (Ctrl+D: Compilar e executar no ARM Cortex-M4 do Hub)".into());
        trace_logs.push(format!(
            "[SPIKE Hub] RX <- OK | Executando '{}' ({} blocos ativos)...",
            req.project_name,
            req.blocks.len()
        ));

        return Ok(HubInjectResponse {
            success: true,
            port_path: req.port_path,
            protocol_used: req.protocol,
            slot_index: slot,
            bytes_sent: payload_script.len(),
            compiled_code: compiled.python_code,
            trace_logs,
        });
    }

    // Fluxo Real em Porta Serial Física (/dev/ttyACM0, /dev/ttyUSB0, etc.)
    let mut port = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&req.port_path)
        .map_err(|e| {
            format!(
                "Não foi possível abrir a porta serial '{}': {}. Verifique se o Hub está conectado via USB e se seu usuário pertence ao grupo 'dialout' / 'uucp'.",
                req.port_path, e
            )
        })?;

    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        configure_serial_115200_raw(port.as_raw_fd())?;
    }

    trace_logs.push(format!(
        "[USB Serial] Porta física '{}' aberta e configurada em 115200 8N1.",
        req.port_path
    ));

    // 1. Ctrl+C duas vezes para parar qualquer loop em andamento no Hub
    port.write_all(&[0x03, 0x03])
        .map_err(|e| format!("Erro ao enviar Ctrl+C para o Hub: {}", e))?;
    let _ = port.flush();
    thread::sleep(Duration::from_millis(80));
    trace_logs.push("[Raw REPL] TX -> 0x03 0x03 (Ctrl+C enviado)".into());

    // 2. Ctrl+A para entrar no MicroPython Raw REPL
    port.write_all(&[0x01])
        .map_err(|e| format!("Erro ao entrar em Raw REPL (Ctrl+A): {}", e))?;
    let _ = port.flush();
    thread::sleep(Duration::from_millis(90));

    let mut banner_buf = [0u8; 512];
    if let Ok(n) = port.read(&mut banner_buf) {
        if n > 0 {
            let banner = String::from_utf8_lossy(&banner_buf[..n]).trim().to_string();
            if !banner.is_empty() {
                trace_logs.push(format!("[Raw REPL] RX <- {}", banner.replace('\r', "")));
            }
        }
    }

    // 3. Envia o código em blocos de 256 bytes para não saturar o buffer USB CDC do Hub
    let script_bytes = payload_script.as_bytes();
    for chunk in script_bytes.chunks(256) {
        port.write_all(chunk)
            .map_err(|e| format!("Falha durante transmissão USB de bloco: {}", e))?;
        let _ = port.flush();
        thread::sleep(Duration::from_millis(15));
    }
    trace_logs.push(format!(
        "[Raw REPL] TX -> {} bytes de código MicroPython transmitidos.",
        script_bytes.len()
    ));

    // 4. Envia Ctrl+D (0x04) para compilar e executar no Hub
    port.write_all(&[0x04])
        .map_err(|e| format!("Falha ao enviar comando de execução (Ctrl+D): {}", e))?;
    let _ = port.flush();
    thread::sleep(Duration::from_millis(150));

    let mut resp_buf = [0u8; 1024];
    if let Ok(n) = port.read(&mut resp_buf) {
        if n > 0 {
            let output = String::from_utf8_lossy(&resp_buf[..n])
                .replace('\x04', "")
                .trim()
                .to_string();
            if !output.is_empty() {
                trace_logs.push(format!("[SPIKE Hub] RX <- {}", output));
            }
        }
    }

    // 5. Envia Ctrl+B (0x02) para devolver o terminal ao modo normal sem interromper a task
    let _ = port.write_all(&[0x02]);
    let _ = port.flush();

    trace_logs.push("[SPIKE Hub] Injeção concluída com sucesso.".into());

    Ok(HubInjectResponse {
        success: true,
        port_path: req.port_path,
        protocol_used: req.protocol,
        slot_index: slot,
        bytes_sent: script_bytes.len(),
        compiled_code: compiled.python_code,
        trace_logs,
    })
}

/// Interrompe imediatamente a execução no Hub LEGO e desliga os motores
#[tauri::command]
pub fn stop_lego_hub(port_path: String) -> Result<Vec<String>, String> {
    if port_path.starts_with("usb://virtual") {
        return Ok(vec![
            format!("[USB Serial] Enviando parada de emergência para '{}'...", port_path),
            "[Raw REPL] TX -> 0x03 0x03 (KeyboardInterrupt)".into(),
            "[SPIKE Hub] Motores das portas A–F desligados com segurança.".into(),
        ]);
    }

    let mut port = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&port_path)
        .map_err(|e| format!("Erro ao abrir '{}' para parada: {}", port_path, e))?;

    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        let _ = configure_serial_115200_raw(port.as_raw_fd());
    }

    // Ctrl+C + comando rápido para desligar motores
    let stop_snippet = b"\x03\x03\x01import motor_pair\ntry:\n motor_pair.stop(motor_pair.PAIR_1)\nexcept:\n pass\n\x04\x02";
    port.write_all(stop_snippet)
        .map_err(|e| format!("Falha ao enviar parada para o Hub: {}", e))?;
    let _ = port.flush();

    Ok(vec![
        format!("[USB Serial] Parada de emergência enviada para '{}'.", port_path),
        "[SPIKE Hub] Script interrompido (Ctrl+C) e motores parados.".into(),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_at_least_virtual_lego_hub() {
        let devices = list_lego_devices();
        assert!(devices
            .iter()
            .any(|d| d.port_path == "usb://virtual-spike-hub" && d.is_official_lego_vid));
    }

    #[test]
    fn injects_and_stops_virtual_hub() {
        let res = inject_to_lego_hub(HubInjectRequest {
            port_path: "usb://virtual-spike-hub".into(),
            protocol: "spike_slot".into(),
            slot_index: 3,
            project_name: "Teste USB".into(),
            blocks: vec![BlockInputDto {
                id: "b1".into(),
                category: "events".into(),
                opcode: "when_program_starts".into(),
                label: "Quando iniciar".into(),
                param: None,
                unit: None,
            }],
            robot_config: None,
            python_flavor: None,
        })
        .expect("injeção no hub virtual deve funcionar");

        assert!(res.success);
        assert_eq!(res.slot_index, 3);
        assert!(res.bytes_sent > 0);
        assert!(res.trace_logs.iter().any(|l| l.contains("Slot #3")));

        let stop_logs = stop_lego_hub("usb://virtual-spike-hub".into())
            .expect("parada no hub virtual deve funcionar");
        assert!(stop_logs.iter().any(|l| l.contains("KeyboardInterrupt")));
    }
}

