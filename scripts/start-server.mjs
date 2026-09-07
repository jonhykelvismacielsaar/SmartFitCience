#!/usr/bin/env node
// Start "à prova de esquecimento" para PaaS (Render, Fly, Railway, Koyeb...):
//   1) se dist/ não existe, roda o build (evita o clássico "serviço no ar, mas 404 no site")
//   2) descobre se node:sqlite precisa de flag no Node instalado
//   3) sobe server/index.js --serve-static herdando PORT e o resto do ambiente
// Uso local:  npm start        ·    na nuvem: startCommand = node scripts/start-server.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const temBuild = existsSync('dist/index.html');
if (!temBuild) {
  console.log('[start] dist/index.html não existe — rodando `npm run build` antes de subir...');
  const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: process.env });
  if (b.status !== 0) {
    console.error('[start] o build falhou (código ' + b.status + '). Corrija e suba de novo — sem build eu não sirvo o site.');
    process.exit(b.status || 1);
  }
} else {
  console.log('[start] build encontrado em dist/ — servindo site + API pela mesma porta.');
}

// node:sqlite entrou no Node 22.5 e ficou sem flag nas séries novas; em 22.5–22.x antigos é experimental.
const teste = spawnSync(process.execPath, ['-e', "require('node:sqlite')"], { encoding: 'utf8' });
const flags = teste.status === 0 ? [] : ['--experimental-sqlite'];
if (flags.length) console.log('[start] Node ' + process.version + ' exige --experimental-sqlite para o SQLite embutido.');
if (teste.status !== 0 && !String(teste.stderr || '').includes('experimental')) {
  console.error('[start] atenção: node:sqlite não está disponível neste Node (' + process.version + '). Precisa de Node >= 22.5.');
}

const filho = spawn(process.execPath, [...flags, '--disable-warning=ExperimentalWarning', 'server/index.js', '--serve-static'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '8787' },
});
const passa = (sig) => { try { filho.kill(sig); } catch { /* já era */ } };
process.on('SIGTERM', () => passa('SIGTERM'));
process.on('SIGINT', () => passa('SIGINT'));
filho.on('exit', (code, signal) => process.exit(signal ? 0 : code ?? 0));
