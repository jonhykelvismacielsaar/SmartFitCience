// Gerador de plano alimentar: resolve gramas para bater kcal / proteína / fibra a partir do banco de alimentos
// (data/foods.json). Determinístico por (usuário + data): o dia não muda sozinho, mas o dia seguinte muda.
import { alimentosPermitidos, type DietType } from './calc.ts';

export type Alimento = {
  id: string; nome: string; grupo: string; porcao: number; kcal: number; prot: number; carb: number; gord: number;
  fibra: number; ferro: number; calcio: number; sodio: number; zinco: number; leucina: number; flags: string;
};

/** Preço médio por 100 g (R$, referência de mercado SP 2026). Estimativa para comparar custo-benefício, não tabela oficial. */
export const PRECOS: Record<string, number> = {
  arroz_polido: 0.35, arroz_integral: 0.55, feijao_carioquinha: 0.3, feijao_preto: 0.32, lentilha: 0.55,
  graodebico: 0.85, ervilha: 0.6, soja_fava: 0.9, edamame: 1.6, hamburguer_veg: 1.9, proteina_texturizada: 1.6,
  tofu: 1.4, tempeh: 2.2, seitan: 2, seitan_gluten: 2, hummus: 1.8, leite_vegetal_fort: 0.9, yogurt_vegetal: 1.5,
  queijo_vegetal: 2.6, nutritional_levedo: 3.5, fermento_nutricional: 3.5, aveia: 0.9, quinoa: 1.9, milho: 0.7,
  pao_integral: 1.3, pao_frances: 0.7, tapioca: 1.1, macarrao: 0.8, macarrao_integral: 1.2, trigo_sarraceno: 1.5,
  batata_inglesa: 0.4, batata_doce: 0.5, mandioca: 0.45, inhame: 0.5, brocolis: 1, brócolis: 1, couve: 0.6,
  espinafre: 1.2, espinfre: 1.2, rucula: 1.4, rúcula: 1.4, alface: 0.8, acelga: 0.7, couve_flor: 0.9, abobrinha: 0.6,
  berinjela: 0.6, abobora: 0.5, cenoura: 0.5, beterraba: 0.5, tomate: 0.7, pepino: 0.6, pimentao: 0.9, cebola_alho: 1,
  abacate: 1.2, banana: 0.5, maca: 0.9, laranja: 0.5, mamao: 0.6, abacaxi: 0.5, manga: 0.6, morango: 2.4, kiwi: 1.6,
  uva_passa: 1.4, tamaras: 2.2, amendoim: 1.1, castanha_caju: 2.2, castanha_para: 3, noz: 2.6, amendoa: 2.4,
  semente_abobora: 1.8, semente_girassol: 1.5, linhaca: 1.6, chia: 2.4, cannabis_seed: 2.8, gergelim: 1.8,
  leite_vaca: 0.65, leite_desnatado: 0.75, iogurte_natural: 0.9, iogurte_grego_light: 1.9, requeijao_light: 2,
  queijo_minas: 2, queijo_prato: 2.4, cottage: 2.2, whey: 2.4, caseina: 2.8, ovo_galinha: 1.4, ovos_galinha: 1.4,
  claras: 1.2, codorna_ovos: 2, atum_lata: 2, salmao: 4.5, sardinha: 1.6, tilapia: 2.6, camarao: 4, merluza: 2.8,
  frango_peito: 1.5, peito_frango: 1.5, frango_coxa: 1.1, carne_boi_magra: 1.9, carne_boi_gordurosa: 2.4,
  carne_suina: 1.6, porco_lombo: 1.6, cordeiro: 2.8, linguiça: 1.4, bacon: 2.2, presunto: 1.8, salsicha: 1.2,
  azeite: 2.6, oleo_canola: 0.9, manteiga: 1.8, sal: 0.1, shoyu: 1.2, ketchup: 0.8, chocolate_70: 2.6, cacau: 2,
  cafe: 0.6, cha: 0.4, refrigerante: 0.5, suco: 0.7, cerveja: 1.2, leite_coco: 1.4, pasta_amendoim: 1.6,
  oleaginosa_pasta: 1.6, cacao_po: 2, granola: 1.8, barra_proteica: 4.5, whey_veg: 2.6,
  ovas_codorna: 2, coxa_frango: 1.1, carne_boi_gordura: 2.4, carne_suina_lombo: 1.6, calabresa_linguiça: 1.4,
  cha_verde: 0.4, refri: 0.5, refri_zero: 0.6, suco_laranja: 0.7, pao_queijo: 1.6, tapioca_ovos: 1.3,
  muesli: 1.6, granola_acucar: 1.8, salsicha_veg: 2.6, nuggets_veg: 2.4, barriga_proteina: 4.5, water: 0, agua: 0,
};

