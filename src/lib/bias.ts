// Filtro de viés comercial — lógica pura (testável em Node, sem rede e sem JSON).
// As listas vêm de data/audits.json (módulo de auditoria) e são injetadas aqui.

export const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export type Listas = {
  bloqueio: string[]; observacao: string[]; publico: string[];
  desenho: { nome: string; p: number }[]; boasPraticas: string[];
};

export function listasDe(auditoria: any): Listas {
  const LF = auditoria?.listas_filtro || {};
  const pad = (k: string) => ((LF[k]?.padroes || []) as string[]).map(norm).filter((x) => x.length > 1);
  return {
    bloqueio: pad('bloqueio_recomendacao'),
    observacao: pad('sinalizacao_observacao'),
    publico: pad('preferencia_publicos'),
    desenho: Object.entries((LF.tipos_desenho_peso || {}) as Record<string, number>)
      .map(([nome, p]) => ({ nome, p: Number(p) || 0.5 })).sort((a, b) => b.nome.length - a.nome.length),
    boasPraticas: ((LF.desenhos_boas_praticas || []) as string[]).map(norm),
  };
}

export type Risco = 'baixo' | 'moderado' | 'alto' | 'retratado' | 'desconhecido';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Siglas curtas (DSM, ILSI, BSN) só batem por palavra inteira e só no nome do financiador —
 *  senão "dsm" casaria com qualquer coisa e o filtro viraria ruído. Nomes longos podem ser substring. */
export function batePadrao(alvoFunder: string, alvoTudo: string, p: string) {
  if (p.length <= 5) return new RegExp(`(^|[^a-z0-9])${esc(p)}([^a-z0-9]|$)`).test(alvoFunder);
  if (p.length <= 9) return new RegExp(`(^|[^a-z0-9])${esc(p)}([^a-z0-9]|$)`).test(alvoTudo);
  return alvoTudo.includes(p);
}

export function classificar(financ: { nome: string }[], titulo: string, revista: string, L: Listas) {
  const alvoFunder = norm(financ.map((f) => f.nome).join(' | '));
  const alvo = norm([alvoFunder, titulo, revista].join(' | '));
  const achado = (lista: string[]) => lista.find((p) => batePadrao(alvoFunder, alvo, p));
  const bate = achado(L.bloqueio);
  if (bate) return { risco: 'alto' as Risco, motivo: `financiador na lista de bloqueio: "${bate}"`, sinal: '🚫 não usar como base de recomendação', peso: 0.15 };
  if (financ.some((f) => /retract/i.test(f.nome))) return { risco: 'retratado' as Risco, motivo: 'registro de retratação nos metadados', sinal: '🚫 retratado', peso: 0 };
  const obs = achado(L.observacao);
  if (obs) return { risco: 'moderado' as Risco, motivo: `financiador em monitoramento: "${obs}"`, sinal: '⚠️ ler a seção de conflitos', peso: 0.6 };
  const pub = achado(L.publico);
  if (pub) return { risco: 'baixo' as Risco, motivo: `financiador público/terceiro setor: "${pub}"`, sinal: '✅ sem conflito setorial', peso: 1.15 };
  if (!financ.length) return { risco: 'desconhecido' as Risco, motivo: 'nenhum financiador declarado nos metadados — confira a seção "Funding" do artigo', sinal: '❔ verificar', peso: 0.85 };
  return { risco: 'baixo' as Risco, motivo: 'sem financiador setorial nos metadados', sinal: '✅ ok', peso: 1 };
}

export function pesoDesign(texto: string, L: Listas) {
  const t = norm(texto);
  const d = L.desenho.find((x) => x.nome.split('/').some((parte) => t.includes(norm(parte.trim()))));
  if (!d) return { nome: 'desenho não identificado no metadado', p: 0.5 };
  const bonus = L.boasPraticas.some((b) => t.includes(b)) ? 1.12 : 1;
  return { nome: d.nome, p: Math.min(1.15, d.p * bonus) };
}

export type Candidato = { id?: string; titulo: string; tipo?: string; ano?: number; citacoes?: number; doi?: string; url?: string; resumo?: string; revista?: string; financ: { nome: string; fonte?: string }[]; autores?: string[] };
export type Pontuado = Candidato & { risco: Risco; motivo: string; sinal: string; design: string; peso: number };

export function pontuar(lista: Candidato[], L: Listas, opts: { excluirSetorial?: boolean } = {}): Pontuado[] {
  const out = lista.map((c) => {
    const cls = classificar(c.financ || [], c.titulo, c.revista || '', L);
    const des = pesoDesign([c.tipo, c.titulo].join(' '), L);
    const ano = Number(c.ano || 0);
    const recencia = ano >= 2021 ? 1.1 : ano >= 2015 ? 1 : ano >= 2005 ? 0.9 : 0.78;
    const cites = Math.log10(1 + (c.citacoes || 0)) / 4;
    const peso = Math.round(cls.peso * des.p * recencia * (1 + Math.min(0.5, cites)) * 100) / 100;
    return { ...c, risco: cls.risco, motivo: cls.motivo, sinal: cls.sinal, design: des.nome, peso };
  });
  const filtrada = opts.excluirSetorial ? out.filter((t) => t.risco !== 'alto' && t.risco !== 'retratado') : out;
  return [...filtrada].sort((a, b) => b.peso - a.peso);
}
