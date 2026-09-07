// Busca ao vivo na literatura + filtro de viés comercial (OpenAlex / Crossref, direto do navegador).
// Nada aqui é mágica: o app puxa metadados públicos (inclusive a lista de financiadores quando existe)
// e usa as listas do módulo de auditoria para classificar risco. Número de citação nunca "aprova" um artigo.
import { API_BASE } from './db.ts';
import AUDITORIA from '../../data/audits.json';
import { classificar, listasDe, pesoDesign, type Candidato, type Listas, type Risco } from './bias.ts';

export type { Risco };
export const LISTAS: Listas = listasDe(AUDITORIA);

export type Trabalho = Omit<Candidato, 'id' | 'autores'> & {
  id: string; autores: string[];
  risco: Risco; motivo: string; sinal: string; design: string; designPeso: number; peso: number; retratado: boolean; local?: boolean;
};

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function classificarFinanciamento(financ: { nome: string }[], titulo = '', revista = '') {
  return classificar(financ, titulo, revista, LISTAS);
}

/** Converte o payload cru do OpenAlex ou do Crossref no formato interno, já com risco e peso. */
export function normalizar(raw: any[], origem: 'openalex' | 'crossref'): Trabalho[] {
  return (raw || []).map((w) => {
    let base: any;
    if (origem === 'openalex') {
      base = {
        id: w.doi || w.id, titulo: w.display_name || '(sem título)', ano: w.publication_year,
        revista: w.primary_location?.source?.display_name || w.host_venue?.display_name || '',
        doi: String(w.doi || '').replace('https://doi.org/', ''), tipo: w.type || '', citacoes: w.cited_by_count ?? 0,
        url: w.open_access?.oa_url || w.doi || '', autores: (w.authorships || []).slice(0, 8).map((a: any) => a.author?.display_name || '').filter(Boolean),
        resumo: (() => {
          const inv = w.abstract_inverted_index as Record<string, number[]> | undefined; if (!inv) return '';
          const pos: Record<number, string> = {}; Object.entries(inv).forEach(([word, idxs]) => (idxs as number[]).forEach((i) => (pos[i] = word)));
          return Object.keys(pos).map(Number).sort((a, b) => a - b).map((i) => pos[i]).join(' ').slice(0, 700);
        })(),
        financ: (w.funding || []).map((f: any) => ({ nome: f.funder?.display_name || '', fonte: 'OpenAlex' })).filter((f: any) => f.nome),
      };
    } else {
      base = {
        id: w.DOI, titulo: (w.title || [])[0] || '(sem título)', ano: (w.published?.['date-parts']?.[0] || [])[0],
        revista: (w['container-title'] || [])[0] || '', doi: w.DOI || '', tipo: w.type || '', citacoes: w['is-referenced-by-count'] ?? 0,
        url: w.URL || '', autores: (w.author || []).slice(0, 8).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')),
        resumo: String(w.abstract || '').replace(/<[^>]+>/g, '').slice(0, 700),
        financ: (w.funder || []).map((f: any) => ({ nome: f.name || '', fonte: 'Crossref' })).filter((f: any) => f.nome),
      };
    }
    const cls = classificar(base.financ, base.titulo, base.revista, LISTAS);
    const des = pesoDesign([base.tipo, base.titulo].join(' '), LISTAS);
    const ano = Number(base.ano || 0);
    const recencia = ano >= 2021 ? 1.1 : ano >= 2015 ? 1 : ano >= 2005 ? 0.9 : 0.78;
    const cites = Math.log10(1 + (base.citacoes || 0)) / 4;
    return {
      ...base, ...cls, design: des.nome, designPeso: des.p,
      peso: Math.round(cls.peso * des.p * recencia * (1 + Math.min(0.5, cites)) * 100) / 100,
      retratado: /retract/i.test([base.titulo, base.revista].join(' ')) || cls.risco === 'retratado',
    } as Trabalho;
  }).filter((t) => t && t.titulo && t.titulo !== '(sem título)');
}

const CACHE_KEY = 'sf_lit_cache_v2';
const lerCache = (): Record<string, { t: number; r: Trabalho[] }> => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } };
const gravarCache = (c: any) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* cota */ } };

export type Busca = { termos: string; excluirSetorial: boolean; soHumanos: boolean; anosDe: number; usarProxyPrimeiro?: boolean };

async function tentar(url: string, timeout = 9000) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

