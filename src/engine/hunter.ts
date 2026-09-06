/**
 * المحرك الصائد — كيف "يلعب ضدك بريليانت دائمًا".
 *
 * محرك عادي لا يضحي إلا صدفة. هذا المحرك يفعل ثلاثة أشياء في كل دور:
 *   1. إن وُجدت تضحية رائعة الآن لعبها فورًا.
 *   2. وإلا اختار من بين النقلات القوية تلك التي **تعظّم احتمال ظهور تضحية**
 *      بعد ردّك المرجَّح، بشرط ألا يتنازل عن أكثر من الحد المسموح.
 *   3. إن تساوى كل شيء لعب الأقوى.
 *
 * الخطوة 2 هي الفرق بين "محرك قوي" و"محرك يعلّمك التضحيات": التنازل الصغير
 * المحسوب هو ثمن خلق الفرص التي لن تظهر من تلقاء نفسها أبدًا.
 */
import type { PvLine, Score } from './types';
import { scoreToCp, scoreToWinProb } from './types';
import type { UciEngine } from './engine';
import {
  probeBrilliancy,
  scanForBrilliancy,
  QUICK_BRILLIANCY_OPTIONS,
  type BrilliancyFinding,
  type BrilliancyOptions,
} from './brilliancy';
import { estimateHumanReplies } from './humanModel';
import { applyUci, uciToSan, Chess, toUci } from '../game/chess';
import { findBookMove, type TrapLine } from '../game/trapBook';

export interface HunterOptions {
  /** أقصى تنازل بالسنتي-بيدق مقابل خلق فرصة تضحية */
  baitToleranceCp: number;
  /** كم نقلة مرشحة نفحص */
  candidateCount: number;
  /** كم ردًّا بشريًا نتوقعه لكل مرشح */
  replyCount: number;
  /** ميزانية التفكير بالمللي ثانية — تُقلّص الفحص عند تجاوزها */
  budgetMs: number;
  /** عمق البحث الأساسي لاختيار النقلة */
  searchDepth: number;
  /** عمق فحص الفرص المستقبلية */
  probeDepth: number;
  /** قوة اللاعب المفترضة في نموذج الردود (0.6 مبتدئ · 2.5 قوي) */
  humanStrength: number;
  /** الحد الأدنى لفرصة التضحية حتى يستحق التنازل */
  minSacPotential: number;
  /** أقصى ثمن مقبول لخط من كتاب الفخاخ (أعلى من حد الطُعم لأن الفخ مدروس ومعروف) */
  bookToleranceCp: number;
  /** تعطيل كتاب الفخاخ (للاختبار أو لمن يريد محركًا نقيًا) */
  useBook: boolean;
  /**
   * الوضع الأجنبي: يفضّل النقلات التي **تبدو بلندر** في النظرة السريعة وهي سليمة
   * في العمق. أشد إرباكًا للاعب وأعلى قيمة تعليمية — لأنها تدرّبه على ألا يحكم
   * على النقلة من مظهرها.
   */
  alienMode: boolean;
  /** عمق "النظرة البشرية السريعة" في الوضع الأجنبي */
  alienShallowDepth: number;
  /** أقل خداع (نقاط احتمال) يستحق اختيار النقلة لأجله */
  minDeceptionWp: number;
  /**
   * "إبقاء المباراة حيّة".
   *
   * أهم إعداد في هذا المحرك، وسببه تعريف البريليانت نفسه: التضحية في موقف
   * محسوم سلفًا (فوق +4) ليست رائعة بل مجرد جيدة. ومحرك قوي ضد لاعب أضعف
   * يتجاوز +4 خلال نقلات قليلة، فيقتل — بفوزه — كل فرصة تضحية في المباراة.
   *
   * الحل ألا يطحن: كلما زاد تفوّقه سمح لنفسه بتنازل أكبر ليبقى في المنطقة التي
   * تُولد فيها التضحيات، مع بقائه رابحًا دائمًا (لا يقلّ عن keepWinningCp).
   */
  keepGameAlive: boolean;
  /** كم يتضاعف حدّ التنازل مع كل سنتي-بيدق تفوّق */
  aheadToleranceFactor: number;
  /** أقصى تنازل إضافي مسموح مهما بلغ التفوّق */
  maxExtraToleranceCp: number;
  /** لا ينزل عن هذا التفوّق مهما تنازل — يبقى رابحًا */
  keepWinningCp: number;
}