const RNG = (seed: string) => {
  let a = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { a = Math.imul(a ^ seed.charCodeAt(i), 3432918353); a = (a << 13) | (a >>> 19); }
  return () => { a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); a ^= a << 16; return ((a >>> 0) % 1000003) / 1000003; };
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export type Papel = 'proteina' | 'carbo' | 'vegetal' | 'fruta' | 'gordura' | 'leguminosa' | 'semente';

const GRUPOS: Record<Papel, string[]> = {
  proteina: ['carne', 'peixe', 'ovo', 'laticinio', 'laticinio_veg', 'veg_proteina', 'suplemento', 'leguminosa', 'oleaginosa'],
  leguminosa: ['leguminosa', 'veg_proteina'],
  carbo: ['cereais', 'tuberculo'],
  vegetal: ['hortica'],
  fruta: ['fruta'],
  gordura: ['oleaginosas_gord', 'oleaginosa', 'semente'],
  semente: ['semente', 'oleaginosa'],
};

/** Preferência de grupo por papel e por refeição (café não pede lentilha). */
const ORDEM_CAFE = ['ovo', 'laticinio', 'laticinio_veg', 'suplemento', 'veg_proteina', 'oleaginosa', 'semente', 'leguminosa', 'carne', 'peixe'];
const ORDEM_PRINCIPAL = ['carne', 'peixe', 'leguminosa', 'veg_proteina', 'ovo', 'laticinio', 'suplemento', 'oleaginosa'];
const ORDEM_LANCHE = ['laticinio', 'suplemento', 'ovo', 'veg_proteina', 'oleaginosa', 'semente', 'leguminosa', 'carne', 'peixe'];

export type Item = {
  id: string; nome: string; grupo: string; papel: Papel; g: number; gBase?: number;
  kcal: number; prot: number; carb: number; gord: number; fibra: number; ferro: number; calcio: number; sodio: number; zinco: number; leucina: number;
  preco: number;
};
export type Tot = { kcal: number; prot: number; carb: number; gord: number; fibra: number; ferro: number; calcio: number; sodio: number; zinco: number; leucina: number; kcalPctProt: number; kcalPctFat: number; preco: number };
export type Refeicao = { nome: string; hora: string; slots: Papel[]; itens: Item[]; tot: Tot };

