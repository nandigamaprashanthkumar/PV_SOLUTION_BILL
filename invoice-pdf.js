/*
 * PV Solutions — Invoice PDF builder (shared browser + Node module)
 * Draws a crisp vector A4 tax invoice with a jsPDF instance.
 *
 * Usage:
 *   const doc = new jsPDF({ unit: 'mm', format: 'a4' });
 *   buildInvoicePdf(doc, { settings, invoice });
 *   doc.save('invoice.pdf');  // browser
 *
 * No external deps beyond jsPDF. Pure, deterministic.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PVInvoice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- palette ----
  const INK = [26, 32, 44];        // near-black slate
  const MUTED = [107, 114, 128];   // grey
  const ACCENT = [13, 110, 115];   // teal
  const ACCENT_SOFT = [224, 240, 240];
  const LINE = [214, 219, 223];
  const QTY = [198, 93, 7];        // warm amber (matches original)

  // ---- Indian number helpers ----
  function formatINR(n, withDecimals) {
    if (n === null || n === undefined || isNaN(n)) n = 0;
    const neg = n < 0;
    n = Math.abs(n);
    let intPart = Math.floor(n);
    const dec = withDecimals ? ('.' + (Math.round((n - intPart) * 100)).toString().padStart(2, '0')) : '';
    let s = intPart.toString();
    // Indian grouping: last 3 digits, then pairs
    let last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    const out = rest + last3 + dec;
    return (neg ? '-' : '') + out;
  }

  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigit(n) {
    if (n < 20) return ONES[n];
    return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim();
  }
  function threeDigit(n) {
    let str = '';
    if (n > 99) { str += ONES[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) str += ' '; }
    if (n) str += twoDigit(n);
    return str;
  }
  function amountInWords(num) {
    num = Math.round(num);
    if (num === 0) return 'Rupees Zero Only';
    let words = '';
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    const hundred = num;
    if (crore) words += threeDigit(crore) + ' Crore ';
    if (lakh) words += threeDigit(lakh) + ' Lakh ';
    if (thousand) words += threeDigit(thousand) + ' Thousand ';
    if (hundred) words += threeDigit(hundred) + ' ';
    return 'Rupees ' + words.trim() + ' Only';
  }

  // ---- compute totals ----
  function computeTotals(invoice) {
    const items = (invoice.items || []).map(function (it) {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      return { desc: it.desc || '', hsn: it.hsn || '', qty: qty, price: price, amount: qty * price };
    });
    const subtotal = items.reduce(function (s, it) { return s + it.amount; }, 0);
    const inter = invoice.taxMode === 'inter';
    const cgstRate = inter ? 0 : (invoice.cgstRate != null ? Number(invoice.cgstRate) : 9);
    const sgstRate = inter ? 0 : (invoice.sgstRate != null ? Number(invoice.sgstRate) : 9);
    const igstRate = inter ? (invoice.igstRate != null ? Number(invoice.igstRate) : 18) : 0;
    const cgst = subtotal * cgstRate / 100;
    const sgst = subtotal * sgstRate / 100;
    const igst = subtotal * igstRate / 100;
    let total = subtotal + cgst + sgst + igst;
    let roundOff = 0;
    if (invoice.roundOff) {
      const rounded = Math.round(total);
      roundOff = rounded - total;
      total = rounded;
    }
    return { items, subtotal, inter, cgstRate, sgstRate, igstRate, cgst, sgst, igst, roundOff, total };
  }

  function buildInvoicePdf(doc, data) {
    const s = data.settings || {};
    const inv = data.invoice || {};
    const t = computeTotals(inv);

    const PW = 210, MX = 15, CW = PW - MX * 2;
    const right = PW - MX;
    let y = 16;

    function setInk(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function font(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }

    // ===== Header: wordmark + logo =====
    font('bold', 26); setInk(INK);
    doc.text((s.sellerName || 'PV SOLUTIONS').toUpperCase(), MX, y + 6);

    // logo: uploaded image or drawn PV mark
    const logoSize = 20, logoX = right - logoSize, logoY = y - 6;
    if (s.logoDataUrl) {
      try {
        const fmt = /png/i.test(s.logoDataUrl) ? 'PNG' : 'JPEG';
        doc.addImage(s.logoDataUrl, fmt, logoX, logoY, logoSize, logoSize);
      } catch (e) { drawPVMark(doc, logoX, logoY, logoSize); }
    } else {
      drawPVMark(doc, logoX, logoY, logoSize);
    }

    y += 12;
    font('bold', 13); setInk(ACCENT);
    doc.text('INVOICE', MX, y);
    y += 3;
    doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.6);
    doc.line(MX, y, right, y);
    y += 8;

    // ===== invoice no + issued date =====
    font('bold', 9); setInk(INK);
    doc.text(String(inv.number || ''), MX, y);
    font('normal', 9); setInk(ACCENT);
    doc.text('Issued Date : ', right - 48, y);
    font('bold', 9); setInk(INK);
    doc.text(String(inv.issuedDate || ''), right, y, { align: 'right' });
    y += 9;

    // ===== FROM / ISSUED TO =====
    const colR = PW / 2 + 6;
    font('bold', 8.5); setInk(ACCENT);
    doc.text('FROM :', MX, y);
    doc.text('ISSUED TO :', colR, y);
    y += 5;

    const fromLines = [bold(s.sellerName || 'PV SOLUTIONS')].concat(s.sellerLines || [])
      .concat(s.gstin ? [bold('GSTIN - ' + s.gstin)] : []);
    const toLines = [bold(inv.buyerName || '')].concat(inv.buyerLines || [])
      .concat(inv.buyerGstin ? [bold('GSTIN - ' + inv.buyerGstin)] : []);

    const blockTop = y;
    let yl = blockTop, yr = blockTop;
    yl = drawLines(doc, fromLines, MX, yl, CW / 2 - 6);
    yr = drawLines(doc, toLines, colR, yr, CW / 2 - 6);
    y = Math.max(yl, yr) + 6;

    // ===== Items table =====
    // columns: #, DESCRIPTION, HSN, QTY, RATE, AMOUNT
    const cNo = MX;
    const cDescX = MX + 8;
    const cAmtR = right;                 // amount right edge
    const cRateR = right - 30;           // rate right edge
    const cQtyR = cRateR - 24;           // qty right edge
    const cHsnX = cQtyR - 32;            // hsn left
    const descW = cHsnX - cDescX - 2;

    // header band
    doc.setFillColor(ACCENT_SOFT[0], ACCENT_SOFT[1], ACCENT_SOFT[2]);
    doc.rect(MX, y - 4.5, CW, 7, 'F');
    font('bold', 8); setInk(ACCENT);
    doc.text('#', cNo + 1, y);
    doc.text('DESCRIPTION', cDescX, y);
    doc.text('HSN', cHsnX, y);
    doc.text('QTY', cQtyR, y, { align: 'right' });
    doc.text('RATE', cRateR, y, { align: 'right' });
    doc.text('AMOUNT', cAmtR, y, { align: 'right' });
    y += 6;

    font('normal', 8.5);
    t.items.forEach(function (it, i) {
      const wrapped = doc.splitTextToSize(it.desc || '', descW);
      const rowH = Math.max(6, wrapped.length * 4 + 2);
      setInk(MUTED);
      doc.text(String(i + 1) + '.', cNo + 1, y);
      setInk(INK);
      doc.text(wrapped, cDescX, y);
      setInk(MUTED);
      doc.text(String(it.hsn || ''), cHsnX, y);
      doc.setTextColor(QTY[0], QTY[1], QTY[2]);
      font('bold', 8.5);
      doc.text(String(it.qty), cQtyR, y, { align: 'right' });
      font('normal', 8.5); setInk(INK);
      doc.text(formatINR(it.price), cRateR, y, { align: 'right' });
      doc.text(formatINR(it.amount), cAmtR, y, { align: 'right' });
      y += rowH;
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.2);
      doc.line(MX, y - 3.5, right, y - 3.5);
    });

    y += 3;

    // ===== Totals (right aligned block) =====
    const labelR = cRateR;      // label right edge
    const valR = cAmtR;
    function totalRow(label, value, opts) {
      opts = opts || {};
      font(opts.bold ? 'bold' : 'normal', opts.size || 9);
      setInk(opts.bold ? INK : MUTED);
      doc.text(label, labelR, y, { align: 'right' });
      setInk(INK);
      if (opts.bold) font('bold', opts.size || 9);
      doc.text(value, valR, y, { align: 'right' });
      y += opts.gap || 5.5;
    }
    totalRow('Subtotal', formatINR(t.subtotal, true));
    if (t.inter) {
      totalRow('IGST ' + t.igstRate + '%', formatINR(t.igst, true));
    } else {
      totalRow('CGST ' + t.cgstRate + '%', formatINR(t.cgst, true));
      totalRow('SGST ' + t.sgstRate + '%', formatINR(t.sgst, true));
    }
    if (inv.roundOff && Math.abs(t.roundOff) >= 0.005) {
      totalRow('Round Off', (t.roundOff >= 0 ? '+' : '') + formatINR(t.roundOff, true));
    }
    // total band
    y += 1;
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(labelR - 36, y - 4.5, (valR - labelR) + 36, 8, 'F');
    doc.setTextColor(255, 255, 255);
    font('bold', 10);
    doc.text('TOTAL', labelR, y + 0.5, { align: 'right' });
    doc.text('INR ' + formatINR(t.total, true), valR, y + 0.5, { align: 'right' });
    y += 9;

    // amount in words
    font('italic', 8); setInk(MUTED);
    const words = doc.splitTextToSize(amountInWords(t.total) + '.', CW);
    doc.text(words, MX, y);
    y += words.length * 4 + 4;

    // ===== Payment + signatory =====
    const payTop = Math.max(y, 232);
    font('bold', 8.5); setInk(ACCENT);
    doc.text('PAYMENT TO :', MX, payTop);
    font('normal', 8.5); setInk(INK);
    const payLines = [
      [bold('A/c Name'), s.bankAccName || s.sellerName || ''],
      [bold('A/c No.'), s.bankAccNo || ''],
      [bold('Branch'), s.bankBranch || ''],
      [bold('IFSC'), s.bankIfsc || '']
    ];
    let py = payTop + 5.5;
    payLines.forEach(function (row) {
      font('bold', 8.5); setInk(MUTED);
      doc.text(row[0].t, MX, py);
      font('normal', 8.5); setInk(INK);
      doc.text(': ' + row[1], MX + 22, py);
      py += 5;
    });

    // signatory box
    const boxW = 58, boxH = 30, boxX = right - boxW, boxY = payTop - 2;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.4);
    doc.rect(boxX, boxY, boxW, boxH);
    font('normal', 8); setInk(MUTED);
    doc.text('For ' + (s.sellerName || 'PV SOLUTIONS'), boxX + 4, boxY + 6);
    font('bold', 8.5); setInk(INK);
    doc.text(s.signatory || 'Authorised Signatory', boxX + boxW - 4, boxY + boxH - 4, { align: 'right' });

    // ===== Footer =====
    const fy = 288;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3);
    doc.line(MX, fy - 4, right, fy - 4);
    font('bold', 7.5); setInk(ACCENT);
    doc.text('Location:', MX, fy);
    doc.text('Mail:', MX, fy + 4);
    font('normal', 7.5); setInk(MUTED);
    doc.text(' ' + (s.location || 'Hyderabad'), MX + 13, fy);
    doc.text(' ' + (s.mail || ''), MX + 8, fy + 4);
    font('bold', 7.5); setInk(ACCENT);
    doc.text('Ph.No :', right - 44, fy, { align: 'left' });
    font('normal', 7.5); setInk(MUTED);
    doc.text(String(s.phone || ''), right, fy, { align: 'right' });
    if (s.signatory) { doc.text(String(s.signatory), right, fy + 4, { align: 'right' }); }

    return doc;
  }

  // helper: bold marker for mixed line rendering
  function bold(text) { return { t: text, b: true }; }
  function drawLines(doc, lines, x, y, w) {
    lines.forEach(function (ln) {
      const isObj = typeof ln === 'object' && ln !== null;
      const txt = isObj ? ln.t : ln;
      doc.setFont('helvetica', isObj && ln.b ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      const wrapped = doc.splitTextToSize(String(txt || ''), w);
      doc.text(wrapped, x, y);
      y += wrapped.length * 4.2;
    });
    return y;
  }

  // Draw the fallback "PV / SOLUTIONS" mark (black rounded square)
  function drawPVMark(doc, x, y, size) {
    doc.setFillColor(17, 17, 17);
    doc.roundedRect(x, y, size, size, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size * 0.42);
    doc.text('PV', x + size / 2, y + size * 0.52, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size * 0.14);
    doc.text('SOLUTIONS', x + size / 2, y + size * 0.74, { align: 'center' });
  }

  return {
    buildInvoicePdf: buildInvoicePdf,
    computeTotals: computeTotals,
    formatINR: formatINR,
    amountInWords: amountInWords
  };
});
