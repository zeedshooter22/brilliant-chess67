import { useMemo, useState } from 'react';
import { Chess, parseUci, type Square } from '../game/chess';
import { Piece, type PieceType } from './pieces';
import type { MoveGrade } from '../engine/classify';
import { GRADE_STYLE } from '../engine/classify';

/**
 * رقعة مبنية من الصفر لا مكتبة جاهزة: نحتاج تحكمًا كاملًا في الأسهم
 * ووسام النقلة ووميض التضحية وتلميح المربع — وهذه أشياء تقاومها المكتبات.
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// القطع تُرسم بـSVG (src/ui/pieces.tsx) لا برموز Unicode — انظر التعليق هناك.

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
  width?: number;
}

export interface SquareBadge {
  square: string;
  grade: MoveGrade;
}

export interface BoardProps {
  fen: string;
  orientation: 'w' | 'b';
  /** آخر نقلة لُعبت — تُظلَّل مربعاها */
  lastMove?: { from: string; to: string } | null;
  /** هل يُسمح للاعب بالنقل الآن */
  interactive: boolean;
  onMove?: (uci: string) => void;
  arrows?: BoardArrow[];
  badge?: SquareBadge | null;
  /** مربعات مُلمَّحة (لوحة التلميحات) */
  highlights?: string[];
}

export function Board({
  fen,
  orientation,
  lastMove,
  interactive,
  onMove,
  arrows = [],
  badge = null,
  highlights = [],
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const board = useMemo(() => new Chess(fen), [fen]);
  const position = useMemo(() => {
    const map = new Map<string, { type: string; color: 'w' | 'b' }>();
    for (const row of board.board()) {
      for (const cell of row) {
        if (cell) map.set(cell.square, { type: cell.type, color: cell.color });
      }
    }
    return map;
  }, [board]);

  const legalFromSelected = useMemo(() => {
    if (!selected || !interactive) return [];
    try {
      return board.moves({ square: selected as Square, verbose: true });
    } catch {
      return [];
    }
  }, [board, selected, interactive]);

  const checkedKing = useMemo(() => {
    if (!board.inCheck()) return null;
    const turn = board.turn();
    for (const [square, piece] of position) {
      if (piece.type === 'k' && piece.color === turn) return square;
    }
    return null;
  }, [board, position]);

  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'w' ? RANKS : [...RANKS].reverse();

  function handleSquare(square: string) {
    if (!interactive) return;
    const piece = position.get(square);

    if (selected) {
      const target = legalFromSelected.find((m) => m.to === square);
      if (target) {
        // الترقية: نرقّي إلى وزير تلقائيًا — الترقية الصغرى نادرة ولها زر منفصل لاحقًا
        const promotion = target.promotion ? 'q' : '';
        onMove?.(`${selected}${square}${promotion}`);
        setSelected(null);
        return;
      }
      if (piece && piece.color === board.turn()) {
        setSelected(square);
        return;
      }
      setSelected(null);
      return;
    }

    if (piece && piece.color === board.turn()) setSelected(square);
  }

  /** إحداثيات مركز المربع بالنسبة المئوية — لرسم الأسهم */
  function centerOf(square: string): { x: number; y: number } {
    const fileIndex = files.indexOf(square[0]);
    const rankIndex = ranks.indexOf(square[1]);
    return { x: (fileIndex + 0.5) * 12.5, y: (rankIndex + 0.5) * 12.5 };
  }

  return (
    <div className="board-wrap">
      <div className="board">
        {ranks.map((rank, rankIndex) =>
          files.map((file, fileIndex) => {
            const square = `${file}${rank}`;
            const isLight = (fileIndex + rankIndex) % 2 === 0;
            const piece = position.get(square);
            const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
            const legal = legalFromSelected.find((m) => m.to === square);
            const classes = [
              'square',
              isLight ? 'light' : 'dark',
              isLast ? 'last-move' : '',
              selected === square ? 'selected' : '',
              checkedKing === square ? 'check' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={square}
                className={classes}
                onClick={() => handleSquare(square)}
                role="button"
                tabIndex={-1}
                aria-label={square}
              >
                {fileIndex === 0 && <span className="coord rank">{rank}</span>}
                {rankIndex === 7 && <span className="coord file">{file}</span>}

                {highlights.includes(square) && (
                  <span
                    className="ring"
                    style={{ borderColor: 'rgba(217,164,65,0.85)' }}
                  />
                )}

                {piece && (
                  <span className="piece">
                    <Piece type={piece.type as PieceType} color={piece.color} />
                  </span>
                )}

                {legal && (piece ? <span className="ring" /> : <span className="dot" />)}

                {badge?.square === square && (
                  <span
                    className="badge"
                    style={{ background: GRADE_STYLE[badge.grade].color }}
                    title={GRADE_STYLE[badge.grade].ar}
                  >
                    {GRADE_STYLE[badge.grade].symbol || '★'}
                  </span>
                )}
              </div>
            );
          }),
        )}

        {arrows.length > 0 && (
          <svg className="board-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              {arrows.map((arrow, i) => (
                <marker
                  key={i}
                  id={`head-${i}`}
                  markerWidth="4"
                  markerHeight="4"
                  refX="2.4"
                  refY="2"
                  orient="auto"
                >
                  <path d="M0,0 L4,2 L0,4 z" fill={arrow.color} />
                </marker>
              ))}
            </defs>
            {arrows.map((arrow, i) => {
              const from = centerOf(arrow.from);
              const to = centerOf(arrow.to);
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={arrow.color}
                  strokeWidth={arrow.width ?? 1.6}
                  strokeLinecap="round"
                  opacity="0.85"
                  markerEnd={`url(#head-${i})`}
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

/** يحوّل نقلة UCI إلى مربعَي بداية ونهاية للتظليل. */
export function movePairOf(uci: string | null | undefined): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  const parsed = parseUci(uci);
  return { from: parsed.from, to: parsed.to };
}
