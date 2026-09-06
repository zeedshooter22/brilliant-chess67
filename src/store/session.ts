/**
 * تقدّم اللاعب — يُحفظ في المتصفح.
 *
 * التكرار المتباعد هنا مبسّط عمدًا (SM-2 مختصر): ما أخطأت فيه يعود غدًا،
 * وما أصبته يبتعد أكثر في كل مرة. الغرض ألا تختفي التضحية التي فاتتك.
 */

const STORAGE_KEY = 'brilliant-lab-progress-v1';

export interface DrillRecord {
  id: string;
  /** عدد مرات الحل الصحيح المتتالية */
  streak: number;
  /** آخر محاولة */
  lastAttempt: number;
  /** موعد المراجعة القادم */
  dueAt: number;
  attempts: number;
  solvedFirstTry: number;
}

export interface Progress {
  drills: Record<string, DrillRecord>;
  /** إحصاءات حسب الموتيف — لتقول للاعب أين ضعفه */
  motifStats: Record<string, { seen: number; solved: number }>;
  totalSolved: number;
  totalAttempts: number;
  bestStreak: number;
  currentStreak: number;
  /** تضحيات وجدها اللاعب في مباريات حقيقية */
  gameBrilliancies: number;
}

const EMPTY: Progress = {
  drills: {},
  motifStats: {},
  totalSolved: 0,
  totalAttempts: 0,
  bestStreak: 0,
  currentStreak: 0,
  gameBrilliancies: 0,
};

/** فترات المراجعة بالأيام حسب طول سلسلة النجاح. */
const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];
const DAY = 86400000;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { ...EMPTY, ...parsed, drills: parsed.drills ?? {}, motifStats: parsed.motifStats ?? {} };
  } catch {
    // تخزين معطّل أو ممتلئ — التقدّم رفاهية لا يجب أن تكسر التطبيق
    return { ...EMPTY };
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* تجاهل */
  }
}

export function recordAttempt(
  progress: Progress,
  drillId: string,
  motifs: string[],
  solved: boolean,
  firstTry: boolean,
): Progress {
  const now = Date.now();
  const existing = progress.drills[drillId] ?? {
    id: drillId,
    streak: 0,
    lastAttempt: 0,
    dueAt: 0,
    attempts: 0,
    solvedFirstTry: 0,
  };

  const streak = solved && firstTry ? Math.min(existing.streak + 1, INTERVALS_DAYS.length - 1) : 0;
  const record: DrillRecord = {
    ...existing,
    streak,
    lastAttempt: now,
    dueAt: now + INTERVALS_DAYS[streak] * DAY,
    attempts: existing.attempts + 1,
    solvedFirstTry: existing.solvedFirstTry + (solved && firstTry ? 1 : 0),
  };

  const motifStats = { ...progress.motifStats };
  for (const motif of motifs) {
    const stat = motifStats[motif] ?? { seen: 0, solved: 0 };
    motifStats[motif] = { seen: stat.seen + 1, solved: stat.solved + (solved ? 1 : 0) };
  }

  const currentStreak = solved && firstTry ? progress.currentStreak + 1 : 0;

  const updated: Progress = {
    ...progress,
    drills: { ...progress.drills, [drillId]: record },
    motifStats,
    totalSolved: progress.totalSolved + (solved ? 1 : 0),
    totalAttempts: progress.totalAttempts + 1,
    currentStreak,
    bestStreak: Math.max(progress.bestStreak, currentStreak),
  };
  saveProgress(updated);
  return updated;
}

export function solvedIds(progress: Progress): Set<string> {
  return new Set(
    Object.values(progress.drills)
      .filter((record) => record.streak > 0)
      .map((record) => record.id),
  );
}

export function dueIds(progress: Progress): Set<string> {
  const now = Date.now();
  return new Set(
    Object.values(progress.drills)
      .filter((record) => record.dueAt <= now && record.attempts > 0 && record.streak < 3)
      .map((record) => record.id),
  );
}

/** أضعف الموتيفات لدى اللاعب — تُعرض في شاشة التقدّم. */
export function weakestMotifs(progress: Progress, limit = 3): { motif: string; rate: number; seen: number }[] {
  return Object.entries(progress.motifStats)
    .filter(([, stat]) => stat.seen >= 2)
    .map(([motif, stat]) => ({ motif, rate: stat.solved / stat.seen, seen: stat.seen }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, limit);
}

export function noteGameBrilliancy(progress: Progress): Progress {
  const updated = { ...progress, gameBrilliancies: progress.gameBrilliancies + 1 };
  saveProgress(updated);
  return updated;
}
