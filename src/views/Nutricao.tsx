import { useMemo, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, fmt, hojeKey } from '../lib/db.ts';
import { NIVEIS_DIETA } from '../lib/calc.ts';
import { gerarPlano, custoPorGramaDeProteina, trocasDe, recalcItem, somar, PRECOS, type Alimento, type Item } from '../lib/planner.ts';
import { Bar, Card, Chip, Modal, SourceCard, Stat, Toggle, useToast } from '../components/ui.tsx';

type AbaDieta = keyof typeof NIVEIS_DIETA;
const ABAS: AbaDieta[] = ['omni', 'pesc', 'lacto_ovo', 'ovo', 'lacto', 'veg'];

export default function Nutricao() {
  const { store, metas, addXp, irPara } = useApp();
  const p = store.estado.perfil;
  const [dieta, setDieta] = useState<AbaDieta>(p.dieta || 'lacto_ovo');
  const [refeicoes, setRefeicoes] = useState<number>(p.refeicoesDia || 4);
  const [verTroca, setVerTroca] = useState<{ ref: number; item: Item } | null>(null);
  const [abaInterna, setAbaInterna] = useState<'plano' | 'modelos' | 'trocas' | 'compras' | 'riscos'>('plano');
  const toast = useToast();
  const k = hojeKey();
  const dia = store.estado.dias[k] || ({} as any);

  const alvos = metas || { kcal: 2400, prot: 160, carb: 260, fat: 70, fibra: 32, micro: { itens: [] } };
  const swap: Record<string, any> = (p as any).__trocas || {};
  const plano = useMemo(() => {
    const alvo = alvos as any;
    const base = gerarPlano({
      alimentos: DB.alimentos as Alimento[], diet: dieta,
      kcal: Math.round(alvo.kcal), protein: Math.round(alvo.prot), fat: Math.round(alvo.fat), carb: Math.round(alvo.carb), fibra: Math.round(alvo.fibra),
      refeicoes, restricoes: p.restricoes || [], evitar: p.evitar || [], seed: `${p.handle || p.nome}|${k}|${dieta}|${refeicoes}`,
      metaCalcio: alvo.micro?.itens?.find((i: any) => i.id === 'calcio')?.alvo, metaFerro: alvo.micro?.itens?.find((i: any) => i.id === 'ferro')?.alvo,
      metaSodio: alvo.micro?.itens?.find((i: any) => i.id === 'sodio')?.alvo,
    });
    // aplica as trocas guardadas no perfil (persistem entre dias e aparecem no diário)
    const t = swap;
    if (Object.keys(t).length) {
      base.refeicoes.forEach((r: any) => {
        r.itens = r.itens.map((it: Item) => {
          const troca = t[`${r.nome}|${it.id}`];
          if (!troca) return it;
          const al = DB.alimentos.find((a: any) => a.id === troca.id) as Alimento | undefined;
          if (!al) return it;
          const novo: any = { ...it, id: al.id, nome: al.nome, grupo: al.grupo, g: Number(troca.g) || it.g };
          recalcItem(novo, al);
          return novo;
        });
        r.tot = somar(r.itens);
      });
      (base as any).totais = somar(base.refeicoes.flatMap((r: any) => r.itens));
    }
    return base;
  }, [dieta, refeicoes, (alvos as any).kcal, (alvos as any).prot, p.restricoes?.join(','), p.evitar?.join(','), k, JSON.stringify(swap)]);

  const infoDieta = NIVEIS_DIETA[dieta];
  const custo = useMemo(() => custoPorGramaDeProteina(DB.alimentos as Alimento[]).slice(0, 14), []);
  const marcar = (ref: any) => {
    const jaTem = !!dia.refeicoes?.[ref.nome];
    store.setDia((d) => {
      const refeicoes = { ...(d.refeicoes || {}) };
      let kcal = d.kcal || 0, prot = d.prot || 0, fibra = d.fibra || 0;
      if (jaTem) { delete refeicoes[ref.nome]; kcal -= ref.tot.kcal; prot -= ref.tot.prot; fibra -= ref.tot.fibra; }
      else { refeicoes[ref.nome] = { itens: ref.itens.map((i: Item) => ({ id: i.id, g: i.g })), hora: new Date().toISOString() }; kcal += ref.tot.kcal; prot += ref.tot.prot; fibra += ref.tot.fibra; }
      return { ...d, refeicoes, kcal: Math.max(0, Math.round(kcal)), prot: Math.max(0, Math.round(prot * 10) / 10), fibra: Math.max(0, Math.round(fibra * 10) / 10) };
    });
    if (!jaTem) addXp('refeicao_registrada', 8, { dieta });
    toast(jaTem ? 'tirei do diário' : `+${ref.tot.kcal} kcal · ${ref.tot.prot} g de proteína ✓`);
  };

  const ajustesInfo = (alvos as any).micro?.itens || [];
  return (
    <div className="col" style={{ gap: 12 }}>
      <Card title="abas por padrão alimentar" tone="neon" aux="o filtro age no banco de alimentos inteiro, não só no exemplo">
        <div className="chips">
          {ABAS.map((a) => (
            <button key={a} className="chip" aria-pressed={dieta === a} onClick={() => setDieta(a)} title={`flags: ${NIVEIS_DIETA[a].flags.join(' ')}`}>
              {NIVEIS_DIETA[a].nome}
              {a === p.dieta ? ' · você' : ''}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny">{infoDieta.nome}: proteínas {plano.totais.prot} g · {fmt.n(alvos.kcal)} kcal · fibra {plano.totais.fibra} g · custo ~R$ {fmt.n(plano.custo, 2)}/dia (R$ {fmt.n(plano.custoPorProteina, 2)}/g de proteína)</span>
          <span className="right" />
          <SegRefeicoes value={refeicoes} onChange={setRefeicoes} />
        </div>
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          {['plano', 'modelos', 'trocas', 'compras', 'riscos'].map((x) => (
            <button key={x} className="chip" aria-pressed={abaInterna === (x as any)} onClick={() => setAbaInterna(x as any)}>{{ plano: 'seu dia', modelos: 'modelos por dieta', trocas: 'tabela de troca', compras: 'cesta & custo', riscos: 'riscos & lacunas' }[x]}</button>
          ))}
        </div>
      </Card>

      {abaInterna === 'plano' && (
        <div className="grid g2">
          {plano.refeicoes.map((ref, i) => (
            <Card key={ref.nome} title={ref.nome} aux={`${ref.hora} · ${fmt.n(ref.tot.kcal)} kcal · P ${fmt.n(ref.tot.prot)} g`}>
              <table>
                <tbody>
                  {ref.itens.map((it) => (
                    <tr key={it.id}>
                      <td style={{ width: '44%' }}>{it.nome}<div className="tiny">{it.grupo} · {it.papel}</div></td>
                      <td className="mono" style={{ width: 62 }}>{fmt.n(it.g)} g</td>
                      <td className="mono" style={{ width: 96 }}>{fmt.n(it.kcal)} kcal<div className="tiny">P{fmt.n(it.prot, 1)} · C{fmt.n(it.carb, 1)} · G{fmt.n(it.gord, 1)}</div></td>
                      <td style={{ textAlign: 'right', width: 64 }}>
                        <button className="btn xs ghost" onClick={() => setVerTroca({ ref: i, item: it })} title="substituir por item equivalente da mesma dieta">trocar ⇄</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bar" style={{ marginTop: 8 }}><span style={{ width: `${Math.min(100, (ref.tot.prot / ((alvos as any).proteina?.proteinPorRefeicao || 40)) * 100)}%` }} /></div>
              <div className="tiny">proteína {fmt.n(ref.tot.prot)} g · alvo {fmt.n((alvos as any).proteina?.proteinPorRefeicao || 40)} g por refeição (Morton 2018; Bauer 2013 para leucina em +50)</div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className={`btn sm ${dia.refeicoes?.[ref.nome] ? '' : 'primary'}`} onClick={() => marcar(ref)}>{dia.refeicoes?.[ref.nome] ? 'desmarcar' : 'comi isso ✓'}</button>
                <button className="btn sm ghost" onClick={() => { store.setDia((dd) => ({ ...dd, refeicoes: { ...(dd.refeicoes || {}), [ref.nome]: { itens: ref.itens.map((x: Item) => ({ id: x.id, g: x.g })), planejada: true } } })); toast('plano do dia salvo no diário'); }}>guardar como plano</button>
              {ref.itens.some((it: any) => swap[`${ref.nome}|${it.id}`]) && (
                <button className="btn xs warn" onClick={() => store.mutar((x) => { const t = { ...(x.perfil.__trocas || {}) }; for (const k2 of Object.keys(t)) if (k2.startsWith(ref.nome + '|')) delete t[k2]; return { ...x, perfil: { ...x.perfil, __trocas: t } }; })}>desfazer trocas desta refeição</button>
              )}
                <button className="btn sm ghost" onClick={() => irPara('yaya', { q: `estou enjoado de ${ref.itens[0]?.nome}: o que trocar na minha dieta ${infoDieta.nome} mantendo a proteína?` })}>perguntar à Yayá</button>
              </div>
            </Card>
          ))}

          <Card title="ajustes sugeridos pelo solver" tone="amber" aux={`${plano.ajustes.length} lacuna(s) fechável(is)`}>
            {plano.ajustes.length === 0 && <div className="okbox">O dia fechou as lacunas de proteína, fibra, cálcio e ferro sem acréscimos. 🎉</div>}
            {plano.ajustes.map((a, i) => (
              <div key={i} className="warnbox" style={{ marginBottom: 6 }}>
                <b>{a.texto}</b>
                <div className="tiny">{a.motivo}</div>
                <button className="btn xs" style={{ marginTop: 5 }} onClick={() => {
                  store.setDia((dd) => ({ ...dd, kcal: Math.round(dd.kcal + ((DB.alimentos.find((x: any) => x.id === a.add.id)?.kcal || 0) * a.add.g) / 100), prot: Math.round((dd.prot + ((DB.alimentos.find((x: any) => x.id === a.add.id)?.prot || 0) * a.add.g) / 100) * 10) / 10, fibra: Math.round((dd.fibra + ((DB.alimentos.find((x: any) => x.id === a.add.id)?.fibra || 0) * a.add.g) / 100) * 10) / 10 }));
                  addXp('refeicao_registrada', 8, { ajuste: true }); toast('acréscimo somado ao dia de hoje');
                }}>somar ao meu dia</button>
              </div>
            ))}
            {plano.avisos.map((v, i) => <div key={i} className="badbox" style={{ marginTop: 6 }}>{v}</div>)}
            <div className="hr" />
            <div className="tiny">Desvios do plano: {fmt.n(plano.desvios.kcal, 1)}% de energia · proteína {plano.desvios.prot > 0 ? '+' : ''}{fmt.n(plano.desvios.prot, 1)} g · gordura {plano.desvios.gorduraPctE}% da energia. O gerador prioriza proteína e fibra; carboidrato é o amortecedor calórico (Peos 2021).</div>
          </Card>
        </div>
      )}

      {abaInterna === 'modelos' && (
        <div className="grid g2">
          {(DB.modelosRefeicao[dieta] || []).map((m: any) => (
            <Card key={m.nome} title={m.nome} aux={m.hora}>
              <div className="row" style={{ gap: 5, marginBottom: 6 }}>
                {m.itens.map((it: any) => {
                  const al = DB.alimentos.find((a: any) => a.id === it.a);
                  return <span key={it.a} className="pill" title={`${fmt.n((al?.kcal || 0) * it.g / 100)} kcal`}>{al?.nome || it.a} · {it.g} g</span>;
                })}
              </div>
              <div className="tiny" style={{ marginBottom: 6 }}>{m.dica}</div>
              <div className="col" style={{ gap: 5 }}>
                {(m.refs || []).map((r: string) => <SourceCard key={r} id={r} compact onOpen={(id) => irPara('ciencia', { fonte: id })} />)}
              </div>
              <button className="btn sm" style={{ marginTop: 7 }} onClick={() => {
                const tot = m.itens.reduce((s: any, it: any) => { const al = DB.alimentos.find((a: any) => a.id === it.a)!; return { kcal: s.kcal + (al.kcal * it.g) / 100, prot: s.prot + (al.prot * it.g) / 100, fibra: s.fibra + (al.fibra * it.g) / 100 }; }, { kcal: 0, prot: 0, fibra: 0 });
                store.setDia((dd) => ({ ...dd, refeicoes: { ...(dd.refeicoes || {}), [`${m.nome} (modelo)`]: { itens: m.itens.map((x: any) => ({ id: x.a, g: x.g })), hora: new Date().toISOString() } }, kcal: Math.round(dd.kcal + tot.kcal), prot: Math.round((dd.prot + tot.prot) * 10) / 10, fibra: Math.round((dd.fibra + tot.fibra) * 10) / 10 }));
                addXp('refeicao_registrada', 8, { modelo: m.nome });
                toast(`modelo somado: ${Math.round(tot.kcal)} kcal · ${Math.round(tot.prot)} g proteína`);
              }}>usar este modelo</button>
            </Card>
          ))}
        </div>
      )}

      {abaInterna === 'trocas' && (
        <Card title="equivalência entre fontes de proteína" aux="para trocar sem quebrar a meta">
          {DB.substituicoes.map((g: any) => (
            <div key={g.grupo} className="grid-titulos">
              <h4>{g.grupo}</h4>
              <div className="scroll">
                <table>
                  <thead><tr><th>de</th><th>por (1 bloco)</th><th>nota prática</th></tr></thead>
                  <tbody>
                    {g.blocos.map((b: any, i: number) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: 'nowrap' }}>{b.de}</td>
                        <td>{b.por.map((x: any) => { const al = DB.alimentos.find((a: any) => a.id === x.a); return <span key={x.a} className="chip small" style={{ marginRight: 4, cursor: 'default' }}>{al?.nome || x.a} {x.g} g</span>; })}</td>
                        <td className="tiny">{b.nota}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="tiny" style={{ marginTop: 8 }}>Volume importa: para bater a mesma proteína sem carne você come mais gramas (e mais fibra, mais potássio). Ferro não-heme rende menos por grama — daí a vitamina C junto (Hurrell & Egli 2010) e a meta de proteína maior (+0,1–0,2 g/kg, Clarys 2014).</div>
        </Card>
      )}

      {abaInterna === 'compras' && (
        <div className="grid g2">
          <Card title="lista da semana (do plano de hoje × 7)" tone="blue" aux={`R$ ${fmt.n(plano.custo * 7, 2)} estimado`}>
            <div className="scroll" style={{ maxHeight: 340 }}>
              <table>
                <thead><tr><th>alimento</th><th>qtde</th><th>grupo</th><th>R$/100 g</th></tr></thead>
                <tbody>
                  {plano.lista.map((l: any) => (
                    <tr key={l.id}>
                      <td>{l.nome}</td>
                      <td className="mono">{l.g >= 1000 ? `${fmt.n(l.g * 7 / 1000, 2)} kg` : `${fmt.n(l.g * 7)} g`}</td>
                      <td className="tiny">{l.grupo}</td>
                      <td className="mono">{fmt.n(PRECOS[l.id] ?? 1, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tiny">Preço médio de referência por 100 g (SP, 2026) — o app não é pesquisa de mercado: use para comparar custo por grama de proteína entre escolhas.</div>
          </Card>
          <Card title="custo por grama de proteína" aux="ordenado do mais barato">
            <table>
              <thead><tr><th>alimento</th><th>proteína/100 g</th><th>kcal/100 g</th><th>R$ / g prot.</th></tr></thead>
              <tbody>
                {custo.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}<div className="tiny">{c.grupo}</div></td>
                    <td className="mono">{c.prot} g</td>
                    <td className="mono">{c.kcal}</td>
                    <td className="mono" style={{ color: c.r$ <= 0.06 ? 'var(--neon)' : undefined }}>{fmt.n(c.r$, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {abaInterna === 'riscos' && (
        <div className="grid g2">
          <Card title="micronutrientes do seu padrão" tone="pink">
            <table>
              <thead><tr><th>nutriente</th><th>alvo</th><th>status</th><th>fontes / conduta</th></tr></thead>
              <tbody>
                {ajustesInfo.map((i: any) => (
                  <tr key={i.id}>
                    <td><b>{i.nome}</b></td>
                    <td className="mono">{fmt.n(i.alvo, i.unidade === 'µg' || i.unidade === 'mg' ? 0 : 1)} {i.unidade}</td>
                    <td><span className={`pill ${i.status === 'critico' ? 'bad' : i.status === 'atencao' ? 'warn' : 'ok'}`}>{i.status === 'critico' ? 'crítico' : i.status === 'atencao' ? 'atenção' : 'ok'}</span></td>
                    <td className="tiny">{(i.suplementar ? <b style={{ color: 'var(--amber)' }}>{i.suplementar}. </b> : null)}{i.fonte.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tiny" style={{ marginTop: 6 }}>{(alvos as any).micro?.obs}</div>
          </Card>
          <Card title="o que a base diz sobre o padrão escolhido" aux={infoDieta.nome}>
            <div className="col">
              {(dieta === 'veg' || dieta === 'lacto' || dieta === 'ovo' || dieta === 'lacto_ovo'
                ? ['Dinu2018', 'Tong2020', 'Capodici2024', 'Rogerson2021', 'Clarys2014', 'Tonstad2009']
                : dieta === 'pesc' ? ['AHA2026', 'Mozaffarian2024', 'Orlich2015', 'Bouvard2015']
                  : ['WCRF2018', 'Bouvard2015', 'Huang2020', 'AHA2026', 'Hall2019']).map((id) => <SourceCard key={id} id={id} onOpen={(x) => irPara('ciencia', { fonte: x })} />)}
            </div>
          </Card>
        </div>
      )}

      <Modal open={!!verTroca} onClose={() => setVerTroca(null)} title="trocar por equivalente" wide kind="">
        {verTroca && (() => {
          const trocas = trocasDe(verTroca.item, DB.alimentos as Alimento[], dieta, Math.random);
          return (
            <div className="col">
              <p className="dim">Trocas mantendo o papel nutricional de <b>{verTroca.item.nome}</b> ({fmt.n(verTroca.item.g)} g) na dieta <b>{infoDieta.nome}</b>. A gramas são recalculadas para a mesma densidade.</p>
              <table>
                <thead><tr><th>alimento</th><th>gramas</th><th>Δkcal</th><th>Δproteína</th><th /></tr></thead>
                <tbody>
                  {trocas.map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.nome}</td><td className="mono">{fmt.n(t.g)} g</td>
                      <td className="mono" style={{ color: Math.abs(t.deltaKcal) > 80 ? 'var(--amber)' : undefined }}>{t.deltaKcal > 0 ? '+' : ''}{t.deltaKcal}</td>
                      <td className="mono" style={{ color: t.deltaProt < -5 ? 'var(--red)' : 'var(--neon)' }}>{t.deltaProt > 0 ? '+' : ''}{fmt.n(t.deltaProt, 1)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn xs primary" onClick={() => {
                          const r = plano.refeicoes[verTroca.ref];
                          store.mutar((x) => ({ ...x, perfil: { ...x.perfil, __trocas: { ...(swap || {}), [`${r.nome}|${verTroca.item.id}`]: { id: t.id, g: t.g } } } }));
                          setVerTroca(null); toast(`${verTroca.item.nome} → ${t.nome} (${fmt.n(t.g)} g) · guardado no seu perfil`);
                        }}>usar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {trocas.length === 0 && <div className="badbox">Nenhum equivalente no banco para esse grupo nesta dieta. Use a tabela de troca ou a caixa de ajustes acima.</div>}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function SegRefeicoes({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="seg">
      {[3, 4, 5].map((v) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{v} refeições</button>)}
    </div>
  );
}
