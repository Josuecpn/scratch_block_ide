-- 3. Blocos Lógicos (Grafo Hierárquico: Pilha next_id + Slots parent_id)
CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY NOT NULL,
    canvas_id TEXT NOT NULL,
    opcode TEXT NOT NULL,
    category TEXT NOT NULL,
    parent_id TEXT,
    parent_input TEXT,
    next_id TEXT,
    x REAL NOT NULL DEFAULT 0.0,
    y REAL NOT NULL DEFAULT 0.0,
    fields_json TEXT NOT NULL DEFAULT '{}',
    is_shadow INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (canvas_id) REFERENCES canvas_states(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES blocks(id) ON DELETE SET NULL,
    FOREIGN KEY (next_id) REFERENCES blocks(id) ON DELETE SET NULL
);

-- 4. Configuração do Robô Virtual e Portas (A-F estilo LEGO Spike)
CREATE TABLE IF NOT EXISTS robot_configs (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL UNIQUE,
    wheel_diameter_mm REAL NOT NULL DEFAULT 56.0,
    axle_track_mm REAL NOT NULL DEFAULT 112.0,
    left_motor_port TEXT NOT NULL DEFAULT 'A',
    right_motor_port TEXT NOT NULL DEFAULT 'B',
    ports_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 5. Ambiente de Simulação (Arena 2D/3D)
CREATE TABLE IF NOT EXISTS simulation_environments (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Arena Padrão',
    dimension TEXT NOT NULL DEFAULT '2D',
    width_mm REAL NOT NULL DEFAULT 2000.0,
    depth_mm REAL NOT NULL DEFAULT 1200.0,
    spawn_x REAL NOT NULL DEFAULT 200.0,
    spawn_y REAL NOT NULL DEFAULT 600.0,
    spawn_heading REAL NOT NULL DEFAULT 0.0,
    objects_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Índices de integridade e performance do Grafo de Blocos
CREATE UNIQUE INDEX IF NOT EXISTS ux_blocks_next
    ON blocks(next_id) WHERE next_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_blocks_slot
    ON blocks(parent_id, parent_input) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_blocks_canvas_top
    ON blocks(canvas_id) WHERE parent_id IS NULL;

-- Projeto Demo Inicial
INSERT OR IGNORE INTO projects (id, name, description, robot_model, dimension, favorite)
VALUES (
    'proj-demo-01',
    'Seguidor de Linha (Spike Prime)',
    'Projeto exemplo com sensor de cor e controle proporcional simples.',
    'SPIKE_PRIME',
    '2D',
    1
);

INSERT OR IGNORE INTO canvas_states (id, project_id, name, zoom)
VALUES ('canvas-demo-01', 'proj-demo-01', 'Script Principal', 1.0);

