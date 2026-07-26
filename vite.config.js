import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function viteSitemapPlugin({ hostname, routes }) {
  return {
    name: 'vite-plugin-generate-sitemap',
    apply: 'build',
    writeBundle(options) {
      const urls = routes.map((route) => {
        const normalized = route === '/' ? '' : route.replace(/\/+$|^\s+|\s+$/g, '');
        return `${hostname}${normalized}`;
      });

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((loc) => `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n') +
        `\n</urlset>\n`;

      const outputDir = path.resolve(process.cwd(), options.dir || 'dist');
      const sitemapPath = path.join(outputDir, 'sitemap.xml');
      fs.writeFileSync(sitemapPath, sitemap, 'utf-8');
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteSitemapPlugin({
      hostname: 'https://ledgr.name.ng',
      routes: ['/', '/dashboard', '/inventory', '/pnl', '/expenses', '/settings'],
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