const ESTRUTURA: Record<number, { nome: string; hora: string; share: number; slots: Papel[] }[]> = {
  3: [
    { nome: 'Café da manhã', hora: '07:30', share: 0.28, slots: ['proteina', 'carbo', 'fruta'] },
    { nome: 'Almoço', hora: '12:30', share: 0.4, slots: ['proteina', 'carbo', 'vegetal', 'gordura'] },
    { nome: 'Jantar', hora: '20:00', share: 0.32, slots: ['proteina', 'carbo', 'vegetal'] },
  ],
  4: [
    { nome: 'Café da manhã', hora: '07:30', share: 0.24, slots: ['proteina', 'carbo', 'fruta'] },
    { nome: 'Almoço', hora: '12:30', share: 0.32, slots: ['proteina', 'carbo', 'vegetal', 'gordura'] },
    { nome: 'Lanche da tarde', hora: '16:30', share: 0.16, slots: ['proteina', 'semente'] },
    { nome: 'Jantar', hora: '20:00', share: 0.28, slots: ['proteina', 'carbo', 'vegetal', 'fruta'] },
  ],
  5: [
    { nome: 'Café da manhã', hora: '07:00', share: 0.22, slots: ['proteina', 'carbo', 'fruta'] },
    { nome: 'Lanche', hora: '10:00', share: 0.12, slots: ['proteina', 'semente'] },
    { nome: 'Almoço', hora: '12:45', share: 0.3, slots: ['proteina', 'leguminosa', 'carbo', 'vegetal'] },
    { nome: 'Pré-treino', hora: '17:30', share: 0.14, slots: ['carbo', 'fruta'] },
    { nome: 'Jantar', hora: '20:30', share: 0.22, slots: ['proteina', 'carbo', 'vegetal'] },
  ],
};

const GMIN: Record<Papel, number> = { proteina: 20, leguminosa: 60, carbo: 30, vegetal: 50, fruta: 70, gordura: 5, semente: 8 };
const GMAX: Record<Papel, number> = { proteina: 250, leguminosa: 200, carbo: 380, vegetal: 220, fruta: 240, gordura: 30, semente: 40 };

/** Nutrientes de um item derivados das gramas atuais (fonte única: evita total defasado). */
export function precoPorGrupo(alimentos: Alimento[]): Record<string, number> {
  const porGrupo: Record<string, number[]> = {};
  for (const a of alimentos) { const p = PRECOS[a.id]; if (p != null) (porGrupo[a.grupo] ||= []).push(p); }
  const med: Record<string, number> = {};
  for (const [g, arr] of Object.entries(porGrupo)) { arr.sort((x, y) => x - y); med[g] = arr[Math.floor(arr.length / 2)]; }
  return med;
}

let precoMedio: Record<string, number> = {};
export function recalcItem(it: Item, a: Alimento) {
  const f = it.g / 100;
  it.kcal = a.kcal * f; it.prot = a.prot * f; it.carb = a.carb * f; it.gord = a.gord * f; it.fibra = a.fibra * f;
  it.ferro = a.ferro * f; it.calcio = a.calcio * f; it.sodio = a.sodio * f; it.zinco = a.zinco * f; it.leucina = a.leucina * f;
  it.preco = (PRECOS[a.id] ?? precoMedio[a.grupo] ?? 1) * f;
}
export function somar(itens: Item[]): Tot {
  const t: Tot = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0, ferro: 0, calcio: 0, sodio: 0, zinco: 0, leucina: 0, kcalPctProt: 0, kcalPctFat: 0, preco: 0 };
  for (const i of itens) {
    t.kcal += i.kcal; t.prot += i.prot; t.carb += i.carb; t.gord += i.gord; t.fibra += i.fibra; t.ferro += i.ferro;
    t.calcio += i.calcio; t.sodio += i.sodio; t.zinco += i.zinco; t.leucina += i.leucina; t.preco += i.preco;
  }
  t.kcal = Math.round(t.kcal); t.prot = round1(t.prot); t.carb = round1(t.carb); t.gord = round1(t.gord); t.fibra = round1(t.fibra);
  t.ferro = round1(t.ferro); t.calcio = Math.round(t.calcio); t.sodio = Math.round(t.sodio); t.zinco = round1(t.zinco); t.leucina = round1(t.leucina);
  t.preco = round1(t.preco);
  t.kcalPctProt = t.kcal ? Math.round(((t.prot * 4) / t.kcal) * 100) : 0;
  t.kcalPctFat = t.kcal ? Math.round(((t.gord * 9) / t.kcal) * 100) : 0;
  return t;
}

