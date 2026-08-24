/* FloorLogic homepage — hero choreography (section #top).
   The 3D floor (js/vendor/hero3d.js) lays itself and then fires
   'fl:floor-laid'; this file raises the seven module chips onto the finished
   floor, pops a mo.js burst at the final plank, tumbles the headline in, and
   fires the trial-form celebration burst. Without JS or with reduced motion
   the chips render already standing (their CSS state) and nothing is hidden. */
(function () {
  'use strict';

  var stage = document.getElementById('hero-stage');
  var chipsWrap = document.getElementById('hero-modules');
  if (!stage || !chipsWrap || typeof anime === 'undefined') return;

  var animate = anime.animate;
  var stagger = anime.stagger;
  var createSpring = anime.createSpring;
  var splitText = anime.splitText;
  var utils = anime.utils;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var chips = [].slice.call(chipsWrap.querySelectorAll('.hchip'));

  /* mo.js bursts, colored from the live tokens */
  var css = getComputedStyle(document.documentElement);
  var burst = null;
  if (typeof mojs !== 'undefined') {
    burst = new mojs.Burst({
      radius: { 8: 80 }, count: 11,
      children: {
        shape: 'line',
        stroke: [css.getPropertyValue('--cta').trim(), css.getPropertyValue('--accent').trim(), css.getPropertyValue('--st-complete').trim(), '#FFFFFF'],
        strokeWidth: { 3: 0 }, radius: { 11: 2 }, duration: 850, easing: 'cubic.out'
      }
    });
  }
  function boomAt(x, y) { if (burst && !reduced) burst.tune({ x: x, y: y }).replay(); }
  function boomOn(el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    boomAt(r.left + r.width / 2 + window.scrollX, r.top + 8 + window.scrollY);
  }

  /* celebration on trial-form success (fired from main.js) */
  window.addEventListener('fl:trial-success', function (e) { boomOn(e.detail && e.detail.el); });

  if (reduced || document.body.clientWidth < 880) return; // chips already stand; photo carries the hero

  /* headline words tumble in */
  var h1 = document.querySelector('.hero--stage h1');
  if (h1 && splitText) {
    var split = splitText(h1, { words: true });
    animate(split.words, { opacity: [0, 1], translateY: [12, 0], delay: stagger(22), duration: 500, ease: 'outCubic' });
  }

  /* chips wait below the floor line until the last plank clicks in */
  utils.set(chips, { translateY: 46, opacity: 0 });
  var risen = false;
  function rise() {
    if (risen) return;
    risen = true;
    chips.forEach(function (c, i) {
      animate(c, {
        translateY: 0, opacity: 1,
        delay: i * 85,
        ease: createSpring({ stiffness: 130, damping: 14 }),
        onComplete: i === chips.length - 1 ? startIdle : null
      });
    });
  }
  function startIdle() {
    chips.forEach(function (c, i) {
      animate(c, { translateY: [-2, 2], duration: 2600 + i * 230, loop: true, alternate: true, ease: 'inOutSine' });
    });
  }

  window.addEventListener('fl:floor-laid', function (e) {
    rise();
    if (e.detail) boomAt(e.detail.x, e.detail.y);
  });

  /* safety nets: no 3D (bailed or failed) → rise on our own; and never wait
     longer than 6s even if the event goes missing */
  setTimeout(function () { if (!stage.classList.contains('is-3d')) rise(); }, 1300);
  setTimeout(rise, 6000);
})();
