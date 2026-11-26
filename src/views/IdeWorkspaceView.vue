<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore, type WorkspaceBlock } from '../stores/workspace.store';
import { useSimulationStore } from '../stores/simulation.store';
import { isTauriRuntime, type RobotKitModel } from '../services/database';
import {
  compileToMicroPython,
  exportSpikeProject,
  injectToLegoHub,
  listLegoDevices,
  stopLegoHub,
  type CompileDiagnostic,
  type LegoHubDevice,
  type SpikeExportFormat,
} from '../services/spikeHardware';
import { importSpikeFile, parsePythonToBlocks } from '../services/spikeImporter';
import BlockEditorPanel from '../components/BlockEditorPanel.vue';
import SimViewport3D from '../components/SimViewport3D.vue';
import ArenaEditorPanel from '../components/ArenaEditorPanel.vue';
import RobotCustomizerPanel from '../components/RobotCustomizerPanel.vue';

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
  pythonFlavor,
  robotConfig,
  environment,
  scriptStack,
  availablePorts,
} = storeToRefs(workspaceStore);

const { simState, activeBlockIndex, robotPose, sensors, ledColor, detectedColorName, chameleonMode } =
  storeToRefs(simulationStore);

const isDraggingSplitter = ref(false);
const activeBottomTab = ref<'console' | 'python' | 'llsp3' | 'robot' | 'hardware'>('console');
const isArenaEditMode = ref(false);
const selectedArenaObjectId = ref<string | null>(null);
const isSaving = ref(false);

const importFileInput = ref<HTMLInputElement | null>(null);
const showPastePythonModal = ref(false);
const pastedPythonText = ref('');
const importFeedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

const generatedPythonCode = ref<string>('');
const compileDiagnostics = ref<CompileDiagnostic[]>([]);
const degreesPerCm = ref<number>(20.46);
const llsp3PreviewJson = ref<string>(
  '// Clique em "Exportar .llsp3 (Blocos SPIKE)" ou "Exportar .llsp3 (Python SPIKE)" para inspecionar o manifesto e o grafo Scratch 3 (sb3) gerados.'
);
const lastExportedPath = ref<string | null>(null);

const availableHubs = ref<LegoHubDevice[]>([]);
const selectedHubPort = ref<string>('usb://virtual-spike-hub');
const selectedProtocol = ref<'raw_repl' | 'spike_slot'>('raw_repl');
const selectedSlotIndex = ref<number>(0);
const isInjectingHub = ref<boolean>(false);

const logs = ref<string[]>([
  '[SQLite3] Banco local sqlite:roboblocks.db pronto.',
  `[Workspace] Projeto carregado: ${currentProject.value.name}`,
]);

let simInterval: ReturnType<typeof setInterval> | null = null;

function appendLog(msg: string) {
  logs.value.push(msg);
}

async function refreshCompiledPython() {
  const res = await compileToMicroPython(
    currentProject.value.name,
    scriptStack.value,
    robotConfig.value,
    pythonFlavor.value
  );
  generatedPythonCode.value = res.python_code;
  compileDiagnostics.value = res.diagnostics;
  degreesPerCm.value = res.wheel_degrees_per_cm;
}

async function refreshHubDevices() {
  const hubs = await listLegoDevices();
  availableHubs.value = hubs;
  if (hubs.length > 0 && !hubs.some((h) => h.port_path === selectedHubPort.value)) {
    selectedHubPort.value = hubs[0].port_path;
  }
  appendLog(
    `[USB Scanner] ${hubs.length} dispositivo(s) LEGO/Serial disponível(is): ${hubs.map((h) => h.port_path).join(', ')}`
  );
}

watch(
  [scriptStack, robotConfig, pythonFlavor, () => currentProject.value.name],
  () => {
    void refreshCompiledPython();
  },
  { deep: true }
);

onMounted(async () => {
  await refreshCompiledPython();
  await refreshHubDevices();
});

function handleKitChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const nextKit = target.value as RobotKitModel;
  workspaceStore.setRobotKit(nextKit);
  appendLog(
    `[Kit] Alterado para ${nextKit === 'SPIKE_ESSENTIAL' ? 'SPIKE Essencial (Portas A–B)' : 'SPIKE Prime (Portas A–F)'}.`
  );
}

