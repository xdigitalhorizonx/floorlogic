/* RPC stand-ins, shaped exactly like the latest definitions in
 * floorlogicdemo (main) supabase/migrations/:
 *   get_quote_by_token        20260806000003_public_doc_name.sql
 *   get_invoice_by_token      20260811000001_invoice_final_and_public_pay.sql
 *   approve_quote_by_token    20260507000002_quote_selected_options.sql
 *   log_quote_interaction     20260506000003_public_quote_links.sql
 *   get_quote_chat_messages   20260512000001_quote_chat_messages.sql
 * Each fn(args, db) runs against the in-memory tables and returns what supabase-js
 * would put in `data`.
 */
window.__FL_RPC = (function () {
  function settings(db) { return (db.table('app_settings').find(function (r) { return String(r.id) === '1'; })) || {}; }
  function terms(list, enabled) {
    list = Array.isArray(list) ? list : [];
    var en = Array.isArray(enabled) ? enabled : [];
    var keep = en.length ? list.filter(function (t) { return t && en.indexOf(t.id) >= 0; }) : list.filter(function (t) { return t && t.defaultOn === true; });
    return keep;
  }
  function party(db, row) {
    var c = row.customer_id ? db.table('customers').find(function (x) { return x.id === row.customer_id; }) : null;
    var l = row.lead_id ? db.table('leads').find(function (x) { return x.id === row.lead_id; }) : null;
    function co(k) { var a = c ? c[k] : null; if (a != null) return a; var b = l ? l[k] : null; return b == null ? null : b; }
    return { name: co('name'), phone: co('phone'), email: co('email'), address: co('address'), address2: co('address2') };
  }
  function v(x) { return x === undefined ? null : x; }
  function qint(db, quoteId, kind, ua) {
    var id = 'qint_' + String(Date.now() / 1000).replace('.', '') + '_' + Math.floor(Math.random() * 100000);
    db.table('quote_interactions').push({ id: id, quote_id: quoteId, kind: kind, user_agent: ua == null ? null : ua, created_at: db.now() });
  }
  function common(db, q, p) {
    return {
      id: q.id, number: v(q.number), customer_id: v(q.customer_id),
      customer_name: p.name, customer_phone: p.phone, customer_email: p.email, customer_address: p.address,
      status: v(q.status), materials: v(q.materials), labors: v(q.labors),
    };
  }
  return {
    get_quote_by_token: function (a, db) {
      var q = db.table('quotes').find(function (r) { return r.public_token != null && r.public_token === a.token; });
      if (!q) return [];
      var p = party(db, q); var s = settings(db);
      var row = common(db, q, p);
      Object.assign(row, {
        rooms: v(q.rooms), subtotal: v(q.subtotal), tax: v(q.tax), total: v(q.total), tax_rate: v(q.tax_rate),
        tax_county: v(q.tax_county), tax_exempt: v(q.tax_exempt), tax_exempt_number: v(q.tax_exempt_number), down_payment_pct: v(q.down_payment_pct),
        notes: v(q.notes), job_description: v(q.job_description), materials_description: v(q.materials_description), labor_description: v(q.labor_description),
        payment_terms: v(q.payment_terms), enabled_terms: v(q.enabled_terms),
        site_address: v(q.site_address), site_address_title: v(q.site_address_title), site_contact: v(q.site_contact), project_type: v(q.project_type),
        sales_rep_name: v(q.sales_rep_name), sales_rep_email: v(q.sales_rep_email), sales_rep_name_2: v(q.sales_rep_name_2), sales_rep_email_2: v(q.sales_rep_email_2),
        line_items_header: v(q.line_items_header), sections: v(q.sections), selected_options: v(q.selected_options), show_breakdown: v(q.show_breakdown), edit_unlocked: v(q.edit_unlocked),
        created_at: v(q.created_at), expiration_date: v(q.expiration_date), approved_at: v(q.approved_at),
        quote_terms: terms(s.system_quote_terms, q.enabled_terms),
        site_address2: v(q.site_address2), customer_address2: p.address2, doc_name: v(q.doc_name),
      });
      return [db.clone(row)];
    },
    get_invoice_by_token: function (a, db) {
      var i = db.table('invoices').find(function (r) { return r.public_token != null && r.public_token === a.token; });
      if (!i) return [];
      var p = party(db, i); var s = settings(db);
      var row = common(db, i, p);
      Object.assign(row, {
        rooms: [], subtotal: v(i.subtotal), tax: v(i.tax), total: v(i.total), tax_rate: v(i.tax_rate),
        tax_county: v(i.tax_county), tax_exempt: v(i.tax_exempt), tax_exempt_number: v(i.tax_exempt_number), down_payment_pct: v(i.down_payment_pct),
        notes: v(i.notes), job_description: v(i.job_description), materials_description: v(i.materials_description), labor_description: v(i.labor_description),
        payment_terms: v(i.payment_terms), enabled_terms: v(i.enabled_terms),
        site_address: v(i.site_address), site_address_title: v(i.site_address_title), site_contact: v(i.site_contact), project_type: v(i.project_type),
        sales_rep_name: v(i.sales_rep_name), sales_rep_email: v(i.sales_rep_email), sales_rep_name_2: v(i.sales_rep_name_2), sales_rep_email_2: v(i.sales_rep_email_2),
        line_items_header: v(i.line_items_header), sections: v(i.sections), selected_options: [], show_breakdown: false, edit_unlocked: false,
        created_at: v(i.created_at), expiration_date: v(i.due_date), approved_at: null,
        quote_terms: terms(s.system_invoice_terms, i.enabled_terms),
        payments: v(i.payments), amount_paid: v(i.amount_paid), due_date: v(i.due_date),
        site_address2: v(i.site_address2), customer_address2: p.address2, doc_name: v(i.doc_name), final_invoice: i.final_invoice == null ? false : !!i.final_invoice,
      });
      return [db.clone(row)];
    },
    approve_quote_by_token: function (a, db) {
      var rows = db.table('quotes');
      var idx = rows.findIndex(function (r) { return r.public_token != null && r.public_token === a.token && (r.status === 'draft' || r.status === 'sent'); });
      if (idx < 0) return null;
      var q = rows[idx];
      var now = db.now();
      rows[idx] = Object.assign({}, q, { status: 'approved', approved_at: now, updated_at: now, selected_options: a.options != null ? db.clone(a.options) : (q.selected_options == null ? null : q.selected_options) });
      qint(db, q.id, 'approved', null);
      db.persist();
      return q.id;
    },
    log_quote_interaction: function (a, db) {
      if (a.interaction_kind !== 'view' && a.interaction_kind !== 'approved') throw new Error('invalid interaction kind');
      var q = db.table('quotes').find(function (r) { return r.public_token != null && r.public_token === a.token; });
      if (q) { qint(db, q.id, a.interaction_kind, a.ua); db.persist(); }
      return null;
    },
    get_quote_chat_messages: function (a, db) {
      var q = db.table('quotes').find(function (r) { return r.public_token != null && r.public_token === a.token; });
      if (!q) return [];
      return db.table('quote_chat_messages').filter(function (m) { return m.quote_id === q.id; })
        .sort(function (x, y) { return String(x.created_at).localeCompare(String(y.created_at)); })
        .map(function (m) { return { id: m.id, sender: m.sender, email: m.email, body: m.body, created_at: m.created_at }; });
    },
  };
})();
