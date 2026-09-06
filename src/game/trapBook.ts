/**
 * بنك فخاخ التضحيات في الافتتاح.
 *
 * لماذا هو ضروري: المحرك الصائد لا يرى إلا نقلتين أمامه، وفي الافتتاح الهادئ
 * لا توجد تضحية على هذا المدى مهما بحث. الفخاخ المعروفة هي ذاكرة تكتيكية جاهزة
 * تنقل اللعب إلى بنية يعرف البشر أن الرد الطبيعي فيها يخسر بتضحية.
 *
 * كل خط هنا **يُتحقق منه آليًا** بـ scripts/verify-traps.mts: قانونية النقلات،
 * وثمن كل نقلة بالسنتي-بيدق، وهل ينتج عن الطُعم موقفٌ فيه تضحية رائعة فعلًا.
 * ما يفشل يُوسم بـ verified:false ولا يُلعب.
 */
import { Chess } from './chess';
import generated from '../data/traps.generated.json';

export interface TrapLine {
  id: string;
  nameAr: string;
  /** لون المحرك الذي ينصب الفخ */
  engineColor: 'w' | 'b';
  /** الخط الكامل بالترميز الجبري من الوضع الابتدائي */
  moves: string[];
  /** فكرة الفخ بالعربية — تُعرض في التحليل بعد المباراة */
  ideaAr: string;
  /** الرد الطبيعي الذي يقع في الفخ، ثم العقاب */
  bait: { humanMove: string; punish: string; punishIdeaAr: string };
  /** أقصى ثمن يدفعه المحرك في هذا الخط (يُملأ بالتحقق) */
  costCp?: number;
  verified?: boolean;
}

