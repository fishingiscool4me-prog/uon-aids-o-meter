// src/components/DisclaimerModal.jsx
import React from 'react'

export default function DisclaimerModal({ open, onAccept, onDecline }) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'grid', placeItems: 'center', zIndex: 9999, padding: 16
      }}
    >
      <div className="card" style={{
        maxWidth: 720, width: '100%',
        background: '#0e1530', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14, padding: 24, color: 'white'
      }}>
        <h2 id="disclaimer-title" style={{ marginTop: 0, marginBottom: 12 }}>Disclaimer</h2>

        <div style={{ display: 'grid', gap: 10, lineHeight: 1.5 }}>
          <p><b>Unofficial.</b> This site is not affiliated with or endorsed by the University of Newcastle.</p>
          <p><b>For fun & feedback only.</b> Scores are user-submitted opinions for entertainment and informal feedback. They are not academic advice or official course evaluations.</p>
          <p><b>No guarantees.</b> We don’t guarantee accuracy or availability and we may moderate or remove content at our discretion.</p>
          <p>By selecting <b>Accept</b>, you acknowledge the above and agree to use the site responsibly. If you do not agree, select <b>Decline</b> to leave.</p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button className="btn" onClick={onAccept}>Accept</button>
          <button className="btn secondary" onClick={onDecline}>Decline</button>
        </div>
      </div>
    </div>
  )
}