export const DEFAULT_HUNTER_OPTIONS: HunterOptions = {
  baitToleranceCp: 50,
  candidateCount: 4,
  replyCount: 3,
  budgetMs: 2600,
  searchDepth: 18,
  probeDepth: 12,
  humanStrength: 1.0,
  minSacPotential: 0.15,
  bookToleranceCp: 80,
  useBook: true,
  alienMode: true,
  alienShallowDepth: 8,
  minDeceptionWp: 12,
  keepGameAlive: true,
  aheadToleranceFactor: 0.5,
  maxExtraToleranceCp: 260,
  keepWinningCp: 150,
};

export interface HunterCandidate {
  move: string;
  san: string;
  score: Score;
  /** كم يتنازل عن أفضل نقلة */
  lossCp: number;
  /** احتمال ظهور تضحية رائعة بعد الرد المرجَّح */
  sacPotential: number;
  /** أمثلة على الردود التي تفتح التضحية */
  traps: Array<{ reply: string; replySan: string; sacSan: string; probability: number }>;
  /** كم تبدو النقلة أسوأ مما هي (نقاط احتمال فوز) */
  deceptionWp: number;
}

export type HunterReason = 'brilliant-now' | 'decisive-sac' | 'book' | 'bait' | 'alien' | 'best';

export interface HunterDecision {
  move: string;
  san: string;
  reason: HunterReason;
  /** التضحية الرائعة التي لعبها المحرك الآن (إن وُجدت) */
  brilliancy: BrilliancyFinding | null;
  candidates: HunterCandidate[];
  thinkMs: number;
  /** شرح مختصر يظهر في لوحة "ماذا يفكر المحرك" */
  note: string;
  /** خط الفخ الذي يسير فيه المحرك حاليًا */
  bookLine: TrapLine | null;
}

const HUNT_PROBE_OPTIONS: Partial<BrilliancyOptions> = {
  ...QUICK_BRILLIANCY_OPTIONS,
  depth: 12,
  multipv: 4,
  nodes: 180000,
};

/**
 * يختار نقلة المحرك في وضع الصيد.
 */