export const TRAP_BOOK: TrapLine[] = [
  {
    id: 'legal',
    nameAr: 'مات ليجال',
    engineColor: 'w',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Nc3', 'Bg4', 'h3'],
    ideaAr:
      'المحرك يطرد الفيل بـ h3. إن تمسّك الأسود بالربط بـ Bh5 صار الحصان على f3 حرًّا: Nxe5!! يترك الوزير للأخذ، وبعد Bxd1 يأتي Bxf7+ ثم Nd5#.',
    bait: {
      humanMove: 'Bh5',
      punish: 'Nxe5',
      punishIdeaAr: 'تضحية بالوزير: القطع الثلاث تمات الملك قبل أن ينفع الوزير الزائد.',
    },
     costCp: 13,
    verified: true,
  },
  {
    id: 'fried-liver',
    nameAr: 'الكبد المقلي',
    engineColor: 'w',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5'],
    ideaAr:
      'الاسترداد الطبيعي Nxd5 يفتح f7. المحرك يجيب Nxf7!! فيسحب الملك إلى وسط الرقعة بلا مأوى.',
    bait: {
      humanMove: 'Nxd5',
      punish: 'Nxf7',
      punishIdeaAr: 'تضحية بحصان لجرّ الملك إلى e6 حيث تلاحقه كل القطع.',
    },
     costCp: 13,
    verified: true,
  },
  {
    id: 'blackburne-shilling',
    nameAr: 'شلن بلاكبيرن',
    engineColor: 'b',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4'],
    ideaAr:
      'الحصان على d4 يعرض بيدق e5 مجانًا. من يأخذه بـ Nxe5 يواجه Qg5! بهجوم مزدوج على g2 والحصان.',
    bait: {
      humanMove: 'Nxe5',
      punish: 'Qg5',
      punishIdeaAr: 'هجوم مزدوج: البيدق g2 والحصان على e5 لا يمكن إنقاذهما معًا.',
    },
     costCp: 62,
    verified: false,
    // مرفوض بالتحقق: العقاب Qg5 شوكة لا تضحية — فخ ممتاز لكنه ليس بريليانت
  },
  {
    id: 'fishing-pole',
    nameAr: 'صنارة الصيد',
    engineColor: 'b',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Ng4', 'h3', 'h5'],
    ideaAr:
      'الأسود يعرض الحصان على g4 طُعمًا. أخذه بـ hxg4 يفتح الرتل h أمام الطابية والوزير معًا.',
    bait: {
      humanMove: 'hxg4',
      punish: 'hxg4',
      punishIdeaAr: 'فتح الرتل h: الطابية على h8 والوزير على d8 يتعاونان على مات h-file.',
    },
     costCp: 110,
    verified: false,
    // مرفوض بالتحقق: العقاب hxg4 استرداد لا تضحية، والثمن 1.10 أعلى من أي حد معقول
  },
  {
    id: 'elephant',
    nameAr: 'فخ الفيل',
    engineColor: 'b',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7'],
    ideaAr:
      'الحصان على d7 يبدو معلّقًا بعد cxd5 exd5 Nxd5. لكنه ليس كذلك: Nxd5! ثم Bxd8 Bb4+ يستعيد الوزير بزيادة قطعة.',
    bait: {
      humanMove: 'Nxd5',
      punish: 'Nxd5',
      punishIdeaAr: 'الكش المتوسط Bb4+ هو المفتاح: يستعيد الوزير ويبقي القطعة.',
    },
     costCp: 5,
    verified: false,
    // مرفوض بالتحقق: العقاب Nxd5 يربح مادة باسترداد — ليس تضحية
  },
  {
    id: 'greek-gift-setup',
    nameAr: 'إعداد الهدية اليونانية',
    engineColor: 'w',
    moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'e6', 'Bd3', 'Be7', 'Nbd2'],
    ideaAr:
      'بنية كلاسيكية: فيل على d3 وحصان على f3. متى بيّت الأسود صارت Bxh7+ ممكنة مع Ng5+ وQh5.',
    bait: {
      humanMove: 'O-O',
      punish: 'Bxh7+',
      punishIdeaAr: 'الهدية اليونانية: الفيل يفتح الملك والحصان والوزير يكملان الهجوم.',
    },
     costCp: 14,
    verified: false,
    // مرفوض بالتحقق: الهدية اليونانية غير سليمة في هذه البنية بالذات — تحتاج شروطًا أدق
  },
  {
    id: 'englund',
    nameAr: 'فخ إنغلوند',
    engineColor: 'b',
    moves: ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7'],
    ideaAr:
      'الأسود يضحي ببيدق ليطارد على الرتل b. تطوير الفيل الطبيعي Bf4 يقابله Qb4+ بشوكة على b2 وb4.',
    bait: {
      humanMove: 'Bf4',
      punish: 'Qb4+',
      punishIdeaAr: 'كش يجمع الهجوم على b2 والفيل — الأبيض لا يستطيع حماية الاثنين.',
    },
     costCp: 81,
    verified: false,
    // مرفوض بالتحقق: العقاب Qb4+ شوكة لا تضحية
  },
  {
    id: 'lolli-traxler',
    nameAr: 'هجوم تراكسلر المضاد',
    engineColor: 'b',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'Bc5'],
    ideaAr:
      'الأسود يتجاهل التهديد على f7 ويقابل بتهديد مماثل على f2. من يأخذ Nxf7 يواجه Bxf2+!! وهجومًا مباشرًا على الملك.',
    bait: {
      humanMove: 'Nxf7',
      punish: 'Bxf2+',
      punishIdeaAr: 'تضحية مضادة تجرّ الملك إلى f2 حيث لا حماية له.',
    },
     costCp: 91,
    verified: false,
    // مرفوض بالتحقق: Bxf2+ لا تجتاز شرط السلامة هنا، و Bc5 تكلّف 0.91
  },
];

/**
 * الفخاخ المُنقَّبة آليًا (scripts/mine-traps.mts).
 * كلها اجتازت الكاشف الكامل على عمق 20 مع تحقق على 24 — لذلك verified: true.
 */
interface GeneratedTrap {
  id: string;
  seedName: string;
  line: string[];
  engineColor: 'w' | 'b';
  bait: string;
  punish: string;
  fen: string;
  offered: number;
  sacrificedNameAr: string | null;
  motifs: string[];
  pvSan: string[];
  acceptLine: string[];
  isTrap: boolean;
  trapWp: number;
  mateIn: number | null;
  costCp: number;
}

