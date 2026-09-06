/**
 * مجمّع المحركات.
 *
 * نشغّل نسختين منفصلتين عمدًا:
 *  - "اللاعب": يفكّر في نقلة المحرك (بحث ثقيل يستغرق ثوانٍ).
 *  - "المحلّل": يصنّف نقلاتك ويبحث عن المات في الخلفية.
 * لو تشاركتا نسخة واحدة لتجمّدت الواجهة عند كل نقلة، أو لانتظر التصنيف
 * دوره خلف بحث المحرك فيصل متأخرًا بعد أن تكون قد لعبت نقلتين.
 */
import { createBrowserEngine, type UciEngine } from './engine';

let playerEnginePromise: Promise<UciEngine> | null = null;
let analystPromise: Promise<UciEngine> | null = null;

export function getPlayEngine(): Promise<UciEngine> {
  if (!playerEnginePromise) {
    playerEnginePromise = createBrowserEngine({ multipv: 6, threads: 3 });
  }
  return playerEnginePromise;
}

export function getAnalyst(): Promise<UciEngine> {
  if (!analystPromise) {
    analystPromise = createBrowserEngine({ multipv: 6, threads: 2 });
  }
  return analystPromise;
}

/** يُقلع المحركين معًا مع تقرير تقدّم — تُستدعى مرة عند فتح الموقع. */
export async function warmUpEngines(
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<void> {
  onProgress?.(0, 2, 'تحميل محرك اللعب…');
  await getPlayEngine();
  onProgress?.(1, 2, 'تحميل محرك التحليل…');
  await getAnalyst();
  onProgress?.(2, 2, 'جاهز');
}

export async function resetEnginesForNewGame(): Promise<void> {
  const [play, analyst] = await Promise.all([getPlayEngine(), getAnalyst()]);
  await Promise.all([play.newGame(), analyst.newGame()]);
}
