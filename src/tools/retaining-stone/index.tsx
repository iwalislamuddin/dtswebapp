import { useMemo } from 'react'
import type { StoneWallResult } from '../../calc/retaining-stone'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, NumField, Panel, ResetButton, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { basePressures, stabilityRatios } from '../_retaining/common'
import { RatioChart, WallCards, WallPreview } from '../_retaining/ui'
import { computeStone, rejectReason, STONE_DEFAULTS, validate, type StoneInput } from './model'
import { stoneReport } from './report'

const ID = 'retaining-stone'

export default function RetainingStone({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<StoneInput>(ID, STONE_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeStone)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? stoneReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input geometri, urugan, dan tanah fondasi untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={
        <>
          <WallCards input={input} setInput={setInput} errors={errors} n={1} body="badan" actions={<ResetButton onReset={reset} />} />
          <Card n={4} title="Material">
            <NumField label="γ — berat isi pasangan batu" unit="kN/m³" value={input.gammaW} error={errors.gammaW} onChange={(gammaW) => setInput({ gammaW })} />
          </Card>
        </>
      }
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><WallPreview r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={r} stale={stale} reject={reject} />}
    />
  )
}

function Results({ r, stale, reject }: { r: StoneWallResult | null; stale: boolean; reject: string | null }) {
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const bp = r ? basePressures(r) : null
  return (
    <Panel title="Pemeriksaan" className="results-panel">
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <RatioChart items={stabilityRatios(r)} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && bp && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'FS guling', value: fx(r.FSot, 2), sub: `min ${fx(r.FSotT, 1)}`, tone: r.okOt ? 'ok' : 'bad' },
                { label: 'FS geser', value: fx(r.FSsl, 2), sub: `min ${fx(r.FSslT, 1)}`, tone: r.okSl ? 'ok' : 'bad' },
                { label: 'Toe / heel', value: `${Number.isFinite(bp.toe) ? fx(bp.toe, 0) : '∞'} / ${fx(bp.heel, 0)}`, unit: 'kPa', sub: `e ${fx(r.e, 2)} · B/6 ${fx(r.B! / 6, 2)} m`, tone: r.okE ? undefined : 'bad' },
                { label: 'Volume pasangan', value: fx(r.volM, 2), unit: 'm³/m', sub: r.volTot != null ? `${fx(r.volTot, 1)} m³ total` : undefined },
              ]}
            />
            {r.warn.length > 0 && (
              <ul className="results-warn">
                {r.warn.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
