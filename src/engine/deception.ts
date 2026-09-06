/**
 * مقياس الخداع — "الفخ الأجنبي".
 *
 * أخطر التضحيات ليست الأقوى، بل **الأكثر خداعًا**: نقلة تبدو للنظرة السريعة بلندر
 * صريحًا (تعليق قطعة، تقييم سالب) ثم تنقلب في العمق إلى أفضل نقلة على الرقعة.
 * البشر لا يبحثون عشرين نصف نقلة؛ يرون نظرة سريعة ويحكمون. لذلك الفارق بين
 * "ما يراه البحث الضحل" و"ما يراه البحث العميق" هو أدق قياس لقدرة النقلة على الخداع.
 *
 * نستخدمه في ثلاثة مواضع:
 *  1. ترتيب الفخاخ المُنقَّبة: الأكثر خداعًا أعلى قيمة تدريبية.
 *  2. اختيار المحرك في "الوضع الأجنبي": يفضّل النقلات التي تبدو خاطئة وهي سليمة.
 *  3. الشرح بعد المباراة: "بدت لك بلندر ‎−2.4 وهي في الحقيقة ‎+1.9".
 */
import type { Score } from './types';
import { scoreToCp, scoreToWinProb } from './types';
import type { UciEngine } from './engine';

export interface DeceptionMeasure {
  /** تقييم النقلة في نظرة سريعة (ما يراه البشر تقريبًا) */
  shallowScore: Score | null;
  /** أفضل تقييم متاح في النظرة السريعة */
  shallowBest: Score | null;
  /** تقييم النقلة في العمق */
  deepScore: Score | null;
  /** أفضل تقييم متاح في العمق */
  deepBest: Score | null;
  /** كم تبدو النقلة سيئة في النظرة السريعة (نقاط احتمال فوز) */
  shallowLossWp: number;
  /** كم هي سيئة فعلًا في العمق */
  deepLossWp: number;
  /** الخداع = الفرق. موجب كبير يعني: تبدو خطأً وهي ليست كذلك */
  deceptionWp: number;
  /** تبدو بلندر صريحًا للنظرة السريعة وهي في العمق من الأفضل */
  looksLikeBlunder: boolean;
}

export interface DeceptionOptions {
  /** عمق "النظرة البشرية السريعة" */
  shallowDepth: number;
  /** عمق الحقيقة */
  deepDepth: number;
  /** كم يجب أن تبدو سيئة لتُعدّ "تبدو بلندر" */
  blunderLookWp: number;
  /** وكم يجب أن تكون جيدة فعلًا */
  actuallyFineWp: number;
}

export const DEFAULT_DECEPTION_OPTIONS: DeceptionOptions = {
  shallowDepth: 8,
  deepDepth: 22,
  blunderLookWp: 15,
  actuallyFineWp: 4,
};

const EMPTY: DeceptionMeasure = {
  shallowScore: null,
  shallowBest: null,
  deepScore: null,
  deepBest: null,
  shallowLossWp: 0,
  deepLossWp: 0,
  deceptionWp: 0,
  looksLikeBlunder: false,
};

/**
 * يقيس كم تبدو النقلة أسوأ مما هي.
 * أربعة أبحاث: أفضل نقلة وأسوأ تقدير للنقلة، عند عمقين.
 */
export async function measureDeception(
  engine: UciEngine,
  fen: string,
  uci: string,
  options: Partial<DeceptionOptions> = {},
): Promise<DeceptionMeasure> {
  const opts = { ...DEFAULT_DECEPTION_OPTIONS, ...options };

  const [shallowAll, shallowMove, deepAll, deepMove] = [
    await engine.analyse(fen, { multipv: 1, depth: opts.shallowDepth }),
    await engine.analyse(fen, { multipv: 1, depth: opts.shallowDepth, searchmoves: [uci] }),
    await engine.analyse(fen, { multipv: 1, depth: opts.deepDepth }),
    await engine.analyse(fen, { multipv: 1, depth: opts.deepDepth, searchmoves: [uci] }),
  ];

  const shallowBest = shallowAll.lines[0]?.score ?? null;
  const shallowScore = shallowMove.lines[0]?.score ?? null;
  const deepBest = deepAll.lines[0]?.score ?? null;
  const deepScore = deepMove.lines[0]?.score ?? null;
  if (!shallowBest || !shallowScore || !deepBest || !deepScore) return EMPTY;

  const shallowLossWp = Math.max(0, scoreToWinProb(shallowBest) - scoreToWinProb(shallowScore));
  const deepLossWp = Math.max(0, scoreToWinProb(deepBest) - scoreToWinProb(deepScore));

  return {
    shallowScore,
    shallowBest,
    deepScore,
    deepBest,
    shallowLossWp,
    deepLossWp,
    deceptionWp: shallowLossWp - deepLossWp,
    looksLikeBlunder:
      shallowLossWp >= opts.blunderLookWp && deepLossWp <= opts.actuallyFineWp,
  };
}

/** صياغة عربية للخداع — تُعرض تحت النقلة في شاشة التحليل. */
export function describeDeception(measure: DeceptionMeasure): string | null {
  if (!measure.shallowScore || !measure.deepScore) return null;
  if (measure.deceptionWp < 8) return null;

  const shallow = (scoreToCp(measure.shallowScore) / 100).toFixed(2);
  const deep = (scoreToCp(measure.deepScore) / 100).toFixed(2);
  const prefix = measure.looksLikeBlunder ? 'تبدو بلندر' : 'تبدو ضعيفة';
  return `${prefix} في النظرة السريعة (${shallow}) وهي في العمق (${deep}) — خداع ${measure.deceptionWp.toFixed(0)} نقطة.`;
}

/**
 * أثمن ما في الفخ: أن يبدو الطُعم سليمًا للاعب.
 * نقيس هنا خداع **رد اللاعب** — كم يبدو ردّه طبيعيًا في النظرة السريعة
 * بينما هو في العمق خسارة. هذا هو مقياس جودة الفخ الحقيقي.
 */
export async function measureBaitQuality(
  engine: UciEngine,
  fen: string,
  baitUci: string,
  options: Partial<DeceptionOptions> = {},
): Promise<{ looksFine: boolean; shallowLossWp: number; deepLossWp: number; trapWp: number }> {
  const measure = await measureDeception(engine, fen, baitUci, options);
  return {
    // الطُعم الجيد: يبدو سليمًا سريعًا (خسارة صغيرة) وهو في العمق كارثة
    looksFine: measure.shallowLossWp <= 5 && measure.deepLossWp >= 15,
    shallowLossWp: measure.shallowLossWp,
    deepLossWp: measure.deepLossWp,
    trapWp: measure.deepLossWp - measure.shallowLossWp,
  };
}
