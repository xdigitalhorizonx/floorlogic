/* FloorLogic v2 — scroll moments (GSAP ScrollTrigger).
   Proof counters count up from the real markup values, the loop's APPROVED
   stamp slams when its card scrolls in, and the pricing flag pops. All
   final values live in the HTML; with reduced motion or no JS nothing here
   runs and the page reads complete. */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  /* proof counters */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.4, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      onUpdate: function () {
        el.textContent = Math.round(obj.v).toLocaleString('en-US');
      }
    });
  });

  /* the loop's APPROVED stamp */
  var loopStamp = document.getElementById('loop-stamp');
  if (loopStamp) {
    gsap.set(loopStamp, { opacity: 0, scale: 2, rotation: -18, transformOrigin: '50% 50%' });
    gsap.to(loopStamp, {
      opacity: 1, scale: 1, rotation: -7, duration: 0.3, ease: 'power4.in',
      scrollTrigger: { trigger: loopStamp, start: 'top 80%', once: true }
    });
  }

  /* pricing "Recommended" flag */
  var flag = document.getElementById('tier-flag');
  if (flag) {
    gsap.set(flag, { opacity: 0, scale: 1.6, rotation: 10, transformOrigin: '50% 50%' });
    gsap.to(flag, {
      opacity: 1, scale: 1, rotation: 4, duration: 0.3, ease: 'back.out(2)',
      scrollTrigger: { trigger: flag, start: 'top 85%', once: true }
    });
  }
})();
