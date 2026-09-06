/**
 * منقّب الفخاخ — يستخرج فخاخ التضحية المُتحقَّق منها آليًا.
 *
 * الفكرة: أغلب "الفخاخ" المشهورة تربح مادة بشوكة أو استرداد، لا بتضحية. أما ما
 * نحتاجه فهو مواقف يكون فيها **الرد البشري الطبيعي** هو ما يفتح تضحية رائعة سليمة.
 * لا سبيل لجمع هذه إلا بالبحث الآلي: نستكشف شجرة الافتتاحات الحادة، ونجرّب بعد كل
 * موقف أكثر الردود بشرية، ونمرّر الناتج على مِسبار سريع ثم على الكاشف الكامل.
 *
 * البحث **بالعرض لا بالعمق**، وكل البذور في طابور واحد: فخاخ الافتتاح ضحلة بطبيعتها،
 * والبحث العمقي يغرق في فرع واحد ويستهلك الوقت كله قبل أن يفحص الأنصاف الأولى.
 *
 * الاستخدام:
 *   npx vite-node scripts/mine-traps.mts -- --minutes 40 --maxply 16 --width 2
 */
import fs from 'node:fs';
import path from 'node:path';
import { createNodeEngine } from '../src/engine/nodeEngine';
import { probeBrilliancy, scanForBrilliancy } from '../src/engine/brilliancy';
import { measureDeception } from '../src/engine/deception';
import { estimateHumanReplies } from '../src/engine/humanModel';
import { scoreToCp, formatScore } from '../src/engine/types';
import { Chess } from '../src/game/chess';

function numArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const MINUTES = numArg('minutes', 40);
const MAX_PLY = numArg('maxply', 16);
const WIDTH = numArg('width', 2);
const HUMAN_REPLIES = numArg('replies', 3);
const MAX_BOOK_COST = numArg('maxcost', 90);
const DEADLINE = Date.now() + MINUTES * 60000;

