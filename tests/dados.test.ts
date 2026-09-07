import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { auditoriaBase, capsulas, fontes, alimentos, exercises, program, audits, meals } from './_dados.ts';

test('validador da base passa (ids, refs cruzadas, poses, programas)', () => {
  const out = execFileSync(process.execPath, ['scripts/validate-data.mjs'], { encoding: 'utf8' });
  assert.match(out, /base validada/);
});

test('cobertura mínima de conteúdo por área', () => {
  const F = fontes();
  const porArea: Record<string, number> = {};
  for (const f of F) porArea[f._area || ''] = (porArea[f._area || ''] || 0) + 1;
  assert.ok(F.length >= 80);
  assert.ok(F.filter((f: any) => /nutri|veg|prote|dieta|meat/i.test(String(f.t))).length >= 30, 'nutrição sub-representada');
  assert.ok(F.filter((f: any) => f.id && /Schoenfeld|Refalo|Paluch|Ekelund|Mandsager|militar|PERSPECTIVE/.test(f.id + f.t)).length >= 6, 'treino sub-representado');
  assert.ok(alimentos().length >= 100);
  assert.ok(exercises().length >= 55);
  const M = meals();
  for (const dieta of ['omni', 'lacto_ovo', 'veg']) assert.ok((M.modelos[dieta] || []).length >= 3, `sem modelos de refeição para ${dieta}`);
  assert.ok((audits().casos || []).length >= 5, 'poucos casos de conflito de interesse documentados');
  assert.ok((audits().mitos || []).length >= 8);
  assert.ok((audits().taticas_comerciais || []).length >= 5);
  assert.ok((audits().modulos_extra || []).length >= 6);
});

test('toda cápsula da Yayá tem pergunta-gatilho, resposta, refs e aviso quando sensível', () => {
  for (const c of capsulas() as any[]) {
    assert.ok(c.q.length >= 2, `${c.id}: gatilhos`);
    assert.ok(c.kw.length >= 3, `${c.id}: keywords`);
    assert.ok(c.refs.length >= 1, `${c.id}: refs`);
    assert.ok(c.a.length > 80, `${c.id}: resposta curta`);
    if (/medica|exame|rim|cora|press|gestan|TCA|transtorno|insulin|anticoagul/i.test(c.a)) {
      assert.ok((c.avisos || []).length >= 1, `${c.id}: resposta sensível sem aviso`);
    }
  }
});

test('fontes sensíveis trazem sempre a declaração de conflito (cf) e a nota de verificação quando ck:0', () => {
  const F = fontes();
  for (const f of F as any[]) {
    assert.ok(String(f.cf || '').length > 15, `${f.id}: linha de conflito ausente/curta`);
    if (f.ck === 0) assert.ok(String(f.no || '').length > 10, `${f.id}: ck:0 sem nota`);
    assert.ok(['A', 'B', 'C', 'D', 'E'].includes(f.e), `${f.id}: grau GRADE inválido`);
  }
  const duvidosas = F.filter((f: any) => f.ck === 0).length, confirmadas = F.filter((f: any) => f.ck === 1).length;
  assert.ok(F.every((f: any) => f.ck === 0 || f.ck === 1), 'campo ck precisa ser explícito (0 = conferir na fonte, 1 = checado)');
  assert.ok(confirmadas >= 10, 'precisa haver fontes efetivamente conferidas');
  assert.ok(duvidosas > 0, 'honestidade: sem rede no ambiente de build, parte dos DOIs fica marcada para conferência — a UI precisa mostrar isso');
  // o README precisa declarar a limitação de verificação
  const readme = execFileSync('sh', ['-c', 'cat README.md'], { encoding: 'utf8' });
  assert.match(readme, /verificar na fonte|ck:0|conferir na fonte/i);
});

test('auditoria: risco comercial e pesos de desenho coerentes', () => {
  const a = audits();
  assert.ok(a.metodo_selecao.passos.length >= 5);
  assert.ok(a.riscos_comerciais.length >= 3);
  const peso = a.listas_filtro.tipos_desenho_peso;
  assert.ok(peso['meta-analysis'] >= peso['randomized controlled trial']);
  assert.ok(peso['randomized controlled trial'] > peso['editorial/material']);
  assert.ok(a.listas_filtro.bloqueio_recomendacao.padroes.some((p: string) => /coca|pepsico|nestl/i.test(p)));
});

test('programação: níveis, emblemas e clãs cobrem o jogo inteiro', () => {
  const p = program();
  const niv = p['níveis'] || p.niveis;
  assert.equal(niv.length, 10);
  assert.equal(niv[0].xp, 0);
  assert.ok(niv.every((l: any) => (l.unlocked || []).length > 0), 'tem nível sem nada destravado');
  assert.ok(p.emblemas.length >= 8);
  assert.ok(p.clas.length >= 3);
  assert.ok(Object.keys(p.ajustes_diet).length >= 5, 'faltam ajustes por dieta');
  assert.ok(p.chefes_reavaliacao.length >= 3);
  assert.ok(p.programas.length >= 5);
  assert.ok(p.programas.every((x: any) => x.min_nivel != null), 'programa sem nível mínimo (desbloqueio)');
});
