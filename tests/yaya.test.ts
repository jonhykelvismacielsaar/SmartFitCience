import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, responder, personalize, norm } from '../src/lib/yaya.ts';
import { alimentos, capsulas, fontes } from './_dados.ts';

const F = fontes();
const CAP = capsulas();
const IDX = buildIndex(F, CAP);

test('BM25 recupera creatina, são e passos nos temas certos', () => {
  const hit = (q: string) => search(q, IDX, 5).map((h) => h.doc.refs?.[0] || h.doc.id);
  assert.ok(hit('creatina vale a pena?').some((x) => /creatine|Creatine|Deminice|Wax|Kreider/.test(String(x))), 'creatina');
  assert.ok(hit('quantas horas de sono eu preciso').some((x) => /Watson|Hirshkowitz|Nedeltcheva|sono/.test(String(x))), 'sono');
  assert.ok(hit('preciso andar 10 mil passos por dia?').some((x) => /Paluch|Ekelund|steps|passos/.test(String(x))), 'passos');
  assert.ok(hit('proteína vegetariano').some((x) => /Clarys|Dinu|AND2016|Morton|Tonstad|Rogerson|veg|prote/i.test(String(x))), 'proteína veg');
});

test('toda cápsula responde e só cita fontes que existem na base', () => {
  let ok = 0;
  for (const c of CAP) {
    const r = responder(c.q[0], IDX, F, {});
    assert.equal(r.origem, 'base', `cápsula "${c.id}" não recuperada pela própria pergunta`);
    assert.ok(r.texto.length > 60, `resposta curta demais: ${c.id}`);
    assert.ok(r.refs.length > 0, `cápsula sem referência: ${c.id}`);
    for (const ref of r.refs) {
      assert.ok(F.some((f: any) => f.id === ref.id), `ref fantasma em ${c.id}: ${ref.id}`);
      assert.ok(!!f_link(ref), `ref sem link: ${ref.id}`);
    }
    for (const av of c.avisos || []) assert.ok(av.length > 10);
    ok++;
  }
  assert.ok(ok >= 25, `poucas cápsulas cobertas: ${ok}/${CAP.length}`);
});
const f_link = (f: any) => f.link || f.doi || f.pmid;

test('busca sem correspondência admite ignorância em vez de inventar', () => {
  const r = responder('melatonina sublingual 12 mg à noite com magnésio quelato qual dose?', IDX, F, {}, { rigor: true });
  assert.ok(['sem-correspondencia', 'base'].includes(r.origem));
  if (r.origem === 'sem-correspondencia') assert.match(r.texto, /não encontrei|profissional/i);
  else assert.ok(r.confianca <= 0.95);
  const r2 = responder('xyzzy blorp q12', IDX, F, {});
  assert.equal(r2.origem, 'sem-correspondencia');
  assert.equal(r2.refs.length, 0);
  assert.ok(r2.followups.length >= 3, 'oferece caminhos quando não sabe');
});

test('personalização injeta os números do perfil na resposta', () => {
  const ctx = {
    alvos: { energia: { kcal: 2400 }, proteina: { protein: 168, proteinPorRefeicao: 42, refeicoes: 4, leucinaAlvo: 2.6, fibra: 34, fat: 70, carb: 250 }, agua: { aBeberL: 3.4, copos: 12, copoMl: 250, alimentosL: 1.1 }, sono: { min: 7 }, treino: { seriesPorGrupo: '10–12' } },
    perfil: { peso: 80, nivel: 3, treinoDias: 4 },
    hoje: { agua: 5, sonoH: 6.2, treino: false },
    gaps: [{ label: 'cálcio', atual: 600, alvo: 1000, unit: 'mg' }],
  };
  const linhas = personalize(ctx as any, 'alvos');
  assert.ok(linhas.some((l) => l.includes('2 400 kcal') || l.includes('2.400') || l.includes('2400')), linhas.join(' | '));
  assert.ok(linhas.some((l) => l.includes('168 g')));
  const agua = personalize(ctx as any, 'agua');
  assert.ok(agua.some((l) => /1,[23] L/.test(l)), 'converte 5 copos × 250 mL em L');
  const sono = personalize(ctx as any, 'sono');
  assert.ok(sono.some((l) => l.includes('6.2 h') || l.includes('6,2 h')));
  const gaps = personalize(ctx as any, 'risco');
  assert.ok(gaps.some((l) => /cálcio 600\/1000mg/.test(l)), gaps.join(' | '));
});

test('contexto do perfil aparece no texto final da resposta', () => {
  const c = CAP.find((x: any) => x.pers === 'agua') || CAP[0];
  const r = responder(c.q[0], IDX, F, { alvos: { agua: { aBeberL: 3.0, copos: 10, copoMl: 250, alimentosL: 1.0 } }, perfil: { peso: 78 } });
  assert.ok(r.personalizadas.length >= 1);
  assert.match(r.texto, /no seu caso|O que isso significa/i);
  assert.ok(r.texto.includes('3 L') || r.texto.includes('10 copos'));
});

test('busca ignora acentos e plural, e nunca devolve pontuação negativa', () => {
  assert.equal(norm('Coração e Nutrição'), 'coracao e nutricao');
  const h = search('PROTEINAS   vegetarianas!!!', IDX, 4);
  assert.ok(h.length > 0);
  assert.ok(h.every((x) => x.score > 0));
  assert.deepEqual(search('', IDX, 4), []);
});
