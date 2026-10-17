import next from 'next';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';

console.log('🚀 Preparing Newtonite OpsPulse Next.js server...');

const app = next({
  dev,
  dir: rootDir,
  conf: {
    serverExternalPackages: ['better-sqlite3'],
  },
});

const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  server.listen(port, (err) => {
    if (err) {
      console.error('Failed to bind port:', err);
      process.exit(1);
    }
    console.log(`✅ Newtonite OpsPulse is LIVE at http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Next.js prepare error:', err);
  process.exit(1);
});
