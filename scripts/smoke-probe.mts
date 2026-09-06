/**
 * فحص المِسبار السريع: هل يرى الفرص التي يراها الكاشف الكامل؟
 * ويقيس "بُعد النظر": هل يراها المحرك قبل نقلتين من حدوثها؟
 */
import { createNodeEngine } from '../src/engine/nodeEngine';
import { probeBrilliancy } from '../src/engine/brilliancy';
import { opponentSacChance } from '../src/engine/hunter';
import { Chess } from '../src/game/chess';

const LINES: { name: string; moves: string[]; expect: boolean }[] = [
  {
    name: 'مات ليجال (بعد Bh5??)',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Nc3', 'Bg4', 'h3', 'Bh5'],
    expect: true,
  },
  {
    name: 'الكبد المقلي (بعد Nxd5??)',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5'],
    expect: true,
  },
  {
    name: 'إسباني هادئ',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
    expect: false,
  },
];

const engine = await createNodeEngine({ multipv: 6 });

for (const line of LINES) {
  const board = new Chess();
  for (const san of line.moves) board.move(san);
  const fen = board.fen();

  const t0 = Date.now();
  const probe = await probeBrilliancy(engine, fen);
  const ok = probe.found === line.expect;
  console.log(
    `${ok ? '✔' : '✘'} ${line.name}: ${probe.found ? `${probe.san} (فارق ${probe.gapWp.toFixed(1)} نقطة، مبذول ${probe.offered})` : 'لا شيء'}  [${Date.now() - t0}ms]`,
  );

  // بُعد النظر: هل يمكن للمحرك أن يرى الفرصة قبل النقلة الأخيرة؟
  const back = new Chess();
  for (const san of line.moves.slice(0, -1)) back.move(san);
  const lastMove = board.history({ verbose: true }).at(-1);
  if (lastMove) {
    const chance = await opponentSacChance(engine, back.fen(), `${lastMove.from}${lastMove.to}`);
    console.log(`   لو لعب الخصم ${lastMove.san} فإن فرصة التضحية = ${(chance * 100).toFixed(0)}%`);
  }
}

engine.dispose();
process.exit(0);
