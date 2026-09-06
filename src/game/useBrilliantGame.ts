/**
 * حلقة اللعب: تربط الرقعة بالمحرك الصائد وبمحلّل الخلفية.
 *
 * مبدأ التصميم: لا ينتظر اللاعب التحليل أبدًا. نقلة المحرك تُلعب فور جهوزها،
 * وتصنيف نقلات اللاعب والبحث عن المات يجريان في الخلفية ويصلان متى وصلا.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, applyUci, isGameOver, sideToMove } from './chess';
import { getAnalyst, getPlayEngine, resetEnginesForNewGame } from '../engine/pool';
import { chooseHunterMove, type HunterDecision, type HunterOptions } from '../engine/hunter';
import { judgeMove, type MoveJudgement } from '../engine/classify';
import { scanForBrilliancy, type BrilliancyFinding } from '../engine/brilliancy';
import { findShortestMate, mateStars, type MateInfo } from '../engine/mate';
import { measureDeception, type DeceptionMeasure } from '../engine/deception';
import { negateScore, type Score } from '../engine/types';

export interface PlyRecord {
  ply: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  byEngine: boolean;
  /** يصل لاحقًا من محلّل الخلفية */
  judgement: MoveJudgement | null;
  /** قرار المحرك الصائد — لنقلاته فقط */
  hunter: HunterDecision | null;
  /** خداع نقلة المحرك: تبدو بلندر وهي سليمة */
  deception: DeceptionMeasure | null;
  /** بُعد المات الذي كان متاحًا قبل هذه النقلة — لتقييم طريق المات */
  mateBefore: number | null;
}

export interface GameSettings {
  playerColor: 'w' | 'b';
  /** قوة المحرك: null = كامل القوة */
  engineElo: number | null;
  hunter: Partial<HunterOptions>;
  /** إظهار وميض عند لعب المحرك بريليانت */
  announceBrilliancies: boolean;
  /** تحليل نقلاتك أثناء اللعب (يستهلك معالجًا) */
  liveAnalysis: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  playerColor: 'w',
  engineElo: null,
  hunter: {},
  announceBrilliancies: true,
  liveAnalysis: true,
};

export type GameStatus = 'idle' | 'playing' | 'thinking' | 'over';

/**
 * تتبّع رحلة المات.
 *
 * "أنهه بأقصر طريق" وعدٌ لا معنى له بلا قياس: نسجّل بُعد المات لحظة ظهوره،
 * ونحصي كم نصف نقلة استغرقت فعلًا، وكم مرة أطلت الطريق.
 */
export interface MateJourney {
  /** بُعد المات حين ظهر أول مرة */
  optimalMateIn: number;
  /**
   * عدد نقلاتك المثلى المطلوبة — يساوي optimalMateIn تمامًا.
   * (لا نصف نقلات الخصم: pliesUsed أدناه يُحسب من نقلاتك فقط، فيجب أن يُقارَن
   * بعددها المطلوب لا بإجمالي أنصاف النقلات، وإلا امتلأت النجوم زورًا.)
   */
  optimalPlies: number;
  /** عدد نقلاتك التي لعبتها فعلًا في هذه الرحلة */
  pliesUsed: number;
  /** كم مرة أطلت الطريق */
  detours: number;
  /** آخر رسالة تقييم لنقلتك في طريق المات */
  feedback: string | null;
  finished: boolean;
  stars: number;
}

export interface Announcement {
  kind: 'engine-brilliant' | 'engine-decisive' | 'player-brilliant' | 'alien' | 'missed';
  title: string;
  move: string;
  finding: BrilliancyFinding | null;
  deception: DeceptionMeasure | null;
  note: string;
}

export interface GameState {
  fen: string;
  history: PlyRecord[];
  status: GameStatus;
  result: { over: boolean; reason: string | null; winner: 'w' | 'b' | null };
  settings: GameSettings;
  /** آخر تقييم معروف من منظور الأبيض */
  evalScore: Score | null;
  /** مات متاح للاعب الآن */
  mateAvailable: MateInfo | null;
  /** أول تضحية رائعة متاحة للاعب في الموقف الحالي — أساس التلميحات */
  playerOpportunity: BrilliancyFinding | null;
  mateJourney: MateJourney | null;
  announcement: Announcement | null;
  engineNote: string;
  error: string | null;
}