/** Mesmo tópico já está na base local? (dedupe por DOI/título sobre data/sources) */
export function marcarLocais(lista: Trabalho[], fontes: any[]): Trabalho[] {
  const doiLocal = new Set(fontes.map((f) => norm(f.doi || ''))); const tLocal = new Set(fontes.map((f) => norm(f.t || '').slice(0, 60)));
  return lista.map((t) => ({ ...t, local: (!!t.doi && doiLocal.has(norm(t.doi))) || tLocal.has(norm(t.titulo).slice(0, 60)) }));
}

export async function buscar(busca: Busca): Promise<{ resultados: Trabalho[]; fonte: string; aviso: string; brutos: number }> {
  const cache = lerCache(); const chave = JSON.stringify(busca);
  const hit = cache[chave];
  if (hit && Date.now() - hit.t < 1000 * 60 * 60 * 24) {
    return { resultados: hit.r, fonte: 'cache local', aviso: `resultado em cache de ${new Date(hit.t).toLocaleString('pt-BR')} (24 h)`, brutos: hit.r.length };
  }
  const termos = [busca.termos, busca.soHumanos ? 'humans' : ''].filter(Boolean).join(' ');
  let dados: any = null; let fonte = 'OpenAlex'; let aviso = '';

  if (busca.usarProxyPrimeiro !== false) {
    try {
      const r = await fetch(API_BASE + '/api/lit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: termos, termos, anosDe: busca.anosDe, rows: 45 }) });
      if (r.ok) {
        const j = await r.json();
        const brutos = j?.works || j?.results || j?.message?.items || [];
        if (brutos.length) {
          let lista = normalizar(brutos, (j.fonte || j.source || 'openalex') as any);
          if (busca.excluirSetorial) lista = lista.filter((t) => t.risco !== 'alto' && t.risco !== 'retratado');
          lista.sort((a, b) => b.peso - a.peso);
          cache[chave] = { t: Date.now(), r: lista }; gravarCache(cache);
          return { resultados: lista, fonte: `${j.fonte || 'openalex'} via proxy do app`, aviso: `proxy respondeu em ${j.ms || '?'} ms · ${j.cache ? 'cache do servidor' : 'busca nova'}`, brutos: lista.length };
        }
        if (j?.aviso) aviso = j.aviso;
        if (j && j.ok === false) aviso = (aviso ? aviso + ' · ' : '') + (j.hint || j.error || 'proxy indisponível');
      }
    } catch { /* sem API: cai para chamada direta do navegador */ }
  }

  const oax = `https://api.openalex.org/works?search=${encodeURIComponent(termos)}&per-page=45&select=id,doi,display_name,publication_year,type,cited_by_count,authorships,primary_location,host_venue,open_access,has_funding,funding,abstract_inverted_index&filter=${encodeURIComponent(`from_publication_date:${busca.anosDe}-01-01`)}`;
  try { dados = await tentar(oax); } catch (e: any) { aviso = (aviso ? aviso + ' · ' : '') + 'OpenAlex inacessível deste dispositivo'; }
  if (!dados?.results?.length) {
    fonte = 'Crossref';
    try {
      const cr = `https://api.crossref.org/works?query=${encodeURIComponent(termos)}&rows=40&filter=${encodeURIComponent(`from-pub-date:${busca.anosDe}-01-01,type:journal-article`)}`;
      dados = { results: (await tentar(cr))?.message?.items || [] };
    } catch {
      return { resultados: hit?.r || [], fonte: 'offline', aviso: (aviso ? aviso + ' · ' : '') + 'Sem internet: sem busca ao vivo. A base local continua funcionando 100% offline — recarregue quando voltar a conexão.', brutos: hit?.r?.length || 0 };
    }
  }
  let lista = normalizar(dados.results || [], 'openalex');
  if (fonte === 'Crossref') lista = normalizar(dados.results || [], 'crossref');
  if (busca.excluirSetorial) lista = lista.filter((t) => t.risco !== 'alto' && t.risco !== 'retratado');
  lista.sort((a, b) => b.peso - a.peso);
  cache[chave] = { t: Date.now(), r: lista }; gravarCache(cache);
  const bloqueados = normalizar(dados.results || [], fonte === 'Crossref' ? 'crossref' : 'openalex').filter((t) => t.risco === 'alto').length;
  return {
    resultados: lista, fonte, brutos: (dados.results || []).length,
    aviso: aviso || `${lista.length} trabalhos ranqueados · ${bloqueados} com funding setorial sinalizado${busca.excluirSetorial ? ' (excluídos da lista)' : ''} · financiadores checados contra a lista de auditoria`,
  };
}
