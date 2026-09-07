// Yayá — assistente de evidências local (retrieval explicável, sem LLM obrigatório).
// Estratégia: BM25 sobre a base (fontes + cápsulas) + injeção dos números do perfil + citações.
// Se o usuário conectar um provedor de LLM nas Configurações, o texto é reescrito com as MESMAS
// fontes recuperadas (o app nunca deixa o modelo citar o que não está no contexto).

export type Fonte = {
  id: string; t: string; a?: string; j?: string; y?: number; doi?: string; pmid?: string; link?: string;
  d?: string; p?: string; f?: string; u?: string; e?: string; cf?: string; g?: string; no?: string; tg?: string[]; ck?: number;
  [k: string]: any;
};
export type Capsula = { id: string; q: string[]; kw: string[]; a: string; refs: string[]; pers?: string; avisos?: string[] };

export const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STOP = new Set(('a o e de do da das dos em no na nos nas para por que com sem sobre mais menos muito pouco como quando qual quais eu meu minha sua dele isso esse esta este sao ser ter tem ter faz fazer fazer o qual o que na no para um uma uns umas').split(' '));
export const tokens = (s: string) => norm(s).replace(/[^a-z0-9À-ÿ\s-]/g, ' ').split(/[\s\-]+/).filter((w) => w.length > 2 && !STOP.has(w))
  .map((w) => (w.length > 4 && /s$/.test(w) ? w.slice(0, -1) : w));

export type Doc = { id: string; kind: 'fonte' | 'capsula'; text: string; title: string; tags: string[]; refs?: string[]; data: any };

export function buildIndex(fontes: Fonte[], capsulas: Capsula[]): { docs: Doc[]; df: Record<string, number>; n: number } {
  const docs: Doc[] = [];
  for (const f of fontes) {
    docs.push({
      id: 'f:' + f.id, kind: 'fonte', title: f.t, tags: (f.tg || []).concat(f.id), refs: [f.id], data: f,
      text: [f.t, (f.tg || []).join(' '), f.f, f.u, f.p, f.d, f.no].join(' '),
    });
  }
  for (const c of capsulas) {
    docs.push({ id: 'c:' + c.id, kind: 'capsula', title: c.q[0] || c.id, tags: (c.kw || []).concat(c.id), refs: c.refs, data: c, text: [c.q.join(' | '), (c.kw || []).join(' '), c.a].join(' ') });
  }
  const df: Record<string, number> = {};
  for (const d of docs) for (const w of new Set(tokens(d.text))) df[w] = (df[w] || 0) + 1;
  return { docs, df, n: docs.length };
}

export function search(q: string, idx: { docs: Doc[]; df: Record<string, number>; n: number }, k = 6) {
  const qt = tokens(q); if (!qt.length) return [];
  const avg = idx.docs.reduce((s, d) => s + tokens(d.text).length, 0) / Math.max(1, idx.n);
  const k1 = 1.5, b = 0.72;
  const scored = idx.docs.map((d) => {
    const toks = tokens(d.text); const tf: Record<string, number> = {};
    for (const w of toks) tf[w] = (tf[w] || 0) + 1;
    const title = new Set(tokens(d.title + ' ' + d.tags.join(' ')));
    let sc = 0;
    for (const w of qt) {
      const f = tf[w] || 0; if (!f) continue;
      const idf = Math.log(1 + (idx.n - (idx.df[w] || 0) + 0.5) / ((idx.df[w] || 0) + 0.5));
      sc += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (toks.length / avg))));
      if (title.has(w)) sc += idf * 1.6;
    }
    // bônus: capsulas respondem melhor; fonte A > C; antiguidade leve
    if (d.kind === 'capsula') sc *= 1.25;
    if (d.data?.e) sc *= { A: 1.18, B: 1.06, C: 1, D: 0.95, E: 0.9 }[d.data.e as string] || 1;
    const yr = Number(d.data?.y || 0); if (yr >= 2020) sc *= 1.06; if (yr >= 2024) sc *= 1.03;
    return { doc: d, score: sc };
  }).filter((x) => x.score > 0.6).sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export type Ctx = {
  alvos?: any; perfil?: any; gaps?: { label: string; atual: number; alvo: number; unit: string }[];
  hoje?: { agua?: number; kcal?: number; prot?: number; treino?: boolean; sonoH?: number; passos?: number };
  exames?: Record<string, number>;
};

