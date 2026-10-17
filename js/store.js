/* Forged Fitness: mock backend (localStorage) + rewards engine.
 * EVERYTHING HERE IS CLIENT-SIDE AND SPOOFABLE. It exists to make the draft clickable
 * and to show the rules a real server must enforce. See VERIFICATION.md / TOKENOMICS.md.
 */
const FF_CONFIG = {
  // $FIT on Solana (Pump.fun). Single source of truth for the contract address.
  MINT: 'F2voSVvtz2yMEVKFY2EXWuybHt9V8UFPy9RogfBApump',
  TICKER: '$FIT',
  PUMP_URL: 'https://pump.fun/coin/F2voSVvtz2yMEVKFY2EXWuybHt9V8UFPy9RogfBApump',
  DEX_URL: 'https://dexscreener.com/solana/F2voSVvtz2yMEVKFY2EXWuybHt9V8UFPy9RogfBApump',
  // --- base earn rates (placeholder numbers) ---
  POINTS_PER_100_STEPS: 1,          // 10,000 steps = 100 points
  LIVE_POINTS_PER_MIN: 6,           // premium live tier, device-stream verified
  LIVE_UNVERIFIED_POINTS_PER_MIN: 1,// live session with no device stream
  // --- supply controls ---
  DAILY_CAP: 500,                   // max FIT one account can earn per day
  STREAK_BONUS_PER_DAY: 0.05,       // +5% per consecutive active day
  STREAK_BONUS_MAX: 0.50,           // capped at +50%
  STREAK_GOAL_STEPS: 5000,          // a day counts as "active" at 5k steps or any live session
  GENESIS: '2026-10-01T00:00:00',   // emission schedule start (placeholder)
  DAILY_POOL_START: 1000000,        // FIT emitted per day in month 0 (placeholder)
  MONTHLY_DECAY: 0.10,              // pool shrinks 10% each month
  NETWORK_POINTS_BASE: 1250000,     // SIMULATED network-wide verified points per day
  NETWORK_POINTS_GROWTH: 0.15,      // SIMULATED monthly growth of network activity
  // --- payout tiers ---
  TIER_AUTO_MAX: 50,                // <= 50 FIT: automatic once data is verified
  TIER_CHECKIN_MAX: 250,            // 50–250: verified data + passed live check-in
                                    // > 250: + manual review
  CHECKIN_VALID_HOURS: 24,
  // --- anti-gaming ---
  QUIET_TIMEOUT_S: 60,              // live rewards pause after 60s with no movement signal
  UNBIND_COOLDOWN_H: 72,
  UPLOADS_PER_DAY: 5,
  MAX_STEPS_PER_MIN: 220,           // anything above is treated as impossible
  SCREENSHOT_GRACE_H: 12            // screenshot may be captured up to 12h after the activity ends
};

