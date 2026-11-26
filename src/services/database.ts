import Database from '@tauri-apps/plugin-sql';
import type {
  BlockCategoryKey,
  RobotConfigSpec,
  WorkspaceBlock,
} from '../stores/workspace.store';

const DB_PATH = 'sqlite:roboblocks.db';
const LOCAL_STORAGE_KEY = 'roboblocks_local_projects_v1';

let dbInstance: Database | null = null;

export type RobotKitModel = 'SPIKE_PRIME' | 'SPIKE_ESSENTIAL';
export type InitialWorkspaceState = 'clean' | 'example';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  robot_model: RobotKitModel | 'CUSTOM';
  dimension: '2D' | '3D';
  favorite: number;
  revision: number;
  updated_at: string;
}

export interface CanvasStateRecord {
  id: string;
  project_id: string;
  name: string;
  scroll_x: number;
  scroll_y: number;
  zoom: number;
}

export interface RobotVisualConfig {
  chassisColor: string;
  accentColor: string;
  wheelColor: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  hasColorSensor: boolean;
  hasDistanceSensor: boolean;
  colorSensorSide: 'front' | 'center' | 'back';
  distanceSensorSide: 'front' | 'left' | 'right';
}

export type ArenaObjectType = 'obstacle' | 'wall' | 'line' | 'color_zone';

export interface ArenaObject {
  id: string;
  type: ArenaObjectType;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationDeg: number;
  color: string;
}

export interface SimulationEnvironmentRecord {
  id: string;
  project_id: string;
  name: string;
  dimension: '2D' | '3D';
  width_mm: number;
  depth_mm: number;
  spawn_x: number;
  spawn_y: number;
  spawn_heading: number;
  objects: ArenaObject[];
}

export interface LoadedProjectBundle {
  project: ProjectRecord;
  canvas: CanvasStateRecord;
  blocks: WorkspaceBlock[];
  robotConfig: RobotConfigSpec;
  robotVisual: RobotVisualConfig;
  environment: SimulationEnvironmentRecord;
}

export interface CreateProjectOptions {
  name: string;
  description?: string;
  dimension?: '2D' | '3D';
  robotModel: RobotKitModel;
  initialState: InitialWorkspaceState;
}

export function createDefaultRobotConfig(model: RobotKitModel | 'CUSTOM'): RobotConfigSpec {
  if (model === 'SPIKE_ESSENTIAL') {
    return {
      wheel_diameter_mm: 49.5,
      axle_track_mm: 96.0,
      left_motor_port: 'A',
      right_motor_port: 'B',
      color_sensor_port: 'A',
      distance_sensor_port: 'B',
    };
  }
  return {
    wheel_diameter_mm: 56.0,
    axle_track_mm: 112.0,
    left_motor_port: 'A',
    right_motor_port: 'B',
    color_sensor_port: 'C',
    distance_sensor_port: 'D',
  };
}

export function createDefaultRobotVisual(model: RobotKitModel | 'CUSTOM'): RobotVisualConfig {
  return {
    chassisColor: model === 'SPIKE_ESSENTIAL' ? '#0ea5e9' : '#facc15',
    accentColor: '#1e293b',
    wheelColor: '#111827',
    lengthMm: model === 'SPIKE_ESSENTIAL' ? 140 : 175,
    widthMm: model === 'SPIKE_ESSENTIAL' ? 110 : 135,
    heightMm: model === 'SPIKE_ESSENTIAL' ? 75 : 95,
    hasColorSensor: true,
    hasDistanceSensor: model !== 'SPIKE_ESSENTIAL',
    colorSensorSide: 'front',
    distanceSensorSide: 'front',
  };
}

