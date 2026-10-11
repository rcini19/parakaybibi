/* ECE Review Tracker — daily active-recall tracker for the Electronics Engineering board exam.
   Everything is saved in this browser's localStorage. Use Settings → Export to back up. */

// ECE Licensure Exam (RA 9292): Math 20%, GEAS 20%, Electronics 30%, EST 30%.
// This is only the starting list — everything can be edited in the SUBJECTS tab.
const CONFIG = {
  storageKey: 'ece-tracker.v1',
  exam: { name: 'ECELE', date: '2027-04-17' },
  quotes: [
    'Future Engr. ka na, review lang ng konti.',
    'Small steps every day. Kaya mo yan.',
    'Discipline beats motivation.',
    'One topic at a time, one day at a time.',
    'Solve one more problem.',
    "Rest if you must, but don't quit.",
  ],
  // [name, color, topics] — a topic is a name, or [name, [subtopics]]
  subjects: [
    ['MATH', 'blue', [
      'Algebra',
      'Plane & Spherical Trigonometry',
      'Analytic Geometry',
      'Solid Mensuration',
      ['Differential Calculus', ['Limits', 'Derivatives', 'Maxima & Minima', 'Time Rates']],
      ['Integral Calculus', ['Techniques of Integration', 'Areas & Volumes', 'Centroids & Moments of Inertia']],
      'Differential Equations',
      'Complex Numbers',
      'Matrices & Determinants',
      'Vector Analysis',
      'Probability & Statistics',
      ['Advanced Engineering Math', ['Laplace Transform', 'Fourier Series & Transform', 'Z-Transform', 'Power Series']],
      'Numerical Methods',
      'Discrete Mathematics',
    ]],
    ['GEAS', 'green', [
      'General Chemistry',
      ['College Physics', ['Mechanics', 'Heat', 'Waves & Sound', 'Optics', 'Electricity & Magnetism', 'Modern Physics']],
      ['Engineering Mechanics', ['Statics', 'Dynamics']],
      'Strength of Materials',
      'Fluid Mechanics',
      'Thermodynamics',
      'Engineering Materials',
      'Engineering Economics',
      'Engineering Management',
      'Computer Fundamentals & Programming',
      'Environmental Engineering',
      ['Laws & Ethics', ['RA 9292 (ECE Law)', 'Contracts & Obligations', 'Code of Ethics', 'Philippine Electronics Code']],
    ]],
    ['ELEX', 'purple', [
      ['Electrical Circuits', ['DC Circuits', 'AC Circuits', 'Network Theorems', 'Transients', 'Resonance & Filters', 'Three-Phase Systems']],
      'Solid-State Devices & Semiconductor Physics',
      ['Electronic Circuits', ['Diode Circuits', 'BJT Amplifiers', 'FET Amplifiers', 'Frequency Response', 'Feedback Amplifiers', 'Oscillators']],
      'Operational Amplifiers & Linear ICs',
      'Power Supplies & Regulators',
      'Power Electronics',
      ['Digital Electronics', ['Number Systems & Codes', 'Boolean Algebra & K-maps', 'Combinational Logic', 'Sequential Logic', 'Logic Families']],
      'Microprocessors & Microcontrollers',
      'Computer Systems & Architecture',
      'Signals & Systems',
      'Feedback & Control Systems',
      'Electromagnetics',
      'Industrial Electronics',
      'Instrumentation & Measurements',
    ]],
    ['EST', 'amber', [
      'Principles of Communication & Noise',
      ['Amplitude Modulation', ['DSB-FC', 'DSB-SC', 'SSB', 'AM Receivers']],
      ['Angle Modulation', ['FM', 'PM', 'FM Receivers']],
      'Pulse Modulation & PCM',
      'Digital & Data Communications',
      'Multiplexing (FDM / TDM / WDM)',
      'Information Theory & Coding',
      'Transmission Lines',
      'Waveguides',
      'Antennas',
      'Radio Wave Propagation',
      'Microwave Communications',
      'Satellite Communications',
      'Fiber Optic Communications',
      'Broadcasting (AM, FM, TV)',
      'Telephony',
      'Cellular & Wireless Communications',
      'Data Networks (OSI, TCP/IP)',
      'Acoustics',
      'Navigational Aids & Radar',
      'Telecom Laws & Regulations (RA 7925, NTC)',
    ]],
  ],
};

const STORE_KEY = CONFIG.storageKey;

