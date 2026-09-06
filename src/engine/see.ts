/**
 * Static Exchange Evaluation — حساب حصيلة سلسلة التبادلات على مربع واحد.
 *
 * ننفّذها بمحاكاة نقلات حقيقية عبر chess.js بدل جداول الهجوم، لأن مولّد النقلات
 * يتكفّل تلقائيًا بالربط (pins) والكشف والأشعة الخفية (x-ray) — وهي بالضبط
 * الحالات التي تُسقط أي تنفيذ مبسّط وتجعله يصنّف تضحية سليمة كأنها بلندر.
 */
import { Chess, type Move, type Square } from 'chess.js';
import { PIECE_VALUE } from './types';
import { parseUci } from '../game/chess';

function valueOf(piece: string | undefined): number {
  return piece ? (PIECE_VALUE[piece] ?? 0) : 0;
}

/** أرخص قطعة تستطيع الأخذ على المربع الهدف (النقلة الأقل قيمة قانونيًا). */
function leastValuableCaptureOnto(board: Chess, target: Square): Move | null {
  const captures = board
    .moves({ verbose: true })
    .filter((m) => m.to === target && m.captured);
  if (captures.length === 0) return null;
  let best = captures[0];
  for (const m of captures) {
    if (valueOf(m.piece) < valueOf(best.piece)) best = m;
  }
  return best;
}

/**
 * SEE لنقلة معينة (أخذ أو نقلة هادئة).
 * موجب = نربح مادة، سالب = نخسر مادة إذا لعب الخصم بأفضل شكل.
 */
export function see(fen: string, uci: string): number {
  const board = new Chess(fen);
  let move: Move | null = null;
  try {
    move = board.move(parseUci(uci));
  } catch {
    return 0;
  }
  if (!move) return 0;

  const target = move.to as Square;
  const gain: number[] = [];
  // المادة التي ربحناها فورًا (0 للنقلة الهادئة)
  gain[0] = valueOf(move.captured);
  if (move.promotion) gain[0] += valueOf(move.promotion) - PIECE_VALUE.p;
  // القطعة التي تقف الآن على المربع الهدف ومعرّضة للأخذ
  let occupant = move.promotion ? valueOf(move.promotion) : valueOf(move.piece);

  let d = 0;
  // حد أمان: أقصى عدد قطع يمكن أن تشارك في تبادل واحد
  for (let guard = 0; guard < 32; guard++) {
    const capture = leastValuableCaptureOnto(board, target);
    if (!capture) break;
    d++;
    gain[d] = occupant - gain[d - 1];
    if (capture.promotion) gain[d] += valueOf(capture.promotion) - PIECE_VALUE.p;
    occupant = capture.promotion ? valueOf(capture.promotion) : valueOf(capture.piece);
    board.move({ from: capture.from, to: capture.to, promotion: capture.promotion });
  }

  // مرور عكسي: كل جانب له حق التوقف عن الأخذ إذا كان التبادل في غير صالحه
  for (let i = d; i > 0; i--) {
    gain[i - 1] = -Math.max(-gain[i - 1], gain[i]);
  }
  return gain[0];
}

/**
 * كم مادة تعرضها هذه النقلة على الخصم مجانًا؟ (بالسنتي-بيدق)
 *
 * تغطي ثلاث صور للتضحية:
 *  1. أخذ خاسر مباشرة  — Nxf7 والملك يسترد.
 *  2. نقلة تضع القطعة تحت الأخذ — Ng5 والبيدق يأخذها.
 *  3. نقلة هادئة تترك قطعة أخرى معلّقة — Rd1!! والحصان على f3 يسقط.
 * الصورة الثالثة هي التي تميّز التضحيات العظيمة، وأكثر الكواشف تُسقطها.
 */
export function materialOffered(fen: string, uci: string, minPieceValue = 150): number {
  const selfSee = see(fen, uci);
  const applied = new Chess(fen);
  let move: Move | null = null;
  try {
    move = applied.move(parseUci(uci));
  } catch {
    return 0;
  }
  if (!move) return Math.max(0, -selfSee);

  const nextFen = applied.fen();
  let bestOpponentGrab = 0;
  for (const reply of applied.moves({ verbose: true })) {
    if (!reply.captured) continue;
    // مربع الوصول محسوب سلفًا داخل SEE: احتسابه هنا مرة أخرى يحوّل كل تبادل
    // متكافئ إلى "تضحية". بدون هذا الاستثناء يُسجَّل Qxd8+ Kxd8 كتضحية بوزير كامل.
    if (reply.to === move.to) continue;
    // نتجاهل التهام البيادق: مكسبها لا يتجاوز 100 ولا يغيّر حكم التضحية،
    // وتجاهلها يقلّص عدد عمليات SEE إلى الثلث تقريبًا.
    if (valueOf(reply.captured) < minPieceValue && !reply.promotion) continue;
    const gain = see(nextFen, `${reply.from}${reply.to}${reply.promotion ?? ''}`);
    if (gain > bestOpponentGrab) bestOpponentGrab = gain;
  }

  return Math.max(0, -selfSee, bestOpponentGrab);
}

