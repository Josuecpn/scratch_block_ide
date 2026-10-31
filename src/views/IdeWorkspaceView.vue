<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { storeToRefs } from 'pinia';
import {
  useWorkspaceStore,
  type BlockCategoryKey,
  type WorkspaceBlock,
} from '../stores/workspace.store';
import { useSimulationStore } from '../stores/simulation.store';
import { isTauriRuntime, saveCanvasBlocks } from '../services/database';

interface CategorySpec {
  key: BlockCategoryKey;
  label: string;
  color: string;
  icon: string;
}

interface SimStepResponse {
  next_x: number;
  next_y: number;
  next_heading: number;
  left_motor_pct: number;
  right_motor_pct: number;
  log_message: string;
}

const workspaceStore = useWorkspaceStore();
const simulationStore = useSimulationStore();

const {
  currentProject,
  viewMode,
  simDimension,
  splitRatio,
  isSavedInSqlite,
  scriptStack,
} = storeToRefs(workspaceStore);

const { simState, activeBlockIndex, robotPose, sensors } = storeToRefs(simulationStore);

const isDraggingSplitter = ref(false);
const activeBottomTab = ref<'console' | 'python'>('console');

const categories: CategorySpec[] = [
  { key: 'events',    label: 'Eventos',     color: '#F59E0B', icon: '⚡' },
  { key: 'motion',    label: 'Movimento',   color: '#EC4899', icon: '🛞' },
  { key: 'motors',    label: 'Motores',     color: '#3B82F6', icon: '⚙️' },
  { key: 'sensors',   label: 'Sensores',    color: '#06B6D4', icon: '📡' },
  { key: 'control',   label: 'Controle',    color: '#F97316', icon: '🔁' },
  { key: 'operators', label: 'Operadores',  color: '#22C55E', icon: '➗' },
  { key: 'variables', label: 'Variáveis',   color: '#EF4444', icon: '📦' },
];

const selectedCategory = ref<BlockCategoryKey>('motion');

const paletteTemplates: Record<BlockCategoryKey, Omit<WorkspaceBlock, 'id'>[]> = {
  events: [
    { category: 'events', opcode: 'when_program_starts', label: 'Quando o programa iniciar' },
    { category: 'events', opcode: 'when_color_detected', label: 'Quando detectar cor', param: 'Vermelho' },
  ],
  motion: [
    { category: 'motion', opcode: 'move_distance', label: 'Mover para frente por', param: 20, unit: 'cm' },
    { category: 'motion', opcode: 'turn_degrees', label: 'Girar à direita por', param: 90, unit: 'graus' },
    { category: 'motion', opcode: 'set_move_speed', label: 'Definir velocidade de movimento para', param: 60, unit: '%' },
  ],
  motors: [
    { category: 'motors', opcode: 'motor_run_rotations', label: 'Motor Porta A girar por', param: 1, unit: 'rotações' },
  ],
  sensors: [
    { category: 'sensors', opcode: 'dist_less_than', label: 'Distância (Porta D) <', param: 15, unit: 'cm' },
    { category: 'sensors', opcode: 'color_is', label: 'Sensor de Cor (Porta C) é', param: 'Preto' },
  ],
  control: [
    { category: 'control', opcode: 'wait_seconds', label: 'Esperar', param: 1, unit: 'segundos' },
    { category: 'control', opcode: 'repeat_times', label: 'Repetir', param: 4, unit: 'vezes' },
  ],
  operators: [
    { category: 'operators', opcode: 'math_add', label: 'Somar valores A + B', param: 10 },
  ],
  variables: [
    { category: 'variables', opcode: 'set_var', label: 'Definir [velocidade] para', param: 50 },
  ],
};

const logs = ref<string[]>([
  '[SQLite3] Banco local sqlite:roboblocks.db inicializado (WAL mode ativo).',
  `[Workspace] Projeto ativo: ${currentProject.value.name}`,
]);

let simInterval: ReturnType<typeof setInterval> | null = null;

function getCategoryColor(cat: BlockCategoryKey): string {
  return categories.find((c) => c.key === cat)?.color ?? '#64748B';
}

