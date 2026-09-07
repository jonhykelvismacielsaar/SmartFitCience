// Agenda de lembretes que não desiste: evento vence → dispara → só para quando você confirma (ou adia, com backoff).
// Fonte do comportamento: Lally 2010 (hábito = contexto + repetição, média 66 dias) e Michie 2009
// (auto-monitoramento funciona quando é imediato e exige registro). A parte "não para até confirmar" é
// escolha de produto sua; por isso o app tem "modo gentil" para refeição (3×/dia, sem bloqueio) e limites de spam.

export type TipoAlerta = 'agua' | 'refeicao' | 'treino' | 'sono' | 'mente' | 'checar' | 'meta';
export type Evento = { id: string; tipo: TipoAlerta; hora: number; rotulo: string; detalhe?: string; dados?: any; peso?: number };

export type Regras = {
  intervaloAdiamento: number; // minutos do 1º adiamento; cresce 6→10→15 (backoff)
  maxAdiamentos: number;
  gentil: boolean; // modo gentil: refeição/sono avisam no máximo 3× e não cobram foto
  silenciosoEntre: [number, number] | null; // janela sem som (ex.: reunião)
  som: boolean; vibrar: boolean; notificacoes: boolean;
};

export const REGRAS_PADRAO: Regras = {
  intervaloAdiamento: 6, maxAdiamentos: 4, gentil: false, silenciosoEntre: null, som: true, vibrar: true, notificacoes: false,
};

