// SmartFit Science — motor de cálculo (funções puras: sem DOM, sem fetch, testável em Node).
// Toda constante relevante referencia a base de evidências (data/sources).

export type Sex = 'm' | 'f' | 'other';
export type DietType = 'omni' | 'pesc' | 'lacto_ovo' | 'ovo' | 'lacto' | 'veg';
export type Goal = 'perder_gordura' | 'recomposicao' | 'ganhar_massa' | 'saude';

export const ACTIVIDADE = [
  { v: 1, nome: 'Sedentário', desc: 'trabalho sentado, pouco passo', f: 1.2 },
  { v: 2, nome: 'Leve', desc: '1–3 dias de treino leve, 4–7 mil passos', f: 1.375 },
  { v: 3, nome: 'Moderado', desc: '3–5 treinos, 7–10 mil passos', f: 1.55 },
  { v: 4, nome: 'Intenso', desc: '6–7 treinos ou trabalho físico', f: 1.725 },
  { v: 5, nome: 'Atleta', desc: '2 sessões/dia, carga alta', f: 1.9 },
];

export const NIVEIS_DIETA: Record<DietType, { nome: string; flags: string[]; vegProteinAdj: number }> = {
  omni: { nome: 'Onívoro', flags: ['v', 'l', 'o', 'p', 'a'], vegProteinAdj: 0 },
  pesc: { nome: 'Pescetariano', flags: ['v', 'l', 'o', 'p'], vegProteinAdj: 0 },
  lacto_ovo: { nome: 'Lacto-ovo-vegetariano', flags: ['v', 'l', 'o'], vegProteinAdj: 0.1 },
  ovo: { nome: 'Ovo-vegetariano', flags: ['v', 'o'], vegProteinAdj: 0.15 },
  lacto: { nome: 'Lacto-vegetariano', flags: ['v', 'l'], vegProteinAdj: 0.15 },
  veg: { nome: 'Vegano', flags: ['v'], vegProteinAdj: 0.2 },
};

export const DIET_PERMITIDAS: Record<DietType, string[]> = {
  omni: ['v', 'l', 'o', 'p', 'a'], pesc: ['v', 'l', 'o', 'p'], lacto_ovo: ['v', 'l', 'o'],
  ovo: ['v', 'o'], lacto: ['v', 'l'], veg: ['v'],
};

export const alimentosPermitidos = (flags: string, diet: DietType) => {
  const ok = DIET_PERMITIDAS[diet] || [];
  return flags.split('').every((c) => ok.includes(c));
};

const round = (n: number, d = 0) => { const p = 10 ** d; return Math.round(n * p) / p; };

/** Idade a partir do ano de nascimento (e mês, se informado). */
export function idade(birth: string, hoje = new Date()): number {
  if (!birth) return 30;
  const [y, m = 1, d = 1] = String(birth).split('-').map(Number);
  let i = hoje.getFullYear() - y;
  const bm = hoje.getMonth() + 1 - m;
  if (bm < 0 || (bm === 0 && hoje.getDate() < d)) i--;
  return Math.max(10, Math.min(105, i));
}

