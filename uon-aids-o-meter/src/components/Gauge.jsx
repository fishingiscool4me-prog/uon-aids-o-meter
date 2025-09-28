import React from 'react'

export default function Gauge({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  let mood = '😍 Amazing'
  if (pct >= 20) mood = '🙂 Good'
  if (pct >= 40) mood = '😐 Slightly Aids'
  if (pct >= 60) mood = '😖 Aids'
  if (pct >= 80) mood = '💀 Aids apocalypse'

  return (
    <div className="meter card" style={{ padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' }}>
        <div className="thermo" style={{ '--pct': pct }}>
          <div className="fill"></div>
          <div className="bulb"></div>
          <div className="scale">
            <span>100</span>
            <span>75</span>
            <span>50</span>
            <span>25</span>
            <span>0</span>
          </div>
        </div>

        {/* right column */}
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="kpi">
            <div className="big">{pct.toFixed(1)}</div>
            <div className="tag">Aids-O-Score</div>
          </div>

          {/* clearer legend, no overlap */}
          <div className="legend">
            <div><b>Scale:</b></div>
            <div>0 = easy bliss</div>
            <div>100 = pain incarnate</div>
          </div>

          <div className="mood">{mood}</div>
        </div>
      </div>
    </div>
  )
}

