/** فحص سريع: هل يقلع المحرك ويحلل ويعيد خطوطًا صحيحة؟ */
import { createNodeEngine } from '../src/engine/nodeEngine';
import { formatScore } from '../src/engine/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// موقف بيرن–فيشر 1956 قبل Bxc4!! الشهيرة (السود يلعب)
const FISCHER = 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 0 18';

const t0 = Date.now();
const engine = await createNodeEngine({ multipv: 4 });
console.log(`أقلع المحرك في ${Date.now() - t0}ms`);

const start = await engine.analyse(START, { depth: 14, multipv: 3 });
console.log(`\nالوضع الابتدائي (عمق ${start.depth}, ${start.timeMs}ms):`);
for (const line of start.lines) {
  console.log(`  ${line.multipv}. ${line.move}  ${formatScore(line.score)}  ${line.pv.slice(0, 5).join(' ')}`);
}

const fischer = await engine.analyse(FISCHER, { depth: 20, multipv: 4 });
console.log(`\nبيرن–فيشر 1956 (عمق ${fischer.depth}, ${fischer.timeMs}ms):`);
for (const line of fischer.lines) {
  console.log(`  ${line.multipv}. ${line.move}  ${formatScore(line.score)}  ${line.pv.slice(0, 6).join(' ')}`);
}

engine.dispose();
console.log('\nتم.');
process.exit(0);