function addBlockToStack(tpl: Omit<WorkspaceBlock, 'id'>) {
  scriptStack.value.push({
    ...tpl,
    id: `blk-${Date.now()}`,
  });
  isSavedInSqlite.value = false;
  logs.value.push(`[Canvas] Bloco '${tpl.opcode}' conectado na pilha.`);
}

function removeBlock(id: string) {
  if (simState.value !== 'Idle') return;
  scriptStack.value = scriptStack.value.filter((b) => b.id !== id);
  isSavedInSqlite.value = false;
}

async function handleSaveSqlite() {
  const payload = scriptStack.value.map((b, idx) => ({
    id: b.id,
    opcode: b.opcode,
    category: b.category,
    x: 40,
    y: idx * 48,
    nextId: scriptStack.value[idx + 1]?.id ?? null,
    fields: { param: b.param, unit: b.unit },
  }));

  await saveCanvasBlocks('canvas-demo-01', payload);
  isSavedInSqlite.value = true;
  logs.value.push(`[SQLite3] ${payload.length} blocos salvos com sucesso em 'blocks'.`);
}

async function executeCurrentBlockStep(blk: WorkspaceBlock) {
  if (isTauriRuntime()) {
    try {
      const res = await invoke<SimStepResponse>('simulate_block_step', {
        req: {
          opcode: blk.opcode,
          param: blk.param !== undefined ? Number(blk.param) : null,
          current_x: robotPose.value.x,
          current_y: robotPose.value.y,
          current_heading: robotPose.value.heading,
        },
      });
      robotPose.value.x = res.next_x;
      robotPose.value.y = res.next_y;
      robotPose.value.heading = res.next_heading;
      sensors.value.portA_leftMotor = res.left_motor_pct;
      sensors.value.portB_rightMotor = res.right_motor_pct;
      sensors.value.imuYawDeg = res.next_heading;
      logs.value.push(res.log_message);
      return;
    } catch {
      // Fallback para cálculo local se fora do Tauri
    }
  }

  if (blk.opcode === 'move_distance') {
    const distPx = Number(blk.param ?? 20) * 2.2;
    const rad = (robotPose.value.heading * Math.PI) / 180;
    robotPose.value.x = Math.min(420, Math.max(40, robotPose.value.x + Math.cos(rad) * distPx));
    robotPose.value.y = Math.min(260, Math.max(40, robotPose.value.y + Math.sin(rad) * distPx));
    sensors.value.portA_leftMotor = 60;
    sensors.value.portB_rightMotor = 60;
    sensors.value.portD_distanceCm = Math.max(5, +(sensors.value.portD_distanceCm - 6.5).toFixed(1));
  } else if (blk.opcode === 'turn_degrees') {
    robotPose.value.heading = (robotPose.value.heading + Number(blk.param ?? 90)) % 360;
    sensors.value.imuYawDeg = robotPose.value.heading;
  } else {
    sensors.value.portA_leftMotor = 0;
    sensors.value.portB_rightMotor = 0;
  }
  logs.value.push(
    `[VM -> Sim] Executando (${blk.opcode}) | Pose=(${Math.round(robotPose.value.x)}, ${Math.round(robotPose.value.y)}, ${robotPose.value.heading}°)`
  );
}

function playSimulation() {
  if (scriptStack.value.length === 0) return;

  if (simState.value === 'Idle') {
    simState.value = 'Compiling';
    logs.value.push('[Compiler] Traduzindo grafo de blocos para IR/Bytecode...');
    setTimeout(() => {
      simState.value = 'Executing';
      activeBlockIndex.value = 0;
      void executeCurrentBlockStep(scriptStack.value[0]);
      startLoop();
    }, 250);
    return;
  }

  if (simState.value === 'Paused') {
    simState.value = 'Executing';
    startLoop();
  }
}

function startLoop() {
  stopLoop();
  simInterval = setInterval(() => {
    if (activeBlockIndex.value === null) return;
    if (activeBlockIndex.value + 1 < scriptStack.value.length) {
      activeBlockIndex.value++;
      void executeCurrentBlockStep(scriptStack.value[activeBlockIndex.value]);
    } else {
      logs.value.push('[VM] Programa finalizado com sucesso.');
      stopLoop();
      simState.value = 'Idle';
      activeBlockIndex.value = null;
      sensors.value.portA_leftMotor = 0;
      sensors.value.portB_rightMotor = 0;
    }
  }, 850);
}