/** Massa magra estimada por US Navy (dobras simplificado: circunferências). */
export function gorduraPct({ sex, altura, peso, pescoco, cintura, quadril }: { sex: Sex; altura: number; peso: number; pescoco?: number; cintura?: number; quadril?: number }): number | null {
  if (!altura || !peso) return null;
  if (sex === 'f') {
    if (!cintura || !pescoco || !quadril) return null;
    // US Navy (mulheres): usa cintura, pescoço e quadril em cm
    const bf = 495 / (2.80246 - 2.09239 * Math.log10(Math.max(1, cintura - pescoco)) + 0.36394 * Math.log10(Math.max(1, quadril))) - 450;
    return clamp(bf, 6, 65);
  }
  // Homens / outros: 86.010*log10(cintura-pescoco) - 70.041*log10(altura) + 36.76 + correção de IMC baixa
  if (!cintura || !pescoco) return null;
  const bf = 86.010 * Math.log10(Math.max(1, cintura - pescoco)) - 70.041 * Math.log10(Math.max(1, altura)) + 36.76;
  return clamp(bf, 3, 60);
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Taxa metabólica basal. Mifflin-St Jeor (Mifflin1990) e Katch-McArdle quando há %GC confiável. */
export function geb({ sexo, peso, altura, idade: id, gorduraPct: bf }: { sexo: Sex; peso: number; altura: number; idade: number; gorduraPct?: number | null }) {
  const mifflin = 10 * peso + 6.25 * altura - 5 * id + (sexo === 'f' ? -161 : 5);
  const katch = bf && bf > 3 ? 370 + 21.6 * (peso * (1 - bf / 100)) : null;
  const usado = katch ? Math.round((katch + mifflin) / 2) : Math.round(mifflin);
  return { mifflin: Math.round(mifflin), katch: katch ? Math.round(katch) : null, valor: usado,
    nota: katch ? 'Média de Mifflin-St Jeor (validado) e Katch-McArdle (usa massa magra — bom se sua bioimpedância/dobras são confiáveis). (Mifflin1990)' : 'Mifflin-St Jeor — padrão recomendado; margem de erro individual de ±10–20%.' };
}

export function getmetabolico(bmr: number, atividade: number) {
  const a = ACTIVIDADE.find((x) => x.v === atividade) || ACTIVIDADE[1];
  return { valor: Math.round(bmr * a.f + bmr * 0.085), fator: a.f, eat: Math.round(bmr * 0.085), nome: a.nome };
}

/** Alvo calórico com teto de taxa de perda/ganho e pisos de segurança (Helms2014; Thomas2012). */
export function alvoEnergia(tdee: number, goal: Goal, p: { peso: number; altura: number; sexo: Sex; idade: number; condicoes: string[]; bf?: number | null }) {
  const imc = p.peso / (p.altura / 100) ** 2;
  const gestante = p.condicoes.includes('gestante') || p.condicoes.includes('lactante');
  const tca = p.condicoes.includes('tca');
  let kcal = tdee, rate = 0, racional = 'Manutenção: mesmo gasto estimado, com ajuste por tendência de peso em 14 dias.';
  const pisoMulher = Math.max(1200, 22 * p.peso * 0.9);
  const pisoHomem = Math.max(1500, 22 * p.peso * 0.9);
  const piso = p.sexo === 'f' ? pisoMulher : pisoHomem;
  if (goal === 'perder_gordura' && !gestante) {
    const pct = imc >= 30 ? 0.8 : imc >= 25 ? 0.6 : 0.4; // % peso corporal/semana
    const deficitKg = p.peso * (pct / 100);
    rate = -pct;
    kcal = tdee - clamp((deficitKg * 7700) / 7, 250, Math.max(400, tdee - piso));
    if (kcal < piso) kcal = Math.round(piso);
    racional = `Déficit de ~${deficitKg.toFixed(1)} kg/semana (${pct}% do peso) — teto para preservar massa magra (Helms2014). A adaptação metabólica reduz ~40–60% da perda projetada em meses (Thomas2012), por isso o app ajusta por tendência, não por fórmula.`;
  } else if (gestante) {
    kcal = tdee + 300;
    racional = 'Gestante/lactante: sem déficit. Incremento de ~300 kcal/d no 2º/3º trimestre (ou lactância) e foco em B12, iodo, ferro, DHA e proteína; condução é do pré-natal (AND 2016). O app só registra e lembra, não restringe.';
  } else if (goal === 'ganhar_massa' && !gestante) {
    const pct = (p.bf ?? (imc < 22 ? 0.35 : 0.3)) <= 0.3 ? 0.35 : 0.25;
    rate = p.bf != null ? (p.bf < (p.sexo === 'f' ? 26 : 18) ? 0.5 : 0.25) : pct;
    kcal = tdee + (p.peso * rate / 100 * 7700) / 7;
    racional = `Superávit de ~${rate}% do peso/semana: acima disso a partição pende para gordura (Helms2014). Ganho realista de 0,25–0,5%/sem.`;
  } else if (goal === 'recomposicao') {
    kcal = Math.round(tdee - (imc > 25 ? 0.05 : 0) * tdee);
    racional = 'Recomposição: manutenção ou déficit muito pequeno (0–5%), proteína alta e treino progressivo. Funciona melhor em novatos, retorno pós-pausa, IMC>27 ou %GC alto (Longland2016).';
    rate = imc > 25 ? -0.15 : 0;
  }
  if (tca) { kcal = Math.max(kcal, Math.round(tdee * 0.95)); rate = 0; racional = 'Histórico de transtorno alimentar: modo não-dietário — metas de nutriente e de treino, sem restrição calórica e sem balança diária. Trabalhe com profissional.'; }
  return { kcal: Math.round(kcal / 5) * 5, rate: round(rate, 2), racional, piso: Math.round(piso), imc: round(imc, 1) };
}

/** Distribuição de macros (Morton2018; Clarys2014; VanVliet2016; AHA2026; Peos2021). */
export function macros(kcal: number, peso: number, opts: {
  goal: Goal; diet: DietType; treinoDias: number; idade: number; condicoes: string[]; meals?: number; intensidade?: 'leve' | 'mod' | 'alta';
}) {
  const adj = NIVEIS_DIETA[opts.diet]?.vegProteinAdj ?? 0;
  const deficit = opts.goal === 'perder_gordura';
  let gKg = deficit ? 2.15 : opts.goal === 'ganhar_massa' ? 1.8 : opts.goal === 'recomposicao' ? 2.0 : 1.6;
  if (opts.idade >= 60) gKg = Math.max(gKg, 1.8);
  if (opts.condicoes.includes('drc')) gKg = Math.min(gKg, 1.0);
  gKg = round(gKg + (deficit ? adj + 0.1 : adj), 2);
  const prot = Math.round(peso * gKg);
  let fatKg = opts.condicoes.includes('drc') ? 0.8 : 0.9;
  let fat = Math.round(peso * fatKg);
  const minFatKcal = kcal * 0.2;
  if (fat * 9 < minFatKcal) fat = Math.round(minFatKcal / 9);
  const maxFatKcal = kcal * (opts.condicoes.includes('dislipidemia') ? 0.28 : 0.33);
  if (fat * 9 > maxFatKcal) fat = Math.round(maxFatKcal / 9);
  let carb = Math.max(40, Math.round((kcal - prot * 4 - fat * 9) / 4));
  const gKgCarb = round(carb / peso, 1);
  if (gKgCarb < 2 && opts.treinoDias >= 4 && !deficit) { fat = Math.max(Math.round(peso * 0.7), fat - 10); carb = Math.round((kcal - prot * 4 - fat * 9) / 4); }
  const fibra = Math.round(clamp(14 * (kcal / 1000) + (['veg', 'lacto', 'ovo', 'lacto_ovo'].includes(opts.diet) ? 6 : 0), 25, 45));
  const porRefeicao = [3, 4, 5].includes(Number(opts.meals)) ? Number(opts.meals) : 4;
  return {
    kcal, protein: prot, proteinPerKg: gKg, fat, fatPerKg: round(fat / peso, 2), carb, carbPerKg: gKgCarb, fibra,
    refeicoes: porRefeicao, proteinPorRefeicao: Math.round(prot / porRefeicao),
    leucinaAlvo: opts.idade >= 50 ? 3.2 : 2.6,
    saturadaMaxG: Math.round((kcal * 0.1) / 9),
    obs: `Proteína ${gKg} g/kg: platô de Morton 2018 em ~1,6; elevado em déficit e quando >70% vem de plantas (+${adj} g/kg, Clarys 2014). Gordura ≥${round(minFatKcal / 9 / peso, 2)} g/kg para hormônios; carboidrato ${gKgCarb} g/kg conforme volume de treino (Peos 2021).`,
  };
}

/** Metas de água (EFSA2010; Dennis2010; Thomas2016). */
export function agua(kcal: number, peso: number, opts: { treinoMin: number; calor: number; suorAlto?: boolean }) {
  const base = peso * 0.032; // L
  const treino = (opts.treinoMin / 60) * 0.6;
  const clima = opts.calor * 0.7;
  const total = Math.round((base + treino + clima) * 10) / 10;
  const alimentos = round(total * 0.25, 1);
  const copos = Math.max(4, Math.round(((total - alimentos) * 1000) / 250));
  return {
    totalL: Math.max(1.5, total), alimentosL: alimentos, aBeberL: round(total - alimentos, 1), copos,
    copoMl: 250, porHora: Math.max(1, Math.round((total - alimentos) / Math.max(1, 13))),
    nota: `Base 32 mL/kg + 0,6 L/h de treino + efeito do calor. ~25% já vem dos alimentos (EFSA 2010). Urina amarelo-clara e sede mandam mais que o número.`,
  };
}

export function micronutrientes(diet: DietType, sexo: Sex, idade: number, peso: number, condicoes: string[], kcal: number) {
  const fem = sexo === 'f';
  const ironRda = idade >= 51 && fem ? 8 : fem ? 18 : 8;
  const veg = diet === 'veg' || diet === 'lacto' || diet === 'ovo' || diet === 'lacto_ovo';
  const noMeat = diet !== 'omni';
  const iron = { alvo: Math.round(ironRda * (veg ? 1.8 : 1) * 10) / 10, porQue: veg ? 'RDA ×1,8 em dieta sem ferro heme (Hurrell & Egli 2010).' : 'RDA padrão; mantenha vitamina C junto das refeições.' };
  const semCarne = diet === 'veg' || diet === 'lacto' || diet === 'ovo' || diet === 'lacto_ovo';
  const b12sup = diet === 'veg' ? 'cianocobalamina 500 µg/d ou 2 000 µg 2×/semana (obrigatório em dieta vegana)'
    : semCarne ? 'suplementar se <2 porções de lácteo/ovo por dia (500 µg/d é barato e resolve)' : undefined;
  const omegaSup = diet === 'veg' ? '250–500 mg/d de EPA+DHA de alga' : semCarne ? '250–500 mg/d de alga recomendável (conversão de ALA é limitada)' : undefined;
  const itens: { id: string; nome: string; unidade: string; alvo: number; fonte: string[]; suplementar?: string; status: 'ok' | 'atencao' | 'critico' }[] = [
    { id: 'calcio', nome: 'Cálcio', unidade: 'mg', alvo: idade >= 51 && fem ? 1200 : idade >= 71 ? 1200 : 1000, fonte: ['tofu coalhado em cálcio', 'couve/brócolis/bok choy', 'feijão-branco', 'bebidas fortificadas', 'sardinha com espinha', 'laticínios (se consumir)'], suplementar: diet === 'veg' ? 'considere 300–500 mg/d só se a dieta não fechar — não acima de ~1 000 mg/d de fonte isolada' : undefined, status: diet === 'veg' ? 'atencao' : 'ok', },
    { id: 'ferro', nome: 'Ferro', unidade: 'mg', alvo: iron.alvo, fonte: ['lentilha', 'grão-de-bico', 'tofu', 'aveia', 'castanha-de-caju', 'folhas verdes'], suplementar: 'somente com exame (ferritina)', status: fem && !condicoes.includes('menopausa') ? 'atencao' : 'ok', },
    { id: 'b12', nome: 'Vitamina B12', unidade: 'µg', alvo: 2.4, fonte: ['laticínios', 'ovos', 'peixe', 'nutritional yeast fortificada (ver rótulo)'], suplementar: b12sup, status: diet === 'veg' ? 'critico' : veg ? 'atencao' : 'ok', },
    { id: 'iodo', nome: 'Iodo', unidade: 'µg', alvo: condicoes.includes('gestante') ? 220 : 150, fonte: ['sal iodado (40–60 µg/g)', 'laticínios', 'peixe', 'ovo'], suplementar: diet === 'veg' ? 'multimineral com 150 µg/d ou ½ col. chá de sal iodado/d' : undefined, status: diet === 'veg' ? 'atencao' : 'ok', },
    { id: 'zinco', nome: 'Zinco', unidade: 'mg', alvo: Math.round((fem ? 8 : 11) * (veg ? 1.5 : 1)), fonte: ['semente de abóbora', 'grão-de-bico', 'aveia', 'castanha-de-caju', 'carne (se consumir)'], status: veg ? 'atencao' : 'ok' },
    { id: 'omega3', nome: 'Ômega-3 (ALA)', unidade: 'g', alvo: fem ? 1.1 : 1.6, fonte: ['linhaça moída 1 col. sopa', 'chia', 'nozes 25 g', 'canola'], suplementar: diet === 'pesc' ? undefined : omegaSup, status: noMeat ? 'atencao' : 'ok', },
    { id: 'vitd', nome: 'Vitamina D', unidade: 'UI', alvo: idade >= 71 ? 1500 : 1000, fonte: ['sol 10–20 min', 'peixe gordo', 'gema', 'fortificados'], suplementar: '1 000–2 000 UI/d se baixa exposição solar, pele morena, idoso ou deficiência; não fazer em megadose sem exame (VITAL 2022)', status: 'atencao' },
    { id: 'sodio', nome: 'Sódio', unidade: 'mg', alvo: 1800, fonte: ['preferir comida in natura; cuidado com tempero pronto, pão, embutido, queijos'], status: 'ok' },
    { id: 'potassio', nome: 'Potássio', unidade: 'mg', alvo: fem ? 3500 : 4700, fonte: ['feijão/lentilha', 'batata-doce', 'banana', 'abacate', 'folhas verdes'], status: condicoes.includes('drc') ? 'critico' : 'ok' },
    { id: 'fibra', nome: 'Fibra', unidade: 'g', alvo: Math.round(clamp(14 * kcal / 1000, 25, 45)), fonte: ['leguminosas', 'aveia', 'integral', 'fruta com casca', 'semente'], status: 'ok' },
    { id: 'selenio', nome: 'Selênio', unidade: 'µg', alvo: 55, fonte: ['1–2 castanhas-do-pará/dia', 'castanha-de-caju', 'aveia', 'ovo/lácteo/carne'], status: diet === 'veg' ? 'atencao' : 'ok' },
    { id: 'colina', nome: 'Colina', unidade: 'mg', alvo: condicoes.includes('gestante') ? 450 : fem ? 425 : 550, fonte: ['ovo', 'fígado (onívoro)', 'soja', 'brócolis', 'trigo-sarraceno', 'amendoim'], status: diet === 'veg' ? 'atencao' : 'ok' },
  ];
  return { itens, vegProteinAdj: NIVEIS_DIETA[diet].vegProteinAdj, obs: `Fatores de ajuste por padrão ${NIVEIS_DIETA[diet].nome}: ${veg ? 'ferro ×1,8; zinco ×1,5; B12/iodo/ômega-3 no radar (Hurrell 2010; AND 2016; Rogerson 2021).' : 'foco em fibra, potássio e redução de processados (AHA 2026; OMS 2013).'}` };
}

export function riscos(p: { condicoes: string[]; sexo: Sex; idade: number; imc: number; cintura?: number; altura?: number; pressao?: [number, number]; ferritina?: number; b12?: number }) {
  const out: { id: string; nivel: 'info' | 'atencao' | 'acao'; titulo: string; texto: string; bloqueios: string[] }[] = [];
  const c = p.condicoes;
  if (c.includes('gestante')) out.push({ id: 'gest', nivel: 'acao', titulo: 'Gestação/lactação', texto: 'Sem déficit calórico. Iodo 220–290 µg, B12 obrigatório em dieta veg, ferro e DHA monitorados. Pré-natal com profissional — o app é registro, não condução.', bloqueios: ['deficit', 'jejum', 'termogenicos'] });
  if (c.includes('drc')) out.push({ id: 'drc', nivel: 'acao', titulo: 'Doença renal', texto: 'Proteína, potássio e cálcio devem ser definidos com o nefrologista — o app reduz o alvo para 0,8–1,0 g/kg e desliga a meta alta de potássio.', bloqueios: ['potassio_alto', 'proteina_alta'] });
  if (c.includes('dm2')) out.push({ id: 'dm', nivel: 'atencao', titulo: 'Diabetes', texto: 'Dieta vegetal de baixo teor de gordura e alta fibra melhora HbA1c e sensibilidade insulínica (Kahleova/Barnard). Cuidado com carboidrato em déficit e com hipoglicemia se você usa insulina/sulfonilureia: ajuste com médico.', bloqueios: [] });
  if (c.includes('tca')) out.push({ id: 'tca', nivel: 'acao', titulo: 'Histórico de transtorno alimentar', texto: 'Modo não-dietário: sem contagem de calorias diárias, pesagem semanal opcional, check-ins sem exigência de foto e lembretes de comida gentis (3×/dia, sem bloqueio).', bloqueios: ['kcal', 'balanca_diaria', 'foto_obrigatoria'] });
  if (c.includes('hipertensao')) out.push({ id: 'pas', nivel: 'atencao', titulo: 'Pressão arterial', texto: 'Potássio (Aburto 2013) + sódio <2 g + ≤500 g/semana de vermelha + sono 7 h. Saleiro com KCl só se rim normal. Meça em casa 2×/semana.', bloqueios: [] });
  if (c.includes('dislipidemia')) out.push({ id: 'ldl', nivel: 'atencao', titulo: 'Colesterol alto', texto: 'Kit: 50 g oleaginosas, 20 g proteína de soja, 10–20 g fibra viscosa (aveia/psyllium) e stanóis — reduz LDL ~10–14% (Jenkins 2019). Saturada <10% (AHA 2026). LDL muito alto ou Lp(a) alta exige médico.', bloqueios: [] });
  if (p.imc >= 40 || p.imc < 18.5) out.push({ id: 'imc', nivel: 'acao', titulo: p.imc < 18.5 ? 'IMC baixo' : 'IMC muito alto', texto: p.imc < 18.5 ? 'Meta de manutenção/superávit, osso e hormônio em risco (ver Tong 2020). Procure acompanhamento.' : 'Déficit conservador (0,5–0,8%/sem) e foco inicial em caminhada/Z2 + força para articular bem. Exames antes de suplementar à vontade.', bloqueios: p.imc < 18.5 ? ['deficit'] : [] });
  if (p.cintura && p.altura && p.cintura / p.altura > 0.55) out.push({ id: 'wc', nivel: 'atencao', titulo: 'Circunferência/altura elevada', texto: 'Cintura/altura >0,5 é marcador simples de risco metabólico; use como métrica de evolução junto com peso.', bloqueios: [] });
  if (p.ferritina != null && p.ferritina < 30) out.push({ id: 'fer', nivel: 'atencao', titulo: 'Ferritina baixa', texto: `<30 ng/mL: reforce vitamina C + ferro alimentar e converse com profissional sobre suplementação (não por conta própria).`, bloqueios: [] });
  if (p.b12 != null && p.b12 < 300) out.push({ id: 'b12', nivel: 'acao', titulo: 'B12 baixa', texto: 'Suplementar é óbvio, mas procure médico para investigar causa (gástrica? medicações?) e dose correta.', bloqueios: [] });
  if (p.idade >= 65) out.push({ id: 'ido', nivel: 'info', titulo: '65+', texto: 'Proteína 1,4–1,8 g/kg com ≥35 g/refeição, leucina ≥3 g, força 2×/sem + equilíbrio + potência; vitamina D e cálcio (Bauer 2013).', bloqueios: [] });
  return out;
}

/** Estrutura de horários do dia (sono + refeições + lembretes). */
export function agenda(o: { acorda: string; dormir: string; agua: ReturnType<typeof agua>; treinoMin: number; refeições: number; calor: boolean }, preferido?: string) {
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const wake = toMin(o.acorda || '07:00'), sleep = toMin(o.dormir || '23:00');
  const fim = sleep > wake ? sleep : sleep + 1440;
  const n = o.refeições; const janelas: { nome: string; hora: number; tipo: string }[] = [];
  const nomes = n <= 3 ? ['Café', 'Almoço', 'Jantar'] : n === 4 ? ['Café', 'Almoço', 'Lanche forte', 'Jantar'] : ['Café', 'Lanche', 'Almoço', 'Lanche', 'Jantar'];
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.1 : i / (n - 1);
    janelas.push({ nome: nomes[i] || `Refeição ${i + 1}`, hora: Math.round(wake + 60 + frac * (fim - wake - 210)), tipo: 'refeicao' });
  }
  const copos = o.agua.copos;
  const passo = Math.floor((fim - wake - 180) / Math.max(1, copos));
  const alerts: { nome: string; hora: number; tipo: string; dados?: any }[] = [];
  for (let i = 0; i < copos; i++) alerts.push({ nome: `Água ${i + 1}/${copos} (250 mL)`, hora: wake + 90 + i * passo, tipo: 'agua', dados: { copo: i + 1 } });
  for (const j of janelas) alerts.push({ nome: j.nome, hora: j.hora, tipo: 'refeicao', dados: { slot: j.nome } });
  alerts.push({ nome: 'Desacelerar: luz apagada, sem tela', hora: fim - 45, tipo: 'noite' });
  if (o.calor) alerts.push({ nome: '+250 mL de água', hora: wake + 300, tipo: 'agua', dados: { extra: true } });
  return { wake, sleep, refeições: janelas.map((j) => ({ ...j, hhmm: fmtMin(j.hora) })), alerts: alerts.sort((a, b) => a.hora - b.hora).map((a) => ({ ...a, hhmm: fmtMin(a.hora) })), cafeUltima: fmtMin(sleep - 8 * 60) };
}
const fmtMin = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;

