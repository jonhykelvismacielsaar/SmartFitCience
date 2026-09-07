import test from 'node:test';
import assert from 'node:assert/strict';
import { eventosDoDia, pendentes, adiamentoDe, silencia, xpRegra, cobraca, REGRAS_PADRAO } from '../src/lib/scheduler.ts';
import { program } from './_dados.ts';

const metas = {
  agua: { copos: 8, copoMl: 250, aBeberL: 2.6 },
  sono: { cafeUltima: '15:00' },
  agenda: { wake: 420, sleep: 1380, refeicoes: [{ nome: 'Café da manhã', hora: 510 }, { nome: 'Almoço', hora: 750 }, { nome: 'Jantar', hora: 1200 }] },
};

test('eventos do dia cobrem água, refeições, sono e fechamento — e ficam na janela acordado/dormir', () => {
  const evs = eventosDoDia(metas as any, {}, { treinoAgora: true });
  const tipos = new Set(evs.map((e) => e.tipo));
  for (const t of ['agua', 'refeicao', 'treino', 'sono', 'mente', 'checar']) assert.ok(tipos.has(t as any), `faltou ${t}`);
  assert.equal(evs.filter((e) => e.tipo === 'agua').length, metas.agua.copos);
  assert.ok(evs.every((e) => e.hora >= metas.agenda.wake && e.hora <= metas.agenda.sleep), 'fora da janela');
  const horas = evs.map((e) => e.hora);
  assert.deepEqual(horas, [...horas].sort((a, b) => a - b), 'desordenado');
  assert.ok(new Set(evs.map((e) => e.id)).size === evs.length, 'ids duplicados');
});

test('o alerta fica pendente até confirmar; adiar empurra com backoff; depois do limite ele desiste', () => {
  const evs = eventosDoDia(metas as any);
  const agua1 = evs.find((e) => e.tipo === 'agua')!;
  const est = { feitos: [] as string[], adiamentos: {} as Record<string, number>, tocados: {} as Record<string, number> };
  assert.equal(pendentes(evs, agua1.hora - 1, est).ativos.some((a) => a.id === agua1.id), false, 'antes da hora não cobra');
  let p = pendentes(evs, agua1.hora, est);
  assert.ok(p.ativos.some((a) => a.id === agua1.id), 'na hora cobra');
  p = pendentes(evs, agua1.hora + 5, est);
  assert.ok(p.ativos.some((a) => a.id === agua1.id), '5 min depois continua cobrando');
  est.adiamentos[agua1.id] = 1;
  assert.equal(pendentes(evs, agua1.hora + 5, est).ativos.some((a) => a.id === agua1.id), false, 'adiamento segura até a nova hora');
  assert.ok(pendentes(evs, agua1.hora + 5 + adiamentoDe(1), est).ativos.some((a) => a.id === agua1.id), 'voltou a cobrar na hora adiada');
  est.feitos = [...est.feitos, agua1.id];
  assert.equal(pendentes(evs, 1439, est).ativos.some((a) => a.id === agua1.id), false, 'confirmou (OK) → para de cobrar');
  const est2 = { feitos: [], adiamentos: {}, tocados: { [agua1.id]: REGRAS_PADRAO.maxAdiamentos + 3 } };
  assert.equal(pendentes(evs, agua1.hora + 200, est2).ativos.some((a) => a.id === agua1.id), false, 'limite anti-spam respeitado');
});

test('modo gentil: refeição cobra 1 vez, e nada de cobrança depois das 22h', () => {
  const evs = eventosDoDia(metas as any, { gentil: true });
  assert.ok(evs.filter((e) => e.tipo === 'refeicao').length <= 3);
  const refeicao = evs.find((e) => e.tipo === 'refeicao')!;
  const est = { feitos: [], adiamentos: {}, tocados: { [refeicao.id]: 2 } };
  const regras = { ...REGRAS_PADRAO, gentil: true };
  assert.equal(pendentes(evs, refeicao.hora + 120, est, regras).ativos.some((a) => a.id === refeicao.id), false);
  assert.equal(evs.filter((e) => e.tipo === 'checar' && e.hora > 1320).length, 0);
});

test('backoff cresce e a janela silenciosa só silencia o som (não cancela o lembrete)', () => {
  const seq = [1, 2, 3, 4].map((n) => adiamentoDe(n));
  assert.ok(seq[0] < seq[1] && seq[1] < seq[2] && seq[3] >= seq[2], `backoff não monotônico: ${seq}`);
  assert.equal(adiamentoDe(0), 0);
  const r = { ...REGRAS_PADRAO, silenciosoEntre: [540, 600] as [number, number] };
  assert.equal(silencia(560, r), true);
  assert.equal(silencia(601, r), false);
  const cruzando = { ...REGRAS_PADRAO, silenciosoEntre: [1380, 300] as [number, number] };
  assert.equal(silencia(1400, cruzando), true);
  assert.equal(silencia(200, cruzando), true);
  assert.equal(silencia(700, cruzando), false);
});

test('cobrança sempre tem "ok" e "adiar", com o porquê científico no corpo', () => {
  for (const tipo of ['agua', 'refeicao', 'treino', 'sono', 'mente', 'checar'] as const) {
    const c = cobraca({ id: 'x', tipo, hora: 600, rotulo: 'R', detalhe: 'D' }, 0, metas as any);
    assert.ok(c.titulo.length > 3);
    assert.ok(c.corpo.length > 40, `${tipo}: corpo curto`);
    assert.ok(c.acoes.some((a) => a.id === 'ok'), `${tipo}: sem botão de confirmação`);
    assert.ok(c.acoes.some((a) => a.id === 'adiar'), `${tipo}: sem opção de adiar`);
  }
  const agua2 = cobraca({ id: 'x', tipo: 'agua', hora: 600, rotulo: 'Água 2/8', dados: { copo: 2 } }, 1, metas as any);
  assert.match(agua2.titulo, /aviso nº 2/);
  assert.match(agua2.corpo, /Dennis 2010/, 'cita a evidência');
});

test('XP vem das regras do program.json (com cap por sessão)', () => {
  const prog = program();
  const regras = prog.regras_xp_num || prog.regras_xp;
  const agua = xpRegra(regras, 'agua_copo', 1);
  assert.ok(agua > 0, 'regra de água sem XP');
  const serie = (prog.regras_xp_num || prog.regras_xp)['serie_concluida'] || prog.regras_xp['série_concluída'];
  assert.ok(xpRegra({ t: { base: 10 } }, 't', 3) === 30);
  assert.ok(xpRegra({ t: { base: 10, cap_por_sessao: 25 } }, 't', 9) === 25);
  assert.equal(xpRegra({}, 'inexistente', 1), 0);
  assert.ok(serie && Number(serie.base) >= 5);
  const refeicao = xpRegra(regras, 'refeicao_registrada', 1);
  assert.equal(xpRegra(regras, 'agua_copo', 20), 48, 'cap de 48 XP/dia de água');
  assert.ok(refeicao > 0);
});
