#!/usr/bin/env node
// Launcher do modo dev sem dependências: sobe a API (8787) e o Vite (5173) e repassa a saída.
// (o script `dev` original usava `concurrently`, que não é necessário.)
// Se a porta já estiver ocupada, o núcleo correspondente é pulado — assim dá para deixar a API
// rodando em outro processo (ou o preview do editor segurando a porta) sem o dev morrer.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync } from 'node:fs';

let saindo = false;
const procs = [];
const portaLivre = (porta) => new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(false));
  s.once('listening', () => s.close(() => res(true)));
  s.listen(porta, '0.0.0.0');
});

const cores = [
  ['api', 8787, 'node', ['--disable-warning=ExperimentalWarning', 'server/index.js', ...(existsSync('dist/index.html') ? ['--serve-static'] : [])]],
  ['web', 5173, process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173']],
];

const pinta = (nome, cor, chunk) => process.stdout.write(`\x1b[${cor}m[${nome}]\x1b[0m ${String(chunk).replace(/\n(?!$)/g, `\n\x1b[${cor}m[${nome}]\x1b[0m `)}`);
const fecha = (code = 0) => { saindo = true; for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* já morreu */ } } setTimeout(() => process.exit(code), 200); };
process.on('SIGINT', () => fecha()); process.on('SIGTERM', () => fecha());

for (const [nome, porta, cmd, args] of cores) {
  if (!(await portaLivre(porta))) {
    pinta(nome, '33', `porta ${porta} já está em uso — usando o processo que já está no ar (não vou reiniciá-lo).\n`);
    continue;
  }
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  p.stdout.on('data', (c) => pinta(nome, '36', c));
  p.stderr.on('data', (c) => pinta(nome, '35', c));
  p.on('exit', (code) => {
    if (saindo) return;
    // Vite morrendo é fatal; a API pode estar sendo parada por você à mão — não derruba o dev por isso.
    const fatal = nome === 'web' && code !== 0 && code !== null;
    console.log(`\n[${nome}] terminou (código ${code})${fatal ? ' — encerrando o dev.' : ' — o outro núcleo continua.'}`);
    if (fatal) fecha(code || 1);
  });
  procs.push(p);
}

console.log('\x1b[1mSmartFit Science\x1b[0m · site (ao vivo, com HMR): \x1b[4mhttp://localhost:5173\x1b[0m · API: http://localhost:8787/api/health'
  + (existsSync('dist/index.html') ? '\n  → a porta 8787 também abre o site (build em dist/). Se você abriu 8787 e viu JSON, rode `npm run build` para atualizar o snapshot dela.' : '\n  → 8787 é só a API (JSON). O site está em 5173. Rode `npm run build` se quiser que 8787 também sirva o site.'));
if (!procs.length) { console.log('nada para subir (as duas portas estão ocupadas).'); fecha(0); }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* ok */ } } });
