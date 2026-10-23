/* PillPulse — medication reminders from a paper notebook + camera pulse. No server, data stays in the browser. */
'use strict';

const KEY = 'pillpulse_v1';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- state ---------- */
function blank() {
  return { patient: { name: '', caregiver: '' }, meds: [], log: {}, pulses: [], settings: { large: false, speak: false } };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.meds)) return Object.assign(blank(), s, { settings: Object.assign(blank().settings, s.settings) });
  } catch (e) {}
  return blank();
}
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

/* ---------- dates & schedule ---------- */
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const atTime = (day, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const x = new Date(day); x.setHours(h, m, 0, 0); return x; };
const fmtTime = hhmm => hhmm;

function scheduleFor(day) {
  const dk = dayKey(day), items = [];
  for (const med of state.meds) {
    if (med.created && dk < med.created) continue;
    for (const t of med.times) items.push({ med, time: t, key: dk + '|' + med.id + '|' + t, dt: atTime(day, t), day: dk });
  }
  return items.sort((a, b) => a.dt - b.dt || a.med.name.localeCompare(b.med.name));
}
function statusOf(item, now) {
  if (state.log[item.key] && state.log[item.key].status === 'taken') return 'taken';
  const diff = (now - item.dt) / 60000;
  if (diff < 0) return 'upcoming';
  if (diff <= 60) return 'due';
  return 'missed';
}
function weekStats(now) {
  const days = [];
  let taken = 0, total = 0;
  for (let i = 6; i >= 0; i--) {
    const d = addDays(now, -i);
    const items = scheduleFor(d).filter(it => it.dt <= now || state.log[it.key]);
    const t = items.filter(it => state.log[it.key] && state.log[it.key].status === 'taken').length;
    taken += t; total += items.length;
    days.push({ d, taken: t, total: items.length });
  }
  return { days, taken, total, pct: total ? Math.round(taken / total * 100) : null };
}

/* ---------- toast / speech / notifications ---------- */
let toastTimer = null;
function toast(msg, ms = 6000) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function speak(text) {
  if (!state.settings.speak || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.9; speechSynthesis.speak(u); } catch (e) {}
}
const notified = new Set();
function checkReminders() {
  const now = new Date();
  for (const it of scheduleFor(now)) {
    if (statusOf(it, now) !== 'due' || notified.has(it.key)) continue;
    notified.add(it.key);
    const msg = 'Time to take ' + it.med.name + (it.med.dose ? ' ' + it.med.dose : '') + ' (' + it.time + ')';
    toast('💊 ' + msg, 15000); speak(msg);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('PillPulse', { body: msg }); } catch (e) {}
  }
  renderToday();
}

/* ---------- navigation ---------- */
function go(tab) {
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  if (tab === 'family') renderFamily();
  if (tab === 'pulse') renderPulseHistory();
  if (tab === 'meds') renderMeds();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
});

