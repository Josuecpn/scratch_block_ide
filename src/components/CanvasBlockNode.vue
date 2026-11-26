<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore, type PortLetter } from '../stores/workspace.store';
import {
  BLOCK_CATEGORIES,
  CATALOG_BY_OPCODE,
  SPIKE_COLOR_SWATCHES,
  type BlockToken,
} from '../constants/blockCatalog';
import { isSelfOrDescendant, type BlockShape, type WorkspaceBlock } from '../types/blocks';
import PixelMatrixPicker from './PixelMatrixPicker.vue';
import SteeringDialPicker from './SteeringDialPicker.vue';

interface Props {
  block: WorkspaceBlock;
  index: number;
  isExecuting?: boolean;
  isNested?: boolean;
  isEmbedded?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'remove', id: string): void;
  (e: 'drag-start', payload: { event: DragEvent; block: WorkspaceBlock; index: number }): void;
  (e: 'drop-child', payload: { event: DragEvent; parentBlock: WorkspaceBlock; branch: 'children' | 'elseChildren'; insertAt: number }): void;
  (e: 'drop-slot', payload: { event: DragEvent; parentBlock: WorkspaceBlock; slotName: string; expectedShape: 'reporter' | 'boolean' }): void;
  (e: 'clear-slot', payload: { parentBlock: WorkspaceBlock; slotName: string }): void;
  (e: 'open-new-message'): void;
}>();

const workspaceStore = useWorkspaceStore();
const { availablePorts, definitions, robotConfig, isSavedInSqlite } = storeToRefs(workspaceStore);

const openColorField = ref<string | null>(null);
const colorTriggerEl = ref<HTMLElement | null>(null);
const colorPopoverEl = ref<HTMLElement | null>(null);
const colorPopoverStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' });
const dragOverBranch = ref<string | null>(null);
const dragOverSlot = ref<string | null>(null);
const activeDraggedBlock = inject<ComputedRef<WorkspaceBlock | null>>(
  'activeDraggedBlock',
  computed(() => null)
);

const isInvalidDropTarget = computed(() => {
  const dragged = activeDraggedBlock.value;
  if (!dragged) return false;
  return isSelfOrDescendant(dragged, props.block.id);
});

function onBranchDragOver(e: DragEvent, branch: 'children' | 'elseChildren') {
  if (isInvalidDropTarget.value) {
    dragOverBranch.value = null;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    return;
  }
  dragOverBranch.value = branch;
}

function onSlotDragOver(e: DragEvent, slot: string) {
  if (isInvalidDropTarget.value) {
    dragOverSlot.value = null;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    return;
  }
  dragOverSlot.value = slot;
}

function toggleColorPicker(field: string, event: MouseEvent) {
  if (openColorField.value === field) {
    openColorField.value = null;
    return;
  }
  const btn = event.currentTarget as HTMLElement | null;
  colorTriggerEl.value = btn;
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 230, Math.max(8, rect.left));
    const top = Math.min(window.innerHeight - 60, rect.bottom + 6);
    colorPopoverStyle.value = { top: `${top}px`, left: `${left}px` };
  }
  openColorField.value = field;
}

function onDocPointerDown(e: PointerEvent) {
  if (!openColorField.value) return;
  const target = e.target as Node | null;
  if (
    target &&
    !colorTriggerEl.value?.contains(target) &&
    !colorPopoverEl.value?.contains(target)
  ) {
    openColorField.value = null;
  }
}

