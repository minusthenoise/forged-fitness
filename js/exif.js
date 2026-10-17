/* Tiny, dependency-free metadata reader for the Forged Fitness draft.
 * Supports: JPEG (APP1 Exif -> IFD0 + Exif SubIFD), PNG (eXIf chunk, tEXt/iTXt incl. XMP).
 * Returns { format, tags: {...}, notes: [...] }. Never throws (bad files -> empty tags).
 * Not a full EXIF implementation, just enough for timestamp / software / device checks.
 */
(function (root) {
  const IFD0 = { 0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x0132: 'DateTime', 0x0112: 'Orientation' };
  const EXIF = { 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension' };

  function parseTIFF(dv, start, tags) {
    const le = dv.getUint16(start) === 0x4949;
    const u16 = o => dv.getUint16(start + o, le);
    const u32 = o => dv.getUint32(start + o, le);
    if (u16(2) !== 42) return tags;
    const seen = new Set();
    const readIFD = (ifdOff, map) => {
      if (seen.has(ifdOff) || start + ifdOff + 2 > dv.byteLength) return;
      seen.add(ifdOff);
      const n = u16(ifdOff);
      for (let i = 0; i < n; i++) {
        const e = ifdOff + 2 + i * 12;
        if (start + e + 12 > dv.byteLength) break;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        if (tag === 0x8769) { readIFD(u32(e + 8), EXIF); continue; } // Exif SubIFD pointer
        const name = map[tag];
        if (!name) continue;
        if (type === 2) { // ASCII
          const valOff = count > 4 ? u32(e + 8) : e + 8;
          let s = '';
          for (let j = 0; j < count && start + valOff + j < dv.byteLength; j++) {
            const c = dv.getUint8(start + valOff + j); if (!c) break; s += String.fromCharCode(c);
          }
          tags[name] = s.trim();
        } else if (type === 3) tags[name] = u16(e + 8);
        else if (type === 4) tags[name] = u32(e + 8);
      }
    };
    readIFD(u32(4), IFD0);
    return tags;
  }

  function parseJPEG(dv, out) {
    let off = 2;
    while (off + 4 <= dv.byteLength) {
      const marker = dv.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) break;
      const len = dv.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= dv.byteLength && dv.getUint32(off + 4) === 0x45786966 && dv.getUint16(off + 8) === 0) {
        parseTIFF(dv, off + 10, out.tags); out.notes.push('EXIF block found');
      }
      if (marker === 0xffda) break; // start of scan, no more metadata
      off += 2 + len;
    }
  }

  function xmpDates(xml, tags) {
    const pick = re => { const m = xml.match(re); return m ? (m[1] || m[2]) : null; };
    const d = pick(/(?:exif:DateTimeOriginal|xmp:CreateDate|photoshop:DateCreated)(?:="([^"]+)"|>([^<]+)<)/);
    if (d) tags.XMPCreateDate = d;
    const tool = pick(/xmp:CreatorTool(?:="([^"]+)"|>([^<]+)<)/); if (tool) tags.Software = tags.Software || tool;
    const uc = pick(/exif:UserComment[\s\S]*?<rdf:li[^>]*>([^<]+)</); if (uc) tags.UserComment = uc;
  }

  function parsePNG(dv, out) {
    let off = 8; const td = new TextDecoder('latin1');
    while (off + 12 <= dv.byteLength) {
      const len = dv.getUint32(off);
      const type = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + off + 4, 4));
      const dataStart = off + 8;
      if (dataStart + len > dv.byteLength) break;
      if (type === 'eXIf') { parseTIFF(dv, dataStart, out.tags); out.notes.push('PNG eXIf chunk found'); }
      if (type === 'tEXt' || type === 'iTXt') {
        const raw = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + dataStart, len));
        const key = raw.split('\0')[0];
        const val = raw.slice(key.length + 1).replace(/^[\0\x01]*/, '').replace(/\0/g, ' ');
        if (/^XML:com\.adobe\.xmp$/.test(key)) { xmpDates(val, out.tags); out.notes.push('XMP packet found'); }
        else if (/creation time|date:create/i.test(key)) out.tags.PNGCreationTime = val.trim();
        else if (/^software$/i.test(key)) out.tags.Software = val.trim();
      }
      if (type === 'IEND') break;
      off = dataStart + len + 4; // + CRC
    }
  }

  function read(buffer) {
    const out = { format: 'unknown', tags: {}, notes: [] };
    try {
      const dv = new DataView(buffer);
      if (dv.byteLength > 3 && dv.getUint16(0) === 0xffd8) { out.format = 'jpeg'; parseJPEG(dv, out); }
      else if (dv.byteLength > 8 && dv.getUint32(0) === 0x89504e47) { out.format = 'png'; parsePNG(dv, out); }
      else out.notes.push('Unsupported format for metadata (HEIC/WebP not parsed in draft)');
    } catch (e) { out.notes.push('Metadata parse error: ' + e.message); }
    return out;
  }

  /** "YYYY:MM:DD HH:MM:SS" (EXIF local time, optional offset) or ISO -> Date|null */
  function toDate(s, offset) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${offset || ''}`;
    const d = new Date(iso); return isNaN(d) ? null : d;
  }

  /** Best capture timestamp from parsed tags. */
  function captureTime(tags) {
    if (tags.DateTimeOriginal) return { date: toDate(tags.DateTimeOriginal, tags.OffsetTimeOriginal), field: 'DateTimeOriginal' };
    if (tags.DateTimeDigitized) return { date: toDate(tags.DateTimeDigitized), field: 'DateTimeDigitized' };
    if (tags.XMPCreateDate) return { date: toDate(tags.XMPCreateDate), field: 'XMP CreateDate' };
    if (tags.PNGCreationTime) return { date: toDate(tags.PNGCreationTime), field: 'PNG Creation Time' };
    if (tags.DateTime) return { date: toDate(tags.DateTime), field: 'DateTime (modify date)' };
    return { date: null, field: null };
  }

  const api = { read, toDate, captureTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FFExif = api;
})(typeof window !== 'undefined' ? window : globalThis);
