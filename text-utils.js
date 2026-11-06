// Pure hulpfuncties van Voorleeshulp (zonder DOM), zodat ze getest kunnen worden.
(function(root){
  // ---- Taal van de tekst: Nederlands of Engels, geraden aan veelvoorkomende woorden ----
  const NL_WORDS = new Set(['de','het','een','en','van','ik','je','jij','dat','die','is','zijn','was','waren','niet','op','te','met','voor','maar','ook','als','er','aan','om','bij','nog','naar','uit','hij','zij','ze','wij','we','dit','wat','hun','haar','zo','dan','kon','ging','werd','heeft','hebben','had','konden','veel','alle','geen','nu','toen','weer','over','door']);
  const EN_WORDS = new Set(['the','a','an','and','of','to','in','is','are','was','were','it','he','she','they','we','you','i','that','this','with','for','on','as','at','by','not','but','his','her','their','have','has','had','be','been','from','or','one','all','there','what','when','so','if','would','could','said','then','out','up','into','who','will']);

  function detectLang(text){
    const words = (text || '').toLowerCase().match(/[a-zà-ÿ']+/g) || [];
    let nl = 0, en = 0;
    words.forEach(w => { if (NL_WORDS.has(w)) nl++; if (EN_WORDS.has(w)) en++; });
    return (en >= 2 && en > nl) ? 'en' : 'nl';
  }

  // ---- Zinnen splitsen ----
  // Afkortingen waarna een punt geen zinseinde is. Afkortingen die ook een zin kunnen afsluiten (enz., etc., e.d.) staan er bewust niet in: daar beslist de hoofdletter erna.
  const ABBREVIATIONS = new Set(['dhr','mevr','mw','mr','mrs','ms','dr','drs','ir','ing','prof','jr','sr','st','bijv','bv','nr','blz','ca','vs','resp','tel','max','min','evt','vgl','zgn','incl','excl','o.a','d.w.z','m.b.t','a.u.b','n.a.v','t.o.v','b.v','i.v.m','m.m.v','z.g','t.a.v','a.s','c.q']);

  function isAbbreviation(token){
    const t = token.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '');
    if (!t) return false;
    if (ABBREVIATIONS.has(t)) return true;
    if (/^\p{L}$/u.test(t)) return true;             // initiaal: "J. Jansen"
    if (/^(\p{L}\.)+\p{L}$/u.test(t)) return true;   // "o.a", "d.w.z", "U.S"
    return false;
  }

  function splitParagraph(par){
    const out = [];
    const re = /[.!?]+["'”’)\]»]*(?=\s)/g;
    let start = 0, m;
    while ((m = re.exec(par)) !== null) {
      const end = m.index + m[0].length;
      if (m[0][0] === '.' && !/[!?]/.test(m[0])) {
        const before = par.slice(start, m.index).match(/\S+$/);
        const next = par.slice(end).match(/\S/);
        const ellipsis = m[0].replace(/["'”’)\]»]/g, '').length > 1;
        // Geen zinseinde bij een afkorting, of als het volgende woord met een kleine letter begint.
        if (!ellipsis && before && isAbbreviation(before[0])) continue;
        if (next && /\p{Ll}/u.test(next[0])) continue;
      }
      out.push(par.slice(start, end));
      start = end;
    }
    out.push(par.slice(start));
    return out;
  }

  function splitSentences(text){
    const result = [];
    String(text || '').split(/\n+/).forEach(par => {
      splitParagraph(par).forEach(s => { const t = s.trim(); if (t) result.push(t); });
    });
    return result;
  }

  // ---- Natuurlijke stemmen ----
  // "Natural"/"Neural" (Edge), "Premium"/"Enhanced" (iPhone/Mac), Siri en Google-stemmen.
  function isNatural(voice){
    return /natural|neural|premium|enhanced|siri|google|online/i.test((voice && voice.name) || '');
  }

  const api = { detectLang, splitSentences, isNatural };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
