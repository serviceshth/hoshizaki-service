/**
 * ============================================================================
 * HOSHIZAKI (THAILAND) LIMITED — ENTERPRISE COMPLETE SUITE (v1146)
 * Features:
 *   1) 7-Department Group CC / BCC & Multi-LINE Group Distribution Pills (Auto-Suggest + Deduplicate)
 *   2) Customer Tax ID (13 Digits) & Branch (Head Office / Branch No.) + 1-Click Convert to Billing/Receipt
 *   3) Unified Executive BI Dashboard (`📈 สรุปผู้บริหาร (BI)`) combining Sales, Tracking & Service KPIs
 *   4) Live Google Sheets Master Sync, Isolated A4 Preview, Auto-Save, Direct PDF & Excel (.xls)
 * ============================================================================
 */
(function () {
  'use strict';

  const STORAGE_DRAFT_KEY = 'hzk_sales_qt_autosave_draft_v1146';
  const STORAGE_ARCHIVE_KEY = 'hzk_sales_qt_archive_list_v1146';

  const DEFAULT_GROUPS = [
    { code: 'SALES_ALL', label: 'All Sales Team', emails: 'ketsaraporn@hoshizaki.co.th, kulathida@hoshizaki.co.th, janyaluck@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Sales' },
    { code: 'JPC_TEAM', label: 'Japanese Corporate', emails: 'furujo@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Japanese Corporate' },
    { code: 'MARKETING_ALL', label: 'All Marketing', emails: 'marketing@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Marketing' },
    { code: 'SERVICE_ALL', label: 'All Service Team', emails: 'noparin@hoshizaki.co.th, services@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Service' },
    { code: 'FINANCE_ACC', label: 'Finance & Accounting', emails: 'accounting@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Accounting' },
    { code: 'ADMIN_HR', label: 'Admin & HR', emails: 'admin@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Admin' },
    { code: 'MANAGEMENT_BCC', label: 'Management (BCC ลับ)', emails: 'noparin@hoshizaki.co.th', lineGroupId: '', defaultMode: 'BCC', department: 'Management' }
  ];

  const HZK_OMNI_STATE = {
    version: 'v1153-ULTIMATE-OMNI-SUITE',
    masterDb: null,
    items: []
  };

  function getGasEndpointUrl() {
    return (
      localStorage.getItem('hzk_gas_webapp_url') ||
      localStorage.getItem('gasWebAppUrl') ||
      (window.HZK_CONFIG && window.HZK_CONFIG.gasUrl) ||
      ''
    );
  }

  async function loadSalesMasterDb(forceRefresh) {
    if (HZK_OMNI_STATE.masterDb && !forceRefresh) return HZK_OMNI_STATE.masterDb;

    let baseDb = null;
    try {
      const res = await fetch('./sales_crm_master_db_y2026.json?v=' + Date.now(), { cache: 'no-store' });
      if (res.ok) baseDb = await res.json();
    } catch (e) {}

    if (!baseDb) {
      baseDb = {
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
        termsAndConditions: [],
        emailGroups: DEFAULT_GROUPS
      };
    }

    if (!Array.isArray(baseDb.emailGroups) || !baseDb.emailGroups.length) {
      baseDb.emailGroups = DEFAULT_GROUPS;
    }

    const gasUrl = getGasEndpointUrl();
    if (gasUrl) {
      try {
        const liveRes = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getLiveSalesCrmMaster' })
        });
        const liveData = await liveRes.json();
        if (liveData && liveData.status === 'OK') {
          if (liveData.companyHeader) baseDb.companyHeader = liveData.companyHeader;
          if (Array.isArray(liveData.activeStaff) && liveData.activeStaff.length > 0) baseDb.activeStaff = liveData.activeStaff;
          if (Array.isArray(liveData.customers) && liveData.customers.length > 0) baseDb.customers = liveData.customers;
          if (Array.isArray(liveData.models) && liveData.models.length > 0) baseDb.models = liveData.models;
          if (Array.isArray(liveData.emailGroups) && liveData.emailGroups.length > 0) baseDb.emailGroups = liveData.emailGroups;
          if (liveData.stockMap) baseDb.stockMap = liveData.stockMap;
          if (liveData.portalUrl) baseDb.portalUrl = liveData.portalUrl;
          if (Array.isArray(liveData.damageDemoList) && liveData.damageDemoList.length > 0) baseDb.damageDemoList = liveData.damageDemoList;
        }
      } catch (e) {}
    }

    // Load initial parsed Stock on Hand snapshot (`live_stock_snapshot_y2026.json`) if stockMap not yet loaded
    if (!baseDb.stockMap || Object.keys(baseDb.stockMap).length === 0) {
      try {
        const snapRes = await fetch('./live_stock_snapshot_y2026.json?v=' + Date.now(), { cache: 'no-store' });
        if (snapRes.ok) {
          const snapJson = await snapRes.json();
          if (snapJson && snapJson.stockMap) baseDb.stockMap = snapJson.stockMap;
          if (snapJson && Array.isArray(snapJson.damageDemoList)) baseDb.damageDemoList = snapJson.damageDemoList;
        }
      } catch (eSnap) {}
    }

    HZK_OMNI_STATE.masterDb = baseDb;
    return baseDb;
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
      .hzk-grp-pill { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; border: 1px solid #CBD5E1; background: #FFF; font-size: 11px; font-weight: 700; cursor: pointer; user-select: none; }
      .hzk-grp-pill input { margin: 0; }
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

  function dockOmniBridgeButtons() {
    injectResponsiveStyles();

    // Remove any legacy separate buttons if present
    ['hzkSalesCrmDockedBtn', 'hzkServiceReportTrackedShareBtn'].forEach(id => {
      const old = document.getElementById(id);
      if (old) old.remove();
    });

    if (document.getElementById('hzkUnifiedDocSuiteWrap')) return;

    const hostContainer =
      document.getElementById('topHeaderStatusPillsRow') ||
      document.getElementById('topHeaderRightPillsWrap') ||
      document.querySelector('header');

    const wrap = document.createElement('div');
    wrap.id = 'hzkUnifiedDocSuiteWrap';
    wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;vertical-align:middle;';

    // Match exact uniform pill size & style of `Executive Report ▾` / `KPI Report Studio`
    const mainBtn = document.createElement('button');
    mainBtn.id = 'hzkUnifiedDocSuiteBtn';
    mainBtn.type = 'button';
    mainBtn.innerHTML = '📋 เอกสาร &amp; ติดตามสถานะ (ทุกแผนก) ▾';
    mainBtn.style.cssText =
      'background:linear-gradient(135deg,#0284C7,#0369A1);color:#FFFFFF;border:1px solid #7DD3FC;' +
      'border-radius:999px;padding:5px 13px;font-weight:700;font-size:12px;line-height:1.35;' +
      'cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;' +
      'box-shadow:0 2px 6px rgba(0,43,73,0.25);height:28px;';

    const menu = document.createElement('div');
    menu.id = 'hzkUnifiedDocSuiteMenu';
    menu.style.cssText =
      'display:none;position:fixed;min-width:295px;max-width:92vw;background:#FFFFFF;color:#0F172A;' +
      'border:1px solid #CBD5E1;border-radius:12px;box-shadow:0 14px 35px rgba(15,23,42,0.32);' +
      'padding:6px;z-index:20000;font-family:sans-serif;font-size:12.5px;';

    const menuItems = [
      { icon: '💼', label: 'ใบเสนอราคา Sales Department (THB)', sub: 'Y2026 + ขนาด W×D×H + เช็กสต็อกสด + คุมเพดานส่วนลด', action: () => openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)') },
      { icon: '🇯🇵', label: 'ใบเสนอราคา Japanese Corporate', sub: 'สำหรับลูกค้าองค์กรญี่ปุ่น & Inter-Company', action: () => openSalesCorporateQuotationWithPreset('Japanese Corporate', 'ใบเสนอราคา (Quotation)') },
      { icon: '📣', label: 'ใบเสนอราคา & โปรโมชัน Marketing', sub: 'แคมเปญการตลาดและเปิดตัวสินค้ารุ่นใหม่', action: () => openSalesCorporateQuotationWithPreset('Marketing', 'ใบเสนอราคา (Quotation)') },
      { divider: true },
      { icon: '🛠️', label: 'ส่ง & ติดตามเอกสาร Service / ใบวางบิล / ใบเสร็จ', sub: 'ดึงข้อมูลจากใบแจ้งบริการปัจจุบันส่งพร้อมปุ่ม Track', action: () => launchTrackedDocFromServiceForm() },
      { icon: '🔄', label: 'ศูนย์ส่งต่องานข้ามแผนก (1-Click Handover)', sub: 'Sales ➔ ติดตั้ง/ลงทะเบียน S/N | Service ➔ บัญชี', action: () => openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)', 'HANDOVER') },
      { icon: '🔔', label: 'ต่ออายุสัญญา PM & แจ้งเตือนหมดประกัน (60 วัน)', sub: 'สแกนเครื่องใกล้หมดประกัน + สร้างใบเสนอราคาต่อสัญญา 1 คลิก', action: () => window.openWarrantyPmRenewalModal() },
      { divider: true },
      { icon: '🏷️', label: 'สต็อกเครื่องโชว์ / มีตำหนิ & ใบตรวจสภาพ (602 รายการ)', sub: 'ดูรายการเครื่อง Demo/Damage + ลิงก์ใบตรวจสภาพ + ดึงลงใบเสนอราคา', action: () => window.openDamageDemoStockModal() },
      { icon: '📥', label: 'อัปเดต Stock จากอีเมล MICHIRU-RPA ทันที', sub: 'ดึงไฟล์ Stock on Hand ล่าสุดจาก Gmail เข้าฐานข้อมูลสด', action: () => window.triggerEmailStockSyncNow() },
      { icon: '🌐', label: 'พอร์ทัลลูกค้า & ตัวแทนจำหน่าย (Self-Service)', sub: 'เปิดหน้าเช็กเครื่องในร้าน ประวัติซ่อม และสถานะดีลเลอร์', action: () => window.openCustomerDealerPortalWindow() },
      { icon: '🔎', label: 'ประวัติเครื่องราย S/N 360° & อัลบั้มรูปหน้างาน', sub: 'ดูไทม์ไลน์ตั้งแต่คลัง ➔ ติดตั้ง ➔ ซ่อมบำรุง ➔ รูปถ่ายก่อน-หลัง', action: () => window.openSerial360TimelineModal() },
      { icon: '🚐', label: 'คลังอะไหล่รถช่าง T01–T08 & เบิกเติมอัตโนมัติ', sub: 'เช็ก/ตัด/เติมอะไหล่รถช่าง + แจ้งเตือนสโตร์เมื่อต่ำกว่า Min Stock', action: () => window.openTechnicianVanStockModal() },
      { icon: '📅', label: 'ตารางนัดหมายติดตั้ง & คิวงานช่าง (Dispatch Board)', sub: 'จัดคิวงานติดตั้ง/ซ่อมรายวันของช่าง T01–T08 + แจ้งเตือน LINE', action: () => window.openServiceDispatchCalendarModal() },
      { icon: '🏆', label: 'สรุปผลงาน & Incentive รายบุคคล (Sales & Tech KPI)', sub: 'สรุปยอดปิดการขาย PO Approved และจำนวนปิดเคสช่างประจำเดือน', action: () => window.openMonthlyIncentiveKpiModal() },
      { icon: '📊', label: 'ติดตามสถานะการรับเอกสาร & E-Sign PO (Tracking)', sub: 'เช็กสถานะ SENT / ยืนยันรับ / ลายเซ็น E-Sign & ไฟล์ PO ลูกค้า', action: () => window.openDocumentTrackingDashboardModal() },
      { icon: '📈', label: 'รายงานสรุปผู้บริหาร & AI Copilot (BI)', sub: 'KPI รวม + AI ติดตามใบเสนอราคาค้าง + ส่งเข้า LINE ผู้บริหาร', action: () => window.openExecutiveBiDashboardModal() },
      { divider: true },
      { icon: '🏭', label: 'ส่งออกข้อมูลเปิด Sales Order เข้า ERP / NAV', sub: 'ดาวน์โหลดไฟล์ตารางรายการ PO Approved พร้อมนำเข้าระบบบัญชี/ERP', action: () => window.exportErpSalesOrdersCsv() },
      { icon: '🎭', label: 'จำลองหน้าจอจริงแยกแผนก & รายบุคคล (Live Inspector)', sub: 'สลับดูหน้าตาการทำงานจริงแยก 8 แผนก หรือเจาะดูรายบุคคล (เซลล์ / ช่าง / บัญชี)', action: () => window.openDepartmentLiveSimulatorModal() },
      { icon: '🛡️', label: 'ตรวจความพร้อมระบบ & Go-Live Control (QA)', sub: 'เช็กสถานะ Token/API/Sheets + ติดตั้ง LINE Rich Menu + ล้างข้อมูลทดสอบ', action: () => window.openProductionGoLiveQaModal() },
      { icon: '📖', label: 'คู่มือใช้งานฉบับย่อแยกแผนก (Role SOP Guide)', sub: 'คู่มือ 1 หน้าสำหรับช่างบริการ / ฝ่ายขาย-JPC / บัญชี-ดีลเลอร์', action: () => window.openDepartmentRoleSopModal() }
    ];

    menuItems.forEach(item => {
      if (item.divider) {
        const hr = document.createElement('div');
        hr.style.cssText = 'height:1px;background:#E2E8F0;margin:4px 6px;';
        menu.appendChild(hr);
        return;
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.style.cssText =
        'width:100%;text-align:left;background:transparent;border:none;border-radius:8px;' +
        'padding:8px 10px;cursor:pointer;display:flex;align-items:flex-start;gap:9px;color:#0F172A;';
      row.innerHTML =
        `<span style="font-size:15px;line-height:1.2;">${item.icon}</span>` +
        `<span style="display:flex;flex-direction:column;">` +
        `<span style="font-weight:700;font-size:12.5px;color:#002B49;">${item.label}</span>` +
        `<span style="font-size:10.5px;color:#64748B;">${item.sub}</span>` +
        `</span>`;
      row.onmouseenter = () => { row.style.background = '#F0F9FF'; };
      row.onmouseleave = () => { row.style.background = 'transparent'; };
      row.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        item.action();
      };
      menu.appendChild(row);
    });

    mainBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = menu.style.display === 'block';
      if (isOpen) {
        menu.style.display = 'none';
        return;
      }
      const rect = mainBtn.getBoundingClientRect();
      menu.style.top = Math.min(window.innerHeight - 360, rect.bottom + 6) + 'px';
      menu.style.left = Math.max(8, Math.min(window.innerWidth - 310, rect.left)) + 'px';
      menu.style.display = 'block';
    };

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    wrap.appendChild(mainBtn);
    document.body.appendChild(menu);

    if (hostContainer) {
      hostContainer.appendChild(wrap);
    } else {
      wrap.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:9990;';
      document.body.appendChild(wrap);
    }
  }

  async function openSalesCorporateQuotationWithPreset(deptPreset, docTypePreset, extraAction) {
    await openSalesCorporateQuotationModal();
    const deptEl = document.getElementById('hzkSqDept');
    const docEl = document.getElementById('hzkSqDocType');
    if (deptEl && deptPreset) deptEl.value = deptPreset;
    if (docEl && docTypePreset) docEl.value = docTypePreset;
    if (extraAction === 'HANDOVER') {
      const db = await loadSalesMasterDb(false);
      openCrossDeptHandoverModal(db);
    }
  }

  function launchTrackedDocFromServiceForm() {
    const pickVal = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.value) return el.value.trim();
      }
      return '';
    };

    const jobNo = pickVal(['#jobNo', '#jobNumber', 'input[placeholder*="JOB-"]']) || ('SVC-' + Date.now().toString().slice(-6));
    const customerName = pickVal(['#customerName', '#custName', 'input[placeholder*="ชื่อร้าน"]']) || 'ลูกค้างานบริการ HOSHIZAKI';
    const contactPerson = pickVal(['#contactPerson', '#custContact', 'input[placeholder*="ผู้ติดต่อ"]']);
    const address = pickVal(['#customerAddress', '#custAddress', 'textarea[placeholder*="ที่อยู่"]', 'input[placeholder*="ที่อยู่"]']);
    const phone = pickVal(['#customerPhone', '#custPhone', 'input[placeholder*="เบอร์"]']);
    const model = pickVal(['#machineModel', '#modelInput', 'input[placeholder*="IM-100NE"]']) || 'SERVICE-EQUIPMENT';
    const serial = pickVal(['#serialNumber', '#serialNo', 'input[placeholder*="Serial"]']);

    window.sendHoshizakiTrackedDocument({
      docType: 'ใบแจ้งบริการ / ใบเสร็จรับเงิน (Service & Receipt)',
      department: 'Service & Billing',
      offerNo: jobNo,
      customerName: customerName,
      contactPerson: contactPerson,
      address: address,
      phone: phone,
      items: [{
        model: model,
        description: 'Service & Maintenance (' + (serial ? 'S/N: ' + serial : 'Field Service') + ')',
        w: '',
        d: '',
        h: '',
        unitPrice: 0,
        discount: 0,
        qty: 1,
        isService: true
      }]
    });
  }

  function getStaffDisplayInfo(db, code) {
    const found = (db.activeStaff || []).find(s => s.code === code);
    return found || { code: code || 'STAFF', name: code || 'เจ้าหน้าที่ HOSHIZAKI', dept: 'Sales', email: 'services@hoshizaki.co.th' };
  }

  function collectCurrentFormPayload(db) {
    const format = document.getElementById('hzkSqFormat').value;
    let subTotal = 0;
    let serviceSubTotal = 0;
    HZK_OMNI_STATE.items.forEach(item => {
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
      taxId: document.getElementById('hzkSqTaxId').value.trim(),
      branch: document.getElementById('hzkSqBranch').value.trim(),
      contactPerson: document.getElementById('hzkSqContact').value.trim(),
      address: document.getElementById('hzkSqAddress').value.trim(),
      phone: document.getElementById('hzkSqPhone').value.trim(),
      customerEmail: document.getElementById('hzkSqCustEmail').value.trim(),
      paymentTerms: document.getElementById('hzkSqPayment').value.trim(),
      remarks: document.getElementById('hzkSqRemarks').value,
      updateCustomerBinding: document.getElementById('hzkSqUpdateBinding').checked,
      items: HZK_OMNI_STATE.items,
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
    const taxLine = qt.taxId ? ` (Tax ID: ${qt.taxId} / ${qt.branch || 'สำนักงานใหญ่'})` : '';

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
        <td style="width:44%;padding:3px 0;">${qt.customerName || '-'}${taxLine}</td>
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

  async function openCrossDeptHandoverModal(db) {
    const qt = collectCurrentFormPayload(db);
    autoSaveDraftToLocal(db);

    let hModal = document.getElementById('hzkCrossDeptHandoverModal');
    if (!hModal) {
      hModal = document.createElement('div');
      hModal.id = 'hzkCrossDeptHandoverModal';
      hModal.style.cssText =
        'position:fixed;inset:0;z-index:10085;background:rgba(15,23,42,0.78);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(hModal);
    }

    const curr = qt.format === 'EXPORT' ? 'USD' : 'THB';
    const totalTxt = Number(qt.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + curr;
    const modelSummary = (qt.items || []).map(i => `${i.model} x${i.qty}`).join(', ') || '-';

    hModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:580px;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:#FBBF24;font-weight:800;">CROSS-DEPARTMENT WORKFLOW HANDOVER</div>
            <div style="font-size:16px;font-weight:700;">🔄 ศูนย์ส่งต่องานข้ามแผนกอัตโนมัติ (1-Click Handover)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkCrossDeptHandoverModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#0F172A;display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-weight:700;display:block;margin-bottom:4px;">เลือกเส้นทางส่งต่องานข้ามแผนก</label>
            <select id="hzkHndType" style="width:100%;padding:9px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
              <option value="SALES_TO_SERVICE_INSTALL">🛠️ Sales / JP Corp ➔ Service (เปิดงานติดตั้ง / สำรวจหน้างาน + ลงทะเบียน S/N)</option>
              <option value="TO_ACCOUNTING_BILLING">🧾 Sales / Service ➔ Accounting (ส่งต่อออกใบวางบิล / ใบกำกับภาษี / ใบเสร็จ)</option>
              <option value="SERVICE_TO_SALES_REPLACE">💡 Service ➔ Sales (แจ้งโอกาสขายเครื่องใหม่ / Trade-in จากหน้างานซ่อม)</option>
            </select>
          </div>
          <div>
            <label style="font-weight:700;display:block;margin-bottom:4px;">หมายเลขเครื่อง Serial No. (ถ้ามี — ระบบจะลงทะเบียนรับประกันให้อัตโนมัติ)</label>
            <input id="hzkHndSerial" type="text" placeholder="เช่น K01234J (เว้นว่างได้หากเป็นงานสำรวจหน้างาน)" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
          </div>
          <div>
            <label style="font-weight:700;display:block;margin-bottom:4px;">หมายเหตุ / รายละเอียดเพิ่มเติมถึงแผนกปลายทาง</label>
            <textarea id="hzkHndNotes" rows="3" placeholder="ระบุวันนัดหมายเข้าติดตั้ง เงื่อนไขหน้างาน หรือรายละเอียดออกบิล..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;"></textarea>
          </div>
          <button type="button" id="hzkHndSubmitBtn" style="width:100%;background:#059669;color:#FFF;border:none;border-radius:10px;padding:11px;font-weight:700;cursor:pointer;">🚀 ยืนยันส่งต่องานข้ามแผนก &amp; แจ้งเตือนเข้า LINE ทันที</button>
          <div id="hzkHndStatus" style="font-size:12px;background:#F1F5F9;padding:8px 12px;border-radius:8px;display:none;"></div>
        </div>
      </div>
    `;

    hModal.style.display = 'flex';
    document.getElementById('hzkHndSubmitBtn').onclick = async function () {
      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        alert('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนใช้งานครับ');
        return;
      }
      const hType = document.getElementById('hzkHndType').value;
      const toDept = hType === 'TO_ACCOUNTING_BILLING'
        ? 'Accounting & Billing'
        : (hType === 'SERVICE_TO_SALES_REPLACE' ? 'Commercial Sales' : 'Service & Installation');

      const st = document.getElementById('hzkHndStatus');
      st.style.display = 'block';
      st.textContent = '⏳ กำลังบันทึกการส่งต่องานและแจ้งเตือนแผนก ' + toDept + '...';

      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'dispatchCrossDeptHandover',
          handoverType: hType,
          fromDept: qt.department || 'Sales',
          toDept: toDept,
          senderName: qt.senderDisplayName || qt.salesperson || 'HOSHIZAKI Staff',
          refDocNo: qt.offerNo,
          customerName: qt.customerName,
          customerPhone: qt.phone,
          address: qt.address,
          modelSummary: modelSummary,
          serialNo: document.getElementById('hzkHndSerial').value,
          amountText: totalTxt,
          notes: document.getElementById('hzkHndNotes').value
        })
      });
      const data = await res.json();
      if (data && data.status === 'OK') {
        st.innerHTML = '✅ ส่งต่องานสำเร็จ! รหัส: <b>' + data.handoverId + '</b> (ไปยัง: <b>' + toDept + '</b>)' +
          (data.serialRegistered ? ' — ลงทะเบียน S/N เข้าฐานรับประกันเรียบร้อยแล้ว' : '');
      }
    };
  }

  function deduplicateEmails(rawStr) {
    const seen = new Set();
    const out = [];
    String(rawStr || '').split(/[,;\s]+/).forEach(em => {
      const clean = em.trim().toLowerCase();
      if (clean && clean.indexOf('@') > 0 && !seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    });
    return out.join(', ');
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

    const groups = db.emailGroups || DEFAULT_GROUPS;
    const docTypeU = String(qt.docType || '');
    const deptU = String(qt.department || '');

    const groupPillsHtml = groups.map(g => {
      let autoChecked = false;
      if (g.code === 'FINANCE_ACC' && /วางบิล|เสร็จ|Billing|Receipt/i.test(docTypeU)) autoChecked = true;
      if (g.code === 'JPC_TEAM' && /Japan/i.test(deptU)) autoChecked = true;
      if (g.code === 'MARKETING_ALL' && /Market/i.test(deptU)) autoChecked = true;
      if (g.code === 'SERVICE_ALL' && /Service/i.test(deptU)) autoChecked = true;
      return `
        <label class="hzk-grp-pill" title="${g.emails}">
          <input type="checkbox" class="hzk-grp-cb" data-code="${g.code}" data-emails="${g.emails}" data-mode="${g.defaultMode || 'CC'}" data-line="${g.lineGroupId || ''}" ${autoChecked ? 'checked' : ''} />
          <span>${g.defaultMode === 'BCC' ? '🔒 BCC:' : '👥 CC:'} ${g.label}</span>
        </label>`;
    }).join('');

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
      <div style="background:#FFFFFF;width:100%;max-width:690px;max-height:94vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">MULTI-CHANNEL SHARE + GROUP CC/BCC (7 DEPTS) + DOC TRACKING</div>
            <div style="font-size:15px;font-weight:700;">[${qt.department || 'Sales'}] ${qt.docType || 'ใบเสนอราคา'} ${qt.offerNo} (${qt.rev}) — ${totalTxt}</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkSqShareHubModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:18px 20px;font-size:13px;color:#0F172A;display:flex;flex-direction:column;gap:14px;">
          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:12px;">
            <div style="font-weight:700;color:#002B49;margin-bottom:8px;">1️⃣ ส่งทางอีเมลพร้อมแนบไฟล์จริง + เลือกกลุ่ม CC / BCC รายแผนก</div>
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
              <div style="grid-column:1/-1;">
                <label style="font-size:12px;font-weight:700;">อีเมลผู้รับหลัก (To Email)</label>
                <input id="hzkShareToEmail" type="email" value="${qt.customerEmail || ''}" placeholder="customer@company.co.th" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;" />
              </div>
            </div>

            <div style="margin-bottom:8px;">
              <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:6px;">ติ๊กเลือกกลุ่มสำเนาอีเมลทั้งแผนก (Group CC / BCC — แก้ไขสมาชิกได้ใน Google Sheets):</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">${groupPillsHtml}</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
              <div>
                <label style="font-size:11px;font-weight:700;color:#475569;">รายชื่ออีเมล CC รวม (แก้ไขเพิ่ม/ลดได้)</label>
                <input id="hzkShareCcEmail" type="text" placeholder="cc1@hoshizaki.co.th, cc2@..." style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;font-size:12px;" />
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#475569;">รายชื่ออีเมล BCC (สำเนาลับผู้บริหาร)</label>
                <input id="hzkShareBccEmail" type="text" placeholder="bcc@hoshizaki.co.th" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;font-size:12px;" />
              </div>
            </div>

            <button type="button" id="hzkShareSendEmailBtn" style="width:100%;background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">📧 ส่งอีเมลแนบไฟล์ + CC/BCC กลุ่มที่เลือก + ปุ่มยืนยันรับเอกสาร</button>
          </div>

          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px;">
            <div style="font-weight:700;color:#166534;margin-bottom:8px;">2️⃣ แชร์เข้า LINE (การ์ดแยกสีตามแผนก + ปุ่มยืนยันรับ &amp; อนุมัติสั่งซื้อ)</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="hzkShareLinePushBtn" style="flex:1;background:#059669;color:#FFF;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">💬 ส่ง Flex Card เข้า LINE OA &amp; กลุ่มที่เลือก</button>
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

    function syncGroupCheckboxesToFields() {
      let ccList = [];
      let bccList = [];
      shareModal.querySelectorAll('.hzk-grp-cb:checked').forEach(cb => {
        const em = cb.getAttribute('data-emails') || '';
        const mode = cb.getAttribute('data-mode') || 'CC';
        if (mode === 'BCC') bccList.push(em);
        else ccList.push(em);
      });
      document.getElementById('hzkShareCcEmail').value = deduplicateEmails(ccList.join(', '));
      document.getElementById('hzkShareBccEmail').value = deduplicateEmails(bccList.join(', '));
    }

    shareModal.querySelectorAll('.hzk-grp-cb').forEach(cb => {
      cb.onchange = syncGroupCheckboxesToFields;
    });
    syncGroupCheckboxesToFields();

    const statusBox = document.getElementById('hzkShareStatusBox');
    const setStatus = (msg) => {
      statusBox.style.display = 'block';
      statusBox.innerHTML = msg;
    };

    function getSelectedExtraLineGroupIds() {
      const ids = [];
      shareModal.querySelectorAll('.hzk-grp-cb:checked').forEach(cb => {
        const g = (cb.getAttribute('data-line') || '').trim();
        if (g && ids.indexOf(g) === -1) ids.push(g);
      });
      return ids;
    }

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
        body: JSON.stringify(Object.assign({
          action: 'shareSalesQuotation',
          channel: channel,
          quotation: qt,
          extraLineGroupIds: getSelectedExtraLineGroupIds()
        }, extra || {}))
      });
      return await res.json();
    }

    document.getElementById('hzkShareSendEmailBtn').onclick = async function () {
      const sel = document.getElementById('hzkShareSenderSelect');
      const opt = sel.options[sel.selectedIndex];
      const data = await callShareGas('EMAIL', {
        toEmail: document.getElementById('hzkShareToEmail').value,
        ccEmail: document.getElementById('hzkShareCcEmail').value,
        bccEmail: document.getElementById('hzkShareBccEmail').value,
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
      const phone = document.getElementById('hzkShareS  async function openExecutiveBiDashboardModal() {
    let biModal = document.getElementById('hzkExecutiveBiModal');
    if (!biModal) {
      biModal = document.createElement('div');
      biModal.id = 'hzkExecutiveBiModal';
      biModal.style.cssText =
        'position:fixed;inset:0;z-index:10095;background:rgba(15,23,42,0.8);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(biModal);
    }

    biModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:900px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:11px;color:#FBBF24;font-weight:800;">UNIFIED EXECUTIVE BI &amp; AI SALES COPILOT</div>
            <div style="font-size:16px;font-weight:700;">📈 รายงานสรุปผู้บริหาร + AI ติดตามใบเสนอราคา</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" id="hzkSendBriefingLineBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">📲 ส่งสรุปเข้า LINE ผู้บริหารทันที</button>
            <button type="button" onclick="document.getElementById('hzkExecutiveBiModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
          </div>
        </div>
        <div id="hzkBiBody" style="padding:18px 20px;font-size:13px;color:#0F172A;">⏳ กำลังดึงข้อมูลสรุปจาก Google Sheets...</div>
      </div>
    `;
    biModal.style.display = 'flex';

    const gasUrl = getGasEndpointUrl();
    const bodyEl = document.getElementById('hzkBiBody');
    if (!gasUrl) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">กรุณาตั้งค่า Google Apps Script URL เพื่อดูรายงานสรุปผู้บริหารครับ</div>';
      return;
    }

    document.getElementById('hzkSendBriefingLineBtn').onclick = async function () {
      const r = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sendExecutiveBriefingNow' })
      });
      const resData = await r.json();
      alert(resData && resData.status === 'OK' ? '✅ ส่งรายงานสรุปผู้บริหารเข้า LINE เรียบร้อยแล้ว!' : '⚠️ ส่งไม่สำเร็จ');
    };

    try {
      const [resBi, resAi] = await Promise.all([
        fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getExecutiveBiSummary' }) }),
        fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getAiSalesFollowUps' }) })
      ]);
      const d = await resBi.json();
      const ai = await resAi.json();
      const q = d.quotations || {};
      const t = d.tracking || {};
      const s = d.service || {};
      const staleList = (ai && ai.items) || [];

      const deptRows = Object.keys(q.byDept || {}).map(k =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E2E8F0;"><span>${k}</span><b>${Number(q.byDept[k] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>`
      ).join('') || '<div style="color:#64748B;">ยังไม่มีข้อมูลแยกแผนก</div>';

      const aiRows = staleList.slice(0, 10).map(item =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #E2E8F0;gap:8px;">` +
        `<div><b>${item.docNo}</b> — ${item.customer} <span style="color:#64748B;">(${item.dept} / ${item.sender})</span></div>` +
        `<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">ส่งแล้ว ${item.daysAgo} วัน (${item.amount})</span>` +
        `</div>`
      ).join('') || '<div style="color:#059669;">✅ ไม่มีใบเสนอราคาค้างติดตามเกิน 3 วัน</div>';

      bodyEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px;">
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:#1D4ED8;">💼 ใบเสนอราคาสะสม (Sales &amp; JPC)</div>
            <div style="font-size:22px;font-weight:800;color:#002B49;margin-top:4px;">${q.count || 0} ฉบับ</div>
            <div style="font-size:12px;color:#334155;">มูลค่ารวม: <b>${Number(q.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>
          </div>
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:#15803D;">📊 สถานะการรับเอกสาร &amp; PO</div>
            <div style="font-size:22px;font-weight:800;color:#14532D;margin-top:4px;">${(t.ACKNOWLEDGED || 0) + (t.PO_APPROVED || 0)} ยืนยันแล้ว</div>
            <div style="font-size:12px;color:#334155;">อนุมัติสั่งซื้อ: <b>${t.PO_APPROVED || 0}</b> | รอตอบรับ: <b>${t.SENT || 0}</b></div>
          </div>
          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:#B91C1C;">🛠️ งานบริการ &amp; ดีลเลอร์ (Service)</div>
            <div style="font-size:22px;font-weight:800;color:#7F1D1D;margin-top:4px;">${s.totalTickets || 0} เคส</div>
            <div style="font-size:12px;color:#334155;">ปิดจบเอง (FCR): <b>${s.fcrResolved || 0}</b> | ดีลเลอร์รับงาน: <b>${s.dealerAccepted || 0}</b></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;">
            <div style="font-weight:700;color:#002B49;margin-bottom:8px;">ยอดเสนอราคาแยกตามแผนก</div>
            ${deptRows}
          </div>
          <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:14px;">
            <div style="font-weight:700;color:#92400E;margin-bottom:8px;">🤖 AI Sales Follow-Up Copilot (ค้างติดตาม &gt; 3 วัน)</div>
            ${aiRows}
          </div>
        </div>
      `;
    } catch (err) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">โหลดรายงานไม่สำเร็จ: ' + err.message + '</div>';
    }
  }

  async function openWarrantyPmRenewalModal() {
    let pmModal = document.getElementById('hzkWarrantyPmRenewalModal');
    if (!pmModal) {
      pmModal = document.createElement('div');
      pmModal.id = 'hzkWarrantyPmRenewalModal';
      pmModal.style.cssText =
        'position:fixed;inset:0;z-index:10092;background:rgba(15,23,42,0.78);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(pmModal);
    }

    pmModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:980px;max-height:90vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#FBBF24;font-weight:800;">PREDICTIVE PM &amp; WARRANTY RENEWAL ENGINE</div>
            <div style="font-size:16px;font-weight:700;">🔔 ระบบแจ้งเตือนเครื่องใกล้หมดประกัน &amp; ต่ออายุสัญญา PM อัตโนมัติ</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkWarrantyPmRenewalModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div id="hzkPmRenewalBody" style="padding:16px 20px;font-size:13px;">⏳ กำลังตรวจสอบวันหมดประกันและรอบบำรุงรักษา (PM) จากฐานข้อมูล...</div>
      </div>
    `;
    pmModal.style.display = 'flex';

    const gasUrl = getGasEndpointUrl();
    const bodyEl = document.getElementById('hzkPmRenewalBody');
    if (!gasUrl) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">กรุณาตั้งค่า Google Apps Script URL ก่อนใช้งานครับ</div>';
      return;
    }

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getWarrantyPmRenewals' })
      });
      const data = await res.json();
      const items = (data && data.items) || [];
      if (!items.length) {
        bodyEl.innerHTML = '<div style="color:#64748B;">ไม่พบรายการเครื่องในฐานข้อมูล Serial_Dealer_Master</div>';
        return;
      }

      bodyEl.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;min-width:780px;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#0F172A;color:#FFF;">
                <th style="padding:8px;border:1px solid #CBD5E1;">Serial No.</th>
                <th style="padding:8px;border:1px solid #CBD5E1;">Model</th>
                <th style="padding:8px;border:1px solid #CBD5E1;">ลูกค้า / ร้าน</th>
                <th style="padding:8px;border:1px solid #CBD5E1;">สถานะการรับประกัน</th>
                <th style="padding:8px;border:1px solid #CBD5E1;">ค่าบริการ PM รายปีแนะนำ</th>
                <th style="padding:8px;border:1px solid #CBD5E1;">สร้างใบเสนอราคาต่อสัญญา</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr>
                  <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${it.serialNumber}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;">${it.model}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;">${it.customerName} (${it.phone || '-'})</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;">${it.warrantyStatus}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;font-weight:700;">${Number(it.suggestedPmPrice || 4500).toLocaleString('en-US', { minimumFractionDigits: 2 })} THB</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">
                    <button type="button" data-pm-idx="${idx}" class="hzk-create-pm-qt-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:6px 10px;font-weight:700;cursor:pointer;">📄 ออกใบเสนอราคา PM</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;

      bodyEl.querySelectorAll('.hzk-create-pm-qt-btn').forEach(btn => {
        btn.onclick = async function () {
          const item = items[Number(btn.getAttribute('data-pm-idx'))];
          document.getElementById('hzkWarrantyPmRenewalModal').style.display = 'none';
          HZK_OMNI_STATE.items = [{
            model: item.model,
            description: 'Annual Preventive Maintenance (PM Contract 4 Visits/Year) — S/N: ' + item.serialNumber,
            w: '',
            d: '',
            h: '',
            unitPrice: Number(item.suggestedPmPrice || 4500),
            discount: 0,
            qty: 1,
            isService: true
          }];
          await openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบเสนอราคา (Quotation)');
          document.getElementById('hzkSqCustomer').value = item.customerName || '';
          document.getElementById('hzkSqPhone').value = item.phone || '';
        };
      });
    } catch (err) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">เกิดข้อผิดพลาด: ' + err.message + '</div>';
    }
  }

  async function openCustomerDealerPortalWindow() {
    const db = await loadSalesMasterDb(false);
    const gasUrl = getGasEndpointUrl();
    const portalUrl = db.portalUrl || (gasUrl ? (gasUrl + '?action=portal') : '');
    if (!portalUrl) {
      alert('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนเปิดหน้า Customer & Dealer Portal ครับ');
      return;
    }
    window.open(portalUrl, '_blank');
  }

