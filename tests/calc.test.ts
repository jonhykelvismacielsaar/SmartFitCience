import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/lib/calc.ts';

const base = { sexo: 'm' as const, peso: 80, altura: 178, idade: 30 };

test('Geb Mifflin-St Jeor bate a fórmula conhecida', () => {
  const g = C.geb(base);
  assert.equal(g.valor, Math.round(10 * 80 + 6.25 * 178 - 5 * 30 + 5)); // 1751
  assert.equal(C.geb({ ...base, sexo: 'f' }).valor, g.valor - 166);
  assert.ok(C.geb({ ...base, gorduraPct: 12 }).katch! > 1751 - 200);
});

test('Fator de atividade aumenta com o nível e inclui EAT', () => {
  const baixo = C.getmetabolico(1700, 1), alto = C.getmetabolico(1700, 4);
  assert.ok(alto.valor > baixo.valor * 1.4);
  assert.ok(baixo.eat > 100);
});

test('Déficit respeita teto de taxa e piso de segurança', () => {
  const r = C.alvoEnergia(3000, 'perder_gordura', { peso: 110, altura: 175, sexo: 'm', idade: 35, condicoes: [] });
  assert.ok(r.kcal <= 3000 - 250);
  assert.ok(r.kcal >= r.piso, 'não pode cortar abaixo do piso');
  assert.ok(Math.abs(r.rate) <= 1.0, 'máx ~1% do peso/semana');
  const magro = C.alvoEnergia(2200, 'perder_gordura', { peso: 60, altura: 165, sexo: 'f', idade: 30, condicoes: [] });
  assert.ok(magro.kcal >= magro.piso);
});

test('Gestante não recebe déficit; histórico de TCA entra em modo não-dietário', () => {
  const g = C.alvoEnergia(2600, 'perder_gordura', { peso: 70, altura: 165, sexo: 'f', idade: 30, condicoes: ['gestante'] });
  assert.ok(g.kcal >= 2600 * 0.95, 'sem restrição na gestação');
  assert.match(g.racional, /Gestante/);
  const t = C.alvoEnergia(2600, 'perder_gordura', { peso: 70, altura: 165, sexo: 'f', idade: 30, condicoes: ['tca'] });
  assert.ok(t.kcal >= 2600 * 0.95);
  assert.match(t.racional, /não-dietário/);
});

test('Proteína: base 1,6 g/kg, sobe em déficit e sobe ainda mais sem carne', () => {
  const m = (o: any) => C.macros(2500, 80, { goal: 'saude', treinoDias: 3, idade: 30, condicoes: [], ...o });
  const omni = m({ diet: 'omni' }); const veg = m({ diet: 'veg' });
  assert.equal(omni.proteinPerKg, 1.6);
  assert.ok(veg.proteinPerKg > omni.proteinPerKg, 'veg come +proteína por kg (Clarys 2014)');
  const def = C.macros(2100, 80, { goal: 'perder_gordura', diet: 'veg', treinoDias: 4, idade: 30, condicoes: [] });
  assert.ok(def.proteinPerKg >= 2.1, 'déficit: ~2,15 g/kg + ajuste vegetal (Morton 2018 / Longland 2016)');
  assert.ok(def.proteinPorRefeicao >= 30, '30–40 g por refeição');
  assert.ok(omni.fat >= 0.6 * 80, 'gordura mínima para hormônios');
  assert.ok(def.fat * 9 <= def.kcal * 0.36);
});

test('Idoso: piso de 1,8 g/kg; DRC: teto de 1,0 g/kg', () => {
  const ido = C.macros(2400, 70, { goal: 'saude', diet: 'omni', treinoDias: 3, idade: 72, condicoes: [] });
  assert.ok(ido.proteinPerKg >= 1.8);
  assert.ok(ido.leucinaAlvo >= 3.2, 'leucina maior em >50 (Bauer 2013)');
  const drc = C.macros(2400, 70, { goal: 'saude', diet: 'omni', treinoDias: 3, idade: 40, condicoes: ['drc'] });
  assert.ok(drc.proteinPerKg <= 1.0);
});

test('Água: copos proporcionais ao peso, treino e calor; 25% vem dos alimentos', () => {
  const a = C.agua(2500, 80, { treinoMin: 60, calor: 0 });
  const b = C.agua(2500, 80, { treinoMin: 60, calor: 1 });
  assert.ok(b.totalL > a.totalL);
  assert.ok(a.alimentosL > 0 && a.alimentosL < a.totalL);
  assert.ok(a.copos >= 4);
  assert.equal(Math.round(a.aBeberL * 1000 / a.copoMl), a.copos);
});

