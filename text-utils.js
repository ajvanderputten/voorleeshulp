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

  // ---- Tekst uit tekstherkenning (OCR) netjes maken ----
  // Woorden en regels met lage zekerheid (meestal plaatjes, pictogrammen of
  // schaduwen) vallen weg en losse leestekens worden opgeruimd.
  function keepOcrWord(w){
    const t = ((w && w.text) || '').trim();
    if (!t) return false;
    const letters = (t.match(/[\p{L}\p{N}]/gu) || []).length;
    if (letters === 0) return false;
    if (letters < t.length * 0.5) return false;
    if (letters === 1 && t.length > 1 && w.confidence < 80) return false;
    return w.confidence >= 55;
  }

  function cleanOcrLine(line){
    const words = (line.words || []).filter(keepOcrWord).map(w => w.text.trim());
    if (!words.length) return '';
    const joined = words.join(' ');
    const letters = (joined.match(/\p{L}/gu) || []).length;
    if (letters < 3 && line.confidence < 80) return '';
    return joined
      .replace(/[|\\_~^`<>{}\[\]=*#@§©®™°•·¬]+/g, ' ')
      .replace(/([.,;:!?\-–])\1+/g, '$1')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^[ \t]*[.,;:]+[ \t]*/, '')
      .trim();
  }

  // Plakt de afgedrukte regels van één alinea weer aan elkaar, zodat een zin
  // die over twee regels loopt niet als twee zinnen wordt voorgelezen.
  // Een afgebroken woord ("konijn-" + "tje") wordt weer één woord;
  // "Noord-" + "Holland" houdt het koppelteken.
  // Een korte regel zonder leesteken gevolgd door een hoofdletter is meestal
  // een titel: die blijft een eigen regel.
  function joinOcrLines(lines){
    const ls = lines.map(l => l.trim()).filter(Boolean);
    if (!ls.length) return '';
    const longest = Math.max(...ls.map(l => l.length));
    let out = ls[0];
    for (let i = 1; i < ls.length; i++) {
      const prev = ls[i - 1], next = ls[i];
      if (/\p{L}[-‐­]$/u.test(prev) && /^\p{Ll}/u.test(next)) {
        out = out.replace(/[-‐­]$/u, '') + next;
      } else if (/\p{L}-$/u.test(prev) && /^\p{Lu}/u.test(next)) {
        out += next;
      } else if (!/[.!?:;,"'”’)]$/.test(prev) && /^[\p{Lu}\p{N}]/u.test(next) && prev.length < longest * 0.6) {
        out += '\n' + next;
      } else {
        out += ' ' + next;
      }
    }
    return out;
  }

  // Zet het resultaat van Tesseract om in voorleesbare tekst: één regel per alinea.
  function ocrToText(data){
    const paragraphs = (data && data.paragraphs && data.paragraphs.length)
      ? data.paragraphs
      : [{ lines: (data && data.lines) || [] }];
    return paragraphs
      .map(p => joinOcrLines((p.lines || []).map(cleanOcrLine)))
      .filter(Boolean)
      .join('\n')
      .replace(/^[ \t]*[-–][ \t]+/gm, '– ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  const api = { detectLang, splitSentences, isNatural, joinOcrLines, ocrToText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
