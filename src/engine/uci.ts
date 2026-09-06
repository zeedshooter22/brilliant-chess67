import type { PvLine, Score } from './types';

/**
 * تحليل سطر info قادم من المحرك.
 * مثال: info depth 20 seldepth 28 multipv 1 score cp 34 nodes 1200000 pv e2e4 e7e5
 * نتجاهل الأسطر الجزئية (currmove) والحدود (lowerbound/upperbound) لأنها غير موثوقة.
 */
export function parseInfoLine(line: string): PvLine | null {
  if (!line.startsWith('info ')) return null;
  if (line.includes(' currmove ')) return null;
  if (line.includes('lowerbound') || line.includes('upperbound')) return null;
  const pvIndex = line.indexOf(' pv ');
  if (pvIndex === -1) return null;

  const tokens = line.slice(0, pvIndex).split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let nodes: number | undefined;
  let score: Score | null = null;

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = Number(tokens[++i]);
        break;
      case 'multipv':
        multipv = Number(tokens[++i]);
        break;
      case 'nodes':
        nodes = Number(tokens[++i]);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        if (kind === 'cp') score = { type: 'cp', value };
        else if (kind === 'mate') score = { type: 'mate', value };
        break;
      }
    }
  }

  if (!score) return null;
  const pv = line.slice(pvIndex + 4).trim().split(/\s+/).filter(Boolean);
  if (pv.length === 0) return null;

  return { multipv, depth, score, move: pv[0], pv, nodes };
}

export function parseBestMove(line: string): string | null {
  if (!line.startsWith('bestmove')) return null;
  const move = line.split(/\s+/)[1];
  return !move || move === '(none)' ? null : move;
}

/** بناء أمر go من حدود البحث. */
export function buildGoCommand(limits: {
  depth?: number;
  movetime?: number;
  nodes?: number;
  mate?: number;
  searchmoves?: string[];
}): string {
  const parts = ['go'];
  if (limits.mate !== undefined) parts.push('mate', String(limits.mate));
  if (limits.depth !== undefined) parts.push('depth', String(limits.depth));
  if (limits.movetime !== undefined) parts.push('movetime', String(limits.movetime));
  if (limits.nodes !== undefined) parts.push('nodes', String(limits.nodes));
  // searchmoves يجب أن يكون آخر وسيط دائمًا
  if (limits.searchmoves?.length) parts.push('searchmoves', ...limits.searchmoves);
  return parts.join(' ');
}
