import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * ترويسات COOP/COEP إلزامية لتفعيل SharedArrayBuffer الذي يحتاجه
 * Stockfish متعدد الخيوط. بدونها يسقط التطبيق تلقائيًا للنسخة أحادية الخيط.
 *
 * بعض بيئات المعاينة المضمّنة (iframe) لا تستطيع عرض صفحة معزولة، لذلك
 * يمكن إيقاف العزل مؤقتًا بـ NO_COI=1 — للفحص البصري فقط لا للاستخدام.
 */
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

const headers = process.env.NO_COI === '1' ? undefined : crossOriginIsolation;

export default defineConfig({
  plugins: [react()],
  server: { headers, port: 5180, strictPort: false },
  preview: { headers, port: 5181 },
  // ملفات المحرك ضخمة ولا يجب أن يلمسها الـ bundler
  optimizeDeps: { exclude: ['stockfish'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
