/**
 * تحليل المباراة كاملة بعد نهايتها.
 *
 * الميزة التي تميّز هذا التقرير عن أي تقرير آخر هي **"أين بدأ الخلل"**:
 * حين يضحّي المحرك عليك، النقلة التي خسرت بها ليست النقلة التي أخطأت فيها.
 * الخطأ الحقيقي وقع قبل ذلك بنقلة أو ثلاث — حين صارت التضحية ممكنة على الرقعة.
 * نجدها بالمشي رجوعًا حتى أول موقف لم تكن الفرصة فيه موجودة.
 */
import type { UciEngine } from '../engine/engine';
import { judgeMove, accuracyFromLosses, type MoveGrade, type MoveJudgement } from '../engine/classify';
import { probeBrilliancy, type BrilliancyFinding } from '../engine/brilliancy';
import { scoreToCp, type Score } from '../engine/types';
import type { PlyRecord } from '../game/useBrilliantGame';
import { explainCulprit } from './narrate.ar';

export interface ReviewedPly extends PlyRecord {
  judgement: MoveJudgement;
}

export interface Culprit {
  /** رقم النصف-نقلة التي لعب فيها المحرك التضحية */
  brilliantPly: number;
  brilliantSan: string;
  /** النصف-نقلة التي فتحت الباب */
  culpritPly: number;
  culpritSan: string;
  moveNumber: number;
  alternativeSan: string | null;
  explanation: string;
}

export interface GameReview {
  plies: ReviewedPly[];
  accuracy: { w: number; b: number };
  counts: { w: Partial<Record<MoveGrade, number>>; b: Partial<Record<MoveGrade, number>> };
  /** التضحيات الرائعة التي لُعبت فعلًا */
  brilliancies: { ply: number; color: 'w' | 'b'; byEngine: boolean; finding: BrilliancyFinding }[];
  /** التضحيات المتاحة التي لم تُلعب */
  missed: { ply: number; color: 'w' | 'b'; byEngine: boolean; finding: BrilliancyFinding }[];
  culprits: Culprit[];
  evalCurve: { ply: number; cp: number; mate: number | null }[];
}

export interface ReviewProgress {
  done: number;
  total: number;
  stage: string;
}

/**
 * عمق المسح الأول.
 *
 * التقرير يجب أن يصل في دقيقة لا في عشر. المفتاح أن الكاشف يخرج مبكرًا من أي موقف
 * بلا مرشّح تضحوي — أي بحث واحد فقط لأغلب النقلات، والأبحاث الإضافية تُنفق حيث
 * توجد تضحية فعلًا. ومن أراد دقة أعلى لنقلة بعينها فله زر "تحليل عميق".
 */
const REVIEW_DEPTH = 16;
const REVIEW_VERIFY_DEPTH = 20;

/** عمق التحليل عند الطلب لنقلة واحدة. */
export const DEEP_DEPTH = 22;
export const DEEP_VERIFY_DEPTH = 26;

export async function reviewGame(
  engine: UciEngine,
  plies: PlyRecord[],
  onProgress?: (progress: ReviewProgress) => void,
): Promise<GameReview> {
  const reviewed: ReviewedPly[] = [];
  const evalCurve: GameReview['evalCurve'] = [];
  const lossesByColor: { w: number[]; b: number[] } = { w: [], b: [] };
  const counts: GameReview['counts'] = { w: {}, b: {} };
  const brilliancies: GameReview['brilliancies'] = [];
  const missed: GameReview['missed'] = [];

  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i];
    onProgress?.({ done: i, total: plies.length, stage: `تحليل النقلة ${i + 1}` });

    // نعيد استخدام التصنيف الذي وصل أثناء اللعب بدل إعادة بحث ثقيل
    const judgement =
      ply.judgement ??
      (await judgeMove(engine, ply.fenBefore, ply.uci, {
        depth: REVIEW_DEPTH,
        verifyDepth: REVIEW_VERIFY_DEPTH,
      }));

    reviewed.push({ ...ply, judgement });
    lossesByColor[ply.color].push(judgement.wpLoss);
    counts[ply.color][judgement.grade] = (counts[ply.color][judgement.grade] ?? 0) + 1;

    // منحنى التقييم دائمًا من منظور الأبيض حتى يُقرأ كخط واحد
    const scoreFromMover: Score = judgement.playedScore;
    const cpFromMover = scoreToCp(scoreFromMover);
    // تقييم النقلة محسوب قبل لعبها من منظور صاحب الدور
    const cpWhite = ply.color === 'w' ? cpFromMover : -cpFromMover;
    evalCurve.push({
      ply: i,
      cp: Math.max(-1500, Math.min(1500, cpWhite)),
      mate: scoreFromMover.type === 'mate' ? scoreFromMover.value : null,
    });

    if (judgement.grade === 'brilliant' && judgement.brilliancy) {
      brilliancies.push({
        ply: i,
        color: ply.color,
        byEngine: ply.byEngine,
        finding: judgement.brilliancy,
      });
    } else if (judgement.missedBrilliancy && judgement.brilliancy) {
      missed.push({
        ply: i,
        color: ply.color,
        byEngine: ply.byEngine,
        finding: judgement.brilliancy,
      });
    }
  }

  onProgress?.({ done: plies.length, total: plies.length, stage: 'تتبّع أصل الخلل' });
  const culprits = await findCulprits(engine, reviewed, brilliancies);

  return {
    plies: reviewed,
    accuracy: {
      w: accuracyFromLosses(lossesByColor.w),
      b: accuracyFromLosses(lossesByColor.b),
    },
    counts,
    brilliancies,
    missed,
    culprits,
    evalCurve,
  };
}

