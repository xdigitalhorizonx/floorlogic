/* FloorLogic v3 — follow the job (#job).
   On desktop the section pins and one scroll drives the job through the
   shop: the customer's phone approves the quote, the work order stamps
   CREATED, the invoice stamps PAID, and job costing shows the margin.
   Narrow screens, reduced motion, and no-JS all get the static layout:
   the four windows stacked in order with their stamps already landed —
   the page never depends on the pin. ?story=N freezes stage N for
   headless verification. */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var job = document.querySelector('.job');
  if (!job) return;
  var wins = Array.prototype.slice.call(job.querySelectorAll('.job__win'));
  var rail = Array.prototype.slice.call(job.querySelectorAll('.job__rail li'));
  var stamps = wins.map(function (w) { return w.querySelector('.stamp, .margin-badge'); });
  var phoneGo = document.getElementById('phone-go');
  if (wins.length < 2) return;

  gsap.registerPlugin(ScrollTrigger);

  var current = 0;
  function setStep(i, animate) {
    if (i === current && animate !== 'force') return;
    current = i;
    wins.forEach(function (w, j) { w.classList.toggle('is-on', j === i); });
    rail.forEach(function (r, j) { r.classList.toggle('is-on', j === i); });
    var w = wins[i];
    if (animate) {
      gsap.fromTo(w, { opacity: 0, y: 30, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
      var s = stamps[i];
      if (s) {
        gsap.fromTo(s, { opacity: 0, scale: 2, rotation: i === 3 ? 12 : -14 },
          { opacity: 1, scale: 1, rotation: i === 3 ? 4 : (i === 0 ? -8 : 6), duration: 0.3, delay: 0.35, ease: 'power4.in', overwrite: 'auto' });
      }
      if (i === 0 && phoneGo) {
        gsap.fromTo(phoneGo, { scale: 1 }, { scale: 0.94, duration: 0.09, delay: 0.2, yoyo: true, repeat: 1, ease: 'power1.inOut', overwrite: 'auto' });
      }
    } else {
      gsap.set(w, { opacity: 1, y: 0, scale: 1 });
      if (stamps[i]) gsap.set(stamps[i], { opacity: 1, scale: 1 });
    }
  }

  var mm = gsap.matchMedia();
  mm.add('(min-width: 1121px)', function () {
    job.classList.add('job--pinned');
    wins.forEach(function (w, j) { if (j !== 0) gsap.set(w, { opacity: 0 }); });

    var st = ScrollTrigger.create({
      trigger: job,
      start: 'top top',
      end: '+=' + (wins.length * 85) + '%',
      pin: true,
      scrub: true,
      snap: { snapTo: 1 / (wins.length - 1), duration: 0.35, ease: 'power1.inOut' },
      onUpdate: function (self) {
        var i = Math.round(self.progress * (wins.length - 1));
        if (i !== current) setStep(i, true);
      }
    });

    /* replay the first stamp when the pin engages */
    setStep(0, 'force');

    window.__flStory = {
      st: st,
      go: function (i) { st.scroll(st.start + (st.end - st.start) * (i / (wins.length - 1))); }
    };

    return function () {
      job.classList.remove('job--pinned');
      wins.forEach(function (w) { gsap.set(w, { clearProps: 'opacity,transform' }); });
    };
  });

  /* deterministic stage for headless verification: ?story=N */
  var q = new URLSearchParams(window.location.search).get('story');
  if (q !== null && window.__flStory) {
    var idx = Math.max(0, Math.min(wins.length - 1, parseInt(q, 10) || 0));
    window.__flStory.st.disable(false, false);
    job.classList.add('job--pinned');
    setStep(idx, false);
  }
})();
