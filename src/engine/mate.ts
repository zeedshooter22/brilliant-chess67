/**
 * المات بأقل عدد نقلات.
 *
 * نقطتان تُغفلان عادةً وتفسدان أي تدريب على "المات الأقصر":
 *  1. تقييم `score mate N` من بحث عادي ليس ضمانًا بأن N هو الأقصر — إنه طول
 *     الخط الذي صادفه البحث. نتحقق بالنزول: نطلب مات في N-1 ثم N-2 حتى يفشل.
 *  2. المدافع يجب أن يقاوم أطول مقاومة ممكنة. Stockfish يفعل ذلك بطبيعته حين
 *     يلعب بكامل قوته (تقييم المات يفضّل البعد)، لكن لا يفعله وهو مُضعَّف —
 *     لذلك مرحلة المات تستخدم محركًا كامل القوة دائمًا.
 */
import type { Score } from './types';
import type { UciEngine } from './engine';
import { applyUci, pvToSan, Chess } from '../game/chess';

export interface MateInfo {
  /** عدد النقلات الكاملة حتى المات */
  mateIn: number;
  /** الخط الإجباري بترميز UCI */
  pv: string[];
  pvSan: string[];
  bestMove: string;
}

const MATE_PROBE_NODES = 900000;

/**
 * يجد أقصر مات فعلًا لصاحب الدور، أو null إن لم يوجد مات ضمن maxN.
 */
export async function findShortestMate(
  engine: UciEngine,
  fen: string,
  maxN = 8,
  depth = 24,
): Promise<MateInfo | null> {
  const initial = await engine.analyse(fen, { multipv: 1, depth });
  const line = initial.lines[0];
  if (!line || line.score.type !== 'mate' || line.score.value <= 0) return null;

  let best: MateInfo = {
    mateIn: line.score.value,
    pv: line.pv,
    pvSan: pvToSan(fen, line.pv, line.score.value * 2),
    bestMove: line.move,
  };

  // النزول: هل يوجد مات أقصر ممّا وجده البحث العادي؟
  for (let target = best.mateIn - 1; target >= 1; target--) {
    const probe = await engine.analyse(fen, {
      multipv: 1,
      mate: target,
      nodes: MATE_PROBE_NODES,
    });
    const probeLine = probe.lines[0];
    if (
      probeLine &&
      probeLine.score.type === 'mate' &&
      probeLine.score.value > 0 &&
      probeLine.score.value <= target
    ) {
      best = {
        mateIn: probeLine.score.value,
        pv: probeLine.pv,
        pvSan: pvToSan(fen, probeLine.pv, probeLine.score.value * 2),
        bestMove: probeLine.move,
      };
      target = probeLine.score.value; // تابع النزول من القيمة الجديدة
    } else {
      break;
    }
  }

  return best;
}

export interface DefenceOption {
  move: string;
  san: string;
  score: Score;
  /** بُعد المات بعد هذا الدفاع (من منظور المهاجم) */
  mateIn: number | null;
}

/**
 * كل ردود المدافع مرتبة من الأصلب إلى الأسهل.
 * تُستخدم للعب المحرك المدافع، ولعرض "لماذا هذا الرد أطول مقاومة" في التحليل.
 */
export async function longestResistance(
  engine: UciEngine,
  fen: string,
  depth = 18,
): Promise<DefenceOption[]> {
  const board = new Chess(fen);
  const legal = board.moves({ verbose: true });
  if (legal.length === 0) return [];

  const analysis = await engine.analyse(fen, {
    multipv: Math.min(legal.length, 24),
    depth,
  });

  return analysis.lines.map((line) => ({
    move: line.move,
    san: board.moves({ verbose: true }).find((m) => `${m.from}${m.to}${m.promotion ?? ''}` === line.move)?.san ?? line.move,
    score: line.score,
    // التقييم من منظور المدافع: mate سالب يعني أنه سيُمات
    mateIn: line.score.type === 'mate' && line.score.value < 0 ? -line.score.value : null,
  }));
}

export interface MateProgress {
  /** بُعد المات قبل نقلة اللاعب */
  before: number | null;
  /** بُعد المات بعد نقلة اللاعب (من منظور اللاعب نفسه) */
  after: number | null;
  /** لعب اللاعب النقلة المثلى في طريق المات */
  optimal: boolean;
  /** أطال الطريق: كان مات في 3 فصار في 5 */
  lengthenedBy: number;
  /** ضيّع المات تمامًا */
  lostMate: boolean;
}

/**
 * يقيس أثر نقلة اللاعب على طول طريق المات — أساس عدّاد "مات في N" والنجوم.
 */
export async function measureMateProgress(
  engine: UciEngine,
  fenBefore: string,
  playedUci: string,
  maxN = 8,
  depth = 22,
): Promise<MateProgress> {
  const before = await findShortestMate(engine, fenBefore, maxN, depth);
  const applied = applyUci(fenBefore, playedUci);
  if (!applied) {
    return { before: before?.mateIn ?? null, after: null, optimal: false, lengthenedBy: 0, lostMate: false };
  }

  const board = new Chess(applied.fen);
  if (board.isCheckmate()) {
    return { before: before?.mateIn ?? null, after: 0, optimal: true, lengthenedBy: 0, lostMate: false };
  }

  // بعد نقلتنا الدور للخصم؛ المات علينا يظهر بإشارة سالبة من منظوره
  const reply = await engine.analyse(applied.fen, { multipv: 1, depth });
  const replyScore = reply.lines[0]?.score;
  const afterMate =
    replyScore && replyScore.type === 'mate' && replyScore.value < 0 ? -replyScore.value : null;

  if (before === null) {
    return { before: null, after: afterMate, optimal: true, lengthenedBy: 0, lostMate: false };
  }
  if (afterMate === null) {
    return { before: before.mateIn, after: null, optimal: false, lengthenedBy: 0, lostMate: true };
  }

  // كان مات في N، وبعد نقلتنا صار مات في M — النقلة المثلى تعطي M = N - 1 ... أي أننا تقدّمنا خطوة
  const expected = before.mateIn;
  const lengthenedBy = Math.max(0, afterMate - (expected - 1));
  return {
    before: expected,
    after: afterMate,
    optimal: lengthenedBy === 0,
    lengthenedBy,
    lostMate: false,
  };
}

/** تقييم أداء المات: ثلاث نجوم للطريق الأمثل. */
export function mateStars(optimalPlies: number, playedPlies: number): number {
  if (playedPlies <= optimalPlies) return 3;
  if (playedPlies <= optimalPlies + 2) return 2;
  return 1;
}
