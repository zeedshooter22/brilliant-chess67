import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Ø§Ù„Ù…Ø­Ø±Ùƒ Ø¨Ø·ÙŠØ¡ Ø¨Ø·Ø¨ÙŠØ¹ØªÙ‡: ÙƒÙ„ Ø§Ø®ØªØ¨Ø§Ø± ÙŠØ´ØºÙ‘Ù„ Stockfish Ø­Ù‚ÙŠÙ‚ÙŠÙ‹Ø§
    testTimeout: 240000,
    hookTimeout: 240000,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
