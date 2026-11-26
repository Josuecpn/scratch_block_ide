import type { RobotKitModel } from './database';
import type { WorkspaceBlock } from '../stores/workspace.store';

export interface ImportResult {
  success: boolean;
  sourceFormat: 'py' | 'llsp3_blocks' | 'llsp3_python' | 'sb3_json';
  blocks: WorkspaceBlock[];
  detectedKit?: RobotKitModel;
  projectName?: string;
  warnings: string[];
  message: string;
}

function makeBlockId(index: number): string {
  return `blk-imp-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Descompressão deflate-raw não suportada neste ambiente.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // Inicia o leitor antes de escrever para evitar deadlock por backpressure no WebKitGTK
  const readPromise = new Response(ds.readable).arrayBuffer();
  await writer.write(new Uint8Array(compressed));
  await writer.close();
  const buf = await readPromise;
  return new Uint8Array(buf);
}

/**
 * Leitor ZIP minimalista compatível com .llsp3, .llsp e .sb3 (suporta STORED=0 e DEFLATED=8)
 */
async function readZipArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Arquivo ZIP/.llsp3 inválido (assinatura EOCD ausente).');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < totalEntries; i++) {
    if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== 0x02014b50) {
      throw new Error('Cabeçalho central do ZIP corrompido.');
    }
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const filename = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (
      localHeaderOffset + 30 > bytes.length ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      continue;
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = bytes.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      entries.set(filename, rawData);
    } else if (method === 8) {
      entries.set(filename, await inflateRawBytes(rawData));
    } else {
      throw new Error(`Método de compressão ZIP (${method}) não suportado para '${filename}'.`);
    }
  }

  return entries;
}

function rehydrateLosslessBlocks(rawBlocks: WorkspaceBlock[], prefix = 'blk-rt'): WorkspaceBlock[] {
  return rawBlocks.map((b, idx) => {
    const clone: WorkspaceBlock = {
      ...b,
      id: `${prefix}-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
      fields: b.fields ? { ...b.fields } : undefined,
      slots: b.slots
        ? Object.fromEntries(
            Object.entries(b.slots).map(([k, v]) => [
              k,
              v ? rehydrateLosslessBlocks([v], `${prefix}-slot`)[0] : null,
            ])
          )
        : undefined,
      children: b.children ? rehydrateLosslessBlocks(b.children, `${prefix}-ch`) : undefined,
      elseChildren: b.elseChildren
        ? rehydrateLosslessBlocks(b.elseChildren, `${prefix}-el`)
        : undefined,
    };
    return clone;
  });
}

function mapPythonColorToPt(token: string): string {
  const lower = token.toLowerCase();
  if (lower.includes('black') || lower.includes('preto') || lower === '0') return 'Preto';
  if (lower.includes('red') || lower.includes('vermelho') || lower === '9') return 'Vermelho';
  if (lower.includes('green') || lower.includes('verde') || lower === '6') return 'Verde';
  if (lower.includes('blue') || lower.includes('azul') || lower === '3') return 'Azul';
  if (lower.includes('yellow') || lower.includes('amarelo') || lower === '7') return 'Amarelo';
  if (lower.includes('white') || lower.includes('branco') || lower === '10') return 'Branco';
  if (lower.includes('magenta') || lower.includes('purple') || lower.includes('roxo') || lower === '1')
    return 'Magenta';
  return 'Vermelho';
}

/**
 * Converte código MicroPython (SPIKE v3 ou Pybricks) para blocos estruturados do Workspace,
 * validando se o conteúdo contém código Python válido/reconhecível.
 */
