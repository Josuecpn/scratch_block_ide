pub mod commands;
pub mod db;

use commands::simulation::{get_engine_health, simulate_block_step};

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
            simulate_block_step
        ])
        .run(tauri::generate_context!())
        .expect("Erro crítico ao iniciar a aplicação Tauri v2");
}
