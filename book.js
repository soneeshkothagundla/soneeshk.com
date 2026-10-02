// "Book a time": open 10-minute slots from /api/slots (Soneesh's calendar is checked server-side),
// shown in the visitor's own time zone; booking posts to /api/book, which emails a calendar invite.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ctas = $('ctas'), panel = $('bk'), msg = $('bkMsg'), days = $('days'), times = $('times'), form = $('bf'), go = form.querySelector('.go');
  var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  var fDay = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  var fDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  var fTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  var fLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  var fKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  var groups = {}, chosen = null, loaded = false, busy = false;

  function say(text, err) { msg.textContent = text; msg.className = 'bk-msg' + (err ? ' err' : ''); }
  function chip(label, sub) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'option');
    b.textContent = label;
    if (sub) { var s = document.createElement('small'); s.textContent = sub; b.appendChild(s); }
    return b;
  }
  function select(list, el) { [].forEach.call(list.children, function (c) { c.classList.toggle('sel', c === el); c.setAttribute('aria-selected', c === el); }); }

  function load() {
    say("Checking Soneesh's calendar"); msg.insertAdjacentHTML('beforeend', '<span class="ld"><i></i><i></i><i></i></span>');
    days.innerHTML = ''; times.innerHTML = ''; form.classList.remove('on'); chosen = null; groups = {};
    fetch('/api/slots').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
      loaded = true;
      (d.slots || []).forEach(function (iso) { var t = new Date(iso), k = fKey.format(t); (groups[k] = groups[k] || []).push(t); });
      var keys = Object.keys(groups).sort();
      if (!keys.length) { say('No open times in the next 4 weeks. Text instead?'); return; }
      say('Pick a time · shown in your time zone (' + tz.replace(/_/g, ' ') + ')');
      keys.forEach(function (k, i) {
        var first = groups[k][0], c = chip(fDay.format(first), fDate.format(first));
        c.onclick = function () { select(days, c); showTimes(k); };
        days.appendChild(c);
        if (!i) { select(days, c); showTimes(k); }
      });
    }).catch(function () { say("Couldn't load times. Try again in a minute.", true); });
  }

  function showTimes(k) {
    times.innerHTML = ''; form.classList.remove('on'); chosen = null;
    groups[k].forEach(function (t) {
      var c = chip(fTime.format(t));
      c.onclick = function () {
        select(times, c); chosen = t; form.classList.add('on');
        go.textContent = 'Book ' + fLong.format(t); check();
        (form.elements['name'].value ? form.email : form.elements['name']).focus({ preventScroll: true });
        form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      times.appendChild(c);
    });
  }

  function check() {
    go.disabled = busy || !chosen || !form.elements['name'].value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim());
  }
  form.addEventListener('input', check);

  form.onsubmit = function (e) {
    e.preventDefault(); if (go.disabled) return;
    busy = true; check(); go.textContent = 'Booking…';
    fetch('/api/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: chosen.toISOString(), name: form.elements['name'].value, email: form.email.value, note: form.note.value, website: form.website.value }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
      busy = false;
      if (!res.ok) { say(res.d.error || 'Something went wrong.', true); go.textContent = 'Book ' + fLong.format(chosen); check(); if (res.d.error && /taken/.test(res.d.error)) load(); return; }
      done(new Date(res.d.start), res.d.url);
    }).catch(function () { busy = false; say("Couldn't book right now. Try again.", true); go.textContent = 'Book ' + fLong.format(chosen); check(); });
  };

  // Confirmation lands in the thread as a sent message.
  function done(start, url) {
    panel.classList.remove('on'); panel.style.display = 'none';
    var log = $('log'), b = document.createElement('div'), meta = document.createElement('div');
    b.className = 'b out'; b.textContent = 'Booked ' + fLong.format(start) + ' 🗓️';
    meta.className = 'meta'; meta.textContent = 'Invite sent to ' + form.email.value.trim() + ' · ';
    var a = document.createElement('a'); a.href = url; a.textContent = url.replace('https://', ''); a.style.color = 'inherit';
    meta.appendChild(a);
    log.appendChild(b); log.appendChild(meta);
    requestAnimationFrame(function () { b.classList.add('on'); });
    ctas.style.display = '';
  }

  $('bookBtn').onclick = function () {
    ctas.style.display = 'none'; $('f').classList.remove('on');
    panel.style.display = ''; panel.classList.add('on');
    if (!loaded) load();
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('bkClose').onclick = function () { panel.classList.remove('on'); ctas.style.display = ''; };
})();
