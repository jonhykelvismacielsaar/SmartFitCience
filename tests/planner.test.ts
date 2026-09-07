import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarPlano, custoPorGramaDeProteina, PRECOS, type Alimento } from '../src/lib/planner.ts';
import { alimentos, fontes } from './_dados.ts';
import { DIET_PERMITIDAS, micronutrientes } from '../src/lib/calc.ts';

const alim = alimentos() as Alimento[];
const alvo = { kcal: 2500, protein: 170, fat: 70, carb: 280, fibra: 34 };

test('gerador resolve kcal e proteína do alvo para toda dieta', () => {
  for (const diet of ['omni', 'pesc', 'lacto_ovo', 'ovo', 'lacto', 'veg'] as const) {
    const r = gerarPlano({ alimentos: alim, diet, ...alvo, refeicoes: 4, seed: 'ana|2026-09-07' });
    const t = r.totais;
    assert.ok(Math.abs(t.kcal - alvo.kcal) / alvo.kcal < 0.09, `${diet}: kcal ${t.kcal}`);
    assert.ok(t.prot >= alvo.protein * 0.9, `${diet}: proteína ${t.prot}`);
    assert.ok(t.kcalPctFat >= 15 && t.kcalPctFat <= 45, `${diet}: gordura ${t.kcalPctFat}%E`);
    assert.equal(r.refeicoes.length, 4);
    assert.ok(r.refeicoes.every((x) => x.tot.prot >= 15), `${diet}: toda refeição com âncora proteica`);
  }
});

test('respeita a dieta: nada de carne no vegano, nada de ovo no lacto', () => {
  const veg = gerarPlano({ alimentos: alim, diet: 'veg', ...alvo, refeicoes: 4, seed: 'x' });
  const ids = veg.refeicoes.flatMap((r) => r.itens.map((i) => i.id));
  const carne = alim.filter((a) => a.grupo === 'carne' || a.grupo === 'peixe' || a.grupo === 'ovo' || a.grupo === 'laticinio').map((a) => a.id);
  assert.deepEqual(ids.filter((i) => carne.includes(i)), [], `veganos não comem ${ids.filter((i) => carne.includes(i))}`);
  const lacto = gerarPlano({ alimentos: alim, diet: 'lacto', ...alvo, refeicoes: 4, seed: 'y' });
  const ok = DIET_PERMITIDAS.lacto;
  for (const r of lacto.refeicoes) for (const i of r.itens) {
    const f = alim.find((a) => a.id === i.id)!;
    assert.ok(f.flags.split('').every((c) => ok.includes(c)), `lacto-vegetariano recebeu ${f.nome} (${f.flags})`);
  }
});

test('restrições e aversões são obedecidas; plano determinístico por semente', () => {
  const semLactose = gerarPlano({ alimentos: alim, diet: 'lacto_ovo', ...alvo, refeicoes: 4, restricoes: ['lactose'], seed: 'z' });
  const ids = semLactose.refeicoes.flatMap((r) => r.itens.map((i) => i.id));
  assert.equal(ids.some((i) => ['leite_vaca', 'iogurte_natural', 'queijo_minas'].includes(i)), false);
  const a = gerarPlano({ alimentos: alim, diet: 'veg', ...alvo, refeicoes: 4, seed: 'mesmo' });
  const b = gerarPlano({ alimentos: alim, diet: 'veg', ...alvo, refeicoes: 4, seed: 'mesmo' });
  assert.deepEqual(a.refeicoes.map((r) => r.itens.map((i) => [i.id, i.g])), b.refeicoes.map((r) => r.itens.map((i) => [i.id, i.g])), 'mesmo dia, mesmo plano');
  const c = gerarPlano({ alimentos: alim, diet: 'veg', ...alvo, refeicoes: 4, seed: 'outro' });
  assert.notDeepEqual(a.refeicoes.map((r) => r.itens.map((i) => i.id)), c.refeicoes.map((r) => r.itens.map((i) => i.id)), 'trocou o dia, trocou o cardápio');
});

test('lacunas viram sugestões de reparo com gramas e kcal; lista de compras bate com o plano', () => {
  const r = gerarPlano({ alimentos: alim, diet: 'veg', kcal: 2200, protein: 170, fat: 70, carb: 240, fibra: 38, refeicoes: 3, seed: 'ana', metaCalcio: 1000, metaFerro: 32 });
  for (const a of r.ajustes) {
    assert.match(a.texto, /^\+ \d+ g de /);
    assert.ok(a.add.g > 0 && a.add.g <= 150);
    assert.ok(alim.some((f) => f.id === a.add.id), 'alimento sugerido precisa existir no banco');
  }
  const itensPlano = r.refeicoes.flatMap((x) => x.itens);
  const somaLista = r.lista.reduce((s, l) => s + l.g, 0);
  const somaPlano = itensPlano.reduce((s, i) => s + i.g, 0);
  assert.ok(Math.abs(somaLista - somaPlano) <= itensPlano.length * 5, `lista ${somaLista} vs plano ${somaPlano}`);
  assert.ok(r.custo > 0 && r.custoPorProteina > 0);
  assert.ok(r.custoPorProteina < 1.2, `R$/g de proteína plausível (${r.custoPorProteina})`);
});

test('preços existem para todos os alimentos do banco', () => {
  const faltando = alim.filter((a) => PRECOS[a.id] == null).map((a) => a.id);
  assert.deepEqual(faltando, [], `sem preço: ${faltando.join(', ')}`);
});

test('ranking de custo por grama de proteína favorece os básicos', () => {
  const rank = custoPorGramaDeProteina(alim);
  assert.ok(rank.length > 20);
  assert.ok(rank.every((r, i) => i === 0 || r.r$ >= rank[i - 1].r$ - 1e-9), 'ordem crescente');
  assert.ok(['ovo_galinha', 'leite_vaca', 'soja_fava', 'proteina_texturizada', 'arroz_polido', 'lentilha', 'feijao_carioquinha'].some((id) => rank.slice(0, 8).some((x) => x.id === id)), 'básicos aparecem no topo');
});

test('micronutrientes do plano vegano ficam visíveis (cálcio e ferro do dia)', () => {
  const m = micronutrientes('veg', 'f', 30, 62, [], 2200);
  const r = gerarPlano({ alimentos: alim, diet: 'veg', kcal: 2200, protein: 130, fat: 65, carb: 250, fibra: 38, refeicoes: 4, seed: 'ana|1', metaCalcio: m.itens.find((i: any) => i.id === 'calcio')!.alvo, metaFerro: m.itens.find((i: any) => i.id === 'ferro')!.alvo });
  assert.ok(r.totais.calcio > 500, `cálcio do plano: ${r.totais.calcio}`);
  assert.ok(r.totais.ferro > 12, `ferro do plano: ${r.totais.ferro}`);
});
