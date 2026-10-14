// @ts-check
import { defineConfig } from 'astro/config';

// One constant to switch when the domain moves to floorlogic.app.
export const SITE_URL = 'https://floorlogic.vercel.app';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
