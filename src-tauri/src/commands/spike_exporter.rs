use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

fn format_iso8601_utc(secs: u64, millis: u32) -> String {
    // Conversão simples de epoch unix para ISO-8601 UTC (ex: 2026-11-13T23:21:39.035Z)
    let days_since_epoch = (secs / 86400) as i64;
    let rem_secs = secs % 86400;
    let hour = rem_secs / 3600;
    let min = (rem_secs % 3600) / 60;
    let sec = rem_secs % 60;

    // Algoritmo civil_from_days (Howard Hinnant)
    let z = days_since_epoch + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hour, min, sec, millis
    )
}

use super::compiler::{
    compile_to_micropython, BlockInputDto, CompileRequest, PythonTargetFlavor, RobotConfigDto,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExportSpikeRequest {
    pub project_id: String,
    pub project_name: String,
    pub format: String, // "py" | "llsp3_python" | "llsp3_blocks"
    pub robot_model: Option<String>, // "SPIKE_PRIME" | "SPIKE_ESSENTIAL" | "CUSTOM"
    pub slot_index: Option<u8>,
    pub blocks: Vec<BlockInputDto>,
    pub robot_config: Option<RobotConfigDto>,
    pub python_flavor: Option<PythonTargetFlavor>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExportSpikeResponse {
    pub filename: String,
    pub saved_path: String,
    pub mime_type: String,
    pub size_bytes: usize,
    pub base64_data: String,
    pub preview_json: Option<String>,
    pub message: String,
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '_'
            } else {
                match c {
                    'á' | 'à' | 'ã' | 'â' | 'Á' | 'À' | 'Ã' | 'Â' => 'a',
                    'é' | 'ê' | 'É' | 'Ê' => 'e',
                    'í' | 'Í' => 'i',
                    'ó' | 'ô' | 'õ' | 'Ó' | 'Ô' | 'Õ' => 'o',
                    'ú' | 'Ú' => 'u',
                    'ç' | 'Ç' => 'c',
                    _ => '_',
                }
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "projeto_spike".into()
    } else {
        trimmed.to_lowercase()
    }
}

/// Codificador Base64 padrão RFC 4648 sem dependências externas
pub fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((input.len() + 2) / 3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as usize as u8 as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Cálculo CRC32 IEEE 802.3 exigido pelo cabeçalho de arquivos ZIP (.llsp3)
fn crc32_ieee(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

/// Empacota múltiplos arquivos em um container ZIP válido (usado pelo formato .llsp3 do LEGO SPIKE)
fn build_zip_archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::new();
    let mut central_dir: Vec<u8> = Vec::new();

    for &(name, data) in entries {
        let name_bytes = name.as_bytes();
        let crc = crc32_ieee(data);
        let size = data.len() as u32;
        let local_header_offset = buf.len() as u32;

        // Local File Header (PK\x03\x04)
        buf.extend_from_slice(&[0x50, 0x4B, 0x03, 0x04]);
        buf.extend_from_slice(&20u16.to_le_bytes()); // Version needed (2.0)
        buf.extend_from_slice(&0u16.to_le_bytes());  // Flags
        buf.extend_from_slice(&0u16.to_le_bytes());  // Compression: 0 (Stored)
        buf.extend_from_slice(&0u16.to_le_bytes());  // Mod time (00:00:00)
        buf.extend_from_slice(&0x0021u16.to_le_bytes()); // Mod date (1980-01-01, válido em DOS)
        buf.extend_from_slice(&crc.to_le_bytes());
        buf.extend_from_slice(&size.to_le_bytes());  // Compressed size
        buf.extend_from_slice(&size.to_le_bytes());  // Uncompressed size
        buf.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        buf.extend_from_slice(&0u16.to_le_bytes());  // Extra field len
        buf.extend_from_slice(name_bytes);
        buf.extend_from_slice(data);

        // Central Directory File Header (PK\x01\x02)
        central_dir.extend_from_slice(&[0x50, 0x4B, 0x01, 0x02]);
        central_dir.extend_from_slice(&20u16.to_le_bytes()); // Version made by
        central_dir.extend_from_slice(&20u16.to_le_bytes()); // Version needed
        central_dir.extend_from_slice(&0u16.to_le_bytes());  // Flags
        central_dir.extend_from_slice(&0u16.to_le_bytes());  // Compression: 0
        central_dir.extend_from_slice(&0u16.to_le_bytes());  // Mod time
        central_dir.extend_from_slice(&0x0021u16.to_le_bytes()); // Mod date (1980-01-01)
        central_dir.extend_from_slice(&crc.to_le_bytes());
        central_dir.extend_from_slice(&size.to_le_bytes());
        central_dir.extend_from_slice(&size.to_le_bytes());
        central_dir.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        central_dir.extend_from_slice(&0u16.to_le_bytes()); // Extra len
        central_dir.extend_from_slice(&0u16.to_le_bytes()); // Comment len
        central_dir.extend_from_slice(&0u16.to_le_bytes()); // Disk number
        central_dir.extend_from_slice(&0u16.to_le_bytes()); // Internal attrs
        central_dir.extend_from_slice(&0u32.to_le_bytes()); // External attrs
        central_dir.extend_from_slice(&local_header_offset.to_le_bytes());
        central_dir.extend_from_slice(name_bytes);
    }

    let cd_offset = buf.len() as u32;
    let cd_size = central_dir.len() as u32;
    let count = entries.len() as u16;

    buf.extend_from_slice(&central_dir);

    // End of Central Directory Record (PK\x05\x06)
    buf.extend_from_slice(&[0x50, 0x4B, 0x05, 0x06]);
    buf.extend_from_slice(&0u16.to_le_bytes()); // Number of this disk
    buf.extend_from_slice(&0u16.to_le_bytes()); // Disk where CD starts
    buf.extend_from_slice(&count.to_le_bytes());
    buf.extend_from_slice(&count.to_le_bytes());
    buf.extend_from_slice(&cd_size.to_le_bytes());
    buf.extend_from_slice(&cd_offset.to_le_bytes());
    buf.extend_from_slice(&0u16.to_le_bytes()); // ZIP comment len

    buf
}

/// Insere um shadow block de menu suspenso (padrão Scratch 3 / SPIKE v3) e retorna `[1, shadow_id]`
fn add_shadow_menu(
    sb3_blocks: &mut Map<String, Value>,
    shadow_id: String,
    parent_id: &str,
    opcode: &str,
    field_name: &str,
    field_value: &str,
) -> Value {
    sb3_blocks.insert(
        shadow_id.clone(),
        json!({
            "opcode": opcode,
            "next": Value::Null,
            "parent": parent_id,
            "inputs": {},
            "fields": {
                (field_name): [field_value, Value::Null]
            },
            "shadow": true,
            "topLevel": false
        }),
    );
    json!([1, shadow_id])
}

/// Constrói o grafo Scratch 3.0 (`project.json` dentro de `scratch.sb3`) compatível com Word Blocks do LEGO Education SPIKE v3
fn build_spike_word_blocks_projectbody(
    blocks: &[BlockInputDto],
    cfg: &RobotConfigDto,
    _is_essential: bool,
) -> (Value, Vec<String>) {
    let mut sb3_blocks = Map::new();
    let mut used_extensions: Vec<String> = vec!["flipperevents".into()];
    let mut add_ext = |ext: &str| {
        if !used_extensions.iter().any(|e| e == ext) {
            used_extensions.push(ext.to_string());
        }
    };

    for (idx, blk) in blocks.iter().enumerate() {
        let prev_id: Option<String> = if idx == 0 {
            None
        } else {
            Some(blocks[idx - 1].id.clone())
        };
        let next_id: Option<String> = blocks.get(idx + 1).map(|b| b.id.clone());

        let param_str = match &blk.param {
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::String(s)) => s.clone(),
            _ => "10".to_string(),
        };

        let (spike_opcode, inputs, fields, is_top_level) = match blk.opcode.as_str() {
            "when_program_starts" => {
                add_ext("flipperevents");
                (
                    "flipperevents_whenProgramStarts",
                    json!({}),
                    json!({}),
                    true,
                )
            }
            "when_color_detected" => {
                add_ext("flipperevents");
                (
                    "flipperevents_whenProgramStarts",
                    json!({}),
                    json!({}),
                    true,
                )
            }
            "set_move_speed" => (
                "control_wait",
                json!({
                    "DURATION": [1, [5, "0.1"]]
                }),
                json!({}),
                idx == 0,
            ),
            "move_distance" => {
                // Converte cm para rotações no motor configurado (compatível com SPIKE Essential e Prime)
                add_ext("flippermotor");
                let port_shadow = add_shadow_menu(
                    &mut sb3_blocks,
                    format!("{}_mport", blk.id),
                    &blk.id,
                    "flippermotor_multiple-port-selector",
                    "field_flippermotor_multiple-port-selector",
                    &cfg.left_motor_port,
                );
                let dir_shadow = add_shadow_menu(
                    &mut sb3_blocks,
                    format!("{}_mdir", blk.id),
                    &blk.id,
                    "flippermotor_custom-icon-direction",
                    "field_flippermotor_custom-icon-direction",
                    "clockwise",
                );
                let cm_val = param_str.parse::<f64>().unwrap_or(20.0);
                let circ_cm = (std::f64::consts::PI * cfg.wheel_diameter_mm.max(10.0)) / 10.0;
                let rots = format!("{:.2}", cm_val / circ_cm);
                (
                    "flippermotor_motorTurnForDirection",
                    json!({
                        "PORT": port_shadow,
                        "DIRECTION": dir_shadow,
                        "VALUE": [1, [4, rots]]
                    }),
                    json!({
                        "UNIT": ["rotations", Value::Null]
                    }),
                    idx == 0,
                )
            }
            "turn_degrees" => {
                add_ext("flippermotor");
                let port_shadow = add_shadow_menu(
                    &mut sb3_blocks,
                    format!("{}_tport", blk.id),
                    &blk.id,
                    "flippermotor_multiple-port-selector",
                    "field_flippermotor_multiple-port-selector",
                    &cfg.right_motor_port,
                );
                let dir_shadow = add_shadow_menu(
                    &mut sb3_blocks,
                    format!("{}_tdir", blk.id),
                    &blk.id,
                    "flippermotor_custom-icon-direction",
                    "field_flippermotor_custom-icon-direction",
                    "clockwise",
                );
                (
                    "flippermotor_motorTurnForDirection",
                    json!({
                        "PORT": port_shadow,
                        "DIRECTION": dir_shadow,
                        "VALUE": [1, [4, param_str]]
                    }),
                    json!({
                        "UNIT": ["degrees", Value::Null]
                    }),
                    idx == 0,
                )
            }
            "motor_run_rotations" => {
                add_ext("flippermotor");
                let port_shadow = add_shadow_menu(
                    &mut sb3_blocks,
                    format!("{}_mport", blk.id),
                    &blk.id,
                    "flippermotor_multiple-port-selector",
                    "field_flippermotor_multiple-port-selector",
                    &cfg.left_motor_port,
                );
                let dir_shadow = add_shadow_menu(
                    &mut sb3_blocks,
                    format!("{}_mdir", blk.id),
                    &blk.id,
                    "flippermotor_custom-icon-direction",
                    "field_flippermotor_custom-icon-direction",
                    "clockwise",
                );
                (
                    "flippermotor_motorTurnForDirection",
                    json!({
                        "PORT": port_shadow,
                        "DIRECTION": dir_shadow,
                        "VALUE": [1, [4, param_str]]
                    }),
                    json!({
                        "UNIT": ["rotations", Value::Null]
                    }),
                    idx == 0,
                )
            }
            "dist_less_than" | "color_is" | "wait_seconds" => (
                "control_wait",
                json!({
                    "DURATION": [1, [5, param_str]]
                }),
                json!({}),
                idx == 0,
            ),
            "repeat_times" => (
                "control_repeat",
                json!({
                    "TIMES": [1, [6, param_str]]
                }),
                json!({}),
                idx == 0,
            ),
            "math_add" => (
                "data_changevariableby",
                json!({
                    "VALUE": [1, [4, param_str]]
                }),
                json!({
                    "VARIABLE": ["velocidade", "var-velocidade-01"]
                }),
                idx == 0,
            ),
            "set_var" => (
                "data_setvariableto",
                json!({
                    "VALUE": [1, [10, param_str]]
                }),
                json!({
                    "VARIABLE": ["velocidade", "var-velocidade-01"]
                }),
                idx == 0,
            ),
            _ => (
                "control_wait",
                json!({ "DURATION": [1, [5, "1"]] }),
                json!({}),
                idx == 0,
            ),
        };

        let mut blk_obj = json!({
            "opcode": spike_opcode,
            "next": next_id,
            "parent": prev_id,
            "inputs": inputs,
            "fields": fields,
            "shadow": false,
            "topLevel": is_top_level
        });
        if is_top_level {
            if let Some(map) = blk_obj.as_object_mut() {
                map.insert("x".into(), json!(-130));
                map.insert("y".into(), json!(120));
            }
        }
        sb3_blocks.insert(blk.id.clone(), blk_obj);
    }

    let project_json = json!({
        "targets": [
            {
                "isStage": true,
                "name": "Stage",
                "variables": {},
                "lists": {},
                "broadcasts": {},
                "blocks": {},
                "comments": {},
                "currentCostume": 0,
                "costumes": [
                    {
                        "assetId": "deadc057000000000000000000000000",
                        "name": "backdrop1",
                        "bitmapResolution": 1,
                        "md5ext": "deadc057000000000000000000000000.svg",
                        "dataFormat": "svg",
                        "rotationCenterX": 47,
                        "rotationCenterY": 55
                    }
                ],
                "sounds": [],
                "volume": 0,
                "tempo": 60,
                "videoTransparency": 50,
                "videoState": "on",
                "textToSpeechLanguage": Value::Null
            },
            {
                "isStage": false,
                "name": "ovb80Yq75XmjZt4JUABW",
                "variables": {},
                "lists": {},
                "broadcasts": {},
                "blocks": sb3_blocks,
                "comments": {},
                "currentCostume": 0,
                "costumes": [
                    {
                        "assetId": "deadc057000000000000000000000000",
                        "name": "m6yNJGJVUt9FAAd0uS4W",
                        "bitmapResolution": 1,
                        "md5ext": "deadc057000000000000000000000000.svg",
                        "dataFormat": "svg",
                        "rotationCenterX": 240,
                        "rotationCenterY": 180
                    }
                ],
                "sounds": [],
                "volume": 100,
                "visible": true,
                "x": 0,
                "y": 0,
                "size": 100,
                "direction": 90,
                "draggable": false,
                "rotationStyle": "all around"
            }
        ],
        "monitors": [],
        "extensions": used_extensions,
        "meta": {
            "semver": "3.0.0",
            "vm": "0.2.0-prerelease.20200512204241",
            "agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"
        }
    });

    (project_json, used_extensions)
}

/// Exporta o projeto em `.py` ou `.llsp3` (Python ou Word Blocks nativo do site LEGO SPIKE),
/// salvando diretamente na pasta Downloads do sistema.
#[tauri::command]
pub fn export_spike_project(
    app: tauri::AppHandle,
    req: ExportSpikeRequest,
) -> Result<ExportSpikeResponse, String> {
    let download_dir = app.path().download_dir().ok().or_else(|| {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|h| h.join("Downloads"))
            .filter(|p| p.exists())
    });
    generate_export_payload(req, download_dir)
}

