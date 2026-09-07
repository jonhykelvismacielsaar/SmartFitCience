import { useMemo, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, fmt, hojeKey } from '../lib/db.ts';
import { streakDe, nivel, umRm, gorduraPct } from '../lib/calc.ts';
import { Bar, Card, Heat, Modal, Ring, Spark, Stat, Toggle, useToast } from '../components/ui.tsx';

const MORA: [string, string][] = [
  ['perfil + diários + sessões', 'localStorage <code>sf_estado_v1</code> do seu navegador'],
  ['feed, seguidores, reações', 'SQLite do servidor (<span class="mono">.data/smartfit.db</span>) quando você loga'],
  ['fotos', 'pasta <span class="mono">/media</span> do servidor; sem servidor, ficam como dataURL local'],
  ['base de evidência', 'JSON estático versionado (nada depende de rede)'],
  ['Yayá', 'BM25 rodando no seu navegador — nenhuma pergunta sai daqui'],
];

export default function Evolucao() {
  const { store, metas, addXp, irPara } = useApp();
  const e = store.estado;
  const dias = e.dias;
  const chaves = useMemo(() => Object.keys(dias).sort(), [dias]);
  const [aba, setAba] = useState<'corpo' | 'marcas' | 'labs' | 'dados'>('corpo');
  const [addExame, setAddExame] = useState(false);
  const toast = useToast();

  const pesos = chaves.map((k) => ({ dia: k, valor: dias[k].pesoKg })).filter((x) => x.valor != null);
  const cinturas: { dia: string; valor: number }[] = chaves.map((k) => ({ dia: k, valor: Number(dias[k].cintura || 0) })).filter((x) => x.valor > 0);
  const passos = chaves.map((k) => ({ dia: k, valor: dias[k].passos || 0 }));
  const prot = chaves.map((k) => ({ dia: k, valor: dias[k].prot || 0 }));
  const sono = chaves.map((k) => ({ dia: k, valor: dias[k].sonoH || 0 }));
  const agua = chaves.map((k) => ({ dia: k, valor: (dias[k].agua || 0) * 0.25 }));
  const k14 = chaves.slice(-14);
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const delta = pesos.length > 1 ? Number(pesos[pesos.length - 1].valor) - Number(pesos[0].valor) : 0;
  const xpSerie = useMemo(() => {
    const por = new Map<string, number>();
    for (const l of e.xpLog) por.set(l.dia, (por.get(l.dia) || 0) + l.valor);
    return [...por.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, valor]) => ({ dia, valor }));
  }, [e.xpLog]);
  const sel = (f: (d: any) => boolean) => chaves.filter((k) => f(dias[k] || {}));
  const streakCom = (f: (d: any) => boolean) => {
    const ks = sel(f);
    const atual = streakDe(ks.length ? ks.slice(-1) : [], new Date());
    let best = 0, cur = 0, ante = '';
    for (const k of ks) {
      const d = new Date(k); const diaAnterior = new Date(ante || k);
      const salto = ante ? Math.round((d.getTime() - diaAnterior.getTime()) / 86400000) : 1;
      cur = salto === 1 ? cur + 1 : 1; best = Math.max(best, cur); ante = k;
    }
    return { atual, recorde: Math.max(best, atual) };
  };
  const streaks = {
    forca: streakCom((d) => !!d.treino?.ok),
    agua: streakCom((d) => (d.agua || 0) >= (metas?.agua?.copos ?? 8)),
    sono: streakCom((d) => (d.sonoH || 0) >= (metas?.sono?.min || 7)),
    dieta: streakCom((d) => (d.kcal || 0) >= (metas?.kcal || 0) * 0.85),
  };
  const nvs = nivel(e.perfil.xp || 0, DB.program['níveis'] || DB.program.niveis);
  const emblemas = (DB.program.emblemas || []) as any[];
  const labs = DB.nutrientes?.exames_sugeridos || [];
  const examesLista: any[] = [...(e.exames || []), ...Object.entries((e.perfil && e.perfil.exames) || {}).map(([nome, v]: any) => ({ nome, ...(v || {}) }))];
  const feitos = new Set(examesLista.map((x: any) => String(x.nome).toLowerCase()))

  const fotos = chaves.flatMap((k) => (dias[k].fotos || []).map((f: any) => ({ k, ...f })));

  return (
    <div className="col" style={{ gap: 12 }}>
      <Card title="evolução" tone="neon" aux={`${chaves.length} dia(s) de registro · ${fmt.n(e.perfil.xp || 0)} XP · nível ${nvs.level.n}`}>
        <div className="row">
          <div className="seg">
            {(['corpo', 'marcas', 'labs', 'dados'] as const).map((x) => <button key={x} aria-pressed={aba === x} onClick={() => setAba(x)}>{{ corpo: '📈 corpo', marcas: '🔥 constância', labs: '🧪 laboratório', dados: '💾 dados' }[x]}</button>)}
          </div>
          <span className="tiny right">tudo que você vê aqui veio do seu diário — nada é estimado sem dado seu</span>
        </div>
      </Card>

      {aba === 'corpo' && (
        <div className="grid g2">
          <Card title="peso" aux={pesos.length ? `${fmt.n(pesos[0].valor, 1)} → ${fmt.n(pesos[pesos.length - 1].valor, 1)} kg` : 'sem registros'}>
            {pesos.length > 1 ? (<>
              <Spark dados={pesos.map((p) => ({ x: p.dia, y: p.valor }))} unidade=" kg" />
              <div className="row" style={{ marginTop: 6 }}>
                <Stat label="Δ total" value={`${delta > 0 ? '+' : ''}${fmt.n(delta, 1)} kg`} sub={`${fmt.n(Math.abs(delta) * 7700, 0)} kcal acumuladas (aprox.)`} />
                <Stat label="Δ por semana" value={fmt.n(delta / Math.max(1, chaves.length / 7), 2)} sub="alvo saudável: 0,3–0,8 kg (Garvey 2022)" />
              </div>
            </>) : <div className="warnbox">Pese-se em jejum, mesmo horário, 2–3×/semana. Diário de peso diário aumenta ansiedade e não melhora resultado no longo prazo (Steinberg 2013).</div>}
            <div className="hr" />
            <div className="grid g3">
              {([['cintura', 'cinturaCm'], ['quadril', 'quadrilCm'], ['pescoço', 'pescocoCm']] as [string, string][]).map(([rot, campo]) => {
                const v = (e.perfil as any)[campo];
                const rcf = e.perfil.cinturaCm && e.perfil.quadrilCm ? e.perfil.cinturaCm / e.perfil.quadrilCm : null;
                return (
                  <div key={rot}>
                    <div className="stat-label">{rot}</div>
                    <div className="mono big">{v ? fmt.n(v, 1) : '—'}</div>
                    <div className="tiny">{rot === 'cintura' && rcf ? `RCF ${fmt.n(rcf, 2)}${rcf > 0.55 ? ' · acima de 0,55' : ''}` : 'meça 1×/semana'}</div>
                  </div>
                );
              })}
            </div>
            <div className="tiny">As circunferências ficam no perfil (Ajustes) — medir 1×/semana basta; todo dia vira ruído. Cintura/altura &gt;0,55 é marcador simples de risco metabólico mesmo com IMC normal.</div>
          </Card>

          <Card title="composição estimada" aux="circunferências (US Navy): estimativa populacional, não diagnóstico">
            {(() => {
              const ult = dias[chaves[chaves.length - 1]] || ({} as any);
              const pct = gorduraPct({
                sex: e.perfil.sexo === 'f' ? 'f' : e.perfil.sexo === 'm' ? 'm' : 'other',
                altura: e.perfil.altura, peso: ult.pesoKg || e.perfil.peso,
                pescoco: ult.pescoco || e.perfil.pescoco, cintura: ult.cintura || e.perfil.cintura, quadril: ult.quadril || e.perfil.quadril,
              });
              const kg = ult.pesoKg || e.perfil.peso || 0;
              return (
                <div className="col">
                  {pct == null ? <div className="warnbox">faltam medidas: o app precisa de cintura + pescoço (e quadril, se você for mulher). Meça 1×/semana, fita flexível, mesma hora.</div> : (
                    <div className="grid g3">
                      <Stat label="% gordura" value={fmt.n(pct, 1)} sub="US Navy" />
                      <Stat label="massa gorda" value={`${fmt.n((pct / 100) * kg, 1)} kg`} />
                      <Stat label="massa magra" value={`${fmt.n((1 - pct / 100) * kg, 1)} kg`} sub="é essa que a proteína protege" />
                    </div>
                  )}
                  <div className="tiny">Margem de erro de ±3–4 pontos percentuais (Wilmore & Behnke 1969 sobre as equações de dobras). Use a <b>tendência</b> e a cintura, nunca o número do dia. Cintura &gt;94 cm (homem) / &gt;80 cm (mulher) já eleva risco cardiometabólico mesmo com IMC normal.</div>
                </div>
              );
            })()}
            <div className="hr" />
            <div className="stat-label">projeção de peso (déficit médio realizado)</div>
            {(() => {
              const defSem = ((metas?.kcal || 0) - media(chaves.map((k) => dias[k].kcal || 0))) * 7;
              const kgSem = defSem / 7700;
              return (
                <div className="col" style={{ gap: 4 }}>
                  {[2, 4, 8].map((w) => (
                    <Bar key={w} pct={Math.min(1, Math.abs(kgSem) * w / Math.max(0.5, e.perfil.metaPerderKg || 6))} label={`em ${w} semanas`} right={`${kgSem > 0 ? '-' : '+'}${fmt.n(Math.abs(kgSem * w), 1)} kg`} tone={Math.abs(kgSem) > 1.2 ? 'red' : kgSem < -0.4 ? 'blue' : ''} />
                  ))}
                  <div className="tiny">déficit médio {fmt.n(defSem / 7, 0)} kcal/dia · 500 kcal/dia ≈ 0,45 kg/sem no começo, e a curva achata (Hall 2015, modelo dinâmico) — meta de 0,3–0,8 kg/sem (Garvey 2022).</div>
                </div>
              );
            })()}
          </Card>

          <Card title="macros & aderência (14 dias)" tone="blue">
            <div className="grid g2">
              <div><div className="stat-label">proteína (g)</div><Spark dados={prot.slice(-14).map((p) => ({ x: p.dia, y: p.valor }))} meta={metas?.prot} unidade=" g" /></div>
              <div><div className="stat-label">água (L)</div><Spark dados={agua.slice(-14).map((p) => ({ x: p.dia, y: p.valor }))} meta={metas ? (metas.agua?.aBeberL ?? 2.5) : undefined} unidade=" L" /></div>
              <div><div className="stat-label">sono (h)</div><Spark dados={sono.slice(-14).map((p) => ({ x: p.dia, y: p.valor }))} meta={metas?.sono?.min || 7} unidade=" h" /></div>
              <div><div className="stat-label">XP/dia</div><Spark dados={xpSerie.slice(-14).map((p) => ({ x: p.dia, y: p.valor }))} /></div>
            </div>
            <div className="hr" />
            <div className="grid g4">
              <Stat label="dias com proteína ≥ 90%" value={`${k14.filter((k) => (dias[k].prot || 0) >= (metas?.prot || 1) * 0.9).length}/${k14.length || 0}`} />
              <Stat label="dias com treino" value={`${k14.filter((k) => dias[k].treino?.ok).length}/${k14.length || 0}`} />
              <Stat label="água no alvo" value={`${k14.filter((k) => (dias[k].agua || 0) >= (metas?.agua?.copos || 8)).length}/${k14.length || 0}`} />
              <Stat label="humor médio" value={fmt.n(media(k14.map((k) => dias[k].humor || 0)), 1)} sub="1–5" />
            </div>
          </Card>

          <Card title="passos" aux="meta por faixa etária: 6–8k/d (Paluch 2025)">
            <Spark dados={passos.map((p) => ({ x: p.dia, y: p.valor }))} meta={metas?.atividade?.passosDia || 7000} />
            <div className="grid g3" style={{ marginTop: 6 }}>
              <Stat label="média/sem" value={fmt.n(media(k14.map((k) => dias[k].passos || 0)) * 7, 0)} />
              <Stat label="dia com mais" value={fmt.n(Math.max(0, ...k14.map((k) => dias[k].passos || 0)), 0)} />
              <Stat label="vs alvo" value={fmt.n(media(k14.map((k) => dias[k].passos || 0)) / (metas?.atividade?.passosDia || 8000), 2)} sub="1,0 = no alvo" />
            </div>
            <div className="tiny">Benefício cardíaco já aparece em quem faz ≥3 sessões de 10 min/dia (Jones 2025) — caminhar em blocos conta. Sedentário: +10 min por semana na semana 1–4 (Westgate 2024).</div>
          </Card>
        </div>
      )}

      {aba === 'marcas' && (
        <div className="grid g2">
          <Card title="streaks" tone="amber">
            <div className="grid g2">
              {Object.entries(streaks).map(([k, v]: [string, any]) => <Stat key={k} label={k === 'forca' ? 'força' : k === 'agua' ? 'água' : k === 'sono' ? 'sono' : 'dieta'} value={v.atual} sub={`recorde ${v.recorde} dias`} />)}
            </div>
            <div className="hr" />
            <div className="stat-label">maratonas</div>
            {(DB.program.maratonas || []).map((m: any) => {
              const alvo = m.dias;
              const melhor = Math.max(streaks.forca.recorde, streaks.dieta.recorde, streaks.agua.recorde);
              return <Bar key={m.id} pct={melhor / alvo} label={m.nome} right={`${melhor}/${alvo} dias`} tone={melhor >= alvo ? 'neon' : 'amber'} />;
            })}
            {(DB.program.maratonas || []).length === 0 && <div className="tiny">as maratonas vêm dos seus objetivos (aba Ajustes → metas)</div>}
            <div className="hr" />
            <div className="stat-label">mapa de 13 semanas</div>
            <Heat dias={dias} chave={(d: any) => ((d.treino?.ok ? 1 : 0) + ((d.agua || 0) >= (metas?.agua?.copos || 8) ? 1 : 0) + ((d.kcal || 0) > 0 ? 1 : 0) + ((d.sonoH || 0) >= (metas?.sono?.min || 7) ? 1 : 0)) / 4} />
          </Card>

          <Card title="emblemas" aux={`${(e.badges || []).length} de ${emblemas.length}`} tone="gold">
            <div className="grid g3">
              {emblemas.map((b: any) => {
                const ok = (e.badges || []).includes(b.id);
                return (
                  <div key={b.id} className={`card ${ok ? 'gold' : ''}`} style={{ padding: 9, opacity: ok ? 1 : 0.55 }}>
                    <div className="row" style={{ justifyContent: 'flex-start', gap: 6 }}>
                      <span style={{ fontSize: '1.15rem' }}>{b.icone || '◈'}</span>
                      <b style={{ fontSize: 12.5 }}>{b.nome}</b>
                      {ok && <span className="pill ok right">✓</span>}
                    </div>
                    <div className="tiny" style={{ marginTop: 3 }}>{b.como || b.descricao}</div>
                    {!ok && b.faltam && <div className="tiny" style={{ color: 'var(--amber)' }}>faltam: {String(b.faltam).slice(0, 90)}</div>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="histórico de sessões" className="span2">
            <div className="scroll" style={{ maxHeight: 300 }}>
              <table>
                <thead><tr><th>data</th><th>programa</th><th>sessão</th><th>séries</th><th>carga total</th><th>1RM est.</th><th>foto</th><th>XP</th></tr></thead>
                <tbody>
                  {[...(e.sessoes || [])].reverse().map((s: any, i) => {
                    const primeira = (s.exercicios || [])[0]?.séries?.[0];
                    return (
                      <tr key={i}>
                        <td className="mono">{fmt.data(s.data)}</td>
                        <td className="tiny">{s.programa}</td>
                        <td className="mono">{s.sessaoId}</td>
                        <td className="mono">{(s.exercicios || []).reduce((a: number, x: any) => a + (x.séries?.length || 0), 0)}/{(s.exercicios || []).reduce((a: number, x: any) => a + (x.alvo || x.series || 0), 0)}</td>
                        <td className="mono">{fmt.n(s.cargaTotal || 0)} kg</td>
                        <td className="mono">{primeira ? fmt.n(umRm(primeira.carga, primeira.reps), 1) : '—'}</td>
                        <td>{s.foto ? <span className="pill ok">tem</span> : <span className="tiny">opcional</span>}</td>
                        <td className="mono">{fmt.n((s.exercicios || []).reduce((a: number, x: any) => a + (x.séries?.length || 0), 0) * 12)}</td>
                      </tr>
                    );
                  })}
                  {(e.sessoes || []).length === 0 && <tr><td colSpan={8} className="tiny">nenhuma sessão ainda — o Treino registra tudo que você marcar</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {aba === 'labs' && (
        <div className="grid g2">
          <Card title="painel anual sugerido" tone="blue" aux="ordem de prioridade; interpretação é do seu médico">
            <table>
              <thead><tr><th>exame</th><th>por quê / quando</th><th>status</th></tr></thead>
              <tbody>
                {(labs as any[]).map((x: any) => (
                  <tr key={typeof x === 'string' ? x : x.nome}>
                    <td><b>{typeof x === 'string' ? x : x.nome}</b></td>
                    <td className="tiny">{typeof x === 'string' ? '—' : `${x.quando || ''}${x.porque ? ' · ' + x.porque : ''}`}</td>
                    <td>{feitos.has(String(typeof x === 'string' ? x : x.nome).toLowerCase()) ? <span className="pill ok">tem valor</span> : <span className="pill warn">vazio</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm primary" onClick={() => setAddExame(true)}>registrar resultado</button>
              <button className={`btn sm ${((dias[chaves[chaves.length - 1]] || {} as any).checkins || []).includes('b12') ? '' : 'blue'}`} onClick={() => {
                store.setDia((dd) => ({ ...dd, checkins: (dd.checkins || []).includes('b12') ? dd.checkins.filter((c: string) => c !== 'b12') : [...(dd.checkins || []), 'b12'] }));
                toast(((dias[chaves[chaves.length - 1]] || {} as any).checkins || []).includes('b12') ? 'tirei o registro de hoje' : 'B12 de hoje registrada — é o único jeito de não ficar devendo neurônio');
              }}>tomei B12 hoje</button>
              <span className="tiny">guardado só no seu aparelho (nada sobe para a comunidade)</span>
            </div>
            <div className="hr" />
            <div className="stat-label">seus valores</div>
            {!examesLista.length && <div className="tiny">nenhum exame digitado — a Yayá responde menos sobre ferro/B12/tireoide por causa disso</div>}
            <div className="chips">
              {examesLista.map((x: any, i: number) => (
                <span key={i} className="pill">{x.nome} <b className="mono">{x.valor}{x.unidade ? ' ' + x.unidade : ''}</b> <span className="tiny">{x.data ? fmt.data(x.data) : ''}</span></span>
              ))}
            </div>
          </Card>
          <Card title="o que a dieta vegetariana exige de verdade" tone="amber">
            <div className="col tiny" style={{ gap: 6 }}>
              <div>• <b>B12</b>: obrigatória em dieta vegana/vegetariana restrita — cianocobalamina 250 µg/d ou 1000 µg 2×/sem (Nikly 2025). Não espere sintoma: a lesão neurológica pode ser irreversível.</div>
              <div>• <b>Ferritina</b>: alvo &gt;30 µg/L em vegetariano com fadiga; se baixa, vitamina C na mesma refeição e cozinhar em ferro aumenta a absorção do ferro não-heme (Hurrell & Egli 2010).</div>
              <div>• <b>Vitamina D</b>, <b>cálcio</b> e <b>iodo</b>: o padrão sem laticínios e sem peixe costuma ficar abaixo do alvo; sal iodado e suplemento resolvem (Dinu 2018; NIH ODS).</div>
              <div>• <b>Creatina</b>: vegetarianos têm estoque menor e respondem melhor à suplementação, inclusive em cognição (Avgerinos 2018; Forbes 2022).</div>
              <div>• <b>ômega-3</b>: sem peixe, use ALA (linhaça/chia/noz) e considere 250 mg/d EPA+DHA de origem microbiana.</div>
              <div>• Se você tem doença renal, pressão alta ou usa anticoagulante, o painel muda — mande a lista para seu médico antes de aplicar qualquer coisa daqui.</div>
            </div>
          </Card>
        </div>
      )}

      {aba === 'dados' && (
        <div className="grid g2">
          <Card title="seus dados" aux="exportar/importar apagar">
            <div className="col">
              <div className="grid g4">
                <Stat label="dias" value={chaves.length} />
                <Stat label="sessões" value={(e.sessoes || []).length} />
                <Stat label="posts" value={(e.posts || []).length} />
                <Stat label="XP log" value={e.xpLog.length} />
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => { const b = new Blob([JSON.stringify({ versao: 1, ...e }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `smartfit-${hojeKey()}.json`; a.click(); toast('backup baixado'); }}>exportar JSON</button>
                <label className="btn sm ghost">importar<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(ev) => {
                  const f = ev.target.files?.[0]; if (!f) return; const rd = new FileReader();
                  rd.onload = () => { try { const j = JSON.parse(String(rd.result)); store.mutar(() => j); toast('estado restaurado do backup'); } catch { toast('arquivo inválido', 'bad'); } };
                  rd.readAsText(f);
                }} /></label>
                <button className="btn sm warn" onClick={() => { if (confirm('apagar TODO o diário e manter só o perfil?')) { store.mutar((x) => ({ ...x, dias: {}, sessoes: [], posts: [], xpLog: [], badges: [], flags: [], exames: [] })); toast('diário zerado — o perfil ficou'); } }}>zerar diário</button>
                <button className="btn sm warn" onClick={() => { if (confirm('apagar TUDO e refazer o onboarding?')) { localStorage.clear(); location.reload(); } }}>apagar tudo</button>
              </div>
              <div className="hr" />
              <div className="stat-label">onde mora cada coisa</div>
              <table>
                <tbody>
                  {MORA.map(([a, b]) => <tr key={a}><td>{a}</td><td className="tiny" dangerouslySetInnerHTML={{ __html: b }} /></tr>)}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="fotos de progresso" aux="opcional, sempre">
            <div className="col">
              {fotos.length === 0 && <div className="warnbox">nenhuma foto guardada. Registro de progresso é <b>opcional</b>: serve para você comparar postura/volume, não para ninguém te avaliar.</div>}
              <div className="grid g3">
                {fotos.map((f, i) => <div key={i} className="card" style={{ padding: 6 }}><img src={f.url || f.src} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 140, objectFit: 'cover' }} /><div className="tiny">{fmt.data(f.k)} · {f.tipo || 'progresso'}{f.notas ? ' · ' + f.notas : ''}</div></div>)}
              </div>
              <Toggle checked={!!e.perfil.comunidade?.autoPost} onChange={(v) => store.mutar((x) => ({ ...x, perfil: { ...x.perfil, comunidade: { ...(x.perfil.comunidade || {}), autoPost: v } } }))}>criar post automático quando eu subir nível</Toggle>
              <div className="tiny">se ligado, o app publica apenas: programa, nível, XP e emblemas. Nunca foto, peso ou exame.</div>
            </div>
          </Card>
        </div>
      )}

      <Modal open={addExame} onClose={() => setAddExame(false)} title="registrar exame">
        <ExameForm onDone={(x: any) => { store.mutar((y) => ({ ...y, exames: [...(y.exames || []), x] })); setAddExame(false); addXp('registro_exame', 15, {}); toast('exame registrado — a Yayá passa a considerá-lo'); }} nomes={(labs as any[]).map((x: any) => (typeof x === 'string' ? x : x.nome))} />
      </Modal>
    </div>
  );
}

function ExameForm({ onDone, nomes }: any) {
  const [nome, setNome] = useState(nomes[0] || 'Ferritina');
  const [valor, setValor] = useState('');
  const [un, setUn] = useState('');
  return (
    <div className="col">
      <label className="f">exame</label>
      <input list="labs" value={nome} onChange={(e) => setNome(e.target.value)} />
      <datalist id="labs">{nomes.map((n: string) => <option key={n} value={n} />)}</datalist>
      <div className="grid g2">
        <div><label className="f">valor</label><input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: 24" /></div>
        <div><label className="f">unidade</label><input value={un} onChange={(e) => setUn(e.target.value)} placeholder="µg/L" /></div>
      </div>
      <button className="btn primary" onClick={() => valor && onDone({ nome, valor: Number(valor) || valor, unidade: un, data: hojeKey() })}>salvar</button>
    </div>
  );
}
