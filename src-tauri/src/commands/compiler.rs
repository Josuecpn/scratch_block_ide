use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BlockInputDto {
    pub id: String,
    pub category: String,
    pub opcode: String,
    pub label: String,
    pub param: Option< serde_json::Value >,
    pub unit: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RobotConfigDto {
    pub wheel_diameter_mm: f64,
    pub axle_track_mm: f64,
    pub left_motor_port: String,
    pub right_motor_port: String,
    pub color_sensor_port: String,
    pub distance_sensor_port: String,
}

impl Default for RobotConfigDto {
    fn default() -> Self {
        Self {
            wheel_diameter_mm: 56.0,
            axle_track_mm: 112.0,
            left_motor_port: "A".into(),
            right_motor_port: "B".into(),
            color_sensor_port: "C".into(),
            distance_sensor_port: "D".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PythonTargetFlavor {
    SpikeV3,
    Pybricks,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompileDiagnostic {
    pub block_id: Option<String>,
    pub severity: String, // "info" | "warning" | "error"
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompileRequest {
    pub project_name: String,
    pub blocks: Vec<BlockInputDto>,
    pub robot_config: Option<RobotConfigDto>,
    pub target: Option<PythonTargetFlavor>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompileResponse {
    pub python_code: String,
    pub target: String,
    pub diagnostics: Vec<CompileDiagnostic>,
    pub wheel_degrees_per_cm: f64,
}

fn param_as_f64(val: &Option<serde_json::Value>, default: f64) -> f64 {
    match val {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(default),
        Some(serde_json::Value::String(s)) => s.trim().replace(',', ".").parse::<f64>().unwrap_or(default),
        _ => default,
    }
}

fn param_as_string(val: &Option<serde_json::Value>, default: &str) -> String {
    match val {
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => s.trim().to_string(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => default.to_string(),
    }
}

fn map_spike_color(color_label: &str) -> &'static str {
    match color_label.to_lowercase().as_str() {
        "preto" | "black" => "color.BLACK",
        "vermelho" | "red" => "color.RED",
        "verde" | "green" => "color.GREEN",
        "azul" | "blue" => "color.BLUE",
        "amarelo" | "yellow" => "color.YELLOW",
        "branco" | "white" => "color.WHITE",
        "magenta" | "roxo" | "purple" => "color.MAGENTA",
        _ => "color.RED",
    }
}

fn map_pybricks_color(color_label: &str) -> &'static str {
    match color_label.to_lowercase().as_str() {
        "preto" | "black" => "Color.BLACK",
        "vermelho" | "red" => "Color.RED",
        "verde" | "green" => "Color.GREEN",
        "azul" | "blue" => "Color.BLUE",
        "amarelo" | "yellow" => "Color.YELLOW",
        "branco" | "white" => "Color.WHITE",
        _ => "Color.RED",
    }
}

/// Compila a pilha/grafo de blocos para MicroPython (LEGO SPIKE v3 Oficial ou Pybricks)
#[tauri::command]
pub fn compile_to_micropython(req: CompileRequest) -> Result<CompileResponse, String> {
    let cfg = req.robot_config.unwrap_or_default();
    let flavor = req.target.unwrap_or(PythonTargetFlavor::SpikeV3);
    let mut diagnostics = Vec::new();

    if req.blocks.is_empty() {
        diagnostics.push(CompileDiagnostic {
            block_id: None,
            severity: "warning".into(),
            message: "O canvas está vazio. Adicione um bloco de evento inicial.".into(),
        });
    } else if req.blocks[0].category != "events" {
        diagnostics.push(CompileDiagnostic {
            block_id: Some(req.blocks[0].id.clone()),
            severity: "warning".into(),
            message: "O primeiro bloco da pilha não é um evento (Hat). Recomenda-se iniciar com 'Quando o programa iniciar'.".into(),
        });
    }

    if cfg.left_motor_port == cfg.right_motor_port {
        diagnostics.push(CompileDiagnostic {
            block_id: None,
            severity: "error".into(),
            message: format!(
                "Conflito de portas: motor esquerdo e direito estão ambos na porta {}.",
                cfg.left_motor_port
            ),
        });
    }

    // Cálculo físico real: circunferência da roda = pi * diâmetro (mm)
    let wheel_diam_mm = cfg.wheel_diameter_mm.max(10.0);
    let wheel_circumference_cm = (PI * wheel_diam_mm) / 10.0;
    let degrees_per_cm = 360.0 / wheel_circumference_cm;
    let track_ratio = (cfg.axle_track_mm.max(20.0)) / wheel_diam_mm;

    let python_code = match flavor {
        PythonTargetFlavor::SpikeV3 => {
            generate_spike_v3_code(&req.project_name, &req.blocks, &cfg, degrees_per_cm, track_ratio, &mut diagnostics)
        }
        PythonTargetFlavor::Pybricks => {
            generate_pybricks_code(&req.project_name, &req.blocks, &cfg, &mut diagnostics)
        }
    };

    Ok(CompileResponse {
        python_code,
        target: match flavor {
            PythonTargetFlavor::SpikeV3 => "spike_v3".into(),
            PythonTargetFlavor::Pybricks => "pybricks".into(),
        },
        diagnostics,
        wheel_degrees_per_cm: (degrees_per_cm * 100.0).round() / 100.0,
    })
}

fn generate_spike_v3_code(
    project_name: &str,
    blocks: &[BlockInputDto],
    cfg: &RobotConfigDto,
    degrees_per_cm: f64,
    track_ratio: f64,
    diagnostics: &mut Vec<CompileDiagnostic>,
) -> String {
    let mut lines = vec![
        format!("# Projeto: {}", project_name),
        "# Alvo: LEGO Education SPIKE Prime v3 (MicroPython Nativo)".into(),
        format!(
            "# Geometria: Roda={:.1}mm ({:.2}°/cm) | Bitola={:.1}mm | Motores={}+{}",
            cfg.wheel_diameter_mm, degrees_per_cm, cfg.axle_track_mm, cfg.left_motor_port, cfg.right_motor_port
        ),
        "from hub import port, motion_sensor, light_matrix".into(),
        "import runloop".into(),
        "import motor".into(),
        "import motor_pair".into(),
        "import color_sensor".into(),
        "import distance_sensor".into(),
        "import color".into(),
        "".into(),
        "async def main():".into(),
        format!(
            "    motor_pair.pair(motor_pair.PAIR_1, port.{}, port.{})",
            cfg.left_motor_port, cfg.right_motor_port
        ),
        "    motion_sensor.reset_yaw(0)".into(),
        "    velocidade_padrao = 500  # graus/s (100% = 1000 deg/s no SPIKE v3)".into(),
    ];

    let mut indent_level: usize = 1;
    let mut repeat_blocks_remaining: usize = 0;

    for blk in blocks {
        let indent = "    ".repeat(indent_level);

        match blk.opcode.as_str() {
            "when_program_starts" => {
                lines.push(format!("{}# [Evento] Quando o programa iniciar", indent));
            }
            "when_color_detected" => {
                let col_str = param_as_string(&blk.param, "Vermelho");
                let spike_col = map_spike_color(&col_str);
                lines.push(format!(
                    "{}# [Evento] Aguardar até sensor na Porta {} detectar {}",
                    indent, cfg.color_sensor_port, col_str
                ));
                lines.push(format!(
                    "{}await runloop.until(lambda: color_sensor.color(port.{}) == {})",
                    indent, cfg.color_sensor_port, spike_col
                ));
            }
            "set_rgb_color" => {
                let col_str = param_as_string(&blk.param, "Azul");
                let spike_col = map_spike_color(&col_str);
                lines.push(format!("{}from hub import light", indent));
                lines.push(format!("{}light.color(light.POWER, {})  # LED RGB: {}", indent, spike_col, col_str));
            }
            "set_chameleon_mode" => {
                let mode_str = param_as_string(&blk.param, "Ativado");
                let enabled = !mode_str.eq_ignore_ascii_case("Desativado");
                lines.push(format!(
                    "{}# MODO_CAMALEAO: {} (LED espelha color_sensor.color(port.{}))",
                    indent,
                    if enabled { "True" } else { "False" },
                    cfg.color_sensor_port
                ));
            }
            "set_move_speed" => {
                let pct = param_as_f64(&blk.param, 60.0).clamp(1.0, 100.0);
                let deg_per_sec = (pct * 10.0).round() as i32;
                lines.push(format!(
                    "{}velocidade_padrao = {}  # {:.0}% da velocidade máxima",
                    indent, deg_per_sec, pct
                ));
            }
            "move_distance" => {
                let cm = param_as_f64(&blk.param, 20.0);
                let motor_degrees = (cm * degrees_per_cm).round() as i32;
                lines.push(format!(
                    "{}await motor_pair.move_for_degrees(motor_pair.PAIR_1, {}, 0, velocity=velocidade_padrao)  # {:.1} cm",
                    indent, motor_degrees, cm
                ));
            }
            "turn_degrees" => {
                let robot_deg = param_as_f64(&blk.param, 90.0);
                let motor_deg = (robot_deg * track_ratio).round() as i32;
                lines.push(format!(
                    "{}await motor_pair.move_for_degrees(motor_pair.PAIR_1, {}, 100, velocity=velocidade_padrao)  # Giro à direita {:.1}°",
                    indent, motor_deg, robot_deg
                ));
            }
            "turn_left" => {
                let robot_deg = param_as_f64(&blk.param, 90.0);
                let motor_deg = (robot_deg * track_ratio).round() as i32;
                lines.push(format!(
                    "{}await motor_pair.move_for_degrees(motor_pair.PAIR_1, {}, -100, velocity=velocidade_padrao)  # Giro à esquerda {:.1}°",
                    indent, motor_deg, robot_deg
                ));
            }
            "motor_run_rotations" => {
                let rotations = param_as_f64(&blk.param, 1.0);
                let degrees = (rotations * 360.0).round() as i32;
                lines.push(format!(
                    "{}await motor.run_for_degrees(port.{}, {}, velocidade_padrao)  # {:.2} rotações",
                    indent, cfg.left_motor_port, degrees, rotations
                ));
            }
            "dist_less_than" => {
                let dist_cm = param_as_f64(&blk.param, 15.0);
                let dist_mm = (dist_cm * 10.0).round() as i32;
                lines.push(format!(
                    "{}# [Sensor] Aguardar distância na Porta {} < {:.1} cm ({} mm)",
                    indent, cfg.distance_sensor_port, dist_cm, dist_mm
                ));
                lines.push(format!(
                    "{}await runloop.until(lambda: 0 <= distance_sensor.distance(port.{}) < {})",
                    indent, cfg.distance_sensor_port, dist_mm
                ));
            }
            "color_is" => {
                let col_str = param_as_string(&blk.param, "Preto");
                let spike_col = map_spike_color(&col_str);
                lines.push(format!(
                    "{}if color_sensor.color(port.{}) == {}:",
                    indent, cfg.color_sensor_port, spike_col
                ));
                lines.push(format!(
                    "{}    await light_matrix.write(\"{}\")",
                    indent, col_str
                ));
            }
            "wait_seconds" => {
                let secs = param_as_f64(&blk.param, 1.0).max(0.0);
                let ms = (secs * 1000.0).round() as i32;
                lines.push(format!("{}await runloop.sleep_ms({})", indent, ms));
            }
            "repeat_times" => {
                let times = (param_as_f64(&blk.param, 4.0).round() as i32).max(1);
                lines.push(format!("{}for _i in range({}):", indent, times));
                indent_level += 1;
                repeat_blocks_remaining = 2; // indenta os próximos comandos do escopo
                continue;
            }
            "math_add" => {
                let val = param_as_f64(&blk.param, 10.0);
                lines.push(format!("{}acumulador = velocidade_padrao + {}", indent, val));
            }
            "set_var" => {
                let val = param_as_f64(&blk.param, 50.0);
                lines.push(format!("{}velocidade = {}", indent, val));
                lines.push(format!("{}velocidade_padrao = int(velocidade * 10)", indent));
            }
            other => {
                diagnostics.push(CompileDiagnostic {
                    block_id: Some(blk.id.clone()),
                    severity: "warning".into(),
                    message: format!("Opcode '{}' traduzido como comentário.", other),
                });
                lines.push(format!("{}# Bloco customizado: {}", indent, other));
            }
        }

        if indent_level > 1 {
            if repeat_blocks_remaining > 1 {
                repeat_blocks_remaining -= 1;
            } else {
                indent_level = 1;
                repeat_blocks_remaining = 0;
            }
        }
    }

    if indent_level > 1 {
        let indent = "    ".repeat(indent_level);
        lines.push(format!("{}await runloop.sleep_ms(50)", indent));
    }

    lines.push("".into());
    lines.push("runloop.run(main())".into());
    lines.join("\n")
}

fn generate_pybricks_code(
    project_name: &str,
    blocks: &[BlockInputDto],
    cfg: &RobotConfigDto,
    diagnostics: &mut Vec<CompileDiagnostic>,
) -> String {
    let mut lines = vec![
        format!("# Projeto: {}", project_name),
        "# Alvo: Pybricks MicroPython (LEGO SPIKE Prime Hub)".into(),
        "from pybricks.hubs import PrimeHub".into(),
        "from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor".into(),
        "from pybricks.parameters import Port, Direction, Color".into(),
        "from pybricks.robotics import DriveBase".into(),
        "from pybricks.tools import wait".into(),
        "".into(),
        "hub = PrimeHub()".into(),
        format!(
            "left_motor = Motor(Port.{}, Direction.COUNTERCLOCKWISE)",
            cfg.left_motor_port
        ),
        format!("right_motor = Motor(Port.{})", cfg.right_motor_port),
        format!(
            "robot = DriveBase(left_motor, right_motor, wheel_diameter={:.1}, axle_track={:.1})",
            cfg.wheel_diameter_mm, cfg.axle_track_mm
        ),
        "robot.use_gyro(True)".into(),
        "".into(),
    ];

    let mut indent_level: usize = 0;
    let mut repeat_blocks_remaining: usize = 0;

    for blk in blocks {
        let indent = "    ".repeat(indent_level);

        match blk.opcode.as_str() {
            "when_program_starts" => {
                lines.push(format!("{}# Início do programa principal", indent));
            }
            "when_color_detected" => {
                let col_str = param_as_string(&blk.param, "Vermelho");
                let pb_col = map_pybricks_color(&col_str);
                lines.push(format!(
                    "{}color_sensor = ColorSensor(Port.{})",
                    indent, cfg.color_sensor_port
                ));
                lines.push(format!(
                    "{}while color_sensor.color() != {}:",
                    indent, pb_col
                ));
                lines.push(format!("{}    wait(10)", indent));
            }
            "set_rgb_color" => {
                let col_str = param_as_string(&blk.param, "Azul");
                let pb_col = map_pybricks_color(&col_str);
                lines.push(format!("{}hub.light.on({})  # LED RGB: {}", indent, pb_col, col_str));
            }
            "set_chameleon_mode" => {
                let mode_str = param_as_string(&blk.param, "Ativado");
                let enabled = !mode_str.eq_ignore_ascii_case("Desativado");
                lines.push(format!(
                    "{}# MODO_CAMALEAO: {} (hub.light.on(color_sensor.color()))",
                    indent,
                    if enabled { "True" } else { "False" }
                ));
            }
            "set_move_speed" => {
                let pct = param_as_f64(&blk.param, 60.0).clamp(5.0, 100.0);
                let speed_mm_s = (pct * 5.0).round() as i32;
                lines.push(format!(
                    "{}robot.settings(straight_speed={})  # {:.0}%",
                    indent, speed_mm_s, pct
                ));
            }
            "move_distance" => {
                let cm = param_as_f64(&blk.param, 20.0);
                let mm = (cm * 10.0).round() as i32;
                lines.push(format!("{}robot.straight({})  # {:.1} cm", indent, mm, cm));
            }
            "turn_degrees" => {
                let deg = param_as_f64(&blk.param, 90.0).round() as i32;
                lines.push(format!("{}robot.turn({})", indent, deg));
            }
            "turn_left" => {
                let deg = param_as_f64(&blk.param, 90.0).round() as i32;
                lines.push(format!("{}robot.turn(-{})", indent, deg));
            }
            "motor_run_rotations" => {
                let rot = param_as_f64(&blk.param, 1.0);
                let deg = (rot * 360.0).round() as i32;
                lines.push(format!("{}left_motor.run_angle(500, {})", indent, deg));
            }
            "dist_less_than" => {
                let cm = param_as_f64(&blk.param, 15.0);
                let mm = (cm * 10.0).round() as i32;
                lines.push(format!(
                    "{}dist_sensor = UltrasonicSensor(Port.{})",
                    indent, cfg.distance_sensor_port
                ));
                lines.push(format!("{}while dist_sensor.distance() >= {}:", indent, mm));
                lines.push(format!("{}    wait(10)", indent));
            }
            "color_is" => {
                let col_str = param_as_string(&blk.param, "Preto");
                let pb_col = map_pybricks_color(&col_str);
                lines.push(format!(
                    "{}color_sensor = ColorSensor(Port.{})",
                    indent, cfg.color_sensor_port
                ));
                lines.push(format!("{}if color_sensor.color() == {}:", indent, pb_col));
                lines.push(format!("{}    hub.display.text(\"{}\")", indent, col_str));
            }
            "wait_seconds" => {
                let secs = param_as_f64(&blk.param, 1.0).max(0.0);
                let ms = (secs * 1000.0).round() as i32;
                lines.push(format!("{}wait({})", indent, ms));
            }
            "repeat_times" => {
                let times = (param_as_f64(&blk.param, 4.0).round() as i32).max(1);
                lines.push(format!("{}for _i in range({}):", indent, times));
                indent_level += 1;
                repeat_blocks_remaining = 2;
                continue;
            }
            "math_add" => {
                let val = param_as_f64(&blk.param, 10.0);
                lines.push(format!("{}acumulador = {}", indent, val));
            }
            "set_var" => {
                let val = param_as_f64(&blk.param, 50.0);
                lines.push(format!("{}velocidade = {}", indent, val));
            }
            other => {
                diagnostics.push(CompileDiagnostic {
                    block_id: Some(blk.id.clone()),
                    severity: "warning".into(),
                    message: format!("Opcode '{}' traduzido como comentário no Pybricks.", other),
                });
                lines.push(format!("{}# {}", indent, other));
            }
        }

        if indent_level > 0 {
            if repeat_blocks_remaining > 1 {
                repeat_blocks_remaining -= 1;
            } else {
                indent_level = 0;
                repeat_blocks_remaining = 0;
            }
        }
    }

    if indent_level > 0 {
        let indent = "    ".repeat(indent_level);
        lines.push(format!("{}wait(50)", indent));
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_blocks() -> Vec<BlockInputDto> {
        vec![
            BlockInputDto {
                id: "b1".into(),
                category: "events".into(),
                opcode: "when_program_starts".into(),
                label: "Quando iniciar".into(),
                param: None,
                unit: None,
            },
            BlockInputDto {
                id: "b2".into(),
                category: "motion".into(),
                opcode: "set_move_speed".into(),
                label: "Velocidade".into(),
                param: Some(serde_json::json!(70)),
                unit: Some("%".into()),
            },
            BlockInputDto {
                id: "b3".into(),
                category: "motion".into(),
                opcode: "move_distance".into(),
                label: "Mover".into(),
                param: Some(serde_json::json!(20)),
                unit: Some("cm".into()),
            },
            BlockInputDto {
                id: "b4".into(),
                category: "motion".into(),
                opcode: "turn_degrees".into(),
                label: "Girar".into(),
                param: Some(serde_json::json!(90)),
                unit: Some("graus".into()),
            },
        ]
    }

    #[test]
    fn compiles_spike_v3_with_geometry() {
        let res = compile_to_micropython(CompileRequest {
            project_name: "Teste Spike".into(),
            blocks: sample_blocks(),
            robot_config: None,
            target: Some(PythonTargetFlavor::SpikeV3),
        })
        .expect("compilação spike_v3 deve ter sucesso");

        assert_eq!(res.target, "spike_v3");
        assert!(res.diagnostics.is_empty());
        assert!(res.python_code.contains("motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)"));
        assert!(res.python_code.contains("velocidade_padrao = 700"));
        assert!(res.python_code.contains("runloop.run(main())"));
        assert!((res.wheel_degrees_per_cm - 20.46).abs() < 0.1);
    }

    #[test]
    fn compiles_pybricks_and_detects_port_conflict() {
        let mut cfg = RobotConfigDto::default();
        cfg.right_motor_port = "A".into();

        let res = compile_to_micropython(CompileRequest {
            project_name: "Teste Pybricks".into(),
            blocks: sample_blocks(),
            robot_config: Some(cfg),
            target: Some(PythonTargetFlavor::Pybricks),
        })
        .expect("compilação pybricks deve retornar diagnóstico");

        assert_eq!(res.target, "pybricks");
        assert!(res.python_code.contains("DriveBase(left_motor, right_motor"));
        assert!(res.python_code.contains("robot.straight(200)"));
        assert!(res.diagnostics.iter().any(|d| d.severity == "error"));
    }
}