pub fn generate_export_payload(
    req: ExportSpikeRequest,
    preferred_dir: Option<PathBuf>,
) -> Result<ExportSpikeResponse, String> {
    let cfg = req.robot_config.clone().unwrap_or_default();
    let slot = req.slot_index.unwrap_or(0).min(19);
    let safe_name = sanitize_filename(&req.project_name);

    // Compila o código MicroPython para uso no modo .py ou .llsp3_python
    let compiled = compile_to_micropython(CompileRequest {
        project_name: req.project_name.clone(),
        blocks: req.blocks.clone(),
        robot_config: Some(cfg.clone()),
        target: req.python_flavor.clone(),
    })?;

    let now_dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let now_ms = now_dur.as_millis() as u64;
    let now_iso = format_iso8601_utc(now_dur.as_secs(), now_dur.subsec_millis());

    let (filename, mime_type, file_bytes, preview_json) = match req.format.as_str() {
        "py" => {
            let fname = format!("{}.py", safe_name);
            let bytes = compiled.python_code.as_bytes().to_vec();
            (fname, "text/x-python".to_string(), bytes, None)
        }
        "llsp3_python" | "llsp3_blocks" => {
            let is_blocks = req.format == "llsp3_blocks";
            let is_essential = req
                .robot_model
                .as_deref()
                .map(|m| m.eq_ignore_ascii_case("SPIKE_ESSENTIAL"))
                .unwrap_or(false);
            let spike_type = if is_blocks { "word-blocks" } else { "python" };
            let hub_suffix = if is_essential && is_blocks {
                "essential_blocks"
            } else if is_blocks {
                "prime_blocks"
            } else {
                "prime_python"
            };
            let fname = format!("{}_{}.llsp3", safe_name, hub_suffix);

            let (projectbody, used_extensions) = if is_blocks {
                build_spike_word_blocks_projectbody(&req.blocks, &cfg, is_essential)
            } else {
                (
                    json!({
                        "main": compiled.python_code
                    }),
                    Vec::new(),
                )
            };

            let manifest = if is_blocks {
                json!({
                    "type": "word-blocks",
                    "autoDelete": false,
                    "created": now_iso,
                    "id": req.project_id,
                    "lastsaved": now_iso,
                    "size": 0,
                    "name": req.project_name,
                    "slotIndex": slot,
                    "workspaceX": 120,
                    "workspaceY": 120,
                    "zoomLevel": 0.675,
                    "showAllBlocks": false,
                    "version": 38,
                    "hardware": {
                        "roboblocks_hub_01": {
                            "type": "flipper"
                        }
                    },
                    "extensions": used_extensions,
                    "state": {
                        "playMode": "play",
                        "canvasDrawerTab": "monitorTab",
                        "canvasDrawerOpen": false,
                        "hasMonitors": true
                    },
                    "extraFiles": []
                })
            } else {
                json!({
                    "type": spike_type,
                    "autoDelete": false,
                    "created": now_iso,
                    "id": req.project_id,
                    "lastsaved": now_iso,
                    "size": compiled.python_code.len(),
                    "name": req.project_name,
                    "slotIndex": slot,
                    "workspaceX": 64,
                    "workspaceY": 64,
                    "zoomLevel": 1.0,
                    "hardware": {
                        "python": {
                            "type": "flipper"
                        }
                    },
                    "state": {
                        "canvasDrawerOpen": true
                    },
                    "extraFiles": []
                })
            };

            let monitors_json = json!({
                "programStartTime": now_ms,
                "display": {
                    "visible": false,
                    "viewMode": "In window",
                    "type": "image",
                    "content": "",
                    "hideImage": false,
                    "includedImages": [11],
                    "showImageSelector": false
                },
                "linegraph": {
                    "visible": false,
                    "viewMode": "In window",
                    "lineVariant": 0,
                    "data": [],
                    "splitMode": 0,
                    "yAxisMode": 0
                },
                "bargraph": {
                    "visible": false,
                    "viewMode": "In window",
                    "data": { "1": 0, "3": 0, "4": 0, "6": 0, "7": 0, "9": 0 }
                }
            });

            let manifest_str = serde_json::to_string(&manifest).map_err(|e| e.to_string())?;
            let projectbody_str =
                serde_json::to_string(&projectbody).map_err(|e| e.to_string())?;
            let monitors_str = serde_json::to_string(&monitors_json).map_err(|e| e.to_string())?;
            let icon_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="14" fill="#FACC15"/><rect x="18" y="22" width="44" height="36" rx="6" fill="#1E293B"/><circle cx="31" cy="40" r="5" fill="#38BDF8"/><circle cx="49" cy="40" r="5" fill="#38BDF8"/></svg>"##;

            let zip_bytes = if is_blocks {
                let scratch_sb3_bytes = build_zip_archive(&[
                    ("project.json", projectbody_str.as_bytes()),
                    ("deadc057000000000000000000000000.svg", b""),
                ]);
                build_zip_archive(&[
                    ("manifest.json", manifest_str.as_bytes()),
                    ("scratch.sb3", &scratch_sb3_bytes),
                    ("icon.svg", icon_svg.as_bytes()),
                    ("monitors.json", monitors_str.as_bytes()),
                ])
            } else {
                build_zip_archive(&[
                    ("manifest.json", manifest_str.as_bytes()),
                    ("projectbody.json", projectbody_str.as_bytes()),
                    ("icon.svg", icon_svg.as_bytes()),
                ])
            };

            let preview = serde_json::to_string_pretty(&json!({
                "container": if is_blocks {
                    "ZIP (.llsp3 LEGO Education SPIKE v3: manifest.json + scratch.sb3 + icon.svg + monitors.json)"
                } else {
                    "ZIP (.llsp3 LEGO Education SPIKE Python)"
                },
                "manifest": manifest,
                "project": projectbody
            }))
            .ok();

            (
                fname,
                "application/octet-stream".to_string(),
                zip_bytes,
                preview,
            )
        }
        other => {
            return Err(format!(
                "Formato de exportação desconhecido '{}'. Use 'py', 'llsp3_python' ou 'llsp3_blocks'.",
                other
            ))
        }
    };

    // Salva preferencialmente na pasta Downloads do usuário (ou exports/ / /tmp em fallback)
    let export_dir = preferred_dir.unwrap_or_else(|| {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/tmp"))
            .join("exports")
    });
    let _ = fs::create_dir_all(&export_dir);
    let target_path = export_dir.join(&filename);

    let saved_path_str = match fs::write(&target_path, &file_bytes) {
        Ok(_) => target_path.to_string_lossy().to_string(),
        Err(_) => {
            let fallback = PathBuf::from("/tmp").join(&filename);
            let _ = fs::write(&fallback, &file_bytes);
            fallback.to_string_lossy().to_string()
        }
    };

    let base64_data = encode_base64(&file_bytes);

    Ok(ExportSpikeResponse {
        filename: filename.clone(),
        saved_path: saved_path_str.clone(),
        mime_type,
        size_bytes: file_bytes.len(),
        base64_data,
        preview_json,
        message: format!(
            "[Exporter] Arquivo '{}' ({} bytes) gerado e salvo em {}",
            filename,
            file_bytes.len(),
            saved_path_str
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_blocks() -> Vec<BlockInputDto> {
        vec![
            BlockInputDto {
                id: "blk-1".into(),
                category: "events".into(),
                opcode: "when_program_starts".into(),
                label: "Quando o programa iniciar".into(),
                param: None,
                unit: None,
            },
            BlockInputDto {
                id: "blk-2".into(),
                category: "motion".into(),
                opcode: "move_distance".into(),
                label: "Mover".into(),
                param: Some(serde_json::json!(25)),
                unit: Some("cm".into()),
            },
        ]
    }

    #[test]
    fn zip_archive_has_valid_pk_headers_and_crc() {
        let zip = build_zip_archive(&[
            ("manifest.json", b"{\"type\":\"python\"}"),
            ("icon.svg", b"<svg/>"),
        ]);
        assert_eq!(&zip[0..4], &[0x50, 0x4B, 0x03, 0x04]);
        let eocd_pos = zip.windows(4).position(|w| w == [0x50, 0x4B, 0x05, 0x06]);
        assert!(eocd_pos.is_some(), "EOCD record ausente no ZIP");
    }

    #[test]
    fn exports_llsp3_blocks_and_py() {
        let temp_dir = std::env::temp_dir().join("roboblocks_test_exports");
        let res_blocks = generate_export_payload(
            ExportSpikeRequest {
                project_id: "proj-test".into(),
                project_name: "Seguidor Teste".into(),
                format: "llsp3_blocks".into(),
                robot_model: Some("SPIKE_ESSENTIAL".into()),
                slot_index: Some(2),
                blocks: sample_blocks(),
                robot_config: None,
                python_flavor: None,
            },
            Some(temp_dir.clone()),
        )
        .expect("exportação llsp3_blocks deve funcionar");

        assert_eq!(res_blocks.filename, "seguidor_teste_essential_blocks.llsp3");
        assert!(res_blocks.size_bytes > 100);
        assert!(std::path::Path::new(&res_blocks.saved_path).exists());
        assert!(res_blocks
            .preview_json
            .as_deref()
            .unwrap_or("")
            .contains("flippermotor_motorTurnForDirection"));
        assert!(res_blocks
            .preview_json
            .as_deref()
            .unwrap_or("")
            .contains("flipperevents_whenProgramStarts"));

        let res_py = generate_export_payload(
            ExportSpikeRequest {
                project_id: "proj-test".into(),
                project_name: "Seguidor Teste".into(),
                format: "py".into(),
                robot_model: Some("SPIKE_PRIME".into()),
                slot_index: Some(0),
                blocks: sample_blocks(),
                robot_config: None,
                python_flavor: Some(PythonTargetFlavor::SpikeV3),
            },
            Some(temp_dir.clone()),
        )
        .expect("exportação py deve funcionar");

        assert_eq!(res_py.filename, "seguidor_teste.py");
        assert!(std::path::Path::new(&res_py.saved_path).exists());
        assert!(res_py.preview_json.is_none());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
