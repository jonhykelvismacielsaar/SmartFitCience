import test from 'node:test';
import assert from 'node:assert/strict';
import { classificar, listasDe, pesoDesign, pontuar } from '../src/lib/bias.ts';
import { audits, fontes, program, exercises } from './_dados.ts';

const L = listasDe(audits());

test('listas de bloqueio/observação carregadas do módulo de auditoria', () => {
  assert.ok(L.bloqueio.length > 15, 'lista de bloqueio curta');
  assert.ok(L.bloqueio.some((p) => p.includes('coca cola')) || L.bloqueio.some((p) => p.includes('coca-cola')), 'coca-cola deve estar na lista de bloqueio');
  assert.ok(L.publico.some((p) => p.includes('nih')));
  assert.ok(L.desenho.length >= 5 && L.desenho[0].p >= L.desenho[L.desenho.length - 1].p - 0.5);
});

test('financiador setorial barra a recomendação; funding público pontua melhor', () => {
  const comprado = classificar([{ nome: 'Coca-Cola Scientific and Public Health Division' }], 'Sugar-sweetened beverages and body weight', 'J of Nutrition', L);
  assert.equal(comprado.risco, 'alto');
  assert.match(comprado.sinal, /não usar/);
  assert.ok(comprado.peso <= 0.2);
  const publico = classificar([{ nome: 'National Institutes of Health (NIH)' }], 'Sugar-sweetened beverages and body weight', 'J of Nutrition', L);
  assert.equal(publico.risco, 'baixo');
  assert.ok(publico.peso > 1);
  const silencio = classificar([], 'Meta-analysis of protein intake', 'AJCN', L);
  assert.equal(silencio.risco, 'desconhecido');
  assert.match(silencio.motivo, /Funding/);
  const monitorado = classificar([{ nome: 'National Dairy Council' }], 'Dairy and cardiometabolic health', 'Nutrition Reviews', L);
  assert.ok(['alto', 'moderado'].includes(monitorado.risco), `dairy council deveria sinalizar: ${monitorado.risco}`);
});

test('retratação e design pesam na ordem dos resultados', () => {
  const cands = [
    { titulo: 'Retracted: A meta-analysis of a supplement', tipo: 'meta-analysis', ano: 2019, citacoes: 900, financ: [], revista: 'X' },
    { titulo: 'Protein intake and muscle mass: a systematic review and meta-analysis', tipo: 'meta-analysis', ano: 2023, citacoes: 300, financ: [{ nome: 'Wellcome' }], revista: 'AJCN' },
    { titulo: ' Editorial: eat more supplements', tipo: 'editorial/material', ano: 2024, citacoes: 4, financ: [{ nome: 'DSM' }], revista: 'Nutrients' },
    { titulo: 'Cohort study of step count and mortality', tipo: 'cohort study', ano: 2025, citacoes: 40, financ: [{ nome: 'NIH' }], revista: 'JAMA' },
  ];
  const r = pontuar(cands as any, L, { excluirSetorial: true });
  assert.ok(r[0].titulo.includes('systematic review and meta-analysis'), 'meta-análise recente e sem conflito lidera');
  assert.equal(r.some((x) => x.titulo.includes('Editorial: eat more')), false, 'com financiamento setorial some da lista quando excluirSetorial');
  const sem = pontuar(cands as any, L, { excluirSetorial: false });
  assert.equal(sem.length, cands.length, 'sem filtro, tudo aparece — mas marcado');
  assert.ok(sem.find((x) => x.titulo.includes('Editorial'))!.peso < 0.3);
  assert.ok(sem.every((x) => typeof x.peso === 'number' && x.peso >= 0));
});

