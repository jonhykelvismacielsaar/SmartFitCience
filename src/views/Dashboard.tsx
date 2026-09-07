import { useMemo, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, fmt, hojeKey, usoDe, xpTotal, streakDe } from '../lib/db.ts';
import { nivel, multStreak, ratioCarga, volumePorGrupo } from '../lib/calc.ts';
import { Bar, Card, Chip, Heat, Ring, SourceCard, Stat, useAgora, useToast } from '../components/ui.tsx';
import { ExerciseFigure } from '../components/Figure.tsx';

const saudacao = (min: number) => (min < 300 ? 'madrugada' : min < 720 ? 'bom dia' : min < 1080 ? 'boa tarde' : 'boa noite');

export default function Dashboard() {
  const { store, metas, irPara, addXp } = useApp();
  const e = store.estado;
  const k = hojeKey();
  const dia = e.dias[k] || ({} as any);
  const uso = usoDe(e);
  const agora = useAgora(30000);
  const min = agora.getHours() * 60 + agora.getMinutes();
  const xp = xpTotal(e);
  const niveis = DB.program['níveis'] || DB.program.niveis;
  const nv = nivel(xp, niveis);
  const streak = streakDe(e);
  const prog = programaAtual(e, metas);
  const proxima = (metas?.agenda?.alerts || []).filter((a: any) => a.hora >= min)[0];
  const refeicaoAtual = useMemo(() => {
    const r = metas?.agenda?.refeições || [];
    let atual = null;
    for (const x of r) if (x.hora <= min) atual = x;
    return atual;
  }, [metas, min]);
  const gaps = useMemo(() => {
    if (!metas) return [];
    const itens = metas.micro.itens.filter((i: any) => i.status !== 'ok');
    return itens.map((i: any) => ({ ...i, atual: i.id === 'fibra' ? Math.round(dia.fibra || 0) : i.id === 'calcio' ? Math.round((dia as any).calcio || 0) : null }));
  }, [metas, dia.fibra]);
  const sessoes = e.sessoes || [];
  const carga = ratioCarga(sessoes.flatMap((s: any) => (s.séries || []).map((x: any) => ({ volume: (s.cargaTotal || 40) * x.series, rir: x.rir, data: s.data }))), agora);
  const volume = volumePorGrupo({ sessoes: sessoes.slice(-3).flatMap((s: any) => s.bloco?.sessoes || []) } as any, Object.fromEntries(DB.exercicios.map((x: any) => [x.id, { grp: x.grp }])));

  return (
    <div className="grid g2">
      <Card title={`Bom ${saudacao(min)}, ${e.perfil.nome.split(' ')[0]}`} tone="neon" aux={refeicaoAtual ? `próxima janela: ${refeicaoAtual.nome}` : undefined}>
        <div className="rings">
          <Ring pct={uso.kcalPct} label="energia" value={<span>{fmt.n(dia.kcal)}<span className="dim" style={{ fontSize: 10 }}>/{metas!.kcal}</span></span>} color="var(--amber)" />
          <Ring pct={uso.protPct} label="proteína" value={<span>{fmt.n(dia.prot)}<span className="dim" style={{ fontSize: 10 }}>/{metas!.prot}</span></span>} />
          <Ring pct={uso.aguaPct} label="água" value={<span>{dia.agua || 0}<span className="dim" style={{ fontSize: 10 }}>/{metas!.agua.copos}</span></span>} color="var(--blue)" />
          <Ring pct={Math.min(1, (dia.fibra || 0) / metas!.fibra)} label="fibra" value={<span>{fmt.n(dia.fibra || 0)}<span className="dim" style={{ fontSize: 10 }}>g</span></span>} color="var(--pink)" />
          <Ring pct={Math.min(1, (dia.passos || 0) / metas!.treino.passos)} label="passos" value={<span className="mono" style={{ fontSize: 12 }}>{fmt.n(dia.passos || 0)}</span>} color="var(--violet)" />
          <Ring pct={Math.min(1, (dia.sonoH || 0) / 8)} label="sono" value={<span>{dia.sonoH ? fmt.n(dia.sonoH, 1) : '—'}</span>} color="var(--neon)" />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm primary" onClick={() => { store.setDia((d) => ({ ...d, agua: d.agua + 1, copos: [...(d.copos || []), new Date().toISOString()] })); addXp('agua_copo', xpRegraLocal('agua_copo'), {}); }}>+1 copo (250 mL)</button>
          <button className="btn sm" onClick={() => irPara('nutricao')}>registrar refeição</button>
          <button className="btn sm" onClick={() => irPara('treino', { iniciar: prog?.id })}>{dia.treino ? 'ver sessão' : 'treinar agora'}</button>
          <button className="btn sm ghost" onClick={() => irPara('yaya')}>perguntar à Yayá</button>
        </div>
        {gaps.length > 0 && (
          <>
            <div className="hr" />
            <div className="row" style={{ gap: 5 }}>
              <span className="stat-label">no radar do seu padrão</span>
              {gaps.slice(0, 6).map((g: any) => <span key={g.id} className={`pill ${g.status === 'critico' ? 'bad' : 'warn'}`} title={g.suplementar || g.fonte.join(' · ')}>{g.nome} {fmt.n(g.alvo)}{g.unidade}</span>)}
            </div>
          </>
        )}
      </Card>

      <Card title="níveis & XP" aux={`falta ${fmt.n(nv.xpFaltando)} XP`}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="stat-label">nível {nv.level.n}</div>
            <div className="big">{nv.level.nome}</div>
            <div className="tiny">{nv.level.mensagem}</div>
          </div>
          <div className="right" style={{ textAlign: 'right' }}>
            <div className="stat-label">XP total</div>
            <div className="big mono">{fmt.n(xp)}</div>
            <div className="tiny">🔥 streak {streak} d · mult ×{multStreak(streak)}</div>
          </div>
        </div>
        <Bar pct={nv.prog} label={`progresso para ${nv.next ? `nível ${nv.next.n} · ${nv.next.nome}` : 'nível máximo'}`} right={`${fmt.n(xp)} / ${fmt.n(nv.next?.xp ?? xp)}`} />
        <div className="levelmap" style={{ marginTop: 10 }}>
          {niveis.map((l: any) => {
            const aberto = xp >= l.xp;
            return (
              <div key={l.n} className={`node ${aberto ? 'on' : 'lock'}`} title={l.mensagem}>
                <div className="n">NV {l.n} · {fmt.n(l.xp)} XP</div>
                <div className="t">{l.nome}</div>
                <div className="tiny">{(l.unlocked || []).length} destravamentos</div>
                {!aberto && <span className="badge-lock" title="conclua o anterior">🔒</span>}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm ghost" onClick={() => irPara('treino')}>mapa de progressão →</button>
          <span className="tiny right">XP de série vem de série válida (técnica + amplitude + RIR), não de "suor" (Howe 2022: gamificação funciona quando dá feedback de competência, não só distintivo).</span>
        </div>
      </Card>

      {prog && (
        <Card title="hoje no treino" tone="blue" aux={`${prog.dias} dias · ${prog.dur_min} min`}>
          <div className="grid g2">
            <div>
              <b style={{ fontSize: 13 }}>{sessaoDoDia(prog, e)?.nome || prog.nome}</b>
              <div className="tiny">{(sessaoDoDia(prog, e)?.exercicios || []).length} exercícios · {sessaoDoDia(prog, e)?.exercicios?.map((x: any) => x.series).reduce((a: number, b: number) => a + b, 0)} séries</div>
              <div className="col" style={{ marginTop: 8 }}>
                {(sessaoDoDia(prog, e)?.exercicios || []).slice(0, 5).map((it: any) => {
                  const ex = DB.exercicios.find((x: any) => x.id === it.ex);
                  return (
                    <div key={it.ex} className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{ex?.n || it.ex}</span>
                      <span className="tiny mono">{it.series}× {it.reps || it.tempo} · RIR {it.rir}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <ExerciseFigure pose={DB.exercicios.find((x: any) => x.id === sessaoDoDia(prog, e)?.exercicios?.[0]?.ex)?.pose} altura={150} rotulo={prog.nome} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm primary" onClick={() => irPara('treino', { iniciar: prog.id })}>abrir sessão</button>
            <span className={`pill ${carga.zona === 'risco' ? 'bad' : carga.zona === 'ideal' ? 'ok' : 'warn'}`} title="carga aguda:crônica (Claudino 2020)">carga A:C {carga.ratio}</span>
            {Object.entries(volume).slice(0, 4).map(([g, v]: [string, any]) => <span key={g} className="pill">{g} {v}s/sem</span>)}
          </div>
        </Card>
      )}

      <Card title="quests de hoje" aux="zerar tudo dá bônus (missao_diaria)">
        <div className="col">
          {(DB.program.quests?.diarias || []).map((q: any) => {
            const feito = !!dia.quests?.[q.id];
            return (
              <div key={q.id} className="row" style={{ justifyContent: 'space-between' }}>
                <label className="switch" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={feito} onChange={() => {
                    store.setDia((d) => ({ ...d, quests: { ...(d.quests || {}), [q.id]: !feito } }));
                    if (!feito) { addXp(`quest:${q.id}`, Math.round(Number(String(q.xp).replace(/\D+/g, '')) / 3) || 15); }
                  }} />
                  <span><b style={{ fontSize: 13 }}>{q.nome}</b> <span className="tiny">— {q.meta}</span></span>
                </label>
                <span className="pill ok mono">+{q.xp}</span>
              </div>
            );
          })}
          <div className="hr" />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="tiny">aderência das últimas 13 semanas</span>
            <button className="btn xs ghost" onClick={() => irPara('evolucao')}>histórico →</button>
          </div>
          <Heat dias={e.dias} chave={aderenciaDia} />
        </div>
      </Card>

      <Card title="alertas de hoje" aux="confirmados ficam cinza; pendentes cobram">
        <div className="scroll" style={{ maxHeight: 230 }}>
          <table>
            <tbody>
              {(metas?.agenda?.alerts || []).map((a: any) => {
                const feito = (e.alertasFeitos?.[k] || []).some((id: string) => id.startsWith(a.tipo));
                const vencido = a.hora < min;
                return (
                  <tr key={`${a.tipo}-${a.hhmm}-${a.nome}`}>
                    <td className="mono" style={{ width: 46 }}>{a.hhmm}</td>
                    <td>{a.nome}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`pill ${feito ? 'ok' : vencido ? 'warn' : ''}`}>{feito ? '✓ feito' : vencido ? 'pendente' : 'agendado'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {proxima && <div className="tiny" style={{ marginTop: 6 }}>próximo gatilho: <b>{proxima.nome}</b> às {proxima.hhmm}. Ele não some sozinho — só com a sua resposta.</div>}
      </Card>

      <Card title="o que a base diz sobre o seu dia" tone="pink" aux="clique para abrir a fonte">
        <div className="col">
          {sugestoesDoDia(e, metas).map((s: any) => (
            <div key={s.ref}>
              <div className="tiny" style={{ marginBottom: 4 }}>▸ {s.motivo}</div>
              <SourceCard id={s.ref} compact onOpen={(id) => irPara('ciencia', { fonte: id })} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const xpRegraLocal = (chave: string) => { const r = (DB.program.regras_xp_num || DB.program.regras_xp)?.[chave]; return typeof r === 'number' ? r : Number(r?.base || 6); };
const aderenciaDia = (d: any) => {
  let s = 0;
  if (d.agua) s += 0.3 * Math.min(1, d.agua / 10);
  if (d.prot) s += 0.3 * Math.min(1, d.prot / 120);
  if (d.treino) s += 0.25;
  if (d.sonoH && d.sonoH >= 7) s += 0.15;
  return Math.min(1, s);
};
function programaAtual(e: any, metas: any) {
  const xp = xpTotal(e);
  const niveis = DB.program['níveis'] || DB.program.niveis;
  const nv = nivel(xp, niveis);
  const progs = DB.program.programas || [];
  const elegiveis = progs.filter((p: any) => (p.min_nivel ?? 0) <= nv.level.n);
  const pref = e.perfil?.programaId && progs.find((p: any) => p.id === e.perfil.programaId);
  if (pref && (pref.min_nivel ?? 0) <= nv.level.n) return pref;
  const eq = new Set(e.perfil?.equip || []);
  const porEq = [...elegiveis].sort((a: any, b: any) => {
    const fa = (a.eq || []).filter((x: string) => eq.has(x)).length / Math.max(1, (a.eq || []).length);
    const fb = (b.eq || []).filter((x: string) => eq.has(x)).length / Math.max(1, (b.eq || []).length);
    return (fb - fa) || (b.min_nivel ?? 0) - (a.min_nivel ?? 0);
  });
  return porEq[0] || elegiveis[elegiveis.length - 1] || progs[0];
}
function sessaoDoDia(prog: any, e: any) {
  const sessoes = prog?.sessoes || [];
  if (!sessoes.length) return null;
  const feitos = (e.sessoes || []).filter((s: any) => s.programa === prog.id).length;
  return sessoes[feitos % sessoes.length];
}
function sugestoesDoDia(e: any, metas: any) {
  const k = hojeKey(); const d = e.dias[k] || {}; const out: { ref: string; motivo: string }[] = [];
  const aguaPct = metas ? (d.agua || 0) / Math.max(1, metas.agua.copos) : 1;
  if (aguaPct < 0.6) out.push({ ref: 'Dennis2010', motivo: `água em ${Math.round(aguaPct * 100)}% da meta — beber ao longo do dia (e antes das refeições) é a parte fácil da história` });
  if (!d.treino) out.push({ ref: 'Schoenfeld2017', motivo: 'sessão de força ainda não marcada: volume semanal é a variável que mais explica hipertrofia' });
  if (metas && (d.prot || 0) < metas.prot * 0.75) out.push({ ref: 'Morton2018', motivo: 'proteína abaixo de 75% da meta — o platô de 1,6 g/kg só vale se você chegar lá' });
  if (d.sonoH && d.sonoH < 6.5) out.push({ ref: 'Nedeltcheva2010', motivo: `sono de ${d.sonoH} h: abaixo de 6,5 h a perda de peso pende para massa magra e a fome sobe` });
  if (!out.length) out.push({ ref: 'Ekelund2019', motivo: 'dever de casa cumprido — hoje vale adicionar movimento leve (caminhada/Z2)' });
  return out.slice(0, 3);
}
