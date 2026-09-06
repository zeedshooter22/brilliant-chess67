/**
 * التحقق من بنك الفخاخ بالمحرك.
 *
 * لكل خط: قانونية النقلات، وثمن نقلات المحرك بالسنتي-بيدق، وأهم شيء —
 * هل ينتج عن الطُعم موقفٌ فيه تضحية رائعة **يعترف بها الكاشف**؟
 * الخطوط التي تفشل تُطبع بوضوح ولا تدخل الكتاب.
 */
import { createNodeEngine } from '../src/engine/nodeEngine';
import { scanForBrilliancy } from '../src/engine/brilliancy';
import { formatScore, scoreToCp } from '../src/engine/types';
import { TRAP_BOOK, validateBook } from '../src/game/trapBook';
import { Chess } from '../src/game/chess';

const DEPTH = 18;

const structural = validateBook();
if (structural.length > 0) {
  console.log('=== أخطاء بنيوية ===');
  for (const p of structural) console.log(`✘ ${p.line.nameAr}: ${p.error}`);
  console.log('');
}

const engine = await createNodeEngine({ multipv: 6 });
const results: { id: string; ok: boolean; costCp: number; note: string }[] = [];

for (const line of TRAP_BOOK) {
  const board = new Chess();
  let maxCost = 0;
  let costNote = '';
  let broken = false;

  for (const san of line.moves) {
    const before = board.fen();
    const isEngineMove = (board.turn() === 'w') === (line.engineColor === 'w');
    let move;
    try {
      move = board.move(san);
    } catch {
      move = null;
    }
    if (!move) {
      results.push({ id: line.id, ok: false, costCp: 999, note: `نقلة غير قانونية: ${san}` });
      broken = true;
      break;
    }
    if (!isEngineMove) continue;

    // ثمن نقلة المحرك = الفارق عن أفضل نقلة في ذلك الموقف
    const analysis = await engine.analyse(before, { multipv: 3, depth: DEPTH });
    const best = analysis.lines[0];
    const played = analysis.lines.find((l) => l.move === `${move.from}${move.to}${move.promotion ?? ''}`);
    if (best && played) {
      const cost = Math.max(0, scoreToCp(best.score) - scoreToCp(played.score));
      if (cost > maxCost) {
        maxCost = cost;
        costNote = `${san} تكلّف ${(cost / 100).toFixed(2)}`;
      }
    } else if (best) {
      // النقلة خارج أفضل ثلاثة — نقيسها وحدها
      const probe = await engine.analyse(before, {
        multipv: 1,
        depth: DEPTH,
        searchmoves: [`${move.from}${move.to}${move.promotion ?? ''}`],
      });
      const probeLine = probe.lines[0];
      if (probeLine) {
        const cost = Math.max(0, scoreToCp(best.score) - scoreToCp(probeLine.score));
        if (cost > maxCost) {
          maxCost = cost;
          costNote = `${san} تكلّف ${(cost / 100).toFixed(2)}`;
        }
      }
    }
  }
  if (broken) continue;

  // هل يقع الفخ فعلًا؟
  const trapBoard = new Chess(board.fen());
  let baitOk = false;
  try {
    baitOk = Boolean(trapBoard.move(line.bait.humanMove));
  } catch {
    baitOk = false;
  }
  if (!baitOk) {
    results.push({ id: line.id, ok: false, costCp: maxCost, note: `الطُعم ${line.bait.humanMove} غير قانوني` });
    continue;
  }

  const scan = await scanForBrilliancy(engine, trapBoard.fen(), { depth: 20, verifyDepth: 24 });
  const f = scan.finding;
  const punishUci = f?.move;
  const expectedSan = line.bait.punish;
  const matched = f?.san === expectedSan;
  const ok = Boolean(f?.isBrilliant) && matched;

  results.push({
    id: line.id,
    ok,
    costCp: maxCost,
    note: f
      ? `${f.isBrilliant ? '!!' : '(لا يرقى)'} ${f.san}${matched ? '' : ` ≠ المتوقع ${expectedSan}`} | ${formatScore(f.score)} | فارق ${f.gapWp.toFixed(1)} | ثمن القبول ${f.trapWp.toFixed(0)}${f.isTrap ? ' فخّ' : ''}`
      : 'لا تضحية بعد الطُعم',
  });

  console.log(
    `${ok ? '✔' : '✘'} ${line.nameAr} (${line.engineColor === 'w' ? 'أبيض' : 'أسود'}) — ` +
      `أقصى ثمن ${(maxCost / 100).toFixed(2)}${costNote ? ` (${costNote})` : ''}`,
  );
  console.log(`     ${results.at(-1)!.note}`);
  if (f?.pvSan.length) console.log(`     الخط: ${f.pvSan.join(' ')}`);
  if (f?.acceptLine.length) console.log(`     لو قُبلت: ${f.acceptLine.join(' ')}`);
}

const good = results.filter((r) => r.ok);
console.log(`\n=== ${good.length}/${TRAP_BOOK.length} خط صالح ===`);
console.log('costCp لكل خط:');
for (const r of results) {
  console.log(`  ${r.id}: ${r.ok ? 'صالح' : 'مرفوض'} · ثمن ${(r.costCp / 100).toFixed(2)}`);
}

engine.dispose();
process.exit(0);
