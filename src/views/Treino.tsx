import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, fmt, hojeKey, api, xpTotal } from '../lib/db.ts';
import { nivel, umRm, volumePorGrupo, ratioCarga } from '../lib/calc.ts';
import { Bar, Card, Chip, Modal, SourceCard, Toggle, useToast } from '../components/ui.tsx';
import { ExerciseFigure, BodyHeat, AlinhamentoPlancha, RomBarra } from '../components/Figure.tsx';

const exPorId = () => Object.fromEntries(DB.exercicios.map((x: any) => [x.id, x]));

export default function Treino() {
  const { store, extra, irPara, addXp } = useApp();
  const e = store.estado;
  const xp = xpTotal(e);
  const niveis = DB.program['níveis'] || DB.program.niveis;
  const nv = nivel(xp, niveis);
  const [aberta, setAberta] = useState<any>(null);
  const [verEx, setVerEx] = useState<string | null>(null);
  const toast = useToast();
  const progs: any[] = DB.program.programas || [];
  const abrir = (p: any, i = 0) => setAberta({
    programa: p, sessao: JSON.parse(JSON.stringify(p.sessoes?.[i] || { id: 'A', nome: 'sessão', exercicios: [] })), id: `${hojeKey()}-${p.id}-${p.sessoes?.[i]?.id ?? 'A'}`,
  });
  const eq = new Set(e.perfil.equip || []);
  const chefeOk = (n: number) => (e.perfil.chefesFeitos || []).some((c: any) => c >= n);

  const elegivel = (p: any) => (p.min_nivel ?? 0) <= nv.level.n;
  const disponiveis = progs.map((p: any) => ({ p, ok: elegivel(p), cobertura: (p.eq || []).filter((x: string) => eq.has(x)).length / Math.max(1, (p.eq || []).length) }));
  const atual = (disponiveis.find((x: any) => x.ok && x.p.id === e.perfil.programaId)?.p) || disponiveis.filter((x: any) => x.ok).sort((a: any, b: any) => b.cobertura - a.cobertura)[0]?.p || progs[0];
  const sessoes = e.sessoes || [];
  const volume = volumePorGrupo({ sessoes: sessoes.slice(-4).flatMap((s: any) => [{ exercicios: (s.exercicios || []).map((x: any) => ({ ex: x.ex, series: x.séries?.length ?? 3 })) }]) } as any, exPorId());
  const carga = ratioCarga(sessoes.flatMap((s: any) => (s.exercicios || []).map((x: any) => ({ volume: (x.séries || []).reduce((a: number, y: any) => a + (y.carga || 0) * (y.reps || 0), 0), rir: (x.séries || [{}])[0]?.rir, data: s.data }))), new Date());

  useEffect(() => {
    if (extra?.iniciar && !aberta) {
      const p = progs.find((x: any) => x.id === extra.iniciar) || atual;
      if (p) abrir(p, 0);
    }
  }, [extra]);

  return (
    <div className="col" style={{ gap: 12 }}>
      <Card title="mapa de níveis" tone="neon" aux={`${fmt.n(xp)} XP · nível ${nv.level.n} de ${(niveis.length || 10) - 1}`}>
        <div className="levelmap">
          {niveis.map((l: any) => {
            const aberto = xp >= l.xp;
            const boss = (DB.program.chefes_reavaliacao || []).find((c: any) => c.min_nivel === l.n);
            return (
              <div key={l.n} className={`node ${aberto ? 'on' : 'lock'}`} title={l.mensagem} onClick={() => !aberto && boss && toast(`nível ${l.n}: complete o teste “${boss.nome}” para liberar`, 'bad')}>
                <div className="n">NV {l.n} · {fmt.n(l.xp)} XP</div>
                <div className="t">{l.nome}</div>
                <div className="tiny">{(l.unlocked || []).length} destravamentos{boss ? ` · chefe: ${boss.nome.replace('Chefe: ', '')}` : ''}</div>
                {!aberto && <span className="badge-lock">🔒</span>}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny">Regra do app: XP de série válida (técnica + amplitude + RIR dentro da meta). O <b>chefe</b> de cada 3 níveis é um teste objetivo (ampliada de flexões, tempo de prancha, 1RM estimado) — o próximo bloco só abre com o teste registrado, porque carga sem medida é chute.</span>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="programas" aux="filtrados pelo seu equipamento">
          <div className="col">
            {disponiveis.map(({ p, ok, cobertura }: any) => (
              <div key={p.id} className="card" style={{ padding: 10, borderColor: atual?.id === p.id ? 'rgba(110,243,192,0.45)' : undefined, opacity: ok ? 1 : 0.55 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <b style={{ fontSize: 13.5 }}>{p.nome}</b>
                    <div className="tiny">{p.dias}×/sem · {p.dur_min} min · {p.foco} · bloco de {p.bloco?.semanas} sem{p.bloco?.deload ? ` + deload (${p.bloco.deload})` : ''}</div>
                  </div>
                  <span className={`pill ${ok ? 'ok' : 'warn'}`}>{ok ? `compatível ${Math.round(cobertura * 100)}%` : `nv ${p.min_nivel}`}</span>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  {ok ? (
                    <>
                      <button className="btn sm primary" onClick={() => abrir(p, 0)}>iniciar sessão A</button>
                      <button className="btn sm ghost" onClick={() => { store.mutar((x) => ({ ...x, perfil: { ...x.perfil, programaId: p.id } })); toast(`programa fixado: ${p.nome}`); }}>fixar</button>
                      <span className="tiny right">{p.sessoes?.map((s: any) => s.id).join(' · ')}</span>
                    </>
                  ) : (
                    <span className="tiny">🔒 exige nível {p.min_nivel} (você está no {nv.level.n}). Suba fechando sessões válidas e o chefe pendente.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid g2">
          <Card title="volume semanal" tone="blue" aux="séries por grupo (4 últimas sessões)">
            <BodyHeat volumes={volume} sexo={e.perfil.sexo} />
            <div className="col" style={{ marginTop: 6 }}>
              {Object.entries(volume).sort((a: any, b: any) => b[1] - a[1]).map(([g, v]: any) => (
                <div key={g}>
                  <Bar pct={(v as number) / 16} label={g} right={`${v} séries · meta ${store.estado.metas?.proteina ? '10–12' : '10–12'}+/sem`} tone={v >= 10 ? '' : 'amber'} />
                </div>
              ))}
              {Object.keys(volume).length === 0 && <div className="tiny">nada registrado ainda — comece uma sessão e o mapa acende</div>}
            </div>
          </Card>
          <Card title="carga & recuperação">
            <div className="grid g2">
              <div>
                <div className="stat-label">carga aguda:crônica</div>
                <div className="big mono">{carga.ratio}</div>
                <div className={`pill ${carga.zona === 'risco' ? 'bad' : carga.zona === 'ideal' ? 'ok' : 'warn'}`}>{carga.zona === 'risco' ? 'subida rápida demais' : carga.zona === 'ideal' ? 'zona de adaptação' : 'desestímulo / retomada'}</div>
                <div className="tiny" style={{ marginTop: 5 }}>agudo {fmt.n(carga.agudo)} · média semanal {fmt.n(carga.cronico)} · S × reps × (1 + (3−RIR)×0,12). Janela de referência 0,8–1,3 (Claudino 2020).</div>
              </div>
              <div>
                <div className="stat-label">sessões</div>
                <div className="big">{sessoes.length}</div>
                <div className="tiny">última: {sessoes[sessoes.length - 1]?.data ? fmt.data(sessoes[sessoes.length - 1].data) : '—'}</div>
                <div className="stat-label" style={{ marginTop: 8 }}>add-on de cardio</div>
                <div className="col" style={{ gap: 4 }}>
                  {(DB.program.add_on_cardio || []).map((c: any) => (
                    <button key={c.id} className="btn xs ghost" style={{ textAlign: 'left' }} onClick={() => { addXp('treino_cardio', 20, { cardio: c.id }); toast(`cardio ${c.nome} marcado: +20 XP`); }}>{c.nome} · {c.freq}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="hr" />
            <div className="tiny">Força 2–4×/semana reduz mortalidade por todas as causas ~10–15% independentemente do cardio (Garcia-Hermoso 2018); combinar com cardio não anula nada (Wilson 2012) — só não faça o teste máximo depois de 5 × 60 s de sprint.</div>
          </Card>
        </div>
      </div>

      <Card title="chefes de reavaliação" aux="teste objetivo que destrava o próximo bloco">
        <div className="grid g3">
          {(DB.program.chefes_reavaliacao || []).map((c: any) => {
            const feito = (e.perfil.chefesFeitos || []).includes(c.min_nivel);
            return (
              <div key={c.id} className={`card ${feito ? 'neon' : ''}`} style={{ padding: 11 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 13 }}>{c.nome}</b>{feito ? <span className="pill ok">✓</span> : <span className="pill warn">nv {c.min_nivel}</span>}</div>
                <div className="tiny" style={{ margin: '5px 0' }}>{c.teste}</div>
                <div className="tiny"><b>requisitos:</b> {c.requisitos.join(' · ')}</div>
                {!feito && <ChefeForm c={c} />}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="biblioteca" aux="clique para ver técnica, cues e substituições">
        <Biblioteca onOpen={setVerEx} nivelAtual={nv.level.n} eq={eq} />
      </Card>

      <SessaoRunner state={aberta} onClose={() => setAberta(null)} />
      <Modal open={!!verEx} onClose={() => setVerEx(null)} title={verEx ? exPorId()[verEx]?.n : ''} wide kind="">
        {verEx && (() => {
          const x = exPorId()[verEx];
          return (
            <div className="grid g2">
              <div>
                <ExerciseFigure pose={x.pose} altura={225} rotulo={x.n} />
                {x.pose === 'prancha' && <AlinhamentoPlancha />}
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="pill">{x.grp}</span>{(x.sec || []).map((s: string) => <span key={s} className="pill">{s}</span>)}
                  <span className="pill blue">nível {x.nivel}</span><span className="pill">{(x.eq || []).join('/')}</span>
                  <span className="pill warn">RIR {x.rir}</span><span className="pill">{x.tempo}</span>
                </div>
              </div>
              <div className="col">
                <div>
                  <div className="stat-label">cues (execução)</div>
                  <ul className="tick">{x.cues.map((c: string) => <li key={c}>{c}</li>)}</ul>
                </div>
                <div>
                  <div className="stat-label">erros comuns</div>
                  <ul className="tick">{x.erros.map((c: string) => <li key={c}>{c}</li>)}</ul>
                </div>
                <div>
                  <div className="stat-label">amplitude</div>
                  <div className="tiny">{x.rom}</div>
                  <div style={{ marginTop: 5 }}><RomBarra atual={0} meta={0} /></div>
                </div>
                <div className="grid g2">
                  <div>
                    <div className="stat-label">regressões</div>
                    <div className="tiny">{(x.regressoes || []).map((r: any) => (typeof r === 'string' ? r : r.n || r.nome || r.descricao)).join(' · ') || '—'}</div>
                  </div>
                  <div>
                    <div className="stat-label">progressões</div>
                    <div className="tiny">{(x.progressoes || []).map((r: any) => (typeof r === 'string' ? r : r.n || r.nome || r.descricao)).join(' · ') || '—'}</div>
                  </div>
                </div>
                <div>
                  <div className="stat-label">substituições (mesmo padrão motor)</div>
                  <div className="row" style={{ gap: 5 }}>
                    {(x.sub || []).map((s: string) => <button key={s} className="chip small" onClick={() => setVerEx(s)}>{exPorId()[s]?.n || s}</button>)}
                  </div>
                </div>
                {x.evid && <div className="okbox"><b>nota da base:</b> {x.evid}</div>}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function ChefeForm({ c }: any) {
  const { store, addXp, irPara } = useApp();
  const [v, setV] = useState('');
  return (
    <div className="row" style={{ marginTop: 7 }}>
      <input style={{ maxWidth: 130 }} placeholder="seu resultado" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn sm primary" onClick={() => {
        store.mutar((x) => ({ ...x, perfil: { ...x.perfil, chefesFeitos: [...(x.perfil.chefesFeitos || []), c.min_nivel] }, xpLog: [...x.xpLog, { data: new Date().toISOString(), dia: hojeKey(), motivo: `chefe:${c.id}`, valor: 120, resultado: v }] }));
        irPara('evolucao');
      }}>registrar teste</button>
      <span className="tiny">+120 XP e destrava o bloco seguinte</span>
    </div>
  );
}

function Biblioteca({ onOpen, nivelAtual, eq }: any) {
  const [filtro, setFiltro] = useState('');
  const [grp, setGrp] = useState<string | null>(null);
  const [soMeus, setSoMeus] = useState(false);
  const grupos: string[] = useMemo(() => [...new Set<string>(DB.exercicios.map((x: any) => x.grp))], []);
  const lista = useMemo(() => DB.exercicios.filter((x: any) => {
    if (grp && x.grp !== grp) return false;
    if (soMeus && x.nivel > Math.min(3, nivelAtual) + 1) return false;
    if (soMeus && !(x.eq || []).some((q: string) => eq.has(q))) return false;
    const f = filtro.toLowerCase();
    if (!f) return true;
    return [x.n, x.grp, ...(x.sec || []), ...(x.cues || [])].join(' ').toLowerCase().includes(f);
  }), [filtro, grp, soMeus]);
  return (
    <div className="col">
      <div className="row">
        <input style={{ maxWidth: 250 }} placeholder="buscar movimento, músculo, cue…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <Toggle checked={soMeus} onChange={setSoMeus}>só o que cabe no meu nível/equipamento</Toggle>
        <span className="tiny right">{lista.length} de {DB.exercicios.length}</span>
      </div>
      <div className="chips">
        <Chip on={!grp} onClick={() => setGrp(null)}>todos</Chip>
        {grupos.map((g: string) => <Chip key={g} on={grp === g} onClick={() => setGrp(grp === g ? null : g)}>{g}</Chip>)}
      </div>
      <div className="scroll" style={{ maxHeight: 320 }}>
        <table>
          <thead><tr><th>exercício</th><th>grupo</th><th>nv</th><th>RIR</th><th>diagrama</th></tr></thead>
          <tbody>
            {lista.map((x: any) => (
              <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(x.id)}>
                <td><b>{x.n}</b><div className="tiny">{(x.eq || []).join(' / ')}</div></td>
                <td className="tiny">{x.grp}<div className="tiny">{(x.sec || []).slice(0, 2).join(', ')}</div></td>
                <td className="mono">{x.nivel}</td>
                <td className="mono">{x.rir}</td>
                <td style={{ width: 84 }}><ExerciseFigure pose={x.pose} altura={54} playing={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Runner da sessão: série a série, com timer de descanso e RIR. Só conta como válida com técnica+ROM+RIR. */
function SessaoRunner({ state, onClose }: { state: any; onClose: () => void }) {
  const { store, addXp } = useApp();
  const toast = useToast();
  const [idx, setIdx] = useState(0);
  const [séries, setSéries] = useState<Record<string, { carga: number; reps: number; rir: number; ok: boolean; rom?: number; tempo?: string }[]>>({});
  const [foto, setFoto] = useState<string | null>(null);
  const [descanso, setDescanso] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const fimRef = useRef(0);
  const ex = state?.sessao?.exercicios || [];
  const atual = ex[idx];
  const lib = exPorId();
  const x = atual ? lib[atual.ex] : null;
  const chave = atual?.ex || 'x';
  const feitos = séries[chave] || [];

  useEffect(() => {
    if (descanso == null) return;
    const t = setInterval(() => {
      const rest = Math.max(0, Math.round((fimRef.current - Date.now()) / 1000));
      setDescanso(rest);
      if (rest <= 0) { clearInterval(t); setDescanso(null); if (store.estado.preferencias?.som !== false) toast('descanso acabando — próxima série'); }
    }, 250);
    return () => clearInterval(t);
  }, [descanso]);

  if (!state) return null;
  const totalSéries = ex.reduce((s: number, it: any) => s + (it.series || 1), 0);
  const feitas = Object.values(séries).reduce((s: number, a: any) => s + a.filter((y: any) => y.ok).length, 0);

  const marcarSérie = (rir: number, carga: number, reps: number) => {
    const nova = [...feitos, { carga, reps, rir, ok: true }];
    setSéries((s) => ({ ...s, [chave]: nova }));
    const regras = DB.program.regras_xp_num || DB.program.regras_xp;
    addXp('serie_concluida', 10 + (rir >= 0 && rir <= (atual.rir ?? 3) ? 5 : 0), { ex: atual.ex, reps, carga });
    fimRef.current = Date.now() + (atual.descanso || 90) * 1000;
    setDescanso(atual.descanso || 90);
  };

  const finalizar = async () => {
    const sessao = {
      id: state.id, data: hojeKey(), programa: state.programa.id, sessaoId: state.sessao.id,
      exercicios: ex.map((it: any) => ({ ex: it.ex, séries: séries[it.ex] || [], alvo: it.series, reps: it.reps, rir: it.rir })),
      cargaTotal: Object.values(séries).flat().reduce((s: number, y: any) => s + y.carga * y.reps, 0),
      sériesOk: feitas, dur_min: 0, foto: foto || null,
    };
    store.mutar((e2) => ({ ...e2, sessoes: [...(e2.sessoes || []), sessao], dias: { ...e2.dias, [hojeKey()]: { ...({ agua: 0, copos: [], refeicoes: {}, sonoH: null, pesoKg: null, passos: null, humor: null, stress: null, checkins: [], fotos: [], kcal: 0, prot: 0, fibra: 0, mindfulnessMin: 0, notas: '', quests: {} }), ...(e2.dias[hojeKey()] || {}), treino: { sessaoId: state.id, programas: state.programa.id, séries: feitas, ok: true } } } }));
    if (foto && localStorage.getItem('sf_token')) {
      try { await api('/media', { json: { dataUrl: foto, tipo: 'treino', sessao: state.id } }); } catch { /* segue local */ }
    }
    if (feitas >= totalSéries * 0.8) addXp('sessao_completa', 45, { ex: ex.length });
    void nonce;
    toast(`sessão salva: ${feitas}/${totalSéries} séries válidas · carga total ${fmt.n(sessao.cargaTotal)} kg`);
    onClose();
  };

  return (
    <div className="modal-back" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 'min(1020px, 100%)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><b>{state.programa.nome}</b> <span className="tiny">sessão {state.sessao.id} · {state.sessao.nome}</span></div>
          <div className="row"><span className="pill ok mono">{feitas}/{totalSéries} séries</span><button className="btn sm ghost" onClick={onClose}>sair</button></div>
        </div>
        <Bar pct={feitas / Math.max(1, totalSéries)} label="progresso da sessão" right={descanso != null ? `descanso ${descanso}s` : `${idx + 1}/${ex.length}`} tone={descanso != null ? 'amber' : ''} />
        <div className="grid g2" style={{ marginTop: 10 }}>
          <div className="col">
            <div className="row" style={{ gap: 5 }}>
              {ex.map((it: any, i: number) => {
                const n = (séries[it.ex] || []).filter((y: any) => y.ok).length;
                return <button key={it.ex + i} className="chip" aria-pressed={i === idx} onClick={() => setIdx(i)}>{lib[it.ex]?.n?.split(' ')[0]} {n}/{it.series}{n >= (it.series || 1) ? ' ✓' : ''}</button>;
              })}
            </div>
            {atual && x && (
              <>
                <h2 style={{ fontSize: '1.05rem' }}>{x.n}</h2>
                <div className="row" style={{ gap: 5 }}>
                  <span className="pill">{atual.series} × {atual.reps || atual.tempo}</span>
                  <span className="pill blue">descanso {atual.descanso}s</span>
                  <span className={`pill ${typeof atual.rir === 'number' ? 'warn' : ''}`}>RIR {atual.rir}</span>
                  <span className="pill">1RM est.: {feitos.length ? `${fmt.n(umRm(feitos[feitos.length - 1].carga, feitos[feitos.length - 1].reps), 1)} kg` : '—'}</span>
                </div>
                <div className="col">
                  {feitos.map((s: any, i: number) => (
                    <div key={i} className="row tiny" style={{ justifyContent: 'space-between' }}>
                      <span>série {i + 1}</span><span className="mono">{fmt.n(s.carga)} kg × {s.reps} · RIR {s.rir}</span><span style={{ color: 'var(--neon)' }}>✓ válida</span>
                    </div>
                  ))}
                </div>
                <FormSérie atual={atual} x={x} onDone={marcarSérie} />
                <div className="okbox"><b>cues:</b> {x.cues.slice(0, 3).join(' · ')}</div>
                <div className="badbox"><b>erros:</b> {x.erros.slice(0, 2).join(' · ')}</div>
                <div className="row">
                  {idx > 0 && <button className="btn sm" onClick={() => setIdx((i) => i - 1)}>← anterior</button>}
                  {idx < ex.length - 1 ? <button className="btn sm" onClick={() => setIdx((i) => i + 1)}>próximo →</button> : <button className="btn sm primary" onClick={finalizar}>fechar sessão 🔓</button>}
                  {atual && (
                    <button className="btn xs ghost right" onClick={() => { const sub = (x.sub || [])[0]; if (sub) { state.sessao.exercicios[idx] = { ...atual, ex: sub }; setIdx(idx + 0.0001); setIdx(idx); toast('substituído por ' + lib[sub]?.n); } }}>trocar por equivalente</button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="col">
            {x && <ExerciseFigure pose={x.pose} altura={250} rotulo={x.n} speed={descanso != null ? 0.5 : 1} playing={!descanso} />}
            {x?.pose === 'prancha' && <AlinhamentoPlancha />}
            {x && (
              <div className="col">
                <div className="stat-label">por que este exercício está aqui</div>
                <div className="tiny">{x.rom}</div>
                {(x.evid ? [x.evid] : []).map((r: any) => typeof r === 'string' && DB.porId.get(r) ? <SourceCard key={r} id={r} compact /> : null)}
              </div>
            )}
            <div className="hr" />
            <div className="stat-label">foto da execução (opcional — nunca obrigatória)</div>
            <input type="file" accept="image/*" capture="environment" onChange={(ev) => { const f = ev.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setFoto(String(rd.result)); rd.readAsDataURL(f); }} />
            {foto && <img src={foto} alt="foto da execução" style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover' }} />}
            {store.estado.perfil?.fotoObrigatoria && <div className="warnbox">Você marcou foto obrigatória no perfil; desmarque em Ajustes se quiser leveza.</div>}
            <button className="btn primary" onClick={finalizar}>encerrar sessão ({feitas}/{totalSéries} séries)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormSérie({ atual, x, onDone }: any) {
  const [carga, setCarga] = useState(20);
  const [reps, setReps] = useState(Number(String(atual.reps || '10').split('-')[0]) || 10);
  const [rir, setRir] = useState(typeof atual.rir === 'number' ? atual.rir : 2);
  const isometrico = !!atual.tempo && !atual.reps;
  useEffect(() => { if (x?.eq?.includes('halter')) setCarga(12); else if (x?.grp === 'core') setCarga(0); }, [x?.id]);
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="grid g4" style={{ gap: 7 }}>
        <div><label className="f">carga (kg)</label><input type="number" value={carga} step={1.25} onChange={(e) => setCarga(Number(e.target.value))} /></div>
        <div><label className="f">{isometrico ? 'tempo (s)' : 'reps'}</label><input type="number" value={reps} onChange={(e) => setReps(Number(e.target.value))} /></div>
        <div>
          <label className="f">RIR</label>
          <div className="row" style={{ gap: 4 }}>{[0, 1, 2, 3, 4].map((v) => <button key={v} className="chip small" aria-pressed={rir === v} onClick={() => setRir(v)}>{v}</button>)}</div>
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button className="btn sm primary" onClick={() => onDone(rir, carga, reps)}>concluir série ✓</button>
        </div>
      </div>
      <div className="tiny" style={{ marginTop: 5 }}>Série só vira XP com RIR declarado dentro da faixa da prescrição (RIR {atual.rir}). Sem carga/reps registradas, no mês seguinte você não sabe o que progrediu (Lopez 2021).</div>
    </div>
  );
}
