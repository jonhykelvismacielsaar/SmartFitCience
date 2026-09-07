// Camada de dados: carrega a base (bundle offline, sem rede), normaliza, persiste perfil/diários em
// localStorage e sincroniza com a API quando ela existe (feed, fotos, leaderboard, cache de literatura).
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as CALC from './calc.ts';
import SOURCES_NUT from '../../data/sources/nutrition.json';
import SOURCES_TRA from '../../data/sources/training.json';
import SOURCES_LIF from '../../data/sources/lifestyle.json';
import NUTRIENTS from '../../data/nutrients.json';
import FOODS from '../../data/foods.json';
import EXERCISES from '../../data/exercises.json';
import POSES from '../../data/poses.json';
import PROGRAM from '../../data/program.json';
import MEALS from '../../data/meals.json';
import FAQ from '../../data/faq.json';
import AUDITS from '../../data/audits.json';

export const FOOD_CAMPOS = ['id', 'nome', 'grupo', 'porcao', 'kcal', 'prot', 'carb', 'gord', 'fibra', 'ferro', 'calcio', 'sodio', 'zinco', 'leucina', 'flags'] as const;

const linkDe = (f: any) => f.link || (f.doi ? `https://doi.org/${f.doi}` : f.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${f.pmid}/` : '');

const fontes = [
  ...((SOURCES_NUT as any).fontes || []).map((f: any) => ({ ...f, link: linkDe(f), _area: 'nutricao' })),
  ...((SOURCES_TRA as any).fontes || []).map((f: any) => ({ ...f, link: linkDe(f), _area: 'treino' })),
  ...((SOURCES_LIF as any).fontes || []).map((f: any) => ({ ...f, link: linkDe(f), _area: 'estilo' })),
];

const alimentos = (((FOODS as any).alimentos || []) as any[]).map((a) => {
  if (!Array.isArray(a)) return a;
  const o: Record<string, any> = {};
  FOOD_CAMPOS.forEach((k, i) => (o[k] = a[i]));
  return o;
});

export const DB = {
  fontes,
  porId: new Map<string, any>(fontes.map((f: any) => [f.id, f] as [string, any])),
  nutrientes: NUTRIENTS as any,
  alimentos,
  gruposAlimentos: (FOODS as any).grupos || {},
  exercicios: (EXERCISES as any).exercicios || [],
  regrasEx: (EXERCISES as any).regras || {},
  poses: (POSES as any).poses || {},
  program: PROGRAM as any,
  modelosRefeicao: (MEALS as any).modelos || {},
  papeisRefeicao: (MEALS as any).papeis || [],
  substituicoes: (MEALS as any).substituicoes || [],
  rotulo: (MEALS as any).custo_rotulo || {},
  capsulas: (FAQ as any).capsulas || [],
  auditoria: AUDITS as any,
  emblemas: (PROGRAM as any).emblemas || [],
  questoes: (PROGRAM as any).quests || {},
  nomeDieta: (d: any) => (CALC.NIVEIS_DIETA as any)[d]?.nome || (d ? String(d) : '—'),
};

export const lookupEx = (): Record<string, any> => Object.fromEntries(DB.exercicios.map((e: any) => [e.id, e]));
export const buscaFonte = (id: string) => DB.porId.get(id);

export type Estado = {
  perfil: any; metas: any; dias: Record<string, Dia>; xpLog: any[]; sessoes: any[];
  alertasFeitos: Record<string, string[]>; preferencias: any; fotoPerfil?: string | null;
  atualizado?: number; contasConectadas?: any;
  // camada social + laboratorial (tudo opcional; o app funciona sem servidor)
  posts?: any[]; flags?: any[]; badges?: string[]; seguindo?: string[];
  exames?: any[]; nivelCache?: any;
};
export type Dia = {
  agua: number; copos: string[]; refeicoes: Record<string, any>; treino: any; sonoH: number | null;
  pesoKg: number | null; passos: number | null; humor: number | null; stress: number | null;
  checkins: any[]; fotos: any[]; kcal: number; prot: number; fibra: number; mindfulnessMin: number;
  notas?: string; quests?: Record<string, boolean>;
  cintura?: number; quadril?: number; pescoco?: number; passosMeta?: number;
};

const KEY = 'sf_estado_v1';
export const hojeKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function diaVazio(): Dia {
  return { agua: 0, copos: [], refeicoes: {}, treino: null, sonoH: null, pesoKg: null, passos: null, humor: null, stress: null, checkins: [], fotos: [], kcal: 0, prot: 0, fibra: 0, mindfulnessMin: 0, notas: '', quests: {} };
}
export function estadoInicial(): Estado {
  return { perfil: null, metas: null, dias: {}, xpLog: [], sessoes: [], alertasFeitos: {}, preferencias: { som: true, vibrar: true, modoCalor: false, rigor: false, fotoObrigatoria: false }, fotoPerfil: null };
}
export function carregarEstado(): Estado {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...estadoInicial(), ...JSON.parse(raw) }; } catch { /* dados corrompidos: recomeça limpo */ }
  return estadoInicial();
}

/** Base da API. Vazio = mesma origem (o serviço que serve dist/ também serve /api).
 *  Defina VITE_API_BASE no build só se o site for hospedado separado da API. */
export const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || '').replace(/\/+$/, '');
/** Caminho de arquivo de mídia devolvido pelo servidor (/<code>/media/id</code>) → absoluto quando houver base. */
export const urlDeMidia = (u?: string | null) => (!u ? u : /^https?:/i.test(u) ? u : API_BASE + u);

export async function api(path: string, init: { json?: any; method?: string; body?: any; headers?: Record<string, string> } = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('sf_token') : null;
  const r = await fetch(API_BASE + '/api' + path, {
    method: init.method || (init.json ? 'POST' : 'GET'),
    headers: {
      ...(init.json ? { 'Content-Type': 'application/json' } : init.body ? {} : {}),
      ...(init.headers || {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    } as any,
    body: init.json ? JSON.stringify(init.json) : init.body,
  });
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || String(r.status));
  return r.json();
}
export const temSessao = () => typeof localStorage !== 'undefined' && !!localStorage.getItem('sf_token');

export function useStore() {
  const [estado, setEstado] = useState<Estado>(() => (typeof window === 'undefined' ? estadoInicial() : carregarEstado()));
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [sync, setSync] = useState<'off' | 'ok' | 'erro' | 'salvando'>('off');
  const [conta, setConta] = useState<any>(null);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    if (!temSessao()) return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    api('/me').then((r) => {
      if (r?.state) setEstado((e) => ({ ...e, ...r.state, perfil: r.state.perfil || e.perfil }));
      setConta(r?.user || r?.conta || null); setSync('ok');
    }).catch(() => setSync('erro'));
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const salvar = useCallback((next: Estado) => {
    const e: Estado = { ...next, atualizado: Date.now() };
    setEstado(e);
    try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* cota cheia: segue em memória */ }
    if (temSessao()) {
      setSync('salvando');
      api('/state', { method: 'PUT', json: { ...e, _public: projeçãoPublica(e) } }).then(() => setSync('ok')).catch(() => setSync('erro'));
    }
  }, []);

  const mutar = useCallback((fn: (e: Estado) => Estado) => setEstado((atual) => { const novo = fn(atual); const e = { ...novo, atualizado: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* cota */ } return e; }), []);

  useEffect(() => {
    if (!temSessao()) return;
    const t = setTimeout(() => { setSync('salvando'); api('/state', { method: 'PUT', json: { ...estado, _public: projeçãoPublica(estado) } }).then(() => setSync('ok')).catch(() => setSync('erro')); }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.atualizado]);

  const setDia = useCallback((mut: (d: Dia) => Dia, key = hojeKey()) => {
    mutar((e) => ({ ...e, dias: { ...e.dias, [key]: mut({ ...diaVazio(), ...(e.dias[key] || {}) }) } }));
  }, [mutar]);

  const addXp = useCallback((motivo: string, valor: number, meta: any = {}) => {
    mutar((e) => ({ ...e, xpLog: [...(e.xpLog || []), { data: new Date().toISOString(), dia: hojeKey(), motivo, valor, ...meta }] }));
  }, [mutar]);

  const marcarAlerta = useCallback((id: string, key = hojeKey()) => {
    mutar((e) => { const feitos = { ...(e.alertasFeitos || {}) }; feitos[key] = [...new Set([...(feitos[key] || []), id])]; return { ...e, alertasFeitos: feitos }; });
  }, [mutar]);

  const login = useCallback(async (email: string, senha: string, cadastro?: { nome: string; handle?: string }) => {
    const r = cadastro
      ? await api('/register', { json: { email, password: senha, name: cadastro.nome } })
      : await api('/login', { json: { email, password: senha } });
    if (!r?.token) throw new Error(r?.error || 'resposta inesperada do servidor');
    localStorage.setItem('sf_token', r.token);
    if (r.user || r.conta) setConta(r.user || r.conta);
    setSync('ok');
    return r;
  }, []);
  const sair = useCallback(() => { localStorage.removeItem('sf_token'); setConta(null); setSync('off'); }, []);

  const refresh = useCallback(async () => {
    const out: any = {};
    try { const f = await api('/feed'); out.posts = (f.posts || []).map(normalizarPost); } catch { out.erro = 'sem servidor'; }
    try { const l = await api('/leaderboard'); const rows = l.rows || l.leaderboard || []; out.usuarios = rows.map(normalizarUsuario); out.leaderboard = out.usuarios; } catch { /* opcional */ }
    return out;
  }, []);
  const perfilDe = useCallback(async (handle: string) => {
    const r = await api('/users?handle=' + encodeURIComponent(handle));
    return { user: normalizarUsuario(r.user || {}), posts: (r.posts || []).map(normalizarPost) };
  }, []);

  return {
    estado, setEstado, salvar, mutar, setDia, addXp, marcarAlerta, online, sync, conta,
    login, sair, entrar: login, registrar: (handle: string, senha: string, nome?: string) => login(handle, senha, { nome: nome || handle, handle }),
    logout: sair, token: typeof localStorage !== 'undefined' ? localStorage.getItem('sf_token') : null,
    streakAtual: streakDe(estado), refresh, perfilDe, syncComunidade: refresh,
  };
}

/** O servidor usa nomes de campo próprios (kind/text/createdAt, name/diet/level); aqui viram os do app. */
export function normalizarPost(r: any) {
  return {
    id: String(r.id), tipo: r.kind || r.tipo || 'checkin', texto: r.text ?? r.texto ?? '', foto: r.photo ?? r.foto ?? null,
    dieta: r.diet ?? r.dieta ?? null, nivel: r.level ?? r.nivel ?? null, xp: r.xp ?? 0, streak: r.streak ?? 0,
    tags: r.tags || [], likes: r.likes ?? r.reacoes ?? 0, liked: !!r.liked, data: r.createdAt ? new Date(r.createdAt).toISOString() : (r.data || new Date().toISOString()),
    autor: r.author?.handle ?? r.autor ?? null, autorPerfil: r.author ? { handle: r.author.handle, nome: r.author.name, dieta: r.diet, nivel: r.level, xp: r.xp, streak: r.streak } : r.autorPerfil,
    clan: r.clan ?? null,
  };
}
export function normalizarUsuario(u: any) {
  return {
    id: u.id, handle: u.handle, nome: u.nome || u.name, bio: u.bio || '', dieta: u.dieta || u.diet, objetivo: u.objetivo || u.goal,
    nivel: u.nivel ?? u.level ?? 0, xp: u.xp ?? 0, streak: u.streak ?? 0, clan: u.clan || null, emblemas: u.emblemas ?? u.badges ?? 0,
    diasAtivos: u.diasAtivos ?? 0, foto: u.foto || null, criadoEm: u.created_at ? new Date(u.created_at).toISOString() : null,
  };
}

/** Projeção pública: o único pedaço do seu perfil que vai para o feed e para o placar. */
export function projeçãoPublica(e: Estado | any) {
  const p = e?.perfil || e || {};
  const ee: Estado = e?.perfil ? e : ({ perfil: e, dias: {}, xpLog: [], sessoes: [], alertasFeitos: {}, preferencias: {} } as any);
  const dias = Object.keys(ee.dias || {}).sort();
  return {
    nome: p.nome, handle: p.handle, bio: p.bio, dieta: p.dieta, objetivo: p.objetivo,
    nivel: (ee as any).nivel ?? (ee.perfil as any)?.nivel ?? null, xp: xpTotal(ee), streak: streakDe(ee), clan: p.clan,
    foto: (ee as any).fotoPerfil || null, emblemas: ((ee as any).badges || (ee as any).emblemas || []).length,
    diasAtivos: dias.length, protegido: !!(p.comunidade && p.comunidade.privado),
    ultimoPost: ((ee as any).posts || [])[0]?.texto,
  } as any;
}

export const xpTotal = (e: Estado) => (e.xpLog || []).reduce((s: number, x: any) => s + (Number(x.valor) || 0), 0);
export function diasCompletos(e: Estado) {
  return Object.entries(e.dias || {}).filter(([, d]: [string, any]) => (d?.agua || 0) > 0 || (d?.checkins || []).length || d?.treino).map(([k]) => k).sort();
}
export function streakDe(e: Estado) { return CALC.streakDe(diasCompletos(e)); }

export const maiorSequencia = CALC.maiorSequencia;

/**
 * Emblemas: quem decide se você ganhou. Criterios iguais aos de data/program.json, calculados do estado real.
 * Contadores de comportamento (artigos lidos, conflitos sinalizados, recusas de hype, reacoes no feed) moram em
 * perfil.__contadores e sao incrementados por contador() nas proprias telas.
 */
export function conferirEmblemas(e: Estado, metas: any): string[] {
  const chaves = Object.keys(e.dias || {}).sort();
  const d = (k: string) => e.dias[k] || ({} as Dia);
  const c = (e.perfil?.__contadores || {}) as Record<string, number>;
  const copos = metas?.agua?.copos ?? 8;
  const sessoes = (e.sessoes || []).length;
  const diasCom = (sel: (x: any) => boolean) => chaves.filter((k) => sel(d(k)));
  const alvos: Record<string, boolean> = {
    b_hydra: CALC.maiorSequencia(diasCom((x) => (x.agua || 0) >= copos)) >= 30,
    b_ferro: sessoes >= 100,
    b_verde: diasCom((x) => (x.fibra || 0) >= (metas?.fibra || 30) * 0.8).length >= 60,
    b_b12: diasCom((x) => (x.checkins || []).includes('b12')).length >= 365,
    b_cetic: (c.lidos || 0) >= 10 && (c.sinalizados || 0) >= 3,
    b_soneca: diasCom((x) => (x.sonoH || 0) >= 7).length >= 21,
    b_mental: diasCom((x) => (x.mindfulnessMin || 0) >= 5).length >= 20,
    b_foto: diasCom((x) => (x.fotos || []).length > 0).length >= 12,
    b_clube: (c.reacoes || 0) >= 25,
    b_recomeco: (() => {
      if (CALC.maiorSequencia(chaves) < 1) return false;
      const comTudo = chaves.filter((k) => { const q = d(k).quests || {}; return Object.keys(q).length && Object.values(q).every(Boolean); });
      for (const k of comTudo) {
        const [a, m, dd] = k.split('-').map(Number);
        const ha5 = new Date(a, m - 1, dd - 5);
        const ha6 = new Date(a, m - 1, dd - 6);
        const chave = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        if (!chaves.includes(chave(ha5)) && !chaves.includes(chave(ha6))) return true;
      }
      return false;
    })(),
    b_paciencia: chaves.length >= 180 && sessoes * 2 >= chaves.length,
    b_anti_hype: (c.recusas || 0) >= 5,
  };
  const tem = new Set(e.badges || []);
  return Object.entries(alvos).filter(([id, ok]) => ok && !tem.has(id)).map(([id]) => id);
}

/** Incrementa um contador comportamental do perfil (usado para emblemas de leitura/ceticismo/communidad). */
export function contador(mutar: (fn: (e: Estado) => Estado) => void, chave: string, n = 1) {
  mutar((x) => {
    const c = { ...(x.perfil?.__contadores || {}) };
    c[chave] = (Number(c[chave]) || 0) + n;
    return { ...x, perfil: { ...x.perfil, __contadores: c } };
  });
}

export function usoDe(e: Estado) {
  const k = hojeKey(); const d = e.dias[k] || diaVazio(); const m = e.metas || {};
  return {
    hoje: d, aguaPct: m.agua?.copos ? clamp((d.agua || 0) / m.agua.copos) : 0,
    kcalPct: m.kcal ? clamp(d.kcal / m.kcal) : 0, protPct: m.prot ? clamp(d.prot / m.prot) : 0,
    fibraPct: m.fibra ? clamp((d.fibra || 0) / m.fibra) : 0,
    aguaCoposRestantes: Math.max(0, (m.agua?.copos || 0) - (d.agua || 0)),
  };
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Metas derivadas do perfil — fonte única de verdade, recalculada a cada mudança. */
export function useMetas(store: ReturnType<typeof useStore>) {
  return useMemo(() => {
    const p = store.estado.perfil;
    if (!p?.pesoKg || !p?.alturaCm) return null;
    return calcFromPerfil(p);
  }, [store.estado.perfil]);
}

export function calcFromPerfil(p: any, calc: any = CALC) {
  const C = calc;
  const id = C.idade(p.nascimento);
  const bf = p.pescocoCm && p.cinturaCm ? C.gorduraPct({ sex: p.sexo, altura: p.alturaCm, peso: p.pesoKg, pescoco: p.pescocoCm, cintura: p.cinturaCm, quadril: p.quadrilCm }) : (p.gcPct || null);
  const geb = C.geb({ sexo: p.sexo, peso: p.pesoKg, altura: p.alturaCm, idade: id, gorduraPct: bf });
  const gasto = C.getmetabolico(geb.valor, p.atividade || 2);
  const energia = C.alvoEnergia(gasto.valor, p.objetivo || 'saude', { peso: p.pesoKg, altura: p.alturaCm, sexo: p.sexo, idade: id, condicoes: p.condicoes || [], bf });
  const proteina = C.macros(energia.kcal, p.pesoKg, { goal: p.objetivo || 'saude', diet: p.dieta || 'omni', treinoDias: p.treinoDias || 3, idade: id, condicoes: p.condicoes || [], meals: p.refeicoesDia || 4 });
  const agua = C.agua(energia.kcal, p.pesoKg, { treinoMin: (p.treinoDias || 3) * 50, calor: p.modoCalor ? 0.6 : 0 });
  const micro = C.micronutrientes(p.dieta || 'omni', p.sexo, id, p.pesoKg, p.condicoes || [], energia.kcal);
  const imc = C ? energia.imc : 0;
  const riscos = C.riscos({ condicoes: p.condicoes || [], sexo: p.sexo, idade: id, imc, cintura: p.cinturaCm, altura: p.alturaCm, pressao: p.pressao, ferritina: p.exames?.ferritina, b12: p.exames?.b12 });
  const agenda = C.agenda({ acorda: p.acorda || '07:00', dormir: p.dormir || '23:00', agua, treinoMin: (p.treinoDias || 3) * 50, refeições: p.refeicoesDia || 4, calor: !!p.modoCalor });
  const passos = p.objetivo === 'perder_gordura' ? 9000 : 7000;
  return {
    idade: id, bf, geb, gasto, energia, proteina, agua, micro, riscos, agenda, imc,
    dietaInfo: C.NIVEIS_DIETA[p.dieta || 'omni'],
    sono: { min: 7, max: 9, cafeUltima: agenda.cafeUltima, nota: 'Adulto: 7–9 h (Hirshkowitz 2015). Manter horário dentro de ±45 min inclusive no fim de semana e cortar cafeína ~8 h antes de deitar (Watson 2015, declaração da AHA). Dormir 5,5 h em vez de 8,5 h mudou a partição do peso perdido: ~55–60% veio de massa magra (Nedeltcheva 2010).' },
    treino: {
      seriesPorGrupo: p.objetivo === 'perder_gordura' ? '8–11' : p.objetivo === 'recomposicao' ? '10–12' : '12–18',
      rirCompostos: 2, rirIsolados: '0–1', minutosSemana: (p.treinoDias || 3) * 50, passos,
      passosNota: 'Meta do app: 7 000 passos/dia — é onde a curva de mortalidade achatou em adultos ≥60 (Paluch 2025: 11 coortes, 57 404 pessoas; 7 000 vs 2 000 passos → HR 0,53). <60 anos: platô em 8–10 mil. Antes do platô, cada +1 000 passos = 9–15% menos mortalidade.',
    },
    gapsAlvo: { calcio: micro.itens.find((i: any) => i.id === 'calcio')?.alvo, ferro: micro.itens.find((i: any) => i.id === 'ferro')?.alvo, sodioMax: micro.itens.find((i: any) => i.id === 'sodio')?.alvo },
    kcal: energia.kcal, prot: proteina.protein, carb: proteina.carb, fat: proteina.fat, fibra: proteina.fibra,
  };
}

export const fmt = {
  n: (v: any, d = 0) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d })),
  g: (v: any) => (v == null ? '—' : `${round1(v)} g`),
  mg: (v: any) => (v == null ? '—' : `${Math.round(v)} mg`),
  kcal: (v: any) => (v == null ? '—' : `${Math.round(v)} kcal`),
  pct: (v: number) => `${Math.round((v || 0) * 100)}%`,
  data: (k: string) => { const [a, m, dd] = String(k).split('-'); return `${dd}/${m}/${a}`; },
  min: (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
  dataHora: (iso: any) => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return '—'; } },
};
const round1 = (n: number) => Math.round(n * 10) / 10;