test('Filtros de dieta no banco de alimentos', () => {
  assert.equal(C.alimentosPermitidos('v', 'veg'), true);
  assert.equal(C.alimentosPermitidos('l', 'veg'), false);
  assert.equal(C.alimentosPermitidos('o', 'lacto'), false);
  assert.equal(C.alimentosPermitidos('l', 'lacto'), true);
  assert.equal(C.alimentosPermitidos('p', 'ovo'), false);
  assert.equal(C.alimentosPermitidos('a', 'omni'), true);
  assert.deepEqual(C.DIET_PERMITIDAS.lacto_ovo, ['v', 'l', 'o']);
});

test('Micronutrientes: B12 crítico no vegano, ferro ×1,8, cálcio maior em idosa', () => {
  const v = C.micronutrientes('veg', 'f', 30, 60, [], 2200);
  const o = C.micronutrientes('omni', 'f', 30, 60, [], 2200);
  const b12 = v.itens.find((i: any) => i.id === 'b12')!;
  assert.equal(b12.status, 'critico');
  assert.ok(/obrigatório/.test(b12.suplementar!));
  assert.equal(o.itens.find((i: any) => i.id === 'b12')!.status, 'ok');
  const ferroV = v.itens.find((i: any) => i.id === 'ferro')!.alvo;
  const ferroO = o.itens.find((i: any) => i.id === 'ferro')!.alvo;
  assert.ok(Math.abs(ferroV / ferroO - 1.8) < 0.05, `ferro vegetaliano ×1.8 (${ferroV} vs ${ferroO})`);
  const idosa = C.micronutrientes('omni', 'f', 60, 60, ['menopausa'], 2000);
  assert.equal(idosa.itens.find((i: any) => i.id === 'calcio')!.alvo, 1200);
});

test('Riscos geram bloqueios concretos (gestante: sem déficit)', () => {
  const r = C.riscos({ condicoes: ['gestante', 'dm2'], sexo: 'f', idade: 30, imc: 26 });
  const gest = r.find((x) => x.id === 'gest')!;
  assert.ok(gest.bloqueios.includes('deficit'));
  assert.equal(r.find((x) => x.id === 'dm')!.nivel, 'atencao');
  const tca = C.riscos({ condicoes: ['tca'], sexo: 'f', idade: 25, imc: 17.5 });
  assert.ok(tca.some((x) => x.bloqueios.includes('kcal') || x.bloqueios.includes('balanca_diaria') || x.id === 'imc'));
});

test('Agenda do dia: refeições e água dentro da janela acordado-dormir', () => {
  const a = C.agua(2400, 80, { treinoMin: 60, calor: 0 });
  const ag = C.agenda({ acorda: '06:30', dormir: '23:00', agua: a, treinoMin: 60, refeições: 4, calor: false });
  assert.equal(ag.refeições.length, 4);
  for (const r of ag.refeições) assert.ok(r.hora >= 6 * 60 + 30 + 60 - 5 && r.hora <= 23 * 60 - 150, `${r.nome} às ${r.hora} fora da janela`);
  assert.ok(ag.alerts.every((x) => x.hora >= 6 * 60 && x.hora <= 23 * 60 + 10));
  assert.match(ag.cafeUltima, /^\d\d:\d\d$/);
});

test('Níveis por XP são monotônicos e o progresso fica em 0..1', () => {
  const niveis = [{ n: 0, xp: 0, nome: 'a' }, { n: 1, xp: 200, nome: 'b' }, { n: 2, xp: 700, nome: 'c' }];
  assert.equal(C.nivel(0, niveis).level.n, 0);
  assert.equal(C.nivel(200, niveis).level.n, 1);
  assert.equal(C.nivel(699, niveis).level.n, 1);
  assert.equal(C.nivel(5000, niveis).next, null);
  assert.ok(C.nivel(450, niveis).prog > 0 && C.nivel(450, niveis).prog < 1);
});