function pauseSimulation() {
  if (simState.value === 'Executing') {
    stopLoop();
    simState.value = 'Paused';
    logs.value.push('[Sim] Execução pausada pelo usuário.');
  }
}

function stepSimulation() {
  stopLoop();
  simState.value = 'Paused';
  if (activeBlockIndex.value === null) {
    activeBlockIndex.value = 0;
  } else if (activeBlockIndex.value + 1 < scriptStack.value.length) {
    activeBlockIndex.value++;
  } else {
    activeBlockIndex.value = 0;
  }
  void executeCurrentBlockStep(scriptStack.value[activeBlockIndex.value]);
}

function resetSimulation() {
  stopLoop();
  simulationStore.resetRobot();
  logs.value.push('[Sim] Arena e robô reposicionados para a pose inicial.');
}

function stopLoop() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

const generatedPythonCode = computed(() => {
  const lines = [
    '# Código MicroPython gerado automaticamente (LEGO Spike Prime)',
    'from hub import port, motion_sensor',
    'import runloop, motor_pair',
    '',
    'async def main():',
    '    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)',
  ];
  for (const b of scriptStack.value) {
    if (b.opcode === 'set_move_speed') lines.push(`    velocidade = ${b.param}`);
    if (b.opcode === 'move_distance')  lines.push(`    await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${Number(b.param) * 20}, 0)`);
    if (b.opcode === 'turn_degrees')   lines.push(`    await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${Number(b.param) * 2}, 100)`);
    if (b.opcode === 'wait_seconds')   lines.push(`    await runloop.sleep_ms(${Number(b.param) * 1000})`);
  }
  lines.push('', 'runloop.run(main())');
  return lines.join('\n');
});

function onSplitterMouseDown() {
  isDraggingSplitter.value = true;
  window.addEventListener('mousemove', onSplitterMouseMove);
  window.addEventListener('mouseup', onSplitterMouseUp);
}
function onSplitterMouseMove(e: MouseEvent) {
  if (!isDraggingSplitter.value) return;
  const pct = (e.clientX / window.innerWidth) * 100;
  splitRatio.value = Math.min(75, Math.max(28, pct));
}
function onSplitterMouseUp() {
  isDraggingSplitter.value = false;
  window.removeEventListener('mousemove', onSplitterMouseMove);
  window.removeEventListener('mouseup', onSplitterMouseUp);
}

onUnmounted(() => stopLoop());
</script>

