PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Tabela de Projetos (Launcher estilo Godot)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    robot_model TEXT NOT NULL DEFAULT 'SPIKE_PRIME',
    dimension TEXT NOT NULL DEFAULT '2D',
    favorite INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Estado do Canvas de Programação em Blocos
CREATE TABLE IF NOT EXISTS canvas_states (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Principal',
    scroll_x REAL NOT NULL DEFAULT 0.0,
    scroll_y REAL NOT NULL DEFAULT 0.0,
    zoom REAL NOT NULL DEFAULT 1.0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

