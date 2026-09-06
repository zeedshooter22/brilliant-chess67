import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, movePairOf } from './Board';
import {
  AcceptDeclinePanel,
  EvalGraph,
  GradeChip,
  MoveList,
  San,
} from './components';
import { getAnalyst } from '../engine/pool';
import {
  deepenPly,
  exportAnnotatedPgn,
  reviewGame,
  type GameReview,
  type ReviewProgress,
} from '../analysis/reviewer';
import {
  addMove,
  analyseNode,
  autoExplore,
  cloneTree,
  createRoot,
  findNode,
  pathTo,
  type AlternativeSuggestion,
  type VariationNode,
} from '../analysis/whatIf';
import { explainBrilliancy, explainJudgement, summariseGame } from '../analysis/narrate.ar';
import { formatScore } from '../engine/types';
import type { GameState } from '../game/useBrilliantGame';
import { GRADE_STYLE } from '../engine/classify';

export function ReviewScreen({
  state,
  onBack,
  onNewGame,
}: {
  state: GameState;
  onBack: () => void;
  onNewGame: () => void;
}) {
  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState<ReviewProgress>({ done: 0, total: 1, stage: 'يبدأ التحليل…' });
  const [activePly, setActivePly] = useState<number>(state.history.length - 1);
  const [tree, setTree] = useState<VariationNode | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeSuggestion[] | null>(null);
  const [exploring, setExploring] = useState(false);
  const [deepening, setDeepening] = useState(false);
  const cancelled = useRef(false);

  // ===== تحليل المباراة كاملة =====
  useEffect(() => {
    cancelled.current = false;
    (async () => {
      try {
        const analyst = await getAnalyst();
        const result = await reviewGame(analyst, state.history, (p) => {
          if (!cancelled.current) setProgress(p);
        });
        if (!cancelled.current) setReview(result);
      } catch (error) {
        console.error('تعذّر تحليل المباراة', error);
        if (!cancelled.current) {
          setProgress({ done: 0, total: 1, stage: 'تعذّر إكمال التحليل' });
        }
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [state.history]);

  const activeRecord = review?.plies[activePly] ?? state.history[activePly] ?? null;

  // الموقف المعروض: من الشجرة إن كنّا نستكشف، وإلا من المباراة
  const displayFen = useMemo(() => {
    if (tree && currentNodeId) {
      const node = findNode(tree, currentNodeId);
      if (node) return node.fenAfter;
    }
    return activeRecord?.fenAfter ?? state.fen;
  }, [tree, currentNodeId, activeRecord, state.fen]);

  const displayLastMove = useMemo(() => {
    if (tree && currentNodeId) {
      const node = findNode(tree, currentNodeId);
      if (node?.move) return movePairOf(node.move);
    }
    return movePairOf(activeRecord?.uci);
  }, [tree, currentNodeId, activeRecord]);

  /** يبدأ الاستكشاف من موقف *قبل* النقلة المختارة — هناك يكون البديل ممكنًا */
  const startWhatIf = useCallback(
    async (fenBefore: string) => {
      const root = createRoot(fenBefore);
      setTree(root);
      setCurrentNodeId(root.id);
      setAlternatives(null);
      setExploring(true);
      try {
        const analyst = await getAnalyst();
        const options = await autoExplore(analyst, fenBefore, 3, 18);
        setAlternatives(options);
      } finally {
        setExploring(false);
      }
    },
    [],
  );

  /** لعب نقلة داخل الشجرة */
  const playInTree = useCallback(
    async (uci: string) => {
      if (!tree || !currentNodeId) return;
      const parent = findNode(tree, currentNodeId);
      if (!parent) return;
      const node = addMove(parent, uci);
      if (!node) return;
      setTree(cloneTree(tree));
      setCurrentNodeId(node.id);

      const analyst = await getAnalyst();
      await analyseNode(analyst, node, 18);
      setTree((prev) => (prev ? cloneTree(prev) : prev));
    },
    [tree, currentNodeId],
  );

  /** تحليل النقلة الحالية على عمق أكبر عند الطلب */
  const deepen = useCallback(async () => {
    if (!review) return;
    const ply = review.plies[activePly];
    if (!ply) return;
    setDeepening(true);
    try {
      const analyst = await getAnalyst();
      const judgement = await deepenPly(analyst, ply);
      setReview((prev) =>
        prev
          ? {
              ...prev,
              plies: prev.plies.map((p, i) => (i === activePly ? { ...p, judgement } : p)),
            }
          : prev,
      );
    } finally {
      setDeepening(false);
    }
  }, [review, activePly]);

  const currentNode = tree && currentNodeId ? findNode(tree, currentNodeId) : null;
  const treePath = tree && currentNodeId ? pathTo(tree, currentNodeId) : [];

  if (!review) {
    return (
      <div className="loading-screen">
        <div style={{ fontSize: 18 }}>يحلّل المباراة…</div>
        <div className="progress">
          <div
            className="fill"
            style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
          />
        </div>
        <div className="small">{progress.stage}</div>
        <button className="ghost" onClick={onBack}>
          إلغاء
        </button>
      </div>
    );
  }

  const playerColor = state.settings.playerColor;
  const playerAccuracy = playerColor === 'w' ? review.accuracy.w : review.accuracy.b;
  const playerBrilliancies = review.brilliancies.filter((b) => b.color === playerColor).length;
  const engineBrilliancies = review.brilliancies.filter((b) => b.color !== playerColor).length;
  const playerMissed = review.missed.filter((m) => m.color === playerColor).length;
  const activeJudgement = review.plies[activePly]?.judgement ?? null;
  const activeExplanation = activeJudgement ? explainJudgement(activeJudgement) : null;

  return (
    <div className="review-layout">
      <div>
        <Board
          fen={displayFen}
          orientation={playerColor}
          lastMove={displayLastMove}
          interactive={Boolean(tree)}
          onMove={playInTree}
          badge={
            !tree && activeRecord && activeJudgement && displayLastMove
              ? { square: displayLastMove.to, grade: activeJudgement.grade }
              : null
          }
        />

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="ghost"
            onClick={() => setActivePly((p) => Math.max(0, p - 1))}
            disabled={Boolean(tree) || activePly <= 0}
          >
            ← السابقة
          </button>
          <button
            className="ghost"
            onClick={() => setActivePly((p) => Math.min(review.plies.length - 1, p + 1))}
            disabled={Boolean(tree) || activePly >= review.plies.length - 1}
          >
            التالية →
          </button>
          {!tree && activeRecord && (
            <button className="primary" onClick={() => startWhatIf(activeRecord.fenBefore)}>
              ماذا لو؟
            </button>
          )}
          {tree && (
            <button
              className="ghost"
              onClick={() => {
                setTree(null);
                setCurrentNodeId(null);
                setAlternatives(null);
              }}
            >
              عودة إلى المباراة
            </button>
          )}
          <span className="spacer" />
          <button className="ghost" onClick={onNewGame}>
            مباراة جديدة
          </button>
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h3>منحنى التقييم</h3>
          <EvalGraph curve={review.evalCurve} activePly={activePly} onSelect={setActivePly} />
          <div className="accuracy-row" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="label">دقتك</div>
              <div className="value">{playerAccuracy.toFixed(1)}%</div>
            </div>
            <div className="stat">
              <div className="label">تضحياتك الرائعة</div>
              <div className="value" style={{ color: 'var(--brilliant)' }}>
                {playerBrilliancies}
              </div>
            </div>
            <div className="stat">
              <div className="label">تضحيات المحرك عليك</div>
              <div className="value" style={{ color: 'var(--blunder)' }}>
                {engineBrilliancies}
              </div>
            </div>
            <div className="stat">
              <div className="label">فرص فاتتك</div>
              <div className="value" style={{ color: 'var(--inaccuracy)' }}>
                {playerMissed}
              </div>
            </div>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            {summariseGame(playerBrilliancies, engineBrilliancies, playerMissed, playerAccuracy)}
          </div>
        </div>
      </div>

      <div>
        {/* ===== أين بدأ الخلل ===== */}
        {review.culprits.length > 0 && (
          <div className="panel highlight">
            <h3>أين بدأ الخلل؟</h3>
            {review.culprits.map((culprit) => (
              <div key={culprit.brilliantPly} className="hint-step">
                <div>{culprit.explanation}</div>
                <button
                  className="ghost small"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setTree(null);
                    setCurrentNodeId(null);
                    setActivePly(culprit.culpritPly);
                  }}
                >
                  اذهب إلى تلك النقلة
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ===== شجرة ماذا لو ===== */}
        {tree && (
          <div className="panel">
            <h3>ماذا لو — استكشاف حر</h3>
            <div className="small muted" style={{ marginBottom: 8 }}>
              العب أي نقلة على الرقعة لتفتح فرعًا جديدًا. المحرك يحلّله فورًا.
            </div>

            {treePath.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                {treePath.map((node) =>
                  node.san ? (
                    <span
                      key={node.id}
                      className={`whatif-move ${node.id === currentNodeId ? 'current' : ''}`}
                      onClick={() => setCurrentNodeId(node.id)}
                    >
                      <San>{node.san}</San>
                    </span>
                  ) : null,
                )}
              </div>
            )}

            {currentNode && currentNode.move && (
              <div className="hint-step">
                <div>
                  <San>{currentNode.san}</San>
                  {currentNode.scoreForMover && (
                    <span style={{ marginRight: 8 }}>{formatScore(currentNode.scoreForMover)}</span>
                  )}
                  {currentNode.verdict && (
                    <span className="chip" style={{ marginRight: 8 }}>
                      {currentNode.verdict}
                    </span>
                  )}
                </div>
                {currentNode.analysing ? (
                  <div className="small muted">يحلّل…</div>
                ) : (
                  <>
                    {currentNode.bestSan && currentNode.bestSan !== currentNode.san && (
                      <div className="small muted">
                        كان الأفضل <San>{currentNode.bestSan}</San> — خسرت{' '}
                        {currentNode.lossWp.toFixed(0)} نقطة احتمال.
                      </div>
                    )}
                    {currentNode.continuation.length > 0 && (
                      <div className="small" style={{ marginTop: 4 }}>
                        الاستمرار: <San>{currentNode.continuation.join(' ')}</San>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {exploring && <div className="small muted">يبحث عن البدائل…</div>}
            {alternatives && (
              <>
                <h3 style={{ marginTop: 12 }}>أفضل البدائل هنا</h3>
                {alternatives.map((alt) => (
                  <div className="setting-row" key={alt.uci}>
                    <span
                      className="whatif-move"
                      onClick={() => playInTree(alt.uci)}
                      title="العبها في الشجرة"
                    >
                      <San>{alt.san}</San>
                    </span>
                    <span className="small muted">
                      {formatScore(alt.score)} · {alt.verdict}
                    </span>
                  </div>
                ))}
                {alternatives[0] && (
                  <div className="small muted" style={{ marginTop: 6 }}>
                    خط الأفضل: <San>{alternatives[0].continuation.join(' ')}</San>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== شرح النقلة الحالية ===== */}
        {!tree && activeExplanation && (
          <div className={`panel ${activeJudgement?.grade === 'brilliant' ? 'highlight' : ''}`}>
            <h3>
              النقلة {Math.floor(activePly / 2) + 1}
              {activePly % 2 === 0 ? '' : '…'}
            </h3>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              <San>{activeExplanation.headline}</San>
            </div>
            {activeJudgement && <GradeChip grade={activeJudgement.grade} />}
            {activeExplanation.motifs.map((motif) => (
              <span className="chip motif" key={motif}>
                {motif}
              </span>
            ))}
            <ul style={{ paddingRight: 18, marginTop: 10 }}>
              {activeExplanation.points.map((point, i) => (
                <li key={i} style={{ marginBottom: 5 }}>
                  {point}
                </li>
              ))}
            </ul>
            {review.plies[activePly]?.deception?.looksLikeBlunder && (
              <div className="chip alien">👽 تبدو بلندر وهي سليمة</div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="ghost" onClick={deepen} disabled={deepening}>
                {deepening ? 'يحلّل بعمق…' : 'تحليل عميق لهذه النقلة'}
              </button>
              <span className="small muted">
                التقرير يمسح على عمق 16؛ هذا الزر يعيد الفحص على 22/26.
              </span>
            </div>
          </div>
        )}

        {/* ===== قبول ورفض التضحية ===== */}
        {!tree && activeJudgement?.brilliancy && (
          <AcceptDeclinePanel finding={activeJudgement.brilliancy} />
        )}

        {/* ===== كل التضحيات في المباراة ===== */}
        {(review.brilliancies.length > 0 || review.missed.length > 0) && (
          <div className="panel">
            <h3>لحظات المباراة</h3>
            {review.brilliancies.map((item) => {
              const explanation = explainBrilliancy(item.finding);
              return (
                <div
                  className="hint-step"
                  key={`b-${item.ply}`}
                  style={{ borderRightColor: GRADE_STYLE.brilliant.color, cursor: 'pointer' }}
                  onClick={() => {
                    setTree(null);
                    setActivePly(item.ply);
                  }}
                >
                  <div>
                    {item.byEngine ? '⚡ المحرك' : '⭐ أنت'} · نقلة{' '}
                    {Math.floor(item.ply / 2) + 1} · <San>{item.finding.san}</San>
                  </div>
                  <div className="small muted">{explanation.points[0]}</div>
                </div>
              );
            })}
            {review.missed.map((item) => (
              <div
                className="hint-step"
                key={`m-${item.ply}`}
                style={{ borderRightColor: GRADE_STYLE.inaccuracy.color, cursor: 'pointer' }}
                onClick={() => {
                  setTree(null);
                  setActivePly(item.ply);
                }}
              >
                <div>
                  فاتت {item.color === playerColor ? 'عليك' : 'على المحرك'} · نقلة{' '}
                  {Math.floor(item.ply / 2) + 1} · <San>{item.finding.san}</San>
                </div>
                <div className="small muted">
                  {item.finding.sacrificedNameAr
                    ? `تضحية بـ${item.finding.sacrificedNameAr}`
                    : 'تضحية'}
                  {item.finding.mateIn ? ` مع مات في ${item.finding.mateIn}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <h3>النقلات</h3>
          <MoveList
            plies={review.plies}
            activePly={activePly}
            onSelect={(ply) => {
              setTree(null);
              setCurrentNodeId(null);
              setActivePly(ply);
            }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="ghost"
              onClick={() => {
                const pgn = exportAnnotatedPgn(review, {
                  white: playerColor === 'w' ? 'أنت' : 'المحرك الصائد',
                  black: playerColor === 'b' ? 'أنت' : 'المحرك الصائد',
                });
                void navigator.clipboard?.writeText(pgn);
              }}
            >
              نسخ PGN معلَّق
            </button>
            <button className="ghost" onClick={onBack}>
              عودة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