async function handleSaveSqlite() {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const rev = await workspaceStore.saveCurrentProject();
    appendLog(
      `[SQLite3] Projeto '${currentProject.value.name}' salvo (Rev #${rev}): ${scriptStack.value.length} blocos, robô e ${environment.value.objects.length} objetos da arena.`
    );
  } catch (err) {
    appendLog(`[Erro SQLite3] Falha ao salvar projeto: ${String(err)}`);
  } finally {
    isSaving.value = false;
  }
}

async function handleCopyPython() {
  try {
    await navigator.clipboard.writeText(generatedPythonCode.value);
    appendLog('[Clipboard] Código MicroPython copiado para a área de transferência.');
  } catch {
    appendLog('[Clipboard] Código pronto na aba MicroPython.');
  }
}

async function handleExportFormat(format: SpikeExportFormat) {
  try {
    const res = await exportSpikeProject({
      projectId: currentProject.value.id,
      projectName: currentProject.value.name,
      format,
      robotModel: currentProject.value.robot_model,
      slotIndex: selectedSlotIndex.value,
      blocks: scriptStack.value,
      robotConfig: robotConfig.value,
      pythonFlavor: pythonFlavor.value,
    });
    appendLog(res.message);
    lastExportedPath.value = res.saved_path;
    if (res.preview_json) {
      llsp3PreviewJson.value = res.preview_json;
      activeBottomTab.value = 'llsp3';
    } else {
      activeBottomTab.value = 'python';
    }
  } catch (err) {
    appendLog(`[Erro Exportação] ${String(err)}`);
  }
}

async function handleRevealExportedFile() {
  if (!lastExportedPath.value || !isTauriRuntime()) return;
  try {
    await revealItemInDir(lastExportedPath.value);
  } catch (err) {
    appendLog(`[Explorer] Não foi possível abrir a pasta: ${String(err)}`);
  }
}

function triggerImportFile() {
  importFileInput.value?.click();
}

function showImportBanner(kind: 'success' | 'error', text: string) {
  importFeedback.value = { kind, text };
  setTimeout(() => {
    if (importFeedback.value?.text === text) {
      importFeedback.value = null;
    }
  }, 5500);
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const res = await importSpikeFile(file);
    scriptStack.value = res.blocks;
    if (res.detectedKit) {
      workspaceStore.setRobotKit(res.detectedKit);
    }
    isSavedInSqlite.value = false;
    appendLog(res.message);
    for (const w of res.warnings) {
      appendLog(`[Importer Aviso] ${w}`);
    }
    showImportBanner('success', res.message);
    await refreshCompiledPython();
  } catch (err) {
    const msg = `[Erro Importação] ${err instanceof Error ? err.message : String(err)}`;
    appendLog(msg);
    showImportBanner('error', msg);
  }
}

async function handleImportPastedPython() {
  try {
    const { blocks, warnings } = parsePythonToBlocks(pastedPythonText.value, degreesPerCm.value);
    scriptStack.value = blocks;
    isSavedInSqlite.value = false;
    showPastePythonModal.value = false;
    pastedPythonText.value = '';
    const msg = `[Importer] Código Python colado convertido em ${blocks.length} blocos.`;
    appendLog(msg);
    for (const w of warnings) {
      appendLog(`[Importer Aviso] ${w}`);
    }
    showImportBanner('success', msg);
    await refreshCompiledPython();
  } catch (err) {
    const msg = `[Erro Importação] ${err instanceof Error ? err.message : String(err)}`;
    appendLog(msg);
    showImportBanner('error', msg);
  }
}

async function handleInjectToHub() {
  if (isInjectingHub.value) return;
  isInjectingHub.value = true;
  activeBottomTab.value = 'console';
  try {
    const res = await injectToLegoHub({
      portPath: selectedHubPort.value,
      protocol: selectedProtocol.value,
      slotIndex: selectedSlotIndex.value,
      projectName: currentProject.value.name,
      blocks: scriptStack.value,
      robotConfig: robotConfig.value,
      pythonFlavor: pythonFlavor.value,
    });
    for (const line of res.trace_logs) {
      appendLog(line);
    }
  } catch (err) {
    appendLog(`[Erro USB Hub] ${String(err)}`);
  } finally {
    isInjectingHub.value = false;
  }
}

async function handleStopHub() {
  try {
    const trace = await stopLegoHub(selectedHubPort.value);
    for (const line of trace) {
      appendLog(line);
    }
  } catch (err) {
    appendLog(`[Erro ao Parar Hub] ${String(err)}`);
  }
}