function onDocKeyDown(e: KeyboardEvent) {
  if (openColorField.value && e.key === 'Escape') {
    openColorField.value = null;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('keydown', onDocKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.removeEventListener('keydown', onDocKeyDown);
});

const catalogEntry = computed(() => CATALOG_BY_OPCODE.get(props.block.opcode));

const blockShape = computed<BlockShape>(() => {
  return props.block.shape ?? catalogEntry.value?.shape ?? 'stack';
});

const blockColor = computed<string>(() => {
  return BLOCK_CATEGORIES.find((c) => c.key === props.block.category)?.color ?? '#64748B';
});

const tokens = computed<BlockToken[]>(() => {
  if (catalogEntry.value) {
    return catalogEntry.value.tokens;
  }
  // Fallback para blocos dinâmicos (Variáveis, Listas, Meus Blocos) ou legados
  if (props.block.opcode === 'var_set') {
    return [
      { kind: 'text', text: 'altera' },
      { kind: 'var_select', field: 'variable' },
      { kind: 'text', text: 'para' },
      { kind: 'slot_value', slot: 'VALUE', defaultVal: 0 },
    ];
  }
  if (props.block.opcode === 'var_change') {
    return [
      { kind: 'text', text: 'adiciona a' },
      { kind: 'var_select', field: 'variable' },
      { kind: 'text', text: 'o valor' },
      { kind: 'number', field: 'value' },
    ];
  }
  if (props.block.opcode === 'list_add') {
    return [
      { kind: 'text', text: 'acrescenta' },
      { kind: 'string', field: 'item' },
      { kind: 'text', text: 'a' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_delete') {
    return [
      { kind: 'text', text: 'remove' },
      { kind: 'number', field: 'index', min: 1 },
      { kind: 'text', text: 'de' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_clear') {
    return [
      { kind: 'text', text: 'remove tudo de' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_insert') {
    return [
      { kind: 'text', text: 'insere' },
      { kind: 'string', field: 'item' },
      { kind: 'text', text: 'como' },
      { kind: 'number', field: 'index', min: 1 },
      { kind: 'text', text: 'de' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_replace') {
    return [
      { kind: 'text', text: 'substitui' },
      { kind: 'number', field: 'index', min: 1 },
      { kind: 'text', text: 'de' },
      { kind: 'list_select', field: 'list' },
      { kind: 'text', text: 'por' },
      { kind: 'string', field: 'item' },
    ];
  }
  if (props.block.opcode === 'list_item_at') {
    return [
      { kind: 'number', field: 'index', min: 1 },
      { kind: 'text', text: 'de' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_index_of') {
    return [
      { kind: 'text', text: 'o número do item' },
      { kind: 'string', field: 'item' },
      { kind: 'text', text: 'em' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_length') {
    return [
      { kind: 'text', text: 'o comprimento de' },
      { kind: 'list_select', field: 'list' },
    ];
  }
  if (props.block.opcode === 'list_contains') {
    return [
      { kind: 'list_select', field: 'list' },
      { kind: 'text', text: 'contém' },
      { kind: 'string', field: 'item' },
    ];
  }
  if (props.block.opcode === 'my_block_call' && props.block.customBlockId) {
    const def = definitions.value.customBlocks.find((c) => c.id === props.block.customBlockId);
    if (def) {
      const out: BlockToken[] = [{ kind: 'text', text: def.name }];
      for (const seg of def.segments) {
        if (seg.kind === 'label') out.push({ kind: 'text', text: seg.text });
        else if (seg.kind === 'boolean') out.push({ kind: 'slot_bool', slot: seg.id });
        else out.push({ kind: 'slot_value', slot: seg.id, defaultVal: seg.text });
      }
      return out;
    }
  }

  // Fallback legado (param + unit)
  const fallback: BlockToken[] = [{ kind: 'text', text: props.block.label }];
  if (props.block.param !== undefined) {
    fallback.push({ kind: 'number', field: '__param' });
  }
  if (props.block.unit) {
    fallback.push({ kind: 'text', text: props.block.unit });
  }
  return fallback;
});

function getField(field: string, fallback: string | number = ''): string | number {
  if (field === '__param') return props.block.param ?? fallback;
  if (!props.block.fields) return fallback;
  const val = props.block.fields[field];
  return typeof val === 'boolean' ? String(val) : (val ?? fallback);
}

function setField(field: string, value: string | number) {
  if (field === '__param') {
    props.block.param = value;
  } else {
    if (!props.block.fields) props.block.fields = {};
    props.block.fields[field] = value;
    if (field === 'value' || field === 'speed' || field === 'seconds' || field === 'color' || field === 'times') {
      props.block.param = value;
    }
  }
  isSavedInSqlite.value = false;
}

function getColorHex(name: string | number): string {
  const s = String(name || 'Vermelho').toLowerCase();
  return SPIKE_COLOR_SWATCHES.find((c) => c.name.toLowerCase() === s)?.hex ?? '#ef4444';
}

function portOptions(field: string): string[] {
  const ports: PortLetter[] = [...availablePorts.value];
  if (props.block.category === 'light' && field === 'port') {
    return ['Hub', ...ports];
  }
  return ports;
}

function getSafeSelectValue(field: string, options: string[], preferredFallback?: string): string {
  const current = String(getField(field, ''));
  if (current && options.includes(current)) {
    return current;
  }
  if (preferredFallback && options.includes(preferredFallback)) {
    return preferredFallback;
  }
  return options[0] ?? '';
}

function getSafePortValue(field: string): string {
  const opts = portOptions(field);
  const preferred =
    props.block.category === 'sensors' || props.block.opcode === 'when_color_detected'
      ? robotConfig.value.color_sensor_port
      : opts[0];
  return getSafeSelectValue(field, opts, preferred);
}

function onMessageSelectChange(field: string, e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  if (val === '__new_message__') {
    emit('open-new-message');
    return;
  }
  setField(field, val);
}

function isLoopBlock(): boolean {
  return ['repeat_times', 'repeat_forever', 'repeat_until'].includes(props.block.opcode);
}
</script>

<template>
  <div
    class="node-wrapper"
    :class="[`shape-${blockShape}`, { 'is-executing': isExecuting, 'is-embedded': isEmbedded }]"
    :style="{ '--blk-color': blockColor }"
    :draggable="!isEmbedded"
    @dragstart.stop="!isEmbedded && emit('drag-start', { event: $event, block, index })"
  >
    <!-- Cabeçalho do Bloco -->
    <div class="block-header">
      <span v-if="!isNested && !isEmbedded" class="drag-grip" title="Arrastar bloco">⋮⋮</span>

      <template v-for="(tok, tIdx) in tokens" :key="tIdx">
        <span v-if="tok.kind === 'icon'" class="tok-icon">{{ tok.icon }}</span>
        <span v-else-if="tok.kind === 'text'" class="tok-text">{{ tok.text }}</span>

        <!-- Porta A..F (ou Hub) -->
        <select
          v-else-if="tok.kind === 'port'"
          :value="getSafePortValue(tok.field)"
          class="tok-select"
          @mousedown.stop
          @change="setField(tok.field, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in portOptions(tok.field)" :key="p" :value="p">{{ p }}</option>
        </select>

        <!-- Select genérico -->
        <select
          v-else-if="tok.kind === 'select'"
          :value="getSafeSelectValue(tok.field, tok.options.map((o) => o.value), tok.options[0]?.value)"
          class="tok-select"
          @mousedown.stop
          @change="setField(tok.field, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in tok.options" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <!-- Número -->
        <input
          v-else-if="tok.kind === 'number'"
          type="number"
          :min="tok.min"
          :max="tok.max"
          :value="getField(tok.field, 0)"
          class="tok-pill-input"
          @mousedown.stop
          @input="setField(tok.field, Number(($event.target as HTMLInputElement).value))"
        />

        <!-- Texto -->
        <input
          v-else-if="tok.kind === 'string'"
          type="text"
          :value="getField(tok.field, '')"
          class="tok-pill-input wide"
          @mousedown.stop
          @input="setField(tok.field, ($event.target as HTMLInputElement).value)"
        />

        <!-- Seletor Visual de Cor (apenas bolinha colorida clicável) -->
        <div v-else-if="tok.kind === 'color'" class="color-picker-wrap">
          <button
            type="button"
            class="color-swatch-btn"
            :title="`Cor selecionada: ${getField(tok.field, 'Vermelho')}`"
            @click.stop="toggleColorPicker(tok.field, $event)"
          >
            <span
              class="swatch-circle"
              :style="{ backgroundColor: getColorHex(getField(tok.field, 'Vermelho')) }"
            ></span>
            <span class="swatch-caret">▾</span>
          </button>
          <Teleport to="body">
            <div
              v-if="openColorField === tok.field"
              ref="colorPopoverEl"
              class="color-popover-floating"
              :style="colorPopoverStyle"
              @click.stop
            >
              <button
                v-for="sw in SPIKE_COLOR_SWATCHES"
                :key="sw.name"
                type="button"
                class="swatch-opt"
                :title="sw.name"
                @click="setField(tok.field, sw.name); openColorField = null"
              >
                <span class="swatch-circle lg" :style="{ backgroundColor: sw.hex }"></span>
              </button>
            </div>
          </Teleport>
        </div>

        <!-- Matriz de Pixels 5x5 -->
        <PixelMatrixPicker
          v-else-if="tok.kind === 'matrix'"
          :model-value="String(getField(tok.field, '0101001010000001000101110'))"
          @update:model-value="setField(tok.field, $event)"
        />

        <!-- Dial Circular -100..+100 -->
        <SteeringDialPicker
          v-else-if="tok.kind === 'dial'"
          :model-value="Number(getField(tok.field, 30))"
          @update:model-value="setField(tok.field, $event)"
        />

        <!-- Dropdown de Variável / Lista / Mensagem -->
        <select
          v-else-if="tok.kind === 'var_select'"
          :value="getSafeSelectValue(tok.field, definitions.variables.map((v) => v.name))"
          class="tok-select"
          @mousedown.stop
          @change="setField(tok.field, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="v in definitions.variables" :key="v.id" :value="v.name">{{ v.name }}</option>
        </select>

        <select
          v-else-if="tok.kind === 'list_select'"
          :value="getSafeSelectValue(tok.field, definitions.lists.map((l) => l.name))"
          class="tok-select"
          @mousedown.stop
          @change="setField(tok.field, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="l in definitions.lists" :key="l.id" :value="l.name">{{ l.name }}</option>
        </select>

        <select
          v-else-if="tok.kind === 'msg_select'"
          :value="getSafeSelectValue(tok.field, definitions.messages)"
          class="tok-select"
          @mousedown.stop
          @change="onMessageSelectChange(tok.field, $event)"
        >
          <option v-for="m in definitions.messages" :key="m" :value="m">{{ m }}</option>
          <option value="__new_message__">+ Nova mensagem...</option>
        </select>

        <!-- Slot Pílula (Reporter) -->
        <div
          v-else-if="tok.kind === 'slot_value'"
          class="slot-pill"
          :class="{
            'drag-hover': dragOverSlot === tok.slot && !isInvalidDropTarget,
            'drag-blocked': isInvalidDropTarget,
            'has-embedded': !!block.slots?.[tok.slot],
          }"
          @dragover.prevent.stop="onSlotDragOver($event, tok.slot)"
          @dragleave="dragOverSlot = null"
          @drop.prevent.stop="
            dragOverSlot = null;
            emit('drop-slot', { event: $event, parentBlock: block, slotName: tok.slot, expectedShape: 'reporter' });
          "
        >
          <CanvasBlockNode
            v-if="block.slots?.[tok.slot]"
            :block="block.slots[tok.slot]!"
            :index="0"
            :is-nested="true"
            :is-embedded="true"
            @remove="emit('clear-slot', { parentBlock: block, slotName: tok.slot })"
            @drag-start="emit('drag-start', $event)"
            @drop-child="emit('drop-child', $event)"
            @drop-slot="emit('drop-slot', $event)"
            @clear-slot="emit('clear-slot', $event)"
            @open-new-message="emit('open-new-message')"
          />
          <input
            v-else
            type="text"
            :value="getField(tok.slot.toLowerCase(), tok.defaultVal ?? '')"
            class="slot-inline-input"
            @mousedown.stop
            @input="setField(tok.slot.toLowerCase(), ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Slot Hexagonal (Booleano) -->
        <div
          v-else-if="tok.kind === 'slot_bool'"
          class="slot-hex"
          :class="{
            'drag-hover': dragOverSlot === tok.slot && !isInvalidDropTarget,
            'drag-blocked': isInvalidDropTarget,
            'has-embedded': !!block.slots?.[tok.slot],
          }"
          @dragover.prevent.stop="onSlotDragOver($event, tok.slot)"
          @dragleave="dragOverSlot = null"
          @drop.prevent.stop="
            dragOverSlot = null;
            emit('drop-slot', { event: $event, parentBlock: block, slotName: tok.slot, expectedShape: 'boolean' });
          "
        >
          <CanvasBlockNode
            v-if="block.slots?.[tok.slot]"
            :block="block.slots[tok.slot]!"
            :index="0"
            :is-nested="true"
            :is-embedded="true"
            @remove="emit('clear-slot', { parentBlock: block, slotName: tok.slot })"
            @drag-start="emit('drag-start', $event)"
            @drop-child="emit('drop-child', $event)"
            @drop-slot="emit('drop-slot', $event)"
            @clear-slot="emit('clear-slot', $event)"
            @open-new-message="emit('open-new-message')"
          />
          <span v-else class="slot-hex-placeholder">condição</span>
        </div>
      </template>

      <button
        type="button"
        class="btn-remove"
        title="Remover bloco"
        @click.stop="emit('remove', block.id)"
      >
        ×
      </button>
    </div>

    <!-- Corpo interno para Blocos C / E -->
    <template v-if="blockShape === 'c_block' || blockShape === 'e_block'">
      <div
        class="c-branch"
        :class="{
          'drag-hover': dragOverBranch === 'children' && !isInvalidDropTarget,
          'drag-blocked': isInvalidDropTarget,
        }"
        @dragover.prevent.stop="onBranchDragOver($event, 'children')"
        @dragleave="dragOverBranch = null"
        @drop.prevent.stop="
          dragOverBranch = null;
          emit('drop-child', { event: $event, parentBlock: block, branch: 'children', insertAt: (block.children?.length ?? 0) });
        "
      >
        <div v-if="!block.children || block.children.length === 0" class="c-empty">
          Arraste blocos aqui
        </div>
        <CanvasBlockNode
          v-for="(child, cIdx) in block.children ?? []"
          :key="child.id"
          :block="child"
          :index="cIdx"
          :is-nested="true"
          @remove="block.children = (block.children ?? []).filter((c) => c.id !== $event); isSavedInSqlite = false"
          @drag-start="emit('drag-start', $event)"
          @drop-child="emit('drop-child', $event)"
          @drop-slot="emit('drop-slot', $event)"
          @clear-slot="emit('clear-slot', $event)"
          @open-new-message="emit('open-new-message')"
        />
      </div>

      <!-- Braço SENÃO para Bloco E -->
      <template v-if="blockShape === 'e_block'">
        <div class="e-divider">senão,</div>
        <div
          class="c-branch"
          :class="{
            'drag-hover': dragOverBranch === 'elseChildren' && !isInvalidDropTarget,
            'drag-blocked': isInvalidDropTarget,
          }"
          @dragover.prevent.stop="onBranchDragOver($event, 'elseChildren')"
          @dragleave="dragOverBranch = null"
          @drop.prevent.stop="
            dragOverBranch = null;
            emit('drop-child', { event: $event, parentBlock: block, branch: 'elseChildren', insertAt: (block.elseChildren?.length ?? 0) });
          "
        >
          <div v-if="!block.elseChildren || block.elseChildren.length === 0" class="c-empty">
            Arraste blocos para o senão
          </div>
          <CanvasBlockNode
            v-for="(child, cIdx) in block.elseChildren ?? []"
            :key="child.id"
            :block="child"
            :index="cIdx"
            :is-nested="true"
            @remove="block.elseChildren = (block.elseChildren ?? []).filter((c) => c.id !== $event); isSavedInSqlite = false"
            @drag-start="emit('drag-start', $event)"
            @drop-child="emit('drop-child', $event)"
            @drop-slot="emit('drop-slot', $event)"
            @clear-slot="emit('clear-slot', $event)"
            @open-new-message="emit('open-new-message')"
          />
        </div>
      </template>

      <div class="c-footer">
        <span v-if="isLoopBlock()" class="loop-arrow">↺</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.node-wrapper {
  background: var(--blk-color);
  color: #fff;
  border-radius: 8px;
  min-width: 340px;
  max-width: 100%;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: grab;
  transition: transform 0.12s, box-shadow 0.12s;
}
.node-wrapper.shape-hat {
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
}
.node-wrapper.shape-cap {
  border-bottom-left-radius: 2px;
  border-bottom-right-radius: 2px;
}
.node-wrapper.shape-reporter {
  border-radius: 999px;
  min-width: 220px;
}
.node-wrapper.shape-boolean {
  position: relative;
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0 10px;
  min-width: 240px;
}
.node-wrapper.shape-boolean::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--blk-color);
  clip-path: polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%);
  z-index: 0;
}
.node-wrapper.is-executing {
  outline: 3px solid #fde047;
  box-shadow: 0 0 18px rgba(250, 204, 21, 0.65);
  transform: translateX(6px);
}
.block-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
}
.drag-grip {
  opacity: 0.65;
  cursor: grab;
}
.tok-icon {
  font-size: 13px;
}
.tok-select {
  background-color: rgba(15, 23, 42, 0.72);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.tok-pill-input {
  width: 54px;
  background-color: #ffffff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.2);
  border-radius: 999px;
  padding: 2px 7px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
}
.tok-pill-input.wide {
  width: 74px;
}
.slot-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #ffffff;
  padding: 1px 4px;
  min-width: 44px;
}
.slot-pill.drag-hover {
  outline: 2px solid #fde047;
}
.slot-inline-input {
  width: 44px;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  outline: none;
}
.slot-hex {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 22px;
  padding: 0 12px;
  background: rgba(15, 23, 42, 0.45);
  clip-path: polygon(8px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0% 50%);
  font-size: 10px;
}
.slot-hex.drag-hover {
  background: rgba(250, 204, 21, 0.45);
}
.slot-hex-placeholder {
  opacity: 0.7;
}
.node-wrapper.is-embedded {
  min-width: auto;
  cursor: default;
  box-shadow: none;
}
.node-wrapper.is-embedded .block-header {
  padding: 3px 8px;
  font-size: 11px;
  gap: 5px;
}
.node-wrapper.is-embedded.shape-boolean {
  min-width: auto;
  padding: 0 8px;
}
.slot-pill.has-embedded {
  background: transparent;
  padding: 0;
}
.slot-hex.has-embedded {
  background: transparent;
  clip-path: none;
  padding: 0;
  height: auto;
  min-width: auto;
}
.swatch-caret {
  font-size: 9px;
  opacity: 0.85;
}
.c-branch {
  margin-left: 16px;
  padding: 6px 8px;
  background: #12151d;
  border-left: 4px solid rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 36px;
}
.c-branch.drag-hover {
  background: rgba(59, 130, 246, 0.2);
}
.drag-blocked {
  cursor: not-allowed !important;
}
.c-empty {
  font-size: 10px;
  color: #64748b;
  font-style: italic;
  padding: 4px;
}
.e-divider {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
}
.c-footer {
  height: 18px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-right: 12px;
  font-size: 12px;
  font-weight: 800;
}
.btn-remove {
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  padding: 2px 8px 2px 5px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.swatch-circle {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  display: inline-block;
}
.swatch-circle.lg {
  width: 18px;
  height: 18px;
}
</style>

<style>
.color-popover-floating {
  position: fixed;
  z-index: 9999;
  background: #181c26;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 7px;
  display: flex;
  gap: 6px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
}
.color-popover-floating .swatch-opt {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
}
.color-popover-floating .swatch-circle.lg {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  display: inline-block;
}
</style>
