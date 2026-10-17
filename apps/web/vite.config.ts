import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { getServerUrl } from './src/server-url.js';

export default defineConfig(({ command, mode }) => {
  const development = command === 'serve';
  const environmentDirectory = fileURLToPath(new URL('../../', import.meta.url));
  const environment = loadEnv(mode, environmentDirectory, 'VITE_');
  const server = getServerUrl(environment['VITE_NEXUS_SERVER_URL'], development);
  const connectionOrigins = ["'self'", ...(server ? [server.origin] : []), ...(development ? ['ws://127.0.0.1:5173'] : [])];
  const policy = [
    "default-src 'none'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectionOrigins.join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');

  return {
    root: fileURLToPath(new URL('./', import.meta.url)),
    envDir: environmentDirectory,
    base: './',
    plugins: [
      react(),
      {
        name: 'nexus-content-security-policy',
        transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' as const }],
      },
    ],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { target: 'es2022', sourcemap: false },
  };
});
