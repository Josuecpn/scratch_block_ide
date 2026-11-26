<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

interface Props {
  modelValue: number; // -100 (esquerda) a +100 (direita)
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', val: number): void;
}>();

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const popoverStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' });

const formattedLabel = computed(() => {
  const v = Number(props.modelValue ?? 0);
  if (v === 0) return 'frente: 0';
  return v > 0 ? `direita: ${v}` : `esquerda: ${Math.abs(v)}`;
});

const needleAngle = computed(() => {
  const v = Math.max(-100, Math.min(100, Number(props.modelValue ?? 0)));
  return (v / 100) * 90;
});

function updateValue(val: number) {
  const clamped = Math.max(-100, Math.min(100, Math.round(val)));
  emit('update:modelValue', clamped);
}

function toggleOpen() {
  if (open.value) {
    open.value = false;
    return;
  }
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 235, Math.max(8, rect.left));
    const top = Math.min(window.innerHeight - 175, rect.bottom + 6);
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
  <div class="dial-picker-wrap">
    <button
      ref="triggerRef"
      type="button"
      class="dial-pill-btn"
      title="Selecionar curva (-100 esquerda a +100 direita)"
      @click.stop="toggleOpen"
    >
      {{ formattedLabel }}
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        class="dial-popover-floating"
        :style="popoverStyle"
        @click.stop
      >
        <div class="dial-header">Curva: {{ formattedLabel }}</div>
        <div class="dial-gauge">
          <svg viewBox="0 0 120 72" class="dial-svg">
            <path d="M 15 62 A 45 45 0 0 1 105 62" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round" />
            <g :transform="`translate(60, 62) rotate(${needleAngle})`">
              <line x1="0" y1="0" x2="0" y2="-40" stroke="#f472b6" stroke-width="3" stroke-linecap="round" />
              <circle cx="0" cy="0" r="5" fill="#fff" />
            </g>
          </svg>
        </div>
        <input
          type="range"
          min="-100"
          max="100"
          step="5"
          :value="modelValue"
          class="dial-slider"
          @input="updateValue(Number(($event.target as HTMLInputElement).value))"
        />
        <div class="dial-presets">
          <button type="button" @click="updateValue(-100)">↺ -100</button>
          <button type="button" @click="updateValue(-30)">↖ -30</button>
          <button type="button" @click="updateValue(0)">↑ 0</button>
          <button type="button" @click="updateValue(30)">↗ +30</button>
          <button type="button" @click="updateValue(100)">↻ +100</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dial-picker-wrap {
  position: relative;
  display: inline-flex;
}
.dial-pill-btn {
  background: #ffffff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.25);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
</style>

<style>
.dial-popover-floating {
  position: fixed;
  z-index: 9999;
  width: 220px;
  background: #181c26;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dial-popover-floating .dial-header {
  font-size: 11px;
  font-weight: 700;
  color: #f8fafc;
  text-align: center;
}
.dial-popover-floating .dial-svg {
  width: 100%;
  height: 66px;
}
.dial-popover-floating .dial-slider {
  width: 100%;
  accent-color: #ec4899;
}
.dial-popover-floating .dial-presets {
  display: flex;
  gap: 3px;
}
.dial-popover-floating .dial-presets button {
  flex: 1;
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 4px;
  padding: 2px 3px;
  font-size: 10px;
  cursor: pointer;
}
</style>
