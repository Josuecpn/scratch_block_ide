pub mod commands;
pub mod db;

use commands::compiler::compile_to_micropython;
use commands::device::{inject_to_lego_hub, list_lego_devices, stop_lego_hub};
use commands::simulation::{get_engine_health, simulate_block_step};
use commands::spike_exporter::export_spike_project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Inicializa o SQLite3 local via plugin oficial do Tauri v2 e roda as migrations
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_engine_health,
            simulate_block_step,
            compile_to_micropython,
            export_spike_project,
            list_lego_devices,
            inject_to_lego_hub,
            stop_lego_hub
        ])
        .run(tauri::generate_context!())
        .expect("Erro crítico ao iniciar a aplicação Tauri v2");
}
