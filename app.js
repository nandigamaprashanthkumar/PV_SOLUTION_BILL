/* PV Solutions — Billing app logic */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var fmt = window.PVInvoice.formatINR;

  // ---------- defaults ----------
  // Public-safe defaults: NO business/bank data is baked into the public app.
  // Your real details load from the private pv-settings.json via Settings -> Import.
  var DEFAULTS = {
    name: 'PV SOLUTIONS',
    addr: '',
    gstin: '',
    sign: '',
    loc: '',
    mail: '',
    phone: '',
    logo: '',
    bankName: '',
    bankNo: '',
    bankBranch: '',
    bankIfsc: '',
    tmpl: 'PVSOL.PV/{FY}/ IN - {NUM}',
    pad: 3,
    resetEachFY: true,
    counters: {},
    dcgst: 9, dsgst: 9, digst: 18,
    gid: '', driveRoot: 'PV_SOLUTION_BILL',
    gasUrl: '', gasSecret: '', ghOwner: '', ghRepo: 'PV_SOLUTION_BILL_INVOICES'
  };

  var S = {}; // settings
  function loadSettings() {
    try { S = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('pv_settings') || '{}')); }
    catch (e) { S = Object.assign({}, DEFAULTS); }
    if (!S.counters) S.counters = {};
  }
  function saveSettings() { localStorage.setItem('pv_settings', JSON.stringify(S)); }

  // ---------- IndexedDB (invoice records) ----------
  var DB;
  function openDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('pv_billing', 1);
      r.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('invoices')) db.createObjectStore('invoices', { keyPath: 'id' });
      };
      r.onsuccess = function () { DB = r.result; res(DB); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function dbPut(rec) {
    return new Promise(function (res, rej) {
      var tx = DB.transaction('invoices', 'readwrite');
      tx.objectStore('invoices').put(rec);
      tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
    });
  }
  function dbAll() {
    return new Promise(function (res, rej) {
      var tx = DB.transaction('invoices', 'readonly');
      var rq = tx.objectStore('invoices').getAll();
      rq.onsuccess = function () { res(rq.result || []); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function dbDel(id) {
    return new Promise(function (res) {
      var tx = DB.transaction('invoices', 'readwrite');
      tx.objectStore('invoices').delete(id);
      tx.oncomplete = res;
    });
  }

  // ---------- helpers ----------
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MON3 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function fyOf(d) {
    var y = d.getFullYear(), m = d.getMonth();
    var start = m >= 3 ? y : y - 1;
    return start + '-' + String((start + 1) % 100).padStart(2, '0');
  }
  function monthFolder(d) { return String(d.getMonth() + 1).padStart(2, '0') + '-' + MONTHS[d.getMonth()]; }
  function dateDisplay(d) { return String(d.getDate()).padStart(2, '0') + ' ' + MON3[d.getMonth()] + ' ' + d.getFullYear(); }
  function lastSerial(fy) { return S.resetEachFY ? (S.counters[fy] || 0) : (S.counters.ALL || 0); }
  function setLastSerial(fy, n) { if (S.resetEachFY) S.counters[fy] = n; else S.counters.ALL = n; }
  function numberFor(fy, serial) {
    return S.tmpl.replace(/\{FY\}/g, fy).replace(/\{NUM\}/g, String(serial).padStart(Number(S.pad) || 3, '0'));
  }
  function sanitize(s) { return String(s).replace(/[\/\\:*?"<>|]+/g, '_').replace(/\s+/g, '_'); }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3200); }

  // ---------- tabs ----------
  $$('.tab').forEach(function (b) {
    b.onclick = function () {
      $$('.tab').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var t = b.dataset.tab;
      $('#tab-new').style.display = t === 'new' ? '' : 'none';
      $('#tab-history').style.display = t === 'history' ? '' : 'none';
      $('#tab-settings').style.display = t === 'settings' ? '' : 'none';
      $('#toolbarNew').style.display = t === 'new' ? 'flex' : 'none';
      if (t === 'history') renderHistory();
      if (t === 'settings') fillSettings();
    };
  });

  // ---------- settings form ----------
  function fillSettings() {
    $('#s_name').value = S.name; $('#s_addr').value = S.addr; $('#s_gstin').value = S.gstin;
    $('#s_sign').value = S.sign; $('#s_loc').value = S.loc; $('#s_mail').value = S.mail; $('#s_phone').value = S.phone;
    $('#s_bankName').value = S.bankName; $('#s_bankNo').value = S.bankNo; $('#s_bankBranch').value = S.bankBranch; $('#s_bankIfsc').value = S.bankIfsc;
    $('#s_tmpl').value = S.tmpl; $('#s_pad').value = S.pad;
    var fy = fyOf(new Date());
    $('#s_fy').value = fy; $('#s_last').value = lastSerial(fy);
    $('#s_dcgst').value = S.dcgst; $('#s_dsgst').value = S.dsgst; $('#s_digst').value = S.digst;
    $('#s_reset').checked = !!S.resetEachFY;
    $('#s_gid').value = S.gid; $('#s_driveRoot').value = S.driveRoot;
    $('#s_gasUrl').value = S.gasUrl; $('#s_gasSecret').value = S.gasSecret;
    $('#s_ghOwner').value = S.ghOwner; $('#s_ghRepo').value = S.ghRepo;
    if (S.logo) { $('#s_logoPrev').src = S.logo; $('#s_logoPrev').style.display = ''; $('#s_logoClear').style.display = ''; }
    else { $('#s_logoPrev').style.display = 'none'; $('#s_logoClear').style.display = 'none'; }
  }
  // autosave settings on any change within settings tab
  $('#tab-settings').addEventListener('input', function () {
    S.name = $('#s_name').value; S.addr = $('#s_addr').value; S.gstin = $('#s_gstin').value;
    S.sign = $('#s_sign').value; S.loc = $('#s_loc').value; S.mail = $('#s_mail').value; S.phone = $('#s_phone').value;
    S.bankName = $('#s_bankName').value; S.bankNo = $('#s_bankNo').value; S.bankBranch = $('#s_bankBranch').value; S.bankIfsc = $('#s_bankIfsc').value;
    S.tmpl = $('#s_tmpl').value || DEFAULTS.tmpl; S.pad = Number($('#s_pad').value) || 3;
    S.dcgst = num($('#s_dcgst').value); S.dsgst = num($('#s_dsgst').value); S.digst = num($('#s_digst').value);
    S.resetEachFY = $('#s_reset').checked;
    S.gid = $('#s_gid').value.trim(); S.driveRoot = $('#s_driveRoot').value.trim() || DEFAULTS.driveRoot;
    S.gasUrl = $('#s_gasUrl').value.trim(); S.gasSecret = $('#s_gasSecret').value;
    S.ghOwner = $('#s_ghOwner').value.trim(); S.ghRepo = $('#s_ghRepo').value.trim();
    var fy = fyOf(new Date());
    var ls = Number($('#s_last').value); if (!isNaN(ls)) setLastSerial(fy, ls);
    saveSettings(); refreshNumber(); updateBanner();
  });
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  $('#s_logo').onchange = function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { S.logo = r.result; saveSettings(); fillSettings(); toast('Logo saved'); };
    r.readAsDataURL(f);
  };
  $('#s_logoClear').onclick = function () { S.logo = ''; saveSettings(); fillSettings(); };

  $('#btnExport').onclick = function () {
    dbAll().then(function (inv) {
      var blob = new Blob([JSON.stringify({ settings: S, invoices: inv, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      downloadBlob(blob, 'pv-billing-backup-' + new Date().toISOString().slice(0, 10) + '.json');
    });
  };
  $('#importFile').onchange = function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (d.settings) { S = Object.assign({}, DEFAULTS, d.settings); saveSettings(); }
        var chain = Promise.resolve();
        (d.invoices || []).forEach(function (rec) { chain = chain.then(function () { return dbPut(rec); }); });
        chain.then(function () { fillSettings(); refreshNumber(); toast('Backup imported'); });
      } catch (e) { toast('Invalid backup file'); }
    };
    r.readAsText(f);
  };

  // ---------- new invoice form ----------
  var taxMode = 'intra', manualNumber = false;
  $('#f_taxmode').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    taxMode = b.dataset.m;
    $$('#f_taxmode button').forEach(function (x) { x.classList.toggle('active', x === b); });
    syncTaxRateInputs(); computeTotals();
  });
  function syncTaxRateInputs() {
    var inter = taxMode === 'inter';
    $('#f_cgst').disabled = inter; $('#f_sgst').disabled = inter; $('#f_igst').disabled = !inter;
    $('#t_cgstRow').style.display = inter ? 'none' : 'flex';
    $('#t_sgstRow').style.display = inter ? 'none' : 'flex';
    $('#t_igstRow').style.display = inter ? 'flex' : 'none';
  }

  function addRow(it) {
    it = it || { desc: '', hsn: '', qty: 1, price: '' };
    var tb = $('#itemsBody');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="ix muted"></td>' +
      '<td><input class="c-desc" placeholder="Item description" /></td>' +
      '<td><input class="c-hsn" placeholder="8544.42.99" /></td>' +
      '<td><input class="c-qty num" type="number" step="any" /></td>' +
      '<td><input class="c-price num" type="number" step="any" /></td>' +
      '<td class="num c-amt">0</td>' +
      '<td><button class="rowdel" title="remove">&times;</button></td>';
    tr.querySelector('.c-desc').value = it.desc;
    tr.querySelector('.c-hsn').value = it.hsn;
    tr.querySelector('.c-qty').value = it.qty;
    tr.querySelector('.c-price').value = it.price;
    tr.querySelector('.rowdel').onclick = function () { tr.remove(); reindex(); computeTotals(); };
    tr.addEventListener('input', computeTotals);
    tb.appendChild(tr); reindex();
  }
  function reindex() { $$('#itemsBody tr').forEach(function (tr, i) { tr.querySelector('.ix').textContent = (i + 1) + '.'; }); }
  $('#addRow').onclick = function () { addRow(); };

  function readItems() {
    return $$('#itemsBody tr').map(function (tr) {
      return {
        desc: tr.querySelector('.c-desc').value,
        hsn: tr.querySelector('.c-hsn').value,
        qty: num(tr.querySelector('.c-qty').value),
        price: num(tr.querySelector('.c-price').value)
      };
    });
  }
  function currentInvoice() {
    return {
      number: $('#f_number').value.trim(),
      issueISO: $('#f_date').value,
      issuedDate: dateDisplay(parseDate($('#f_date').value)),
      buyerName: $('#f_buyer').value.trim(),
      buyerLines: $('#f_buyerAddr').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
      buyerGstin: $('#f_buyerGstin').value.trim(),
      taxMode: taxMode,
      cgstRate: num($('#f_cgst').value), sgstRate: num($('#f_sgst').value), igstRate: num($('#f_igst').value),
      roundOff: $('#f_round').checked,
      items: readItems()
    };
  }
  function settingsForPdf() {
    return {
      sellerName: S.name, sellerLines: S.addr.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
      gstin: S.gstin, bankAccName: S.bankName, bankAccNo: S.bankNo, bankBranch: S.bankBranch, bankIfsc: S.bankIfsc,
      signatory: S.sign, location: S.loc, mail: S.mail, phone: S.phone, logoDataUrl: S.logo
    };
  }
  function parseDate(iso) { if (!iso) return new Date(); var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  function computeTotals() {
    $$('#itemsBody tr').forEach(function (tr) {
      var a = num(tr.querySelector('.c-qty').value) * num(tr.querySelector('.c-price').value);
      tr.querySelector('.c-amt').textContent = fmt(a, true);
    });
    var t = window.PVInvoice.computeTotals(currentInvoice());
    $('#t_sub').textContent = fmt(t.subtotal, true);
    $('#t_cgstL').textContent = 'CGST ' + t.cgstRate + '%'; $('#t_cgst').textContent = fmt(t.cgst, true);
    $('#t_sgstL').textContent = 'SGST ' + t.sgstRate + '%'; $('#t_sgst').textContent = fmt(t.sgst, true);
    $('#t_igstL').textContent = 'IGST ' + t.igstRate + '%'; $('#t_igst').textContent = fmt(t.igst, true);
    $('#t_roundRow').style.display = (t.roundOff && Math.abs(t.roundOff) >= 0.005) ? 'flex' : 'none';
    $('#t_round').textContent = (t.roundOff >= 0 ? '+' : '') + fmt(t.roundOff, true);
    $('#t_total').textContent = 'INR ' + fmt(t.total, true);
  }
  ['#f_cgst', '#f_sgst', '#f_igst', '#f_round'].forEach(function (s) { $(s).addEventListener('input', computeTotals); });
  $('#f_date').addEventListener('change', function () { if (!manualNumber) refreshNumber(); });
  $('#f_number').addEventListener('input', function () { manualNumber = true; });

  function refreshNumber() {
    var fy = fyOf(parseDate($('#f_date').value));
    $('#f_number').value = numberFor(fy, lastSerial(fy) + 1);
    manualNumber = false;
  }

  // ---------- PDF build (browser) ----------
  function buildPdf(inv) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    window.PVInvoice.buildInvoicePdf(doc, { settings: settingsForPdf(), invoice: inv });
    return doc;
  }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  $('#btnPreview').onclick = function () {
    var inv = currentInvoice();
    if (!inv.items.length) { toast('Add at least one item'); return; }
    var doc = buildPdf(inv);
    window.open(doc.output('bloburl'), '_blank');
  };

  // ---------- Generate & Save ----------
  $('#btnGenerate').onclick = function () {
    var inv = currentInvoice();
    if (!inv.buyerName) { toast('Enter the customer name'); return; }
    if (!inv.items.filter(function (i) { return i.desc && i.price; }).length) { toast('Add at least one item with a price'); return; }

    var d = parseDate(inv.issueISO), fy = fyOf(d);
    var serial = lastSerial(fy) + 1;
    if (!manualNumber) inv.number = numberFor(fy, serial);

    var filename = sanitize(inv.number) + '.pdf';
    var relPath = fy + '/' + monthFolder(d) + '/' + filename;

    var doc = buildPdf(inv);
    var blob = doc.output('blob');
    var b64 = doc.output('datauristring').split(',')[1];

    var totals = window.PVInvoice.computeTotals(inv);
    var rec = {
      id: 'inv_' + Date.now(),
      number: inv.number, serial: serial, fy: fy,
      issueISO: inv.issueISO, issuedDate: inv.issuedDate,
      buyerName: inv.buyerName, buyerLines: inv.buyerLines, buyerGstin: inv.buyerGstin,
      taxMode: inv.taxMode, cgstRate: inv.cgstRate, sgstRate: inv.sgstRate, igstRate: inv.igstRate,
      roundOff: inv.roundOff, items: inv.items,
      total: totals.total, filename: filename, relPath: relPath,
      createdAt: new Date().toISOString(),
      sync: { drive: { status: 'pending' }, github: { status: 'pending' } }
    };

    // 1) download immediately (works offline)
    downloadBlob(blob, filename);

    // 2) consume the serial + save record locally (source of truth)
    setLastSerial(fy, serial); saveSettings();
    dbPut(rec).then(function () {
      toast('Saved ' + inv.number + ' · downloaded');
      refreshNumber();
      // 3) attempt cloud sync
      syncRecord(rec, b64);
    });
  };

  // ---------- Cloud sync ----------
  function syncRecord(rec, b64) {
    if (!b64) { var doc = rebuildPdf(rec); b64 = doc.output('datauristring').split(',')[1]; }
    var jobs = [];
    // Drive
    if (S.gid) {
      rec.sync.drive.status = 'pending';
      jobs.push(driveUpload(rec, b64).then(function (r) {
        rec.sync.drive = { status: 'ok', url: r.webViewLink || '' };
      }).catch(function (e) {
        rec.sync.drive = { status: navigator.onLine ? 'error' : 'pending', msg: String(e && e.message || e) };
      }));
    } else { rec.sync.drive = { status: 'off' }; }
    // GitHub via Apps Script
    if (S.gasUrl) {
      rec.sync.github.status = 'pending';
      jobs.push(githubCommit(rec, b64).then(function (r) {
        rec.sync.github = { status: r && r.ok === false ? 'error' : (r && r.unconfirmed ? 'sent' : 'ok'), url: (r && r.htmlUrl) || '', msg: r && r.message };
      }).catch(function (e) {
        rec.sync.github = { status: navigator.onLine ? 'error' : 'pending', msg: String(e && e.message || e) };
      }));
    } else { rec.sync.github = { status: 'off' }; }

    updateSyncLine(rec);
    return Promise.all(jobs).then(function () {
      return dbPut(rec).then(function () { updateSyncLine(rec); if ($('#tab-history').style.display !== 'none') renderHistory(); });
    });
  }
  function updateSyncLine(rec) {
    function lbl(k, s) { return k + ': ' + (s.status || '—'); }
    $('#syncLine').textContent = 'Drive ' + pillWord(rec.sync.drive.status) + ' · GitHub ' + pillWord(rec.sync.github.status);
  }
  function pillWord(s) { return ({ ok: '✓', sent: '✓?', pending: '…', error: '✕', off: 'off' })[s] || s; }

  function rebuildPdf(rec) {
    var inv = Object.assign({}, rec);
    inv.issuedDate = rec.issuedDate;
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    window.PVInvoice.buildInvoicePdf(doc, { settings: settingsForPdf(), invoice: inv });
    return doc;
  }

  // ---- Google Drive (GIS token client + drive.file) ----
  var tokenClient = null, accessToken = null, tokenExp = 0;
  function initToken() {
    if (tokenClient || !window.google || !S.gid) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: S.gid, scope: 'https://www.googleapis.com/auth/drive.file',
      callback: function () {} // set per-request
    });
  }
  function getToken(interactive) {
    return new Promise(function (res, rej) {
      initToken();
      if (!tokenClient) return rej(new Error('Google not ready — set Client ID in Settings'));
      if (accessToken && Date.now() < tokenExp - 60000) return res(accessToken);
      tokenClient.callback = function (resp) {
        if (resp.error) return rej(new Error(resp.error));
        accessToken = resp.access_token; tokenExp = Date.now() + (resp.expires_in || 3600) * 1000;
        updateGChip(); res(accessToken);
      };
      try { tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' }); }
      catch (e) { rej(e); }
    });
  }
  function gfetch(url, opts) {
    opts = opts || {}; opts.headers = opts.headers || {};
    return getToken(false).then(function (tok) {
      opts.headers['Authorization'] = 'Bearer ' + tok;
      return fetch(url, opts).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('Drive ' + r.status + ': ' + t.slice(0, 120)); });
        return r.json();
      });
    });
  }
  function getOrCreateFolder(name, parentId) {
    var q = "mimeType='application/vnd.google-apps.folder' and name='" + name.replace(/'/g, "\\'") +
      "' and trashed=false" + (parentId ? " and '" + parentId + "' in parents" : " and 'root' in parents");
    return gfetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&spaces=drive')
      .then(function (d) {
        if (d.files && d.files.length) return d.files[0].id;
        return gfetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] })
        }).then(function (f) { return f.id; });
      });
  }
  function driveUpload(rec, b64) {
    var d = parseDate(rec.issueISO);
    return getToken(false)
      .then(function () { return getOrCreateFolder(S.driveRoot, null); })
      .then(function (rootId) { return getOrCreateFolder(rec.fy, rootId); })
      .then(function (fyId) { return getOrCreateFolder(monthFolder(d), fyId); })
      .then(function (monId) {
        var boundary = 'pvb' + Date.now();
        var meta = { name: rec.filename, parents: [monId] };
        var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(meta) + '\r\n--' + boundary +
          '\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
          b64 + '\r\n--' + boundary + '--';
        return gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
          method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body
        });
      });
  }

  // ---- GitHub via Apps Script (simple request to avoid CORS preflight) ----
  function githubCommit(rec, b64) {
    var payload = {
      secret: S.gasSecret, owner: S.ghOwner, repo: S.ghRepo,
      path: 'invoices/' + rec.relPath, contentBase64: b64,
      message: 'Invoice ' + rec.number + ' (' + rec.buyerName + ')',
      ledger: {
        number: rec.number, date: rec.issuedDate, buyer: rec.buyerName, gstin: rec.buyerGstin || '',
        total: rec.total, fy: rec.fy, path: 'invoices/' + rec.relPath, createdAt: rec.createdAt
      }
    };
    return fetch(S.gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
    }).then(function (r) {
      return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: true, unconfirmed: true }; } });
    }).catch(function () { return { ok: true, unconfirmed: true }; }); // opaque/CORS -> assume sent
  }

  // ---------- history ----------
  function renderHistory() {
    dbAll().then(function (inv) {
      inv.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      var q = ($('#histSearch').value || '').toLowerCase();
      if (q) inv = inv.filter(function (r) { return (r.number + ' ' + r.buyerName).toLowerCase().indexOf(q) >= 0; });
      var list = $('#histList'); list.innerHTML = '';
      $('#histEmpty').style.display = inv.length ? 'none' : '';
      inv.forEach(function (r) {
        var row = document.createElement('div'); row.className = 'hrow';
        row.innerHTML =
          '<div class="meta"><div class="no">' + esc(r.number) + '</div>' +
          '<div class="sub">' + esc(r.buyerName) + ' · ' + esc(r.issuedDate) + '</div></div>' +
          '<div style="display:flex;gap:4px;flex-direction:column;align-items:flex-end">' +
          '<div class="amt">INR ' + fmt(r.total, true) + '</div>' +
          '<div>' + syncPill('Drive', r.sync.drive) + ' ' + syncPill('GitHub', r.sync.github) + '</div></div>' +
          '<div style="display:flex;gap:6px;margin-left:8px">' +
          '<button class="btn sm" data-act="pdf">PDF</button>' +
          '<button class="btn sm" data-act="retry">Sync</button>' +
          '<button class="btn sm" data-act="del" style="color:var(--err)">Del</button></div>';
        row.querySelector('[data-act=pdf]').onclick = function () { var doc = rebuildPdf(r); downloadBlob(doc.output('blob'), r.filename); };
        row.querySelector('[data-act=retry]').onclick = function () {
          toast('Syncing ' + r.number + '…'); syncRecord(r, null).then(function () { toast('Sync done'); });
        };
        row.querySelector('[data-act=del]').onclick = function () {
          if (confirm('Delete local record ' + r.number + '? (Files already in Drive/GitHub are kept.)')) dbDel(r.id).then(renderHistory);
        };
        list.appendChild(row);
      });
    });
  }
  function syncPill(k, s) {
    s = s || { status: 'off' };
    var cls = { ok: 'ok', sent: 'ok', pending: 'pend', error: 'err', off: 'off' }[s.status] || 'off';
    var txt = { ok: '✓', sent: '✓?', pending: '…', error: '✕', off: '—' }[s.status] || s.status;
    var inner = k + ' ' + txt;
    if (s.url) return '<a class="pill ' + cls + '" href="' + esc(s.url) + '" target="_blank" style="text-decoration:none">' + inner + '</a>';
    return '<span class="pill ' + cls + '" title="' + esc(s.msg || '') + '">' + inner + '</span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  $('#histSearch').addEventListener('input', renderHistory);

  // ---------- google chip ----------
  $('#gBtn').onclick = function () {
    if (!S.gid) { toast('Add your Google Client ID in Settings first'); return; }
    getToken(true).then(function () { toast('Signed in to Google Drive'); }).catch(function (e) { toast('Sign-in failed: ' + e.message); });
  };
  function updateGChip() { $('#gTxt').textContent = accessToken ? 'Google ✓' : 'Sign in with Google'; }

  // ---------- connectivity + banner ----------
  function setNet() {
    $('#netDot').className = 'netdot ' + (navigator.onLine ? 'on' : 'off');
    if (navigator.onLine) retryPending();
  }
  window.addEventListener('online', setNet); window.addEventListener('offline', setNet);
  function retryPending() {
    if (!DB) return;
    dbAll().then(function (inv) {
      inv.forEach(function (r) {
        var dP = r.sync && r.sync.drive && r.sync.drive.status === 'pending' && S.gid;
        var gP = r.sync && r.sync.github && r.sync.github.status === 'pending' && S.gasUrl;
        if (dP || gP) syncRecord(r, null);
      });
    });
  }
  function updateBanner() {
    var miss = [];
    if (!S.gid) miss.push('Google Client ID');
    if (!S.gasUrl) miss.push('Apps Script URL');
    var b = $('#setupBanner');
    if (miss.length) { b.classList.add('show'); b.innerHTML = 'Cloud sync not fully set up — missing: ' + miss.join(', ') + '. Invoices still generate, download &amp; save locally. Finish setup in the Settings tab.'; }
    else b.classList.remove('show');
  }

  // ---------- init ----------
  function seedForm() {
    var today = new Date();
    $('#f_date').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    refreshNumber();
    syncTaxRateInputs();
    $('#f_cgst').value = S.dcgst; $('#f_sgst').value = S.dsgst; $('#f_igst').value = S.digst;
    if (!$('#itemsBody').children.length) { addRow(); }
    computeTotals();
    $('#barLogo').textContent = (S.name || 'PV').slice(0, 2).toUpperCase();
  }

  loadSettings();
  openDB().then(function () {
    seedForm(); setNet(); updateBanner();
  });

  // service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
