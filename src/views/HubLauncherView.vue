<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  listProjects,
  createProject,
  deleteProject,
  type ProjectRecord,
  type RobotKitModel,
  type InitialWorkspaceState,
} from '../services/database';
import { useWorkspaceStore } from '../stores/workspace.store';

const workspaceStore = useWorkspaceStore();
const projects = ref<ProjectRecord[]>([]);
const searchQuery = ref('');
const showCreateModal = ref(false);
const isCreating = ref(false);
const isLoading = ref(false);
const loadError = ref<string | null>(null);

const newProjectName = ref('');
const newProjectInitialState = ref<InitialWorkspaceState>('clean');
const newProjectKit = ref<RobotKitModel>('SPIKE_PRIME');
const newProjectDimension = ref<'2D' | '3D'>('3D');

const filteredProjects = computed(() =>
  projects.value.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.value.trim().toLowerCase())
  )
);

async function refreshProjects() {
  isLoading.value = true;
  loadError.value = null;
  try {
    projects.value = await listProjects();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
    projects.value = [];
  } finally {
    isLoading.value = false;
  }
}

onMounted(async () => {
  await refreshProjects();
});

watch(
  () => workspaceStore.activeScreen,
  (screen) => {
    if (screen === 'hub') {
      void refreshProjects();
    }
  }
);

function formatUpdatedAt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function openModal() {
  newProjectName.value = '';
  newProjectInitialState.value = 'clean';
  newProjectKit.value = 'SPIKE_PRIME';
  newProjectDimension.value = '3D';
  showCreateModal.value = true;
}

async function handleCreateProject() {
  if (!newProjectName.value.trim() || isCreating.value) return;
  isCreating.value = true;
  try {
    const created = await createProject({
      name: newProjectName.value.trim(),
      dimension: newProjectDimension.value,
      robotModel: newProjectKit.value,
      initialState: newProjectInitialState.value,
    });
    projects.value.unshift(created);
    showCreateModal.value = false;
    await workspaceStore.openProject(created);
  } finally {
    isCreating.value = false;
  }
}

async function handleDeleteProject(e: MouseEvent, proj: ProjectRecord) {
  e.stopPropagation();
  if (!window.confirm(`Excluir o projeto "${proj.name}"?`)) return;
  await deleteProject(proj.id);
  projects.value = projects.value.filter((p) => p.id !== proj.id);
}

function kitLabel(model: ProjectRecord['robot_model']): string {
  if (model === 'SPIKE_ESSENTIAL') return 'SPIKE Essencial';
  if (model === 'SPIKE_PRIME') return 'SPIKE Prime';
  return 'Custom';
}
</script>

