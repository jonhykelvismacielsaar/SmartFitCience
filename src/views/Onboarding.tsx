import { useMemo, useState } from 'react';
import { useApp, Abas } from '../App.tsx';
import { DB, fmt, calcFromPerfil, hojeKey } from '../lib/db.ts';
import { ACTIVIDADE, NIVEIS_DIETA } from '../lib/calc.ts';
import { Card, Chip, Field, NumField, Seg, Toggle, Bar } from '../components/ui.tsx';
import { ExerciseFigure } from '../components/Figure.tsx';

const PASSOS = ['quem é você', 'corpo', 'rotina & objetivo', 'prato (dieta)', 'horários', 'treino', 'saúde & exames', 'alertas', 'seu plano'];

const CONDICOES = [
  { id: 'hipertensao', nome: 'Hipertensão' }, { id: 'dm2', nome: 'Diabetes / pré-diabetes' }, { id: 'dislipidemia', nome: 'Colesterol alto' },
  { id: 'drc', nome: 'Doença renal' }, { id: 'osteopenia', nome: 'Osteopenia/osteoporose' }, { id: 'tca', nome: 'Histórico de transtorno alimentar' },
  { id: 'gestante', nome: 'Gestante / lactante' }, { id: 'anemia', nome: 'Anemia conhecida' }, { id: 'tireoide', nome: 'Tireoide' },
  { id: 'lesao', nome: 'Lesão cirúrgica recente' }, { id: 'nenhuma', nome: 'Nenhuma dessas' },
];
const EQUIP = ['peso_corporal', 'casa', 'halter', 'elastico', 'kettlebell', 'academia', 'barra_fixa', 'paralelas', 'banco', 'bike_ergometro'];
const NIVEL_INI = [
  { v: 0, nome: 'Nunca treinei / parado há muito tempo' }, { v: 1, nome: 'Sei os movimentos, treino de vez em quando' },
  { v: 2, nome: 'Treino há meses com carga registrada' }, { v: 3, nome: 'Anos de treino, conheço meus 1RMs' },
];