const toMin = (s: string) => { const [h, m] = String(s || '07:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Monta os eventos do dia a partir das metas (água em copos, janelas de refeição, treino, desligar). */
export function eventosDoDia(metas: any, prefs: Partial<Regras> = {}, opts: { treinoAgora?: boolean; diaKey?: string } = {}): Evento[] {
  const r = { ...REGRAS_PADRAO, ...(prefs as any) };
  const evs: Evento[] = [];
  const ag = metas?.agenda || { wake: 420, sleep: 1380, refeicoes: [], alerts: [] };
  const copos = metas?.agua?.copos || 8;
  // água: distribuída entre acordar+1h e dormir-1h30
  const inicio = (ag.wake ?? 420) + 60, fim = (ag.sleep ?? 1380) - 90;
  const passo = Math.max(30, Math.floor((fim - inicio) / Math.max(1, copos)));
  for (let i = 0; i < copos; i++) {
    evs.push({ id: `agua-${i + 1}`, tipo: 'agua', hora: inicio + i * passo, rotulo: `Água ${i + 1}/${copos}`, detalhe: `+1 copo de 250 mL · meta do dia ${metas?.agua?.aBeberL ?? '?'} L`, dados: { copo: i + 1 }, peso: 1 });
  }
  for (const j of ag.refeicoes || []) {
    evs.push({ id: `ref-${j.nome}`, tipo: 'refeicao', hora: j.hora ?? toMin(j.hhmm), rotulo: j.nome, detalhe: r.gentil ? 'Comer com calma: proteína + fibra. Sem pressa.' : 'Registrar a refeição e bater a meta de proteína da refeição.', dados: { slot: j.nome }, peso: 2 });
  }
  if (opts.treinoAgora) {
    evs.push({ id: 'treino', tipo: 'treino', hora: inicio + 120, rotulo: 'Treino de força', detalhe: 'Sessão do seu nível. 25–45 min. Marca quando terminar — o XP é da sessão completa.', peso: 3 });
  }
  evs.push({ id: 'noite', tipo: 'sono', hora: (ag.sleep ?? 1380) - 45, rotulo: 'Desacelerar', detalhe: 'Luz baixa, celular fora do alcance, última cafeína foi ' + (metas?.sono?.cafeUltima || '15:00') + '.', peso: 2 });
  evs.push({ id: 'mente', tipo: 'mente', hora: (ag.sleep ?? 1380) - 60, rotulo: 'Corpo leve, mente em paz', detalhe: '5 min de respiração ou alongamento. Goyal 2014: efeito moderado sobre ansiedade/estresse — não é "esvaziar a mente".', peso: 1 });
  evs.push({ id: 'checar', tipo: 'checar', hora: (ag.sleep ?? 1380) - 20, rotulo: 'Fechamento do dia', detalhe: 'Peso (opcional), passos, humor e foto de progresso (opcional). 60 segundos.', peso: 2 });
  if (r.gentil) {
    // modo gentil: no máximo 3 avisos de comida no dia, nada de cobrança depois das 22h
    const refs = evs.filter((e) => e.tipo === 'refeicao').slice(0, 3);
    return evs.filter((e) => e.tipo !== 'refeicao' || refs.includes(e)).filter((e) => !(e.tipo === 'checar' && (e.hora ?? 0) > 1320));
  }
  return evs.sort((a, b) => a.hora - b.hora);
}

export type EstadoAlerta = { feitos: string[]; adiamentos: Record<string, number>; tocados: Record<string, number> };

export function pendentes(evs: Evento[], agoraMin: number, est: EstadoAlerta, r: Regras = REGRAS_PADRAO) {
  const vencidos = evs.filter((e) => {
    if (est.feitos.includes(e.id)) return false;
    const toques = est.tocados[e.id] || 0;
    const tol = r.gentil && e.tipo === 'refeicao' ? 1 : r.maxAdiamentos;
    if (toques > tol) return false;
    const atraso = (e.hora ?? 0) + adiamentoDe(est.adiamentos[e.id] || 0, r);
    return agoraMin >= atraso;
  });
  const ativos = vencidos.sort((a, b) => (b.peso || 0) - (a.peso || 0) || a.hora - b.hora);
  const proximo = evs.filter((e) => !est.feitos.includes(e.id) && e.hora > agoraMin).sort((a, b) => a.hora - b.hora)[0] || null;
  return { ativos, proximo };
}

/** Backoff do adiamento: 6 → 10 → 15 → 20 min. Insiste, sem virar tortura. */
export function adiamentoDe(n: number, r: Regras = REGRAS_PADRAO) {
  if (!n) return 0;
  const base = r.intervaloAdiamento;
  return [base, base + 4, base + 9, base + 14, 30][Math.min(n, 5)] * 1;
}

export function silencia(agoraMin: number, r: Regras) {
  if (!r.silenciosoEntre) return false;
  const [a, b] = r.silenciosoEntre;
  return a <= b ? agoraMin >= a && agoraMin <= b : agoraMin >= a || agoraMin <= b;
}

/** XP das regras do program.json (com multiplicador de streak aplicado pelo chamador). */
export function xpRegra(regras: any, chave: string, n = 1, extra = 0): number {
  const r = regras?.[chave];
  if (r == null) return 0;
  if (typeof r === 'number') return Math.round(r * n);
  const base = Number(r.base ?? r.xp ?? r.por_unidade ?? 0) || 0;
  const bonus = (Number(r.bonus ?? r.bônus_por_série_valida ?? 0) || 0) * extra;
  const cap = Number(r.cap ?? r.cap_por_dia ?? r.cap_por_sessao ?? Infinity);
  return Math.round(Math.min(Number.isFinite(cap) ? cap : Infinity, base * n + bonus));
}

export const rotuloTipo: Record<TipoAlerta, string> = {
  agua: '💧 água', refeicao: '🍽 refeição', treino: '🏋️ treino', sono: '🌙 sono', mente: '🧘 mente', checar: '📋 fechamento', meta: '🎯 meta',
};

/** Texto da cobrança (o "OK ou adiar"), sempre com o porquê científico curto. */
export function cobraca(e: Evento, toques: number, metas: any): { titulo: string; corpo: string; acoes: { id: string; rotulo: string }[] } {
  const coposRestantes = metas?.agua?.copos || 8;
  const base = {
    agua: {
      titulo: `Copinho ${e.dados?.copo || ''} de ${metas?.agua?.copoMl || 250} mL`,
      corpo: `${e.detalhe} Meta de ${coposRestantes} copos de ${metas?.agua?.copoMl || 250} mL distribuídos no dia. Beber 500 mL antes das refeições aumentou a perda em ~2 kg em 12 semanas em idosos com sobrepeso (Dennis 2010) — e sede nem sempre avisa a tempo em dia quente.`,
    },
    refeicao: {
      titulo: `${e.rotulo}: bota comida no diário`,
      corpo: `${e.detalhe} ${e.dados?.slot === 'Café da manhã' ? 'Se pular, a fome chega tarde e a proteína do dia não fecha em 30–40 g por refeição.' : 'Anotar leva 15 s e é o que mais prevê mudança de comportamento (Michie 2009).'}`,
    },
    treino: { titulo: 'Sessão de força te espera', corpo: 'Duas séries a mais com RIR 2 valem mais que uma sessão épica e três dias parado (Refalo 2023; Schoenfeld 2017). Se estiver moído, faz a versão reduzida — o app aceita.' },
    sono: { titulo: 'Desacelerar agora', corpo: 'Luz apagada/âmbar e quarto frio. Dormir 5,5 h em vez de 8,5 h fez a perda de peso vir ~55% de massa magra (Nedeltcheva 2010).' },
    mente: { titulo: 'Corpo leve, mente em paz', corpo: 'Respiração 4–6 (4 s inspira, 6 s expira) por 5 min, ou 10 min de alongamento assistindo algo. Meditação tem efeito moderado sobre ansiedade e estresse (Goyal 2014) — e exercício para depressão tem tamanho de efeito maior que antidepressivo em meta-análise (Noetel 2024).' },
    checar: { titulo: 'Fechar o dia (60 s)', corpo: 'Peso só se você quiser; passos, humor e foto de progresso são opcionais. Nada aqui é obrigatório — exceto o "ok" de que você viu.' },
    meta: { titulo: 'Meta do dia', corpo: 'Falta pouco pra fechar o dia. Confirmar aqui conta XP de consistência.' },
  }[e.tipo] || { titulo: e.rotulo, corpo: e.detalhe || '', acoes: [] };
  const insist = toques >= 1 ? ` (aviso nº ${toques + 1} — o app para quando você responder)` : '';
  return {
    titulo: base.titulo + insist, corpo: base.corpo,
    acoes: [
      { id: 'ok', rotulo: e.tipo === 'agua' ? 'Bebi ✓' : e.tipo === 'treino' ? 'Treino feito ✓' : 'Ok, fiz ✓' },
      { id: 'adiar', rotulo: toques >= 2 ? 'Adiar 20 min' : 'Adiar 10 min' },
      ...(e.tipo === 'refeicao' ? [{ id: 'pular', rotulo: 'Já comi / não vou comer agora' }] : []),
      ...(e.tipo === 'treino' ? [{ id: 'reduzida', rotulo: 'Fazer versão reduzida' }] : []),
    ],
  };
}
