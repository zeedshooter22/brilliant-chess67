/**
 * فحص كاشف البريليانت على حالات موجبة وسالبة معروفة.
 * المواقف تُبنى من قوائم نقلات لا من FEN مكتوب يدويًا — أي خطأ في الخط يظهر فورًا
 * كنقلة غير قانونية بدل أن يمر كموقف خاطئ صامت.
 */
import { createNodeEngine } from '../src/engine/nodeEngine';
import { scanForBrilliancy } from '../src/engine/brilliancy';
import { formatScore } from '../src/engine/types';
import { see, materialOffered, materialLossMap, minimumMaterialLoss, materialLossFloor } from '../src/engine/see';
import { Chess, START_FEN } from '../src/game/chess';

interface Case {
  name: string;
  moves?: string[];
  fen?: string;
  expect: 'brilliant' | 'none';
  expectMove?: string;
}

const CASES: Case[] = [
  {
    name: 'بيرن–فيشر 1956 — Be6!! تضحية بالوزير',
    fen: 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 0 18',
    expect: 'brilliant',
    expectMove: 'g4e6',
  },
  {
    name: 'مات ليجال — بعد 5...Bh5?? تظهر Nxe5!!',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Nc3', 'Bg4', 'h3', 'Bh5'],
    expect: 'brilliant',
    expectMove: 'f3e5',
  },
  {
    name: 'الكبد المقلي — بعد 5...Nxd5?? تظهر Nxf7!!',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5'],
    expect: 'brilliant',
    expectMove: 'g5f7',
  },
  {
    name: 'سالب: الوضع الابتدائي',
    fen: START_FEN,
    expect: 'none',
  },
  {
    name: 'سالب: تضحية غير سليمة — Bxf7+ في الإيطالي الهادئ',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    expect: 'none',
  },
  {
    name: 'سالب: موقف رابح سلفًا — التضحية فيه "جيدة" لا "رائعة"',
    fen: 'r1b1k2r/ppppqppp/8/8/8/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    expect: 'none',
  },
  {
    name: 'سالب: افتتاح إسباني هادئ',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
    expect: 'none',
  },
  {
    name: 'سالب: نهاية بيادق متعادلة',
    fen: '8/5k2/8/4p3/4P3/5K2/8/8 w - - 0 1',
    expect: 'none',
  },
];

function fenOf(testCase: Case): string {
  if (testCase.fen) return testCase.fen;
  const board = new Chess();
  for (const san of testCase.moves ?? []) {
    const move = board.move(san);
    if (!move) throw new Error(`نقلة غير قانونية "${san}" في: ${testCase.name}`);
  }
  return board.fen();
}

const engine = await createNodeEngine({ multipv: 6 });
let passed = 0;

for (const testCase of CASES) {
  const fen = fenOf(testCase);
  const started = Date.now();
  const scan = await scanForBrilliancy(engine, fen, { depth: 20, verifyDepth: 24 });
  const f = scan.finding;
  const got = f?.isBrilliant ? 'brilliant' : 'none';
  const moveOk = !testCase.expectMove || f?.move === testCase.expectMove;
  const ok = got === testCase.expect && (got === 'none' || moveOk);
  if (ok) passed++;

  console.log(`\n${ok ? '✔' : '✘'} ${testCase.name}   (${Date.now() - started}ms)`);
  console.log(`   ${fen}`);
  console.log(`   التقييم قبل النقلة: ${(scan.preEvalCp / 100).toFixed(2)}`);
  if (f) {
    console.log(
      `   المرشح: ${f.san} | ${formatScore(f.score)} | مبذول ${(f.offered / 100).toFixed(1)} بيدق` +
        ` | البديل الحريص ${f.altSan ?? '—'} ${f.altScore ? formatScore(f.altScore) : ''}` +
        ` | فارق ${(f.gapCp / 100).toFixed(2)} = ${f.gapWp.toFixed(1)} نقطة احتمال`,
    );
    console.log(`   الخط: ${f.pvSan.join(' ')}`);
    console.log(`   الموتيفات: ${f.motifs.join('، ') || '—'}`);
    console.log(`   لو قُبلت (${f.acceptSan ?? '—'}): ${f.acceptLine.join(' ') || '—'}`);
    console.log(`   لو رُفضت (${f.declineSan ?? '—'}): ${f.declineLine.join(' ') || '—'}`);
    console.log(`   ثمن القبول: ${f.trapWp.toFixed(1)} نقطة${f.isTrap ? '  ← فخّ' : ''}`);
    for (const reason of f.reasons) console.log(`   • ${reason}`);
  } else {
    console.log('   لا يوجد أي مرشح تضحوي.');
  }
}

console.log('\n=== فحص SEE وخريطة الخسارة ===');
const friedLiver = fenOf(CASES[2]);
const lossMap = materialLossMap(friedLiver);
console.log(`  Nxf7: SEE=${see(friedLiver, 'g5f7')} | مبذول مطلق=${materialOffered(friedLiver, 'g5f7')}`);
console.log(`  أقل خسارة ممكنة في الموقف = ${minimumMaterialLoss(lossMap)} (على ${lossMap.size} نقلة قانونية)`);
const t0 = Date.now();
materialLossMap(friedLiver);
console.log(`  زمن الخريطة الكاملة: ${Date.now() - t0}ms`);
const t1 = Date.now();
for (const c of CASES) materialLossFloor(fenOf(c));
console.log(`  زمن الأرضية السريعة لكل المواقف (${CASES.length}): ${Date.now() - t1}ms`);

console.log(`\nالنتيجة: ${passed}/${CASES.length}`);
engine.dispose();
process.exit(passed === CASES.length ? 0 : 1);
