import { useState } from 'react';
import type { GameSettings } from '../game/useBrilliantGame';
import { DEFAULT_HUNTER_OPTIONS } from '../engine/hunter';
import { FULL_BOOK } from '../game/trapBook';

export function Menu({
  onStart,
  onDrills,
  drillCount,
}: {
  onStart: (settings: GameSettings) => void;
  onDrills: () => void;
  drillCount: number;
}) {
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w');
  const [elo, setElo] = useState<number | null>(null);
  const [baitCp, setBaitCp] = useState(DEFAULT_HUNTER_OPTIONS.baitToleranceCp);
  const [alienMode, setAlienMode] = useState(true);
  const [useBook, setUseBook] = useState(true);
  const [liveAnalysis, setLiveAnalysis] = useState(true);
  const [budget, setBudget] = useState(DEFAULT_HUNTER_OPTIONS.budgetMs);
  const [keepGameAlive, setKeepGameAlive] = useState(true);

  const bookSize = FULL_BOOK.length;

  function launch() {
    const resolved: 'w' | 'b' =
      color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    onStart({
      playerColor: resolved,
      engineElo: elo,
      announceBrilliancies: true,
      liveAnalysis,
      hunter: {
        baitToleranceCp: baitCp,
        alienMode,
        useBook,
        keepGameAlive,
        budgetMs: budget,
      },
    });
  }

  return (
    <div>
      <div className="panel">
        <h3>كيف يعمل هذا الموقع</h3>
        <p style={{ marginTop: 0 }}>
          تلعب مباراة كاملة ضد محرك <strong>يصطاد التضحيات الرائعة ضدك</strong>: ينصب الفخاخ،
          ويضحّي عليك متى وجد تضحية سليمة، ويقودك إلى مواقف فيها تضحية رائعة{' '}
          <strong>لك أنت</strong> تجدها بنفسك. بعد المباراة يشرح كل نقلة، ويحدّد
          <strong> أين بدأ الخلل</strong>، ويتيح لك أن تعود لأي نقلة وتسأل: ماذا لو لعبت غيرها؟
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          التضحية الرائعة تحتاج ثغرة في موقفك — لا يستطيع أي محرك أن يضحّي عليك إذا دافعت
          بإتقان. لذلك يفتتح المحرك من كتاب فخاخ مُتحقَّق منه ({bookSize} خط) ويقبل تنازلًا
          صغيرًا محسوبًا ليخلق الفرص.
        </p>
      </div>

      <div className="menu-grid" style={{ marginBottom: 14 }}>
        <div className="mode-card" onClick={onDrills}>
          <h2>⚡ معمل البريليانت</h2>
          <p>
            {drillCount > 0
              ? `${drillCount} تمرينًا مُتحقَّقًا منه — في كل واحد تضحية رائعة مضمونة تجدها بنفسك، ثم تحوّلها إلى مات بأقصر طريق.`
              : 'بنك التمارين فارغ — شغّل التنقيب الآلي لبنائه.'}
          </p>
        </div>
        <div className="mode-card" onClick={() => document.getElementById('game-settings')?.scrollIntoView({ behavior: 'smooth' })}>
          <h2>♟ مباراة ضد الصياد</h2>
          <p>
            قيم كامل ضد محرك ينصب الفخاخ ويضحّي عليك، ثم يحلّل كل نقلة ويريك ماذا لو غيّرتها.
          </p>
        </div>
      </div>

      <div className="menu-grid">
        <div className="panel" id="game-settings">
          <h3>إعدادات المباراة</h3>

          <div className="setting-row">
            <label>لونك</label>
            <select value={color} onChange={(e) => setColor(e.target.value as typeof color)}>
              <option value="w">أبيض</option>
              <option value="b">أسود</option>
              <option value="random">عشوائي</option>
            </select>
          </div>

          <div className="setting-row">
            <label>قوة المحرك</label>
            <select
              value={elo === null ? 'full' : String(elo)}
              onChange={(e) => setElo(e.target.value === 'full' ? null : Number(e.target.value))}
            >
              <option value="1400">1400 — مبتدئ</option>
              <option value="1700">1700 — متوسط</option>
              <option value="2000">2000 — قوي</option>
              <option value="2400">2400 — خبير</option>
              <option value="full">كامل القوة</option>
            </select>
          </div>

          <div className="setting-row">
            <label>
              حد التنازل لنصب الفخاخ
              <div className="small muted">كم يسمح لنفسه أن يخسر مقابل خلق فرصة تضحية</div>
            </label>
            <span className="row">
              <input
                type="range"
                min={0}
                max={120}
                step={10}
                value={baitCp}
                onChange={(e) => setBaitCp(Number(e.target.value))}
              />
              <span className="ltr small">{(baitCp / 100).toFixed(2)}</span>
            </span>
          </div>

          <div className="setting-row">
            <label>
              وقت تفكير المحرك
              <div className="small muted">أطول = فخاخ أعمق، وانتظار أطول</div>
            </label>
            <span className="row">
              <input
                type="range"
                min={800}
                max={6000}
                step={200}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
              <span className="ltr small">{(budget / 1000).toFixed(1)}s</span>
            </span>
          </div>

          <div className="setting-row">
            <label>
              يُبقي المباراة حيّة
              <div className="small muted">
                لا يطحنك بتفوّقه: كلما تقدّم سمح لنفسه بتنازل أكبر ليبقى في المنطقة التي
                تُولد فيها التضحيات — فوق ‎+4.00 لا تُحتسب أي تضحية «رائعة» أصلًا.
              </div>
            </label>
            <input
              type="checkbox"
              checked={keepGameAlive}
              onChange={(e) => setKeepGameAlive(e.target.checked)}
            />
          </div>

          <div className="setting-row">
            <label>
              👽 الوضع الأجنبي
              <div className="small muted">يفضّل النقلات التي تبدو بلندر وهي سليمة</div>
            </label>
            <input
              type="checkbox"
              checked={alienMode}
              onChange={(e) => setAlienMode(e.target.checked)}
            />
          </div>

          <div className="setting-row">
            <label>
              كتاب الفخاخ
              <div className="small muted">{bookSize} خط مُتحقَّق منه بالمحرك</div>
            </label>
            <input type="checkbox" checked={useBook} onChange={(e) => setUseBook(e.target.checked)} />
          </div>

          <div className="setting-row">
            <label>
              تحليل نقلاتك أثناء اللعب
              <div className="small muted">يعلن فورًا حين تجد تضحية رائعة</div>
            </label>
            <input
              type="checkbox"
              checked={liveAnalysis}
              onChange={(e) => setLiveAnalysis(e.target.checked)}
            />
          </div>

          <button className="primary" style={{ width: '100%', marginTop: 14 }} onClick={launch}>
            ابدأ المباراة
          </button>
        </div>

        <div className="panel">
          <h3>ما الذي يجعل النقلة «بريليانت» هنا</h3>
          <ul style={{ paddingRight: 18, margin: 0 }}>
            <li>تبذل مادة حقيقية كان بإمكانك الاحتفاظ بها (١.٥ بيدق فأكثر).</li>
            <li>تبقى مع ذلك أفضل نقلة على الرقعة ولا تخسر الموقف.</li>
            <li>
              يوجد بديل حريص مغرٍ لكنه أسوأ بوضوح — وإلا فهي نقلة اضطرارية لا اكتشاف.
            </li>
            <li>الموقف ليس محسومًا سلفًا: من يتقدّم بوزير لا يستحق وسام التضحية.</li>
            <li>
              <strong>أو</strong> أن قبول التضحية كارثة على الخصم — وهذا ما يجعل مات ليجال
              فخًّا خالدًا رغم أن المحرك يقيّمه بـ‎+1.8 فقط.
            </li>
            <li>وتبقى صحيحة عند إعادة الفحص على عمق أكبر — لا وهم بحث سطحي.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