<template>
  <div class="hub-launcher">
    <header class="hub-topbar">
      <div class="brand">
        <span class="brand-icon">🤖</span>
        <div>
          <h1>RoboBlocks Hub</h1>
          <p>Gerenciador de Projetos · Tauri v2 + SQLite3 Offline-First</p>
        </div>
      </div>

      <div class="hub-actions">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar projetos..."
          class="search-input"
        />
        <button class="btn-primary" @click="openModal">
          + Novo Projeto
        </button>
      </div>
    </header>

    <main class="hub-content">
      <aside class="hub-sidebar">
        <div class="sidebar-group">
          <small>NAVEGAÇÃO</small>
          <button class="nav-btn active">📂 Projetos Salvos ({{ projects.length }})</button>
          <button class="nav-btn" @click="openModal">✨ Criar Novo Projeto</button>
        </div>

        <div class="gamification-card">
          <small>KITS SUPORTADOS</small>
          <strong>🟨 SPIKE Prime (Portas A–F)</strong>
          <span>🟦 SPIKE Essencial (Portas A–B)</span>
        </div>
      </aside>

      <section class="projects-area">
        <div v-if="loadError" class="error-banner">
          <div>
            <strong>Erro ao carregar projetos do SQLite3:</strong>
            <p>{{ loadError }}</p>
          </div>
          <button class="btn-primary" @click="refreshProjects">🔄 Tentar novamente</button>
        </div>

        <div v-if="isLoading" class="empty-state">
          <p>Carregando projetos do banco local...</p>
        </div>

        <div v-else-if="filteredProjects.length === 0 && !loadError" class="empty-state">
          <p>Nenhum projeto encontrado.</p>
          <button class="btn-primary" @click="openModal">+ Criar Primeiro Projeto</button>
        </div>

        <div v-else class="projects-grid">
          <article
            v-for="proj in filteredProjects"
            :key="proj.id"
            class="project-card"
            @click="workspaceStore.openProject(proj)"
          >
            <div class="card-thumb">
              <div class="badges-row">
                <span class="badge-dim">{{ proj.dimension }}</span>
                <span
                  class="badge-robot"
                  :class="{ essential: proj.robot_model === 'SPIKE_ESSENTIAL' }"
                >
                  {{ kitLabel(proj.robot_model) }}
                </span>
              </div>
              <button
                class="btn-delete-card"
                title="Excluir projeto"
                @click="handleDeleteProject($event, proj)"
              >
                🗑
              </button>
            </div>
            <div class="card-body">
              <h3>{{ proj.name }}</h3>
              <p>{{ proj.description }}</p>
              <div class="card-footer">
                <span>Rev #{{ proj.revision }} · {{ formatUpdatedAt(proj.updated_at) }}</span>
                <span class="open-link">Abrir no Workspace →</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>

    <!-- Modal de Novo Projeto -->
    <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
      <div class="modal-box">
        <h2>Novo Projeto Robótico</h2>

        <label class="field-group">
          <span>1. Nome do Projeto</span>
          <input
            v-model="newProjectName"
            placeholder="Ex: Desafio Labirinto Autônomo"
            autofocus
            @keyup.enter="handleCreateProject"
          />
        </label>

        <div class="field-group">
          <span>2. Estado Inicial da Área de Trabalho</span>
          <div class="option-grid">
            <button
              type="button"
              class="option-card"
              :class="{ active: newProjectInitialState === 'clean' }"
              @click="newProjectInitialState = 'clean'"
            >
              <strong>🧹 Área Limpa</strong>
              <small>Começa apenas com o bloco inicial de evento.</small>
            </button>
            <button
              type="button"
              class="option-card"
              :class="{ active: newProjectInitialState === 'example' }"
              @click="newProjectInitialState = 'example'"
            >
              <strong>🧩 Código de Exemplo</strong>
              <small>Robô avança até a zona vermelha, para e acende o LED.</small>
            </button>
          </div>
        </div>

        <div class="field-group">
          <span>3. Tipo / Kit do Projeto (LEGO SPIKE)</span>
          <div class="option-grid">
            <button
              type="button"
              class="option-card kit-essential"
              :class="{ active: newProjectKit === 'SPIKE_ESSENTIAL' }"
              @click="newProjectKit = 'SPIKE_ESSENTIAL'"
            >
              <strong>🟦 Essencial</strong>
              <small>Hub compacto (Portas A–B), ideal para iniciantes.</small>
            </button>
            <button
              type="button"
              class="option-card kit-prime"
              :class="{ active: newProjectKit === 'SPIKE_PRIME' }"
              @click="newProjectKit = 'SPIKE_PRIME'"
            >
              <strong>🟨 Prime</strong>
              <small>Hub completo (Portas A–F), sensores e competições.</small>
            </button>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-ghost" @click="showCreateModal = false">Cancelar</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!newProjectName.trim() || isCreating"
            @click="handleCreateProject"
          >
            {{ isCreating ? 'Criando...' : 'Criar & Abrir' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hub-launcher {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: #12151e;
  color: #e2e8f0;
}
.hub-topbar {
  height: 68px;
  padding: 0 24px;
  background: #181c26;
  border-bottom: 1px solid #283044;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-icon {
  font-size: 28px;
}
.brand h1 {
  font-size: 18px;
  font-weight: 700;
}
.brand p {
  font-size: 12px;
  color: #94a3b8;
}
.hub-actions {
  display: flex;
  gap: 12px;
}
.search-input {
  background: #11141c;
  border: 1px solid #2e364f;
  color: #fff;
  padding: 8px 14px;
  border-radius: 8px;
  width: 260px;
}
.btn-primary {
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.hub-sidebar {
  width: 250px;
  background: #161922;
  border-right: 1px solid #262c3a;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sidebar-group small {
  font-size: 10px;
  color: #64748b;
  font-weight: 700;
}
.nav-btn {
  text-align: left;
  background: transparent;
  border: none;
  color: #cbd5e1;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.nav-btn.active {
  background: #23293a;
  color: #fff;
  font-weight: 600;
}
.gamification-card {
  background: #1c2230;
  border: 1px solid #2e364f;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.projects-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.error-banner {
  background: rgba(127, 29, 29, 0.45);
  border: 1px solid #ef4444;
  color: #fee2e2;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.error-banner p {
  margin-top: 4px;
  color: #fecaca;
}
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #94a3b8;
}
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 18px;
  align-content: start;
}
.project-card {
  background: #1a1f2c;
  border: 1px solid #2b3245;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}
.project-card:hover {
  transform: translateY(-3px);
  border-color: #3b82f6;
}
.card-thumb {
  height: 100px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.badges-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.badge-dim {
  background: #0ea5e9;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}
.badge-robot {
  background: #facc15;
  color: #0f172a;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
}
.badge-robot.essential {
  background: #38bdf8;
  color: #0f172a;
}
.btn-delete-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 6px;
  padding: 3px 7px;
  cursor: pointer;
  font-size: 12px;
}
.btn-delete-card:hover {
  color: #f87171;
  border-color: #ef4444;
}
.card-body {
  padding: 16px;
}
.card-body h3 {
  font-size: 15px;
  margin-bottom: 6px;
}
.card-body p {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 14px;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #60a5fa;
  font-weight: 600;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  z-index: 50;
}
.modal-box {
  background: #1c202b;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 24px;
  width: 500px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.modal-box h2 {
  font-size: 18px;
  font-weight: 700;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
  font-weight: 600;
}
.field-group input {
  background: #11141c;
  border: 1px solid #334155;
  color: #fff;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
}
.option-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.option-card {
  text-align: left;
  padding: 12px;
  background: #11141c;
  border: 1px solid #334155;
  color: #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s, background 0.15s;
}
.option-card strong {
  font-size: 13px;
}
.option-card small {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
}
.option-card.active {
  background: rgba(59, 130, 246, 0.18);
  border-color: #3b82f6;
  color: #fff;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.btn-ghost {
  background: transparent;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}
</style>
