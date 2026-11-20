/**
 * ============================================================================
 * HOSHIZAKI (THAILAND) LIMITED — SALES, MARKETING, JAPANESE CORP & SERVICE DOC TRACKER
 * Module Version: v1144-DEPT-BRANDED-FLEX-AND-DOC-TRACKING
 * Features:
 *   1) Department-Branded Flex Cards & Emails (clearly labels Department + Sender Name & Role):
 *      - Commercial Sales Division (Navy Blue)
 *      - Japanese Corporate Division (Deep Indigo & Gold)
 *      - Marketing & Product Division (Emerald Teal)
 *      - Service & Billing Division (Service Report / Quotation / Invoice / Receipt)
 *   2) 1-Tap Customer Document Acknowledgement (LINE Flex Postback + Email/SMS Web Confirmation):
 *      - "✅ ยืนยันได้รับเอกสารเรียบร้อยแล้ว" -> Logs `ACKNOWLEDGED` + alerts Dept & Sender
 *      - "❓ แจ้งไม่ได้รับไฟล์ / ขอส่งใหม่" -> Logs `MISSING_REPORTED` + urgent LINE alert
 *   3) Live Document Tracking Monitor (`📊 ติดตามสถานะการรับเอกสาร`) inside PWA
 *   4) Global Bridge `window.sendHoshizakiTrackedDocument(...)` for Service Report / Billing / Receipt
 * ============================================================================
 */
