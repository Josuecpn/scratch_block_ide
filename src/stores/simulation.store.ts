import { defineStore } from 'pinia';
import { ref } from 'vue';

export type SimState = 'Idle' | 'Compiling' | 'Executing' | 'Paused' | 'Error';

export const useSimulationStore = defineStore('simulation', () => {
  const simState = ref<SimState>('Idle');
  const activeBlockIndex = ref<number | null>(null);
  const robotPose = ref({ x: 140, y: 180, heading: 0 });

  const sensors = ref({
    portA_leftMotor: 0,
    portB_rightMotor: 0,
    portC_color: 'Preto (#111)',
    portD_distanceCm: 42.5,
    imuYawDeg: 0,
  });

  function resetRobot() {
    simState.value = 'Idle';
    activeBlockIndex.value = null;
    robotPose.value = { x: 140, y: 180, heading: 0 };
    sensors.value = {
      portA_leftMotor: 0,
      portB_rightMotor: 0,
      portC_color: 'Preto (#111)',
      portD_distanceCm: 42.5,
      imuYawDeg: 0,
    };
  }

  return {
    simState,
    activeBlockIndex,
    robotPose,
    sensors,
    resetRobot,
  };
});