export async function chooseHunterMove(
  engine: UciEngine,
  fen: string,
  options: Partial<HunterOptions> = {},
  context: { history?: string[]; engineColor?: 'w' | 'b' } = {},
): Promise<HunterDecision> {
  const opts: HunterOptions = { ...DEFAULT_HUNTER_OPTIONS, ...options };
  const started = Date.now();

  // ٠) كتاب الفخاخ أولًا: في الافتتاح لا يرى البحث تضحيةً بعد نقلتين،
  //    والذاكرة التكتيكية الجاهزة هي الطريق الوحيد إلى بنية الفخ.
  const bookMove = await tryBookMove(engine, fen, opts, context);
  if (bookMove) {
    return { ...bookMove, thinkMs: Date.now() - started };
  }

  // ١) هل توجد تضحية رائعة الآن؟ إن وُجدت فلا شيء يعلوها.
  const scan = await scanForBrilliancy(engine, fen, {
    depth: opts.searchDepth,
    verifyDepth: opts.searchDepth + 4,
    multipv: 6,
  });

  if (scan.finding?.isBrilliant) {
    return {
      move: scan.finding.move,
      san: scan.finding.san,
      reason: 'brilliant-now',
      brilliancy: scan.finding,
      candidates: [],
      thinkMs: Date.now() - started,
      note: `وجدت تضحية رائعة: ${scan.finding.san}`,
      bookLine: null,
    };
  }

  /**
   * تضحية حاسمة: سليمة وتفرض المات، لكنها لا تحمل وسام !! لأن الموقف محسوم سلفًا.
   *
   * هذه ليست تمييعًا للتعريف بل اعترافًا بحالة حقيقية: حين يخطئ اللاعب مبكرًا يتجاوز
   * التقييم +4.00 فتُستبعد كل تضحية من وسام "بريليانت" بحكم الشرط الخامس. اللعب
   * الأقوى حينها يعني نهاية مملة بلا درس. أن يختم المحرك بتضحية تفرض المات أنفع
   * تعليميًا بكثير — بشرط أن تُسمّى باسمها الصحيح لا أن تُقدَّم على أنها بريليانت.
   */
  const finding = scan.finding;
  if (
    finding &&
    !finding.isBrilliant &&
    finding.mateIn !== null &&
    finding.offered >= 150
  ) {
    return {
      move: finding.move,
      san: finding.san,
      reason: 'decisive-sac',
      brilliancy: finding,
      candidates: [],
      thinkMs: Date.now() - started,
      note:
        `تضحية حاسمة: ${finding.san} تبذل ${finding.sacrificedNameAr ?? 'مادة'} ` +
        `وتفرض المات في ${finding.mateIn}. لا تحمل وسام !! لأن الموقف كان محسومًا سلفًا.`,
      bookLine: null,
    };
  }

  const lines = scan.analysis.lines;
  if (lines.length === 0) {
    const fallback = await engine.analyse(fen, { depth: opts.searchDepth, multipv: 1 });
    const move = fallback.bestmove ?? fallback.lines[0]?.move ?? '';
    return {
      move,
      san: move ? uciToSan(fen, move) : '',
      reason: 'best',
      brilliancy: null,
      candidates: [],
      thinkMs: Date.now() - started,
      note: 'لا خطوط متاحة — لعبت الأقوى',
      bookLine: null,
    };
  }

  // ٢) المرشحون: نقلات قوية داخل حد التنازل
  const bestCp = scoreToCp(lines[0].score);

  // حدّ التنازل يتمدّد مع التفوّق: من يتقدّم بقطعتين يستطيع أن يدفع ثمن فرصة تضحية،
  // ومن يتعادل لا يستطيع. بدون هذا التمدّد يخنق المحركُ الفوزَ فرصَ التضحية.
  const extraTolerance =
    opts.keepGameAlive && bestCp > 200
      ? Math.min((bestCp - 200) * opts.aheadToleranceFactor, opts.maxExtraToleranceCp)
      : 0;
  const tolerance = opts.baitToleranceCp + extraTolerance;

  const affordable = lines
    .filter((line) => {
      const cp = scoreToCp(line.score);
      if (bestCp - cp > tolerance) return false;
      // يتنازل ليُبقي المباراة حيّة، لا ليخسرها
      if (opts.keepGameAlive && bestCp > opts.keepWinningCp && cp < opts.keepWinningCp) {
        return false;
      }
      return true;
    })
    .slice(0, opts.candidateCount);

  const candidates: HunterCandidate[] = [];
  for (const line of affordable) {
    if (Date.now() - started > opts.budgetMs && candidates.length > 0) break;
    const candidate = await evaluateSacPotential(engine, fen, line, bestCp, opts, started);
    candidates.push(candidate);
  }

  if (opts.alienMode && candidates.length > 1) {
    await attachDeception(engine, fen, candidates, opts);
  }

  candidates.sort((a, b) => {
    const scoreOf = (c: HunterCandidate) =>
      c.sacPotential + (opts.alienMode ? Math.max(0, c.deceptionWp) / 100 : 0);
    const diff = scoreOf(b) - scoreOf(a);
    if (Math.abs(diff) > 0.05) return diff;
    return scoreToCp(b.score) - scoreToCp(a.score);
  });

  const chosen = candidates[0];
  const strongest = candidates.find((c) => c.lossCp === 0) ?? candidates[0];

  if (
    chosen &&
    chosen.move !== strongest?.move &&
    chosen.sacPotential < opts.minSacPotential &&
    chosen.deceptionWp >= opts.minDeceptionWp
  ) {
    return {
      move: chosen.move,
      san: chosen.san,
      reason: 'alien',
      brilliancy: null,
      candidates,
      thinkMs: Date.now() - started,
      note:
        `نقلة تبدو خاطئة وهي سليمة: ${chosen.san} — ` +
        `خداع ${chosen.deceptionWp.toFixed(0)} نقطة بتنازل ${(chosen.lossCp / 100).toFixed(2)} فقط`,
      bookLine: null,
    };
  }

  if (chosen && chosen.sacPotential >= opts.minSacPotential && chosen.move !== strongest?.move) {
    return {
      move: chosen.move,
      san: chosen.san,
      reason: 'bait',
      brilliancy: null,
      candidates,
      thinkMs: Date.now() - started,
      note:
        `نصبت فخًّا: ${chosen.san} (تنازل ${(chosen.lossCp / 100).toFixed(2)}` +
        `${extraTolerance > 0 ? ` من حدّ ${(tolerance / 100).toFixed(2)} لأني متقدّم` : ''}) ` +
        `يفتح فرص تضحية بنسبة ${Math.round(chosen.sacPotential * 100)}%`,
      bookLine: null,
    };
  }

  const fallbackMove = chosen?.move ?? lines[0].move;
  return {
    move: fallbackMove,
    san: chosen?.san ?? uciToSan(fen, fallbackMove),
    reason: 'best',
    brilliancy: null,
    candidates,
    thinkMs: Date.now() - started,
    note: chosen
      ? `لا فخّ يستحق التنازل — لعبت الأقوى ${chosen.san}`
      : 'لعبت الأقوى',
    bookLine: null,
  };
}