export function createDefaultArenaObjects(): ArenaObject[] {
  return [
    {
      id: 'line-main-1',
      type: 'line',
      label: 'Linha Norte',
      x: 0,
      z: -380,
      width: 1100,
      depth: 45,
      height: 2,
      rotationDeg: 0,
      color: '#111827',
    },
    {
      id: 'line-main-2',
      type: 'line',
      label: 'Linha Sul',
      x: 0,
      z: 380,
      width: 1100,
      depth: 45,
      height: 2,
      rotationDeg: 0,
      color: '#111827',
    },
    {
      id: 'line-main-3',
      type: 'line',
      label: 'Linha Leste',
      x: 550,
      z: 0,
      width: 45,
      depth: 800,
      height: 2,
      rotationDeg: 0,
      color: '#111827',
    },
    {
      id: 'line-main-4',
      type: 'line',
      label: 'Linha Oeste',
      x: -550,
      z: 0,
      width: 45,
      depth: 800,
      height: 2,
      rotationDeg: 0,
      color: '#111827',
    },
    {
      id: 'zone-red-1',
      type: 'color_zone',
      label: 'Zona Vermelha',
      x: 380,
      z: -160,
      width: 180,
      depth: 180,
      height: 3,
      rotationDeg: 0,
      color: '#ef4444',
    },
    {
      id: 'obs-box-1',
      type: 'obstacle',
      label: 'Bloco Obstáculo',
      x: 240,
      z: 180,
      width: 140,
      depth: 140,
      height: 110,
      rotationDeg: 15,
      color: '#f97316',
    },
  ];
}

export function createDefaultEnvironment(
  projectId: string,
  dimension: '2D' | '3D' = '3D'
): SimulationEnvironmentRecord {
  return {
    id: `env-${projectId}`,
    project_id: projectId,
    name: 'Arena Padrão',
    dimension,
    width_mm: 2000,
    depth_mm: 1400,
    spawn_x: -300,
    spawn_y: 0,
    spawn_heading: 0,
    objects: createDefaultArenaObjects(),
  };
}

export function createExampleBlocks(): WorkspaceBlock[] {
  const uid = () => `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return [
    { id: uid(), category: 'events', opcode: 'when_program_starts', label: 'Quando o programa iniciar' },
    { id: uid(), category: 'motion', opcode: 'set_move_speed', label: 'Definir velocidade de movimento para', param: 60, unit: '%' },
    { id: uid(), category: 'motion', opcode: 'move_distance', label: 'Mover para frente por', param: 30, unit: 'cm' },
    { id: uid(), category: 'motion', opcode: 'turn_degrees', label: 'Girar à direita por', param: 90, unit: 'graus' },
    { id: uid(), category: 'motion', opcode: 'move_distance', label: 'Mover para frente por', param: 20, unit: 'cm' },
    { id: uid(), category: 'motion', opcode: 'turn_left', label: 'Virar à esquerda por', param: 90, unit: 'graus' },
    { id: uid(), category: 'control', opcode: 'wait_seconds', label: 'Esperar', param: 1, unit: 'segundos' },
  ];
}

export function createCleanBlocks(): WorkspaceBlock[] {
  return [
    {
      id: `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      category: 'events',
      opcode: 'when_program_starts',
      label: 'Quando o programa iniciar',
    },
  ];
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

function readLocalStore(): Record<string, LoadedProjectBundle> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Record<string, LoadedProjectBundle>;
    }
  } catch {
    // Ignore corrupted storage
  }
  const demoId = 'proj-demo-01';
  const demoProject: ProjectRecord = {
    id: demoId,
    name: 'Seguidor de Linha (Spike Prime)',
    description: 'Projeto exemplo com sensor de cor e controle proporcional simples.',
    robot_model: 'SPIKE_PRIME',
    dimension: '3D',
    favorite: 1,
    revision: 1,
    updated_at: new Date().toISOString(),
  };
  const seed: Record<string, LoadedProjectBundle> = {
    [demoId]: {
      project: demoProject,
      canvas: {
        id: 'canvas-demo-01',
        project_id: demoId,
        name: 'Script Principal',
        scroll_x: 0,
        scroll_y: 0,
        zoom: 1,
      },
      blocks: createExampleBlocks(),
      robotConfig: createDefaultRobotConfig('SPIKE_PRIME'),
      robotVisual: createDefaultRobotVisual('SPIKE_PRIME'),
      environment: createDefaultEnvironment(demoId, '3D'),
    },
  };
  writeLocalStore(seed);
  return seed;
}

function writeLocalStore(data: Record<string, LoadedProjectBundle>): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const db = await getDb();
  if (!db) {
    const store = readLocalStore();
    return Object.values(store)
      .map((b) => b.project)
      .sort((a, b) => b.favorite - a.favorite || b.updated_at.localeCompare(a.updated_at));
  }
  return await db.select<ProjectRecord[]>(
    'SELECT * FROM projects ORDER BY favorite DESC, updated_at DESC'
  );
}

interface RawBlockRow {
  id: string;
  canvas_id: string;
  opcode: string;
  category: string;
  parent_id: string | null;
  parent_input: string | null;
  next_id: string | null;
  x: number;
  y: number;
  fields_json: string;
}

