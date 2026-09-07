// SmartFit Science — API local (Node >= 22.5, zero dependências).
// Persistência: node:sqlite. Uploads: ./server/uploads. Sem chaves, sem nuvem.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, '.data');
const UPLOAD_DIR = join(ROOT, 'server', 'uploads');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

// Serve o build estático automaticamente se dist/ existir — assim a porta da API (8787) também
// abre o site completo, e não só JSON. `--no-static` força o modo "só API" (usado no dev com Vite).
const SERVE_STATIC = !process.argv.includes('--no-static') &&
  (process.argv.includes('--serve-static') || existsSync(join(ROOT, 'dist', 'index.html')));
const PORT = Number(process.env.PORT || 8787);
const SECRET_FILE = join(DATA_DIR, 'secret.key');
if (!existsSync(SECRET_FILE)) writeFileSync(SECRET_FILE, randomUUID() + randomUUID());
const SECRET = process.env.SF_SECRET || readFileSync(SECRET_FILE, 'utf8').trim();

const db = new DatabaseSync(join(DATA_DIR, 'smartfit.db'));
db.exec(`
pragma journal_mode = wal;
create table if not exists users(
  id text primary key, handle text unique not null, email text unique not null,
  name text not null, pass text, salt text, created_at integer not null,
  is_demo integer default 0
);
create table if not exists tokens(user_id text primary key, exp integer not null);
create table if not exists states(user_id text primary key, json text not null, updated_at integer);
create table if not exists posts(
  id text primary key, user_id text not null, kind text not null, text text,
  photo text, diet text, level integer default 1, xp integer default 0,
  streak integer default 0, tags text, likes integer default 0, created_at integer not null,
  parent text
);
create table if not exists reactions(post_id text not null, user_id text not null, kind text default 'like',
  created_at integer not null, primary key(post_id, user_id));
create table if not exists follows(a text not null, b text not null, created_at integer, primary key(a,b));
create table if not exists lit_cache(key text primary key, json text not null, created_at integer);
create index if not exists posts_created on posts(created_at desc);
`);

