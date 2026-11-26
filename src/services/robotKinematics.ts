import type { ArenaObject, SimulationEnvironmentRecord } from './database';
import type { RobotConfigSpec } from '../stores/workspace.store';
import type { useSimulationStore } from '../stores/simulation.store';

type SimStore = ReturnType<typeof useSimulationStore>;

// Velocidade máxima realista de referência (100% = 2.5 rotações/segundo = 150 RPM)
const MAX_RAD_PER_SEC = 2.5 * Math.PI * 2;

export interface MotionParams {
  leftSpeedPct: number;
  rightSpeedPct: number;
  /** Condição de parada por rotações médias absolutas das rodas ativas (radianos) */
  targetWheelRad?: number;
  /** Condição de parada por ângulo do chassi (graus) */
  targetHeadingDeltaDeg?: number;
  /** Condição de parada por tempo (segundos) */
  durationSec?: number;
}

function clampToArena(
  x: number,
  y: number,
  env: SimulationEnvironmentRecord,
  objects: ArenaObject[]
): { x: number; y: number; collided: boolean } {
  const halfW = env.width_mm / 2 - 90;
  const halfD = env.depth_mm / 2 - 90;
  let nx = Math.max(-halfW, Math.min(halfW, x));
  let ny = Math.max(-halfD, Math.min(halfD, y));
  let collided = nx !== x || ny !== y;

  for (const obj of objects) {
    if (obj.type !== 'obstacle' && obj.type !== 'wall') continue;
    const padX = obj.width / 2 + 55;
    const padZ = obj.depth / 2 + 55;
    if (Math.abs(nx - obj.x) < padX && Math.abs(ny - obj.z) < padZ) {
      collided = true;
      break;
    }
  }

  return { x: nx, y: ny, collided };
}

/**
 * Executa movimento diferencial contínuo frame a frame via requestAnimationFrame (dt),
 * acoplando rotação das rodas, calibração cm/rotação e fator de atrito do piso.
 */
