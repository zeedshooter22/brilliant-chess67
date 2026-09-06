import { useMemo, useState } from 'react';
import { Board, movePairOf, type BoardArrow } from './Board';
import {
  BrilliantFlash,
  EnginePanel,
  EvalBar,
  GradeSummary,
  HintPanel,
  MateCounter,
  MoveList,
  San,
} from './components';
import { describeHunterReason } from '../engine/hunter';
import { sideToMove } from '../game/chess';
import type { GameState } from '../game/useBrilliantGame';

export interface PlayScreenProps {
  state: GameState;
  onMove: (uci: string) => void;
  onUndo: () => void;
  onResign: () => void;
  onReview: () => void;
  onNewGame: () => void;
  onDismissAnnouncement: () => void;
}

export function PlayScreen({
  state,
  onMove,
  onUndo,
  onResign,
  onReview,
  onNewGame,
  onDismissAnnouncement,
}: PlayScreenProps) {
  const [showMatePath, setShowMatePath] = useState(false);

  const lastPly = state.history.at(-1) ?? null;
  const lastMove = movePairOf(lastPly?.uci);
  const playerTurn =
    !state.result.over &&
    state.status !== 'thinking' &&
    sideToMove(state.fen) === state.settings.playerColor;

  const arrows: BoardArrow[] = useMemo(() => {
    if (!showMatePath || !state.mateAvailable) return [];
    const first = state.mateAvailable.bestMove;
    if (!first || first.length < 4) return [];
    return [{ from: first.slice(0, 2), to: first.slice(2, 4), color: '#d9a441', width: 1.8 }];
  }, [showMatePath, state.mateAvailable]);

  const engineBrilliancies = state.history.filter(
    (ply) => ply.byEngine && ply.hunter?.reason === 'brilliant-now',
  ).length;
  const playerBrilliancies = state.history.filter(
    (ply) => !ply.byEngine && ply.judgement?.grade === 'brilliant',
  ).length;

  return (
    <div className="play-layout">
      <div>
        <div className="board-column">
          <EvalBar score={state.evalScore} orientation={state.settings.playerColor} />
          <Board
            fen={state.fen}
            orientation={state.settings.playerColor}
            lastMove={lastMove}
            interactive={playerTurn}
            onMove={onMove}
            arrows={arrows}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={onUndo} disabled={state.status === 'thinking' || state.history.length === 0}>
            تراجع
          </button>
          <button className="ghost" onClick={onResign} disabled={state.result.over}>
            انسحاب
          </button>
          <span className="spacer" />
          <span className="chip">⚡ المحرك: {engineBrilliancies}</span>
          <span className="chip">⭐ أنت: {playerBrilliancies}</span>
        </div>

        {state.error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            {state.error}
          </div>
        )}
      </div>

      <div>
        {state.result.over && (
          <div className="panel highlight">
            <h3>انتهت المباراة</h3>
            <div style={{ fontSize: 17, marginBottom: 10 }}>
              {state.result.reason}
              {state.result.winner &&
                ` — فاز ${state.result.winner === state.settings.playerColor ? 'أنت' : 'المحرك'}`}
            </div>
            <div className="row">
              <button className="primary" onClick={onReview}>
                حلّل المباراة
              </button>
              <button className="ghost" onClick={onNewGame}>
                مباراة جديدة
              </button>
            </div>
          </div>
        )}

        {state.mateAvailable && !state.result.over && (
          <MateCounter mate={state.mateAvailable} onShow={() => setShowMatePath((v) => !v)} />
        )}

        {state.mateJourney && (
          <div className="panel">
            <h3>طريق المات</h3>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                الأقصر: <span className="ltr">{state.mateJourney.optimalMateIn}</span> نقلة ·
                لعبت <span className="ltr">{state.mateJourney.pliesUsed}</span> نقلة
              </span>
              <span className="stars">
                {'★'.repeat(state.mateJourney.stars)}
                {'☆'.repeat(3 - state.mateJourney.stars)}
              </span>
            </div>
            {state.mateJourney.feedback && (
              <div
                className="hint-step"
                style={{
                  marginTop: 8,
                  borderRightColor:
                    state.mateJourney.detours > 0 ? 'var(--inaccuracy)' : 'var(--best)',
                }}
              >
                {state.mateJourney.feedback}
              </div>
            )}
            {state.mateJourney.detours > 0 && (
              <div className="small muted">
                أطلت الطريق {state.mateJourney.detours} مرة — استخدم التراجع وأعد المحاولة.
              </div>
            )}
          </div>
        )}

        {state.playerOpportunity && !state.result.over && (
          <HintPanel opportunity={state.playerOpportunity} />
        )}

        <EnginePanel
          note={state.engineNote}
          thinking={state.status === 'thinking'}
          reason={lastPly?.hunter ? describeHunterReason(lastPly.hunter.reason) : undefined}
        />

        {lastPly?.hunter?.bookLine && (
          <div className="panel">
            <h3>خط الفخ الحالي</h3>
            <div style={{ fontWeight: 600 }}>{lastPly.hunter.bookLine.nameAr}</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {lastPly.hunter.bookLine.ideaAr}
            </div>
          </div>
        )}

        {lastPly?.hunter && lastPly.hunter.candidates.length > 0 && (
          <div className="panel">
            <h3>ما فكّر فيه المحرك</h3>
            {lastPly.hunter.candidates.slice(0, 4).map((candidate) => (
              <div className="setting-row" key={candidate.move}>
                <span>
                  <San>{candidate.san}</San>
                  {candidate.move === lastPly.uci && (
                    <span className="chip" style={{ marginRight: 6 }}>
                      اختارها
                    </span>
                  )}
                </span>
                <span className="small muted">
                  تنازل {(candidate.lossCp / 100).toFixed(2)} · فرص{' '}
                  {Math.round(candidate.sacPotential * 100)}%
                  {candidate.deceptionWp > 5 && ` · خداع ${candidate.deceptionWp.toFixed(0)}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <h3>النقلات وتقييمها</h3>
          <GradeSummary plies={state.history} playerColor={state.settings.playerColor} />
          <MoveList plies={state.history} activePly={lastPly?.ply ?? null} autoScroll />
        </div>
      </div>

      {state.announcement && (
        <BrilliantFlash
          title={state.announcement.title}
          move={state.announcement.move}
          finding={state.announcement.finding}
          deception={state.announcement.deception}
          note={state.announcement.note}
          kind={state.announcement.kind}
          onClose={onDismissAnnouncement}
        />
      )}
    </div>
  );
}
