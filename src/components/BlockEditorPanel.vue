<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace.store';
import { useSimulationStore } from '../stores/simulation.store';
import type { CompileDiagnostic } from '../services/spikeHardware';
import {
  BLOCK_CATEGORIES,
  BLOCK_CATALOG,
  type BlockCatalogEntry,
} from '../constants/blockCatalog';
import {
  isSelfOrDescendant,
  type BlockCategoryKey,
  type CustomBlockSegment,
  type WorkspaceBlock,
} from '../types/blocks';
import CanvasBlockNode from './CanvasBlockNode.vue';
import BlockCreationModals, { type ModalKind } from './BlockCreationModals.vue';

interface Props {
  degreesPerCm: number;
  compileDiagnostics: CompileDiagnostic[];
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'log', message: string): void;
}>();

const workspaceStore = useWorkspaceStore();
const simulationStore = useSimulationStore();

const { currentProject, scriptStack, robotConfig, definitions, isSavedInSqlite } =
  storeToRefs(workspaceStore);
const { simState, activeBlockIndex } = storeToRefs(simulationStore);

const selectedCategory = ref<BlockCategoryKey>('motors');
const paletteScrollRef = ref<HTMLDivElement | null>(null);
const sectionRefs = ref<Partial<Record<BlockCategoryKey, HTMLElement>>>({});
const isProgrammaticScroll = ref(false);
const activeModal = ref<ModalKind>(null);

// Estado de Drag-and-Drop
const dragSource = ref<
  | { kind: 'palette'; block: WorkspaceBlock }
  | { kind: 'canvas'; index: number; block: WorkspaceBlock }
  | null
>(null);
const dropTargetIndex = ref<number | null>(null);

provide(
  'activeDraggedBlock',
  computed(() => dragSource.value?.block ?? null)
);

const staticBlocksByCategory = computed(() => {
  const grouped: Record<string, BlockCatalogEntry[]> = {};
  for (const cat of BLOCK_CATEGORIES) {
    grouped[cat.key] = BLOCK_CATALOG.filter((b) => b.category === cat.key);
  }
  return grouped;
});

function setSectionRef(key: BlockCategoryKey, el: unknown) {
  if (el instanceof HTMLElement) {
    sectionRefs.value[key] = el;
  }
}

function scrollToCategory(key: BlockCategoryKey) {
  selectedCategory.value = key;
  const target = sectionRefs.value[key];
  const container = paletteScrollRef.value;
  if (!target || !container) return;

  isProgrammaticScroll.value = true;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => {
    isProgrammaticScroll.value = false;
  }, 450);
}

function onPaletteScroll() {
  if (isProgrammaticScroll.value) return;
  const container = paletteScrollRef.value;
  if (!container) return;

  const containerTop = container.getBoundingClientRect().top;
  let bestKey: BlockCategoryKey = BLOCK_CATEGORIES[0].key;
  let bestDist = Infinity;

  for (const cat of BLOCK_CATEGORIES) {
    const el = sectionRefs.value[cat.key];
    if (!el) continue;
    const top = el.getBoundingClientRect().top - containerTop;
    // Seção mais próxima do topo visível
    if (top <= 48 && Math.abs(top) < bestDist) {
      bestDist = Math.abs(top);
      bestKey = cat.key;
    } else if (top > 48 && bestDist === Infinity) {
      bestDist = top;
      bestKey = cat.key;
    }
  }
  selectedCategory.value = bestKey;
}

function instantiateFromCatalog(entry: BlockCatalogEntry): WorkspaceBlock {
  return {
    id: `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    category: entry.category,
    opcode: entry.opcode,
    label: entry.label,
    shape: entry.shape,
    param: entry.defaultParam,
    unit: entry.defaultUnit,
    fields: entry.defaultFields ? { ...entry.defaultFields } : undefined,
    children: entry.shape === 'c_block' || entry.shape === 'e_block' ? [] : undefined,
    elseChildren: entry.shape === 'e_block' ? [] : undefined,
  };
}

function instantiateDynamicBlock(partial: Omit<WorkspaceBlock, 'id'>): WorkspaceBlock {
  return {
    ...partial,
    id: `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    fields: partial.fields ? { ...partial.fields } : undefined,
  };
}