const FF = (() => {
  const KEY = 'forged_fitness_db_v1';
  const C = FF_CONFIG;
  const blank = () => ({ users: {}, session: null, devices: {}, hashes: {}, feed: [], browserSalt: rid(12) });
  function rid(n = 8) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(n)); for (const x of r) s += a[x % a.length]; return s; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { return blank(); } }
  function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function tx(fn) { const d = load(); const r = fn(d); save(d); return r; }

  // ---------- hashing ----------
  async function sha256Hex(data) {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Non-secure context fallback (e.g. opened via LAN IP). NOT cryptographic.
    let h = 0x811c9dc5; const u = new Uint8Array(buf.buffer || buf);
    for (const b of u) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return 'fnv1a-' + h.toString(16);
  }

  // ---------- dates ----------
  const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
  const startOfWeek = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

  // ---------- auth ----------
  function me(d = load()) { return d.session && d.users[d.session] ? d.users[d.session] : null; }
  async function signup({ name, email, password, wallet }) {
    email = email.trim().toLowerCase();
    if (!name || !email || !password) throw new Error('Name, email and password are required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters (mock rule).');
    if (wallet && !isSolAddress(wallet)) throw new Error('That does not look like a Solana address (base58, 32–44 chars).');
    const passHash = await sha256Hex('ff-mock-salt:' + password);
    return tx(d => {
      if (d.users[email]) throw new Error('An account with that email already exists.');
      d.users[email] = { name: name.trim(), email, passHash, wallet: wallet || '', createdAt: Date.now(),
        activities: [], ledger: [], payouts: [], uploads: [], device: null, cooldownUntil: 0, deviceHistory: [],
        rsvps: [], crews: [], checkins: [], lastCheckinPassedAt: 0 };
      d.session = email;
      d.feed.push({ ts: Date.now(), who: name.trim(), text: 'joined the Forge 🔥' });
      return d.users[email];
    });
  }
  async function login(email, password) {
    email = email.trim().toLowerCase();
    const passHash = await sha256Hex('ff-mock-salt:' + password);
    return tx(d => { const u = d.users[email]; if (!u || u.passHash !== passHash) throw new Error('Wrong email or password.'); d.session = email; return u; });
  }
  function logout() { tx(d => { d.session = null; }); }
  function isSolAddress(s) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim()); }
  function setWallet(w) { if (w && !isSolAddress(w)) throw new Error('Not a valid-looking Solana address.'); tx(d => { me(d).wallet = w.trim(); }); }
  function updateMe(fn) { return tx(d => { const u = me(d); if (!u) throw new Error('Not logged in'); return fn(u, d); }); }

  // ---------- emission schedule (global supply control) ----------
  function monthIndex(t = Date.now()) {
    const g = new Date(C.GENESIS), n = new Date(t);
    return Math.max(0, (n.getFullYear() - g.getFullYear()) * 12 + n.getMonth() - g.getMonth());
  }
  function dailyPool(t = Date.now()) { return C.DAILY_POOL_START * Math.pow(1 - C.MONTHLY_DECAY, monthIndex(t)); }
  function networkPoints(t = Date.now()) { return C.NETWORK_POINTS_BASE * (1 + C.NETWORK_POINTS_GROWTH * monthIndex(t)); }
  /** FIT paid per verified point: pool split pro-rata across all verified points that day (never > 1). */
  function proRataFactor(t = Date.now()) { return Math.min(1, dailyPool(t) / networkPoints(t)); }
  function poolStatus(t = Date.now()) {
    const d = new Date(t), start = new Date(d); start.setHours(0, 0, 0, 0);
    const frac = Math.min(1, (t - start) / 86400000);
    const pool = dailyPool(t);
    const distributed = Math.min(pool, networkPoints(t) * frac * proRataFactor(t)); // SIMULATED network
    return { pool, distributed, remaining: Math.max(0, pool - distributed), factor: proRataFactor(t), month: monthIndex(t), dayFraction: frac };
  }
  function schedule(months = 13) {
    const g = new Date(C.GENESIS); const rows = [];
    for (let i = 0; i < months; i++) {
      const m = new Date(g.getFullYear(), g.getMonth() + i, 1);
      const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const daily = C.DAILY_POOL_START * Math.pow(1 - C.MONTHLY_DECAY, i);
      rows.push({ i, label: m.toLocaleString(undefined, { month: 'short', year: 'numeric' }), daily, monthly: daily * days, current: i === monthIndex() });
    }
    return rows;
  }

  // ---------- activity + streaks ----------
  function stepsOn(u, k) { return u.activities.filter(a => a.day === k).reduce((s, a) => s + (a.steps || 0), 0); }
  function activeOn(u, k) { return stepsOn(u, k) >= C.STREAK_GOAL_STEPS || u.activities.some(a => a.day === k && a.source === 'live'); }
  /** consecutive active days ending at `k` (or ending the day before if `k` itself isn't active yet) */
  function streak(u, k = dayKey()) {
    let cur = activeOn(u, k) ? k : addDays(k, -1), n = 0;
    while (activeOn(u, cur) && n < 3650) { n++; cur = addDays(cur, -1); }
    return n;
  }
  function streakMultiplier(days) { return 1 + Math.min(C.STREAK_BONUS_MAX, C.STREAK_BONUS_PER_DAY * days); }
  function earnedOn(u, k) { return u.ledger.filter(e => e.day === k && e.status !== 'blocked').reduce((s, e) => s + e.amount, 0); }

  function addActivity(u, a) {
    const ts = a.ts || Date.now();
    const act = { id: rid(), ts, day: dayKey(ts), source: a.source, steps: Math.round(a.steps || 0), minutes: a.minutes || 0, note: a.note || '' };
    u.activities.push(act); return act;
  }

  // ---------- rewards engine ----------
  /** Core earn pipeline: base points -> streak bonus -> pro-rata emission -> daily cap -> tier evaluation. */
  function earn(u, { points, source, verified = false, checkinPassed = false, note = '', ts = Date.now(), blocked = false, reasons = [], ref = null, strictCheckin = false }) {
    const k = dayKey(ts);
    const s = streak(u, k), mult = streakMultiplier(s), factor = proRataFactor(ts);
    const gross = points * mult * factor;
    const capLeft = blocked ? gross : Math.max(0, C.DAILY_CAP - earnedOn(u, k));
    const amount = round2(Math.min(gross, capLeft));
    const e = { id: rid(), ts, day: k, source, note, ref, basePoints: round2(points), streakDays: s, streakMult: mult, factor,
      gross: round2(gross), amount, cappedOff: round2(gross - amount), verified, checkinPassed, strictCheckin, reviewed: false, blocked,
      flagReasons: reasons, status: 'pending', reasons: [] };
    evaluate(u, e);
    u.ledger.push(e);
    return e;
  }
  function evaluate(u, e) {
    if (e.status === 'claimed') return e;
    const r = [];
    if (!e.checkinPassed && !e.strictCheckin && u.lastCheckinPassedAt && e.ts >= u.lastCheckinPassedAt - C.CHECKIN_VALID_HOURS * 3600e3) e.checkinPassed = true;
    if (e.blocked) { e.status = 'blocked'; e.reasons = e.flagReasons.length ? e.flagReasons : ['Flagged by verification']; return e; }
    if (e.amount <= 0) { e.status = 'capped'; e.reasons = [`Daily cap of ${C.DAILY_CAP} FIT reached. Activity logged, nothing earned`]; return e; }
    if (!e.verified) r.push('Waiting for verified data (device sync, verified screenshot, or reviewer)');
    if (e.amount > C.TIER_AUTO_MAX && !e.checkinPassed) r.push(e.strictCheckin ? `> ${C.TIER_AUTO_MAX} FIT: this session's check-in pass rate was below 75% (live payouts must pass their own check-ins)` : `> ${C.TIER_AUTO_MAX} FIT needs a passed live check-in`);
    if (e.amount > C.TIER_CHECKIN_MAX && !e.reviewed) r.push(`> ${C.TIER_CHECKIN_MAX} FIT needs manual review`);
    e.reasons = r; e.status = r.length ? 'pending' : 'claimable';
    return e;
  }
  function tierOf(amount) { return amount <= C.TIER_AUTO_MAX ? 'Auto' : amount <= C.TIER_CHECKIN_MAX ? 'Check-in' : 'Review'; }
  function recordCheckin(u, { passed, kind, reactionMs, context, reason }) {
    u.checkins.push({ ts: Date.now(), passed, kind, reactionMs, context, reason });
    if (passed) { u.lastCheckinPassedAt = Date.now(); u.ledger.forEach(e => evaluate(u, e)); }
  }
  function totals(u) {
    const t = { claimed: 0, claimable: 0, pending: 0, blocked: 0, capped: 0 };
    for (const e of u.ledger) {
      if (e.status === 'claimed') t.claimed += e.amount;
      else if (e.status === 'claimable') t.claimable += e.amount;
      else if (e.status === 'pending') t.pending += e.amount;
      else if (e.status === 'blocked') t.blocked += e.gross;
      else if (e.status === 'capped') t.capped += e.cappedOff;
    }
    for (const k in t) t[k] = round2(t[k]);
    return t;
  }
  function claim(u) {
    if (!u.wallet) throw new Error('Add a Solana wallet address first (Rewards → Wallet).');
    const items = u.ledger.filter(e => e.status === 'claimable');
    if (!items.length) throw new Error('Nothing claimable yet.');
    const amount = round2(items.reduce((s, e) => s + e.amount, 0));
    const p = { id: rid(), ts: Date.now(), amount, wallet: u.wallet, mint: C.MINT, sig: 'SIMULATED_' + rid(40), entries: items.map(e => e.id), simulated: true };
    items.forEach(e => { e.status = 'claimed'; e.payoutId = p.id; });
    u.payouts.push(p);
    return p;
  }
  const round2 = n => Math.round(n * 100) / 100;

  // ---------- device binding ----------
  async function deviceFingerprint(provider, d = load()) {
    const parts = [provider, d.browserSalt, navigator.userAgent, screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language, navigator.hardwareConcurrency || 0];
    return provider.slice(0, 3).toUpperCase() + '-' + (await sha256Hex(parts.join('|'))).slice(0, 16);
  }

  // ---------- feed ----------
  function post(d, who, text) { d.feed.push({ ts: Date.now(), who, text }); if (d.feed.length > 200) d.feed.shift(); }

  // ---------- demo seed ----------
  async function seedDemo() {
    const d0 = load();
    if (d0.users['demo@forged.fit']) { tx(d => { d.session = 'demo@forged.fit'; }); return; }
    await signup({ name: 'Demo Lifter', email: 'demo@forged.fit', password: 'demo1234', wallet: '' });
    const fp = await deviceFingerprint('fitbit');
    tx(d => {
      const u = d.users['demo@forged.fit'];
      u.wallet = 'DemoWa11etAddrPLACEHOLDER1111111111111111';
      u.device = { provider: 'fitbit', label: 'Fitbit (mock)', deviceId: fp, boundAt: Date.now() - 9 * 864e5, lastSync: Date.now() - 3600e3 };
      d.devices[fp] = u.email;
      u.deviceHistory.push({ ts: Date.now() - 9 * 864e5, event: 'Bound Fitbit (mock)', deviceId: fp });
      const today = dayKey();
      const plan = [8200, 6100, 11400, 5600, 9800, 7300, 4300]; // 6 days ago .. today
      plan.forEach((steps, i) => {
        const ts = new Date(addDays(today, i - 6) + 'T18:00:00').getTime() - (i === 6 ? 6 * 3600e3 : 0);
        addActivity(u, { ts, source: 'device:fitbit', steps, minutes: Math.round(steps / 95) });
        const passed = i < 6; // demo: a live check-in was passed on each past day
        if (passed) u.checkins.push({ ts: ts - 3600e3, passed: true, kind: 'tap', reactionMs: 900 + Math.round(Math.random() * 1500), context: 'daily check-in (seed)' });
        earn(u, { ts, points: steps / 100 * C.POINTS_PER_100_STEPS, source: 'Fitbit sync (mock)', verified: true, checkinPassed: passed, note: `${steps.toLocaleString()} steps` });
      });
      const liveTs = new Date(addDays(today, -2) + 'T07:30:00').getTime();
      addActivity(u, { ts: liveTs, source: 'live', steps: 3900, minutes: 32, note: 'Sunrise 5K w/ @CoachPlaceholder' });
      u.checkins.push({ ts: liveTs, passed: true, kind: 'tap', reactionMs: 1840, context: 'live session' });
      earn(u, { ts: liveTs, points: 32 * C.LIVE_POINTS_PER_MIN, source: 'Live session (premium)', verified: true, checkinPassed: true, note: 'Sunrise 5K (mock)' });
      // pay out everything older than yesterday as a past (simulated) claim
      const old = u.ledger.filter(e => e.status === 'claimable' && e.day < addDays(today, -1));
      if (old.length) {
        const p = { id: rid(), ts: Date.now() - 864e5, amount: round2(old.reduce((s, e) => s + e.amount, 0)), wallet: u.wallet, mint: C.MINT, sig: 'SIMULATED_' + rid(40), entries: old.map(e => e.id), simulated: true };
        old.forEach(e => { e.status = 'claimed'; e.payoutId = p.id; }); u.payouts.push(p);
      }
      u.crews = ['iron-mile'];
      u.rsvps = [];
      post(d, 'Demo Lifter', 'hit a 6-day streak 🔥');
    });
  }

  return { C, load, save, tx, me, signup, login, logout, setWallet, updateMe, isSolAddress, sha256Hex, rid, dayKey, addDays, startOfWeek,
    dailyPool, proRataFactor, poolStatus, schedule, monthIndex, networkPoints, stepsOn, streak, streakMultiplier, earnedOn,
    addActivity, earn, evaluate, tierOf, recordCheckin, totals, claim, deviceFingerprint, post, seedDemo, round2 };
})();

