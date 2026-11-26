<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace.store';
import {
  classifyHexToSpikeColorName,
  useSimulationStore,
} from '../stores/simulation.store';
import type { ArenaObject } from '../services/database';

interface Props {
  editMode: boolean;
  selectedObjectId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select-object', id: string | null): void;
  (e: 'object-moved'): void;
}>();

const workspaceStore = useWorkspaceStore();
const simulationStore = useSimulationStore();

const { simDimension, robotVisual, environment } = storeToRefs(workspaceStore);
const {
  robotPose,
  sensors,
  ledColor,
  detectedColorName,
  detectedColorHex,
  chameleonMode,
  leftWheelAngleRad,
  rightWheelAngleRad,
  surfaceFriction,
} = storeToRefs(simulationStore);

const containerRef = ref<HTMLDivElement | null>(null);

const MM_TO_UNIT = 0.01;

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let robotGroup: THREE.Group | null = null;
let objectsGroup: THREE.Group | null = null;
let selectionOutline: THREE.BoxHelper | null = null;
let ledMaterial: THREE.MeshStandardMaterial | null = null;
let ledPointLight: THREE.PointLight | null = null;
let sensorBeamMaterial: THREE.MeshBasicMaterial | null = null;
let leftWheelGroup: THREE.Group | null = null;
let rightWheelGroup: THREE.Group | null = null;
let animFrameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;

// Raycasting para edição interativa de objetos na arena
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let isDraggingObject = false;
let draggedObjectId: string | null = null;
const dragOffset = new THREE.Vector3();

