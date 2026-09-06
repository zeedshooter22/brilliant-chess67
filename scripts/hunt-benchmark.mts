/**
 * قياس نسبة الصيد: كم مباراة من كل مئة يظهر فيها بريليانت فعلًا؟
 *
 * يلعب المحرك الصائد ضد محرك مُضعَّف يمثّل اللاعب البشري، ويحصي التضحيات الرائعة.
 * هذا الرقم هو الحكم الحقيقي على وعد المشروع — لا الاختبارات الوحدوية.
 *
 * الاستخدام: npx vite-node scripts/hunt-benchmark.mts -- --games 10 --elo 1400
 */
import { createNodeEngine } from '../src/engine/nodeEngine';
import { chooseHunterMove, type HunterOptions } from '../src/engine/hunter';
import { Chess } from '../src/game/chess';
import { toUci } from '../src/game/chess';

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const GAMES = arg('games', 6);
const OPPONENT_ELO = arg('elo', 1400);
const MAX_PLIES = arg('plies', 100);
const SEARCH_DEPTH = arg('depth', 14);
const VERBOSE = process.argv.includes('--verbose');
const BUDGET = arg('budget', 1200);

const hunterOptions: Partial<HunterOptions> = {
  searchDepth: SEARCH_DEPTH,
  probeDepth: 10,
  budgetMs: BUDGET,
  candidateCount: 4,
  replyCount: 3,
  humanStrength: 0.8,
};

const hunter = await createNodeEngine({ multipv: 6, hashMb: 128 });
const human = await createNodeEngine({ multipv: 1, hashMb: 32, elo: OPPONENT_ELO });

console.log(
  `صياد بعمق ${SEARCH_DEPTH} وميزانية ${BUDGET}ms ضد لاعب ${OPPONENT_ELO} — ${GAMES} مباريات\n`,
);

let gamesWithBrilliancy = 0;
let gamesWithAnySac = 0;
let totalBrilliancies = 0;
let totalBaits = 0;
let totalBookMoves = 0;
let totalAlienMoves = 0;
let totalDecisive = 0;
let totalHunterMoves = 0;
const started = Date.now();

for (let game = 1; game <= GAMES; game++) {
  const board = new Chess();
  const hunterIsWhite = game % 2 === 1;
  const found: string[] = [];
  let baits = 0;
  let bookMoves = 0;
  let alienMoves = 0;
  let decisiveSacs = 0;
  let brilliantCount = 0;
  let hunterMoves = 0;

  await hunter.newGame();
  await human.newGame();

  while (!board.isGameOver() && board.history().length < MAX_PLIES) {
    const hunterTurn = (board.turn() === 'w') === hunterIsWhite;
    if (hunterTurn) {
      // تمرير التاريخ ضروري وإلا لم يُستخدم كتاب الفخاخ إطلاقًا
      const decision = await chooseHunterMove(hunter, board.fen(), hunterOptions, {
        history: board.history(),
        engineColor: hunterIsWhite ? 'w' : 'b',
      });
      if (!decision.move) break;
      hunterMoves++;
      if (decision.reason === 'brilliant-now' && decision.brilliancy) {
        brilliantCount++;
        const moveNo = Math.floor(board.history().length / 2) + 1;
        found.push(`⚡ ${moveNo}. ${decision.brilliancy.san}${decision.brilliancy.isTrap ? ' (فخّ)' : ''}`);
      }
      if (decision.reason === 'bait') baits++;
      if (decision.reason === 'book') bookMoves++;
      if (decision.reason === 'alien') alienMoves++;
      if (decision.reason === 'decisive-sac' && decision.brilliancy) {
        decisiveSacs++;
        const moveNo = Math.floor(board.history().length / 2) + 1;
        found.push(
          `⚔ ${moveNo}. ${decision.brilliancy.san} (حاسمة، مات في ${decision.brilliancy.mateIn})`,
        );
      }
      if (VERBOSE) {
        const top = decision.candidates
          .slice(0, 4)
          .map((c) => `${c.san}(-${(c.lossCp / 100).toFixed(2)}|${Math.round(c.sacPotential * 100)}%)`)
          .join(' ');
        console.log(
          `   ${board.history().length + 1}. ${decision.san} [${decision.reason}] ${decision.thinkMs}ms  ${top}`,
        );
      }
      board.move({ from: decision.move.slice(0, 2), to: decision.move.slice(2, 4), promotion: decision.move[4] as never });
    } else {
      const reply = await human.analyse(board.fen(), { depth: 8, multipv: 1 });
      const move = reply.bestmove ?? reply.lines[0]?.move;
      if (!move) break;
      board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] as never });
    }
  }

  totalHunterMoves += hunterMoves;
  totalBaits += baits;
  totalBookMoves += bookMoves;
  totalAlienMoves += alienMoves;
  totalDecisive += decisiveSacs;
  // نعدّ الفئتين منفصلتين: خلطهما يضخّم رقم "البريليانت" بما ليس منه
  totalBrilliancies += brilliantCount;
  if (brilliantCount > 0) gamesWithBrilliancy++;
  if (found.length > 0) gamesWithAnySac++;

  const outcome = board.isCheckmate()
    ? `مات — فاز ${board.turn() === 'w' ? 'الأسود' : 'الأبيض'}`
    : board.isGameOver()
      ? 'تعادل'
      : 'توقف عند الحد';

  console.log(
    `مباراة ${game} (الصياد ${hunterIsWhite ? 'أبيض' : 'أسود'}): ` +
      `${found.length ? found.join('، ') : 'بلا تضحية'} | كتاب: ${bookMoves} · فخاخ: ${baits} · حاسمة: ${decisiveSacs} | ${outcome}`,
  );
}

const minutes = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n=== النتيجة بعد ${minutes} دقيقة ===`);
console.log(
  `مباريات فيها بريليانت (!!): ${gamesWithBrilliancy}/${GAMES} (${Math.round((gamesWithBrilliancy / GAMES) * 100)}%)`,
);
console.log(
  `مباريات فيها لحظة تضحية (!! أو ⚔): ${gamesWithAnySac}/${GAMES} (${Math.round((gamesWithAnySac / GAMES) * 100)}%)`,
);
console.log(`إجمالي التضحيات الرائعة (!!): ${totalBrilliancies}`);
console.log(`إجمالي التضحيات الحاسمة (⚔): ${totalDecisive}`);
console.log(`نقلات الكتاب: ${totalBookMoves} · فخاخ منصوبة: ${totalBaits} · نقلات خادعة: ${totalAlienMoves} · من ${totalHunterMoves} نقلة`);

hunter.dispose();
human.dispose();
process.exit(0);
