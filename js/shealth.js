/* Samsung Health "Download personal data" export parser. Runs fully in the browser.
   Handles a single CSV or the export ZIP (stored/deflate entries via DecompressionStream). */
(function (g) {
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c; }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x !== ''));
  }
  // Samsung CSVs: line 1 = "com.samsung.shealth.<type>,<id>,<ver>", line 2 = header (columns may carry a long prefix)
  function table(text) {
    const rows = parseCSV(text.replace(/^\uFEFF/, '')); if (rows.length < 2) return null;
    const kind = rows[0][0].trim();
    const hdr = rows[1].map(h => h.trim().split('.').pop());
    return { kind, rows: rows.slice(2).map(r => Object.fromEntries(hdr.map((h, i) => [h, (r[i] || '').trim()]))) };
  }
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const toTs = v => { if (!v) return NaN; if (/^\d{11,}$/.test(v)) return +v; return new Date(v.replace(' ', 'T')).getTime(); };
  const dk = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const utcDk = t => new Date(t).toISOString().slice(0, 10); // day_time is UTC midnight

  /** returns { days: {YYYY-MM-DD: {steps, distanceM, exerciseMin, sessions}}, files: [names used] } */
  function extract(tables) {
    const days = {}, used = [], stepDaily = {}, stepRaw = {};
    const day = k => days[k] || (days[k] = { steps: 0, distanceM: 0, exerciseMin: 0, sessions: 0 });
    for (const { name, t } of tables) {
      if (!t) continue;
      if (/step_daily_trend/.test(t.kind)) { used.push(name);
        for (const r of t.rows) { const ts = num(r.day_time); if (!ts) continue; const k = utcDk(ts), src = r.source_type;
          // source_type -2 is Samsung's merged total across devices; prefer it, else take the max single source
          const cur = stepDaily[k], v = { steps: num(r.count), dist: num(r.distance), merged: src === '-2' };
          if (!cur || (v.merged && !cur.merged) || (v.merged === cur.merged && v.steps > cur.steps)) stepDaily[k] = v; } }
      else if (/step_count/.test(t.kind) && !/daily/.test(t.kind)) { used.push(name);
        for (const r of t.rows) { const ts = toTs(r.start_time); if (!isFinite(ts)) continue; const k = dk(ts);
          const s = stepRaw[k] || (stepRaw[k] = { steps: 0, dist: 0 }); s.steps += num(r.count); s.dist += num(r.distance); } }
      else if (/shealth\.exercise$/.test(t.kind)) { used.push(name);
        for (const r of t.rows) { const ts = toTs(r.start_time); if (!isFinite(ts)) continue; const d = day(dk(ts));
          d.exerciseMin += Math.round(num(r.duration) / 60000); d.sessions++; } }
    }
    const src = Object.keys(stepDaily).length ? stepDaily : stepRaw;
    for (const [k, v] of Object.entries(src)) { const d = day(k); d.steps = Math.round(v.steps); d.distanceM = Math.round(v.dist); }
    return { days, files: used };
  }

  async function unzip(buf, want = n => /\.csv$/i.test(n) && /step_daily_trend|step_count|shealth\.exercise\./.test(n)) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), out = []; let eocd = -1;
    for (let i = u8.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a valid ZIP file.');
    let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
    for (let e = 0; e < n; e++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
        xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      if (!want(name)) continue;
      if (dv.getUint32(eocd + 16, true) === 0xffffffff || csize === 0xffffffff) throw new Error('ZIP64 archive (very large export). Unzip it and upload the files inside instead.');
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(start, start + csize);
      let text;
      if (method === 0) text = new TextDecoder().decode(data);
      else if (method === 8) text = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      else continue;
      out.push({ name: name.split('/').pop(), path: name, text });
    }
    return out;
  }

  async function readFiles(files) {
    const tables = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) for (const e of await unzip(await f.arrayBuffer())) tables.push({ name: e.name, t: table(e.text) });
      else tables.push({ name: f.name, t: table(await f.text()) });
    }
    return extract(tables);
  }
  g.FFSHealth = { parseCSV, table, extract, unzip, readFiles };
})(typeof window !== 'undefined' ? window : globalThis);
