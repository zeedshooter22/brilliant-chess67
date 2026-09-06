/**
 * كاشف البريليانت — قلب المشروع.
 *
 * "التضحية الرائعة" ليست أي تضحية: هي نقلة تبذل مادة حقيقية، وتبقى مع ذلك أفضل ما في
 * الموقف، ويوجد بجانبها بديل آمن مغرٍ لكنه أسوأ بوضوح. الشرط الأخير هو الفارق بين
 * "بريليانت" و"النقلة الوحيدة": إذا كانت التضحية إجبارية فهي ليست اكتشافًا، بل اضطرار.
 */
import type { AnalysisResult, PvLine, Score } from './types';
import { scoreToCp, scoreToWinProb, isMateScore } from './types';
import type { UciEngine } from './engine';
import {
  materialOffered,
  materialLossFloor,
  prudentMoves,
  sacrificedPiece,
  PIECE_NAME_AR,
} from './see';
import { applyUci, uciToSan, pvToSan, Chess, parseUci } from '../game/chess';

export interface BrilliancyOptions {
  /** عمق البحث الأساسي */
  depth: number;
  /** عمق التحقق الثاني — يمنع أوهام البحث السطحي */
  verifyDepth: number;
  multipv: number;
  /** أقل مادة مبذولة *زيادةً على النقلة الأحرص* تُعتبر تضحية */
  minSacrifice: number;
  /**
   * أدنى تقييم بعد التضحية حتى تُعدّ سليمة.
   * صفر = "لا تخسر": التضحية السليمة تُبقيك على الأقل متعادلًا.
   * لا نشترط أن تكون رابحة بفارق كبير — تضحيات مثل Nxf7 في الكبد المقلي
   * تعطي +0.8 فقط وهي من أشهر التضحيات الصحيحة على الإطلاق.
   */
  minSoundEval: number;
  /** فوق هذا التقييم يكون الموقف محسومًا سلفًا فلا تستحق التضحية وسام !! */
  maxPreEval: number;
  /**
   * كم يجب أن يكون البديل الحريص أسوأ حتى تُعدّ التضحية "اكتشافًا".
   * نقيسه بـ**نقاط احتمال الفوز** لا بالسنتي-بيدق: فارق 1.3 بيدق قرب التعادل
   * يقلب المباراة، ونفس الفارق عند +5.0 لا يعني شيئًا. القياس بالسنتي-بيدق
   * يظلم التضحيات الهادئة ويكافئ الضجيج في المواقف المحسومة.
   */
  minGapWp: number;
  /** أرضية مطلقة بالسنتي-بيدق تمنع الحالات الحدّية */
  minGapCp: number;
  /**
   * كم يجب أن يخسر الخصم بقبول التضحية (نقاط احتمال) حتى تُعتبر "فخًّا".
   * هذا المسار الثاني للحكم ضروري: في مات ليجال يقيّم المحرك Nxe5 بـ+1.8 فقط
   * لأنه يفترض أن الخصم يرفض الوزير — بينما القبول مات في ثلاث نقلات.
   * قياس التضحية بتقييمها وحده يُسقط أشهر الفخاخ في تاريخ الشطرنج.
   */
  minTrapWp: number;
  /** وضع سريع للمحرك الصائد: بلا تحقق ثانٍ وبلا بحث إضافي عن بديل */
  quick: boolean;
  /** حد عقد اختياري لضبط السرعة */
  nodes?: number;
}

export const DEFAULT_BRILLIANCY_OPTIONS: BrilliancyOptions = {
  depth: 22,
  verifyDepth: 26,
  multipv: 6,
  minSacrifice: 150,
  minSoundEval: 0,
  maxPreEval: 400,
  minGapWp: 8,
  minGapCp: 60,
  minTrapWp: 22,
  quick: false,
};

export const QUICK_BRILLIANCY_OPTIONS: BrilliancyOptions = {
  ...DEFAULT_BRILLIANCY_OPTIONS,
  depth: 13,
  multipv: 4,
  quick: true,
  nodes: 220000,
};