test('Streak perdoa 1 dia, não perdoa 2; multiplicador cresce', () => {
  const hoje = new Date('2026-09-07T12:00:00Z');
  assert.equal(C.streakDe(['2026-09-07', '2026-09-06', '2026-09-05'], hoje), 3);
  assert.equal(C.streakDe(['2026-09-07', '2026-09-06', '2026-09-04'], hoje), 3, 'dia de folga perdoado');
  assert.equal(C.streakDe(['2026-09-07', '2026-09-06', '2026-09-03'], hoje), 2, 'dois buracos seguidos quebram');
  assert.equal(C.streakDe(['2026-09-05', '2026-09-04'], hoje), 0, 'sem registro nos últimos 2 dias');
  assert.ok(C.multStreak(30) > C.multStreak(7) && C.multStreak(7) > C.multStreak(0));
});

test('Carga aguda:crônica sinaliza subida rápida demais', () => {
  const dados = [
    { volume: 100, rir: 2, data: '2026-09-06' }, { volume: 100, rir: 2, data: '2026-09-04' }, { volume: 100, rir: 2, data: '2026-09-02' },
    { volume: 40, rir: 2, data: '2026-08-20' }, { volume: 40, rir: 2, data: '2026-08-12' },
  ];
  const r = C.ratioCarga(dados as any, new Date('2026-09-07T12:00:00Z'));
  assert.equal(r.zona, 'risco');
  const suave = C.ratioCarga([
    { volume: 100, rir: 2, data: '2026-09-06' }, { volume: 100, rir: 2, data: '2026-08-30' },
    { volume: 100, rir: 2, data: '2026-08-23' }, { volume: 100, rir: 2, data: '2026-08-16' },
  ] as any, new Date('2026-09-07T12:00:00Z'));
  assert.notEqual(suave.zona, 'risco');
  const parado = C.ratioCarga([{ volume: 90, rir: 2, data: '2026-08-15' }] as any, new Date('2026-09-07T12:00:00Z'));
  assert.equal(parado.zona, 'desestímulo');
});

test('1RM (Epley) e volume por grupo muscular', () => {
  assert.equal(C.umRm(100, 10), 133.3);
  const v = C.volumePorGrupo({ sessoes: [{ exercicios: [{ ex: 'squat_goblet', series: 3 }, { ex: 'leg_press', series: 2 }] }] }, {
    squat_goblet: { grp: 'quadríceps' }, leg_press: { grp: 'quadríceps' },
  });
  assert.equal(v.quadríceps, 5);
});

test('Idade a partir do nascimento (com aniversário não completado)', () => {
  assert.equal(C.idade('1996-05-10', new Date('2026-09-07')), 30);
  assert.equal(C.idade('1996-12-10', new Date('2026-09-07')), 29);
  assert.ok(C.idade('') >= 10);
});

test('Risco vitalício cai com passos e força, sobe com tabagismo', () => {
  const sed = C.riscoVitalicio({ idade: 45, sexo: 'm', imc: 29, fuma: false, pressao: [135, 88], ldl: 150, passos: 3000, treinosForca: 0 });
  const ativo = C.riscoVitalicio({ idade: 45, sexo: 'm', imc: 25, fuma: false, pressao: [118, 75], ldl: 100, passos: 9000, treinosForca: 3 });
  assert.ok(ativo.pontos < sed.pontos - 4);
  const ativoIn = { idade: 45, sexo: 'm' as const, imc: 25, fuma: false, pressao: [118, 75], ldl: 100, passos: 9000, treinosForca: 3 };
  assert.equal(ativo.classe, 'baixo', 'rotina ativa leva ao andar de baixo da escala');
  assert.ok(C.riscoVitalicio({ ...ativoIn, fuma: true }).pontos > ativo.pontos);
});

test('US Navy: %G calculado só com circunferências suficientes', () => {
  assert.equal(C.gorduraPct({ sex: 'm', altura: 178, peso: 80, cintura: 90, pescoco: 38 })! > 10, true);
  assert.equal(C.gorduraPct({ sex: 'm', altura: 178, peso: 80 }), null);
});

test('maiorSequencia conta calendário real, não posição no array', () => {
  assert.equal(C.maiorSequencia([]), 0);
  assert.equal(C.maiorSequencia(['2026-01-01']), 1);
  assert.equal(C.maiorSequencia(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05']), 3);
  // virada de mês/ano
  assert.equal(C.maiorSequencia(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']), 4);
  // dias fora de ordem ainda contam a sequência
  assert.equal(C.maiorSequencia(['2026-03-10', '2026-03-08', '2026-03-09']), 3);
  // duplicado não infla
  assert.equal(C.maiorSequencia(['2026-03-08', '2026-03-08', '2026-03-09']), 2);
});
