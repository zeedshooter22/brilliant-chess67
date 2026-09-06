/**
 * نموذج تقريبي لاحتمال أن يلعب بشرٌ نقلةً معينة.
 *
 * لماذا نحتاجه: الفخّ لا قيمة له إن كان الرد الذي يقع فيه رديئًا لا يلعبه أحد.
 * قياس "جدوى الفخ" يجب أن يرجّح الردود بمدى طبيعيتها لا بجودتها المطلقة —
 * فالنقلة الطبيعية المغرية هي التي تُوقع اللاعب، لا النقلة الأفضل.
 */
import type { PvLine } from './types';
import { scoreToCp } from './types';
import { Chess, parseUci } from '../game/chess';
import { materialOffered } from './see';
import { fullmoveNumber } from '../game/chess';

export interface HumanReply {
  move: string;
  san: string;
  /** احتمال تقديري بين 0 و1 */
  probability: number;
  /** أسباب الجاذبية — للعرض في التحليل */
  appeal: string[];
}

/** مربع آخر نقلة لعبها الخصم — الاسترداد عليه أكثر الردود بشرية. */
function lastMoveTarget(fen: string, previousUci?: string): string | null {
  if (!previousUci) return null;
  return previousUci.slice(2, 4);
}

/**
 * جاذبية النقلة للبشر بمعزل عن قوتها — نقاط تُجمع ثم تُحوَّل لاحتمال.
 */
function humanAppeal(
  fen: string,
  uci: string,
): { score: number; reasons: string[] } {
  const board = new Chess(fen);
  let move;
  try {
    move = board.move(parseUci(uci));
  } catch {
    return { score: 0, reasons: [] };
  }
  if (!move) return { score: 0, reasons: [] };

  const reasons: string[] = [];
  let score = 1;

  if (move.captured) {
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const gain = values[move.captured] ?? 0;
    score += 0.6 + gain * 0.25;
    reasons.push(`أخذ ${move.captured === 'q' ? 'الوزير' : 'قطعة'}`);
  }
  if (board.inCheck()) {
    score += 0.7;
    reasons.push('كش');
  }
  if (move.promotion) {
    score += 1.2;
    reasons.push('ترقية');
  }
  if (move.san.startsWith('O-O')) {
    score += 0.5;
    reasons.push('تبييت');
  }
  // التطوير في الافتتاح
  if (fullmoveNumber(fen) <= 12 && (move.piece === 'n' || move.piece === 'b')) {
    const fromRank = move.from[1];
    const homeRank = move.color === 'w' ? '1' : '8';
    if (fromRank === homeRank) {
      score += 0.4;
      reasons.push('تطوير');
    }
  }
  // البشر يتجنبون تعليق المادة بوضوح — لكن ليس دائمًا
  const hangs = materialOffered(fen, uci);
  if (hangs >= 300) score *= 0.35;
  else if (hangs >= 150) score *= 0.6;

  return { score, reasons };
}

/**
 * يوزّع احتمالًا على ردود الخصم اعتمادًا على قوة النقلة (من المحرك) وجاذبيتها البشرية.
 * @param lines خطوط MultiPV ضحلة للموقف
 * @param strength كلما زادت اقترب اللاعب من المحرك (0.6 مبتدئ، 2.5 قوي)
 */
export function estimateHumanReplies(
  fen: string,
  lines: PvLine[],
  strength = 1.0,
  previousUci?: string,
): HumanReply[] {
  if (lines.length === 0) return [];
  const bestCp = scoreToCp(lines[0].score);
  const recaptureSquare = lastMoveTarget(fen, previousUci);

  const scored = lines.map((line) => {
    const loss = Math.max(0, bestCp - scoreToCp(line.score));
    // كلما زادت الخسارة قلّ احتمال اللعب — والمنحدر يعتمد على قوة اللاعب
    const strengthWeight = Math.exp((-loss / 180) * strength);
    const { score: appeal, reasons } = humanAppeal(fen, line.move);
    let weight = strengthWeight * appeal;

    if (recaptureSquare && line.move.slice(2, 4) === recaptureSquare) {
      weight *= 1.8;
      reasons.push('استرداد فوري');
    }

    const board = new Chess(fen);
    let san = line.move;
    try {
      const m = board.move(parseUci(line.move));
      if (m) san = m.san;
    } catch {
      /* تجاهل */
    }

    return { move: line.move, san, weight, appeal: reasons };
  });

  const total = scored.reduce((sum, s) => sum + s.weight, 0) || 1;
  return scored
    .map((s) => ({ move: s.move, san: s.san, probability: s.weight / total, appeal: s.appeal }))
    .sort((a, b) => b.probability - a.probability);
}
