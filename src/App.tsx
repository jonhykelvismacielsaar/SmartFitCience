import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DB, hojeKey, useMetas, useStore, xpTotal, streakDe, projeçãoPublica, conferirEmblemas, normalizarPost } from './lib/db.ts';
import { nivel, multStreak } from './lib/calc.ts';
import { eventosDoDia, pendentes, cobraca, silencia, xpRegra, REGRAS_PADRAO, type Evento } from './lib/scheduler.ts';
import { useAgora, useToast, useXpFloat, ToastCtx, Modal, FonteDetalhe } from './components/ui.tsx';
import Onboarding from './views/Onboarding.tsx';
import Dashboard from './views/Dashboard.tsx';
import Nutricao from './views/Nutricao.tsx';
import Treino from './views/Treino.tsx';
import Ciencia from './views/Ciencia.tsx';
import Yaya from './views/Yaya.tsx';
import Comunidade from './views/Comunidade.tsx';
import Evolucao from './views/Evolucao.tsx';
import Config from './views/Config.tsx';

export const Abas = [
  { id: 'hoje', icone: '◎', nome: 'Hoje' },
  { id: 'nutricao', icone: '🍽', nome: 'Nutrição' },
  { id: 'treino', icone: '🏋️', nome: 'Treino & Níveis' },
  { id: 'ciencia', icone: '🔬', nome: 'Ciência & Auditoria' },
  { id: 'yaya', icone: '✦', nome: 'Yayá' },
  { id: ' tribo', icone: '🌐', nome: 'Tribo' },
  { id: 'evolucao', icone: '📈', nome: 'Evolução' },
  { id: 'config', icone: '⚙️', nome: 'Ajustes' },
];

export const Ctx = createContext<{
  store: ReturnType<typeof useStore>; metas: any; aba: string; irPara: (a: string, extra?: any) => void; extra: any;
  addXp: (motivo: string, valor: number, meta?: any) => void; marcarAlerta: (id: string) => void;
  flutuar: (txt: string) => void; verFonte: (id: string) => void;
}>(null as any);
export const useApp = () => useContext(Ctx);

function bip(tipo: 'ok' | 'alerta' | 'level' = 'alerta') {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const base = tipo === 'ok' ? 660 : tipo === 'level' ? 520 : 440;
    o.type = tipo === 'level' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(base, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(tipo === 'ok' ? 990 : base * (tipo === 'level' ? 2.2 : 1.6), ctx.currentTime + (tipo === 'level' ? 0.45 : 0.16));
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (tipo === 'level' ? 0.55 : 0.22));
    o.start(); o.stop(ctx.currentTime + (tipo === 'level' ? 0.6 : 0.25));
    setTimeout(() => ctx.close(), 1200);
  } catch { /* áudio bloqueado até 1º gesto do usuário */ }
}