/* ---------- TODAY ---------- */
function renderToday() {
  const now = new Date();
  $('#today-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const items = scheduleFor(now);
  $('#empty-today').hidden = state.meds.length > 0;
  const takenN = items.filter(i => statusOf(i, now) === 'taken').length;
  $('#today-count').textContent = takenN + ' of ' + items.length;
  const ws = weekStats(now);
  $('#week-pct').textContent = ws.pct === null ? '–' : ws.pct + '%';

  const missed = items.filter(i => statusOf(i, now) === 'missed');
  const mb = $('#missed-banner');
  if (missed.length) {
    mb.hidden = false;
    mb.innerHTML = '⚠️ ' + missed.length + ' missed dose' + (missed.length > 1 ? 's' : '') + ': ' +
      missed.map(m => esc(m.med.name) + ' ' + m.time).join(', ') +
      '<button class="primary" data-go="family">Tell my family</button>';
  } else mb.hidden = true;

  const nx = items.find(i => statusOf(i, now) === 'upcoming' || statusOf(i, now) === 'due');
  const nd = $('#next-dose');
  if (nx) { nd.hidden = false; nd.textContent = 'Next: ' + nx.med.name + ' at ' + nx.time; } else nd.hidden = true;

  $('#dose-list').innerHTML = items.map(it => {
    const st = statusOf(it, now), label = { taken: 'Taken', due: 'Take now', missed: 'Missed', upcoming: 'Later' }[st];
    const tk = state.log[it.key] && state.log[it.key].at ? new Date(state.log[it.key].at) : null;
    return '<div class="dose ' + st + '">' +
      '<div class="time">' + fmtTime(it.time) + '</div>' +
      '<div><span class="name">' + esc(it.med.name) + '</span><span class="badge ' + st + '">' + label + '</span></div>' +
      '<div class="dosage">' + esc(it.med.dose || '') + (tk ? ' · taken at ' + pad(tk.getHours()) + ':' + pad(tk.getMinutes()) : '') + '</div>' +
      '<div class="act">' + (st === 'taken'
        ? '<button class="undo" data-undo="' + esc(it.key) + '">Undo</button>'
        : '<button class="taken-btn" data-take="' + esc(it.key) + '">✔ I took it</button>') + '</div>' +
      '</div>';
  }).join('');

  $('#week-strip').innerHTML = ws.days.map(w => {
    const cls = !w.total ? '' : w.taken === w.total ? 'good' : w.taken / w.total >= 0.5 ? 'mid' : 'bad';
    return '<div class="wd"><i class="' + cls + '">' + (w.total ? w.taken + '/' + w.total : '–') + '</i>' +
      w.d.toLocaleDateString('en-US', { weekday: 'short' }) + '</div>';
  }).join('');
}
$('#dose-list').addEventListener('click', e => {
  const t = e.target.closest('[data-take]'), u = e.target.closest('[data-undo]');
  if (t) { state.log[t.dataset.take] = { status: 'taken', at: Date.now() }; save(); renderToday(); toast('Great, saved ✔', 2500); }
  if (u) { delete state.log[u.dataset.undo]; save(); renderToday(); }
});

/* ---------- MEDS ---------- */
function renderMeds() {
  $('#med-list').innerHTML = state.meds.length ? state.meds.map(m =>
    '<div class="med"><div><b>' + esc(m.name) + (m.dose ? ' · ' + esc(m.dose) : '') + '</b><span class="muted small">' + m.times.join(', ') + '</span></div>' +
    '<button class="x" data-del="' + m.id + '" aria-label="Delete ' + esc(m.name) + '">Delete</button></div>').join('')
    : '<p class="muted">Nothing here yet.</p>';
}
$('#med-list').addEventListener('click', e => {
  const d = e.target.closest('[data-del]'); if (!d) return;
  if (!confirm('Delete this medicine?')) return;
  state.meds = state.meds.filter(m => m.id !== d.dataset.del); save(); renderMeds(); renderToday();
});

let parsed = [];
function renderPreview() {
  $('#preview-rows').innerHTML = parsed.map((p, i) =>
    '<div class="prow" data-i="' + i + '">' +
    '<input type="text" class="f-name" value="' + esc(p.name) + '" aria-label="Name">' +
    '<input type="text" class="f-dose" value="' + esc(p.dose) + '" placeholder="dose" aria-label="Dose">' +
    '<input type="text" class="f-times" value="' + esc(p.times.join(', ')) + '" aria-label="Times">' +
    '<button class="x" data-rm="' + i + '" aria-label="Remove">✕</button>' +
    (p.guessed ? '<div class="guess">No time found, we guessed 08:00. Please check.</div>' : '') + '</div>').join('');
  $('#preview').hidden = parsed.length === 0;
}
$('#parse-btn').onclick = () => {
  parsed = PillParser.parseNotebook($('#notebook').value);
  if (!parsed.length) { toast('Type at least one medicine first.', 3000); return; }
  renderPreview();
};
$('#preview-rows').addEventListener('click', e => {
  const r = e.target.closest('[data-rm]'); if (!r) return;
  parsed.splice(+r.dataset.rm, 1); renderPreview();
});
$('#add-all').onclick = () => {
  const rows = $$('#preview-rows .prow'); let added = 0, bad = 0;
  rows.forEach(row => {
    const name = row.querySelector('.f-name').value.trim();
    const dose = row.querySelector('.f-dose').value.trim();
    const times = row.querySelector('.f-times').value.split(/[,\s]+/).filter(Boolean);
    const ok = times.length && times.every(t => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t));
    if (!name || !ok) { bad++; return; }
    state.meds.push({
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name, dose, times: times.map(t => { const [h, m] = t.split(':'); return pad(+h) + ':' + m; }).sort(),
      created: dayKey(new Date())
    });
    added++;
  });
  save();
  if (bad) toast(bad + ' line(s) have a problem. Use times like 08:00, 20:00.', 5000);
  if (added && !bad) { parsed = []; $('#notebook').value = ''; renderPreview(); toast(added + ' medicine(s) added ✔', 3000); go('today'); }
  renderMeds(); renderToday();
};

