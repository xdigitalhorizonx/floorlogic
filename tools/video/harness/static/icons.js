/**
 * Landmark Icon Set v1
 * ---------------------------------------------------------------------------
 * Clean, modern line icons — 24×24 viewBox, 1.75px stroke, currentColor.
 * Drop-in replacement for the emoji icons used throughout index.html.
 *
 * Usage:
 *   <span class="lf-icon">${LFIcons.svg('trash')}</span>
 *   LFIcons.byEmoji('🗑️')        → 'trash'
 *   LFIcons.replace('🗑 Delete') → '<svg…/> Delete'   (replaces every mapped emoji)
 *
 * Sizing: SVGs use width/height="1em" so they inherit the font-size of the
 * surrounding text. Pair with `vertical-align: -0.15em` for inline alignment.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ---- Icon definitions -----------------------------------------------------
  // Each entry: name → { d: <inner svg markup>, fill?: <css color>, viewBox? }
  // "d" can contain any SVG primitives — paths, circles, rects, polygons.
  // Stroke / fill defaults are applied at render time so individual entries
  // stay compact.

  const I = {
    /* ── Arrows & navigation ─────────────────────────────────────────────── */
    'arrow-right':       'M4 12h15M13 6l6 6-6 6',
    'arrow-left':        'M20 12H5M11 6l-6 6 6 6',
    'arrow-up':          'M12 19V4M6 10l6-6 6 6',
    'arrow-down':        'M12 5v15M6 14l6 6 6-6',
    'arrows-horizontal': 'M3 12h18M6 8l-4 4 4 4M18 8l4 4-4 4',
    'swap-vertical':     'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
    'undo':              'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-4',
    'rotate-ccw':        'M3 4v6h6M3.5 13a9 9 0 1 0 2.4-9L3 10',
    'rotate-cw':         'M21 4v6h-6M20.5 13a9 9 0 1 1-2.4-9L21 10',
    'refresh':           'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    'rewind':            'M11 5 4 12l7 7M20 5l-7 7 7 7',
    'fast-forward':      'M4 5l7 7-7 7M13 5l7 7-7 7',
    'shuffle':           'M3 6h3.5L19 18h2M3 18h3.5L10 13M14 11l5-5h2M17 3l4 3-4 3M17 15l4 3-4 3',
    'repeat':            'M3 11V9a3 3 0 0 1 3-3h13M3 13v2a3 3 0 0 0 3 3h13M16 3l4 3-4 3M8 21l-4-3 4-3',
    'arrow-up-bar':      'M12 20V6M6 12l6-6 6 6M5 4h14',
    'arrow-down-bar':    'M12 4v14M6 12l6 6 6-6M5 20h14',

    /* ── Carets / chevrons (filled triangles) ────────────────────────────── */
    'caret-up':       { d: 'M6 15 12 9l6 6z',  fill: 'currentColor' },
    'caret-down':     { d: 'M6 9 12 15l6-6z',  fill: 'currentColor' },
    'caret-left':     { d: 'M15 6 9 12l6 6z',  fill: 'currentColor' },
    'caret-right':    { d: 'M9 6 15 12l-6 6z', fill: 'currentColor' },
    'caret-down-sm':  { d: 'M7 10 12 14l5-4z', fill: 'currentColor' },
    'caret-right-sm': { d: 'M10 7 14 12l-4 5z', fill: 'currentColor' },
    'play':           { d: 'M7 4v16l13-8z',    fill: 'currentColor' },

    /* ── Checks, X, status pips ──────────────────────────────────────────── */
    'check':         'M5 12.5 10 17.5 19 7',
    'check-circle':  'M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zM8 12.5l3 3 5-6',
    'x':             'M6 6l12 12M18 6 6 18',
    'x-circle':      'M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zM9 9l6 6M15 9l-6 6',
    'dot':           { d: 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',  fill: 'currentColor' },
    'dot-outline':   'M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z',
    'dot-red':       { d: 'M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0z', fill: '#e0524d' },
    'dot-amber':     { d: 'M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0z', fill: '#e8a32a' },
    'dot-green':     { d: 'M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0z', fill: '#22a06b' },
    'dot-blue':      { d: 'M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0z', fill: '#2f7adb' },
    'dot-white':     'M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0z',
    'radio':         'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',

    /* ── Alerts / signals ────────────────────────────────────────────────── */
    'warning':       'M12 4 2.6 20.5h18.8L12 4zM12 10v5M12 18h.01',
    'prohibit':      'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM6.3 6.3l11.4 11.4',
    'lightbulb':     'M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.6.7-1 1.5-1 2.5v.5H9V16c0-1-.4-1.8-1-2.5A6 6 0 0 1 12 3z',
    'bolt':          'M13 2 4 14h6l-1 8 9-12h-6z',
    'sparkles':      'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
    'celebrate':     'M5 22l4-12 8 8zM9 14l4 4M15 5l1.5-1.5M19 9l1.5-1.5M17 3l.5-2M21 7l2-.5',

    /* ── UI actions ──────────────────────────────────────────────────────── */
    'trash':         'M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L18.5 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7',
    'edit':          'M4 20h4l11-11-4-4L4 16zM13.5 6.5l4 4',
    'edit-pencil':   'M14 4l6 6-12 12H2v-6z',
    'write':         'M5 20h14M14 5l5 5-9 9H5v-5z',
    'search':        'M4 11a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM16 16l4 4',
    'save':          'M5 4h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7 4v6h9V4M7 14h10v6H7z',
    'clipboard':     'M9 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 4h6',
    'upload-tray':   'M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M7 8l5-5 5 5M12 3v13',
    'download-tray': 'M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M7 11l5 5 5-5M12 3v13',
    'upload':        'M12 3v14M6 9l6-6 6 6M5 21h14',
    'download':      'M12 3v14M6 13l6 6 6-6M5 21h14',
    'link':          'M10 14a4 4 0 0 1 0-5.7l3-3a4 4 0 0 1 5.7 5.7L17 12.5M14 10a4 4 0 0 1 0 5.7l-3 3a4 4 0 0 1-5.7-5.7L7 11.5',
    'paperclip':     'M21 11 11.5 20.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3l8.5-8.5',
    'lock':          'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    'lock-open':     'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0',
    'lock-key':      'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v3',
    'plus':          'M12 5v14M5 12h14',
    'printer':       'M6 9V3h12v6M4 9h16a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-3v-3H6v3H3a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2zM6 14h12v7H6z',
    'eye':           'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
    'menu':          'M3 6h18M3 12h18M3 18h18',

    /* ── Time & calendar ─────────────────────────────────────────────────── */
    'calendar':      'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4',
    'alarm':         'M5 13a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM12 9v4l3 2M3 6l3-3M21 6l-3-3',
    'stopwatch':     'M5 14a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM12 14v-4M9 2h6M12 2v3',
    'hourglass':     'M6 3h12v3a6 6 0 0 1-3 5.2v1.6A6 6 0 0 1 18 18v3H6v-3a6 6 0 0 1 3-5.2v-1.6A6 6 0 0 1 6 6z',
    'clock':         'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM12 7v5l3 2',
    'moon':          'M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z',
    'sun':           'M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
    'sunrise':       'M8 16a4 4 0 1 1 8 0M12 4v3M5 13H2M22 13h-3M5.6 6.6 7 8M18.4 6.6 17 8M2 19h20',
    'zzz':           'M4 6h6L4 17h6M13 4h6l-6 8h6',
    'sunglasses':    'M2 8h20M4 8v3a4 4 0 0 0 7.5 2h1A4 4 0 0 0 20 11V8',

    /* ── People ──────────────────────────────────────────────────────────── */
    'user':          'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM4 21a8 8 0 0 1 16 0',
    'users':         'M5 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM2 19a6 6 0 0 1 12 0M14 5.2a3 3 0 1 1 0 5.6M16 14a6 6 0 0 1 6 6',
    'hard-hat':      'M3 18h18M5 18v-2a7 7 0 0 1 14 0v2M9 11V7a3 3 0 0 1 6 0v4',
    'wave':          'M7 14v-3a2 2 0 0 1 4 0v3M11 11V4.5a2 2 0 0 1 4 0V11M15 11V6.5a2 2 0 0 1 4 0V14a7 7 0 0 1-14 0v-3a2 2 0 0 1 4 0',

    /* ── Business / objects ──────────────────────────────────────────────── */
    'home':          'M3 12 12 3l9 9M5 10v10a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V10',
    'building':      'M4 3h16v18H4zM9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-4h4v4',
    'money-bag':     'M9 5h6l1-3-3 1-1-1-1 1-3-1zM5 14c0-4 3-8 7-8s7 4 7 8a7 7 0 0 1-14 0zM10 11h4M11 14h2a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h3M12 10v11',
    'dollar':        'M12 2v20M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8',
    'card':          'M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 11h20',
    'cash':          'M3 7h18v10H3zM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM6 10v.01M18 14v.01',
    'briefcase':     'M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
    'receipt':       'M5 3h14v18l-2-1-2 1-2-1-2 1-2-1-2 1-2-1zM8 7h8M8 11h8M8 15h5',
    'chart-bar':     'M3 21h18M7 13v6M12 9v10M17 5v14',
    'hammer':        'M14 4l6 6-2 2-2-2-9 9-3-3 9-9-2-2zM8 13l3 3',
    'wrench':        'M19 5a3 3 0 1 1-3.5 4.85L4.5 20.5 3 19 13.65 8.35A3 3 0 1 1 19 5z',
    'tools':         'M14 4l6 6-2 2-6-6zM12 6l-9 9 3 3 9-9M9 13l3 3',
    'brick':         'M3 5h18v14H3zM3 9h18M3 14h18M10 5v4M14 9v5M9 14v5',
    'truck':         'M3 7a1 1 0 0 1 1-1h10v10H3zM14 10h4l3 3v3h-7zM6 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    'phone':         'M22 17v3a2 2 0 0 1-2 2 19 19 0 0 1-17-17 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L8 10a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 1.8-.5l3 .5a2 2 0 0 1 1.7 2z',
    'envelope':      'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 7 9-7',
    'bell':          'M6 9a6 6 0 1 1 12 0c0 6 3 8 3 8H3s3-2 3-8zM10 21a2 2 0 0 0 4 0',
    'palette':       'M12 3a9 9 0 1 0 8 13c.5-1.2-.5-2.5-1.8-2.5h-1.7a3 3 0 0 1 0-6h.5C18.5 7.5 19 6 18 4.5A9 9 0 0 0 12 3zM7 11h.01M8 16h.01M13 17h.01M15 7h.01',
    'test-tube':     'M9 2h6M10 2v11l-3.5 5.5A3 3 0 0 0 9 23h6a3 3 0 0 0 2.5-4.5L14 13V2M7 16h10',
    'folder':        'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'folder-tab':    'M3 8a2 2 0 0 1 2-2h4l1 2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 12h18',
    'archive':       'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M10 13h4',
    'cabinet':       'M4 3h16v18H4zM4 9h16M4 15h16M11 6h2M11 12h2M11 18h2',
    'box':           'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M3 7l9 4 9-4M12 11v10M7.5 5l9 4',
    'tag':           'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9zM7.5 7.5h.01',
    'pin':           'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
    'ruler':         'M19 19 5 19 19 5zM11 19v-4M14 19v-6M8 19v-2M17 9l-2 2',
    'note':          'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM13 4v5h5M8 14l4-4 2 2-4 4H8z',
    'document':      'M5 3h9l5 5v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v6h6M8 13h8M8 17h5',
    'scroll':        'M5 7a3 3 0 0 1 3-3h11a2 2 0 0 1 2 2v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7M5 18a3 3 0 0 0 3 3M9 9h7M9 13h7',
    'bookmark':      'M6 3h12v18l-6-4-6 4z',
    'book':          'M5 4a1 1 0 0 1 1-1h13v18H6a1 1 0 0 0-1 1V4zM19 18H6',
    'chat':          'M4 13a8 8 0 1 1 5 7.5L4 22l1.5-4A8 8 0 0 1 4 13z',
    'hash':          'M9 4 7 20M17 4l-2 16M4 9h17M3 15h17',
    'target':        'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
    'index-card':    'M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 10h18M7 14h6',
    'cart':          'M3 4h2l2 12h12l2-8H6.5M10 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'desktop':       'M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21h6M12 17v4',
    'mobile':        'M7 3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM11 19h2',
    'robot':         'M5 9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM12 7V4M9 13h.01M15 13h.01M9 17h6M3 13H2M22 13h-1M12 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'door':          'M5 3h14v18H5zM15 12h.01',
    'cone':          'M3 20h18M8 20 12 4l4 16M10 12h4M11 8h2',
    'mic':           'M9 6a3 3 0 1 1 6 0v7a3 3 0 1 1-6 0zM5 12a7 7 0 0 0 14 0M12 19v3',
    'image':         'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3 18l5-5 4 4 4-4 5 5',
    'calculator':    'M6 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zM8 6h8v3H8zM8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01M15.5 17h.01',
    'cloud':         'M7 17a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.8.9A4 4 0 0 1 18 17z',
    'cloud-sun':     'M16 4V2M21 7h-2M19.5 3.5 18 5M13.5 9.5a3 3 0 0 0-4.5-1.2A3 3 0 0 1 12.5 11.5M7 17a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.8.9A4 4 0 0 1 18 17z',
    'cloud-rain':    'M7 13a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.8.9A4 4 0 0 1 18 13zM10 17v3M14 17v4M18 17v3',
    'cloud-snow':    'M7 13a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.8.9A4 4 0 0 1 18 13zM10 18h.01M14 17h.01M14 21h.01M18 18h.01M10 21h.01',
    'cloud-bolt':    'M7 13a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.8.9A4 4 0 0 1 18 13zM13 14l-2 4h3l-2 4',
    'cloud-fog':     'M7 13a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.8.9A4 4 0 0 1 18 13zM4 18h16M7 22h10',
    'wind':          'M9 4a2 2 0 1 1 2 4H3M12 20a2 2 0 1 0 2-4H3M15 9a3 3 0 1 1 3 5H3',
  };

  // ---- Emoji → name map -----------------------------------------------------
  // Built from the actual usage in index.html (131 unique glyphs).
  const EMOJI_MAP = {
    '✕': 'x',           '→': 'arrow-right',     '✓': 'check',
    '🗑️': 'trash',       '🗑': 'trash',           '📋': 'clipboard',
    '📅': 'calendar',    '💰': 'money-bag',      '🔨': 'hammer',
    '🏷️': 'tag',         '✅': 'check-circle',   '📦': 'box',
    '🔍': 'search',      '👤': 'user',           '📐': 'ruler',
    '👁': 'eye',         '👁️': 'eye',            '💡': 'lightbulb',
    '⚠': 'warning',      '⚠️': 'warning',
    '⇅': 'swap-vertical','✏️': 'edit-pencil',    '✏': 'edit-pencil',
    '📍': 'pin',         '🏢': 'building',       '📝': 'note',
    '💾': 'save',        '←': 'arrow-left',      '🔄': 'refresh',
    '▾': 'caret-down-sm','🚫': 'prohibit',       '🧪': 'test-tube',
    '📄': 'document',    '⭐': 'sparkles',        '🎨': 'palette',
    '▲': 'caret-up',     '▼': 'caret-down',      '🔀': 'shuffle',
    '↺': 'rotate-ccw',   '📤': 'upload-tray',    '👷': 'hard-hat',
    '📞': 'phone',       '🏠': 'home',           '💳': 'card',
    '🧱': 'brick',       '📜': 'scroll',         '🔴': 'dot-red',
    '🧑': 'user',        '💼': 'briefcase',      '💵': 'cash',
    '🧾': 'receipt',     '↩': 'undo',
    '📊': 'chart-bar',   '🔔': 'bell',           '✉️': 'envelope',
    '❌': 'x-circle',    '🟡': 'dot-amber',      '🔵': 'dot-blue',
    '💲': 'dollar',      '🔧': 'wrench',         '⚙️': 'tools',
    '⏰': 'alarm',       '🕒': 'clock',          '▶': 'caret-right',
    '🔒': 'lock',        '🖥': 'desktop',        '◀': 'caret-left',
    '👥': 'users',       '➕': 'plus',            '📧': 'envelope',
    '🔘': 'radio',       '🚚': 'truck',          '⬆': 'arrow-up-bar',
    '⬇': 'arrow-down-bar','🛠️': 'tools',         '🌙': 'moon',
    '📆': 'calendar',    '📱': 'mobile',         '🔁': 'repeat',
    '▶️': 'play',        '⏱️': 'stopwatch',      '🧹': 'eraser',
    '👁️': 'eye',         '●': 'dot',             '☀️': 'sun',
    '🔐': 'lock-key',    '🖨': 'printer',        '🕶️': 'sunglasses',
    '🤖': 'robot',       '↔': 'arrows-horizontal','🕐': 'clock',
    '🌅': 'sunrise',     '⏳': 'hourglass',       '🎉': 'celebrate',
    '💤': 'zzz',         '🗂️': 'folder-tab',     '🎯': 'target',
    '📑': 'bookmark',    '📥': 'download-tray',  '📎': 'paperclip',
    '🗄️': 'cabinet',     '🔗': 'link',           '🔓': 'lock-open',
    '✗': 'x',            '▸': 'caret-right-sm',  '✨': 'sparkles',
    '☰': 'menu',         '🚪': 'door',           '⚡': 'bolt',
    '🕛': 'clock',       '🕔': 'clock',          '↑': 'arrow-up',
    '↓': 'arrow-down',   '👋': 'wave',           '🗂': 'folder-tab',
    '📇': 'index-card',  '🟢': 'dot-green',       '🖼️': 'image',
    '📕': 'book',        '📘': 'book',           '⏪': 'rewind',
    '🛒': 'cart',        '✍️': 'write',          '↻': 'rotate-cw',
    '🔆': 'sun',         '🗓️': 'calendar',       '⚪': 'dot-white',
    '🚧': 'cone',        '💬': 'chat',           '○': 'dot-outline',
    '🔢': 'hash',        '🎤': 'mic',          '🧮': 'calculator',
    '☁': 'cloud',       '☁️': 'cloud',          '⛅': 'cloud-sun',
    '🌤': 'cloud-sun',  '🌤️': 'cloud-sun',     '🌥': 'cloud',
    '🌦': 'cloud-rain', '🌦️': 'cloud-rain',    '🌧': 'cloud-rain',
    '🌧️': 'cloud-rain', '🌨': 'cloud-snow',     '🌨️': 'cloud-snow',
    '⛈': 'cloud-bolt', '⛈️': 'cloud-bolt',     '🌩': 'cloud-bolt',
    '🌫': 'cloud-fog',  '🌫️': 'cloud-fog',     '💨': 'wind',
  };

  // 🧹 eraser was referenced but not drawn — add it
  I['eraser'] = 'M16 3l5 5-9 9H7l-3-3 9-9zM7 17l-3 3h6';

  // ---- Render helpers -------------------------------------------------------
  const SW = 1.75;

  function svg(name, opts) {
    opts = opts || {};
    const def = I[name];
    if (!def) return '';
    const isObj = typeof def === 'object';
    const inner = isObj ? def.d : def;
    const fill = isObj && def.fill ? def.fill : 'none';
    const stroke = isObj && def.stroke ? def.stroke : 'currentColor';
    const size = opts.size || '1em';
    const cls = opts.class ? ` class="${opts.class}"` : ' class="lf-icon"';
    const style = opts.style ? ` style="${opts.style}"` : '';
    const sw = opts.strokeWidth || SW;
    // Filled icons (carets, dots) don't need a stroke
    const strokeAttr = fill === 'none'
      ? ` fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`
      : ` fill="${fill}" stroke="none"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"${strokeAttr}${cls}${style} aria-hidden="true"><path d="${inner}"/></svg>`;
  }

  function byEmoji(emoji) {
    return EMOJI_MAP[emoji] || null;
  }

  function fromEmoji(emoji, opts) {
    const name = EMOJI_MAP[emoji];
    return name ? svg(name, opts) : emoji;
  }

  // Replace every mapped emoji in a string with its SVG markup.
  // Useful for retrofitting existing HTML templates.
  function replace(text, opts) {
    if (!text) return text;
    // Sort by length descending so multi-codepoint emojis (e.g. 🗑️) match
    // before their base (🗑).
    const keys = Object.keys(EMOJI_MAP).sort((a, b) => b.length - a.length);
    let out = text;
    for (const k of keys) {
      if (out.indexOf(k) === -1) continue;
      const rendered = svg(EMOJI_MAP[k], opts);
      out = out.split(k).join(rendered);
    }
    return out;
  }

  // List of all defined icon names (handy for the gallery + autocomplete)
  function names() { return Object.keys(I).sort(); }
  function emojis() { return Object.keys(EMOJI_MAP); }

  global.LFIcons = { svg, byEmoji, fromEmoji, replace, names, emojis, MAP: EMOJI_MAP, _defs: I };
})(typeof window !== 'undefined' ? window : globalThis);
