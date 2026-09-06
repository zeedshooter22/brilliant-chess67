/**
 * تشغيل نفس المحرك داخل Node — للاختبارات (vitest) ولمولّد بنك المواقف ولقياس نسبة الصيد.
 * هذا يضمن أن منطق كشف البريليانت المُختبَر هو نفسه الذي يعمل في المتصفح حرفيًا.
 *
 * لا نستخدم غلاف حزمة stockfish الجاهز لأنه يعتمد على require المُخزَّن مؤقتًا،
 * فتتشارك كل النسخ نفس الحالة الداخلية وتنهار النسخة الثانية. القياس يحتاج
 * محركين في وقت واحد (صياد + لاعب)، لذلك نحمّل الوحدة بعزل صريح.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { UciEngine, type EngineOptions, type UciTransport } from './engine';

const require = createRequire(import.meta.url);

type StockfishModule = {
  ccall(name: string, ret: null, argTypes: string[], args: unknown[], opts?: unknown): void;
  listener?: (line: string) => void;
  locateFile?: (file: string) => string;
  _isReady?: () => boolean;
  terminate?: () => void;
};

class NodeTransport implements UciTransport {
  private module: StockfishModule;
  private listener: ((line: string) => void) | null = null;

  constructor(module: StockfishModule) {
    this.module = module;
    this.module.listener = (line: string) => {
      if (this.listener) this.listener(String(line));
    };
  }

  send(command: string): void {
    // البحث (go) يجب أن يكون غير متزامن وإلا جمّد الخيط الوحيد
    this.module.ccall('command', null, ['string'], [command], {
      async: /^go\b/.test(command),
    });
  }

  onLine(listener: (line: string) => void): void {
    this.listener = listener;
  }

  dispose(): void {
    try {
      this.module.terminate?.();
    } catch {
      /* تجاهل */
    }
  }
}

/**
 * يحمّل نسخة معزولة من محرك Stockfish.
 * حذف الوحدة من ذاكرة require قبل كل تحميل هو ما يسمح بتشغيل محركين معًا.
 */
async function loadIsolatedModule(flavour: 'lite' | 'lite-single'): Promise<StockfishModule> {
  const enginePath = require.resolve(`stockfish/bin/stockfish-18-${flavour}.js`);
  const wasmPath = enginePath.replace(/\.js$/, '.wasm');

  delete require.cache[enginePath];
  const initFactory = require(enginePath) as () => (m: StockfishModule) => Promise<void>;
  delete require.cache[enginePath];

  if (typeof initFactory !== 'function') {
    throw new Error('تعذّر تحميل محرك Stockfish — الوحدة لا تُصدّر دالة تهيئة');
  }

  const module_: StockfishModule = {
    ccall: () => undefined,
    locateFile: (file: string) =>
      file.endsWith('.wasm') ? wasmPath : path.join(path.dirname(enginePath), file),
  };

  await initFactory()(module_);

  // بعض النسخ تحتاج انتظارًا إضافيًا بعد وعد التهيئة
  while (module_._isReady && !module_._isReady()) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return module_;
}

/** flavour: 'lite-single' أسرع إقلاعًا، 'lite' متعدد الخيوط وأقوى للمولّد. */
export async function createNodeEngine(
  options: EngineOptions = {},
  flavour: 'lite' | 'lite-single' = 'lite-single',
): Promise<UciEngine> {
  const module_ = await loadIsolatedModule(flavour);
  return UciEngine.create(new NodeTransport(module_), {
    hashMb: 128,
    threads: 1,
    ...options,
  });
}
