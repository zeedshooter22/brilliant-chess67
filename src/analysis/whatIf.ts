/**
 * شجرة "ماذا لو" — استكشاف البدائل.
 *
 * الفكرة التي طلبها المستخدم صراحةً: أن يعود إلى أي نقلة، يلعب بديلًا، ويرى
 * ماذا كان سيحدث. نمثّلها بشجرة تنويعات حقيقية (كـ PGN بخطوط فرعية) لا بخط واحد،
 * لأن التعلّم يقع في المقارنة بين فرعين لا في رؤية فرع واحد.
 */
import type { UciEngine } from '../engine/engine';
import type { Score } from '../engine/types';
import { scoreToCp, scoreToWinProb } from '../engine/types';
import { applyUci, pvToSan, uciToSan } from '../game/chess';
import { verdictFor } from './narrate.ar';

export interface VariationNode {
  id: string;
  /** الموقف *قبل* نقلة هذه العقدة (للجذر: الموقف نفسه) */
  fenBefore: string;
  fenAfter: string;
  move: string | null;
  san: string | null;
  children: VariationNode[];
  /** تقييم الموقف بعد النقلة، من منظور من سيلعب الآن */
  score: Score | null;
  /** التقييم من منظور من لعب النقلة — أسهل للقراءة */
  scoreForMover: Score | null;
  bestSan: string | null;
  continuation: string[];
  verdict: string | null;
  /** كم خسرت هذه النقلة مقارنةً بأفضل نقلة في موقفها */
  lossWp: number;
  analysing: boolean;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `v${counter}`;
}

export function createRoot(fen: string): VariationNode {
  return {
    id: nextId(),
    fenBefore: fen,
    fenAfter: fen,
    move: null,
    san: null,
    children: [],
    score: null,
    scoreForMover: null,
    bestSan: null,
    continuation: [],
    verdict: null,
    lossWp: 0,
    analysing: false,
  };
}

export function findNode(root: VariationNode, id: string): VariationNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** مسار النقلات من الجذر إلى عقدة — لعرض الخط كاملًا. */
export function pathTo(root: VariationNode, id: string): VariationNode[] {
  const path: VariationNode[] = [];
  function walk(node: VariationNode): boolean {
    path.push(node);
    if (node.id === id) return true;
    for (const child of node.children) {
      if (walk(child)) return true;
    }
    path.pop();
    return false;
  }
  walk(root);
  return path;
}

/** يضيف نقلة تحت عقدة، أو يعيد الفرع الموجود إن كانت النقلة ملعوبة سلفًا. */
export function addMove(parent: VariationNode, uci: string): VariationNode | null {
  const existing = parent.children.find((child) => child.move === uci);
  if (existing) return existing;

  const applied = applyUci(parent.fenAfter, uci);
  if (!applied) return null;

  const node: VariationNode = {
    id: nextId(),
    fenBefore: parent.fenAfter,
    fenAfter: applied.fen,
    move: uci,
    san: applied.move.san,
    children: [],
    score: null,
    scoreForMover: null,
    bestSan: null,
    continuation: [],
    verdict: null,
    lossWp: 0,
    analysing: true,
  };
  parent.children.push(node);
  return node;
}

/** نسخة عميقة — React يحتاج مرجعًا جديدًا ليعيد الرسم. */
export function cloneTree(node: VariationNode): VariationNode {
  return { ...node, children: node.children.map(cloneTree) };
}

/**
 * يحلّل عقدة: تقييمها، أفضل استمرار، وحكم عربي مقارنةً بأفضل نقلة كانت متاحة.
 */
export async function analyseNode(
  engine: UciEngine,
  node: VariationNode,
  depth = 18,
): Promise<void> {
  if (!node.move) {
    const analysis = await engine.analyse(node.fenAfter, { multipv: 1, depth });
    const line = analysis.lines[0];
    if (line) {
      node.score = line.score;
      node.scoreForMover = line.score;
      node.bestSan = uciToSan(node.fenAfter, line.move);
      node.continuation = pvToSan(node.fenAfter, line.pv, 8);
    }
    node.analysing = false;
    return;
  }

  // أفضل ما كان متاحًا في الموقف الأصلي، ثم قيمة النقلة المختارة
  const [beforeAnalysis, afterAnalysis] = [
    await engine.analyse(node.fenBefore, { multipv: 1, depth }),
    await engine.analyse(node.fenAfter, { multipv: 1, depth }),
  ];

  const best = beforeAnalysis.lines[0];
  const after = afterAnalysis.lines[0];

  if (after) {
    node.score = after.score;
    // تقييم الموقف بعد النقلة من منظور من لعبها = عكس منظور صاحب الدور الآن
    node.scoreForMover =
      after.score.type === 'cp'
        ? { type: 'cp', value: -after.score.value }
        : { type: 'mate', value: -after.score.value };
    node.continuation = pvToSan(node.fenAfter, after.pv, 8);
  }

  if (best && node.scoreForMover) {
    node.bestSan = uciToSan(node.fenBefore, best.move);
    node.lossWp = Math.max(0, scoreToWinProb(best.score) - scoreToWinProb(node.scoreForMover));
    node.verdict = verdictFor(node.lossWp, best.move === node.move);
  }

  node.analysing = false;
}

export interface AlternativeSuggestion {
  uci: string;
  san: string;
  score: Score;
  continuation: string[];
  verdict: string;
  lossWp: number;
}

/**
 * استكشاف تلقائي: أفضل البدائل في موقف واحد مع استمرار كل بديل وحكم مختصر.
 * هذا ما يظهر بضغطة "ماذا لو؟" على أي نقلة في المباراة.
 */
export async function autoExplore(
  engine: UciEngine,
  fen: string,
  count = 3,
  depth = 18,
): Promise<AlternativeSuggestion[]> {
  const analysis = await engine.analyse(fen, { multipv: count, depth });
  if (analysis.lines.length === 0) return [];
  const bestWp = scoreToWinProb(analysis.lines[0].score);

  return analysis.lines.map((line, index) => {
    const lossWp = Math.max(0, bestWp - scoreToWinProb(line.score));
    return {
      uci: line.move,
      san: uciToSan(fen, line.move),
      score: line.score,
      continuation: pvToSan(fen, line.pv, 8),
      verdict: verdictFor(lossWp, index === 0),
      lossWp,
    };
  });
}

/**
 * مقارنة "ماذا لو قبلت التضحية / ماذا لو رفضتها" — لوحة مستقلة في التحليل.
 * تُبنى من نفس الأرقام التي حكم بها الكاشف، بلا بحث إضافي.
 */
export interface AcceptDeclineComparison {
  acceptSan: string | null;
  acceptLine: string[];
  acceptScore: Score | null;
  declineSan: string | null;
  declineLine: string[];
  declineScore: Score | null;
  costOfGreedWp: number;
}

export function formatVariationLine(nodes: VariationNode[]): string {
  return nodes
    .filter((node) => node.san)
    .map((node) => node.san)
    .join(' ');
}

export { scoreToCp };
