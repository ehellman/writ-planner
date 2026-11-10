// ---- Auctionator SavedVariables decoder (Lua string literal -> CBOR -> JS) ----
const AucDB = (() => {
  const EPOCH_MS = Date.UTC(2020, 0, 1); // Auctionator day 0

  // Find `NAME = {` in the file and return the byte index just after the opening brace.
  function findTable(b, name) {
    const needle = new TextEncoder().encode(name + " = {");
    outer: for (let i = 0; i <= b.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle[j]) continue outer;
      if (i > 0 && b[i - 1] !== 10 && b[i - 1] !== 13) continue; // must start a line
      return i + needle.length;
    }
    return -1;
  }

  // Parse a Lua double-quoted string literal starting at b[p] === '"'. Returns [Uint8Array, nextPos].
  function luaString(b, p) {
    if (b[p] !== 34) throw new Error("expected string at " + p);
    p++;
    const out = new Uint8Array(b.length - p); let n = 0;
    const esc = { 110: 10, 114: 13, 116: 9, 92: 92, 34: 34, 39: 39, 97: 7, 98: 8, 102: 12, 118: 11 };
    while (true) {
      const c = b[p];
      if (c === undefined) throw new Error("unterminated string");
      if (c === 34) return [out.subarray(0, n), p + 1];
      if (c === 92) {
        const e = b[p + 1];
        if (e >= 48 && e <= 57) { // \ddd decimal
          let v = 0, k = 0;
          while (k < 3 && b[p + 1 + k] >= 48 && b[p + 1 + k] <= 57) { v = v * 10 + (b[p + 1 + k] - 48); k++; }
          out[n++] = v; p += 1 + k; continue;
        }
        if (e === 10 || e === 13) { // escaped newline
          out[n++] = 10; p += 2; if (e === 13 && b[p] === 10) p++; continue;
        }
        if (!(e in esc)) throw new Error("unknown escape \\" + String.fromCharCode(e) + " at " + p);
        out[n++] = esc[e]; p += 2; continue;
      }
      out[n++] = c; p++;
    }
  }

  // Minimal CBOR decoder (what LibCBOR emits: ints, strings, arrays, maps, floats, simple values).
  function cbor(b) {
    let p = 0;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const td = new TextDecoder();
    function len(ai) {
      if (ai < 24) return ai;
      if (ai === 24) return b[p++];
      if (ai === 25) { const v = dv.getUint16(p); p += 2; return v; }
      if (ai === 26) { const v = dv.getUint32(p); p += 4; return v; }
      if (ai === 27) { const v = Number(dv.getBigUint64(p)); p += 8; return v; }
      throw new Error("indefinite length not supported");
    }
    function item() {
      const ib = b[p++], mt = ib >> 5, ai = ib & 31;
      if (mt === 7) {
        if (ai === 20) return false; if (ai === 21) return true; if (ai === 22 || ai === 23) return null;
        if (ai === 25) { const h = dv.getUint16(p); p += 2; const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
          return s * (e === 0 ? f * 2 ** -24 : e === 31 ? (f ? NaN : Infinity) : (1 + f / 1024) * 2 ** (e - 15)); }
        if (ai === 26) { const v = dv.getFloat32(p); p += 4; return v; }
        if (ai === 27) { const v = dv.getFloat64(p); p += 8; return v; }
        return null;
      }
      const v = len(ai);
      switch (mt) {
        case 0: return v;
        case 1: return -1 - v;
        case 2: case 3: { const s = td.decode(b.subarray(p, p + v)); p += v; return s; }
        case 4: { const a = []; for (let i = 0; i < v; i++) a.push(item()); return a; }
        case 5: { const o = {}; for (let i = 0; i < v; i++) { const k = item(); o[k] = item(); } return o; }
        case 6: return item(); // tag: ignore
      }
    }
    const r = item();
    if (p !== b.length) throw new Error(`CBOR: ${b.length - p} trailing bytes`);
    return r;
  }

  // Returns { version, realms: { realmKey: { itemKey: {m, h, l, a} } } }
  function parse(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let p = findTable(b, "AUCTIONATOR_PRICE_DATABASE");
    if (p < 0) throw new Error("AUCTIONATOR_PRICE_DATABASE not found — is this Auctionator.lua?");
    const realms = {}; let version = null;
    const keyRe = /^\s*\["([^"]+)"\]\s*=\s*/;
    const td = new TextDecoder();
    while (p < b.length) {
      // read one line-ish chunk to find the key
      let e = p; while (e < b.length && b[e] !== 10) e++;
      const line = td.decode(b.subarray(p, Math.min(e, p + 200)));
      if (/^\s*}/.test(line)) break;
      const m = line.match(keyRe);
      if (m) {
        const valStart = p + new TextEncoder().encode(m[0]).length;
        if (b[valStart] === 34) {
          const [s, np] = luaString(b, valStart);
          realms[m[1]] = cbor(s);
          p = np; while (p < b.length && b[p] !== 10) p++; p++; continue;
        } else if (m[1] === "__dbversion") {
          version = parseInt(line.slice(m[0].length), 10);
        }
      }
      p = e + 1;
    }
    return { version, realms };
  }

  const dayToDate = d => new Date(EPOCH_MS + d * 86400000);
  const todayDay = () => Math.floor((Date.now() - EPOCH_MS) / 86400000);

  // Normalised view of one item entry
  function entry(realmDb, id) {
    const e = realmDb[String(id)];
    if (!e) return null;
    const days = Object.keys(e.h || {}).map(Number).sort((a, b) => a - b);
    const lastDay = days.length ? days[days.length - 1] : null;
    return {
      cur: e.m ?? null,
      lastDay,
      qty: lastDay != null && e.a ? (e.a[lastDay] ?? null) : null,
      days,
      high: e.h || {},
      low: e.l || {},
      avail: e.a || {},
    };
  }

  return { parse, entry, dayToDate, todayDay, EPOCH_MS };
})();
if (typeof module !== "undefined") module.exports = AucDB;
