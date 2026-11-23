/**
 * PV Solutions — GitHub bridge (Google Apps Script Web App)
 * ---------------------------------------------------------
 * Receives a generated invoice PDF from the billing app and commits it to a
 * PRIVATE GitHub repo, then updates ledger.json + ledger.csv at the repo root.
 *
 * The GitHub token stays HERE (in Script Properties), never in the browser.
 *
 * SETUP (once):
 *  1. Open https://script.google.com  ->  New project. Paste this file.
 *  2. Project Settings (gear) -> Script Properties -> add:
 *        GITHUB_TOKEN   = a fine-grained PAT with "Contents: Read and write"
 *                         on the PV_SOLUTION_BILL repo only
 *        SHARED_SECRET  = any long random string (put the SAME value in the
 *                         app's Settings -> "Shared secret")
 *  3. Deploy -> New deployment -> type "Web app"
 *        Execute as: Me
 *        Who has access: Anyone
 *     Copy the /exec URL into the app's Settings -> "Apps Script web-app URL".
 *
 * Re-deploy (Manage deployments -> edit -> Version: New) after any code change.
 */

function doPost(e) {
  var out = { ok: false };
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('GITHUB_TOKEN');
    var secret = props.getProperty('SHARED_SECRET');

    if (!token) throw new Error('GITHUB_TOKEN not set in Script Properties');
    if (secret && body.secret !== secret) throw new Error('Bad shared secret');

    var owner = body.owner, repo = body.repo;
    if (!owner || !repo) throw new Error('Missing owner/repo');

    // 1) commit the PDF
    var pdfRes = putFile(owner, repo, token, body.path, body.contentBase64, body.message || ('Add ' + body.path));

    // 2) update ledgers
    if (body.ledger) {
      appendJsonLedger(owner, repo, token, body.ledger);
      appendCsvLedger(owner, repo, token, body.ledger);
    }

    out = { ok: true, htmlUrl: pdfRes.content ? pdfRes.content.html_url : '', path: body.path };
  } catch (err) {
    out = { ok: false, message: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'pv-github-bridge' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- GitHub Contents API helpers ----
function apiBase(owner, repo) { return 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/'; }

function ghHeaders(token) {
  return { Authorization: 'token ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'pv-billing-bridge' };
}

function getSha(owner, repo, token, path) {
  var url = apiBase(owner, repo) + encodeURI(path);
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: ghHeaders(token), muteHttpExceptions: true });
  if (res.getResponseCode() === 200) return JSON.parse(res.getContentText()).sha;
  return null;
}

function putFile(owner, repo, token, path, contentBase64, message) {
  var url = apiBase(owner, repo) + encodeURI(path);
  var payload = { message: message, content: contentBase64 };
  var sha = getSha(owner, repo, token, path);
  if (sha) payload.sha = sha; // update existing
  var res = UrlFetchApp.fetch(url, {
    method: 'put', headers: ghHeaders(token), contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('GitHub ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function getFileText(owner, repo, token, path) {
  var url = apiBase(owner, repo) + encodeURI(path);
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: ghHeaders(token), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var j = JSON.parse(res.getContentText());
  return { sha: j.sha, text: Utilities.newBlob(Utilities.base64Decode(j.content)).getDataAsString() };
}

function appendJsonLedger(owner, repo, token, row) {
  var existing = getFileText(owner, repo, token, 'ledger.json');
  var arr = [];
  if (existing && existing.text) { try { arr = JSON.parse(existing.text); } catch (e) { arr = []; } }
  // de-dupe by invoice number
  arr = arr.filter(function (r) { return r.number !== row.number; });
  arr.push(row);
  var b64 = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(arr, null, 2)).getBytes());
  putFileWithSha(owner, repo, token, 'ledger.json', b64, 'Update ledger.json (' + row.number + ')', existing && existing.sha);
}

function appendCsvLedger(owner, repo, token, row) {
  var existing = getFileText(owner, repo, token, 'ledger.csv');
  var header = 'Number,Date,Buyer,GSTIN,Total,FinancialYear,Path,CreatedAt\n';
  var text = existing && existing.text ? existing.text : header;
  if (text.indexOf(header.trim()) !== 0) text = header + text;
  var line = [row.number, row.date, csv(row.buyer), row.gstin, row.total, row.fy, row.path, row.createdAt]
    .map(csv).join(',') + '\n';
  // avoid duplicate line for same number
  if (text.indexOf('\n' + csvFirst(row.number)) === -1 && text.indexOf(csvFirst(row.number)) !== header.length) {
    text += line;
  } else {
    text += line; // simple append; de-dupe handled in json
  }
  var b64 = Utilities.base64Encode(Utilities.newBlob(text).getBytes());
  putFileWithSha(owner, repo, token, 'ledger.csv', b64, 'Update ledger.csv (' + row.number + ')', existing && existing.sha);
}

function putFileWithSha(owner, repo, token, path, b64, message, sha) {
  var url = apiBase(owner, repo) + encodeURI(path);
  var payload = { message: message, content: b64 };
  if (sha) payload.sha = sha;
  var res = UrlFetchApp.fetch(url, {
    method: 'put', headers: ghHeaders(token), contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('GitHub ledger ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 160));
}

function csv(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csvFirst(v) { return csv(v) + ','; }
