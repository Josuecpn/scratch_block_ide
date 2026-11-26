import type { BlockCategoryKey, BlockShape } from '../types/blocks';

export interface CategoryMeta {
  key: BlockCategoryKey;
  label: string;
  color: string;
  icon: string;
}

export const BLOCK_CATEGORIES: CategoryMeta[] = [
  { key: 'motors', label: 'Motores', color: '#0090FF', icon: '⚙️' },
  { key: 'motion', label: 'Movimento', color: '#FF4D94', icon: '🛞' },
  { key: 'light', label: 'Luz', color: '#8A4FFF', icon: '💡' },
  { key: 'sound', label: 'Som', color: '#B347FF', icon: '🔊' },
  { key: 'events', label: 'Eventos', color: '#FFBF00', icon: '⚡' },
  { key: 'control', label: 'Controle', color: '#FF9900', icon: '🔁' },
  { key: 'sensors', label: 'Sensores', color: '#00B8E6', icon: '📡' },
  { key: 'operators', label: 'Operadores', color: '#38B000', icon: '➗' },
  { key: 'variables', label: 'Variáveis', color: '#FF8C1A', icon: '📦' },
  { key: 'lists', label: 'Listas', color: '#FF661A', icon: '📋' },
  { key: 'my_blocks', label: 'Meus Blocos', color: '#FF4D6D', icon: '🧩' },
];

export interface ColorSwatch {
  name: string;
  hex: string;
}