(function () {
  'use strict';

  const STORAGE_DRAFT_KEY = 'hzk_sales_qt_autosave_draft_v1144';
  const STORAGE_ARCHIVE_KEY = 'hzk_sales_qt_archive_list_v1144';

  const HZK_SALES_CRM_STATE = {
    version: 'v1144-DEPT-BRANDED-FLEX-AND-DOC-TRACKING',
    masterDb: null,
    items: []
  };

  async function loadSalesMasterDb() {
    if (HZK_SALES_CRM_STATE.masterDb) return HZK_SALES_CRM_STATE.masterDb;
    try {
      const res = await fetch('./sales_crm_master_db_y2026.json?v=' + Date.now());
      if (res.ok) {
        HZK_SALES_CRM_STATE.masterDb = await res.json();
        return HZK_SALES_CRM_STATE.masterDb;
      }
    } catch (e) {}
    HZK_SALES_CRM_STATE.masterDb = {
      companyHeader: {
        companyNameEn: 'HOSHIZAKI (THAILAND) LIMITED',
        companyNameTh: 'บริษัท โฮชิซากิ (ประเทศไทย) จำกัด',
        addressLine1: 'Building A, 1st floor, No. 10/11 Soi Vibhavadi Rangsit 64 (Mahanakorn),',
        addressLine2: 'Talat Bang Khen Subdistrict, Lak Si District, Bangkok 10210 Thailand',
        tel: '(+66)97-230-5941 / 02-005-9980-83',
        web: 'https://hoshizaki-sea.com'
      },
      activeStaff: [
        { code: 'FURUJO', name: 'Mr. Furujo', dept: 'Japanese Corporate', email: 'furujo@hoshizaki.co.th' },
        { code: 'NOPARIN_H', name: 'นพรินทร์ หอมหวล (Noparin Homhoul)', dept: 'Service & Billing', email: 'noparin@hoshizaki.co.th' },
        { code: 'KETSARAPORN', name: 'Ketsaraporn', dept: 'Sales', email: 'ketsaraporn@hoshizaki.co.th' },
        { code: 'KULATHIDA_C', name: 'Kulathida C.', dept: 'Sales', email: 'kulathida@hoshizaki.co.th' },
        { code: 'JANYALUCK_P', name: 'Janyaluck P.', dept: 'Sales', email: 'janyaluck@hoshizaki.co.th' },
        { code: 'MARKETING_TH', name: 'Marketing & Product Team', dept: 'Marketing', email: 'marketing@hoshizaki.co.th' }
      ],
      models: [],
      customers: [],
      hoshiGroup: [],
      termsAndConditions: []
    };
    return HZK_SALES_CRM_STATE.masterDb;
  }

  function getGasEndpointUrl() {
    return (
      localStorage.getItem('hzk_gas_webapp_url') ||
      localStorage.getItem('gasWebAppUrl') ||
      (window.HZK_CONFIG && window.HZK_CONFIG.gasUrl) ||
      ''
    );
  }

  function injectResponsiveStyles() {
    if (document.getElementById('hzkSalesCrmResponsiveCss')) return;
    const style = document.createElement('style');
    style.id = 'hzkSalesCrmResponsiveCss';
    style.textContent = `
      .hzk-sq-grid-top { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .hzk-sq-grid-cust { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .hzk-sq-grid-bottom { display: grid; grid-template-columns: 1fr 310px; gap: 16px; }
      .hzk-sq-action-bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 16px; }
      @media (max-width: 768px) {
        .hzk-sq-grid-top { grid-template-columns: 1fr 1fr; }
        .hzk-sq-grid-cust { grid-template-columns: 1fr; }
        .hzk-sq-grid-bottom { grid-template-columns: 1fr; }
        .hzk-sq-action-bar { justify-content: stretch; }
        .hzk-sq-action-bar button { flex: 1 1 46%; font-size: 12px !important; padding: 10px 8px !important; }
      }
      @media (max-width: 480px) {
        .hzk-sq-grid-top { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function dockSalesCrmMenuButton() {
    injectResponsiveStyles();
    if (document.getElementById('hzkSalesCrmDockedBtn')) return;

    const hostContainer =
      document.getElementById('topHeaderStatusPillsRow') ||
      document.getElementById('topHeaderRightPillsWrap') ||
      document.querySelector('header');

    const btn = document.createElement('button');
    btn.id = 'hzkSalesCrmDockedBtn';
    btn.type = 'button';
    btn.innerHTML = '💼 Sales &amp; JP Corp Quotation + Tracking';
    btn.onclick = openSalesCorporateQuotationModal;

    if (hostContainer) {
      btn.style.cssText =
        'background:linear-gradient(135deg,#002B49,#0369A1);color:#FFFFFF;border:1px solid #38BDF8;' +
        'border-radius:999px;padding:6px 14px;font-weight:700;font-size:12px;cursor:pointer;' +
        'box-shadow:0 2px 8px rgba(0,43,73,0.25);white-space:nowrap;margin:2px 4px;';
      hostContainer.appendChild(btn);
    } else {
      btn.style.cssText =
        'position:fixed;bottom:14px;right:14px;z-index:9990;background:#002B49;color:#FFFFFF;' +
        'border:1.5px solid #38BDF8;border-radius:999px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;';
      document.body.appendChild(btn);
    }
  }

  function getStaffDisplayInfo(db, code) {
    const found = (db.activeStaff || []).find(s => s.code === code);
    return found || { code: code || 'STAFF', name: code || 'เจ้าหน้าที่ HOSHIZAKI', dept: 'Sales', email: 'services@hoshizaki.co.th' };
  }

  function collectCurrentFormPayload(db) {
    const format = document.getElementById('hzkSqFormat').value;
    let subTotal = 0;
    let serviceSubTotal = 0;
    HZK_SALES_CRM_STATE.items.forEach(item => {
      const lineAmt = Math.max(0, (Number(item.unitPrice || 0) - Number(item.discount || 0)) * Number(item.qty || 1));
      subTotal += lineAmt;
      if (item.isService) serviceSubTotal += lineAmt;
    });
    const vatRate = format === 'EXPORT' ? 0 : 0.07;
    const vatAmount = subTotal * vatRate;
    const whtAmount = format === 'EXPORT' ? 0 : serviceSubTotal * 0.03;
    const grandTotal = subTotal + vatAmount - whtAmount;

    const spCode = document.getElementById('hzkSqSalesperson').value;
    const staffObj = getStaffDisplayInfo(db, spCode);

    return {
      docType: document.getElementById('hzkSqDocType').value,
      offerNo: document.getElementById('hzkSqOfferNo').value.trim(),
      rev: document.getElementById('hzkSqRev').value,
      date: document.getElementById('hzkSqDate').value,
      format: format,
      department: document.getElementById('hzkSqDept').value,
      salesperson: spCode,
      senderDisplayName: staffObj.name,
      senderEmail: staffObj.email || 'services@hoshizaki.co.th',
      customerName: document.getElementById('hzkSqCustomer').value.trim(),
      contactPerson: document.getElementById('hzkSqContact').value.trim(),
      address: document.getElementById('hzkSqAddress').value.trim(),
      phone: document.getElementById('hzkSqPhone').value.trim(),
      customerEmail: document.getElementById('hzkSqCustEmail').value.trim(),
      paymentTerms: document.getElementById('hzkSqPayment').value.trim(),
      remarks: document.getElementById('hzkSqRemarks').value,
      updateCustomerBinding: document.getElementById('hzkSqUpdateBinding').checked,
      items: HZK_SALES_CRM_STATE.items,
      subTotal: subTotal,
      vatAmount: vatAmount,
      whtAmount: whtAmount,
      grandTotal: grandTotal,
      updatedAt: new Date().toISOString()
    };
  }

  function autoSaveDraftToLocal(db) {
    try {
      const data = collectCurrentFormPayload(db);
      localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(data));
      const badge = document.getElementById('hzkSqAutoSaveBadge');
      if (badge) {
        const t = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        badge.textContent = '● Auto-Saved (' + t + ')';
      }
    } catch (e) {}
  }

  function saveToLocalArchiveList(qt) {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_ARCHIVE_KEY) || '[]');
      const key = (qt.offerNo || '') + '_' + (qt.rev || 'Rev.0');
      const idx = list.findIndex(x => ((x.offerNo || '') + '_' + (x.rev || 'Rev.0')) === key);
      if (idx >= 0) list[idx] = qt;
      else list.unshift(qt);
      localStorage.setItem(STORAGE_ARCHIVE_KEY, JSON.stringify(list.slice(0, 100)));
    } catch (e) {}
  }

  function buildA4QuotationHtmlDocument(db, qt, autoPrint) {
    const hdr = db.companyHeader;
    const fmt = String(qt.format || 'LOCAL').toUpperCase();
    const curr = fmt === 'EXPORT' ? 'USD' : 'THB';

    const rowsHtml = (qt.items || []).map((it, idx) => {
      const qty = Number(it.qty || 1);
      const up = Number(it.unitPrice || 0);
      const disc = Number(it.discount || 0);
      const amt = Math.max(0, (up - disc) * qty);
      return `
        <tr>
          <td style="border:1px solid #334155;padding:6px;text-align:center;">${idx + 1}</td>
          <td style="border:1px solid #334155;padding:6px;font-weight:700;">${it.model || '-'}</td>
          <td style="border:1px solid #334155;padding:6px;">${it.description || '-'}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:center;">${it.w || '-'}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:center;">${it.d || '-'}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:center;">${it.h || '-'}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:right;">${up.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:right;">${disc.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:center;">${qty}</td>
          <td style="border:1px solid #334155;padding:6px;text-align:right;font-weight:700;">${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="10" style="border:1px solid #334155;padding:14px;text-align:center;color:#64748B;">- ยังไม่มีรายการสินค้า -</td></tr>';

    const remarksHtml = String(qt.remarks || '').split(/\r?\n/).map(l => `<div>${l}</div>`).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${qt.docType || 'Quotation'} ${qt.offerNo || ''} (${qt.rev || 'Rev.0'}) — HOSHIZAKI</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #0F172A; margin: 0; background: #E2E8F0; }
    .toolbar { background: #002B49; color: #FFF; padding: 10px 18px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; }
    .sheet { background: #FFF; width: 210mm; min-height: 297mm; margin: 14px auto; padding: 14mm; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
    table { width: 100%; border-collapse: collapse; }
    th { background: #002B49; color: #FFF; border: 1px solid #002B49; padding: 6px; font-size: 10px; }
    @media print {
      body { background: #FFF; }
      .toolbar { display: none !important; }
      .sheet { margin: 0; box-shadow: none; width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><b>👁️ A4 PREVIEW [${qt.department || 'Sales'}]:</b> ${qt.offerNo || ''} (${qt.rev || 'Rev.0'}) — ${qt.customerName || 'ลูกค้า'}</div>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:7px 14px;font-weight:700;cursor:pointer;">🖨️ พิมพ์ / บันทึกเป็น PDF (A4)</button>
      <button onclick="window.close()" style="background:#EF4444;color:#FFF;border:none;border-radius:6px;padding:7px 12px;font-weight:700;cursor:pointer;">✕ ปิดหน้าต่าง</button>
    </div>
  </div>
  <div class="sheet">
    <div style="border-bottom:2px solid #002B49;padding-bottom:10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:16px;font-weight:800;color:#002B49;">${hdr.companyNameEn}</div>
        <div style="font-size:12px;font-weight:700;">${hdr.companyNameTh}</div>
        <div>${hdr.addressLine1}</div>
        <div>${hdr.addressLine2}</div>
        <div>Tel: ${hdr.tel} | Web: ${hdr.web}</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#334155;">
        <div>Department: <b>${qt.department || 'Sales'}</b></div>
        <div>Issued By: <b>${qt.senderDisplayName || qt.salesperson || '-'}</b></div>
        <div>Currency: <b>${fmt} (${curr})</b></div>
      </div>
    </div>

    <div style="text-align:center;font-size:18px;font-weight:800;color:#002B49;letter-spacing:1px;margin:8px 0 12px;">${String(qt.docType || 'QUOTATION').toUpperCase()}</div>

    <table style="margin-bottom:12px;font-size:11px;">
      <tr>
        <td style="width:16%;font-weight:700;padding:3px 0;">Customer Name :</td>
        <td style="width:44%;padding:3px 0;">${qt.customerName || '-'}</td>
        <td style="width:18%;font-weight:700;padding:3px 0;">วันที่ / Date :</td>
        <td style="width:22%;padding:3px 0;">${qt.date || '-'}</td>
      </tr>
      <tr>
        <td style="font-weight:700;padding:3px 0;">Contact Person :</td>
        <td style="padding:3px 0;">${qt.contactPerson || '-'}</td>
        <td style="font-weight:700;padding:3px 0;">Document No. :</td>
        <td style="padding:3px 0;"><b>${qt.offerNo || '-'} (${qt.rev || 'Rev.0'})</b></td>
      </tr>
      <tr>
        <td style="font-weight:700;padding:3px 0;">Address :</td>
        <td style="padding:3px 0;">${qt.address || '-'}</td>
        <td style="font-weight:700;padding:3px 0;">Offered By :</td>
        <td style="padding:3px 0;">${qt.senderDisplayName || qt.salesperson || '-'}</td>
      </tr>
      <tr>
        <td style="font-weight:700;padding:3px 0;">Tel No. :</td>
        <td style="padding:3px 0;">${qt.phone || '-'}</td>
        <td style="font-weight:700;padding:3px 0;">Term of Payment :</td>
        <td style="padding:3px 0;">${qt.paymentTerms || '30DAYS'}</td>
      </tr>
    </table>

    <table>
      <thead>
        <tr>
          <th rowspan="2">NO.</th>
          <th rowspan="2">MODEL</th>
          <th rowspan="2">DESCRIPTION</th>
          <th colspan="3">Dimension (mm.)</th>
          <th rowspan="2">UNIT PRICE<br>(${curr})</th>
          <th rowspan="2">Discount</th>
          <th rowspan="2">Qty</th>
          <th rowspan="2">AMOUNT<br>(${curr})</th>
        </tr>
        <tr>
          <th>W</th>
          <th>D</th>
          <th>H</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <table style="margin-top:10px;">
      <tr>
        <td style="width:60%;vertical-align:top;padding-right:12px;">
          <div style="font-weight:700;margin-bottom:4px;">Remark / Terms &amp; Conditions:</div>
          <div style="font-size:10px;line-height:1.45;">${remarksHtml}</div>
        </td>
        <td style="width:40%;vertical-align:top;">
          <table>
            <tr><td style="border:1px solid #334155;padding:5px;font-weight:700;">SUB TOTAL</td><td style="border:1px solid #334155;padding:5px;text-align:right;font-weight:700;">${Number(qt.subTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style="border:1px solid #334155;padding:5px;">${fmt === 'EXPORT' ? 'VAT 0% (Export)' : 'VAT 7%'}</td><td style="border:1px solid #334155;padding:5px;text-align:right;">${Number(qt.vatAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style="border:1px solid #334155;padding:5px;">Withholding Tax 3%</td><td style="border:1px solid #334155;padding:5px;text-align:right;">${Number(qt.whtAmount || 0) > 0 ? '-' : ''}${Number(qt.whtAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
            <tr style="background:#F1F5F9;"><td style="border:1px solid #334155;padding:6px;font-weight:800;">GRAND TOTAL (${curr})</td><td style="border:1px solid #334155;padding:6px;text-align:right;font-weight:800;">${Number(qt.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <table style="margin-top:34px;text-align:center;font-size:10px;">
      <tr>
        <td style="width:25%;">Issued By (${qt.department || 'Sales'})<br><br><br>_______________________<br>${qt.senderDisplayName || 'Sales Executive'}</td>
        <td style="width:25%;">Checked By<br><br><br>_______________________<br>Authorized Signature</td>
        <td style="width:25%;">Approved By<br><br><br>_______________________<br>Authorized Signature</td>
        <td style="width:25%;">Purchased By<br><br><br>_______________________<br>ผู้ซื้อ / Purchased Signature</td>
      </tr>
    </table>
  </div>
  ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>' : ''}
</body>
</html>`;
  }

  function openIsolatedA4PreviewWindow(db, autoPrint) {
    const qt = collectCurrentFormPayload(db);
    autoSaveDraftToLocal(db);
    saveToLocalArchiveList(qt);
    const html = buildA4QuotationHtmlDocument(db, qt, autoPrint);
    const win = window.open('', '_blank', 'width=960,height=920');
    if (!win) {
      alert('⚠️ เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป กรุณากดอนุญาต Pop-up เพื่อเปิดหน้า A4 Preview ครับ');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function downloadExcelFileDirect(db) {
    const qt = collectCurrentFormPayload(db);
    autoSaveDraftToLocal(db);
    saveToLocalArchiveList(qt);
    const html = buildA4QuotationHtmlDocument(db, qt, false);
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (qt.offerNo || 'HTH-26') + '_' + (qt.rev || 'Rev0') + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function openMultiChannelShareHubModal(db, overrideDoc) {
    const qt = overrideDoc || collectCurrentFormPayload(db);
    if (!overrideDoc) {
      autoSaveDraftToLocal(db);
      saveToLocalArchiveList(qt);
    }

    const staffEmailOptions = (db.activeStaff || [])
      .map(s => `<option value="${s.email || 'services@hoshizaki.co.th'}" data-name="${s.name}" data-dept="${s.dept}" ${s.code === qt.salesperson ? 'selected' : ''}>${s.name} [${s.dept}] — ${s.email || 'services@hoshizaki.co.th'}</option>`)
      .join('');

    let shareModal = document.getElementById('hzkSqShareHubModal');
    if (!shareModal) {
      shareModal = document.createElement('div');
      shareModal.id = 'hzkSqShareHubModal';
      shareModal.style.cssText =
        'position:fixed;inset:0;z-index:10080;background:rgba(15,23,42,0.78);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(shareModal);
    }

    const curr = qt.format === 'EXPORT' ? 'USD' : 'THB';
    const totalTxt = Number(qt.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + curr;

    shareModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:650px;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">MULTI-CHANNEL SHARE + 1-TAP DOCUMENT TRACKING</div>
            <div style="font-size:15px;font-weight:700;">[${qt.department || 'Sales'}] ${qt.docType || 'ใบเสนอราคา'} ${qt.offerNo} (${qt.rev}) — ${totalTxt}</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkSqShareHubModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:18px 20px;font-size:13px;color:#0F172A;display:flex;flex-direction:column;gap:14px;">
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px 12px;font-size:12px;color:#1E3A8A;">
            <b>🏷️ ข้อมูลกำกับผู้ส่งบน Flex Card &amp; Email:</b> แผนก <b>${qt.department || 'Sales'}</b> | ผู้ส่ง: <b>${qt.senderDisplayName || qt.salesperson || 'เจ้าหน้าที่ HOSHIZAKI'}</b> (มาพร้อมปุ่ม <i>"✅ ยืนยันได้รับเอกสารเรียบร้อยแล้ว"</i> และ <i>"❓ แจ้งไม่ได้รับไฟล์"</i> อัตโนมัติ)
          </div>

          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:12px;">
            <div style="font-weight:700;color:#002B49;margin-bottom:8px;">1️⃣ ส่งทางอีเมลพร้อมแนบไฟล์จริง + ปุ่มยืนยันรับเอกสาร</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
              <div>
                <label style="font-size:12px;font-weight:700;">ผู้ส่ง / อีเมลตอบกลับ (From / Reply-To)</label>
                <select id="hzkShareSenderSelect" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;">
                  ${staffEmailOptions}
                </select>
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;">ประเภทไฟล์แนบ (Attachment)</label>
                <select id="hzkShareAttachType" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;">
                  <option value="PDF">📕 แนบไฟล์ PDF เท่านั้น</option>
                  <option value="EXCEL">📗 แนบไฟล์ Excel (.xls) เท่านั้น</option>
                  <option value="BOTH">📦 แนบทั้งไฟล์ PDF + Excel</option>
                </select>
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;">อีเมลลูกค้า (To Email)</label>
                <input id="hzkShareToEmail" type="email" value="${qt.customerEmail || ''}" placeholder="customer@company.co.th" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;">สำเนาถึง (CC Email - ถ้ามี)</label>
                <input id="hzkShareCcEmail" type="email" placeholder="sales@hoshizaki.co.th" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;" />
              </div>
            </div>
            <button type="button" id="hzkShareSendEmailBtn" style="width:100%;background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">📧 ส่งอีเมลแนบไฟล์ + ปุ่ม Track การรับเอกสาร</button>
          </div>

          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px;">
            <div style="font-weight:700;color:#166534;margin-bottom:8px;">2️⃣ แชร์เข้า LINE (การ์ดแยกสีตามแผนก + ระบุชื่อผู้ส่ง + ปุ่มกดยืนยันรับเอกสาร)</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="hzkShareLinePushBtn" style="flex:1;background:#059669;color:#FFF;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">💬 ส่ง Flex Card แยกแผนกเข้า LINE OA</button>
              <button type="button" id="hzkShareLinePickerBtn" style="flex:1;background:#15803D;color:#FFF;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">📲 เปิดหน้าเลือกเพื่อน/กลุ่มใน LINE</button>
            </div>
          </div>

          <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;">
            <div style="font-weight:700;color:#92400E;margin-bottom:8px;">3️⃣ ส่ง SMS พร้อมลิงก์ PDF และปุ่มยืนยันรับเอกสาร</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <input id="hzkShareSmsPhone" type="tel" value="${qt.phone || ''}" placeholder="เบอร์มือถือลูกค้า เช่น 0819793085" style="flex:1;min-width:180px;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
              <button type="button" id="hzkShareSmsBtn" style="background:#D97706;color:#FFF;border:none;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer;">📱 สร้างลิงก์ PDF &amp; ส่ง SMS</button>
            </div>
          </div>

          <div id="hzkShareStatusBox" style="font-size:12px;color:#0F172A;background:#F1F5F9;padding:10px 12px;border-radius:8px;display:none;line-height:1.5;"></div>
        </div>
      </div>
    `;

    shareModal.style.display = 'flex';
    const statusBox = document.getElementById('hzkShareStatusBox');
    const setStatus = (msg) => {
      statusBox.style.display = 'block';
      statusBox.innerHTML = msg;
    };

    async function callShareGas(channel, extra) {
      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        alert('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนใช้งานครับ');
        return null;
      }
      setStatus('⏳ กำลังสร้างไฟล์ PDF &amp; Excel บน Google Drive และสร้างรหัสติดตาม (Track ID)...');
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'shareSalesQuotation', channel: channel, quotation: qt }, extra || {}))
      });
      return await res.json();
    }

    document.getElementById('hzkShareSendEmailBtn').onclick = async function () {
      const sel = document.getElementById('hzkShareSenderSelect');
      const opt = sel.options[sel.selectedIndex];
      const data = await callShareGas('EMAIL', {
        toEmail: document.getElementById('hzkShareToEmail').value,
        ccEmail: document.getElementById('hzkShareCcEmail').value,
        attachType: document.getElementById('hzkShareAttachType').value,
        replyToEmail: sel.value,
        senderName: opt ? opt.getAttribute('data-name') : qt.senderDisplayName
      });
      if (data && data.status === 'OK') {
        setStatus('✅ ' + data.message + '<br>📌 <b>Track ID:</b> ' + data.trackId + ' | <a href="' + data.pdfUrl + '" target="_blank">เปิดดู PDF</a>');
      } else if (data) {
        setStatus('❌ ' + (data.message || 'ส่งอีเมลไม่สำเร็จ'));
      }
    };

    document.getElementById('hzkShareLinePushBtn').onclick = async function () {
      const data = await callShareGas('LINE');
      if (data && data.status === 'OK') {
        setStatus('✅ ส่ง Flex Card แผนก <b>' + qt.department + '</b> (ผู้ส่ง: ' + qt.senderDisplayName + ') พร้อมปุ่มยืนยันรับเอกสารเข้า LINE เรียบร้อยแล้ว!<br>📌 <b>Track ID:</b> ' + data.trackId + ' | <a href="' + data.pdfUrl + '" target="_blank">เปิดดู PDF</a>');
      }
    };

    document.getElementById('hzkShareLinePickerBtn').onclick = async function () {
      const data = await callShareGas('LINE_PICKER');
      if (data && data.pdfUrl) {
        const msg =
          '[' + (qt.department || 'Sales') + ' — HOSHIZAKI]\n' +
          (qt.docType || 'ใบเสนอราคา') + ' เลขที่: ' + qt.offerNo + ' (' + qt.rev + ')\n' +
          'ผู้ส่ง: ' + (qt.senderDisplayName || '-') + '\n' +
          'ยอดสุทธิ: ' + totalTxt + '\n' +
          'เปิดดู PDF: ' + data.pdfUrl + '\n' +
          'กดยืนยันรับเอกสาร: ' + data.ackUrl;
        window.open('https://line.me/R/share?text=' + encodeURIComponent(msg), '_blank');
        setStatus('✅ เปิดหน้าเลือกเพื่อน/กลุ่ม LINE แล้ว (Track ID: ' + data.trackId + ')');
      }
    };

    document.getElementById('hzkShareSmsBtn').onclick = async function () {
      const phone = document.getElementById('hzkShareSmsPhone').value.replace(/[^0-9+]/g, '');
      const data = await callShareGas('SMS', { smsPhone: phone });
      if (data && data.pdfUrl) {
        const smsText =
          'HOSHIZAKI [' + (qt.department || 'Sales') + '] ' + (qt.docType || 'Doc') + ' ' + qt.offerNo +
          ' (' + totalTxt + ') PDF: ' + data.pdfUrl + ' ยืนยันรับเอกสาร: ' + data.ackUrl;
        setStatus('✅ สร้างลิงก์ PDF + ปุ่มยืนยันสำเร็จ (Track ID: ' + data.trackId + ')');
        window.location.href = 'sms:' + phone + '?body=' + encodeURIComponent(smsText);
      }
    };
  }

  async function openDocumentTrackingDashboardModal(db) {
    let trkModal = document.getElementById('hzkDocTrackingDashboardModal');
    if (!trkModal) {
      trkModal = document.createElement('div');
      trkModal.id = 'hzkDocTrackingDashboardModal';
      trkModal.style.cssText =
        'position:fixed;inset:0;z-index:10090;background:rgba(15,23,42,0.78);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(trkModal);
    }

    trkModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1040px;max-height:90vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">REAL-TIME DOCUMENT ACKNOWLEDGEMENT &amp; TRACKING</div>
            <div style="font-size:16px;font-weight:700;">📊 ติดตามสถานะการรับเอกสาร (ใบเสนอราคา / ใบแจ้งบริการ / ใบวางบิล / ใบเสร็จรับเงิน)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDocTrackingDashboardModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:16px 20px;font-size:13px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
            <label style="font-weight:700;">กรองตามแผนก:</label>
            <select id="hzkTrkDeptFilter" style="padding:7px 12px;border:1px solid #CBD5E1;border-radius:8px;">
              <option value="ALL">ทุกแผนก (All Departments)</option>
              <option value="Sales">Sales Department</option>
              <option value="Japanese Corporate">Japanese Corporate</option>
              <option value="Marketing">Marketing Department</option>
              <option value="Service">Service &amp; Billing (ใบแจ้งบริการ/ใบวางบิล/ใบเสร็จ)</option>
            </select>
            <button type="button" id="hzkTrkRefreshBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">🔄 รีเฟรชสถานะล่าสุด</button>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;min-width:820px;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#0F172A;color:#FFF;">
                  <th style="padding:8px;border:1px solid #CBD5E1;">Track ID</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">แผนก (Dept)</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">ผู้ส่ง (Sender)</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">ประเภท / เลขที่เอกสาร</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">ลูกค้า</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">ช่องทาง</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">สถานะการตอบรับ</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">เวลาที่ยืนยัน</th>
                </tr>
              </thead>
              <tbody id="hzkTrkTableBody">
                <tr><td colspan="8" style="padding:16px;text-align:center;color:#64748B;">กำลังโหลดข้อมูลจาก Google Sheets...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    trkModal.style.display = 'flex';

    async function loadTrackingRows() {
      const tbody = document.getElementById('hzkTrkTableBody');
      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#B91C1C;">กรุณาตั้งค่า Google Apps Script URL เพื่อดูสถานะแบบเรียลไทม์</td></tr>';
        return;
      }
      const dept = document.getElementById('hzkTrkDeptFilter').value;
      tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#64748B;">⏳ กำลังดึงข้อมูล...</td></tr>';
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getDocumentTrackingList', department: dept })
        });
        const data = await res.json();
        const rows = (data && data.records) || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#64748B;">ยังไม่มีประวัติการส่งเอกสารในหมวดนี้</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(r => {
          const st = String(r.status || 'SENT').toUpperCase();
          let badge = '<span style="background:#FEF3C7;color:#92400E;padding:3px 8px;border-radius:999px;font-weight:700;">⏳ รอการยืนยัน (SENT)</span>';
          if (st === 'ACKNOWLEDGED') {
            badge = '<span style="background:#DCFCE7;color:#166534;padding:3px 8px;border-radius:999px;font-weight:700;">✅ ได้รับเอกสารแล้ว</span>';
          } else if (st === 'MISSING_REPORTED') {
            badge = '<span style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:999px;font-weight:700;">🚨 แจ้งไม่ได้รับเอกสาร</span>';
          }
          return `
            <tr>
              <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${r.trackId}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;"><b>${r.department}</b></td>
              <td style="padding:7px;border:1px solid #CBD5E1;">${r.senderName}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;">${r.docType} <b>[${r.docNo}]</b></td>
              <td style="padding:7px;border:1px solid #CBD5E1;">${r.customerName}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${r.channel}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${badge}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;font-size:11px;">${r.confirmedAt || r.sentAt || '-'}</td>
            </tr>`;
        }).join('');
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;text-align:center;color:#B91C1C;">เกิดข้อผิดพลาด: ' + err.message + '</td></tr>';
      }
    }

    document.getElementById('hzkTrkRefreshBtn').onclick = loadTrackingRows;
    document.getElementById('hzkTrkDeptFilter').onchange = loadTrackingRows;
    loadTrackingRows();
  }

  async function openSalesCorporateQuotationModal() {
    const db = await loadSalesMasterDb();
    let modal = document.getElementById('hzkSalesCorporateQtModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkSalesCorporateQtModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.75);display:flex;' +
        'align-items:center;justify-content:center;padding:8px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    const staffOptions = (db.activeStaff || [])
      .map(s => `<option value="${s.code}">${s.code} — ${s.name} (${s.dept})</option>`)
      .join('');

    const modelOptions = (db.models || [])
      .map(m => `<option value="${m.model}">${m.model} (${m.w || '-'}x${m.d || '-'}x${m.h || '-'} mm) - ${m.description}</option>`)
      .join('');

    const customerOptions = (db.customers || [])
      .map(c => `<option value="${c.name.replace(/"/g, '&quot;')}">`)
      .join('');

    const termsOptions = (db.termsAndConditions || [])
      .map(t => `<option value="${t.replace(/"/g, '&quot;')}">${t}</option>`)
      .join('');

    const savedDraft = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_DRAFT_KEY) || 'null'); } catch (e) { return null; }
    })();

    const todayStr = (savedDraft && savedDraft.date) || new Date().toISOString().slice(0, 10);
    const defaultOfferNo = (savedDraft && savedDraft.offerNo) || ('HTH-26' + String(Math.floor(100 + Math.random() * 899)));
    if (savedDraft && Array.isArray(savedDraft.items)) {
      HZK_SALES_CRM_STATE.items = savedDraft.items;
    }

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1100px;max-height:95vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 45px rgba(0,0,0,0.35);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFFFFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;letter-spacing:0.05em;">HOSHIZAKI (THAILAND) LIMITED — SALES, MARKETING, JP CORP &amp; SERVICE</div>
            <div style="font-size:16px;font-weight:700;">ระบบออกเอกสาร &amp; ติดตามสถานะการส่ง (Y2026) <span id="hzkSqAutoSaveBadge" style="font-size:11px;background:#065F46;color:#A7F3D0;padding:2px 8px;border-radius:999px;margin-left:6px;">● Auto-Save Ready</span></div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button type="button" id="hzkSqOpenTrackDashBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">📊 ติดตามสถานะการรับเอกสาร</button>
            <button type="button" onclick="document.getElementById('hzkSalesCorporateQtModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
          </div>
        </div>

        <div style="padding:16px 20px;font-size:13px;color:#0F172A;">
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:#0369A1;">
            <b>ที่อยู่หัวเอกสารปัจจุบัน:</b> ${db.companyHeader.companyNameEn} | ${db.companyHeader.addressLine1} ${db.companyHeader.addressLine2} | Tel: ${db.companyHeader.tel}
          </div>

          <div class="hzk-sq-grid-top" style="margin-bottom:12px;">
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ประเภทเอกสาร (Document Type)</label>
              <select id="hzkSqDocType" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
                <option value="ใบเสนอราคา (Quotation)">📄 ใบเสนอราคา (Quotation)</option>
                <option value="ใบแจ้งบริการ (Service Report)">🛠️ ใบแจ้งบริการ (Service Report)</option>
                <option value="ใบวางบิล (Billing Note)">🧾 ใบวางบิล (Billing Note)</option>
                <option value="ใบเสร็จรับเงิน (Receipt)">💰 ใบเสร็จรับเงิน (Receipt)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">แผนกเจ้าของเรื่อง (Department)</label>
              <select id="hzkSqDept" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
                <option value="Sales">Sales Department</option>
                <option value="Japanese Corporate">Japanese Corporate</option>
                <option value="Marketing">Marketing Department</option>
                <option value="Service & Billing">Service &amp; Billing Department</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">รูปแบบสกุลเงิน (Currency Format)</label>
              <select id="hzkSqFormat" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;">
                <option value="LOCAL">Local Format (THB + VAT 7% + WHT 3%)</option>
                <option value="EXPORT">Export / Hoshi Group Format (USD + VAT 0%)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เลขที่เอกสาร (Document / Offer No.)</label>
              <input id="hzkSqOfferNo" type="text" value="${defaultOfferNo}" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เวอร์ชัน (Revision)</label>
              <select id="hzkSqRev" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;">
                <option value="Rev.0">Rev.0 (ออกครั้งแรก)</option>
                <option value="Rev.1">Rev.1 (แก้ไขครั้งที่ 1)</option>
                <option value="Rev.2">Rev.2 (แก้ไขครั้งที่ 2)</option>
                <option value="Rev.3">Rev.3 (แก้ไขครั้งที่ 3)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ผู้ส่งเอกสาร / ผู้รับผิดชอบ (ระบุชื่อบน Flex Card)</label>
              <select id="hzkSqSalesperson" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;">
                <option value="">-- เลือกผู้รับผิดชอบปัจจุบัน --</option>
                ${staffOptions}
              </select>
            </div>
          </div>

          <div class="hzk-sq-grid-cust" style="margin-bottom:12px;background:#F8FAFC;padding:12px;border-radius:10px;border:1px solid #E2E8F0;">
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ชื่อบริษัทลูกค้า (700 รายชื่อ หรือพิมพ์ใหม่)</label>
              <input id="hzkSqCustomer" list="hzkSqCustomerList" value="${(savedDraft && savedDraft.customerName) || ''}" placeholder="พิมพ์ค้นหาชื่อบริษัทลูกค้า..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
              <datalist id="hzkSqCustomerList">${customerOptions}</datalist>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ผู้ติดต่อ (Contact Person)</label>
              <input id="hzkSqContact" type="text" value="${(savedDraft && savedDraft.contactPerson) || ''}" placeholder="ระบุชื่อผู้ติดต่อ..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เบอร์โทรศัพท์ (Tel No.)</label>
              <input id="hzkSqPhone" type="text" value="${(savedDraft && savedDraft.phone) || ''}" placeholder="02-xxx-xxxx / 08x-xxx-xxxx" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">อีเมลลูกค้า (Customer Email สำหรับส่งไฟล์แนบ)</label>
              <input id="hzkSqCustEmail" type="email" value="${(savedDraft && savedDraft.customerEmail) || ''}" placeholder="customer@company.co.th" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เงื่อนไขการชำระเงิน (Term of Payment)</label>
              <input id="hzkSqPayment" type="text" value="${(savedDraft && savedDraft.paymentTerms) || '30DAYS'}" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">วันที่เอกสาร (Date)</label>
              <input id="hzkSqDate" type="date" value="${todayStr}" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div style="grid-column:1/-1;">
              <label style="font-weight:700;display:block;margin-bottom:4px;">ที่อยู่ลูกค้า (Address)</label>
              <input id="hzkSqAddress" type="text" value="${(savedDraft && savedDraft.address) || ''}" placeholder="ที่อยู่สำหรับออกเอกสาร..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;">
              <input id="hzkSqUpdateBinding" type="checkbox" checked />
              <label for="hzkSqUpdateBinding" style="font-size:12px;color:#334155;">อัปเดตการผูกชื่อเซลล์ผู้ดูแลกับลูกค้ารายนี้ในฐานข้อมูลกลาง (ยืดหยุ่นปรับเปลี่ยนได้)</label>
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
              <div style="font-weight:700;color:#002B49;">รายการสินค้า / บริการ และขนาดเครื่อง (Dimension W × D × H mm.)</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;width:100%;max-width:620px;">
                <select id="hzkSqModelPicker" style="flex:1;min-width:200px;padding:7px;border:1px solid #CBD5E1;border-radius:8px;">
                  <option value="">-- เลือกรุ่นเครื่อง (331 รุ่น) เพื่อเติมขนาดอัตโนมัติ --</option>
                  ${modelOptions}
                </select>
                <button type="button" id="hzkSqAddModelBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">+ เพิ่มรุ่นเครื่อง</button>
                <button type="button" id="hzkSqAddInstallBtn" style="background:#475569;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">+ ค่าบริการ/ติดตั้ง (WHT 3%)</button>
              </div>
            </div>

            <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
              <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#002B49;color:#FFFFFF;">
                    <th style="padding:7px;border:1px solid #CBD5E1;">NO.</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">MODEL</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">DESCRIPTION</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">W (mm)</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">D (mm)</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">H (mm)</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">UNIT PRICE</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">DISCOUNT</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">QTY</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">AMOUNT</th>
                    <th style="padding:7px;border:1px solid #CBD5E1;">ลบ</th>
                  </tr>
                </thead>
                <tbody id="hzkSqItemsBody"></tbody>
              </table>
            </div>
          </div>

          <div class="hzk-sq-grid-bottom">
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เงื่อนไขเพิ่มเติม (เลือกแทรกจาก 28 เงื่อนไขมาตรฐาน)</label>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <select id="hzkSqTermPicker" style="flex:1;padding:7px;border:1px solid #CBD5E1;border-radius:8px;">
                  <option value="">-- เลือกเงื่อนไข Lead Time / Payment / Warranty --</option>
                  ${termsOptions}
                </select>
                <button type="button" id="hzkSqAddTermBtn" style="background:#0F172A;color:#FFF;border:none;border-radius:8px;padding:7px 12px;cursor:pointer;">แทรก</button>
              </div>
              <textarea id="hzkSqRemarks" rows="4" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;font-size:12px;">${(savedDraft && savedDraft.remarks) || '- Please transfer to Bank of Ayudhya Public Company Limited Future Park Rangsit Branch Current Account No. 062-0-04476-2 Branch No. 0062.\n- The site must be prepared and ready for installation on delivery day.'}</textarea>
            </div>

            <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:12px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>SUB TOTAL:</span><b id="hzkSqSubTotal">0.00</b></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span id="hzkSqVatLabel">VAT 7%:</span><b id="hzkSqVatAmt">0.00</b></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Withholding Tax 3%:</span><b id="hzkSqWhtAmt">0.00</b></div>
              <hr style="border:none;border-top:1px solid #CBD5E1;margin:8px 0;" />
              <div style="display:flex;justify-content:space-between;font-size:15px;color:#002B49;"><span>GRAND TOTAL:</span><b id="hzkSqGrandTotal">0.00</b></div>
            </div>
          </div>

          <div class="hzk-sq-action-bar">
            <button type="button" id="hzkSqNewDraftBtn" style="background:#E2E8F0;color:#0F172A;border:none;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;">🆕 ล้างฟอร์มใหม่</button>
            <button type="button" id="hzkSqPreviewBtn" style="background:#002B49;color:#FFF;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">👁️ Preview เอกสาร A4</button>
            <button type="button" id="hzkSqPrintPdfBtn" style="background:#DC2626;color:#FFF;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">📕 พิมพ์ / บันทึก PDF (A4)</button>
            <button type="button" id="hzkSqExportExcelBtn" style="background:#15803D;color:#FFF;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">📗 Export Excel (.xls)</button>
            <button type="button" id="hzkSqShareHubBtn" style="background:#7C3AED;color:#FFF;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">📤 แชร์ + ปุ่มยืนยันรับเอกสาร</button>
            <button type="button" id="hzkSqSaveSyncBtn" style="background:#059669;color:#FFF;border:none;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer;">☁️ บันทึกลงฐานข้อมูล</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    bindSalesQuotationEvents(db);
  }

  function bindSalesQuotationEvents(db) {
    const modal = document.getElementById('hzkSalesCorporateQtModal');
    modal.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', () => autoSaveDraftToLocal(db));
      el.addEventListener('change', () => autoSaveDraftToLocal(db));
    });

    document.getElementById('hzkSqOpenTrackDashBtn').onclick = function () {
      openDocumentTrackingDashboardModal(db);
    };

    const custInput = document.getElementById('hzkSqCustomer');
    custInput.onchange = function () {
      const val = custInput.value.trim().toUpperCase();
      const found = (db.customers || []).find(c => c.name.toUpperCase() === val);
      if (found) {
        document.getElementById('hzkSqAddress').value = found.address || '';
        document.getElementById('hzkSqPhone').value = found.phone || '';
        document.getElementById('hzkSqPayment').value = found.paymentTerms || '30DAYS';
        if (found.assignedSales) {
          document.getElementById('hzkSqSalesperson').value = found.assignedSales;
          if (found.assignedSales === 'FURUJO') {
            document.getElementById('hzkSqDept').value = 'Japanese Corporate';
          }
        }
      }
      autoSaveDraftToLocal(db);
    };

    document.getElementById('hzkSqAddModelBtn').onclick = function () {
      const mCode = document.getElementById('hzkSqModelPicker').value;
      const mObj = (db.models || []).find(m => m.model === mCode) || {
        model: mCode || 'CUSTOM-MODEL',
        description: 'Hoshizaki Equipment',
        w: '',
        d: '',
        h: ''
      };
      HZK_SALES_CRM_STATE.items.push({
        model: mObj.model,
        description: mObj.description,
        w: mObj.w,
        d: mObj.d,
        h: mObj.h,
        unitPrice: 0,
        discount: 0,
        qty: 1,
        isService: false
      });
      renderSalesQuotationRows(db);
      autoSaveDraftToLocal(db);
    };

    document.getElementById('hzkSqAddInstallBtn').onclick = function () {
      HZK_SALES_CRM_STATE.items.push({
        model: 'SERVICE',
        description: 'Installation / Service Fee',
        w: '',
        d: '',
        h: '',
        unitPrice: 1500,
        discount: 0,
        qty: 1,
        isService: true
      });
      renderSalesQuotationRows(db);
      autoSaveDraftToLocal(db);
    };

    document.getElementById('hzkSqAddTermBtn').onclick = function () {
      const tVal = document.getElementById('hzkSqTermPicker').value;
      if (!tVal) return;
      const ta = document.getElementById('hzkSqRemarks');
      ta.value = (ta.value ? ta.value + '\n' : '') + tVal;
      autoSaveDraftToLocal(db);
    };

    document.getElementById('hzkSqFormat').onchange = function () {
      renderSalesQuotationRows(db);
      autoSaveDraftToLocal(db);
    };

    document.getElementById('hzkSqNewDraftBtn').onclick = function () {
      localStorage.removeItem(STORAGE_DRAFT_KEY);
      HZK_SALES_CRM_STATE.items = [];
      openSalesCorporateQuotationModal();
    };

    document.getElementById('hzkSqPreviewBtn').onclick = function () {
      openIsolatedA4PreviewWindow(db, false);
    };

    document.getElementById('hzkSqPrintPdfBtn').onclick = function () {
      openIsolatedA4PreviewWindow(db, true);
    };

    document.getElementById('hzkSqExportExcelBtn').onclick = function () {
      downloadExcelFileDirect(db);
    };

    document.getElementById('hzkSqShareHubBtn').onclick = function () {
      openMultiChannelShareHubModal(db, null);
    };

    document.getElementById('hzkSqSaveSyncBtn').onclick = async function () {
      const qt = collectCurrentFormPayload(db);
      autoSaveDraftToLocal(db);
      saveToLocalArchiveList(qt);

      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        alert('✅ บันทึกเอกสารลงฐานข้อมูลในเครื่องเรียบร้อยแล้ว');
        return;
      }
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'saveSalesQuotation', quotation: qt })
        });
        const data = await res.json();
        alert('✅ บันทึกเอกสารเลขที่ ' + (data.offerNo || qt.offerNo) + ' (' + qt.rev + ') ลงฐานข้อมูล Google Sheets เรียบร้อยแล้ว!');
      } catch (err) {
        alert('⚠️ บันทึกลงเครื่องแล้ว แต่ซิงก์คลาวด์ไม่สำเร็จ: ' + err.message);
      }
    };

    renderSalesQuotationRows(db);
  }

  function renderSalesQuotationRows(db) {
    const tbody = document.getElementById('hzkSqItemsBody');
    const format = document.getElementById('hzkSqFormat').value;
    let subTotal = 0;
    let serviceSubTotal = 0;

    tbody.innerHTML = HZK_SALES_CRM_STATE.items
      .map((item, idx) => {
        const lineAmt = Math.max(0, (Number(item.unitPrice || 0) - Number(item.discount || 0)) * Number(item.qty || 1));
        subTotal += lineAmt;
        if (item.isService) serviceSubTotal += lineAmt;
        return `
          <tr>
            <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${idx + 1}</td>
            <td style="padding:6px;border:1px solid #CBD5E1;font-weight:700;">${item.model}</td>
            <td style="padding:6px;border:1px solid #CBD5E1;"><input data-idx="${idx}" data-f="description" value="${item.description}" style="width:100%;border:1px solid #E2E8F0;padding:4px;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;width:62px;"><input data-idx="${idx}" data-f="w" value="${item.w}" style="width:100%;border:1px solid #E2E8F0;padding:4px;text-align:center;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;width:62px;"><input data-idx="${idx}" data-f="d" value="${item.d}" style="width:100%;border:1px solid #E2E8F0;padding:4px;text-align:center;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;width:62px;"><input data-idx="${idx}" data-f="h" value="${item.h}" style="width:100%;border:1px solid #E2E8F0;padding:4px;text-align:center;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;width:95px;"><input type="number" data-idx="${idx}" data-f="unitPrice" value="${item.unitPrice}" style="width:100%;border:1px solid #E2E8F0;padding:4px;text-align:right;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;width:80px;"><input type="number" data-idx="${idx}" data-f="discount" value="${item.discount}" style="width:100%;border:1px solid #E2E8F0;padding:4px;text-align:right;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;width:58px;"><input type="number" data-idx="${idx}" data-f="qty" value="${item.qty}" style="width:100%;border:1px solid #E2E8F0;padding:4px;text-align:center;" /></td>
            <td style="padding:6px;border:1px solid #CBD5E1;text-align:right;font-weight:700;">${lineAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;"><button type="button" data-del="${idx}" style="background:#FEE2E2;color:#B91C1C;border:none;border-radius:4px;padding:3px 7px;cursor:pointer;">✕</button></td>
          </tr>`;
      })
      .join('');

    tbody.querySelectorAll('input[data-idx]').forEach(inp => {
      inp.onchange = function () {
        const i = Number(inp.getAttribute('data-idx'));
        const f = inp.getAttribute('data-f');
        HZK_SALES_CRM_STATE.items[i][f] = inp.type === 'number' ? Number(inp.value || 0) : inp.value;
        renderSalesQuotationRows(db);
        autoSaveDraftToLocal(db);
      };
    });

    tbody.querySelectorAll('button[data-del]').forEach(btn => {
      btn.onclick = function () {
        const i = Number(btn.getAttribute('data-del'));
        HZK_SALES_CRM_STATE.items.splice(i, 1);
        renderSalesQuotationRows(db);
        autoSaveDraftToLocal(db);
      };
    });

    const vatRate = format === 'EXPORT' ? 0 : 0.07;
    const vatAmt = subTotal * vatRate;
    const whtAmt = format === 'EXPORT' ? 0 : serviceSubTotal * 0.03;
    const grandTotal = subTotal + vatAmt - whtAmt;
    const curr = format === 'EXPORT' ? ' USD' : ' THB';

    document.getElementById('hzkSqVatLabel').textContent = format === 'EXPORT' ? 'VAT 0% (Export):' : 'VAT 7%:';
    document.getElementById('hzkSqSubTotal').textContent = subTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;
    document.getElementById('hzkSqVatAmt').textContent = vatAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;
    document.getElementById('hzkSqWhtAmt').textContent = (whtAmt > 0 ? '-' : '') + whtAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;
    document.getElementById('hzkSqGrandTotal').textContent = grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;

    return { subTotal, vatAmt, whtAmt, grandTotal };
  }

  // Global Bridge for Service Department (Service Report / Quotation / Billing Note / Receipt)
  window.sendHoshizakiTrackedDocument = async function (docData) {
    const db = await loadSalesMasterDb();
    const merged = Object.assign({
      docType: 'ใบแจ้งบริการ / ใบเสร็จรับเงิน (Service & Receipt)',
      department: 'Service & Billing',
      salesperson: 'NOPARIN_H',
      senderDisplayName: 'นพรินทร์ หอมหวล (Noparin Homhoul)',
      senderEmail: 'noparin@hoshizaki.co.th',
      format: 'LOCAL',
      rev: 'Rev.0',
      date: new Date().toISOString().slice(0, 10)
    }, docData || {});
    openMultiChannelShareHubModal(db, merged);
  };

  window.openSalesCorporateQuotationModal = openSalesCorporateQuotationModal;
  window.openDocumentTrackingDashboardModal = async function () {
    const db = await loadSalesMasterDb();
    openDocumentTrackingDashboardModal(db);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dockSalesCrmMenuButton);
  } else {
    dockSalesCrmMenuButton();
  }
})();