/**
 * خريطة "كم تخسر كل نقلة قانونية من مادة".
 *
 * هذه الدالة هي التصحيح الجوهري في الكاشف: حين تكون قطعة معلّقة أصلًا في الموقف
 * (وهو حال أغلب مواقف التضحيات) تبدو *كل* النقلات وكأنها تبذل مادة، فيختفي
 * "البديل الآمن" ويسقط الكشف. المعيار الصحيح هو الفارق عن أكثر النقلات حرصًا:
 * التضحية هي أن تبذل مادة **كان بإمكانك الاحتفاظ بها**.
 *
 * الخريطة الكاملة مكلفة (~450ms للموقف) فلا تُستخدم في المسار الحيّ —
 * الدوال التالية تحسب ما نحتاجه فقط مع خروج مبكر.
 */
export function materialLossMap(fen: string): Map<string, number> {
  const board = new Chess(fen);
  const map = new Map<string, number>();
  for (const move of board.moves({ verbose: true })) {
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
    map.set(uci, materialOffered(fen, uci));
  }
  return map;
}

/**
 * ترتيب النقلات بحيث تأتي الأرجح أمانًا أولًا: نقلات هادئة بقطع رخيصة.
 * الترتيب وحده يقلّص زمن حساب الأرضية من مئات المللي ثانية إلى وحدات.
 */
function orderBySafetyLikelihood(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const aScore = (a.captured ? 1000 : 0) + valueOf(a.piece);
    const bScore = (b.captured ? 1000 : 0) + valueOf(b.piece);
    return aScore - bScore;
  });
}

const floorCache = new Map<string, number>();

/**
 * أقل مادة يمكن أن تخسرها في هذا الموقف بأفضل لعب حريص.
 * خروج مبكر عند الوصول إلى صفر: لا شيء أفضل منه، ومعظم المواقف تبلغه بعد نقلات قليلة.
 */
export function materialLossFloor(fen: string): number {
  const cached = floorCache.get(fen);
  if (cached !== undefined) return cached;

  const board = new Chess(fen);
  const moves = orderBySafetyLikelihood(board.moves({ verbose: true }));
  let min = Infinity;
  for (const move of moves) {
    const loss = materialOffered(fen, `${move.from}${move.to}${move.promotion ?? ''}`);
    if (loss < min) min = loss;
    if (min === 0) break;
  }
  const floor = Number.isFinite(min) ? min : 0;
  if (floorCache.size > 4000) floorCache.clear();
  floorCache.set(fen, floor);
  return floor;
}

/** نقلات "حريصة على المادة" — مرشّحات البديل الذي نقارن به التضحية. */
export function prudentMoves(fen: string, ceiling: number, limit = 16, exclude?: string): string[] {
  const board = new Chess(fen);
  const out: string[] = [];
  for (const move of orderBySafetyLikelihood(board.moves({ verbose: true }))) {
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
    if (uci === exclude) continue;
    if (materialOffered(fen, uci) <= ceiling) out.push(uci);
    if (out.length >= limit) break;
  }
  return out;
}

/** أقل مادة يمكن أن تخسرها — من خريطة محسوبة سلفًا. */
export function minimumMaterialLoss(lossMap: Map<string, number>): number {
  let min = Infinity;
  for (const loss of lossMap.values()) if (loss < min) min = loss;
  return Number.isFinite(min) ? min : 0;
}

/** هل النقلة "آمنة ماديًا"؟ تُستخدم لإيجاد البديل الهادئ الذي يقابل التضحية. */
export function isQuietlySafe(fen: string, uci: string): boolean {
  return materialOffered(fen, uci) < 100;
}

/** أكبر قطعة يمكن للخصم أن يلتقطها بعد النقلة — لصياغة الشرح العربي. */
export function sacrificedPiece(fen: string, uci: string): string | null {
  const board = new Chess(fen);
  let move: Move | null = null;
  try {
    move = board.move(parseUci(uci));
  } catch {
    return null;
  }
  if (!move) return null;

  if (see(fen, uci) < -50) return move.piece;

  const nextFen = board.fen();
  let bestGain = 0;
  let piece: string | null = null;
  for (const reply of board.moves({ verbose: true })) {
    if (!reply.captured) continue;
    const gain = see(nextFen, `${reply.from}${reply.to}${reply.promotion ?? ''}`);
    if (gain > bestGain) {
      bestGain = gain;
      piece = reply.captured;
    }
  }
  return piece;
}

export const PIECE_NAME_AR: Record<string, string> = {
  p: 'بيدق',
  n: 'حصان',
  b: 'فيل',
  r: 'طابية',
  q: 'وزير',
  k: 'ملك',
};
