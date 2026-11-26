import type { RobotKitModel } from './database';
import type { WorkspaceBlock } from '../stores/workspace.store';

export interface ImportResult {
  success: boolean;
  sourceFormat: 'py' | 'llsp3_blocks' | 'llsp3_python';
  blocks: WorkspaceBlock[];
  detectedKit?: RobotKitModel;
  projectName?: string;
  warnings: string[];
  message: string;
}

function makeBlockId(index: number): string {
  return `blk-imp-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Descompressão deflate-raw não suportada neste ambiente.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  await writer.write(new Uint8Array(compressed));
  await writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Leitor ZIP minimalista compatível com .llsp3 e .sb3 (suporta STORED=0 e DEFLATED=8)
 */
async function readZipArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  // Localiza End of Central Directory (PK\x05\x06)
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

    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
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

function mapPythonColorToPt(token: string): string {
  const lower = token.toLowerCase();
  if (lower.includes('black') || lower.includes('preto')) return 'Preto';
  if (lower.includes('red') || lower.includes('vermelho')) return 'Vermelho';
  if (lower.includes('green') || lower.includes('verde')) return 'Verde';
  if (lower.includes('blue') || lower.includes('azul')) return 'Azul';
  if (lower.includes('yellow') || lower.includes('amarelo')) return 'Amarelo';
  if (lower.includes('white') || lower.includes('branco')) return 'Branco';
  if (lower.includes('magenta') || lower.includes('purple') || lower.includes('roxo')) return 'Magenta';
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
    if (!line || line.startsWith('#') || line.startsWith('from ') || line.startsWith('import ') || line.startsWith('async def ') || line.startsWith('runloop.run')) {
      continue;
    }

    // Chameleon mode marker or helper
    if (line.includes('chameleon_mode') || line.includes('MODO_CAMALEAO')) {
      const enabled = !line.includes('False');
      blocks.push({
        id: makeBlockId(idx++),
        category: 'sensors',
        opcode: 'set_chameleon_mode',
        label: 'Modo Camaleão (LED = Cor do piso)',
        param: enabled ? 'Ativado' : 'Desativado',
      });
      continue;
    }

    // LED RGB (light.color / hub.light.on)
    const ledMatch = /(?:light\.color|hub\.light\.on)\((?:light\.POWER,\s*)?(?:color\.|Color\.)([A-Z]+)\)/.exec(line);
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

    // Velocidade SPIKE v3: velocidade_padrao = 600
    const speedSpike = /velocidade_padrao\s*=\s*(\d+(?:\.\d+)?)/.exec(line);
    if (speedSpike) {
      const pct = Math.max(5, Math.min(100, Math.round(Number(speedSpike[1]) / 10)));
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

    // Velocidade Pybricks: robot.settings(straight_speed=300)
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

    // Movimento / Giro SPIKE v3: motor_pair.move_for_degrees(PAIR_1, deg, steering, ...)
    const movePair = /motor_pair\.move_for_degrees\([^,]+,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+)/.exec(line);
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

    // Pybricks straight / turn
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

    // Espera
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

    // Loop repeat
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

    // Sensor de cor
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

    // Sensor de distância
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
    warnings.push('Nenhuma instrução de movimento/sensor reconhecida; apenas o bloco inicial foi carregado.');
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

function extractInputVal(block: Sb3BlockRaw, allBlocks: Record<string, Sb3BlockRaw>, key: string, fallback: string): string {
  const inp = block.inputs?.[key];
  if (!Array.isArray(inp)) return fallback;
  const val = inp[1];
  if (Array.isArray(val) && val.length >= 2) {
    return String(val[1]);
  }
  if (typeof val === 'string' && allBlocks[val]) {
    const shadowBlk = allBlocks[val];
    const firstField = Object.values(shadowBlk.fields ?? {})[0];
    if (Array.isArray(firstField) && firstField.length >= 1) {
      return String(firstField[0]);
    }
  }
  return fallback;
}

function parseSb3ToBlocks(projectJsonText: string): { blocks: WorkspaceBlock[]; warnings: string[] } {
  const parsed = JSON.parse(projectJsonText) as {
    targets?: Array<{ isStage?: boolean; blocks?: Record<string, Sb3BlockRaw> }>;
  };
  if (!Array.isArray(parsed.targets)) {
    throw new Error('Estrutura scratch.sb3 inválida (targets ausente).');
  }

  const spriteTarget = parsed.targets.find((t) => !t.isStage && t.blocks && Object.keys(t.blocks).length > 0);
  if (!spriteTarget?.blocks) {
    throw new Error('Nenhum script de blocos encontrado dentro de scratch.sb3.');
  }

  const allBlocks = spriteTarget.blocks;
  const topBlocks = Object.entries(allBlocks).filter(([, b]) => !b.shadow && b.topLevel);
  if (topBlocks.length === 0) {
    throw new Error('O projeto .llsp3 não possui blocos raiz (topLevel).');
  }

  const result: WorkspaceBlock[] = [];
  const warnings: string[] = [];
  let idx = 0;

  let currId: string | null = topBlocks[0][0];
  const visited = new Set<string>();

  while (currId && allBlocks[currId] && !visited.has(currId)) {
    visited.add(currId);
    const b: Sb3BlockRaw = allBlocks[currId];

    if (b.opcode.includes('whenProgramStarts')) {
      result.push({
        id: makeBlockId(idx++),
        category: 'events',
        opcode: 'when_program_starts',
        label: 'Quando o programa iniciar',
      });
    } else if (b.opcode.includes('motorTurnForDirection')) {
      const val = Number(extractInputVal(b, allBlocks, 'VALUE', '90'));
      const dir = extractInputVal(b, allBlocks, 'DIRECTION', 'clockwise');
      const isLeft = dir.toLowerCase().includes('counter');
      result.push({
        id: makeBlockId(idx++),
        category: 'motion',
        opcode: isLeft ? 'turn_left' : 'turn_degrees',
        label: isLeft ? 'Virar à esquerda por' : 'Girar à direita por',
        param: Number.isFinite(val) ? val : 90,
        unit: 'graus',
      });
    } else if (b.opcode.includes('move') || b.opcode.includes('Move')) {
      const dist = Number(extractInputVal(b, allBlocks, 'DISTANCE', '20'));
      result.push({
        id: makeBlockId(idx++),
        category: 'motion',
        opcode: 'move_distance',
        label: 'Mover para frente por',
        param: Number.isFinite(dist) ? dist : 20,
        unit: 'cm',
      });
    } else if (b.opcode === 'control_wait') {
      const dur = Number(extractInputVal(b, allBlocks, 'DURATION', '1'));
      result.push({
        id: makeBlockId(idx++),
        category: 'control',
        opcode: 'wait_seconds',
        label: 'Esperar',
        param: Number.isFinite(dur) ? dur : 1,
        unit: 'segundos',
      });
    } else {
      warnings.push(`Bloco Scratch '${b.opcode}' importado como esperar 1s.`);
      result.push({
        id: makeBlockId(idx++),
        category: 'control',
        opcode: 'wait_seconds',
        label: 'Esperar',
        param: 1,
        unit: 'segundos',
      });
    }

    currId = b.next;
  }

  return { blocks: result, warnings };
}

/**
 * Importa e valida arquivos .py ou .llsp3 (Word Blocks ou Python) espelhando a exportação.
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

  if (lowerName.endsWith('.llsp3') || lowerName.endsWith('.zip')) {
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
    const detectedKit: RobotKitModel = hwStr.includes('smallhub') || lowerName.includes('essential')
      ? 'SPIKE_ESSENTIAL'
      : 'SPIKE_PRIME';

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

  throw new Error(`Extensão não suportada para '${file.name}'. Use arquivos .py ou .llsp3.`);
}