export interface BrilliancyFinding {
  isBrilliant: boolean;
  /** النقلة المرشحة بترميز UCI */
  move: string;
  san: string;
  score: Score;
  /** المادة المبذولة طوعًا مقارنةً بأحرص نقلة ممكنة (بالسنتي-بيدق) */
  offered: number;
  /** إجمالي المادة التي يستطيع الخصم التهامها بعد النقلة */
  offeredAbsolute: number;
  sacrificed: string | null;
  sacrificedNameAr: string | null;
  /** أفضل بديل آمن (غير تضحوي) */
  altMove: string | null;
  altSan: string | null;
  altScore: Score | null;
  /** الفارق بالسنتي-بيدق بين التضحية والبديل الحريص */
  gapCp: number;
  /** الفارق بنقاط احتمال الفوز — وهو المعيار الفعلي للحكم */
  gapWp: number;
  /** ماذا يحدث لو قُبلت التضحية */
  acceptMove: string | null;
  acceptSan: string | null;
  acceptLine: string[];
  acceptScore: Score | null;
  /** أفضل دفاع للخصم — عادةً رفض التضحية */
  declineMove: string | null;
  declineSan: string | null;
  declineLine: string[];
  declineScore: Score | null;
  /** كم يخسر الخصم إذا قبل التضحية بدل أن يرفضها (نقاط احتمال فوز) */
  trapWp: number;
  /** فخّ: قبول التضحية كارثة على الخصم حتى لو كان الرفض ممكنًا */
  isTrap: boolean;
  /** الخط الرئيسي بعد التضحية */
  pvSan: string[];
  mateIn: number | null;
  motifs: string[];
  /** أسباب القبول أو الرفض — تُعرض في التحليل وتفيد في ضبط العتبات */
  reasons: string[];
}

export interface BrilliancyScan {
  fen: string;
  preEvalCp: number;
  bestMove: string | null;
  /** أفضل مرشح تضحوي وُجد (حتى لو لم يستوفِ كل الشروط) */
  finding: BrilliancyFinding | null;
  analysis: AnalysisResult;
}

function mateDistance(score: Score): number | null {
  return score.type === 'mate' && score.value > 0 ? score.value : null;
}

/** هل الفارق عن البديل الحريص كبير بما يكفي ليكون اكتشافًا؟ */
function gapIsDecisive(
  gapCp: number,
  gapWp: number,
  opts: Pick<BrilliancyOptions, 'minGapWp' | 'minGapCp'>,
): boolean {
  return gapWp >= opts.minGapWp && gapCp >= opts.minGapCp;
}

/** هل التضحية سليمة؟ (المات دائمًا سليم، والمات ضدنا دائمًا فاسد) */
function isSound(score: Score, minSoundEval: number): boolean {
  if (score.type === 'mate') return score.value > 0;
  return score.value >= minSoundEval;
}

/**
 * تسمية الموتيفات التكتيكية من الخط الرئيسي.
 * نكتفي بما يمكن كشفه بيقين من الرقعة — لا تخمين.
 */
export function detectMotifs(fen: string, pv: string[]): string[] {
  const motifs = new Set<string>();
  const board = new Chess(fen);
  const mover = board.turn();
  const sacrificed = sacrificedPiece(fen, pv[0]);
  if (sacrificed === 'q') motifs.add('تضحية بالوزير');
  else if (sacrificed === 'r') motifs.add('تضحية بالطابية');
  else if (sacrificed === 'n' || sacrificed === 'b') motifs.add('تضحية بقطعة خفيفة');

  const firstMove = new Chess(fen).move(parseUci(pv[0]));
  if (firstMove) {
    // الهدية اليونانية: فيل يأخذ البيدق أمام الملك المبيّت
    if (firstMove.piece === 'b' && (firstMove.to === 'h7' || firstMove.to === 'h2')) {
      motifs.add('الهدية اليونانية');
    }
    if (firstMove.promotion) motifs.add('ترقية');
  }

  let plies = 0;
  for (const uci of pv) {
    let move;
    try {
      move = board.move(parseUci(uci));
    } catch {
      break;
    }
    if (!move) break;
    plies++;

    if (board.isCheckmate()) {
      const isOurs = move.color === mover;
      if (!isOurs) break;
      const kingSquare = findKing(board, board.turn());
      if (move.piece === 'n' && kingSquare && isSmothered(board, kingSquare)) {
        motifs.add('المات المخنوق');
      }
      if ((move.piece === 'r' || move.piece === 'q') && kingSquare) {
        const rank = kingSquare[1];
        if ((board.turn() === 'w' && rank === '1') || (board.turn() === 'b' && rank === '8')) {
          motifs.add('مات الصف الخلفي');
        }
      }
      motifs.add(`كش مات في ${Math.ceil(plies / 2)}`);
      break;
    }
    if (move.san.includes('#')) break;
  }

  return [...motifs];
}