async function executeCurrentBlockStep(blk: WorkspaceBlock) {
  if (blk.opcode === 'set_rgb_color') {
    const col = String(blk.param ?? 'Azul');
    simulationStore.setChameleonMode(false);
    simulationStore.setLedColor(col);
    appendLog(`[RGB 3D] Luz do Hub acesa na cor '${col}' (${ledColor.value}).`);
    return;
  }

  if (blk.opcode === 'set_chameleon_mode') {
    const enabled = String(blk.param ?? 'Ativado') !== 'Desativado';
    simulationStore.setChameleonMode(enabled);
    appendLog(
      `[Modo Camaleão] ${enabled ? `Ativado — LED espelhando piso (${detectedColorName.value})` : 'Desativado'}.`
    );
    return;
  }

  if (blk.opcode === 'when_color_detected' || blk.opcode === 'color_is') {
    const expected = String(blk.param ?? 'Vermelho').trim().toLowerCase();
    const actual = detectedColorName.value.trim().toLowerCase();
    const matched = actual === expected;
    if (matched && blk.opcode === 'color_is') {
      simulationStore.setLedColor(String(blk.param ?? 'Vermelho'));
    }
    appendLog(
      `[Sensor Cor 3D] Leitura='${detectedColorName.value}' vs Esperado='${blk.param}' -> ${matched ? 'CORRESPONDÊNCIA ✓' : 'diferente'}`
    );
    return;
  }

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
      appendLog(res.log_message);
      return;
    } catch {
      // Fallback local se fora do Tauri
    }
  }

  if (blk.opcode === 'move_distance') {
    const distMm = Number(blk.param ?? 20) * 10;
    const rad = (robotPose.value.heading * Math.PI) / 180;
    const halfW = environment.value.width_mm / 2 - 100;
    const halfD = environment.value.depth_mm / 2 - 100;
    robotPose.value.x = Math.min(halfW, Math.max(-halfW, robotPose.value.x + Math.cos(rad) * distMm));
    robotPose.value.y = Math.min(halfD, Math.max(-halfD, robotPose.value.y + Math.sin(rad) * distMm));
    sensors.value.portA_leftMotor = 60;
    sensors.value.portB_rightMotor = 60;
  } else if (blk.opcode === 'turn_degrees') {
    robotPose.value.heading = (robotPose.value.heading + Number(blk.param ?? 90) + 360) % 360;
    sensors.value.portA_leftMotor = 50;
    sensors.value.portB_rightMotor = -50;
    sensors.value.imuYawDeg = robotPose.value.heading;
  } else if (blk.opcode === 'turn_left') {
    robotPose.value.heading = (robotPose.value.heading - Number(blk.param ?? 90) + 360) % 360;
    sensors.value.portA_leftMotor = -50;
    sensors.value.portB_rightMotor = 50;
    sensors.value.imuYawDeg = robotPose.value.heading;
  } else {
    sensors.value.portA_leftMotor = 0;
    sensors.value.portB_rightMotor = 0;
  }
  appendLog(
    `[VM -> Sim 3D] (${blk.opcode}) | Pose=(${Math.round(robotPose.value.x)}mm, ${Math.round(robotPose.value.y)}mm, ${robotPose.value.heading}°)`
  );
}

