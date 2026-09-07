import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, api, fmt, hojeKey, projeçãoPublica, normalizarPost, contador } from '../lib/db.ts';
import { NIVEIS_DIETA } from '../lib/calc.ts';
import { Card, Chip, Modal, Seg, Toggle, useToast } from '../components/ui.tsx';

const TIPOS = { treino: '🏋️', refeicao: '🥗', vitoria: '🚀', checkin: '🧘', duvida: '❓', badge: '🏅' };

export default function Comunidade() {
  const { store, irPara } = useApp();
  const e = store.estado;
  const [online, setOnline] = useState<any>(null);
  const [modo, setModo] = useState<'feed' | 'tribo' | 'ranking'>('feed');
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<keyof typeof TIPOS>('refeicao');
  const [foto, setFoto] = useState<string | null>(null);
  const [priv, setPriv] = useState(!!e.perfil.comunidade?.privado);
  const [local, setLocal] = useState(0);
  const [perfilDe, setPerfilDe] = useState<any>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const toast = useToast();

  const refresh = async () => { const r = await store.refresh(); setOnline(r); setLocal((n) => n + 1); };
  useEffect(() => { refresh().catch(() => {}); }, [local]);
  const offline = !store.online;

  const meuXP = (e.xpLog || []).reduce((a: number, x: any) => a + (Number(x.valor) || 0), 0);
  const localPosts = useMemo(() => (e.posts || []).filter((x: any) => !filtro || x.tipo === filtro)
    .map((x: any) => ({ ...x, autor: e.perfil.handle, autorPerfil: { handle: e.perfil.handle, nome: e.perfil.nome, nivel: e.perfil.nivel, xp: meuXP, dieta: e.perfil.dieta, streak: store.streakAtual, badges: (e.badges || []).length } })), [e.posts, filtro, store.streakAtual, meuXP]);
  const feedOnline = (online?.posts || []).filter((x: any) => !filtro || x.tipo === filtro);
  const feed = [...localPosts, ...feedOnline].sort((a: any, b: any) => String(b.data).localeCompare(String(a.data)));
  const lb = online?.leaderboard || [];
  const usuarios = online?.usuarios || [];

  const postar = async () => {
    if (!texto.trim() && !foto) return;
    const post = normalizarPost({ id: 'p' + Date.now(), kind: tipo === 'badge' ? 'vitoria' : tipo, text: texto.trim(), photo: foto || null, diet: e.perfil.dieta, level: e.perfil.nivel, xp: meuXP, streak: store.streakAtual, created_at: Date.now() });
    store.mutar((x) => ({ ...x, posts: [post, ...(x.posts || [])].slice(0, 40) }));
    setTexto(''); setFoto(null);
    if (!offline && store.token) {
      let url: string | null = null;
      if (foto && foto.startsWith('data:')) {
        try {
          const bin = await (await fetch(foto)).blob();
          const r: any = await api('/media', { method: 'POST', body: bin, headers: { 'Content-Type': bin.type || 'image/jpeg' } });
          url = r.url || null;
        } catch { url = null; }
      }
      try {
        await api('/posts', { json: { text: post.texto, kind: post.tipo, photo: url, diet: post.dieta, level: post.nivel, xp: meuXP, streak: store.streakAtual, tags: [] } });
        await refresh();
      } catch { toast('ficou só no seu aparelho — sem login ou API fora', 'warn'); }
    }
    toast('publicado na sua tribo 🎉');
  };
  const reagir = async (post: any, emoji: '🔥' | '🥗' | '🏅') => {
    contador(store.mutar, 'reacoes');
    if (post.id.startsWith('p')) { store.mutar((x) => ({ ...x, posts: (x.posts || []).map((p: any) => (p.id === post.id ? { ...p, likes: (p.likes || 0) + 1 } : p)) })); return; }
    try { const r: any = await api('/posts/react', { json: { postId: post.id } }); setOnline((o: any) => ({ ...(o || {}), posts: (o?.posts || []).map((p: any) => (p.id === post.id ? { ...p, likes: r.likes, liked: r.liked } : p)) })); }
    catch { toast('sem servidor (ou sem login) — a reação não subiu', 'warn'); }
  };
  const denunciar = (post: any) => {
    store.mutar((x) => ({ ...x, posts: (x.posts || []).map((p: any) => (p.id === post.id ? { ...p, flag: (p.flag || 0) + 1 } : p)), flags: [...(x.flags || []), { post: post.id, data: hojeKey(), motivo: 'conteúdo sem evidência' }] }));
    toast('marcado para revisão curadoria — o feed local não remove, só esconde de destaques', 'warn');
  };

  const meuPerfil = { ...projeçãoPublica(e), protegido: priv, badges: e.badges || [], nivel: e.perfil.nivel } as any;

  return (
    <div className="split">
      <div className="col">
        <Card title="comunidade" tone="neon" aux={offline ? 'modo local: seus posts ficam no aparelho e são sincronizados quando o servidor volta' : `${lb.length} perfis sincronizados`}>
          <div className="row">
            <Seg opts={[{ v: 'feed', label: 'feed' }, { v: 'tribo', label: 'tribo' }, { v: 'ranking', label: 'ranking' }]} value={modo} onChange={setModo} size="sm" />
            <Toggle checked={priv} onChange={(v) => { setPriv(v); store.mutar((x) => ({ ...x, perfil: { ...x.perfil, comunidade: { ...(x.perfil.comunidade || {}), privado: v } } })); }}>perfil privado</Toggle>
            <span className="right tiny">nada é público sem foto/texto seu — e a foto nunca é obrigatória</span>
          </div>
          <div className="chips">
            <Chip on={!filtro} onClick={() => setFiltro(null)}>tudo</Chip>
            {Object.keys(TIPOS).map((t) => <Chip key={t} on={filtro === t} onClick={() => setFiltro(filtro === t ? null : t)}>{TIPOS[t as keyof typeof TIPOS]} {t}</Chip>)}
          </div>
        </Card>

        {modo === 'feed' && (
          <>
            <Card title="compartilhar" aux="só o que você quiser; o app nunca publica sozinho">
              <div className="col">
                <textarea className="input" rows={2} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="ex.: bloco 2 terminado, 72 kg × 5 no agachamento · vegan e sem creatina até hoje, alguém sente diferença?" />
                <div className="row">
                  <div className="chips">{Object.entries(TIPOS).map(([k, v]) => <Chip key={k} on={tipo === (k as any)} onClick={() => setTipo(k as any)}>{v} {k}</Chip>)}</div>
                  <label className="btn sm ghost" style={{ marginLeft: 'auto' }}>
                    foto opcional 📷<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setFoto(String(rd.result)); rd.readAsDataURL(f); }} />
                  </label>
                  <button className="btn sm primary" onClick={postar}>publicar</button>
                </div>
                {foto && <img src={foto} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12 }} />}
              </div>
            </Card>

            {feed.length === 0 && <Card><div className="tiny">vazio. Publique o primeiro — ou termine uma sessão que o app cria um post de <i>salto de nível</i> sozinho quando você sobe.</div></Card>}
            {feed.map((p: any) => (
              <div key={p.id} className="post">
                <div className="row" style={{ justifyContent: 'flex-start' }}>
                  <div className="ava">{(p.autorPerfil?.handle || '?')[0]?.toUpperCase()}</div>
                  <div>
                    <b style={{ fontSize: 13 }}>{p.autorPerfil?.nome || p.autor}</b> <span className="mono dim">@{p.autor}</span>
                    <div className="tiny">{DB.nomeDieta(p.autorPerfil?.dieta)} · nv {p.autorPerfil?.nivel ?? '—'} · 🔥 {p.autorPerfil?.streak ?? 0} · {fmt.n(p.autorPerfil?.xp ?? 0)} XP{p.autor === e.perfil.handle ? ' · você' : ''} {p.clan ? '· clã ' + p.clan : ''}</div>
                  </div>
                  <span className="pill right">{TIPOS[p.tipo as keyof typeof TIPOS] || '·'} {p.tipo}</span>
                  <span className="tiny mono">{fmt.dataHora(p.data)}</span>
                </div>
                {p.texto && <p style={{ margin: '8px 0 0' }}>{p.texto}</p>}
                {p.foto && <img src={p.foto} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12, marginTop: 8 }} />}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="chip small" aria-pressed={!!p.liked} onClick={() => reagir(p, '🔥')}>🔥 {p.likes || 0}</button>
                  <button className="chip small" onClick={() => reagir(p, '🥗')}>🥗</button>
                  <button className="chip small" onClick={() => reagir(p, '🏅')}>🏅</button>
                  {p.evid && <span className="pill blue">{p.evid}</span>}
                  <button className="chip small right" onClick={() => setPerfilDe(p.autorPerfil)}>ver perfil</button>
                  <button className="chip small" onClick={() => denunciar(p)}>⚑ revisar</button>
                </div>
              </div>
            ))}
          </>
        )}

        {modo === 'tribo' && (
          <div className="grid g3">
            {usuarios.length === 0 && <Card><div className="tiny">nenhum outro perfil no servidor (ou você está offline). O seed traz 12 perfis sintéticos de dietas diferentes para você ver o formato.</div></Card>}
            {usuarios.map((u: any) => (
              <div key={u.id} className="card" style={{ padding: 11, borderColor: u.handle === e.perfil.handle ? 'rgba(110,243,192,0.45)' : undefined }}>
                <div className="row" style={{ justifyContent: 'flex-start' }}>
                  <div className="ava">{(u.handle || '?')[0]?.toUpperCase()}</div>
                  <div><b style={{ fontSize: 13 }}>{u.nome || u.handle}</b><div className="tiny mono">@{u.handle}{u.clan ? ' · ' + u.clan : ''}</div></div>
                </div>
                <div className="row" style={{ marginTop: 6, gap: 4 }}>
                  <span className="pill">{u.dieta ? DB.nomeDieta(u.dieta) : '—'}</span><span className="pill blue">nv {u.nivel}</span>
                  <span className="pill warn">🔥 {u.streak || 0}</span><span className="pill">{fmt.n(u.xp || 0)} XP</span>
                </div>
                <div className="tiny" style={{ marginTop: 5 }}>{(u.badges || []).length} emblemas · {u.protegido ? 'perfil protegido' : 'dados abertos'}</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn xs" onClick={() => setPerfilDe(u)}>perfil</button>
                  <button className="btn xs ghost" onClick={() => { store.mutar((x) => ({ ...x, seguindo: [...new Set([...(x.seguindo || []), u.handle])] })); toast(`seguindo @${u.handle}`); }}>seguir</button>
                  <button className="btn xs ghost" onClick={() => irPara('yaya', { q: `o @${u.handle} é ${DB.nomeDieta(u.dieta)} e está no nível ${u.nivel}; o que dá para copiar da rotina sem copiar a dieta?` })}>perguntar à Yayá</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {modo === 'ranking' && (
          <Card title="streak semanal" aux="streak manda mais que XP total: constância > heroísmo (Cheatham 2020)">
            <table>
              <thead><tr><th>#</th><th>perfil</th><th>dieta</th><th>nível</th><th>🔥 streak</th><th>XP</th><th>emblemas</th></tr></thead>
              <tbody>
                {lb.map((u: any, i: number) => (
                  <tr key={u.handle} style={{ background: u.handle === e.perfil.handle ? 'rgba(110,243,192,0.06)' : undefined }}>
                    <td className="mono">{i + 1}</td>
                    <td><b>{u.nome || u.handle}</b><div className="tiny mono">@{u.handle}{u.clan ? ' · ' + u.clan : ''}</div></td>
                    <td className="tiny">{u.dieta ? DB.nomeDieta(u.dieta) : '—'}{u.clan ? <div className="tiny">{u.clan}</div> : null}</td>
                    <td className="mono">{u.nivel}</td>
                    <td className="mono">{u.streak}</td>
                    <td className="mono">{fmt.n(u.xp)}</td>
                    <td className="mono">{u.emblemas || 0}</td>
                  </tr>
                ))}
                {lb.length === 0 && <tr><td colSpan={7} className="tiny">sem servidor: ranking local — você em 1º, é o que tem</td></tr>}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="col">
        <Card title="como o app trata isso" tone="blue">
          <div className="col tiny" style={{ gap: 6 }}>
            <div>• <b>Foto é opcional</b> em 100% dos fluxos: ela melhora a avaliação de forma (aba Treino), mas nenhum nível depende dela.</div>
            <div>• Sem número de celular, sem e-mail obrigatório, sem geolocalização. Seu handle é o único identificador.</div>
            <div>• Sem curtida pública em <i>corpo</i>: ninguém vê seu peso, suas medidas ou seus exames — <code>projeçãoPublica()</code> bloqueia isso no servidor.</div>
            <div>• O feed não é cronometrado por engajamento: ordem cronológica + emblemas. Sem ranking de “mais bonito”.</div>
            <div>• Conteúdo de terceiros (outros usuários) nunca entra como recomendação de dieta/treino. Você vê <i>evid</i> só quando o post é um registro do próprio app.</div>
            <div>• Botão ⚑ manda para revisão curatorial (lista local de flags); o app não apaga nada sozinho.</div>
          </div>
        </Card>
        <Card title="seu cartão público">
          <div className="col">
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <div className="ava" style={{ width: 42, height: 42, fontSize: '1.1rem' }}>{(e.perfil.avatar || e.perfil.handle[0]).toUpperCase()}</div>
              <div><b>{meuPerfil.nome}</b><div className="tiny mono">@{meuPerfil.handle}</div></div>
            </div>
            <div className="row" style={{ gap: 4 }}>{['dieta', 'nível', 'xp', 'streak', 'emblemas', 'ultimo_post'].map((c) => (
              <span key={c} className="pill">{c.replace('_', ' ')}: <b>{String(meuPerfil[c] ?? '—')}</b></span>
            ))}</div>
            <div className="tiny" style={{ color: 'var(--txt-faint)' }}>{meuPerfil.protegido ? 'privado: ninguém vê seu cartão no feed' : 'visível na tribo'} · peso, medidas e exames nunca saem do aparelho</div>
            <button className="btn sm ghost" onClick={() => setPerfilDe(meuPerfil)}>pré-visualizar</button>
          </div>
        </Card>
      </div>

      <Modal open={!!perfilDe} onClose={() => setPerfilDe(null)} title={perfilDe ? `${perfilDe.nome || perfilDe.handle}` : ''}>
        {perfilDe && (
          <div className="col">
            <div className="row" style={{ gap: 8 }}>
              <div className="ava" style={{ width: 56, height: 56, fontSize: '1.4rem' }}>{(perfilDe.handle || '?')[0]?.toUpperCase()}</div>
              <div className="col">
                <div className="row" style={{ gap: 4 }}>
                  <span className="pill">{perfilDe.dieta ? DB.nomeDieta(perfilDe.dieta) : '—'}</span><span className="pill blue">nível {perfilDe.nivel}</span>
                  <span className="pill warn">🔥 {perfilDe.streak || 0} dias</span><span className="pill">{fmt.n(perfilDe.xp || 0)} XP</span>
                </div>
                <div className="tiny mono">@{perfilDe.handle}</div>
              </div>
            </div>
            <div className="hr" />
            <div className="stat-label">emblemas</div>
            <div className="chips">{(perfilDe.emblemas || []).map?.((b: any) => <span key={typeof b === 'string' ? b : b.id} className="pill gold">{typeof b === 'string' ? b : b.id}</span>) || <span className="pill gold">{perfilDe.emblemas || 0} emblemas</span>}</div>
            <div className="tiny">{(perfilDe.bio || 'sem bio')}{perfilDe.protegido ? ' · perfil protegido, só mostra o essencial' : ''}</div>
            {perfilDe.ultimoPost && <><div className="hr" /><div className="stat-label">último post</div><p className="tiny">{perfilDe.ultimoPost}</p></>}
            <div className="badbox">O que este cartão <b>não</b> mostra: peso, medidas, exames, fotos de progresso, diário. Se alguém publicar isso manualmente, é responsabilidade de quem publicou — por isso o app nunca sugere.</div>
          </div>
        )}
      </Modal>
    </div>
  );

}
