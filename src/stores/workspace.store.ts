import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  createCleanBlocks,
  createDefaultEnvironment,
  createDefaultRobotConfig,
  createDefaultRobotVisual,
  loadProjectBundle,
  saveFullProject,
  type CanvasStateRecord,
  type ProjectRecord,
  type RobotKitModel,
  type RobotVisualConfig,
  type SimulationEnvironmentRecord,
} from '../services/database';
import {
  createDefaultCanvasDefinitions,
  type BlockCategoryKey,
  type CanvasDefinitions,
  type CustomBlockSegment,
  type WorkspaceBlock,
} from '../types/blocks';
import { useSimulationStore } from './simulation.store';

export type { BlockCategoryKey, WorkspaceBlock };
export type ViewMode = 'split' | 'script' | 'simulator';
export type SimDimension = '2D' | '3D';
export type PythonTargetFlavor = 'spike_v3' | 'pybricks';
export type PortLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface RobotConfigSpec {
  wheel_diameter_mm: number;
  axle_track_mm: number;
  left_motor_port: PortLetter;
  right_motor_port: PortLetter;
  color_sensor_port: PortLetter;
  distance_sensor_port: PortLetter;
}

export const useWorkspaceStore = defineStore('workspace', () => {
  // Obrigatoriamente inicia na tela do Hub de Projetos
  const activeScreen = ref<'hub' | 'ide'>('hub');
  const isLoadingProject = ref<boolean>(false);

  const currentProject = ref<ProjectRecord>({
    id: 'proj-demo-01',
    name: 'Seguidor de Linha (Spike Prime)',
    description: 'Projeto exemplo com sensor de cor e controle proporcional simples.',
    robot_model: 'SPIKE_PRIME',
    dimension: '3D',
    favorite: 1,
    revision: 1,
    updated_at: new Date().toISOString(),
  });

  const activeCanvas = ref<CanvasStateRecord>({
    id: 'canvas-demo-01',
    project_id: 'proj-demo-01',
    name: 'Script Principal',
    scroll_x: 0,
    scroll_y: 0,
    zoom: 1,
  });

  const viewMode = ref<ViewMode>('split');
  const simDimension = ref<SimDimension>('3D');
  const splitRatio = ref<number>(54);
  const isSavedInSqlite = ref<boolean>(true);
  const pythonFlavor = ref<PythonTargetFlavor>('spike_v3');

  const robotConfig = ref<RobotConfigSpec>(createDefaultRobotConfig('SPIKE_PRIME'));
  const robotVisual = ref<RobotVisualConfig>(createDefaultRobotVisual('SPIKE_PRIME'));
  const environment = ref<SimulationEnvironmentRecord>(
    createDefaultEnvironment('proj-demo-01', '3D')
  );

  const scriptStack = ref<WorkspaceBlock[]>(createCleanBlocks());
  const definitions = ref<CanvasDefinitions>(createDefaultCanvasDefinitions());

  const availablePorts = computed<readonly PortLetter[]>(() =>
    currentProject.value.robot_model === 'SPIKE_ESSENTIAL'
      ? (['A', 'B'] as const)
      : (['A', 'B', 'C', 'D', 'E', 'F'] as const)
  );

  function markDirty() {
    isSavedInSqlite.value = false;
  }

  function addVariable(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (definitions.value.variables.some((v) => v.name === trimmed)) return null;
    const item = { id: `var-${Date.now()}`, name: trimmed, value: 0, monitored: true };
    definitions.value.variables.push(item);
    isSavedInSqlite.value = false;
    return item;
  }

  function addList(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (definitions.value.lists.some((l) => l.name === trimmed)) return null;
    const item = { id: `list-${Date.now()}`, name: trimmed, items: [], monitored: true };
    definitions.value.lists.push(item);
    isSavedInSqlite.value = false;
    return item;
  }

  function addMessage(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!definitions.value.messages.includes(trimmed)) {
      definitions.value.messages.push(trimmed);
      isSavedInSqlite.value = false;
    }
  }

  function addCustomBlock(name: string, segments: CustomBlockSegment[]) {
    const trimmed = name.trim() || 'meu bloco';
    const def = {
      id: `myblk-${Date.now()}`,
      name: trimmed,
      segments,
    };
    definitions.value.customBlocks.push(def);

    // Insere automaticamente o bloco chapéu de definição na área de programação
    const sigText = segments.length > 0
      ? segments.map((s) => (s.kind === 'label' ? s.text : s.kind === 'boolean' ? `<${s.text}>` : `(${s.text})`)).join(' ')
      : trimmed;
    scriptStack.value.push({
      id: `blk-def-${Date.now()}`,
      category: 'my_blocks',
      opcode: 'my_block_define',
      shape: 'hat',
      label: `definir ${trimmed} ${segments.length > 0 ? sigText : ''}`.trim(),
      customBlockId: def.id,
    });
    isSavedInSqlite.value = false;
    return def;
  }

  function setRobotKit(model: RobotKitModel) {
    currentProject.value.robot_model = model;
    if (model === 'SPIKE_ESSENTIAL') {
      if (!['A', 'B'].includes(robotConfig.value.left_motor_port)) {
        robotConfig.value.left_motor_port = 'A';
      }
      if (!['A', 'B'].includes(robotConfig.value.right_motor_port)) {
        robotConfig.value.right_motor_port = 'B';
      }
      if (!['A', 'B'].includes(robotConfig.value.color_sensor_port)) {
        robotConfig.value.color_sensor_port = 'A';
      }
      if (!['A', 'B'].includes(robotConfig.value.distance_sensor_port)) {
        robotConfig.value.distance_sensor_port = 'B';
      }
      robotVisual.value.chassisColor =
        robotVisual.value.chassisColor === '#facc15' ? '#0ea5e9' : robotVisual.value.chassisColor;
    } else {
      if (robotConfig.value.color_sensor_port === 'A' || robotConfig.value.color_sensor_port === 'B') {
        robotConfig.value.color_sensor_port = 'C';
      }
      if (
        robotConfig.value.distance_sensor_port === 'A' ||
        robotConfig.value.distance_sensor_port === 'B'
      ) {
        robotConfig.value.distance_sensor_port = 'D';
      }
      robotVisual.value.chassisColor =
        robotVisual.value.chassisColor === '#0ea5e9' ? '#facc15' : robotVisual.value.chassisColor;
    }
    isSavedInSqlite.value = false;
  }

  async function openProject(project: ProjectRecord): Promise<void> {
    isLoadingProject.value = true;
    try {
      const bundle = await loadProjectBundle(project.id);
      if (bundle) {
        currentProject.value = bundle.project;
        activeCanvas.value = bundle.canvas;
        scriptStack.value = bundle.blocks;
        definitions.value = bundle.definitions ?? createDefaultCanvasDefinitions();
        robotConfig.value = bundle.robotConfig;
        robotVisual.value = bundle.robotVisual;
        environment.value = bundle.environment;
        simDimension.value = bundle.project.dimension ?? '3D';
      } else {
        currentProject.value = project;
        activeCanvas.value = {
          id: `canvas-${project.id}`,
          project_id: project.id,
          name: 'Script Principal',
          scroll_x: 0,
          scroll_y: 0,
          zoom: 1,
        };
        scriptStack.value = createCleanBlocks();
        definitions.value = createDefaultCanvasDefinitions();
        robotConfig.value = createDefaultRobotConfig(project.robot_model);
        robotVisual.value = createDefaultRobotVisual(project.robot_model);
        environment.value = createDefaultEnvironment(project.id, project.dimension);
        simDimension.value = project.dimension;
      }

      const simStore = useSimulationStore();
      simStore.setSpawnPose(
        environment.value.spawn_x,
        environment.value.spawn_y,
        environment.value.spawn_heading
      );

      isSavedInSqlite.value = true;
      activeScreen.value = 'ide';
    } finally {
      isLoadingProject.value = false;
    }
  }

  async function saveCurrentProject(): Promise<number> {
    currentProject.value.dimension = simDimension.value;
    const saved = await saveFullProject({
      project: currentProject.value,
      canvas: activeCanvas.value,
      blocks: scriptStack.value,
      definitions: definitions.value,
      robotConfig: robotConfig.value,
      robotVisual: robotVisual.value,
      environment: environment.value,
    });
    currentProject.value = saved.project;
    isSavedInSqlite.value = true;
    return saved.project.revision;
  }

  function backToHub() {
    activeScreen.value = 'hub';
  }

  return {
    activeScreen,
    isLoadingProject,
    currentProject,
    activeCanvas,
    viewMode,
    simDimension,
    splitRatio,
    isSavedInSqlite,
    pythonFlavor,
    robotConfig,
    robotVisual,
    environment,
    scriptStack,
    definitions,
    availablePorts,
    markDirty,
    addVariable,
    addList,
    addMessage,
    addCustomBlock,
    setRobotKit,
    openProject,
    saveCurrentProject,
    backToHub,
  };
});