export const GENERATED_TRAPS: TrapLine[] = (
  (generated as { traps?: GeneratedTrap[] }).traps ?? []
).map((t) => ({
  id: t.id,
  nameAr: `${t.seedName} · ${t.punish}${t.isTrap ? ' (فخّ)' : ''}`,
  engineColor: t.engineColor,
  moves: t.line,
  ideaAr:
    `بعد ${t.bait} يصبح ${t.punish} تضحية سليمة` +
    (t.sacrificedNameAr ? ` بـ${t.sacrificedNameAr}` : '') +
    (t.mateIn ? ` تنتهي بمات في ${t.mateIn}` : '') +
    '.',
  bait: {
    humanMove: t.bait,
    punish: t.punish,
    punishIdeaAr: t.motifs.length ? t.motifs.join('، ') : 'تضحية سليمة تقلب الموقف.',
  },
  costCp: t.costCp,
  verified: true,
}));

/** الكتاب الكامل: المنتقى يدويًا (المُتحقَّق منه) + المُنقَّب آليًا. */
export const FULL_BOOK: TrapLine[] = [
  ...TRAP_BOOK.filter((line) => line.verified !== false),
  ...GENERATED_TRAPS,
];

export interface BookMatch {
  line: TrapLine;
  /** النقلة التالية للمحرك في هذا الخط */
  nextMove: string;
  /** كم نقلة بقيت في الخط */
  remaining: number;
}

/**
 * يبحث عن خط فخ يطابق تاريخ المباراة الحالي.
 * التطابق يجب أن يكون على كامل التاريخ — أي انحراف من اللاعب يُخرجنا من الكتاب.
 */
export function findBookMove(
  history: string[],
  engineColor: 'w' | 'b',
  options: { maxCostCp?: number; onlyVerified?: boolean } = {},
): BookMatch | null {
  const maxCost = options.maxCostCp ?? Infinity;
  const matches: BookMatch[] = [];

  for (const line of FULL_BOOK) {
    if (line.engineColor !== engineColor) continue;
    if (options.onlyVerified && line.verified === false) continue;
    if ((line.costCp ?? 0) > maxCost) continue;
    if (history.length >= line.moves.length) continue;
    // هل التاريخ بادئة للخط؟
    const matchesPrefix = history.every((san, i) => san === line.moves[i]);
    if (!matchesPrefix) continue;
    // هل الدور دور المحرك في هذه النقطة؟
    const isEngineTurn = history.length % 2 === (engineColor === 'w' ? 0 : 1);
    if (!isEngineTurn) continue;

    matches.push({
      line,
      nextMove: line.moves[history.length],
      remaining: line.moves.length - history.length,
    });
  }

  if (matches.length === 0) return null;
  // نفضّل الخط الأطول بقاءً — يقودنا أعمق داخل بنية الفخ
  matches.sort((a, b) => b.remaining - a.remaining);
  return matches[0];
}

/** يتحقق من قانونية كل خطوط الكتاب — يُستدعى في الاختبارات. */
export function validateBook(): { line: TrapLine; error: string }[] {
  const problems: { line: TrapLine; error: string }[] = [];
  for (const line of TRAP_BOOK) {
    const board = new Chess();
    for (const san of line.moves) {
      try {
        if (!board.move(san)) {
          problems.push({ line, error: `نقلة غير قانونية: ${san}` });
          break;
        }
      } catch {
        problems.push({ line, error: `نقلة غير قانونية: ${san}` });
        break;
      }
    }
    // الطُعم يجب أن يكون قانونيًا للاعب بعد نهاية الخط
    try {
      const clone = new Chess(board.fen());
      if (!clone.move(line.bait.humanMove)) {
        problems.push({ line, error: `طُعم غير قانوني: ${line.bait.humanMove}` });
      } else if (!clone.move(line.bait.punish)) {
        problems.push({ line, error: `عقاب غير قانوني: ${line.bait.punish}` });
      }
    } catch {
      problems.push({ line, error: `الطُعم أو العقاب غير قانوني` });
    }
  }
  return problems;
}