function findKing(board: Chess, color: 'w' | 'b'): string | null {
  for (const row of board.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square;
    }
  }
  return null;
}

/** المات المخنوق: كل مربعات هروب الملك مشغولة بقطعه هو. */
function isSmothered(board: Chess, kingSquare: string): boolean {
  const file = kingSquare.charCodeAt(0);
  const rank = Number(kingSquare[1]);
  const color = board.get(kingSquare as never)?.color;
  if (!color) return false;
  let neighbours = 0;
  let ownBlockers = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = String.fromCharCode(file + df);
      const r = rank + dr;
      if (f < 'a' || f > 'h' || r < 1 || r > 8) continue;
      neighbours++;
      const piece = board.get(`${f}${r}` as never);
      if (piece && piece.color === color) ownBlockers++;
    }
  }
  return neighbours > 0 && ownBlockers === neighbours;
}

/** يبني تقرير مرشح واحد من خط تحليلي. */
function buildFinding(
  fen: string,
  line: PvLine,
  offered: number,
  offeredAbsolute: number,
  alt: { line: PvLine } | null,
): BrilliancyFinding {
  const reasons: string[] = [];
  const gapCp = alt ? scoreToCp(line.score) - scoreToCp(alt.line.score) : Infinity;
  const sacrificed = sacrificedPiece(fen, line.move);

  return {
    isBrilliant: false,
    move: line.move,
    san: uciToSan(fen, line.move),
    score: line.score,
    offered,
    offeredAbsolute,
    sacrificed,
    sacrificedNameAr: sacrificed ? (PIECE_NAME_AR[sacrificed] ?? null) : null,
    altMove: alt?.line.move ?? null,
    altSan: alt ? uciToSan(fen, alt.line.move) : null,
    altScore: alt?.line.score ?? null,
    gapCp: Number.isFinite(gapCp) ? gapCp : 9999,
    gapWp: alt ? scoreToWinProb(line.score) - scoreToWinProb(alt.line.score) : 100,
    acceptMove: null,
    acceptSan: null,
    acceptLine: [],
    acceptScore: null,
    declineMove: null,
    declineSan: null,
    declineLine: [],
    declineScore: null,
    trapWp: 0,
    isTrap: false,
    pvSan: pvToSan(fen, line.pv, 10),
    mateIn: mateDistance(line.score),
    motifs: detectMotifs(fen, line.pv),
    reasons,
  };
}

/** أفضل رد يقبل التضحية (أكبر مكسب مادي للخصم) — للشرح ولوحة "ماذا لو قبلت". */
function findAcceptance(fen: string, uci: string): string | null {
  const applied = applyUci(fen, uci);
  if (!applied) return null;
  const board = new Chess(applied.fen);
  let best: { uci: string; gain: number } | null = null;
  for (const reply of board.moves({ verbose: true })) {
    if (!reply.captured) continue;
    const replyUci = `${reply.from}${reply.to}${reply.promotion ?? ''}`;
    const gain = gainOf(reply.captured);
    if (!best || gain > best.gain) best = { uci: replyUci, gain };
  }
  return best?.uci ?? null;
}

function gainOf(piece: string): number {
  const values: Record<string, number> = { p: 100, n: 300, b: 300, r: 500, q: 900 };
  return values[piece] ?? 0;
}

/**
 * يحسب عاقبتَي التضحية: القبول والرفض.
 *
 * هذه الدالة تخدم غرضين معًا — الحكم على "الفخّية"، وتغذية لوحة
 * «ماذا لو قبلتَ / ماذا لو رفضت» في شاشة التحليل. الفارق بين الخطين هو
 * الدرس الحقيقي الذي يتعلمه اللاعب من التضحية.
 */
