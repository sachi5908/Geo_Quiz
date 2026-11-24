/* Geo PYQ Studio — study, practice and mock tests over the digitised PYQ bank. */
(function () {
  'use strict';
  const BANK = window.PYQ_BANK;
  const view = document.getElementById('view');
  if (!BANK) { view.innerHTML = '<div class="empty">Question data (data/bank.js) could not be loaded.</div>'; return; }

  // ---------- indexes ----------
  const Q = BANK.questions;
  const QBY = new Map(Q.map(q => [q.id, q]));
  const PAPERS = BANK.papers;
  const PBY = new Map(PAPERS.map(p => [p.id, p]));
  const byPaper = new Map();
  for (const q of Q) { if (!byPaper.has(q.p)) byPaper.set(q.p, []); byPaper.get(q.p).push(q); }
  const examOf = q => q.p.split('-')[0];
  const EXAMS = {
    NET: { name: 'CSIR NET', full: 'CSIR-UGC NET Earth, Atmospheric, Ocean & Planetary Sciences', color: 'var(--net)' },
    GATE: { name: 'GATE GG', full: 'GATE Geology & Geophysics', color: 'var(--gate)' },
    GSI: { name: 'UPSC GSI', full: 'UPSC Combined Geo-Scientist (GSI) Prelims & Mains', color: 'var(--gsi)' },
  };

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pyq-' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pyq-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  let attempts = store.get('attempts', {});   // id -> {s: selection, c: correct(bool|null), t: time, n: tries}
  let marks = store.get('marks', {});         // id -> 1 (bookmarked)
  const saveAttempts = () => store.set('attempts', attempts);
  const saveMarks = () => store.set('marks', marks);

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const optLabel = (q, i) => examOf(q) === 'NET' ? String(i + 1) : (examOf(q) === 'GSI' ? '(' + 'abcdef'[i] + ')' : LETTERS[i]);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800); }

  // inline formatting that keeps $math$ intact for KaTeX
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, (m, a) => /^_+$/.test(a) ? m : '<u>' + a + '</u>');
  }
  function md(text) {
    const lines = String(text || '').split('\n');
    const out = []; let i = 0;
    while (i < lines.length) {
      if (/^\s*\|.*\|\s*$/.test(lines[i])) {
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        let head = null, body = rows;
        if (rows.length > 1 && /^[\s|:-]+$/.test(rows[1])) { head = cells(rows[0]); body = rows.slice(2); }
        let h = '<table>';
        if (head) h += '<thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead>';
        h += '<tbody>' + body.map(r => '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
        out.push({ block: h });
      } else {
        out.push({ line: lines[i++] });
      }
    }
    let html = '', buf = [];
    const flush = () => { if (buf.length) { html += buf.map(inline).join('<br>'); buf = []; } };
    for (const o of out) { if (o.block) { flush(); html += o.block; } else if (o.line.trim() === '' && buf.length) { flush(); html += '<div style="height:.5em"></div>'; } else if (o.line.trim() !== '') buf.push(o.line); }
    flush();
    return html;
  }
  function typeset(root) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(root, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
      } catch (e) { /* leave raw TeX */ }
    } else if (!typeset._waiting) {
      typeset._waiting = true;
      window.addEventListener('katex-ready', () => { typeset._waiting = false; typeset(view); }, { once: true });
    }
  }

  // ---------- answers & grading ----------
  const keyOf = q => q.ans != null ? q.ans : (q.sug != null ? q.sug : null);
  const keyIsOfficial = q => q.ans != null;
  function parseRange(s) {
    const str = String(s).replace(/,/g, '');
    const m = str.match(/(-?\d*\.?\d+)\s*(?:to|–|-|—)\s*(-?\d*\.?\d+)/);
    if (m && !/^-/.test(str.trim().slice(1))) return [parseFloat(m[1]), parseFloat(m[2])];
    const v = parseFloat(str); return isNaN(v) ? null : [v, v];
  }
  function grade(q, sel) {
    if (q.dropped) return true;
    const key = keyOf(q);
    if (key == null || q.t === 'descriptive') return null;
    if (q.t === 'nat') {
      const r = parseRange(key); const v = parseFloat(sel);
      if (!r || isNaN(v)) return false;
      const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
      const tol = lo === hi ? Math.max(Math.abs(lo) * 0.01, 0.005) : 1e-9;
      return v >= lo - tol && v <= hi + tol;
    }
    const k = (Array.isArray(key) ? key : [key]).map(Number).sort();
    const s = (Array.isArray(sel) ? sel : [sel]).map(Number).sort();
    if (q.t === 'msq') return k.length === s.length && k.every((x, i) => x === s[i]);
    return k.includes(s[0]); // mcq (some keys list multiple acceptable options)
  }
  function keyText(q) {
    const key = keyOf(q);
    if (key == null) return '';
    if (q.t === 'nat') return String(key);
    return (Array.isArray(key) ? key : [key]).map(k => optLabel(q, k - 1)).join(', ');
  }
  function record(q, sel) {
    const c = grade(q, sel);
    const prev = attempts[q.id];
    attempts[q.id] = { s: sel, c, t: Date.now(), n: (prev ? prev.n : 0) + 1 };
    saveAttempts();
    return c;
  }

  // ---------- question rendering ----------
  function paperShort(p) {
    if (p.exam === 'NET') return 'NET ' + p.id.replace('NET-', '').replace(/-/g, ' ');
    if (p.exam === 'GATE') return 'GATE ' + p.year;
    return 'GSI ' + p.id.replace('GSI-', '').replace(/-/g, ' ');
  }
  function figHtml(q) {
    return (q.fig || []).map(f => `<div class="q-fig"><img loading="lazy" src="${esc(f.src)}" alt="${esc(f.alt || 'Figure')}"></div>`).join('');
  }
  function optInner(q, i) {
    const img = q.ofig && q.ofig[String(i)];
    const txt = q.opts[i] || '';
    return (txt ? inline(txt) : '') + (img ? `<div><img loading="lazy" src="${esc(img)}" alt="Option ${optLabel(q, i)}"></div>` : '');
  }
  function metaChips(q, showPaper) {
    const p = PBY.get(q.p);
    const bits = [];
    if (showPaper) bits.push(`<a class="chip ${p.exam}" href="#/paper/${encodeURIComponent(p.id)}">${esc(paperShort(p))}</a>`);
    if (q.secName) bits.push(`<span class="chip">${esc(q.secName)}</span>`);
    else if (p.exam === 'GSI' && p.stage === 'Mains' && q.sec) bits.push(`<span class="chip">Section ${esc(q.sec)}</span>`);
    bits.push(`<span>${esc(q.topic)}</span>`);
    if (q.m) bits.push(`<span>· ${q.m} mark${q.m == 1 ? '' : 's'}${q.neg ? ` (−${q.neg})` : ''}</span>`);
    if (q.t === 'msq') bits.push('<span class="chip warn">Multiple correct</span>');
    if (q.t === 'nat') bits.push('<span class="chip warn">Numerical answer</span>');
    if (q.legacy) bits.push('<span class="chip bad" title="Not yet re-checked against the source">Unverified OCR</span>');
    return bits.join(' ');
  }
  function revealHtml(q, correct) {
    const key = keyOf(q);
    let h = '';
    const cls = correct === true ? ' good' : correct === false ? ' bad' : '';
    if (q.dropped) h += `<div class="src">Official key</div><div class="ans">Question dropped — marks awarded to all</div>`;
    else if (q.t === 'descriptive') h += `<div class="src">Answer outline (study aid)</div>`;
    else if (key != null) h += `<div class="src">${keyIsOfficial(q) ? 'Official answer' : 'Suggested answer · unofficial'}</div><div class="ans">${correct === true ? '✓ Correct — ' : correct === false ? '✗ Incorrect — ' : ''}Answer: ${esc(keyText(q))}</div>`;
    else h += `<div class="src">No answer key available</div>`;
    if (q.why) h += `<p>${q.t === 'descriptive' ? q.why.split(/;\s*/).map(x => '• ' + inline(x)).join('<br>') : inline(q.why)}</p>`;
    if (q.dispute) h += `<p class="muted" style="font-size:13px">Note: the official key is disputed — ${inline(q.dispute)}</p>`;
    if (keyIsOfficial(q) && q.sug != null && JSON.stringify(q.sug) !== JSON.stringify(q.ans) && !q.dispute && q.t !== 'nat') h += '';
    return `<div class="reveal${cls}">${h}</div>`;
  }

  // Study card: interactive, answer immediately on click
  function studyCard(q, opts = {}) {
    const a = attempts[q.id];
    const el = document.createElement('article');
    el.className = 'q card'; el.id = 'q-' + q.id; el.dataset.id = q.id;
    const num = q.n.replace(/^0+/, '');
    el.innerHTML = `
      <div class="q-head"><span class="q-num">Q${esc(num)}</span>${metaChips(q, opts.showPaper)}
        <button class="mark-btn ${marks[q.id] ? 'on' : ''}" data-act="mark" title="Bookmark (B)" aria-label="Bookmark">${marks[q.id] ? '★' : '☆'}</button></div>
      <div class="q-text">${opts.hl ? highlight(md(q.text), opts.hl) : md(q.text)}</div>
      ${figHtml(q)}
      <div class="q-body"></div>`;
    const body = $('.q-body', el);
    const paint = (sel, locked) => {
      const correct = locked ? grade(q, sel) : null;
      const key = keyOf(q);
      let h = '';
      if (q.opts.length) {
        const keyArr = key == null ? [] : (Array.isArray(key) ? key : [key]).map(Number);
        const selArr = sel == null ? [] : (Array.isArray(sel) ? sel : [sel]).map(Number);
        h += '<div class="opts">' + q.opts.map((_, i) => {
          let c = '';
          if (locked) { if (keyArr.includes(i + 1) || q.dropped) c = 'right'; else if (selArr.includes(i + 1)) c = 'wrong'; }
          else if (selArr.includes(i + 1)) c = 'sel';
          return `<button class="opt ${c}" data-opt="${i + 1}" ${locked ? 'disabled' : ''}><span class="lab">${esc(optLabel(q, i).replace(/[()]/g, ''))}</span><span class="ot">${optInner(q, i)}</span></button>`;
        }).join('') + '</div>';
        if (q.t === 'msq' && !locked) h += `<div class="q-actions"><button class="btn small primary" data-act="check">Check answer</button><span class="muted" style="font-size:13px">Select all correct options</span></div>`;
      } else if (q.t === 'nat') {
        h += `<div class="nat"><input type="text" inputmode="decimal" placeholder="Your answer" value="${locked && sel != null ? esc(sel) : ''}" ${locked ? 'disabled' : ''}>${locked ? '' : '<button class="btn small primary" data-act="check">Check</button>'}</div>`;
      }
      if (locked) h += revealHtml(q, correct);
      else h += `<div class="q-actions"><button class="btn small ghost" data-act="show">${q.t === 'descriptive' ? 'Show answer outline' : 'Show answer'}</button></div>`;
      body.innerHTML = h;
      typeset(body);
    };
    let pending = [];
    if (a && a.s !== undefined && a.s !== null && opts.restore !== false) paint(a.s, true); else paint(null, false);
    el.addEventListener('click', e => {
      const b = e.target.closest('button, img'); if (!b) return;
      if (b.tagName === 'IMG') { lightbox(b.src); return; }
      if (b.dataset.act === 'mark') { toggleMark(q.id); b.classList.toggle('on', !!marks[q.id]); b.textContent = marks[q.id] ? '★' : '☆'; return; }
      if (b.dataset.act === 'show') { if (q.t === 'descriptive') { attempts[q.id] = { s: '', c: null, t: Date.now(), n: 1 }; saveAttempts(); } paint(null, true); return; }
      if (b.dataset.opt) {
        const v = Number(b.dataset.opt);
        if (q.t === 'msq') { pending = pending.includes(v) ? pending.filter(x => x !== v) : pending.concat(v); paint(pending, false); return; }
        const c = record(q, v); paint(v, true); if (opts.onAnswer) opts.onAnswer(q, c); return;
      }
      if (b.dataset.act === 'check') {
        let v;
        if (q.t === 'nat') { v = $('input', body).value.trim(); if (!v) return; } else { v = pending; if (!v.length) return; }
        const c = record(q, v); paint(v, true); if (opts.onAnswer) opts.onAnswer(q, c);
      }
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') $('[data-act=check]', el)?.click(); });
    return el;
  }
  function toggleMark(id) { if (marks[id]) delete marks[id]; else marks[id] = 1; saveMarks(); toast(marks[id] ? 'Bookmarked' : 'Bookmark removed'); }
  function lightbox(src) { const d = document.createElement('div'); d.className = 'lightbox'; d.innerHTML = `<img src="${esc(src)}" alt="">`; d.onclick = () => d.remove(); document.body.appendChild(d); }
  function highlight(html, term) {
    if (!term) return html;
    const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return html.replace(/(^|>)([^<]+)/g, (m, a, t) => a + t.replace(re, '<mark>$1</mark>'));
  }

  // render a long list of question cards incrementally
  function renderList(container, list, opts = {}) {
    container.innerHTML = '';
    if (!list.length) { container.innerHTML = '<div class="empty">No questions here yet.</div>'; return; }
    let i = 0; const CH = 25;
    const more = document.createElement('div');
    const step = () => {
      const frag = document.createDocumentFragment();
      for (const q of list.slice(i, i + CH)) frag.appendChild(studyCard(q, opts));
      i += CH; container.insertBefore(frag, more);
      if (i >= list.length) { more.remove(); io.disconnect(); }
    };
    container.appendChild(more);
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) step(); }, { rootMargin: '800px' });
    step(); if (i < list.length) io.observe(more);
    renderList.jump = id => { while (!document.getElementById('q-' + id) && i < list.length) step(); const el = document.getElementById('q-' + id); if (el) el.scrollIntoView({ block: 'start' }); };
  }

  // ---------- stats ----------
  function statsFor(list) {
    let done = 0, right = 0, graded = 0;
    for (const q of list) { const a = attempts[q.id]; if (a) { done++; if (a.c !== null && a.c !== undefined) { graded++; if (a.c) right++; } } }
    return { total: list.length, done, right, graded, acc: pct(right, graded) };
  }
  const progressBar = (a, b) => `<div class="bar"><i style="width:${pct(a, b)}%"></i></div>`;

  // ---------- views ----------
  function setNav(key) { $$('.topnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === key)); }

  function viewHome() {
    setNav('home');
    const s = statsFor(Q);
    const dueWrong = Object.entries(attempts).filter(([, a]) => a.c === false).length;
    const per = e => { const l = Q.filter(q => examOf(q) === e); return { l, s: statsFor(l), papers: PAPERS.filter(p => p.exam === e) }; };
    view.innerHTML = `
      <section class="hero">
        <div>
          <h1>Previous-year questions,<br>ready to study.</h1>
          <p class="lede">${Q.length.toLocaleString()} questions from ${PAPERS.length} papers of CSIR NET Earth Sciences, GATE Geology &amp; Geophysics and UPSC GSI — clean English text, answers and explanations, practice quizzes and timed mock tests.</p>
          <div class="row"><button class="btn primary" data-go="quick">⚡ Quick 10-question quiz</button><a class="btn" href="#/practice">Build a custom practice set</a></div>
        </div>
        <div class="stats">
          <div class="card stat"><b>${s.done.toLocaleString()}</b><span>questions attempted</span></div>
          <div class="card stat"><b>${s.graded ? s.acc + '%' : '—'}</b><span>accuracy</span></div>
          <div class="card stat"><b>${Object.keys(marks).length}</b><span>bookmarked</span></div>
          <div class="card stat"><b>${dueWrong}</b><span>mistakes to review</span></div>
        </div>
      </section>
      <h2>Choose an exam</h2>
      <div class="exam-grid">${Object.keys(EXAMS).map(e => { const x = per(e); return `
        <a class="card exam-card" style="--c:${EXAMS[e].color}" href="#/exam/${e}">
          <span class="chip ${e}" style="align-self:flex-start">${e}</span>
          <span class="big">${EXAMS[e].name}</span>
          <p>${esc(EXAMS[e].full)}</p>
          <p class="muted">${x.papers.length} papers · ${x.l.length.toLocaleString()} questions</p>
          ${progressBar(x.s.done, x.s.total)}
          <p class="muted" style="font-size:12.5px">${x.s.done} done${x.s.graded ? ` · ${x.s.acc}% correct` : ''}</p>
        </a>`; }).join('')}</div>
      <h2>Exam weightage — what to prioritise</h2>
      <div id="homeWeight">${homeWeightage()}</div>
      <h2>Ways to study</h2>
      <div class="action-grid">
        <a class="card action" href="#/practice"><div class="ico">🎯</div><b>Topic practice</b><span>Pick exam, topics and size</span></a>
        <a class="card action" href="#/mock"><div class="ico">⏱️</div><b>Mock test</b><span>Full paper, timed, with marking</span></a>
        <a class="card action" href="#/review"><div class="ico">🔁</div><b>Review mistakes</b><span>Retry what you got wrong</span></a>
        <a class="card action" href="#/analysis"><div class="ico">📊</div><b>Weightage analysis</b><span>Topic × year trends, priorities</span></a>
        <a class="card action" href="#/review/bookmarks"><div class="ico">★</div><b>Bookmarks</b><span>Your saved questions</span></a>
      </div>`;
    $('[data-go=quick]').onclick = () => startQuiz({ list: shuffle(Q.filter(q => q.t !== 'descriptive' && keyOf(q) != null)).slice(0, 10), mode: 'practice', title: 'Quick quiz' });
    const hw = $('#homeWeight');
    hw.addEventListener('click', e => { const b = e.target.closest('#hwExam button'); if (!b) return; store.set('homeExam', b.dataset.v); hw.innerHTML = homeWeightage(); });
  }

  function viewExam(exam) {
    setNav(exam);
    const ps = PAPERS.filter(p => p.exam === exam).sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
    const list = Q.filter(q => examOf(q) === exam);
    const topics = BANK.topics[exam] || [];
    const tab = store.get('examTab-' + exam, 'papers');
    view.innerHTML = `
      <div class="crumbs"><a href="#/">Home</a> / ${exam}</div>
      <h1>${EXAMS[exam].name}</h1>
      <p class="lede">${esc(EXAMS[exam].full)} · ${ps.length} papers · ${list.length.toLocaleString()} questions</p>
      <div class="row"><a class="btn primary" href="#/practice?exam=${exam}">🎯 Practise ${exam} questions</a><a class="btn" href="#/mock?exam=${exam}">⏱️ Mock test</a><a class="btn" href="#/analysis/${exam}">📊 Weightage analysis</a></div>
      <div class="tabs"><button data-tab="papers">Papers by year</button><button data-tab="topics">Topics</button></div>
      <div id="tabBody"></div>`;
    const draw = t => {
      store.set('examTab-' + exam, t);
      $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
      const body = $('#tabBody');
      if (t === 'papers') {
        const years = [...new Set(ps.map(p => p.year))];
        body.innerHTML = years.map(y => `<div class="year-group"><h3>${y}</h3><div class="list">${ps.filter(p => p.year === y).map(p => {
          const st = statsFor(byPaper.get(p.id) || []);
          return `<a class="card item" href="#/paper/${encodeURIComponent(p.id)}"><span class="t">${esc(p.title.replace(/^(CSIR NET Earth Sciences|GATE Geology & Geophysics|UPSC GSI \(CGGE\)) ?/, '') || p.title)}</span>
            <span class="s"><span>${p.count} questions</span>${p.status === 'legacy' ? '<span class="chip bad">unverified</span>' : ''}${st.done ? `<span>${st.done} done${st.graded ? ' · ' + st.acc + '%' : ''}</span>` : ''}</span>${progressBar(st.done, st.total)}</a>`;
        }).join('')}</div></div>`).join('');
      } else {
        body.innerHTML = `<div class="list">${topics.map(tp => {
          const l = list.filter(q => q.topic === tp); const st = statsFor(l);
          return `<a class="card item" href="#/topic/${exam}/${encodeURIComponent(tp)}"><span class="t">${esc(tp)}</span><span class="s"><span>${l.length} questions</span>${st.done ? `<span>${st.done} done${st.graded ? ' · ' + st.acc + '%' : ''}</span>` : ''}</span>${progressBar(st.done, st.total)}</a>`;
        }).join('')}</div>`;
      }
    };
    $$('.tabs button').forEach(b => b.onclick = () => draw(b.dataset.tab));
    draw(tab);
  }

  function listPage({ crumbs, title, sub, list, showPaper, paper }) {
    const secs = [...new Set(list.map(q => q.secName || (q.sec && paper && paper.stage === 'Mains' ? 'Section ' + q.sec : '')).filter(Boolean))];
    const topics = [...new Set(list.map(q => q.topic))].sort();
    const st = statsFor(list);
    view.innerHTML = `
      <div class="crumbs">${crumbs}</div>
      <h1>${esc(title)}</h1>
      <p class="lede">${sub} · ${st.done}/${list.length} attempted${st.graded ? ' · ' + st.acc + '% correct' : ''}</p>
      <div class="row" style="margin-bottom:6px">
        ${list.some(q => q.t !== 'descriptive') ? '<button class="btn primary" data-go="practice">▶ Practise one by one</button>' : ''}
        ${paper && list.some(q => q.t !== 'descriptive') ? '<button class="btn" data-go="mock">⏱️ Take as timed mock</button>' : ''}
        <button class="btn ghost" data-go="reset">Clear my answers here</button>
      </div>
      <div class="toolbar">
        ${secs.length > 1 ? `<select id="fSec"><option value="">All sections</option>${secs.map(s => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
        ${topics.length > 1 && paper ? `<select id="fTopic"><option value="">All topics</option>${topics.map(s => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
        <select id="fState"><option value="">All questions</option><option value="new">Not attempted</option><option value="wrong">Got wrong</option><option value="marked">Bookmarked</option></select>
        <span class="spacer"></span>
        <button class="btn small" id="hideAns" title="Hide revealed answers to re-attempt">Hide answers</button>
        <input type="number" id="jump" placeholder="Go to Q#" style="width:110px" min="1">
      </div>
      <div id="qlist"></div>`;
    let restore = true;
    const apply = () => {
      const fs = $('#fSec')?.value, ft = $('#fTopic')?.value, fst = $('#fState').value;
      const l = list.filter(q => (!fs || (q.secName || 'Section ' + q.sec) === fs) && (!ft || q.topic === ft) &&
        (!fst || (fst === 'new' && !attempts[q.id]) || (fst === 'wrong' && attempts[q.id]?.c === false) || (fst === 'marked' && marks[q.id])));
      renderList($('#qlist'), l, { showPaper, restore });
    };
    $$('.toolbar select').forEach(s => s.onchange = apply);
    $('#hideAns').onclick = () => { restore = !restore; $('#hideAns').textContent = restore ? 'Hide answers' : 'Show my answers'; apply(); };
    $('#jump').onchange = e => { const v = e.target.value.trim(); const q = list.find(x => x.n.replace(/^0+/, '') === v || x.n.startsWith(v + '(')); if (q) renderList.jump(q.id); else toast('No question ' + v); };
    const go = $('[data-go=practice]'); if (go) go.onclick = () => startQuiz({ list: list.filter(q => q.t !== 'descriptive'), mode: 'practice', title });
    const mk = $('[data-go=mock]'); if (mk) mk.onclick = () => setupMock(paper.id);
    $('[data-go=reset]').onclick = () => { if (!confirm('Clear your recorded answers for these ' + list.length + ' questions?')) return; list.forEach(q => delete attempts[q.id]); saveAttempts(); route(); };
    apply();
  }

  function viewPaper(id) {
    const p = PBY.get(id); if (!p) return notFound();
    setNav(p.exam);
    listPage({
      crumbs: `<a href="#/">Home</a> / <a href="#/exam/${p.exam}">${p.exam}</a> / ${p.year}`,
      title: p.title, paper: p,
      sub: `${p.count} questions${p.status === 'legacy' ? ' · <span class="chip bad">text not yet verified</span>' : ''}`,
      list: byPaper.get(id) || [],
    });
  }
  function viewTopic(exam, topic) {
    setNav(exam);
    const list = Q.filter(q => examOf(q) === exam && q.topic === topic).sort((a, b) => PBY.get(b.p).year - PBY.get(a.p).year);
    listPage({ crumbs: `<a href="#/">Home</a> / <a href="#/exam/${exam}">${exam}</a> / Topics`, title: topic, sub: `${EXAMS[exam].name} · ${list.length} questions, newest first`, list, showPaper: true });
  }
  function viewSearch(term) {
    setNav('');
    const t = term.trim().toLowerCase();
    const words = t.split(/\s+/).filter(Boolean);
    const list = t ? Q.filter(q => { const s = (q.text + ' ' + q.opts.join(' ') + ' ' + q.topic).toLowerCase(); return words.every(w => s.includes(w)); }) : [];
    view.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / Search</div><h1>“${esc(term)}”</h1><p class="lede">${list.length} matching question${list.length === 1 ? '' : 's'}${list.length > 300 ? ' (showing all, loading as you scroll)' : ''}</p><div id="qlist"></div>`;
    renderList($('#qlist'), list, { showPaper: true, hl: words.sort((a, b) => b.length - a.length)[0] });
  }
  function viewReview(which) {
    setNav('review');
    const wrong = Q.filter(q => attempts[q.id]?.c === false);
    const marked = Q.filter(q => marks[q.id]);
    const cur = which === 'bookmarks' ? marked : wrong;
    view.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / Review</div><h1>Review</h1>
      <div class="tabs"><button class="${which !== 'bookmarks' ? 'on' : ''}" data-h="#/review">Mistakes (${wrong.length})</button><button class="${which === 'bookmarks' ? 'on' : ''}" data-h="#/review/bookmarks">Bookmarks (${marked.length})</button><button data-h="#/progress">My progress</button></div>
      <div class="row" style="margin-bottom:14px">${cur.length ? `<button class="btn primary" id="retry">▶ Re-attempt these ${cur.length} as a quiz</button>` : ''}</div>
      <div id="qlist"></div>`;
    $$('.tabs button').forEach(b => b.onclick = () => location.hash = b.dataset.h);
    if ($('#retry')) $('#retry').onclick = () => startQuiz({ list: shuffle(cur.filter(q => q.t !== 'descriptive')), mode: 'practice', title: which === 'bookmarks' ? 'Bookmarks' : 'Mistakes review', fresh: true });
    if (!cur.length) $('#qlist').innerHTML = `<div class="empty">${which === 'bookmarks' ? 'No bookmarks yet — tap ☆ on any question.' : 'No mistakes recorded yet. Questions you get wrong will appear here.'}</div>`;
    else renderList($('#qlist'), cur, { showPaper: true });
  }
  function viewProgress() {
    setNav('review');
    const rows = [];
    for (const e of Object.keys(EXAMS)) for (const tp of BANK.topics[e] || []) {
      const l = Q.filter(q => examOf(q) === e && q.topic === tp); const s = statsFor(l);
      if (s.done) rows.push({ e, tp, ...s });
    }
    rows.sort((a, b) => a.acc - b.acc);
    view.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / <a href="#/review">Review</a> / Progress</div><h1>My progress</h1>
      <p class="lede">Weakest topics first — practise these next. Progress is stored only in this browser.</p>
      ${rows.length ? `<div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Exam</th><th>Topic</th><th>Done</th><th>Accuracy</th><th></th></tr></thead><tbody>${rows.map(r => `
        <tr><td><span class="chip ${r.e}">${r.e}</span></td><td>${esc(r.tp)}</td><td>${r.done}/${r.total}</td><td>${r.graded ? r.acc + '%' : '—'}</td><td><a href="#/topic/${r.e}/${encodeURIComponent(r.tp)}">Study →</a></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Answer some questions to see your progress.</div>'}
      <h2>Backup</h2>
      <div class="row"><button class="btn" id="exp">Export progress</button><label class="btn">Import progress<input type="file" id="imp" accept=".json" hidden></label><button class="btn ghost" id="wipe">Reset everything</button></div>`;
    $('#exp').onclick = () => { const b = new Blob([JSON.stringify({ attempts, marks })], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'pyq-progress.json'; a.click(); };
    $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); attempts = d.attempts || {}; marks = d.marks || {}; saveAttempts(); saveMarks(); toast('Progress imported'); route(); } catch (err) { toast('Not a valid progress file'); } }); };
    $('#wipe').onclick = () => { if (confirm('Delete all your answers and bookmarks?')) { attempts = {}; marks = {}; saveAttempts(); saveMarks(); route(); } };
  }

  // ---------- practice setup ----------
  function viewPractice(params) {
    setNav('');
    let exam = params.get('exam') || store.get('pExam', 'NET');
    const state = { size: store.get('pSize', 20), filter: store.get('pFilter', 'all'), mode: store.get('pMode', 'practice'), keyed: store.get('pKeyed', true) };
    const draw = () => {
      const topics = BANK.topics[exam] || [];
      const papers = PAPERS.filter(p => p.exam === exam).sort((a, b) => b.year - a.year);
      view.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / Practice</div><h1>Build a practice set</h1>
        <p class="lede">Mix questions by exam, topic, year and status. Practice mode shows the answer after each question; test mode scores at the end.</p>
        <div class="card setup">
          <div class="row"><span class="muted" style="font-weight:600;font-size:13px;width:70px">Exam</span><div class="seg" id="sExam">${Object.keys(EXAMS).map(e => `<button data-v="${e}" class="${e === exam ? 'on' : ''}">${e}</button>`).join('')}</div></div>
          <div class="grid2">
            <label class="field">Topic<select id="sTopic"><option value="">All topics</option>${topics.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
            <label class="field">Year from<select id="sFrom">${[...new Set(papers.map(p => p.year))].sort().map(y => `<option>${y}</option>`).join('')}</select></label>
            <label class="field">Paper<select id="sPaper"><option value="">Any paper</option>${papers.map(p => `<option value="${p.id}">${esc(paperShort(p))}</option>`).join('')}</select></label>
            <label class="field">Questions<select id="sSize">${[10, 20, 30, 50, 100].map(n => `<option ${n == state.size ? 'selected' : ''}>${n}</option>`).join('')}<option value="9999" ${state.size == 9999 ? 'selected' : ''}>All matching</option></select></label>
            <label class="field">Include<select id="sFilter"><option value="all">All questions</option><option value="new">Only not attempted</option><option value="wrong">Only my mistakes</option><option value="marked">Only bookmarks</option></select></label>
            <label class="field">Mode<select id="sMode"><option value="practice">Practice — instant feedback</option><option value="test">Test — score at the end</option></select></label>
          </div>
          <label class="row" style="font-size:14px"><input type="checkbox" id="sKeyed" ${state.keyed ? 'checked' : ''}> Only questions with an official answer key</label>
          <div class="row"><button class="btn primary" id="go">Start</button><span class="muted" id="count"></span></div>
        </div>`;
      $('#sFilter').value = state.filter; $('#sMode').value = state.mode;
      $$('#sExam button').forEach(b => b.onclick = () => { exam = b.dataset.v; store.set('pExam', exam); draw(); });
      const pick = () => {
        const tp = $('#sTopic').value, from = +$('#sFrom').value, pp = $('#sPaper').value, f = $('#sFilter').value, keyed = $('#sKeyed').checked;
        return Q.filter(q => examOf(q) === exam && q.t !== 'descriptive' && (!tp || q.topic === tp) && PBY.get(q.p).year >= from && (!pp || q.p === pp) &&
          (!keyed || q.ans != null) && (f === 'all' || (f === 'new' && !attempts[q.id]) || (f === 'wrong' && attempts[q.id]?.c === false) || (f === 'marked' && marks[q.id])));
      };
      const upd = () => { const n = pick().length; $('#count').textContent = `${n} matching question${n === 1 ? '' : 's'}`; $('#go').disabled = !n; };
      $$('.setup select, .setup input').forEach(x => x.onchange = upd); upd();
      $('#go').onclick = () => {
        const size = +$('#sSize').value, mode = $('#sMode').value;
        store.set('pSize', size); store.set('pFilter', $('#sFilter').value); store.set('pMode', mode); store.set('pKeyed', $('#sKeyed').checked);
        startQuiz({ list: shuffle(pick()).slice(0, size), mode, title: ($('#sTopic').value || exam + ' mixed') + ' practice', fresh: true });
      };
    };
    draw();
  }

  // ---------- mock tests ----------
  const MOCK_TIME = { NET: 180, GATE: 180, GSI: 120 };
  function setupMock(pid, part) {
    const p = PBY.get(pid);
    let list = (byPaper.get(pid) || []).filter(q => q.t !== 'descriptive');
    if (p.exam === 'GATE' && list.some(q => q.sec === 'GEOPHYSICS') && list.some(q => q.sec === 'GEOLOGY')) {
      if (!part) { location.hash = '#/mock?exam=GATE&paper=' + pid; return; }
      list = list.filter(q => q.sec !== (part === 'GEOLOGY' ? 'GEOPHYSICS' : 'GEOLOGY'));
    }
    const mins = p.exam === 'NET' ? 180 : p.exam === 'GATE' ? 180 : 120;
    startQuiz({ list, mode: 'test', title: p.title + ' — mock test', timer: mins * 60, fresh: true, marking: true, paper: pid });
  }
  function viewMock(params) {
    setNav('');
    const exam = params.get('exam');
    const ps = PAPERS.filter(p => (!exam || p.exam === exam) && (byPaper.get(p.id) || []).some(q => q.t !== 'descriptive')).sort((a, b) => b.year - a.year);
    view.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / Mock test</div><h1>Mock test</h1>
      <p class="lede">Attempt a full previous paper under time pressure. Marking follows the paper (negative marks where printed). NET: 3 h · GATE: 3 h · GSI Prelims: 2 h.
      Note: in the real NET you answer only a subset of Parts A/B/C — here all questions are shown; attempt the number your exam requires.</p>
      <div class="row" style="margin-bottom:16px">${['', 'NET', 'GATE', 'GSI'].map(e => `<a class="btn small ${e === (exam || '') ? 'primary' : ''}" href="#/mock${e ? '?exam=' + e : ''}">${e || 'All'}</a>`).join('')}</div>
      <div class="list">${ps.map(p => `<button class="card item" data-p="${p.id}" style="text-align:left;cursor:pointer"><span class="t">${esc(p.title)}</span><span class="s">${(byPaper.get(p.id) || []).filter(q => q.t !== 'descriptive').length} questions · ${MOCK_TIME[p.exam]} min</span></button>`).join('')}</div>`;
    $$('[data-p]').forEach(b => b.onclick = () => setupMock(b.dataset.p));
    const gp = params.get('paper');
    if (gp && PBY.get(gp)) {
      const box = document.createElement('div');
      box.className = 'lightbox'; box.style.cursor = 'default';
      box.innerHTML = `<div class="card setup" style="max-width:420px"><h3>${esc(PBY.get(gp).title)}</h3><p class="muted" style="margin:0">GATE GG = General Aptitude + Part A (common) + one of Part B1 or B2. Which part do you take?</p>
        <div class="row"><button class="btn primary" data-part="GEOLOGY">Part B1 · Geology</button><button class="btn primary" data-part="GEOPHYSICS">Part B2 · Geophysics</button></div>
        <button class="btn ghost small" data-part="">Cancel</button></div>`;
      box.onclick = e => { const b = e.target.closest('[data-part]'); if (!b) return; box.remove(); if (b.dataset.part) setupMock(gp, b.dataset.part); else history.replaceState(null, '', '#/mock?exam=GATE'); };
      document.body.appendChild(box);
    }
  }

  // ---------- quiz runner ----------
  let QZ = null;
  function startQuiz(cfg) {
    if (!cfg.list.length) { toast('No questions to practise'); return; }
    QZ = { ...cfg, i: 0, sel: {}, done: {}, flag: {}, start: Date.now(), left: cfg.timer || 0 };
    location.hash = '#/quiz';
    if (location.hash === '#/quiz') route();
  }
  function viewQuiz() {
    if (!QZ) { location.hash = '#/'; return; }
    setNav('');
    const z = QZ;
    view.innerHTML = `
      <div class="quiz-top">
        <button class="btn small ghost" id="qExit">✕ Exit</button>
        <b style="flex:1;min-width:200px">${esc(z.title)}</b>
        ${z.timer ? '<span class="timer" id="qTimer"></span>' : ''}
        ${z.mode === 'test' ? '<button class="btn small primary" id="qSubmit">Submit test</button>' : ''}
      </div>
      <div class="progress"><i id="qProg"></i></div>
      <div class="quiz-wrap">
        <div><div id="qCard"></div>
          <div class="quiz-nav"><button class="btn" id="qPrev">← Previous</button><span class="spacer"></span>
            ${z.mode === 'test' ? '<button class="btn ghost" id="qClear">Clear</button><button class="btn ghost" id="qFlag">⚑ Mark for review</button>' : ''}
            <button class="btn primary" id="qNext">Next →</button></div>
          <div class="kbd"><kbd>1</kbd>–<kbd>4</kbd> choose · <kbd>←</kbd>/<kbd>→</kbd> move · <kbd>B</kbd> bookmark${z.mode === 'test' ? ' · <kbd>M</kbd> mark for review' : ''}</div>
        </div>
        <aside class="card palette"><b style="font-size:14px">Questions</b><div class="grid" id="qPal" style="margin-top:10px"></div>
          <div class="legend"><span>■ answered${z.mode === 'practice' ? ' — green right, red wrong' : ''}</span>${z.mode === 'test' ? '<span>▁ orange underline = marked for review</span>' : ''}</div></aside>
      </div>`;
    $('#qExit').onclick = () => { if (z.mode === 'test' && Object.keys(z.sel).length && !confirm('Leave this test? Your answers in this test will be lost.')) return; stopTimer(); QZ = null; history.back(); };
    $('#qPrev').onclick = () => move(-1);
    $('#qNext').onclick = () => { if (z.i === z.list.length - 1) { if (z.mode === 'test') submitQuiz(); else finishPractice(); } else move(1); };
    if ($('#qSubmit')) $('#qSubmit').onclick = () => { const un = z.list.length - Object.keys(z.sel).length; if (confirm(`Submit test?${un ? ` ${un} question(s) unanswered.` : ''}`)) submitQuiz(); };
    if ($('#qFlag')) $('#qFlag').onclick = () => { const id = z.list[z.i].id; z.flag[id] = !z.flag[id]; drawPal(); };
    if ($('#qClear')) $('#qClear').onclick = () => { delete z.sel[z.list[z.i].id]; drawQ(); };
    $('#qPal').onclick = e => { const b = e.target.closest('button'); if (b) { z.i = +b.dataset.i; drawQ(); } };
    if (z.timer) startTimer();
    drawQ();
  }
  function move(d) { const z = QZ; z.i = Math.max(0, Math.min(z.list.length - 1, z.i + d)); drawQ(); }
  function drawPal() {
    const z = QZ;
    $('#qPal').innerHTML = z.list.map((q, i) => {
      let c = '';
      if (z.mode === 'practice' && z.done[q.id] !== undefined) c = z.done[q.id] === true ? 'right' : z.done[q.id] === false ? 'wrong' : 'ans';
      else if (z.sel[q.id] !== undefined) c = 'ans';
      return `<button data-i="${i}" class="${c} ${z.flag[q.id] ? 'flag' : ''} ${i === z.i ? 'cur' : ''}" title="Q${esc(q.n)}">${i + 1}</button>`;
    }).join('');
    $('#qProg').style.width = pct(Object.keys(z.mode === 'practice' ? z.done : z.sel).length, z.list.length) + '%';
    const cur = $('#qPal .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function drawQ() {
    const z = QZ; const q = z.list[z.i]; const box = $('#qCard');
    $('#qPrev').disabled = z.i === 0;
    $('#qNext').textContent = z.i === z.list.length - 1 ? (z.mode === 'test' ? 'Finish & submit' : 'Finish') : 'Next →';
    if (z.mode === 'practice') {
      const card = studyCard(q, { showPaper: true, restore: false, onAnswer: (qq, c) => { z.done[qq.id] = c; drawPal(); } });
      if (z.done[q.id] !== undefined) { box.innerHTML = ''; box.appendChild(studyCard(q, { showPaper: true, restore: true })); }
      else { box.innerHTML = ''; box.appendChild(card); }
      $('.q-num', box).textContent = `Question ${z.i + 1} of ${z.list.length}`;
    } else {
      box.innerHTML = '';
      const el = document.createElement('article'); el.className = 'q card';
      const sel = z.sel[q.id];
      el.innerHTML = `<div class="q-head"><span class="q-num">Question ${z.i + 1} of ${z.list.length}</span>${metaChips(q, !z.paper)}</div>
        <div class="q-text">${md(q.text)}</div>${figHtml(q)}
        ${q.opts.length ? '<div class="opts">' + q.opts.map((_, i) => { const on = Array.isArray(sel) ? sel.includes(i + 1) : sel === i + 1; return `<button class="opt ${on ? 'sel' : ''}" data-opt="${i + 1}"><span class="lab">${esc(optLabel(q, i).replace(/[()]/g, ''))}</span><span class="ot">${optInner(q, i)}</span></button>`; }).join('') + '</div>' : ''}
        ${q.t === 'nat' ? `<div class="nat"><input type="text" inputmode="decimal" placeholder="Type your numerical answer" value="${sel != null ? esc(sel) : ''}"></div>` : ''}`;
      el.addEventListener('click', e => {
        const b = e.target.closest('.opt, img'); if (!b) return;
        if (b.tagName === 'IMG') { lightbox(b.src); return; }
        const v = +b.dataset.opt;
        if (q.t === 'msq') { const cur = Array.isArray(z.sel[q.id]) ? z.sel[q.id] : []; const nx = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v); if (nx.length) z.sel[q.id] = nx; else delete z.sel[q.id]; }
        else z.sel[q.id] = v;
        drawQ();
      });
      const inp = $('input', el); if (inp) inp.oninput = () => { if (inp.value.trim()) z.sel[q.id] = inp.value.trim(); else delete z.sel[q.id]; drawPal(); };
      box.appendChild(el); typeset(el);
    }
    drawPal();
    window.scrollTo({ top: 0 });
  }
  function startTimer() {
    stopTimer();
    const tick = () => {
      const z = QZ; if (!z) return stopTimer();
      const left = z.timer - Math.floor((Date.now() - z.start) / 1000);
      const t = $('#qTimer'); if (!t) return stopTimer();
      if (left <= 0) { stopTimer(); toast('Time is up!'); submitQuiz(); return; }
      const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
      t.textContent = (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      t.classList.toggle('low', left < 300);
    };
    tick(); startTimer.h = setInterval(tick, 1000);
  }
  function stopTimer() { clearInterval(startTimer.h); }
  function finishPractice() {
    const z = QZ; const vals = Object.values(z.done);
    const right = vals.filter(v => v === true).length, wrong = vals.filter(v => v === false).length;
    showResults({ title: z.title, total: z.list.length, right, wrong, skipped: z.list.length - vals.length, list: z.list, sel: Object.fromEntries(z.list.map(q => [q.id, attempts[q.id]?.s])), scored: null, cfg: z });
  }
  function submitQuiz() {
    const z = QZ; stopTimer();
    let right = 0, wrong = 0, score = 0, max = 0;
    for (const q of z.list) {
      const m = q.m || (examOf(q) === 'NET' ? (q.sec === 'A' ? 2 : q.sec === 'B' ? 2 : 4) : 1);
      max += m;
      const s = z.sel[q.id];
      if (s === undefined) continue;
      const c = record(q, s);
      if (c === true) { right++; score += m; }
      else if (c === false) { wrong++; score -= (q.neg != null ? q.neg : 0); }
    }
    const mins = Math.round((Date.now() - z.start) / 60000);
    showResults({ title: z.title, total: z.list.length, right, wrong, skipped: z.list.length - right - wrong, list: z.list, sel: z.sel, scored: { score: Math.round(score * 100) / 100, max, mins }, cfg: z });
  }
  function showResults(r) {
    QZ = null;
    location.hash = '#/results';
    view.innerHTML = `<div class="crumbs"><a href="#/">Home</a> / Results</div><h1>${esc(r.title)}</h1>
      <div class="card score-ring">
        <div><div class="big">${r.scored ? r.scored.score : pct(r.right, r.right + r.wrong) + '%'}</div><div class="muted">${r.scored ? 'marks out of ' + r.scored.max : 'accuracy'}</div></div>
        <div class="kv"><div><b style="color:var(--good)">${r.right}</b><span>correct</span></div><div><b style="color:var(--bad)">${r.wrong}</b><span>wrong</span></div><div><b>${r.skipped}</b><span>skipped</span></div>${r.scored ? `<div><b>${r.scored.mins} min</b><span>time taken</span></div>` : ''}</div>
      </div>
      <div class="row" style="margin:16px 0"><button class="btn primary" id="again">Try again</button>${r.wrong ? '<button class="btn" id="retryWrong">Retry the wrong ones</button>' : ''}<a class="btn ghost" href="#/">Home</a></div>
      <h2>Topic breakdown</h2><div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Topic</th><th>Correct</th><th>Wrong</th><th>Skipped</th></tr></thead><tbody id="tb"></tbody></table></div>
      <h2>Review answers</h2><div id="qlist"></div>`;
    const by = {};
    for (const q of r.list) { const b = by[q.topic] = by[q.topic] || [0, 0, 0]; const s = r.sel[q.id]; const c = s === undefined || s === null ? null : grade(q, s); if (c === true) b[0]++; else if (c === false) b[1]++; else b[2]++; }
    $('#tb').innerHTML = Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).map(([t, b]) => `<tr><td>${esc(t)}</td><td>${b[0]}</td><td>${b[1]}</td><td>${b[2]}</td></tr>`).join('');
    renderList($('#qlist'), r.list, { showPaper: true });
    $('#again').onclick = () => startQuiz({ ...r.cfg, list: r.cfg.mode === 'test' ? r.cfg.list : shuffle(r.cfg.list) });
    if ($('#retryWrong')) $('#retryWrong').onclick = () => startQuiz({ list: r.list.filter(q => { const s = r.sel[q.id]; return s != null && grade(q, s) === false; }), mode: 'practice', title: 'Retry wrong answers' });
    typeset(view);
  }

  // ---------- weightage analysis ----------
  const TRACKS = {
    NET: [
      { k: 'all', label: 'Whole paper', f: () => true },
      { k: 'A', label: 'Part A', f: q => q.sec === 'A' },
      { k: 'B', label: 'Part B', f: q => q.sec === 'B' },
      { k: 'C', label: 'Part C', f: q => q.sec === 'C' },
    ],
    GATE: [
      { k: 'geo', label: 'Geology track (GA + Part A + B1)', f: q => q.sec !== 'GEOPHYSICS' },
      { k: 'gph', label: 'Geophysics track (GA + Part A + B2)', f: q => q.sec !== 'GEOLOGY' },
    ],
    GSI: [
      { k: 'p2', label: 'Prelims Paper II · Geology', f: q => /Prelims-II$/.test(q.p) },
      { k: 'p1', label: 'Prelims Paper I · General Studies', f: q => /Prelims-I$/.test(q.p) },
      { k: 'mains', label: 'Mains (Papers I–III)', f: q => /Mains/.test(q.p) },
    ],
  };
  const TRACK_NOTE = {
    NET: 'NET Earth Sciences is common to geology, geophysics, meteorology and oceanography candidates: you answer 15 of 20 in Part A, 35 of 50 in Part B and 25 of 80 in Part C, so you can skip whole subjects. Use the shares to choose which subjects to master.',
    GATE: 'Everyone answers General Aptitude and Part A; then you choose Part B1 (Geology) or B2 (Geophysics). Pick your track above. GATE 2023–2026 sources contain only the Geology paper, so the Geophysics track has fewer recent years.',
    GSI: 'Prelims Paper II and Mains decide the merit list; Paper I (General Studies) is qualifying-style breadth. Mains questions are descriptive, so weightage is by marks.',
  };
  function columnOf(q) {
    const p = PBY.get(q.p);
    if (p.exam === 'NET') {
      const m = p.id.match(/NET-(\d{4})-(June|December)(?:-(\w+))?/);
      return { key: p.id, label: `${m[1].slice(2)} ${m[2] === 'June' ? 'Jun' : 'Dec'}${m[3] ? ' ' + m[3].replace('Feb', 'F').replace('Mar', 'M') : ''}`, order: p.year * 10 + (m[2] === 'June' ? 1 : 2) + (m[3] === '2Mar' ? 0.5 : 0) };
    }
    return { key: String(p.year), label: String(p.year), order: p.year };
  }
  const markOf = q => q.m || (examOf(q) === 'NET' ? (q.sec === 'C' ? 4 : 2) : 1);
  function analyse(exam, trackKey) {
    const track = (TRACKS[exam].find(t => t.k === trackKey) || TRACKS[exam][0]);
    const list = Q.filter(q => examOf(q) === exam && track.f(q));
    const colMap = new Map();
    for (const q of list) { const c = columnOf(q); if (!colMap.has(c.key)) colMap.set(c.key, c); }
    const cols = [...colMap.values()].sort((a, b) => a.order - b.order);
    const total = list.reduce((s, q) => s + markOf(q), 0);
    const colTotal = {}; for (const q of list) { const k = columnOf(q).key; colTotal[k] = (colTotal[k] || 0) + markOf(q); }
    const recentN = Math.max(3, Math.ceil(cols.length / 3));
    const recent = new Set(cols.slice(-recentN).map(c => c.key));
    const byTopic = new Map();
    for (const q of list) {
      if (!byTopic.has(q.topic)) byTopic.set(q.topic, { topic: q.topic, qs: [], marks: 0, cells: {}, cellMarks: {} });
      const t = byTopic.get(q.topic); const k = columnOf(q).key; const m = markOf(q);
      t.qs.push(q); t.marks += m; t.cells[k] = (t.cells[k] || 0) + 1; t.cellMarks[k] = (t.cellMarks[k] || 0) + m;
    }
    const recentTotal = cols.filter(c => recent.has(c.key)).reduce((s, c) => s + colTotal[c.key], 0);
    const oldTotal = total - recentTotal;
    const topics = [...byTopic.values()].map(t => {
      const asked = cols.filter(c => t.cells[c.key]).length;
      const recentM = cols.filter(c => recent.has(c.key)).reduce((s, c) => s + (t.cellMarks[c.key] || 0), 0);
      const rShare = recentTotal ? recentM / recentTotal : 0, oShare = oldTotal ? (t.marks - recentM) / oldTotal : rShare;
      let trend = 'steady';
      if (oldTotal && rShare - oShare >= 0.01 && rShare >= oShare * 1.3) trend = 'rising';
      else if (oldTotal && oShare - rShare >= 0.01 && rShare <= oShare * 0.7) trend = 'falling';
      const share = total ? t.marks / total : 0;
      const last = [...cols].reverse().find(c => t.cells[c.key]);
      const st = statsFor(t.qs);
      return { ...t, share, asked, consistency: cols.length ? asked / cols.length : 0, perPaper: cols.length ? t.marks / cols.length : 0,
        qPerPaper: cols.length ? t.qs.length / cols.length : 0, trend, rShare, oShare, last: last ? last.label : '—', st,
        score: share * (0.6 + 0.4 * (cols.length ? asked / cols.length : 0)) * (trend === 'rising' ? 1.15 : trend === 'falling' ? 0.85 : 1) };
    }).sort((a, b) => b.score - a.score);
    let cum = 0;
    for (const t of topics) { t.tier = cum < 0.5 ? 'Must do' : cum < 0.8 ? 'High' : cum < 0.95 ? 'Medium' : 'Low'; cum += t.share; }
    const types = {}; for (const q of list) types[q.t] = (types[q.t] || 0) + 1;
    return { exam, track, list, cols, total, topics, types, colTotal, recentN };
  }
  const TIER_CLS = { 'Must do': 'tier-1', High: 'tier-2', Medium: 'tier-3', Low: 'tier-4' };
  const trendHtml = t => t.trend === 'rising' ? `<span class="trend up" title="Recent share ${(t.rShare * 100).toFixed(1)}% vs earlier ${(t.oShare * 100).toFixed(1)}%">▲ rising</span>`
    : t.trend === 'falling' ? `<span class="trend down" title="Recent share ${(t.rShare * 100).toFixed(1)}% vs earlier ${(t.oShare * 100).toFixed(1)}%">▼ falling</span>` : '<span class="trend">— steady</span>';
  const pctTxt = x => (x * 100 >= 10 ? Math.round(x * 100) : (x * 100).toFixed(1)) + '%';
  // sequential blue ramp (light -> dark) for the heatmap
  const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  const seqColor = (v, max) => v ? SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 0.001)))] : '';

  function weightBars(a, n, exam) {
    const top = a.topics.slice(0, n);
    const max = Math.max(...top.map(t => t.share), 0.0001);
    return `<div class="wbars">${top.map(t => `
      <a class="wbar" href="#/topic/${exam}/${encodeURIComponent(t.topic)}" title="${esc(t.topic)}: ${t.qs.length} questions, ${pctTxt(t.share)} of marks, asked in ${t.asked}/${a.cols.length} ${exam === 'NET' ? 'papers' : 'years'}">
        <span class="wl">${esc(t.topic)}</span>
        <span class="wt"><i style="width:${(t.share / max) * 100}%"></i></span>
        <span class="wv">${pctTxt(t.share)}</span>
        <span class="tier ${TIER_CLS[t.tier]}">${t.tier}</span>
        ${trendHtml(t)}
      </a>`).join('')}</div>`;
  }
  function paretoLine(a) {
    let cum = 0, n = 0; for (const t of a.topics) { cum += t.share; n++; if (cum >= 0.5) break; }
    return `<b>${n} of ${a.topics.length} topics</b> carry half of all marks`;
  }

  function homeWeightage() {
    const exam = store.get('homeExam', 'NET');
    const a = analyse(exam, TRACKS[exam][0].k);
    return `<div class="card weight-card">
      <div class="row" style="margin-bottom:6px"><div class="seg" id="hwExam">${['NET', 'GATE', 'GSI'].map(e => `<button data-v="${e}" class="${e === exam ? 'on' : ''}">${e}</button>`).join('')}</div>
        <span class="muted" style="font-size:13px">${esc(a.track.label)} · ${a.cols.length} ${exam === 'NET' ? 'papers' : 'years'} · ${a.list.length.toLocaleString()} questions</span>
        <span class="spacer"></span><a class="btn small" href="#/analysis/${exam}">Full analysis →</a></div>
      <p class="muted" style="margin:6px 0 12px;font-size:14px">${paretoLine(a)}. Share of total marks, ranked by priority (weight × how regularly it is asked × recent trend).</p>
      ${weightBars(a, 10, exam)}
    </div>`;
  }

  function viewAnalysis(exam, params) {
    if (!EXAMS[exam]) return notFound();
    setNav('analysis');
    const trackKey = params.get('track') || TRACKS[exam][0].k;
    const metric = params.get('m') || store.get('anMetric', 'q');
    const a = analyse(exam, trackKey);
    const unit = exam === 'NET' ? 'paper' : 'year';
    const repeatsHere = (BANK.analysis?.repeats || []).filter(g => QBY.get(g[0]) && examOf(QBY.get(g[0])) === exam && g.some(id => a.track.f(QBY.get(id))));
    const cellVal = (t, c) => metric === 'm' ? (t.cellMarks[c.key] || 0) : (t.cells[c.key] || 0);
    const maxCell = Math.max(1, ...a.topics.flatMap(t => a.cols.map(c => cellVal(t, c))));
    const kw = t => (BANK.analysis?.keywords?.[exam + '|' + t.topic] || []).slice(0, 5);
    const tl = a.types;
    view.innerHTML = `
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/exam/${exam}">${exam}</a> / Weightage analysis</div>
      <h1>${EXAMS[exam].name} weightage analysis</h1>
      <p class="lede">What has actually been asked, topic by topic and ${unit} by ${unit}, so you can decide what to study first.</p>
      <div class="row" style="margin-bottom:8px"><div class="seg" id="anExam">${['NET', 'GATE', 'GSI'].map(e => `<a class="${e === exam ? 'on' : ''}" href="#/analysis/${e}">${e}</a>`).join('')}</div></div>
      <div class="row" style="margin-bottom:12px"><div class="seg seg-wrap" id="anTrack">${TRACKS[exam].map(t => `<a class="${t.k === a.track.k ? 'on' : ''}" href="#/analysis/${exam}?track=${t.k}">${esc(t.label)}</a>`).join('')}</div></div>
      <p class="note">${esc(TRACK_NOTE[exam])}</p>
      <div class="stat-row">
        <div class="card stat"><b>${a.list.length.toLocaleString()}</b><span>questions analysed</span></div>
        <div class="card stat"><b>${a.cols.length}</b><span>${unit}s (${a.cols[0]?.label}–${a.cols[a.cols.length - 1]?.label})</span></div>
        <div class="card stat"><b>${Math.round(a.list.length / Math.max(1, a.cols.length))}</b><span>questions per ${unit}</span></div>
        <div class="card stat"><b>${(() => { let c = 0, n = 0; for (const t of a.topics) { c += t.share; n++; if (c >= 0.8) break; } return n; })()}</b><span>topics cover 80% of marks</span></div>
      </div>

      <h2>1 · Priority list</h2>
      <p class="muted section-lede">${paretoLine(a)}. <b>Must do</b> = the topics that together make up the first 50% of marks, <b>High</b> = up to 80%, <b>Medium</b> = up to 95%. Trend compares the last ${a.recentN} ${unit}s with earlier ones.</p>
      <div class="card" style="overflow-x:auto">
        <table class="tbl prio">
          <thead><tr><th>#</th><th>Topic</th><th>Share of marks</th><th>Questions</th><th title="${unit}s in which the topic appeared at least once">Asked in</th><th>Avg per ${unit}</th><th>Trend</th><th>Last asked</th><th>Priority</th><th>Your accuracy</th></tr></thead>
          <tbody>${a.topics.map((t, i) => `
            <tr>
              <td class="muted">${i + 1}</td>
              <td><a href="#/topic/${exam}/${encodeURIComponent(t.topic)}"><b>${esc(t.topic)}</b></a>${kw(t).length ? `<div class="kw">${kw(t).map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}</td>
              <td style="min-width:150px"><div class="mini"><i style="width:${(t.share / a.topics[0].share) * 100}%"></i></div><span class="num">${pctTxt(t.share)}</span></td>
              <td class="num">${t.qs.length}</td>
              <td class="num">${t.asked}/${a.cols.length}</td>
              <td class="num">${t.qPerPaper.toFixed(1)} Q · ${t.perPaper.toFixed(1)} marks</td>
              <td>${trendHtml(t)}</td>
              <td class="num">${t.last}</td>
              <td><span class="tier ${TIER_CLS[t.tier]}">${t.tier}</span></td>
              <td class="num">${t.st.graded ? t.st.acc + '% <span class="muted">(' + t.st.done + ')</span>' : '<a href="#/practice?exam=' + exam + '">practise</a>'}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <h2>2 · Topic × ${unit} heatmap</h2>
      <p class="muted section-lede">Darker = more ${metric === 'm' ? 'marks' : 'questions'} from that topic in that ${unit}. Hover a cell for details; blank = not asked.
        <span class="seg seg-small"><a class="${metric === 'q' ? 'on' : ''}" href="#/analysis/${exam}?track=${a.track.k}&m=q">Questions</a><a class="${metric === 'm' ? 'on' : ''}" href="#/analysis/${exam}?track=${a.track.k}&m=m">Marks</a></span></p>
      <div class="card heat-wrap">
        <table class="heat">
          <thead><tr><th class="ht">Topic</th>${a.cols.map(c => `<th><span>${esc(c.label)}</span></th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${a.topics.map(t => `<tr><th class="ht"><a href="#/topic/${exam}/${encodeURIComponent(t.topic)}">${esc(t.topic)}</a></th>${a.cols.map(c => {
            const v = cellVal(t, c); const bg = seqColor(v, maxCell); const dark = v && (v / maxCell) > 0.45;
            return `<td style="${bg ? `background:${bg};` : ''}${dark ? 'color:#fff;' : ''}" title="${esc(t.topic)} · ${esc(c.label)}: ${t.cells[c.key] || 0} questions, ${(t.cellMarks[c.key] || 0).toFixed(t.cellMarks[c.key] % 1 ? 1 : 0)} marks">${v ? (v % 1 ? v.toFixed(1) : v) : ''}</td>`;
          }).join('')}<td class="num"><b>${metric === 'm' ? Math.round(t.marks) : t.qs.length}</b></td></tr>`).join('')}
          <tr class="totals"><th class="ht">All topics</th>${a.cols.map(c => `<td>${metric === 'm' ? Math.round(a.colTotal[c.key]) : a.list.filter(q => columnOf(q).key === c.key).length}</td>`).join('')}<td class="num"><b>${metric === 'm' ? Math.round(a.total) : a.list.length}</b></td></tr>
          </tbody>
        </table>
        <div class="legend-row"><span>fewer</span>${SEQ.map(c => `<i style="background:${c}"></i>`).join('')}<span>more</span></div>
      </div>

      <h2>3 · Question format</h2>
      <div class="stat-row">${[['mcq', 'Single-correct MCQ'], ['msq', 'Multiple-select (MSQ)'], ['nat', 'Numerical answer (NAT)'], ['descriptive', 'Descriptive']].filter(([k]) => tl[k]).map(([k, l]) => `
        <div class="card stat"><b>${tl[k]}</b><span>${l} · ${pctTxt(tl[k] / a.list.length)}</span></div>`).join('')}
        <div class="card stat"><b>${a.list.filter(q => q.fig || q.ofig).length}</b><span>questions with a figure / graph</span></div>
        <div class="card stat"><b>${a.list.filter(q => /\$|calculate|compute|estimate|value of|_____/i.test(q.text) && q.t !== 'descriptive').length}</b><span>numerical / calculation-type</span></div>
      </div>

      <h2>4 · Concepts asked again (${repeatsHere.length})</h2>
      <p class="muted section-lede">Groups of near-identical questions that appeared in different ${unit}s — examiners reuse these ideas, so they are high-yield revision.</p>
      <div id="reps">${repeatsHere.length ? repeatsHere.map((g, i) => {
        const q0 = QBY.get(g[0]);
        return `<details class="card rep"><summary><span class="chip">${g.length}×</span> <span class="rep-t">${esc(q0.text.replace(/\$[^$]*\$/g, '…').slice(0, 140))}${q0.text.length > 140 ? '…' : ''}</span>
          <span class="muted rep-p">${g.map(id => esc(paperShort(PBY.get(QBY.get(id).p)))).join(' · ')}</span></summary><div class="rep-body" data-g="${i}"></div></details>`;
      }).join('') : '<div class="empty">No repeated questions detected for this selection.</div>'}</div>

      <h2>5 · How to use this</h2>
      <div class="card" style="padding:16px 20px"><ol class="howto">
        <li>Master every <b>Must do</b> topic first — it is where half the marks have come from, ${unit} after ${unit}.</li>
        <li>Within a topic, start from the <b>keywords</b> under its name and the <b>concepts asked again</b> — they recur.</li>
        <li>Give extra time to <b>▲ rising</b> topics: recent papers ask more from them than older ones did.</li>
        <li>Use <a href="#/practice?exam=${exam}">topic practice</a> until your accuracy column is above ~70%, then take a <a href="#/mock?exam=${exam}">timed mock</a>.</li>
      </ol></div>`;
    $$('#reps details').forEach(d => d.addEventListener('toggle', () => {
      const body = $('.rep-body', d); if (!d.open || body.dataset.done) return;
      body.dataset.done = 1; const g = repeatsHere[+body.dataset.g];
      g.forEach(id => body.appendChild(studyCard(QBY.get(id), { showPaper: true })));
      typeset(body);
    }));
    store.set('anMetric', metric);
  }

  function notFound() { view.innerHTML = '<div class="empty">Page not found. <a href="#/">Go home</a></div>'; }

  // ---------- router ----------
  function route() {
    const h = location.hash.slice(1) || '/';
    const [path, qs] = h.split('?');
    const params = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (QZ && parts[0] !== 'quiz') stopTimer();
    if (!parts.length) viewHome();
    else if (parts[0] === 'exam' && EXAMS[parts[1]]) viewExam(parts[1]);
    else if (parts[0] === 'paper') viewPaper(parts[1]);
    else if (parts[0] === 'topic') viewTopic(parts[1], parts.slice(2).join('/'));
    else if (parts[0] === 'search') viewSearch(params.get('q') || '');
    else if (parts[0] === 'review') viewReview(parts[1]);
    else if (parts[0] === 'progress') viewProgress();
    else if (parts[0] === 'practice') viewPractice(params);
    else if (parts[0] === 'mock') viewMock(params);
    else if (parts[0] === 'analysis') viewAnalysis(parts[1] || store.get('homeExam', 'NET'), params);
    else if (parts[0] === 'quiz') viewQuiz();
    else if (parts[0] === 'results') { if (!$('.score-ring')) location.hash = '#/'; }
    else notFound();
    if (parts[0] !== 'results') typeset(view);
    if (parts[0] !== 'quiz' && parts[0] !== 'results') window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);

  // keyboard shortcuts in quiz
  document.addEventListener('keydown', e => {
    if (!QZ || location.hash !== '#/quiz' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else if (/^[1-6]$/.test(e.key)) { const b = $(`#qCard .opt[data-opt="${e.key}"]`); if (b && !b.disabled) b.click(); }
    else if (e.key.toLowerCase() === 'b') { const q = QZ.list[QZ.i]; toggleMark(q.id); const mb = $('#qCard .mark-btn'); if (mb) { mb.classList.toggle('on', !!marks[q.id]); mb.textContent = marks[q.id] ? '★' : '☆'; } }
    else if (e.key.toLowerCase() === 'm' && QZ.mode === 'test') $('#qFlag')?.click();
  });

  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#searchInput').value.trim(); if (v) location.hash = '#/search?q=' + encodeURIComponent(v); });
  $('#themeBtn').onclick = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme-raw', root.dataset.theme);
    try { localStorage.setItem('pyq-theme', root.dataset.theme); } catch (e) { /* ignore */ }
  };
  route();
})();
