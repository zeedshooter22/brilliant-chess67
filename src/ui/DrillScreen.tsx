import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board, movePairOf } from './Board';
import { San } from './components';
import { DRILLS, pickDrill, type Drill } from '../data/drills';
import {
  dueIds,
  loadProgress,
  recordAttempt,
  solvedIds,
  weakestMotifs,
  type Progress,
} from '../store/session';
import { applyUci, Chess, numberedSanFromPly } from '../game/chess';
import { getAnalyst } from '../engine/pool';
import { findShortestMate, mateStars } from '../engine/mate';

type Phase = 'searching' | 'solved' | 'failed' | 'converting' | 'finished';

/**
 * معمل البريليانت: تمارين مضمونة — كل موقف هنا فيه تضحية رائعة مُتحقَّق منها.
 * بعد إيجادها تُكمل الموقف ضد المحرك حتى المات، فالتضحية نصف الدرس والتحويل نصفه الآخر.
 */
export function DrillScreen({ onBack }: { onBack: () => void }) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [drill, setDrill] = useState<Drill | null>(null);
  const [phase, setPhase] = useState<Phase>('searching');
  const [attempts, setAttempts] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [fen, setFen] = useState('');
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mateIn, setMateIn] = useState<number | null>(null);
  /** أقصر مات عُرف عند بداية التحويل — مرجع تقييم الطريق */
  const [optimalMate, setOptimalMate] = useState<number | null>(null);
  /** كم نقلة لعبتَها في مرحلة التحويل */
  const [conversionMoves, setConversionMoves] = useState(0);
  const [engineThinking, setEngineThinking] = useState(false);

  const nextDrill = useCallback(() => {
    const next = pickDrill(solvedIds(progress), dueIds(progress));
    setDrill(next);
    setPhase('searching');
    setAttempts(0);
    setHintLevel(0);
    setMessage(null);
    setMateIn(null);
    setOptimalMate(null);
    setConversionMoves(0);
    setLastMove(null);
    setFen(next?.fen ?? '');
  }, [progress]);

  useEffect(() => {
    if (!drill) nextDrill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const solverColor = drill?.sideToMove ?? 'w';

  const context = useMemo(() => {
    if (!drill) return '';
    const board = new Chess();
    const sans: string[] = [];
    for (const san of [...drill.line, drill.bait]) {
      try {
        const move = board.move(san);
        if (move) sans.push(move.san);
      } catch {
        break;
      }
    }
    const tail = sans.slice(-8);
    return numberedSanFromPly(tail, sans.length - tail.length);
  }, [drill]);

  /** محاولة اللاعب في مرحلة البحث عن التضحية */
  const attemptSolution = useCallback(
    async (uci: string) => {
      if (!drill) return;
      if (uci === drill.solutionUci) {
        const firstTry = attempts === 0 && hintLevel === 0;
        setProgress((prev) => recordAttempt(prev, drill.id, drill.motifs, true, firstTry));
        const applied = applyUci(drill.fen, uci);
        if (applied) {
          setFen(applied.fen);
          setLastMove(movePairOf(uci));
        }
        setPhase('solved');
        setMessage(
          firstTry
            ? 'وجدتها من أول محاولة! ⭐'
            : hintLevel > 0
              ? 'صحيحة — لكن بتلميح. ستعود إليك للمراجعة.'
              : 'صحيحة بعد محاولات. ستعود إليك للمراجعة.',
        );
        return;
      }

      setAttempts((a) => a + 1);
      const applied = applyUci(drill.fen, uci);
      setMessage(
        applied
          ? `${applied.move.san} ليست هي. التضحية تبذل مادة أكثر مما تبدو.`
          : 'نقلة غير قانونية.',
      );
    },
    [drill, attempts, hintLevel],
  );

  /** بعد الحل: تلعب ضد المحرك حتى المات */
  const playConversion = useCallback(
    async (uci: string) => {
      if (!drill) return;
      const applied = applyUci(fen, uci);
      if (!applied) return;
      setFen(applied.fen);
      setLastMove(movePairOf(uci));
      const played = conversionMoves + 1;
      setConversionMoves(played);

      const board = new Chess(applied.fen);
      if (board.isCheckmate()) {
        setPhase('finished');
        // "بأقل عدد نقلات" وعدٌ بلا قياس ما لم نقارن ما لعبتَه بأقصر طريق كان متاحًا
        if (optimalMate !== null) {
          const stars = mateStars(optimalMate, played);
          setMessage(
            `كش مات في ${played} نقلة — أقصر طريق كان ${optimalMate}. ` +
              `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`,
          );
        } else {
          setMessage('كش مات! أتممت التحويل.');
        }
        return;
      }
      if (board.isGameOver()) {
        setPhase('finished');
        setMessage('انتهى الموقف بالتعادل — المات ضاع في الطريق.');
        return;
      }

      setEngineThinking(true);
      try {
        const analyst = await getAnalyst();
        // المدافع بكامل قوته = أطول مقاومة تلقائيًا
        const reply = await analyst.analyse(applied.fen, { multipv: 1, depth: 18 });
        const move = reply.bestmove ?? reply.lines[0]?.move;
        if (!move) {
          setPhase('finished');
          return;
        }
        const afterEngine = applyUci(applied.fen, move);
        if (!afterEngine) return;
        setFen(afterEngine.fen);
        setLastMove(movePairOf(move));

        const afterBoard = new Chess(afterEngine.fen);
        if (afterBoard.isGameOver()) {
          setPhase('finished');
          setMessage(afterBoard.isCheckmate() ? 'المحرك مات ملكك!' : 'انتهى الموقف.');
          return;
        }
        const mate = await findShortestMate(analyst, afterEngine.fen, 6, 18);
        setMateIn(mate?.mateIn ?? null);
      } finally {
        setEngineThinking(false);
      }
    },
    [drill, fen, conversionMoves, optimalMate],
  );

  const startConversion = useCallback(async () => {
    if (!drill) return;
    setPhase('converting');
    setMessage('الآن حوّلها إلى مات بأقصر طريق.');
    setEngineThinking(true);
    try {
      const analyst = await getAnalyst();
      // ردّ المحرك على التضحية
      const reply = await analyst.analyse(fen, { multipv: 1, depth: 18 });
      const move = reply.bestmove ?? reply.lines[0]?.move;
      if (move) {
        const after = applyUci(fen, move);
        if (after) {
          setFen(after.fen);
          setLastMove(movePairOf(move));
          const mate = await findShortestMate(analyst, after.fen, 6, 18);
          setMateIn(mate?.mateIn ?? null);
          setOptimalMate(mate?.mateIn ?? null);
        }
      }
    } finally {
      setEngineThinking(false);
    }
  }, [drill, fen]);

  const giveUp = useCallback(() => {
    if (!drill) return;
    setProgress((prev) => recordAttempt(prev, drill.id, drill.motifs, false, false));
    const applied = applyUci(drill.fen, drill.solutionUci);
    if (applied) {
      setFen(applied.fen);
      setLastMove(movePairOf(drill.solutionUci));
    }
    setPhase('failed');
    setMessage(`الحل كان ${drill.solutionSan}.`);
  }, [drill]);

  if (DRILLS.length === 0) {
    return (
      <div className="panel">
        <h3>لا توجد تمارين بعد</h3>
        <p>
          بنك التمارين يُبنى آليًا. شغّل التنقيب ثم أعد فتح الصفحة:
        </p>
        <pre className="ltr" style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 8 }}>
          npx vite-node scripts/mine-traps.mts -- --minutes 40
        </pre>
        <button className="ghost" onClick={onBack}>
          عودة
        </button>
      </div>
    );
  }

  if (!drill) return <div className="loading-screen">يختار تمرينًا…</div>;

  const weak = weakestMotifs(progress);
  const interactive = phase === 'searching' || phase === 'converting';

  return (
    <div className="play-layout">
      <div>
        <Board
          fen={fen || drill.fen}
          orientation={solverColor}
          lastMove={lastMove}
          interactive={interactive && !engineThinking}
          onMove={phase === 'searching' ? attemptSolution : playConversion}
          highlights={hintLevel >= 2 ? [drill.solutionUci.slice(0, 2)] : []}
        />

        <div className="row" style={{ marginTop: 12 }}>
          {phase === 'searching' && (
            <>
              <button
                className="ghost"
                onClick={() => setHintLevel((l) => Math.min(3, l + 1))}
                disabled={hintLevel >= 3}
              >
                تلميح
              </button>
              <button className="ghost" onClick={giveUp}>
                أرني الحل
              </button>
            </>
          )}
          {(phase === 'solved' || phase === 'failed') && (
            <>
              <button className="primary" onClick={startConversion}>
                حوّلها إلى مات
              </button>
              <button className="ghost" onClick={nextDrill}>
                تمرين آخر
              </button>
            </>
          )}
          {(phase === 'converting' || phase === 'finished') && (
            <button className="primary" onClick={nextDrill}>
              تمرين آخر
            </button>
          )}
          <span className="spacer" />
          <button className="ghost" onClick={onBack}>
            القائمة
          </button>
        </div>
      </div>

      <div>
        <div className="panel highlight">
          <h3>
            {phase === 'searching' ? '⚡ جد التضحية الرائعة' : 'التمرين'}
          </h3>
          <div className="small muted">
            {drill.openingName} · صعوبة {'●'.repeat(drill.difficulty)}
            {'○'.repeat(5 - drill.difficulty)}
            {drill.looksLikeBlunder && <span className="chip alien">👽 تبدو بلندر</span>}
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            الدور على {solverColor === 'w' ? 'الأبيض' : 'الأسود'}. في هذا الموقف تضحية سليمة
            مُتحقَّق منها بالمحرك.
          </div>
          {message && (
            <div
              className="hint-step"
              style={{
                marginTop: 10,
                borderRightColor:
                  phase === 'solved' || phase === 'finished'
                    ? 'var(--brilliant)'
                    : phase === 'failed'
                      ? 'var(--blunder)'
                      : 'var(--inaccuracy)',
              }}
            >
              {message}
            </div>
          )}
          {engineThinking && (
            <div className="thinking" style={{ marginTop: 8 }}>
              <span className="pulse" />
              <span className="pulse" />
              <span className="pulse" />
              <span style={{ marginRight: 6 }}>المحرك يدافع…</span>
            </div>
          )}
        </div>

        {mateIn !== null && phase === 'converting' && (
          <div className="mate-counter">
            <div>
              <div className="small muted">أقصر طريق الآن</div>
              <div className="row" style={{ gap: 6 }}>
                <span className="n">{mateIn}</span>
                <span>نقلة</span>
              </div>
              {optimalMate !== null && (
                <div className="small muted">
                  بدأتَ من مات في {optimalMate} · لعبتَ {conversionMoves}
                </div>
              )}
            </div>
          </div>
        )}

        {phase === 'searching' && hintLevel > 0 && (
          <div className="panel">
            <h3>التلميحات</h3>
            {hintLevel >= 1 && (
              <div className="hint-step">
                تضحية بـ{drill.sacrificedNameAr ?? 'قطعة'} ({(drill.offered / 100).toFixed(1)} بيدق).
              </div>
            )}
            {hintLevel >= 2 && (
              <div className="hint-step">
                القطعة التي تتحرك تقف على <San>{drill.solutionUci.slice(0, 2)}</San> — مُعلَّمة على الرقعة.
              </div>
            )}
            {hintLevel >= 3 && (
              <div className="hint-step">
                النقلة هي <San>{drill.solutionSan}</San>.
              </div>
            )}
          </div>
        )}

        {(phase === 'solved' || phase === 'failed' || phase === 'finished') && (
          <div className="panel">
            <h3>الشرح</h3>
            <div>
              {drill.motifs.map((motif) => (
                <span className="chip motif" key={motif}>
                  {motif}
                </span>
              ))}
            </div>
            <ul style={{ paddingRight: 18, marginTop: 10 }}>
              <li>
                <San>{drill.solutionSan}</San> تبذل{' '}
                {drill.sacrificedNameAr ?? 'مادة'} ({(drill.offered / 100).toFixed(1)} بيدق)
                {drill.altSan && (
                  <>
                    {' '}
                    بينما البديل الحريص <San>{drill.altSan}</San> أضعف بوضوح
                  </>
                )}
                .
              </li>
              {drill.pvSan.length > 0 && (
                <li>
                  الخط: <San>{drill.pvSan.join(' ')}</San>
                </li>
              )}
              {drill.acceptLine.length > 0 && (
                <li>
                  لو قُبلت: <San>{drill.acceptLine.join(' ')}</San>
                </li>
              )}
              {drill.mateIn && <li>تنتهي بكش مات في {drill.mateIn} نقلة.</li>}
            </ul>
          </div>
        )}

        <div className="panel">
          <h3>كيف وصلنا إلى هنا</h3>
          <div className="small">
            <San>{context}</San>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            النقلة <San>{drill.bait}</San> هي التي فتحت الباب.
          </div>
        </div>

        <div className="panel">
          <h3>تقدّمك</h3>
          <div className="accuracy-row">
            <div className="stat">
              <div className="label">حُلّت</div>
              <div className="value">{progress.totalSolved}</div>
            </div>
            <div className="stat">
              <div className="label">السلسلة</div>
              <div className="value" style={{ color: 'var(--brilliant)' }}>
                {progress.currentStreak}
              </div>
            </div>
            <div className="stat">
              <div className="label">الأفضل</div>
              <div className="value">{progress.bestStreak}</div>
            </div>
            <div className="stat">
              <div className="label">التمارين</div>
              <div className="value">{DRILLS.length}</div>
            </div>
          </div>
          {weak.length > 0 && (
            <div className="small muted" style={{ marginTop: 10 }}>
              أضعف ما لديك:{' '}
              {weak.map((w) => `${w.motif} ${Math.round(w.rate * 100)}%`).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
