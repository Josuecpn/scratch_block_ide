import { defineStore } from 'pinia';
import { ref } from 'vue';

export type SimState = 'Idle' | 'Compiling' | 'Executing' | 'Paused' | 'Error';

export const SPIKE_COLOR_HEX: Record<string, string> = {
  preto: '#111827',
  black: '#111827',
  vermelho: '#ef4444',
  red: '#ef4444',
  verde: '#22c55e',
  green: '#22c55e',
  azul: '#3b82f6',
  blue: '#3b82f6',
  amarelo: '#facc15',
  yellow: '#facc15',
  branco: '#f8fafc',
  white: '#f8fafc',
  magenta: '#d946ef',
  roxo: '#d946ef',
  purple: '#d946ef',
  laranja: '#f97316',
  orange: '#f97316',
};

export function resolveSpikeColorHex(colorNameOrHex: string | number | undefined): string {
  const raw = String(colorNameOrHex ?? '').trim();
  if (raw.startsWith('#') && (raw.length === 7 || raw.length === 4)) {
    return raw;
  }
  return SPIKE_COLOR_HEX[raw.toLowerCase()] ?? '#38bdf8';
}

export function classifyHexToSpikeColorName(hex: string): string {
  const normalized = hex.trim().toLowerCase();
  const exact: Record<string, string> = {
    '#111827': 'Preto',
    '#000000': 'Preto',
    '#ef4444': 'Vermelho',
    '#dc2626': 'Vermelho',
    '#22c55e': 'Verde',
    '#16a34a': 'Verde',
    '#3b82f6': 'Azul',
    '#2563eb': 'Azul',
    '#0ea5e9': 'Azul',
    '#facc15': 'Amarelo',
    '#eab308': 'Amarelo',
    '#f8fafc': 'Branco',
    '#e2e8f0': 'Branco',
    '#ffffff': 'Branco',
    '#d946ef': 'Magenta',
    '#a855f7': 'Magenta',
    '#f97316': 'Laranja',
  };
  if (exact[normalized]) return exact[normalized];

  // Classificação por distância RGB aproximada caso seja uma cor customizada
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!m) return 'Branco';
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);

  const candidates: Array<{ name: string; rgb: [number, number, number] }> = [
    { name: 'Preto', rgb: [17, 24, 39] },
    { name: 'Branco', rgb: [248, 250, 252] },
    { name: 'Vermelho', rgb: [239, 68, 68] },
    { name: 'Verde', rgb: [34, 197, 94] },
    { name: 'Azul', rgb: [59, 130, 246] },
    { name: 'Amarelo', rgb: [250, 204, 21] },
    { name: 'Magenta', rgb: [217, 70, 239] },
    { name: 'Laranja', rgb: [249, 115, 22] },
  ];

  let best = 'Branco';
  let bestDist = Infinity;
  for (const c of candidates) {
    const dr = r - c.rgb[0];
    const dg = g - c.rgb[1];
    const db = b - c.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.name;
    }
  }
  return best;
}

export const useSimulationStore = defineStore('simulation', () => {
  const simState = ref<SimState>('Idle');
  const activeBlockIndex = ref<number | null>(null);
  const spawnPose = ref({ x: -300, y: 0, heading: 0 });
  const robotPose = ref({ x: -300, y: 0, heading: 0 });

  // Estado da Luz RGB do Hub e Sensor de Cor
  const ledColor = ref<string>('#38bdf8');
  const detectedColorName = ref<string>('Branco');
  const detectedColorHex = ref<string>('#e2e8f0');
  const chameleonMode = ref<boolean>(false);

  // Estado Cinemático e Física Contínua
  const cmPerRotation = ref<number>(17.59); // π * 56mm / 10
  const moveSpeedPct = ref<number>(60);
  const motorSpeedPct = ref<Record<string, number>>({
    A: 75,
    B: 75,
    C: 75,
    D: 75,
    E: 75,
    F: 75,
  });
  const leftWheelAngleRad = ref<number>(0);
  const rightWheelAngleRad = ref<number>(0);
  const surfaceFriction = ref<number>(1.0);
  const runToken = ref<number>(0);

  const sensors = ref({
    portA_leftMotor: 0,
    portB_rightMotor: 0,
    portC_color: 'Branco (#E2E8F0)',
    portD_distanceCm: 42.5,
    imuYawDeg: 0,
  });

  function setSpawnPose(x: number, y: number, heading: number) {
    spawnPose.value = { x, y, heading };
    robotPose.value = { x, y, heading };
    sensors.value.imuYawDeg = heading;
  }

  function setLedColor(colorNameOrHex: string) {
    ledColor.value = resolveSpikeColorHex(colorNameOrHex);
  }

  function setChameleonMode(enabled: boolean) {
    chameleonMode.value = enabled;
    if (enabled) {
      ledColor.value = detectedColorHex.value;
    }
  }

  function toggleChameleonMode() {
    setChameleonMode(!chameleonMode.value);
  }

  function cancelActiveMotion() {
    runToken.value += 1;
    sensors.value.portA_leftMotor = 0;
    sensors.value.portB_rightMotor = 0;
  }

  function resetRobot(wheelDiameterMm = 56.0) {
    runToken.value += 1;
    simState.value = 'Idle';
    activeBlockIndex.value = null;
    robotPose.value = { ...spawnPose.value };
    ledColor.value = '#38bdf8';
    chameleonMode.value = false;
    cmPerRotation.value = +((Math.PI * Math.max(10, wheelDiameterMm)) / 10).toFixed(2);
    moveSpeedPct.value = 60;
    leftWheelAngleRad.value = 0;
    rightWheelAngleRad.value = 0;
    surfaceFriction.value = 1.0;
    sensors.value = {
      portA_leftMotor: 0,
      portB_rightMotor: 0,
      portC_color: 'Branco (#E2E8F0)',
      portD_distanceCm: 42.5,
      imuYawDeg: spawnPose.value.heading,
    };
  }

  return {
    simState,
    activeBlockIndex,
    spawnPose,
    robotPose,
    ledColor,
    detectedColorName,
    detectedColorHex,
    chameleonMode,
    cmPerRotation,
    moveSpeedPct,
    motorSpeedPct,
    leftWheelAngleRad,
    rightWheelAngleRad,
    surfaceFriction,
    runToken,
    sensors,
    setSpawnPose,
    setLedColor,
    setChameleonMode,
    toggleChameleonMode,
    cancelActiveMotion,
    resetRobot,
  };
});