function reconstructBlockOrder(rows: RawBlockRow[]): WorkspaceBlock[] {
  if (rows.length === 0) return [];
  const byId = new Map<string, RawBlockRow>();
  const referencedAsNext = new Set<string>();

  for (const r of rows) {
    byId.set(r.id, r);
    if (r.next_id) referencedAsNext.add(r.next_id);
  }

  const ordered: RawBlockRow[] = [];
  const visited = new Set<string>();
  const roots = rows.filter((r) => !referencedAsNext.has(r.id)).sort((a, b) => a.y - b.y);

  for (const root of roots) {
    let curr: RawBlockRow | undefined = root;
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      ordered.push(curr);
      curr = curr.next_id ? byId.get(curr.next_id) : undefined;
    }
  }

  for (const r of rows.sort((a, b) => a.y - b.y)) {
    if (!visited.has(r.id)) {
      ordered.push(r);
    }
  }

  return ordered.map((r) => {
    let fields: { label?: string; param?: string | number; unit?: string } = {};
    try {
      fields = JSON.parse(r.fields_json || '{}');
    } catch {
      fields = {};
    }
    return {
      id: r.id,
      category: r.category as BlockCategoryKey,
      opcode: r.opcode,
      label: fields.label ?? r.opcode,
      param: fields.param,
      unit: fields.unit,
    };
  });
}

async function persistBlocksToSqlite(
  db: Database,
  canvasId: string,
  blocks: WorkspaceBlock[]
): Promise<void> {
  await db.execute('DELETE FROM blocks WHERE canvas_id = $1', [canvasId]);

  // Inserção em ordem reversa garante que next_id sempre aponte para um id já inserido (PRAGMA foreign_keys = ON)
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    const nextId = blocks[i + 1]?.id ?? null;
    const fieldsJson = JSON.stringify({
      label: b.label,
      param: b.param,
      unit: b.unit,
    });
    await db.execute(
      `INSERT INTO blocks (id, canvas_id, opcode, category, next_id, x, y, fields_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [b.id, canvasId, b.opcode, b.category, nextId, 40, i * 52, fieldsJson]
    );
  }
}

export async function createProject(options: CreateProjectOptions): Promise<ProjectRecord> {
  const id = `proj-${Date.now()}`;
  const canvasId = `canvas-${Date.now()}`;
  const now = new Date().toISOString();
  const dimension = options.dimension ?? '3D';
  const description =
    options.description?.trim() ||
    (options.initialState === 'clean'
      ? `Projeto limpo (${options.robotModel === 'SPIKE_ESSENTIAL' ? 'SPIKE Essential' : 'SPIKE Prime'}).`
      : `Projeto com código de exemplo (${options.robotModel === 'SPIKE_ESSENTIAL' ? 'SPIKE Essential' : 'SPIKE Prime'}).`);

  const project: ProjectRecord = {
    id,
    name: options.name.trim(),
    description,
    robot_model: options.robotModel,
    dimension,
    favorite: 0,
    revision: 1,
    updated_at: now,
  };

  const blocks = options.initialState === 'example' ? createExampleBlocks() : createCleanBlocks();
  const robotConfig = createDefaultRobotConfig(options.robotModel);
  const robotVisual = createDefaultRobotVisual(options.robotModel);
  const environment = createDefaultEnvironment(id, dimension);

  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT INTO projects (id, name, description, robot_model, dimension, favorite, revision, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, 1, $6)`,
      [project.id, project.name, project.description, project.robot_model, project.dimension, now]
    );
    await db.execute(
      `INSERT INTO canvas_states (id, project_id, name, zoom)
       VALUES ($1, $2, 'Script Principal', 1.0)`,
      [canvasId, project.id]
    );
    await persistBlocksToSqlite(db, canvasId, blocks);
    await db.execute(
      `INSERT INTO robot_configs (id, project_id, wheel_diameter_mm, axle_track_mm, left_motor_port, right_motor_port, ports_json, visual_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `robot-${project.id}`,
        project.id,
        robotConfig.wheel_diameter_mm,
        robotConfig.axle_track_mm,
        robotConfig.left_motor_port,
        robotConfig.right_motor_port,
        JSON.stringify({
          color_sensor_port: robotConfig.color_sensor_port,
          distance_sensor_port: robotConfig.distance_sensor_port,
        }),
        JSON.stringify(robotVisual),
      ]
    );
    await db.execute(
      `INSERT INTO simulation_environments (id, project_id, name, dimension, width_mm, depth_mm, spawn_x, spawn_y, spawn_heading, objects_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        environment.id,
        project.id,
        environment.name,
        environment.dimension,
        environment.width_mm,
        environment.depth_mm,
        environment.spawn_x,
        environment.spawn_y,
        environment.spawn_heading,
        JSON.stringify(environment.objects),
      ]
    );
  } else {
    const store = readLocalStore();
    store[project.id] = {
      project,
      canvas: {
        id: canvasId,
        project_id: project.id,
        name: 'Script Principal',
        scroll_x: 0,
        scroll_y: 0,
        zoom: 1,
      },
      blocks,
      robotConfig,
      robotVisual,
      environment,
    };
    writeLocalStore(store);
  }

  return project;
}

