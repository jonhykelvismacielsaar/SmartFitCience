import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, fmt, hojeKey } from '../lib/db.ts';
import { buildIndex, responder, type Ctx } from '../lib/yaya.ts';
import { buscar } from '../lib/lit.ts';
import { Card, Chip, SourceCard, Toggle, useToast } from '../components/ui.tsx';

type Msg = { papel: 'user' | 'yaya' | 'sistema'; texto: string; refs?: string[]; conf?: number; origem?: string; ts: number; extras?: any[] };

const SUJEST = [
  'quanta proteína eu preciso por dia?', 'vegano precisa de creatina?', 'o que fazer antes de dormir para o sono',
  'bebida adoçada aumenta risco cardiovascular?', 'leucina por refeição', 'creatina faz mal para rins?',
  'dieta vegetariana e depressão: o que a literatura mostra?', 'como começar a correr sem me machucar?',
  'devo cortar ou cortar carboidrato?', 'quantos passos por dia?', 'multivitamínico vale a pena?', 'como ler um estudo?'];

export default function Yaya() {
  const { store, metas, irPara, addXp, extra } = useApp();
  const e = store.estado;
  const [txt, setTxt] = useState('');
  const [rigor, setRigor] = useState(!!e.preferencias?.rigor);
  const [selvagem, setSelvagem] = useState(!!e.preferencias?.selvagem);
  const [hist, setHist] = useState<Msg[]>(() => [{
    papel: 'yaya', ts: Date.now(), conf: 1, origem: 'abertura',
    texto: `Oi, ${e.perfil.nome.split(' ')[0]}. Eu sou a Yayá — respondo só com o que está no banco de evidência deste app (${DB.fontes.length} fontes + ${DB.capsulas.length} cápsulas), e digo quando não sei.\n\nVocê pode me perguntar qualquer coisa: dieta, treino, sono, suplemento, como interpretar um exame, ou "isso que vi no Instagram é verdade?". Toda resposta vem com a referência e com o que muda na sua semana.\n\nRegras da casa: não invento número, não recomendo produto, não substituo seu médico — e se um estudo tem funding de quem vende o produto, eu aviso antes de você confiar nele.`,
  }]);
  const [dig, setDig] = useState(false);
  const fim = useRef<HTMLDivElement | null>(null);
  const toast = useToast();
  const [live, setLive] = useState<{ termos: string; resultados: any[]; aviso?: string } | null>(null);

  const salvas = useMemo(() => { try { return JSON.parse(localStorage.getItem('sf_fontes_live') || '[]'); } catch { return []; } }, [hist.length]);
  const idx = useMemo(() => buildIndex([...DB.fontes, ...salvas] as any, DB.capsulas as any), [salvas.length]);
  const ctx: Ctx = useMemo(() => {
    const k = hojeKey(); const d = e.dias[k] || ({} as any);
    const gaps = (metas?.micro?.itens || []).filter((i: any) => i.status !== 'ok').map((i: any) => ({ label: i.nome, atual: i.atual ?? 0, alvo: i.alvo, unit: i.unidade }));
    return {
      alvos: metas as any, perfil: e.perfil as any, gaps,
      hoje: { agua: d.agua, kcal: d.kcal, prot: d.prot, treino: !!d.treino?.ok, sonoH: d.sonoH ?? undefined, passos: d.passos ?? undefined },
      exames: { ...(e.perfil?.exames || {}), ...Object.fromEntries((e.exames || []).map((x: any) => [x.nome, x.valor])) },
    };
  }, [metas, e]);

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [hist, dig]);
  const [ultimaAuto, setUltimaAuto] = useState('');
  useEffect(() => {
    if (extra?.q && extra.q !== ultimaAuto) { setUltimaAuto(extra.q); perguntar(extra.q); }
  }, [extra]);

  const perguntar = async (pergunta?: string) => {
    const q = (pergunta ?? txt).trim();
    if (!q) return;
    setTxt('');
    setHist((h) => [...h, { papel: 'user', texto: q, ts: Date.now() }]);
    setDig(true);
    await new Promise((r) => setTimeout(r, 260));
    const r = responder(q, idx, [...DB.fontes, ...salvas] as any, ctx, { rigor });
    let extras: any[] | undefined;
    if (selvagem) {
      try {
        const b = await buscar({ termos: q.replace(/[?!.,]/g, ' ').slice(0, 90), excluirSetorial: true, soHumanos: true, anosDe: 2018 });
        extras = b.resultados.slice(0, 4);
        if (extras.length) r.texto += `\n\nLiteratura ao vivo (metadados OpenAlex/Crossref, ${b.fonte}): ${extras.map((x: any) => `“${x.titulo.slice(0, 80)}” ${x.ano} — ${x.sinal}`).join('; ')}. Isso não entra na sua prescrição sem eu ler o artigo inteiro.`;
      } catch { r.texto += '\n\nA busca ao vivo falhou (rede). Respondi só com a base local, que é a parte que eu realmente confiro.'; }
    }
    setHist((h) => [...h, { papel: 'yaya', texto: r.texto, refs: r.refs.map((f) => f.id), conf: r.confianca, origem: r.origem, ts: Date.now(), extras }]);
    addXp('pergunta_yaya', 4, {});
    setDig(false);
  };

  return (
    <div className="split">
      <Card tone="neon" className="chat" title="Yayá · assistente ancorado na base" aux={`modo ${rigor ? 'rigoroso (mais fontes, mais ressalvas)' : 'direto'} · busca aberta ${selvagem ? 'ligada' : 'desligada'}`}>
        <div className="msgs">
          {hist.map((m, i) => (
            <div key={i} className={`msg ${m.papel === 'user' ? 'user' : 'yaya'}`}>
              <div className="body">
                {m.papel !== 'user' && <div className="row" style={{ gap: 6, marginBottom: 3 }}>
                  <span className="pill neon">{m.origem === 'sem-correspondencia' ? 'sem base' : `${m.conf ? Math.round(m.conf * 100) + '%' : '—'} de correspondência`}</span>
                  {m.origem && m.origem !== 'sem-correspondencia' && <span className="tiny mono">{m.origem}</span>}
                </div>}
                {m.texto.split('\n').map((ln, j) => <p key={j} style={{ margin: '3px 0' }}>{ln}</p>)}
                {m.refs && m.refs.length > 0 && (
                  <div className="row" style={{ marginTop: 7, gap: 5 }}>
                    {m.refs.map((id) => <button key={id} className="ref" title="ver ficha" onClick={() => irPara('ciencia', { fonte: id })}>{id}</button>)}
                    <span className="tiny right">{m.refs.length} referência(s)</span>
                  </div>
                )}
                {m.refs && m.refs.length > 0 && (
                  <div className="col" style={{ marginTop: 7 }}>
                    {m.refs.slice(0, 2).map((id) => <SourceCard key={id} id={id} compact onOpen={(x) => irPara('ciencia', { fonte: x })} />)}
                  </div>
                )}
                {m.extras?.map((t: any, j: number) => (
                  <div key={j} className="card" style={{ padding: 8, marginTop: 6 }}>
                    <b style={{ fontSize: 12.5 }}>{t.titulo}</b>
                    <div className="tiny">{t.revista} {t.ano} · {t.design} · <span className={`pill ${t.risco === 'alto' ? 'bad' : t.risco === 'baixo' ? 'ok' : 'warn'}`}>{t.sinal}</span></div>
                    {t.url && <a className="btn xs" href={t.url} target="_blank" rel="noreferrer noopener" style={{ marginTop: 5 }}>abrir ↗</a>}
                  </div>
                ))}
                {m.papel !== 'user' && m.conf && m.conf < 0.45 && (
                  <div className="warnbox" style={{ marginTop: 6 }}>correspondência baixa: a pergunta pode estar fora do escopo da base. Confira a referência antes de decidir por isso.</div>
                )}
              </div>
            </div>
          ))}
          {dig && <div className="msg yaya"><div className="body"><span className="dim">procurando nas fontes…</span></div></div>}
          <div ref={fim} />
        </div>
        <div className="input-row">
          <textarea className="input" rows={2} value={txt} placeholder="pergunte qualquer coisa — dieta, treino, sono, suplemento, um paper que você viu…"
            onChange={(ev) => setTxt(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); perguntar(); } }} />
          <div className="row">
            <Toggle checked={rigor} onChange={(v) => { setRigor(v); store.mutar((x) => ({ ...x, preferencias: { ...x.preferencias, rigor: v } })); }}>modo rigoroso</Toggle>
            <Toggle checked={selvagem} onChange={(v) => { setSelvagem(v); store.mutar((x) => ({ ...x, preferencias: { ...x.preferencias, selvagem: v } })); }}>consultar literatura ao vivo</Toggle>
            <span className="tiny right">Enter = perguntar</span>
            <button className="btn primary" onClick={() => perguntar()}>perguntar</button>
          </div>
        </div>
      </Card>

      <div className="col">
        <Card title="comece por aqui">
          <div className="chips">
            {SUJEST.map((s) => <Chip key={s} onClick={() => perguntar(s)}>{s}</Chip>)}
          </div>
        </Card>
        <Card title="o que eu faço com seu perfil" tone="blue">
          <div className="col tiny" style={{ gap: 6 }}>
            <div><b>Leio:</b> {['peso/altura/idade/sexo', 'dieta e restrições', 'exames que você digitou', 'água/sono/treino de hoje', 'XP e nível atual'].map((x) => <div key={x}>• {x}</div>)}</div>
            <div><b>Calculo na hora:</b> {`alvo ${fmt.n(metas?.kcal || 0)} kcal · proteína ${fmt.n(metas?.prot || 0)} g · água ${fmt.n(metas?.agua?.aBeberL || 0, 1)} L · nível ${e.perfil.nivel}`}</div>
            <div><b>Nunca:</b> dosagem de remédio, diagnóstico, promessa de resultado, endosso de marca.</div>
            <div style={{ color: 'var(--txt-faint)' }}>Se eu citar um número com <span className="pill warn">conferir na fonte</span>, é porque a página do PDF não estava aberta quando a base foi montada.</div>
          </div>
        </Card>
        <Card title="busca aberta na literatura" aux={live ? `${live.resultados.length} resultado(s)` : 'aparece aqui quando a Selvagem acha algo'}>
          <div className="col" style={{ gap: 7 }}>
            {live?.resultados.map((t: any, i: number) => (
              <div key={i} className="card" style={{ padding: 9 }}>
                <b style={{ fontSize: 12.5 }}>{t.titulo}</b>
                <div className="tiny">{t.revista} {t.ano} · {t.citacoes} citações · <span className={`pill ${t.risco === 'alto' ? 'bad' : t.risco === 'baixo' ? 'ok' : 'warn'}`}>{t.sinal}</span></div>
              </div>
            ))}
            {!live && <div className="tiny">Ligue “consultar literatura ao vivo” acima: eu pergunto ao OpenAlex (que expõe <em className="ref">funders</em>) e classifico por risco de conflito de interesse antes de qualquer sugestão virar plano.</div>}
          </div>
        </Card>
        <Card title="meta-de-fontes" aux={`${Math.round((DB.fontes as any[]).filter((f: any) => f.ck === 1).length / Math.max(1, DB.fontes.length) * 100)}% das fontes com DOI/PMID conferido`}>
          <div className="tiny">
            {`Apartei ${DB.fontes.length} fontes em risco de conflito (baixo/médio/alto) e mostro o selo em cada uma. Auditoria completa na aba Ciência. Se um estudo financiado pela indústria é o único que existe sobre um tema, eu digo que só existe aquilo — não finjo independência onde ela não há.`}
          </div>
        </Card>
      </div>
    </div>
  );
}
