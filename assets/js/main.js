/* Tahar Amin Touzi — portfolio. Vanilla JS, aucune dépendance. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---- Thème ---- */
  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = root.dataset.theme ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---- Barre de navigation ---- */
  var nav = document.querySelector('.nav');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- Bandeau : on duplique le groupe pour une boucle sans couture ---- */
  var track = document.querySelector('.reel-track');
  if (track) {
    var group = track.querySelector('.reel-group');
    var clone = group.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('img').forEach(function (img) { img.alt = ''; img.loading = 'lazy'; img.removeAttribute('fetchpriority'); });
    track.appendChild(clone);
  }

  /* ---- Apparitions au défilement ---- */
  var title = document.querySelector('.hero-title');
  requestAnimationFrame(function () { requestAnimationFrame(function () { title && title.classList.add('in'); }); });

  // Décalage en cascade pour les éléments frères
  document.querySelectorAll('.stats-grid, .skills, .minis, .timeline').forEach(function (list) {
    Array.prototype.forEach.call(list.children, function (el, i) { el.style.setProperty('--d', (i * 70) + 'ms'); });
  });
  document.querySelectorAll('.hero .reveal').forEach(function (el, i) { el.style.setProperty('--d', (380 + i * 90) + 'ms'); });
  document.querySelectorAll('.case').forEach(function (c) {
    var b = c.querySelector('.case-body'); if (b) b.style.setProperty('--d', '90ms');
  });

  var revealEls = document.querySelectorAll('.reveal');
  var counters = document.querySelectorAll('[data-count]');

  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (reduced || target < 3) { el.textContent = target; return; }
    var start = null, dur = 1400;
    function step(t) {
      if (!start) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        e.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Halo qui suit le pointeur sur les cartes ---- */
  if (finePointer) {
    document.querySelectorAll('.mini, .skill, .now-card').forEach(function (card) {
      card.classList.add('spot');
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---- Filtres de l'index ---- */
  var buttons = document.querySelectorAll('.chip-btn');
  var rows = document.querySelectorAll('.index-list .row');
  var empty = document.querySelector('.index-empty');

  buttons.forEach(function (btn) {
    var f = btn.getAttribute('data-filter');
    var n = f === 'all' ? rows.length : Array.prototype.filter.call(rows, function (r) {
      return r.getAttribute('data-cat').split(' ').indexOf(f) !== -1;
    }).length;
    var c = btn.querySelector('.count'); if (c) c.textContent = n;
  });

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.getAttribute('data-filter');
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      var shown = 0;
      rows.forEach(function (r, i) {
        var match = f === 'all' || r.getAttribute('data-cat').split(' ').indexOf(f) !== -1;
        r.classList.toggle('is-hidden', !match);
        r.classList.remove('is-entering');
        if (match) {
          shown++;
          if (!reduced) {
            void r.offsetWidth;
            r.style.animationDelay = Math.min(shown * 30, 300) + 'ms';
            r.classList.add('is-entering');
          }
        }
      });
      if (empty) empty.hidden = shown !== 0;
    });
  });

  /* ---- Aperçu flottant au survol d'une ligne de l'index ---- */
  var preview = document.querySelector('.preview');
  if (preview && finePointer) {
    var raf = 0, px = 0, py = 0;
    function place() {
      raf = 0;
      preview.style.setProperty('--px', px + 'px');
      preview.style.setProperty('--py', py + 'px');
    }
    rows.forEach(function (row) {
      var src = row.getAttribute('data-preview');
      if (!src) return;
      row.addEventListener('pointerenter', function () {
        if (preview.getAttribute('src') !== src) preview.src = src;
        preview.classList.add('on');
      });
      row.addEventListener('pointerleave', function () { preview.classList.remove('on'); });
      row.addEventListener('pointermove', function (e) {
        px = Math.min(e.clientX + 24, window.innerWidth - 320);
        py = Math.min(e.clientY - 90, window.innerHeight - 210);
        if (!raf) raf = requestAnimationFrame(place);
      });
    });
  }

  /* ---- Copier l'e-mail ---- */
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var label = btn.querySelector('.copy-label') || btn;
      var done = function () {
        btn.setAttribute('data-copied', '');
        label.textContent = 'Copié ✓';
        setTimeout(function () { btn.removeAttribute('data-copied'); label.textContent = 'Copier'; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.location.href = 'mailto:' + text; });
      } else {
        window.location.href = 'mailto:' + text;
      }
    });
  });
})();