function addBlockToStack(blk: WorkspaceBlock, insertAt?: number) {
  if (insertAt !== undefined && insertAt >= 0 && insertAt <= scriptStack.value.length) {
    scriptStack.value.splice(insertAt, 0, blk);
  } else {
    scriptStack.value.push(blk);
  }
  isSavedInSqlite.value = false;
  emit('log', `[Canvas] Bloco '${blk.label}' encaixado na pilha.`);
}

function removeBlock(id: string) {
  if (simState.value !== 'Idle') return;
  scriptStack.value = scriptStack.value.filter((b) => b.id !== id);
  isSavedInSqlite.value = false;
}

// ── Drag-and-Drop Handlers ──
function onPaletteDragStart(e: DragEvent, blk: WorkspaceBlock) {
  dragSource.value = { kind: 'palette', block: blk };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', blk.opcode);
  }
}

function onCanvasDragStart(payload: { event: DragEvent; block: WorkspaceBlock; index: number }) {
  if (simState.value !== 'Idle') {
    payload.event.preventDefault();
    return;
  }
  dragSource.value = { kind: 'canvas', index: payload.index, block: payload.block };
  if (payload.event.dataTransfer) {
    payload.event.dataTransfer.effectAllowed = 'move';
    payload.event.dataTransfer.setData('text/plain', payload.block.id);
  }
}

function onSlotDragOver(e: DragEvent, targetIndex: number) {
  if (!dragSource.value) return;
  e.preventDefault();
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
    addBlockToStack(src.block, targetIndex);
    return;
  }

  const fromIdx = scriptStack.value.findIndex((b) => b.id === src.block.id);
  if (fromIdx !== -1) {
    if (fromIdx === targetIndex || fromIdx + 1 === targetIndex) return;
    const [moved] = scriptStack.value.splice(fromIdx, 1);
    if (!moved) return;
    const adjustedTarget = fromIdx < targetIndex ? targetIndex - 1 : targetIndex;
    scriptStack.value.splice(adjustedTarget, 0, moved);
    isSavedInSqlite.value = false;
  } else if (removeBlockFromTree(scriptStack.value, src.block.id)) {
    scriptStack.value.splice(targetIndex, 0, src.block);
    isSavedInSqlite.value = false;
  }
}

function onDropChild(payload: {
  event: DragEvent;
  parentBlock: WorkspaceBlock;
  branch: 'children' | 'elseChildren';
  insertAt: number;
}) {
  const src = dragSource.value;
  dragSource.value = null;
  dropTargetIndex.value = null;
  if (!src) return;

  // Bloqueia auto-encaixe direto ou indireto (ancestralidade)
  if (isSelfOrDescendant(src.block, payload.parentBlock.id)) {
    emit('log', `[Canvas] Encaixe bloqueado: um bloco não pode ser solto dentro de si mesmo ou de seus filhos.`);
    return;
  }

  const targetArr =
    payload.branch === 'elseChildren'
      ? (payload.parentBlock.elseChildren ??= [])
      : (payload.parentBlock.children ??= []);

  if (src.kind === 'palette') {
    targetArr.splice(payload.insertAt, 0, src.block);
    isSavedInSqlite.value = false;
    emit('log', `[Canvas] Bloco '${src.block.label}' encaixado dentro de '${payload.parentBlock.label}'.`);
  } else if (removeBlockFromTree(scriptStack.value, src.block.id)) {
    targetArr.splice(payload.insertAt, 0, src.block);
    isSavedInSqlite.value = false;
    emit('log', `[Canvas] Bloco '${src.block.label}' movido para dentro de '${payload.parentBlock.label}'.`);
  }
}

function removeBlockFromTree(list: WorkspaceBlock[], targetId: string): boolean {
  const idx = list.findIndex((b) => b.id === targetId);
  if (idx !== -1) {
    list.splice(idx, 1);
    return true;
  }
  for (const b of list) {
    if (b.children && removeBlockFromTree(b.children, targetId)) return true;
    if (b.elseChildren && removeBlockFromTree(b.elseChildren, targetId)) return true;
  }
  return false;
}

function onDropSlot(payload: {
  event: DragEvent;
  parentBlock: WorkspaceBlock;
  slotName: string;
  expectedShape: 'reporter' | 'boolean';
}) {
  const src = dragSource.value;
  dragSource.value = null;
  dropTargetIndex.value = null;
  if (!src) return;

  const blk = src.block;
  if (isSelfOrDescendant(blk, payload.parentBlock.id)) {
    emit('log', `[Canvas] Encaixe bloqueado: referência circular não permitida.`);
    return;
  }

  if (src.kind === 'canvas') {
    removeBlockFromTree(scriptStack.value, blk.id);
  }

  if (!payload.parentBlock.slots) {
    payload.parentBlock.slots = {};
  }
  payload.parentBlock.slots[payload.slotName] = blk;
  isSavedInSqlite.value = false;
  emit('log', `[Canvas] '${blk.label}' encaixado no slot ${payload.slotName}.`);
}

