use tauri_plugin_sql::{Migration, MigrationKind};

/// URL do banco SQLite local (criado automaticamente na pasta AppConfig/AppData do sistema)
pub const DB_URL: &str = "sqlite:roboblocks.db";

/// Retorna todas as migrações que o tauri-plugin-sql executará na inicialização
pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_roboblocks_schema",
            sql: include_str!("../migrations/001_init_hub.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_workspace_and_seed_demo",
            sql: include_str!("../migrations/002_init_workspace.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_robot_visual_json",
            sql: include_str!("../migrations/003_robot_visual_and_arena.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_canvas_definitions_json",
            sql: include_str!("../migrations/004_custom_definitions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "migrate_legacy_blocks_and_defaults",
            sql: include_str!("../migrations/005_migrate_legacy_blocks.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