// ---------------------------------------------------------------- utilidades
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
};
const readBody = (req, limit = 25 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload muito grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(Buffer.concat(chunks)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
const parseJson = async (req) => {
  const raw = await readBody(req);
  if (!raw) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { return {}; }
};
const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hashPass = (pass, salt = randomUUID().slice(0, 8)) => ({ salt, pass: scryptSync(pass, salt, 32).toString('hex') });
const checkPass = (pass, salt, want) => {
  const got = scryptSync(pass, salt, 32); const exp = Buffer.from(want, 'hex');
  return got.length === exp.length && timingSafeEqual(got, exp);
};
const sign = (uid) => {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
  const sig = createHmac('sha256', SECRET).update(`${uid}.${exp}`).digest('base64url');
  return `${uid}.${exp}.${sig}`;
};
const verify = (token) => {
  if (!token) return null;
  const [uid, exp, sig] = String(token).split('.');
  if (!uid || !exp || !sig) return null;
  const want = createHmac('sha256', SECRET).update(`${uid}.${exp}`).digest('base64url');
  if (want !== sig || Number(exp) < Date.now()) return null;
  const row = db.prepare('select * from users where id = ?').get(uid);
  return row || null;
};
const userPublic = (u) => {
  if (!u) return null;
  const st = db.prepare('select json from states where user_id = ?').get(u.id);
  let view = {};
  try { view = st ? JSON.parse(st.json)._public || {} : {}; } catch { view = {}; }
  return {
    id: u.id, handle: u.handle, name: u.name, isDemo: !!u.is_demo,
    diet: view.diet || 'indefinido', level: view.level || 1, xp: view.xp || 0,
    streak: view.streak || 0, clan: view.clan || null, bio: view.bio || '',
    goals: view.goals || [], badges: view.badges || [], joinedAt: u.created_at,
  };
};

// ------------------------------------------------------------------ seed demo
function seed() {
  const n = db.prepare('select count(*) c from users').get().c;
  if (n > 0) return;
  const demo = [
    ['Marina Rocha', 'marina', 'lacto_ovo', 6, 4210, 21, 'clan_verde', 'Nutricionista em transição de carreira. Treino às 6h, feijão todo dia.'],
    ['Caio Vieira', 'caio', 'veg', 8, 11840, 64, 'clan_ferro', 'Vegano há 5 anos. 1RM no terra 160 kg e ferritina vigiada.'],
    ['Bia Fontes', 'bia', 'omni', 4, 2680, 9, 'clan_mental', 'Corrida de rua + musculação. Aprendi a dormir para render.'],
    ['Thiago Salles', 'thiago', 'ovo', 5, 5120, 33, 'clan_verde', 'Ovo-vegetariano por ética. Aveia, soja, creatina, B12.'],
    ['Dandara Luz', 'dandara', 'lacto', 7, 7390, 45, 'clan_ferro', 'Cross-training e laticínios. Fase de força.'],
    ['Rafa Kimura', 'rafa', 'pesc', 3, 1520, 12, 'clan_mental', 'Pescetariana, mestrado em saúde pública. Fibra 32g/dia.'],
    ['Lucas Prado', 'lucas', 'veg', 2, 890, 5, 'clan_verde', 'Novato na transição vegana, calibrando proteína.'],
    ['Juliana K.', 'ju', 'omni', 9, 21400, 128, 'clan_ferro', '54 anos, menopausa, 1,6 g/kg de proteína e prancha de 2 min.'],
    ['Pedro Nunes', 'pedro', 'lacto_ovo', 5, 4740, 27, 'clan_mental', 'Engenheiro, treino 4x, meta de passos 9k.'],
    ['Aline Costa', 'aline', 'veg', 6, 6010, 38, 'clan_verde', 'Vegana + gestação planejada: iodo, DHA de alga, B12.'],
    ['Vitor Hugo', 'vitor', 'omni', 1, 310, 3, 'clan_mental', 'Sedentário em recuperação. Comecei com caminhada de 15 min.'],
    ['Sofia Marques', 'sofia', 'ovo', 4, 3050, 16, 'clan_ferro', 'Ovo-vegetariana, escalada 2x/semana.'],
  ];
  const ins = db.prepare('insert into users(id,handle,email,name,pass,salt,created_at,is_demo) values (?,?,?,?,?,?,?,1)');
  const insSt = db.prepare('insert into states(user_id,json,updated_at) values (?,?,?)');
  const insPost = db.prepare('insert into posts(id,user_id,kind,text,photo,diet,level,xp,streak,tags,likes,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)');
  const texts = {
    lacto_ovo: ['12 dias seguidos batendo proteína. Adicionei iogurte grego no lanche da noite e a fome noturna sumiu.', 'Refeição de resgate pré-treino: pão integral + pasta de amendoim + banana. 26 g de proteína, R$ 3.', 'Ferritina saiu de 18 para 41 em 5 meses: feijão de molho 12 h + limão na refeição, café longe. Sem suplemento de ferro.'],
    veg: ['Vegano há 5 anos treinando forte: os três pontos são B12, creatina e cálcio. Exame anual não é frescura.', '1RM do terra voltou a subir depois que aumentei o descanso para 3 min nos compostos.', 'Densidade energética é o desafio real de quem cresce sem carne: adicionei azeite em vez de viver de arroz com alface.'],
    omni: ['Cortei o embutido do café da manhã e aumentei a fibra para 30 g. Pressão sistólica: 132 → 121.', 'Treino de 40 min, caminhada de 20 no almoço e 7 h de sono. Foi o suficiente para destravar o platô.', 'Aprendi que quem patrocina muda a conclusão: li o caso Coca-Cola no módulo de auditoria.'],
    ovo: ['Transição sem frango: ovo + soja + lentilha fecharam meus 1,8 g/kg.', 'Meu recorde de flexão: 34 em 60 s. Chefe do mês 2 vencido.', 'Coloquei iodo (sal iodado) na lista. Veganos: checquem a tireoide e o iodo, não só a B12.'],
    lacto: ['Musculação 2x + caminhada 5x por semana. Sem pressa, mas sem parar.', 'Cálcio de fonte vegetal funcionou melhor no meu intestino que o suplemento.', 'Queijo 3x/semana, não 7. Saturada abaixo de 10% e o LDL caiu 12 pontos.'],
    pesc: ['Salmão 2x/semana resolveu meu ômega-3 sem cápsula.', 'Meta de 7 000 passos em vez de 10 000 — e finalmente bati a meta por 30 dias.', 'Achei o filtro de conflito de interesses genial. Me fez deletar dois suplementos do carrinho.'],
  };
  const now = Date.now();
  demo.forEach(([name, handle, diet, level, xp, streak, clan, bio], i) => {
    const id = 'demo-' + handle;
    ins.run(id, handle, handle + '@smartfit.local', name, null, null, now - i * 86400000 * 9);
    insSt.run(id, JSON.stringify({ _public: { diet, level, xp, streak, clan, bio, goals: ['força', 'aderência', 'sono'].slice(0, ((i % 3) + 1)) } }), now - i * 1000);
    const pool = texts[diet] || texts.omni;
    const count = 2 + (i % 2);
    for (let k = 0; k < count; k++) {
      insPost.run(randomUUID(), id, ['checkin', 'refeicao', 'treino', 'vitoria'][(i + k) % 4],
        pool[(k + i) % pool.length], null, diet, level, xp - k * 40, streak - k * 3,
        JSON.stringify(['força', 'veg', 'aderência', 'sono'].slice(0, (k % 3) + 1)),
        3 + ((i * 7 + k * 13) % 41), now - (i * 4 + k) * 3600 * 1000 * 7);
    }
  });
}
seed();

// ----------------------------------------------------------------- handlers
const routes = {};
const on = (method, path, fn) => { routes[method + ' ' + path] = fn; };

on('GET', '/api/health', async (req, res) => json(res, 200, { ok: true, t: Date.now(), users: db.prepare('select count(*) c from users').get().c }));

on('POST', '/api/register', async (req, res) => {
  const b = await parseJson(req);
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim().slice(0, 60) || 'Novo atleta';
  const pass = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'e-mail inválido' });
  if (pass.length < 8) return json(res, 400, { error: 'senha precisa de 8+ caracteres' });
  if (db.prepare('select 1 from users where email=?').get(email)) return json(res, 409, { error: 'e-mail já cadastrado' });
  let handle = slug(name).slice(0, 22) || 'atleta'; let i = 0;
  while (db.prepare('select 1 from users where handle=?').get(handle)) handle = (slug(name).slice(0, 18) || 'atleta') + (++i);
  const { salt, pass: ph } = hashPass(pass);
  const id = randomUUID();
  db.prepare('insert into users(id,handle,email,name,pass,salt,created_at) values (?,?,?,?,?,?,?)').run(id, handle, email, name, ph, salt, Date.now());
  db.prepare('insert into states(user_id,json,updated_at) values (?,?,?)').run(id, JSON.stringify({ _public: {} }), Date.now());
  json(res, 201, { token: sign(id), user: userPublic(db.prepare('select * from users where id=?').get(id)) });
});

