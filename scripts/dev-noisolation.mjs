/**
 * خادم تطوير بلا عزل مصدر (COOP/COEP) — للفحص البصري داخل لوحات المعاينة
 * المضمّنة التي لا تستطيع عرض صفحة معزولة.
 * المحرك هنا يعمل بخيط واحد؛ للأداء الكامل استخدم npm run dev.
 */
process.env.NO_COI = '1';
const { createServer } = await import('vite');
const server = await createServer({ configFile: 'vite.config.ts', server: { port: 5190 } });
await server.listen();
server.printUrls();