const brl = (n: number, d = 0) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function personalize(ctx: Ctx, kind?: string): string[] {
  const out: string[] = [];
  const a = ctx.alvos, p = ctx.perfil, h = ctx.hoje || {};
  if (!a) return out;
  const peso = p?.peso ? `${p.peso} kg` : 'seu peso';
  if (kind === 'alvos' || kind === 'dieta') {
    out.push(`Para o seu perfil (${peso}, meta ${a.energia?.kcal ?? a.kcal ?? '?'} kcal): proteína ${a.proteina?.protein ?? a.prot} g/dia = ${a.proteina?.proteinPorRefeicao ?? Math.round((a.proteina?.protein ?? 150) / 4)} g em ${a.proteina?.refeicoes ?? 4} refeições (leucina-alvo ${a.proteina?.leucinaAlvo ?? 2.6} g).`);
    out.push(`Fibra ${a.proteina?.fibra ?? a.fibra} g · gordura ${a.proteina?.fat ?? a.fat} g (saturada < ${a.proteina?.saturadaMaxG ?? 27} g) · carboidrato ${a.proteina?.carb ?? a.carb} g.`);
  }
  if (kind === 'agua') out.push(`Sua meta de hidratação hoje: ${a.agua?.aBeberL != null ? brl(a.agua.aBeberL, 1) : '?'} L a beber (${a.agua?.copos ?? '?'} copos de ${a.agua?.copoMl ?? 250} mL), mais ~${brl(a.agua?.alimentosL ?? 0, 1)} L dos alimentos. Já bebeu ${brl(((h.agua ?? 0) * 0.25), 1)} L.`);
  if (kind === 'treino') {
    out.push(`Seu bloco atual: nível ${p?.nivel ?? 1}, ${p?.treinoDias ?? 3} sessões/semana, ${a.treino?.seriesPorGrupo ?? '10–12'} séries/semana por grupo, RIR 2 em compostos e 0–1 em isolados (Refalo 2023).`);
    if (h.treino === false) out.push('Hoje ainda não marcamos a sessão de força — 25 min já contam para a quest.');
  }
  if (kind === 'sono') out.push(`Sono: meta ${a.sono?.min ?? 7}–9 h com horário ±45 min. ${h.sonoH ? `Ontem ${brl(h.sonoH, 1)} h${h.sonoH < 6.5 ? ' — abaixo do limiar onde Nedeltcheva 2010 mostra pior partição de perda de peso.' : '.'}` : ''}`);
  if (kind === 'labs' && ctx.exames) {
    const ex = Object.entries(ctx.exames).map(([k, v]) => `${k}: ${v}`).join(' · ');
    if (ex) out.push(`Seus exames registrados (${ex}). Lembre: interpretação é do seu médico; o app só sinaliza padrões (ferritina <30, B12 <300, HbA1c ≥5,7%).`);
    else out.push('Nenhum exame registrado — o app sugere o painel anual na aba Evolução.');
  }
  if (kind === 'risco') out.push('Isto afeta um alerta do seu perfil: siga o aviso listado em Riscos antes de aplicar a dica geral.');
  if (ctx.gaps?.length) out.push('Lacunas de hoje: ' + ctx.gaps.map((g) => `${g.label} ${Math.round(g.atual)}/${Math.round(g.alvo)}${g.unit}`).join(' · '));
  return out.map((s) => s.replace(/(\d), 6/g, '$1,6'));
}

export type Resposta = { texto: string; refs: Fonte[]; capsula?: Capsula; confianca: number; followups: string[]; personalizadas: string[]; origem: 'base' | 'sem-correspondencia' | 'live' };

export function responder(q: string, idx: { docs: Doc[]; df: Record<string, number>; n: number }, fontes: Fonte[], ctx: Ctx, opts: { rigor?: boolean } = {}): Resposta {
  const hits = search(q, idx, opts.rigor ? 10 : 6);
  const byId = new Map(fontes.map((f) => [f.id, f]));
  const cap = hits.find((h) => h.doc.kind === 'capsula')?.doc.data as Capsula | undefined;
  const scoreMax = hits[0]?.score || 0;
  if (!hits.length || scoreMax < 1.4) {
    return {
      texto: 'Não encontrei nada na base local com segurança suficiente para responder isso (o app prefere dizer "não sei" a inventar). Posso: (1) buscar na literatura ao vivo pelo botão abaixo, (2) mostrar o que tenho sobre temas próximos, ou (3) te dizer que pergunta um humano deveria fazer. Se for sintoma, medicação ou resultado de exame, o caminho é profissional de saúde.',
      refs: [], confianca: 0.1, followups: ['proteína: quanto eu preciso', 'creatina serve para quem não come carne?', 'como ler um estudo', 'quanta água por dia'], personalizadas: [], origem: 'sem-correspondencia',
    };
  }
  const corpo = (cap?.a || (hits[0].doc.data.f ? `${hits[0].doc.data.f} ${hits[0].doc.data.u || ''}` : hits[0].doc.text.slice(0, 600))) as string;
  const ids = new Set<string>([...(cap?.refs || []), ...hits.filter((h) => h.doc.kind === 'fonte').map((h) => (h.doc.refs || [])[0])].filter(Boolean) as string[]);
  const refs = [...ids].map((i) => byId.get(i)).filter(Boolean).slice(0, 5) as Fonte[];
  const personalizadas = personalize(ctx, cap?.pers || 'alvos');
  const extras = hits.filter((h) => h.doc.kind === 'fonte' && h.doc.data.id !== refs[0]?.id).slice(0, opts.rigor ? 3 : 1)
    .map((h) => `↪ ${h.doc.data.t.slice(0, 90)} (${h.doc.data.y}, ${h.doc.data.j}): ${String(h.doc.data.f || '').slice(0, 220)}…`);
  const texto = [corpo, ...(extras.length ? ['Contexto adicional: ' + extras.join('  ')] : []), ...(personalizadas.length ? ['O que isso significa no seu caso:', ...personalizadas.map((p) => '• ' + p)] : [])].join('\n\n');
  const followups = hits.slice(1, 4).map((h) => h.doc.kind === 'capsula' ? h.doc.data.q[0] : `Por que ${String(h.doc.data.t).split(':')[0].toLowerCase()}?`);
  return { texto, refs, capsula: cap, confianca: Math.min(0.95, 0.42 + scoreMax / 12), followups, personalizadas, origem: 'base' };
}
