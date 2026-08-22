/* FloorLogic homepage interactions.
   The trial form posts to the SAME live endpoint the previous Foundation site
   used (verified end-to-end 2026-08-14): a Supabase edge function that records
   the request and emails the owner. Only the `source` prefix changed. */
(function () {
  'use strict';

  var ENDPOINT = 'https://bceaexyuwbigpsamurfu.supabase.co/functions/v1/notify-trial-signup';
  var FALLBACK = 'https://bceaexyuwbigpsamurfu.supabase.co/rest/v1/trial_signups';
  var PUBKEY = 'sb_publishable_0rbiAG09yp_3VNnItx3mSA_1JWCXJWa';
  var SOURCE_PREFIX = 'floorlogic-site-v1';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Plan interest carried from a pricing-tier button into the next submit.
  var chosenPlan = '';
  document.querySelectorAll('[data-plan]').forEach(function (a) {
    a.addEventListener('click', function () { chosenPlan = a.getAttribute('data-plan') || ''; });
  });

  /* ---------- trial forms (hero + closer) ---------- */
  document.querySelectorAll('[data-trial-form]').forEach(function (form) {
    var email = form.querySelector('input[name="email"]');
    var step2 = form.querySelector('[data-step2]');
    var note = form.querySelector('[data-form-note]');
    var success = form.querySelector('[data-form-success]');
    var button = form.querySelector('button[type="submit"]');
    var sending = false;

    function showNote(msg, isError) {
      note.textContent = msg;
      note.hidden = false;
      note.classList.toggle('form-note--error', !!isError);
    }
    function hideNote() { note.hidden = true; }

    // Reveal step 2 as soon as the email reads valid — one field first,
    // details after commitment.
    email.addEventListener('input', function () {
      if (EMAIL_RE.test(email.value.trim()) && step2.hidden) {
        step2.hidden = false;
        step2.classList.add('is-open');
      }
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sending) return;
      hideNote();

      var emailVal = email.value.trim();
      if (!EMAIL_RE.test(emailVal)) {
        showNote('Enter a work email to start — that’s where your login goes.', true);
        email.focus();
        return;
      }
      if (step2.hidden) {
        step2.hidden = false;
        step2.classList.add('is-open');
        showNote('Almost there — company and name, so we can build your workspace.');
        form.querySelector('input[name="company_name"]').focus();
        return;
      }
      var company = form.querySelector('input[name="company_name"]').value.trim();
      var name = form.querySelector('input[name="full_name"]').value.trim();
      if (!company || !name) {
        showNote('Company and name are all we need — the rest is optional.', true);
        (company ? form.querySelector('input[name="full_name"]') : form.querySelector('input[name="company_name"]')).focus();
        return;
      }

      var body = {
        email: emailVal,
        company_name: company,
        full_name: name,
        phone: form.querySelector('input[name="phone"]').value.trim(),
        crew_size: form.querySelector('select[name="crew_size"]').value,
        current_tool: form.querySelector('input[name="current_tool"]').value.trim(),
        website: form.querySelector('input[name="website"]').value, // honeypot
        source: SOURCE_PREFIX + ':' + (form.getAttribute('data-source') || 'page') + (chosenPlan ? ':' + chosenPlan : '')
      };

      sending = true;
      button.disabled = true;
      var oldLabel = button.textContent;
      button.textContent = 'Sending…';

      function done() {
        form.querySelector('.capture').hidden = true;
        step2.hidden = true;
        step2.classList.remove('is-open');
        hideNote();
        success.classList.add('is-shown');
      }
      function fail() {
        sending = false;
        button.disabled = false;
        button.textContent = oldLabel;
        showNote('That didn’t go through. Try again, or email brandon@digitalhorizon.dev — a person reads it either way.', true);
      }

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.ok) return done();
        if (res.status >= 400 && res.status < 500) return fail();
        throw new Error('server');
      }).catch(function () {
        // Edge function unreachable — insert directly (anon INSERT-only RLS).
        fetch(FALLBACK, {
          method: 'POST',
          headers: {
            apikey: PUBKEY,
            Authorization: 'Bearer ' + PUBKEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(Object.assign({}, body, { source: body.source + ':fallback' }))
        }).then(function (res) { res.ok ? done() : fail(); }).catch(fail);
      });
    });
  });

  /* ---------- product frame tabs ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.frame__tab'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        document.getElementById(t.getAttribute('aria-controls'))
          .classList.toggle('is-active', t === tab);
      });
    });
  });

  /* ---------- scroll reveal ---------- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealed = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealed.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealed.forEach(function (el) { io.observe(el); });
  }

  /* ---------- mobile sticky CTA — appears once the hero form scrolls out ---------- */
  var bar = document.querySelector('[data-mobilebar]');
  var heroForm = document.getElementById('start');
  if (bar && heroForm && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      bar.hidden = entries[0].isIntersecting;
    }).observe(heroForm);
  }
})();