ze:12px;color:#334155;">ปิดจบเอง (FCR): <b>${s.fcrResolved || 0}</b> | ดีลเลอร์รับงาน: <b>${s.dealerAccepted || 0}</b></div>
          </div>
        </div>
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;">
          <div style="font-weight:700;color:#002B49;margin-bottom:8px;">ยอดเสนอราคาแยกตามแผนก (Department Breakdown)</div>
          ${deptRows}
        </div>
      `;
    } catch (err) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">โหลดรายงานไม่สำเร็จ: ' + err.message + '</div>';
    }
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
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">REAL-TIME DOCUMENT ACKNOWLEDGEMENT &amp; PO APPROVAL TRACKER</div>
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
          if (st === 'PO_APPROVED') {
            badge = '<span style="background:#DBEAFE;color:#1E40AF;padding:3px 8px;border-radius:999px;font-weight:700;">✍️ อนุมัติสั่งซื้อแล้ว (PO APPROVED)</span>';
          } else if (st === 'ACKNOWLEDGED') {
            badge = '<span style="background:#DCFCE7;color:#166534;padding:3px 8px;border-radius:999px;font-weight:700;">✅ ได้รับเอกสารแล้ว</span>';
          } else if (st === 'MISSING_REPORTED') {
            badge = '<span style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:999px;font-weight:700;">🚨 แจ้งไม่ได้รับเอกสาร</span>';
          } else if (st === 'FOLLOWUP_24H') {
            badge = '<span style="background:#FFEDD5;color:#9A3412;padding:3px 8px;border-radius:999px;font-weight:700;">⏰ ค้างตอบรับ > 24 ชม.</span>';
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
    const db = await loadSalesMasterDb(false);
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

    const stockMap = db.stockMap || {};
    const modelOptions = (db.models || [])
      .map(m => {
        const st = stockMap[String(m.model || '').toUpperCase()];
        const stockTag = st
          ? (st.available > 0 ? ` [🟢 พร้อมส่ง ${st.available} เครื่อง]` : ` [🟠 ${st.leadTime}]`)
          : '';
        return `<option value="${m.model}">${m.model} (${m.w || '-'}x${m.d || '-'}x${m.h || '-'} mm) - ${m.description}${stockTag}</option>`;
      })
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
      HZK_OMNI_STATE.items = savedDraft.items;
    }

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1100px;max-height:95vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 45px rgba(0,0,0,0.35);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFFFFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;letter-spacing:0.05em;">HOSHIZAKI (THAILAND) LIMITED — ENTERPRISE COMPLETE SUITE (v1146)</div>
            <div style="font-size:16px;font-weight:700;">ระบบออกเอกสาร &amp; เชื่อมงานข้ามแผนก <span id="hzkSqAutoSaveBadge" style="font-size:11px;background:#065F46;color:#A7F3D0;padding:2px 8px;border-radius:999px;margin-left:6px;">● Auto-Save Ready</span></div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <button type="button" id="hzkSqConvertBillBtn" style="background:#0D9488;color:#FFF;border:none;border-radius:8px;padding:7px 11px;font-weight:700;cursor:pointer;">🧾 แปลงเป็นใบวางบิล/ใบเสร็จ</button>
            <button type="button" id="hzkSqHandoverBtn" style="background:#D97706;color:#FFF;border:none;border-radius:8px;padding:7px 11px;font-weight:700;cursor:pointer;">🔄 ส่งต่องานข้ามแผนก</button>
            <button type="button" id="hzkSqOpenTrackDashBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 11px;font-weight:700;cursor:pointer;">📊 ติดตามเอกสาร</button>
            <button type="button" id="hzkSqOpenBiBtn" style="background:#4F46E5;color:#FFF;border:none;border-radius:8px;padding:7px 11px;font-weight:700;cursor:pointer;">📈 สรุปผู้บริหาร (BI)</button>
            <button type="button" onclick="document.getElementById('hzkSalesCorporateQtModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 11px;font-weight:700;cursor:pointer;">✕ ปิด</button>
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
              <label style="font-weight:700;display:block;margin-bottom:4px;">ชื่อบริษัทลูกค้า (ดึงสดจากฐานข้อมูล หรือพิมพ์ใหม่)</label>
              <input id="hzkSqCustomer" list="hzkSqCustomerList" value="${(savedDraft && savedDraft.customerName) || ''}" placeholder="พิมพ์ค้นหาชื่อบริษัทลูกค้า..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
              <datalist id="hzkSqCustomerList">${customerOptions}</datalist>
            </div>
            <div>
              <label style="font-weight:700;display:block;margin-bottom:4px;">เลขประจำตัวผู้เสียภาษี (Tax ID 13 หลัก) / สาขา</label>
              <div style="display:flex;gap:6px;">
                <input id="hzkSqTaxId" type="text" value="${(savedDraft && savedDraft.taxId) || ''}" placeholder="เลขผู้เสียภาษี 13 หลัก" style="flex:2;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
                <input id="hzkSqBranch" type="text" value="${(savedDraft && savedDraft.branch) || 'สำนักงานใหญ่'}" placeholder="สาขา" style="flex:1;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
              </div>
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
              <label style="font-weight:700;display:block;margin-bottom:4px;">เงื่อนไขการชำระเงิน (Term of Payment) / วันที่</label>
              <div style="display:flex;gap:6px;">
                <input id="hzkSqPayment" type="text" value="${(savedDraft && savedDraft.paymentTerms) || '30DAYS'}" style="flex:1;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
                <input id="hzkSqDate" type="date" value="${todayStr}" style="flex:1;padding:8px;border:1px solid #CBD5E1;border-radius:8px;" />
              </div>
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
            <button type="button" id="hzkSqMgrApproveBtn" style="background:#B45309;color:#FFF;border:none;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;">🔐 ขออนุมัติส่วนลด (LINE)</button>
            <button type="button" id="hzkSqShareHubBtn" style="background:#7C3AED;color:#FFF;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">📤 แชร์ + Group CC/BCC</button>
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

    document.getElementById('hzkSqConvertBillBtn').onclick = function () {
      const docSel = document.getElementById('hzkSqDocType');
      const offerInp = document.getElementById('hzkSqOfferNo');
      const curDoc = docSel.value;
      if (curDoc.indexOf('วางบิล') === -1) {
        docSel.value = 'ใบวางบิล (Billing Note)';
        offerInp.value = offerInp.value.replace(/^HTH-/, 'INV-');
      } else {
        docSel.value = 'ใบเสร็จรับเงิน (Receipt)';
        offerInp.value = offerInp.value.replace(/^INV-/, 'REC-');
      }
      autoSaveDraftToLocal(db);
      alert('✅ แปลงประเภทเอกสารเป็น "' + docSel.value + '" เลขที่ ' + offerInp.value + ' เรียบร้อยแล้ว');
    };

    document.getElementById('hzkSqHandoverBtn').onclick = function () {
      openCrossDeptHandoverModal(db);
    };

    document.getElementById('hzkSqOpenTrackDashBtn').onclick = function () {
      openDocumentTrackingDashboardModal(db);
    };

    document.getElementById('hzkSqOpenBiBtn').onclick = function () {
      openExecutiveBiDashboardModal();
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
      HZK_OMNI_STATE.items.push({
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
      HZK_OMNI_STATE.items.push({
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
      HZK_OMNI_STATE.items = [];
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

    document.getElementById('hzkSqMgrApproveBtn').onclick = async function () {
      const qt = collectCurrentFormPayload(db);
      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        alert('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนส่งขออนุมัติครับ');
        return;
      }
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'requestDiscountApproval', quotation: qt })
      });
      const data = await res.json();
      alert(data && data.message ? ('✅ ' + data.message) : '✅ ส่งคำขออนุมัติเรียบร้อยแล้ว');
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

    tbody.innerHTML = HZK_OMNI_STATE.items
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
        HZK_OMNI_STATE.items[i][f] = inp.type === 'number' ? Number(inp.value || 0) : inp.value;
        renderSalesQuotationRows(db);
        autoSaveDraftToLocal(db);
      };
    });

    tbody.querySelectorAll('button[data-del]').forEach(btn => {
      btn.onclick = function () {
        const i = Number(btn.getAttribute('data-del'));
        HZK_OMNI_STATE.items.splice(i, 1);
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

  window.sendHoshizakiTrackedDocument = async function (docData) {
    const db = await loadSalesMasterDb(false);
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
    const db = await loadSalesMasterDb(false);
    openDocumentTrackingDashboardModal(db);
  };
  window.openExecutiveBiDashboardModal = openExecutiveBiDashboardModal;
  window.openWarrantyPmRenewalModal = openWarrantyPmRenewalModal;

  async function openDamageDemoStockModal() {
    const db = await loadSalesMasterDb(false);
    const list = db.damageDemoList || [];
    let dModal = document.getElementById('hzkDamageDemoStockModal');
    if (!dModal) {
      dModal = document.createElement('div');
      dModal.id = 'hzkDamageDemoStockModal';
      dModal.style.cssText =
        'position:fixed;inset:0;z-index:10094;background:rgba(15,23,42,0.78);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(dModal);
    }

    dModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1020px;max-height:90vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#7C2D12;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#FDE68A;font-weight:800;">DEMO / CLEARANCE / INSPECTION STOCK CATALOG</div>
            <div style="font-size:16px;font-weight:700;">🏷️ รายการเครื่องโชว์ / กล่องชำรุด / มีตำหนิพร้อมขาย (${list.length} รายการ)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDamageDemoStockModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:16px 20px;font-size:13px;">
          <input id="hzkDmgSearchInp" type="text" placeholder="🔎 พิมพ์ค้นหารุ่นเครื่อง (เช่น IM-130NE, FM-1000) หรือ Serial No. หรือสถานะ..." style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;margin-bottom:12px;" />
          <div style="overflow-x:auto;">
            <table style="width:100%;min-width:780px;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#0F172A;color:#FFF;">
                  <th style="padding:8px;border:1px solid #CBD5E1;">Model</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">Serial No.</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">สภาพเครื่อง / หมายเหตุ (Remark)</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">ใบตรวจสภาพ</th>
                  <th style="padding:8px;border:1px solid #CBD5E1;">นำไปเสนอราคา</th>
                </tr>
              </thead>
              <tbody id="hzkDmgTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    dModal.style.display = 'flex';

    function renderDmgRows(filterTxt) {
      const q = String(filterTxt || '').trim().toUpperCase();
      const filtered = q
        ? list.filter(x => (x.model + ' ' + x.serialNo + ' ' + x.remark).toUpperCase().indexOf(q) !== -1)
        : list;
      const tbody = document.getElementById('hzkDmgTableBody');
      tbody.innerHTML = filtered.slice(0, 120).map((it, idx) => `
        <tr>
          <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${it.model}</td>
          <td style="padding:7px;border:1px solid #CBD5E1;">${it.serialNo || '-'}</td>
          <td style="padding:7px;border:1px solid #CBD5E1;">${it.remark || '-'}</td>
          <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">
            ${it.link ? `<a href="${it.link}" target="_blank" style="background:#0284C7;color:#FFF;text-decoration:none;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;">📄 เปิดใบตรวจ</a>` : '<span style="color:#94A3B8;">-</span>'}
          </td>
          <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">
            <button type="button" data-d-idx="${idx}" class="hzk-pick-dmg-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:5px 9px;font-weight:700;cursor:pointer;">+ เลือกรุ่นนี้</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" style="padding:14px;text-align:center;color:#64748B;">ไม่พบรายการที่ค้นหา</td></tr>';

      tbody.querySelectorAll('.hzk-pick-dmg-btn').forEach(btn => {
        btn.onclick = async function () {
          const item = filtered[Number(btn.getAttribute('data-d-idx'))];
          dModal.style.display = 'none';
          const mObj = (db.models || []).find(m => m.model.toUpperCase() === item.model.toUpperCase()) || { w: '', d: '', h: '', description: 'Hoshizaki Equipment' };
          HZK_OMNI_STATE.items.push({
            model: item.model,
            description: mObj.description + ' [S/N: ' + item.serialNo + ' — ' + item.remark + ']',
            w: mObj.w || '',
            d: mObj.d || '',
            h: mObj.h || '',
            unitPrice: 0,
            discount: 0,
            qty: 1,
            isService: false
          });
          await openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)');
        };
      });
    }

    document.getElementById('hzkDmgSearchInp').oninput = function (e) {
      renderDmgRows(e.target.value);
    };
    renderDmgRows('');
  }

  async function triggerEmailStockSyncNow() {
    const gasUrl = getGasEndpointUrl();
    if (!gasUrl) {
      alert('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนสั่งซิงก์สตอกจากอีเมลครับ');
      return;
    }
    alert('⏳ กำลังค้นหาอีเมลล่าสุดหัวข้อ "Daily stock report" จาก MICHIRU-RPA และอัปเดตฐานข้อมูลสต็อก กรุณารอสักครู่...');
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'syncEmailStockNow' })
      });
      const data = await res.json();
      if (data && data.status === 'OK') {
        await loadSalesMasterDb(true);
        alert('✅ อัปเดตสต็อกประจำวันสำเร็จ!\n• อีเมล: ' + data.emailSubject + '\n• รุ่นสินค้าในคลัง: ' + data.totalModels + ' รุ่น (พร้อมส่ง ' + data.readyModels + ' รุ่น)\n• เครื่องโชว์/มีตำหนิ: ' + data.damageDemoCount + ' รายการ');
      } else {
        alert('⚠️ ' + ((data && data.message) || 'ไม่พบไฟล์ Stock on Hand ในอีเมลล่าสุด'));
      }
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาดในการดึงอีเมล: ' + err.message);
    }
  }

  window.openCustomerDealerPortalWindow = openCustomerDealerPortalWindow;
  window.openDamageDemoStockModal = openDamageDemoStockModal;

  async function exportErpSalesOrdersCsv() {
    const gasUrl = getGasEndpointUrl();
    if (!gasUrl) {
      alert('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนส่งออกข้อมูล ERP ครับ');
      return;
    }
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'exportErpSalesOrders' })
      });
      const data = await res.json();
      const rows = (data && data.rows) || [];
      if (!rows.length) {
        alert('ℹ️ ยังไม่มีรายการใบเสนอราคาในระบบสำหรับส่งออก ERP ครับ');
        return;
      }
      const headers = ['Order_Status', 'Offer_No', 'Rev', 'Date', 'Department', 'Salesperson_Code', 'Customer_Name', 'Payment_Terms', 'Currency', 'Item_No', 'Description', 'Qty', 'Unit_Price', 'Discount', 'Line_Amount'];
      const csvLines = [headers.join(',')].concat(rows.map(r =>
        headers.map(h => {
          const key = h.charAt(0).toLowerCase() + h.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          const val = String(r[key] !== undefined ? r[key] : '').replace(/"/g, '""');
          return `"${val}"`;
        }).join(',')
      ));
      const blob = new Blob(['\ufeff' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'HOSHIZAKI_ERP_NAV_SalesOrders_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('✅ ส่งออกไฟล์ CSV สำหรับนำเข้า ERP / NAV เรียบร้อยแล้ว (' + rows.length + ' รายการ)');
    } catch (err) {
      alert('❌ ส่งออกไฟล์ไม่สำเร็จ: ' + err.message);
    }
  }

  async function openProductionGoLiveQaModal() {
    let qaModal = document.getElementById('hzkProductionQaModal');
    if (!qaModal) {
      qaModal = document.createElement('div');
      qaModal.id = 'hzkProductionQaModal';
      qaModal.style.cssText =
        'position:fixed;inset:0;z-index:10096;background:rgba(15,23,42,0.8);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(qaModal);
    }

    qaModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:780px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">PRODUCTION GO-LIVE READINESS &amp; ADMIN CONTROL</div>
            <div style="font-size:16px;font-weight:700;">🛡️ ตรวจสอบความพร้อมระบบ &amp; เครื่องมือเปิดใช้งานจริง (v1150)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkProductionQaModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#0F172A;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
            <button type="button" id="hzkDeployRichMenuBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer;">📱 สร้าง LINE Rich Menu 6 ปุ่ม (Customer OA)</button>
            <button type="button" id="hzkResetDemoDataBtn" style="background:#DC2626;color:#FFF;border:none;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer;">🧹 ล้างข้อมูลทดสอบก่อน Go-Live (เก็บฐานหลักไว้ครบ)</button>
          </div>
          <div id="hzkQaChecklistBody">⏳ กำลังตรวจสอบความพร้อมของระบบทั้งหมด...</div>
        </div>
      </div>
    `;
    qaModal.style.display = 'flex';

    const gasUrl = getGasEndpointUrl();
    const bodyEl = document.getElementById('hzkQaChecklistBody');
    if (!gasUrl) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">กรุณาตั้งค่า Google Apps Script URL เพื่อตรวจสอบความพร้อมระบบครับ</div>';
      return;
    }

    document.getElementById('hzkDeployRichMenuBtn').onclick = async function () {
      const r = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deployCustomerRichMenu' })
      });
      const d = await r.json();
      alert(d.status === 'OK' ? ('✅ ' + d.note + '\nRich Menu ID: ' + d.richMenuId) : ('⚠️ ' + (d.message || 'ไม่สำเร็จ')));
    };

    document.getElementById('hzkResetDemoDataBtn').onclick = async function () {
      if (!confirm('ยืนยันล้างข้อมูลเคสทดสอบและประวัติส่งเอกสารทดสอบ?\n(ฐานข้อมูลลูกค้า 700 ราย, รุ่นเครื่อง 331 รุ่น, พนักงาน, กลุ่มอีเมล และสต็อกจะไม่ถูกลบ)')) return;
      const r = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'resetDemoDataSafe' })
      });
      const d = await r.json();
      alert('✅ ล้างข้อมูลทดสอบเรียบร้อยแล้ว (' + (d.clearedSheets || []).join(', ') + ')');
    };

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'runProductionQaCheck' })
      });
      const data = await res.json();
      const checks = (data && data.checks) || [];
      bodyEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead><tr style="background:#0F172A;color:#FFF;"><th style="padding:8px;text-align:left;">รายการตรวจสอบ (System Check)</th><th style="padding:8px;">สถานะ</th><th style="padding:8px;text-align:left;">รายละเอียด</th></tr></thead>
          <tbody>
            ${checks.map(c => `
              <tr>
                <td style="padding:8px;border:1px solid #CBD5E1;font-weight:700;">${c.item}</td>
                <td style="padding:8px;border:1px solid #CBD5E1;text-align:center;">${c.ok ? '<span style="color:#059669;font-weight:800;">✅ READY</span>' : '<span style="color:#DC2626;font-weight:800;">⚠️ CHECK</span>'}</td>
                <td style="padding:8px;border:1px solid #CBD5E1;color:#334155;">${c.detail}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      bodyEl.innerHTML = '<div style="color:#B91C1C;">ตรวจสอบไม่สำเร็จ: ' + err.message + '</div>';
    }
  }

  function openDepartmentRoleSopModal() {
    let sopModal = document.getElementById('hzkRoleSopModal');
    if (!sopModal) {
      sopModal = document.createElement('div');
      sopModal.id = 'hzkRoleSopModal';
      sopModal.style.cssText =
        'position:fixed;inset:0;z-index:10097;background:rgba(15,23,42,0.8);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(sopModal);
    }

    sopModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:880px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.4);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">HOSHIZAKI (THAILAND) LIMITED — QUICK REFERENCE SOP</div>
            <div style="font-size:16px;font-weight:700;">📖 คู่มือใช้งานระบบฉบับย่อแยกตามบทบาท (Role-Based Guide)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkRoleSopModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#0F172A;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px;">
            <div style="font-weight:800;color:#991B1B;font-size:14px;margin-bottom:8px;">1️⃣ ทีมช่างบริการ &amp; ดีลเลอร์ (มือถือ &amp; LINE)</div>
            <ul style="margin:0;padding-left:18px;line-height:1.6;font-size:12.5px;">
              <li><b>ในกลุ่ม LINE:</b> พิมพ์ <code>SPEC IM-130NE</code> เพื่อเปิดสเปก 5 หมวด, พิมพ์ <code>SN K01234J</code> เพื่อเช็กประกันและดีลเลอร์, พิมพ์ <code>AI &lt;อาการ&gt;</code> เพื่อถามวิศวกร AI</li>
              <li><b>รับงานจากลูกค้า:</b> กดปุ่ม <b>แชร์ข้อมูลดีลเลอร์ให้ลูกค้า</b> หรือ <b>ส่งเคสเข้ากลุ่มดีลเลอร์</b></li>
              <li><b>ส่งใบแจ้งบริการ/ใบเสร็จ:</b> กดปุ่ม <b>📋 เอกสาร &amp; ติดตามสถานะ ▾</b> เลือก <i>ส่ง &amp; ติดตามเอกสาร Service</i></li>
            </ul>
          </div>
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px;">
            <div style="font-weight:800;color:#1E40AF;font-size:14px;margin-bottom:8px;">2️⃣ ฝ่ายขาย, Marketing &amp; Japanese Corporate (PC)</div>
            <ul style="margin:0;padding-left:18px;line-height:1.6;font-size:12.5px;">
              <li><b>ออกใบเสนอราคา Y2026:</b> กด <b>📋 เอกสาร &amp; ติดตามสถานะ ▾</b> เลือกแผนก ➔ พิมพ์ชื่อลูกค้า &amp; เลือกรุ่นเครื่อง (เติมขนาด <code>W×D×H</code> และเช็กสต็อกสดอัตโนมัติ)</li>
              <li><b>ตรวจหน้ากระดาษ:</b> กด <b>👁️ Preview เอกสาร A4</b> ก่อนพิมพ์ PDF หรือ Export Excel</li>
              <li><b>ส่งเอกสาร &amp; CC ทั้งแผนก:</b> กด <b>📤 แชร์ + Group CC/BCC</b> ติ๊กเลือกกลุ่มแผนกและส่งผ่าน Email/LINE/SMS พร้อมปุ่มให้ลูกค้ากดยืนยันรับเอกสาร</li>
            </ul>
          </div>
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:14px;">
            <div style="font-weight:800;color:#166534;font-size:14px;margin-bottom:8px;">3️⃣ ฝ่ายบัญชี, ธุรการ &amp; ผู้บริหาร</div>
            <ul style="margin:0;padding-left:18px;line-height:1.6;font-size:12.5px;">
              <li><b>ออกใบวางบิล/ใบเสร็จ:</b> เปิดใบเสนอราคาเดิมแล้วกด <b>🧾 แปลงเป็นใบวางบิล/ใบเสร็จ</b></li>
              <li><b>ส่งออกเข้า ERP / NAV:</b> เลือกเมนู <b>🏭 ส่งออกข้อมูลเปิด Sales Order เข้า ERP / NAV</b></li>
              <li><b>ติดตาม KPI &amp; สต็อก:</b> ระบบดึงสต็อกจากอีเมล <code>MICHIRU-RPA</code> อัตโนมัติทุกวัน 18:00 น. และส่งสรุปผู้บริหารเข้า LINE ทุกวันศุกร์ 17:00 น.</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    sopModal.style.display = 'flex';
  }

  window.triggerEmailStockSyncNow = triggerEmailStockSyncNow;
  window.exportErpSalesOrdersCsv = exportErpSalesOrdersCsv;
  window.openProductionGoLiveQaModal = openProductionGoLiveQaModal;

  const DEPT_VIEW_PROFILES = [
    {
      id: 'SERVICE_TECH',
      icon: '🛠️',
      deptName: 'Service Field Technician (ช่างบริการภาคสนาม)',
      badgeColor: '#991B1B',
      bgLight: '#FEF2F2',
      borderCol: '#FECACA',
      uiMode: 'TECH',
      visibleModules: 'ใบแจ้งบริการ (Service Report), สแกน S/N & คู่มือ 5 หมวด, ส่งใบแจ้งบริการ/ใบเสร็จพร้อมปุ่ม Track, เช็กอะไหล่ในรถ',
      hiddenModules: 'ซ่อนราคาทุน (Cost), ซ่อนกำไรขั้นต้น (GP%), ซ่อนเมนูอนุมัติส่วนลดผู้บริหารและส่งออก ERP',
      launchWorkspace: () => {
        applyGlobalAppRoleMode('TECH');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    {
      id: 'SERVICE_MGR',
      icon: '🧑‍💼',
      deptName: 'Service Manager & Dispatch (ผู้จัดการฝ่ายบริการ/จ่ายงาน)',
      badgeColor: '#B91C1C',
      bgLight: '#FFF1F2',
      borderCol: '#FECDD3',
      uiMode: 'MANAGER',
      visibleModules: 'เห็นราคาทุน & GP%, จ่ายงานช่าง (T01-T08), ติดตามเคสดีลเลอร์ (SLA 2 ชม.), ต่ออายุสัญญา PM & ประกัน 60 วัน',
      hiddenModules: 'เปิดสิทธิ์ครบทุกเครื่องมือแผนกบริการและตรวจสอบคุณภาพ',
      launchWorkspace: () => {
        applyGlobalAppRoleMode('MANAGER');
        window.openWarrantyPmRenewalModal();
      }
    },
    {
      id: 'SALES_TH',
      icon: '💼',
      deptName: 'Commercial Sales (ฝ่ายขายในประเทศ THB)',
      badgeColor: '#002B49',
      bgLight: '#EFF6FF',
      borderCol: '#BFDBFE',
      uiMode: 'MANAGER',
      visibleModules: 'ใบเสนอราคา Y2026 (THB + VAT 7% + WHT 3%), เติมขนาด W×D×H อัตโนมัติ, เช็กสต็อกสด HHE, ส่งต่องานติดตั้ง/ลงทะเบียน S/N',
      hiddenModules: 'ล็อกเพดานส่วนลด >5% ต้องกดขออนุมัติผู้จัดการผ่าน LINE',
      launchWorkspace: () => openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)')
    },
    {
      id: 'JPC_CORP',
      icon: '🇯🇵',
      deptName: 'Japanese Corporate (ฝ่ายขายองค์กรญี่ปุ่น & Inter-Co)',
      badgeColor: '#1E1B4B',
      bgLight: '#EEF2FF',
      borderCol: '#C7D2FE',
      uiMode: 'MANAGER',
      visibleModules: 'ใบเสนอราคา Japanese Corporate (THB Local & USD Export 0% VAT), เชื่อมฐานลูกค้า Mr. Furujo, CC กลุ่ม JPC_TEAM อัตโนมัติ',
      hiddenModules: 'แสดงแถบการ์ด LINE สีม่วงครามเฉพาะฝ่าย Japanese Corporate',
      launchWorkspace: () => openSalesCorporateQuotationWithPreset('Japanese Corporate', 'ใบเสนอราคา (Quotation)')
    },
    {
      id: 'MARKETING',
      icon: '📣',
      deptName: 'Marketing & Product (ฝ่ายการตลาดและผลิตภัณฑ์)',
      badgeColor: '#065F46',
      bgLight: '#ECFDF5',
      borderCol: '#A7F3D0',
      uiMode: 'MANAGER',
      visibleModules: 'ใบเสนอราคาแคมเปญโปรโมชัน, ตารางสต็อกเครื่องโชว์/มีตำหนิ 602 รายการพร้อมลิงก์ใบตรวจสภาพ, การ์ด LINE สีเขียวมรกต',
      hiddenModules: 'สามารถดึงเครื่อง Demo/Clearance ลงใบเสนอราคาได้ทันที',
      launchWorkspace: () => window.openDamageDemoStockModal()
    },
    {
      id: 'ACCOUNTING',
      icon: '🧾',
      deptName: 'Accounting & Billing (ฝ่ายบัญชีและการเงิน)',
      badgeColor: '#0F766E',
      bgLight: '#F0FDFA',
      borderCol: '#99F6E4',
      uiMode: 'MANAGER',
      visibleModules: 'แปลงใบเสนอราคาเป็นใบวางบิล/ใบเสร็จ (1 คลิก), กรอกเลขผู้เสียภาษี 13 หลัก/สาขา, CC ฝ่ายบัญชีอัตโนมัติ, ส่งออก CSV เข้า ERP/NAV',
      hiddenModules: 'ติดตามสถานะลูกค้ากดยืนยันรับใบวางบิล/ใบเสร็จแบบเรียลไทม์',
      launchWorkspace: () => openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบวางบิล (Billing Note)')
    },
    {
      id: 'ADMIN_HR',
      icon: '🏢',
      deptName: 'Admin & HR (ฝ่ายธุรการและบุคคล)',
      badgeColor: '#4338CA',
      bgLight: '#F5F3FF',
      borderCol: '#DDD6FE',
      uiMode: 'MANAGER',
      visibleModules: 'จัดการรายชื่อพนักงาน (CRM_Staff_Directory), ตั้งค่ากลุ่มอีเมล CC/BCC 7 แผนก, ตรวจความพร้อมระบบ Go-Live QA & คู่มือ SOP',
      hiddenModules: 'ควบคุมสิทธิ์การเข้าถึงและการสำรองข้อมูลกลาง',
      launchWorkspace: () => window.openProductionGoLiveQaModal()
    },
    {
      id: 'EXECUTIVE',
      icon: '📈',
      deptName: 'Executive Management (คณะผู้บริหารสูงสุด)',
      badgeColor: '#B45309',
      bgLight: '#FFFBEB',
      borderCol: '#FDE68A',
      uiMode: 'MANAGER',
      visibleModules: 'Executive BI Dashboard รวมทุกแผนก, AI Sales Follow-Up Copilot, อนุมัติส่วนลด >12% ผ่าน LINE, รับสรุปรายสัปดาห์อัตโนมัติ',
      hiddenModules: 'รับสำเนาลับ (BCC) ใบเสนอราคาโครงการสำคัญ',
      launchWorkspace: () => window.openExecutiveBiDashboardModal()
    }
  ];

  function applyGlobalAppRoleMode(mode) {
    try {
      // Trigger existing PWA technician/manager toggle if available in DOM
      const btns = Array.from(document.querySelectorAll('button'));
      if (mode === 'TECH') {
        const toTech = btns.find(b => /สลับเป็นโหมดช่างดำเนินงาน/i.test(b.textContent || ''));
        if (toTech) toTech.click();
      } else {
        const toMgr = btns.find(b => /สลับเป็นโหมดผู้จัดการ|ผู้จัดการ\/จ่ายงาน/i.test(b.textContent || ''));
        if (toMgr && /ช่างดำเนินงาน/.test(document.body.innerText)) toMgr.click();
      }
    } catch (e)  const FIELD_TECH_ROSTER = [
    { code: 'T01', name: 'ช่างบริการ T01 (Bangkok North)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T02', name: 'ช่างบริการ T02 (Bangkok South)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T03', name: 'ช่างบริการ T03 (Bangkok East)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T04', name: 'ช่างบริการ T04 (Nonthaburi / Pathum)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T05', name: 'ช่างบริการ T05 (Samut Prakan / Chonburi)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T06', name: 'ช่างบริการ T06 (Ayutthaya / Central)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T07', name: 'ช่างบริการ T07 (Upcountry / Dealer Sub)', dept: 'Service Field Tech', role: 'Field Service Technician', email: 'services@hoshizaki.co.th', isTech: true },
    { code: 'T08', name: 'ช่างบริการ T08 (Installation & PM)', dept: 'Service Field Tech', role: 'Installation Specialist', email: 'services@hoshizaki.co.th', isTech: true }
  ];

  function showDepartmentSimulationBanner(profile, staffMember) {
    let banner = document.getElementById('hzkDeptSimActiveBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'hzkDeptSimActiveBanner';
      banner.style.cssText =
        'position:fixed;bottom:14px;left:14px;z-index:20050;background:#0F172A;color:#FFF;' +
        'border:2px solid #38BDF8;border-radius:12px;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,0.4);' +
        'font-family:sans-serif;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:94vw;';
      document.body.appendChild(banner);
    }

    if (staffMember) {
      banner.innerHTML = `
        <div>
          <div style="font-size:10px;color:#FBBF24;font-weight:800;">👤 INDIVIDUAL STAFF LIVE VIEW (SUPER ADMIN AUDIT)</div>
          <div style="font-weight:700;">กำลังดูหน้าจอของ: ${staffMember.name} [${staffMember.dept}]</div>
        </div>
        <button type="button" id="hzkReopenStaffDetailBtn" style="background:#059669;color:#FFF;border:none;border-radius:7px;padding:6px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">📊 ดูงาน/ลูกค้าของคนนี้</button>
        <button type="button" id="hzkSwitchDeptBannerBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:7px;padding:6px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">เปลี่ยนคน/แผนก</button>
        <button type="button" id="hzkExitDeptBannerBtn" style="background:#EF4444;color:#FFF;border:none;border-radius:7px;padding:6px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ กลับ Super Admin</button>
      `;
      banner.style.display = 'flex';
      document.getElementById('hzkReopenStaffDetailBtn').onclick = () => openIndividualStaffWorkspaceDrawer(staffMember);
    } else {
      banner.innerHTML = `
        <div>
          <div style="font-size:10px;color:#38BDF8;font-weight:800;">🎭 ACTIVE DEPARTMENT VIEW SIMULATION</div>
          <div style="font-weight:700;">${profile.icon} กำลังแสดงมุมมอง: ${profile.deptName}</div>
        </div>
        <button type="button" id="hzkSwitchDeptBannerBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:7px;padding:6px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">เปลี่ยนแผนก/บุคคล</button>
        <button type="button" id="hzkExitDeptBannerBtn" style="background:#EF4444;color:#FFF;border:none;border-radius:7px;padding:6px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ กลับ Super Admin</button>
      `;
      banner.style.display = 'flex';
    }

    document.getElementById('hzkSwitchDeptBannerBtn').onclick = openDepartmentLiveSimulatorModal;
    document.getElementById('hzkExitDeptBannerBtn').onclick = function () {
      applyGlobalAppRoleMode('MANAGER');
      banner.style.display = 'none';
    };
  }

  async function openIndividualStaffWorkspaceDrawer(staff) {
    const db = await loadSalesMasterDb(false);
    const assignedCustomers = (db.customers || []).filter(c =>
      String(c.assignedSales || '').trim().toUpperCase() === String(staff.code || '').trim().toUpperCase()
    );

    const localArchives = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_ARCHIVE_KEY) || '[]'); } catch (e) { return []; }
    })();
    const staffQuotes = localArchives.filter(q =>
      String(q.salesperson || '').trim().toUpperCase() === String(staff.code || '').trim().toUpperCase()
    );

    let drawer = document.getElementById('hzkIndividualStaffDrawerModal');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'hzkIndividualStaffDrawerModal';
      drawer.style.cssText =
        'position:fixed;inset:0;z-index:20030;background:rgba(15,23,42,0.82);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(drawer);
    }

    const custRows = assignedCustomers.slice(0, 60).map((c, idx) => `
      <tr>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">${idx + 1}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;font-weight:700;">${c.name}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;">${c.paymentTerms || '30DAYS'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;">${c.phone || '-'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:center;">
          <button type="button" data-cust-name="${c.name.replace(/"/g, '&quot;')}" class="hzk-staff-new-qt-cust" style="background:#0284C7;color:#FFF;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;">+ ออกใบเสนอราคา</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748B;">ไม่มีรายชื่อลูกค้าผูกตายตัว (สามารถออกเอกสารให้ลูกค้าทั่วไปได้ทั้งหมด)</td></tr>';

    const qtRows = staffQuotes.slice(0, 25).map(q => `
      <tr>
        <td style="padding:6px;border:1px solid #CBD5E1;font-weight:700;">${q.offerNo} (${q.rev})</td>
        <td style="padding:6px;border:1px solid #CBD5E1;">${q.customerName || '-'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;">${q.date || '-'}</td>
        <td style="padding:6px;border:1px solid #CBD5E1;text-align:right;font-weight:700;">${Number(q.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748B;">ยังไม่มีประวัติใบเสนอราคาในเครื่องของรหัสนี้</td></tr>';

    drawer.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:960px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;">
        <div style="background:#1E1B4B;color:#FFF;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:#FBBF24;font-weight:800;">INDIVIDUAL STAFF WORKSPACE &amp; KPI SNAPSHOT</div>
            <div style="font-size:16px;font-weight:700;">👤 ${staff.name} (${staff.code}) — แผนก: ${staff.dept}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" id="hzkStaffCreateDocAsUserBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">📄 ออกเอกสารในชื่อ ${staff.name}</button>
            <button type="button" onclick="document.getElementById('hzkIndividualStaffDrawerModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
          </div>
        </div>

        <div style="padding:16px 20px;font-size:13px;color:#0F172A;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:16px;">
            <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px;">
              <div style="font-size:11px;font-weight:700;color:#1D4ED8;">🏢 ลูกค้าในความดูแล (Assigned Accounts)</div>
              <div style="font-size:20px;font-weight:800;color:#002B49;margin-top:4px;">${assignedCustomers.length} บริษัท</div>
            </div>
            <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px;">
              <div style="font-size:11px;font-weight:700;color:#15803D;">📄 เอกสารที่ออกในเครื่อง (Local Archive)</div>
              <div style="font-size:20px;font-weight:800;color:#14532D;margin-top:4px;">${staffQuotes.length} ฉบับ</div>
            </div>
            <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;">
              <div style="font-size:11px;font-weight:700;color:#B45309;">🛡️ โหมดสิทธิ์หน้าจอจริง (RBAC Mode)</div>
              <div style="font-size:16px;font-weight:800;color:#78350F;margin-top:6px;">${staff.isTech ? '🛠️ Field Technician (ซ่อนทุน/GP%)' : '💼 Commercial / Manager View'}</div>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <div style="font-weight:700;color:#002B49;margin-bottom:6px;">รายชื่อลูกค้าที่ผูกกับคุณ ${staff.name} (${assignedCustomers.length} ราย):</div>
            <div style="overflow-x:auto;max-height:240px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:8px;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead><tr style="background:#002B49;color:#FFF;"><th style="padding:7px;">#</th><th style="padding:7px;text-align:left;">ชื่อบริษัทลูกค้า</th><th style="padding:7px;">เครดิต</th><th style="padding:7px;">เบอร์โทร</th><th style="padding:7px;">ดำเนินการ</th></tr></thead>
                <tbody>${custRows}</tbody>
              </table>
            </div>
          </div>

          <div>
            <div style="font-weight:700;color:#002B49;margin-bottom:6px;">ประวัติใบเสนอราคาล่าสุดของ ${staff.name}:</div>
            <div style="overflow-x:auto;border:1px solid #E2E8F0;border-radius:8px;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead><tr style="background:#0F172A;color:#FFF;"><th style="padding:7px;text-align:left;">Offer No.</th><th style="padding:7px;text-align:left;">ลูกค้า</th><th style="padding:7px;">วันที่</th><th style="padding:7px;text-align:right;">ยอดสุทธิ</th></tr></thead>
                <tbody>${qtRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    drawer.style.display = 'flex';

    document.getElementById('hzkStaffCreateDocAsUserBtn').onclick = async function () {
      drawer.style.display = 'none';
      const targetDept = /Japan/i.test(staff.dept) ? 'Japanese Corporate' : (/Market/i.test(staff.dept) ? 'Marketing' : (/Service/i.test(staff.dept) ? 'Service & Billing' : 'Sales'));
      await openSalesCorporateQuotationWithPreset(targetDept, 'ใบเสนอราคา (Quotation)');
      const spEl = document.getElementById('hzkSqSalesperson');
      if (spEl) spEl.value = staff.code;
      const remEl = document.getElementById('hzkSqRemarks');
      if (remEl && remEl.value.indexOf('Super Admin Audit') === -1) {
        remEl.value += '\n- [Super Admin Audit Support: ตรวจสอบ/ออกเอกสารร่วมกับ ' + staff.name + ']';
      }
    };

    drawer.querySelectorAll('.hzk-staff-new-qt-cust').forEach(btn => {
      btn.onclick = async function () {
        const cName = btn.getAttribute('data-cust-name');
        drawer.style.display = 'none';
        const targetDept = /Japan/i.test(staff.dept) ? 'Japanese Corporate' : 'Sales';
        await openSalesCorporateQuotationWithPreset(targetDept, 'ใบเสนอราคา (Quotation)');
        const spEl = document.getElementById('hzkSqSalesperson');
        if (spEl) spEl.value = staff.code;
        const cEl = document.getElementById('hzkSqCustomer');
        if (cEl) {
          cEl.value = cName;
          cEl.dispatchEvent(new Event('change'));
        }
      };
    });
  }

  async function openDepartmentLiveSimulatorModal() {
    const db = await loadSalesMasterDb(false);
    const allIndividuals = (db.activeStaff || []).map(s => ({
      code: s.code,
      name: s.name,
      dept: s.dept || 'Sales',
      role: s.role || 'Staff',
      email: s.email || 'services@hoshizaki.co.th',
      isTech: false
    })).concat(FIELD_TECH_ROSTER);

    let simModal = document.getElementById('hzkDeptLiveSimulatorModal');
    if (!simModal) {
      simModal = document.createElement('div');
      simModal.id = 'hzkDeptLiveSimulatorModal';
      simModal.style.cssText =
        'position:fixed;inset:0;z-index:20020;background:rgba(15,23,42,0.82);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(simModal);
    }

    const deptCardsHtml = DEPT_VIEW_PROFILES.map((p, idx) => `
      <div style="background:${p.bgLight};border:1.5px solid ${p.borderCol};border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="background:${p.badgeColor};color:#FFF;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;">${p.icon} ${p.id}</span>
            <span style="font-size:10.5px;font-weight:700;color:#475569;">โหมดระบบ: ${p.uiMode}</span>
          </div>
          <div style="font-weight:800;font-size:14px;color:#0F172A;margin-bottom:6px;">${p.deptName}</div>
          <div style="font-size:11.5px;color:#1E293B;line-height:1.45;margin-bottom:5px;"><b>✅ ฟังก์ชันที่มองเห็นและใช้งานได้:</b> ${p.visibleModules}</div>
          <div style="font-size:11px;color:#475569;line-height:1.4;"><b>🔒 การควบคุมสิทธิ์/การแสดงผล:</b> ${p.hiddenModules}</div>
        </div>
        <button type="button" data-sim-idx="${idx}" class="hzk-launch-dept-sim-btn" style="width:100%;background:${p.badgeColor};color:#FFF;border:none;border-radius:9px;padding:9px 12px;font-weight:700;font-size:12px;cursor:pointer;">👁️ เปิดดูหน้าจอจริงของแผนกนี้</button>
      </div>
    `).join('');

    const staffCardsHtml = allIndividuals.map((st, idx) => {
      const custCount = (db.customers || []).filter(c => String(c.assignedSales || '').toUpperCase() === st.code.toUpperCase()).length;
      const badgeBg = st.isTech ? '#991B1B' : (/Japan/i.test(st.dept) ? '#1E1B4B' : (/Market/i.test(st.dept) ? '#065F46' : '#002B49'));
      return `
        <div style="background:#F8FAFC;border:1.5px solid #CBD5E1;border-radius:12px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:5px;">
              <span style="background:${badgeBg};color:#FFF;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;">${st.code}</span>
              <span style="font-size:10.5px;font-weight:700;color:#475569;">${st.dept}</span>
            </div>
            <div style="font-weight:800;font-size:13.5px;color:#0F172A;">👤 ${st.name}</div>
            <div style="font-size:11.5px;color:#334155;margin-top:3px;">ตำแหน่ง: ${st.role || '-'}</div>
            <div style="font-size:11px;color:#0369A1;margin-top:3px;">${st.isTech ? '🛠️ สิทธิ์หน้างานช่าง (ซ่อนราคาทุน/GP%)' : ('🏢 ลูกค้าที่ดูแล: <b>' + custCount + ' บริษัท</b>')}</div>
          </div>
          <button type="button" data-staff-idx="${idx}" class="hzk-launch-staff-sim-btn" style="width:100%;background:${badgeBg};color:#FFF;border:none;border-radius:8px;padding:8px 10px;font-weight:700;font-size:11.5px;cursor:pointer;">👁️ สวมมุมมองดูหน้าจอของคนนี้</button>
        </div>
      `;
    }).join('');

    simModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1080px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">SUPER ADMIN &amp; ADMIN STUDIO — DEPARTMENT &amp; INDIVIDUAL LIVE INSPECTOR</div>
            <div style="font-size:16px;font-weight:700;">🎭 ศูนย์ตรวจสอบหน้าจอจริงแยกตามแผนก (8 แผนก) และรายบุคคล (${allIndividuals.length} คน)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDeptLiveSimulatorModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:16px 20px;">
          <div style="display:flex;gap:8px;margin-bottom:14px;border-bottom:2px solid #E2E8F0;padding-bottom:10px;flex-wrap:wrap;">
            <button type="button" id="hzkTabDeptViewBtn" style="background:#002B49;color:#FFF;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">🏢 1. ดูหน้าจอแยกตามแผนก (8 แผนก)</button>
            <button type="button" id="hzkTabStaffViewBtn" style="background:#E2E8F0;color:#0F172A;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">👤 2. ดูหน้าจอแยกเป็นรายบุคคล (${allIndividuals.length} คน)</button>
          </div>

          <div id="hzkSimDeptPane" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
            ${deptCardsHtml}
          </div>

          <div id="hzkSimStaffPane" style="display:none;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;">
            ${staffCardsHtml}
          </div>
        </div>
      </div>
    `;

    simModal.style.display = 'flex';

    const btnDept = document.getElementById('hzkTabDeptViewBtn');
    const btnStaff = document.getElementById('hzkTabStaffViewBtn');
    const paneDept = document.getElementById('hzkSimDeptPane');
    const paneStaff = document.getElementById('hzkSimStaffPane');

    btnDept.onclick = () => {
      paneDept.style.display = 'grid';
      paneStaff.style.display = 'none';
      btnDept.style.background = '#002B49';
      btnDept.style.color = '#FFF';
      btnStaff.style.background = '#E2E8F0';
      btnStaff.style.color = '#0F172A';
    };

    btnStaff.onclick = () => {
      paneDept.style.display = 'none';
      paneStaff.style.display = 'grid';
      btnStaff.style.background = '#1E1B4B';
      btnStaff.style.color = '#FFF';
      btnDept.style.background = '#E2E8F0';
      btnDept.style.color = '#0F172A';
    };

    simModal.querySelectorAll('.hzk-launch-dept-sim-btn').forEach(btn => {
      btn.onclick = function () {
        const profile = DEPT_VIEW_PROFILES[Number(btn.getAttribute('data-sim-idx'))];
        simModal.style.display = 'none';
        showDepartmentSimulationBanner(profile, null);
        profile.launchWorkspace();
      };
    });

    simModal.querySelectorAll('.hzk-launch-staff-sim-btn').forEach(btn => {
      btn.onclick = function () {
        const staff = allIndividuals[Number(btn.getAttribute('data-staff-idx'))];
        simModal.style.display = 'none';
        applyGlobalAppRoleMode(staff.isTech ? 'TECH' : 'MANAGER');
        showDepartmentSimulationBanner(null, staff);
        openIndividualStaffWorkspaceDrawer(staff);
      };
    });
  }

  // Also inject a quick launcher button inside existing Admin Studio modal whenever opened
  function hookAdminStudioInspectorButton() {
    const observer = new MutationObserver(() => {
      const studioBtns = Array.from(document.querySelectorAll('button, h2, h3')).filter(el =>
        /Admin Studio|สิทธิ์แผนก|RBAC/i.test(el.textContent || '')
      );
      studioBtns.forEach(el => {
        const container = el.closest('[id*="Modal"], [class*="modal"], .modal-content') || el.parentElement;
        if (container && !container.querySelector('#hzkInjectedStudioSimBtn')) {
          const simBtn = document.createElement('button');
          simBtn.id = 'hzkInjectedStudioSimBtn';
          simBtn.type = 'button';
          simBtn.innerHTML = '🎭 จำลองดูหน้าจอจริงแยกแผนก & รายบุคคล (Live Inspector)';
          simBtn.style.cssText =
            'background:linear-gradient(135deg,#0284C7,#1E1B4B);color:#FFF;border:1px solid #7DD3FC;' +
            'border-radius:8px;padding:7px 12px;font-weight:700;font-size:12px;cursor:pointer;margin:6px;';
          simBtn.onclick = openDepartmentLiveSimulatorModal;
          if (el.parentElement) el.parentElement.appendChild(simBtn);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

});
  }

  window.openDepartmentRoleSopModal = openDepartmentRoleSopModal;

  async function openSerial360TimelineModal(prefillSn) {
    let sModal = document.getElementById('hzkSerial360Modal');
    if (!sModal) {
      sModal = document.createElement('div');
      sModal.id = 'hzkSerial360Modal';
      sModal.style.cssText =
        'position:fixed;inset:0;z-index:20040;background:rgba(15,23,42,0.82);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(sModal);
    }

    sModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:960px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">SERIAL NUMBER 360° LIFECYCLE &amp; FIELD PHOTO GALLERY</div>
            <div style="font-size:16px;font-weight:700;">🔎 ตรวจสอบประวัติเครื่องรายตัว (S/N 360° Timeline &amp; รูปหน้างาน)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkSerial360Modal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#0F172A;">
          <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
            <input id="hzkSn360Input" type="text" value="${prefillSn || ''}" placeholder="พิมพ์หมายเลขเครื่อง Serial No. เช่น K01234J, L05678M..." style="flex:1;min-width:220px;padding:9px 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-weight:700;" />
            <button type="button" id="hzkSn360SearchBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;">🔎 ค้นหาประวัติ 360°</button>
          </div>
          <div id="hzkSn360ResultBody" style="color:#64748B;">กรอกหมายเลข Serial Number แล้วกดค้นหาเพื่อดูประวัติตั้งแต่คลังสินค้า ติดตั้ง ดีลเลอร์ ซ่อมบำรุง และรูปภาพหน้างานครับ</div>
        </div>
      </div>
    `;
    sModal.style.display = 'flex';

    async function runSearchSn() {
      const sn = document.getElementById('hzkSn360Input').value.trim().toUpperCase();
      if (!sn) return;
      const gasUrl = getGasEndpointUrl();
      const body = document.getElementById('hzkSn360ResultBody');
      if (!gasUrl) {
        body.innerHTML = '<div style="color:#B91C1C;">กรุณาตั้งค่า Google Apps Script URL ก่อนค้นหาครับ</div>';
        return;
      }
      body.innerHTML = '⏳ กำลังรวบรวมข้อมูลประวัติเครื่อง ' + sn + ' จากทุกแผนก...';
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getSerial360Timeline', serialNo: sn })
        });
        const d = await res.json();
        const m = d.master || {};
        const events = d.timeline || [];
        const photos = d.photos || [];

        const timelineHtml = events.map(ev => `
          <div style="border-left:3px solid #0284C7;padding:8px 14px;margin-bottom:10px;background:#F8FAFC;border-radius:0 10px 10px 0;">
            <div style="font-size:10.5px;font-weight:800;color:#0284C7;">${ev.stage} • ${ev.date}</div>
            <div style="font-weight:700;color:#0F172A;margin-top:2px;">${ev.title}</div>
            <div style="font-size:12px;color:#334155;margin-top:2px;">${ev.detail}</div>
            ${ev.link ? `<a href="${ev.link}" target="_blank" style="display:inline-block;margin-top:4px;font-size:11px;color:#059669;font-weight:700;">🔗 เปิดดูเอกสาร/รูปภาพแนบ</a>` : ''}
          </div>
        `).join('') || '<div style="color:#64748B;padding:10px;">ยังไม่มีประวัติการเคลื่อนไหวเพิ่มเติมในระบบ</div>';

        const photosHtml = photos.length
          ? `<div style="margin-top:14px;"><div style="font-weight:700;color:#002B49;margin-bottom:8px;">📸 อัลบั้มรูปภาพหน้างานของเครื่องนี้ (${photos.length} ภาพ):</div>` +
            `<div style="display:flex;gap:8px;flex-wrap:wrap;">` +
            photos.map(p => `<a href="${p.url}" target="_blank" style="background:#EFF6FF;border:1px solid #BFDBFE;padding:8px 12px;border-radius:8px;text-decoration:none;color:#1E40AF;font-size:12px;font-weight:700;">🖼️ ${p.ticketId} (${p.date})</a>`).join('') +
            `</div></div>`
          : '';

        body.innerHTML = `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="font-size:15px;font-weight:800;color:#002B49;">❄️ S/N: ${d.serialNumber} — รุ่น: ${m.model || 'ไม่ระบุ'}</div>
            <div style="font-size:12.5px;color:#1E293B;margin-top:4px;"><b>ลูกค้า / สถานที่ติดตั้ง:</b> ${m.customerStore || '-'} (${m.province || '-'}) | <b>โทร:</b> ${m.customerPhone || '-'}</div>
            <div style="font-size:12.5px;color:#047857;margin-top:2px;"><b>สถานะการรับประกัน:</b> ${m.warrantyStatus || '-'}</div>
            <div style="font-size:12.5px;color:#B45309;margin-top:2px;"><b>ตัวแทนจำหน่ายที่ดูแล:</b> ${m.dealerName || '-'} (${m.dealerContact || '-'} โทร ${m.dealerPhone || '-'})</div>
          </div>
          <div style="font-weight:700;color:#002B49;margin-bottom:8px;">📋 ไทม์ไลน์ประวัติเครื่อง 360°:</div>
          ${timelineHtml}
          ${photosHtml}
        `;
      } catch (err) {
        body.innerHTML = '<div style="color:#B91C1C;">ค้นหาไม่สำเร็จ: ' + err.message + '</div>';
      }
    }

    document.getElementById('hzkSn360SearchBtn').onclick = runSearchSn;
    if (prefillSn) runSearchSn();
  }

  async function openTechnicianVanStockModal() {
    let vModal = document.getElementById('hzkVanStockModal');
    if (!vModal) {
      vModal = document.createElement('div');
      vModal.id = 'hzkVanStockModal';
      vModal.style.cssText =
        'position:fixed;inset:0;z-index:20042;background:rgba(15,23,42,0.82);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(vModal);
    }

    vModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:960px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;">
        <div style="background:#7F1D1D;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
          <div>
            <div style="font-size:11px;color:#FECACA;font-weight:800;">TECHNICIAN VAN STOCK &amp; AUTO STORE REPLENISHMENT</div>
            <div style="font-size:16px;font-weight:700;">🚐 คลังอะไหล่ประจำรถช่างบริการ (T01–T08) &amp; เบิกเติมอัตโนมัติ</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkVanStockModal').style.display='none'" style="background:#0F172A;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:16px 20px;font-size:13px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
            <label style="font-weight:700;">เลือกรถช่าง:</label>
            <select id="hzkVanFilterSel" style="padding:7px 12px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
              <option value="ALL">รถช่างทั้งหมด (T01 – T08)</option>
              <option value="T01">T01 (Bangkok North)</option>
              <option value="T02">T02 (Bangkok South)</option>
              <option value="T03">T03 (Bangkok East)</option>
              <option value="T04">T04 (Nonthaburi)</option>
              <option value="T05">T05 (Samut Prakan)</option>
              <option value="T06">T06 (Ayutthaya)</option>
              <option value="T07">T07 (Upcountry)</option>
              <option value="T08">T08 (Install &amp; PM)</option>
            </select>
            <button type="button" id="hzkVanRefreshBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">🔄 รีเฟรชสต็อก</button>
          </div>
          <div id="hzkVanTableWrap">⏳ กำลังโหลดข้อมูลสต็อกรถช่าง...</div>
        </div>
      </div>
    `;
    vModal.style.display = 'flex';

    async function loadVanRows() {
      const wrap = document.getElementById('hzkVanTableWrap');
      const gasUrl = getGasEndpointUrl();
      if (!gasUrl) {
        wrap.innerHTML = '<div style="color:#B91C1C;">กรุณาตั้งค่า Google Apps Script URL ก่อนใช้งานครับ</div>';
        return;
      }
      const vanCode = document.getElementById('hzkVanFilterSel').value;
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getVanStock', vanCode: vanCode })
      });
      const data = await res.json();
      const items = (data && data.items) || [];
      wrap.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;min-width:740px;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#0F172A;color:#FFF;">
                <th style="padding:8px;">รถช่าง</th>
                <th style="padding:8px;">รหัสอะไหล่</th>
                <th style="padding:8px;text-align:left;">ชื่ออะไหล่</th>
                <th style="padding:8px;">คงเหลือ</th>
                <th style="padding:8px;">ขั้นต่ำ</th>
                <th style="padding:8px;">เบิกใช้หน้างาน / เติมเข้าคลังรถ</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => {
                const isLow = it.qty < it.minQty;
                return `
                  <tr style="background:${isLow ? '#FEF2F2' : '#FFF'};">
                    <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;">${it.vanCode}</td>
                    <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${it.partCode}</td>
                    <td style="padding:7px;border:1px solid #CBD5E1;">${it.partName}</td>
                    <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:800;color:${isLow ? '#DC2626' : '#059669'};">${it.qty}</td>
                    <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${it.minQty}</td>
                    <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">
                      <button type="button" data-van="${it.vanCode}" data-part="${it.partCode}" data-delta="-1" class="hzk-van-adj-btn" style="background:#DC2626;color:#FFF;border:none;border-radius:6px;padding:4px 9px;font-weight:700;cursor:pointer;margin-right:4px;">-1 เบิกใช้</button>
                      <button type="button" data-van="${it.vanCode}" data-part="${it.partCode}" data-delta="1" class="hzk-van-adj-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:4px 9px;font-weight:700;cursor:pointer;">+1 เติมสต็อก</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('.hzk-van-adj-btn').forEach(btn => {
        btn.onclick = async function () {
          const r = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'adjustVanStock',
              vanCode: btn.getAttribute('data-van'),
              partCode: btn.getAttribute('data-part'),
              delta: Number(btn.getAttribute('data-delta'))
            })
          });
          const resAdj = await r.json();
          if (resAdj && resAdj.lowStockAlert) {
            alert('⚠️ อะไหล่เหลือน้อยกว่าเกณฑ์ขั้นต่ำ! ระบบส่งใบขอเบิกเติมเข้ากลุ่ม LINE สโตร์เรียบร้อยแล้วครับ');
          }
          loadVanRows();
        };
      });
    }

    document.getElementById('hzkVanRefreshBtn').onclick = loadVanRows;
    document.getElementById('hzkVanFilterSel').onchange = loadVanRows;
    loadVanRows();
  }

  async function openServiceDispatchCalendarModal() {
    let dModal = document.getElementById('hzkDispatchCalendarModal');
    if (!dModal) {
      dModal = document.createElement('div');
      dModal.id = 'hzkDispatchCalendarModal';
      dModal.style.cssText =
        'position:fixed;inset:0;z-index:20044;background:rgba(15,23,42,0.82);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(dModal);
    }

    const today = new Date().toISOString().slice(0, 10);
    dModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:960px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">INSTALLATION &amp; FIELD SERVICE DISPATCH BOARD</div>
            <div style="font-size:16px;font-weight:700;">📅 ตารางนัดหมายติดตั้ง &amp; จ่ายคิวงานช่าง (T01–T08)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDispatchCalendarModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:16px 20px;font-size:13px;">
          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;padding:12px;margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">
            <input id="hzkDspDate" type="date" value="${today}" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
            <select id="hzkDspSlot" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;">
              <option value="09:00 - 12:00">09:00 - 12:00 (เช้า)</option>
              <option value="13:00 - 16:30">13:00 - 16:30 (บ่าย)</option>
              <option value="ทั้งวัน (09:00 - 17:00)">ทั้งวัน (09:00 - 17:00)</option>
            </select>
            <select id="hzkDspVan" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
              <option value="T01">ช่าง T01</option><option value="T02">ช่าง T02</option><option value="T03">ช่าง T03</option><option value="T04">ช่าง T04</option>
              <option value="T05">ช่าง T05</option><option value="T06">ช่าง T06</option><option value="T07">ช่าง T07</option><option value="T08">ช่าง T08 (Install)</option>
            </select>
            <select id="hzkDspType" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;">
              <option value="New Installation (ติดตั้งใหม่)">🛠️ ติดตั้งเครื่องใหม่</option>
              <option value="Repair Service (ซ่อมบำรุง)">🔧 ซ่อมบำรุงหน้างาน</option>
              <option value="PM Contract (ล้างประจำปี)">✨ บำรุงรักษา PM</option>
              <option value="Site Survey (สำรวจหน้างาน)">📐 สำรวจหน้างาน</option>
            </select>
            <input id="hzkDspCust" type="text" placeholder="ชื่อร้าน / ลูกค้า" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
            <input id="hzkDspModel" type="text" placeholder="รุ่น / S/N" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
            <button type="button" id="hzkDspAddBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;">+ ลงตาราง &amp; แจ้ง LINE</button>
          </div>
          <div id="hzkDspTableBody">⏳ กำลังโหลดตารางงานช่าง...</div>
        </div>
      </div>
    `;
    dModal.style.display = 'flex';

    const gasUrl = getGasEndpointUrl();
    async function loadSlots() {
      const wrap = document.getElementById('hzkDspTableBody');
      if (!gasUrl) return;
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getDispatchSchedule' })
      });
      const data = await res.json();
      const rows = (data && data.items) || [];
      wrap.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#0F172A;color:#FFF;"><th style="padding:7px;">วันที่</th><th style="padding:7px;">ช่วงเวลา</th><th style="padding:7px;">ช่าง</th><th style="padding:7px;">ประเภทงาน</th><th style="padding:7px;text-align:left;">ลูกค้า</th><th style="padding:7px;">รุ่น / S/N</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr><td style="padding:7px;border:1px solid #CBD5E1;">${r.date}</td><td style="padding:7px;border:1px solid #CBD5E1;">${r.timeSlot}</td><td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;text-align:center;">${r.vanCode}</td><td style="padding:7px;border:1px solid #CBD5E1;">${r.jobType}</td><td style="padding:7px;border:1px solid #CBD5E1;">${r.customer}</td><td style="padding:7px;border:1px solid #CBD5E1;">${r.modelSn}</td></tr>`).join('') || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#64748B;">ยังไม่มีคิวงานในตาราง</td></tr>'}
          </tbody>
        </table>
      `;
    }

    document.getElementById('hzkDspAddBtn').onclick = async function () {
      if (!gasUrl) return;
      await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'createDispatchSlot',
          date: document.getElementById('hzkDspDate').value,
          timeSlot: document.getElementById('hzkDspSlot').value,
          vanCode: document.getElementById('hzkDspVan').value,
          jobType: document.getElementById('hzkDspType').value,
          customer: document.getElementById('hzkDspCust').value,
          modelSn: document.getElementById('hzkDspModel').value
        })
      });
      alert('✅ ลงตารางนัดหมายและแจ้งเตือนเข้ากลุ่ม LINE เรียบร้อยแล้ว');
      loadSlots();
    };
    loadSlots();
  }

  async function openMonthlyIncentiveKpiModal() {
    let kModal = document.getElementById('hzkMonthlyIncentiveModal');
    if (!kModal) {
      kModal = document.createElement('div');
      kModal.id = 'hzkMonthlyIncentiveModal';
      kModal.style.cssText =
        'position:fixed;inset:0;z-index:20046;background:rgba(15,23,42,0.82);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(kModal);
    }

    kModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:920px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#FBBF24;font-weight:800;">SALES &amp; TECHNICIAN PERFORMANCE / INCENTIVE TRACKER</div>
            <div style="font-size:16px;font-weight:700;">🏆 สรุปผลงานปิดการขาย (PO Approved) &amp; ปิดงานช่างรายบุคคล</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkMonthlyIncentiveModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div id="hzkIncentiveBody" style="padding:18px 20px;font-size:13px;">⏳ กำลังคำนวณผลงานรายบุคคล...</div>
      </div>
    `;
    kModal.style.display = 'flex';

    const gasUrl = getGasEndpointUrl();
    const body = document.getElementById('hzkIncentiveBody');
    if (!gasUrl) return;
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getMonthlyIncentiveKpi' })
    });
    const d = await res.json();
    const sList = (d && d.salesRanking) || [];
    const tList = (d && d.techRanking) || [];

    body.innerHTML = `
      <h4 style="margin:0 0 8px;color:#002B49;">💼 ผลงานฝ่ายขาย &amp; Japanese Corporate (Quoted vs PO Approved)</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
        <thead><tr style="background:#002B49;color:#FFF;"><th style="padding:7px;text-align:left;">รหัสพนักงาน</th><th style="padding:7px;">ใบเสนอราคา (ฉบับ)</th><th style="padding:7px;text-align:right;">ยอดเสนอรวม</th><th style="padding:7px;">ปิดการขาย (PO)</th><th style="padding:7px;text-align:right;">ยอดปิดการขายจริง</th></tr></thead>
        <tbody>
          ${sList.map(s => `<tr><td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${s.code}</td><td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${s.quotedCount}</td><td style="padding:7px;border:1px solid #CBD5E1;text-align:right;">${Number(s.quotedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;color:#059669;">${s.wonCount}</td><td style="padding:7px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:#059669;">${Number(s.wonAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>`).join('') || '<tr><td colspan="5" style="padding:10px;text-align:center;color:#64748B;">ยังไม่มีข้อมูลยอดขาย</td></tr>'}
        </tbody>
      </table>
      <h4 style="margin:0 0 8px;color:#7F1D1D;">🛠️ ผลงานฝ่ายบริการ &amp; ช่างภาคสนาม</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#7F1D1D;color:#FFF;"><th style="padding:7px;text-align:left;">ช่างบริการ</th><th style="padding:7px;">ใบงานทั้งหมด</th><th style="padding:7px;">ปิดงานสำเร็จ</th></tr></thead>
        <tbody>
          ${tList.map(t => `<tr><td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${t.tech}</td><td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${t.totalJobs}</td><td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;color:#059669;">${t.completedJobs}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:10px;text-align:center;color:#64748B;">ยังไม่มีข้อมูลใบงานซ่อม</td></tr>'}
        </tbody>
      </table>
    `;
  }

  window.openDepartmentLiveSimulatorModal = openDepartmentLiveSimulatorModal;
  window.openSerial360TimelineModal = openSerial360TimelineModal;
  window.openTechnicianVanStockModal = openTechnicianVanStockModal;
  window.openServiceDispatchCalendarModal = openServiceDispatchCalendarModal;
  window.openMonthlyIncentiveKpiModal = openMonthlyIncentiveKpiModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dockOmniBridgeButtons);
  } else {
    dockOmniBridgeButtons();
    hookAdminStudioInspectorButton();
  }
})();