function playSimulation() {
  if (scriptStack.value.length === 0) return;

  if (simState.value === 'Idle') {
    simState.value = 'Compiling';
    appendLog('[Compiler] Traduzindo grafo de blocos para IR/Bytecode...');
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
      appendLog('[VM] Programa finalizado com sucesso.');
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
    appendLog('[Sim] Execução pausada pelo usuário.');
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
  appendLog('[Sim] Arena e robô reposicionados para a pose inicial.');
}

function stopLoop() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

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
    <!-- ══════════ 1. TOP TOOLBAR ══════════ -->
    <header class="top-toolbar">
      <div class="toolbar-left">
        <button class="btn-hub" title="Voltar ao Gerenciador de Projetos" @click="workspaceStore.backToHub()">
          ◀ Hub
        </button>
        <div class="project-badge">
          <span class="dot-online"></span>
          <strong>{{ currentProject.name }}</strong>
          <select
            :value="currentProject.robot_model"
            class="hub-model-select"
            title="Alternar Kit LEGO SPIKE em tempo real"
            @change="handleKitChange"
          >
            <option value="SPIKE_PRIME">SPIKE Prime (Portas A–F)</option>
            <option value="SPIKE_ESSENTIAL">SPIKE Essencial (Portas A–B)</option>
          </select>
        </div>
      </div>

      <nav class="mode-switcher">
        <button :class="{ active: viewMode === 'script' }" @click="viewMode = 'script'">
          🧩 Blocos
        </button>
        <button :class="{ active: viewMode === 'split' }" @click="viewMode = 'split'">
          ⇆ Split-Screen
        </button>
        <button :class="{ active: viewMode === 'simulator' }" @click="viewMode = 'simulator'">
          🌐 Simulador 3D
        </button>
      </nav>

      <div class="toolbar-right">
        <span class="state-pill" :data-state="simState">{{ simState }}</span>

        <div class="sim-controls">
          <button class="ctrl-btn play" :disabled="simState === 'Executing'" @click="playSimulation" title="Executar no Simulador (F5)">
            ▶ Simular
          </button>
          <button class="ctrl-btn pause" :disabled="simState !== 'Executing'" @click="pauseSimulation" title="Pausar (F6)">
            ⏸
          </button>
          <button class="ctrl-btn step" @click="stepSimulation" title="Passo a Passo (F10)">
            ⏭
          </button>
          <button class="ctrl-btn reset" @click="resetSimulation" title="Reiniciar Robô (Ctrl+R)">
            ⟲
          </button>
        </div>

        <div class="export-Quickbar">
          <input
            ref="importFileInput"
            type="file"
            accept=".py,.llsp3"
            class="hidden-file-input"
            @change="handleImportFile"
          />
          <button class="btn-export" title="Importar .py ou .llsp3" @click="triggerImportFile">
            📥 Importar
          </button>
          <button class="btn-export py" title="Exportar script MicroPython (.py)" @click="handleExportFormat('py')">
            🐍 .py
          </button>
          <button class="btn-export llsp" title="Exportar projeto nativo de blocos (.llsp3)" @click="handleExportFormat('llsp3_blocks')">
            🧩 .llsp3
          </button>
          <button
            class="btn-inject"
            :disabled="isInjectingHub"
            title="Compilar e injetar diretamente no Hub LEGO via USB"
            @click="handleInjectToHub"
          >
            ⚡ {{ isInjectingHub ? 'Enviando...' : 'Injetar' }}
          </button>
        </div>

        <button class="btn-save" :disabled="isSaving" @click="handleSaveSqlite">
          💾 {{ isSaving ? 'Salvando...' : isSavedInSqlite ? 'Salvo' : 'Salvar*' }}
        </button>
      </div>
    </header>

    <!-- ══════════ 2. ÁREA CENTRAL (SPLIT-SCREEN) ══════════ -->
    <main class="workspace-body">
      <section
        v-show="viewMode === 'split' || viewMode === 'script'"
        class="panel-blocks"
        :style="{ width: viewMode === 'split' ? `${splitRatio}%` : '100%' }"
      >
        <BlockEditorPanel
          :degrees-per-cm="degreesPerCm"
          :compile-diagnostics="compileDiagnostics"
          @log="appendLog"
        />
      </section>

      <div
        v-show="viewMode === 'split'"
        class="dock-splitter"
        @mousedown="onSplitterMouseDown"
      ></div>

      <section
        v-show="viewMode === 'split' || viewMode === 'simulator'"
        class="panel-simulator"
        :style="{ width: viewMode === 'split' ? `${100 - splitRatio}%` : '100%' }"
      >
        <div class="sim-header">
          <span>Arena 3D · {{ environment.name }}</span>
          <div class="sim-header-actions">
            <button
              class="btn-edit-arena"
              :class="{ chameleon: chameleonMode }"
              title="LED RGB do robô copia automaticamente a cor detectada no piso"
              @click="simulationStore.toggleChameleonMode()"
            >
              🦎 Camaleão {{ chameleonMode ? 'ON' : 'OFF' }}
            </button>
            <button
              class="btn-edit-arena"
              :class="{ active: isArenaEditMode }"
              @click="isArenaEditMode = !isArenaEditMode"
            >
              🛠 {{ isArenaEditMode ? 'Concluir Arena' : 'Editar Arena' }}
            </button>
            <button
              class="btn-edit-arena"
              @click="activeBottomTab = 'robot'"
            >
              🤖 Customizar Robô
            </button>
            <div class="dim-toggle">
              <button :class="{ active: simDimension === '2D' }" @click="simDimension = '2D'">2D Top</button>
              <button :class="{ active: simDimension === '3D' }" @click="simDimension = '3D'">3D Orbit</button>
            </div>
          </div>
        </div>

        <ArenaEditorPanel
          v-if="isArenaEditMode"
          :selected-object-id="selectedArenaObjectId"
          @select-object="selectedArenaObjectId = $event"
        />

        <div class="sim-viewport">
          <SimViewport3D
            :edit-mode="isArenaEditMode"
            :selected-object-id="selectedArenaObjectId"
            @select-object="selectedArenaObjectId = $event"
            @object-moved="isSavedInSqlite = false"
          />
        </div>

        <div class="sensor-inspector">
          <div class="sensor-card">
            <small>PORTA {{ robotConfig.left_motor_port }} · MOTOR ESQ</small>
            <strong>{{ sensors.portA_leftMotor }}%</strong>
          </div>
          <div class="sensor-card">
            <small>PORTA {{ robotConfig.right_motor_port }} · MOTOR DIR</small>
            <strong>{{ sensors.portB_rightMotor }}%</strong>
          </div>
          <div class="sensor-card">
            <small>PORTA {{ robotConfig.color_sensor_port }} · COR</small>
            <strong>{{ sensors.portC_color }}</strong>
          </div>
          <div class="sensor-card">
            <small>PORTA {{ robotConfig.distance_sensor_port }} · DISTÂNCIA</small>
            <strong>{{ sensors.portD_distanceCm }} cm</strong>
          </div>
          <div class="sensor-card">
            <small>GIROSCÓPIO (YAW)</small>
            <strong>{{ sensors.imuYawDeg }}°</strong>
          </div>
          <div class="sensor-card">
            <small>LUZ RGB HUB</small>
            <strong class="rgb-readout">
              <span class="rgb-dot" :style="{ backgroundColor: ledColor }"></span>
              {{ chameleonMode ? 'Camaleão' : ledColor }}
            </strong>
          </div>
        </div>
      </section>
    </main>

    <!-- ══════════ 3. PAINEL INFERIOR ══════════ -->
    <footer class="bottom-dock">
      <div class="dock-tabs">
        <button :class="{ active: activeBottomTab === 'console' }" @click="activeBottomTab = 'console'">
          🖥 Console ({{ logs.length }})
        </button>
        <button :class="{ active: activeBottomTab === 'robot' }" @click="activeBottomTab = 'robot'">
          🤖 Customizar Robô
        </button>
        <button :class="{ active: activeBottomTab === 'python' }" @click="activeBottomTab = 'python'">
          🐍 MicroPython ({{ pythonFlavor === 'spike_v3' ? 'SPIKE v3' : 'Pybricks' }})
        </button>
        <button :class="{ active: activeBottomTab === 'llsp3' }" @click="activeBottomTab = 'llsp3'">
          📦 Pacote .llsp3
        </button>
        <button :class="{ active: activeBottomTab === 'hardware' }" @click="activeBottomTab = 'hardware'">
          🔌 Robô LEGO & USB ({{ availableHubs.length }})
        </button>
        <span class="dock-status">SQLite3 WAL · Three.js 3D · LEGO VID 0x0694 Ready</span>
      </div>

      <div class="dock-content">
        <div v-if="activeBottomTab === 'console'" class="console-lines">
          <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
        </div>

        <div v-else-if="activeBottomTab === 'robot'">
          <RobotCustomizerPanel />
        </div>

        <div v-else-if="activeBottomTab === 'python'" class="python-tab-layout">
          <div class="python-toolbar">
            <label class="inline-field">
              <span>API Alvo:</span>
              <select v-model="pythonFlavor">
                <option value="spike_v3">LEGO SPIKE App 3 (runloop / motor_pair)</option>
                <option value="pybricks">Pybricks (PrimeHub / DriveBase)</option>
              </select>
            </label>
            <button class="mini-btn" @click="handleCopyPython">📋 Copiar Código</button>
            <button class="mini-btn" @click="showPastePythonModal = true">📥 Colar Python → Blocos</button>
            <button class="mini-btn accent" @click="handleExportFormat('py')">💾 Baixar .py</button>
            <button class="mini-btn" @click="handleExportFormat('llsp3_python')">📦 Exportar .llsp3 (Python)</button>
            <button v-if="lastExportedPath" class="mini-btn" @click="handleRevealExportedFile">
              📂 Ver em Downloads
            </button>
          </div>
          <pre class="python-preview"><code>{{ generatedPythonCode }}</code></pre>
        </div>

        <div v-else-if="activeBottomTab === 'llsp3'" class="python-tab-layout">
          <div class="python-toolbar">
            <span>Formato nativo ZIP do site oficial <strong>spike.legoeducation.com</strong>:</span>
            <button class="mini-btn accent" @click="handleExportFormat('llsp3_blocks')">
              🧩 Gerar .llsp3 (Word Blocks)
            </button>
            <button class="mini-btn" @click="handleExportFormat('llsp3_python')">
              🐍 Gerar .llsp3 (Python)
            </button>
            <button v-if="lastExportedPath" class="mini-btn" @click="handleRevealExportedFile">
              📂 Ver em Downloads ({{ lastExportedPath }})
            </button>
          </div>
          <pre class="python-preview"><code>{{ llsp3PreviewJson }}</code></pre>
        </div>

        <div v-else class="hardware-panel">
          <div class="hw-group">
            <strong>1. Conexão USB / Serial com Hub LEGO:</strong>
            <div class="hw-row">
              <select v-model="selectedHubPort" class="hw-select">
                <option v-for="h in availableHubs" :key="h.id" :value="h.port_path">
                  {{ h.label }}
                </option>
              </select>
              <button class="mini-btn" @click="refreshHubDevices">🔄 Escanear USB</button>
              <select v-model="selectedProtocol" class="hw-select-sm">
                <option value="raw_repl">Protocolo: MicroPython Raw REPL</option>
                <option value="spike_slot">Protocolo: Gravar Slot Flash</option>
              </select>
              <label class="inline-field">
                <span>Slot:</span>
                <input v-model.number="selectedSlotIndex" type="number" min="0" max="19" class="hw-num" />
              </label>
              <button class="mini-btn inject" :disabled="isInjectingHub" @click="handleInjectToHub">
                ⚡ Injetar Agora
              </button>
              <button class="mini-btn danger" @click="handleStopHub">
                ⏹ Parar Motores
              </button>
            </div>
          </div>

          <div class="hw-group">
            <strong>2. Portas Ativas ({{ currentProject.robot_model === 'SPIKE_ESSENTIAL' ? 'Kit Essencial: A–B' : 'Kit Prime: A–F' }}):</strong>
            <div class="hw-row">
              <label class="inline-field">
                <span>Motor Esq:</span>
                <select v-model="robotConfig.left_motor_port" @change="isSavedInSqlite = false">
                  <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
                </select>
              </label>
              <label class="inline-field">
                <span>Motor Dir:</span>
                <select v-model="robotConfig.right_motor_port" @change="isSavedInSqlite = false">
                  <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
                </select>
              </label>
              <label class="inline-field">
                <span>Sensor Cor:</span>
                <select v-model="robotConfig.color_sensor_port" @change="isSavedInSqlite = false">
                  <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
                </select>
              </label>
              <label class="inline-field">
                <span>Sensor Dist:</span>
                <select v-model="robotConfig.distance_sensor_port" @change="isSavedInSqlite = false">
                  <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
    </footer>

    <!-- Banner de feedback de importação -->
    <div v-if="importFeedback" class="import-toast" :class="importFeedback.kind">
      {{ importFeedback.text }}
    </div>

    <!-- Modal para colar código MicroPython -->
    <div v-if="showPastePythonModal" class="paste-backdrop" @click.self="showPastePythonModal = false">
      <div class="paste-modal">
        <h3>Importar Código MicroPython (SPIKE v3 / Pybricks)</h3>
        <textarea
          v-model="pastedPythonText"
          rows="10"
          placeholder="Cole aqui o código Python (ex: await motor_pair.move_for_degrees(...) ou robot.straight(200))..."
        ></textarea>
        <div class="paste-actions">
          <button class="mini-btn" @click="showPastePythonModal = false">Cancelar</button>
          <button class="mini-btn accent" @click="handleImportPastedPython">Converter para Blocos</button>
        </div>
      </div>
    </div>
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
  gap: 8px;
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
.hub-model-select {
  background: #312e81;
  color: #e0e7ff;
  border: 1px solid #4338ca;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  font-weight: 700;
  cursor: pointer;
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
  padding: 5px 12px;
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
  padding: 5px 9px;
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
.export-Quickbar {
  display: flex;
  align-items: center;
  gap: 5px;
  border-left: 1px solid #2b3142;
  padding-left: 8px;
}
.btn-export {
  background: #1e293b;
  border: 1px solid #3b4254;
  color: #e2e8f0;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.btn-inject {
  background: #d97706;
  border: 1px solid #f59e0b;
  color: #ffffff;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
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
.dock-splitter {
  width: 5px;
  background: #252b3b;
  cursor: col-resize;
}
.dock-splitter:hover {
  background: #3b82f6;
}
.panel-simulator {
  display: flex;
  flex-direction: column;
  background: #151923;
  height: 100%;
}
.sim-header {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #252b3b;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sim-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-edit-arena {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.btn-edit-arena.active {
  background: #d97706;
  border-color: #f59e0b;
  color: #fff;
}
.dim-toggle {
  display: flex;
  background: #0f172a;
  border-radius: 6px;
  padding: 2px;
}
.dim-toggle button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.dim-toggle button.active {
  background: #0284c7;
  color: #fff;
}
.sim-viewport {
  flex: 1;
  overflow: hidden;
  display: flex;
}
.sensor-inspector {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  padding: 10px 14px;
  background: #181c26;
  border-top: 1px solid #252b3b;
}
.rgb-readout {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rgb-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.7);
  display: inline-block;
}
.btn-edit-arena.chameleon {
  background: #065f46;
  border-color: #10b981;
  color: #ecfdf5;
}
.hidden-file-input {
  display: none;
}
.import-toast {
  position: fixed;
  bottom: 210px;
  right: 20px;
  z-index: 60;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.import-toast.success {
  background: #14532d;
  border: 1px solid #22c55e;
  color: #dcfce7;
}
.import-toast.error {
  background: #7f1d1d;
  border: 1px solid #ef4444;
  color: #fee2e2;
}
.paste-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: grid;
  place-items: center;
  z-index: 70;
}
.paste-modal {
  background: #1c202b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 18px;
  width: 540px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.paste-modal h3 {
  font-size: 14px;
}
.paste-modal textarea {
  background: #0d1017;
  border: 1px solid #334155;
  color: #93c5fd;
  border-radius: 8px;
  padding: 10px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  resize: vertical;
}
.paste-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sensor-card {
  background: #11141c;
  border: 1px solid #252b3b;
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
  font-size: 12px;
  color: #38bdf8;
}
.bottom-dock {
  height: 195px;
  background: #161922;
  border-top: 1px solid #2b3142;
  display: flex;
  flex-direction: column;
}
.dock-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 0;
  border-bottom: 1px solid #252b3b;
}
.dock-tabs button {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.dock-tabs button.active {
  color: #fff;
  border-bottom-color: #3b82f6;
}
.dock-status {
  margin-left: auto;
  font-size: 11px;
  color: #22c55e;
}
.dock-content {
  flex: 1;
  padding: 10px 14px;
  overflow-y: auto;
  font-size: 12px;
}
.console-lines {
  font-family: ui-monospace, monospace;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.log-line {
  color: #cbd5e1;
}
.python-tab-layout {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.python-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.inline-field {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #94a3b8;
}
.inline-field select,
.hw-select,
.hw-select-sm,
.hw-num {
  background: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11px;
}
.hw-num {
  width: 56px;
}
.mini-btn {
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 4px 9px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
}
.mini-btn.accent {
  background: #0284c7;
  border-color: #0ea5e9;
  color: #fff;
}
.mini-btn.inject {
  background: #d97706;
  border-color: #f59e0b;
  color: #fff;
  font-weight: 700;
}
.mini-btn.danger {
  background: #991b1b;
  border-color: #dc2626;
  color: #fff;
}
.python-preview {
  background: #0d1017;
  padding: 10px;
  border-radius: 6px;
  color: #93c5fd;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  max-height: 110px;
  overflow: auto;
}
.hardware-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hw-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.hw-group strong {
  font-size: 11px;
  color: #cbd5e1;
}
.hw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
