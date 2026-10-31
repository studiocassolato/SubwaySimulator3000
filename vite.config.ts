import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// ogni build ha un identificativo: il gioco lo confronta con version.json per sapere se c'è un aggiornamento
const BUILD_ID = new Date().toISOString();
const changelog = JSON.parse(readFileSync(new URL('./changelog.json', import.meta.url), 'utf8')) as { date: string; notes: string[] }[];

// base relativa: funziona sia in locale sia su GitHub Pages
export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __CHANGELOG__: JSON.stringify(changelog[0]?.notes ?? []),
  },
  plugins: [
    {
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ id: BUILD_ID, notes: changelog[0]?.notes ?? [] }),
        });
      },
    },
  ],
});