on('POST', '/api/login', async (req, res) => {
  const b = await parseJson(req);
  const u = db.prepare('select * from users where email=?').get(String(b.email || '').trim().toLowerCase());
  if (!u || !u.pass || !checkPass(String(b.password || ''), u.salt, u.pass)) return json(res, 401, { error: 'credenciais inválidas' });
  json(res, 200, { token: sign(u.id), user: userPublic(u) });
});

const auth = (req) => {
  const h = req.headers.authorization || '';
  return verify(h.startsWith('Bearer ') ? h.slice(7) : null);
};

on('GET', '/api/me', async (req, res) => {
  const u = auth(req); if (!u) return json(res, 401, { error: 'não autenticado' });
  json(res, 200, { user: userPublic(u) });
});

on('PUT', '/api/state', async (req, res) => {
  const u = auth(req); if (!u) return json(res, 401, { error: 'não autenticado' });
  const b = await parseJson(req);
  if (typeof b !== 'object') return json(res, 400, { error: 'estado inválido' });
  db.prepare('insert into states(user_id,json,updated_at) values (?,?,?) on conflict(user_id) do update set json=excluded.json, updated_at=excluded.updated_at')
    .run(u.id, JSON.stringify(b), Date.now());
  json(res, 200, { ok: true, at: Date.now() });
});

on('GET', '/api/state', async (req, res) => {
  const u = auth(req); if (!u) return json(res, 401, { error: 'não autenticado' });
  const st = db.prepare('select json,updated_at from states where user_id=?').get(u.id);
  json(res, 200, st ? { state: JSON.parse(st.json), updatedAt: st.updated_at } : { state: null });
});