async function describeSacrificeConsequences(
  engine: UciEngine,
  fen: string,
  finding: BrilliancyFinding,
  opts: BrilliancyOptions,
): Promise<void> {
  const afterSac = applyUci(fen, finding.move);
  if (!afterSac) return;

  const probeDepth = Math.max(10, opts.depth - 6);
  const probeNodes = opts.quick ? (opts.nodes ?? 220000) : undefined;

  // أفضل دفاع للخصم في الموقف الناتج (التقييم من منظوره)
  const defence = await engine.analyse(afterSac.fen, {
    multipv: 1,
    depth: probeDepth,
    nodes: probeNodes,
  });
  const bestDefence = defence.lines[0];
  if (bestDefence) {
    finding.declineMove = bestDefence.move;
    finding.declineSan = uciToSan(afterSac.fen, bestDefence.move);
    finding.declineScore = bestDefence.score;
    finding.declineLine = pvToSan(afterSac.fen, bestDefence.pv, 8);
  }

  const accept = findAcceptance(fen, finding.move);
  if (!accept) return;
  finding.acceptMove = accept;
  finding.acceptSan = uciToSan(afterSac.fen, accept);

  // إذا كان أفضل دفاع هو القبول نفسه فلا حاجة لبحث ثانٍ
  if (bestDefence && bestDefence.move === accept) {
    finding.acceptScore = bestDefence.score;
    finding.acceptLine = finding.declineLine;
    finding.trapWp = 0;
    return;
  }

  const acceptProbe = await engine.analyse(afterSac.fen, {
    multipv: 1,
    depth: probeDepth,
    nodes: probeNodes,
    searchmoves: [accept],
  });
  const acceptLine = acceptProbe.lines[0];
  if (!acceptLine) return;

  finding.acceptScore = acceptLine.score;
  finding.acceptLine = pvToSan(afterSac.fen, acceptLine.pv, 8);
  if (bestDefence) {
    // كلا التقييمين من منظور الخصم — الفارق هو ثمن الطمع
    finding.trapWp = scoreToWinProb(bestDefence.score) - scoreToWinProb(acceptLine.score);
    finding.isTrap = finding.trapWp >= opts.minTrapWp;
  }
}

/**
 * يفحص موقفًا كاملًا: هل توجد فيه تضحية رائعة لصاحب الدور؟
 */
