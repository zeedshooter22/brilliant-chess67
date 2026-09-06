/**
 * توليد الشرح العربي.
 *
 * قاعدة واحدة تحكم كل ما هنا: لا نقول إلا ما نعرفه من المحرك والرقعة.
 * لا "خطة استراتيجية" مُتخيَّلة ولا تفسير أدبي — أرقام وخطوط ومواضع قطع فقط،
 * لأن الشرح المخترع في الشطرنج أسوأ من عدم الشرح.
 */
import type { BrilliancyFinding } from '../engine/brilliancy';
import type { MoveJudgement } from '../engine/classify';
import { GRADE_STYLE } from '../engine/classify';
import type { DeceptionMeasure } from '../engine/deception';
import { describeDeception } from '../engine/deception';
import { formatScore, scoreToCp } from '../engine/types';

export interface Explanation {
  headline: string;
  points: string[];
  motifs: string[];
}

/** شرح تضحية رائعة. */
export function explainBrilliancy(
  finding: BrilliancyFinding,
  deception?: DeceptionMeasure | null,
): Explanation {
  const points: string[] = [];
  const what = finding.sacrificedNameAr ?? 'مادة';

  points.push(
    `تبذل ${what} (${(finding.offered / 100).toFixed(1)} بيدق) وتبقى أفضل نقلة على الرقعة: ${formatScore(finding.score)}.`,
  );

  if (finding.altSan && finding.altScore) {
    points.push(
      `النقلة الحريصة ${finding.altSan} تعطي ${formatScore(finding.altScore)} فقط — ` +
        `فارق ${(finding.gapCp / 100).toFixed(2)} أي ${finding.gapWp.toFixed(0)} نقطة احتمال فوز.`,
    );
  }

  if (finding.isTrap && finding.acceptSan && finding.acceptLine.length > 0) {
    points.push(
      `الفخّ: قبول التضحية بـ${finding.acceptSan} يكلّف الخصم ${finding.trapWp.toFixed(0)} نقطة — ` +
        `${finding.acceptLine.join(' ')}.`,
    );
    if (finding.declineSan) {
      points.push(`لذلك أفضل ما لديه هو الرفض بـ${finding.declineSan}، وحتى هذا لا ينقذه.`);
    }
  } else if (finding.acceptSan && finding.acceptLine.length > 0) {
    points.push(`بعد ${finding.acceptSan} يستمر الخط: ${finding.acceptLine.join(' ')}.`);
  }

  if (finding.mateIn) {
    points.push(`النتيجة كش مات إجباري في ${finding.mateIn} نقلة: ${finding.pvSan.join(' ')}.`);
  } else if (finding.pvSan.length > 0) {
    points.push(`الخط الرئيسي: ${finding.pvSan.join(' ')}.`);
  }

  const deceptionNote = deception ? describeDeception(deception) : null;
  if (deceptionNote) points.push(deceptionNote);

  return {
    headline: `${finding.san} — تضحية بـ${what}`,
    points,
    motifs: finding.motifs,
  };
}

/** شرح نقلة لاعب: لماذا كانت خطأً وما البديل. */
export function explainJudgement(judgement: MoveJudgement): Explanation {
  const style = GRADE_STYLE[judgement.grade];
  const points: string[] = [];

  if (judgement.grade === 'brilliant' && judgement.brilliancy) {
    return explainBrilliancy(judgement.brilliancy);
  }

  points.push(
    `التقييم بعد نقلتك: ${formatScore(judgement.playedScore)}` +
      (judgement.bestScore ? ` مقابل ${formatScore(judgement.bestScore)} لأفضل نقلة.` : '.'),
  );

  if (judgement.wpLoss >= 2 && judgement.bestSan) {
    points.push(
      `خسرت ${judgement.wpLoss.toFixed(0)} نقطة احتمال فوز. كان الأفضل ${judgement.bestSan}.`,
    );
  }

  if (judgement.missedBrilliancy && judgement.brilliancy) {
    const f = judgement.brilliancy;
    points.push(
      `فاتتك تضحية رائعة: ${f.san} — تبذل ${f.sacrificedNameAr ?? 'مادة'} ` +
        `وتصل إلى ${formatScore(f.score)}${f.mateIn ? ` مع مات في ${f.mateIn}` : ''}.`,
    );
  }

  return {
    headline: `${judgement.playedSan} — ${style.ar}`,
    points,
    motifs: judgement.brilliancy?.motifs ?? [],
  };
}

/** صياغة "أين بدأ الخلل": النقلة التي فتحت الباب للتضحية. */
export function explainCulprit(
  culpritSan: string,
  moveNumber: number,
  brilliantSan: string,
  alternativeSan: string | null,
): string {
  return (
    `الخلل بدأ عند ${moveNumber}. ${culpritSan}: بعدها مباشرةً صارت ${brilliantSan} متاحة للمحرك. ` +
    (alternativeSan
      ? `لو لعبت ${alternativeSan} بدلها لما وُجدت التضحية أصلًا.`
      : 'قبلها لم تكن التضحية موجودة على الرقعة.')
  );
}

/** حكم مختصر على نقلة في شجرة "ماذا لو". */
export function verdictFor(deltaWp: number, isBest: boolean): string {
  if (isBest) return 'أفضل نقلة';
  if (deltaWp < 2) return 'متكافئة تقريبًا';
  if (deltaWp < 5) return 'أضعف قليلًا';
  if (deltaWp < 10) return 'عدم دقة';
  if (deltaWp < 20) return 'خطأ واضح';
  return 'بلندر — يقلب الموقف';
}

/** ملخص المباراة في سطر. */
export function summariseGame(
  playerBrilliancies: number,
  engineBrilliancies: number,
  missed: number,
  accuracy: number,
): string {
  const parts: string[] = [`دقتك ${accuracy.toFixed(1)}%`];
  if (playerBrilliancies > 0) parts.push(`وجدت ${playerBrilliancies} تضحية رائعة`);
  if (engineBrilliancies > 0) parts.push(`المحرك ضحّى عليك ${engineBrilliancies} مرة`);
  if (missed > 0) parts.push(`فاتتك ${missed}`);
  if (playerBrilliancies === 0 && engineBrilliancies === 0 && missed === 0) {
    parts.push('لم تظهر تضحيات رائعة في هذه المباراة');
  }
  return parts.join(' · ');
}

/** تحويل تقييم إلى نص يفهمه المبتدئ. */
export function plainEval(cp: number): string {
  const abs = Math.abs(cp);
  const side = cp > 0 ? 'الأبيض' : 'الأسود';
  if (abs < 30) return 'الموقف متكافئ';
  if (abs < 90) return `${side} أفضل قليلًا`;
  if (abs < 200) return `${side} أفضل بوضوح`;
  if (abs < 500) return `${side} رابح`;
  return `${side} رابح بشكل حاسم`;
}

export { scoreToCp };