<template>
  <div class="ide-shell">
    <!-- ══════════ 1. TOP TOOLBAR (Inspirada na Godot Engine) ══════════ -->
    <header class="top-toolbar">
      <div class="toolbar-left">
        <button class="btn-hub" title="Voltar ao Gerenciador de Projetos" @click="workspaceStore.backToHub()">
          ◀ Hub
        </button>
        <div class="project-badge">
          <span class="dot-online"></span>
          <strong>{{ currentProject.name }}</strong>
          <span class="badge-tag">{{ currentProject.robot_model }}</span>
        </div>
      </div>

      <!-- Seletor Central de Workspace (Abas / Split-Screen) -->
      <nav class="mode-switcher">
        <button :class="{ active: viewMode === 'script' }" @click="viewMode = 'script'">
          🧩 Blocos
        </button>
        <button :class="{ active: viewMode === 'split' }" @click="viewMode = 'split'">
          ⇆ Split-Screen
        </button>
        <button :class="{ active: viewMode === 'simulator' }" @click="viewMode = 'simulator'">
          🌐 Simulador
        </button>
      </nav>

      <!-- Controles Globais de Execução + Persistência SQLite -->
      <div class="toolbar-right">
        <span class="state-pill" :data-state="simState">
          {{ simState }}
        </span>

        <div class="sim-controls">
          <button class="ctrl-btn play" :disabled="simState === 'Executing'" @click="playSimulation" title="Executar (F5)">
            ▶ Play
          </button>
          <button class="ctrl-btn pause" :disabled="simState !== 'Executing'" @click="pauseSimulation" title="Pausar (F6)">
            ⏸
          </button>
          <button class="ctrl-btn step" @click="stepSimulation" title="Passo a Passo (F10)">
            ⏭ Step
          </button>
          <button class="ctrl-btn reset" @click="resetSimulation" title="Reiniciar Robô (Ctrl+R)">
            ⟲
          </button>
        </div>

        <button class="btn-save" @click="handleSaveSqlite">
          💾 {{ isSavedInSqlite ? 'Salvo (SQLite)' : 'Salvar*' }}
        </button>
      </div>
    </header>

    <!-- ══════════ 2. ÁREA CENTRAL DE DESENVOLVIMENTO (SPLIT-SCREEN) ══════════ -->
    <main class="workspace-body">
      <!-- ── PAINEL ESQUERDO: PROGRAMAÇÃO EM BLOCOS (LEGO SPIKE) ── -->
      <section
        v-show="viewMode === 'split' || viewMode === 'script'"
        class="panel-blocks"
        :style="{ width: viewMode === 'split' ? `${splitRatio}%` : '100%' }"
      >
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
              {{ categories.find(c => c.key === selectedCategory)?.label }}
            </header>
            <div class="drawer-list">
              <div
                v-for="tpl in paletteTemplates[selectedCategory]"
                :key="tpl.opcode"
                class="block-chip"
                :style="{ '--blk-color': getCategoryColor(tpl.category) }"
                @click="addBlockToStack(tpl)"
              >
                <span>{{ tpl.label }}</span>
                <strong v-if="tpl.param !== undefined" class="chip-input">{{ tpl.param }}</strong>
                <small v-if="tpl.unit">{{ tpl.unit }}</small>
              </div>
            </div>
          </div>
        </aside>

        <div class="block-canvas">
          <div class="canvas-hud">
            <span>Canvas Principal · Clique em um bloco da paleta para encaixar</span>
          </div>

          <div class="block-stack-container">
            <div
              v-for="(blk, idx) in scriptStack"
              :key="blk.id"
              class="puzzle-block"
              :class="{
                'is-hat': blk.category === 'events',
                'is-executing': activeBlockIndex === idx
              }"
              :style="{ '--blk-color': getCategoryColor(blk.category) }"
            >
              <div class="block-content">
                <span class="block-index">#{{ idx + 1 }}</span>
                <span class="block-text">{{ blk.label }}</span>
                <input
                  v-if="blk.param !== undefined"
                  v-model="blk.param"
                  class="block-field-input"
                  @input="isSavedInSqlite = false"
                />
                <span v-if="blk.unit" class="block-unit">{{ blk.unit }}</span>
                <button
                  v-if="idx > 0"
                  class="block-remove"
                  title="Remover bloco"
                  @click="removeBlock(blk.id)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Divisor Redimensionável (Splitter) -->
      <div
        v-show="viewMode === 'split'"
        class="dock-splitter"
        @mousedown="onSplitterMouseDown"
      ></div>

      <!-- ── PAINEL DIREITO: SIMULADOR 2D/3D E TELEMETRIA DE SENSORES ── -->
      <section
        v-show="viewMode === 'split' || viewMode === 'simulator'"
        class="panel-simulator"
        :style="{ width: viewMode === 'split' ? `${100 - splitRatio}%` : '100%' }"
      >
        <div class="sim-header">
          <span>Arena Virtual · Tapete Seguidor de Linha</span>
          <div class="dim-toggle">
            <button :class="{ active: simDimension === '2D' }" @click="simDimension = '2D'">2D Top-Down</button>
            <button :class="{ active: simDimension === '3D' }" @click="simDimension = '3D'">3D Orbit</button>
          </div>
        </div>

        <div class="sim-viewport" :class="{ 'mode-3d': simDimension === '3D' }">
          <svg viewBox="0 0 480 300" class="arena-svg">
            <rect x="60" y="60" width="360" height="180" rx="45" fill="none" stroke="#111827" stroke-width="16" />
            <rect x="60" y="60" width="360" height="180" rx="45" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 6" />
            <rect x="370" y="135" width="28" height="28" rx="4" fill="#EF4444" />

            <g :transform="`translate(${robotPose.x}, ${robotPose.y}) rotate(${robotPose.heading})`">
              <line x1="20" y1="0" x2="75" y2="0" stroke="#06B6D4" stroke-width="2" stroke-dasharray="4 3" />
              <rect x="-16" y="-22" width="32" height="6" rx="2" fill="#1F2937" />
              <rect x="-16" y="16" width="32" height="6" rx="2" fill="#1F2937" />
              <rect x="-20" y="-16" width="40" height="32" rx="6" fill="#FACC15" stroke="#CA8A04" stroke-width="2" />
              <polygon points="10,-7 20,0 10,7" fill="#0F172A" />
            </g>
          </svg>
        </div>

        <div class="sensor-inspector">
          <div class="sensor-card">
            <small>PORTA A · MOTOR ESQ</small>
            <strong>{{ sensors.portA_leftMotor }}%</strong>
          </div>
          <div class="sensor-card">
            <small>PORTA B · MOTOR DIR</small>
            <strong>{{ sensors.portB_rightMotor }}%</strong>
          </div>
          <div class="sensor-card">
            <small>PORTA C · COR</small>
            <strong>{{ sensors.portC_color }}</strong>
          </div>
          <div class="sensor-card">
            <small>PORTA D · DISTÂNCIA</small>
            <strong>{{ sensors.portD_distanceCm }} cm</strong>
          </div>
          <div class="sensor-card">
            <small>GIROSCÓPIO (YAW)</small>
            <strong>{{ sensors.imuYawDeg }}°</strong>
          </div>
        </div>
      </section>
    </main>

    <!-- ══════════ 3. PAINEL INFERIOR: CONSOLE & CÓDIGO PYTHON GERADO ══════════ -->
    <footer class="bottom-dock">
      <div class="dock-tabs">
        <button :class="{ active: activeBottomTab === 'console' }" @click="activeBottomTab = 'console'">
          🖥 Console de Execução ({{ logs.length }})
        </button>
        <button :class="{ active: activeBottomTab === 'python' }" @click="activeBottomTab = 'python'">
          🐍 Código MicroPython Gerado
        </button>
        <span class="dock-status">SQLite3 WAL · 60 FPS · Tauri v2 IPC Ready</span>
      </div>

      <div class="dock-content">
        <div v-if="activeBottomTab === 'console'" class="console-lines">
          <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
        </div>
        <pre v-else class="python-preview"><code>{{ generatedPythonCode }}</code></pre>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.ide-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #14171f;
  color: #e2e8f0;
  user-select: none;
  overflow: hidden;
}
.top-toolbar {
  height: 48px;
  background: #1c202b;
  border-bottom: 1px solid #2b3142;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
}
.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-hub {
  background: #262c3a;
  color: #cbd5e1;
  border: 1px solid #363f54;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.project-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.dot-online {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}
.badge-tag {
  background: #312e81;
  color: #c7d2fe;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}
.mode-switcher {
  display: flex;
  background: #11141c;
  padding: 3px;
  border-radius: 8px;
  border: 1px solid #2b3142;
}
.mode-switcher button {
  background: transparent;
  color: #94a3b8;
  border: none;
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.mode-switcher button.active {
  background: #3b82f6;
  color: #ffffff;
}
.state-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  background: #262c3a;
  color: #94a3b8;
}
.state-pill[data-state="Executing"] {
  background: #14532d;
  color: #4ade80;
}
.state-pill[data-state="Paused"] {
  background: #713f12;
  color: #facc15;
}
.sim-controls {
  display: flex;
  gap: 4px;
}
.ctrl-btn {
  border: 1px solid #334155;
  background: #1e293b;
  color: #f8fafc;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.ctrl-btn.play {
  background: #16a34a;
  border-color: #22c55e;
  font-weight: 600;
}
.ctrl-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-save {
  background: #262c3a;
  border: 1px solid #3b4254;
  color: #e2e8f0;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.panel-blocks {
  display: flex;
  height: 100%;
}
.spike-sidebar {
  width: 280px;
  background: #181c26;
  border-right: 1px solid #2b3142;
  display: flex;
}
.category-rail {
  width: 82px;
  background: #13161f;
  border-right: 1px solid #262c3a;
  display: flex;
  flex-direction: column;
  padding: 8px 4px;
  gap: 6px;
}
.cat-item {
  background: transparent;
  border: none;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 10px;
}
.cat-item.selected {
  background: #23293a;
  color: #ffffff;
  font-weight: 600;
}
.cat-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
}
.palette-drawer {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}
.drawer-header {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  margin-bottom: 10px;
  font-weight: 700;
}
.drawer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.block-chip {
  background: var(--blk-color);
  color: #fff;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  box-shadow: 0 2px 0 rgba(0,0,0,0.3);
}
.chip-input {
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 6px;
  border-radius: 999px;
}
.block-canvas {
  flex: 1;
  background-color: #11141c;
  background-image: radial-gradient(#293042 1px, transparent 1px);
  background-size: 20px 20px;
  position: relative;
  padding: 24px;
  overflow: auto;
}
.canvas-hud {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 18px;
}
.block-stack-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.puzzle-block {
  background: var(--blk-color);
  color: #ffffff;
  min-width: 280px;
  padding: 11px 14px;
  border-radius: 8px;
  margin-bottom: 3px;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}
.puzzle-block.is-hat {
  border-top-left-radius: 22px;
  border-top-right-radius: 16px;
}
.puzzle-block.is-executing {
  outline: 3px solid #facc15;
  box-shadow: 0 0 18px rgba(250, 204, 21, 0.65);
  transform: translateX(4px);
}
.block-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.block-index {
  font-size: 10px;
  opacity: 0.75;
}
.block-field-input {
  width: 52px;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  border-radius: 999px;
  padding: 2px 8px;
  text-align: center;
  font-weight: 700;
}
.block-remove {
  margin-left: auto;
  background: rgba(0,0,0,0.25);
  border: none;
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
}
.dock-splitter {
  width: 5px;
  background: #23293a;
  cursor: col-resize;
}
.dock-splitter:hover {
  background: #3b82f6;
}
.panel-simulator {
  display: flex;
  flex-direction: column;
  background: #161922;
}
.sim-header {
  height: 38px;
  padding: 0 14px;
  background: #1c202b;
  border-bottom: 1px solid #2b3142;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}
.dim-toggle button {
  background: #262c3a;
  color: #94a3b8;
  border: 1px solid #363f54;
  padding: 3px 9px;
  font-size: 11px;
  cursor: pointer;
}
.dim-toggle button.active {
  background: #0ea5e9;
  color: #fff;
  border-color: #0ea5e9;
}
.sim-viewport {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 16px;
  background: radial-gradient(circle at center, #1e2433 0%, #12151e 100%);
}
.arena-svg {
  width: 100%;
  max-width: 520px;
  background: #f8fafc;
  border-radius: 12px;
  border: 4px solid #334155;
  transition: transform 0.35s ease;
}
.sim-viewport.mode-3d .arena-svg {
  transform: perspective(650px) rotateX(28deg) rotateZ(-6deg);
  box-shadow: 0 24px 38px rgba(0, 0, 0, 0.55);
}
.sensor-inspector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 10px 12px;
  background: #1c202b;
  border-top: 1px solid #2b3142;
}
.sensor-card {
  background: #13161f;
  border: 1px solid #283044;
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sensor-card small {
  font-size: 9px;
  color: #64748b;
  font-weight: 700;
}
.sensor-card strong {
  font-size: 13px;
  color: #38bdf8;
}
.bottom-dock {
  height: 155px;
  background: #13161f;
  border-top: 1px solid #2b3142;
  display: flex;
  flex-direction: column;
}
.dock-tabs {
  height: 32px;
  background: #181c26;
  border-bottom: 1px solid #262c3a;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}
.dock-tabs button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.dock-tabs button.active {
  background: #262c3a;
  color: #fff;
  font-weight: 600;
}
.dock-status {
  margin-left: auto;
  font-size: 11px;
  color: #64748b;
}
.dock-content {
  flex: 1;
  padding: 8px 14px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}
.log-line {
  padding: 2px 0;
  color: #cbd5e1;
}
.python-preview {
  margin: 0;
  color: #a7f3d0;
}
</style>