/** جذور حادة: الافتتاحات التي تكثر فيها التضحيات فعلًا. */
const SEEDS: { name: string; moves: string[] }[] = [
  { name: 'إيطالي', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { name: 'الفرسان الاثنان', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { name: 'كاليدا', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5'] },
  { name: 'إسباني', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { name: 'اسكتلندي', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { name: 'مقامرة إيفانز', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'] },
  { name: 'مقامرة الملك', moves: ['e4', 'e5', 'f4'] },
  { name: 'فييني', moves: ['e4', 'e5', 'Nc3'] },
  { name: 'فيليدور', moves: ['e4', 'e5', 'Nf3', 'd6'] },
  { name: 'صقلي مفتوح', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'] },
  { name: 'دراغون', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'] },
  { name: 'فرنسي', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'] },
  { name: 'كارو-كان', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3'] },
  { name: 'مقامرة الوزير', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'] },
  { name: 'هندي ملكي', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6'] },
  { name: 'لندن', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6', 'Bd3'] },
];

interface MinedTrap {
  id: string;
  seedName: string;
  line: string[];
  engineColor: 'w' | 'b';
  bait: string;
  punish: string;
  punishUci: string;
  fen: string;
  scoreCp: number;
  gapWp: number;
  trapWp: number;
  isTrap: boolean;
  offered: number;
  sacrificedNameAr: string | null;
  motifs: string[];
  pvSan: string[];
  acceptLine: string[];
  declineLine: string[];
  mateIn: number | null;
  altSan: string | null;
  costCp: number;
  /** كم تبدو التضحية بلندر في النظرة السريعة — قيمة الفخ التدريبية */
  deceptionWp: number;
  looksLikeBlunder: boolean;
}

interface Node {
  history: string[];
  engineColor: 'w' | 'b';
  seedName: string;
  maxCost: number;
}

const outDir = path.resolve(import.meta.dirname, '..', 'src', 'data');
const outFile = path.join(outDir, 'traps.generated.json');

/**
 * نحمّل البنك الموجود وندمج فيه بدل استبداله، ونحفظ بعد كل اكتشاف.
 * التنقيب طويل وقابل للإيقاف في أي لحظة؛ الكتابة في النهاية وحدها تعني أن
 * إيقافه يضيّع كل ما وجده — وهذا ما حدث فعلًا في أول تشغيل طويل.
 */
function loadExisting(): MinedTrap[] {
  try {
    if (!fs.existsSync(outFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(outFile, 'utf-8')) as { traps?: MinedTrap[] };
    return parsed.traps ?? [];
  } catch {
    return [];
  }
}

const engine = await createNodeEngine({ multipv: 6, hashMb: 192 });
const existing = loadExisting();
const traps: MinedTrap[] = [...existing];
const knownKeys = new Set(existing.map((t) => `${t.fen}|${t.punish}`));
let newFinds = 0;

function persist(): void {
  const sorted = [...traps].sort((a, b) => b.deceptionWp - a.deceptionWp || b.gapWp - a.gapWp);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        engine: 'stockfish-18-lite',
        settings: { maxPly: MAX_PLY, width: WIDTH, humanReplies: HUMAN_REPLIES, depth: 20, verifyDepth: 24 },
        stats: {
          probesRun,
          probeHits,
          fullScans,
          nodesExpanded,
          traps: sorted.length,
          newThisRun: newFinds,
        },
        traps: sorted,
      },
      null,
      2,
    ),
    'utf-8',
  );
}
const seenFens = new Set<string>();
const seenNodes = new Set<string>();
let probesRun = 0;
let probeHits = 0;
let fullScans = 0;
let nodesExpanded = 0;

console.log(
  `منقّب الفخاخ (بحث بالعرض) — ${MINUTES} دقيقة · عمق ${MAX_PLY} نصف نقلة · عرض ${WIDTH} · ردود ${HUMAN_REPLIES}\n`,
);

function boardOf(history: string[]): Chess {
  const board = new Chess();
  for (const san of history) board.move(san);
  return board;
}

// الطابور يبدأ بكل البذور معًا حتى يتشارك الجميع الوقت بالتساوي حسب العمق
const queue: Node[] = [];
for (const seed of SEEDS) {
  let legal = true;
  const board = new Chess();
  for (const san of seed.moves) {
    try {
      if (!board.move(san)) legal = false;
    } catch {
      legal = false;
    }
    if (!legal) break;
  }
  if (!legal) {
    console.log(`✘ بذرة غير قانونية: ${seed.name}`);
    continue;
  }
  for (const engineColor of ['w', 'b'] as const) {
    queue.push({ history: seed.moves, engineColor, seedName: seed.name, maxCost: 0 });
  }
}

while (queue.length > 0 && Date.now() < DEADLINE) {
  const node = queue.shift()!;
  const key = `${node.engineColor}|${node.history.join(' ')}`;
  if (seenNodes.has(key)) continue;
  seenNodes.add(key);

  if (node.history.length >= MAX_PLY) continue;
  const board = boardOf(node.history);
  if (board.isGameOver()) continue;

  nodesExpanded++;
  const fen = board.fen();
  const engineTurn = (board.turn() === 'w') === (node.engineColor === 'w');

  if (engineTurn) {
    // المحرك يبني بنية الفخ: نتفرّع على أقوى نقلاته ضمن الثمن المسموح
    const analysis = await engine.analyse(fen, { multipv: WIDTH, depth: 14 });
    const bestCp = analysis.lines[0] ? scoreToCp(analysis.lines[0].score) : 0;
    for (const line of analysis.lines.slice(0, WIDTH)) {
      const cost = Math.max(0, bestCp - scoreToCp(line.score));
      if (node.maxCost + 0 > MAX_BOOK_COST || cost > MAX_BOOK_COST) continue;
      const child = new Chess(fen);
      let move;
      try {
        move = child.move({
          from: line.move.slice(0, 2),
          to: line.move.slice(2, 4),
          promotion: line.move[4] as never,
        });
      } catch {
        continue;
      }
      if (!move) continue;
      queue.push({
        history: [...node.history, move.san],
        engineColor: node.engineColor,
        seedName: node.seedName,
        maxCost: Math.max(node.maxCost, cost),
      });
    }
    continue;
  }

  // دور اللاعب: نجرّب أكثر الردود بشرية ونفحص ما ينتج عنها
  const replyAnalysis = await engine.analyse(fen, { multipv: HUMAN_REPLIES + 2, depth: 12 });
  const replies = estimateHumanReplies(fen, replyAnalysis.lines, 0.8).slice(0, HUMAN_REPLIES);

  for (const reply of replies) {
    if (Date.now() > DEADLINE) break;
    const after = new Chess(fen);
    let baitMove;
    try {
      baitMove = after.move({
        from: reply.move.slice(0, 2),
        to: reply.move.slice(2, 4),
        promotion: reply.move[4] as never,
      });
    } catch {
      continue;
    }
    if (!baitMove) continue;
    const afterFen = after.fen();
    const childHistory = [...node.history, baitMove.san];

    if (!seenFens.has(afterFen)) {
      seenFens.add(afterFen);
      probesRun++;
      const probe = await probeBrilliancy(engine, afterFen, { depth: 12, multipv: 4, nodes: 200000 });

      if (probe.found) {
        probeHits++;
        fullScans++;
        const scan = await scanForBrilliancy(engine, afterFen, { depth: 20, verifyDepth: 24 });
        const f = scan.finding;
        if (f?.isBrilliant) {
          const deception = await measureDeception(engine, afterFen, f.move, {
            shallowDepth: 8,
            deepDepth: 20,
          });
          const trap: MinedTrap = {
            id: `mined-${Date.now().toString(36)}-${traps.length + 1}`,
            seedName: node.seedName,
            line: node.history,
            engineColor: node.engineColor,
            bait: baitMove.san,
            punish: f.san,
            punishUci: f.move,
            fen: afterFen,
            scoreCp: scoreToCp(f.score),
            gapWp: Math.round(f.gapWp * 10) / 10,
            trapWp: Math.round(f.trapWp * 10) / 10,
            isTrap: f.isTrap,
            offered: f.offered,
            sacrificedNameAr: f.sacrificedNameAr,
            motifs: f.motifs,
            pvSan: f.pvSan,
            acceptLine: f.acceptLine,
            declineLine: f.declineLine,
            mateIn: f.mateIn,
            altSan: f.altSan,
            costCp: node.maxCost,
            deceptionWp: Math.round(deception.deceptionWp * 10) / 10,
            looksLikeBlunder: deception.looksLikeBlunder,
          };
          const key = `${trap.fen}|${trap.punish}`;
          if (knownKeys.has(key)) continue;
          knownKeys.add(key);
          traps.push(trap);
          newFinds++;
          persist();
          console.log(
            `⚡ [${node.seedName}] ...${node.history.slice(-3).join(' ')} → ${baitMove.san}?  ثم ${f.san}!! ` +
              `(${formatScore(f.score)} · مبذول ${(f.offered / 100).toFixed(1)} · فارق ${f.gapWp.toFixed(0)}` +
              `${f.isTrap ? ` · فخّ ${f.trapWp.toFixed(0)}` : ''}` +
              `${deception.looksLikeBlunder ? ' · تبدو بلندر 👽' : ''} · ثمن الخط ${(node.maxCost / 100).toFixed(2)})`,
          );
          continue; // وجدنا الفخ — لا نتعمّق أكثر في هذا الفرع
        }
      }
    }

    queue.push({
      history: childHistory,
      engineColor: node.engineColor,
      seedName: node.seedName,
      maxCost: node.maxCost,
    });
  }

  if (nodesExpanded % 25 === 0) {
    console.log(
      `   … ${nodesExpanded} عقدة · ${traps.length} فخ · الطابور ${queue.length} · متبقٍ ${Math.max(0, Math.round((DEADLINE - Date.now()) / 60000))} دقيقة`,
    );
  }
}

persist();

console.log(`\n=== انتهى ===`);
console.log(
  `عقد: ${nodesExpanded} · مِسبارات: ${probesRun} · إصابات: ${probeHits} · فحوص كاملة: ${fullScans} · فخاخ مؤكدة: ${traps.length}`,
);
console.log(`منها تبدو بلندر (فخ أجنبي): ${traps.filter((t) => t.looksLikeBlunder).length}`);
console.log(`كُتب الملف: src/data/traps.generated.json`);

engine.dispose();
process.exit(0);
