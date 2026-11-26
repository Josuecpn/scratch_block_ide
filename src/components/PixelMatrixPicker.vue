<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

interface Props {
  modelValue: string; // 25 caracteres '0' ou '1'
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const popoverStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' });

function cells(): boolean[] {
  const s = (props.modelValue || '0000000000000000000000000').padEnd(25, '0');
  return Array.from({ length: 25 }, (_, i) => s[i] === '1');
}

function toggleCell(index: number) {
  const arr = cells();
  arr[index] = !arr[index];
  emit('update:modelValue', arr.map((v) => (v ? '1' : '0')).join(''));
}

function applyPreset(pattern: string) {
  emit('update:modelValue', pattern);
}

function toggleOpen() {
  if (open.value) {
    open.value = false;
    return;
  }
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 170, Math.max(8, rect.left));
    const top = Math.min(window.innerHeight - 190, rect.bottom + 6);
    popoverStyle.value = { top: `${top}px`, left: `${left}px` };
  }
  open.value = true;
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return;
  const target = e.target as Node | null;
  if (
    target &&
    !triggerRef.value?.contains(target) &&
    !popoverRef.value?.contains(target)
  ) {
    open.value = false;
  }
}

function onDocKeyDown(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') {
    open.value = false;
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
</script>

<template>
  <div class="matrix-picker-wrap">
    <button
      ref="triggerRef"
      type="button"
      class="matrix-mini-btn"
      title="Editar Matriz de Pixels 5×5"
      @click.stop="toggleOpen"
    >
      <span class="mini-grid">
        <span
          v-for="(on, idx) in cells()"
          :key="idx"
          class="mini-dot"
          :class="{ on }"
        ></span>
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        class="matrix-popover-floating"
        :style="popoverStyle"
        @click.stop
      >
        <div class="matrix-grid">
          <button
            v-for="(on, idx) in cells()"
            :key="idx"
            type="button"
            class="matrix-cell"
            :class="{ on }"
            @click="toggleCell(idx)"
          ></button>
        </div>
        <div class="matrix-presets">
          <button type="button" @click="applyPreset('0101001010000001000101110')">😊</button>
          <button type="button" @click="applyPreset('0101011111111110111000100')">❤️</button>
          <button type="button" @click="applyPreset('1111111111111111111111111')">Tudo</button>
          <button type="button" @click="applyPreset('0000000000000000000000000')">Limpar</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.matrix-picker-wrap {
  position: relative;
  display: inline-flex;
}
.matrix-mini-btn {
  background: #1e1b4b;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  padding: 3px;
  cursor: pointer;
}
.mini-grid {
  display: grid;
  grid-template-columns: repeat(5, 4px);
  gap: 1.5px;
}
.mini-dot {
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.2);
}
.mini-dot.on {
  background: #fde047;
}
</style>

<style>
.matrix-popover-floating {
  position: fixed;
  z-index: 9999;
  background: #181c26;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.matrix-popover-floating .matrix-grid {
  display: grid;
  grid-template-columns: repeat(5, 22px);
  gap: 4px;
}
.matrix-popover-floating .matrix-cell {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid #334155;
  background: #0f172a;
  cursor: pointer;
}
.matrix-popover-floating .matrix-cell.on {
  background: #facc15;
  border-color: #fde047;
  box-shadow: 0 0 8px rgba(250, 204, 21, 0.6);
}
.matrix-popover-floating .matrix-presets {
  display: flex;
  gap: 4px;
}
.matrix-popover-floating .matrix-presets button {
  flex: 1;
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 5px;
  padding: 3px 5px;
  font-size: 10px;
  cursor: pointer;
}
</style>
