import { useEffect, useState } from 'react';
import type { Score } from '../engine/types';
import { formatScore, scoreToCp, scoreToWinProb } from '../engine/types';
import { GRADE_STYLE, type MoveGrade } from '../engine/classify';
import type { BrilliancyFinding } from '../engine/brilliancy';
import type { DeceptionMeasure } from '../engine/deception';
import { explainBrilliancy } from '../analysis/narrate.ar';
import type { PlyRecord } from '../game/useBrilliantGame';
import type { MateInfo } from '../engine/mate';

/** نص جبري معزول عن اتجاه الصفحة. */
export function San({ children }: { children: React.ReactNode }) {
  return <span className="ltr">{children}</span>;
}

// ===== شريط التقييم =====

export function EvalBar({ score, orientation }: { score: Score | null; orientation: 'w' | 'b' }) {
  const whiteScore: Score = score ?? { type: 'cp', value: 0 };
  const whiteWp = scoreToWinProb(whiteScore);
  // الجزء العلوي للأسود حين ننظر من جهة الأبيض
  const topShare = orientation === 'w' ? 100 - whiteWp : whiteWp;

  return (
    <div className="evalbar" title={`تقييم: ${formatScore(whiteScore)}`}>
      <div className="black-part" style={{ height: `${topShare}%` }} />
      <div className="white-part" />
      <span className={`value ${orientation === 'w' ? 'top' : 'bottom'}`}>
        {score ? formatScore(whiteScore) : '—'}
      </span>
    </div>
  );
}

// ===== قائمة النقلات =====

export function MoveList({
  plies,
  activePly,
  onSelect,
}: {
  plies: PlyRecord[];
  activePly: number | null;
  onSelect?: (ply: number) => void;
}) {
  const rows: PlyRecord[][] = [];
  for (let i = 0; i < plies.length; i += 2) {
    rows.push([plies[i], plies[i + 1]].filter(Boolean) as PlyRecord[]);
  }

  return (
    <div className="movelist">
      {rows.length === 0 && <div className="muted small">لم تبدأ المباراة بعد.</div>}
      {rows.map((row, index) => (
        <div className="move-row" key={index}>
          <span className="move-no">{index + 1}.</span>
          {row.map((ply) => {
            const grade = ply.judgement?.grade;
            const style = grade ? GRADE_STYLE[grade] : null;
            return (
              <span
                key={ply.ply}
                className={`move-cell ${activePly === ply.ply ? 'active' : ''}`}
                onClick={() => onSelect?.(ply.ply)}
              >
                {style && <span className="grade-dot" style={{ background: style.color }} />}
                <San>{ply.san}</San>
                {style?.symbol && (
                  <span className="grade-tag" style={{ color: style.color }}>
                    {style.symbol}
                  </span>
                )}
              </span>
            );
          })}
          {row.length === 1 && <span />}
        </div>
      ))}
    </div>
  );
}

// ===== عدّاد المات =====

export function MateCounter({ mate, onShow }: { mate: MateInfo; onShow?: () => void }) {
  return (
    <div className="mate-counter">
      <div>
        <div className="small muted">لديك مات إجباري</div>
        <div className="row" style={{ gap: 6 }}>
          <span className="n">{mate.mateIn}</span>
          <span>نقلة — أنهه بأقصر طريق</span>
        </div>
      </div>
      {onShow && (
        <button className="ghost" onClick={onShow}>
          أرني الطريق
        </button>
      )}
    </div>
  );
}

// ===== لوحة تفكير المحرك =====

export function EnginePanel({
  note,
  thinking,
  reason,
}: {
  note: string;
  thinking: boolean;
  reason?: string;
}) {
  return (
    <div className="panel">
      <h3>ماذا يفعل المحرك</h3>
      {thinking ? (
        <div className="thinking">
          <span className="pulse" />
          <span className="pulse" />
          <span className="pulse" />
          <span style={{ marginRight: 6 }}>يبحث عن تضحية…</span>
        </div>
      ) : (
        <div className="small">
          {reason && <span className="chip">{reason}</span>}
          <div style={{ marginTop: 6 }}>{note || 'في انتظار نقلتك.'}</div>
        </div>
      )}
    </div>
  );
}

// ===== لوحة التلميحات =====

export function HintPanel({ opportunity }: { opportunity: BrilliancyFinding }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    setLevel(0);
  }, [opportunity.move]);

  const square = opportunity.move.slice(0, 2);

  return (
    <div className="panel highlight">
      <h3>⚡ في هذا الموقف تضحية رائعة</h3>
      {level >= 1 && (
        <div className="hint-step">
          هناك تضحية بـ{opportunity.sacrificedNameAr ?? 'قطعة'} تقلب الموقف.
        </div>
      )}
      {level >= 2 && (
        <div className="hint-step">
          القطعة التي تتحرك تقف على <San>{square}</San>.
        </div>
      )}
      {level >= 3 && (
        <div className="hint-step">
          النقلة هي <San>{opportunity.san}</San>
          {opportunity.mateIn ? ` — وتؤدي إلى مات في ${opportunity.mateIn}.` : '.'}
          <div className="small muted" style={{ marginTop: 4 }}>
            <San>{opportunity.pvSan.join(' ')}</San>
          </div>
        </div>
      )}
      <button className="ghost" onClick={() => setLevel((l) => Math.min(3, l + 1))} disabled={level >= 3}>
        {level === 0 ? 'تلميح' : level >= 3 ? 'انكشفت النقلة' : 'تلميح أوضح'}
      </button>
    </div>
  );
}