// ------------------------------------------------------------ gamificação
export function nivel(xp: number, niveis: any[]) {
  let atual = niveis[0]; let next = niveis[1] || null;
  for (const l of niveis) if (xp >= l.xp) atual = l;
  const idx = niveis.indexOf(atual);
  next = niveis[idx + 1] || null;
  const prog = next ? clamp((xp - atual.xp) / Math.max(1, next.xp - atual.xp), 0, 1) : 1;
  return { level: atual, next, prog, xpFaltando: next ? next.xp - xp : 0 };
}

/** Maior sequência de dias consecutivos presente na lista (calendário real, não posição no array). */
export function maiorSequencia(keys: string[]): number {
  const set = new Set(keys); let best = 0;
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  for (const k of set) {
    const [a, m, d] = k.split('-').map(Number);
    if (set.has(fmt(new Date(a, m - 1, d - 1)))) continue;
    let n = 0; const cur = new Date(a, m - 1, d);
    while (set.has(fmt(cur))) { n++; cur.setDate(cur.getDate() + 1); }
    best = Math.max(best, n);
  }
  return best;
}

export function streakDe(dias: string[], hoje = new Date()) {
  const set = new Set(dias);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cur = new Date(hoje);
  if (!set.has(key(cur))) cur.setDate(cur.getDate() - 1); // hoje ainda em aberto não quebra a sequência
  let s = 0, buraco = false;
  for (let i = 0; i < 500; i++) {
    if (set.has(key(cur))) { s++; buraco = false; }
    else if (!buraco && s > 0) { buraco = true; }        // 1 dia de folga perdoado (Lally 2010: flexibilidade > rigidez)
    else break;
    cur.setDate(cur.getDate() - 1);
  }
  return s;
}

