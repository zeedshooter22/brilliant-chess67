import { useCallback, useEffect, useState } from 'react';
import { Menu } from './ui/Menu';
import { PlayScreen } from './ui/PlayScreen';
import { ReviewScreen } from './ui/ReviewScreen';
import { DrillScreen } from './ui/DrillScreen';
import { DRILL_COUNT } from './data/drills';
import { DEFAULT_SETTINGS, useBrilliantGame, type GameSettings } from './game/useBrilliantGame';
import { warmUpEngines } from './engine/pool';
import { engineFlavour } from './engine/engine';

type Screen = 'menu' | 'play' | 'review' | 'drills';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 2, label: 'يُقلع المحرك…' });
  const game = useBrilliantGame(DEFAULT_SETTINGS);
  const flavour = engineFlavour();

  // إقلاع المحركين مرة واحدة عند فتح الموقع
  useEffect(() => {
    let cancelled = false;
    warmUpEngines((done, total, label) => {
      if (!cancelled) setLoadProgress({ done, total, label });
    })
      .then(() => {
        if (!cancelled) setEngineReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEngineError(
          error instanceof Error
            ? `تعذّر تشغيل المحرك: ${error.message}`
            : 'تعذّر تشغيل المحرك',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = useCallback(
    (settings: GameSettings) => {
      setScreen('play');
      void game.start(settings);
    },
    [game],
  );

  const backToMenu = useCallback(() => setScreen('menu'), []);

  if (engineError) {
    return (
      <div className="app">
        <div className="error-box">
          <strong>{engineError}</strong>
          <div className="small" style={{ marginTop: 8 }}>
            المحرك يعمل داخل المتصفح ويحتاج WebAssembly. جرّب متصفحًا حديثًا، وتأكد أن
            الصفحة تُقدَّم عبر <span className="ltr">npm run dev</span> لا بفتح الملف مباشرة.
          </div>
        </div>
      </div>
    );
  }

  if (!engineReady) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div style={{ fontSize: 22, fontWeight: 700 }}>⚡ معمل البريليانت</div>
          <div className="progress">
            <div
              className="fill"
              style={{ width: `${Math.round((loadProgress.done / loadProgress.total) * 100)}%` }}
            />
          </div>
          <div className="small">{loadProgress.label}</div>
          <div className="small muted">
            يُحمَّل Stockfish 18 محليًا (‏~7MB) — أول مرة فقط، ثم يعمل بلا إنترنت.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="spark">⚡</span>
          <span>معمل البريليانت</span>
        </div>
        <div className="row">
          {screen !== 'menu' && (
            <button className="ghost" onClick={backToMenu}>
              القائمة
            </button>
          )}
          {screen === 'play' && game.state.history.length > 0 && (
            <button className="ghost" onClick={() => setScreen('review')}>
              التحليل
            </button>
          )}
          <span className="engine-badge">{flavour.label}</span>
        </div>
      </div>

      {screen === 'menu' && (
        <Menu
          onStart={handleStart}
          onDrills={() => setScreen('drills')}
          drillCount={DRILL_COUNT}
        />
      )}

      {screen === 'drills' && <DrillScreen onBack={backToMenu} />}

      {screen === 'play' && (
        <PlayScreen
          state={game.state}
          onMove={game.playerMove}
          onUndo={game.undo}
          onResign={game.resign}
          onReview={() => setScreen('review')}
          onNewGame={backToMenu}
          onDismissAnnouncement={game.dismissAnnouncement}
        />
      )}

      {screen === 'review' && (
        <ReviewScreen
          state={game.state}
          onBack={() => setScreen('play')}
          onNewGame={backToMenu}
        />
      )}
    </div>
  );
}