function initScene() {
  const el = containerRef.value;
  if (!el) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b101b');
  scene.fog = new THREE.Fog('#0b101b', 22, 55);

  const width = el.clientWidth || 640;
  const height = el.clientHeight || 400;

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  applyCameraPreset(simDimension.value);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 4;
  controls.maxDistance = 42;

  // Iluminação realista + sombras
  const ambient = new THREE.AmbientLight('#cbd5e1', 0.65);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight('#e0f2fe', '#1e293b', 0.45);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight('#ffffff', 1.35);
  dirLight.position.set(10, 16, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 45;
  dirLight.shadow.camera.left = -15;
  dirLight.shadow.camera.right = 15;
  dirLight.shadow.camera.top = 15;
  dirLight.shadow.camera.bottom = -15;
  scene.add(dirLight);

  buildArenaFloor();

  objectsGroup = new THREE.Group();
  scene.add(objectsGroup);
  rebuildArenaObjects();

  robotGroup = new THREE.Group();
  scene.add(robotGroup);
  rebuildRobotMesh();
  syncRobotTransform();

  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);

  resizeObserver = new ResizeObserver(() => {
    if (!containerRef.value || !camera || !renderer) return;
    const w = containerRef.value.clientWidth;
    const h = containerRef.value.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(el);

  const animate = () => {
    animFrameId = requestAnimationFrame(animate);
    controls?.update();
    if (selectionOutline) {
      selectionOutline.update();
    }
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };
  animate();
}

function applyCameraPreset(dim: '2D' | '3D') {
  if (!camera) return;
  if (dim === '2D') {
    camera.position.set(0, 22, 0.01);
  } else {
    camera.position.set(0, 13, 15);
  }
  camera.lookAt(0, 0, 0);
  controls?.target.set(0, 0, 0);
  controls?.update();
}

function buildArenaFloor() {
  if (!scene) return;
  const w = environment.value.width_mm * MM_TO_UNIT;
  const d = environment.value.depth_mm * MM_TO_UNIT;

  const floorGeo = new THREE.PlaneGeometry(w, d);
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.85,
    metalness: 0.05,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const grid = new THREE.GridHelper(Math.max(w, d), 20, '#94a3b8', '#cbd5e1');
  grid.position.y = 0.005;
  scene.add(grid);

  // Bordas baixas da arena
  const borderMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5 });
  const borderH = 0.35;
  const borderT = 0.15;
  const borders: Array<[number, number, number, number]> = [
    [0, -d / 2 - borderT / 2, w + borderT * 2, borderT],
    [0, d / 2 + borderT / 2, w + borderT * 2, borderT],
    [-w / 2 - borderT / 2, 0, borderT, d],
    [w / 2 + borderT / 2, 0, borderT, d],
  ];
  for (const [bx, bz, bw, bd] of borders) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, borderH, bd), borderMat);
    mesh.position.set(bx, borderH / 2, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function rebuildArenaObjects() {
  if (!objectsGroup || !scene) return;
  while (objectsGroup.children.length > 0) {
    const child = objectsGroup.children[0];
    objectsGroup.remove(child);
  }
  if (selectionOutline) {
    scene.remove(selectionOutline);
    selectionOutline = null;
  }

  for (const obj of environment.value.objects) {
    const w = Math.max(obj.width * MM_TO_UNIT, 0.1);
    const d = Math.max(obj.depth * MM_TO_UNIT, 0.1);
    const h = Math.max(obj.height * MM_TO_UNIT, 0.02);

    const geo = new THREE.BoxGeometry(w, h, d);
    const isFlat = obj.type === 'line' || obj.type === 'color_zone';
    const mat = new THREE.MeshStandardMaterial({
      color: obj.color,
      roughness: isFlat ? 0.9 : 0.45,
      metalness: isFlat ? 0.05 : 0.15,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obj.x * MM_TO_UNIT, h / 2 + (isFlat ? 0.008 : 0), obj.z * MM_TO_UNIT);
    mesh.rotation.y = (-obj.rotationDeg * Math.PI) / 180;
    mesh.castShadow = !isFlat;
    mesh.receiveShadow = true;
    mesh.userData = { arenaObjectId: obj.id };
    objectsGroup.add(mesh);

    if (props.selectedObjectId === obj.id) {
      selectionOutline = new THREE.BoxHelper(mesh, '#38bdf8');
      scene.add(selectionOutline);
    }
  }
}

function rebuildRobotMesh() {
  if (!robotGroup) return;
  while (robotGroup.children.length > 0) {
    robotGroup.remove(robotGroup.children[0]);
  }

  const vis = robotVisual.value;
  const len = vis.lengthMm * MM_TO_UNIT;
  const wid = vis.widthMm * MM_TO_UNIT;
  const hei = vis.heightMm * MM_TO_UNIT;

  // Chassi principal
  const chassisMat = new THREE.MeshStandardMaterial({
    color: vis.chassisColor,
    roughness: 0.35,
    metalness: 0.1,
  });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(len, hei * 0.55, wid), chassisMat);
  chassis.position.y = hei * 0.45;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  robotGroup.add(chassis);

  // Hub SPIKE no topo
  const hubMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 });
  const hub = new THREE.Mesh(new THREE.BoxGeometry(len * 0.62, hei * 0.35, wid * 0.68), hubMat);
  hub.position.y = hei * 0.85;
  hub.castShadow = true;
  robotGroup.add(hub);

  // Matriz LED RGB no topo do Hub + PointLight dinâmica
  ledMaterial = new THREE.MeshStandardMaterial({
    color: ledColor.value,
    emissive: ledColor.value,
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });
  const led = new THREE.Mesh(new THREE.BoxGeometry(len * 0.36, 0.05, wid * 0.4), ledMaterial);
  led.position.set(0, hei * 1.04, 0);
  robotGroup.add(led);

  ledPointLight = new THREE.PointLight(ledColor.value, 2.2, 6.5, 1.5);
  ledPointLight.position.set(0, hei * 1.35, 0);
  robotGroup.add(ledPointLight);

  // Seta frontal indicando +X (frente do robô)
  const arrowGeo = new THREE.ConeGeometry(wid * 0.14, len * 0.22, 4);
  arrowGeo.rotateZ(-Math.PI / 2);
  const arrowMat = new THREE.MeshStandardMaterial({ color: vis.accentColor });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.position.set(len * 0.36, hei * 0.78, 0);
  robotGroup.add(arrow);

  // Rodas esquerda e direita articuladas com raios visuais para evidenciar a rotação
  const wheelRadius = Math.max(0.22, hei * 0.36);
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.18, 24);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: vis.wheelColor, roughness: 0.8 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4 });
  const spokeGeo = new THREE.BoxGeometry(wheelRadius * 1.6, 0.05, 0.2);

  leftWheelGroup = new THREE.Group();
  const leftTire = new THREE.Mesh(wheelGeo, wheelMat);
  leftTire.castShadow = true;
  const leftSpoke = new THREE.Mesh(spokeGeo, spokeMat);
  leftWheelGroup.add(leftTire, leftSpoke);
  leftWheelGroup.position.set(-len * 0.1, wheelRadius, -wid / 2 - 0.1);
  robotGroup.add(leftWheelGroup);

  rightWheelGroup = new THREE.Group();
  const rightTire = new THREE.Mesh(wheelGeo, wheelMat);
  rightTire.castShadow = true;
  const rightSpoke = new THREE.Mesh(spokeGeo, spokeMat);
  rightWheelGroup.add(rightTire, rightSpoke);
  rightWheelGroup.position.set(-len * 0.1, wheelRadius, wid / 2 + 0.1);
  robotGroup.add(rightWheelGroup);

  // Sensor de Cor (apontando para o chão)
  if (vis.hasColorSensor) {
    const csX =
      vis.colorSensorSide === 'front' ? len * 0.45 : vis.colorSensorSide === 'back' ? -len * 0.45 : 0;
    const csMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.26),
      new THREE.MeshStandardMaterial({ color: '#0f172a' })
    );
    csMesh.position.set(csX, 0.18, 0);
    csMesh.castShadow = true;
    robotGroup.add(csMesh);

    sensorBeamMaterial = new THREE.MeshBasicMaterial({
      color: detectedColorHex.value,
      transparent: true,
      opacity: 0.55,
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 12), sensorBeamMaterial);
    beam.position.set(csX, 0.08, 0);
    robotGroup.add(beam);
  } else {
    sensorBeamMaterial = null;
  }

  // Sensor Ultrassônico (Distância)
  if (vis.hasDistanceSensor) {
    const dsGroup = new THREE.Group();
    const dsBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.22, 0.46),
      new THREE.MeshStandardMaterial({ color: '#0ea5e9' })
    );
    dsGroup.add(dsBody);

    const eyeGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12);
    eyeGeo.rotateZ(Math.PI / 2);
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', emissive: '#06b6d4', emissiveIntensity: 0.35 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.11, 0, -0.12);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.11, 0, 0.12);
    dsGroup.add(eyeL, eyeR);

    if (vis.distanceSensorSide === 'front') {
      dsGroup.position.set(len / 2 + 0.1, hei * 0.45, 0);
    } else if (vis.distanceSensorSide === 'left') {
      dsGroup.position.set(0, hei * 0.45, -wid / 2 - 0.1);
      dsGroup.rotation.y = Math.PI / 2;
    } else {
      dsGroup.position.set(0, hei * 0.45, wid / 2 + 0.1);
      dsGroup.rotation.y = -Math.PI / 2;
    }
    robotGroup.add(dsGroup);
  }
}