function onClearSlot(payload: { parentBlock: WorkspaceBlock; slotName: string }) {
  if (payload.parentBlock.slots) {
    payload.parentBlock.slots[payload.slotName] = null;
    isSavedInSqlite.value = false;
  }
}

function onDragEnd() {
  dragSource.value = null;
  dropTargetIndex.value = null;
}

// ── Handlers dos Modais Dinâmicos ──
function handleCreateVariable(name: string) {
  const created = workspaceStore.addVariable(name);
  if (created) emit('log', `[Variáveis] Variável '${created.name}' criada.`);
}

function handleCreateList(name: string) {
  const created = workspaceStore.addList(name);
  if (created) emit('log', `[Listas] Lista '${created.name}' criada.`);
}

function handleCreateMessage(name: string) {
  workspaceStore.addMessage(name);
  emit('log', `[Eventos] Mensagem '${name}' adicionada.`);
}

function handleCreateCustomBlock(payload: { name: string; segments: CustomBlockSegment[] }) {
  const def = workspaceStore.addCustomBlock(payload.name, payload.segments);
  emit('log', `[Meus Blocos] Bloco '${def.name}' criado e chapéu de definição inserido no canvas.`);
}

// Blocos dinâmicos de Variáveis
const dynamicVariableBlocks = computed<Omit<WorkspaceBlock, 'id'>[]>(() => {
  if (definitions.value.variables.length === 0) return [];
  const first = definitions.value.variables[0].name;
  return [
    {
      category: 'variables',
      opcode: 'var_set',
      shape: 'stack',
      label: `altera ${first} para 0`,
      fields: { variable: first, value: 0 },
    },
    {
      category: 'variables',
      opcode: 'var_change',
      shape: 'stack',
      label: `adiciona a ${first} o valor 1`,
      fields: { variable: first, value: 1 },
    },
  ];
});

// Blocos dinâmicos de Listas
const dynamicListBlocks = computed<Omit<WorkspaceBlock, 'id'>[]>(() => {
  if (definitions.value.lists.length === 0) return [];
  const first = definitions.value.lists[0].name;
  const items: Omit<WorkspaceBlock, 'id'>[] = [
    { category: 'lists', opcode: 'list_add', shape: 'stack', label: `acrescenta [uma coisa] a ${first}`, fields: { list: first, item: 'uma coisa' } },
    { category: 'lists', opcode: 'list_delete', shape: 'stack', label: `remove [1] de ${first}`, fields: { list: first, index: 1 } },
    { category: 'lists', opcode: 'list_clear', shape: 'stack', label: `remove tudo de ${first}`, fields: { list: first } },
    { category: 'lists', opcode: 'list_insert', shape: 'stack', label: `insere [uma coisa] como [1] de ${first}`, fields: { list: first, item: 'uma coisa', index: 1 } },
    { category: 'lists', opcode: 'list_replace', shape: 'stack', label: `substitui [1] de ${first} por [uma coisa]`, fields: { list: first, index: 1, item: 'uma coisa' } },
    { category: 'lists', opcode: 'list_item_at', shape: 'reporter', label: `[1] de ${first}`, fields: { list: first, index: 1 } },
    { category: 'lists', opcode: 'list_index_of', shape: 'reporter', label: `número do item [uma coisa] em ${first}`, fields: { list: first, item: 'uma coisa' } },
    { category: 'lists', opcode: 'list_length', shape: 'reporter', label: `o comprimento de ${first}`, fields: { list: first } },
    { category: 'lists', opcode: 'list_contains', shape: 'boolean', label: `${first} contém [uma coisa]`, fields: { list: first, item: 'uma coisa' } },
  ];
  return items;
});
</script>

