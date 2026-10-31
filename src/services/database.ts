import Database from '@tauri-apps/plugin-sql';

const DB_PATH = 'sqlite:roboblocks.db';
let dbInstance: Database | null = null;

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  robot_model: 'SPIKE_PRIME' | 'SPIKE_ESSENTIAL' | 'CUSTOM';
  dimension: '2D' | '3D';
  favorite: number;
  revision: number;
  updated_at: string;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getDb(): Promise<Database | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  if (!dbInstance) {
    dbInstance = await Database.load(DB_PATH);
  }
  return dbInstance;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const db = await getDb();
  if (!db) {
    return [
      {
        id: 'proj-demo-01',
        name: 'Seguidor de Linha (Spike Prime)',
        description: 'Projeto exemplo com sensor de cor e controle proporcional simples.',
        robot_model: 'SPIKE_PRIME',
        dimension: '2D',
        favorite: 1,
        revision: 1,
        updated_at: new Date().toISOString(),
      },
      {
        id: 'proj-demo-02',
        name: 'Desafio Sumô Autônomo',
        description: 'Detecção de oponente via sensor ultrassônico e borda da arena.',
        robot_model: 'SPIKE_PRIME',
        dimension: '3D',
        favorite: 0,
        revision: 3,
        updated_at: new Date().toISOString(),
      },
    ];
  }
  return await db.select<ProjectRecord[]>(
    'SELECT * FROM projects ORDER BY favorite DESC, updated_at DESC'
  );
}

export async function createProject(
  name: string,
  description: string,
  dimension: '2D' | '3D'
): Promise<ProjectRecord> {
  const id = `proj-${Date.now()}`;
  const canvasId = `canvas-${Date.now()}`;
  const now = new Date().toISOString();
  const db = await getDb();

  if (db) {
    await db.execute(
      `INSERT INTO projects (id, name, description, robot_model, dimension, favorite, updated_at)
       VALUES ($1, $2, $3, 'SPIKE_PRIME', $4, 0, $5)`,
      [id, name, description, dimension, now]
    );
    await db.execute(
      `INSERT INTO canvas_states (id, project_id, name, zoom)
       VALUES ($1, $2, 'Script Principal', 1.0)`,
      [canvasId, id]
    );
  }

  return {
    id,
    name,
    description,
    robot_model: 'SPIKE_PRIME',
    dimension,
    favorite: 0,
    revision: 1,
    updated_at: now,
  };
}

export async function saveCanvasBlocks(
  canvasId: string,
  blocks: Array<{
    id: string;
    opcode: string;
    category: string;
    x: number;
    y: number;
    nextId: string | null;
    fields: Record<string, string | number | undefined>;
  }>
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return false;
  }

  await db.execute('DELETE FROM blocks WHERE canvas_id = $1', [canvasId]);

  for (const b of blocks) {
    await db.execute(
      `INSERT INTO blocks (id, canvas_id, opcode, category, next_id, x, y, fields_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [b.id, canvasId, b.opcode, b.category, b.nextId, b.x, b.y, JSON.stringify(b.fields)]
    );
  }
  return true;
}

