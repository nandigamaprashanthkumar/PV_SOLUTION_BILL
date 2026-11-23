# PV Solutions — Billing (installable PWA)

Generate professional GST tax invoices, keep a record of every one on the device, download each as a
**PDF**, and auto-save a copy to **Google Drive** and a **private GitHub repo** — organised by financial
year and month.

### Two repositories
| Repo | Visibility | Holds |
|---|---|---|
| **PV_SOLUTION_BILL** | **public** | just the app code (so GitHub Pages can serve it for install). No invoices, no bank number. |
| **PV_SOLUTION_BILL_INVOICES** | **private** | the generated invoice PDFs + `ledger.json` / `ledger.csv`. |

Your business + bank details are **not** in the public repo. They load from a private
`pv-settings.json` you import once (see step 2).

---

## 1. Install the app on your desktop

1. The app is served by GitHub Pages at a URL like `https://nandigamaprashanthkumar.github.io/PV_SOLUTION_BILL/`.
2. Open it in **Chrome or Edge**. In the address bar you'll see an **Install** icon (or menu → *Install PV Solutions Billing*). Click it — it becomes a standalone desktop app (Start menu / Dock), opens in its own window, and works offline.

## 2. Load your details (once)

- Open the app → **Settings → Backup → Import backup** → choose **`pv-settings.json`**.
- This fills in your business, bank, signatory, GST defaults, and sets the next number to **`PVSOL.PV/2026-27/ IN - 008`**.
- Everything you import is stored **only in that browser on that device**. Re-import it on any other device.

> Keep `pv-settings.json` somewhere safe (it has your account number). Don't commit it to the public repo.

## 3. Google Drive (one time)

1. **console.cloud.google.com** → create/select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → add your Google account as a **Test user**.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins** → add your Pages origin, e.g. `https://nandigamaprashanthkumar.github.io`
5. Copy the **Client ID** into the app → **Settings → Google OAuth Client ID**. Set **Drive root folder** = `PV_SOLUTION_BILL`.

Scope is `drive.file` — the app only sees files it creates. Invoices land in
`Drive / PV_SOLUTION_BILL / 2026-27 / 11-November / PVSOL.PV_2026-27_IN-008.pdf`.

## 4. GitHub (one time) — commits to the PRIVATE repo

Keeps your GitHub token off the device, via a Google Apps Script.

1. **GitHub token:** Settings → Developer settings → **Fine-grained tokens** → Generate.
   Repository access: **Only `PV_SOLUTION_BILL_INVOICES`**. Permissions: **Contents → Read and write**.
2. **script.google.com** → New project → paste `apps-script/Code.gs`.
3. Project **Settings → Script properties** → add `GITHUB_TOKEN` (the token) and `SHARED_SECRET` (any long random string).
4. **Deploy → New deployment → Web app** → *Execute as: Me*, *Who has access: **Anyone*** → copy the `/exec` URL.
5. In the app → **Settings → Cloud sync**: paste the **Apps Script URL** and the **same shared secret**.
   (Owner/repo are already set to `nandigamaprashanthkumar / PV_SOLUTION_BILL_INVOICES` from your import.)

Commits land in `invoices/2026-27/11-November/…​.pdf`, plus `ledger.json` + `ledger.csv` at the repo root.

---

## 5. Daily use

**New Invoice** → number + date pre-filled → enter customer + items → **Generate & Save**:
the PDF downloads, the record is saved and the serial advances, and copies go to Drive + the private GitHub repo.
**History** lets you re-download any PDF, retry a sync, or search.

- Tax: CGST 9% + SGST 9% (same-state), auto IGST 18% for other-state buyers; editable per invoice.
- Financial year rolls on 1 April; serial resets to 1 each FY (toggle in Settings).
- **Settings → Export backup** regularly — your records live in the browser.

## Files
```
index.html  app.js  invoice-pdf.js  vendor/jspdf.umd.min.js
manifest.webmanifest  sw.js  icons/  apps-script/Code.gs
```