function syncRobotTransform() {
  if (!robotGroup) return;
  robotGroup.position.set(robotPose.value.x * MM_TO_UNIT, 0, robotPose.value.y * MM_TO_UNIT);
  robotGroup.rotation.y = (-robotPose.value.heading * Math.PI) / 180;
  evaluateSensors();
}

function evaluateSensors() {
  const rx = robotPose.value.x;
  const rz = robotPose.value.y;
  const rad = (robotPose.value.heading * Math.PI) / 180;

  // Sensor de cor abaixo do robô (considera rotação dos objetos e ordem de sobreposição)
  const csOffset =
    robotVisual.value.colorSensorSide === 'front'
      ? robotVisual.value.lengthMm * 0.45
      : robotVisual.value.colorSensorSide === 'back'
        ? -robotVisual.value.lengthMm * 0.45
        : 0;
  const csX = rx + Math.cos(rad) * csOffset;
  const csZ = rz + Math.sin(rad) * csOffset;

  let detectedHex = '#e2e8f0';
  let detectedLabel = 'Branco';
  let currentFriction = 1.0;
  const objs = environment.value.objects;
  for (let i = objs.length - 1; i >= 0; i--) {
    const obj = objs[i];
    if (obj.type !== 'line' && obj.type !== 'color_zone') continue;
    const dx = csX - obj.x;
    const dz = csZ - obj.z;
    const objRad = (-obj.rotationDeg * Math.PI) / 180;
    const localX = dx * Math.cos(objRad) - dz * Math.sin(objRad);
    const localZ = dx * Math.sin(objRad) + dz * Math.cos(objRad);
    if (Math.abs(localX) <= obj.width / 2 && Math.abs(localZ) <= obj.depth / 2) {
      detectedHex = obj.color;
      detectedLabel = classifyHexToSpikeColorName(obj.color);
      if (obj.friction !== undefined) {
        currentFriction = obj.friction;
      }
      break;
    }
  }
  surfaceFriction.value = currentFriction;
  detectedColorHex.value = detectedHex;
  detectedColorName.value = detectedLabel;
  sensors.value.portC_color = `${detectedLabel} (${detectedHex})`;
  if (sensorBeamMaterial) {
    sensorBeamMaterial.color.set(detectedHex);
  }
  if (chameleonMode.value) {
    ledColor.value = detectedHex;
  }

  // Sensor de distância (raycast simples 2D em mm até obstáculos/paredes/bordas)
  let minDistMm = 2000;
  const stepMm = 15;
  const maxRangeMm = 1500;
  const halfArenaW = environment.value.width_mm / 2;
  const halfArenaD = environment.value.depth_mm / 2;

  for (let d = 50; d <= maxRangeMm; d += stepMm) {
    const px = rx + Math.cos(rad) * d;
    const pz = rz + Math.sin(rad) * d;
    if (Math.abs(px) >= halfArenaW || Math.abs(pz) >= halfArenaD) {
      minDistMm = d;
      break;
    }
    let hit = false;
    for (const obj of environment.value.objects) {
      if (obj.type !== 'obstacle' && obj.type !== 'wall') continue;
      if (Math.abs(px - obj.x) <= obj.width / 2 && Math.abs(pz - obj.z) <= obj.depth / 2) {
        minDistMm = d;
        hit = true;
        break;
      }
    }
    if (hit) break;
  }
  sensors.value.portD_distanceCm = +(minDistMm / 10).toFixed(1);
}

