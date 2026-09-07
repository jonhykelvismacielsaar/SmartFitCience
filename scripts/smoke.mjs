// Smoke test de render: passa os 8 views + onboarding por react-dom/server com um perfil falso.
// Não substitui teste de unidade — pega o que o TypeScript não vê: prop inexistente virando
// "undefined is not a function", DB.auditoria.x yto, fmt com objeto no lugar de número etc.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';

const out = new URL('../.cache-smoke/smoke-entry.mjs', import.meta.url).pathname;
await build({
  entryPoints: ['scripts/smoke-entry.tsx'],
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic',
  outfile: out, logLevel: 'error', absWorkingDir: process.cwd(),
  loader: { '.json': 'json' },
  external: ['react', 'react-dom', 'react-dom/server'],
});
let code = 0;
try {
  await import(pathToFileURL(out).href + '?t=' + Date.now());
} catch (err) {
  console.error('smoke falhou:', err && err.message ? err.message : err);
  code = 1;
}
await rm(new URL('../.cache-smoke', import.meta.url).pathname, { recursive: true, force: true });
if (code) process.exit(code);
