<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listProjects, createProject, type ProjectRecord } from '../services/database';
import { useWorkspaceStore } from '../stores/workspace.store';

const workspaceStore = useWorkspaceStore();
const projects = ref<ProjectRecord[]>([]);
const searchQuery = ref('');
const newProjectName = ref('');
const newProjectDimension = ref<'2D' | '3D'>('2D');
const showCreateModal = ref(false);

onMounted(async () => {
  projects.value = await listProjects();
});

async function handleCreateProject() {
  if (!newProjectName.value.trim()) return;
  const created = await createProject(
    newProjectName.value.trim(),
    'Projeto robótico educacional criado no Hub.',
    newProjectDimension.value
  );
  projects.value.unshift(created);
  showCreateModal.value = false;
  newProjectName.value = '';
  workspaceStore.openProject(created);
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
          placeholder="Buscar projetos (.robo)..."
          class="search-input"
        />
        <button class="btn-primary" @click="showCreateModal = true">
          + Novo Projeto
        </button>
      </div>
    </header>

    <main class="hub-content">
      <aside class="hub-sidebar">
        <div class="sidebar-group">
          <small>NAVEGAÇÃO</small>
          <button class="nav-btn active">📂 Projetos Recentes</button>
          <button class="nav-btn">🧩 Templates LEGO Spike</button>
          <button class="nav-btn">🏆 Desafios & Missões</button>
        </div>

        <div class="gamification-card">
          <small>SEU PROGRESSO</small>
          <strong>⭐ 12 Desafios Concluídos</strong>
          <span>🔥 Sequência ativa de 5 dias</span>
        </div>
      </aside>

      <section class="projects-grid">
        <article
          v-for="proj in projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))"
          :key="proj.id"
          class="project-card"
          @click="workspaceStore.openProject(proj)"
        >
          <div class="card-thumb">
            <span class="badge-dim">{{ proj.dimension }}</span>
            <span class="badge-robot">{{ proj.robot_model }}</span>
          </div>
          <div class="card-body">
            <h3>{{ proj.name }}</h3>
            <p>{{ proj.description }}</p>
            <div class="card-footer">
              <span>Rev #{{ proj.revision }}</span>
              <span class="open-link">Abrir no Workspace →</span>
            </div>
          </div>
        </article>
      </section>
    </main>

    <!-- Modal de Novo Projeto -->
    <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
      <div class="modal-box">
        <h2>Novo Projeto Robótico</h2>
        <label>
          Nome do Projeto
          <input v-model="newProjectName" placeholder="Ex: Desafio Labirinto Autônomo" />
        </label>
        <label>
          Modo de Simulação Padrão
          <div class="dim-selector">
            <button :class="{ active: newProjectDimension === '2D' }" @click="newProjectDimension = '2D'">
              Arena 2D (Top-Down)
            </button>
            <button :class="{ active: newProjectDimension === '3D' }" @click="newProjectDimension = '3D'">
              Arena 3D (Perspectiva)
            </button>
          </div>
        </label>
        <div class="modal-actions">
          <button class="btn-ghost" @click="showCreateModal = false">Cancelar</button>
          <button class="btn-primary" @click="handleCreateProject">Criar & Abrir</button>
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
  gap: 4px;
  font-size: 12px;
}
.projects-grid {
  flex: 1;
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 18px;
  align-content: start;
  overflow-y: auto;
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
  height: 110px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
}
.modal-box {
  background: #1c202b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 24px;
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.modal-box label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.modal-box input {
  background: #11141c;
  border: 1px solid #334155;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
}
.dim-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dim-selector button {
  padding: 8px;
  background: #11141c;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 6px;
  cursor: pointer;
}
.dim-selector button.active {
  background: #3b82f6;
  color: #fff;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-ghost {
  background: transparent;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
}
</style>