function updatePointer(e: PointerEvent) {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(e: PointerEvent) {
  if (!props.editMode || !camera || !objectsGroup) return;
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objectsGroup.children, false);
  if (hits.length > 0) {
    const objId = hits[0].object.userData?.arenaObjectId as string | undefined;
    if (objId) {
      emit('select-object', objId);
      draggedObjectId = objId;
      isDraggingObject = true;
      if (controls) controls.enabled = false;
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
        const obj = environment.value.objects.find((o) => o.id === objId);
        if (obj) {
          dragOffset.set(obj.x * MM_TO_UNIT - hitPoint.x, 0, obj.z * MM_TO_UNIT - hitPoint.z);
        }
      }
    }
  } else {
    emit('select-object', null);
  }
}

function onPointerMove(e: PointerEvent) {
  if (!isDraggingObject || !draggedObjectId || !camera) return;
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hitPoint = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
    const obj: ArenaObject | undefined = environment.value.objects.find(
      (o) => o.id === draggedObjectId
    );
    if (obj) {
      const nextX = Math.round(((hitPoint.x + dragOffset.x) / MM_TO_UNIT) / 10) * 10;
      const nextZ = Math.round(((hitPoint.z + dragOffset.z) / MM_TO_UNIT) / 10) * 10;
      const halfW = environment.value.width_mm / 2 - 40;
      const halfD = environment.value.depth_mm / 2 - 40;
      obj.x = Math.max(-halfW, Math.min(halfW, nextX));
      obj.z = Math.max(-halfD, Math.min(halfD, nextZ));
      emit('object-moved');
    }
  }
}

function onPointerUp() {
  if (isDraggingObject) {
    isDraggingObject = false;
    draggedObjectId = null;
    if (controls) controls.enabled = true;
  }
}

watch(simDimension, (dim) => applyCameraPreset(dim));
watch(robotPose, () => syncRobotTransform(), { deep: true });
watch(leftWheelAngleRad, (ang) => {
  if (leftWheelGroup) leftWheelGroup.rotation.z = -ang;
});
watch(rightWheelAngleRad, (ang) => {
  if (rightWheelGroup) rightWheelGroup.rotation.z = -ang;
});
watch(robotVisual, () => rebuildRobotMesh(), { deep: true });
watch(
  ledColor,
  (hex) => {
    if (ledMaterial) {
      ledMaterial.color.set(hex);
      ledMaterial.emissive.set(hex);
    }
    if (ledPointLight) {
      ledPointLight.color.set(hex);
    }
  },
  { immediate: true }
);
watch(chameleonMode, () => evaluateSensors());
watch(
  () => environment.value.objects,
  () => {
    rebuildArenaObjects();
    evaluateSensors();
  },
  { deep: true }
);
watch(() => props.selectedObjectId, () => rebuildArenaObjects());

onMounted(() => {
  initScene();
});

onUnmounted(() => {
  if (animFrameId !== null) cancelAnimationFrame(animFrameId);
  resizeObserver?.disconnect();
  if (renderer) {
    const dom = renderer.domElement;
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerup', onPointerUp);
    renderer.dispose();
  }
  controls?.dispose();
});
</script>

<template>
  <div ref="containerRef" class="sim-3d-canvas">
    <div class="hud-overlay">
      <span>🖱 Arraste para orbitar · Scroll para zoom · Botão direito para pan</span>
      <span v-if="editMode" class="edit-pill">🛠 Modo Edição: clique e arraste objetos na arena</span>
    </div>
  </div>
</template>

<style scoped>
.sim-3d-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0b101b;
}
.hud-overlay {
  position: absolute;
  bottom: 8px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  font-size: 10px;
  color: rgba(226, 232, 240, 0.72);
}
.edit-pill {
  background: rgba(217, 119, 6, 0.85);
  color: #fff;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
}
</style>