/* ---------- PULSE (camera photoplethysmography) ---------- */
const DURATION = 30;
let samples = [], timer = null, stream = null, demoMode = false, validStart = null, t0 = 0, tickN = 0, estimates = [], lastSig = [];

function stopPulse() {
  clearInterval(timer); timer = null;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('#heart').classList.remove('beat');
  $('#pulse-start').textContent = 'Measure my pulse (30 s)';
}
async function beginPulse(useDemo) {
  if (timer) { stopPulse(); return; }
  demoMode = useDemo; samples = []; estimates = []; validStart = null; lastSig = [];
  $('#bpm').textContent = '--'; $('#prog').style.width = '0';
  if (!demoMode) {
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
      } catch (e) { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      const v = $('#video'); v.srcObject = stream; await v.play();
      try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: true }] }); } catch (e) {}
    } catch (e) {
      $('#pulse-status').textContent = 'Camera not available. It needs https:// (or localhost) and permission. Try the demo signal.';
      return;
    }
  }
  t0 = performance.now() / 1000; tickN = 0;
  $('#pulse-start').textContent = 'Stop';
  $('#heart').classList.add('beat');
  timer = setInterval(pulseTick, 33);
}
function readFrame(now) {
  if (demoMode) {
    const t = now - t0, hr = 1.2 + 0.03 * Math.sin(t * 0.3);
    return { v: 180 + 1.5 * Math.sin(2 * Math.PI * hr * t) + 0.5 * Math.sin(4 * Math.PI * hr * t) + 0.3 * Math.sin(t * 0.7) + (Math.random() - 0.5) * 0.4, finger: true };
  }
  const vid = $('#video'); if (vid.readyState < 2) return null;
  const c = $('#grab'), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(vid, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, b = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  r /= n; g /= n; b /= n;
  return { v: r, finger: r > 90 && r > g * 1.5 && r > b * 1.5 };
}
function pulseTick() {
  const now = performance.now() / 1000, f = readFrame(now); if (!f) return;
  if (!f.finger) {
    samples = []; validStart = null; estimates = [];
    $('#pulse-status').textContent = 'Place your fingertip over the camera and flash'; $('#prog').style.width = '0'; return;
  }
  if (validStart === null) validStart = now;
  samples.push({ t: now, v: f.v });
  while (samples.length && now - samples[0].t > 12) samples.shift();
  const el = now - validStart;
  $('#prog').style.width = Math.min(100, el / DURATION * 100) + '%';
  $('#pulse-status').textContent = el < 6 ? 'Calibrating… hold still' : 'Measuring… ' + Math.max(0, Math.ceil(DURATION - el)) + ' s';
  if (++tickN % 15 === 0 && el >= 6) {
    const r = analyze();
    if (r) { lastSig = r.sig; if (r.bpm) { estimates.push(r.bpm); $('#bpm').textContent = Math.round(r.bpm); } }
  }
  drawWave();
  if (el >= DURATION) finishPulse();
}
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function analyze() {
  const n = samples.length; if (n < 60) return null;
  const fps = n / (samples[n - 1].t - samples[0].t), half = Math.max(2, Math.round(fps * 0.4));
  const det = new Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { s += samples[j].v; c++; } det[i] = samples[i].v - s / c; }
  const sm = new Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += det[j]; c++; } sm[i] = -s / c; }
  const mean = sm.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sm.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1e-6;
  const peaks = [];
  for (let i = 1; i < n - 1; i++) {
    if (sm[i] > sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > 0.4 * sd) {
      const last = peaks[peaks.length - 1];
      if (last !== undefined && samples[i].t - samples[last].t < 0.33) { if (sm[i] > sm[last]) peaks[peaks.length - 1] = i; } else peaks.push(i);
    }
  }
  let bpm = null;
  if (peaks.length >= 4) {
    const iv = [];
    for (let k = 1; k < peaks.length; k++) { const d = samples[peaks[k]].t - samples[peaks[k - 1]].t; if (d > 0.33 && d < 1.5) iv.push(d); }
    if (iv.length >= 3) bpm = 60 / median(iv);
  }
  return { bpm, sig: sm };
}
function drawWave() {
  const c = $('#wave'), ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
  if (!lastSig.length) return;
  const mx = Math.max(...lastSig.map(Math.abs)) || 1;
  ctx.beginPath(); ctx.strokeStyle = '#d9435b'; ctx.lineWidth = 3;
  lastSig.forEach((v, i) => { const x = i / (lastSig.length - 1) * c.width, y = c.height / 2 - (v / mx) * c.height * 0.4; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
}
function finishPulse() {
  const good = estimates.slice(Math.floor(estimates.length / 3));
  stopPulse();
  if (!good.length) { $('#pulse-status').textContent = 'Could not read a pulse. Try again, finger covering camera and flash.'; return; }
  const bpm = Math.round(median(good));
  $('#bpm').textContent = bpm;
  $('#pulse-status').textContent = 'Saved. ' + (bpm < 60 ? 'Below the usual resting range (60–100).' : bpm > 100 ? 'Above the usual resting range (60–100).' : 'Within the usual resting range (60–100).');
  state.pulses.push({ t: Date.now(), bpm, demo: demoMode }); state.pulses = state.pulses.slice(-60); save();
  renderPulseHistory(); speak('Your pulse is ' + bpm + ' beats per minute.');
}
function renderPulseHistory() {
  const h = state.pulses;
  $('#pulse-history').innerHTML = h.slice().reverse().slice(0, 6).map(x =>
    '<div class="hist"><span>' + new Date(x.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + (x.demo ? ' (demo)' : '') + '</span><b>' + x.bpm + ' bpm</b></div>').join('')
    || '<p class="muted">No readings yet.</p>';
  const c = $('#hist-chart'), ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
  if (h.length < 2) return;
  const lo = 40, hi = 140, y = v => c.height - (v - lo) / (hi - lo) * c.height;
  ctx.fillStyle = 'rgba(26,138,82,.14)'; ctx.fillRect(0, y(100), c.width, y(60) - y(100));
  ctx.beginPath(); ctx.strokeStyle = '#d9435b'; ctx.lineWidth = 3;
  h.forEach((p, i) => { const px = i / (h.length - 1) * (c.width - 20) + 10; i ? ctx.lineTo(px, y(p.bpm)) : ctx.moveTo(px, y(p.bpm)); });
  ctx.stroke();
}
$('#pulse-start').onclick = () => beginPulse(false);
$('#pulse-demo').onclick = () => beginPulse(true);

/* ---------- FAMILY ---------- */
function summaryText() {
  const now = new Date(), items = scheduleFor(now);
  const takenN = items.filter(i => statusOf(i, now) === 'taken').length;
  const missed = items.filter(i => statusOf(i, now) === 'missed');
  const ws = weekStats(now), lp = state.pulses[state.pulses.length - 1];
  const who = state.patient.name || 'Patient';
  let s = 'PillPulse update for ' + who + ' (' + now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')\n';
  s += 'Today: ' + takenN + ' of ' + items.length + ' doses taken.\n';
  s += missed.length ? 'MISSED: ' + missed.map(m => m.med.name + ' ' + m.time).join(', ') + '\n' : 'No missed doses.\n';
  if (lp) s += 'Last pulse: ' + lp.bpm + ' bpm (' + new Date(lp.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ')\n';
  if (ws.pct !== null) s += '7-day adherence: ' + ws.pct + '%';
  return s.trim();
}
function renderFamily() {
  $('#patient-name').value = state.patient.name; $('#caregiver-name').value = state.patient.caregiver;
  $('#opt-large').checked = state.settings.large; $('#opt-speak').checked = state.settings.speak;
  const s = summaryText(); $('#summary').textContent = s;
  $('#share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(s);
  $('#share-tg').href = 'https://t.me/share/url?url=' + encodeURIComponent(location.href.split('#')[0]) + '&text=' + encodeURIComponent(s);
  $('#share-native').hidden = !navigator.share;
}
$('#patient-name').oninput = e => { state.patient.name = e.target.value; save(); renderFamily(); };
$('#caregiver-name').oninput = e => { state.patient.caregiver = e.target.value; save(); };
$('#share-native').onclick = () => { try { navigator.share({ title: 'PillPulse update', text: summaryText() }); } catch (e) {} };
$('#share-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(summaryText()); toast('Copied ✔', 2000); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('#summary')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Select and copy the text above', 3000); }
};
$('#opt-large').onchange = e => { state.settings.large = e.target.checked; document.body.classList.toggle('large', e.target.checked); save(); };
$('#opt-speak').onchange = e => { state.settings.speak = e.target.checked; save(); if (e.target.checked) speak('Reminders will be read aloud.'); };
$('#notif-btn').onclick = async () => {
  if (!('Notification' in window)) { toast('Alerts are not supported in this browser.', 3000); return; }
  const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Alerts enabled while this page is open ✔' : 'Alerts not allowed.', 3000);
};

/* calendar file: daily repeating alarms in the phone's own calendar */
function makeICS() {
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PillPulse//EN', 'CALSCALE:GREGORIAN'];
  for (const m of state.meds) for (const t of m.times) {
    const d = dayKey(now).replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    const title = 'Take ' + m.name + (m.dose ? ' ' + m.dose : '');
    L.push('BEGIN:VEVENT', 'UID:' + m.id + '-' + t.replace(':', '') + '@pillpulse', 'DTSTAMP:' + stamp, 'DTSTART:' + d,
      'DURATION:PT15M', 'RRULE:FREQ=DAILY', 'SUMMARY:' + title.replace(/[,;]/g, ' '),
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + title.replace(/[,;]/g, ' '), 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR'); return L.join('\r\n');
}
$('#ics-btn').onclick = () => {
  if (!state.meds.length) { toast('Add a medicine first.', 3000); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([makeICS()], { type: 'text/calendar' }));
  a.download = 'pillpulse-reminders.ics'; document.body.appendChild(a); a.click(); a.remove();
  toast('Open the downloaded file on the phone and tap Add.', 6000);
};

/* doctor report */
function buildReport() {
  const now = new Date(), days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(now, -i));
  const ws = weekStats(now);
  let h = '<h2>Weekly medication &amp; pulse report</h2><p><b>Patient:</b> ' + esc(state.patient.name || '—') + ' &nbsp; <b>Generated:</b> ' + now.toLocaleDateString('en-US') + '</p>';
  h += '<p><b>7-day adherence:</b> ' + (ws.pct === null ? 'n/a' : ws.pct + '% (' + ws.taken + ' of ' + ws.total + ' doses)') + '</p>';
  h += '<div class="scroll"><table><tr><th>Medicine</th>' + days.map(d => '<th>' + d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) + '</th>').join('') + '</tr>';
  for (const m of state.meds) {
    h += '<tr><td>' + esc(m.name) + (m.dose ? ' ' + esc(m.dose) : '') + '<br><small>' + m.times.join(', ') + '</small></td>';
    for (const d of days) {
      const its = scheduleFor(d).filter(i => i.med.id === m.id && (i.dt <= now || state.log[i.key]));
      if (!its.length) { h += '<td>–</td>'; continue; }
      const t = its.filter(i => state.log[i.key] && state.log[i.key].status === 'taken').length;
      h += '<td class="' + (t === its.length ? 'ok' : 'no') + '">' + t + '/' + its.length + '</td>';
    }
    h += '</tr>';
  }
  h += '</table></div>';
  const since = Date.now() - 7 * 864e5, pl = state.pulses.filter(p => p.t >= since);
  h += '<h3>Pulse readings (camera, at rest)</h3>';
  if (pl.length) {
    const vals = pl.map(p => p.bpm);
    h += '<p>Min ' + Math.min(...vals) + ' · Median ' + Math.round(median(vals)) + ' · Max ' + Math.max(...vals) + ' bpm (' + pl.length + ' readings)</p><table><tr><th>When</th><th>bpm</th></tr>' +
      pl.map(p => '<tr><td>' + new Date(p.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</td><td>' + p.bpm + '</td></tr>').join('') + '</table>';
  } else h += '<p>No readings this week.</p>';
  h += '<p class="small"><i>Self-reported data from a student project app. Camera pulse is an estimate and not a medical measurement.</i></p>';
  h += '<button class="primary noprint" onclick="window.print()">Print / Save as PDF</button>';
  return h;
}
$('#report-btn').onclick = () => {
  if (!state.meds.length) { toast('Add a medicine first.', 3000); return; }
  const r = $('#report'); r.innerHTML = buildReport(); r.hidden = false; r.scrollIntoView({ behavior: 'smooth' });
};

/* demo data */
function loadDemo() {
  if (state.meds.length && !confirm('This replaces your current data with demo data. Continue?')) return;
  const now = new Date(), start = dayKey(addDays(now, -7));
  state = blank();
  state.patient = { name: 'Grandma Nodira', caregiver: 'Yodgora' };
  state.meds = [
    { id: 'd1', name: 'Metformin', dose: '500 mg', times: ['08:00', '20:00'], created: start },
    { id: 'd2', name: 'Aspirin', dose: '75 mg', times: ['09:00'], created: start },
    { id: 'd3', name: 'Lisinopril', dose: '10 mg', times: ['13:00', '21:00'], created: start }
  ];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 7; i >= 0; i--) {
    const d = addDays(now, -i);
    for (const it of scheduleFor(d)) {
      if (it.dt > now) continue;
      if (i === 0 && (it.dt > addDays(now, 0) )) continue;
      if (rnd() < 0.82) state.log[it.key] = { status: 'taken', at: it.dt.getTime() + 600000 };
    }
  }
  for (let i = 6; i >= 0; i--) {
    const t = addDays(now, -i); t.setHours(10, 5, 0, 0);
    state.pulses.push({ t: t.getTime(), bpm: 68 + Math.round(rnd() * 12), demo: true });
  }
  save(); renderAll(); go('today'); toast('Demo data loaded.', 3000);
}
$('#load-demo-1').onclick = loadDemo; $('#load-demo-2').onclick = loadDemo;
$('#reset-btn').onclick = () => {
  if (!confirm('Erase all medicines, history and pulse readings on this device?')) return;
  state = blank(); save(); $('#report').hidden = true; renderAll(); go('today');
};

/* ---------- boot ---------- */
function renderAll() {
  document.body.classList.toggle('large', !!state.settings.large);
  renderToday(); renderMeds(); renderPulseHistory(); renderFamily();
}
renderAll();
checkReminders();
setInterval(checkReminders, 30000);
if (location.hash === '#demo') loadDemo();
