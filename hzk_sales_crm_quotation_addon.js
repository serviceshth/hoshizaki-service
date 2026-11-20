/**
 * ============================================================================
 * HOSHIZAKI (THAILAND) LIMITED — SALES, MARKETING & JAPANESE CORPORATE CRM ADD-ON
 * Module Version: v1142-SALES-CRM-QUOTATION-ADDON
 * Compatible with: HOSHIZAKI Service Management PWA (`index.html` Enterprise v1060+)
 * Features:
 *   1) Multi-Format Quotation Engine (Service THB | Sales/JP Corp Local THB | Export USD)
 *   2) Auto-Fill Product Dimensions (W x D x H mm.) from 331-Model Y2026 Master Catalog
 *   3) Flexible Customer-Salesperson Assignment (Active Staff Directory, legacy inactive codes cleared)
 *   4) Updated Corporate Header (Building A, 1st floor, No. 10/11 Soi Vibhavadi Rangsit 64)
 *   5) Direct Cloud Sync to Google Apps Script (`saveSalesQuotation`, `reassignCustomerSalesperson`)
 * ============================================================================
 */
(function () {
  'use strict';

  const HZK_SALES_CRM_STATE = {
    version: 'v1142-SALES-CRM-QUOTATION-ADDON',
    masterDb: null,
    items: [],
    format: 'LOCAL', // 'LOCAL' (THB) | 'EXPORT' (USD)
    rev: 'Rev.0'
  };

  async function loadSalesMasterDb() {
    if (HZK_SALES_CRM_STATE.masterDb) return HZK_SALES_CRM_STATE.masterDb;
    try {
      const res = await fetch('./sales_crm_master_db_y2026.json?v=' + Date.now());
      if (res.ok) {
        HZK_SALES_CRM_STATE.masterDb = await res.json();
        return HZK_SALES_CRM_STATE.masterDb;
      }
    } catch (e) {
      console.warn('[HZK Sales CRM] Fallback to empty master DB:', e);
    }
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
        { code: 'FURUJO', name: 'Mr. Furujo', dept: 'Japanese Corporate' },
        { code: 'NOPARIN_H', name: 'นพรินทร์ หอมหวล (Noparin Homhoul)', dept: 'Service & Technical Support' },
        { code: 'KETSARAPORN', name: 'Ketsaraporn', dept: 'Sales' },
        { code: 'KULATHIDA_C', name: 'Kulathida C.', dept: 'Sales' },
        { code: 'JANYALUCK_P', name: 'Janyaluck P.', dept: 'Sales' },
        { code: 'MARKETING_TH', name: 'Marketing & Product Team', dept: 'Marketing' }
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

  function injectSalesCrmLauncherButton() {
    if (document.getElementById('hzkSalesCrmFloatingBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'hzkSalesCrmFloatingBtn';
    btn.type = 'button';
    btn.innerHTML = '💼 Sales &amp; JP Corp Quotation (Y2026)';
    btn.style.cssText =
      'position:fixed;bottom:18px;right:18px;z-index:9998;background:#002B49;color:#FFFFFF;' +
      'border:2px solid #38BDF8;border-radius:999px;padding:10px 18px;font-weight:700;' +
      'font-size:13px;box-shadow:0 8px 20px rgba(0,43,73,0.35);cursor:pointer;';
    btn.onclick = openSalesCorporateQuotationModal;
    document.body.appendChild(btn);
  }

  async function openSalesCorporateQuotationModal() {
    const db = await loadSalesMasterDb();
    let modal = document.getElementById('hzkSalesCorporateQtModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkSalesCorporateQtModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.72);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
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

    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultOfferNo = 'HTH-26' + String(Math.floor(100 + Math.random() * 899));

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1080px;max-height:94vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 45px rgba(0,0,0,0.35);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFFFFF;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;letter-spacing:0.05em;">HOSHIZAKI (THAILAND) LIMITED — SALES, MARKETING &amp; JAPANESE CORPORATE</div>
            <div style="font-size:18px;font-weight:700;">ใบเสนอราคาเครื่องและโครงการ (Quotation Y2026 Format + Dimension W×D×H)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkSalesCorporateQtModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:18px 22px;font-size:13px;color:#0F172A;">
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#0369A1;">
            <b>ที่อยู่หัวเอกสารปัจจุบัน:</b> ${db.companyHeader.companyNameEn} | ${db.companyHeader.addressLine1} ${db.companyHeader.addressLine2} | Tel: ${db.companyHeader.tel}
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-bottom:14px;">
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">รูปแบบเอกสาร (Format)</label>
              <select id="hzkSqFormat" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;">
                <option value="LOCAL">Local Format (THB + VAT 7% + WHT 3%)</option>
                <option value="EXPORT">Export / Hoshi Group Format (USD + VAT 0%)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">แผนก (Department)</label>
              <select id="hzkSqDept" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;">
                <option value="Sales">Sales Department</option>
                <option value="Japanese Corporate">Japanese Corporate</option>
                <option value="Marketing">Marketing Department</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เลขที่ใบเสนอราคา (Offer No.)</label>
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
              <label style="font-weight:700;display:block;margin-bottom:4px;">วันที่ (Date)</label>
              <input id="hzkSqDate" type="date" value="${todayStr}" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ผู้เสนอราคา / เซลล์ผู้ดูแล (ปรับเปลี่ยนได้)</label>
              <select id="hzkSqSalesperson" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;">
                <option value="">-- เลือกผู้ดูแลปัจจุบัน --</option>
                ${staffOptions}
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:14px;background:#F8FAFC;padding:12px;border-radius:10px;border:1px solid #E2E8F0;">
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ชื่อบริษัทลูกค้า (เลือกจาก 700 รายชื่อ หรือพิมพ์ใหม่)</label>
              <input id="hzkSqCustomer" list="hzkSqCustomerList" placeholder="พิมพ์ค้นหาชื่อบริษัทลูกค้า..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
              <datalist id="hzkSqCustomerList">${customerOptions}</datalist>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">ผู้ติดต่อ (Contact Person)</label>
              <input id="hzkSqContact" type="text" placeholder="ระบุชื่อผู้ติดต่อ..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เบอร์โทรศัพท์ (Tel No.)</label>
              <input id="hzkSqPhone" type="text" placeholder="02-xxx-xxxx / 08x-xxx-xxxx" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เงื่อนไขการชำระเงิน (Term of Payment)</label>
              <input id="hzkSqPayment" type="text" value="30DAYS" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div style="grid-column:1/-1;">
              <label style="font-weight:700;display:block;margin-bottom:4px;">ที่อยู่ลูกค้า (Address)</label>
              <input id="hzkSqAddress" type="text" placeholder="ที่อยู่สำหรับออกใบเสนอราคา..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>
            <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;">
              <input id="hzkSqUpdateBinding" type="checkbox" checked />
              <label for="hzkSqUpdateBinding" style="font-size:12px;color:#334155;">อัปเดตการผูกชื่อเซลล์ผู้ดูแลกับลูกค้ารายนี้ในฐานข้อมูลกลาง (ยืดหยุ่นปรับเปลี่ยนได้)</label>
            </div>
          </div>

          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
              <div style="font-weight:700;color:#002B49;">รายการสินค้าและขนาดเครื่อง (Dimension W × D × H mm.)</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select id="hzkSqModelPicker" style="max-width:340px;padding:7px;border:1px solid #CBD5E1;border-radius:8px;">
                  <option value="">-- เลือกรุ่นเครื่อง (331 รุ่น) เพื่อเติมขนาดอัตโนมัติ --</option>
                  ${modelOptions}
                </select>
                <button type="button" id="hzkSqAddModelBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">+ เพิ่มรุ่นเครื่อง</button>
                <button type="button" id="hzkSqAddInstallBtn" style="background:#475569;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">+ ค่าติดตั้ง (WHT 3%)</button>
              </div>
            </div>

            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#002B49;color:#FFFFFF;">
                    <th style="padding:8px;border:1px solid #CBD5E1;">NO.</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">MODEL</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">DESCRIPTION</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">W (mm)</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">D (mm)</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">H (mm)</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">UNIT PRICE</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">DISCOUNT</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">QTY</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">AMOUNT</th>
                    <th style="padding:8px;border:1px solid #CBD5E1;">ลบ</th>
                  </tr>
                </thead>
                <tbody id="hzkSqItemsBody"></tbody>
              </table>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;">
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เงื่อนไขเพิ่มเติม (เลือกแทรกจาก 28 เงื่อนไขมาตรฐาน)</label>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <select id="hzkSqTermPicker" style="flex:1;padding:7px;border:1px solid #CBD5E1;border-radius:8px;">
                  <option value="">-- เลือกเงื่อนไข Lead Time / Payment / Warranty --</option>
                  ${termsOptions}
                </select>
                <button type="button" id="hzkSqAddTermBtn" style="background:#0F172A;color:#FFF;border:none;border-radius:8px;padding:7px 12px;cursor:pointer;">แทรก</button>
              </div>
              <textarea id="hzkSqRemarks" rows="4" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;font-size:12px;">- Please transfer to Bank of Ayudhya Public Company Limited Future Park Rangsit Branch Current Account No. 062-0-04476-2 Branch No. 0062.
- The site must be prepared and ready for installation on delivery day.</textarea>
            </div>

            <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:12px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>SUB TOTAL:</span><b id="hzkSqSubTotal">0.00</b></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span id="hzkSqVatLabel">VAT 7%:</span><b id="hzkSqVatAmt">0.00</b></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Withholding Tax 3%:</span><b id="hzkSqWhtAmt">0.00</b></div>
              <hr style="border:none;border-top:1px solid #CBD5E1;margin:8px 0;" />
              <div style="display:flex;justify-content:space-between;font-size:15px;color:#002B49;"><span>GRAND TOTAL:</span><b id="hzkSqGrandTotal">0.00</b></div>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button type="button" id="hzkSqPrintBtn" style="background:#475569;color:#FFF;border:none;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer;">🖨️ พิมพ์ / บันทึก PDF</button>
            <button type="button" id="hzkSqSaveSyncBtn" style="background:#059669;color:#FFF;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;">☁️ บันทึกใบเสนอราคา &amp; ซิงก์เข้า Google Sheets</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    bindSalesQuotationEvents(db);
  }

  function bindSalesQuotationEvents(db) {
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
      renderSalesQuotationRows();
    };

    document.getElementById('hzkSqAddInstallBtn').onclick = function () {
      HZK_SALES_CRM_STATE.items.push({
        model: 'SERVICE',
        description: 'Installation Fee',
        w: '',
        d: '',
        h: '',
        unitPrice: 1500,
        discount: 0,
        qty: 1,
        isService: true
      });
      renderSalesQuotationRows();
    };

    document.getElementById('hzkSqAddTermBtn').onclick = function () {
      const tVal = document.getElementById('hzkSqTermPicker').value;
      if (!tVal) return;
      const ta = document.getElementById('hzkSqRemarks');
      ta.value = (ta.value ? ta.value + '\n' : '') + tVal;
    };

    document.getElementById('hzkSqFormat').onchange = renderSalesQuotationRows;
    document.getElementById('hzkSqPrintBtn').onclick = function () {
      window.print();
    };

    document.getElementById('hzkSqSaveSyncBtn').onclick = async function () {
      const totals = renderSalesQuotationRows();
      const payload = {
        action: 'saveSalesQuotation',
        quotation: {
          offerNo: document.getElementById('hzkSqOfferNo').value,
          rev: document.getElementById('hzkSqRev').value,
          date: document.getElementById('hzkSqDate').value,
          format: document.getElementById('hzkSqFormat').value,
          department: document.getElementById('hzkSqDept').value,
          salesperson: document.getElementById('hzkSqSalesperson').value,
          customerName: document.getElementById('hzkSqCustomer').value,
          contactPerson: document.getElementById('hzkSqContact').value,
          address: document.getElementById('hzkSqAddress').value,
          phone: document.getElementById('hzkSqPhone').value,
          paymentTerms: document.getElementById('hzkSqPayment').value,
          updateCustomerBinding: document.getElementById('hzkSqUpdateBinding').checked,
          items: HZK_SALES_CRM_STATE.items,
          subTotal: totals.subTotal,
          vatAmount: totals.vatAmt,
          whtAmount: totals.whtAmt,
          grandTotal: totals.grandTotal
        }
      };

      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        alert('บันทึกใบเสนอราคาในเครื่องเรียบร้อย (กรุณาตั้งค่า Google Apps Script URL เพื่อซิงก์ขึ้น Google Sheets)');
        return;
      }
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        alert('✅ บันทึกใบเสนอราคาเลขที่ ' + (data.offerNo || payload.quotation.offerNo) + ' (' + payload.quotation.rev + ') เข้า Google Sheets เรียบร้อยแล้ว!');
      } catch (err) {
        alert('⚠️ เกิดข้อผิดพลาดในการซิงก์: ' + err.message);
      }
    };

    renderSalesQuotationRows();
  }

  function renderSalesQuotationRows() {
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
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('input[data-idx]').forEach(inp => {
      inp.onchange = function () {
        const i = Number(inp.getAttribute('data-idx'));
        const f = inp.getAttribute('data-f');
        HZK_SALES_CRM_STATE.items[i][f] = inp.type === 'number' ? Number(inp.value || 0) : inp.value;
        renderSalesQuotationRows();
      };
    });

    tbody.querySelectorAll('button[data-del]').forEach(btn => {
      btn.onclick = function () {
        const i = Number(btn.getAttribute('data-del'));
        HZK_SALES_CRM_STATE.items.splice(i, 1);
        renderSalesQuotationRows();
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

  window.openSalesCorporateQuotationModal = openSalesCorporateQuotationModal;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSalesCrmLauncherButton);
  } else {
    injectSalesCrmLauncherButton();
  }
})();
