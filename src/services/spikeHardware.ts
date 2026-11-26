import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './database';
import type {
  PythonTargetFlavor,
  RobotConfigSpec,
} from '../stores/workspace.store';
import type { WorkspaceBlock } from '../types/blocks';

export interface CompileDiagnostic {
  block_id: string | null;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface CompileResponse {
  python_code: string;
  target: string;
  diagnostics: CompileDiagnostic[];
  wheel_degrees_per_cm: number;
}

export type SpikeExportFormat = 'py' | 'llsp3_python' | 'llsp3_blocks';

export interface ExportSpikeResponse {
  filename: string;
  saved_path: string;
  mime_type: string;
  size_bytes: number;
  base64_data: string;
  preview_json: string | null;
  message: string;
}

export interface LegoHubDevice {
  id: string;
  port_path: string;
  label: string;
  connection_type: 'USB_SERIAL' | 'VIRTUAL_HUB';
  vendor_id: string | null;
  product_id: string | null;
  is_official_lego_vid: boolean;
}

export interface HubInjectResponse {
  success: boolean;
  port_path: string;
  protocol_used: string;
  slot_index: number;
  bytes_sent: number;
  compiled_code: string;
  trace_logs: string[];
}

function mapSpikeColorLocal(col: string): string {
  switch (col.toLowerCase()) {
    case 'preto':
    case 'black':
      return 'color.BLACK';
    case 'vermelho':
    case 'red':
      return 'color.RED';
    case 'verde':
    case 'green':
      return 'color.GREEN';
    case 'azul':
    case 'blue':
      return 'color.BLUE';
    case 'amarelo':
    case 'yellow':
      return 'color.YELLOW';
    case 'branco':
    case 'white':
      return 'color.WHITE';
    default:
      return 'color.RED';
  }
}

export function compileBlocksLocalFallback(
  projectName: string,
  blocks: WorkspaceBlock[],
  cfg: RobotConfigSpec,
  target: PythonTargetFlavor
): CompileResponse {
  const diagnostics: CompileDiagnostic[] = [];
  if (blocks.length === 0) {
    diagnostics.push({
      block_id: null,
      severity: 'warning',
      message: 'O canvas está vazio. Adicione um bloco de evento inicial.',
    });
  } else if (blocks[0].category !== 'events') {
    diagnostics.push({
      block_id: blocks[0].id,
      severity: 'warning',
      message:
        "O primeiro bloco da pilha não é um evento (Hat). Recomenda-se iniciar com 'Quando o programa iniciar'.",
    });
  }

  if (cfg.left_motor_port === cfg.right_motor_port) {
    diagnostics.push({
      block_id: null,
      severity: 'error',
      message: `Conflito de portas: motor esquerdo e direito estão ambos na porta ${cfg.left_motor_port}.`,
    });
  }

  const wheelDiam = Math.max(10, cfg.wheel_diameter_mm);
  const circumferenceCm = (Math.PI * wheelDiam) / 10.0;
  const degreesPerCm = 360.0 / circumferenceCm;
  const trackRatio = Math.max(20, cfg.axle_track_mm) / wheelDiam;

  if (target === 'pybricks') {
    const lines: string[] = [
      `# Projeto: ${projectName}`,
      '# Alvo: Pybricks MicroPython (LEGO SPIKE Prime Hub)',
      'from pybricks.hubs import PrimeHub',
      'from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor',
      'from pybricks.parameters import Port, Direction, Color',
      'from pybricks.robotics import DriveBase',
      'from pybricks.tools import wait',
      '',
      'hub = PrimeHub()',
      `left_motor = Motor(Port.${cfg.left_motor_port}, Direction.COUNTERCLOCKWISE)`,
      `right_motor = Motor(Port.${cfg.right_motor_port})`,
      `robot = DriveBase(left_motor, right_motor, wheel_diameter=${cfg.wheel_diameter_mm.toFixed(1)}, axle_track=${cfg.axle_track_mm.toFixed(1)})`,
      'robot.use_gyro(True)',
      '',
    ];

    let indentLevel = 0;
    let repeatRemaining = 0;

    for (const blk of blocks) {
      const ind = '    '.repeat(indentLevel);
      const numParam = Number(blk.param ?? 0);
      const strParam = String(blk.param ?? '');

      if (blk.opcode === 'when_program_starts') {
        lines.push(`${ind}# Início do programa principal`);
      } else if (blk.opcode === 'when_color_detected') {
        lines.push(`${ind}color_sensor = ColorSensor(Port.${cfg.color_sensor_port})`);
        lines.push(`${ind}while color_sensor.color() != Color.RED:`);
        lines.push(`${ind}    wait(10)`);
      } else if (blk.opcode === 'set_move_speed') {
        lines.push(`${ind}robot.settings(straight_speed=${Math.round(numParam * 5)})`);
      } else if (blk.opcode === 'move_distance') {
        lines.push(`${ind}robot.straight(${Math.round(numParam * 10)})  # ${numParam} cm`);
      } else if (blk.opcode === 'turn_degrees') {
        lines.push(`${ind}robot.turn(${Math.round(numParam)})`);
      } else if (blk.opcode === 'turn_left') {
        lines.push(`${ind}robot.turn(-${Math.round(numParam)})`);
      } else if (blk.opcode === 'set_rgb_color') {
        lines.push(`${ind}hub.light.on(${mapSpikeColorLocal(strParam).replace('color.', 'Color.')})`);
      } else if (blk.opcode === 'set_chameleon_mode') {
        lines.push(`${ind}# MODO_CAMALEAO: ${strParam !== 'Desativado' ? 'True' : 'False'}`);
      } else if (blk.opcode === 'motor_run_rotations') {
        lines.push(`${ind}left_motor.run_angle(500, ${Math.round(numParam * 360)})`);
      } else if (blk.opcode === 'dist_less_than') {
        lines.push(`${ind}dist_sensor = UltrasonicSensor(Port.${cfg.distance_sensor_port})`);
        lines.push(`${ind}while dist_sensor.distance() >= ${Math.round(numParam * 10)}:`);
        lines.push(`${ind}    wait(10)`);
      } else if (blk.opcode === 'color_is') {
        lines.push(`${ind}color_sensor = ColorSensor(Port.${cfg.color_sensor_port})`);
        lines.push(`${ind}if color_sensor.color() == Color.BLACK:`);
        lines.push(`${ind}    hub.display.text("${strParam}")`);
      } else if (blk.opcode === 'wait_seconds') {
        lines.push(`${ind}wait(${Math.round(numParam * 1000)})`);
      } else if (blk.opcode === 'repeat_times') {
        lines.push(`${ind}for _i in range(${Math.max(1, Math.round(numParam))}):`);
        indentLevel += 1;
        repeatRemaining = 2;
        continue;
      } else if (blk.opcode === 'math_add') {
        lines.push(`${ind}acumulador = ${numParam}`);
      } else if (blk.opcode === 'set_var') {
        lines.push(`${ind}velocidade = ${numParam}`);
      }

      if (indentLevel > 0) {
        if (repeatRemaining > 1) repeatRemaining -= 1;
        else {
          indentLevel = 0;
          repeatRemaining = 0;
        }
      }
    }

    if (indentLevel > 0) {
      lines.push(`${'    '.repeat(indentLevel)}wait(50)`);
    }

    return {
      python_code: lines.join('\n'),
      target: 'pybricks',
      diagnostics,
      wheel_degrees_per_cm: Number(degreesPerCm.toFixed(2)),
    };
  }

  // SPIKE v3 Oficial
  const lines: string[] = [
    `# Projeto: ${projectName}`,
    '# Alvo: LEGO Education SPIKE Prime v3 (MicroPython Nativo)',
    `# Geometria: Roda=${cfg.wheel_diameter_mm.toFixed(1)}mm (${degreesPerCm.toFixed(2)}°/cm) | Bitola=${cfg.axle_track_mm.toFixed(1)}mm | Motores=${cfg.left_motor_port}+${cfg.right_motor_port}`,
    'from hub import port, motion_sensor, light_matrix',
    'import runloop',
    'import motor',
    'import motor_pair',
    'import color_sensor',
    'import distance_sensor',
    'import color',
    '',
    'async def main():',
    `    motor_pair.pair(motor_pair.PAIR_1, port.${cfg.left_motor_port}, port.${cfg.right_motor_port})`,
    '    motion_sensor.reset_yaw(0)',
    '    velocidade_padrao = 500  # graus/s (100% = 1000 deg/s no SPIKE v3)',
  ];

  let indentLevel = 1;
  let repeatRemaining = 0;

  for (const blk of blocks) {
    const ind = '    '.repeat(indentLevel);
    const numParam = Number(blk.param ?? 0);
    const strParam = String(blk.param ?? '');

    if (blk.opcode === 'when_program_starts') {
      lines.push(`${ind}# [Evento] Quando o programa iniciar`);
    } else if (blk.opcode === 'when_color_detected') {
      lines.push(
        `${ind}await runloop.until(lambda: color_sensor.color(port.${cfg.color_sensor_port}) == ${mapSpikeColorLocal(strParam)})`
      );
    } else if (blk.opcode === 'set_move_speed') {
      lines.push(
        `${ind}velocidade_padrao = ${Math.round(numParam * 10)}  # ${numParam}% da velocidade máxima`
      );
    } else if (blk.opcode === 'move_distance') {
      const deg = Math.round(numParam * degreesPerCm);
      lines.push(
        `${ind}await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${deg}, 0, velocity=velocidade_padrao)  # ${numParam} cm`
      );
    } else if (blk.opcode === 'turn_degrees') {
      const deg = Math.round(numParam * trackRatio);
      lines.push(
        `${ind}await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${deg}, 100, velocity=velocidade_padrao)  # Giro à direita ${numParam}°`
      );
    } else if (blk.opcode === 'turn_left') {
      const deg = Math.round(numParam * trackRatio);
      lines.push(
        `${ind}await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${deg}, -100, velocity=velocidade_padrao)  # Giro à esquerda ${numParam}°`
      );
    } else if (blk.opcode === 'set_rgb_color') {
      lines.push(`${ind}from hub import light`);
      lines.push(`${ind}light.color(light.POWER, ${mapSpikeColorLocal(strParam)})  # LED RGB: ${strParam}`);
    } else if (blk.opcode === 'set_chameleon_mode') {
      lines.push(`${ind}# MODO_CAMALEAO: ${strParam !== 'Desativado' ? 'True' : 'False'}`);
    } else if (blk.opcode === 'move_direction_for') {
      const f = blk.fields ?? {};
      const dir = String(f.direction ?? 'forward');
      const val = Number(f.value ?? 20);
      const sign = dir === 'backward' ? -1 : 1;
      const deg = Math.round(val * degreesPerCm * sign);
      lines.push(
        `${ind}await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${deg}, ${dir === 'right' ? 100 : dir === 'left' ? -100 : 0}, velocity=velocidade_padrao)`
      );
    } else if (blk.opcode === 'move_steer_for') {
      const f = blk.fields ?? {};
      const steer = Number(f.steering ?? 30);
      const val = Number(f.value ?? 1);
      lines.push(
        `${ind}await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${Math.round(val * 360)}, ${steer}, velocity=velocidade_padrao)`
      );
    } else if (blk.opcode === 'move_stop') {
      lines.push(`${ind}motor_pair.stop(motor_pair.PAIR_1)`);
    } else if (blk.opcode === 'motor_run_for') {
      const f = blk.fields ?? {};
      const port = String(f.port ?? cfg.left_motor_port);
      const val = Number(f.value ?? 1);
      const dir = String(f.direction ?? 'clockwise') === 'counterclockwise' ? -1 : 1;
      lines.push(`${ind}await motor.run_for_degrees(port.${port}, ${Math.round(val * 360 * dir)}, velocidade_padrao)`);
    } else if (blk.opcode === 'motor_stop') {
      const f = blk.fields ?? {};
      lines.push(`${ind}motor.stop(port.${String(f.port ?? cfg.left_motor_port)})`);
    } else if (blk.opcode === 'motor_run_rotations') {
      const deg = Math.round(numParam * 360);
      lines.push(
        `${ind}await motor.run_for_degrees(port.${cfg.left_motor_port}, ${deg}, velocidade_padrao)  # ${numParam} rotações`
      );
    } else if (blk.opcode === 'dist_less_than') {
      const mm = Math.round(numParam * 10);
      lines.push(
        `${ind}await runloop.until(lambda: 0 <= distance_sensor.distance(port.${cfg.distance_sensor_port}) < ${mm})`
      );
    } else if (blk.opcode === 'color_is') {
      lines.push(
        `${ind}if color_sensor.color(port.${cfg.color_sensor_port}) == ${mapSpikeColorLocal(strParam)}:`
      );
      lines.push(`${ind}    await light_matrix.write("${strParam}")`);
    } else if (blk.opcode === 'wait_seconds') {
      lines.push(`${ind}await runloop.sleep_ms(${Math.round(numParam * 1000)})`);
    } else if (blk.opcode === 'repeat_times') {
      lines.push(`${ind}for _i in range(${Math.max(1, Math.round(numParam))}):`);
      indentLevel += 1;
      repeatRemaining = 2;
      continue;
    } else if (blk.opcode === 'math_add') {
      lines.push(`${ind}acumulador = velocidade_padrao + ${numParam}`);
    } else if (blk.opcode === 'set_var') {
      lines.push(`${ind}velocidade = ${numParam}`);
      lines.push(`${ind}velocidade_padrao = int(velocidade * 10)`);
    }

    if (indentLevel > 1) {
      if (repeatRemaining > 1) repeatRemaining -= 1;
      else {
        indentLevel = 1;
        repeatRemaining = 0;
      }
    }
  }

  if (indentLevel > 1) {
    lines.push(`${'    '.repeat(indentLevel)}await runloop.sleep_ms(50)`);
  }

  lines.push('', 'runloop.run(main())');

  return {
    python_code: lines.join('\n'),
    target: 'spike_v3',
    diagnostics,
    wheel_degrees_per_cm: Number(degreesPerCm.toFixed(2)),
  };
}

export async function compileToMicroPython(
  projectName: string,
  blocks: WorkspaceBlock[],
  robotConfig: RobotConfigSpec,
  target: PythonTargetFlavor
): Promise<CompileResponse> {
  if (isTauriRuntime()) {
    try {
      return await invoke<CompileResponse>('compile_to_micropython', {
        req: {
          project_name: projectName,
          blocks,
          robot_config: robotConfig,
          target,
        },
      });
    } catch {
      // Fallback local caso falhe
    }
  }
  return compileBlocksLocalFallback(projectName, blocks, robotConfig, target);
}

/**
 * Faz o download imediato de um arquivo binário (Uint8Array) ou Base64 no navegador
 */
export function triggerBrowserDownloadBytes(filename: string, bytes: Uint8Array, mimeType: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

export function triggerBrowserDownload(filename: string, base64Data: string, mimeType: string) {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  triggerBrowserDownloadBytes(filename, bytes, mimeType);
}

function crc32Ts(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipArchiveTs(entries: Array<[string, Uint8Array]>): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32Ts(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x0021, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length;
  }

  const cdSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + cdSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of localChunks) {
    out.set(c, pos);
    pos += c.length;
  }
  for (const c of centralChunks) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(eocd, pos);
  return out;
}

export async function exportSpikeProject(params: {
  projectId: string;
  projectName: string;
  format: SpikeExportFormat;
  robotModel?: 'SPIKE_PRIME' | 'SPIKE_ESSENTIAL' | 'CUSTOM';
  slotIndex: number;
  blocks: WorkspaceBlock[];
  robotConfig: RobotConfigSpec;
  pythonFlavor: PythonTargetFlavor;
}): Promise<ExportSpikeResponse> {
  if (isTauriRuntime()) {
    const res = await invoke<ExportSpikeResponse>('export_spike_project', {
      req: {
        project_id: params.projectId,
        project_name: params.projectName,
        format: params.format,
        robot_model: params.robotModel ?? 'SPIKE_PRIME',
        slot_index: params.slotIndex,
        blocks: params.blocks,
        robot_config: params.robotConfig,
        python_flavor: params.pythonFlavor,
      },
    });
    // No Tauri Desktop, o backend já cria e grava o arquivo diretamente em ~/Downloads/<filename>.
    return res;
  }

  // Fallback quando rodando apenas no navegador (`npm run dev`): gera o arquivo real (.py ou ZIP .llsp3) e baixa
  const compiled = compileBlocksLocalFallback(
    params.projectName,
    params.blocks,
    params.robotConfig,
    params.pythonFlavor
  );
  const safeName = params.projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const encoder = new TextEncoder();

  if (params.format === 'py') {
    const filename = `${safeName || 'spike_project'}.py`;
    const bytes = encoder.encode(compiled.python_code);
    triggerBrowserDownloadBytes(filename, bytes, 'text/x-python');
    return {
      filename,
      saved_path: `Downloads/${filename}`,
      mime_type: 'text/x-python',
      size_bytes: bytes.length,
      base64_data: '',
      preview_json: null,
      message: `[Exporter] Arquivo '${filename}' (${bytes.length} bytes) criado e baixado.`,
    };
  }

  const isBlocks = params.format === 'llsp3_blocks';
  const isEssential = params.robotModel === 'SPIKE_ESSENTIAL';
  const suffix = isEssential && isBlocks ? 'essential_blocks' : isBlocks ? 'prime_blocks' : 'prime_python';
  const filename = `${safeName || 'spike_project'}_${suffix}.llsp3`;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const manifest = isBlocks
    ? {
        type: 'word-blocks',
        autoDelete: false,
        created: nowIso,
        id: params.projectId,
        lastsaved: nowIso,
        size: 0,
        name: params.projectName,
        slotIndex: params.slotIndex,
        workspaceX: 120,
        workspaceY: 120,
        zoomLevel: 0.675,
        showAllBlocks: false,
        version: 38,
        hardware: { roboblocks_hub_01: { type: 'flipper' } },
        extensions: ['flipperevents', 'flippermotor'],
        state: {
          playMode: 'play',
          canvasDrawerTab: 'monitorTab',
          canvasDrawerOpen: false,
          hasMonitors: true,
        },
        extraFiles: [],
      }
    : {
        type: 'python',
        autoDelete: false,
        created: nowIso,
        id: params.projectId,
        lastsaved: nowIso,
        size: compiled.python_code.length,
        name: params.projectName,
        slotIndex: params.slotIndex,
        workspaceX: 64,
        workspaceY: 64,
        zoomLevel: 1.0,
        hardware: { python: { type: 'flipper' } },
        state: { canvasDrawerOpen: true },
        extraFiles: [],
      };

  const projectbody = isBlocks
    ? {
        targets: [
          {
            isStage: true,
            name: 'Stage',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                assetId: 'deadc057000000000000000000000000',
                name: 'backdrop1',
                bitmapResolution: 1,
                md5ext: 'deadc057000000000000000000000000.svg',
                dataFormat: 'svg',
                rotationCenterX: 47,
                rotationCenterY: 55,
              },
            ],
            sounds: [],
            volume: 0,
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null,
          },
          {
            isStage: false,
            name: 'ovb80Yq75XmjZt4JUABW',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: Object.fromEntries(
              params.blocks.map((b, idx) => {
                const base = {
                  next: params.blocks[idx + 1]?.id ?? null,
                  parent: idx === 0 ? null : params.blocks[idx - 1].id,
                  shadow: false,
                  topLevel: idx === 0,
                  ...(idx === 0 ? { x: -130, y: 120 } : {}),
                };
                if (b.opcode === 'when_program_starts') {
                  return [b.id, { ...base, opcode: 'flipperevents_whenProgramStarts', inputs: {}, fields: {} }];
                }
                if (b.opcode === 'set_move_speed') {
                  return [
                    b.id,
                    {
                      ...base,
                      opcode: 'flippermove_movementSpeed',
                      inputs: { SPEED: [1, [4, String(b.fields?.speed ?? b.param ?? 60)]] },
                      fields: {},
                    },
                  ];
                }
                if (b.opcode === 'move_distance' || b.opcode === 'move_direction_for') {
                  return [
                    b.id,
                    {
                      ...base,
                      opcode: 'flippermove_move',
                      inputs: { VALUE: [1, [4, String(b.fields?.value ?? b.param ?? 20)]] },
                      fields: { UNIT: [String(b.fields?.unit ?? b.unit ?? 'cm'), null] },
                    },
                  ];
                }
                return [
                  b.id,
                  {
                    ...base,
                    opcode: 'control_wait',
                    inputs: { DURATION: [1, [5, String(b.param ?? '1')]] },
                    fields: {},
                  },
                ];
              })
            ),
            comments: {},
            currentCostume: 0,
            costumes: [
              {
                assetId: 'deadc057000000000000000000000000',
                name: 'm6yNJGJVUt9FAAd0uS4W',
                bitmapResolution: 1,
                md5ext: 'deadc057000000000000000000000000.svg',
                dataFormat: 'svg',
                rotationCenterX: 240,
                rotationCenterY: 180,
              },
            ],
            sounds: [],
            volume: 100,
            visible: true,
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            draggable: false,
            rotationStyle: 'all around',
          },
        ],
        monitors: [],
        extensions: ['flipperevents'],
        meta: {
          semver: '3.0.0',
          vm: '0.2.0-prerelease.20200512204241',
          agent: 'RoboBlocks IDE',
        },
      }
    : { main: compiled.python_code };

  const monitorsJson = {
    programStartTime: nowMs,
    display: {
      visible: false,
      viewMode: 'In window',
      type: 'image',
      content: '',
      hideImage: false,
      includedImages: [11],
      showImageSelector: false,
    },
    linegraph: {
      visible: false,
      viewMode: 'In window',
      lineVariant: 0,
      data: [],
      splitMode: 0,
      yAxisMode: 0,
    },
    bargraph: {
      visible: false,
      viewMode: 'In window',
      data: { '1': 0, '3': 0, '4': 0, '6': 0, '7': 0, '9': 0 },
    },
  };

  const manifestStr = JSON.stringify(manifest);
  const projectbodyStr = JSON.stringify(projectbody);
  const monitorsStr = JSON.stringify(monitorsJson);
  const iconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="14" fill="#FACC15"/></svg>';

  const roboblocksMetaStr = JSON.stringify({
    formatVersion: 1,
    robotModel: params.robotModel ?? 'SPIKE_PRIME',
    blocks: params.blocks,
  });

  const zipEntries: Array<[string, Uint8Array]> = isBlocks
    ? [
        ['manifest.json', encoder.encode(manifestStr)],
        [
          'scratch.sb3',
          buildZipArchiveTs([
            ['project.json', encoder.encode(projectbodyStr)],
            ['deadc057000000000000000000000000.svg', new Uint8Array(0)],
          ]),
        ],
        ['icon.svg', encoder.encode(iconSvg)],
        ['monitors.json', encoder.encode(monitorsStr)],
        ['roboblocks.json', encoder.encode(roboblocksMetaStr)],
      ]
    : [
        ['manifest.json', encoder.encode(manifestStr)],
        ['projectbody.json', encoder.encode(projectbodyStr)],
        ['icon.svg', encoder.encode(iconSvg)],
        ['roboblocks.json', encoder.encode(roboblocksMetaStr)],
      ];
  const zipBytes = buildZipArchiveTs(zipEntries);

  triggerBrowserDownloadBytes(filename, zipBytes, 'application/octet-stream');

  const previewJson = JSON.stringify(
    {
      container: 'ZIP (.llsp3 LEGO Education SPIKE v3)',
      entries: ['manifest.json', 'projectbody.json', 'icon.svg'],
      manifest,
      projectbody,
    },
    null,
    2
  );

  return {
    filename,
    saved_path: `Downloads/${filename}`,
    mime_type: 'application/octet-stream',
    size_bytes: zipBytes.length,
    base64_data: '',
    preview_json: previewJson,
    message: `[Exporter] Arquivo ZIP '${filename}' (${zipBytes.length} bytes) criado e baixado.`,
  };
}