/** Mock device sync: pulls a random chunk of steps "from the provider", runs a step-rate sanity check, earns. */
FF.syncDevice = function (opts = {}) {
  const C = FF_CONFIG;
  return FF.tx(d => {
    const u = FF.me(d); if (!u) throw new Error('Not logged in');
    if (!u.device) throw new Error('No device bound. Connect one on the Devices page.');
    const steps = opts.steps ?? Math.round(800 + Math.random() * 2700);
    const minutes = opts.minutes ?? Math.round(10 + Math.random() * 30);
    const spm = steps / Math.max(1, minutes);
    const act = FF.addActivity(u, { source: 'device:' + u.device.provider, steps, minutes, note: `sync from ${u.device.label}` });
    const impossible = spm > C.MAX_STEPS_PER_MIN;
    const e = FF.earn(u, { points: steps / 100 * C.POINTS_PER_100_STEPS, source: `${u.device.label} sync`, verified: !impossible, note: `${steps.toLocaleString()} steps / ${minutes} min`, ref: act.id,
      blocked: impossible, reasons: impossible ? [`Impossible step rate: ${Math.round(spm)} steps/min (> ${C.MAX_STEPS_PER_MIN})`] : [] });
    u.device.lastSync = Date.now();
    FF.post(d, u.name, `synced ${steps.toLocaleString()} steps from ${u.device.label}`);
    return { act, e };
  });
};
/** Self-reported steps: logged, but never verified on their own. */
FF.logManual = function (steps, minutes) {
  const C = FF_CONFIG;
  return FF.tx(d => {
    const u = FF.me(d);
    steps = Math.round(+steps); minutes = Math.round(+minutes) || 1;
    if (!(steps > 0)) throw new Error('Enter a step count.');
    const spm = steps / minutes;
    const act = FF.addActivity(u, { source: 'manual', steps, minutes, note: 'self-reported' });
    const impossible = spm > C.MAX_STEPS_PER_MIN;
    return FF.earn(u, { points: steps / 100 * C.POINTS_PER_100_STEPS, source: 'Manual log (self-reported)', verified: false, note: `${steps.toLocaleString()} steps / ${minutes} min`, ref: act.id,
      blocked: impossible, reasons: impossible ? [`Impossible step rate: ${Math.round(spm)} steps/min`] : [] });
  });
};