export const multStreak = (s: number) => (s >= 30 ? 1.7 : s >= 14 ? 1.5 : s >= 7 ? 1.3 : s >= 3 ? 1.15 : 1.0);

/** Carga aguda:crônica simplificada (Claudino2020) com séries × RIR. */
export function ratioCarga(sessoes: { volume: number; rir?: number; data: string }[], hoje = new Date()) {
  const dias = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86400000;
  let agudo = 0, cronico = 0;
  for (const s of sessoes) {
    const d = dias(new Date(s.data), hoje);
    if (d < 0 || d > 28) continue;
    const peso = s.volume * (1 + (s.rir != null ? (3 - Math.min(3, s.rir)) * 0.12 : 0));
    if (d <= 7) agudo += peso;
    cronico += peso;
  }
  const media = cronico / 4;
  const r = media > 0 ? agudo / media : 0;
  return { ratio: round(r, 2), zona: r > 1.5 ? 'risco' : r < 0.8 ? 'desestímulo' : 'ideal', agudo: round(agudo, 1), cronico: round(media, 1) };
}

export const umRm = (peso: number, reps: number) => Math.round(peso * (1 + reps / 30) * 10) / 10; // Epley
export const volumePorGrupo = (plan: { sessoes: { exercicios: { ex: string; series: number }[] }[] }, lib: Record<string, { grp: string }>) => {
  const m: Record<string, number> = {};
  for (const s of plan.sessoes) for (const it of s.exercicios) { const g = lib[it.ex]?.grp || 'outros'; m[g] = (m[g] || 0) + it.series; }
  return m;
};

