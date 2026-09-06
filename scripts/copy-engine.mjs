// ينسخ ملفات Stockfish WASM من node_modules إلى public/engine
// حتى يعمل المحرك محليًا بدون إنترنت (ترويسة COEP تمنع تحميله من CDN).
// ننسخ نسخة lite فقط (~7MB) لا النسخة الكاملة (108MB) — قوتها تتجاوز 3400 وهذا أكثر من كافٍ.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules', 'stockfish', 'bin');
const dest = path.join(root, 'public', 'engine');

const WANTED = [
  'stockfish-18-lite.js',          // متعدد الخيوط — يحتاج crossOriginIsolated
  'stockfish-18-lite.wasm',
  'stockfish-18-lite-single.js',   // أحادي الخيط — يعمل في كل الحالات
  'stockfish-18-lite-single.wasm',
];

if (!fs.existsSync(src)) {
  console.warn('[copy-engine] stockfish غير مثبت بعد — تخطي النسخ.');
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
let bytes = 0;
for (const file of WANTED) {
  const from = path.join(src, file);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-engine] مفقود: ${file}`);
    continue;
  }
  const to = path.join(dest, file);
  fs.copyFileSync(from, to);
  bytes += fs.statSync(to).size;
}
console.log(`[copy-engine] نُسخت ملفات المحرك (${(bytes / 1048576).toFixed(1)}MB) إلى public/engine`);
