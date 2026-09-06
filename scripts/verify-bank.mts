/**
 * إعادة التحقق من بنك الفخاخ المُنقَّب.
 *
 * يُشغَّل بعد كل تنقيب وبعد أي تعديل في الكاشف: يعيد فحص كل مدخلة بالكاشف الحالي
 * على عمق أكبر، ويحذف ما لم يعد يجتاز الشروط. بدون هذه الخطوة يتراكم في البنك
 * ما كان صحيحًا بمعايير قديمة — وهذا أسوأ من بنك فارغ.
 *
 * الاستخدام: npx vite-node scripts/verify-bank.mts -- [--depth 22] [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createNodeEngine } from '../src/engine/nodeEngine';
import { scanForBrilliancy } from '../src/engine/brilliancy';
import { formatScore } from '../src/engine/types';
import { Chess } from '../src/game/chess';

function numArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const DEPTH = numArg('depth', 22);
const VERIFY_DEPTH = DEPTH + 4;
const WRITE = process.argv.includes('--write');

const dataPath = path.resolve(import.meta.dirname, '..', 'src', 'data', 'traps.generated.json');
if (!fs.existsSync(dataPath)) {
  console.log('لا يوجد ملف فخاخ مُنقَّبة — شغّل mine-traps أولًا.');
  process.exit(0);
}

interface Trap {
  id: string;
  seedName: string;
  line: string[];
  engineColor: 'w' | 'b';
  bait: string;
  punish: string;
  fen: string;
  offered: number;
  gapWp: number;
  trapWp: number;
  isTrap: boolean;
  costCp: number;
  [key: string]: unknown;
}

const payload = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as {
  traps: Trap[];
  [key: string]: unknown;
};

console.log(`إعادة التحقق من ${payload.traps.length} فخًّا على عمق ${DEPTH}/${VERIFY_DEPTH}\n`);

const engine = await createNodeEngine({ multipv: 6, hashMb: 192 });
const kept: Trap[] = [];
const dropped: { trap: Trap; why: string }[] = [];

for (const trap of payload.traps) {
  // ١) هل الخط ما زال قانونيًا؟
  const board = new Chess();
  let legal = true;
  for (const san of [...trap.line, trap.bait]) {
    try {
      if (!board.move(san)) legal = false;
    } catch {
      legal = false;
    }
    if (!legal) break;
  }
  if (!legal || board.fen() !== trap.fen) {
    dropped.push({ trap, why: 'الخط لم يعد يؤدي إلى الموقف المسجّل' });
    continue;
  }

  // ٢) هل ما زال الكاشف الحالي يعترف بالتضحية؟
  const scan = await scanForBrilliancy(engine, trap.fen, {
    depth: DEPTH,
    verifyDepth: VERIFY_DEPTH,
  });
  const f = scan.finding;

  if (!f?.isBrilliant) {
    dropped.push({ trap, why: f ? `لم تعد ترقى: ${f.reasons.at(-1) ?? ''}` : 'لا تضحية' });
    console.log(`✘ ${trap.id} [${trap.seedName}] ${trap.punish}: ${dropped.at(-1)!.why}`);
    continue;
  }
  if (f.san !== trap.punish) {
    dropped.push({ trap, why: `تغيّرت النقلة: ${f.san} بدل ${trap.punish}` });
    console.log(`✘ ${trap.id} [${trap.seedName}]: ${dropped.at(-1)!.why}`);
    continue;
  }

  // ٣) حدّث الأرقام بقياس العمق الأكبر
  kept.push({
    ...trap,
    offered: f.offered,
    gapWp: Math.round(f.gapWp * 10) / 10,
    trapWp: Math.round(f.trapWp * 10) / 10,
    isTrap: f.isTrap,
    motifs: f.motifs,
    pvSan: f.pvSan,
    acceptLine: f.acceptLine,
    declineLine: f.declineLine,
    mateIn: f.mateIn,
    altSan: f.altSan,
    scoreCp: f.score.type === 'cp' ? f.score.value : null,
    verifiedAt: new Date().toISOString(),
    verifiedDepth: VERIFY_DEPTH,
  });
  console.log(
    `✔ ${trap.id} [${trap.seedName}] ${trap.bait}? ثم ${f.san}!! — ${formatScore(f.score)} · ` +
      `مبذول ${(f.offered / 100).toFixed(1)} · فارق ${f.gapWp.toFixed(0)}${f.isTrap ? ` · فخّ ${f.trapWp.toFixed(0)}` : ''}`,
  );
}

console.log(`\n=== ${kept.length} صالح · ${dropped.length} محذوف ===`);
for (const d of dropped) console.log(`  حُذف ${d.trap.id}: ${d.why}`);

if (WRITE) {
  fs.writeFileSync(
    dataPath,
    JSON.stringify(
      {
        ...payload,
        verifiedAt: new Date().toISOString(),
        verifyDepth: VERIFY_DEPTH,
        stats: { ...(payload.stats as object), kept: kept.length, dropped: dropped.length },
        traps: kept,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`\nكُتب الملف المنقّى: ${dataPath}`);
} else {
  console.log('\n(لم يُكتب شيء — أضف --write للحفظ)');
}

engine.dispose();
process.exit(0);