export async function scanForBrilliancy(
  engine: UciEngine,
  fen: string,
  options: Partial<BrilliancyOptions> = {},
): Promise<BrilliancyScan> {
  const opts: BrilliancyOptions = { ...DEFAULT_BRILLIANCY_OPTIONS, ...options };
  const analysis = await engine.analyse(fen, {
    multipv: opts.multipv,
    depth: opts.depth,
    nodes: opts.nodes,
  });

  const result: BrilliancyScan = {
    fen,
    preEvalCp: analysis.lines.length ? scoreToCp(analysis.lines[0].score) : 0,
    bestMove: analysis.bestmove,
    finding: null,
    analysis,
  };

  if (analysis.lines.length === 0) return result;

  const bestScore = analysis.lines[0].score;
  const bestCp = scoreToCp(bestScore);

  // الشرط 5: الموقف محسوم سلفًا → أي تضحية فيه "جيدة" لا "رائعة"
  const alreadyWinning = !isMateScore(bestScore) && bestCp > opts.maxPreEval;

  // أقل خسارة مادية ممكنة في هذا الموقف. كل ما يزيد عنها هو مادة بُذلت طوعًا.
  const floor = materialLossFloor(fen);

  const enriched = analysis.lines.map((line) => {
    const absolute = materialOffered(fen, line.move);
    return { line, absolute, sacrificed: Math.max(0, absolute - floor) };
  });

  const sacrifices = enriched.filter(
    (e) =>
      e.sacrificed >= opts.minSacrifice &&
      scoreToCp(e.line.score) >= bestCp - 30 &&
      isSound(e.line.score, opts.minSoundEval),
  );

  if (sacrifices.length === 0) return result;
  const candidate = sacrifices[0];

  // الشرط 4: البديل = أفضل نقلة *حريصة على المادة* (قريبة من الحد الأدنى للخسارة).
  const prudentCeiling = floor + Math.max(60, opts.minSacrifice - 60);
  let alt = enriched.find(
    (e) => e.absolute <= prudentCeiling && e.line.move !== candidate.line.move,
  );

  if (!alt) {
    // لم تظهر أي نقلة حريصة ضمن أفضل الخطوط — نبحث عنها صراحةً
    const prudent = prudentMoves(fen, prudentCeiling, 16, candidate.line.move);
    if (prudent.length > 0) {
      const prudentAnalysis = await engine.analyse(fen, {
        multipv: Math.min(3, prudent.length),
        depth: Math.max(10, opts.depth - (opts.quick ? 2 : 6)),
        searchmoves: prudent,
      });
      if (prudentAnalysis.lines.length > 0) {
        alt = { line: prudentAnalysis.lines[0], absolute: floor, sacrificed: 0 };
      }
    }
  }

  const finding = buildFinding(
    fen,
    candidate.line,
    candidate.sacrificed,
    candidate.absolute,
    alt ?? null,
  );
  await describeSacrificeConsequences(engine, fen, finding, opts);

  // الحُكم
  if (alreadyWinning) {
    finding.reasons.push('الموقف رابح سلفًا — التضحية هنا "جيدة" لا "رائعة"');
    result.finding = finding;
    return result;
  }
  if (!alt) {
    finding.reasons.push('لا يوجد بديل آمن — النقلة اضطرارية وليست اكتشافًا (رائعة !)');
    result.finding = finding;
    return result;
  }
  // مساران للحكم: إمّا الفارق عن البديل الحريص كبير، أو أن قبول التضحية كارثة.
  //
  // البوابة الأولى متساهلة عمدًا حين يتلوها تحقق أعمق: القياس على عمق 20 يتأرجح
  // حول العتبة (الكبد المقلي مثلًا يعطي 10.3 مرة و7.4 مرة أخرى حسب حالة جدول
  // التجزئة)، ورفضٌ مبنيّ على قياس متذبذب يجعل الحكم غير قابل للتكرار.
  // القرار النهائي يقع بعد التحقق على العمق الأكبر.
  const firstGateOpts = opts.quick
    ? opts
    : { minGapWp: opts.minGapWp * 0.6, minGapCp: opts.minGapCp * 0.6 };
  const decisiveGap = gapIsDecisive(finding.gapCp, finding.gapWp, firstGateOpts);
  if (!decisiveGap && !finding.isTrap) {
    finding.reasons.push(
      `البديل الحريص ${finding.altSan} قريب جدًا (فارق ${(finding.gapCp / 100).toFixed(2)} = ${finding.gapWp.toFixed(1)} نقطة احتمال)` +
        ` وقبول التضحية لا يكلّف الخصم إلا ${finding.trapWp.toFixed(0)} نقطة — لا تستحق !!`,
    );
    result.finding = finding;
    return result;
  }

  // الشرط 6: تحقق ثانٍ على عمق أكبر
  if (!opts.quick) {
    const verify = await engine.analyse(fen, {
      multipv: 2,
      depth: opts.verifyDepth,
      searchmoves: [candidate.line.move, alt.line.move],
    });
    const verifiedSac = verify.lines.find((l) => l.move === candidate.line.move);
    const verifiedAlt = verify.lines.find((l) => l.move === alt!.line.move);
    if (!verifiedSac || !isSound(verifiedSac.score, opts.minSoundEval)) {
      finding.reasons.push('سقطت التضحية عند العمق الأكبر — وهم بحث سطحي');
      result.finding = finding;
      return result;
    }
    if (verifiedAlt) {
      const verifiedGap = scoreToCp(verifiedSac.score) - scoreToCp(verifiedAlt.score);
      const verifiedGapWp = scoreToWinProb(verifiedSac.score) - scoreToWinProb(verifiedAlt.score);
      if (!gapIsDecisive(verifiedGap, verifiedGapWp, opts) && !finding.isTrap) {
        finding.gapCp = verifiedGap;
        finding.gapWp = verifiedGapWp;
        finding.altScore = verifiedAlt.score;
        finding.reasons.push(
          `عند العمق الأكبر صار الفارق ${verifiedGapWp.toFixed(1)} نقطة فقط — لا تستحق !!`,
        );
        result.finding = finding;
        return result;
      }
      finding.gapCp = verifiedGap;
      finding.gapWp = verifiedGapWp;
      finding.altScore = verifiedAlt.score;
    }
    finding.score = verifiedSac.score;
    finding.mateIn = mateDistance(verifiedSac.score);
    finding.pvSan = pvToSan(fen, verifiedSac.pv, 10);
    finding.motifs = detectMotifs(fen, verifiedSac.pv);
  }

  finding.isBrilliant = true;
  const what = finding.sacrificedNameAr ?? 'مادة';
  const amount = (finding.offered / 100).toFixed(1);
  if (finding.isTrap) {
    finding.reasons.push(
      `فخّ: تضحية بـ${what} (${amount} بيدق). قبولها بـ${finding.acceptSan} يكلّف الخصم ${finding.trapWp.toFixed(0)} نقطة احتمال فوز`,
    );
  } else {
    finding.reasons.push(
      `تضحية بـ${what} (${amount} بيدق) وتبقى الأفضل بفارق ${(finding.gapCp / 100).toFixed(2)} عن أفضل نقلة حريصة (${finding.gapWp.toFixed(0)} نقطة احتمال فوز)`,
    );
  }
  result.finding = finding;
  return result;
}