export function parsePythonToBlocks(
  pythonSource: string,
  wheelDegreesPerCm = 20.46
): { blocks: WorkspaceBlock[]; warnings: string[] } {
  const trimmed = pythonSource.trim();
  if (!trimmed) {
    throw new Error('O código Python está vazio.');
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('<')) {
    throw new Error('O conteúdo informado não é um script Python válido (parece JSON ou XML/HTML).');
  }

  const lines = trimmed.split(/\r?\n/);
  const blocks: WorkspaceBlock[] = [];
  const warnings: string[] = [];
  let idx = 0;

  blocks.push({
    id: makeBlockId(idx++),
    category: 'events',
    opcode: 'when_program_starts',
    label: 'Quando o programa iniciar',
  });

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith('from ') ||
      line.startsWith('import ') ||
      line.startsWith('async def ') ||
      line.startsWith('runloop.run')
    ) {
      if (line.includes('MODO_CAMALEAO')) {
        const enabled = !line.includes('False');
        blocks.push({
          id: makeBlockId(idx++),
          category: 'sensors',
          opcode: 'set_chameleon_mode',
          label: 'Modo Camaleão (LED = Cor do piso)',
          param: enabled ? 'Ativado' : 'Desativado',
        });
      }
      continue;
    }

    const ledMatch =
      /(?:light\.color|hub\.light\.on)\((?:light\.POWER,\s*)?(?:color\.|Color\.)([A-Z]+)\)/.exec(
        line
      );
    if (ledMatch) {
      blocks.push({
        id: makeBlockId(idx++),
        category: 'events',
        opcode: 'set_rgb_color',
        label: 'Acender luz RGB na cor',
        param: mapPythonColorToPt(ledMatch[1]),
      });
      continue;
    }

    const speedSpike =
      /(?:velocidade_padrao\s*=\s*|motor_pair\.set_default_speed\(|set_movement_speed\()(\d+(?:\.\d+)?)/.exec(
        line
      );
    if (speedSpike) {
      const rawNum = Number(speedSpike[1]);
      const pct = line.includes('velocidade_padrao')
        ? Math.max(5, Math.min(100, Math.round(rawNum / 10)))
        : Math.max(5, Math.min(100, Math.round(rawNum)));
      blocks.push({
        id: makeBlockId(idx++),
        category: 'motion',
        opcode: 'set_move_speed',
        shape: 'stack',
        label: 'Definir velocidade de movimento a',
        param: pct,
        unit: '%',
        fields: { speed: pct },
      });
      continue;
    }

    const speedPybricks = /robot\.settings\(straight_speed=(\d+(?:\.\d+)?)\)/.exec(line);
    if (speedPybricks) {
      const pct = Math.max(5, Math.min(100, Math.round(Number(speedPybricks[1]) / 5)));
      blocks.push({
        id: makeBlockId(idx++),
        category: 'motion',
        opcode: 'set_move_speed',
        label: 'Definir velocidade de movimento para',
        param: pct,
        unit: '%',
      });
      continue;
    }

    const movePair = /motor_pair\.move_for_degrees\([^,]+,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+)/.exec(
      line
    );
    if (movePair) {
      const deg = Number(movePair[1]);
      const steering = Number(movePair[2]);
      const commentCm = /#\s*(-?\d+(?:\.\d+)?)\s*cm/.exec(line);
      const commentDeg = /#\s*Giro[^0-9-]*(-?\d+(?:\.\d+)?)°/.exec(line);

      if (steering === 0) {
        const cm = commentCm ? Number(commentCm[1]) : Math.round(deg / wheelDegreesPerCm);
        blocks.push({
          id: makeBlockId(idx++),
          category: 'motion',
          opcode: 'move_distance',
          label: 'Mover para frente por',
          param: cm,
          unit: 'cm',
        });
      } else if (steering < 0) {
        const turnDeg = commentDeg ? Number(commentDeg[1]) : Math.round(Math.abs(deg) / 2);
        blocks.push({
          id: makeBlockId(idx++),
          category: 'motion',
          opcode: 'turn_left',
          label: 'Virar à esquerda por',
          param: turnDeg,
          unit: 'graus',
        });
      } else {
        const turnDeg = commentDeg ? Number(commentDeg[1]) : Math.round(Math.abs(deg) / 2);
        blocks.push({
          id: makeBlockId(idx++),
          category: 'motion',
          opcode: 'turn_degrees',
          label: 'Girar à direita por',
          param: turnDeg,
          unit: 'graus',
        });
      }
      continue;
    }

    const straightMatch = /robot\.straight\((-?\d+(?:\.\d+)?)\)/.exec(line);
    if (straightMatch) {
      blocks.push({
        id: makeBlockId(idx++),
        category: 'motion',
        opcode: 'move_distance',
        label: 'Mover para frente por',
        param: +(Number(straightMatch[1]) / 10).toFixed(1),
        unit: 'cm',
      });
      continue;
    }

    const turnMatch = /robot\.turn\((-?\d+(?:\.\d+)?)\)/.exec(line);
    if (turnMatch) {
      const deg = Number(turnMatch[1]);
      blocks.push({
        id: makeBlockId(idx++),
        category: 'motion',
        opcode: deg < 0 ? 'turn_left' : 'turn_degrees',
        label: deg < 0 ? 'Virar à esquerda por' : 'Girar à direita por',
        param: Math.abs(deg),
        unit: 'graus',
      });
      continue;
    }

    const sleepMs = /runloop\.sleep_ms\((\d+)\)/.exec(line);
    if (sleepMs) {
      blocks.push({
        id: makeBlockId(idx++),
        category: 'control',
        opcode: 'wait_seconds',
        label: 'Esperar',
        param: +(Number(sleepMs[1]) / 1000).toFixed(2),
        unit: 'segundos',
      });
      continue;
    }

    const waitMs = /^wait\((\d+)\)$/.exec(line);
    if (waitMs) {
      blocks.push({
        id: makeBlockId(idx++),
        category: 'control',
        opcode: 'wait_seconds',
        label: 'Esperar',
        param: +(Number(waitMs[1]) / 1000).toFixed(2),
        unit: 'segundos',
      });
      continue;
    }

    const forRange = /for\s+\w+\s+in\s+range\((\d+)\):/.exec(line);
    if (forRange) {
      blocks.push({
        id: makeBlockId(idx++),
        category: 'control',
        opcode: 'repeat_times',
        label: 'Repetir próximos blocos',
        param: Number(forRange[1]),
        unit: 'vezes',
      });
      continue;
    }

    const waitColor = /color_sensor\.color\([^)]*\)\s*==\s*(?:color|Color)\.([A-Z]+)/.exec(line);
    if (waitColor) {
      const isEventWait = line.includes('runloop.until') || line.includes('while ');
      blocks.push({
        id: makeBlockId(idx++),
        category: isEventWait ? 'events' : 'sensors',
        opcode: isEventWait ? 'when_color_detected' : 'color_is',
        label: isEventWait ? 'Quando detectar cor' : 'Se Sensor de Cor for',
        param: mapPythonColorToPt(waitColor[1]),
      });
      continue;
    }

    const waitDist = /distance_sensor\.distance\([^)]*\)\s*<\s*(\d+)/.exec(line);
    if (waitDist) {
      blocks.push({
        id: makeBlockId(idx++),
        category: 'sensors',
        opcode: 'dist_less_than',
        label: 'Aguardar Distância <',
        param: +(Number(waitDist[1]) / 10).toFixed(1),
        unit: 'cm',
      });
      continue;
    }
  }

  if (blocks.length === 1) {
    warnings.push('Nenhuma instrução reconhecida; apenas o bloco inicial foi carregado.');
  }

  return { blocks, warnings };
}