/**
 * يحاول اتباع خط من كتاب الفخاخ.
 * لا نتبعه أعمى: نتحقق أن النقلة قانونية وأن ثمنها الحقيقي في هذا الموقف
 * ما زال داخل الحد — الكتاب دليل لا أمر.
 */
async function tryBookMove(
  engine: UciEngine,
  fen: string,
  opts: HunterOptions,
  context: { history?: string[]; engineColor?: 'w' | 'b' },
): Promise<Omit<HunterDecision, 'thinkMs'> | null> {
  if (!opts.useBook || !context.history) return null;
  const engineColor = context.engineColor ?? (fen.split(' ')[1] === 'b' ? 'b' : 'w');
  const match = findBookMove(context.history, engineColor, {
    maxCostCp: opts.bookToleranceCp,
    onlyVerified: true,
  });
  if (!match) return null;

  const board = new Chess(fen);
  let move;
  try {
    move = board.move(match.nextMove);
  } catch {
    return null;
  }
  if (!move) return null;
  const uci = toUci(move);

  // تحقق من الثمن الفعلي في هذا الموقف بالذات
  const analysis = await engine.analyse(fen, { multipv: 4, depth: Math.min(14, opts.searchDepth) });
  const best = analysis.lines[0];
  if (best) {
    const played =
      analysis.lines.find((l) => l.move === uci) ??
      (await engine.analyse(fen, { multipv: 1, depth: 12, searchmoves: [uci] })).lines[0];
    if (played) {
      const cost = scoreToCp(best.score) - scoreToCp(played.score);
      if (cost > opts.bookToleranceCp) return null;
    }
  }

  return {
    move: uci,
    san: move.san,
    reason: 'book',
    brilliancy: null,
    candidates: [],
    note: `${match.line.nameAr}: ${move.san} — ${match.line.ideaAr}`,
    bookLine: match.line,
  };
}

/**
 * يقيس احتمال أن تُفتح تضحية رائعة بعد هذه النقلة، مرجّحًا باحتمال رد اللاعب.
 */