export const SPIKE_COLOR_SWATCHES: ColorSwatch[] = [
  { name: 'Preto', hex: '#111827' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Amarelo', hex: '#facc15' },
  { name: 'Branco', hex: '#f8fafc' },
  { name: 'Magenta', hex: '#d946ef' },
];

export type BlockToken =
  | { kind: 'text'; text: string }
  | { kind: 'icon'; icon: string }
  | { kind: 'port'; field: string }
  | { kind: 'number'; field: string; min?: number; max?: number }
  | { kind: 'string'; field: string }
  | { kind: 'select'; field: string; options: Array<{ value: string; label: string }> }
  | { kind: 'color'; field: string }
  | { kind: 'matrix'; field: string }
  | { kind: 'dial'; field: string }
  | { kind: 'slot_value'; slot: string; defaultVal?: string | number }
  | { kind: 'slot_bool'; slot: string }
  | { kind: 'var_select'; field: string }
  | { kind: 'list_select'; field: string }
  | { kind: 'msg_select'; field: string };

export interface BlockCatalogEntry {
  opcode: string;
  category: BlockCategoryKey;
  shape: BlockShape;
  label: string;
  defaultParam?: string | number;
  defaultUnit?: string;
  defaultFields?: Record<string, string | number | boolean>;
  tokens: BlockToken[];
}

const DIRECTION_CW = [
  { value: 'clockwise', label: '↻ Horário' },
  { value: 'counterclockwise', label: '↺ Anti-horário' },
];

const MOVE_DIRECTIONS = [
  { value: 'forward', label: '↑ frente' },
  { value: 'backward', label: '↓ trás' },
  { value: 'right', label: '↻ girar direita' },
  { value: 'left', label: '↺ girar esquerda' },
];

const TILT_DIRECTIONS = [
  { value: 'front', label: '↑ frente' },
  { value: 'back', label: '↓ trás' },
  { value: 'left', label: '← esquerda' },
  { value: 'right', label: '→ direita' },
  { value: 'up', label: 'para cima' },
  { value: 'down', label: 'para baixo' },
];

const FACE_SIDES = [
  { value: 'front', label: 'parte da frente' },
  { value: 'back', label: 'parte de trás' },
  { value: 'left', label: 'lado esquerdo' },
  { value: 'right', label: 'lado direito' },
  { value: 'top', label: 'cima' },
  { value: 'bottom', label: 'baixo' },
];

const GESTURES = [
  { value: 'shaken', label: 'balançado' },
  { value: 'tapped', label: 'tocado' },
  { value: 'falling', label: 'em queda livre' },
];

export const BLOCK_CATALOG: BlockCatalogEntry[] = [
  // ── A. MOTORES (#0090FF) ──
  {
    opcode: 'motor_run_for',
    category: 'motors',
    shape: 'stack',
    label: 'Executar motor por',
    defaultParam: 1,
    defaultUnit: 'rotações',
    defaultFields: { port: 'A', direction: 'clockwise', value: 1, unit: 'rotations' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'executar' },
      { kind: 'select', field: 'direction', options: DIRECTION_CW },
      { kind: 'text', text: 'por' },
      { kind: 'number', field: 'value' },
      {
        kind: 'select',
        field: 'unit',
        options: [
          { value: 'rotations', label: 'rotações' },
          { value: 'degrees', label: 'graus' },
          { value: 'seconds', label: 'segundos' },
        ],
      },
    ],
  },
  {
    opcode: 'motor_go_to_position',
    category: 'motors',
    shape: 'stack',
    label: 'Ir para posição',
    defaultFields: { port: 'A', mode: 'shortest', position: 0 },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'ir' },
      {
        kind: 'select',
        field: 'mode',
        options: [
          { value: 'shortest', label: 'pelo caminho mais curto' },
          { value: 'clockwise', label: 'horário' },
          { value: 'counterclockwise', label: 'anti-horário' },
        ],
      },
      { kind: 'text', text: 'para a posição' },
      { kind: 'number', field: 'position', min: 0, max: 359 },
    ],
  },
  {
    opcode: 'motor_start',
    category: 'motors',
    shape: 'stack',
    label: 'Iniciar motor',
    defaultFields: { port: 'A', direction: 'clockwise' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'iniciar motor' },
      { kind: 'select', field: 'direction', options: DIRECTION_CW },
    ],
  },
  {
    opcode: 'motor_stop',
    category: 'motors',
    shape: 'stack',
    label: 'Parar motor',
    defaultFields: { port: 'A' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'parar motor' },
    ],
  },
  {
    opcode: 'motor_set_speed',
    category: 'motors',
    shape: 'stack',
    label: 'Definir velocidade do motor',
    defaultParam: 75,
    defaultUnit: '%',
    defaultFields: { port: 'A', speed: 75 },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'definir velocidade a' },
      { kind: 'number', field: 'speed', min: -100, max: 100 },
      { kind: 'text', text: '%' },
    ],
  },
  {
    opcode: 'motor_position',
    category: 'motors',
    shape: 'reporter',
    label: 'Posição do motor',
    defaultFields: { port: 'A' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'posição' },
    ],
  },
  {
    opcode: 'motor_speed',
    category: 'motors',
    shape: 'reporter',
    label: 'Velocidade do motor',
    defaultFields: { port: 'A' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'velocidade' },
    ],
  },

  // ── B. MOVIMENTO (#FF4D94) ──
  {
    opcode: 'move_direction_for',
    category: 'motion',
    shape: 'stack',
    label: 'Mover direção por',
    defaultParam: 20,
    defaultUnit: 'cm',
    defaultFields: { direction: 'forward', value: 20, unit: 'cm' },
    tokens: [
      { kind: 'text', text: 'mover' },
      { kind: 'select', field: 'direction', options: MOVE_DIRECTIONS },
      { kind: 'text', text: 'por' },
      { kind: 'number', field: 'value' },
      {
        kind: 'select',
        field: 'unit',
        options: [
          { value: 'rotations', label: 'rotações' },
          { value: 'degrees', label: 'graus' },
          { value: 'seconds', label: 'segundos' },
          { value: 'cm', label: 'cm' },
          { value: 'inches', label: 'polegadas' },
        ],
      },
    ],
  },
  {
    opcode: 'move_start_direction',
    category: 'motion',
    shape: 'stack',
    label: 'Iniciar movimento',
    defaultFields: { direction: 'forward' },
    tokens: [
      { kind: 'text', text: 'iniciar movimento' },
      { kind: 'select', field: 'direction', options: MOVE_DIRECTIONS },
    ],
  },
  {
    opcode: 'move_steer_for',
    category: 'motion',
    shape: 'stack',
    label: 'Mover com curva por',
    defaultFields: { steering: 30, value: 1, unit: 'rotations' },
    tokens: [
      { kind: 'text', text: 'mover' },
      { kind: 'dial', field: 'steering' },
      { kind: 'text', text: 'por' },
      { kind: 'number', field: 'value' },
      {
        kind: 'select',
        field: 'unit',
        options: [
          { value: 'rotations', label: 'rotações' },
          { value: 'degrees', label: 'graus' },
          { value: 'seconds', label: 'segundos' },
        ],
      },
    ],
  },
  {
    opcode: 'move_steer_start',
    category: 'motion',
    shape: 'stack',
    label: 'Iniciar movimento com curva',
    defaultFields: { steering: 30 },
    tokens: [
      { kind: 'text', text: 'iniciar movimento' },
      { kind: 'dial', field: 'steering' },
    ],
  },
  {
    opcode: 'move_stop',
    category: 'motion',
    shape: 'stack',
    label: 'Parar de mover',
    tokens: [{ kind: 'text', text: 'parar de mover' }],
  },
  {
    opcode: 'set_move_speed',
    category: 'motion',
    shape: 'stack',
    label: 'Definir velocidade de movimento a',
    defaultParam: 60,
    defaultUnit: '%',
    defaultFields: { speed: 60 },
    tokens: [
      { kind: 'text', text: 'definir velocidade de movimento a' },
      { kind: 'number', field: 'speed', min: 1, max: 100 },
      { kind: 'text', text: '%' },
    ],
  },
  {
    opcode: 'set_motor_rotation_distance',
    category: 'motion',
    shape: 'stack',
    label: 'Definir 1 rotação do motor a',
    defaultFields: { value: 17.5, unit: 'cm' },
    tokens: [
      { kind: 'text', text: 'definir 1 rotação do motor a' },
      { kind: 'number', field: 'value', min: 1 },
      {
        kind: 'select',
        field: 'unit',
        options: [
          { value: 'cm', label: 'cm' },
          { value: 'inches', label: 'polegadas' },
        ],
      },
    ],
  },

  // ── C. LUZ (#8A4FFF) ──
  {
    opcode: 'light_matrix_for',
    category: 'light',
    shape: 'stack',
    label: 'Ligar matriz de pixels por',
    defaultFields: { port: 'Hub', matrix: '0101001010000001000101110', seconds: 2 },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'liga' },
      { kind: 'matrix', field: 'matrix' },
      { kind: 'text', text: 'por' },
      { kind: 'number', field: 'seconds', min: 0 },
      { kind: 'text', text: 'segundos' },
    ],
  },
  {
    opcode: 'light_matrix_on',
    category: 'light',
    shape: 'stack',
    label: 'Ligar matriz de pixels',
    defaultFields: { port: 'Hub', matrix: '0101011111111110111000100' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'liga' },
      { kind: 'matrix', field: 'matrix' },
    ],
  },
  {
    opcode: 'light_pixels_off',
    category: 'light',
    shape: 'stack',
    label: 'Desligar pixels',
    defaultFields: { port: 'Hub' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'desliga pixels' },
    ],
  },
  {
    opcode: 'light_set_brightness',
    category: 'light',
    shape: 'stack',
    label: 'Definir brilho do pixel',
    defaultFields: { port: 'Hub', brightness: 100 },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'define brilho do pixel para' },
      { kind: 'number', field: 'brightness', min: 0, max: 100 },
      { kind: 'text', text: '%' },
    ],
  },
  {
    opcode: 'light_set_pixel',
    category: 'light',
    shape: 'stack',
    label: 'Definir pixel em (col, lin)',
    defaultFields: { port: 'Hub', col: 3, row: 3 },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'define pixel em' },
      { kind: 'number', field: 'col', min: 1, max: 5 },
      { kind: 'text', text: ',' },
      { kind: 'number', field: 'row', min: 1, max: 5 },
    ],
  },
  {
    opcode: 'light_rotate',
    category: 'light',
    shape: 'stack',
    label: 'Girar matriz de pixels',
    defaultFields: { port: 'Hub', direction: 'clockwise' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'gira' },
      { kind: 'select', field: 'direction', options: DIRECTION_CW },
    ],
  },
  {
    opcode: 'light_set_orientation',
    category: 'light',
    shape: 'stack',
    label: 'Definir orientação da matriz',
    defaultFields: { port: 'Hub', orientation: 'vertical' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'define orientação para' },
      {
        kind: 'select',
        field: 'orientation',
        options: [
          { value: 'vertical', label: 'vertical' },
          { value: 'horizontal', label: 'horizontal' },
          { value: 'inverted', label: 'invertido' },
        ],
      },
    ],
  },
  {
    opcode: 'set_rgb_color',
    category: 'light',
    shape: 'stack',
    label: 'Definir luz do botão central',
    defaultParam: 'Azul',
    defaultFields: { color: 'Azul' },
    tokens: [
      { kind: 'text', text: 'definir luz do botão central como' },
      { kind: 'color', field: 'color' },
    ],
  },

  // ── D. SOM (#B347FF) ──
  {
    opcode: 'sound_play_until_done',
    category: 'sound',
    shape: 'stack',
    label: 'Reproduzir som até concluir',
    defaultFields: { sound: 'Cat Meow 1' },
    tokens: [
      { kind: 'text', text: 'reproduzir som' },
      {
        kind: 'select',
        field: 'sound',
        options: [
          { value: 'Cat Meow 1', label: 'Cat Meow 1' },
          { value: 'Beep', label: 'Beep' },
          { value: 'Laser', label: 'Laser' },
          { value: 'Tada', label: 'Tada' },
          { value: 'Win', label: 'Win' },
        ],
      },
      { kind: 'text', text: 'até que esteja concluído' },
    ],
  },
  {
    opcode: 'sound_start',
    category: 'sound',
    shape: 'stack',
    label: 'Iniciar som',
    defaultFields: { sound: 'Beep' },
    tokens: [
      { kind: 'text', text: 'iniciar som' },
      {
        kind: 'select',
        field: 'sound',
        options: [
          { value: 'Beep', label: 'Beep' },
          { value: 'Cat Meow 1', label: 'Cat Meow 1' },
          { value: 'Laser', label: 'Laser' },
          { value: 'Tada', label: 'Tada' },
          { value: 'Win', label: 'Win' },
        ],
      },
    ],
  },
  {
    opcode: 'sound_stop_all',
    category: 'sound',
    shape: 'stack',
    label: 'Parar todos os sons',
    tokens: [{ kind: 'text', text: 'parar todos os sons' }],
  },
  {
    opcode: 'sound_change_effect',
    category: 'sound',
    shape: 'stack',
    label: 'Adicionar ao efeito sonoro',
    defaultFields: { effect: 'pitch', value: 10 },
    tokens: [
      { kind: 'text', text: 'adiciona ao teu efeito' },
      {
        kind: 'select',
        field: 'effect',
        options: [
          { value: 'pitch', label: 'tom' },
          { value: 'pan', label: 'pan' },
        ],
      },
      { kind: 'text', text: 'o valor' },
      { kind: 'number', field: 'value' },
    ],
  },
  {
    opcode: 'sound_set_effect',
    category: 'sound',
    shape: 'stack',
    label: 'Alterar efeito sonoro',
    defaultFields: { effect: 'pitch', value: 100 },
    tokens: [
      { kind: 'text', text: 'altera o teu efeito' },
      {
        kind: 'select',
        field: 'effect',
        options: [
          { value: 'pitch', label: 'tom' },
          { value: 'pan', label: 'pan' },
        ],
      },
      { kind: 'text', text: 'para' },
      { kind: 'number', field: 'value' },
    ],
  },
  {
    opcode: 'sound_clear_effects',
    category: 'sound',
    shape: 'stack',
    label: 'Cancelar efeitos sonoros',
    tokens: [{ kind: 'text', text: 'cancela todos os teus efeitos sonoros' }],
  },
  {
    opcode: 'sound_change_volume',
    category: 'sound',
    shape: 'stack',
    label: 'Adicionar ao volume',
    defaultFields: { value: -10 },
    tokens: [
      { kind: 'text', text: 'adiciona' },
      { kind: 'number', field: 'value' },
      { kind: 'text', text: '% ao teu volume' },
    ],
  },
  {
    opcode: 'sound_set_volume',
    category: 'sound',
    shape: 'stack',
    label: 'Alterar volume para',
    defaultFields: { value: 100 },
    tokens: [
      { kind: 'text', text: 'altera o teu volume para' },
      { kind: 'number', field: 'value', min: 0, max: 100 },
      { kind: 'text', text: '%' },
    ],
  },
  {
    opcode: 'sound_volume',
    category: 'sound',
    shape: 'reporter',
    label: 'O volume',
    tokens: [{ kind: 'text', text: 'o volume' }],
  },

  // ── E. EVENTOS (#FFBF00) ──
  {
    opcode: 'when_program_starts',
    category: 'events',
    shape: 'hat',
    label: 'Quando o programa iniciar',
    tokens: [
      { kind: 'icon', icon: '▶' },
      { kind: 'text', text: 'quando o programa iniciar' },
    ],
  },
  {
    opcode: 'when_color_detected',
    category: 'events',
    shape: 'hat',
    label: 'Quando a cor é',
    defaultParam: 'Vermelho',
    defaultFields: { port: 'C', color: 'Vermelho' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'quando a cor é' },
      { kind: 'color', field: 'color' },
    ],
  },
  {
    opcode: 'when_tilted',
    category: 'events',
    shape: 'hat',
    label: 'Quando inclinado',
    defaultFields: { direction: 'front' },
    tokens: [
      { kind: 'text', text: 'quando' },
      { kind: 'select', field: 'direction', options: TILT_DIRECTIONS },
      { kind: 'text', text: 'inclinado' },
    ],
  },
  {
    opcode: 'when_face_up',
    category: 'events',
    shape: 'hat',
    label: 'Quando face está para cima',
    defaultFields: { side: 'top' },
    tokens: [
      { kind: 'text', text: 'quando' },
      { kind: 'select', field: 'side', options: FACE_SIDES },
      { kind: 'text', text: 'está para cima' },
    ],
  },
  {
    opcode: 'when_gesture',
    category: 'events',
    shape: 'hat',
    label: 'Quando gesto do Hub',
    defaultFields: { gesture: 'shaken' },
    tokens: [
      { kind: 'text', text: 'quando' },
      { kind: 'select', field: 'gesture', options: GESTURES },
    ],
  },
  {
    opcode: 'when_timer_gt',
    category: 'events',
    shape: 'hat',
    label: 'Quando temporizador >',
    defaultFields: { value: 5 },
    tokens: [
      { kind: 'text', text: 'quando o temporizador >' },
      { kind: 'number', field: 'value', min: 0 },
    ],
  },
  {
    opcode: 'when_condition',
    category: 'events',
    shape: 'hat',
    label: 'Quando condição booleana',
    tokens: [
      { kind: 'text', text: 'quando' },
      { kind: 'slot_bool', slot: 'CONDITION' },
    ],
  },
  {
    opcode: 'when_message_received',
    category: 'events',
    shape: 'hat',
    label: 'Quando receberes a mensagem',
    defaultFields: { message: 'Mensagem 1' },
    tokens: [
      { kind: 'text', text: 'Quando receberes a mensagem' },
      { kind: 'msg_select', field: 'message' },
    ],
  },
  {
    opcode: 'broadcast_message',
    category: 'events',
    shape: 'stack',
    label: 'Difunde a mensagem',
    defaultFields: { message: 'Mensagem 1' },
    tokens: [
      { kind: 'text', text: 'difunde a mensagem' },
      { kind: 'msg_select', field: 'message' },
    ],
  },
  {
    opcode: 'broadcast_message_wait',
    category: 'events',
    shape: 'stack',
    label: 'Difunde a mensagem e espera',
    defaultFields: { message: 'Mensagem 1' },
    tokens: [
      { kind: 'text', text: 'difunde a mensagem' },
      { kind: 'msg_select', field: 'message' },
      { kind: 'text', text: 'e espera' },
    ],
  },

  // ── F. CONTROLE (#FF9900) ──
  {
    opcode: 'wait_seconds',
    category: 'control',
    shape: 'stack',
    label: 'Espera (s)',
    defaultParam: 1,
    defaultUnit: 's',
    defaultFields: { seconds: 1 },
    tokens: [
      { kind: 'text', text: 'espera' },
      { kind: 'number', field: 'seconds', min: 0 },
      { kind: 'text', text: 's' },
    ],
  },
  {
    opcode: 'repeat_times',
    category: 'control',
    shape: 'c_block',
    label: 'Repete N vezes',
    defaultParam: 10,
    defaultFields: { times: 10 },
    tokens: [
      { kind: 'text', text: 'repete' },
      { kind: 'number', field: 'times', min: 1 },
      { kind: 'text', text: 'vezes' },
    ],
  },
  {
    opcode: 'repeat_forever',
    category: 'control',
    shape: 'c_block',
    label: 'Repete para sempre',
    tokens: [{ kind: 'text', text: 'repete para sempre' }],
  },
  {
    opcode: 'if_then',
    category: 'control',
    shape: 'c_block',
    label: 'Se ... então',
    tokens: [
      { kind: 'text', text: 'se' },
      { kind: 'slot_bool', slot: 'CONDITION' },
      { kind: 'text', text: ', então' },
    ],
  },
  {
    opcode: 'if_then_else',
    category: 'control',
    shape: 'e_block',
    label: 'Se ... então ... senão',
    tokens: [
      { kind: 'text', text: 'se' },
      { kind: 'slot_bool', slot: 'CONDITION' },
      { kind: 'text', text: ', então' },
    ],
  },
  {
    opcode: 'wait_until',
    category: 'control',
    shape: 'stack',
    label: 'Espera até que',
    tokens: [
      { kind: 'text', text: 'espera até que' },
      { kind: 'slot_bool', slot: 'CONDITION' },
    ],
  },
  {
    opcode: 'repeat_until',
    category: 'control',
    shape: 'c_block',
    label: 'Até que ... repete',
    tokens: [
      { kind: 'text', text: 'até que' },
      { kind: 'slot_bool', slot: 'CONDITION' },
      { kind: 'text', text: ', repete' },
    ],
  },
  {
    opcode: 'stop_other_stacks',
    category: 'control',
    shape: 'stack',
    label: 'Parar outras pilhas',
    tokens: [{ kind: 'text', text: 'parar outras pilhas' }],
  },
  {
    opcode: 'stop_scripts',
    category: 'control',
    shape: 'cap',
    label: 'Parar scripts',
    defaultFields: { target: 'all' },
    tokens: [
      { kind: 'text', text: 'parar' },
      {
        kind: 'select',
        field: 'target',
        options: [
          { value: 'all', label: 'todas' },
          { value: 'this', label: 'este script' },
          { value: 'others', label: 'outros scripts' },
        ],
      },
    ],
  },

  // ── G. SENSORES (#00B8E6) ──
  {
    opcode: 'color_is',
    category: 'sensors',
    shape: 'boolean',
    label: 'É a cor ?',
    defaultParam: 'Preto',
    defaultFields: { port: 'C', color: 'Preto' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'é a cor' },
      { kind: 'color', field: 'color' },
      { kind: 'text', text: '?' },
    ],
  },
  {
    opcode: 'sensor_reflection_cmp',
    category: 'sensors',
    shape: 'boolean',
    label: 'Reflexo < / = / > % ?',
    defaultFields: { port: 'C', op: '<', value: 50 },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'reflexo' },
      {
        kind: 'select',
        field: 'op',
        options: [
          { value: '<', label: '<' },
          { value: '=', label: '=' },
          { value: '>', label: '>' },
        ],
      },
      { kind: 'number', field: 'value', min: 0, max: 100 },
      { kind: 'text', text: '% ?' },
    ],
  },
  {
    opcode: 'hub_is_tilted',
    category: 'sensors',
    shape: 'boolean',
    label: 'Hub está inclinado?',
    defaultFields: { direction: 'front' },
    tokens: [
      { kind: 'text', text: '[Hub]' },
      { kind: 'select', field: 'direction', options: TILT_DIRECTIONS.slice(0, 4) },
      { kind: 'text', text: 'está inclinado?' },
    ],
  },
  {
    opcode: 'hub_face_up',
    category: 'sensors',
    shape: 'boolean',
    label: 'Hub face para cima?',
    defaultFields: { side: 'top' },
    tokens: [
      { kind: 'text', text: '[Hub]' },
      { kind: 'select', field: 'side', options: FACE_SIDES },
      { kind: 'text', text: 'está para cima?' },
    ],
  },
  {
    opcode: 'hub_gesture_is',
    category: 'sensors',
    shape: 'boolean',
    label: 'Hub gesto?',
    defaultFields: { gesture: 'shaken' },
    tokens: [
      { kind: 'text', text: '[Hub] é' },
      { kind: 'select', field: 'gesture', options: GESTURES },
      { kind: 'text', text: '?' },
    ],
  },
  {
    opcode: 'sensor_color_value',
    category: 'sensors',
    shape: 'reporter',
    label: 'Cor lida',
    defaultFields: { port: 'C' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'cor' },
    ],
  },
  {
    opcode: 'sensor_reflected_light',
    category: 'sensors',
    shape: 'reporter',
    label: 'Luz refletida',
    defaultFields: { port: 'C' },
    tokens: [
      { kind: 'port', field: 'port' },
      { kind: 'text', text: 'luz refletida' },
    ],
  },
  {
    opcode: 'hub_imu_angle',
    category: 'sensors',
    shape: 'reporter',
    label: 'Ângulo IMU do Hub',
    defaultFields: { axis: 'yaw' },
    tokens: [
      { kind: 'text', text: '[Hub]' },
      {
        kind: 'select',
        field: 'axis',
        options: [
          { value: 'pitch', label: 'arfagem' },
          { value: 'roll', label: 'rotação' },
          { value: 'yaw', label: 'guinada' },
        ],
      },
      { kind: 'text', text: 'ângulo' },
    ],
  },
  {
    opcode: 'sensor_timer',
    category: 'sensors',
    shape: 'reporter',
    label: 'Temporizador',
    tokens: [{ kind: 'text', text: 'temporizador' }],
  },
  {
    opcode: 'hub_reset_yaw',
    category: 'sensors',
    shape: 'stack',
    label: 'Definir ângulo de guinada como 0',
    tokens: [{ kind: 'text', text: '[Hub] definir o ângulo de guinada como 0' }],
  },
  {
    opcode: 'reset_timer',
    category: 'sensors',
    shape: 'stack',
    label: 'Redefinir temporizador',
    tokens: [{ kind: 'text', text: 'redefinir temporizador' }],
  },
  {
    opcode: 'set_chameleon_mode',
    category: 'sensors',
    shape: 'stack',
    label: 'Modo Camaleão (LED = Cor do piso)',
    defaultParam: 'Ativado',
    defaultFields: { enabled: 'Ativado' },
    tokens: [
      { kind: 'text', text: 'Modo Camaleão' },
      {
        kind: 'select',
        field: 'enabled',
        options: [
          { value: 'Ativado', label: 'Ativado' },
          { value: 'Desativado', label: 'Desativado' },
        ],
      },
    ],
  },

  // ── H. OPERADORES (#38B000) ──
  {
    opcode: 'op_random',
    category: 'operators',
    shape: 'reporter',
    label: 'Valor ao acaso entre',
    defaultFields: { from: 1, to: 10 },
    tokens: [
      { kind: 'text', text: 'um valor ao acaso entre' },
      { kind: 'number', field: 'from' },
      { kind: 'text', text: 'e' },
      { kind: 'number', field: 'to' },
    ],
  },
  {
    opcode: 'op_add',
    category: 'operators',
    shape: 'reporter',
    label: 'Somar',
    defaultFields: { a: 0, b: 0 },
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: 0 },
      { kind: 'text', text: '+' },
      { kind: 'slot_value', slot: 'B', defaultVal: 0 },
    ],
  },
  {
    opcode: 'op_sub',
    category: 'operators',
    shape: 'reporter',
    label: 'Subtrair',
    defaultFields: { a: 0, b: 0 },
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: 0 },
      { kind: 'text', text: '-' },
      { kind: 'slot_value', slot: 'B', defaultVal: 0 },
    ],
  },
  {
    opcode: 'op_mul',
    category: 'operators',
    shape: 'reporter',
    label: 'Multiplicar',
    defaultFields: { a: 0, b: 0 },
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: 0 },
      { kind: 'text', text: '×' },
      { kind: 'slot_value', slot: 'B', defaultVal: 0 },
    ],
  },
  {
    opcode: 'op_div',
    category: 'operators',
    shape: 'reporter',
    label: 'Dividir',
    defaultFields: { a: 0, b: 1 },
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: 0 },
      { kind: 'text', text: '/' },
      { kind: 'slot_value', slot: 'B', defaultVal: 1 },
    ],
  },
  {
    opcode: 'op_join',
    category: 'operators',
    shape: 'reporter',
    label: 'Junção de textos',
    defaultFields: { a: 'apple', b: 'banana' },
    tokens: [
      { kind: 'text', text: 'a junção de' },
      { kind: 'string', field: 'a' },
      { kind: 'text', text: 'com' },
      { kind: 'string', field: 'b' },
    ],
  },
  {
    opcode: 'op_letter_of',
    category: 'operators',
    shape: 'reporter',
    label: 'Caractere N de texto',
    defaultFields: { index: 1, text: 'apple' },
    tokens: [
      { kind: 'text', text: 'o caractere' },
      { kind: 'number', field: 'index', min: 1 },
      { kind: 'text', text: 'de' },
      { kind: 'string', field: 'text' },
    ],
  },
  {
    opcode: 'op_length',
    category: 'operators',
    shape: 'reporter',
    label: 'Comprimento de texto',
    defaultFields: { text: 'apple' },
    tokens: [
      { kind: 'text', text: 'o comprimento de' },
      { kind: 'string', field: 'text' },
    ],
  },
  {
    opcode: 'op_mod',
    category: 'operators',
    shape: 'reporter',
    label: 'Resto da divisão',
    defaultFields: { a: 10, b: 3 },
    tokens: [
      { kind: 'text', text: 'o resto de' },
      { kind: 'number', field: 'a' },
      { kind: 'text', text: 'a dividir por' },
      { kind: 'number', field: 'b' },
    ],
  },
  {
    opcode: 'op_round',
    category: 'operators',
    shape: 'reporter',
    label: 'Arredondamento',
    defaultFields: { value: 3.6 },
    tokens: [
      { kind: 'text', text: 'o arredondamento de' },
      { kind: 'number', field: 'value' },
    ],
  },
  {
    opcode: 'op_math_fn',
    category: 'operators',
    shape: 'reporter',
    label: 'Função matemática',
    defaultFields: { fn: 'abs', value: -5 },
    tokens: [
      {
        kind: 'select',
        field: 'fn',
        options: [
          { value: 'abs', label: 'o valor absoluto' },
          { value: 'floor', label: 'piso' },
          { value: 'ceil', label: 'teto' },
          { value: 'sqrt', label: 'raiz quadrada' },
          { value: 'sin', label: 'sin' },
          { value: 'cos', label: 'cos' },
          { value: 'tan', label: 'tan' },
          { value: 'ln', label: 'ln' },
          { value: 'log', label: 'log' },
        ],
      },
      { kind: 'text', text: 'de' },
      { kind: 'number', field: 'value' },
    ],
  },
  {
    opcode: 'op_lt',
    category: 'operators',
    shape: 'boolean',
    label: 'Menor que (<)',
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: '' },
      { kind: 'text', text: '<' },
      { kind: 'slot_value', slot: 'B', defaultVal: 100 },
    ],
  },
  {
    opcode: 'op_eq',
    category: 'operators',
    shape: 'boolean',
    label: 'Igual (=)',
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: '' },
      { kind: 'text', text: '=' },
      { kind: 'slot_value', slot: 'B', defaultVal: 100 },
    ],
  },
  {
    opcode: 'op_gt',
    category: 'operators',
    shape: 'boolean',
    label: 'Maior que (>)',
    tokens: [
      { kind: 'slot_value', slot: 'A', defaultVal: '' },
      { kind: 'text', text: '>' },
      { kind: 'slot_value', slot: 'B', defaultVal: 100 },
    ],
  },
  {
    opcode: 'op_and',
    category: 'operators',
    shape: 'boolean',
    label: 'E lógico',
    tokens: [
      { kind: 'slot_bool', slot: 'A' },
      { kind: 'text', text: 'e' },
      { kind: 'slot_bool', slot: 'B' },
    ],
  },
  {
    opcode: 'op_or',
    category: 'operators',
    shape: 'boolean',
    label: 'Ou lógico',
    tokens: [
      { kind: 'slot_bool', slot: 'A' },
      { kind: 'text', text: 'ou' },
      { kind: 'slot_bool', slot: 'B' },
    ],
  },
  {
    opcode: 'op_not',
    category: 'operators',
    shape: 'boolean',
    label: 'É falso que',
    tokens: [
      { kind: 'text', text: 'é falso que' },
      { kind: 'slot_bool', slot: 'A' },
    ],
  },
  {
    opcode: 'op_between',
    category: 'operators',
    shape: 'boolean',
    label: 'Está entre',
    defaultFields: { val: 0, min: -10, max: 10 },
    tokens: [
      { kind: 'number', field: 'val' },
      { kind: 'text', text: 'está entre' },
      { kind: 'number', field: 'min' },
      { kind: 'text', text: 'e' },
      { kind: 'number', field: 'max' },
      { kind: 'text', text: '?' },
    ],
  },
  {
    opcode: 'op_contains',
    category: 'operators',
    shape: 'boolean',
    label: 'Texto contém',
    defaultFields: { text: 'apple', sub: 'a' },
    tokens: [
      { kind: 'string', field: 'text' },
      { kind: 'text', text: 'contém' },
      { kind: 'string', field: 'sub' },
    ],
  },
];

export const CATALOG_BY_OPCODE = new Map<string, BlockCatalogEntry>(
  BLOCK_CATALOG.map((b) => [b.opcode, b])
);
