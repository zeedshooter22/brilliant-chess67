/**
 * تصنيف النقلات.
 *
 * المقياس هو **فرق احتمال الفوز** لا السنتي-بيدق: خسارة 100cp من +0.2 إلى -0.8
 * تقلب المباراة، ونفس الخسارة من +8.0 إلى +7.0 لا تعني شيئًا. التصنيف بالسنتي-بيدق
 * يعاقب اللاعب في المواقف المحسومة ويسامحه في اللحظات الحرجة — عكس المطلوب تمامًا.
 */
import type { Score } from './types';
import { scoreToCp, scoreToWinProb } from './types';
import type { UciEngine } from './engine';
import { scanForBrilliancy, type BrilliancyFinding, type BrilliancyOptions } from './brilliancy';
import { uciToSan } from '../game/chess';

export type MoveGrade =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface GradeStyle {
  ar: string;
  symbol: string;
  color: string;
}

export const GRADE_STYLE: Record<MoveGrade, GradeStyle> = {
  brilliant: { ar: 'بريليانت', symbol: '!!', color: '#26c2a3' },
  great: { ar: 'رائعة', symbol: '!', color: '#5b8bd0' },
  best: { ar: 'الأفضل', symbol: '★', color: '#7bb661' },
  excellent: { ar: 'ممتازة', symbol: '', color: '#95bb4a' },
  good: { ar: 'جيدة', symbol: '', color: '#a8a8a3' },
  inaccuracy: { ar: 'عدم دقة', symbol: '?!', color: '#e5a03a' },
  mistake: { ar: 'خطأ', symbol: '?', color: '#e08b3c' },
  blunder: { ar: 'بلندر', symbol: '??', color: '#d05c4a' },
};

/** عتبات فرق احتمال الفوز (بالنقاط المئوية). */
export const GRADE_THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
};

/** كم يجب أن تتفوق النقلة الوحيدة على ثاني أفضل نقلة لتُسمى "رائعة !" */
export const GREAT_MOVE_GAP_WP = 15;

export interface MoveJudgement {
  grade: MoveGrade;
  playedMove: string;
  playedSan: string;
  playedScore: Score;
  bestMove: string | null;
  bestSan: string | null;
  bestScore: Score | null;
  /** احتمال الفوز قبل النقلة وبعدها، من منظور اللاعب الذي لعبها */
  wpBefore: number;
  wpAfter: number;
  wpLoss: number;
  cpLoss: number;
  /** موجود إذا كان في الموقف تضحية رائعة — سواء لُعبت أم فاتت */
  brilliancy: BrilliancyFinding | null;
  /** كانت هناك بريليانت متاحة ولم يلعبها */
  missedBrilliancy: boolean;
}

function gradeFromLoss(wpLoss: number): MoveGrade {
  if (wpLoss < GRADE_THRESHOLDS.excellent) return 'excellent';
  if (wpLoss < GRADE_THRESHOLDS.good) return 'good';
  if (wpLoss < GRADE_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (wpLoss < GRADE_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

/**
 * يحكم على نقلة لُعبت فعلًا في موقف معيّن.
 * يعيد أيضًا التضحية الرائعة المتاحة في الموقف حتى لو لم يلعبها اللاعب —
 * وهذه هي المادة التي تبني عليها شاشة "ما فاتك".
 */
export async function judgeMove(
  engine: UciEngine,
  fenBefore: string,
  playedUci: string,
  options: Partial<BrilliancyOptions> = {},
): Promise<MoveJudgement> {
  const scan = await scanForBrilliancy(engine, fenBefore, options);
  const lines = scan.analysis.lines;
  const bestLine = lines[0] ?? null;

  let playedLine = lines.find((l) => l.move === playedUci) ?? null;
  if (!playedLine) {
    // النقلة خارج أفضل الخطوط — نقيّمها وحدها
    const probe = await engine.analyse(fenBefore, {
      multipv: 1,
      depth: Math.max(12, (options.depth ?? 20) - 4),
      searchmoves: [playedUci],
    });
    playedLine = probe.lines[0] ?? null;
  }

  const bestScore = bestLine?.score ?? null;
  const playedScore: Score = playedLine?.score ?? bestScore ?? { type: 'cp', value: 0 };
  const wpBefore = bestScore ? scoreToWinProb(bestScore) : 50;
  const wpAfter = scoreToWinProb(playedScore);
  const wpLoss = Math.max(0, wpBefore - wpAfter);
  const cpLoss = bestScore ? Math.max(0, scoreToCp(bestScore) - scoreToCp(playedScore)) : 0;

  const brilliancy = scan.finding?.isBrilliant ? scan.finding : null;
  const playedIsBrilliant = brilliancy !== null && brilliancy.move === playedUci;

  let grade: MoveGrade;
  if (playedIsBrilliant) {
    grade = 'brilliant';
  } else if (bestLine && playedUci === bestLine.move) {
    // نقلة وحيدة تنقذ الموقف = "رائعة"، وإلا فهي ببساطة الأفضل
    const second = lines[1];
    const onlyMove = second
      ? scoreToWinProb(bestLine.score) - scoreToWinProb(second.score) >= GREAT_MOVE_GAP_WP
      : true;
    grade = onlyMove ? 'great' : 'best';
  } else {
    grade = gradeFromLoss(wpLoss);
  }

  return {
    grade,
    playedMove: playedUci,
    playedSan: uciToSan(fenBefore, playedUci),
    playedScore,
    bestMove: bestLine?.move ?? null,
    bestSan: bestLine ? uciToSan(fenBefore, bestLine.move) : null,
    bestScore,
    wpBefore,
    wpAfter,
    wpLoss,
    cpLoss,
    brilliancy,
    missedBrilliancy: brilliancy !== null && !playedIsBrilliant,
  };
}

/**
 * دقة اللاعب على مستوى المباراة — متوسط مرجّح لخسائر احتمال الفوز.
 * الصيغة نفسها التي تستخدمها المواقع الكبرى تقريبًا، مع تقريب معقول.
 */
export function accuracyFromLosses(wpLosses: number[]): number {
  if (wpLosses.length === 0) return 100;
  const perMove = wpLosses.map((loss) => {
    const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
    return Math.max(0, Math.min(100, acc));
  });
  const sum = perMove.reduce((a, b) => a + b, 0);
  return Math.round((sum / perMove.length) * 10) / 10;
}