on('GET', '/api/feed', async (req, res, url) => {
  const me = auth(req);
  const clan = url.searchParams.get('clan'); const diet = url.searchParams.get('diet');
  const limit = Math.min(Number(url.searchParams.get('limit') || 30), 80);
  const rows = db.prepare('select p.*, u.handle, u.name, s.json st from posts p join users u on u.id=p.user_id left join states s on s.user_id=u.id order by p.created_at desc limit 400').all();
  const mine = me ? new Set(db.prepare('select post_id from reactions where user_id=?').all(me.id).map((r) => r.post_id)) : new Set();
  const pubOf = (r) => { try { return JSON.parse(r.st || '{}')._public || {}; } catch { return {}; } };
  const out = rows
    .filter((r) => (!clan || pubOf(r).clan === clan) && (!diet || r.diet === diet))
    .slice(0, limit)
    .map((r) => ({
      id: r.id, kind: r.kind, text: r.text, photo: r.photo, diet: r.diet, level: r.level, xp: r.xp,
      streak: r.streak, tags: JSON.parse(r.tags || '[]'), likes: r.likes, liked: mine.has(r.id),
      createdAt: r.created_at, author: { handle: r.handle, name: r.name }, clan: pubOf(r).clan || null,
    }));
  json(res, 200, { posts: out });
});

on('POST', '/api/posts', async (req, res) => {
  const u = auth(req); if (!u) return json(res, 401, { error: 'não autenticado' });
  const b = await parseJson(req);
  const text = String(b.text || '').slice(0, 900);
  if (!text && !b.photo) return json(res, 400, { error: 'nada para publicar' });
  const id = randomUUID();
  db.prepare('insert into posts(id,user_id,kind,text,photo,diet,level,xp,streak,tags,likes,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, u.id, ['checkin', 'refeicao', 'treino', 'vitoria', 'duvida'].includes(b.kind) ? b.kind : 'checkin', text,
      b.photo || null, b.diet || null, b.level || 1, b.xp || 0, b.streak || 0, JSON.stringify((b.tags || []).slice(0, 6)), 0, Date.now());
  json(res, 201, { id });
});

on('POST', '/api/posts/react', async (req, res) => {
  const u = auth(req); if (!u) return json(res, 401, { error: 'não autenticado' });
  const b = await parseJson(req);
  const seen = db.prepare('select 1 from reactions where post_id=? and user_id=?').get(b.postId, u.id);
  if (seen) {
    db.prepare('delete from reactions where post_id=? and user_id=?').run(b.postId, u.id);
    db.prepare('update posts set likes = max(0, likes-1) where id=?').run(b.postId);
  } else {
    db.prepare('insert into reactions(post_id,user_id,created_at) values (?,?,?)').run(b.postId, u.id, Date.now());
    db.prepare('update posts set likes = likes+1 where id=?').run(b.postId);
  }
  const row = db.prepare('select likes from posts where id=?').get(b.postId);
  json(res, 200, { likes: row ? row.likes : 0, liked: !seen });
});

on('GET', '/api/leaderboard', async (req, res) => {
  const rows = db.prepare('select u.id,u.handle,u.name,u.created_at,s.json j from users u left join states s on s.user_id=u.id order by json_extract(s.json, \'$._public.xp\') desc limit 50').all();
  json(res, 200, { rows: rows.map((r) => { let p = {}; try { p = JSON.parse(r.j)._public || {}; } catch { } return { handle: r.handle, name: r.name, ...p }; }) });
});

on('GET', '/api/users', async (req, res, url) => {
  const h = url.searchParams.get('handle');
  const u = h ? db.prepare('select * from users where handle=?').get(h) : null;
  if (!u) return json(res, 404, { error: 'usuário não encontrado' });
  const posts = db.prepare('select * from posts where user_id=? order by created_at desc limit 20').all(u.id)
    .map((p) => ({ ...p, tags: JSON.parse(p.tags || '[]') }));
  json(res, 200, { user: userPublic(u), posts });
});