const COLORS = {
  blue:   { fill: '#bfe0f5', ink: '#1d5fa8' },
  slate:  { fill: '#c6d9e0', ink: '#235d6b' },
  green:  { fill: '#d4ecc4', ink: '#2f7d3a' },
  amber:  { fill: '#fde4a0', ink: '#8a6100' },
  purple: { fill: '#e3d1f2', ink: '#5b2d86' },
  red:    { fill: '#fcd0cc', ink: '#b42318' },
  pink:   { fill: '#f9d3e6', ink: '#a1286a' },
  gray:   { fill: '#e3e3e3', ink: '#444444' },
};

const DEFAULT_QUOTES = CONFIG.quotes;

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const today = () => startOfDay(new Date());
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
const weekStart = d => addDays(startOfDay(d), -d.getDay()); // Sunday
const DOW = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtLong = d => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const fmtMD = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const STALE_DAYS = 14; // a topic not reviewed for this long shows up as "needs review"
const agoText = n => n === Infinity ? 'never' : n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n}d ago`;

/* ---------- state ---------- */
function seed() {
  const topic = t => {
    const [name, subs = []] = Array.isArray(t) ? t : [t];
    return { id: uid(), name, mastered: false, subtopics: subs.map(n => ({ id: uid(), name: n })) };
  };
  return {
    exam: { ...CONFIG.exam },
    quotes: DEFAULT_QUOTES,
    subjects: CONFIG.subjects.map(([name, color, topics]) => ({ id: uid(), name, color, topics: topics.map(topic) })),
    log: {},           // { 'YYYY-MM-DD': { itemId: true } }  — what was actually studied
    plan: {},          // { 'YYYY-MM-DD': [itemId, ...] }       — what she picked to study that day
    ui: { tab: 'today' },
  };
}

let state = load();
let viewDay = today();
let viewWeek = weekStart(today());
let quoteOffset = 0;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* fall through to seed */ }
  return seed();
}

function normalize(s) {
  const base = seed();
  s.exam = { ...base.exam, ...(s.exam || {}) };
  s.quotes = Array.isArray(s.quotes) && s.quotes.length ? s.quotes : DEFAULT_QUOTES;
  s.subjects = Array.isArray(s.subjects) ? s.subjects : [];
  s.subjects.forEach(sub => {
    sub.topics = sub.topics || [];
    sub.topics.forEach(t => { t.subtopics = t.subtopics || []; });
  });
  s.log = s.log || {};
  s.plan = s.plan || {};
  s.ui = s.ui || { tab: 'today' };
  return s;
}

// saveLocal() only writes this browser's copy; save() also tells cloud sync (sync.js) something changed.
function saveLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage is blocked in this browser.'); }
}

function save() {
  saveLocal();
  window.onTrackerChange?.();
}

/* ---------- stats ---------- */
const sortedLogKeys = () => Object.keys(state.log).filter(k => Object.keys(state.log[k]).length).sort().reverse();

function topicDoneOn(topic, k) {
  const day = state.log[k];
  return !!day && (!!day[topic.id] || topic.subtopics.some(s => day[s.id]));
}
const subjectActiveOn = (subj, k) => subj.topics.some(t => topicDoneOn(t, k));
const itemsDoneOn = (subj, k) => {
  const day = state.log[k];
  if (!day) return 0;
  return subj.topics.reduce((n, t) => n + (day[t.id] ? 1 : 0) + t.subtopics.filter(s => day[s.id]).length, 0);
};

function topicLastSeen(topic, keys, asOf) {
  for (const k of keys) {
    if (parseKey(k) > asOf) continue;
    if (topicDoneOn(topic, k)) return daysBetween(parseKey(k), asOf);
  }
  return Infinity;
}

function subjectStats(subj, asOf = today()) {
  const keys = sortedLogKeys();
  const topicAges = subj.topics.map(t => ({ t, age: topicLastSeen(t, keys, asOf) }));
  const covered = topicAges.filter(x => x.age !== Infinity).length;
  const mastered = subj.topics.filter(t => t.mastered).length;
  let last = Infinity;
  for (const k of keys) {
    if (parseKey(k) > asOf) continue;
    if (subjectActiveOn(subj, k)) { last = daysBetween(parseKey(k), asOf); break; }
  }
  let active7 = 0;
  for (let i = 0; i < 7; i++) if (subjectActiveOn(subj, keyOf(addDays(asOf, -i)))) active7++;
  const stale = topicAges.filter(x => x.age >= STALE_DAYS).sort((a, b) => b.age - a.age);

  let status, reason;
  if (!subj.topics.length) { status = 'new'; reason = 'No topics yet'; }
  else if (last === Infinity) { status = 'new'; reason = 'Not started yet'; }
  // She doesn't study every subject daily, so this is judged over the last 7 days.
  else if (active7 === 0) { status = 'weak'; reason = `Not reviewed in ${last} days`; }
  else if (active7 >= 3) { status = 'strong'; reason = `Reviewed ${active7} of the last 7 days`; }
  else { status = 'okay'; reason = `Only ${active7} of the last 7 days`; }

  return { total: subj.topics.length, covered, mastered, last, active7, stale, topicAges, status, reason };
}

/* ---------- clock & countdown ---------- */
function tickClock() {
  const n = new Date();
  document.getElementById('clkDay').textContent = pad(n.getDate());
  document.getElementById('clkMonth').textContent = pad(n.getMonth() + 1);
  document.getElementById('clkYear').textContent = pad(n.getFullYear() % 100);
  const h12 = n.getHours() % 12 || 12;
  document.getElementById('clk12').textContent = `${pad(h12)}:${pad(n.getMinutes())} ${n.getHours() < 12 ? 'AM' : 'PM'}`;
  document.getElementById('clk24').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  // roll over to the new day at midnight
  if (keyOf(n) !== tickClock.lastKey) {
    if (tickClock.lastKey) render();
    tickClock.lastKey = keyOf(n);
    renderHeader();
  }
}

function renderHeader() {
  const qs = state.quotes;
  const dayIndex = Math.floor(today() / 86400000);
  document.getElementById('quote').textContent = qs[((dayIndex + quoteOffset) % qs.length + qs.length) % qs.length];

  const exam = parseKey(state.exam.date || keyOf(today()));
  document.getElementById('examName').textContent = state.exam.name || 'EXAM';
  document.getElementById('examDate').textContent = fmtLong(exam);
  const t = today();
  const total = daysBetween(t, exam);
  let txt;
  if (total < 0) txt = 'Exam is done — so proud of you!';
  else if (total === 0) txt = 'TODAY na! Good luck, Engr.! Kaya mo yan!';
  else {
    let m = 0, c = new Date(t);
    for (;;) { const nx = new Date(c); nx.setMonth(nx.getMonth() + 1); if (nx <= exam) { m++; c = nx; } else break; }
    const d = daysBetween(c, exam);
    txt = `${m} Month(s) ${Math.floor(d / 7)} Week(s) and ${d % 7} Day(s) remaining · ${total} day(s) to go`;
  }
  document.getElementById('examLeft').textContent = txt;
}

/* ---------- views ---------- */
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.ui.tab));
  const v = document.getElementById('view');
  const fn = { today: viewToday, weekly: viewWeekly, subjects: viewSubjects, settings: viewSettings }[state.ui.tab] || viewToday;
  v.innerHTML = fn();
  window.renderSyncPanel?.();
}

const chip = s => { const c = COLORS[s.color] || COLORS.gray; return `<span class="chip" style="background:${c.fill};border-color:${c.ink};color:${c.ink}">${esc(s.name)}</span>`; };
const bar = (s, p, solid) => { const c = COLORS[s.color] || COLORS.gray; return `<div class="bar" style="border-color:${c.ink}"><i style="width:${Math.min(100, p)}%;background:${solid ? c.ink : c.fill}"></i></div>`; };

// itemId -> { s: subject, t: topic, st: subtopic (only when the item is a subtopic) }
function itemIndex() {
  const m = {};
  state.subjects.forEach(s => s.topics.forEach(t => {
    m[t.id] = { s, t };
    t.subtopics.forEach(st => { m[st.id] = { s, t, st }; });
  }));
  return m;
}

// which subject pickers are open, kept across re-renders
const openPickers = new Set();

function viewToday() {
  const k = keyOf(viewDay);
  const isToday = k === keyOf(today());
  const keys = sortedLogKeys();
  const day = state.log[k] || {};
  const idx = itemIndex();
  const thisDay = isToday ? 'today' : 'this day';

  // the day's list = what she planned + anything she ticked that day
  const ids = [...new Set([...(state.plan[k] || []), ...Object.keys(day)])].filter(id => idx[id]);
  const done = ids.filter(id => day[id]).length;
  const planned = new Set(ids);

  const prevK = keyOf(addDays(viewDay, -1));
  const carry = (state.plan[prevK] || []).filter(id => idx[id] && !(state.log[prevK] || {})[id] && !planned.has(id));

  const ago = t => {
    const a = topicLastSeen(t, keys, addDays(viewDay, -1)) + 1; // last review before this day
    return `<span class="ago ${a >= STALE_DAYS && a !== Infinity ? 'stale' : ''}" title="Last reviewed">${agoText(a)}</span>`;
  };
  const star = t => `<button class="star ${t.mastered ? 'on' : ''}" data-a="master" data-s="${idx[t.id].s.id}" data-t="${t.id}" title="Mark topic as mastered">★</button>`;

  // ---- the day's plan, grouped by subject
  const groups = state.subjects.map(s => {
    const mine = ids.filter(id => idx[id].s === s);
    if (!mine.length) return '';
    const c = COLORS[s.color] || COLORS.gray;
    const rows = mine.map(id => {
      const { t, st } = idx[id];
      const label = st ? `${esc(t.name)} <span class="muted">›</span> ${esc(st.name)}` : esc(t.name);
      return `<li><div class="row ${day[id] ? 'done' : ''}">
        <label><input type="checkbox" data-a="tick" data-id="${id}" ${day[id] ? 'checked' : ''}><span>${label}</span></label>
        ${st ? '' : star(t)}
        <button class="btn sm ghost" data-a="unplan" data-id="${id}" title="Remove from ${thisDay}">✕</button>
      </div></li>`;
    }).join('');
    return `<div class="card">
      <div class="card-h" style="background:${c.fill}">${chip(s)}<span style="color:${c.ink};font-weight:600">${mine.filter(id => day[id]).length}/${mine.length} done</span></div>
      <ul>${rows}</ul>
    </div>`;
  }).join('');

  // ---- picker: choose the topics / subtopics for the day
  const pickers = state.subjects.map(s => {
    const c = COLORS[s.color] || COLORS.gray;
    const btn = id => `<button class="pick ${planned.has(id) ? 'on' : ''}" data-a="plan" data-id="${id}">${planned.has(id) ? '✓ ADDED' : '+ ADD'}</button>`;
    const items = s.topics.map(t => `
      <li>
        <div class="row">${btn(t.id)}<span class="pname">${esc(t.name)}</span>${ago(t)}${star(t)}</div>
        ${t.subtopics.length ? `<ul>${t.subtopics.map(st => `<li><div class="row">${btn(st.id)}<span class="pname">${esc(st.name)}</span></div></li>`).join('')}</ul>` : ''}
      </li>`).join('');
    const inPlan = ids.filter(id => idx[id].s === s).length;
    return `<details class="card picker" data-s="${s.id}" ${openPickers.has(s.id) ? 'open' : ''}>
      <summary class="card-h" style="background:${c.fill}">${chip(s)}<span style="color:${c.ink};font-weight:600">${inPlan ? `${inPlan} added · ` : ''}${s.topics.length} topics ▾</span></summary>
      ${s.topics.length ? `<ul>${items}</ul>` : '<div class="empty">No topics yet — add some in SUBJECTS.</div>'}
    </details>`;
  }).join('');

  // ---- gentle weekly nudge (not daily — she picks what to study each day)
  const notWeek = state.subjects.filter(s => s.topics.length && ![...Array(7)].some((_, i) => subjectActiveOn(s, keyOf(addDays(viewDay, -i)))));
  const alert = notWeek.length
    ? `<div class="alert">⚠ Hindi pa naaaral in the last 7 days: <b>${notWeek.map(s => esc(s.name)).join(', ')}</b></div>`
    : '';

  return `
    <div class="dayhead">
      <button class="btn" data-a="day" data-d="-1">‹ PREV</button>
      <h2>${DOW[viewDay.getDay()]} · ${fmtLong(viewDay)}</h2>
      <button class="btn" data-a="day" data-d="1">NEXT ›</button>
      ${isToday ? '' : '<button class="btn dark" data-a="day" data-d="0">BACK TO TODAY</button>'}
    </div>
    ${alert}

    <h3>${isToday ? "TODAY'S" : "THIS DAY'S"} PLAN <span class="muted">· ${done}/${ids.length} done</span></h3>
    ${carry.length ? `<p><button class="btn" data-a="carry">↪ Carry over ${carry.length} unfinished from the day before</button></p>` : ''}
    ${groups ? `<div class="cards">${groups}</div>` : `<div class="card empty-plan">Wala pang plan for ${thisDay}. Pick the topics or subtopics you'll study below.</div>`}

    <h3>PICK WHAT TO STUDY</h3>
    <p class="muted" style="margin:-4px 0 12px;font-size:12px">Open a subject and add only what you'll study ${thisDay}. Tick it in the plan above once you've done active recall — that's what updates the weekly progress, mastery and strengths/weaknesses. "Xd ago" = last reviewed (red = ${STALE_DAYS}+ days). ★ = mastered.</p>
    <div class="cards">${pickers}</div>`;
}

function viewWeekly() {
  const t = keyOf(today());
  const days = [...Array(7)].map((_, i) => addDays(viewWeek, i));
  const weekEnd = days[6];
  const isCurrent = keyOf(viewWeek) === keyOf(weekStart(today()));
  const asOf = isCurrent ? today() : weekEnd;

  const rows = state.subjects.map(s => {
    const c = COLORS[s.color] || COLORS.gray;
    const st = subjectStats(s, asOf);
    let activeDays = 0;
    const touched = s.topics.filter(tp => days.some(d => topicDoneOn(tp, keyOf(d)))).length;
    const cells = days.map(d => {
      const n = itemsDoneOn(s, keyOf(d));
      if (n) activeDays++;
      return `<td class="dc"><div class="dot" style="${n ? `background:${c.fill};border-color:${c.ink};color:${c.ink}` : ''}">${n || ''}</div></td>`;
    }).join('');
    return `<tr>
      <td>${chip(s)}</td>${cells}
      <td><b>${activeDays}</b>/7</td>
      <td class="bars">${bar(s, pct(touched, st.total))}<div class="pct" style="color:${c.ink}">${touched}/${st.total} topics</div></td>
      <td class="bars">${bar(s, pct(st.covered, st.total))}<div class="pct" style="color:${c.ink}">${pct(st.covered, st.total).toFixed(1)}%</div></td>
      <td class="bars">${bar(s, pct(st.mastered, st.total), true)}<div class="pct" style="color:${c.ink}">${pct(st.mastered, st.total).toFixed(1)}%</div></td>
    </tr>`;
  }).join('');

  const strip = days.map(d => {
    const k = keyOf(d);
    const lines = [];
    state.subjects.forEach(s => s.topics.forEach(tp => { if (topicDoneOn(tp, k)) lines.push(`(${esc(s.name)}) – ${esc(tp.name)}`); }));
    return `<div class="d ${k === t ? 'today' : ''}">
      <div class="dn">${DOW[d.getDay()]}</div><div class="dd">${fmtMD(d)}</div>
      <ul>${lines.length ? lines.map(l => `<li>${l}</li>`).join('') : '<li class="muted">—</li>'}</ul>
    </div>`;
  }).join('');

  const order = { new: 0, weak: 1, okay: 2, strong: 3 };
  const sw = state.subjects.map(s => ({ s, st: subjectStats(s, asOf) }))
    .sort((a, b) => order[a.st.status] - order[b.st.status] || (b.st.last - a.st.last) || a.st.active7 - b.st.active7)
    .map(({ s, st }) => {
      const label = { new: 'NOT STARTED', weak: 'WEAKNESS', okay: 'OKAY', strong: 'STRENGTH' }[st.status];
      const staleNames = st.stale.slice(0, 4).map(x => `${esc(x.t.name)} (${agoText(x.age)})`).join('<br>');
      return `<div class="card">
        <div class="top-line">${chip(s)}<span class="badge ${st.status}">${label}</span></div>
        <dl>
          <dt>Status</dt><dd>${esc(st.reason)}</dd>
          <dt>Last reviewed</dt><dd>${agoText(st.last)}</dd>
          <dt>Days active (7d)</dt><dd>${st.active7}/7</dd>
          <dt>Topics covered</dt><dd>${st.covered}/${st.total}</dd>
          <dt>Mastered</dt><dd>${st.mastered}/${st.total}</dd>
          <dt>Stale (7d+)</dt><dd>${st.stale.length}</dd>
        </dl>
        ${staleNames ? `<div class="stale-list">Needs review:<br>${staleNames}${st.stale.length > 4 ? `<br>+${st.stale.length - 4} more` : ''}</div>` : ''}
      </div>`;
    }).join('');

  const totalItems = days.reduce((n, d) => n + Object.keys(state.log[keyOf(d)] || {}).length, 0);
  const studyDays = days.filter(d => Object.keys(state.log[keyOf(d)] || {}).length).length;

  return `
    <div class="dayhead">
      <button class="btn" data-a="week" data-d="-7">‹ PREV</button>
      <h2>${fmtMD(viewWeek)} – ${fmtMD(weekEnd)}, ${weekEnd.getFullYear()}</h2>
      <button class="btn" data-a="week" data-d="7">NEXT ›</button>
      ${isCurrent ? '' : '<button class="btn dark" data-a="week" data-d="0">THIS WEEK</button>'}
    </div>
    <p class="summary"><b>${totalItems}</b> item(s) recalled · studied <b>${studyDays}</b>/7 days · streak: <b>${streak()}</b> day(s)</p>

    <h3>WEEKLY PROGRESS</h3>
    <div class="tablewrap"><table class="wk">
      <thead><tr><th>SUBJ</th>${days.map(d => `<th class="${keyOf(d) === t ? 'today' : ''}">${DOW[d.getDay()].slice(0, 3)}<br>${fmtMD(d)}</th>`).join('')}
      <th>DAYS</th><th>TOPICS THIS WEEK</th><th>PROGRESS</th><th>MASTERY</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>

    <h3>STRENGTHS &amp; WEAKNESSES ${isCurrent ? '(AS OF TODAY)' : `(AS OF ${fmtMD(weekEnd)})`}</h3>
    <div class="sw">${sw}</div>

    <h3>WHAT WAS STUDIED</h3>
    <div class="strip">${strip}</div>`;
}

function streak() {
  let n = 0, d = today();
  if (!Object.keys(state.log[keyOf(d)] || {}).length) d = addDays(d, -1); // today not done yet doesn't break it
  while (Object.keys(state.log[keyOf(d)] || {}).length) { n++; d = addDays(d, -1); }
  return n;
}

function viewSubjects() {
  const colorOpts = sel => Object.keys(COLORS).map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
  const subjects = state.subjects.map((s, i) => {
    const c = COLORS[s.color] || COLORS.gray;
    const topics = s.topics.map(t => `
      <div class="tp">
        <div class="tp-r">
          <button class="star ${t.mastered ? 'on' : ''}" data-a="master" data-s="${s.id}" data-t="${t.id}" title="Mastered">★</button>
          <input type="text" class="tname" value="${esc(t.name)}" data-a="rename-topic" data-s="${s.id}" data-t="${t.id}">
          <button class="btn sm" data-a="add-sub" data-s="${s.id}" data-t="${t.id}">+ subtopic</button>
          <button class="btn sm ghost" data-a="del-topic" data-s="${s.id}" data-t="${t.id}" title="Delete topic">✕</button>
        </div>
        ${t.subtopics.length ? `<div class="subs">${t.subtopics.map(st => `
          <div class="tp-r">
            <span class="muted">↳</span>
            <input type="text" class="tname" value="${esc(st.name)}" data-a="rename-sub" data-s="${s.id}" data-t="${t.id}" data-u="${st.id}">
            <button class="btn sm ghost" data-a="del-sub" data-s="${s.id}" data-t="${t.id}" data-u="${st.id}" title="Delete subtopic">✕</button>
          </div>`).join('')}</div>` : ''}
      </div>`).join('');
    return `<div class="subj">
      <div class="subj-h" style="background:${c.fill}">
        <input type="text" class="name" value="${esc(s.name)}" data-a="rename-subj" data-s="${s.id}">
        <select data-a="color" data-s="${s.id}">${colorOpts(s.color)}</select>
        <span class="muted">${s.topics.length} topic(s)</span>
        <span style="flex:1"></span>
        <button class="btn sm" data-a="move" data-s="${s.id}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn sm" data-a="move" data-s="${s.id}" data-d="1" ${i === state.subjects.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn sm danger" data-a="del-subj" data-s="${s.id}">Delete subject</button>
      </div>
      <div class="subj-b">
        ${topics || '<p class="muted" style="margin:4px 0">No topics yet.</p>'}
        <div class="adder">
          <textarea id="add-${s.id}" placeholder="Add required topics — one per line (pwede mag-paste ng list)"></textarea>
          <button class="btn dark" data-a="add-topics" data-s="${s.id}">+ ADD</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
    ${subjects}
    <div class="adder" style="max-width:520px">
      <input type="text" class="field" id="newSubj" placeholder="New subject name (e.g. MATH)" style="flex:1">
      <select class="field" id="newSubjColor">${colorOpts('gray')}</select>
      <button class="btn dark" data-a="add-subj">+ SUBJECT</button>
    </div>`;
}

function viewSettings() {
  return `<div class="settings">
    <label>Exam name<input class="field" type="text" id="setExamName" value="${esc(state.exam.name)}"></label>
    <label>Exam date<input class="field" type="date" id="setExamDate" value="${esc(state.exam.date)}"></label>
    <label>Motivational quotes (one per line — rotates daily, click the quote box to shuffle)
      <textarea id="setQuotes" rows="7">${esc(state.quotes.join('\n'))}</textarea></label>
    <div class="actions"><button class="btn dark" data-a="save-settings">SAVE SETTINGS</button></div>

    <h3 style="margin-top:20px">CLOUD SYNC</h3>
    <div id="syncPanel"><p class="muted" style="margin:0">Loading…</p></div>

    <h3 style="margin-top:20px">BACKUP</h3>
    <p class="muted" style="margin:0">Export a backup file once in a while, just in case.</p>
    <div class="actions">
      <button class="btn" data-a="export">EXPORT BACKUP</button>
      <button class="btn" data-a="import">IMPORT BACKUP</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <button class="btn danger" data-a="reset">RESET EVERYTHING</button>
    </div>
  </div>`;
}

/* ---------- actions ---------- */
const findSubj = id => state.subjects.find(s => s.id === id);
const findTopic = (sid, tid) => findSubj(sid)?.topics.find(t => t.id === tid);

function commit() { save(); render(); }

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}

function purgeLog(ids) {
  const set = new Set(ids);
  for (const k of Object.keys(state.log)) {
    for (const id of Object.keys(state.log[k])) if (set.has(id)) delete state.log[k][id];
  }
  for (const k of Object.keys(state.plan)) state.plan[k] = state.plan[k].filter(id => !set.has(id));
  Object.keys({ ...state.log, ...state.plan }).forEach(cleanDay);
}

function cleanDay(k) {
  if (state.log[k] && !Object.keys(state.log[k]).length) delete state.log[k];
  if (state.plan[k] && !state.plan[k].length) delete state.plan[k];
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const { a, s, t, u, d } = el.dataset;
  switch (a) {
    case 'tab': state.ui.tab = el.dataset.tab; saveLocal(); render(); window.scrollTo({ top: 0 }); break;
    case 'next-quote': quoteOffset++; renderHeader(); break;
    case 'day': viewDay = +d === 0 ? today() : addDays(viewDay, +d); render(); break;
    case 'week': viewWeek = +d === 0 ? weekStart(today()) : addDays(viewWeek, +d); render(); break;
    case 'plan': {
      const k = keyOf(viewDay), list = state.plan[k] || [];
      if (list.includes(el.dataset.id)) {
        state.plan[k] = list.filter(x => x !== el.dataset.id);
        if (state.log[k]) delete state.log[k][el.dataset.id];
      } else state.plan[k] = [...list, el.dataset.id];
      cleanDay(k); commit();
      break;
    }
    case 'unplan': {
      const k = keyOf(viewDay);
      state.plan[k] = (state.plan[k] || []).filter(x => x !== el.dataset.id);
      if (state.log[k]) delete state.log[k][el.dataset.id];
      cleanDay(k); commit();
      break;
    }
    case 'carry': {
      const k = keyOf(viewDay), prevK = keyOf(addDays(viewDay, -1));
      const left = (state.plan[prevK] || []).filter(id => !(state.log[prevK] || {})[id]);
      state.plan[k] = [...new Set([...(state.plan[k] || []), ...left])];
      commit();
      break;
    }
    case 'master': { const tp = findTopic(s, t); if (tp) { tp.mastered = !tp.mastered; commit(); } break; }
    case 'add-topics': {
      const box = document.getElementById(`add-${s}`);
      const names = box.value.split('\n').map(x => x.trim()).filter(Boolean);
      if (!names.length) return;
      findSubj(s).topics.push(...names.map(name => ({ id: uid(), name, mastered: false, subtopics: [] })));
      commit(); toast(`Added ${names.length} topic(s)`);
      document.getElementById(`add-${s}`)?.focus();
      break;
    }
    case 'add-sub': {
      const name = prompt('Subtopic name:');
      if (name && name.trim()) { findTopic(s, t).subtopics.push({ id: uid(), name: name.trim() }); commit(); }
      break;
    }
    case 'del-topic': {
      const sub = findSubj(s), tp = findTopic(s, t);
      if (!confirm(`Delete topic "${tp.name}" and its history?`)) return;
      purgeLog([tp.id, ...tp.subtopics.map(x => x.id)]);
      sub.topics = sub.topics.filter(x => x.id !== t); commit();
      break;
    }
    case 'del-sub': {
      const tp = findTopic(s, t);
      purgeLog([u]); tp.subtopics = tp.subtopics.filter(x => x.id !== u); commit();
      break;
    }
    case 'del-subj': {
      const sub = findSubj(s);
      if (!confirm(`Delete ${sub.name} with all its topics and history?`)) return;
      purgeLog(sub.topics.flatMap(tp => [tp.id, ...tp.subtopics.map(x => x.id)]));
      state.subjects = state.subjects.filter(x => x.id !== s); commit();
      break;
    }
    case 'move': {
      const i = state.subjects.findIndex(x => x.id === s), j = i + +d;
      if (j < 0 || j >= state.subjects.length) return;
      [state.subjects[i], state.subjects[j]] = [state.subjects[j], state.subjects[i]]; commit();
      break;
    }
    case 'add-subj': {
      const name = document.getElementById('newSubj').value.trim();
      if (!name) return;
      state.subjects.push({ id: uid(), name, color: document.getElementById('newSubjColor').value, topics: [] });
      commit();
      break;
    }
    case 'save-settings': {
      state.exam.name = document.getElementById('setExamName').value.trim() || 'EXAM';
      state.exam.date = document.getElementById('setExamDate').value || state.exam.date;
      const qs = document.getElementById('setQuotes').value.split('\n').map(x => x.trim()).filter(Boolean);
      state.quotes = qs.length ? qs : DEFAULT_QUOTES;
      save(); renderHeader(); toast('Saved!');
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a2 = document.createElement('a');
      a2.href = URL.createObjectURL(blob);
      a2.download = `${(state.exam.name || "review").toLowerCase()}-tracker-backup-${keyOf(today())}.json`;
      a2.click(); URL.revokeObjectURL(a2.href);
      break;
    }
    case 'import': document.getElementById('importFile').click(); break;
    case 'reset':
      if (confirm('Erase ALL subjects, topics and history? Export a backup first if unsure.')) {
        state = seed(); state.ui.tab = 'settings'; commit(); renderHeader(); toast('Reset done');
      }
      break;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  const { a, s, t, u, id } = el.dataset || {};
  switch (a) {
    case 'tick': {
      const k = keyOf(viewDay);
      state.log[k] = state.log[k] || {};
      if (el.checked) state.log[k][id] = true; else delete state.log[k][id];
      if (!(state.plan[k] || []).includes(id)) state.plan[k] = [...(state.plan[k] || []), id];
      cleanDay(k);
      commit();
      break;
    }
    case 'rename-subj': { const v = el.value.trim(); if (v) { findSubj(s).name = v; save(); } break; }
    case 'rename-topic': { const v = el.value.trim(); if (v) { findTopic(s, t).name = v; save(); } break; }
    case 'rename-sub': { const v = el.value.trim(); const st = findTopic(s, t).subtopics.find(x => x.id === u); if (v && st) { st.name = v; save(); } break; }
    case 'color': findSubj(s).color = el.value; commit(); break;
  }
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(txt => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.subjects)) throw new Error('bad file');
      state = normalize(data); commit(); renderHeader(); toast('Backup imported!');
    }).catch(() => toast('That file is not a valid backup.'));
  }
});

document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.classList?.contains('picker')) return;
  if (d.open) openPickers.add(d.dataset.s); else openPickers.delete(d.dataset.s);
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'newSubj') document.querySelector('[data-a="add-subj"]').click();
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id?.startsWith('add-')) {
    document.querySelector(`[data-a="add-topics"][data-s="${e.target.id.slice(4)}"]`)?.click();
  }
});

render();
tickClock();
setInterval(tickClock, 1000);