export default function App() {
  const store = useStore();
  const metas = useMetas(store);
  const [aba, setAba] = useState<string>(() => {
    try {
      const q = new URLSearchParams(location.search);
      const alvo = q.get('aba');
      if (alvo && Abas.some((a) => a.id === alvo)) { localStorage.setItem('sf_aba', alvo); return alvo; }
    } catch { /* sem URL API: segue o último estado */ }
    return localStorage.getItem('sf_aba') || 'hoje';
  });
  const [extra, setExtra] = useState<any>(null);
  const [fonte, setFonte] = useState<string | null>(null);
  const toasts = useRef<HTMLDivElement | null>(null);
  const [fila, setFila] = useState<{ id: number; msg: string; cls: string }[]>([]);
  const fid = useRef(1);
  const { push: flutuar, node: flutuaNode } = useXpFloat();

  const toast = (msg: string, cls = '') => {
    const id = fid.current++;
    setFila((f) => [...f.slice(-3), { id, msg, cls }]);
    setTimeout(() => setFila((f) => f.filter((x) => x.id !== id)), 3400);
  };

  const addXp = (motivo: string, valor: number, meta: any = {}) => {
    if (!valor) return;
    const mult = multStreak(streakDe(store.estado));
    const final = Math.round(valor * mult);
    store.addXp(motivo, final, meta);
    flutuar(`+${final} XP${mult > 1 ? ` ×${mult}` : ''}`);
  };

  const irPara = (a: string, x?: any) => { setAba(a); setExtra(x || null); localStorage.setItem('sf_aba', a); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const valor = useMemo(() => ({ store, metas, aba, irPara, extra, addXp, marcarAlerta: store.marcarAlerta, flutuar, verFonte: setFonte }), [store.estado, metas, aba, extra]);

  // ---- subida de nível: som, aviso e (se você ligar) post automático no feed
  const nivelAnterior = useRef<number | null>(null);
  useEffect(() => {
    if (!store.estado.perfil) return;
    const xp = xpTotal(store.estado);
    const n = nivel(xp, DB.program['níveis'] || DB.program.niveis).level.n;
    if (nivelAnterior.current == null) { nivelAnterior.current = n; return; }
    if (n > nivelAnterior.current) {
      nivelAnterior.current = n;
      bip('level');
      const lv = (DB.program['níveis'] || DB.program.niveis).find((l: any) => l.n === n);
      toast(`🔓 nível ${n} — ${lv?.nome || ''}. ${lv?.mensagem ? lv.mensagem.slice(0, 90) : 'novo conteúdo liberado'}`, 'xp');
      if (store.estado.perfil?.comunidade?.autoPost) {
        store.mutar((x) => ({
          ...x,
          posts: [normalizarPost({ id: 'p' + Date.now(), kind: 'salto', text: `Passei para o nível ${n} (${lv?.nome || ''}) — ${xp} XP.`, diet: x.perfil.dieta, level: n, xp, streak: streakDe(x), created_at: Date.now() }), ...(x.posts || [])].slice(0, 40),
        }));
      }
    } else if (n < nivelAnterior.current) nivelAnterior.current = n;
  }, [store.estado]);

  // ---- emblemas: conferidos 1× por dia, sem spam
  useEffect(() => {
    if (!store.estado.perfil) return;
    const ganhos = conferirEmblemas(store.estado, metas);
    if (!ganhos.length) return;
    store.mutar((x) => ({ ...x, badges: [...(x.badges || []), ...ganhos] }));
    const nomes = ganhos.map((g) => DB.program.emblemas.find((b: any) => b.id === g)?.nome || g).join(', ');
    toast(`🏅 emblema novo: ${nomes}`, 'xp');
  }, [metas, store.estado.dias, store.estado.sessoes]);

  useEffect(() => {
    if (!store.estado.perfil) return;
    try { navigator?.wakeLock?.request('screen').catch(() => {}); } catch { /* opcional */ }
    const q = new URLSearchParams(location.search);
    const acao = q.get('acao');
    if (acao === 'agua') {
      store.setDia((d) => ({ ...d, agua: d.agua + 1, copos: [...(d.copos || []), new Date().toISOString()] }));
      toast('copo registrado pelo atalho da tela inicial 💧');
      history.replaceState(null, '', location.pathname);
    }
    if (aba === 'treino' && q.get('sessao')) { setExtra({ iniciar: q.get('sessao') }); }
  }, [store.estado.perfil, aba]);

  const semPerfil = !store.estado.perfil;

  return (
    <Ctx.Provider value={valor}>
      {semPerfil && (
        <div className="app"><Onboarding /></div>
      )}
      {!semPerfil && (
      <ToastCtx.Provider value={toast}>
        <div className="app">
          <header className="topbar">
            <div className="brand">
              <div className="logo">✦</div>
              <div>
                SmartFit Science
                <small>evidência própria · sem patrocínio</small>
              </div>
            </div>
            <StatusRede online={store.online} sync={store.sync} />
            <div className="spacer" />
            <NivelChip />
          </header>
          <nav className="tabs" role="tablist">
            {Abas.map((a) => (
              <button key={a.id} className="tab" role="tab" aria-selected={aba === a.id} onClick={() => irPara(a.id)}>
                <span aria-hidden>{a.icone}</span>{a.nome}
                {a.id === 'yaya' && <NovaYayaBadge />}
              </button>
            ))}
          </nav>
          <main>
            {aba === 'hoje' && <Dashboard />}
            {aba === 'nutricao' && <Nutricao />}
            {aba === 'treino' && <Treino />}
            {aba === 'ciencia' && <Ciencia />}
            {aba === 'yaya' && <Yaya />}
            {aba === ' tribo' && <Comunidade />}
            {aba === 'evolucao' && <Evolucao />}
            {aba === 'config' && <Config />}
          </main>
          <AlertasDoDia />
          <FonteDetalhe id={fonte} onClose={() => setFonte(null)} />
          <div className="toast-wrap" ref={toasts}>{fila.map((t) => <div key={t.id} className={`toast ${t.cls}`}>{t.msg}</div>)}</div>
          {flutuaNode}
        </div>
      </ToastCtx.Provider>
      )}
    </Ctx.Provider>
  );
}

function NovaYayaBadge() {
  const { metas } = useApp();
  if (!metas) return null;
  const gaps = (metas.micro?.itens || []).filter((i: any) => i.status === 'critico').length;
  return gaps ? <span className="pill warn" style={{ padding: '1px 6px' }}>{gaps}</span> : null;
}

function StatusRede({ online, sync }: { online: boolean; sync: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className={`pill ${online ? 'ok' : 'warn'}`} title={online ? 'rede disponível — a busca ao vivo funciona' : 'sem rede: app e base continuam 100% offline'}>{online ? '● online' : '○ offline'} · base local</span>
      {sync !== 'off' && <span className={`pill ${sync === 'erro' ? 'bad' : sync === 'salvando' ? 'blue' : 'ok'}`} title="sincronização com o servidor local">{sync === 'salvando' ? '↻ salvando' : sync === 'erro' ? '⚠ API fora' : '✓ sincronizado'}</span>}
    </div>
  );
}

function NivelChip() {
  const { store, metas } = useApp();
  const xp = xpTotal(store.estado);
  const niveis = DB.program['níveis'] || DB.program.niveis;
  const { level, next, prog } = nivel(xp, niveis);
  const streak = streakDe(store.estado);
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="pill ok" title={metas ? metas.energia?.racional : ''}>Nv {level.n} · {level.nome}</span>
      <span className="pill" title={next ? `faltam ${next.xp - xp} XP para o nível ${next.n}` : 'nível máximo'}>{Math.round(prog * 100)}%</span>
      <span className="pill amber" title="dias seguidos com registro (1 dia de folga por semana é perdoado)">🔥 {streak}{multStreak(streak) > 1 ? ` ×${multStreak(streak)}` : ''}</span>
    </div>
  );
}

