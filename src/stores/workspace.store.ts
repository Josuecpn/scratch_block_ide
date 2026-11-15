import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProjectRecord } from '../services/database';

export type ViewMode = 'split' | 'script' | 'simulator';
export type SimDimension = '2D' | '3D';
export type PythonTargetFlavor = 'spike_v3' | 'pybricks';
export type BlockCategoryKey =
  | 'events'
  | 'motion'
  | 'motors'
  | 'sensors'
  | 'control'
  | 'operators'
  | 'variables';

export interface WorkspaceBlock {
  id: string;
  category: BlockCategoryKey;
  opcode: string;
  label: string;
  param?: string | number;
  unit?: string;
}

export interface RobotConfigSpec {
  wheel_diameter_mm: number;
  axle_track_mm: number;
  left_motor_port: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  right_motor_port: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  color_sensor_port: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  distance_sensor_port: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const activeScreen = ref<'hub' | 'ide'>('ide');
  const currentProject = ref<ProjectRecord>({
    id: 'proj-demo-01',
    name: 'Seguidor de Linha (Spike Prime)',
    description: 'Projeto exemplo com sensor de cor e controle proporcional simples.',
    robot_model: 'SPIKE_PRIME',
    dimension: '2D',
    favorite: 1,
    revision: 1,
    updated_at: new Date().toISOString(),
  });

  const viewMode = ref<ViewMode>('split');
  const simDimension = ref<SimDimension>('2D');
  const splitRatio = ref<number>(54);
  const isSavedInSqlite = ref<boolean>(true);
  const pythonFlavor = ref<PythonTargetFlavor>('spike_v3');

  const robotConfig = ref<RobotConfigSpec>({
    wheel_diameter_mm: 56.0,
    axle_track_mm: 112.0,
    left_motor_port: 'A',
    right_motor_port: 'B',
    color_sensor_port: 'C',
    distance_sensor_port: 'D',
  });

  const scriptStack = ref<WorkspaceBlock[]>([
    { id: 'blk-1', category: 'events',  opcode: 'when_program_starts', label: 'Quando o programa iniciar' },
    { id: 'blk-2', category: 'motion',  opcode: 'set_move_speed',      label: 'Definir velocidade de movimento para', param: 60, unit: '%' },
    { id: 'blk-3', category: 'motion',  opcode: 'move_distance',       label: 'Mover para frente por', param: 25, unit: 'cm' },
    { id: 'blk-4', category: 'motion',  opcode: 'turn_degrees',        label: 'Girar à direita por', param: 90, unit: 'graus' },
    { id: 'blk-5', category: 'control', opcode: 'wait_seconds',        label: 'Esperar', param: 1, unit: 'segundos' },
  ]);

  function openProject(project: ProjectRecord) {
    currentProject.value = project;
    simDimension.value = project.dimension;
    activeScreen.value = 'ide';
  }

  function backToHub() {
    activeScreen.value = 'hub';
  }

  return {
    activeScreen,
    currentProject,
    viewMode,
    simDimension,
    splitRatio,
    isSavedInSqlite,
    pythonFlavor,
    robotConfig,
    scriptStack,
    openProject,
    backToHub,
  };
});
