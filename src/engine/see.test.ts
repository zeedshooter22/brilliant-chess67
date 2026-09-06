import { describe, expect, it } from 'vitest';
import { see, materialOffered, materialLossFloor, prudentMoves, sacrificedPiece } from './see';
import { mateStars } from './mate';
import { Chess, START_FEN } from '../game/chess';
import { validateBook, TRAP_BOOK, FULL_BOOK } from '../game/trapBook';

function fenAfter(moves: string[]): string {
  const board = new Chess();
  for (const san of moves) {
    const move = board.move(san);
    if (!move) throw new Error(`نقلة غير قانونية: ${san}`);
  }
  return board.fen();
}

const FRIED_LIVER = fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5']);
const FISCHER = 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 0 18';

describe('SEE — تقييم التبادل الساكن', () => {
  it('يحسب خسارة الحصان في Nxf7 بالكبد المقلي', () => {
    // نأخذ بيدقًا (100) ونخسر الحصان (300) = ‎-200
    expect(see(FRIED_LIVER, 'g5f7')).toBe(-200);
  });

  it('يعطي صفرًا لنقلة هادئة آمنة', () => {
    expect(see(START_FEN, 'e2e4')).toBe(0);
    expect(materialOffered(START_FEN, 'e2e4')).toBe(0);
  });

  it('يرصد المادة المبذولة في التضحية بصافي الخسارة', () => {
    // حصان مقابل بيدق = 200 صافيًا، لا 300
    expect(materialOffered(FRIED_LIVER, 'g5f7')).toBe(200);
  });

  it('لا يعدّ التبادل المتكافئ تضحية', () => {
    // فخ فيليدور: Qxd8+ Kxd8 تبادل وزيرين، وليس تضحية بوزير
    const philidor = fenAfter(['e4', 'e5', 'Nf3', 'd6', 'd4', 'Nf6', 'dxe5', 'dxe5']);
    expect(materialOffered(philidor, 'd1d8')).toBeLessThan(150);
  });

  it('يميّز القطعة المُضحّى بها', () => {
    expect(sacrificedPiece(FRIED_LIVER, 'g5f7')).toBe('n');
    expect(sacrificedPiece(FISCHER, 'g4e6')).toBe('q');
  });

  it('لا يخدعه الأخذ المتساوي', () => {
    // exd5 استرداد متكافئ لا تضحية
    const before = fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5']);
    expect(see(before, 'e4d5')).toBeGreaterThanOrEqual(0);
  });
});

describe('أرضية الخسارة المادية', () => {
  it('تساوي صفرًا في موقف طبيعي', () => {
    expect(materialLossFloor(START_FEN)).toBe(0);
    expect(materialLossFloor(FRIED_LIVER)).toBe(0);
  });

  it('ترتفع حين تكون قطعة معلّقة بلا نجاة — وهذا هو سبب وجودها', () => {
    // في موقف فيشر الوزير على b6 مهدَّد؛ الأرضية تبقى منخفضة لأن الوزير يستطيع الهرب
    const floor = materialLossFloor(FISCHER);
    expect(floor).toBeLessThan(900);
    // التضحية تُقاس بالفارق عن الأرضية لا بالقيمة المطلقة
    const offered = materialOffered(FISCHER, 'g4e6') - floor;
    expect(offered).toBeGreaterThanOrEqual(150);
  });

  it('تعمل بسرعة كافية للمسار الحيّ', () => {
    const started = Date.now();
    for (let i = 0; i < 20; i++) materialLossFloor(FRIED_LIVER);
    // مع التخزين المؤقت يجب أن تكون فورية
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('تجد نقلات حريصة للمقارنة', () => {
    const prudent = prudentMoves(FISCHER, materialLossFloor(FISCHER) + 100, 10, 'g4e6');
    expect(prudent.length).toBeGreaterThan(0);
    expect(prudent).not.toContain('g4e6');
  });
});

describe('كتاب الفخاخ', () => {
  it('كل خطوطه قانونية بما فيها الطُعم والعقاب', () => {
    expect(validateBook()).toEqual([]);
  });

  it('يستبعد الخطوط التي رفضها التحقق', () => {
    const rejected = TRAP_BOOK.filter((line) => line.verified === false);
    for (const line of rejected) {
      expect(FULL_BOOK.find((l) => l.id === line.id)).toBeUndefined();
    }
  });

  it('كل خط في الكتاب النهائي مُتحقَّق منه وثمنه معقول', () => {
    for (const line of FULL_BOOK) {
      expect(line.verified).toBe(true);
      expect(line.costCp ?? 0).toBeLessThanOrEqual(90);
    }
  });
});

describe('نجوم المات', () => {
  // optimalPlies هنا = عدد نقلات اللاعب المطلوبة (يساوي mateIn)،
  // وليس إجمالي أنصاف النقلات — راجع useBrilliantGame.ts للسبب.
  it('يمنح 3 نجوم للطريق الأمثل بالضبط', () => {
    expect(mateStars(3, 3)).toBe(3);
    expect(mateStars(1, 1)).toBe(3);
  });

  it('لا يمنح 3 نجوم لطريق أطول من الأمثل', () => {
    // هذا هو الخلل الذي كان موجودًا: قبل الإصلاح كانت optimalPlies تُحسب
    // بـ mateIn*2-1 فتُمنح 3 نجوم حتى لو استُهلكت نقلات أكثر من اللازم.
    expect(mateStars(3, 5)).not.toBe(3);
    expect(mateStars(3, 5)).toBe(2);
  });

  it('يخفّض النجوم تدريجيًا مع الإطالة', () => {
    expect(mateStars(2, 4)).toBe(2);
    expect(mateStars(2, 6)).toBe(1);
  });
});
