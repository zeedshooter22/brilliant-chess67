/**
 * تمارين معمل البريليانت.
 *
 * تُشتق من نفس الفخاخ المُنقَّبة التي يلعب بها المحرك، لكن بالأدوار معكوسة:
 * هناك يضحّي المحرك عليك، وهنا تجد أنت التضحية. كل تمرين اجتاز الكاشف الكامل
 * على عمق 20 مع تحقق على 24 — الضمان هنا مطلق لأن الموقف نفسه مُتحقَّق منه.
 */
import generated from './traps.generated.json';
import { Chess, sideToMove } from '../game/chess';

export interface Drill {
  id: string;
  /** الموقف الذي يجب أن تجد فيه التضحية */
  fen: string;
  /** الحل بترميز UCI */
  solutionUci: string;
  solutionSan: string;
  /** من أين جاء الموقف — يُعرض كسياق */
  openingName: string;
  /** النقلات المؤدية إليه */
  line: string[];
  /** النقلة التي فتحت الباب */
  bait: string;
  sideToMove: 'w' | 'b';
  sacrificedNameAr: string | null;
  offered: number;
  motifs: string[];
  pvSan: string[];
  acceptLine: string[];
  mateIn: number | null;
  altSan: string | null;
  /** صعوبة تقديرية 1..5 */
  difficulty: number;
  /** تبدو بلندر في النظرة السريعة — أصعب وأمتع */
  looksLikeBlunder: boolean;
  deceptionWp: number;
}

interface RawTrap {
  id: string;
  seedName: string;
  line: string[];
  bait: string;
  punish: string;
  punishUci: string;
  fen: string;
  offered: number;
  sacrificedNameAr: string | null;
  motifs: string[];
  pvSan: string[];
  acceptLine: string[];
  mateIn: number | null;
  altSan: string | null;
  gapWp: number;
  deceptionWp?: number;
  looksLikeBlunder?: boolean;
}

/**
 * الصعوبة من مؤشرات موضوعية لا من التخمين:
 * كلما صغُر الفارق عن البديل الحريص، وكبرت المادة المبذولة، وزاد الخداع — صعُبت.
 */
function estimateDifficulty(trap: RawTrap): number {
  let score = 1;
  if (trap.offered >= 500) score += 1;
  if (trap.offered >= 850) score += 1;
  if (trap.gapWp < 15) score += 1;
  if (trap.looksLikeBlunder) score += 1;
  if (!trap.mateIn) score += 0.5;
  return Math.max(1, Math.min(5, Math.round(score)));
}

export const DRILLS: Drill[] = ((generated as { traps?: RawTrap[] }).traps ?? [])
  .filter((trap) => {
    // نتحقق من قانونية الموقف قبل عرضه — ملف بيانات قديم لا يجب أن يكسر الواجهة
    try {
      const board = new Chess(trap.fen);
      const moves = board.moves({ verbose: true });
      return moves.some((m) => `${m.from}${m.to}${m.promotion ?? ''}` === trap.punishUci);
    } catch {
      return false;
    }
  })
  .map((trap) => ({
    id: trap.id,
    fen: trap.fen,
    solutionUci: trap.punishUci,
    solutionSan: trap.punish,
    openingName: trap.seedName,
    line: trap.line,
    bait: trap.bait,
    sideToMove: sideToMove(trap.fen),
    sacrificedNameAr: trap.sacrificedNameAr,
    offered: trap.offered,
    motifs: trap.motifs,
    pvSan: trap.pvSan,
    acceptLine: trap.acceptLine,
    mateIn: trap.mateIn,
    altSan: trap.altSan,
    difficulty: estimateDifficulty(trap),
    looksLikeBlunder: Boolean(trap.looksLikeBlunder),
    deceptionWp: trap.deceptionWp ?? 0,
  }));

/** يختار التمرين التالي: المستحقّ للمراجعة أولًا، ثم غير المحلول، ثم عشوائي. */
export function pickDrill(
  solvedIds: Set<string>,
  dueIds: Set<string>,
): Drill | null {
  if (DRILLS.length === 0) return null;
  const due = DRILLS.filter((d) => dueIds.has(d.id));
  if (due.length > 0) return due[Math.floor(Math.random() * due.length)];
  const fresh = DRILLS.filter((d) => !solvedIds.has(d.id));
  const pool = fresh.length > 0 ? fresh : DRILLS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const DRILL_COUNT = DRILLS.length;
