/* Turns notebook-style text into medication entries.
   "Metformin 500 mg 8:00 20:00"      -> {name:'Metformin', dose:'500 mg', times:['08:00','20:00']}
   "Lisinopril 10mg at 9am and 9pm"   -> times 09:00, 21:00
   "Aspirin 75 mg morning"            -> times 08:00
   "Omega 3 twice daily"              -> times 08:00, 20:00                                      */
(function (root) {
  const pad = n => String(n).padStart(2, '0');

  const WORD_TIMES = {
    morning: '08:00', breakfast: '08:00', noon: '13:00', lunch: '13:00',
    afternoon: '14:00', dinner: '18:00', evening: '19:00', night: '21:00', bedtime: '21:00'
  };

  function to24(h, m, ap) {
    h = +h; m = +(m || 0);
    if (ap) {
      ap = ap.toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    }
    if (h > 23 || m > 59) return null;
    return pad(h) + ':' + pad(m);
  }

  function parseLine(line) {
    let s = line.trim().replace(/^([-*•]\s+|\d+[.)]\s+)/, '');
    if (!s) return null;

    // dose
    let dose = '';
    const doseRe = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g|ml|iu|units?|tablets?|tabs?|pills?|capsules?|caps?|drops?)\b/i;
    const dm = s.match(doseRe);
    if (dm) { dose = (dm[1] + ' ' + dm[2]).replace(/\s+/, ' '); s = s.replace(dm[0], ' '); }

    // clock times
    const times = [];
    const timeRe = /\b(\d{1,2}):(\d{2})\s*(am|pm)?(?![a-z])|\b(\d{1,2})\s*(am|pm)\b/gi;
    s = s.replace(timeRe, (all, h1, m1, ap1, h2, ap2) => {
      const t = h1 !== undefined ? to24(h1, m1, ap1) : to24(h2, 0, ap2);
      if (t) times.push(t);
      return ' ';
    });

    // words like "morning", "evening"
    for (const w in WORD_TIMES) {
      const re = new RegExp('\\b' + w + '\\b', 'gi');
      if (re.test(s)) { times.push(WORD_TIMES[w]); s = s.replace(re, ' '); }
    }

    // frequency phrases
    const freq = [
      [/\b(three times|thrice|3\s*x|3 times)\b( a day| daily)?/i, ['08:00', '14:00', '20:00']],
      [/\b(twice|two times|2\s*x|2 times)\b( a day| daily)?/i, ['08:00', '20:00']],
      [/\b(once|one time|1\s*x)\b( a day| daily)?/i, ['08:00']]
    ];
    if (!times.length) {
      for (const [re, ts] of freq) {
        if (re.test(s)) { times.push(...ts); break; }
      }
    }
    for (const [re] of freq) s = s.replace(re, ' ');

    // what is left is the name
    let name = s
      .replace(/\b(at|and|daily|every day|a day|per day|after|before|with|food|meals?|the|take|tablet|tablets)\b/gi, ' ')
      .replace(/[,;:@\-–—/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) return null;
    name = name.charAt(0).toUpperCase() + name.slice(1);

    let guessed = false;
    let uniq = Array.from(new Set(times)).sort();
    if (!uniq.length) { uniq = ['08:00']; guessed = true; }
    return { name, dose, times: uniq, guessed };
  }

  function parseNotebook(text) {
    return String(text || '').split(/\r?\n/).map(parseLine).filter(Boolean);
  }

  const api = { parseNotebook, parseLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PillParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