test('peso do desenho: revisão sistemática > editorial; boas práticas dão bônus', () => {
  assert.ok(pesoDesign('meta-analysis', L).p >= pesoDesign('editorial/material', L).p);
  const a = pesoDesign('randomized controlled trial', L);
  const b = pesoDesign('randomized controlled trial with PRISMA registered protocol', L);
  assert.ok(b.p >= a.p, 'pré-registro/PRISMA não pode pontuar menos');
  assert.equal(pesoDesign('não sei o que é isso', L).p, 0.5);
  assert.ok(pesoDesign('preprint', L).p <= 0.5, 'pre-print não pode pontuar alto');
  assert.ok(pesoDesign('review', L).p <= 0.5, 'revisão narrativa perde para ECA');
});

test('a própria base local se declara: nenhuma fonte entra sem localizador e sem nota de conflito', () => {
  const F = fontes();
  assert.ok(F.length >= 80);
  const semLoc = F.filter((f: any) => !f.doi && !f.pmid && !f.link);
  assert.deepEqual(semLoc.map((f: any) => f.id), [], 'toda fonte precisa de DOI/PMID/link');
  const semCf = F.filter((f: any) => !String(f.cf || '').trim());
  assert.deepEqual(semCf.map((f: any) => f.id), [], 'toda fonte precisa de linha de conflito de interesse');
  assert.ok(F.some((f: any) => f.ck === 0), 'precisa haver fontes marcadas como "verificar na fonte" (honestidade sobre o que não foi checado)');
  const anos = F.map((f: any) => Number(f.y)).filter((y: number) => y >= 1990 && y <= new Date().getFullYear() + 1);
  assert.equal(anos.length, F.length, 'ano fora do plausível');
  const desde2015 = F.filter((f: any) => Number(f.y) >= 2015).length;
  assert.ok(desde2015 / F.length > 0.55, `base envelhecida: só ${desde2015}/${F.length} de 2015+`);
});

test('programa de treino só referencia exercícios que existem, com progressão monotônica', () => {
  const ex = exercises();
  const porId = new Map(ex.map((e: any) => [e.id, e]));
  const prog = program();
  const programas = Array.isArray(prog.programas) ? prog.programas : Object.values(prog.programas);
  assert.ok(programas.length >= 5);
  let refs = 0;
  for (const p of programas as any[]) {
    for (const s of p.sessoes || []) for (const it of s.exercicios || []) {
      const alvo = porId.get(it.ex);
      assert.ok(alvo, `exercício inexistente: ${it.ex}`);
      assert.ok(it.series >= 1 && it.series <= 8);
      assert.ok(it.descanso >= 0 || it.tempo != null);
      refs++;
    }
    if (p.min_nivel != null) assert.ok(p.min_nivel >= 0);
  }
  assert.ok(refs > 60, `poucas prescrições no programa: ${refs}`);
  // XP por nível não pode decrescer
  const niv = prog['níveis'] || prog.niveis;
  niv.forEach((l: any, i: number) => { if (i > 0) assert.ok(l.xp > niv[i - 1].xp, `nível ${l.n} sem XP crescente`); });
});

test('exercícios: amplitude, cues e substituições resolvem; dificuldade é coerente', () => {
  const ex = exercises();
  assert.ok(ex.length >= 60);
  const ids = new Set(ex.map((e: any) => e.id));
  for (const e of ex as any[]) {
    assert.ok(Array.isArray(e.cues) && e.cues.length >= 2, `${e.id}: cues`);
    assert.ok(Array.isArray(e.erros) && e.erros.length >= 1, `${e.id}: erros`);
    assert.ok(typeof e.rom === 'string' && e.rom.length > 5, `${e.id}: rom`);
    assert.ok(typeof e.rir === 'string' ? /n\/a|isom/i.test(e.rir) : (e.rir >= 0 && e.rir <= 4), `${e.id}: rir (${e.rir})`);
    for (const s of e.sub || []) assert.ok(ids.has(s), `${e.id}: sub órfã ${s}`);
    assert.ok(typeof e.tempo === 'string' && e.tempo.length > 1, `${e.id}: tempo`);
  }
});