<template>
  <div class="block-editor-root">
    <aside class="spike-sidebar">
      <!-- Barra vertical de navegação rápida -->
      <div class="category-rail">
        <button
          v-for="cat in BLOCK_CATEGORIES"
          :key="cat.key"
          class="cat-item"
          :class="{ selected: selectedCategory === cat.key }"
          @click="scrollToCategory(cat.key)"
        >
          <span class="cat-swatch" :style="{ backgroundColor: cat.color }">{{ cat.icon }}</span>
          <span class="cat-label">{{ cat.label }}</span>
        </button>
      </div>

      <!-- Paleta contínua com Scroll-Spy -->
      <div ref="paletteScrollRef" class="palette-scroll" @scroll="onPaletteScroll">
        <div class="palette-top-badge">
          Kit: <strong>{{ currentProject.robot_model === 'SPIKE_ESSENTIAL' ? 'Essencial' : 'Prime' }}</strong>
        </div>

        <section
          v-for="cat in BLOCK_CATEGORIES"
          :key="cat.key"
          :ref="(el) => setSectionRef(cat.key, el)"
          class="palette-section"
        >
          <h4 class="section-title" :style="{ borderLeftColor: cat.color }">
            {{ cat.label }}
          </h4>

          <!-- Categorias estáticas A..H -->
          <template v-if="cat.key !== 'variables' && cat.key !== 'lists' && cat.key !== 'my_blocks'">
            <div class="section-blocks">
              <div
                v-for="entry in staticBlocksByCategory[cat.key]"
                :key="entry.opcode"
                class="palette-chip"
                :class="`chip-${entry.shape}`"
                :style="{ '--blk-color': cat.color }"
                draggable="true"
                title="Arraste para o canvas ou clique para adicionar"
                @dragstart="onPaletteDragStart($event, instantiateFromCatalog(entry))"
                @dragend="onDragEnd"
                @click="addBlockToStack(instantiateFromCatalog(entry))"
              >
                {{ entry.label }}
              </div>
            </div>
          </template>

          <!-- Seção I: Variáveis -->
          <template v-else-if="cat.key === 'variables'">
            <button type="button" class="btn-create-dynamic" @click="activeModal = 'variable'">
              + Criar uma Variável
            </button>

            <div v-if="definitions.variables.length > 0" class="dynamic-monitors">
              <label v-for="v in definitions.variables" :key="v.id" class="monitor-chip">
                <input v-model="v.monitored" type="checkbox" @change="isSavedInSqlite = false" />
                <span class="var-pill" :style="{ backgroundColor: cat.color }">{{ v.name }}</span>
                <small>= {{ v.value }}</small>
              </label>
            </div>

            <div class="section-blocks">
              <div
                v-for="(tpl, i) in dynamicVariableBlocks"
                :key="i"
                class="palette-chip"
                :style="{ '--blk-color': cat.color }"
                draggable="true"
                @dragstart="onPaletteDragStart($event, instantiateDynamicBlock(tpl))"
                @dragend="onDragEnd"
                @click="addBlockToStack(instantiateDynamicBlock(tpl))"
              >
                {{ tpl.label }}
              </div>
            </div>
          </template>

          <!-- Seção I: Listas -->
          <template v-else-if="cat.key === 'lists'">
            <button type="button" class="btn-create-dynamic" @click="activeModal = 'list'">
              + Criar uma Lista
            </button>

            <div v-if="definitions.lists.length > 0" class="dynamic-monitors">
              <label v-for="l in definitions.lists" :key="l.id" class="monitor-chip">
                <input v-model="l.monitored" type="checkbox" @change="isSavedInSqlite = false" />
                <span class="var-pill" :style="{ backgroundColor: cat.color }">{{ l.name }}</span>
                <small>[{{ l.items.length }}]</small>
              </label>
            </div>

            <div class="section-blocks">
              <div
                v-for="(tpl, i) in dynamicListBlocks"
                :key="i"
                class="palette-chip"
                :class="`chip-${tpl.shape ?? 'stack'}`"
                :style="{ '--blk-color': cat.color }"
                draggable="true"
                @dragstart="onPaletteDragStart($event, instantiateDynamicBlock(tpl))"
                @dragend="onDragEnd"
                @click="addBlockToStack(instantiateDynamicBlock(tpl))"
              >
                {{ tpl.label }}
              </div>
            </div>
          </template>

          <!-- Seção J: Meus Blocos -->
          <template v-else-if="cat.key === 'my_blocks'">
            <button type="button" class="btn-create-dynamic" @click="activeModal = 'custom_block'">
              + Criar um Bloco
            </button>

            <div class="section-blocks">
              <div
                v-for="def in definitions.customBlocks"
                :key="def.id"
                class="palette-chip"
                :style="{ '--blk-color': cat.color }"
                draggable="true"
                @dragstart="
                  onPaletteDragStart(
                    $event,
                    instantiateDynamicBlock({
                      category: 'my_blocks',
                      opcode: 'my_block_call',
                      shape: 'stack',
                      label: def.name,
                      customBlockId: def.id,
                    })
                  )
                "
                @dragend="onDragEnd"
                @click="
                  addBlockToStack(
                    instantiateDynamicBlock({
                      category: 'my_blocks',
                      opcode: 'my_block_call',
                      shape: 'stack',
                      label: def.name,
                      customBlockId: def.id,
                    })
                  )
                "
              >
                {{ def.name }}
                <span v-for="seg in def.segments" :key="seg.id" class="cb-mini-arg">
                  {{ seg.kind === 'label' ? seg.text : seg.kind === 'boolean' ? `<${seg.text}>` : `(${seg.text})` }}
                </span>
              </div>
            </div>
          </template>
        </section>
      </div>
    </aside>

    <!-- Área de Programação (Canvas) -->
    <div
      class="block-canvas"
      @dragover="onCanvasDragOver"
      @drop="onDropAt($event, dropTargetIndex ?? scriptStack.length)"
    >
      <div class="canvas-hud">
        <span>
          Canvas Principal · Motores <strong>{{ robotConfig.left_motor_port }}+{{ robotConfig.right_motor_port }}</strong>
          ({{ degreesPerCm }}°/cm) · <em>Arraste blocos, C-Blocks ou slots</em>
        </span>
        <span v-if="compileDiagnostics.length > 0" class="diag-badge">
          ⚠️ {{ compileDiagnostics[0].message }}
        </span>
      </div>

      <div class="block-stack-container">
        <template v-for="(blk, idx) in scriptStack" :key="blk.id">
          <div
            class="snap-zone"
            :class="{ active: dropTargetIndex === idx }"
            @dragover="onSlotDragOver($event, idx)"
            @drop="onDropAt($event, idx)"
          >
            <span v-if="dropTargetIndex === idx" class="snap-hint">Encaixar aqui</span>
          </div>

          <CanvasBlockNode
            :block="blk"
            :index="idx"
            :is-executing="activeBlockIndex === idx"
            @remove="removeBlock"
            @drag-start="onCanvasDragStart"
            @drop-child="onDropChild"
            @drop-slot="onDropSlot"
            @clear-slot="onClearSlot"
            @open-new-message="activeModal = 'message'"
          />
        </template>

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

    <BlockCreationModals
      :modal-kind="activeModal"
      @close="activeModal = null"
      @create-variable="handleCreateVariable"
      @create-list="handleCreateList"
      @create-message="handleCreateMessage"
      @create-custom-block="handleCreateCustomBlock"
    />
  </div>
