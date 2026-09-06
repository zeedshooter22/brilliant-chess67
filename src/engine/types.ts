/** التقييم دائمًا من منظور الجانب صاحب الدور (side to move). */
export type Score =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number };

export interface PvLine {
  multipv: number;
  depth: number;
  score: Score;
  /** أول نقلة في الخط، بترميز UCI مثل e2e4 أو e7e8q */
  move: string;
  pv: string[];
  nodes?: number;
}

export interface AnalysisResult {
  fen: string;
  depth: number;
  lines: PvLine[];
  bestmove: string | null;
  /** الوقت الفعلي بالمللي ثانية */
  timeMs: number;
}

export interface SearchLimits {
  depth?: number;
  movetime?: number;
  nodes?: number;
  /** حصر البحث في نقلات محددة (ترميز UCI) */
  searchmoves?: string[];
  multipv?: number;
  /** بحث عن مات في N نقلة تحديدًا */
  mate?: number;
}

/** قيم القطع بالسنتي-بيدق المستخدمة في SEE وحساب المادة المضحّى بها. */
export const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 300,
  b: 300,
  r: 500,
  q: 900,
  k: 20000,
};

/** تحويل التقييم إلى رقم قابل للمقارنة (المات = قيمة ضخمة تتناقص مع البعد). */
export function scoreToCp(score: Score): number {
  if (score.type === 'cp') return score.value;
  // مات في نقلة واحدة أثمن من مات في عشر
  const MATE_BASE = 100000;
  return score.value > 0
    ? MATE_BASE - score.value * 100
    : -MATE_BASE - score.value * 100;
}

export function isMateScore(score: Score): boolean {
  return score.type === 'mate';
}

/**
 * احتمال الفوز من التقييم — منحنى lichess.
 * نستخدمه في التصنيف لأن فرق 100cp عند 0.0 يختلف جذريًا عن 100cp عند +8.0
 */
export function winProbability(cp: number): number {
  const clamped = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function scoreToWinProb(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : 0;
  return winProbability(score.value);
}

export function formatScore(score: Score, forWhite = true): string {
  const s = forWhite ? score : negateScore(score);
  if (s.type === 'mate') return `مات ${Math.abs(s.value)}`;
  const pawns = s.value / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(2);
}

export function negateScore(score: Score): Score {
  return score.type === 'cp'
    ? { type: 'cp', value: -score.value }
    : { type: 'mate', value: -score.value };
}
