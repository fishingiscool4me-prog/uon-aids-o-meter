import React from 'react'

export default function Gauge({ value=0 }){
  const pct = Math.max(0, Math.min(100, Number(value)||0))
  let mood = '😍 Amazing'
  if (pct >= 20) mood = '🙂 Good'
  if (pct >= 40) mood = '😐 Mid'
  if (pct >= 60) mood = '😖 Rough'
  if (pct >= 80) mood = '💀 Unforgiving'

  return (
    <div className="meter card" style={{padding:16}}>
      <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:24, alignItems:'center'}}>
        <div className="thermo" style={{'--pct': pct}}>
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
        <div style={{display:'grid', gap:8}}>
          <div className="kpi">
            <div className="big">{pct.toFixed(1)}</div>
            <div className="tag">Aids‑O‑Score</div>
          </div>
          <small style={{color:'var(--muted)'}}>0 = easy bliss, 100 = pain incarnate.</small>
          <div style={{fontSize:22}}>{mood}</div>
        </div>
      </div>
    </div>
  )
}
