/**
 * اختبار رسم الواجهة.
 *
 * لا يستبدل الفحص البصري، لكنه يمسك ما يمسكه الفحص البصري فعليًا في معظم الحالات:
 * انهيار المكوّن عند خاصية ناقصة، أو وصول إلى حقل غير موجود، أو حالة لم تُتوقَّع
 * (مباراة فارغة، تضحية بلا بديل، رحلة مات بلا تغذية راجعة).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Board } from './Board';
import { AcceptDeclinePanel, EvalBar, EvalGraph, GradeChip, MateCounter, MoveList } from './components';
import { BrilliantFlash, EnginePanel, HintPanel } from './components';
import { Menu } from './Menu';
import { PlayScreen } from './PlayScreen';
import { DrillScreen } from './DrillScreen';
import { DRILLS } from '../data/drills';
import { START_FEN, Chess, numberedSanFromPly } from '../game/chess';
import type { BrilliancyFinding } from '../engine/brilliancy';
import type { GameState, PlyRecord } from '../game/useBrilliantGame';
import { DEFAULT_SETTINGS } from '../game/useBrilliantGame';

const FISCHER = 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 0 18';

const finding: BrilliancyFinding = {
  isBrilliant: true,
  move: 'g4e6',
  san: 'Be6',
  score: { type: 'cp', value: 208 },
  offered: 300,
  offeredAbsolute: 900,
  sacrificed: 'q',
  sacrificedNameAr: 'وزير',
  altMove: 'b6c7',
  altSan: 'Qc7',
  altScore: { type: 'cp', value: -213 },
  gapCp: 421,
  gapWp: 36.9,
  acceptMove: 'c5b6',
  acceptSan: 'Bxb6',
  acceptLine: ['Bxb6', 'Bxc4+', 'Kg1', 'Ne2+'],
  acceptScore: { type: 'cp', value: -180 },
  declineMove: 'a3c3',
  declineSan: 'Qxc3',
  declineLine: ['Qxc3', 'Qxc5', 'dxc5', 'Bxc3'],
  declineScore: { type: 'cp', value: -208 },
  trapWp: 11.7,
  isTrap: false,
  pvSan: ['Be6', 'Qxc3', 'Qxc5', 'dxc5'],
  mateIn: null,
  motifs: ['تضحية بالوزير'],
  reasons: ['تضحية بوزير وتبقى الأفضل'],
};

function makePly(overrides: Partial<PlyRecord> = {}): PlyRecord {
  const board = new Chess();
  const move = board.move('e4')!;
  return {
    ply: 0,
    color: 'w',
    san: move.san,
    uci: 'e2e4',
    fenBefore: START_FEN,
    fenAfter: board.fen(),
    byEngine: false,
    judgement: null,
    hunter: null,
    deception: null,
    mateBefore: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    fen: START_FEN,
    history: [],
    status: 'playing',
    result: { over: false, reason: null, winner: null },
    settings: DEFAULT_SETTINGS,
    evalScore: { type: 'cp', value: 35 },
    mateAvailable: null,
    playerOpportunity: null,
    mateJourney: null,
    announcement: null,
    engineNote: '',
    error: null,
    ...overrides,
  };
}

describe('رسم الرقعة', () => {
  it('ترسم الوضع الابتدائي بـ64 مربعًا و32 قطعة', () => {
    const html = renderToStaticMarkup(
      <Board fen={START_FEN} orientation="w" interactive={false} />,
    );
    expect((html.match(/class="square/g) ?? []).length).toBe(64);
    expect((html.match(/class="piece/g) ?? []).length).toBe(32);
  });

  it('تقلب الاتجاه للأسود دون أن تفقد قطعة', () => {
    const html = renderToStaticMarkup(
      <Board fen={FISCHER} orientation="b" interactive={false} />,
    );
    expect((html.match(/class="square/g) ?? []).length).toBe(64);
    expect(html).toContain('piece');
  });

  it('تظلّل آخر نقلة وترسم الأسهم', () => {
    const html = renderToStaticMarkup(
      <Board
        fen={FISCHER}
        orientation="b"
        interactive
        lastMove={{ from: 'g4', to: 'e6' }}
        arrows={[{ from: 'g4', to: 'e6', color: '#d9a441' }]}
        badge={{ square: 'e6', grade: 'brilliant' }}
      />,
    );
    expect(html).toContain('last-move');
    expect(html).toContain('<svg');
    expect(html).toContain('badge');
  });

  it('لا تنهار على موقف نهاية بقطع قليلة', () => {
    const html = renderToStaticMarkup(
      <Board fen="8/5k2/8/4p3/4P3/5K2/8/8 w - - 0 1" orientation="w" interactive={false} />,
    );
    expect((html.match(/class="piece/g) ?? []).length).toBe(4);
  });
});

describe('رسم اللوحات', () => {
  it('شريط التقييم يعمل بلا تقييم', () => {
    expect(renderToStaticMarkup(<EvalBar score={null} orientation="w" />)).toContain('evalbar');
  });

  it('شريط التقييم يعرض من منظور الأبيض في الاتجاهين', () => {
    // +2.00 للأبيض: الجزء الأسود صغير حين ننظر من جهة الأبيض، وكبير من جهة الأسود
    const white = renderToStaticMarkup(
      <EvalBar score={{ type: 'cp', value: 200 }} orientation="w" />,
    );
    const black = renderToStaticMarkup(
      <EvalBar score={{ type: 'cp', value: 200 }} orientation="b" />,
    );
    const share = (html: string) => Number(/height:\s*([\d.]+)%/.exec(html)?.[1] ?? '0');
    expect(share(white)).toBeLessThan(50);
    expect(share(black)).toBeGreaterThan(50);
    expect(white).toContain('+2.00');
  });

  it('قائمة النقلات تتعامل مع مباراة فارغة', () => {
    const html = renderToStaticMarkup(<MoveList plies={[]} activePly={null} />);
    expect(html).toContain('لم تبدأ المباراة بعد');
  });

  it('قائمة النقلات ترسم الأوسمة', () => {
    const ply = makePly({
      judgement: {
        grade: 'brilliant',
        playedMove: 'e2e4',
        playedSan: 'e4',
        playedScore: { type: 'cp', value: 30 },
        bestMove: 'e2e4',
        bestSan: 'e4',
        bestScore: { type: 'cp', value: 30 },
        wpBefore: 52,
        wpAfter: 52,
        wpLoss: 0,
        cpLoss: 0,
        brilliancy: finding,
        missedBrilliancy: false,
      },
    });
    const html = renderToStaticMarkup(<MoveList plies={[ply]} activePly={0} />);
    expect(html).toContain('grade-dot');
    expect(html).toContain('!!');
  });

  it('عدّاد المات ولوحة القبول والرفض ووسام التصنيف', () => {
    expect(
      renderToStaticMarkup(
        <MateCounter mate={{ mateIn: 3, pv: [], pvSan: [], bestMove: 'a1a8' }} />,
      ),
    ).toContain('مات إجباري');
    expect(renderToStaticMarkup(<AcceptDeclinePanel finding={finding} />)).toContain('Bxb6');
    expect(renderToStaticMarkup(<GradeChip grade="blunder" />)).toContain('بلندر');
  });

  it('لوحة التلميحات لا تكشف النقلة قبل الطلب', () => {
    const html = renderToStaticMarkup(<HintPanel opportunity={finding} />);
    expect(html).toContain('تضحية رائعة');
    expect(html).not.toContain('Be6');
  });

  it('لوحة المحرك تعرض حالة التفكير', () => {
    expect(renderToStaticMarkup(<EnginePanel note="" thinking />)).toContain('يبحث عن تضحية');
  });

  it('وميض البريليانت يعرض الشرح كاملًا', () => {
    const html = renderToStaticMarkup(
      <BrilliantFlash
        title="المحرك ضحّى عليك!"
        move="Be6"
        finding={finding}
        deception={null}
        note=""
        kind="engine-brilliant"
        onClose={() => {}}
      />,
    );
    expect(html).toContain('تضحية بالوزير');
    expect(html).toContain('Qc7');
  });

  it('التضحية الحاسمة تُعرض بلون وأيقونة مختلفين عن البريليانت', () => {
    const decisive = renderToStaticMarkup(
      <BrilliantFlash
        title="تضحية حاسمة — المحرك يُنهيها"
        move="Qxh7+"
        finding={{ ...finding, isBrilliant: false, mateIn: 3 }}
        deception={null}
        note=""
        kind="engine-decisive"
        onClose={() => {}}
      />,
    );
    expect(decisive).toContain('⚔');
    expect(decisive).toContain('var(--accent)');
    expect(decisive).not.toContain('⚡');
  });

  it('منحنى التقييم يرسم النقاط', () => {
    const html = renderToStaticMarkup(
      <EvalGraph
        curve={[
          { ply: 0, cp: 30 },
          { ply: 1, cp: -120 },
          { ply: 2, cp: 400 },
        ]}
        activePly={1}
      />,
    );
    expect(html).toContain('polyline');
  });
});

describe('ترقيم شريحة النقلات', () => {
  it('يرقّم من موضعها الحقيقي لا من الأول', () => {
    // النقلات 9..12 (أنصاف 8..11) يجب أن تظهر 5. و6. لا 1. و2.
    expect(numberedSanFromPly(['Nf3', 'Nc6', 'Bc4', 'Nf6'], 8)).toBe('5. Nf3 Nc6 6. Bc4 Nf6');
  });

  it('يبدأ بنقاط ثلاث حين تبدأ الشريحة بنقلة الأسود', () => {
    expect(numberedSanFromPly(['Nc6', 'Bc4'], 9)).toBe('5... Nc6 6. Bc4');
  });
});

describe('بنك التمارين', () => {
  it('كل تمرين موقفه قانوني وحلّه نقلة ممكنة فيه', () => {
    for (const drill of DRILLS) {
      const board = new Chess(drill.fen);
      const legal = board
        .moves({ verbose: true })
        .map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
      expect(legal, `التمرين ${drill.id}`).toContain(drill.solutionUci);
      expect(drill.difficulty).toBeGreaterThanOrEqual(1);
      expect(drill.difficulty).toBeLessThanOrEqual(5);
    }
  });

  it('شاشة التمارين ترسم بلا انهيار', () => {
    // localStorage غير موجود في Node — الشاشة يجب أن تتحمّل ذلك
    const html = renderToStaticMarkup(<DrillScreen onBack={() => {}} />);
    expect(html.length).toBeGreaterThan(0);
  });
});

describe('الشاشات', () => {
  it('القائمة ترسم كل الإعدادات', () => {
    const html = renderToStaticMarkup(
      <Menu onStart={() => {}} onDrills={() => {}} drillCount={12} />,
    );
    expect(html).toContain('ابدأ المباراة');
    expect(html).toContain('الوضع الأجنبي');
    expect(html).toContain('كتاب الفخاخ');
    expect(html).toContain('معمل البريليانت');
    expect(html).toContain('12 تمرين');
  });

  it('القائمة تخبر بوضوح حين يكون بنك التمارين فارغًا', () => {
    const html = renderToStaticMarkup(
      <Menu onStart={() => {}} onDrills={() => {}} drillCount={0} />,
    );
    expect(html).toContain('بنك التمارين فارغ');
  });

  it('شاشة اللعب ترسم مباراة فارغة بلا انهيار', () => {
    const html = renderToStaticMarkup(
      <PlayScreen
        state={makeState()}
        onMove={() => {}}
        onUndo={() => {}}
        onResign={() => {}}
        onReview={() => {}}
        onNewGame={() => {}}
        onDismissAnnouncement={() => {}}
      />,
    );
    expect(html).toContain('board');
    expect(html).toContain('في انتظار نقلتك');
  });

  it('شاشة اللعب ترسم رحلة المات والفرصة المتاحة', () => {
    const html = renderToStaticMarkup(
      <PlayScreen
        state={makeState({
          history: [makePly()],
          mateAvailable: { mateIn: 4, pv: [], pvSan: [], bestMove: 'a1a8' },
          mateJourney: {
            optimalMateIn: 4,
            optimalPlies: 7,
            pliesUsed: 2,
            detours: 1,
            feedback: 'أطلت الطريق: كان مات في 3 وصار في 5.',
            finished: false,
            stars: 2,
          },
          playerOpportunity: finding,
        })}
        onMove={() => {}}
        onUndo={() => {}}
        onResign={() => {}}
        onReview={() => {}}
        onNewGame={() => {}}
        onDismissAnnouncement={() => {}}
      />,
    );
    expect(html).toContain('طريق المات');
    expect(html).toContain('أطلت الطريق');
    expect(html).toContain('★★☆');
  });

  it('شاشة اللعب ترسم نهاية المباراة والإعلان', () => {
    const html = renderToStaticMarkup(
      <PlayScreen
        state={makeState({
          status: 'over',
          result: { over: true, reason: 'كش مات', winner: 'b' },
          announcement: {
            kind: 'engine-brilliant',
            title: 'المحرك ضحّى عليك!',
            move: 'Be6',
            finding,
            deception: null,
            note: '',
          },
        })}
        onMove={() => {}}
        onUndo={() => {}}
        onResign={() => {}}
        onReview={() => {}}
        onNewGame={() => {}}
        onDismissAnnouncement={() => {}}
      />,
    );
    expect(html).toContain('انتهت المباراة');
    expect(html).toContain('brilliant-flash');
  });
});