interface Sb3BlockRaw {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  shadow?: boolean;
  topLevel?: boolean;
}

function extractFieldVal(block: Sb3BlockRaw, key: string, fallback = ''): string {
  const f = block.fields?.[key];
  if (Array.isArray(f) && f.length >= 1) {
    return String(f[0]);
  }
  return fallback;
}

function extractInputVal(
  block: Sb3BlockRaw,
  allBlocks: Record<string, Sb3BlockRaw>,
  key: string,
  fallback: string
): string {
  const inp = block.inputs?.[key];
  if (!Array.isArray(inp)) return fallback;
  const val = inp[1];
  if (Array.isArray(val) && val.length >= 2) {
    return String(val[1]);
  }
  if (typeof val === 'string' && allBlocks[val]) {
    const shadowBlk: Sb3BlockRaw = allBlocks[val];
    const firstField = Object.values(shadowBlk.fields ?? {})[0];
    if (Array.isArray(firstField) && firstField.length >= 1) {
      return String(firstField[0]);
    }
  }
  return fallback;
}

function extractSubstackId(block: Sb3BlockRaw, key = 'SUBSTACK'): string | null {
  const inp = block.inputs?.[key];
  if (Array.isArray(inp) && typeof inp[1] === 'string') {
    return inp[1];
  }
  return null;
}

