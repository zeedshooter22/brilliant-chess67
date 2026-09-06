/**
 * اختبارات الكاشف على مواقف حقيقية بمحرك حقيقي.
 *
 * الحالات السالبة هنا لا تقل أهمية عن الموجبة: كاشف يقول "بريليانت" لكل تضحية
 * عديم الفائدة تمامًا، لأن اللاعب سيتعلّم أن يضحّي بلا سبب.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEngine } from './nodeEngine';
import type { UciEngine } from './engine';
import { scanForBrilliancy, probeBrilliancy } from './brilliancy';
import { judgeMove } from './classify';
import { findShortestMate } from './mate';
import { Chess, START_FEN } from '../game/chess';

function fenAfter(moves: string[]): string {
  const board = new Chess();
  for (const san of moves) {
    const move = board.move(san);
    if (!move) throw new Error(`نقلة غير قانونية: ${san}`);
  }
  return board.fen();
}

const POSITIONS = {
  fischer: 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 0 18',
  legal: fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Nc3', 'Bg4', 'h3', 'Bh5']),
  friedLiver: fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5']),
  quietItalian: fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']),
  quietSpanish: fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']),
  backRankMate: '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1',
};

const OPTIONS = { depth: 20, verifyDepth: 24 };

let engine: UciEngine;

beforeAll(async () => {
  engine = await createNodeEngine({ multipv: 6 });
}, 120000);

afterAll(() => {
  engine?.dispose();
});

describe('الحالات الموجبة — تضحيات يجب أن تُكتشف', () => {
  it('بيرن–فيشر 1956: Be6!! تضحية بالوزير', async () => {
    const scan = await scanForBrilliancy(engine, POSITIONS.fischer, OPTIONS);
    expect(scan.finding?.isBrilliant).toBe(true);
    expect(scan.finding?.move).toBe('g4e6');
    expect(scan.finding?.sacrificed).toBe('q');
    // البديل الحريص موجود وأسوأ بوضوح — وهذا ما يجعلها اكتشافًا
    expect(scan.finding?.altSan).toBeTruthy();
    expect(scan.finding!.gapWp).toBeGreaterThan(20);
  }, 180000);

  it('مات ليجال: Nxe5!! تُكتشف عبر مسار الفخّ لا مسار الفارق', async () => {
    const scan = await scanForBrilliancy(engine, POSITIONS.legal, OPTIONS);
    expect(scan.finding?.isBrilliant).toBe(true);
    expect(scan.finding?.move).toBe('f3e5');
    // جوهر الاختبار: المحرك يقيّمها بفارق صغير لأنه يفترض رفض الوزير،
    // والذي يُنقذها هو أن قبولها مات في ثلاث.
    expect(scan.finding?.isTrap).toBe(true);
    expect(scan.finding!.trapWp).toBeGreaterThan(20);
    expect(scan.finding!.acceptLine.join(' ')).toContain('#');
  }, 180000);

  it('الكبد المقلي: Nxf7!! رغم أن التقييم +0.9 فقط', async () => {
    const scan = await scanForBrilliancy(engine, POSITIONS.friedLiver, OPTIONS);
    expect(scan.finding?.isBrilliant).toBe(true);
    expect(scan.finding?.move).toBe('g5f7');
  }, 180000);
});

describe('الحالات السالبة — ما يجب ألا يُكتشف', () => {
  it('الوضع الابتدائي: لا تضحية', async () => {
    const scan = await scanForBrilliancy(engine, START_FEN, OPTIONS);
    expect(scan.finding?.isBrilliant ?? false).toBe(false);
  }, 120000);

  it('الإيطالي الهادئ: Bxf7+ تضحية غير سليمة ولا تُقبل', async () => {
    const scan = await scanForBrilliancy(engine, POSITIONS.quietItalian, OPTIONS);
    expect(scan.finding?.isBrilliant ?? false).toBe(false);
  }, 120000);

  it('الإسباني الهادئ: Bxc6 تبادل رديء لا تضحية رائعة', async () => {
    const scan = await scanForBrilliancy(engine, POSITIONS.quietSpanish, OPTIONS);
    expect(scan.finding?.isBrilliant ?? false).toBe(false);
  }, 120000);
});

describe('المِسبار السريع', () => {
  it('يرصد الفرص في مواقف الفخاخ خلال جزء من الثانية', async () => {
    const started = Date.now();
    const probe = await probeBrilliancy(engine, POSITIONS.legal);
    expect(probe.found).toBe(true);
    expect(probe.move).toBe('f3e5');
    expect(Date.now() - started).toBeLessThan(3000);
  }, 60000);

  it('مُرشِّح متساهل عمدًا — الحكم النهائي للكاشف الكامل', async () => {
    // الإسباني: المسبار قد يمرّر Bxc6 بينما يرفضها الكاشف الكامل
    const probe = await probeBrilliancy(engine, POSITIONS.quietSpanish);
    const scan = await scanForBrilliancy(engine, POSITIONS.quietSpanish, OPTIONS);
    if (probe.found) {
      expect(scan.finding?.isBrilliant ?? false).toBe(false);
    }
  }, 120000);
});

describe('تصنيف النقلات', () => {
  it('يمنح وسام البريليانت للنقلة الصحيحة فقط', async () => {
    const brilliant = await judgeMove(engine, POSITIONS.friedLiver, 'g5f7', OPTIONS);
    expect(brilliant.grade).toBe('brilliant');

    const quiet = await judgeMove(engine, POSITIONS.friedLiver, 'd2d3', OPTIONS);
    expect(quiet.grade).not.toBe('brilliant');
    // ويُبلغ اللاعب أن الفرصة فاتته
    expect(quiet.missedBrilliancy).toBe(true);
    expect(quiet.brilliancy?.san).toBe('Nxf7');
  }, 240000);
});

describe('المات بأقصر طريق', () => {
  it('يجد مات الصف الخلفي في نقلة واحدة', async () => {
    const mate = await findShortestMate(engine, POSITIONS.backRankMate, 5, 18);
    expect(mate).not.toBeNull();
    expect(mate!.mateIn).toBe(1);
    expect(mate!.pvSan[0]).toContain('#');
  }, 120000);

  it('لا يجد ماتًا حيث لا مات', async () => {
    const mate = await findShortestMate(engine, START_FEN, 4, 16);
    expect(mate).toBeNull();
  }, 120000);
});
