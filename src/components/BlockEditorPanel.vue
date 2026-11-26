<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
  useWorkspaceStore,
  type BlockCategoryKey,
  type WorkspaceBlock,
} from '../stores/workspace.store';
import { useSimulationStore } from '../stores/simulation.store';
import type { CompileDiagnostic } from '../services/spikeHardware';

interface Props {
  degreesPerCm: number;
  compileDiagnostics: CompileDiagnostic[];
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'log', message: string): void;
}>();

interface CategorySpec {
  key: BlockCategoryKey;
  label: string;
  color: string;
  icon: string;
}

interface ColorSwatch {
  name: string;
  hex: string;
}

const SPIKE_COLORS: ColorSwatch[] = [
  { name: 'Preto', hex: '#111827' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Amarelo', hex: '#facc15' },
  { name: 'Branco', hex: '#f8fafc' },
  { name: 'Magenta', hex: '#d946ef' },
];

const COLOR_OPCODES = new Set(['when_color_detected', 'color_is', 'set_rgb_color']);

const workspaceStore = useWorkspaceStore();
const simulationStore = useSimulationStore();

const { currentProject, scriptStack, robotConfig, isSavedInSqlite } = storeToRefs(workspaceStore);
const { simState, activeBlockIndex } = storeToRefs(simulationStore);

const categories: CategorySpec[] = [
  { key: 'events', label: 'Eventos', color: '#F59E0B', icon: '⚡' },
  { key: 'motion', label: 'Movimento', color: '#EC4899', icon: '🛞' },
  { key: 'motors', label: 'Motores', color: '#3B82F6', icon: '⚙️' },
  { key: 'sensors', label: 'Sensores', color: '#06B6D4', icon: '📡' },
  { key: 'control', label: 'Controle', color: '#F97316', icon: '🔁' },
  { key: 'operators', label: 'Operadores', color: '#22C55E', icon: '➗' },
  { key: 'variables', label: 'Variáveis', color: '#EF4444', icon: '📦' },
];

const selectedCategory = ref<BlockCategoryKey>('motion');
const openColorPickerId = ref<string | null>(null);

// Estado de Drag-and-Drop
const dragSource = ref<
  | { kind: 'palette'; template: Omit<WorkspaceBlock, 'id'> }
  | { kind: 'canvas'; index: number }
  | null
>(null);
const dropTargetIndex = ref<number | null>(null);

const paletteTemplates: Record<BlockCategoryKey, Omit<WorkspaceBlock, 'id'>[]> = {
  events: [
    { category: 'events', opcode: 'when_program_starts', label: 'Quando o programa iniciar' },
    { category: 'events', opcode: 'when_color_detected', label: 'Quando detectar cor', param: 'Vermelho' },
    { category: 'events', opcode: 'set_rgb_color', label: 'Acender luz RGB na cor', param: 'Azul' },
  ],
  motion: [
    { category: 'motion', opcode: 'move_distance', label: 'Mover para frente por', param: 20, unit: 'cm' },
    { category: 'motion', opcode: 'turn_degrees', label: 'Girar à direita por', param: 90, unit: 'graus' },
    { category: 'motion', opcode: 'turn_left', label: 'Virar à esquerda por', param: 90, unit: 'graus' },
    { category: 'motion', opcode: 'set_move_speed', label: 'Definir velocidade de movimento para', param: 60, unit: '%' },
  ],
  motors: [
    { category: 'motors', opcode: 'motor_run_rotations', label: 'Motor girar por', param: 1, unit: 'rotações' },
  ],
  sensors: [
    { category: 'sensors', opcode: 'dist_less_than', label: 'Aguardar Distância <', param: 15, unit: 'cm' },
    { category: 'sensors', opcode: 'color_is', label: 'Se Sensor de Cor for', param: 'Preto' },
    { category: 'sensors', opcode: 'set_chameleon_mode', label: 'Modo Camaleão (LED = Cor do piso)', param: 'Ativado' },
  ],
  control: [
    { category: 'control', opcode: 'wait_seconds', label: 'Esperar', param: 1, unit: 'segundos' },
    { category: 'control', opcode: 'repeat_times', label: 'Repetir próximos blocos', param: 4, unit: 'vezes' },
  ],
  operators: [
    { category: 'operators', opcode: 'math_add', label: 'Somar ao acumulador +', param: 10 },
  ],
  variables: [
    { category: 'variables', opcode: 'set_var', label: 'Definir [velocidade] para', param: 50 },
  ],
};

function getCategoryColor(cat: BlockCategoryKey): string {
  return categories.find((c) => c.key === cat)?.color ?? '#64748B';
}

function isColorBlock(opcode: string): boolean {
  return COLOR_OPCODES.has(opcode);
}

function getColorHex(name: string | number | undefined): string {
  const str = String(name ?? 'Vermelho').toLowerCase();
  return SPIKE_COLORS.find((c) => c.name.toLowerCase() === str)?.hex ?? '#ef4444';
}

function selectBlockColor(blk: WorkspaceBlock, colorName: string) {
  blk.param = colorName;
  isSavedInSqlite.value = false;
  openColorPickerId.value = null;
}

function addBlockToStack(tpl: Omit<WorkspaceBlock, 'id'>, insertAt?: number) {
  const newBlock: WorkspaceBlock = {
    ...tpl,
    id: `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  };
  if (insertAt !== undefined && insertAt >= 0 && insertAt <= scriptStack.value.length) {
    scriptStack.value.splice(insertAt, 0, newBlock);
  } else {
    scriptStack.value.push(newBlock);
  }
  isSavedInSqlite.value = false;
  emit('log', `[Canvas] Bloco '${tpl.opcode}' encaixado na pilha.`);
}

function removeBlock(id: string) {
  if (simState.value !== 'Idle') return;
  scriptStack.value = scriptStack.value.filter((b) => b.id !== id);
  isSavedInSqlite.value = false;
}

// ── Handlers de Drag-and-Drop (Paleta e Reordenação com Snapping) ──
function onPaletteDragStart(e: DragEvent, tpl: Omit<WorkspaceBlock, 'id'>) {
  dragSource.value = { kind: 'palette', template: tpl };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', tpl.opcode);
  }
}

function onCanvasBlockDragStart(e: DragEvent, index: number) {
  if (simState.value !== 'Idle') {
    e.preventDefault();
    return;
  }
  dragSource.value = { kind: 'canvas', index };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function onSlotDragOver(e: DragEvent, targetIndex: number) {
  if (!dragSource.value) return;
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = dragSource.value.kind === 'palette' ? 'copy' : 'move';
  }
  dropTargetIndex.value = targetIndex;
}

function onCanvasDragOver(e: DragEvent) {
  if (!dragSource.value) return;
  e.preventDefault();
  if (dropTargetIndex.value === null) {
    dropTargetIndex.value = scriptStack.value.length;
  }
}

function onDropAt(e: DragEvent, targetIndex: number) {
  e.preventDefault();
  e.stopPropagation();
  const src = dragSource.value;
  dragSource.value = null;
  dropTargetIndex.value = null;
  if (!src) return;

  if (src.kind === 'palette') {
    addBlockToStack(src.template, targetIndex);
    return;
  }

  const fromIdx = src.index;
  if (fromIdx === targetIndex || fromIdx + 1 === targetIndex) return;

  const [moved] = scriptStack.value.splice(fromIdx, 1);
  const adjustedTarget = fromIdx < targetIndex ? targetIndex - 1 : targetIndex;
  scriptStack.value.splice(adjustedTarget, 0, moved);
  isSavedInSqlite.value = false;
  emit('log', `[Canvas] Bloco '${moved.opcode}' reposicionado para posição #${adjustedTarget + 1}.`);
}

function onDragEnd() {
  dragSource.value = null;
  dropTargetIndex.value = null;
}
</script>

<template>
  <div class="block-editor-root">
    <aside class="spike-sidebar">
      <div class="category-rail">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="cat-item"
          :class="{ selected: selectedCategory === cat.key }"
          @click="selectedCategory = cat.key"
        >
          <span class="cat-swatch" :style="{ backgroundColor: cat.color }">{{ cat.icon }}</span>
          <span class="cat-label">{{ cat.label }}</span>
        </button>
      </div>

      <div class="palette-drawer">
        <header class="drawer-header">
          <span>{{ categories.find((c) => c.key === selectedCategory)?.label }}</span>
          <small class="kit-pill">
            {{ currentProject.robot_model === 'SPIKE_ESSENTIAL' ? 'Essencial' : 'Prime' }}
          </small>
        </header>
        <div class="drawer-list">
          <div
            v-for="tpl in paletteTemplates[selectedCategory]"
            :key="tpl.opcode"
            class="block-chip"
            draggable="true"
            :style="{ '--blk-color': getCategoryColor(tpl.category) }"
            title="Arraste para o canvas ou clique para adicionar"
            @dragstart="onPaletteDragStart($event, tpl)"
            @dragend="onDragEnd"
            @click="addBlockToStack(tpl)"
          >
            <span>{{ tpl.label }}</span>
            <span
              v-if="isColorBlock(tpl.opcode)"
              class="chip-color-dot"
              :style="{ backgroundColor: getColorHex(tpl.param) }"
            ></span>
            <strong v-else-if="tpl.param !== undefined" class="chip-input">{{ tpl.param }}</strong>
            <small v-if="tpl.unit">{{ tpl.unit }}</small>
          </div>
        </div>
      </div>
    </aside>

    <div
      class="block-canvas"
      @dragover="onCanvasDragOver"
      @drop="onDropAt($event, dropTargetIndex ?? scriptStack.length)"
    >
      <div class="canvas-hud">
        <span>
          Canvas Principal · Motores <strong>{{ robotConfig.left_motor_port }}+{{ robotConfig.right_motor_port }}</strong>
          ({{ degreesPerCm }}°/cm) · <em>Arraste blocos para reorganizar</em>
        </span>
        <span v-if="compileDiagnostics.length > 0" class="diag-badge">
          ⚠️ {{ compileDiagnostics[0].message }}
        </span>
      </div>

      <div class="block-stack-container">
        <template v-for="(blk, idx) in scriptStack" :key="blk.id">
          <!-- Zona de encaixe (snapping) antes do bloco -->
          <div
            class="snap-zone"
            :class="{ active: dropTargetIndex === idx }"
            @dragover="onSlotDragOver($event, idx)"
            @drop="onDropAt($event, idx)"
          >
            <span v-if="dropTargetIndex === idx" class="snap-hint">Encaixar aqui</span>
          </div>

          <div
            class="puzzle-block"
            draggable="true"
            :class="{
              'is-hat': blk.category === 'events',
              'is-executing': activeBlockIndex === idx,
              'is-dragging': dragSource?.kind === 'canvas' && dragSource.index === idx,
            }"
            :style="{ '--blk-color': getCategoryColor(blk.category) }"
            @dragstart="onCanvasBlockDragStart($event, idx)"
            @dragover="onSlotDragOver($event, idx + 1)"
            @drop="onDropAt($event, idx + 1)"
            @dragend="onDragEnd"
          >
            <div class="block-content">
              <span class="drag-handle" title="Arrastar bloco">⋮⋮</span>
              <span class="block-index">#{{ idx + 1 }}</span>
              <span class="block-text">{{ blk.label }}</span>

              <!-- Seletor Visual de Cores (Swatches) -->
              <div v-if="isColorBlock(blk.opcode)" class="color-picker-wrap">
                <button
                  type="button"
                  class="color-swatch-btn"
                  :title="`Cor selecionada: ${blk.param}`"
                  @click.stop="openColorPickerId = openColorPickerId === blk.id ? null : blk.id"
                >
                  <span class="swatch-circle" :style="{ backgroundColor: getColorHex(blk.param) }"></span>
                  <span class="swatch-name">{{ blk.param }}</span>
                  <span class="swatch-caret">▾</span>
                </button>

                <div v-if="openColorPickerId === blk.id" class="color-popover" @click.stop>
                  <button
                    v-for="sw in SPIKE_COLORS"
                    :key="sw.name"
                    type="button"
                    class="swatch-option"
                    :class="{ selected: String(blk.param) === sw.name }"
                    :title="sw.name"
                    @click="selectBlockColor(blk, sw.name)"
                  >
                    <span class="swatch-circle lg" :style="{ backgroundColor: sw.hex }"></span>
                  </button>
                </div>
              </div>

              <!-- Seletor Ativado/Desativado para Modo Camaleão -->
              <select
                v-else-if="blk.opcode === 'set_chameleon_mode'"
                v-model="blk.param"
                class="block-select-input"
                @mousedown.stop
                @change="isSavedInSqlite = false"
              >
                <option value="Ativado">Ativado</option>
                <option value="Desativado">Desativado</option>
              </select>

              <!-- Input numérico padrão -->
              <input
                v-else-if="blk.param !== undefined"
                v-model="blk.param"
                class="block-field-input"
                @mousedown.stop
                @input="isSavedInSqlite = false"
              />

              <span v-if="blk.unit" class="block-unit">{{ blk.unit }}</span>
              <button
                v-if="scriptStack.length > 1 || idx > 0"
                class="block-remove"
                title="Remover bloco"
                @click.stop="removeBlock(blk.id)"
              >
                ×
              </button>
            </div>
          </div>
        </template>

        <!-- Zona de encaixe final -->
        <div
          class="snap-zone end-zone"
          :class="{ active: dropTargetIndex === scriptStack.length }"
          @dragover="onSlotDragOver($event, scriptStack.length)"
          @drop="onDropAt($event, scriptStack.length)"
        >
          <span v-if="dropTargetIndex === scriptStack.length" class="snap-hint">Encaixar no final</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block-editor-root {
  display: flex;
  width: 100%;
  height: 100%;
}
.spike-sidebar {
  width: 280px;
  background: #181c26;
  border-right: 1px solid #2b3142;
  display: flex;
}
.category-rail {
  width: 76px;
  background: #14171f;
  border-right: 1px solid #252b3b;
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cat-item {
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 7px 4px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 10px;
}
.cat-item.selected {
  background: #23293a;
  border-color: #3b4254;
  color: #fff;
}
.cat-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
}
.palette-drawer {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.drawer-header {
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 700;
  border-bottom: 1px solid #252b3b;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kit-pill {
  background: #262c3a;
  color: #93c5fd;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
}
.drawer-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}
.block-chip {
  background: var(--blk-color);
  color: #fff;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
}
.block-chip:active {
  cursor: grabbing;
}
.chip-input {
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
}
.chip-color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
}
.block-canvas {
  flex: 1;
  background-color: #12151d;
  background-image: radial-gradient(#262c3d 1px, transparent 1px);
  background-size: 18px 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.canvas-hud {
  padding: 8px 14px;
  font-size: 11px;
  color: #94a3b8;
  border-bottom: 1px solid #222736;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(18, 21, 29, 0.85);
}
.diag-badge {
  color: #fbbf24;
  font-weight: 600;
}
.block-stack-container {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.snap-zone {
  width: 340px;
  height: 6px;
  border-radius: 4px;
  transition: height 0.12s, background 0.12s;
  display: flex;
  align-items: center;
  padding-left: 12px;
}
.snap-zone.end-zone {
  height: 36px;
}
.snap-zone.active {
  height: 22px;
  background: rgba(59, 130, 246, 0.25);
  border: 1.5px dashed #60a5fa;
  margin: 2px 0;
}
.snap-hint {
  font-size: 10px;
  font-weight: 700;
  color: #93c5fd;
}
.puzzle-block {
  position: relative;
  background: var(--blk-color);
  color: #fff;
  padding: 9px 14px;
  border-radius: 8px;
  min-width: 340px;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.16);
  cursor: grab;
  transition: transform 0.12s, box-shadow 0.12s, opacity 0.12s;
}
.puzzle-block.is-hat {
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  margin-bottom: 2px;
}
.puzzle-block.is-executing {
  outline: 3px solid #fde047;
  box-shadow: 0 0 18px rgba(250, 204, 21, 0.65);
  transform: translateX(6px);
}
.puzzle-block.is-dragging {
  opacity: 0.45;
}
.block-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.drag-handle {
  opacity: 0.6;
  font-size: 12px;
  cursor: grab;
}
.block-index {
  font-size: 10px;
  opacity: 0.75;
}
.block-field-input {
  width: 56px;
  border: none;
  border-radius: 999px;
  padding: 2px 8px;
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  color: #0f172a;
}
.block-select-input {
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 700;
  font-size: 12px;
  background-color: #1e293b;
  color: #f8fafc;
  cursor: pointer;
}
.block-unit {
  font-size: 12px;
  opacity: 0.9;
}
.block-remove {
  margin-left: auto;
  background: rgba(0, 0, 0, 0.25);
  border: none;
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
}
.color-picker-wrap {
  position: relative;
}
.color-swatch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  padding: 2px 8px 2px 5px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.swatch-circle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.8);
  display: inline-block;
}
.swatch-circle.lg {
  width: 20px;
  height: 20px;
}
.swatch-caret {
  font-size: 10px;
  opacity: 0.8;
}
.color-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  background: #181c26;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 8px;
  display: flex;
  gap: 6px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}
.swatch-option {
  background: transparent;
  border: 2px solid transparent;
  border-radius: 50%;
  padding: 2px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.swatch-option.selected {
  border-color: #38bdf8;
}
</style>
