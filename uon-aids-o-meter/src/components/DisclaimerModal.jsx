import React from 'react'

export default function DisclaimerModal({ open, onAccept, onDecline }){
  if(!open) return null
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Heads up! Community‑run & for laughs only 🤝</h3>
        <p>
          This site is a light‑hearted, student‑made project to rate course difficulty.
          It is <b>not affiliated with or endorsed by the University of Newcastle</b>.
          Scores are anonymous opinions and <b>not facts</b>. Don&apos;t harass staff or students,
          don&apos;t defame anyone, and be kind.
        </p>
        <p>
          By continuing you agree that:
          <ul>
            <li>you&apos;re 17+ and a student or alum using this for entertainment;</li>
            <li>no guarantees are made about accuracy;</li>
            <li>basic anti‑spam is used (local storage, and a hashed IP with a time window);</li>
            <li>no personal data like names or emails are collected by default;</li>
            <li>we may remove abusive content or block abusers.</li>
          </ul>
        </p>
        <small>
          If you represent UON and want it taken down or adjusted, please contact the maintainer listed on the GitHub repo.
        </small>
        <div style={{display:'flex', gap:8, marginTop:12, justifyContent:'flex-end'}}>
          <button className="btn ghost" onClick={onDecline}>Decline</button>
          <button className="btn" onClick={onAccept}>Accept & Enter</button>
        </div>
      </div>
    </div>
  )
}