export function riscoVitalicio(o: { idade: number; sexo?: Sex; imc: number; fuma?: boolean; pressao?: number[]; ldl?: number; passos?: number; treinosForca?: number }) {
  // Modelo explicativo, heurístico — para motivar mudança, não para prever morte.
  let pontos = 0;
  pontos += Math.max(0, (o.idade - 30) / 10) * 2;
  pontos += o.imc > 30 ? 4 : o.imc > 27 ? 2.5 : o.imc > 25 ? 1.2 : 0;
  pontos += o.fuma ? 8 : 0;
  const pas = Number(o.pressao?.[0] || 0);
  pontos += pas >= 140 ? 4 : pas >= 130 ? 2 : 0;
  const ldl = Number(o.ldl || 0);
  pontos += ldl >= 190 ? 4 : ldl >= 160 ? 2.5 : ldl >= 130 ? 1 : 0;
  pontos -= clamp(((o.passos || 0) - 2000) / 1000, 0, 4) * 1.15;
  pontos -= clamp(o.treinosForca || 0, 0, 3) * 0.85;
  pontos = Math.max(0, pontos * 1.4);
  return { pontos: round(pontos, 1), classe: pontos < 8 ? 'baixo' : pontos < 16 ? 'moderado' : 'alto', nota: 'Índice educativo do app (não é escore clínico validado). Derivado de: Ekelund 2019, Paluch 2025, AHA 2026, García-Hermoso 2018.' };
}

export default { maiorSequencia, geb, getmetabolico, alvoEnergia, macros, agua, micronutrientes, riscos, agenda, nivel, streakDe, multStreak, ratioCarga, umRm, volumePorGrupo, riscoVitalicio, alimentosPermitidos };
