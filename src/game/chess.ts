import { Chess, type Move, type Square } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface UciMove {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

/** e2e4 / e7e8q → كائن نقلة */
export function parseUci(uci: string): UciMove {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci.length > 4 ? uci[4] : undefined) as UciMove['promotion'],
  };
}

export function toUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** يطبّق نقلة UCI ويعيد نسخة جديدة، أو null إذا كانت غير قانونية. */
export function applyUci(fen: string, uci: string): { fen: string; move: Move } | null {
  const board = new Chess(fen);
  try {
    const move = board.move(parseUci(uci));
    return move ? { fen: board.fen(), move } : null;
  } catch {
    return null;
  }
}

/** تحويل ترميز UCI إلى الترميز الجبري القياسي (SAN) للعرض. */
export function uciToSan(fen: string, uci: string): string {
  const applied = applyUci(fen, uci);
  return applied ? applied.move.san : uci;
}

/** تحويل سلسلة نقلات UCI إلى SAN مقروء، مثل: Nxf7+ Kxf7 Qf3+ */
export function pvToSan(fen: string, pv: string[], limit = 12): string[] {
  const board = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, limit)) {
    try {
      const move = board.move(parseUci(uci));
      if (!move) break;
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

/** ترقيم النقلات للعرض: 1. e4 e5 2. Nf3 … */
export function numberedSan(fen: string, sanMoves: string[]): string {
  const board = new Chess(fen);
  const parts: string[] = [];
  let moveNo = board.moveNumber();
  let white = board.turn() === 'w';
  for (const san of sanMoves) {
    if (white) parts.push(`${moveNo}.`);
    else if (parts.length === 0) parts.push(`${moveNo}...`);
    parts.push(san);
    if (!white) moveNo++;
    white = !white;
  }
  return parts.join(' ');
}

/**
 * ترقيم شريحة من نقلات المباراة بأرقامها الحقيقية.
 *
 * numberedSan تفترض أن القائمة تبدأ من الموقف المعطى؛ عرض آخر ثماني نقلات بها
 * يرقّمها من 1 فيبدو الخط وكأنه افتتاح جديد. هنا نمرّر رقم نصف النقلة الحقيقي.
 */
export function numberedSanFromPly(sanMoves: string[], startPly: number): string {
  const parts: string[] = [];
  let ply = startPly;
  for (const san of sanMoves) {
    const moveNo = Math.floor(ply / 2) + 1;
    const white = ply % 2 === 0;
    if (white) parts.push(`${moveNo}.`);
    else if (parts.length === 0) parts.push(`${moveNo}...`);
    parts.push(san);
    ply++;
  }
  return parts.join(' ');
}

export function legalUciMoves(fen: string): string[] {
  const board = new Chess(fen);
  return board.moves({ verbose: true }).map((m) => toUci(m));
}

export function isGameOver(fen: string): {
  over: boolean;
  reason: string | null;
  winner: 'w' | 'b' | null;
} {
  const board = new Chess(fen);
  if (board.isCheckmate()) {
    return { over: true, reason: 'كش مات', winner: board.turn() === 'w' ? 'b' : 'w' };
  }
  if (board.isStalemate()) return { over: true, reason: 'تعادل بالجمود', winner: null };
  if (board.isInsufficientMaterial()) {
    return { over: true, reason: 'تعادل — مادة غير كافية', winner: null };
  }
  if (board.isThreefoldRepetition()) return { over: true, reason: 'تعادل بالتكرار', winner: null };
  if (board.isDraw()) return { over: true, reason: 'تعادل (قاعدة الخمسين نقلة)', winner: null };
  return { over: false, reason: null, winner: null };
}

/** عدد النقلات المكتملة منذ بداية القيم — لتحديد مرحلة الافتتاح. */
export function fullmoveNumber(fen: string): number {
  return Number(fen.split(' ')[5] ?? 1);
}

export function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** المادة الكلية على الرقعة — تُستخدم لتحديد مرحلة النهايات. */
export function totalMaterial(fen: string): number {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let sum = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = values[ch.toLowerCase()];
    if (v) sum += v;
  }
  return sum;
}

export { Chess };
export type { Move, Square };
