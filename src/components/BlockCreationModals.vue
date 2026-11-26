<script setup lang="ts">
import { ref, watch } from 'vue';
import type { CustomBlockSegment } from '../types/blocks';

export type ModalKind = 'variable' | 'list' | 'message' | 'custom_block' | null;

interface Props {
  modalKind: ModalKind;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'create-variable', name: string): void;
  (e: 'create-list', name: string): void;
  (e: 'create-message', name: string): void;
  (e: 'create-custom-block', payload: { name: string; segments: CustomBlockSegment[] }): void;
}>();

const simpleName = ref('');
const customBlockName = ref('nome do bloco');
const segments = ref<CustomBlockSegment[]>([]);

watch(
  () => props.modalKind,
  (kind) => {
    if (kind === 'variable' || kind === 'list' || kind === 'message') {
      simpleName.value = '';
    } else if (kind === 'custom_block') {
      customBlockName.value = 'nome do bloco';
      segments.value = [];
    }
  }
);

function submitSimple() {
  const val = simpleName.value.trim();
  if (!val) return;
  if (props.modalKind === 'variable') emit('create-variable', val);
  else if (props.modalKind === 'list') emit('create-list', val);
  else if (props.modalKind === 'message') emit('create-message', val);
  emit('close');
}

function addSegment(kind: 'value' | 'boolean' | 'label') {
  const count = segments.value.filter((s) => s.kind === kind).length + 1;
  const defaultText =
    kind === 'value' ? `entrada${count}` : kind === 'boolean' ? `condição${count}` : 'rótulo';
  segments.value.push({
    id: `seg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind,
    text: defaultText,
  });
}

function removeSegment(id: string) {
  segments.value = segments.value.filter((s) => s.id !== id);
}

function submitCustomBlock() {
  emit('create-custom-block', {
    name: customBlockName.value.trim() || 'nome do bloco',
    segments: segments.value.map((s) => ({ ...s })),
  });
  emit('close');
}
</script>

<template>
  <div v-if="modalKind" class="modal-backdrop" @click.self="emit('close')">
    <!-- Modal: Nova Variável / Nova Lista / Nova Mensagem -->
    <div v-if="modalKind !== 'custom_block'" class="modal-card">
      <h3>
        {{
          modalKind === 'variable'
            ? 'Nova Variável'
            : modalKind === 'list'
              ? 'Nova Lista'
              : 'Nova Mensagem'
        }}
      </h3>
      <label class="field-label">
        <span>
          {{
            modalKind === 'variable'
              ? 'Nome da nova variável:'
              : modalKind === 'list'
                ? 'Nome da nova lista:'
                : 'Nome da nova mensagem:'
          }}
        </span>
        <input
          v-model="simpleName"
          type="text"
          autofocus
          :placeholder="modalKind === 'variable' ? 'Ex: teste' : modalKind === 'list' ? 'Ex: teste lista' : 'Ex: iniciar_missao'"
          @keyup.enter="submitSimple"
        />
      </label>
      <div class="modal-footer">
        <button type="button" class="btn-cancel" @click="emit('close')">CANCELAR</button>
        <button type="button" class="btn-ok" :disabled="!simpleName.trim()" @click="submitSimple">
          OK
        </button>
      </div>
    </div>

    <!-- Modal: Fazer um bloco (Meus Blocos) -->
    <div v-else class="modal-card wide">
      <h3>Fazer um bloco</h3>

      <div class="block-preview-stage">
        <div class="custom-block-pill">
          <input v-model="customBlockName" class="cb-name-input" />
          <div v-for="seg in segments" :key="seg.id" class="cb-segment">
            <span v-if="seg.kind === 'value'" class="seg-chip pill">
              <input v-model="seg.text" class="seg-input" />
            </span>
            <span v-else-if="seg.kind === 'boolean'" class="seg-chip hex">
              <input v-model="seg.text" class="seg-input" />
            </span>
            <span v-else class="seg-chip label">
              <input v-model="seg.text" class="seg-input" />
            </span>
            <button
              type="button"
              class="seg-trash"
              title="Remover parâmetro"
              @click="removeSegment(seg.id)"
            >
              🗑
            </button>
          </div>
        </div>
      </div>

      <div class="builder-options">
        <button type="button" class="builder-btn" @click="addSegment('value')">
          <span class="shape-icon pill"></span>
          <strong>Adicionar uma entrada</strong>
          <small>número ou texto</small>
        </button>
        <button type="button" class="builder-btn" @click="addSegment('boolean')">
          <span class="shape-icon hex"></span>
          <strong>Adicionar uma entrada</strong>
          <small>booleano</small>
        </button>
        <button type="button" class="builder-btn" @click="addSegment('label')">
          <span class="shape-icon text">Aa</span>
          <strong>Adicionar um rótulo</strong>
          <small>texto</small>
        </button>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn-cancel" @click="emit('close')">CANCELAR</button>
        <button type="button" class="btn-ok" @click="submitCustomBlock">SALVAR</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  z-index: 80;
}
.modal-card {
  background: #1c202b;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 20px;
  width: 380px;
  max-width: 94vw;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #f8fafc;
}
.modal-card.wide {
  width: 560px;
}
.modal-card h3 {
  font-size: 16px;
  font-weight: 700;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}
.field-label input {
  background: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
}
.block-preview-stage {
  background: #11141c;
  border: 1px solid #283044;
  border-radius: 10px;
  padding: 22px 16px;
  display: flex;
  justify-content: center;
  overflow-x: auto;
}
.custom-block-pill {
  background: #ff4d6d;
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
}
.cb-name-input {
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  border: none;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  width: 130px;
}
.cb-segment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.seg-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: rgba(15, 23, 42, 0.25);
}
.seg-chip.pill {
  border-radius: 999px;
  background: #ffffff;
}
.seg-chip.hex {
  clip-path: polygon(8px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0% 50%);
  background: rgba(15, 23, 42, 0.5);
  padding: 3px 12px;
}
.seg-chip.label {
  border-radius: 6px;
}
.seg-input {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 11px;
  font-weight: 700;
  width: 72px;
  text-align: center;
  outline: none;
}
.seg-chip.pill .seg-input {
  color: #0f172a;
}
.seg-trash {
  background: rgba(0, 0, 0, 0.25);
  border: none;
  color: #fff;
  border-radius: 4px;
  padding: 2px 5px;
  cursor: pointer;
  font-size: 11px;
}
.builder-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.builder-btn {
  background: #161a24;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 10px;
  padding: 12px 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}
.builder-btn:hover {
  border-color: #ff4d6d;
  background: #1e2330;
}
.builder-btn strong {
  font-size: 11px;
}
.builder-btn small {
  font-size: 10px;
  color: #94a3b8;
}
.shape-icon {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 20px;
  background: #ff4d6d;
  font-size: 11px;
  font-weight: 700;
}
.shape-icon.pill {
  border-radius: 999px;
}
.shape-icon.hex {
  clip-path: polygon(7px 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 7px 100%, 0% 50%);
}
.shape-icon.text {
  border-radius: 5px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn-cancel {
  background: transparent;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-ok {
  background: #3b82f6;
  border: none;
  color: #fff;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.btn-ok:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