export default function Onboarding() {
  const { store, irPara } = useApp();
  const [n, setN] = useState(0);
  const p: any = useMemo(() => ({
    nome: '', handle: '', sexo: 'm', nascimento: '', alturaCm: 175, pesoKg: 78, unidade: 'metrica',
    cinturaCm: null, pescocoCm: null, quadrilCm: null, gcPct: null,
    atividade: 2, objetivo: 'recomposicao', treinoDias: 3, dieta: 'lacto_ovo', restricoes: [], evitar: [], refeicoesDia: 4,
    acorda: '07:00', dormir: '23:00', aguaCopoMl: 250, modoCalor: false, gentil: false, som: true, vibrar: true, notificacoes: false,
    condicoes: [], nivelInicial: 1, equip: ['casa', 'halter'], experiencia: 'intermediario', exames: {} as any,
    bio: '', clan: null, clampeamento: false, metaPeso: null, passosManual: false,
    ...(store.estado.perfil || {}),
  }), [store.estado.perfil]);
  const [d, setD] = useState<any>(p);
  const set = (k: string, v: any) => setD((x: any) => ({ ...x, [k]: v }));
  const toggleArr = (k: string, v: string) => setD((x: any) => ({ ...x, [k]: (x[k] || []).includes(v) ? x[k].filter((i: string) => i !== v) : [...(x[k] || []), v] }));

  const preview = useMemo(() => {
    try { return calcFromPerfil({ ...d, peso: d.pesoKg, altura: d.alturaCm, idade: 30 }); } catch { return null; }
  }, [d]);
  const completa = ['nome', 'nascimento', 'alturaCm', 'pesoKg', 'dieta', 'objetivo'].every((k) => d[k] !== '' && d[k] != null);

  const finalizar = () => {
    const perfil = { ...d, pesoInicial: d.pesoKg, criadoEm: new Date().toISOString(), nivel: d.nivelInicial, __adiamentos: {} };
    store.mutar((e) => ({
      ...e, perfil,
      dias: { ...e.dias, [hojeKey()]: { ...({ agua: 0, copos: [], refeicoes: {}, treino: null, sonoH: null, pesoKg: d.pesoKg, passos: null, humor: null, stress: null, checkins: [], fotos: [], kcal: 0, prot: 0, fibra: 0, mindfulnessMin: 0, notas: '', quests: {} } as any) } },
      preferencias: { ...e.preferencias, som: d.som, vibrar: d.vibrar, notificacoes: d.notificacoes, modoCalor: d.modoCalor, gentil: d.gentil },
    }));
    if (d.notificacoes && 'Notification' in window) Notification.requestPermission().catch(() => {});
    irPara('hoje');
  };

  return (
    <div className="app" style={{ minHeight: '100vh' }}>
      <header className="topbar">
        <div className="brand"><div className="logo">✦</div><div>SmartFit Science<small>montando seu plano com evidência auditada</small></div></div>
        <div className="spacer" />
        <span className="pill blue">7 passos · ~3 min</span>
      </header>
      <main style={{ maxWidth: 780 }}>
        <div className="onb">
          <div className="steps">{PASSOS.map((s, i) => <i key={s} className={i <= n ? 'on' : ''} title={s} />)}</div>
          <h1>{n === 0 ? 'Oi. Vamos te conhecer de verdade.' : PASSOS[n - 1] ? `Passo ${n + 1}: ${PASSOS[n]}` : ''}</h1>
          <p className="dim">
            Nada aqui vai para nuvem por padrão: perfil e diários ficam no seu dispositivo (localStorage). Se você criar conta, o app sincroniza com o servidor local do projeto — e só publica no feed a projeção pública (nick, dieta, nível, streak).
          </p>

          {n === 0 && (
            <Card title="identidade">
              <div className="grid g2">
                <Field label="Como quer ser chamado(a)"><input value={d.nome} onChange={(e) => set('nome', e.target.value)} placeholder="ex.: Caio" /></Field>
                <Field label="@handle (para a tribo)"><input value={d.handle} onChange={(e) => set('handle', e.target.value.replace(/[^a-z0-9_.]/gi, '').toLowerCase())} placeholder="caio.ferro" /></Field>
              </div>
              <Field label="Frase do seu perfil (opcional)"><input value={d.bio} onChange={(e) => set('bio', e.target.value)} placeholder="ex.: 34 anos, vegano há 3 anos, tentando chegar na prancha de 2 min" /></Field>
              <div className="tiny">Isso é o que a tribo vê. Peso, exames e diário ficam privados por padrão.</div>
            </Card>
          )}

          {n === 1 && (
            <Card title="corpo" aux="Mifflin-St Jeor + US Navy quando houver medidas">
              <div className="grid g3">
                <Field label="Sexo biológico (para as fórmulas)"><select value={d.sexo} onChange={(e) => set('sexo', e.target.value)}><option value="m">masculino</option><option value="f">feminino</option><option value="other">outro / prefiro não dizer</option></select></Field>
                <Field label="Data de nascimento"><input type="date" value={d.nascimento} onChange={(e) => set('nascimento', e.target.value)} max={new Date().toISOString().slice(0, 10)} /></Field>
                <Field label="Unidade"><Seg opts={[{ v: 'metrica', label: 'kg / cm' }, { v: 'imper', label: 'lb / in' }]} value={d.unidade} onChange={(v) => set('unidade', v)} /></Field>
              </div>
              <div className="grid g4">
                <NumField label="Altura" suffix="cm" value={d.alturaCm} onChange={(v) => set('alturaCm', v)} min={120} max={230} />
                <NumField label="Peso" suffix="kg" value={d.pesoKg} onChange={(v) => set('pesoKg', v)} min={30} max={320} step={0.5} />
                <NumField label="Cintura" suffix="cm" value={d.cinturaCm} onChange={(v) => set('cinturaCm', v)} min={50} max={180} />
                <NumField label="Pescoço" suffix="cm" value={d.pescocoCm} onChange={(v) => set('pescocoCm', v)} min={25} max={60} />
                <NumField label="Quadril" suffix="cm" value={d.quadrilCm} onChange={(v) => set('quadrilCm', v)} min={60} max={170} />
                <NumField label="% gordura (se souber)" suffix="%" value={d.gcPct} onChange={(v) => set('gcPct', v)} min={4} max={60} step={0.5} hint="opcional — com %GC o app cruza Mifflin com Katch-McArdle" />
              </div>
              {preview && (
                <div className="grid g4" style={{ marginTop: 6 }}>
                  <Resumo rot="GEB" valor={fmt.n(preview.geb.valor)} detalhe={preview.geb.nota} />
                  <Resumo rot="Gasto (GET)" valor={fmt.n(preview.gasto.valor)} detalhe={`fator ${preview.gasto.fator} + EAT ${preview.gasto.eat} kcal`} />
                  <Resumo rot="IMC" valor={fmt.n(preview.imc, 1)} detalhe="IMC é peneira, não diagnóstico: use com cintura e força" />
                  <Resumo rot="% GC (Navy)" valor={preview.bf ? `${fmt.n(preview.bf, 1)}%` : '—'} detalhe={preview.bf ? 'precisão ±3–4 pts; tendência > número absoluto' : 'preencha cintura + pescoço (e quadril se mulher)'} />
                </div>
              )}
            </Card>
          )}

          {n === 2 && (
            <Card title="rotina & objetivo">
              <Field label="Como é seu dia físico">
                <div className="col">
                  {ACTIVIDADE.map((a) => (
                    <label key={a.v} className="row" style={{ cursor: 'pointer' }} onClick={() => set('atividade', a.v)}>
                      <input type="radio" name="at" checked={d.atividade === a.v} onChange={() => set('atividade', a.v)} />
                      <b style={{ fontSize: 13 }}>{a.nome}</b><span className="tiny">{a.desc} · fator {a.f}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Objetivo (muda kcal, não a dieta)">
                <div className="chips">
                  {[['recomposicao', 'Recompor (perder gordura e ganhar músculo)'], ['perder_gordura', 'Perder gordura'], ['ganhar_massa', 'Ganhar massa'], ['saude', 'Saúde / performance']].map(([v, l]) => (
                    <Chip key={v} on={d.objetivo === v} onClick={() => set('objetivo', v)}>{l}</Chip>
                  ))}
                </div>
              </Field>
              <div className="tiny">O app limita a velocidade: perder peso mais rápido que ~0,5–1% do peso/semana aumenta perda de massa magra (Helms 2014; Thomas 2012). Metas "impossíveis" não são motivacionais aqui — são a causa do efeito sanfona.</div>
            </Card>
          )}

          {n === 3 && (
            <Card title="prato" aux="abas por dieta: cada uma tem seu filtro no banco de alimentos">
              <Field label="Padrão alimentar">
                <div className="chips">
                  {Object.entries(NIVEIS_DIETA).map(([v, o]: [string, any]) => (
                    <Chip key={v} on={d.dieta === v} onClick={() => set('dieta', v)} title={`permite: ${o.flags.join('/')}`}>{o.nome}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Restrições / intolerâncias">
                <div className="chips">
                  {[['lactose', 'lactose'], ['gluten', 'glúten'], ['ovo', 'ovo'], ['oleaginosas', 'oleaginosas'], ['peixe', 'peixe/frutos do mar'], ['soja', 'soja']].map(([v, l]) => (
                    <Chip key={v} on={(d.restricoes || []).includes(v)} onClick={() => toggleArr('restricoes', v)}>{l}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Não como / não gosto (o gerador evita)"><input value={(d.evitar || []).join(', ')} onChange={(e) => set('evitar', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="ex.: jiló, fígado, coxão" /></Field>
              <div className="grid g2">
                <Field label="Refeições por dia"><Seg opts={[3, 4, 5].map((v) => ({ v, label: `${v}` }))} value={d.refeicoesDia} onChange={(v) => set('refeicoesDia', v)} /></Field>
                <Field label="Por que esse padrão? (opcional, aparece no seu perfil)">
                  <input value={d.motivoDieta || ''} onChange={(e) => set('motivoDieta', e.target.value)} placeholder="ética, saúde, bolso, ambiente…" />
                </Field>
              </div>
              <div className="tiny">Tanto o plano onívoro quanto o vegano passam pelo mesmo crivo: proteína ≥1,6 g/kg (ajustada para cima quando 70%+ vem de planta — Clarys 2014), fibra, cálcio, ferro, B12 e pouca comida ultraprocessada (AHA 2026; Lane 2024).</div>
            </Card>
          )}

          {n === 4 && (
            <Card title="horários e água">
              <div className="grid g3">
                <Field label="Acordo às"><input type="time" value={d.acorda} onChange={(e) => set('acorda', e.target.value)} /></Field>
                <Field label="Durmo às"><input type="time" value={d.dormir} onChange={(e) => set('dormir', e.target.value)} /></Field>
                <Field label="Copo padrão"><Seg opts={[{ v: 200, label: '200 mL' }, { v: 250, label: '250 mL' }, { v: 350, label: '350 mL' }, { v: 500, label: '500 mL' }]} value={d.aguaCopoMl} onChange={(v) => set('aguaCopoMl', v)} /></Field>
              </div>
              {preview && (
                <>
                  <Bar pct={1} label={`meta de água: ${fmt.n(preview.agua.aBeberL, 1)} L a beber (${preview.agua.copos} copos de ${d.aguaCopoMl || 250} mL) + ${fmt.n(preview.agua.alimentosL, 1)} L dos alimentos`} />
                  <div className="grid g2" style={{ marginTop: 10 }}>
                    {(preview.agenda.refeições || []).map((r: any) => <div key={r.nome} className="pill blue" style={{ justifyContent: 'space-between' }}><span>{r.nome}</span><b className="mono">{r.hhmm}</b></div>)}
                  </div>
                  <div className="tiny" style={{ marginTop: 8 }}>A última janela de café fica antes de <b className="mono">{preview.agenda.cafeUltima}</b> — cafeína tem meia-vida de ~5 h e deitar sem "descer" o pico é o jeito mais fácil de perder sono (Watson 2015).</div>
                </>
              )}
              <Toggle checked={d.modoCalor} onChange={(v) => set('modoCalor', v)}>Dia quente / suor intenso (soma ~0,7 L e lembra de eletrólito)</Toggle>
            </Card>
          )}

          {n === 5 && (
            <Card title="treino" aux="níveis destravam por XP, não por tempo">
              <div className="grid g2">
                <NumField label="Dias de força por semana" value={d.treinoDias} onChange={(v) => set('treinoDias', v)} min={2} max={6} />
                <Field label="Experiência"><select value={d.nivelInicial} onChange={(e) => set('nivelInicial', Number(e.target.value))}>{NIVEL_INI.map((o) => <option key={o.v} value={o.v}>{o.nome}</option>)}</select></Field>
              </div>
              <Field label="Equipamento disponível (o filtro de exercícios usa isto)">
                <div className="chips">
                  {EQUIP.map((e) => <Chip key={e} on={(d.equip || []).includes(e)} onClick={() => toggleArr('equip', e)}>{e.replace(/_/g, ' ')}</Chip>)}
                </div>
              </Field>
              <div className="grid g2" style={{ alignItems: 'center' }}>
                <div>
                  <div className="okbox">O app começa pelo nível {(DB.program['níveis'] || [])[Math.max(0, Math.min(3, d.nivelInicial))]?.nome}: prioridade é técnica + amplitude (ROM), que é o que sustenta carga depois (ROM 2023; Folland 2006). XP só vem de série válida.</div>
                  <div className="tiny" style={{ marginTop: 6 }}>Cada exercício tem <em className="ref" title="dica executável, não 'contraia o abdômen'">cues</em>, <em className="ref" title="erro comum com correção">erros</em>, regressão e progressão.</div>
                </div>
                <ExerciseFigure pose="squat" altura={168} rotulo="agachamento goblet" />
              </div>
            </Card>
          )}

          {n === 6 && (
            <Card title="saúde & exames" aux="só para ajustar metas e gerar alertas — nada aqui é diagnóstico">
              <Field label="Condições que mudam o cálculo">
                <div className="chips">{CONDICOES.map((c) => <Chip key={c.id} on={(d.condicoes || []).includes(c.id)} onClick={() => toggleArr('condicoes', c.id)}>{c.nome}</Chip>)}</div>
              </Field>
              <div className="grid g4">
                <NumField label="PA sistólica" suffix="mmHg" value={d.pressao?.[0]} onChange={(v) => set('pressao', [v, d.pressao?.[1] ?? 80])} min={80} max={240} />
                <NumField label="PA diastólica" suffix="mmHg" value={d.pressao?.[1]} onChange={(v) => set('pressao', [d.pressao?.[0] ?? 120, v])} min={40} max={150} />
                <NumField label="Ferritina" suffix="ng/mL" value={d.exames?.ferritina} onChange={(v) => set('exames', { ...d.exames, ferritina: v })} min={1} max={1200} />
                <NumField label="B12" suffix="pg/mL" value={d.exames?.b12} onChange={(v) => set('exames', { ...d.exames, b12: v })} min={50} max={2000} />
                <NumField label="Vitamina D" suffix="ng/mL" value={d.exames?.vitd} onChange={(v) => set('exames', { ...d.exames, vitd: v })} min={2} max={120} />
                <NumField label="LDL" suffix="mg/dL" value={d.exames?.ldl} onChange={(v) => set('exames', { ...d.exames, ldl: v })} min={20} max={400} />
                <NumField label="HbA1c" suffix="%" value={d.exames?.hba1c} onChange={(v) => set('exames', { ...d.exames, hba1c: v })} min={3} max={16} step={0.1} />
                <NumField label="FC repouso" suffix="bpm" value={d.fcRepouso} onChange={(v) => set('fcRepouso', v)} min={30} max={120} />
              </div>
              {preview && preview.riscos.length > 0 && (
                <div className="col" style={{ marginTop: 6 }}>
                  {preview.riscos.map((r: any) => (
                    <div key={r.id} className={r.nivel === 'acao' ? 'badbox' : r.nivel === 'atencao' ? 'warnbox' : 'okbox'}>
                      <b>{r.nivel === 'acao' ? '🚑' : r.nivel === 'atencao' ? '⚠️' : 'ℹ️'} {r.titulo}.</b> {r.texto}
                      {r.bloqueios?.length ? <div className="tiny" style={{ marginTop: 3 }}>o app bloqueia: {r.bloqueios.join(', ')}</div> : null}
                    </div>
                  ))}
                </div>
              )}
              <div className="tiny">Não precisa encher de número: exames são anuais na maioria dos casos. A lista do painel sugerido está em Evolução (base: USPSTF/OMS quando aplicável).</div>
            </Card>
          )}

          {n === 7 && (
            <Card title="alertas (o 'me avisa e não me deixa no vácuo')">
              <div className="grid g2">
                <div className="col">
                  <Toggle checked={d.notificacoes} onChange={(v) => set('notificacoes', v)}>Notificações do navegador (funciona com a aba minimizada)</Toggle>
                  <Toggle checked={d.som} onChange={(v) => set('som', v)}>Som de aviso (bip curto)</Toggle>
                  <Toggle checked={d.vibrar} onChange={(v) => set('vibrar', v)}>Vibrar (celular)</Toggle>
                  <Toggle checked={d.gentil} onChange={(v) => set('gentil', v)}>Modo gentil: comida/sono avisam no máx. 3× e sem cobrança depois das 22 h</Toggle>
                </div>
                <div className="warnbox">
                  <b>Regra que você pediu e que é levada a sério:</b> o alerta não desaparece sozinho. Ele fica na tela até você responder “fiz”, “adiar” ou “não vou fazer agora”. Ao adiar, o app volta em 6 → 10 → 15 → 20 min e para de insistir depois de {4} avisos — insistência sem fim vira ruído e faz você fechar o app (Lally 2010; Howe 2022).
                </div>
              </div>
            </Card>
          )}

          {n === 8 && preview && (
            <div className="grid g2">
              <Card title="seus números" tone="neon">
                <div className="rings" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <Meta rot="Energia" v={fmt.n(preview.energia.kcal)} unit="kcal/dia" d={preview.energia.racional} />
                  <Meta rot="Proteína" v={`${preview.proteina.protein} g`} unit={`${preview.proteina.proteinPerKg} g/kg`} d={`≈ ${preview.proteina.proteinPorRefeicao} g × ${preview.proteina.refeicoes} refeições · leucina ${preview.proteina.leucinaAlvo} g`} />
                  <Meta rot="Fibra" v={`${preview.proteina.fibra} g`} unit="/dia" d="14 g por 1 000 kcal, mais folhosas e leguminosas" />
                  <Meta rot="Água" v={`${fmt.n(preview.agua.aBeberL, 1)} L`} unit={`≈ ${preview.agua.copos} copos`} d={preview.agua.nota} />
                </div>
                <div className="hr" />
                <div className="grid g3">
                  <Meta rot="Carboidrato" v={`${preview.proteina.carb} g`} unit={`${preview.proteina.carbPerKg} g/kg`} />
                  <Meta rot="Gordura" v={`${preview.proteina.fat} g`} unit={`saturada < ${preview.proteina.saturadaMaxG} g`} />
                  <Meta rot="Passos" v={fmt.n(preview.treino.passos)} unit="/dia" d={preview.treino.passosNota} />
                </div>
              </Card>
              <Card title="o que o app faz com isso" tone="blue">
                <ul className="tick">
                  <li>Gerador de cardápio: resolve gramas do banco de alimentos (121 itens) para bater kcal/proteína/fibra na sua dieta, com lista de compras e custo por grama de proteína.</li>
                  <li>Treino em níveis com XP, deload, "chefes" de reavaliação e diagrama animado de cada exercício.</li>
                  <li>Lembretes que só param quando você confirma (água, comida, treino, desacelerar, fechamento do dia).</li>
                  <li>Yayá: resposta grounded na base local com 84 fontes, grau de evidência e declaração de conflito de interesse de cada uma.</li>
                  <li>Auditoria: como o app decide o que entra, o que é excluído por funding setorial e os casos documentados (ISSN, Coca-Cola/GEBNOC, USANA, NutriRECS…).</li>
                  <li>Tribo: feed com nível/clã/dieta, foto de progresso opcional (nunca obrigatória).</li>
                </ul>
                {preview.micro.itens.filter((i: any) => i.status !== 'ok').length > 0 && (
                  <>
                    <div className="hr" />
                    <div className="stat-label">atenções do seu padrão alimentar</div>
                    {preview.micro.itens.filter((i: any) => i.status !== 'ok').map((i: any) => (
                      <div key={i.id} className={i.status === 'critico' ? 'badbox' : 'warnbox'} style={{ marginTop: 6 }}>
                        <b>{i.nome} {fmt.n(i.alvo)} {i.unidade}</b> · {i.suplementar || i.fonte.slice(0, 3).join(', ')}
                      </div>
                    ))}
                  </>
                )}
              </Card>
              <div className="span2 row">
                <button className="btn primary" onClick={finalizar} disabled={!completa}>Começar assim ✦</button>
                {!completa && <span className="tiny">faltam nome, nascimento, altura, peso, dieta e objetivo</span>}
                <button className="btn ghost right" onClick={() => setN(0)}>recomeçar</button>
              </div>
            </div>
          )}
        </div>
      </main>
      <div className="row" style={{ position: 'sticky', bottom: 0, padding: '10px 16px', background: 'linear-gradient(0deg, rgba(5,7,15,0.97), transparent)', justifyContent: 'space-between' }}>
        <button className="btn" onClick={() => setN((x) => Math.max(0, x - 1))} disabled={n === 0}>← voltar</button>
        <span className="tiny">{PASSOS[n]}</span>
        <button className="btn primary" onClick={() => (n === PASSOS.length - 1 ? finalizar() : setN((x) => Math.min(PASSOS.length - 1, x + 1)))}>{n === PASSOS.length - 1 ? 'fechar 🔓' : 'continuar →'}</button>
      </div>
    </div>
  );
}

const Resumo = ({ rot, valor, detalhe }: any) => (
  <div className="card" style={{ padding: 10 }}>
    <div className="stat-label">{rot}</div>
    <div className="big" style={{ fontSize: '1.15rem' }}>{valor}</div>
    <div className="tiny">{detalhe}</div>
  </div>
);
const Meta = ({ rot, v, unit, d }: any) => (
  <div>
    <div className="stat-label">{rot}</div>
    <div className="big" style={{ fontSize: '1.2rem' }}>{v} <span className="dim" style={{ fontSize: 12 }}>{unit}</span></div>
    {d && <div className="tiny" style={{ marginTop: 3 }}>{d}</div>}
  </div>
);
