import type { AnalysisResult, PvLine, SearchLimits } from './types';
import { buildGoCommand, parseBestMove, parseInfoLine } from './uci';

/** طبقة نقل محايدة: نفس المحرك يعمل في المتصفح (Worker) وفي Node (للاختبارات والمولّد). */
export interface UciTransport {
  send(command: string): void;
  onLine(listener: (line: string) => void): void;
  dispose(): void;
}

export interface EngineOptions {
  multipv?: number;
  threads?: number;
  hashMb?: number;
  /** 0-20 — لإضعاف المحرك في أوضاع التدريب فقط */
  skillLevel?: number;
  elo?: number | null;
}

/**
 * غلاف UCI مع طابور طلبات: المحرك يبحث في طلب واحد فقط في كل لحظة،
 * وأي طلب جديد ينتظر دوره بدل أن يفسد نتيجة السابق.
 */
export class UciEngine {
  private transport: UciTransport;
  private listeners = new Set<(line: string) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private searching = false;
  private currentMultipv = 1;
  private disposed = false;

  private constructor(transport: UciTransport) {
    this.transport = transport;
    this.transport.onLine((line) => {
      for (const l of this.listeners) l(line);
    });
  }

  static async create(transport: UciTransport, options: EngineOptions = {}): Promise<UciEngine> {
    const engine = new UciEngine(transport);
    await engine.handshake();
    await engine.configure(options);
    return engine;
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs = 60000): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const collected: string[] = [];
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`انتهت مهلة انتظار المحرك (${timeoutMs}ms)`));
      }, timeoutMs);
      const listener = (line: string) => {
        collected.push(line);
        if (predicate(line)) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(collected);
        }
      };
      this.listeners.add(listener);
    });
  }

  private async handshake(): Promise<void> {
    const done = this.waitFor((l) => l.trim() === 'uciok', 180000);
    this.transport.send('uci');
    await done;
    await this.isReady();
  }

  async isReady(): Promise<void> {
    const done = this.waitFor((l) => l.trim() === 'readyok');
    this.transport.send('isready');
    await done;
  }

  async configure(options: EngineOptions): Promise<void> {
    if (options.multipv !== undefined) {
      this.currentMultipv = options.multipv;
      this.transport.send(`setoption name MultiPV value ${options.multipv}`);
    }
    if (options.threads !== undefined) {
      this.transport.send(`setoption name Threads value ${options.threads}`);
    }
    if (options.hashMb !== undefined) {
      this.transport.send(`setoption name Hash value ${options.hashMb}`);
    }
    if (options.skillLevel !== undefined) {
      this.transport.send(`setoption name Skill Level value ${options.skillLevel}`);
    }
    if (options.elo !== undefined) {
      if (options.elo === null) {
        this.transport.send('setoption name UCI_LimitStrength value false');
      } else {
        this.transport.send('setoption name UCI_LimitStrength value true');
        this.transport.send(`setoption name UCI_Elo value ${options.elo}`);
      }
    }
    await this.isReady();
  }

  async newGame(): Promise<void> {
    this.transport.send('ucinewgame');
    await this.isReady();
  }

  /** يضع كل الطلبات في طابور متسلسل حتى لا تتداخل عمليات البحث. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async analyse(fen: string, limits: SearchLimits = {}): Promise<AnalysisResult> {
    return this.enqueue(async () => {
      if (this.disposed) throw new Error('المحرك مُغلق');
      const multipv = limits.multipv ?? 1;
      if (multipv !== this.currentMultipv) {
        this.currentMultipv = multipv;
        this.transport.send(`setoption name MultiPV value ${multipv}`);
        await this.isReady();
      }

      const started = Date.now();
      const best = new Map<number, PvLine>();
      let bestmove: string | null = null;

      const collector = (line: string) => {
        const info = parseInfoLine(line);
        if (info) {
          const existing = best.get(info.multipv);
          // نحتفظ بأعمق نتيجة لكل خط
          if (!existing || info.depth >= existing.depth) best.set(info.multipv, info);
          return;
        }
        const bm = parseBestMove(line);
        if (bm !== null) bestmove = bm;
      };

      this.listeners.add(collector);
      const finished = this.waitFor((l) => l.startsWith('bestmove'), 300000);
      this.transport.send(`position fen ${fen}`);
      this.transport.send(
        buildGoCommand({
          depth: limits.depth,
          movetime: limits.movetime,
          nodes: limits.nodes,
          mate: limits.mate,
          searchmoves: limits.searchmoves,
        }),
      );
      this.searching = true;
      try {
        const lines = await finished;
        for (const l of lines) {
          const bm = parseBestMove(l);
          if (bm !== null) bestmove = bm;
        }
      } finally {
        this.searching = false;
        this.listeners.delete(collector);
      }

      const ordered = [...best.values()].sort((a, b) => a.multipv - b.multipv);
      return {
        fen,
        depth: ordered.length ? Math.max(...ordered.map((l) => l.depth)) : 0,
        lines: ordered,
        bestmove,
        timeMs: Date.now() - started,
      };
    });
  }

  /** إيقاف البحث الجاري (مثلًا عند تراجع اللاعب). */
  stop(): void {
    if (this.searching) this.transport.send('stop');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.transport.send('quit');
    } catch {
      /* تجاهل */
    }
    this.transport.dispose();
    this.listeners.clear();
  }
}

/** طبقة نقل للمتصفح: ملف stockfish يعمل كـ Web Worker مباشرة. */
export class WorkerTransport implements UciTransport {
  private worker: Worker;
  private listener: ((line: string) => void) | null = null;

  constructor(scriptUrl: string) {
    this.worker = new Worker(scriptUrl);
    this.worker.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data ?? '');
      if (data && this.listener) this.listener(data);
    };
  }

  send(command: string): void {
    this.worker.postMessage(command);
  }

  onLine(listener: (line: string) => void): void {
    this.listener = listener;
  }

  dispose(): void {
    this.worker.terminate();
  }
}

/**
 * ينشئ محركًا في المتصفح.
 * نستخدم النسخة متعددة الخيوط عند توفر crossOriginIsolated (ترويسات COOP/COEP)،
 * وإلا نسقط تلقائيًا للنسخة أحادية الخيط بدل أن يتعطل التطبيق.
 */
export async function createBrowserEngine(options: EngineOptions = {}): Promise<UciEngine> {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  const script = isolated
    ? '/engine/stockfish-18-lite.js'
    : '/engine/stockfish-18-lite-single.js';
  const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const threads = isolated ? Math.max(1, Math.min(options.threads ?? 4, hardware - 1)) : 1;
  return UciEngine.create(new WorkerTransport(script), {
    hashMb: isolated ? 128 : 32,
    ...options,
    threads,
  });
}

export function engineFlavour(): { multiThreaded: boolean; label: string } {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  return {
    multiThreaded: isolated,
    label: isolated ? 'Stockfish 18 · متعدد الخيوط' : 'Stockfish 18 · خيط واحد',
  };
}