async function evaluateSacPotential(
  engine: UciEngine,
  fen: string,
  line: PvLine,
  bestCp: number,
  opts: HunterOptions,
  startedAt: number,
): Promise<HunterCandidate> {
  const candidate: HunterCandidate = {
    move: line.move,
    san: uciToSan(fen, line.move),
    score: line.score,
    lossCp: Math.max(0, bestCp - scoreToCp(line.score)),
    sacPotential: 0,
    traps: [],
    deceptionWp: 0,
  };

  const afterOurMove = applyUci(fen, line.move);
  if (!afterOurMove) return candidate;

  // ردود اللاعب المرجّحة
  const replyAnalysis = await engine.analyse(afterOurMove.fen, {
    multipv: Math.max(4, opts.replyCount + 1),
    depth: opts.probeDepth,
  });
  const replies = estimateHumanReplies(
    afterOurMove.fen,
    replyAnalysis.lines,
    opts.humanStrength,
    line.move,
  ).slice(0, opts.replyCount);

  for (const reply of replies) {
    if (Date.now() - startedAt > opts.budgetMs) break;
    const afterReply = applyUci(afterOurMove.fen, reply.move);
    if (!afterReply) continue;
    const probe = await probeBrilliancy(engine, afterReply.fen, HUNT_PROBE_OPTIONS);
    if (probe.found && probe.san) {
      candidate.sacPotential += reply.probability;
      candidate.traps.push({
        reply: reply.move,
        replySan: reply.san,
        sacSan: probe.san,
        probability: reply.probability,
      });
    }
  }

  return candidate;
}

/**
 * يقيس خداع كل المرشحين ببحثين رخيصين فقط.
 *
 * التقييم العميق موجود سلفًا من البحث الرئيسي، فلا نحتاج إلا النظرة السريعة:
 * بحث ضحل واحد لأفضل نقلة، وآخر مقصور على المرشحين. أربعة أبحاث لكل مرشح
 * كما في القياس المستقل ستجعل الوضع الأجنبي غير عملي في المتصفح.
 */
async function attachDeception(
  engine: UciEngine,
  fen: string,
  candidates: HunterCandidate[],
  opts: HunterOptions,
): Promise<void> {
  const moves = candidates.map((c) => c.move);
  const [shallowBest, shallowMoves] = [
    await engine.analyse(fen, { multipv: 1, depth: opts.alienShallowDepth }),
    await engine.analyse(fen, {
      multipv: moves.length,
      depth: opts.alienShallowDepth,
      searchmoves: moves,
    }),
  ];

  const shallowBestScore = shallowBest.lines[0]?.score;
  const deepBestScore = candidates.reduce<Score | null>(
    (best, c) => (best === null || scoreToCp(c.score) > scoreToCp(best) ? c.score : best),
    null,
  );
  if (!shallowBestScore || !deepBestScore) return;

  for (const candidate of candidates) {
    const shallow = shallowMoves.lines.find((l) => l.move === candidate.move);
    if (!shallow) continue;
    const shallowLoss = Math.max(
      0,
      scoreToWinProb(shallowBestScore) - scoreToWinProb(shallow.score),
    );
    const deepLoss = Math.max(0, scoreToWinProb(deepBestScore) - scoreToWinProb(candidate.score));
    candidate.deceptionWp = shallowLoss - deepLoss;
  }
}

/**
 * وضع الاتجاه المعاكس: هل تفتح هذه النقلة تضحية رائعة **للاعب**؟
 * يُستخدم ليقود المحرك اللاعب إلى لحظة يجد فيها هو التضحية.
 */
export async function opponentSacChance(
  engine: UciEngine,
  fen: string,
  uci: string,
  probeDepth = 12,
): Promise<number> {
  const after = applyUci(fen, uci);
  if (!after) return 0;
  const probe = await probeBrilliancy(engine, after.fen, {
    ...HUNT_PROBE_OPTIONS,
    depth: probeDepth,
  });
  if (!probe.found) return 0;
  // وجود الفرصة يعطي أرضية، والفارق الكبير يرفع الجودة (لحظة أوضح للتدريب)
  return Math.min(1, 0.45 + Math.max(0, probe.gapWp) / 40);
}

/** ترجمة سبب اختيار المحرك إلى نص عربي للعرض. */
export function describeHunterReason(reason: HunterReason): string {
  switch (reason) {
    case 'brilliant-now':
      return 'تضحية رائعة متاحة';
    case 'decisive-sac':
      return 'تضحية حاسمة';
    case 'book':
      return 'كتاب الفخاخ';
    case 'bait':
      return 'نصب فخّ';
    case 'alien':
      return 'نقلة خادعة';
    case 'best':
      return 'أقوى نقلة';
  }
}