// ===== وميض البريليانت =====

export function BrilliantFlash({
  title,
  move,
  finding,
  deception,
  note,
  kind,
  onClose,
}: {
  title: string;
  move: string;
  finding: BrilliancyFinding | null;
  deception: DeceptionMeasure | null;
  note: string;
  kind: string;
  onClose: () => void;
}) {
  const explanation = finding ? explainBrilliancy(finding, deception) : null;
  const accent =
    kind === 'alien'
      ? 'var(--alien)'
      : kind === 'engine-decisive'
        ? 'var(--accent)'
        : 'var(--brilliant)';
  const icon = kind === 'alien' ? '👽 ' : kind === 'engine-decisive' ? '⚔ ' : '⚡ ';

  return (
    <div className="brilliant-flash" onClick={onClose}>
      <div
        className="brilliant-card"
        style={{ borderColor: accent }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="title" style={{ color: accent }}>
          {icon}
          {title}
        </div>
        <div className="move">
          <San>{move}</San>
        </div>

        {explanation ? (
          <>
            <div>
              {explanation.motifs.map((motif) => (
                <span className="chip motif" key={motif}>
                  {motif}
                </span>
              ))}
            </div>
            <ul style={{ paddingRight: 18, margin: '12px 0 0' }}>
              {explanation.points.map((point, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {point}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="lines">{note}</div>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="primary" onClick={onClose}>
            فهمت — أكمل
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== منحنى التقييم =====

export function EvalGraph({
  curve,
  activePly,
  onSelect,
}: {
  curve: { ply: number; cp: number }[];
  activePly: number | null;
  onSelect?: (ply: number) => void;
}) {
  if (curve.length === 0) return null;
  const width = 100;
  const height = 40;
  const maxCp = 1000;

  const points = curve.map((point, i) => {
    const x = (i / Math.max(1, curve.length - 1)) * width;
    const clamped = Math.max(-maxCp, Math.min(maxCp, point.cp));
    const y = height / 2 - (clamped / maxCp) * (height / 2);
    return { x, y, ply: point.ply };
  });

  const area = `M0,${height / 2} ` + points.map((p) => `L${p.x},${p.y}`).join(' ') + ` L${width},${height / 2} Z`;

  return (
    <svg
      className="eval-graph"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onClick={(event) => {
        if (!onSelect) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const index = Math.round(ratio * (curve.length - 1));
        onSelect(curve[Math.max(0, Math.min(curve.length - 1, index))].ply);
      }}
    >
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#3a322d" strokeWidth="0.4" />
      <path d={area} fill="rgba(236,229,220,0.16)" />
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#ece5dc"
        strokeWidth="0.7"
      />
      {activePly !== null &&
        points[activePly] !== undefined && (
          <line
            x1={points[activePly].x}
            y1="0"
            x2={points[activePly].x}
            y2={height}
            stroke="var(--accent)"
            strokeWidth="0.6"
          />
        )}
    </svg>
  );
}

// ===== لوحة القبول والرفض =====

export function AcceptDeclinePanel({ finding }: { finding: BrilliancyFinding }) {
  if (!finding.acceptSan && !finding.declineSan) return null;

  return (
    <div className="panel">
      <h3>ماذا لو قبلتَ التضحية؟</h3>
      <div className="compare-grid">
        <div className="compare-cell accept">
          <div className="small muted">لو قبلت</div>
          <div style={{ fontWeight: 700, margin: '2px 0 6px' }}>
            <San>{finding.acceptSan ?? '—'}</San>
            {finding.acceptScore && (
              <span className="muted small" style={{ marginRight: 8 }}>
                {formatScore(finding.acceptScore)}
              </span>
            )}
          </div>
          <div className="small">
            <San>{finding.acceptLine.join(' ') || '—'}</San>
          </div>
        </div>
        <div className="compare-cell decline">
          <div className="small muted">لو رفضت</div>
          <div style={{ fontWeight: 700, margin: '2px 0 6px' }}>
            <San>{finding.declineSan ?? '—'}</San>
            {finding.declineScore && (
              <span className="muted small" style={{ marginRight: 8 }}>
                {formatScore(finding.declineScore)}
              </span>
            )}
          </div>
          <div className="small">
            <San>{finding.declineLine.join(' ') || '—'}</San>
          </div>
        </div>
      </div>
      {finding.trapWp > 0 && (
        <div className="small muted" style={{ marginTop: 10 }}>
          ثمن الطمع: {finding.trapWp.toFixed(0)} نقطة احتمال فوز.
        </div>
      )}
    </div>
  );
}

export function GradeChip({ grade }: { grade: MoveGrade }) {
  const style = GRADE_STYLE[grade];
  return (
    <span className="chip" style={{ borderColor: style.color, color: style.color }}>
      {style.ar} {style.symbol}
    </span>
  );
}

export { scoreToCp };