/** Motor de lembretes: verifica a cada 20 s, dispara modal que só para com OK/adiar, notificação e som. */
function AlertasDoDia() {
  const { store, metas, addXp } = useApp();
  const agora = useAgora(20000);
  const [ativo, setAtivo] = useState<Evento | null>(null);
  const disparados = useRef<Record<string, number>>({});
  const prefs = { ...REGRAS_PADRAO, ...(store.estado.preferencias || {}) };
  const eventos = useMemo(() => (metas ? eventosDoDia(metas, prefs, { treinoAgora: true }) : []), [metas, store.estado.preferencias?.gentil, store.estado.preferencias?.modoCalor]);
  const diaKey = hojeKey();
  const feitos = store.estado.alertasFeitos?.[diaKey] || [];

  useEffect(() => {
    if (ativo || !metas) return;
    const min = agora.getHours() * 60 + agora.getMinutes();
    const est = { feitos, adiamentos: (store.estado.perfil?.__adiamentos || {}), tocados: disparados.current };
    const { ativos } = pendentes(eventos, min, est, prefs as any);
    const alvo = ativos.find((a) => !silencia(min, prefs as any)) || null;
    if (alvo) {
      disparados.current[alvo.id] = (disparados.current[alvo.id] || 0) + 1;
      setAtivo(alvo);
      if (prefs.som && !silencia(min, prefs as any)) bip('alerta');
      try { navigator.vibrate?.(prefs.vibrar ? [120, 60, 120] : 0); } catch { /* sem vibração */ }
      if (prefs.notificacoes && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(`SmartFit · ${alvo.rotulo}`, { body: cobraca(alvo, disparados.current[alvo.id], metas).corpo.slice(0, 180), tag: alvo.id, requireInteraction: true, icon: '/icon.svg' } as any); } catch { /* ok */ }
      }
    }
  }, [agora, ativosKey(eventos, feitos), ativo, metas]);

  if (!ativo) return null;
  const toques = (disparados.current[ativo.id] || 1) - 1;
  const texto = cobraca(ativo, toques, metas);
  const responder = (acao: string) => {
    if (acao === 'adiar') {
      const map = { ...(store.estado.perfil?.__adiamentos || {}) };
      map[ativo.id] = (map[ativo.id] || 0) + 1;
      store.mutar((e) => ({ ...e, perfil: { ...e.perfil, __adiamentos: map } }));
    } else {
      store.marcarAlerta(ativo.id, diaKey);
      const regras = DB.program.regras_xp_num || DB.program.regras_xp;
      const tabela: Record<string, [string, number]> = { agua: ['agua_copo', 1], refeicao: ['refeicao_registrada', 1], treino: ['serie_concluida', 3], sono: ['sono_ok', 1], mente: ['mindfulness', 1], checar: ['missao_diaria', 0], meta: ['meta_proteina_batida', 1] };
      const [chave, n] = tabela[ativo.tipo] || ['missao_diaria', 0];
      const xp = xpRegra(regras, chave, n);
      if (xp) addXp(`lembrete:${ativo.tipo}:${acao}`, xp, { evento: ativo.id });
      if (prefs.som) bip('ok');
    }
    setAtivo(null);
  };
  return (
    <Modal open kind="alerta" title={<span className="row">{iconeTipo(ativo.tipo)} {texto.titulo}</span>}>
      <p style={{ color: 'var(--txt)', fontSize: 14 }}>{texto.corpo}</p>
      {ativo.tipo === 'agua' && (
        <button className="btn sm ghost" onClick={() => { store.setDia((d) => ({ ...d, agua: d.agua + 1, copos: [...(d.copos || []), new Date().toISOString()] })); }}>
          já anotei +1 copo de 250 mL
        </button>
      )}
      {ativo.tipo === 'refeicao' && <div className="tiny">Registrar leva 15 s — e é a técnica com maior efeito no auto-monitoramento (Michie 2009).</div>}
      <div className="hr" />
      <div className="row">
        {texto.acoes.map((a) => (
          <button key={a.id} className={`btn ${a.id === 'ok' ? 'primary' : a.id === 'reduzida' ? 'blue' : a.id === 'pular' ? 'ghost' : ''}`} onClick={() => responder(a.id)}>{a.rotulo}</button>
        ))}
        <span className="tiny right">o app para de cobrar quando você responde · {toques + 1}/{prefs.maxAdiamentos + 1} aviso</span>
      </div>
    </Modal>
  );
}
const ativosKey = (evs: Evento[], feitos: string[]) => `${evs.length}|${feitos.length}|${Math.floor(Date.now() / 60000)}`;
const iconeTipo = (t: string) => ({ agua: '💧', refeicao: '🍽', treino: '🏋️', sono: '🌙', mente: '🧘', checar: '📋', meta: '🎯' } as any)[t] || '🔔';