export function gerarPlano(o: {
  alimentos: Alimento[]; diet: DietType; kcal: number; protein: number; fat: number; carb: number; fibra: number;
  restricoes?: string[]; evitar?: string[]; refeicoes?: number; seed?: string;
  metaCalcio?: number; metaFerro?: number; metaSodio?: number; semCarne?: boolean;
}) {
  const rand = RNG(o.seed || 'smartfit');
  const n = [3, 4, 5].includes(Number(o.refeicoes)) ? Number(o.refeicoes) : 4;
  const estrutura = ESTRUTURA[n];
  const dens = new Map(o.alimentos.map((a) => [a.id, a]));
  precoMedio = precoPorGrupo(o.alimentos);
  const evitar = new Set((o.evitar || []).map((x) => norm(x)));
  const rest = new Set((o.restricoes || []).map((x) => norm(x)));
  const intolerante = new Set(['lactose', 'leite', 'lactose_intolerancia', 'gluten', 'glúten', 'celiaca', 'oleaginosas', 'nozes', 'amendoim', 'ovo', 'ovos', 'peixe', 'frutos_do_mar', 'soja']);
  const soIntolerancias = [...rest].filter((r) => intolerante.has(r));

  const permitido = (a: Alimento) => {
    if (!alimentosPermitidos(a.flags, o.diet)) return false;
    if (o.semCarne && (a.grupo === 'carne' || a.grupo === 'peixe')) return false;
    const nome = norm(a.nome);
    if (evitar.has(nome) || [...evitar].some((e) => e.length > 3 && nome.includes(e))) return false;
    for (const r of soIntolerancias) {
      if ((r === 'lactose' || r === 'leite' || r === 'lactose_intolerancia') && a.grupo === 'laticinio' && !nome.includes('sem lactose') && !nome.includes('zero lactose')) return false;
      if ((r === 'gluten' || r === 'glúten' || r === 'celiaca') && /trigo|centeio|cevada|malte|seitan|pao|macarrao|massa/.test(nome) && !nome.includes('sem gluten') && !nome.includes('gluten free')) return false;
      if ((r === 'oleaginosas' || r === 'nozes' || r === 'amendoim') && a.grupo === 'oleaginosa') return false;
      if (r === 'ovo' && a.grupo === 'ovo') return false;
      if ((r === 'peixe' || r === 'frutos_do_mar') && a.grupo === 'peixe') return false;
      if (r === 'soja' && /soja|tofu|tempeh|edamame|hummus|proteina_texturizada/.test(nome)) return false;
    }
    if (a.kcal < 3 && a.grupo !== 'hortica') return false; // café, água, chás, sal
    if (a.grupo === 'bebida' || a.grupo === 'alcool' || a.grupo === 'condimento') return false;
    return true;
  };
  const pool = o.alimentos.filter(permitido);
  const poolPorGrupo = new Map<string, Alimento[]>();
  for (const a of pool) { const arr = poolPorGrupo.get(a.grupo) || []; arr.push(a); poolPorGrupo.set(a.grupo, arr); }

  const ordemDoPapel = (papel: Papel, refeicao: string) => {
    if (papel === 'carbo' || papel === 'vegetal' || papel === 'fruta' || papel === 'gordura' || papel === 'semente' || papel === 'leguminosa') {
      return papel === 'leguminosa' ? ORDEM_PRINCIPAL.filter((g) => g === 'leguminosa' || g === 'veg_proteina') : [];
    }
    return refeicao.includes('Caf') || refeicao.includes('Lanche') ? (refeicao.includes('Caf') ? ORDEM_CAFE : ORDEM_LANCHE) : ORDEM_PRINCIPAL;
  };
  const escolhe = (papel: Papel, refeicao: string, jaUsados: Set<string>) => {
    const grupos = GRUPOS[papel];
    const ordem = ordemDoPapel(papel, refeicao);
    const candidatos = grupos.flatMap((g) => poolPorGrupo.get(g) || []).filter((a) => !jaUsados.has(a.id));
    if (!candidatos.length) return null;
    if (papel === 'proteina') {
      const densa = (a: Alimento) => a.prot / Math.max(1, a.kcal);
      const bons = candidatos.filter((a) => a.prot >= 6);
      const lista = (bons.length ? bons : candidatos).slice();
      lista.sort((a, b) => {
        const ia = ordem.indexOf(a.grupo), ib = ordem.indexOf(b.grupo);
        const od = (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return od !== 0 ? od : densa(b) - densa(a);
      });
      const topo = lista.slice(0, Math.max(1, Math.min(3, Math.round(lista.length * 0.4))));
      return topo[Math.floor(rand() * topo.length)];
    }
    return candidatos[Math.floor(rand() * candidatos.length)];
  };
  const novoItem = (a: Alimento, papel: Papel, g: number): Item => {
    const it: Item = { id: a.id, nome: a.nome, grupo: a.grupo, papel, g, kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0, ferro: 0, calcio: 0, sodio: 0, zinco: 0, leucina: 0, preco: 0 };
    recalcItem(it, a);
    return it;
  };

  // ---------- montagem em 4 tempos (como um nutricionista faz): proteína → gordura → volume → carboidrato por diferença
  const refs: Refeicao[] = [];
  const usados = new Set<string>();
  for (const e of estrutura) {
    const itens: Item[] = [];
    for (const papel of e.slots) {
      const a = escolhe(papel, e.nome, usados);
      if (!a) continue;
      usados.add(a.id);
      itens.push(novoItem(a, papel, a.porcao || 100));
    }
    refs.push({ nome: e.nome, hora: e.hora, slots: e.slots, itens, tot: somar(itens) });
  }
  const alim = (it: Item) => dens.get(it.id)!;
  const total = () => somar(refs.flatMap((r) => r.itens));
  const porPapel = (papel: Papel) => refs.flatMap((r) => r.itens.filter((i) => i.papel === papel));
  const commit = () => { for (const r of refs) r.tot = somar(r.itens); };
  const setG = (it: Item, g: number) => { it.g = Math.round(clamp(g, GMIN[it.papel], GMAX[it.papel])); recalcItem(it, alim(it)); };

  // (1) proteína: reparte o alvo entre as refeições e ajusta as gramas de cada âncora
  const alvoProtRef = o.protein / Math.max(1, refs.length);
  for (let round = 0; round < 3; round++) {
    for (const r of refs) {
      const prot = r.itens.filter((i) => i.papel === 'proteina' || i.papel === 'leguminosa');
      if (!prot.length) continue;
      const falta = alvoProtRef - r.tot.prot;
      if (Math.abs(falta) < 2.5) continue;
      for (const it of prot.sort((a, b) => alim(b).prot - alim(a).prot)) {
        const porGrama = Math.max(0.02, alim(it).prot / 100);
        setG(it, it.g + falta / porGrama / Math.max(1, prot.length));
      }
    }
    commit();
    // refeição sem âncora? injeta a fonte mais densa disponível (sem estourar o teto de kcal)
    const fraca = refs.find((r) => r.tot.prot < alvoProtRef * 0.62 && r.itens.length < 7 && total().kcal < o.kcal * 1.05);
    if (!fraca || round === 2) break;
    const denso = pool.filter((a) => a.prot >= 10 && a.kcal <= 420 && !usados.has(a.id)).sort((a, b) => (b.prot / Math.max(1, b.kcal)) - (a.prot / Math.max(1, a.kcal)))[0];
    if (!denso) break;
    usados.add(denso.id);
    fraca.itens.push(novoItem(denso, 'proteina', Math.max(GMIN.proteina, Math.min(GMAX.proteina, ((alvoProtRef - fraca.tot.prot) * 100) / Math.max(8, denso.prot)))));
    commit();
  }

  // (2) gordura: semente/oleaginosa/azeite até o alvo de gordura (com piso de 18% da energia resolvido adiante)
  for (const r of refs) {
    for (const it of r.itens.filter((i) => i.papel === 'gordura' || i.papel === 'semente')) {
      const share = 1 / Math.max(1, refs.length);
      setG(it, ((o.fat * share * 0.75) * 100) / Math.max(5, alim(it).gord));
    }
  }
  commit();

  // (3) volume: hortaliça e fruta em porção padrão (não são a variável de ajuste)
  for (const r of refs) for (const it of r.itens) if (it.papel === 'vegetal' || it.papel === 'fruta') setG(it, alim(it).porcao || (it.papel === 'vegetal' ? 100 : 130));
  commit();

  // (4) carboidrato fecha a conta por diferença (busca binária no fator das fontes de carboidrato)
  const fixaKcal = () => { const T = total(); return T.kcal - porPapel('carbo').reduce((s, i) => s + i.kcal, 0); };
  const semCarbo = fixaKcal();
  let lo = 0.15, hi = 4.0;
  const kcalDeCarbo = (f: number) => {
    let soma = 0;
    for (const it of porPapel('carbo')) { const g = clamp(Math.round((it.gBase ?? it.g) * f), GMIN.carbo, GMAX.carbo); soma += (alim(it).kcal * g) / 100; }
    return soma;
  };
  for (const it of porPapel('carbo')) it.gBase = it.g;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (semCarbo + kcalDeCarbo(mid) < o.kcal) lo = mid; else hi = mid; }
  const fator = (lo + hi) / 2;
  for (const it of porPapel('carbo')) setG(it, (it.gBase ?? it.g) * fator);
  commit();

  // faltou energia mesmo com carboidrato no teto? completa com mais fruta/gordura/proteína (nesta ordem)
  for (let guard = 0; guard < 260; guard++) {
    const T = total();
    if (T.kcal >= o.kcal * 0.985) break;
    const plano = (['fruta', 'gordura', 'semente', 'leguminosa', 'proteina', 'carbo'] as Papel[]);
    let mexeu = false;
    for (const papel of plano) {
      for (const it of porPapel(papel)) if (it.g < GMAX[papel] && alim(it).kcal > 20) { setG(it, it.g + 15); mexeu = true; break; }
      if (mexeu) break;
    }
    if (!mexeu) {
      const r = [...refs].sort((a, b) => a.tot.kcal - b.tot.kcal)[0];
      const a = pool.filter((x) => x.grupo === 'cereais' || x.grupo === 'oleaginosas_gord').find((x) => !r.itens.some((i) => i.id === x.id));
      if (!a) break;
      r.itens.push(novoItem(a, a.grupo === 'cereais' ? 'carbo' : 'gordura', a.porcao || 60));
      mexeu = true;
    }
    if (!mexeu) break;
    commit();
  }
  // sobrou energia? reduz carboidrato primeiro (proteína é a última coisa a ser cortada)
  for (let guard = 0; guard < 300; guard++) {
    const T = total();
    if (T.kcal <= o.kcal * 1.015) break;
    let mexeu = false;
    for (const papel of ['carbo', 'gordura', 'fruta', 'semente', 'leguminosa', 'proteina'] as Papel[]) {
      for (const it of porPapel(papel)) if (it.g > GMIN[papel] + 4) { setG(it, it.g - (papel === 'proteina' ? 5 : 15)); mexeu = true; break; }
      if (mexeu) break;
    }
    if (!mexeu) break;
    commit();
  }
  // fibra: semente/leguminosa/integral; se não chegar, acrescenta linhaça/chia no maior déficit
  for (let guard = 0; guard < 60; guard++) {
    const T = total();
    if (T.fibra >= o.fibra * 0.94 || T.kcal > o.kcal * 1.02) break;
    let mexeu = false;
    for (const it of [...porPapel('semente'), ...porPapel('carbo'), ...porPapel('leguminosa')]) if (alim(it).fibra >= 4 && it.g < GMAX[it.papel]) { setG(it, it.g + 10); mexeu = true; break; }
    if (!mexeu) {
      const semente = pool.find((a) => a.fibra >= 9 && a.grupo === 'semente' && !refs.some((r) => r.itens.some((i) => i.id === a.id)));
      if (!semente) break;
      const r = [...refs].sort((a, b) => b.tot.kcal - a.tot.kcal)[0];
      r.itens.push(novoItem(semente, 'semente', 15));
      mexeu = true;
    }
    if (!mexeu) break;
    commit();
  }
  for (const r of refs) { for (const it of r.itens) { it.g = Math.round(it.g / 5) * 5 || 5; recalcItem(it, alim(it)); } r.tot = somar(r.itens); }
  const T = total();

  // ---- lacunas viram sugestões concretas ("adicionar X g de Y")
  const ajustes: { texto: string; motivo: string; add: { id: string; g: number } }[] = [];
  const lacunas = [
    { k: 'prot' as const, label: 'proteína', falta: o.protein - T.prot, meta: o.protein, unit: 'g', piso: 4, melhor: (a: Alimento) => a.prot / Math.max(1, a.kcal) },
    { k: 'fibra' as const, label: 'fibra', falta: o.fibra - T.fibra, meta: o.fibra, unit: 'g', piso: 3, melhor: (a: Alimento) => a.fibra / Math.max(1, a.kcal) },
    { k: 'calcio' as const, label: 'cálcio', falta: (o.metaCalcio ?? 1000) - T.calcio, meta: o.metaCalcio ?? 1000, unit: 'mg', piso: 140, melhor: (a: Alimento) => a.calcio / Math.max(1, a.kcal) },
    { k: 'ferro' as const, label: 'ferro', falta: (o.metaFerro ?? 18) - T.ferro, meta: o.metaFerro ?? 18, unit: 'mg', piso: 3, melhor: (a: Alimento) => a.ferro / Math.max(1, a.kcal) },
  ];
  for (const l of lacunas) {
    if (l.falta <= l.piso) continue;
    const cands = pool.filter((a) => l.melhor(a) > 0).sort((a, b) => l.melhor(b) - l.melhor(a)).slice(0, 5);
    const a = cands[Math.floor(rand() * Math.max(1, cands.length))];
    if (!a) continue;
    const gramas = Math.min(150, r5((l.falta * 100) / Math.max(0.5, (a as any)[l.k])));
    if (gramas < 5) continue;
    ajustes.push({
      texto: `+ ${gramas} g de ${a.nome.toLowerCase()} (+${round1(((a as any)[l.k] * gramas) / 100)} ${l.unit} de ${l.label}; +${Math.round((a.kcal * gramas) / 100)} kcal)`,
      motivo: `${l.label} fechou em ${round1((T as any)[l.k])} de ${Math.round(l.meta)} ${l.unit}`,
      add: { id: a.id, g: gramas },
    });
  }
  const avisos: string[] = [];
  if (T.sodio > (o.metaSodio ?? 2000)) avisos.push(`Sódio em ${Math.round(T.sodio)} mg — acima de ${o.metaSodio ?? 2000} mg. Troque tempero pronto/pão/queijo por tempero de verdade (OMS 2013; Aburto 2013 para potássio).`);
  if (T.kcal < o.kcal - 220) avisos.push('O plano fechou abaixo da meta: aumente 1 porção de grão/tubérculo ou 1 colher de azeite (não deixe a energia cair para "compensar" treino).');
  if (T.prot < o.protein * 0.9) avisos.push(`Proteína em ${round1(T.prot)} g de ${o.protein} g: as sugestões abaixo fecham a lacuna (mínimo 30 g por refeição — Morton 2018).`);
  if (['veg', 'lacto', 'ovo', 'lacto_ovo'].includes(o.diet) && T.leucina < 9) avisos.push(`Leucina em ${round1(T.leucina)} g/dia. Em dieta vegetal, mire ≥2,5 g por refeição (≈10 g/dia) variando soja, amendoim, sementes e integrais (van Vliet 2016).`);
  const custo = refs.reduce((s, r) => s + r.itens.reduce((x, i) => x + i.preco, 0), 0);
  const lista = new Map<string, { id: string; nome: string; grupo: string; g: number; preco: number; prot: number }>();
  for (const r of refs) for (const i of r.itens) {
    const l = lista.get(i.id) || { id: i.id, nome: i.nome, grupo: i.grupo, g: 0, preco: 0, prot: 0 };
    l.g += i.g; l.preco += i.preco; l.prot += i.prot; lista.set(i.id, l);
  }
  return {
    refeicoes: refs, totais: T, ajustes, avisos,
    custo: round1(custo), custoPorProteina: round1((custo / Math.max(1, T.prot)) * 100) / 100,
    lista: [...lista.values()].map((l) => ({ ...l, g: r5(l.g), preco: round1(l.preco), prot: round1(l.prot) })).sort((a, b) => b.g - a.g),
    alvo: { kcal: o.kcal, prot: o.protein, carb: o.carb, fat: o.fat, fibra: o.fibra },
    desvios: { kcal: Math.round(((T.kcal - o.kcal) / o.kcal) * 100), prot: round1(T.prot - o.protein), carb: round1(T.carb - o.carb), gorduraPctE: T.kcalPctFat },
  };
}

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function custoPorGramaDeProteina(alimentos: Alimento[]) {
  return alimentos
    .filter((a) => a.prot >= 4)
    .map((a) => {
      const preco = PRECOS[a.id] ?? PRECOS[norm(a.nome)] ?? 1;
      return { id: a.id, nome: a.nome, grupo: a.grupo, prot: a.prot, kcal: a.kcal, preco, r$: round1((preco / Math.max(0.5, a.prot)) * 10) / 10 };
    })
    .sort((a, b) => a.r$ - b.r$);
}

