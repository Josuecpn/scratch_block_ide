export type BlockCategoryKey =
  | 'motors'
  | 'motion'
  | 'light'
  | 'sound'
  | 'events'
  | 'control'
  | 'sensors'
  | 'operators'
  | 'variables'
  | 'lists'
  | 'my_blocks';

export type BlockShape =
  | 'hat'
  | 'stack'
  | 'cap'
  | 'c_block'
  | 'e_block'
  | 'reporter'
  | 'boolean';

export interface VariableDef {
  id: string;
  name: string;
  value: string | number;
  monitored: boolean;
}

export interface ListDef {
  id: string;
  name: string;
  items: Array<string | number>;
  monitored: boolean;
}

export interface CustomBlockSegment {
  id: string;
  kind: 'label' | 'value' | 'boolean';
  text: string;
}

export interface CustomBlockDef {
  id: string;
  name: string;
  segments: CustomBlockSegment[];
}

export interface CanvasDefinitions {
  variables: VariableDef[];
  lists: ListDef[];
  messages: string[];
  customBlocks: CustomBlockDef[];
}

export function createDefaultCanvasDefinitions(): CanvasDefinitions {
  return {
    variables: [],
    lists: [],
    messages: ['Mensagem 1'],
    customBlocks: [],
  };
}

export interface WorkspaceBlock {
  id: string;
  category: BlockCategoryKey;
  opcode: string;
  label: string;
  shape?: BlockShape;
  param?: string | number;
  unit?: string;
  fields?: Record<string, string | number | boolean>;
  slots?: Record<string, WorkspaceBlock | null>;
  children?: WorkspaceBlock[];
  elseChildren?: WorkspaceBlock[];
  customBlockId?: string;
}

/**
 * Verifica se `targetId` é o próprio bloco `root` ou qualquer descendente dele
 * (em `children`, `elseChildren` ou `slots`), prevenindo ciclos no drag-and-drop.
 */
export function isSelfOrDescendant(
  root: WorkspaceBlock,
  targetId: string,
  visited = new Set<string>()
): boolean {
  if (root.id === targetId) return true;
  if (visited.has(root.id)) return false;
  visited.add(root.id);

  if (root.children) {
    for (const c of root.children) {
      if (isSelfOrDescendant(c, targetId, visited)) return true;
    }
  }
  if (root.elseChildren) {
    for (const c of root.elseChildren) {
      if (isSelfOrDescendant(c, targetId, visited)) return true;
    }
  }
  if (root.slots) {
    for (const s of Object.values(root.slots)) {
      if (s && isSelfOrDescendant(s, targetId, visited)) return true;
    }
  }
  return false;
}

/**
 * Remove referências circulares na árvore de blocos antes de serializar/salvar.
 */
export function sanitizeBlockTree(
  blocks: WorkspaceBlock[],
  visited = new Set<string>(),
  depth = 0
): WorkspaceBlock[] {
  if (depth > 32) return [];
  const clean: WorkspaceBlock[] = [];
  for (const b of blocks) {
    if (visited.has(b.id)) continue;
    visited.add(b.id);
    clean.push({
      ...b,
      slots: b.slots
        ? Object.fromEntries(
            Object.entries(b.slots).map(([k, v]) => [
              k,
              v && !visited.has(v.id) ? sanitizeBlockTree([v], visited, depth + 1)[0] ?? null : null,
            ])
          )
        : undefined,
      children: b.children ? sanitizeBlockTree(b.children, visited, depth + 1) : undefined,
      elseChildren: b.elseChildren ? sanitizeBlockTree(b.elseChildren, visited, depth + 1) : undefined,
    });
  }
  return clean;
}
