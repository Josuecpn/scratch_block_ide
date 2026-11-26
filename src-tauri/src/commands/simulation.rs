use serde::{Deserialize, Serialize};
use crate::db;

#[derive(Serialize)]
pub struct AppHealth {
    pub status: String,
    pub database_url: String,
    pub engine_version: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SimStepRequest {
    pub opcode: String,
    pub param: Option<f64>,
    pub current_x: f64,
    pub current_y: f64,
    pub current_heading: f64,
}

#[derive(Serialize)]
pub struct SimStepResponse {
    pub next_x: f64,
    pub next_y: f64,
    pub next_heading: f64,
    pub left_motor_pct: i32,
    pub right_motor_pct: i32,
    pub log_message: String,
}

/// Comando IPC de diagnóstico de saúde do Backend Rust + SQLite3
#[tauri::command]
pub fn get_engine_health() -> AppHealth {
    AppHealth {
        status: "Online".into(),
        database_url: db::DB_URL.into(),
        engine_version: "RoboBlocks Core 0.1.0 (Tauri v2 + SQLite3)".into(),
    }
}

/// Comando IPC para calcular um passo determinístico de cinemática diferencial no Rust
#[tauri::command]
pub fn simulate_block_step(req: SimStepRequest) -> SimStepResponse {
    let mut x = req.current_x;
    let mut y = req.current_y;
    let mut heading = req.current_heading;
    let mut left_motor = 0;
    let mut right_motor = 0;

    match req.opcode.as_str() {
        "move_distance" => {
            let cm = req.param.unwrap_or(20.0);
            let dist_mm = cm * 10.0;
            let rad = heading.to_radians();
            x = (x + rad.cos() * dist_mm).clamp(-900.0, 900.0);
            y = (y + rad.sin() * dist_mm).clamp(-600.0, 600.0);
            left_motor = 60;
            right_motor = 60;
        }
        "turn_degrees" => {
            let deg = req.param.unwrap_or(90.0);
            heading = (heading + deg).rem_euclid(360.0);
            left_motor = 50;
            right_motor = -50;
        }
        "turn_left" => {
            let deg = req.param.unwrap_or(90.0);
            heading = (heading - deg).rem_euclid(360.0);
            left_motor = -50;
            right_motor = 50;
        }
        _ => {}
    }

    SimStepResponse {
        next_x: x,
        next_y: y,
        next_heading: heading,
        left_motor_pct: left_motor,
        right_motor_pct: right_motor,
        log_message: format!(
            "[Rust SimCore] Opcode '{}' executado -> Pose=({:.0}, {:.0}, {:.0}°)",
            req.opcode, x, y, heading
        ),
    }
}