export interface BrilliancyProbe {
  found: boolean;
  move: string | null;
  san: string | null;
  gapWp: number;
  offered: number;
  score: Score | null;
}

/**
 * مِسبار سريع: هل يوجد في هذا الموقف *احتمال* تضحية رائعة؟
 *
 * بحث واحد فقط بلا تحقق ولا خطوط جانبية — لأن المحرك الصائد يستدعيه عشرات المرات
 * في كل نقلة. دقته أقل من scanForBrilliancy، وهذا مقبول: مهمته ترتيب المرشحات
 * لا إصدار الحكم النهائي، والحكم النهائي يقع لاحقًا على الموقف الذي يُلعب فعلًا.
 */
export async function probeBrilliancy(
  engine: UciEngine,
  fen: string,
  options: Partial<BrilliancyOptions> = {},
): Promise<BrilliancyProbe> {
  const opts: BrilliancyOptions = { ...QUICK_BRILLIANCY_OPTIONS, ...options };
  const empty: BrilliancyProbe = { found: false, move: null, san: null, gapWp: 0, offered: 0, score: null };

  const analysis = await engine.analyse(fen, {
    multipv: opts.multipv,
    depth: opts.depth,
    nodes: opts.nodes,
  });
  if (analysis.lines.length === 0) return empty;

  const best = analysis.lines[0];
  const bestCp = scoreToCp(best.score);
  if (!isMateScore(best.score) && bestCp > opts.maxPreEval) return empty;

  const floor = materialLossFloor(fen);
  let candidate: PvLine | null = null;
  let candidateOffered = 0;
  let prudent: PvLine | null = null;

  for (const line of analysis.lines) {
    const offered = Math.max(0, materialOffered(fen, line.move) - floor);
    const isSac = offered >= opts.minSacrifice;
    if (
      isSac &&
      !candidate &&
      scoreToCp(line.score) >= bestCp - 30 &&
      isSound(line.score, opts.minSoundEval)
    ) {
      candidate = line;
      candidateOffered = offered;
    } else if (!isSac && !prudent) {
      prudent = line;
    }
  }

  if (!candidate) return empty;

  // المِسبار مُرشِّح لا قاضٍ: يكفيه وجود تضحية سليمة قريبة من الأفضل.
  // اشتراط فارق كبير هنا يُسقط أشهر الفخاخ — مات ليجال فارقه 6.7 نقطة فقط
  // لأن المحرك يفترض أن الخصم يرفض الوزير. الحكم النهائي يقع لاحقًا على
  // الموقف الذي يُلعب فعلًا، بالكاشف الكامل ومساريه.
  const gapWp = prudent
    ? scoreToWinProb(candidate.score) - scoreToWinProb(prudent.score)
    : 0;

  return {
    found: true,
    move: candidate.move,
    san: uciToSan(fen, candidate.move),
    gapWp,
    offered: candidateOffered,
    score: candidate.score,
  };
}

/**
 * يحكم على نقلة لُعبت فعلًا: هل كانت بريليانت؟
 * الفرق عن scanForBrilliancy أن النقلة معطاة سلفًا ولا نبحث عن غيرها.
 */
export async function judgePlayedMove(
  engine: UciEngine,
  fen: string,
  playedUci: string,
  options: Partial<BrilliancyOptions> = {},
): Promise<{ scan: BrilliancyScan; playedWasBrilliant: boolean }> {
  const scan = await scanForBrilliancy(engine, fen, options);
  const playedWasBrilliant =
    scan.finding !== null && scan.finding.isBrilliant && scan.finding.move === playedUci;
  return { scan, playedWasBrilliant };
}