export async function loadProjectBundle(projectId: string): Promise<LoadedProjectBundle | null> {
  const db = await getDb();
  if (!db) {
    const store = readLocalStore();
    return store[projectId] ?? null;
  }

  const projects = await db.select<ProjectRecord[]>(
    'SELECT * FROM projects WHERE id = $1 LIMIT 1',
    [projectId]
  );
  if (projects.length === 0) return null;
  const project = projects[0];

  let canvases = await db.select<CanvasStateRecord[]>(
    'SELECT * FROM canvas_states WHERE project_id = $1 LIMIT 1',
    [projectId]
  );
  if (canvases.length === 0) {
    const newCanvasId = `canvas-${projectId}`;
    await db.execute(
      `INSERT INTO canvas_states (id, project_id, name, zoom) VALUES ($1, $2, 'Script Principal', 1.0)`,
      [newCanvasId, projectId]
    );
    canvases = [
      { id: newCanvasId, project_id: projectId, name: 'Script Principal', scroll_x: 0, scroll_y: 0, zoom: 1.0 },
    ];
  }
  const canvas = canvases[0];

  const rawBlocks = await db.select<RawBlockRow[]>(
    'SELECT * FROM blocks WHERE canvas_id = $1',
    [canvas.id]
  );
  const blocks =
    rawBlocks.length > 0
      ? reconstructBlockOrder(rawBlocks)
      : projectId === 'proj-demo-01'
        ? createExampleBlocks()
        : createCleanBlocks();

  const robotRows = await db.select<
    Array<{
      wheel_diameter_mm: number;
      axle_track_mm: number;
      left_motor_port: string;
      right_motor_port: string;
      ports_json: string;
      visual_json?: string;
    }>
  >('SELECT * FROM robot_configs WHERE project_id = $1 LIMIT 1', [projectId]);

  let robotConfig = createDefaultRobotConfig(project.robot_model);
  let robotVisual = createDefaultRobotVisual(project.robot_model);

  if (robotRows.length > 0) {
    const r = robotRows[0];
    let ports: { color_sensor_port?: string; distance_sensor_port?: string } = {};
    try {
      ports = JSON.parse(r.ports_json || '{}');
    } catch {
      ports = {};
    }
    robotConfig = {
      wheel_diameter_mm: r.wheel_diameter_mm,
      axle_track_mm: r.axle_track_mm,
      left_motor_port: r.left_motor_port as RobotConfigSpec['left_motor_port'],
      right_motor_port: r.right_motor_port as RobotConfigSpec['right_motor_port'],
      color_sensor_port: (ports.color_sensor_port ?? 'C') as RobotConfigSpec['color_sensor_port'],
      distance_sensor_port: (ports.distance_sensor_port ?? 'D') as RobotConfigSpec['distance_sensor_port'],
    };
    if (r.visual_json && r.visual_json !== '{}') {
      try {
        robotVisual = { ...robotVisual, ...JSON.parse(r.visual_json) };
      } catch {
        // Keep default visual
      }
    }
  }

  const envRows = await db.select<
    Array<{
      id: string;
      project_id: string;
      name: string;
      dimension: '2D' | '3D';
      width_mm: number;
      depth_mm: number;
      spawn_x: number;
      spawn_y: number;
      spawn_heading: number;
      objects_json: string;
    }>
  >('SELECT * FROM simulation_environments WHERE project_id = $1 LIMIT 1', [projectId]);

  let environment = createDefaultEnvironment(projectId, project.dimension);
  if (envRows.length > 0) {
    const e = envRows[0];
    let objects: ArenaObject[] = createDefaultArenaObjects();
    try {
      const parsed = JSON.parse(e.objects_json || '[]');
      if (Array.isArray(parsed)) objects = parsed;
    } catch {
      // Keep default objects
    }
    environment = {
      id: e.id,
      project_id: e.project_id,
      name: e.name,
      dimension: e.dimension,
      width_mm: e.width_mm,
      depth_mm: e.depth_mm,
      spawn_x: e.spawn_x,
      spawn_y: e.spawn_y,
      spawn_heading: e.spawn_heading,
      objects,
    };
  }

  return {
    project,
    canvas,
    blocks,
    robotConfig,
    robotVisual,
    environment,
  };
}

