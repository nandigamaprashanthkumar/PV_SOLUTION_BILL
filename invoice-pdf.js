/*
 * PV Solutions — Invoice PDF builder (shared browser + Node module)
 * Matches the original PV Solutions invoice layout exactly (monochrome).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PVInvoice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- palette (monochrome, matches original) ----
  var INK = [26, 26, 26];      // near-black
  var MUTED = [90, 90, 90];    // address / secondary
  var SEP = [150, 150, 150];   // ":" separators
  var RULE = [26, 26, 26];     // black rules

  // ---- Indian number format ----
  function formatINR(n, withDecimals) {
    if (n === null || n === undefined || isNaN(n)) n = 0;
    var neg = n < 0; n = Math.abs(n);
    var intPart = Math.floor(n);
    var dec = withDecimals ? ('.' + Math.round((n - intPart) * 100).toString().padStart(2, '0')) : '';
    var s = intPart.toString();
    var last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return (neg ? '-' : '') + rest + last3 + dec;
  }

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function twoDigit(n) { return n < 20 ? ONES[n] : (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim(); }
  function threeDigit(n) {
    var str = '';
    if (n > 99) { str += ONES[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) str += ' '; }
    if (n) str += twoDigit(n);
    return str;
  }
  // Original style: "Five Lakhs Nineteen Thousand Two Hundred Rupees Only"
  function amountInWords(num) {
    num = Math.round(num);
    if (num === 0) return 'Zero Rupees Only';
    var w = '';
    var crore = Math.floor(num / 10000000); num %= 10000000;
    var lakh = Math.floor(num / 100000); num %= 100000;
    var thousand = Math.floor(num / 1000); num %= 1000;
    if (crore) w += threeDigit(crore) + ' Crores ';
    if (lakh) w += threeDigit(lakh) + ' Lakhs ';
    if (thousand) w += threeDigit(thousand) + ' Thousand ';
    if (num) w += threeDigit(num) + ' ';
    return w.trim() + ' Rupees Only';
  }

  function computeTotals(invoice) {
    var items = (invoice.items || []).map(function (it) {
      var qty = Number(it.qty) || 0, price = Number(it.price) || 0;
      return { desc: it.desc || '', hsn: it.hsn || '', qty: qty, price: price, amount: qty * price };
    });
    var subtotal = items.reduce(function (s, it) { return s + it.amount; }, 0);
    var inter = invoice.taxMode === 'inter';
    var cgstRate = inter ? 0 : (invoice.cgstRate != null ? Number(invoice.cgstRate) : 9);
    var sgstRate = inter ? 0 : (invoice.sgstRate != null ? Number(invoice.sgstRate) : 9);
    var igstRate = inter ? (invoice.igstRate != null ? Number(invoice.igstRate) : 18) : 0;
    var cgst = subtotal * cgstRate / 100, sgst = subtotal * sgstRate / 100, igst = subtotal * igstRate / 100;
    var total = subtotal + cgst + sgst + igst, roundOff = 0;
    if (invoice.roundOff) { var r = Math.round(total); roundOff = r - total; total = r; }
    return { items: items, subtotal: subtotal, inter: inter, cgstRate: cgstRate, sgstRate: sgstRate, igstRate: igstRate, cgst: cgst, sgst: sgst, igst: igst, roundOff: roundOff, total: total };
  }

  function buildInvoicePdf(doc, data) {
    var s = data.settings || {}, inv = data.invoice || {}, t = computeTotals(inv);
    var ML = 15, MR = 193, PW = 210;

    function ink(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function font(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }
    function rule(x1, y, x2, w, c) { c = c || RULE; doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w); doc.line(x1, y, x2, y); }

    // ===== header wordmark + logo =====
    font('bold', 30); ink(INK);
    doc.text((s.sellerName || 'PV SOLUTIONS').toUpperCase(), ML, 27);

    var logo = s.logoDataUrl || (typeof window !== 'undefined' && window.PV_LOGO_DATAURL) || '';
    var lsz = 27, lx = MR - lsz, ly = 9;
    if (logo) { try { doc.addImage(logo, /png/i.test(logo) ? 'PNG' : 'JPEG', lx, ly, lsz, lsz); } catch (e) { drawMark(doc, lx, ly, lsz); } }
    else drawMark(doc, lx, ly, lsz);

    font('bold', 22); ink(INK);
    doc.text('INVOICE', ML, 45);
    rule(ML, 50, MR, 0.6);

    // ===== invoice no + issued date =====
    var y = 63;
    font('bold', 11); ink(INK);
    doc.text(String(inv.number || ''), ML, y);
    font('normal', 11); ink(INK);
    var dv = String(inv.issuedDate || '');
    var dvW = doc.getTextWidth(dv);
    font('bold', 11);
    doc.text(dv, MR, y, { align: 'right' });
    font('normal', 11); ink(INK);
    var lblX = MR - dvW - 6;
    doc.text('Issued Date', lblX - doc.getTextWidth('Issued Date  :  '), y);
    ink(SEP);
    doc.text(':', lblX - doc.getTextWidth(':  '), y);

    // ===== FROM / ISSUED TO =====
    y = 78;
    var colR = ML + 92;
    font('bold', 12); ink(INK);
    doc.text('FROM :', ML, y);
    doc.text('ISSUED TO :', colR, y);

    var leftLines = [B(s.sellerName || 'PV SOLUTIONS'), ''].concat(s.sellerLines || [])
      .concat(s.gstin ? [B('GSTIN - ' + s.gstin)] : []);
    var rightLines = [B(inv.buyerName || ''), ''].concat(inv.buyerLines || [])
      .concat(inv.buyerGstin ? [B('GSTIN - ' + inv.buyerGstin)] : []);
    var yl = drawBlock(doc, leftLines, ML, y + 10, 82);
    var yr = drawBlock(doc, rightLines, colR, y + 10, MR - colR);
    y = Math.max(yl, yr);

    // ===== items table =====
    var TH = Math.max(y + 12, 124);
    var xHSN = 106, xQTY = 130, xPrice = 162, xAmt = MR;   // HSN center, QTY center, PRICE right, AMOUNT right
    font('bold', 10.5); ink(INK);
    doc.text('DESCRIPTION', ML, TH);
    doc.text('HSN', xHSN, TH, { align: 'center' });
    doc.text('QTY', xQTY, TH, { align: 'center' });
    doc.text('PRICE', xPrice, TH, { align: 'right' });
    doc.text('AMOUNT', xAmt, TH, { align: 'right' });
    rule(ML, TH + 4, MR, 0.6);

    var ry = TH + 13;
    font('normal', 10.5);
    var descL = ML + 6, descW = 70;
    t.items.forEach(function (it, i) {
      var wrapped = doc.splitTextToSize(it.desc || '', descW);
      ink(INK);
      doc.text(String(i + 1) + '.', ML, ry);
      doc.text(wrapped, descL, ry);
      doc.text(String(it.hsn || ''), xHSN, ry, { align: 'center' });
      doc.text(formatINR(it.qty, true), xQTY, ry, { align: 'center' });
      doc.text(formatINR(it.price, true), xPrice, ry, { align: 'right' });
      doc.text(formatINR(it.amount, true), xAmt, ry, { align: 'right' });
      ry += Math.max(9, wrapped.length * 5 + 4);
    });
    rule(ML, ry, MR, 0.6);

    // ===== totals =====
    ry += 9;
    var xLR = 161;
    function trow(label, value, bold) {
      font(bold ? 'bold' : 'bold', 11); ink(INK);
      doc.text(label, xLR, ry, { align: 'right' });
      font(bold ? 'bold' : 'normal', 11); ink(INK);
      doc.text(value, xAmt, ry, { align: 'right' });
      ry += 8;
    }
    trow('Subtotal', formatINR(t.subtotal, true));
    if (t.inter) trow('IGST', formatINR(t.igst, true));
    else { trow('CGST', formatINR(t.cgst, true)); trow('SGST', formatINR(t.sgst, true)); }
    if (inv.roundOff && Math.abs(t.roundOff) >= 0.005) trow('Round Off', (t.roundOff >= 0 ? '+' : '') + formatINR(t.roundOff, true));
    rule(xLR - 24, ry - 4, xAmt, 0.4);
    ry += 1;
    trow('Total', formatINR(t.total, true), true);
    rule(xLR - 24, ry - 5, xAmt, 0.4);

    // ===== in words =====
    ry += 10;
    font('bold', 11); ink(INK);
    doc.text('IN WORDS :', ML, ry);
    var iwX = ML + doc.getTextWidth('IN WORDS :') + 3;
    font('normal', 11); ink(INK);
    doc.text(amountInWords(t.total), iwX, ry);

    // ===== payment + signatory =====
    var yPay = Math.max(ry + 18, 230);
    font('bold', 12); ink(INK);
    doc.text('PAYMENT TO :', ML, yPay);
    var py = yPay + 7;
    font('normal', 11); ink(INK);
    doc.text(s.bankAccName || s.sellerName || 'PV SOLUTIONS', ML, py); py += 6;
    var bank = [
      ['Account No.', s.bankAccNo || ''],
      ['Account Name', s.bankAccName || s.sellerName || ''],
      ['Branch', s.bankBranch || ''],
      ['IFSC CODE', s.bankIfsc || '']
    ];
    bank.forEach(function (r) {
      ink(INK); doc.text(r[0], ML, py);
      ink(SEP); doc.text(':', ML + 32, py);
      ink(INK); doc.text(String(r[1]), ML + 37, py);
      py += 6.2;
    });

    // signatory box
    var bx = 139, bw = MR - bx, by = yPay - 4, bh = 46;
    doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.5);
    doc.rect(bx, by, bw, bh);
    font('bold', 11); ink(INK);
    doc.text('For ' + (s.sellerName || 'PV SOLUTIONS'), bx + bw / 2, by + 9, { align: 'center' });
    doc.text('Authorised Signatory', bx + bw / 2, by + bh - 7, { align: 'center' });

    // ===== footer =====
    var fy = 281;
    rule(ML, fy - 5, MR, 0.3, SEP);
    font('bold', 8.5); ink(INK);
    doc.text('Location :', ML, fy);
    font('normal', 8.5); ink(MUTED);
    doc.text(String(s.location || 'Hyderabad'), ML + doc.getTextWidth('Location : ') + 1, fy);
    font('bold', 8.5); ink(INK);
    doc.text('Mail :', ML, fy + 5);
    font('normal', 8.5); ink(MUTED);
    doc.text(String(s.mail || ''), ML + doc.getTextWidth('Mail : ') + 1, fy + 5);
    font('bold', 8.5); ink(INK);
    if (s.phone) {
      var ph = 'PH.NO : ' + s.phone;
      doc.text('PH.NO :', MR - doc.getTextWidth(ph), fy);
      font('normal', 8.5); ink(MUTED);
      doc.text(' ' + s.phone, MR - doc.getTextWidth(' ' + s.phone), fy);
    }
    font('bold', 8.5); ink(INK);
    if (s.signatory) doc.text(String(s.signatory), MR, fy + 5, { align: 'right' });

    return doc;
  }

  function B(t) { return { t: t, b: true }; }
  function drawBlock(doc, lines, x, y, w) {
    lines.forEach(function (ln) {
      if (ln === '') { y += 3.2; return; }
      var isO = typeof ln === 'object';
      var txt = isO ? ln.t : ln;
      doc.setFont('helvetica', isO && ln.b ? 'bold' : 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(isO && ln.b ? INK[0] : MUTED[0], isO && ln.b ? INK[1] : MUTED[1], isO && ln.b ? INK[2] : MUTED[2]);
      var wr = doc.splitTextToSize(String(txt || ''), w);
      doc.text(wr, x, y);
      y += wr.length * 5.0;
    });
    return y;
  }
  function drawMark(doc, x, y, size) {
    doc.setFillColor(17, 17, 17);
    doc.rect(x, y, size, size, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size * 0.4);
    doc.text('PV', x + size / 2, y + size * 0.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size * 0.13);
    doc.text('SOLUTIONS', x + size / 2, y + size * 0.72, { align: 'center' });
  }

  return { buildInvoicePdf: buildInvoicePdf, computeTotals: computeTotals, formatINR: formatINR, amountInWords: amountInWords };
});