on('POST', '/api/media', async (req, res) => {
  const u = auth(req); if (!u) return json(res, 401, { error: 'não autenticado' });
  const raw = await readBody(req, 8 * 1024 * 1024);
  if (!raw) return json(res, 400, { error: 'sem dados' });
  const ct = req.headers['content-type'] || '';
  const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : 'jpg';
  const id = randomUUID() + '.' + ext;
  writeFileSync(join(UPLOAD_DIR, id), raw);
  json(res, 201, { id, url: '/media/' + id });
});

on('POST', '/api/lit', async (req, res) => {
  // busca proxy de literatura (funciona quando há saída de rede no servidor;
  // o cliente cai para fetch direto do navegador quando falha)
  const b = await parseJson(req);
  const q = String(b.q || '').slice(0, 120);
  if (!q) return json(res, 400, { error: 'falta a busca' });
  const key = 'oa:' + q;
  const cached = db.prepare('select json from lit_cache where key=?').get(key);
  if (cached && Date.now() - (cached.created_at || 0) < 1000 * 60 * 60 * 6) return json(res, 200, JSON.parse(cached.json));
  try {
    const u = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) + '&per-page=40&select=id,title,display_name,publication_year,publication_date,type,authorships,primary_location,is_retracted,grants,cited_by_count,doi';
    const r = await fetch(u, { signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'SmartFitScience (contato: local; app de estudo)' } });
    const data = await r.json();
    const out = { ok: true, source: 'openalex', at: Date.now(), results: data.results || [] };
    db.prepare('insert into lit_cache(key,json,created_at) values (?,?,?) on conflict(key) do update set json=excluded.json,created_at=excluded.created_at').run(key, JSON.stringify(out), Date.now());
    json(res, 200, out);
  } catch (e) {
    json(res, 502, { ok: false, offline: true, error: String(e.message || e).slice(0, 160), hint: 'sem saída de rede no servidor — o app tentará consultar OpenAlex/Crossref direto do navegador.' });
  }
});

// --------------------------------------------------------------------- boot
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const path = decodeURIComponent(url.pathname);
  try {
    if (path.startsWith('/media/')) {
      const f = join(UPLOAD_DIR, path.slice(7).replace(/[^a-zA-Z0-9.\-_]/g, ''));
      if (!existsSync(f)) { res.writeHead(404); return res.end('não encontrado'); }
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' });
      return res.end(readFileSync(f));
    }
    const key = (req.method || 'GET') + ' ' + path;
    if (routes[key]) return await routes[key](req, res, url);
    if (SERVE_STATIC) {
      const dist = join(ROOT, 'dist');
      let f = join(dist, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
      if (!f.startsWith(dist)) { res.writeHead(403); return res.end(); }
      if (!existsSync(f) || !MIME[extname(f)]) f = join(dist, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      return res.end(readFileSync(f));
    }
    if (path.startsWith('/api/')) return json(res, 404, { error: 'rota não encontrada', rotas: ['/api/health', '/api/feed', '/api/leaderboard', '/api/users?handle=', '/api/state', '/api/posts', '/api/media', '/api/lit'] });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>SmartFit · API</title>
<style>body{font:15px/1.6 ui-sans-serif,system-ui;color:#e8f0ff;background:#05070f;margin:0;padding:38px}
code{background:#101a2e;padding:2px 6px;border-radius:6px}a{color:#6ef3c0}</style>
<h2>SmartFit Science — só a API</h2>
<p>Ista porta (<code>${PORT}</code>) é a <b>API</b>: ela devolve JSON, não o site. O site fica em
<b><code>http://localhost:5173</code></b> (Vite, com <code>npm run dev</code>).</p>
<p>Se você rodar <code>npm run build</code>, esta mesma porta passa a servir o app inteiro
(<code>dist/</code>) e o <code>/api</code> continua no mesmo endereço.</p>
<p>Endpoints vivos: <a href="/api/health">/api/health</a> ·
<a href="/api/feed?limit=5">/api/feed</a> · <a href="/api/leaderboard">/api/leaderboard</a> ·
<a href="/api/users?handle=ju">/api/users?handle=ju</a></p>`);
  } catch (e) {
    json(res, 500, { error: String(e && e.message || e) });
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] SmartFit Science → http://0.0.0.0:${PORT}  (db: .data/smartfit.db, static: ${SERVE_STATIC ? 'dist/' : 'off'})`);
});