/** Trocas válidas entre dois alimentos (mesmo papel nutricional) — usado no botão "trocar" do plano. */
export function trocasDe(item: Item, alimentos: Alimento[], diet: DietType, rand = Math.random) {
  const mesmo = alimentos.filter((a) => a.grupo === item.grupo && a.id !== item.id && alimentosPermitidos(a.flags, diet));
  const alvo = dens100(item);
  return mesmo
    .map((a) => {
      const g = Math.max(10, r5((alvo.kcal * 100) / Math.max(1, a.kcal)));
      return { id: a.id, nome: a.nome, g, deltaKcal: Math.round((a.kcal * g) / 100 - alvo.kcal), deltaProt: round1((a.prot * g) / 100 - alvo.prot) };
    })
    .sort((x, y) => Math.abs(x.deltaKcal) - Math.abs(y.deltaKcal))
    .slice(0, 5)
    .concat(mesmo.length < 3 ? alimentos.filter((a) => a.prot >= Math.max(8, alvo.prot * 0.9) && alimentosPermitidos(a.flags, diet) && a.id !== item.id).slice(0, 3).map((a) => { const g = r5((alvo.prot * 100) / Math.max(1, a.prot)); return { id: a.id, nome: a.nome, g: clamp(g, GMIN.proteina, GMAX.proteina), deltaKcal: Math.round((a.kcal * g) / 100 - alvo.kcal), deltaProt: round1((a.prot * g) / 100 - alvo.prot) }; }) : [])
    .slice(0, 6);
}
const dens100 = (it: Item) => ({ kcal: Math.round((it.kcal * 100) / Math.max(1, it.g)), prot: round1((it.prot * 100) / Math.max(1, it.g)) });