function newGameState(settings: GameSettings): GameState {
  const board = new Chess();
  return {
    fen: board.fen(),
    history: [],
    status: 'idle',
    result: { over: false, reason: null, winner: null },
    settings,
    evalScore: null,
    mateAvailable: null,
    playerOpportunity: null,
    mateJourney: null,
    announcement: null,
    engineNote: '',
    error: null,
  };
}

export function useBrilliantGame(initialSettings: GameSettings = DEFAULT_SETTINGS) {
  const [state, setState] = useState<GameState>(() => newGameState(initialSettings));
  const stateRef = useRef(state);
  stateRef.current = state;
  /** يمنع تداخل دورين للمحرك لو ضغط اللاعب بسرعة */
  const engineBusy = useRef(false);
  /** رقم الجولة — يُبطل نتائج التحليل القادمة من مباراة سابقة */
  const generation = useRef(0);

  const patch = useCallback((update: Partial<GameState>) => {
    setState((prev) => ({ ...prev, ...update }));
  }, []);

  /** تحليل خلفي: تصنيف نقلة اللاعب + البحث عن فرصة له في الموقف الجديد */
  const analyseInBackground = useCallback(
    async (record: PlyRecord, gen: number) => {
      if (!stateRef.current.settings.liveAnalysis) return;
      try {
        const analyst = await getAnalyst();
        const judgement = await judgeMove(analyst, record.fenBefore, record.uci, {
          depth: 18,
          verifyDepth: 22,
        });
        if (gen !== generation.current) return;

        setState((prev) => ({
          ...prev,
          history: prev.history.map((r) =>
            r.ply === record.ply ? { ...r, judgement } : r,
          ),
          announcement:
            judgement.grade === 'brilliant' && prev.settings.announceBrilliancies
              ? {
                  kind: 'player-brilliant',
                  title: 'وجدتها! تضحية رائعة',
                  move: judgement.playedSan,
                  finding: judgement.brilliancy,
                  deception: null,
                  note: judgement.brilliancy?.reasons.at(-1) ?? '',
                }
              : prev.announcement,
        }));
      } catch (error) {
        // التحليل رفاهية — لا يوقف اللعب
        console.warn('تعذّر تحليل النقلة', error);
      }
    },
    [],
  );

  /** بحث خلفي عن فرصة للاعب: مات قصير أو تضحية رائعة */
  const scanPlayerChances = useCallback(async (fen: string, gen: number) => {
    try {
      const analyst = await getAnalyst();
      const mate = await findShortestMate(analyst, fen, 6, 20);
      if (gen !== generation.current) return;
      patch({ mateAvailable: mate });

      if (!mate) {
        const scan = await scanForBrilliancy(analyst, fen, { depth: 18, verifyDepth: 22 });
        if (gen !== generation.current) return;
        // تقييم المحرك من منظور صاحب الدور؛ شريط التقييم يعرض من منظور الأبيض دائمًا.
        // بلا هذا التحويل ينقلب الشريط رأسًا على عقب كلما لعبت بالأسود.
        const raw = scan.analysis.lines[0]?.score ?? null;
        const whiteScore = raw ? (sideToMove(fen) === 'w' ? raw : negateScore(raw)) : null;
        patch({
          playerOpportunity: scan.finding?.isBrilliant ? scan.finding : null,
          evalScore: whiteScore,
        });
      } else {
        patch({ playerOpportunity: null });
      }
    } catch (error) {
      console.warn('تعذّر فحص فرص اللاعب', error);
    }
  }, [patch]);

  /**
   * يقيس أثر نقلتك على طول طريق المات.
   * يُستدعى فقط حين كان هناك مات متاح قبل النقلة — وإلا فلا شيء نقيسه.
   */
  const trackMateProgress = useCallback(
    async (record: PlyRecord, gen: number) => {
      if (record.mateBefore === null) return;
      try {
        const analyst = await getAnalyst();
        const board = new Chess(record.fenAfter);
        if (board.isCheckmate()) {
          setState((prev) => {
            // قد تكون هذه أول نقلة في الرحلة (مات في 1 لُعب مباشرة) فلا توجد
            // journey سابقة بعد — نبنيها الآن بدل تجاهل التحديث صامتًا.
            const journey = prev.mateJourney ?? {
              optimalMateIn: record.mateBefore!,
              optimalPlies: record.mateBefore!,
              pliesUsed: 0,
              detours: 0,
              feedback: null,
              finished: false,
              stars: 3,
            };
            const pliesUsed = journey.pliesUsed + 1;
            return {
              ...prev,
              mateJourney: {
                ...journey,
                pliesUsed,
                finished: true,
                stars: mateStars(journey.optimalPlies, pliesUsed),
                feedback: 'كش مات!',
              },
            };
          });
          return;
        }

        // بعد نقلتنا الدور للخصم؛ المات علينا يظهر سالبًا من منظوره
        const reply = await analyst.analyse(record.fenAfter, { multipv: 1, depth: 18 });
        if (gen !== generation.current) return;
        const score = reply.lines[0]?.score;
        const after = score && score.type === 'mate' && score.value < 0 ? -score.value : null;

        setState((prev) => {
          const before = record.mateBefore!;
          const journey =
            prev.mateJourney ?? {
              optimalMateIn: before,
              optimalPlies: before,
              pliesUsed: 0,
              detours: 0,
              feedback: null,
              finished: false,
              stars: 3,
            };
          const pliesUsed = journey.pliesUsed + 1;

          if (after === null) {
            return {
              ...prev,
              mateJourney: {
                ...journey,
                pliesUsed,
                detours: journey.detours + 1,
                feedback: `ضاع المات! كان مات في ${before}.`,
              },
            };
          }

          // النقلة المثلى تُنقص بُعد المات نقلةً واحدة
          const lengthened = after - (before - 1);
          return {
            ...prev,
            mateJourney: {
              ...journey,
              pliesUsed,
              detours: journey.detours + (lengthened > 0 ? 1 : 0),
              feedback:
                lengthened > 0
                  ? `أطلت الطريق: كان مات في ${before} وصار في ${after}.`
                  : `ممتاز — ما زلت على أقصر طريق (مات في ${after}).`,
            },
          };
        });
      } catch (error) {
        console.warn('تعذّر تتبّع طريق المات', error);
      }
    },
    [],
  );

  const runEngineTurn = useCallback(async () => {
    if (engineBusy.current) return;
    const current = stateRef.current;
    if (current.result.over) return;

    engineBusy.current = true;
    const gen = generation.current;
    patch({ status: 'thinking', engineNote: 'يفكّر…' });

    try {
      const engine = await getPlayEngine();
      const board = new Chess(current.fen);
      const engineColor = current.settings.playerColor === 'w' ? 'b' : 'w';
      const decision = await chooseHunterMove(
        engine,
        current.fen,
        current.settings.hunter,
        { history: current.history.map((r) => r.san), engineColor },
      );
      if (gen !== generation.current) return;
      if (!decision.move) throw new Error('لم يجد المحرك نقلة');

      const applied = applyUci(current.fen, decision.move);
      if (!applied) throw new Error(`نقلة غير قانونية من المحرك: ${decision.move}`);

      const record: PlyRecord = {
        ply: current.history.length,
        color: board.turn(),
        san: applied.move.san,
        uci: decision.move,
        fenBefore: current.fen,
        fenAfter: applied.fen,
        byEngine: true,
        judgement: null,
        hunter: decision,
        deception: null,
        mateBefore: null,
      };

      const result = isGameOver(applied.fen);
      const announcement: Announcement | null =
        decision.reason === 'brilliant-now' && decision.brilliancy && current.settings.announceBrilliancies
          ? {
              kind: 'engine-brilliant',
              title: 'المحرك ضحّى عليك!',
              move: decision.san,
              finding: decision.brilliancy,
              deception: null,
              note: decision.brilliancy.reasons.at(-1) ?? '',
            }
          : decision.reason === 'decisive-sac' && decision.brilliancy && current.settings.announceBrilliancies
            ? {
                kind: 'engine-decisive',
                title: 'تضحية حاسمة — المحرك يُنهيها',
                move: decision.san,
                finding: decision.brilliancy,
                deception: null,
                note: decision.note,
              }
            : decision.reason === 'alien' && current.settings.announceBrilliancies
            ? {
                kind: 'alien',
                title: 'نقلة تبدو خاطئة… وهي ليست كذلك',
                move: decision.san,
                finding: null,
                deception: null,
                note: decision.note,
              }
            : null;

      setState((prev) => ({
        ...prev,
        fen: applied.fen,
        history: [...prev.history, record],
        status: result.over ? 'over' : 'playing',
        result,
        engineNote: decision.note,
        announcement: announcement ?? prev.announcement,
        mateAvailable: null,
        playerOpportunity: null,
      }));

      if (!result.over) void scanPlayerChances(applied.fen, gen);

      // خداع نقلة المحرك يُقاس في الخلفية ويُعرض في المراجعة
      if (
        decision.reason === 'alien' ||
        decision.reason === 'brilliant-now' ||
        decision.reason === 'decisive-sac'
      ) {
        void (async () => {
          try {
            const analyst = await getAnalyst();
            const deception = await measureDeception(analyst, record.fenBefore, record.uci, {
              shallowDepth: 8,
              deepDepth: 20,
            });
            if (gen !== generation.current) return;
            setState((prev) => ({
              ...prev,
              history: prev.history.map((r) => (r.ply === record.ply ? { ...r, deception } : r)),
            }));
          } catch {
            /* تجاهل */
          }
        })();
      }
    } catch (error) {
      patch({
        status: 'playing',
        error: error instanceof Error ? error.message : 'خطأ غير متوقع في المحرك',
      });
    } finally {
      engineBusy.current = false;
    }
  }, [patch, scanPlayerChances]);

  const playerMove = useCallback(
    (uci: string) => {
      const current = stateRef.current;
      if (current.status === 'thinking' || current.result.over) return false;

      const applied = applyUci(current.fen, uci);
      if (!applied) return false;

      const gen = generation.current;
      const record: PlyRecord = {
        ply: current.history.length,
        color: applied.move.color,
        san: applied.move.san,
        uci,
        fenBefore: current.fen,
        fenAfter: applied.fen,
        byEngine: false,
        judgement: null,
        hunter: null,
        deception: null,
        mateBefore: current.mateAvailable?.mateIn ?? null,
      };
      const result = isGameOver(applied.fen);

      setState((prev) => ({
        ...prev,
        fen: applied.fen,
        history: [...prev.history, record],
        result,
        status: result.over ? 'over' : 'playing',
        mateAvailable: null,
        playerOpportunity: null,
        announcement: null,
      }));

      void analyseInBackground(record, gen);
      void trackMateProgress(record, gen);
      if (!result.over) void runEngineTurn();
      return true;
    },
    [analyseInBackground, runEngineTurn, trackMateProgress],
  );

  const start = useCallback(
    async (settings: GameSettings) => {
      generation.current += 1;
      engineBusy.current = false;
      setState({ ...newGameState(settings), status: 'playing' });
      await resetEnginesForNewGame();

      // قوة المحرك تُضبط على محرك اللعب وحده. المحلّل يبقى بكامل قوته دائمًا:
      // تصنيف نقلاتك والبحث عن المات يجب ألا يضعفا لأنك اخترت خصمًا أسهل.
      const playEngine = await getPlayEngine();
      await playEngine.configure({ elo: settings.engineElo });

      if (settings.playerColor === 'b') {
        void runEngineTurn();
      } else {
        void scanPlayerChances(new Chess().fen(), generation.current);
      }
    },
    [runEngineTurn, scanPlayerChances],
  );

  /** تراجع عن نقلتك ونقلة المحرك معًا */
  const undo = useCallback(() => {
    const current = stateRef.current;
    if (current.status === 'thinking') return;
    const trimmed = [...current.history];
    while (trimmed.length > 0) {
      const last = trimmed.pop()!;
      if (!last.byEngine) {
        setState((prev) => ({
          ...prev,
          history: trimmed,
          fen: last.fenBefore,
          result: { over: false, reason: null, winner: null },
          status: 'playing',
          announcement: null,
          mateAvailable: null,
          playerOpportunity: null,
          mateJourney: null,
        }));
        generation.current += 1;
        void scanPlayerChances(last.fenBefore, generation.current);
        return;
      }
    }
  }, [scanPlayerChances]);

  const resign = useCallback(() => {
    patch({
      status: 'over',
      result: {
        over: true,
        reason: 'انسحبت',
        winner: stateRef.current.settings.playerColor === 'w' ? 'b' : 'w',
      },
    });
  }, [patch]);

  const dismissAnnouncement = useCallback(() => patch({ announcement: null }), [patch]);
  const clearError = useCallback(() => patch({ error: null }), [patch]);

  useEffect(() => {
    return () => {
      generation.current += 1;
    };
  }, []);

  return {
    state,
    start,
    playerMove,
    undo,
    resign,
    dismissAnnouncement,
    clearError,
  };
}