</template>

<style scoped>
.block-editor-root {
  display: flex;
  width: 100%;
  height: 100%;
}
.spike-sidebar {
  width: 310px;
  background: #181c26;
  border-right: 1px solid #2b3142;
  display: flex;
}
.category-rail {
  width: 78px;
  background: #14171f;
  border-right: 1px solid #252b3b;
  padding: 8px 5px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
}
.cat-item {
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 3px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 9.5px;
  text-align: center;
}
.cat-item.selected {
  background: #23293a;
  border-color: #3b4254;
  color: #fff;
  font-weight: 700;
}
.cat-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
}
.palette-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.palette-top-badge {
  font-size: 11px;
  color: #94a3b8;
  padding-bottom: 6px;
  border-bottom: 1px solid #252b3b;
}
.palette-top-badge strong {
  color: #93c5fd;
}
.palette-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
  scroll-margin-top: 8px;
}
.section-title {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  border-left: 4px solid #3b82f6;
  padding-left: 8px;
}
.section-blocks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.palette-chip {
  background: var(--blk-color);
  color: #fff;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: grab;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.palette-chip.chip-hat {
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
}
.palette-chip.chip-reporter {
  border-radius: 999px;
}
.palette-chip.chip-boolean {
  clip-path: polygon(10px 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0% 50%);
  padding: 7px 14px;
}
.btn-create-dynamic {
  background: #23293a;
  border: 1px dashed #475569;
  color: #f8fafc;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.btn-create-dynamic:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}
.dynamic-monitors {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.monitor-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
}
.var-pill {
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
  font-weight: 700;
  font-size: 11px;
}
.cb-mini-arg {
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
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
  height: 40px;
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
</style>