export async function saveFullProject(bundle: LoadedProjectBundle): Promise<LoadedProjectBundle> {
  const now = new Date().toISOString();
  const nextRevision = (bundle.project.revision ?? 1) + 1;
  const updatedProject: ProjectRecord = {
    ...bundle.project,
    revision: nextRevision,
    updated_at: now,
  };
  const updatedBundle: LoadedProjectBundle = {
    ...bundle,
    project: updatedProject,
  };

  const db = await getDb();
  if (!db) {
    const store = readLocalStore();
    store[updatedProject.id] = updatedBundle;
    writeLocalStore(store);
    return updatedBundle;
  }

  await db.execute(
    `UPDATE projects
     SET name = $1, description = $2, robot_model = $3, dimension = $4, revision = $5, updated_at = $6
     WHERE id = $7`,
    [
      updatedProject.name,
      updatedProject.description,
      updatedProject.robot_model,
      updatedProject.dimension,
      updatedProject.revision,
      updatedProject.updated_at,
      updatedProject.id,
    ]
  );

  await db.execute(
    `INSERT INTO canvas_states (id, project_id, name, scroll_x, scroll_y, zoom)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       scroll_x = excluded.scroll_x,
       scroll_y = excluded.scroll_y,
       zoom = excluded.zoom`,
    [
      bundle.canvas.id,
      updatedProject.id,
      bundle.canvas.name,
      bundle.canvas.scroll_x,
      bundle.canvas.scroll_y,
      bundle.canvas.zoom,
    ]
  );

  await persistBlocksToSqlite(db, bundle.canvas.id, bundle.blocks);

  await db.execute(
    `INSERT INTO robot_configs (id, project_id, wheel_diameter_mm, axle_track_mm, left_motor_port, right_motor_port, ports_json, visual_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(project_id) DO UPDATE SET
       wheel_diameter_mm = excluded.wheel_diameter_mm,
       axle_track_mm = excluded.axle_track_mm,
       left_motor_port = excluded.left_motor_port,
       right_motor_port = excluded.right_motor_port,
       ports_json = excluded.ports_json,
       visual_json = excluded.visual_json`,
    [
      `robot-${updatedProject.id}`,
      updatedProject.id,
      bundle.robotConfig.wheel_diameter_mm,
      bundle.robotConfig.axle_track_mm,
      bundle.robotConfig.left_motor_port,
      bundle.robotConfig.right_motor_port,
      JSON.stringify({
        color_sensor_port: bundle.robotConfig.color_sensor_port,
        distance_sensor_port: bundle.robotConfig.distance_sensor_port,
      }),
      JSON.stringify(bundle.robotVisual),
    ]
  );

  await db.execute(
    `INSERT INTO simulation_environments (id, project_id, name, dimension, width_mm, depth_mm, spawn_x, spawn_y, spawn_heading, objects_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       dimension = excluded.dimension,
       width_mm = excluded.width_mm,
       depth_mm = excluded.depth_mm,
       spawn_x = excluded.spawn_x,
       spawn_y = excluded.spawn_y,
       spawn_heading = excluded.spawn_heading,
       objects_json = excluded.objects_json`,
    [
      bundle.environment.id,
      updatedProject.id,
      bundle.environment.name,
      bundle.environment.dimension,
      bundle.environment.width_mm,
      bundle.environment.depth_mm,
      bundle.environment.spawn_x,
      bundle.environment.spawn_y,
      bundle.environment.spawn_heading,
      JSON.stringify(bundle.environment.objects),
    ]
  );

  return updatedBundle;
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    const store = readLocalStore();
    delete store[projectId];
    writeLocalStore(store);
    return;
  }
  await db.execute('DELETE FROM projects WHERE id = $1', [projectId]);
}