function convertDistanceToCm(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'cm') return +value.toFixed(1);
  if (u === 'inches') return +(value * 2.54).toFixed(1);
  if (u === 'rotations') return Math.round(value * 17.6);
  if (u === 'degrees') return Math.round(value / 20.46);
  if (u === 'seconds') return Math.round(value * 15);
  return +value.toFixed(1);
}

export function parseSb3ToBlocks(projectJsonText: string): {
  blocks: WorkspaceBlock[];
  warnings: string[];
} {
  const parsed = JSON.parse(projectJsonText) as {
    targets?: Array<{ isStage?: boolean; blocks?: Record<string, Sb3BlockRaw> }>;
  };
  if (!Array.isArray(parsed.targets)) {
    throw new Error('Estrutura Scratch/SPIKE inválida (campo targets ausente).');
  }

  const spriteTarget = parsed.targets.find(
    (t) => !t.isStage && t.blocks && Object.keys(t.blocks).length > 0
  );
  if (!spriteTarget?.blocks) {
    throw new Error('Nenhum script de blocos encontrado no projeto.');
  }

  const allBlocks: Record<string, Sb3BlockRaw> = spriteTarget.blocks;
  const topBlocks = Object.entries(allBlocks).filter(([, b]) => !b.shadow && b.topLevel);
  if (topBlocks.length === 0) {
    throw new Error('O projeto não possui blocos raiz (topLevel).');
  }

  const result: WorkspaceBlock[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  let idx = 0;

  const walkChain = (startId: string | null) => {
    let currId: string | null = startId;
    while (currId && allBlocks[currId] && !visited.has(currId)) {
      visited.add(currId);
      const b: Sb3BlockRaw = allBlocks[currId];
      const op = b.opcode;

      if (op.includes('whenProgramStarts')) {
        result.push({
          id: makeBlockId(idx++),
          category: 'events',
          opcode: 'when_program_starts',
          label: 'Quando o programa iniciar',
        });
      } else if (op.includes('whenColor')) {
        const col = extractInputVal(b, allBlocks, 'COLOR', '9');
        result.push({
          id: makeBlockId(idx++),
          category: 'events',
          opcode: 'when_color_detected',
          label: 'Quando detectar cor',
          param: mapPythonColorToPt(col),
        });
      } else if (op.includes('motorSetSpeed') || op.includes('movementSpeed')) {
        const spd = Number(extractInputVal(b, allBlocks, 'SPEED', '60'));
        const clamped = Number.isFinite(spd) ? Math.max(0, Math.min(100, spd)) : 60;
        result.push({
          id: makeBlockId(idx++),
          category: 'motion',
          opcode: 'set_move_speed',
          shape: 'stack',
          label: 'Definir velocidade de movimento a',
          param: clamped,
          unit: '%',
          fields: { speed: clamped },
        });
      } else if (op.includes('motorTurnForDirection')) {
        const val = Number(extractInputVal(b, allBlocks, 'VALUE', '1'));
        const dir = extractInputVal(b, allBlocks, 'DIRECTION', 'clockwise');
        const unit = extractFieldVal(b, 'UNIT', 'rotations').toLowerCase();
        const isLeft = dir.toLowerCase().includes('counter');

        if (unit === 'rotations') {
          result.push({
            id: makeBlockId(idx++),
            category: 'motors',
            opcode: 'motor_run_rotations',
            label: 'Motor girar por',
            param: Number.isFinite(val) ? (isLeft ? -val : val) : 1,
            unit: 'rotações',
          });
        } else if (unit === 'seconds') {
          result.push({
            id: makeBlockId(idx++),
            category: 'control',
            opcode: 'wait_seconds',
            label: 'Esperar',
            param: Number.isFinite(val) ? val : 1,
            unit: 'segundos',
          });
        } else {
          result.push({
            id: makeBlockId(idx++),
            category: 'motion',
            opcode: isLeft ? 'turn_left' : 'turn_degrees',
            label: isLeft ? 'Virar à esquerda por' : 'Girar à direita por',
            param: Number.isFinite(val) ? val : 90,
            unit: 'graus',
          });
        }
      } else if (op.includes('motorStartDirection')) {
        const dir = extractInputVal(b, allBlocks, 'DIRECTION', 'clockwise');
        const isLeft = dir.toLowerCase().includes('counter');
        result.push({
          id: makeBlockId(idx++),
          category: 'motors',
          opcode: 'motor_run_rotations',
          label: 'Motor girar por',
          param: isLeft ? -1 : 1,
          unit: 'rotações',
        });
      } else if (op === 'flippermove_move' || op.includes('move_move')) {
        const val = Number(extractInputVal(b, allBlocks, 'VALUE', extractInputVal(b, allBlocks, 'DISTANCE', '10')));
        const dir = extractInputVal(b, allBlocks, 'DIRECTION', 'forward').toLowerCase();
        const unit = extractFieldVal(b, 'UNIT', 'cm').toLowerCase();
        const rawVal = Number.isFinite(val) ? val : 10;
        const cm = unit === 'cm' ? rawVal : convertDistanceToCm(rawVal, unit);
        result.push({
          id: makeBlockId(idx++),
          category: 'motion',
          opcode: 'move_distance',
          shape: 'stack',
          label: 'Mover para frente por',
          param: dir.includes('back') ? -Math.abs(cm) : cm,
          unit: unit === 'inches' ? 'polegadas' : 'cm',
          fields: { direction: dir.includes('back') ? 'backward' : 'forward', value: cm, unit: 'cm' },
        });
      } else if (op === 'flippermove_steer' || op.includes('steer')) {
        const steering = Number(extractInputVal(b, allBlocks, 'STEERING', '0'));
        const val = Number(extractInputVal(b, allBlocks, 'VALUE', '1'));
        const unit = extractFieldVal(b, 'UNIT', 'rotations');

        if (steering === 0) {
          result.push({
            id: makeBlockId(idx++),
            category: 'motion',
            opcode: 'move_distance',
            label: 'Mover para frente por',
            param: convertDistanceToCm(Number.isFinite(val) ? val : 1, unit),
            unit: 'cm',
          });
        } else {
          const isLeft = steering < 0;
          const approxDeg = Math.max(15, Math.min(360, Math.round(Math.abs(steering) * 1.8)));
          result.push({
            id: makeBlockId(idx++),
            category: 'motion',
            opcode: isLeft ? 'turn_left' : 'turn_degrees',
            label: isLeft ? 'Virar à esquerda por' : 'Girar à direita por',
            param: approxDeg,
            unit: 'graus',
          });
        }
      } else if (op.includes('ledColor')) {
        const col = extractInputVal(b, allBlocks, 'COLOR', 'Azul');
        result.push({
          id: makeBlockId(idx++),
          category: 'events',
          opcode: 'set_rgb_color',
          label: 'Acender luz RGB na cor',
          param: mapPythonColorToPt(col),
        });
      } else if (op.includes('isColor')) {
        const col = extractInputVal(b, allBlocks, 'COLOR', 'Preto');
        result.push({
          id: makeBlockId(idx++),
          category: 'sensors',
          opcode: 'color_is',
          label: 'Se Sensor de Cor for',
          param: mapPythonColorToPt(col),
        });
      } else if (op.includes('isCloserThan')) {
        const dist = Number(extractInputVal(b, allBlocks, 'VALUE', '15'));
        result.push({
          id: makeBlockId(idx++),
          category: 'sensors',
          opcode: 'dist_less_than',
          label: 'Aguardar Distância <',
          param: Number.isFinite(dist) ? dist : 15,
          unit: 'cm',
        });
      } else if (op === 'control_wait') {
        const dur = Number(extractInputVal(b, allBlocks, 'DURATION', '1'));
        result.push({
          id: makeBlockId(idx++),
          category: 'control',
          opcode: 'wait_seconds',
          label: 'Esperar',
          param: Number.isFinite(dur) ? dur : 1,
          unit: 'segundos',
        });
      } else if (op === 'control_repeat' || op === 'control_forever') {
        const times = op === 'control_forever' ? 10 : Number(extractInputVal(b, allBlocks, 'TIMES', '4'));
        result.push({
          id: makeBlockId(idx++),
          category: 'control',
          opcode: 'repeat_times',
          label: 'Repetir próximos blocos',
          param: Number.isFinite(times) ? times : 4,
          unit: 'vezes',
        });
        const subId = extractSubstackId(b);
        if (subId) {
          walkChain(subId);
        }
      } else if (op === 'data_setvariableto') {
        const val = Number(extractInputVal(b, allBlocks, 'VALUE', '50'));
        result.push({
          id: makeBlockId(idx++),
          category: 'variables',
          opcode: 'set_var',
          label: 'Definir [velocidade] para',
          param: Number.isFinite(val) ? val : 50,
        });
      } else if (op === 'data_changevariableby') {
        const val = Number(extractInputVal(b, allBlocks, 'VALUE', '10'));
        result.push({
          id: makeBlockId(idx++),
          category: 'operators',
          opcode: 'math_add',
          label: 'Somar ao acumulador +',
          param: Number.isFinite(val) ? val : 10,
        });
      } else {
        warnings.push(`Bloco '${op}' não possui equivalente direto; ignorado na importação.`);
      }

      currId = b.next;
    }
  };

  // Percorre todas as pilhas raiz ordenadas por Y para não perder scripts paralelos
  const sortedRoots = [...topBlocks].sort(
    ([, a], [, b]) => ((a as unknown as { y?: number }).y ?? 0) - ((b as unknown as { y?: number }).y ?? 0)
  );
  for (const [rootId] of sortedRoots) {
    walkChain(rootId);
  }

  if (result.length === 0) {
    throw new Error('Nenhum bloco válido pôde ser extraído do projeto.');
  }

  return { blocks: result, warnings };
}

/**
 * Importa e valida arquivos .py, .llsp3, .llsp ou .json (Scratch/SPIKE) espelhando a exportação.
 */
export async function importSpikeFile(file: File): Promise<ImportResult> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.py')) {
    const text = await file.text();
    const { blocks, warnings } = parsePythonToBlocks(text);
    return {
      success: true,
      sourceFormat: 'py',
      blocks,
      projectName: file.name.replace(/\.py$/i, ''),
      warnings,
      message: `[Importer] Script Python '${file.name}' validado e importado (${blocks.length} blocos).`,
    };
  }

  if (lowerName.endsWith('.json')) {
    const text = await file.text();
    const { blocks, warnings } = parseSb3ToBlocks(text);
    return {
      success: true,
      sourceFormat: 'sb3_json',
      blocks,
      projectName: file.name.replace(/\.json$/i, ''),
      warnings,
      message: `[Importer] JSON Scratch/SPIKE '${file.name}' importado (${blocks.length} blocos).`,
    };
  }

  if (lowerName.endsWith('.llsp3') || lowerName.endsWith('.llsp') || lowerName.endsWith('.zip')) {
    const buffer = await file.arrayBuffer();
    const entries = await readZipArchive(new Uint8Array(buffer));
    const decoder = new TextDecoder();

    const manifestRaw = entries.get('manifest.json');
    if (!manifestRaw) {
      throw new Error('Pacote .llsp3 inválido: manifest.json não encontrado.');
    }

    let manifest: { type?: string; name?: string; hardware?: Record<string, { type?: string }> };
    try {
      manifest = JSON.parse(decoder.decode(manifestRaw));
    } catch {
      throw new Error('Pacote .llsp3 inválido: manifest.json malformado.');
    }

    const hwStr = JSON.stringify(manifest.hardware ?? {}).toLowerCase();
    const detectedKit: RobotKitModel =
      hwStr.includes('smallhub') || lowerName.includes('essential')
        ? 'SPIKE_ESSENTIAL'
        : 'SPIKE_PRIME';

    // Prioriza roboblocks.json embutido para restauração 100% fiel (round-trip 1:1)
    const rbMetaRaw = entries.get('roboblocks.json');
    if (rbMetaRaw) {
      try {
        const rbMeta = JSON.parse(decoder.decode(rbMetaRaw)) as {
          robotModel?: RobotKitModel;
          blocks?: WorkspaceBlock[];
        };
        if (Array.isArray(rbMeta.blocks) && rbMeta.blocks.length > 0) {
          const restored = rehydrateLosslessBlocks(rbMeta.blocks);
          return {
            success: true,
            sourceFormat: manifest.type === 'python' ? 'llsp3_python' : 'llsp3_blocks',
            blocks: restored,
            detectedKit: rbMeta.robotModel ?? detectedKit,
            projectName: manifest.name,
            warnings: [],
            message: `[Importer] Projeto '${file.name}' restaurado com fidelidade 1:1 (${restored.length} blocos).`,
          };
        }
      } catch {
        // Fallback para leitura padrão .sb3 / .py
      }
    }

    if (manifest.type === 'python' || entries.has('projectbody.json')) {
      const bodyRaw = entries.get('projectbody.json');
      if (!bodyRaw) {
        throw new Error('Pacote .llsp3 Python inválido: projectbody.json ausente.');
      }
      const body = JSON.parse(decoder.decode(bodyRaw)) as { main?: string };
      if (typeof body.main !== 'string') {
        throw new Error('Pacote .llsp3 Python inválido: campo main ausente.');
      }
      const { blocks, warnings } = parsePythonToBlocks(body.main);
      return {
        success: true,
        sourceFormat: 'llsp3_python',
        blocks,
        detectedKit,
        projectName: manifest.name,
        warnings,
        message: `[Importer] Pacote .llsp3 (Python) '${file.name}' importado (${blocks.length} blocos).`,
      };
    }

    const sb3Raw = entries.get('scratch.sb3');
    if (!sb3Raw) {
      throw new Error('Pacote .llsp3 de blocos inválido: scratch.sb3 não encontrado.');
    }
    const sb3Entries = await readZipArchive(sb3Raw);
    const projectJsonRaw = sb3Entries.get('project.json');
    if (!projectJsonRaw) {
      throw new Error('Pacote scratch.sb3 inválido: project.json ausente.');
    }
    const { blocks, warnings } = parseSb3ToBlocks(decoder.decode(projectJsonRaw));
    return {
      success: true,
      sourceFormat: 'llsp3_blocks',
      blocks,
      detectedKit,
      projectName: manifest.name,
      warnings,
      message: `[Importer] Pacote .llsp3 (Blocos) '${file.name}' importado (${blocks.length} blocos).`,
    };
  }

  throw new Error(
    `Extensão não suportada para '${file.name}'. Use arquivos .llsp3, .llsp, .py ou .json.`
  );
}
