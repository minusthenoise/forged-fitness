/* Shared UI: nav, footer, auth guard, toasts, live check-in modal. */
const UI = (() => {
  const C = FF_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const forge = n => `${num(n, 2)} <span class="muted small">FIT</span>`;
  const time = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
  const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const statusTag = s => ({ verified: '<span class="tag ok">verified</span>', claimable: '<span class="tag ok">claimable</span>', claimed: '<span class="tag info">claimed</span>',
    pending: '<span class="tag warn">pending</span>', 'pending review': '<span class="tag warn">pending review</span>', flagged: '<span class="tag bad">flagged</span>',
    blocked: '<span class="tag bad">blocked</span>', capped: '<span class="tag warn">capped</span>' }[s] || `<span class="tag">${esc(s)}</span>`);

  const PAGES = [['dashboard.html', 'Dashboard'], ['sessions.html', 'Live'], ['upload.html', 'Upload'], ['devices.html', 'Devices'], ['rewards.html', 'Rewards']];

  function chrome() {
    const u = FF.me();
    const here = location.pathname.split('/').pop() || 'index.html';
    const nav = document.createElement('header');
    nav.innerHTML = `<nav class="nav"><div class="wrap">
        <a class="brand" href="index.html"><span class="anvil"></span>Forged Fitness</a>
        <div class="links">${u ? PAGES.map(([h, l]) => `<a href="${h}" class="${h === here ? 'active' : ''}">${l}</a>`).join('') : '<a href="index.html#how">How it works</a><a href="index.html#community">Community</a><a href="index.html#token">$FIT</a>'}</div>
        <div class="acct"><a class="btn sm primary buy-nav" href="${C.PUMP_URL}" target="_blank" rel="noopener">Buy $FIT</a>${u ? `<span class="who">${esc(u.name)}</span><a class="btn sm ghost" href="#" id="logout">Log out</a>` : `<a class="btn sm ghost" href="signup.html?mode=login">Log in</a><a class="btn sm primary" href="signup.html">Join</a>`}</div>
      </div></nav>`;
    document.body.prepend(nav);
    const f = document.createElement('footer');
    f.innerHTML = `<div class="wrap"><div class="row foot-top"><b>Forged Fitness</b><span class="spacer"></span><a href="${C.PUMP_URL}" target="_blank" rel="noopener">Pump.fun</a><a href="${C.DEX_URL}" target="_blank" rel="noopener">DexScreener</a><a href="index.html#token">Contract address</a></div>
      <p>${C.TICKER} CA: <span class="mono ca-inline">${C.MINT}</span></p>
      <p><b>Not investment advice.</b> ${C.TICKER} is a meme token with no promised value. Rewards are points until on-chain payouts go live. Reward amounts, rates, caps and pool sizes are placeholders, wallet connect and claims are simulated, and creator names are fictional.</p></div>`;
    document.body.append(f);
    const lo = $('#logout'); if (lo) lo.onclick = e => { e.preventDefault(); FF.logout(); location.href = 'index.html'; };
  }

  async function boot({ auth = false } = {}) {
    if (new URLSearchParams(location.search).has('demo')) await FF.seedDemo();
    if (auth && !FF.me()) { location.href = 'signup.html?mode=login&next=' + encodeURIComponent(location.pathname.split('/').pop()); return null; }
    chrome();
    return FF.me();
  }

  async function copy(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
    }
    if (btn) { const t = btn.textContent; btn.textContent = ok ? 'Copied ✓' : 'Copy failed'; setTimeout(() => { btn.textContent = t; }, 1600); }
    toast(ok ? 'Contract address copied.' : 'Copy failed. Select the address and copy it manually.');
    return ok;
  }

  function toast(msg, ms = 3200) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; document.body.append(t); setTimeout(() => t.remove(), ms); }

  /**
   * Live check-in (bot defense). Two kinds:
   *  - tap: a button appears at a random spot; tap within `seconds`.
   *  - code: a random gesture + 4-digit code; hold the gesture to camera (mocked) and type the code.
   * Rejects synthetic events (event.isTrusted === false) and inhumanly fast reactions (< 150 ms).
   * Resolves { passed, kind, reactionMs, reason }.
   */
  function checkin({ kind = Math.random() < 0.5 ? 'tap' : 'code', seconds = kind === 'tap' ? 10 : 15, context = '' } = {}) {
    return new Promise(resolve => {
      const bg = document.createElement('div'); bg.className = 'modal-bg';
      const gestures = ['✌️ two fingers', '👍 thumbs up', '✋ open palm', '🤘 horns', '👌 OK sign'];
      const g = gestures[Math.floor(Math.random() * gestures.length)];
      const code = String(Math.floor(1000 + Math.random() * 9000));
      bg.innerHTML = `<div class="modal"><div class="tag live">LIVE CHECK-IN</div>
        <h2 style="margin-top:10px">${kind === 'tap' ? 'Tap the ember' : 'Show the gesture'}</h2>
        <p class="muted small">${kind === 'tap' ? `Prove you're a human mid-workout: tap the button within ${seconds}s.` : `Hold up <b>${g}</b> to your camera <span class="placeholder">camera check mocked</span> and type the code below within ${seconds}s.`}</p>
        <div class="countdown" id="cd">${seconds}</div>
        ${kind === 'tap' ? `<div style="position:relative;height:90px"><button class="btn primary tap-target" id="tapbtn">🔥 TAP</button></div>`
          : `<div style="font-size:2rem;letter-spacing:.3em;font-weight:900" class="mono">${code}</div><div class="row" style="justify-content:center;margin-top:8px"><input id="codein" maxlength="4" inputmode="numeric" style="max-width:120px;text-align:center;font-size:1.3rem" placeholder="----"><button class="btn primary" id="codebtn">Submit</button></div>`}
        <p class="small muted">${esc(context)}</p></div>`;
      document.body.append(bg);
      const t0 = performance.now(); let left = seconds, done = false;
      const finish = (passed, reason) => { if (done) return; done = true; clearInterval(iv); bg.remove(); resolve({ passed, kind, reactionMs: Math.round(performance.now() - t0), reason }); };
      const iv = setInterval(() => { left--; const cd = $('#cd', bg); if (cd) cd.textContent = left; if (left <= 0) finish(false, 'Timed out'); }, 1000);
      const guard = ev => { if (!ev.isTrusted) return finish(false, 'Synthetic (scripted) input rejected'); if (performance.now() - t0 < 150) return finish(false, 'Reaction faster than humanly possible'); return true; };
      if (kind === 'tap') {
        const b = $('#tapbtn', bg); b.style.left = Math.round(Math.random() * 70) + '%'; b.style.top = Math.round(Math.random() * 40) + 'px';
        b.addEventListener('click', ev => { if (guard(ev) === true) finish(true, 'Tapped in time'); });
      } else {
        const inp = $('#codein', bg); inp.focus();
        const sub = ev => { if (guard(ev) !== true) return; finish(inp.value.trim() === code, inp.value.trim() === code ? 'Code matched' : 'Wrong code'); };
        $('#codebtn', bg).addEventListener('click', sub);
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') sub(ev); });
      }
    });
  }

  return { $, $$, esc, num, forge, time, ago, initials, statusTag, boot, toast, copy, checkin };
})();
