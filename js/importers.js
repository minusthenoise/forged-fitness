/* Forged Fitness health-data importers. Everything runs in the browser; nothing is uploaded.
   Each parser returns { days: {YYYY-MM-DD: {steps, distanceM, distanceRaw?, exerciseMin, sessions}}, files: [...] } */
(function (g) {
  const S = g.FFSHealth;
  const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const pad = n => String(n).padStart(2, '0');
  const blank = () => ({ steps: 0, distanceM: 0, exerciseMin: 0, sessions: 0 });
  const dayOf = (days, k) => days[k] || (days[k] = blank());
  // header-keyed CSV (no Samsung metadata line)
  function csvObjects(text) { const r = S.parseCSV(text.replace(/^\uFEFF/, '')); if (r.length < 2) return []; const h = r[0].map(x => x.trim());
    return r.slice(1).map(row => Object.fromEntries(h.map((k, i) => [k, (row[i] || '').trim()]))); }
  // "10/20/26 08:00:00" or ISO -> YYYY-MM-DD as written
  function dayKey(s) { s = String(s).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[1])}-${pad(m[2])}`;
    const t = new Date(s); return isNaN(t) ? null : `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
  const hms = s => { const p = String(s).split(':').map(num); return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p.length === 2 ? p[0] + p[1] / 60 : num(s); };
  async function expand(files, want) { const out = [];
    for (const f of files) { if (/\.zip$/i.test(f.name)) out.push(...await S.unzip(await f.arrayBuffer(), want));
      else out.push({ name: f.name, path: f.name, text: await f.text() }); }
    return out; }

  // ---------- Apple Health: export.xml ----------
  const attr = (tag, a) => { const m = tag.match(new RegExp(`\\b${a}="([^"]*)"`)); return m ? m[1] : ''; };
  function appleFromText(text) {
    const per = {}; // day -> source -> {steps, dist}
    const days = {}; let m;
    const re = /<(Record|Workout)\b[^>]*>/g;
    while ((m = re.exec(text))) { const tag = m[0], type = m[1] === 'Workout' ? 'W' : attr(tag, 'type');
      if (type === 'W') { const k = dayKey(attr(tag, 'startDate')); if (!k) continue; const d = dayOf(days, k);
        const dur = num(attr(tag, 'duration')), u = attr(tag, 'durationUnit') || 'min';
        d.exerciseMin += Math.round(u === 'min' ? dur : u === 's' ? dur / 60 : u === 'hr' ? dur * 60 : dur); d.sessions++; continue; }
      const isSteps = type === 'HKQuantityTypeIdentifierStepCount', isDist = type === 'HKQuantityTypeIdentifierDistanceWalkingRunning';
      if (!isSteps && !isDist) continue;
      const k = dayKey(attr(tag, 'startDate')); if (!k) continue; const src = attr(tag, 'sourceName') || '?';
      const s = ((per[k] = per[k] || {})[src] = per[k][src] || { steps: 0, dist: 0 }); const v = num(attr(tag, 'value'));
      if (isSteps) s.steps += v; else { const u = attr(tag, 'unit'); s.dist += u === 'km' ? v * 1000 : u === 'mi' ? v * 1609.344 : u === 'm' ? v : v * 1000; } }
    // iPhone + Watch both log the same walking: take the single source with the most steps that day (no double count)
    for (const [k, srcs] of Object.entries(per)) { const best = Object.entries(srcs).sort((a, b) => b[1].steps - a[1].steps || b[1].dist - a[1].dist)[0];
      const d = dayOf(days, k); d.steps = Math.round(best[1].steps); d.distanceM = Math.round(best[1].dist); d.source = best[0]; }
    return days;
  }
  async function apple(files) {
    const all = await expand(files, n => /(^|\/)export\.xml$/i.test(n)), days = {};
    if (!all.length) throw new Error('No export.xml found. Upload export.zip from the Health app.');
    for (const f of all) Object.assign(days, appleFromText(f.text));
    return { days, files: all.map(f => f.name) };
  }

  // ---------- Google Fit (Takeout) ----------
  async function googlefit(files) {
    const all = await expand(files, n => /Daily activity metrics.*\.csv$/i.test(n) || /^\d{4}-\d{2}-\d{2}\.csv$/.test(n.split('/').pop()));
    const days = {}, used = [], perDay = {};
    for (const f of all) { const rows = csvObjects(f.text); if (!rows.length) continue; used.push(f.name);
      const fileDay = (f.name.match(/^(\d{4}-\d{2}-\d{2})\.csv$/) || [])[1];
      for (const r of rows) { const k = fileDay || dayKey(r.Date); if (!k) continue;
        const t = fileDay ? (perDay[k] = perDay[k] || blank()) : dayOf(days, k);
        t.steps += Math.round(num(r['Step count'])); t.distanceM += Math.round(num(r['Distance (m)'])); t.exerciseMin += Math.round(num(r['Move Minutes count'])); } }
    for (const [k, v] of Object.entries(perDay)) if (!days[k]) days[k] = v; // summary file wins when both present
    if (!used.length) throw new Error('No Google Fit "Daily activity metrics" CSV found.');
    return { days, files: used };
  }

  // ---------- Fitbit (Google Takeout / Fitbit data export) ----------
  async function fitbit(files) {
    const all = await expand(files, n => /(steps|distance|exercise)[-_][^/]*\.(json|csv)$/i.test(n.split('/').pop()));
    const days = {}, used = [];
    for (const f of all) { const n = f.name.toLowerCase();
      if (n.endsWith('.json')) { let arr; try { arr = JSON.parse(f.text); } catch { continue; } if (!Array.isArray(arr)) continue; used.push(f.name);
        for (const r of arr) {
          if (n.startsWith('steps')) { const k = dayKey(r.dateTime); if (k) dayOf(days, k).steps += Math.round(num(r.value)); }
          else if (n.startsWith('distance')) { const k = dayKey(r.dateTime); if (k) dayOf(days, k).distanceM += num(r.value) / 100; } // Fitbit distance JSON is centimeters
          else if (n.startsWith('exercise')) { const k = dayKey(r.startTime); if (!k) continue; const d = dayOf(days, k); d.exerciseMin += Math.round(num(r.duration) / 60000); d.sessions++; } } }
      else if (n.startsWith('steps')) { const rows = csvObjects(f.text); if (!rows.length) continue; used.push(f.name);
        const keys = Object.keys(rows[0]), tc = keys.find(c => /^(timestamp|date ?time|date)$/i.test(c)), sc = keys.find(c => /^steps?$/i.test(c));
        if (!tc || !sc) continue;
        for (const r of rows) { const k = dayKey(r[tc]); if (k) dayOf(days, k).steps += Math.round(num(r[sc])); } } }
    for (const d of Object.values(days)) d.distanceM = Math.round(d.distanceM);
    if (!used.length) throw new Error('No Fitbit steps/distance/exercise JSON or steps CSV found.');
    return { days, files: used };
  }

  // ---------- Garmin Connect activities CSV ----------
  async function garmin(files) {
    if (files.some(f => /\.fit$/i.test(f.name))) throw new Error('.fit files are not supported yet. Export the Activities CSV from Garmin Connect instead.');
    const all = await expand(files, n => /\.csv$/i.test(n)), days = {}, used = [];
    for (const f of all) { const rows = csvObjects(f.text); if (!rows.length || !('Activity Type' in rows[0]) || !('Date' in rows[0])) continue; used.push(f.name);
      for (const r of rows) { const k = dayKey(r.Date); if (!k) continue; const d = dayOf(days, k);
        d.sessions++; d.exerciseMin += Math.round(hms(r.Time || r['Elapsed Time'] || 0));
        d.steps += Math.round(num(r.Steps)); d.distanceRaw = (d.distanceRaw || 0) + num(r.Distance); } }
    if (!used.length) throw new Error('No Garmin Connect activities CSV found (needs "Activity Type" and "Date" columns).');
    return { days, files: used };
  }

  async function samsung(files) { return S.readFiles(files); }

  // ---------- phone pedometer (DeviceMotion, page must stay open) ----------
  function Pedometer(onStep) {
    let ema = 9.81, avgDev = 0.6, above = false, last = 0, on = false;
    const h = ev => { const a = ev.accelerationIncludingGravity; if (!a || a.x == null) return;
      const mag = Math.hypot(a.x, a.y, a.z), now = ev.timeStamp || performance.now();
      ema += 0.02 * (mag - ema); const dev = mag - ema; avgDev += 0.02 * (Math.abs(dev) - avgDev);
      const thr = Math.max(1.0, avgDev * 1.3);
      if (!above && dev > thr) { above = true; if (now - last > 280 && now - last < 2500 || last === 0) onStep(); last = now; }
      else if (above && dev < thr * 0.3) above = false; };
    return {
      async start() { if (typeof DeviceMotionEvent === 'undefined') throw new Error('This browser has no motion sensor access. Open the page on a phone.');
        if (typeof DeviceMotionEvent.requestPermission === 'function') { const p = await DeviceMotionEvent.requestPermission(); if (p !== 'granted') throw new Error('Motion permission was denied. Allow Motion & Orientation access and try again.'); }
        window.addEventListener('devicemotion', h); on = true; },
      stop() { window.removeEventListener('devicemotion', h); on = false; }, get on() { return on; } };
  }
  g.FFImport = { apple, appleFromText, googlefit, fitbit, garmin, samsung, Pedometer, dayKey };
})(typeof window !== 'undefined' ? window : globalThis);