export function runDifferentialMotion(
  simStore: SimStore,
  robotConfig: RobotConfigSpec,
  env: SimulationEnvironmentRecord,
  params: MotionParams,
  allowPausedOrStep = false
): Promise<boolean> {
  return new Promise((resolve) => {
    const startToken = simStore.runToken;
    let lastTime = performance.now();
    let elapsedSec = 0;
    let accumulatedWheelRad = 0;
    let accumulatedHeadingDeg = 0;

    simStore.sensors.portA_leftMotor = Math.round(params.leftSpeedPct);
    simStore.sensors.portB_rightMotor = Math.round(params.rightSpeedPct);

    const step = (now: number) => {
      if (simStore.runToken !== startToken) {
        resolve(false);
        return;
      }
      if (!allowPausedOrStep && simStore.simState !== 'Executing') {
        resolve(false);
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsedSec += dt;

      const omegaL = (params.leftSpeedPct / 100) * MAX_RAD_PER_SEC;
      const omegaR = (params.rightSpeedPct / 100) * MAX_RAD_PER_SEC;

      // Mantém as rodas girando visualmente mesmo em zonas de baixo atrito (patinação)
      const dWheelL = omegaL * dt;
      const dWheelR = omegaR * dt;
      simStore.leftWheelAngleRad += dWheelL;
      simStore.rightWheelAngleRad += dWheelR;

      const activeWheelsCount =
        (params.leftSpeedPct !== 0 ? 1 : 0) + (params.rightSpeedPct !== 0 ? 1 : 0);
      if (activeWheelsCount > 0) {
        accumulatedWheelRad += (Math.abs(dWheelL) + Math.abs(dWheelR)) / activeWheelsCount;
      }

      // Calibração: 1 rotação (2π rad) = cmPerRotation * 10 mm
      const mmPerRad = (simStore.cmPerRotation * 10) / (Math.PI * 2);
      const friction = Math.max(0.05, Math.min(1.0, simStore.surfaceFriction));

      const vL_mm_s = omegaL * mmPerRad;
      const vR_mm_s = omegaR * mmPerRad;
      const vLinearMmS = ((vL_mm_s + vR_mm_s) / 2) * friction;
      const axleTrack = Math.max(40, robotConfig.axle_track_mm);
      const wAngularRadS = ((vL_mm_s - vR_mm_s) / axleTrack) * friction;

      const dHeadingDeg = (wAngularRadS * dt * 180) / Math.PI;
      accumulatedHeadingDeg += Math.abs(dHeadingDeg);

      const midHeadingRad = ((simStore.robotPose.heading + dHeadingDeg * 0.5) * Math.PI) / 180;
      const nextX = simStore.robotPose.x + Math.cos(midHeadingRad) * vLinearMmS * dt;
      const nextY = simStore.robotPose.y + Math.sin(midHeadingRad) * vLinearMmS * dt;

      const clamped = clampToArena(nextX, nextY, env, env.objects);
      if (!clamped.collided || Math.abs(dHeadingDeg) > 0.01) {
        if (!clamped.collided) {
          simStore.robotPose.x = clamped.x;
          simStore.robotPose.y = clamped.y;
        }
        simStore.robotPose.heading = (simStore.robotPose.heading + dHeadingDeg + 360) % 360;
        simStore.sensors.imuYawDeg = Math.round(simStore.robotPose.heading);
      }

      // Verifica critérios de término
      const doneByWheel =
        params.targetWheelRad !== undefined && accumulatedWheelRad >= params.targetWheelRad;
      const doneByHeading =
        params.targetHeadingDeltaDeg !== undefined &&
        accumulatedHeadingDeg >= params.targetHeadingDeltaDeg;
      const doneByTime = params.durationSec !== undefined && elapsedSec >= params.durationSec;

      if (doneByWheel || doneByHeading || doneByTime) {
        simStore.sensors.portA_leftMotor = 0;
        simStore.sensors.portB_rightMotor = 0;
        resolve(true);
        return;
      }

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });
}

/**
 * Inicia movimento diferencial contínuo em background até que cancelActiveMotion() seja chamado
 * (usado por 'iniciar movimento', 'iniciar movimento com curva', 'motor iniciar').
 */
export function startContinuousMotion(
  simStore: SimStore,
  robotConfig: RobotConfigSpec,
  env: SimulationEnvironmentRecord,
  leftSpeedPct: number,
  rightSpeedPct: number
): void {
  simStore.cancelActiveMotion();
  const startToken = simStore.runToken;
  let lastTime = performance.now();

  simStore.sensors.portA_leftMotor = Math.round(leftSpeedPct);
  simStore.sensors.portB_rightMotor = Math.round(rightSpeedPct);

  const step = (now: number) => {
    if (simStore.runToken !== startToken || simStore.simState !== 'Executing') {
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    const omegaL = (leftSpeedPct / 100) * MAX_RAD_PER_SEC;
    const omegaR = (rightSpeedPct / 100) * MAX_RAD_PER_SEC;

    simStore.leftWheelAngleRad += omegaL * dt;
    simStore.rightWheelAngleRad += omegaR * dt;

    const mmPerRad = (simStore.cmPerRotation * 10) / (Math.PI * 2);
    const friction = Math.max(0.05, Math.min(1.0, simStore.surfaceFriction));

    const vL_mm_s = omegaL * mmPerRad;
    const vR_mm_s = omegaR * mmPerRad;
    const vLinearMmS = ((vL_mm_s + vR_mm_s) / 2) * friction;
    const axleTrack = Math.max(40, robotConfig.axle_track_mm);
    const wAngularRadS = ((vL_mm_s - vR_mm_s) / axleTrack) * friction;

    const dHeadingDeg = (wAngularRadS * dt * 180) / Math.PI;
    const midHeadingRad = ((simStore.robotPose.heading + dHeadingDeg * 0.5) * Math.PI) / 180;
    const nextX = simStore.robotPose.x + Math.cos(midHeadingRad) * vLinearMmS * dt;
    const nextY = simStore.robotPose.y + Math.sin(midHeadingRad) * vLinearMmS * dt;

    const clamped = clampToArena(nextX, nextY, env, env.objects);
    if (!clamped.collided) {
      simStore.robotPose.x = clamped.x;
      simStore.robotPose.y = clamped.y;
    }
    simStore.robotPose.heading = (simStore.robotPose.heading + dHeadingDeg + 360) % 360;
    simStore.sensors.imuYawDeg = Math.round(simStore.robotPose.heading);

    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

/**
 * Aguarda continuamente via requestAnimationFrame até que uma condição booleana seja verdadeira.
 */
export function runWaitUntil(
  simStore: SimStore,
  predicate: () => boolean,
  allowPausedOrStep = false
): Promise<boolean> {
  return new Promise((resolve) => {
    const startToken = simStore.runToken;

    const check = () => {
      if (simStore.runToken !== startToken) {
        resolve(false);
        return;
      }
      if (!allowPausedOrStep && simStore.simState !== 'Executing') {
        resolve(false);
        return;
      }
      if (predicate()) {
        resolve(true);
        return;
      }
      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  });
}

/**
 * Espera contínua cancelável via requestAnimationFrame (para blocos 'espera N s')
 */
export function runTimedWait(
  simStore: SimStore,
  seconds: number,
  allowPausedOrStep = false
): Promise<boolean> {
  return new Promise((resolve) => {
    const startToken = simStore.runToken;
    const start = performance.now();
    const targetMs = Math.max(0, seconds) * 1000;

    const tick = (now: number) => {
      if (simStore.runToken !== startToken) {
        resolve(false);
        return;
      }
      if (!allowPausedOrStep && simStore.simState !== 'Executing') {
        resolve(false);
        return;
      }
      if (now - start >= targetMs) {
        resolve(true);
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}