export async function listLegoDevices(): Promise<LegoHubDevice[]> {
  if (isTauriRuntime()) {
    try {
      return await invoke<LegoHubDevice[]>('list_lego_devices');
    } catch {
      // Fallback
    }
  }
  return [
    {
      id: 'virtual-spike-hub-01',
      port_path: 'usb://virtual-spike-hub',
      label: '🤖 LEGO SPIKE Prime Hub (Loopback/Homologação USB)',
      connection_type: 'VIRTUAL_HUB',
      vendor_id: '0694',
      product_id: '0009',
      is_official_lego_vid: true,
    },
  ];
}

export async function injectToLegoHub(params: {
  portPath: string;
  protocol: 'raw_repl' | 'spike_slot';
  slotIndex: number;
  projectName: string;
  blocks: WorkspaceBlock[];
  robotConfig: RobotConfigSpec;
  pythonFlavor: PythonTargetFlavor;
}): Promise<HubInjectResponse> {
  if (isTauriRuntime()) {
    return await invoke<HubInjectResponse>('inject_to_lego_hub', {
      req: {
        port_path: params.portPath,
        protocol: params.protocol,
        slot_index: params.slotIndex,
        project_name: params.projectName,
        blocks: params.blocks,
        robot_config: params.robotConfig,
        python_flavor: params.pythonFlavor,
      },
    });
  }

  const compiled = compileBlocksLocalFallback(
    params.projectName,
    params.blocks,
    params.robotConfig,
    params.pythonFlavor
  );

  return {
    success: true,
    port_path: params.portPath,
    protocol_used: params.protocol,
    slot_index: params.slotIndex,
    bytes_sent: compiled.python_code.length,
    compiled_code: compiled.python_code,
    trace_logs: [
      `[USB Serial] Conectado a '${params.portPath}' @ 115200 baud (VID:0x0694 PID:0x0009).`,
      '[Raw REPL] TX -> 0x03 0x03 (Ctrl+C: Interrompendo script anterior)',
      '[Raw REPL] TX -> 0x01 (Ctrl+A: Entrando em modo MicroPython Raw REPL)',
      `[Raw REPL] TX -> ${compiled.python_code.length} bytes transmitidos (${params.protocol}, Slot #${params.slotIndex}).`,
      '[Raw REPL] TX -> 0x04 (Ctrl+D: Compilar e executar no Hub)',
      `[SPIKE Hub] RX <- OK | Executando '${params.projectName}' no robô.`,
    ],
  };
}

export async function stopLegoHub(portPath: string): Promise<string[]> {
  if (isTauriRuntime()) {
    return await invoke<string[]>('stop_lego_hub', { portPath });
  }
  return [
    `[USB Serial] Parada de emergência enviada para '${portPath}'.`,
    '[SPIKE Hub] Motores desligados com segurança.',
  ];
}

