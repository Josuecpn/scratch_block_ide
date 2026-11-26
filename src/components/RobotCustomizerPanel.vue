<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace.store';
import type { RobotKitModel } from '../services/database';

const workspaceStore = useWorkspaceStore();
const { currentProject, robotConfig, robotVisual, availablePorts, isSavedInSqlite } =
  storeToRefs(workspaceStore);

const CHASSIS_COLORS = [
  { label: 'Amarelo SPIKE', hex: '#facc15' },
  { label: 'Azul Essencial', hex: '#0ea5e9' },
  { label: 'Vermelho', hex: '#ef4444' },
  { label: 'Verde', hex: '#22c55e' },
  { label: 'Roxo', hex: '#a855f7' },
  { label: 'Laranja', hex: '#f97316' },
  { label: 'Branco', hex: '#f8fafc' },
];

function markDirty() {
  isSavedInSqlite.value = false;
}

function handleKitChange(model: RobotKitModel) {
  workspaceStore.setRobotKit(model);
}
</script>

<template>
  <div class="customizer-panel">
    <div class="cust-section">
      <strong>1. Kit LEGO SPIKE & Portas</strong>
      <div class="cust-row">
        <div class="kit-toggle">
          <button
            type="button"
            :class="{ active: currentProject.robot_model === 'SPIKE_ESSENTIAL' }"
            @click="handleKitChange('SPIKE_ESSENTIAL')"
          >
            🟦 SPIKE Essencial (A–B)
          </button>
          <button
            type="button"
            :class="{ active: currentProject.robot_model === 'SPIKE_PRIME' }"
            @click="handleKitChange('SPIKE_PRIME')"
          >
            🟨 SPIKE Prime (A–F)
          </button>
        </div>

        <label class="inline-field">
          <span>Motor Esq:</span>
          <select v-model="robotConfig.left_motor_port" @change="markDirty">
            <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
          </select>
        </label>
        <label class="inline-field">
          <span>Motor Dir:</span>
          <select v-model="robotConfig.right_motor_port" @change="markDirty">
            <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
          </select>
        </label>
        <label class="inline-field">
          <span>Cor:</span>
          <select v-model="robotConfig.color_sensor_port" @change="markDirty">
            <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
          </select>
        </label>
        <label class="inline-field">
          <span>Distância:</span>
          <select v-model="robotConfig.distance_sensor_port" @change="markDirty">
            <option v-for="p in availablePorts" :key="p" :value="p">Porta {{ p }}</option>
          </select>
        </label>
      </div>
    </div>

    <div class="cust-section">
      <strong>2. Aparência & Dimensões 3D (atualização imediata)</strong>
      <div class="cust-row">
        <div class="inline-field">
          <span>Cor Chassi:</span>
          <div class="swatches">
            <button
              v-for="c in CHASSIS_COLORS"
              :key="c.hex"
              type="button"
              class="swatch"
              :class="{ active: robotVisual.chassisColor === c.hex }"
              :style="{ backgroundColor: c.hex }"
              :title="c.label"
              @click="robotVisual.chassisColor = c.hex; markDirty()"
            ></button>
          </div>
        </div>

        <label class="inline-field">
          <span>Compr. (mm):</span>
          <input v-model.number="robotVisual.lengthMm" type="number" min="80" max="300" step="5" class="num-in" @input="markDirty" />
        </label>
        <label class="inline-field">
          <span>Larg. (mm):</span>
          <input v-model.number="robotVisual.widthMm" type="number" min="70" max="260" step="5" class="num-in" @input="markDirty" />
        </label>
        <label class="inline-field">
          <span>Alt. (mm):</span>
          <input v-model.number="robotVisual.heightMm" type="number" min="50" max="200" step="5" class="num-in" @input="markDirty" />
        </label>
        <label class="inline-field">
          <span>Ø Roda (mm):</span>
          <input v-model.number="robotConfig.wheel_diameter_mm" type="number" min="20" max="120" class="num-in" @input="markDirty" />
        </label>
        <label class="inline-field">
          <span>Bitola (mm):</span>
          <input v-model.number="robotConfig.axle_track_mm" type="number" min="40" max="300" class="num-in" @input="markDirty" />
        </label>
      </div>
    </div>

    <div class="cust-section">
      <strong>3. Sensores acoplados no Chassi 3D</strong>
      <div class="cust-row">
        <label class="chk-field">
          <input v-model="robotVisual.hasColorSensor" type="checkbox" @change="markDirty" />
          <span>Sensor de Cor</span>
        </label>
        <label v-if="robotVisual.hasColorSensor" class="inline-field">
          <span>Posição:</span>
          <select v-model="robotVisual.colorSensorSide" @change="markDirty">
            <option value="front">Frontal</option>
            <option value="center">Centro</option>
            <option value="back">Traseiro</option>
          </select>
        </label>

        <label class="chk-field">
          <input v-model="robotVisual.hasDistanceSensor" type="checkbox" @change="markDirty" />
          <span>Sensor Ultrassônico (Distância)</span>
        </label>
        <label v-if="robotVisual.hasDistanceSensor" class="inline-field">
          <span>Posição:</span>
          <select v-model="robotVisual.distanceSensorSide" @change="markDirty">
            <option value="front">Frontal</option>
            <option value="left">Esquerda</option>
            <option value="right">Direita</option>
          </select>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.customizer-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12px;
}
.cust-section {
  background: #181c26;
  border: 1px solid #283044;
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cust-section strong {
  color: #cbd5e1;
  font-size: 11px;
}
.cust-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.kit-toggle {
  display: flex;
  gap: 4px;
}
.kit-toggle button {
  background: #0f172a;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.kit-toggle button.active {
  background: #1d4ed8;
  border-color: #3b82f6;
  color: #fff;
}
.inline-field {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #94a3b8;
}
.inline-field select,
.num-in {
  background: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 11px;
}
.num-in {
  width: 56px;
}
.swatches {
  display: flex;
  gap: 5px;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
}
.swatch.active {
  border-color: #38bdf8;
  transform: scale(1.2);
}
.chk-field {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #e2e8f0;
  cursor: pointer;
}
</style>
