/* Offline, in-memory stand-in for supabase-js v2 — FloorLogic film harness.
 * Served in place of https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 (and the
 * pinned UMD q.html loads). It makes ZERO network requests: every table lives in this
 * page's memory and is persisted to the 127.0.0.1 origin's localStorage so the app
 * (index.html) and the public quote page (q.html) share one fictional database.
 *
 * The controller prepends `window.__FL_FIXTURE = {...}` (table -> rows, snake_case, the
 * same shape PostgREST returns) and `window.__FL_SESSION = {...}`.
 */
(function () {
  'use strict';
  var LS_DB = '__flFilmDB';
  var LS_REV = '__flFilmDB_rev';
  var LS_SEED = '__flFilmDB_seed';
  var FIX = window.__FL_FIXTURE || { tables: {}, seedId: 'none' };
  var SESSION_USER = window.__FL_SESSION || { id: 'u-film', email: 'film@pinyon.test' };
  var calls = [];          // every call, for the controller's audit
  var unknown = [];        // anything this stand-in does not implement (must stay empty)
  function note(kind, detail) { calls.push({ t: Date.now(), kind: kind, detail: detail }); if (calls.length > 5000) calls.shift(); }
  function miss(what) { unknown.push(what); try { console.warn('[sb-stub] not implemented: ' + what); } catch (_) {} }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  // ---------------- storage ----------------
  var db = null, dbRev = -1;
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { miss('localStorage write failed: ' + e.message); } }
  function seed() {
    db = clone(FIX.tables || {});
    dbRev = Date.now();
    lsSet(LS_DB, JSON.stringify(db)); lsSet(LS_REV, String(dbRev)); lsSet(LS_SEED, FIX.seedId || 'none');
  }
  function load() {
    var seedId = lsGet(LS_SEED);
    if (seedId !== (FIX.seedId || 'none')) { seed(); return; }
    var rev = +(lsGet(LS_REV) || 0);
    if (db && rev === dbRev) return;
    var raw = lsGet(LS_DB);
    if (!raw) { seed(); return; }
    try { db = JSON.parse(raw); dbRev = rev; } catch (_) { seed(); }
  }
  function persist() { dbRev = Date.now() + Math.random(); lsSet(LS_DB, JSON.stringify(db)); lsSet(LS_REV, String(dbRev)); }
  function table(name) { load(); if (!db[name]) db[name] = []; return db[name]; }

  // Server-side triggers the app relies on (see the migrations): phone_norm on
  // customers/leads (20260722000001), updated_at on quotes.
  function triggers(t, r) {
    if ((t === 'customers' || t === 'leads') && r.phone !== undefined) { var d = String(r.phone || '').replace(/\D/g, ''); r.phone_norm = d ? d.slice(-10) : null; }
    if (t === 'quotes') r.updated_at = new Date().toISOString();
  }
  // Primary keys / conflict targets that are not plain `id`.
  var PK = { user_preferences: 'user_id' };
  function pkOf(t, onConflict) { return onConflict || PK[t] || 'id'; }
  function uuid() { return 'f' + Math.random().toString(16).slice(2, 10) + '-' + Date.now().toString(16); }

  // ---------------- filters ----------------
  function looseEq(a, b) {
    if (a == null || b == null) return a == null && b == null;
    if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return String(a) === String(b);
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0; if (a == null) return -1; if (b == null) return 1;
    var na = Number(a), nb = Number(b);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '' && /^-?[\d.]+$/.test(String(a)) && /^-?[\d.]+$/.test(String(b))) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function likeRe(pat, ci) { var s = String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.').replace(/\*/g, '.*'); return new RegExp('^' + s + '$', ci ? 'i' : ''); }
  function parseVal(v) {
    if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false;
    return v;
  }
  function parseList(v) { // "(a,b,"c d")"
    var s = String(v).replace(/^\(/, '').replace(/\)$/, '');
    var out = [], cur = '', q = false;
    for (var i = 0; i < s.length; i++) { var c = s[i]; if (c === '"') { q = !q; continue; } if (c === ',' && !q) { out.push(cur); cur = ''; continue; } cur += c; }
    if (cur !== '' || s.length) out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }
  function test(row, op, col, val) {
    var a = row[col];
    switch (op) {
      case 'eq': return looseEq(a, val);
      case 'neq': return !looseEq(a, val);
      case 'gt': return a != null && cmp(a, val) > 0;
      case 'gte': return a != null && cmp(a, val) >= 0;
      case 'lt': return a != null && cmp(a, val) < 0;
      case 'lte': return a != null && cmp(a, val) <= 0;
      case 'like': return a != null && likeRe(val, false).test(String(a));
      case 'ilike': return a != null && likeRe(val, true).test(String(a));
      case 'is': return val === null ? a == null : (val === true ? a === true : val === false ? a === false : a == val);
      case 'in': { var arr = Array.isArray(val) ? val : parseList(val); return arr.some(function (x) { return looseEq(a, x); }); }
      case 'cs': case 'contains': {
        if (Array.isArray(a)) { var need = Array.isArray(val) ? val : parseList(String(val).replace(/^\{/, '(').replace(/\}$/, ')')); return need.every(function (x) { return a.some(function (y) { return looseEq(y, x); }); }); }
        if (a && typeof a === 'object' && val && typeof val === 'object') return Object.keys(val).every(function (k) { return JSON.stringify(a[k]) === JSON.stringify(val[k]); });
        return false;
      }
      default: miss('filter op ' + op); return true;
    }
  }
  // PostgREST logic-tree string: "status.eq.sent,and(a.gt.1,b.lt.2),name.ilike.*x*"
  function splitTop(s) {
    var out = [], depth = 0, cur = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '"') q = !q;
      if (!q && c === '(') depth++;
      if (!q && c === ')') depth--;
      if (!q && depth === 0 && c === ',') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }
  function compileCond(s) {
    s = s.trim();
    var m = /^(not\.)?(and|or)\((.*)\)$/.exec(s);
    if (m) {
      var subs = splitTop(m[3]).map(compileCond); var isAnd = m[2] === 'and'; var neg = !!m[1];
      return function (row) { var r = isAnd ? subs.every(function (f) { return f(row); }) : subs.some(function (f) { return f(row); }); return neg ? !r : r; };
    }
    var parts = s.split('.');
    var col = parts.shift();
    var negate = false;
    if (parts[0] === 'not') { negate = true; parts.shift(); }
    var op = parts.shift();
    var raw = parts.join('.');
    var val = op === 'in' ? parseList(raw) : parseVal(raw);
    return function (row) { var r = test(row, op, col, val); return negate ? !r : r; };
  }

  // ---------------- query builder ----------------
  function Query(t) {
    this.t = t; this.op = 'select'; this.cols = '*'; this.opts = {}; this.filters = []; this.orders = [];
    this.rng = null; this.lim = null; this.one = null; this.payload = null; this.wopts = {}; this.returning = false;
  }
  var Q = Query.prototype;
  Q.select = function (cols, opts) {
    if (this.op === 'select') { this.cols = cols || '*'; this.opts = opts || {}; }
    else { this.returning = true; this.cols = cols || '*'; }
    if (cols && /\(/.test(cols)) miss('embedded select on ' + this.t + ': ' + cols);
    return this;
  };
  Q.insert = function (rows, o) { this.op = 'insert'; this.payload = rows; this.wopts = o || {}; return this; };
  Q.upsert = function (rows, o) { this.op = 'upsert'; this.payload = rows; this.wopts = o || {}; return this; };
  Q.update = function (patch, o) { this.op = 'update'; this.payload = patch; this.wopts = o || {}; return this; };
  Q.delete = function (o) { this.op = 'delete'; this.wopts = o || {}; return this; };
  function addF(op) { return function (col, val) { this.filters.push(function (row) { return test(row, op, col, val); }); this._desc = (this._desc || '') + ' ' + col + '.' + op; return this; }; }
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains'].forEach(function (op) { Q[op] = addF(op); });
  Q.not = function (col, op, val) { var v = op === 'in' ? parseList(val) : (op === 'is' ? parseVal(String(val)) : val); this.filters.push(function (row) { return !test(row, op, col, v); }); return this; };
  Q.or = function (s) { var f = compileCond('or(' + s + ')'); this.filters.push(f); return this; };
  Q.filter = function (col, op, val) { var f = compileCond(col + '.' + op + '.' + val); this.filters.push(f); return this; };
  Q.match = function (obj) { var self = this; Object.keys(obj || {}).forEach(function (k) { self.eq(k, obj[k]); }); return this; };
  Q.order = function (col, o) { this.orders.push({ col: col, asc: !(o && o.ascending === false), nullsFirst: o && o.nullsFirst }); return this; };
  Q.range = function (a, b) { this.rng = [a, b]; return this; };
  Q.limit = function (n) { this.lim = n; return this; };
  Q.single = function () { this.one = 'single'; return this; };
  Q.maybeSingle = function () { this.one = 'maybe'; return this; };
  Q.abortSignal = function () { return this; };
  Q.throwOnError = function () { return this; };
  Q.returns = function () { return this; };
  ['containedBy', 'overlaps', 'textSearch', 'csv', 'explain', 'rangeGt', 'rangeLt', 'rangeGte', 'rangeLte', 'likeAllOf', 'likeAnyOf', 'ilikeAllOf', 'ilikeAnyOf'].forEach(function (n) { Q[n] = function () { miss(n + ' on ' + this.t); return this; }; });

  function project(row, cols) {
    if (!cols || cols === '*' || /^\s*\*\s*$/.test(cols)) return clone(row);
    var out = {};
    cols.split(',').map(function (c) { return c.trim(); }).filter(Boolean).forEach(function (c) {
      if (c === '*') { Object.assign(out, clone(row)); return; }
      var alias = c, src = c; var m = /^([\w]+)\s*:\s*([\w]+)$/.exec(c); if (m) { alias = m[1]; src = m[2]; }
      out[alias] = row[src] === undefined ? null : clone(row[src]);
    });
    return out;
  }
  function matches(q, row) { return q.filters.every(function (f) { return f(row); }); }

  Q._exec = function () {
    var t = this.t, rows = table(t), self = this;
    note(this.op, t + (this._desc || ''));
    if (this.op === 'select') {
      var res = rows.filter(function (r) { return matches(self, r); });
      if (this.orders.length) {
        res = res.slice().sort(function (a, b) {
          for (var i = 0; i < self.orders.length; i++) {
            var o = self.orders[i]; var av = a[o.col], bv = b[o.col];
            if (av == null || bv == null) { if (av == null && bv == null) continue; var nf = o.nullsFirst == null ? !o.asc : o.nullsFirst; return (av == null ? -1 : 1) * (nf ? 1 : -1); }
            var c = cmp(av, bv); if (c) return o.asc ? c : -c;
          }
          return 0;
        });
      }
      var count = res.length;
      if (this.rng) res = res.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) res = res.slice(0, this.lim);
      res = res.map(function (r) { return project(r, self.cols); });
      var out = { data: this.opts.head ? null : res, error: null, count: this.opts.count ? count : null, status: 200, statusText: 'OK' };
      return this._one(out);
    }
    var affected = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      var list = Array.isArray(this.payload) ? this.payload : [this.payload];
      var key = pkOf(t, this.wopts.onConflict);
      for (var li = 0; li < list.length; li++) {
        var r = clone(list[li]) || {};
        if (r.id == null && key === 'id') r.id = (t === 'app_settings') ? 1 : uuid();
        triggers(t, r);
        var idx = rows.findIndex(function (x) { return x[key] != null && looseEq(x[key], r[key]); });
        if (idx >= 0) {
          if (self.op === 'insert') { persist(); return this._one({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "' + t + '_pkey"' }, count: null, status: 409 }); }
          if (self.wopts.ignoreDuplicates) continue;
          rows[idx] = Object.assign({}, rows[idx], r); affected.push(rows[idx]);
        } else {
          if (r.created_at === undefined) r.created_at = new Date().toISOString();   // column default now()
          rows.push(r); affected.push(r);
        }
      }
    } else if (this.op === 'update') {
      rows.forEach(function (r, i) { if (matches(self, r)) { var patch = clone(self.payload) || {}; triggers(t, patch); rows[i] = Object.assign({}, r, patch); affected.push(rows[i]); } });
    } else if (this.op === 'delete') {
      for (var i = rows.length - 1; i >= 0; i--) { if (matches(this, rows[i])) { affected.push(rows[i]); rows.splice(i, 1); } }
    }
    persist();
    var data = this.returning ? affected.map(function (r) { return project(r, self.cols); }) : null;
    return this._one({ data: data, error: null, count: null, status: this.op === 'insert' ? 201 : 200, statusText: 'OK' });
  };
  Q._one = function (out) {
    if (!this.one) return out;
    var d = out.data || [];
    if (d.length > 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'Results contain ' + d.length + ' rows' }, count: out.count, status: 406 };
    if (!d.length) return this.one === 'maybe' ? { data: null, error: null, count: out.count, status: 200 } : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, count: out.count, status: 406 };
    return { data: d[0], error: null, count: out.count, status: 200 };
  };
  Q.then = function (ok, bad) {
    var self = this;
    return new Promise(function (res) { setTimeout(function () { var r; try { r = self._exec(); } catch (e) { r = { data: null, error: { message: 'stub: ' + e.message } }; miss('exec error ' + self.t + ': ' + e.message); } res(r); }, 0); }).then(ok, bad);
  };
  Q.catch = function (bad) { return this.then(null, bad); };
  Q.finally = function (f) { return this.then(function (v) { f(); return v; }, function (e) { f(); throw e; }); };

  // ---------------- RPCs (shaped like supabase/migrations) ----------------
  var RPC = window.__FL_RPC || {};   // filled by sb-rpc.js (prepended by the controller)
  function rpc(name, args) {
    note('rpc', name);
    var fn = RPC[name];
    var p = new Promise(function (res) {
      setTimeout(function () {
        if (!fn) { miss('rpc ' + name); return res({ data: null, error: { message: 'offline film harness: rpc ' + name + ' not available' } }); }
        try { load(); var out = fn(args || {}, { table: table, persist: persist, clone: clone, uuid: uuid, now: function () { return new Date().toISOString(); } }); res({ data: out, error: null }); }
        catch (e) { miss('rpc ' + name + ' threw ' + e.message); res({ data: null, error: { message: e.message } }); }
      }, 0);
    });
    return { then: function (a, b) { return p.then(a, b); }, catch: function (b) { return p.catch(b); }, single: function () { return this; }, maybeSingle: function () { return this; }, select: function () { return this; } };
  }

  // ---------------- auth / realtime / storage / functions ----------------
  function session() {
    return { access_token: 'offline-film-harness', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: 4102444800, refresh_token: 'offline',
      user: { id: SESSION_USER.id, email: SESSION_USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { name: SESSION_USER.name } } };
  }
  var authed = true;
  var auth = {
    getSession: function () { note('auth', 'getSession'); return Promise.resolve({ data: { session: authed ? session() : null }, error: null }); },
    getUser: function () { note('auth', 'getUser'); return Promise.resolve({ data: { user: authed ? session().user : null }, error: null }); },
    signInWithPassword: function () { note('auth', 'signInWithPassword'); return Promise.resolve({ data: { session: null, user: null }, error: { message: 'Sign-in is disabled in the offline film harness' } }); },
    signOut: function () { note('auth', 'signOut'); authed = false; return Promise.resolve({ error: null }); },
    onAuthStateChange: function (cb) { note('auth', 'onAuthStateChange'); setTimeout(function () { try { cb(authed ? 'SIGNED_IN' : 'SIGNED_OUT', authed ? session() : null); } catch (_) {} }, 0); return { data: { subscription: { unsubscribe: function () {} } } }; },
    refreshSession: function () { return Promise.resolve({ data: { session: session() }, error: null }); },
    updateUser: function () { miss('auth.updateUser'); return Promise.resolve({ data: null, error: { message: 'offline' } }); },
    resetPasswordForEmail: function () { miss('auth.resetPasswordForEmail'); return Promise.resolve({ data: null, error: { message: 'offline' } }); },
  };
  function channel(name) {
    note('realtime', 'channel ' + name);
    var ch = { on: function () { return ch; }, subscribe: function (cb) { if (cb) setTimeout(function () { try { cb('SUBSCRIBED'); } catch (_) {} }, 0); return ch; }, unsubscribe: function () { return Promise.resolve('ok'); }, send: function () { return Promise.resolve('ok'); } };
    return ch;
  }
  var storage = { from: function (bucket) {
    note('storage', bucket);
    var err = { message: 'File storage is disabled in the offline film harness' };
    return {
      upload: function () { miss('storage.upload'); return Promise.resolve({ data: null, error: err }); },
      remove: function () { return Promise.resolve({ data: [], error: null }); },
      createSignedUrl: function () { return Promise.resolve({ data: null, error: err }); },
      createSignedUrls: function () { return Promise.resolve({ data: [], error: err }); },
      getPublicUrl: function () { return { data: { publicUrl: '' } }; },
      download: function () { return Promise.resolve({ data: null, error: err }); },
      list: function () { return Promise.resolve({ data: [], error: null }); },
    };
  } };
  var functions = { invoke: function (name) { note('functions', name); miss('functions.invoke ' + name); return Promise.resolve({ data: null, error: { message: 'Edge functions are disabled in the offline film harness' } }); } };

  function createClient(url, key) {
    note('createClient', String(url));
    return {
      from: function (t) { return new Query(t); },
      rpc: rpc, auth: auth, storage: storage, functions: functions,
      channel: channel, removeChannel: function () { return Promise.resolve('ok'); }, removeAllChannels: function () { return Promise.resolve([]); }, getChannels: function () { return []; },
      schema: function () { return this; },
    };
  }

  window.supabase = { createClient: createClient };
  window.__flStub = {
    calls: calls, unknown: unknown,
    db: function () { load(); return db; },
    table: function (t) { return clone(table(t)); },
    reseed: function () { seed(); },
    write: function (t, rows) { load(); db[t] = clone(rows); persist(); },
    signedIn: function (v) { authed = !!v; },
  };
})();
