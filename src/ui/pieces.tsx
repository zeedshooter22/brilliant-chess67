/**
 * قطع الشطرنج.
 *
 * كانت الرقعة تستخدم رموز Unicode (♚♛♜) وهي تُرسم بأشكال مختلفة جذريًا بين
 * الخطوط وأنظمة التشغيل، فتبدو مسطّحة ومتفاوتة. هذه مجموعة SVG مرسومة بأسلوب
 * ستاونتون الكلاسيكي: الأبيض مفرّغ بحدّ داكن، والأسود مصمت — نفس المنطق البصري
 * الذي تعتمده مجموعات الشطرنج المعروفة، ويُرسم بدقة متطابقة في كل متصفح.
 */

export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type PieceColor = 'w' | 'b';

/**
 * كل قطعة مرسومة داخل مربع 45×45 (نفس شبكة مجموعات الشطرنج القياسية)
 * حتى تتناسب أحجامها النسبية تلقائيًا.
 */
const PATHS: Record<PieceType, string> = {
  k:
    'M 22.5,7 L 22.5,4 M 20,5.5 L 25,5.5 ' +
    'M 22.5,7 C 20.5,10 20.5,12 22.5,14.5 C 24.5,12 24.5,10 22.5,7 z ' +
    'M 22.5,14.5 C 17,10.5 10.5,13 10.5,19 C 10.5,25 16,28 22.5,36 ' +
    'C 29,28 34.5,25 34.5,19 C 34.5,13 28,10.5 22.5,14.5 z ' +
    'M 11.5,30 C 17,27 28,27 33.5,30 M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5 ' +
    'M 11.5,37 C 17,34 28,34 33.5,37',
  q:
    'M 9,26 C 17.5,24.5 27.5,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 ' +
    'L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z ' +
    'M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 ' +
    'C 10.5,34.5 10.5,36 10.5,36 C 9,37.5 11,38.5 11,38.5 ' +
    'C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 ' +
    'C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 ' +
    'C 34.5,28 36,28 36,26 z ' +
    'M 11.5,30 C 15,29 30,29 33.5,30 M 12,33.5 C 18,32.5 27,32.5 33,33.5',
  r:
    'M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z ' +
    'M 12.5,32 L 14,29.5 L 31,29.5 L 32.5,32 L 12.5,32 z ' +
    'M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z ' +
    'M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z ' +
    'M 14,16.5 L 11,14 L 34,14 L 31,16.5 L 14,16.5 z ' +
    'M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 ' +
    'L 30,9 L 34,9 L 34,14 L 11,14 z',
  b:
    'M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 ' +
    'C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 ' +
    'C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 ' +
    'C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z ' +
    'M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 ' +
    'C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 ' +
    'C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z ' +
    'M 25,8 A 2.5,2.5 0 1,1 20,8 A 2.5,2.5 0 1,1 25,8 z ' +
    'M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18',
  n:
    'M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 ' +
    'M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 ' +
    'C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 ' +
    'C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 ' +
    'C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 ' +
    'C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10 z ' +
    'M 9.5,25.5 A 0.5,0.5 0 1,1 8.5,25.5 A 0.5,0.5 0 1,1 9.5,25.5 z ' +
    'M 15.3,15.5 A 0.5,1.5 0 1,1 14.3,15.5 A 0.5,1.5 0 1,1 15.3,15.5 z',
  p:
    'M 22.5,9 C 20.29,9 18.5,10.79 18.5,13 C 18.5,13.89 18.79,14.71 19.28,15.38 ' +
    'C 17.33,16.5 16,18.59 16,21 C 16,23.03 16.94,24.84 18.41,26.03 ' +
    'C 15.41,27.09 11,31.58 11,39.5 L 34,39.5 C 34,31.58 29.59,27.09 26.59,26.03 ' +
    'C 28.06,24.84 29,23.03 29,21 C 29,18.59 27.67,16.5 25.72,15.38 ' +
    'C 26.21,14.71 26.5,13.89 26.5,13 C 26.5,10.79 24.71,9 22.5,9 z',
};

export function Piece({ type, color }: { type: PieceType; color: PieceColor }) {
  const isWhite = color === 'w';
  return (
    <svg
      className="piece-svg"
      viewBox="0 0 45 45"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill={isWhite ? '#f7f4ee' : '#2b2724'}
        stroke={isWhite ? '#2b2724' : '#12100e'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={PATHS[type]} />
      </g>
    </svg>
  );
}

// ===== ألوان الرقعة =====

export interface BoardTheme {
  id: string;
  nameAr: string;
  light: string;
  dark: string;
  /** لون تظليل آخر نقلة */
  lightActive: string;
  darkActive: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'slate',
    nameAr: 'رمادي أزرق',
    light: '#dfe3e8',
    dark: '#7d8b99',
    lightActive: '#cdd7a8',
    darkActive: '#9aa878',
  },
  {
    id: 'wood',
    nameAr: 'خشبي',
    light: '#e8d5b7',
    dark: '#a97f57',
    lightActive: '#d6c67e',
    darkActive: '#b39a4a',
  },
  {
    id: 'green',
    nameAr: 'أخضر كلاسيكي',
    light: '#eeeed2',
    dark: '#769656',
    lightActive: '#f6f669',
    darkActive: '#baca2b',
  },
  {
    id: 'blue',
    nameAr: 'أزرق',
    light: '#dee3e6',
    dark: '#5b7fa6',
    lightActive: '#d3dd88',
    darkActive: '#8fa85c',
  },
  {
    id: 'night',
    nameAr: 'ليلي',
    light: '#6b6f76',
    dark: '#3a3d43',
    lightActive: '#7f7f52',
    darkActive: '#585a3c',
  },
];

export const DEFAULT_BOARD_THEME = BOARD_THEMES[0];

const THEME_KEY = 'brilliant-lab-board-theme';

export function loadBoardTheme(): BoardTheme {
  try {
    const id = localStorage.getItem(THEME_KEY);
    return BOARD_THEMES.find((theme) => theme.id === id) ?? DEFAULT_BOARD_THEME;
  } catch {
    return DEFAULT_BOARD_THEME;
  }
}

export function saveBoardTheme(theme: BoardTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* التخزين رفاهية */
  }
}

/** يطبّق ألوان الرقعة على متغيّرات CSS في جذر الصفحة. */
export function applyBoardTheme(theme: BoardTheme): void {
  const root = document.documentElement;
  root.style.setProperty('--board-light', theme.light);
  root.style.setProperty('--board-dark', theme.dark);
  root.style.setProperty('--board-light-active', theme.lightActive);
  root.style.setProperty('--board-dark-active', theme.darkActive);
}
