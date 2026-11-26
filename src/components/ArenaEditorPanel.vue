<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace.store';
import type { ArenaObject, ArenaObjectType } from '../services/database';

interface Props {
  selectedObjectId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select-object', id: string | null): void;
}>();

const workspaceStore = useWorkspaceStore();
const { environment, isSavedInSqlite } = storeToRefs(workspaceStore);

const selectedObject = computed<ArenaObject | null>(
  () => environment.value.objects.find((o) => o.id === props.selectedObjectId) ?? null
);

const COLOR_PRESETS = [
  { label: 'Preto', hex: '#111827' },
  { label: 'Vermelho', hex: '#ef4444' },
  { label: 'Verde', hex: '#22c55e' },
  { label: 'Azul', hex: '#3b82f6' },
  { label: 'Amarelo', hex: '#facc15' },
  { label: 'Laranja', hex: '#f97316' },
  { label: 'Cinza', hex: '#64748b' },
];

function addObject(type: ArenaObjectType) {
  const id = `obj-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const defaults: Record<ArenaObjectType, Omit<ArenaObject, 'id'>> = {
    obstacle: {
      type: 'obstacle',
      label: 'Obstáculo',
      x: 120,
      z: 0,
      width: 140,
      depth: 140,
      height: 110,
      rotationDeg: 0,
      color: '#f97316',
    },
    wall: {
      type: 'wall',
      label: 'Parede',
      x: 0,
      z: 180,
      width: 420,
      depth: 45,
      height: 140,
      rotationDeg: 0,
      color: '#64748b',
    },
    line: {
      type: 'line',
      label: 'Linha',
      x: 0,
      z: 0,
      width: 500,
      depth: 45,
      height: 2,
      rotationDeg: 0,
      color: '#111827',
    },
    color_zone: {
      type: 'color_zone',
      label: 'Zona de Cor',
      x: -180,
      z: 180,
      width: 180,
      depth: 180,
      height: 3,
      rotationDeg: 0,
      color: '#22c55e',
    },
  };

  const created: ArenaObject = { id, ...defaults[type] };
  environment.value.objects.push(created);
  isSavedInSqlite.value = false;
  emit('select-object', id);
}

function removeSelected() {
  if (!props.selectedObjectId) return;
  environment.value.objects = environment.value.objects.filter(
    (o) => o.id !== props.selectedObjectId
  );
  isSavedInSqlite.value = false;
  emit('select-object', null);
}

function markDirty() {
  isSavedInSqlite.value = false;
}
</script>

<template>
  <div class="arena-editor-bar">
    <div class="add-row">
      <span class="bar-title">Adicionar à Arena:</span>
      <button type="button" class="add-btn" @click="addObject('obstacle')">+ Obstáculo</button>
      <button type="button" class="add-btn" @click="addObject('wall')">+ Parede</button>
      <button type="button" class="add-btn" @click="addObject('line')">+ Linha</button>
      <button type="button" class="add-btn" @click="addObject('color_zone')">+ Zona de Cor</button>
    </div>

    <div v-if="selectedObject" class="inspector-row">
      <label class="mini-field">
        <span>Nome</span>
        <input v-model="selectedObject.label" class="txt-in" @input="markDirty" />
      </label>
      <label class="mini-field">
        <span>X (mm)</span>
        <input v-model.number="selectedObject.x" type="number" step="10" class="num-in" @input="markDirty" />
      </label>
      <label class="mini-field">
        <span>Z (mm)</span>
        <input v-model.number="selectedObject.z" type="number" step="10" class="num-in" @input="markDirty" />
      </label>
      <label class="mini-field">
        <span>Larg</span>
        <input v-model.number="selectedObject.width" type="number" min="20" step="10" class="num-in" @input="markDirty" />
      </label>
      <label class="mini-field">
        <span>Prof</span>
        <input v-model.number="selectedObject.depth" type="number" min="20" step="10" class="num-in" @input="markDirty" />
      </label>
      <label class="mini-field">
        <span>Rot (°)</span>
        <input v-model.number="selectedObject.rotationDeg" type="number" step="15" class="num-in" @input="markDirty" />
      </label>
      <div class="mini-field">
        <span>Cor</span>
        <div class="swatches-inline">
          <button
            v-for="c in COLOR_PRESETS"
            :key="c.hex"
            type="button"
            class="swatch-dot"
            :class="{ active: selectedObject.color === c.hex }"
            :style="{ backgroundColor: c.hex }"
            :title="c.label"
            @click="selectedObject.color = c.hex; markDirty()"
          ></button>
        </div>
      </div>
      <button type="button" class="btn-remove-obj" @click="removeSelected">🗑 Remover</button>
    </div>
    <div v-else class="hint-row">
      Clique em qualquer objeto na arena 3D para selecionar, mover ou editar suas propriedades.
    </div>
  </div>
</template>

<style scoped>
.arena-editor-bar {
  background: #161b26;
  border-bottom: 1px solid #2b3142;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 11px;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.bar-title {
  font-weight: 700;
  color: #94a3b8;
  margin-right: 4px;
}
.add-btn {
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 4px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.add-btn:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}
.inspector-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid #252c3d;
}
.mini-field {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #94a3b8;
}
.txt-in {
  width: 90px;
  background: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.num-in {
  width: 56px;
  background: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 3px 5px;
  border-radius: 4px;
  font-size: 11px;
}
.swatches-inline {
  display: flex;
  gap: 4px;
}
.swatch-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
}
.swatch-dot.active {
  border-color: #38bdf8;
  transform: scale(1.2);
}
.btn-remove-obj {
  margin-left: auto;
  background: #7f1d1d;
  border: 1px solid #dc2626;
  color: #fecaca;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
}
.hint-row {
  color: #64748b;
  font-style: italic;
}
</style>