/**
 * يتتبّع أصل كل تضحية لعبها المحرك: أول نقلة للاعب صارت بعدها التضحية متاحة.
 *
 * نمشي للخلف من نقلة التضحية حتى نجد موقفًا لم يكن فيه للمحرك أي فرصة تضحوية،
 * فتكون نقلة اللاعب التالية له هي التي فتحت الباب. هذه — لا نقلة الخسارة —
 * هي ما يجب أن يتعلمه اللاعب.
 */
async function findCulprits(
  engine: UciEngine,
  plies: ReviewedPly[],
  brilliancies: GameReview['brilliancies'],
): Promise<Culprit[]> {
  const culprits: Culprit[] = [];
  const WINDOW = 8;

  for (const brilliancy of brilliancies) {
    if (!brilliancy.byEngine) continue;
    const start = Math.max(0, brilliancy.ply - WINDOW);
    let culpritPly: number | null = null;

    for (let i = start; i < brilliancy.ply; i++) {
      const ply = plies[i];
      if (ply.byEngine) continue;
      const probe = await probeBrilliancy(engine, ply.fenAfter, {
        depth: 13,
        multipv: 4,
        nodes: 250000,
      });
      if (probe.found) {
        culpritPly = i;
        break;
      }
    }

    if (culpritPly === null) continue;
    const culprit = plies[culpritPly];
    const moveNumber = Math.floor(culpritPly / 2) + 1;
    culprits.push({
      brilliantPly: brilliancy.ply,
      brilliantSan: brilliancy.finding.san,
      culpritPly,
      culpritSan: culprit.san,
      moveNumber,
      alternativeSan: culprit.judgement.bestSan,
      explanation: explainCulprit(
        culprit.san,
        moveNumber,
        brilliancy.finding.san,
        culprit.judgement.bestSan !== culprit.san ? culprit.judgement.bestSan : null,
      ),
    });
  }

  return culprits;
}

/**
 * إعادة تحليل نقلة واحدة على عمق كبير — يُستدعى من زر "تحليل عميق".
 * أرخص بكثير من رفع عمق التقرير كله، وأدق حيث تهمّ الدقة فعلًا.
 */
export async function deepenPly(
  engine: UciEngine,
  ply: ReviewedPly,
): Promise<MoveJudgement> {
  return judgeMove(engine, ply.fenBefore, ply.uci, {
    depth: DEEP_DEPTH,
    verifyDepth: DEEP_VERIFY_DEPTH,
    multipv: 6,
  });
}

/** تصدير PGN معلَّق — يفتح في lichess وchess.com مع الرموز والتعليقات. */
export function exportAnnotatedPgn(review: GameReview, meta: { white: string; black: string }): string {
  const NAG: Partial<Record<MoveGrade, string>> = {
    brilliant: '$3',
    great: '$1',
    inaccuracy: '$6',
    mistake: '$2',
    blunder: '$4',
  };

  const header = [
    '[Event "معمل البريليانت"]',
    `[White "${meta.white}"]`,
    `[Black "${meta.black}"]`,
    `[Date "${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}"]`,
    '[Result "*"]',
    '',
  ].join('\n');

  const body: string[] = [];
  review.plies.forEach((ply, i) => {
    if (i % 2 === 0) body.push(`${i / 2 + 1}.`);
    body.push(ply.san);
    const nag = NAG[ply.judgement.grade];
    if (nag) body.push(nag);

    if (ply.judgement.grade === 'brilliant' && ply.judgement.brilliancy) {
      const f = ply.judgement.brilliancy;
      body.push(`{ تضحية بـ${f.sacrificedNameAr ?? 'مادة'}؛ البديل الحريص ${f.altSan ?? '—'} }`);
    } else if (ply.judgement.missedBrilliancy && ply.judgement.brilliancy) {
      body.push(`{ فاتت البريليانت ${ply.judgement.brilliancy.san} }`);
    } else if (ply.judgement.grade === 'blunder' && ply.judgement.bestSan) {
      body.push(`{ الأفضل ${ply.judgement.bestSan} }`);
    }
  });

  return `${header}${body.join(' ')} *\n`;
}
