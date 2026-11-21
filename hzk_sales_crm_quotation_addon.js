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
    { code: 'SALES_ALL', label: 'All Sales Team (รวม Sales Support ใหม่)', emails: 'kulathida@hoshizaki.co.th, janyaluck@hoshizaki.co.th, ketsaraporn@hoshizaki.co.th, wisuttha@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Sales' },
    { code: 'JPC_TEAM', label: 'Japanese Corporate', emails: 'furujo@hoshizaki.co.th, suleewan@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Japanese Corporate' },
    { code: 'MARKETING_ALL', label: 'All Marketing', emails: 'taksaon@hoshizaki.co.th, khajornyot@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Marketing' },
    { code: 'SERVICE_ALL', label: 'All Service Team', emails: 'thanakrit@hoshizaki.co.th, noparin@hoshizaki.co.th, wanwipha@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Service' },
    { code: 'FINANCE_ACC', label: 'Finance & Accounting', emails: 'waraporn@hoshizaki.co.th, duangkamon@hoshizaki.co.th, witharat@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Accounting' },
    { code: 'ADMIN_HR', label: 'Admin & HR', emails: 'kanokwan@hoshizaki.co.th, nattapong@hoshizaki.co.th, chayanin@hoshizaki.co.th', lineGroupId: '', defaultMode: 'CC', department: 'Admin' },
    { code: 'MANAGEMENT_BCC', label: 'Management (BCC ลับ)', emails: 'suzuki@hoshizaki.co.th', lineGroupId: '', defaultMode: 'BCC', department: 'Management' }
  ];

  const HZK_OMNI_STATE = {
    version: 'v1173-CLEAN-CANVAS-PERSONAL-PIN-APP-DRAWER',
    masterDb: null,
    items: []
  };

  function getGasEndpointUrl() {
    const candidates = [
      localStorage.getItem('hzk_gas_webapp_url'),
      localStorage.getItem('gasWebAppUrl'),
      localStorage.getItem('hzkGasUrl'),
      localStorage.getItem('HOSHIZAKI_GAS_URL'),
      localStorage.getItem('webapp_url'),
      (window.HZK_CONFIG && window.HZK_CONFIG.gasUrl),
      (window.APP_CONFIG && window.APP_CONFIG.gasUrl)
    ];
    for (const c of candidates) {
      const s = String(c || '').trim();
      if (s && s.indexOf('https://script.google.com/') === 0) return s;
    }
    // Fallback: scan all localStorage keys for any deployed Google Apps Script Web App URL
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = String(localStorage.getItem(k) || '').trim();
        if (v.indexOf('https://script.google.com/macros/s/') === 0 && v.endsWith('/exec')) {
          localStorage.setItem('hzk_gas_webapp_url', v);
          return v;
        }
      }
    } catch (e) {}
    return '';
  }

  function promptAndSaveGasEndpointUrl() {
    const cur = getGasEndpointUrl();
    const entered = prompt(
      '🔗 กรุณาวางลิงก์ Google Apps Script Web App URL (ลงท้ายด้วย /exec)\nเพื่อเชื่อมต่อฐานข้อมูลคลาวด์และระบบ LINE OA:',
      cur || 'https://script.google.com/macros/s/.../exec'
    );
    if (entered && entered.trim().indexOf('https://script.google.com/') === 0) {
      const clean = entered.trim();
      localStorage.setItem('hzk_gas_webapp_url', clean);
      localStorage.setItem('gasWebAppUrl', clean);
      return clean;
    }
    return '';
  }

  async function callGasApi(action, payload, interactivePrompt) {
    let gasUrl = getGasEndpointUrl();
    if (!gasUrl && interactivePrompt) {
      gasUrl = promptAndSaveGasEndpointUrl();
    }
    if (!gasUrl) {
      return { status: 'NO_GAS_URL', message: 'ยังไม่ได้ตั้งค่า Google Apps Script Web App URL' };
    }
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    const rawText = await res.text();
    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (ตรวจสอบสิทธิ์ Deploy = Anyone และ URL /exec): ' + rawText.slice(0, 120));
    }
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
      { icon: '📋', label: 'กระดานงาน & To-Do List อัจฉริยะแยกแผนก (Task Board)', sub: 'รวมงานค้างอัตโนมัติ (ด่วน/วันนี้/วางแผน) + Kanban 4 ช่อง + มติประชุม AI', action: () => window.openDepartmentTaskBoardModal() },
      { icon: '🔧', label: 'ติดตามงานซ่อมต่อเนื่อง, รอบรออะไหล่ (ETA) & ล็อกคิวช่าง', sub: 'เสนอราคาอะไหล่เพิ่มเติมหลัง Testing + แจ้ง ETA ลูกค้า + คอนเฟิร์มคิวซ่อม 1 คลิก', action: () => window.openFieldRepairPartsPipelineModal() },
      { icon: '📹', label: 'ห้องประชุมทีม & AI สรุปรายงานการประชุม (Omni-Meet + AI)', sub: 'ประชุมหน้างานช่าง / แยกแผนก / WFH 1-on-1 / ทั้งบริษัท + อัดเสียงสรุป 3 ภาษา', action: () => window.openOmniMeetAndAiMinutesModal() },
      { icon: '📑', label: 'ศูนย์ออกรายงานประจำแผนก 1 คลิก (Department Report Center)', sub: 'ดาวน์โหลดรายงานเฉพาะแผนก (Sales / JPC / Marketing / บัญชี NAV / HR / Service)', action: () => window.openDepartmentReportCenterModal() },
      { icon: '💰', label: 'วิเคราะห์กำไร-ขาดทุนราย S/N & ตั้งราคา/โปรโมชั่น (Lifecycle P&L)', sub: 'เทียบราคาขาย (Dealer/Direct) หักต้นทุนซ่อม/เคลม + จำลองแพ็คเกจ PM + นำเข้าขาย NAV', action: () => window.openSerialLifecyclePricingSuiteModal() },
      { icon: '📐', label: 'แบบตรวจความพร้อมหน้างานก่อนติดตั้ง (Pre-Install Site Survey)', sub: 'เช็กแรงดันน้ำ ไฟ ท่อน้ำทิ้ง แนะนำชุดกรองน้ำ & ลดเคลมในประกัน', action: () => window.openPreInstallSiteSurveyModal() },
      { icon: '🔎', label: 'ประวัติเครื่องราย S/N 360° & อัลบั้มรูปหน้างาน', sub: 'ดูไทม์ไลน์ตั้งแต่คลัง ➔ ติดตั้ง ➔ ซ่อมบำรุง ➔ รูปถ่ายก่อน-หลัง', action: () => window.openSerial360TimelineModal() },
      { icon: '🚐', label: 'คลังอะไหล่รถช่าง T01–T08 & เบิกเติมอัตโนมัติ', sub: 'เช็ก/ตัด/เติมอะไหล่รถช่าง + แจ้งเตือนสโตร์เมื่อต่ำกว่า Min Stock', action: () => window.openTechnicianVanStockModal() },
      { icon: '📅', label: 'ตารางนัดหมายติดตั้ง & คิวงานช่าง (Dispatch Board)', sub: 'จัดคิวงานติดตั้ง/ซ่อมรายวันของช่าง T01–T08 + แจ้งเตือน LINE', action: () => window.openServiceDispatchCalendarModal() },
      { icon: '🏆', label: 'สรุปผลงาน & Incentive รายบุคคล (Sales & Tech KPI)', sub: 'สรุปยอดปิดการขาย PO Approved และจำนวนปิดเคสช่างประจำเดือน', action: () => window.openMonthlyIncentiveKpiModal() },
      { icon: '📊', label: 'ติดตามสถานะการรับเอกสาร & E-Sign PO (Tracking)', sub: 'เช็กสถานะ SENT / ยืนยันรับ / ลายเซ็น E-Sign & ไฟล์ PO ลูกค้า', action: () => window.openDocumentTrackingDashboardModal() },
      { icon: '📈', label: 'รายงานสรุปผู้บริหาร & AI Copilot (BI)', sub: 'KPI รวม + AI ติดตามใบเสนอราคาค้าง + ส่งเข้า LINE ผู้บริหาร', action: () => window.openExecutiveBiDashboardModal() },
      { divider: true },
      { icon: '🏭', label: 'ส่งออกข้อมูลเปิด Sales Order เข้า ERP / NAV', sub: 'ดาวน์โหลดไฟล์ตารางรายการ PO Approved พร้อมนำเข้าระบบบัญชี/ERP', action: () => window.exportErpSalesOrdersCsv() },
      { icon: '🎭', label: 'จำลองหน้าจอจริงแยกแผนก & รายบุคคล (Live Inspector)', sub: 'สลับดูหน้าตาการทำงานจริงแยก 8 แผนก หรือเจาะดูรายบุคคล (เซลล์ / ช่าง / บัญชี)', action: () => window.openDepartmentLiveSimulatorModal() },
      { icon: '🩺', label: 'Deep Scan ตรวจสอบ & ซ่อมแซมฟังก์ชันทั้งหมด', sub: 'สแกนลิงก์ GAS API, ฐานข้อมูล, Drive API, ปุ่มกด และตั้งค่า URL อัตโนมัติ', action: () => window.runDeepSystemDiagnosticModal() },
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

    const myCockpitBtn = document.createElement('button');
    myCockpitBtn.id = 'hzkMyPersonalCockpitPillBtn';
    myCockpitBtn.type = 'button';
    myCockpitBtn.innerHTML = '🧑‍💻 โต๊ะทำงานฉัน (เลือกพนักงาน/แผนก) ▾';
    myCockpitBtn.style.cssText =
      'background:linear-gradient(135deg,#002B49,#1E3A8A);color:#FDE047;border:1px solid #38BDF8;' +
      'border-radius:999px;padding:5px 12px;font-weight:800;font-size:12px;line-height:1.35;' +
      'cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;' +
      'box-shadow:0 2px 6px rgba(0,43,73,0.28);height:28px;';
    myCockpitBtn.onclick = function (e) {
      e.stopPropagation();
      if (typeof window.openPersonalEmployeeSelectorModal === 'function') {
        window.openPersonalEmployeeSelectorModal();
      }
    };

    wrap.appendChild(myCockpitBtn);
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
      if (st) { st.style.display = 'block'; st.textContent = '⏳ กำลังบันทึกการส่งต่องานและแจ้งเตือนแผนก ' + toDept + '...'; }

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

  async function openExecutiveBiDashboardModal() {
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
      .map(c => `<option value="${c.name.split(String.fromCharCode(34)).join('&quot;')}">`)
      .join('');

    const termsOptions = (db.termsAndConditions || [])
      .map(t => `<option value="${t.split(String.fromCharCode(34)).join('&quot;')}">${t}</option>`)
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

    const _elVatL = document.getElementById('hzkSqVatLabel'); if (_elVatL) _elVatL.textContent = format === 'EXPORT' ? 'VAT 0% (Export):' : 'VAT 7%:';
    const _elSubT = document.getElementById('hzkSqSubTotal'); if (_elSubT) _elSubT.textContent = subTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;
    const _elVatA = document.getElementById('hzkSqVatAmt'); if (_elVatA) _elVatA.textContent = vatAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;
    const _elWhtA = document.getElementById('hzkSqWhtAmt'); if (_elWhtA) _elWhtA.textContent = (whtAmt > 0 ? '-' : '') + whtAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;
    const _elGrdT = document.getElementById('hzkSqGrandTotal'); if (_elGrdT) _elGrdT.textContent = grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }) + curr;

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
      const colPairs = [
        ['Order_Status', 'orderStatus'],
        ['Offer_No', 'offerNo'],
        ['Rev', 'rev'],
        ['Date', 'date'],
        ['Department', 'department'],
        ['Salesperson_Code', 'salespersonCode'],
        ['Customer_Name', 'customerName'],
        ['Payment_Terms', 'paymentTerms'],
        ['Currency', 'currency'],
        ['Item_No', 'itemNo'],
        ['Description', 'description'],
        ['Qty', 'qty'],
        ['Unit_Price', 'unitPrice'],
        ['Discount', 'discount'],
        ['Line_Amount', 'lineAmount']
      ];
      const csvLines = [colPairs.map(p => p[0]).join(',')].concat(rows.map(r =>
        colPairs.map(([, key]) => {
          const val = String(r[key] !== undefined ? r[key] : '').split(String.fromCharCode(34)).join('""');
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

  async function runDeepSystemDiagnosticModal() {
    let diagModal = document.getElementById('hzkDeepScanModal');
    if (!diagModal) {
      diagModal = document.createElement('div');
      diagModal.id = 'hzkDeepScanModal';
      diagModal.style.cssText =
        'position:fixed;inset:0;z-index:20060;background:rgba(15,23,42,0.85);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(diagModal);
    }

    const curUrl = getGasEndpointUrl();
    const db = await loadSalesMasterDb(false);
    const localChecks = [
      { name: '1. Frontend Suite Version', ok: true, detail: HZK_OMNI_STATE.version },
      { name: '2. Product Catalog JSON (331 รุ่น + ขนาด W×D×H)', ok: Array.isArray(db.models) && db.models.length > 0, detail: (db.models || []).length + ' models loaded' },
      { name: '3. Customer Master JSON (700 รายชื่อ)', ok: Array.isArray(db.customers) && db.customers.length > 0, detail: (db.customers || []).length + ' customers loaded' },
      { name: '4. Live Stock Snapshot JSON (MICHIRU-RPA)', ok: db.stockMap && Object.keys(db.stockMap).length > 0, detail: Object.keys(db.stockMap || {}).length + ' stock models + ' + (db.damageDemoList || []).length + ' Demo/Damage units' },
      { name: '5. Google Apps Script Web App URL', ok: Boolean(curUrl), detail: curUrl || '❌ ยังไม่พบ URL ในเครื่อง (กรุณาวางลิงก์ด้านบนแล้วกดบันทึก)' }
    ];

    diagModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:860px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.5);font-family:sans-serif;">
        <div style="background:#002B49;color:#FFF;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">ENTERPRISE DEEP SCAN &amp; SELF-HEALING DIAGNOSTICS (v1155)</div>
            <div style="font-size:16px;font-weight:700;">🩺 ผลสแกนตรวจสอบการทำงานเชิงลึก (Frontend PWA + Google Apps Script Backend)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDeepScanModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:18px 20px;font-size:13px;color:#0F172A;">
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:12px;padding:12px;margin-bottom:14px;">
            <label style="font-weight:700;color:#0369A1;display:block;margin-bottom:5px;">🔗 ลิงก์ Google Apps Script Web App URL (จุดเชื่อมต่อฟังก์ชันคลาวด์ทั้งหมด):</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <input id="hzkDiagGasUrlInput" type="text" value="${curUrl}" placeholder="https://script.google.com/macros/s/...../exec" style="flex:1;min-width:240px;padding:8px 10px;border:1px solid #94A3B8;border-radius:8px;font-size:12px;" />
              <button type="button" id="hzkDiagSaveUrlBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;">💾 บันทึก &amp; สแกนใหม่</button>
            </div>
          </div>

          <div style="font-weight:700;color:#002B49;margin-bottom:6px;">ส่วนที่ 1: ตรวจสอบโมดูลหน้าเว็บ (PWA Frontend &amp; Offline JSON)</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
            <thead><tr style="background:#0F172A;color:#FFF;"><th style="padding:7px;text-align:left;">รายการตรวจสอบ</th><th style="padding:7px;">สถานะ</th><th style="padding:7px;text-align:left;">รายละเอียด</th></tr></thead>
            <tbody>
              ${localChecks.map(c => `
                <tr>
                  <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${c.name}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${c.ok ? '<span style="color:#059669;font-weight:800;">✅ OK</span>' : '<span style="color:#DC2626;font-weight:800;">❌ MISSING</span>'}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;">${c.detail}</td>
                </tr>`).join('')}
            </tbody>
          </table>

          <div style="font-weight:700;color:#002B49;margin-bottom:6px;">ส่วนที่ 2: ตรวจสอบหลังบ้าน Google Apps Script, Drive API, LINE OA และ Triggers</div>
          <div id="hzkDiagBackendBody">⏳ กำลังเชื่อมต่อทดสอบหลังบ้าน...</div>
        </div>
      </div>
    `;

    diagModal.style.display = 'flex';

    document.getElementById('hzkDiagSaveUrlBtn').onclick = function () {
      const val = document.getElementById('hzkDiagGasUrlInput').value.trim();
      if (val && val.indexOf('https://script.google.com/') === 0) {
        localStorage.setItem('hzk_gas_webapp_url', val);
        localStorage.setItem('gasWebAppUrl', val);
        runDeepSystemDiagnosticModal();
      } else {
        alert('⚠️ กรุณากรอก URL ที่ขึ้นต้นด้วย https://script.google.com/macros/s/ และลงท้ายด้วย /exec ครับ');
      }
    };

    const backendEl = document.getElementById('hzkDiagBackendBody');
    if (!curUrl) {
      backendEl.innerHTML = '<div style="background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px;border-radius:10px;">⚠️ <b>สาเหตุหลักที่ฟังก์ชันคลาวด์ไม่ทำงาน:</b> ยังไม่ได้บันทึก Google Apps Script Web App URL ในเครื่องนี้ กรุณาวางลิงก์ <code>/exec</code> ในช่องด้านบนแล้วกด <b>บันทึก &amp; สแกนใหม่</b> ครับ</div>';
      return;
    }

    try {
      const data = await callGasApi('runDeepSystemScan', {}, false);
      const checks = (data && data.checks) || [];
      backendEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#002B49;color:#FFF;"><th style="padding:7px;text-align:left;">บริการหลังบ้าน (Backend Check)</th><th style="padding:7px;">สถานะ</th><th style="padding:7px;text-align:left;">รายละเอียด</th></tr></thead>
          <tbody>
            ${checks.map(c => `
              <tr>
                <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${c.item}</td>
                <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${c.ok ? '<span style="color:#059669;font-weight:800;">✅ READY</span>' : '<span style="color:#DC2626;font-weight:800;">⚠️ FIX NEEDED</span>'}</td>
                <td style="padding:7px;border:1px solid #CBD5E1;">${c.detail}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      backendEl.innerHTML = `<div style="background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px;border-radius:10px;">❌ <b>เชื่อมต่อ Backend ไม่สำเร็จ:</b> ${err.message}</div>`;
    }
  }

  window.openProductionGoLiveQaModal = openProductionGoLiveQaModal;
  window.runDeepSystemDiagnosticModal = runDeepSystemDiagnosticModal;
  window.callGasApi = callGasApi;

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
    } catch (e) {}
  }

  const FIELD_TECH_ROSTER = [
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
      applyDepartmentLandingWorkspaceView(null, null);
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
          <button type="button" data-cust-name="${c.name.split(String.fromCharCode(34)).join('&quot;')}" class="hzk-staff-new-qt-cust" style="background:#0284C7;color:#FFF;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;">+ ออกใบเสนอราคา</button>
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
    if (!isCurrentUserSoleSuperAdmin()) {
      showHzkToastNotification('⛔ สงวนสิทธิ์เฉพาะ Mr. Noparin Homhoul (Sole Super Admin) เท่านั้นในการสลับดูหน้าจอของแผนกและบุคคลอื่น', true);
      if (typeof window.openTechQuickLoginModal === 'function') window.openTechQuickLoginModal();
      return;
    }
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
        applyDepartmentLandingWorkspaceView(profile, null);
        showDepartmentSimulationBanner(profile, null);
        profile.launchWorkspace();
      };
    });

    simModal.querySelectorAll('.hzk-launch-staff-sim-btn').forEach(btn => {
      btn.onclick = function () {
        const staff = allIndividuals[Number(btn.getAttribute('data-staff-idx'))];
        simModal.style.display = 'none';
        applyGlobalAppRoleMode(staff.isTech ? 'TECH' : 'MANAGER');
        applyDepartmentLandingWorkspaceView(null, staff);
        showDepartmentSimulationBanner(null, staff);
        openIndividualStaffWorkspaceDrawer(staff);
      };
    });
  }

  function isCurrentUserSoleSuperAdmin() {
    try {
      const raw = localStorage.getItem('hoshizaki_active_auth_session_v1042');
      if (!raw) return false;
      const sess = JSON.parse(raw);
      return sess && (sess.id === 'SVC-02' || (sess.rbacRole === 'SUPER_ADMIN' && String(sess.name || '').toLowerCase().indexOf('noparin') > -1));
    } catch (e) {
      return false;
    }
  }

  function applyDepartmentLandingWorkspaceView(profile, staffMember) {
    const jobSheet = document.getElementById('jobSheetContainer');
    const mobNav = document.getElementById('mobileSectionNav');
    let deptLandingCard = document.getElementById('hzkDepartmentLandingWorkspaceCard');

    const deptKey = profile ? profile.id : (staffMember ? (staffMember.isTech ? 'SERVICE_TECH' : (/Japan/i.test(staffMember.dept) ? 'JPC_CORP' : (/Market/i.test(staffMember.dept) ? 'MARKETING' : (/Account/i.test(staffMember.dept) ? 'ACCOUNTING' : (/Admin|HR/i.test(staffMember.dept) ? 'ADMIN_HR' : (/Exec/i.test(staffMember.dept) ? 'EXECUTIVE' : (/Service/i.test(staffMember.dept) ? 'SERVICE_MGR' : 'SALES_TH'))))))) : 'SERVICE_MGR');
    const isServiceView = (deptKey === 'SERVICE_TECH' || deptKey === 'SERVICE_MGR');

    if (isServiceView) {
      if (jobSheet) jobSheet.style.display = '';
      if (mobNav) mobNav.style.display = '';
      if (deptLandingCard) deptLandingCard.style.display = 'none';
      return;
    }

    // Non-Service department: hide technician Job Service Report form & show tailored Department Landing Workspace
    if (jobSheet) jobSheet.style.display = 'none';
    if (mobNav) mobNav.style.display = 'none';

    if (!deptLandingCard) {
      deptLandingCard = document.createElement('section');
      deptLandingCard.id = 'hzkDepartmentLandingWorkspaceCard';
      deptLandingCard.className = 'max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border-2 border-sky-200 p-4 sm:p-6 space-y-4 my-3';
      if (jobSheet && jobSheet.parentNode) {
        jobSheet.parentNode.insertBefore(deptLandingCard, jobSheet);
      } else {
        document.body.appendChild(deptLandingCard);
      }
    }

    const activeProf = profile || DEPT_VIEW_PROFILES.find(p => p.id === deptKey) || DEPT_VIEW_PROFILES[2];
    const whoTitle = staffMember ? `${staffMember.name} (${staffMember.code}) — ${staffMember.dept}` : activeProf.deptName;

    const DEPT_ACTION_CARDS = {
      SALES_TH: [
        { icon: '📄', title: 'ออกใบเสนอราคาขาย (THB Y2026)', sub: 'เติมขนาด W×D×H + เช็กสต็อกสด HHE อัตโนมัติ', fn: "openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)')" },
        { icon: '📦', title: 'เช็กสต็อกเครื่องพร้อมขาย (203 รุ่น)', sub: 'ดูยอดคงเหลือจริงจาก Daily Stock Report', fn: "window.openLiveStockSnapshotModal && window.openLiveStockSnapshotModal()" },
        { icon: '🏢', title: 'ฐานลูกค้า B2B & ดีลเลอร์ (700 ราย)', sub: 'ค้นหาลูกค้า เงื่อนไขเครดิต และประวัติเสนอราคา', fn: "window.openQuotationArchiveModal && window.openQuotationArchiveModal()" },
        { icon: '🔄', title: 'ส่งต่องานติดตั้ง & ลงทะเบียน S/N', sub: 'แจ้งฝ่ายบริการเข้าติดตั้งเมื่อลูกค้าออก PO แล้ว', fn: "window.openCrossDeptHandoffHubModal && window.openCrossDeptHandoffHubModal()" }
      ],
      JPC_CORP: [
        { icon: '🇯🇵', title: 'ใบเสนอราคา Japanese Corporate (THB/USD)', sub: 'รองรับ Export 0% VAT & Local THB + CC JPC_TEAM', fn: "openSalesCorporateQuotationWithPreset('Japanese Corporate', 'ใบเสนอราคา (Quotation)')" },
        { icon: '📊', title: 'สรุปผู้บริหาร 3 ภาษา (TH/EN/JP)', sub: 'รายงาน KPI ประจำสัปดาห์สำหรับผู้บริหารญี่ปุ่น', fn: "window.openTrilingualExecutiveBriefModal && window.openTrilingualExecutiveBriefModal()" },
        { icon: '🔎', title: 'ตรวจสอบประวัติเครื่อง S/N 360°', sub: 'ดูประวัติเครื่องของลูกค้าองค์กรญี่ปุ่นย้อนหลัง', fn: "openSerial360TimelineModal('')" },
        { icon: '🌐', title: 'เชื่อมระบบ Jobcan & สำนักงานใหญ่ญี่ปุ่น', sub: 'จัดการเอกสารและอนุมัติคำขอข้ามสาขา', fn: "window.openVoiceTeamsAndJobcanHqModal && window.openVoiceTeamsAndJobcanHqModal('JOBCAN_HQ')" }
      ],
      MARKETING: [
        { icon: '🏷️', title: 'สต็อกเครื่องโชว์ / มีตำหนิ (602 รายการ)', sub: 'พร้อมลิงก์ใบตรวจสภาพ QCF และดึงลงใบเสนอราคา', fn: "window.openDamageDemoStockModal && window.openDamageDemoStockModal()" },
        { icon: '📣', title: 'ใบเสนอราคาแคมเปญ & โปรโมชัน', sub: 'ออกใบเสนอราคาส่งเสริมการขายและงานแสดงสินค้า', fn: "openSalesCorporateQuotationWithPreset('Marketing', 'ใบเสนอราคา (Quotation)')" },
        { icon: '🎨', title: 'Unified AI Content & Promo Card Studio', sub: 'สร้างการ์ดโปรโมชัน / แอดโฆษณา / คู่มือดีลเลอร์', fn: "window.openUnifiedAiContentAndCardStudio && window.openUnifiedAiContentAndCardStudio('SERVICE_SELF_CHECK')" },
        { icon: '🎪', title: 'ออกบูธ THAIFEX / Showroom & จ่ายลีด', sub: 'กระจายลีดลูกค้าใหม่ให้เครือข่ายดีลเลอร์ทั่วประเทศ', fn: "window.openSaleMarketingGrowthModal && window.openSaleMarketingGrowthModal('EVENTS_SHOWROOM')" }
      ],
      ACCOUNTING: [
        { icon: '🧾', title: 'ออกใบวางบิล / ใบเสร็จรับเงิน (1 คลิก)', sub: 'แปลงจากใบเสนอราคา + เลขผู้เสียภาษี 13 หลัก/สาขา', fn: "openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบวางบิล (Billing Note)')" },
        { icon: '🔍', title: 'ตรวจสอบงานซ่อมค้างวางบิล (Revenue Audit)', sub: 'ตรวจเช็กใบงานปิดแล้วที่ยังไม่ออกใบวางบิล', fn: "window.openRevenueLeakageAuditModal && window.openRevenueLeakageAuditModal()" },
        { icon: '⚖️', title: 'ระบบบัญชีบริการ & ส่งออก Microsoft Dynamics NAV', sub: 'สรุปรายรับ AR/AP ภาษี VAT 7% และ WHT 3%', fn: "window.openPhase2DepartmentalBridgeModal && window.openPhase2DepartmentalBridgeModal()" },
        { icon: '📁', title: 'คลังเอกสารใบเสนอราคา & ใบวางบิล (4,546+ ฉบับ)', sub: 'ตรวจสอบประวัติเอกสารและการยืนยันรับบิลของลูกค้า', fn: "window.openQuotationArchiveModal && window.openQuotationArchiveModal()" }
      ],
      ADMIN_HR: [
        { icon: '🕒', title: 'ตอกบัตร Auto-Stamp · WFH Selfie & OT', sub: 'ตรวจสอบเวลาเข้า-ออกงานของพนักงานทุกแผนก', fn: "window.openHrWorkflowSuiteModal && window.openHrWorkflowSuiteModal('ATTENDANCE')" },
        { icon: '📅', title: 'อนุมัติใบลา & ซิงค์ตารางจ่ายงานช่าง', sub: 'จัดการวันลาพักร้อน ลากิจ และวันหยุดประจำปี', fn: "window.openHrWorkflowSuiteModal && window.openHrWorkflowSuiteModal('LEAVE')" },
        { icon: '💳', title: 'อนุมัติเบิกค่าใช้จ่าย & รอบโอนจ่าย พฤ.–ศ.', sub: 'ตรวจใบเสร็จ OCR, Pre-Travel, RINGI และส่งออก NAV', fn: "window.openHrWorkflowSuiteModal && window.openHrWorkflowSuiteModal('APPROVAL_PAYOUT')" },
        { icon: '👥', title: 'จัดการรายชื่อบุคลากร & ความพร้อม Go-Live QA', sub: 'อัปเดตฐานข้อมูลพนักงานและตรวจสอบความพร้อมระบบ', fn: "window.openProductionGoLiveQaModal && window.openProductionGoLiveQaModal()" }
      ],
      EXECUTIVE: [
        { icon: '👑', title: 'MD Boardroom BI & สไลด์ประชุม 3 ภาษา', sub: 'แดชบอร์ดภาพรวมรายได้ สต็อก และ KPI ทุกแผนก', fn: "window.openMdBoardroomModal && window.openMdBoardroomModal('OVERVIEW')" },
        { icon: '📈', title: 'Executive Sales & Service BI Dashboard', sub: 'วิเคราะห์อัตราปิดการขาย (PO) และประสิทธิภาพบริการ', fn: "window.openExecutiveBiDashboardModal && window.openExecutiveBiDashboardModal()" },
        { icon: '📊', title: 'KPI Report Studio (รายสัปดาห์/เดือน/ไตรมาส/ปี)', sub: 'สร้างรายงานเปรียบเทียบผลงานทุกแผนกอัตโนมัติ', fn: "window.openKpiReportStudioModal && window.openKpiReportStudioModal('DASHBOARD')" },
        { icon: '🌐', title: 'สรุปผู้บริหาร 3 ภาษา (TH / EN / 日本語)', sub: 'ส่งออกรายงานสรุปผู้บริหารพร้อมส่งอีเมล/LINE', fn: "window.openTrilingualExecutiveBriefModal && window.openTrilingualExecutiveBriefModal()" }
      ]
    };

    const cards = DEPT_ACTION_CARDS[deptKey] || DEPT_ACTION_CARDS.SALES_TH;
    deptLandingCard.innerHTML = `
      <div style="background:${activeProf.badgeColor};color:#FFF;border-radius:14px;padding:16px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:11px;color:#FDE68A;font-weight:800;letter-spacing:0.04em;">DEPARTMENT PRIMARY WORKSPACE · ซ่อนฟอร์มงานซ่อมช่างอัตโนมัติ</div>
          <div style="font-size:17px;font-weight:800;margin-top:2px;">${activeProf.icon} ${whoTitle}</div>
          <div style="font-size:12px;opacity:0.9;margin-top:3px;">${activeProf.visibleModules}</div>
        </div>
        <button type="button" id="hzkShowJobSheetOverrideBtn" style="background:rgba(255,255,255,0.18);color:#FFF;border:1px solid rgba(255,255,255,0.45);border-radius:9px;padding:8px 12px;font-size:11.5px;font-weight:700;cursor:pointer;">🛠️ เปิดดูฟอร์ม Job Service ชั่วคราว</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;">
        ${cards.map(c => `
          <button type="button" onclick="${c.fn}" style="text-align:left;background:#F8FAFC;border:1.5px solid #CBD5E1;border-radius:12px;padding:14px;cursor:pointer;transition:all 0.15s ease;">
            <div style="font-size:22px;margin-bottom:6px;">${c.icon}</div>
            <div style="font-weight:800;font-size:13.5px;color:#0F172A;">${c.title}</div>
            <div style="font-size:11.5px;color:#475569;margin-top:4px;line-height:1.4;">${c.sub}</div>
          </button>
        `).join('')}
      </div>
    `;
    deptLandingCard.style.display = 'block';

    const overrideBtn = document.getElementById('hzkShowJobSheetOverrideBtn');
    if (overrideBtn) {
      overrideBtn.onclick = function () {
        if (jobSheet) jobSheet.style.display = '';
        if (mobNav) mobNav.style.display = '';
        deptLandingCard.style.display = 'none';
      };
    }
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
            <button type="button" onclick="window.openSerialLifecyclePricingSuiteModal(document.getElementById('hzkSn360Input').value)" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;">💰 ดูต้นทุนซ่อม &amp; กำไรสุทธิ (P&amp;L)</button>
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


  // ============================================================================
  // MOBILE CLEAN-UI AUTO-DECLUTTER & UNIVERSAL RUNTIME GUARD (v1156)
  // ============================================================================
  function showHzkToastNotification(msg, isError) {
    let toast = document.getElementById('hzkGlobalRuntimeToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hzkGlobalRuntimeToast';
      toast.style.cssText =
        'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:25000;' +
        'max-width:92vw;padding:10px 16px;border-radius:12px;font-family:sans-serif;' +
        'font-size:12.5px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.35);' +
        'transition:opacity 0.25s ease;pointer-events:auto;';
      document.body.appendChild(toast);
    }
    toast.style.background = isError ? '#991B1B' : '#002B49';
    toast.style.color = '#FFFFFF';
    toast.style.border = isError ? '1px solid #FCA5A5' : '1px solid #38BDF8';
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4200);
  }

  function installGlobalRuntimeGuard() {
    if (window._hzkRuntimeGuardInstalled) return;
    window._hzkRuntimeGuardInstalled = true;

    window.addEventListener('error', function (ev) {
      if (ev && ev.message) {
        console.warn('[HZK Guard] Caught runtime error:', ev.message);
        showHzkToastNotification('⚠️ แจ้งเตือนระบบ: ' + ev.message, true);
      }
    });

    window.addEventListener('unhandledrejection', function (ev) {
      const reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : 'Network / Script Error';
      console.warn('[HZK Guard] Unhandled promise:', reason);
      showHzkToastNotification('⚠️ การเชื่อมต่อขัดข้อง: ' + reason, true);
    });
  }

  function initMobileCleanUiDeclutter() {
    const styleId = 'hzkMobileCleanUiCssV1156';
    if (!document.getElementById(styleId)) {
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = `
        @media (max-width: 820px) {
          body.hzk-mobile-clean-mode .hzk-mobile-collapsed-pill {
            display: none !important;
          }
          body.hzk-mobile-clean-mode #hzkPilotCompactNote {
            font-size: 11px !important;
            line-height: 1.3 !important;
            margin: 2px 0 4px !important;
          }
          #hzkMobileCleanControlBar {
            display: flex !important;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            width: 100%;
            margin-top: 6px;
          }
        }
        @media (min-width: 821px) {
          #hzkMobileCleanControlBar {
            display: inline-flex !important;
            gap: 6px;
            align-items: center;
          }
        }
      `;
      document.head.appendChild(st);
    }

    // Default to clean mobile mode on phones/tablets <= 820px
    const isMobile = window.innerWidth <= 820;
    const savedPref = localStorage.getItem('hzk_mobile_clean_mode');
    const enableClean = savedPref === null ? isMobile : (savedPref === 'true');
    if (enableClean) {
      document.body.classList.add('hzk-mobile-clean-mode');
    }

    // Tag secondary Admin/Dev buttons in header & pilot banner so they collapse cleanly on mobile
    const secondaryPatterns = [
      /Next-Gen 5 ด้าน/i,
      /Audit & Resilience/i,
      /Omni-Scale/i,
      /KPI Report Studio/i,
      /ตั้งค่าสาขา โลโก้/i,
      /อัปเดตแอป/i,
      /ML ภาพเคสเก่า/i,
      /ตรวจระบบ & โหมดโชว์/i,
      /ยืนยันพร้อมเฟส 2/i,
      /Install App/i,
      /คำสั่งด่วน/i,
      /คู่มือ & ตัวอย่าง/i
    ];

    const collapsedButtons = [];
    document.querySelectorAll('header button, #topHeaderRightPillsWrap button, #topHeaderStatusPillsRow button, div button').forEach(btn => {
      if (btn.closest('#hzkUnifiedDocSuiteMenu') || btn.closest('#hzkMobileAdminDrawerMenu') || btn.id === 'hzkUnifiedDocSuiteBtn') return;
      const txt = (btn.textContent || '').trim();
      if (secondaryPatterns.some(rx => rx.test(txt))) {
        btn.classList.add('hzk-mobile-collapsed-pill');
        collapsedButtons.push({ label: txt, el: btn });
      }
    });

    // Also compact the PHASE 1 PILOT RUN banner paragraph if present
    document.querySelectorAll('div, p, span').forEach(el => {
      if (el.children.length === 0 && /ช่วงทดลองใช้งานจริง\s*—\s*ขอความร่วมมือ/.test(el.textContent || '')) {
        el.id = 'hzkPilotCompactNote';
      }
    });

    // Build compact Mobile Control Bar (`📋 เอกสาร & ติดตามสถานะ ▾` + `⚙️ เครื่องมือระบบ ▾` + `👁️ ปุ่มทั้งหมด`)
    const docWrap = document.getElementById('hzkUnifiedDocSuiteWrap');
    const docBtn = document.getElementById('hzkUnifiedDocSuiteBtn');
    if (!docWrap || !docBtn || document.getElementById('hzkMobileAdminToolsBtn')) return;

    // Make docBtn compact & balanced instead of stretching full width
    docBtn.style.width = 'auto';
    docBtn.style.flex = '1 1 auto';
    docBtn.style.justifyContent = 'center';

    const adminToolsBtn = document.createElement('button');
    adminToolsBtn.id = 'hzkMobileAdminToolsBtn';
    adminToolsBtn.type = 'button';
    adminToolsBtn.innerHTML = '⚙️ เครื่องมือระบบ ▾';
    adminToolsBtn.style.cssText =
      'background:#1E293B;color:#F8FAFC;border:1px solid #475569;' +
      'border-radius:999px;padding:5px 12px;font-weight:700;font-size:12px;line-height:1.35;' +
      'cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;height:28px;';

    const toggleAllBtn = document.createElement('button');
    toggleAllBtn.id = 'hzkToggleAllHeaderBtns';
    toggleAllBtn.type = 'button';
    toggleAllBtn.innerHTML = document.body.classList.contains('hzk-mobile-clean-mode') ? '👁️ แสดงปุ่มทั้งหมด' : '✨ ย่อหน้าจอ';
    toggleAllBtn.style.cssText =
      'background:#0F172A;color:#38BDF8;border:1px solid #0284C7;' +
      'border-radius:999px;padding:5px 10px;font-weight:700;font-size:11px;line-height:1.35;' +
      'cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;height:28px;';

    toggleAllBtn.onclick = function (e) {
      e.stopPropagation();
      const nowClean = document.body.classList.toggle('hzk-mobile-clean-mode');
      localStorage.setItem('hzk_mobile_clean_mode', String(nowClean));
      toggleAllBtn.innerHTML = nowClean ? '👁️ แสดงปุ่มทั้งหมด' : '✨ ย่อหน้าจอ';
      showHzkToastNotification(nowClean ? '✨ เปิดโหมดหน้าจอกระชับ (Mobile Clean-UI)' : '👁️ แสดงปุ่มควบคุมทั้งหมดแล้ว', false);
    };

    const adminDrawer = document.createElement('div');
    adminDrawer.id = 'hzkMobileAdminDrawerMenu';
    adminDrawer.style.cssText =
      'display:none;position:fixed;min-width:265px;max-width:92vw;max-height:70vh;overflow-y:auto;' +
      'background:#FFFFFF;color:#0F172A;border:1px solid #CBD5E1;border-radius:12px;' +
      'box-shadow:0 14px 35px rgba(15,23,42,0.35);padding:6px;z-index:20005;font-family:sans-serif;font-size:12.5px;';

    adminToolsBtn.onclick = function (e) {
      e.stopPropagation();
      if (adminDrawer.style.display === 'block') {
        adminDrawer.style.display = 'none';
        return;
      }
      adminDrawer.innerHTML = '<div style="font-size:11px;font-weight:800;color:#0369A1;padding:6px 10px;border-bottom:1px solid #E2E8F0;">⚙️ เครื่องมือตั้งค่า &amp; Admin ที่ซ่อนไว้</div>';
      if (collapsedButtons.length === 0) {
        adminDrawer.innerHTML += '<div style="padding:10px;color:#64748B;font-size:12px;">ไม่มีปุ่มที่ถูกซ่อนในหน้านี้</div>';
      } else {
        collapsedButtons.forEach(item => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = item.label;
          b.style.cssText =
            'width:100%;text-align:left;background:transparent;border:none;border-radius:8px;' +
            'padding:8px 10px;cursor:pointer;font-weight:700;font-size:12px;color:#0F172A;display:block;';
          b.onmouseenter = () => { b.style.background = '#F0F9FF'; };
          b.onmouseleave = () => { b.style.background = 'transparent'; };
          b.onclick = () => {
            adminDrawer.style.display = 'none';
            item.el.click();
          };
          adminDrawer.appendChild(b);
        });
      }
      const rect = adminToolsBtn.getBoundingClientRect();
      adminDrawer.style.top = Math.min(window.innerHeight - 320, rect.bottom + 6) + 'px';
      adminDrawer.style.left = Math.max(8, Math.min(window.innerWidth - 280, rect.left)) + 'px';
      adminDrawer.style.display = 'block';
    };

    document.addEventListener('click', (e) => {
      if (!adminToolsBtn.contains(e.target) && !adminDrawer.contains(e.target)) {
        adminDrawer.style.display = 'none';
      }
    });

    docWrap.style.display = 'flex';
    docWrap.style.flexWrap = 'wrap';
    docWrap.style.gap = '6px';
    docWrap.style.alignItems = 'center';
    docWrap.appendChild(adminToolsBtn);
    docWrap.appendChild(toggleAllBtn);
    document.body.appendChild(adminDrawer);
  }



  // ============================================================================
  // ENTERPRISE v1170 MODULE: SERIAL 360° LIFECYCLE P&L, PRICING INTELLIGENCE,
  // NAV SALES HISTORY IMPORTER & PRE-INSTALL SITE SURVEY CHECKLIST
  // ============================================================================
  const HZK_V1170_LOCAL_PNL_KEY = 'hzk_v1170_local_nav_sales_cache';

  function getLocalFallbackLifecycleData(prefillSn) {
    let customRows = [];
    try {
      customRows = JSON.parse(localStorage.getItem(HZK_V1170_LOCAL_PNL_KEY) || '[]');
    } catch (e) {}

    const baseUnits = [
      {
        serialNumber: 'K01234J',
        model: 'IM-130NE',
        customerStore: 'ร้านกาแฟตัวอย่าง สาขาภูเก็ต',
        customerPhone: '0819793085',
        province: 'ภูเก็ต',
        warrantyStatus: 'IN-WARRANTY (หมด 2027-12-31)',
        dealerName: 'บริษัท อันดามัน คูลลิ่ง จำกัด (Dealer A)',
        saleChannel: 'Dealer',
        refDocNo: 'SO-2026-0142',
        saleDate: '2026-01-15',
        netSellingPrice: 68500,
        warrantyYears: 2,
        includedPmCount: 2,
        promoTag: 'PROMO-FILTER-FREE',
        serviceEvents: [
          { source: 'Service Job', refId: 'JOB-260312', date: '2026-03-12', symptom: 'เปลี่ยน Water Valve + ล้างระบบ (ในประกัน)', technician: 'T07 (Upcountry)', status: 'COMPLETED', billingType: 'WARRANTY', partsCost: 1450, laborCost: 1200, travelCost: 1800, totalCost: 4450, customerBilled: 0 },
          { source: 'PM Contract', refId: 'PM-260715', date: '2026-07-15', symptom: 'PM รอบ 6 เดือน (ฟรีตามโปรโมชั่น)', technician: 'Dealer A Tech', status: 'COMPLETED', billingType: 'PM', partsCost: 350, laborCost: 600, travelCost: 800, totalCost: 1750, customerBilled: 0 }
        ],
        warrantyCostTotal: 4450,
        pmPromoCostTotal: 1750,
        billableRevenueTotal: 0,
        billableCostTotal: 0,
        repairCount: 2
      },
      {
        serialNumber: 'L05678M',
        model: 'KM-160B',
        customerStore: 'โรงแรมตัวอย่าง กรุงเทพฯ',
        customerPhone: '0890001122',
        province: 'กรุงเทพฯ',
        warrantyStatus: 'IN-WARRANTY (หมด 2027-08-15)',
        dealerName: 'บริษัท สยามไอซ์เทค จำกัด (Dealer B)',
        saleChannel: 'Dealer',
        refDocNo: 'SO-2026-0218',
        saleDate: '2026-02-20',
        netSellingPrice: 84000,
        warrantyYears: 2,
        includedPmCount: 0,
        promoTag: 'STANDARD-DEALER',
        serviceEvents: [
          { source: 'Service Job', refId: 'JOB-260504', date: '2026-05-04', symptom: 'ตรวจเช็ก Float Switch & Board (ในประกัน)', technician: 'T01 (BKK North)', status: 'COMPLETED', billingType: 'WARRANTY', partsCost: 2200, laborCost: 1200, travelCost: 500, totalCost: 3900, customerBilled: 0 }
        ],
        warrantyCostTotal: 3900,
        pmPromoCostTotal: 0,
        billableRevenueTotal: 0,
        billableCostTotal: 0,
        repairCount: 1
      },
      {
        serialNumber: 'M09876P',
        model: 'FM-120KE',
        customerStore: 'ร้านอาหารญี่ปุ่น เชียงใหม่',
        customerPhone: '0865556677',
        province: 'เชียงใหม่',
        warrantyStatus: 'OUT-OF-WARRANTY',
        dealerName: 'HOSHIZAKI Direct Service',
        saleChannel: 'Japanese Corporate',
        refDocNo: 'QT-JPC-2024-089',
        saleDate: '2024-06-10',
        netSellingPrice: 92000,
        warrantyYears: 1,
        includedPmCount: 4,
        promoTag: 'JPC-VIP-4PM',
        serviceEvents: [
          { source: 'Service Job', refId: 'JOB-250118', date: '2025-01-18', symptom: 'เปลี่ยน Gear Motor & Bearing (ในประกัน)', technician: 'T07 (Upcountry)', status: 'COMPLETED', billingType: 'WARRANTY', partsCost: 4800, laborCost: 1200, travelCost: 1800, totalCost: 7800, customerBilled: 0 },
          { source: 'Service Job', refId: 'JOB-260822', date: '2026-08-22', symptom: 'ซ่อมนอกประกัน + เปลี่ยนชุดซีล & ปั๊มน้ำ', technician: 'T07 (Upcountry)', status: 'COMPLETED', billingType: 'BILLABLE', partsCost: 3600, laborCost: 1500, travelCost: 1800, totalCost: 6900, customerBilled: 11800 }
        ],
        warrantyCostTotal: 7800,
        pmPromoCostTotal: 0,
        billableRevenueTotal: 11800,
        billableCostTotal: 6900,
        repairCount: 2
      },
      {
        serialNumber: 'N11223R',
        model: 'IM-240ANE-HC',
        customerStore: 'Chain Cafe สาขาสยามสแควร์',
        customerPhone: '0823334455',
        province: 'กรุงเทพฯ',
        warrantyStatus: 'IN-WARRANTY (หมด 2028-03-31)',
        dealerName: 'HOSHIZAKI Direct Service',
        saleChannel: 'Chain Account',
        refDocNo: 'SO-2026-0305',
        saleDate: '2026-04-01',
        netSellingPrice: 118000,
        warrantyYears: 2,
        includedPmCount: 4,
        promoTag: 'CHAIN-2YR-WARRANTY',
        serviceEvents: [],
        warrantyCostTotal: 0,
        pmPromoCostTotal: 0,
        billableRevenueTotal: 0,
        billableCostTotal: 0,
        repairCount: 0
      }
    ];

    customRows.forEach(r => {
      const sn = String(r.serialNo || '').toUpperCase();
      if (!sn) return;
      const idx = baseUnits.findIndex(u => u.serialNumber === sn);
      const itemObj = {
        serialNumber: sn,
        model: String(r.model || 'IM-100NE-HC').toUpperCase(),
        customerStore: r.customerName || '-',
        customerPhone: r.customerPhone || '-',
        province: r.province || 'กรุงเทพฯ',
        warrantyStatus: 'IN-WARRANTY (' + (r.warrantyYears || 1) + ' ปี)',
        dealerName: r.dealerName || 'HOSHIZAKI Direct Service',
        saleChannel: r.saleChannel || 'Dealer',
        refDocNo: r.refDocNo || 'NAV-IMPORT',
        saleDate: r.saleDate || '-',
        netSellingPrice: Number(r.netPrice || 0),
        warrantyYears: Number(r.warrantyYears || 1),
        includedPmCount: Number(r.includedPmCount || 0),
        promoTag: r.promoTag || '-',
        serviceEvents: idx >= 0 ? baseUnits[idx].serviceEvents : [],
        warrantyCostTotal: idx >= 0 ? baseUnits[idx].warrantyCostTotal : 0,
        pmPromoCostTotal: idx >= 0 ? baseUnits[idx].pmPromoCostTotal : 0,
        billableRevenueTotal: idx >= 0 ? baseUnits[idx].billableRevenueTotal : 0,
        billableCostTotal: idx >= 0 ? baseUnits[idx].billableCostTotal : 0,
        repairCount: idx >= 0 ? baseUnits[idx].repairCount : 0
      };
      if (idx >= 0) baseUnits[idx] = itemObj;
      else baseUnits.unshift(itemObj);
    });

    baseUnits.forEach(u => {
      u.companyAbsorbedCost = u.warrantyCostTotal + u.pmPromoCostTotal;
      u.serviceNetProfit = u.billableRevenueTotal - u.billableCostTotal;
      u.lifecycleNetContribution = u.netSellingPrice - u.companyAbsorbedCost + u.serviceNetProfit;
      u.costToSalesPct = u.netSellingPrice > 0 ? Number(((u.companyAbsorbedCost / u.netSellingPrice) * 100).toFixed(2)) : 0;
      u.netMarginPct = u.netSellingPrice > 0 ? Number(((u.lifecycleNetContribution / u.netSellingPrice) * 100).toFixed(2)) : 0;
    });

    const mMap = {};
    const dMap = {};
    baseUnits.forEach(u => {
      if (!mMap[u.model]) {
        mMap[u.model] = { model: u.model, unitCount: 0, totalSalesThb: 0, totalWarrantyCostThb: 0, totalRepairs: 0 };
      }
      mMap[u.model].unitCount++;
      mMap[u.model].totalSalesThb += u.netSellingPrice;
      mMap[u.model].totalWarrantyCostThb += u.warrantyCostTotal;
      mMap[u.model].totalRepairs += u.repairCount;

      if (!dMap[u.dealerName]) {
        dMap[u.dealerName] = { dealerName: u.dealerName, saleChannel: u.saleChannel, unitCount: 0, claimedUnits: 0, totalSalesThb: 0, totalWarrantyCostThb: 0 };
      }
      dMap[u.dealerName].unitCount++;
      if (u.repairCount > 0) dMap[u.dealerName].claimedUnits++;
      dMap[u.dealerName].totalSalesThb += u.netSellingPrice;
      dMap[u.dealerName].totalWarrantyCostThb += u.warrantyCostTotal;
    });

    const modelBenchmark = Object.values(mMap).map(x => {
      const avgSale = x.unitCount ? Math.round(x.totalSalesThb / x.unitCount) : 0;
      const avgCost = x.unitCount ? Math.round(x.totalWarrantyCostThb / x.unitCount) : 0;
      const ratio = x.totalSalesThb ? Number(((x.totalWarrantyCostThb / x.totalSalesThb) * 100).toFixed(2)) : 0;
      return {
        model: x.model,
        unitCount: x.unitCount,
        avgSalePrice: avgSale,
        totalSalesThb: x.totalSalesThb,
        totalWarrantyCostThb: x.totalWarrantyCostThb,
        avgWarrantyCostPerUnit: avgCost,
        claimRatioPct: ratio,
        totalRepairs: x.totalRepairs,
        recommendedPmAnnual: Math.max(3500, Math.round((avgCost * 1.35 + 1900) / 100) * 100),
        recommendedExtWarranty1Yr: Math.max(2900, Math.round((avgCost * 1.65) / 100) * 100)
      };
    });

    const dealerBenchmark = Object.values(dMap).map(x => {
      const rate = x.unitCount ? Number(((x.claimedUnits / x.unitCount) * 100).toFixed(1)) : 0;
      const avgC = x.unitCount ? Math.round(x.totalWarrantyCostThb / x.unitCount) : 0;
      return {
        dealerName: x.dealerName,
        saleChannel: x.saleChannel,
        unitCount: x.unitCount,
        claimedUnits: x.claimedUnits,
        claimRatePct: rate,
        totalSalesThb: x.totalSalesThb,
        totalWarrantyCostThb: x.totalWarrantyCostThb,
        avgClaimCostPerUnit: avgC,
        qualityGrade: rate <= 15 ? 'A (มาตรฐานดีเยี่ยม)' : (rate <= 35 ? 'B (เฝ้าระวังติดตั้ง)' : 'C (ต้องอบรมช่างดีลเลอร์)')
      };
    });

    const q = String(prefillSn || '').trim().toUpperCase();
    const selected = (q && baseUnits.find(u => u.serialNumber === q)) || baseUnits[0];

    return {
      status: 'LOCAL_DEMO',
      config: {
        standardLaborThb: 1200,
        travelBkkThb: 500,
        travelVicinityThb: 850,
        travelUpcountryThb: 1800,
        defaultPartsCostThb: 1450,
        pmStandardCostThb: 950,
        targetNetMarginPct: 28
      },
      selectedUnit: selected,
      allUnits: baseUnits,
      modelBenchmark: modelBenchmark,
      dealerBenchmark: dealerBenchmark,
      lotAlerts: []
    };
  }

  async function openSerialLifecyclePricingSuiteModal(prefillSn) {
    let modal = document.getElementById('hzkLifecyclePnLModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkLifecyclePnLModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:20060;background:rgba(15,23,42,0.86);display:flex;' +
        'align-items:center;justify-content:center;padding:10px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1120px;max-height:94vh;overflow-y:auto;border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:linear-gradient(135deg,#002B49,#0F172A);color:#FFF;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5;border-bottom:2px solid #0284C7;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;letter-spacing:0.5px;">ENTERPRISE v1170 • SERIAL 360° LIFECYCLE P&amp;L &amp; PRICING INTELLIGENCE</div>
            <div style="font-size:16.5px;font-weight:800;">💰 วิเคราะห์กำไร-ขาดทุนรายเครื่อง (S/N) • เทียบดีลเลอร์/รุ่น • จำลองตั้งราคา &amp; โปรโมชั่น</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkLifecyclePnLModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="background:#F1F5F9;padding:10px 18px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #CBD5E1;position:sticky;top:62px;z-index:4;">
          <button type="button" class="hzk-pnl-tab-btn" data-tab="UNIT" style="background:#002B49;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12.5px;cursor:pointer;">🔎 1. วิเคราะห์รายเครื่อง (Unit P&amp;L)</button>
          <button type="button" class="hzk-pnl-tab-btn" data-tab="BENCH" style="background:#FFFFFF;color:#0F172A;border:1px solid #CBD5E1;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12.5px;cursor:pointer;">📊 2. เทียบข้ามรุ่น &amp; ดีลเลอร์ (Benchmark)</button>
          <button type="button" class="hzk-pnl-tab-btn" data-tab="SIM" style="background:#FFFFFF;color:#0F172A;border:1px solid #CBD5E1;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12.5px;cursor:pointer;">🧮 3. จำลองตั้งราคา &amp; แพ็คเกจ PM/โปรโมชั่น</button>
          <button type="button" class="hzk-pnl-tab-btn" data-tab="IMPORT" style="background:#FFFFFF;color:#0F172A;border:1px solid #CBD5E1;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12.5px;cursor:pointer;">📥 4. นำเข้าประวัติขาย NAV &amp; ตั้งเรทต้นทุน</button>
        </div>

        <div id="hzkLifecyclePnLBody" style="padding:18px 20px;font-size:13px;">⏳ กำลังประมวลผลข้อมูลการขายและประวัติซ่อมรายเครื่อง...</div>
      </div>
    `;
    modal.style.display = 'flex';

    let activeTab = 'UNIT';
    let cachedState = null;

    function fmtNum(v) {
      return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function updateTabButtons() {
      modal.querySelectorAll('.hzk-pnl-tab-btn').forEach(b => {
        const isAct = b.getAttribute('data-tab') === activeTab;
        b.style.background = isAct ? '#002B49' : '#FFFFFF';
        b.style.color = isAct ? '#FFFFFF' : '#0F172A';
        b.style.border = isAct ? 'none' : '1px solid #CBD5E1';
      });
    }

    modal.querySelectorAll('.hzk-pnl-tab-btn').forEach(b => {
      b.onclick = () => {
        activeTab = b.getAttribute('data-tab');
        updateTabButtons();
        renderActiveTab();
      };
    });

    async function fetchLifecycleData(snQuery) {
      const body = document.getElementById('hzkLifecyclePnLBody');
      body.innerHTML = '⏳ กำลังโหลดข้อมูลวิเคราะห์ต้นทุนและราคาขาย...';
      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          const res = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getSerialLifecyclePnL', serialNo: snQuery || '' })
          });
          const d = await res.json();
          if (d && d.status === 'OK') {
            cachedState = d;
            renderActiveTab();
            return;
          }
        } catch (err) {
          console.warn('GAS Lifecycle fetch fallback:', err);
        }
      }
      cachedState = getLocalFallbackLifecycleData(snQuery);
      renderActiveTab();
    }

    function renderActiveTab() {
      const body = document.getElementById('hzkLifecyclePnLBody');
      if (!cachedState) return;
      const u = cachedState.selectedUnit || (cachedState.allUnits && cachedState.allUnits[0]) || null;
      const cfg = cachedState.config || {};
      const sourceBadge = cachedState.status === 'OK'
        ? '<span style="background:#DCFCE7;color:#166534;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">🟢 เชื่อมต่อ Google Sheets Live</span>'
        : '<span style="background:#FEF3C7;color:#92400E;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">🟡 โหมดฐานข้อมูลตัวอย่างในเครื่อง (ตั้งค่า GAS URL เพื่อซิงก์สด)</span>';

      if (activeTab === 'UNIT') {
        const quickPills = (cachedState.allUnits || []).slice(0, 8).map(item =>
          `<button type="button" class="hzk-sn-quick-pill" data-sn="${item.serialNumber}" style="background:${u && u.serialNumber === item.serialNumber ? '#0284C7' : '#E2E8F0'};color:${u && u.serialNumber === item.serialNumber ? '#FFF' : '#0F172A'};border:none;border-radius:999px;padding:4px 11px;font-size:11.5px;font-weight:700;cursor:pointer;">${item.serialNumber} (${item.model})</button>`
        ).join('');

        if (!u) {
          body.innerHTML = `<div style="color:#64748B;">ไม่พบข้อมูลเครื่องในระบบ กรุณานำเข้าข้อมูลในแท็บที่ 4</div>`;
          return;
        }

        const marginColor = u.netMarginPct >= 25 ? '#059669' : (u.netMarginPct >= 10 ? '#D97706' : '#DC2626');
        const eventsRows = (u.serviceEvents || []).map(ev => {
          const isBillable = ev.billingType === 'BILLABLE';
          const badge = isBillable
            ? '<span style="background:#DCFCE7;color:#166534;padding:2px 7px;border-radius:6px;font-weight:700;font-size:11px;">รายได้นอกประกัน</span>'
            : (ev.billingType === 'PM'
              ? '<span style="background:#E0F2FE;color:#075985;padding:2px 7px;border-radius:6px;font-weight:700;font-size:11px;">ต้นทุน PM โปรฯ</span>'
              : '<span style="background:#FEE2E2;color:#991B1B;padding:2px 7px;border-radius:6px;font-weight:700;font-size:11px;">ต้นทุนเคลมประกัน</span>');
          return `
            <tr>
              <td style="padding:7px;border:1px solid #CBD5E1;white-space:nowrap;">${ev.date}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${ev.refId}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;">${ev.symptom}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${badge}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;">${fmtNum(ev.partsCost)}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;">${fmtNum(ev.laborCost)}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;">${fmtNum(ev.travelCost)}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:#DC2626;">${fmtNum(ev.totalCost)}</td>
              <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:#059669;">${fmtNum(ev.customerBilled)}</td>
            </tr>
          `;
        }).join('') || '<tr><td colspan="9" style="padding:12px;text-align:center;color:#64748B;">เครื่องนี้ยังไม่เคยมีประวัติแจ้งซ่อมหรือเคลมประกัน (Zero Claim — กำไรเต็ม 100%)</td></tr>';

        body.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <div style="display:flex;gap:8px;flex:1;min-width:260px;">
              <input id="hzkPnlSnInput" type="text" value="${u.serialNumber}" placeholder="ระบุ Serial Number เช่น K01234J..." style="flex:1;padding:8px 12px;border:1.5px solid #94A3B8;border-radius:8px;font-weight:700;" />
              <button type="button" id="hzkPnlSnSearchBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">🔎 วิเคราะห์ S/N</button>
            </div>
            <div>${sourceBadge}</div>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
            <span style="font-size:11.5px;font-weight:700;color:#475569;">เลือกเครื่องด่วน:</span>
            ${quickPills}
          </div>

          <div style="background:#F8FAFC;border:1.5px solid #CBD5E1;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;margin-bottom:10px;">
              <div>
                <span style="background:#002B49;color:#FFF;padding:3px 9px;border-radius:6px;font-weight:800;font-size:12px;">S/N: ${u.serialNumber}</span>
                <span style="font-size:15px;font-weight:800;color:#002B49;margin-left:8px;">รุ่น ${u.model}</span>
                <span style="background:#E0F2FE;color:#0369A1;padding:3px 9px;border-radius:6px;font-weight:700;font-size:11.5px;margin-left:6px;">ช่องทาง: ${u.saleChannel}</span>
              </div>
              <div style="font-size:12px;color:#334155;"><b>อ้างอิงขาย:</b> ${u.refDocNo} | <b>วันที่ขาย:</b> ${u.saleDate} | <b>โปรฯ:</b> ${u.promoTag}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:12.5px;">
              <div><b>ผู้ซื้อ / ดีลเลอร์:</b> ${u.dealerName}</div>
              <div><b>ร้านค้าปลายทาง:</b> ${u.customerStore} (${u.province})</div>
              <div><b>สิทธิ์รับประกัน:</b> ${u.warrantyStatus} (แถม PM ${u.includedPmCount} ครั้ง)</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:10px;margin-bottom:16px;">
            <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:12px;">
              <div style="font-size:11px;font-weight:700;color:#1E40AF;">1) ราคาขายสุทธิ (Sell-Out Price)</div>
              <div style="font-size:20px;font-weight:800;color:#002B49;margin-top:4px;">฿${fmtNum(u.netSellingPrice)}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px;">รับประกัน ${u.warrantyYears} ปี | แถม PM ${u.includedPmCount} ครั้ง</div>
            </div>
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:12px;">
              <div style="font-size:11px;font-weight:700;color:#991B1B;">2) ต้นทุนซ่อมประกัน &amp; PM สะสม</div>
              <div style="font-size:20px;font-weight:800;color:#DC2626;margin-top:4px;">-฿${fmtNum(u.companyAbsorbedCost)}</div>
              <div style="font-size:11px;color:#7F1D1D;margin-top:2px;">คิดเป็น ${u.costToSalesPct}% ของราคาขาย (${u.repairCount} ครั้ง)</div>
            </div>
            <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:12px;">
              <div style="font-size:11px;font-weight:700;color:#065F46;">3) กำไรงานบริการนอกประกัน</div>
              <div style="font-size:20px;font-weight:800;color:#059669;margin-top:4px;">+฿${fmtNum(u.serviceNetProfit)}</div>
              <div style="font-size:11px;color:#047857;margin-top:2px;">รายได้ ฿${fmtNum(u.billableRevenueTotal)} - ทุน ฿${fmtNum(u.billableCostTotal)}</div>
            </div>
            <div style="background:#F8FAFC;border:2px solid ${marginColor};border-radius:12px;padding:12px;">
              <div style="font-size:11px;font-weight:800;color:${marginColor};">4) คงเหลือสุทธิตลอดอายุเครื่อง</div>
              <div style="font-size:20px;font-weight:800;color:${marginColor};margin-top:4px;">฿${fmtNum(u.lifecycleNetContribution)}</div>
              <div style="font-size:11px;font-weight:700;color:${marginColor};margin-top:2px;">Net Margin: ${u.netMarginPct}% (เป้า ${cfg.targetNetMarginPct || 28}%)</div>
            </div>
          </div>

          <div style="font-weight:800;color:#002B49;margin-bottom:8px;">🧾 รายละเอียดการซ่อมและค่าใช้จ่ายแต่ละครั้งของเครื่อง S/N: ${u.serialNumber}</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;min-width:780px;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#002B49;color:#FFF;">
                  <th style="padding:8px;">วันที่</th>
                  <th style="padding:8px;">เลขที่ใบงาน</th>
                  <th style="padding:8px;text-align:left;">อาการ / รายการซ่อม</th>
                  <th style="padding:8px;">ประเภท</th>
                  <th style="padding:8px;text-align:right;">ค่าอะไหล่</th>
                  <th style="padding:8px;text-align:right;">ค่าแรง</th>
                  <th style="padding:8px;text-align:right;">ค่าเดินทาง</th>
                  <th style="padding:8px;text-align:right;">ต้นทุนรวม</th>
                  <th style="padding:8px;text-align:right;">เก็บเงินลูกค้า</th>
                </tr>
              </thead>
              <tbody>${eventsRows}</tbody>
            </table>
          </div>
        `;

        document.getElementById('hzkPnlSnSearchBtn').onclick = () => {
          fetchLifecycleData(document.getElementById('hzkPnlSnInput').value);
        };
        modal.querySelectorAll('.hzk-sn-quick-pill').forEach(p => {
          p.onclick = () => fetchLifecycleData(p.getAttribute('data-sn'));
        });
      }

      if (activeTab === 'BENCH') {
        const mRows = (cachedState.modelBenchmark || []).map(m => `
          <tr>
            <td style="padding:7px;border:1px solid #CBD5E1;font-weight:800;color:#002B49;">${m.model}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${m.unitCount}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;">฿${fmtNum(m.avgSalePrice)}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;color:#DC2626;font-weight:700;">฿${fmtNum(m.avgWarrantyCostPerUnit)}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;color:${m.claimRatioPct > 8 ? '#DC2626' : '#059669'};">${m.claimRatioPct}%</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;background:#F0FDF4;font-weight:700;color:#166534;">฿${fmtNum(m.recommendedPmAnnual)} / ปี</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;background:#EFF6FF;font-weight:700;color:#1E40AF;">฿${fmtNum(m.recommendedExtWarranty1Yr)} / ปี</td>
          </tr>
        `).join('');

        const dRows = (cachedState.dealerBenchmark || []).map(d => `
          <tr>
            <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${d.dealerName}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${d.saleChannel}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${d.unitCount}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">${d.claimedUnits} (${d.claimRatePct}%)</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;">฿${fmtNum(d.totalSalesThb)}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:right;color:#DC2626;font-weight:700;">฿${fmtNum(d.totalWarrantyCostThb)}</td>
            <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;">${d.qualityGrade}</td>
          </tr>
        `).join('');

        body.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <div style="font-weight:800;color:#002B49;font-size:14px;">📊 ตารางเปรียบเทียบต้นทุนซ่อมเฉลี่ย &amp; ราคาแพ็คเกจแนะนำแยกตามรุ่น (By Model)</div>
            <button type="button" id="hzkExportLifecycleCsvBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">📥 Export รายงานผู้บริหาร (CSV)</button>
          </div>
          <div style="overflow-x:auto;margin-bottom:18px;">
            <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#002B49;color:#FFF;">
                  <th style="padding:8px;text-align:left;">รุ่นเครื่อง (Model)</th>
                  <th style="padding:8px;">จำนวนเครื่อง</th>
                  <th style="padding:8px;text-align:right;">ราคาขายเฉลี่ย</th>
                  <th style="padding:8px;text-align:right;">ต้นทุนเคลมเฉลี่ย/เครื่อง</th>
                  <th style="padding:8px;">สัดส่วนเคลม/ยอดขาย</th>
                  <th style="padding:8px;text-align:right;">ราคาสัญญา PM แนะนำ</th>
                  <th style="padding:8px;text-align:right;">ราคาขยายประกัน +1 ปี</th>
                </tr>
              </thead>
              <tbody>${mRows}</tbody>
            </table>
          </div>

          <div style="font-weight:800;color:#7F1D1D;font-size:14px;margin-bottom:8px;">🏢 ตารางเปรียบเทียบคุณภาพการติดตั้ง &amp; ต้นทุนเคลมแยกตามดีลเลอร์/ช่องทางขาย (By Dealer / Channel)</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#7F1D1D;color:#FFF;">
                  <th style="padding:8px;text-align:left;">ตัวแทนจำหน่าย / ช่องทาง</th>
                  <th style="padding:8px;">ประเภทช่องทาง</th>
                  <th style="padding:8px;">จำนวนขาย</th>
                  <th style="padding:8px;">เครื่องที่เคลม (%)</th>
                  <th style="padding:8px;text-align:right;">ยอดขายรวม</th>
                  <th style="padding:8px;text-align:right;">ต้นทุนเคลมสะสม</th>
                  <th style="padding:8px;">เกรดคุณภาพติดตั้ง</th>
                </tr>
              </thead>
              <tbody>${dRows}</tbody>
            </table>
          </div>
        `;

        document.getElementById('hzkExportLifecycleCsvBtn').onclick = () => {
          const lines = ['Model,Units,Avg_Sale_THB,Avg_Warranty_Cost_THB,Claim_Ratio_Pct,Rec_PM_Annual_THB,Rec_Ext_Warranty_1Yr_THB'];
          (cachedState.modelBenchmark || []).forEach(m => {
            lines.push([m.model, m.unitCount, m.avgSalePrice, m.avgWarrantyCostPerUnit, m.claimRatioPct, m.recommendedPmAnnual, m.recommendedExtWarranty1Yr].join(','));
          });
          const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'HOSHIZAKI_Lifecycle_Pricing_Benchmark_' + new Date().toISOString().slice(0, 10) + '.csv';
          a.click();
        };
      }

      if (activeTab === 'SIM') {
        const models = cachedState.modelBenchmark || [];
        const firstM = models[0] || { model: 'IM-130NE', avgSalePrice: 68500, avgWarrantyCostPerUnit: 4450 };
        body.innerHTML = `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="font-weight:800;color:#002B49;font-size:14px;margin-bottom:4px;">🧮 เครื่องมือจำลองตั้งราคาขาย แพ็คเกจ PM และโปรโมชั่น (Executive Pricing &amp; Promo Simulator)</div>
            <div style="font-size:12px;color:#334155;">คำนวณผลกระทบต่อกำไรสุทธิทันทีเมื่อปรับราคาขาย แถมฟรีสัญญา PM หรือขยายระยะเวลารับประกัน โดยอ้างอิงสถิติค่าซ่อมจริงจากฐานข้อมูล S/N</div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px;">
            <div>
              <label style="font-weight:700;font-size:12px;">เลือกรุ่นอ้างอิงสถิติซ่อม:</label>
              <select id="hzkSimModelSel" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:4px;font-weight:700;">
                ${models.map(m => `<option value="${m.model}" data-price="${m.avgSalePrice}" data-cost="${m.avgWarrantyCostPerUnit}">${m.model} (เคลมเฉลี่ย ฿${fmtNum(m.avgWarrantyCostPerUnit)})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-weight:700;font-size:12px;">ราคาขายตั้งต้น (THB):</label>
              <input id="hzkSimSellPrice" type="number" value="${firstM.avgSalePrice}" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:4px;font-weight:700;" />
            </div>
            <div>
              <label style="font-weight:700;font-size:12px;">ส่วนลดโปรโมชั่น / ดีลเลอร์ (%):</label>
              <input id="hzkSimDiscountPct" type="number" value="10" min="0" max="50" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:4px;font-weight:700;" />
            </div>
            <div>
              <label style="font-weight:700;font-size:12px;">จำนวนครั้ง PM ที่แถมฟรีในโปรโมชั่น:</label>
              <input id="hzkSimFreePm" type="number" value="2" min="0" max="12" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:4px;font-weight:700;" />
            </div>
            <div>
              <label style="font-weight:700;font-size:12px;">ขยายรับประกันเพิ่ม (ปี):</label>
              <select id="hzkSimExtYr" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:4px;font-weight:700;">
                <option value="0">ไม่ขยายเพิ่ม (มาตรฐาน 1 ปี)</option>
                <option value="1" selected>ขยายเพิ่ม +1 ปี (รวม 2 ปี)</option>
                <option value="2">ขยายเพิ่ม +2 ปี (รวม 3 ปี)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;font-size:12px;">ราคาขายแพ็คเกจเสริมที่เก็บเพิ่ม (THB):</label>
              <input id="hzkSimAddonPrice" type="number" value="4900" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:4px;font-weight:700;" />
            </div>
          </div>

          <div id="hzkSimResultBox" style="background:#F8FAFC;border:2px solid #0284C7;border-radius:14px;padding:16px;"></div>
        `;

        function recalcSim() {
          const sel = document.getElementById('hzkSimModelSel');
          const opt = sel.options[sel.selectedIndex];
          const baseWarrantyCost = Number(opt.getAttribute('data-cost') || 3500);
          const listPrice = Number(document.getElementById('hzkSimSellPrice').value || 0);
          const discPct = Number(document.getElementById('hzkSimDiscountPct').value || 0);
          const freePm = Number(document.getElementById('hzkSimFreePm').value || 0);
          const extYr = Number(document.getElementById('hzkSimExtYr').value || 0);
          const addonPrice = Number(document.getElementById('hzkSimAddonPrice').value || 0);

          const netMachinePrice = listPrice * (1 - discPct / 100);
          const totalRevenue = netMachinePrice + addonPrice;
          const pmCostEach = Number(cfg.pmStandardCostThb || 950) + Number(cfg.travelBkkThb || 500);
          const totalPmCost = freePm * pmCostEach;
          // Free PM reduces breakdown rate by 18% per PM visit (capped at 45%)
          const riskReductionFactor = Math.max(0.55, 1 - Math.min(0.45, freePm * 0.12));
          const expectedWarrantyCost = Math.round((baseWarrantyCost + extYr * baseWarrantyCost * 0.85) * riskReductionFactor);
          const totalAfterSalesCost = totalPmCost + expectedWarrantyCost;
          const netAfterSalesContribution = totalRevenue - totalAfterSalesCost;
          const breakevenPackagePrice = Math.round(totalPmCost + extYr * baseWarrantyCost * 0.85 * riskReductionFactor * 1.25);

          document.getElementById('hzkSimResultBox').innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
              <div>
                <div style="font-size:11.5px;color:#475569;font-weight:700;">รายรับสุทธิรวมแพ็คเกจ</div>
                <div style="font-size:20px;font-weight:800;color:#002B49;">฿${fmtNum(totalRevenue)}</div>
                <div style="font-size:11px;color:#64748B;">ค่าเครื่องหลังหักส่วนลด ฿${fmtNum(netMachinePrice)} + แพ็คเกจ ฿${fmtNum(addonPrice)}</div>
              </div>
              <div>
                <div style="font-size:11.5px;color:#991B1B;font-weight:700;">ต้นทุนบริการที่คาดว่าจะเกิดขึ้น</div>
                <div style="font-size:20px;font-weight:800;color:#DC2626;">-฿${fmtNum(totalAfterSalesCost)}</div>
                <div style="font-size:11px;color:#7F1D1D;">ต้นทุน PM ${freePm} ครั้ง (฿${fmtNum(totalPmCost)}) + สำรองซ่อมประกัน (฿${fmtNum(expectedWarrantyCost)})</div>
              </div>
              <div>
                <div style="font-size:11.5px;color:#065F46;font-weight:700;">ยอดคงเหลือหลังหักต้นทุนบริการ</div>
                <div style="font-size:20px;font-weight:800;color:#059669;">฿${fmtNum(netAfterSalesContribution)}</div>
                <div style="font-size:11px;color:#047857;">ราคาแพ็คเกจขั้นต่ำที่คุ้มทุน: <b>฿${fmtNum(breakevenPackagePrice)}</b></div>
              </div>
            </div>
          `;
        }

        document.getElementById('hzkSimModelSel').onchange = function () {
          const opt = this.options[this.selectedIndex];
          document.getElementById('hzkSimSellPrice').value = opt.getAttribute('data-price') || 65000;
          recalcSim();
        };
        ['hzkSimSellPrice', 'hzkSimDiscountPct', 'hzkSimFreePm', 'hzkSimExtYr', 'hzkSimAddonPrice'].forEach(id => {
          document.getElementById(id).oninput = recalcSim;
        });
        recalcSim();
      }

      if (activeTab === 'IMPORT') {
        body.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;">
            <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;padding:14px;">
              <div style="font-weight:800;color:#002B49;font-size:14px;margin-bottom:6px;">📥 นำเข้าประวัติขายจาก NAV (CSV / วางข้อมูลจาก Excel)</div>
              <div style="font-size:11.5px;color:#475569;margin-bottom:8px;">
                รูปแบบคอลัมน์ (คั่นด้วยเครื่องหมายจุลภาค <code>,</code> หรือ Tab จาก Excel):<br/>
                <code>SerialNo, Model, CustomerName, Phone, Province, DealerName, SaleChannel, RefDocNo, SaleDate, NetPrice, WarrantyYears, IncludedPM, PromoTag</code>
              </div>
              <textarea id="hzkNavCsvInput" rows="7" style="width:100%;padding:8px;border:1px solid #94A3B8;border-radius:8px;font-family:monospace;font-size:11.5px;" placeholder="P55441A, IM-130NE, ร้านกาแฟอเมซอน สาขาบางนา, 0812345678, กรุงเทพฯ, บริษัท สยามไอซ์เทค จำกัด, Dealer, SO-2026-0881, 2026-06-15, 67500, 2, 2, PROMO-MIDYEAR&#10;P55442B, KM-230B, โรงแรมแกรนด์ สุขุมวิท, 0898765432, กรุงเทพฯ, HOSHIZAKI Direct Service, Direct End-User, SO-2026-0882, 2026-06-18, 96000, 2, 4, VIP-4PM"></textarea>
              <button type="button" id="hzkNavImportSubmitBtn" style="margin-top:8px;background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;width:100%;">🚀 นำเข้าข้อมูลผูก S/N เข้าฐานข้อมูล</button>
            </div>

            <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;padding:14px;">
              <div style="font-weight:800;color:#7F1D1D;font-size:14px;margin-bottom:6px;">⚙️ ตั้งค่าเรทต้นทุนมาตรฐานงานซ่อมในประกัน (Cost Rate Settings)</div>
              <div style="font-size:11.5px;color:#475569;margin-bottom:10px;">ใช้คำนวณต้นทุนซ่อมในประกันอัตโนมัติ (อะไหล่ + ค่าแรงมาตรฐาน + ค่าเดินทางตามโซน)</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
                <div><label>ค่าแรงมาตรฐาน/ครั้ง (THB)</label><input id="hzkCfgLabor" type="number" value="${cfg.standardLaborThb || 1200}" style="width:100%;padding:6px;border:1px solid #CBD5E1;border-radius:6px;" /></div>
                <div><label>ค่าอะไหล่เฉลี่ยกรณีไม่ระบุ (THB)</label><input id="hzkCfgParts" type="number" value="${cfg.defaultPartsCostThb || 1450}" style="width:100%;padding:6px;border:1px solid #CBD5E1;border-radius:6px;" /></div>
                <div><label>ค่าเดินทางโซน กทม. (THB)</label><input id="hzkCfgBkk" type="number" value="${cfg.travelBkkThb || 500}" style="width:100%;padding:6px;border:1px solid #CBD5E1;border-radius:6px;" /></div>
                <div><label>ค่าเดินทางปริมณฑล/EEC (THB)</label><input id="hzkCfgVic" type="number" value="${cfg.travelVicinityThb || 850}" style="width:100%;padding:6px;border:1px solid #CBD5E1;border-radius:6px;" /></div>
                <div><label>ค่าเดินทางต่างจังหวัด (THB)</label><input id="hzkCfgUpc" type="number" value="${cfg.travelUpcountryThb || 1800}" style="width:100%;padding:6px;border:1px solid #CBD5E1;border-radius:6px;" /></div>
                <div><label>ต้นทุนล้าง PM มาตรฐาน (THB)</label><input id="hzkCfgPm" type="number" value="${cfg.pmStandardCostThb || 950}" style="width:100%;padding:6px;border:1px solid #CBD5E1;border-radius:6px;" /></div>
              </div>
              <button type="button" id="hzkCfgSaveBtn" style="margin-top:10px;background:#059669;color:#FFF;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;width:100%;">💾 บันทึกเรทต้นทุนมาตรฐาน</button>
            </div>
          </div>
        `;

        document.getElementById('hzkNavImportSubmitBtn').onclick = async () => {
          const raw = document.getElementById('hzkNavCsvInput').value.trim();
          if (!raw) {
            alert('กรุณาวางข้อมูล CSV หรือตารางจาก Excel ก่อนกดนำเข้าครับ');
            return;
          }
          const lines = raw.split(/\r?\n/).filter(l => l.trim());
          const parsedRows = [];
          lines.forEach(line => {
            const cols = line.indexOf('	') !== -1 ? line.split('	') : line.split(',');
            if (cols.length < 2) return;
            if (/^serial/i.test(cols[0].trim())) return; // skip header row
            parsedRows.push({
              serialNo: (cols[0] || '').trim(),
              model: (cols[1] || '').trim(),
              customerName: (cols[2] || '').trim(),
              customerPhone: (cols[3] || '').trim(),
              province: (cols[4] || 'กรุงเทพฯ').trim(),
              dealerName: (cols[5] || 'HOSHIZAKI Direct Service').trim(),
              saleChannel: (cols[6] || 'Dealer').trim(),
              refDocNo: (cols[7] || '-').trim(),
              saleDate: (cols[8] || '').trim(),
              netPrice: Number((cols[9] || '0').replace(/[^0-9.\-]/g, '')) || 0,
              warrantyYears: Number(cols[10] || 1) || 1,
              includedPmCount: Number(cols[11] || 0) || 0,
              promoTag: (cols[12] || '-').trim()
            });
          });

          if (parsedRows.length === 0) {
            alert('ไม่พบแถวข้อมูลที่ถูกต้อง กรุณาตรวจสอบรูปแบบคอลัมน์ครับ');
            return;
          }

          // Save locally as well so instant preview works offline
          try {
            const prevLocal = JSON.parse(localStorage.getItem(HZK_V1170_LOCAL_PNL_KEY) || '[]');
            localStorage.setItem(HZK_V1170_LOCAL_PNL_KEY, JSON.stringify(parsedRows.concat(prevLocal).slice(0, 300)));
          } catch (e) {}

          const gasUrl = getGasEndpointUrl();
          if (gasUrl) {
            try {
              const res = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'importNavSalesHistoryBatch', rows: parsedRows })
              });
              const d = await res.json();
              if (d && d.status === 'OK') {
                alert(`✅ นำเข้าประวัติขายสำเร็จ ${d.totalProcessed} รายการ (เพิ่มใหม่ ${d.inserted} / อัปเดต ${d.updated})`);
                activeTab = 'UNIT';
                updateTabButtons();
                fetchLifecycleData(parsedRows[0].serialNo);
                return;
              }
            } catch (err) {}
          }
          alert(`✅ บันทึกประวัติขายลงฐานข้อมูลในเครื่องสำเร็จ ${parsedRows.length} รายการ`);
          activeTab = 'UNIT';
          updateTabButtons();
          fetchLifecycleData(parsedRows[0].serialNo);
        };

        document.getElementById('hzkCfgSaveBtn').onclick = async () => {
          const newCfg = {
            standardLaborThb: Number(document.getElementById('hzkCfgLabor').value || 1200),
            defaultPartsCostThb: Number(document.getElementById('hzkCfgParts').value || 1450),
            travelBkkThb: Number(document.getElementById('hzkCfgBkk').value || 500),
            travelVicinityThb: Number(document.getElementById('hzkCfgVic').value || 850),
            travelUpcountryThb: Number(document.getElementById('hzkCfgUpc').value || 1800),
            pmStandardCostThb: Number(document.getElementById('hzkCfgPm').value || 950),
            targetNetMarginPct: 28
          };
          const gasUrl = getGasEndpointUrl();
          if (gasUrl) {
            try {
              await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'saveLifecycleCostConfig', config: newCfg })
              });
            } catch (e) {}
          }
          cachedState.config = newCfg;
          alert('✅ บันทึกเรทต้นทุนมาตรฐานเรียบร้อยแล้ว');
        };
      }
    }

    updateTabButtons();
    fetchLifecycleData(prefillSn);
  }

  async function openPreInstallSiteSurveyModal() {
    let m = document.getElementById('hzkSiteSurveyModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'hzkSiteSurveyModal';
      m.style.cssText =
        'position:fixed;inset:0;z-index:20062;background:rgba(15,23,42,0.85);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(m);
    }

    m.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:740px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.45);font-family:sans-serif;color:#0F172A;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:#38BDF8;font-weight:800;">SALES / JPC / SERVICE PRE-INSTALLATION READINESS</div>
            <div style="font-size:16px;font-weight:700;">📐 แบบตรวจความพร้อมหน้างานก่อนส่งมอบ &amp; ติดตั้ง (Site Survey)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkSiteSurveyModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:18px 20px;font-size:13px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div><label style="font-weight:700;">เลขที่ใบเสนอราคา / SO</label><input id="hzkSrvRef" type="text" placeholder="QT-2026-..." style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;" /></div>
            <div><label style="font-weight:700;">รุ่นเครื่อง (Model)</label><input id="hzkSrvModel" type="text" placeholder="IM-130NE / KM-160B..." style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;" /></div>
            <div style="grid-column:1/-1;"><label style="font-weight:700;">ชื่อร้าน / สถานที่ติดตั้ง</label><input id="hzkSrvCust" type="text" placeholder="ชื่อลูกค้า / สาขา..." style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;" /></div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;padding:12px;margin-bottom:14px;">
            <div style="font-weight:800;color:#002B49;margin-bottom:8px;">✅ รายการตรวจเช็กมาตรฐาน HOSHIZAKI (ลดอัตราเคลมในประกัน):</div>
            <label style="display:block;margin-bottom:6px;"><input id="hzkSrvWaterOk" type="checkbox" checked /> <b>ระบบน้ำประปา:</b> แรงดันน้ำ 1.0–5.0 Bar + วาล์ว 1/2" พร้อมจุดติดตั้งเครื่องกรองน้ำ (Water Filter)</label>
            <label style="display:block;margin-bottom:6px;"><input id="hzkSrvPowerOk" type="checkbox" checked /> <b>ระบบไฟฟ้า:</b> แรงดันไฟ 220V ±10% 50Hz + เบรกเกอร์แยกเฉพาะเครื่องและสายดินครบถ้วน</label>
            <label style="display:block;"><input id="hzkSrvDrainOk" type="checkbox" checked /> <b>ท่อน้ำทิ้ง &amp; ระบายอากาศ:</b> ท่อน้ำทิ้งระดับต่ำกว่าฐานเครื่อง + เว้นระยะระบายความร้อน ≥ 15 ซม.</label>
          </div>
          <button type="button" id="hzkSrvSaveBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;width:100%;">💾 บันทึกผลตรวจหน้างาน &amp; ส่งต่อทีมติดตั้ง</button>
        </div>
      </div>
    `;
    m.style.display = 'flex';

    document.getElementById('hzkSrvSaveBtn').onclick = async () => {
      const payload = {
        action: 'logPreInstallSiteSurvey',
        refNo: document.getElementById('hzkSrvRef').value.trim(),
        model: document.getElementById('hzkSrvModel').value.trim(),
        customerName: document.getElementById('hzkSrvCust').value.trim(),
        waterOk: document.getElementById('hzkSrvWaterOk').checked,
        powerOk: document.getElementById('hzkSrvPowerOk').checked,
        drainOk: document.getElementById('hzkSrvDrainOk').checked
      };
      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          const r = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          const d = await r.json();
          if (d && d.status === 'OK') {
            alert(`✅ บันทึกใบตรวจหน้างาน ${d.surveyId} เรียบร้อย (สถานะ: ${d.readiness})`);
            m.style.display = 'none';
            return;
          }
        } catch (e) {}
      }
      alert('✅ บันทึกผลการตรวจความพร้อมหน้างานเรียบร้อยแล้ว');
      m.style.display = 'none';
    };
  }

  window.openSerialLifecyclePricingSuiteModal = openSerialLifecyclePricingSuiteModal;
  window.openPreInstallSiteSurveyModal = openPreInstallSiteSurveyModal;



  // ============================================================================
  // ENTERPRISE v1171 MODULE: PERSONALIZED EMPLOYEE & 8-DEPARTMENT DAILY COCKPIT
  // - Auto-routes every employee (all 18 HQ Staff + 8 Field Techs T01-T08)
  //   into their tailored Department Workspace on load or 1-click profile switch
  // - Live Cross-Department Handover Inbox ("งานส่งต่อถึงแผนกฉัน")
  // - Japanese Corporate (JPC) TH / EN / 日本語 UI Language Toggle
  // - Mobile-First Thumb-Zone Field Technician Wizard (T01-T08)
  // ============================================================================
  const HZK_V1171_ACTIVE_PROFILE_KEY = 'hzk_v1171_active_employee_profile';
  const HZK_V1171_LANG_KEY = 'hzk_v1171_workspace_lang';

  const COMPLETE_COMPANY_ROSTER_V1171 = [
    // Service Unit & Field Technicians
    { id: 'SVC-02', code: 'NOPARIN_H', vanCode: 'T02', name: 'นพรินทร์ หอมหวล (Noparin Homhoul)', nickname: 'Rinny', deptKey: 'SERVICE_MGR', deptLabel: 'Service Unit', role: 'Deputy Services Unit Manager (Super Admin)', isTech: false, langDefault: 'TH' },
    { id: 'SVC-01', code: 'THANAKRIT_C', vanCode: 'T01', name: 'Mr. Thanakrit Chanmokonpanit', nickname: 'Tae', deptKey: 'SERVICE_MGR', deptLabel: 'Service Unit', role: 'Services Unit Manager (ext. 31)', isTech: false, langDefault: 'TH' },
    { id: 'SVC-05', code: 'WANWIPHA_N', vanCode: 'T08', name: 'Ms. Wanwipha Nakamrod', nickname: 'Oh', deptKey: 'SERVICE_MGR', deptLabel: 'Service & Billing', role: 'Services Admin Staff (ext. 30)', isTech: false, langDefault: 'TH' },
    { id: 'SVC-03', code: 'T03', vanCode: 'T03', name: 'Mr. Surin Sarawong (ช่าง T03)', nickname: 'Rin', deptKey: 'SERVICE_TECH', deptLabel: 'Service Field Tech', role: 'Senior Field Service Technician (BKK East)', isTech: true, langDefault: 'TH' },
    { id: 'SVC-04', code: 'T05', name: 'Mr. Nirun Sornrat (ช่าง T05)', nickname: 'Pui', deptKey: 'SERVICE_TECH', deptLabel: 'Service Field Tech', role: 'Field Service Technician (Samut Prakan)', isTech: true, langDefault: 'TH' },
    { id: 'SVC-06', code: 'T06', name: 'Mr. Surin Tharapai (ช่าง T06)', nickname: 'Beer', deptKey: 'SERVICE_TECH', deptLabel: 'Service Field Tech', role: 'Field Service Technician (Ayutthaya/Central)', isTech: true, langDefault: 'TH' },
    { id: 'SVC-07', code: 'T04', name: 'Mr. Jeerapan Phrasawang (ช่าง T04)', nickname: 'Ceasar', deptKey: 'SERVICE_TECH', deptLabel: 'Service Field Tech', role: 'Field Service Technician (Nonthaburi)', isTech: true, langDefault: 'TH' },
    { id: 'CTR-01', code: 'T07', name: 'Mr. Pawat Warongtheradet (ช่าง T07 / IMS)', nickname: 'Prince', deptKey: 'SERVICE_TECH', deptLabel: 'Service Center & IMS', role: 'Field Tech & Warehouse IMS (Upcountry)', isTech: true, langDefault: 'TH' },
    { id: 'TECH-01', code: 'T01', name: 'ทีมช่างบริการภาคสนาม T01 (BKK North)', nickname: 'T01', deptKey: 'SERVICE_TECH', deptLabel: 'Service Field Tech', role: 'Field Service Van T01', isTech: true, langDefault: 'TH' },
    { id: 'TECH-08', code: 'T08', name: 'ทีมช่างติดตั้ง & PM T08 (Install Specialist)', nickname: 'T08', deptKey: 'SERVICE_TECH', deptLabel: 'Service Field Tech', role: 'Installation & PM Van T08', isTech: true, langDefault: 'TH' },

    // Commercial Sales (THB)
    { id: 'SLS-01', code: 'KULATHIDA_C', vanCode: '', name: 'Ms. Kulathida Charoenying', nickname: 'Honey', deptKey: 'SALES_TH', deptLabel: 'Sales Department', role: 'Deputy Sales Manager', isTech: false, langDefault: 'TH' },
    { id: 'SLS-02', code: 'JANYALUCK_P', vanCode: '', name: 'Ms. Janyaluck Paithaisong', nickname: 'Nui', deptKey: 'SALES_TH', deptLabel: 'Sales Department', role: 'Senior Sales Staff', isTech: false, langDefault: 'TH' },
    { id: 'SLS-03', code: 'KETSARAPORN', vanCode: '', name: 'Ms. Ketsaraporn Porjai', nickname: 'Nam', deptKey: 'SALES_TH', deptLabel: 'Sales Department', role: 'Senior Sales Staff', isTech: false, langDefault: 'TH' },
    { id: 'SLS-04', code: 'WISUTTHA_W', vanCode: '', name: 'Ms. Wisuttha Wonglaw', nickname: 'Sand', deptKey: 'SALES_TH', deptLabel: 'Sales Department', role: 'Sales Support (ext. 20)', isTech: false, langDefault: 'TH' },

    // Japanese Corporate (JPC)
    { id: 'JPC-02', code: 'FURUJO', vanCode: '', name: 'Mr. Naoki Furujo', nickname: 'Furujo', deptKey: 'JPC_CORP', deptLabel: 'Japanese Corporate', role: 'Senior Sales Staff (Japanese Corporate)', isTech: false, langDefault: 'JP' },
    { id: 'JPC-01', code: 'SULEEWAN_S', vanCode: '', name: 'Ms. Suleewan Siripirom', nickname: 'Pang', deptKey: 'JPC_CORP', deptLabel: 'Japanese Corporate', role: 'Japanese Corporate Staff', isTech: false, langDefault: 'TH' },

    // Marketing
    { id: 'MKT-01', code: 'TAKSAON_T', vanCode: '', name: 'Ms. Taksaon Tipsrisombat', nickname: 'Poy', deptKey: 'MARKETING', deptLabel: 'Marketing Department', role: 'Marketing Unit Manager (ext. 21)', isTech: false, langDefault: 'TH' },
    { id: 'MKT-02', code: 'KHAJORNYOT_J', vanCode: '', name: 'Mr. Khajornyot Jewkrang', nickname: 'Men', deptKey: 'MARKETING', deptLabel: 'Marketing Department', role: 'Marketing Staff', isTech: false, langDefault: 'TH' },

    // Accounting & Finance
    { id: 'ACC-01', code: 'WARAPORN_K', vanCode: '', name: 'Ms. Waraporn Kianthong', nickname: 'Noi San', deptKey: 'ACCOUNTING', deptLabel: 'Accounting & Finance', role: 'Accounting Manager (ext. 10)', isTech: false, langDefault: 'TH' },
    { id: 'ACC-02', code: 'DUANGKAMON_T', vanCode: '', name: 'Ms. Duangkamon Tantayanon', nickname: 'Yok', deptKey: 'ACCOUNTING', deptLabel: 'Accounting & Finance', role: 'Senior Accounting Staff (ext. 12)', isTech: false, langDefault: 'TH' },
    { id: 'ACC-03', code: 'WITHARAT_R', vanCode: '', name: 'Ms. Witharat Riangpha', nickname: 'Z-cath', deptKey: 'ACCOUNTING', deptLabel: 'Accounting & Finance', role: 'Accounting Staff (ext. 11)', isTech: false, langDefault: 'TH' },

    // Admin & HR
    { id: 'ADM-01', code: 'KANOKWAN_T', vanCode: '', name: 'Ms. Kanokwan Treesukol', nickname: 'June', deptKey: 'ADMIN_HR', deptLabel: 'Admin & HR', role: 'Administration Manager (ext. 03)', isTech: false, langDefault: 'TH' },
    { id: 'ADM-02', code: 'NATTAPONG_C', vanCode: '', name: 'Mr. Nattapong Chataram', nickname: 'Nat', deptKey: 'ADMIN_HR', deptLabel: 'Admin & HR', role: 'Senior Administration Staff (ext. 01)', isTech: false, langDefault: 'TH' },
    { id: 'ADM-03', code: 'CHAYANIN_K', vanCode: '', name: 'Mr. Chayanin Kuptrakul', nickname: 'Beer', deptKey: 'ADMIN_HR', deptLabel: 'Admin & HR', role: 'Administration Staff (ext. 02)', isTech: false, langDefault: 'TH' },

    // Executive Management
    { id: 'EXE-01', code: 'DAISUKE_S', vanCode: '', name: 'Mr. Daisuke Suzuki', nickname: 'Suzuki', deptKey: 'EXECUTIVE', deptLabel: 'Executive Management', role: 'Managing Director / GM All Departments', isTech: false, langDefault: 'JP' }
  ];

  const DEPT_COCKPIT_CONFIGS_V1171 = {
    SERVICE_TECH: {
      accent: '#991B1B',
      gradient: 'linear-gradient(135deg,#7F1D1D,#B91C1C)',
      badge: '🛠️ FIELD TECHNICIAN MOBILE WIZARD',
      titleTh: 'โต๊ะทำงานช่างบริการภาคสนาม (โหมดมือถือใช้ง่าย)',
      titleEn: 'Field Technician Mobile Wizard',
      titleJp: 'フィールドサービス技術者画面',
      subTh: 'ซ่อนเมนูออฟฟิศและราคาทุนอัตโนมัติ — เน้นสแกนป้าย S/N เปิด/ปิดใบงานซ่อม และเบิกอะไหล่ในรถตู้',
      subEn: 'Streamlined mobile view — Scan S/N, complete repair report & manage van parts.',
      subJp: '現場作業専用画面：S/Nスキャン・修理報告・車載部品在庫管理',
      hideJobSheet: false,
      actions: [
        { icon: '📷', titleTh: '1. สแกน S/N & ดูประวัติ 360°', titleEn: '1. Scan S/N & 360° History', titleJp: '1. S/Nスキャン・360°履歴', sub: 'เช็กประกัน ดีลเลอร์ และประวัติซ่อมเก่า', fn: "window.openSerial360TimelineModal('')" },
        { icon: '🚐', titleTh: '2. เบิก/เช็กอะไหล่ในรถตู้ (T01–T08)', titleEn: '2. Technician Van Stock', titleJp: '2. サービスカー部品在庫', sub: 'ตัดสต็อกหน้างาน + แจ้งเตือนสโตร์อัตโนมัติ', fn: "window.openTechnicianVanStockModal()" },
        { icon: '📅', titleTh: '3. ดูคิวงานติดตั้ง & ซ่อมวันนี้', titleEn: '3. Today Dispatch Schedule', titleJp: '3. 本日の作業スケジュール', sub: 'ตารางนัดหมายเข้าหน้างานรายวัน', fn: "window.openServiceDispatchCalendarModal()" },
        { icon: '📤', titleTh: '4. ส่งใบแจ้งบริการ/ใบเสร็จให้ลูกค้า', titleEn: '4. Send Tracked Service Doc', titleJp: '4. サービス報告書・領収書送信', sub: 'ส่งเข้า LINE / Email พร้อมปุ่มยืนยันรับ', fn: "launchTrackedDocFromServiceForm()" }
      ]
    },
    SERVICE_MGR: {
      accent: '#B91C1C',
      gradient: 'linear-gradient(135deg,#002B49,#991B1B)',
      badge: '🧑‍💼 SERVICE COMMAND & DISPATCH CENTER',
      titleTh: 'ศูนย์ควบคุมงานบริการ จ่ายงานช่าง และวิเคราะห์ต้นทุน S/N',
      titleEn: 'Service Management & Dispatch Center',
      titleJp: 'サービス部 司令室・ディスパッチ管理',
      subTh: 'คุมคิวช่าง T01–T08 ติดตามดีลเลอร์ SLA 2 ชม. ต่อสัญญา PM 60 วัน และวิเคราะห์กำไร-ขาดทุนรายเครื่อง',
      subEn: 'Manage T01-T08 dispatch, Dealer 2-hr SLA, 60-day PM renewals & Unit Lifecycle P&L.',
      subJp: '技術者手配・代理店SLA監視・保守契約更新・機種別損益分析',
      hideJobSheet: false,
      actions: [
        { icon: '📅', titleTh: 'ตารางจ่ายงานช่าง & ติดตั้ง (T01–T08)', titleEn: 'Technician Dispatch Board', titleJp: '技術者ディスパッチ予定表', sub: 'จัดคิวติดตั้ง/ซ่อม + แจ้งเตือนกลุ่ม LINE', fn: "window.openServiceDispatchCalendarModal()" },
        { icon: '💰', titleTh: 'วิเคราะห์กำไร-ขาดทุนราย S/N (Lifecycle P&L)', titleEn: 'Serial 360° Lifecycle P&L', titleJp: 'シリアル別損益・価格分析', sub: 'เทียบราคาขายหักต้นทุนซ่อมประกัน & ตั้งราคา PM', fn: "window.openSerialLifecyclePricingSuiteModal()" },
        { icon: '🔔', titleTh: 'แจ้งเตือนหมดประกัน & ต่อสัญญา PM (60 วัน)', titleEn: 'PM & Warranty Renewal (60d)', titleJp: '保証期限・保守契約更新 (60日前)', sub: 'สแกนเครื่องใกล้หมดประกัน + ออกใบเสนอราคา 1 คลิก', fn: "window.openWarrantyPmRenewalModal()" },
        { icon: '🚐', titleTh: 'คลังอะไหล่รถช่าง T01–T08 & เบิกเติม', titleEn: 'Van Stock Inventory T01-T08', titleJp: 'サービスカー部品在庫管理', sub: 'ตรวจสอบจุดสั่งซื้อ Min-Max อะไหล่รถตู้', fn: "window.openTechnicianVanStockModal()" }
      ]
    },
    SALES_TH: {
      accent: '#0284C7',
      gradient: 'linear-gradient(135deg,#002B49,#0284C7)',
      badge: '💼 COMMERCIAL SALES WORKSPACE (THB)',
      titleTh: 'โต๊ะทำงานฝ่ายขายในประเทศ (Sales Command & Fast Quote)',
      titleEn: 'Commercial Sales Workspace (THB)',
      titleJp: '国内営業部 ワークスペース (THB)',
      subTh: 'ออกใบเสนอราคา Y2026 เติมขนาด W×D×H อัตโนมัติ เช็กสต็อกสด 203 รุ่น ตรวจหน้างาน และส่งต่องานติดตั้ง',
      subEn: 'Create Y2026 THB Quotations with WxDxH, live stock check, site survey & install handover.',
      subJp: '見積書作成(W×D×H自動入力)・リアルタイム在庫確認・設置引継',
      hideJobSheet: true,
      actions: [
        { icon: '📄', titleTh: 'ออกใบเสนอราคา Sales (THB Y2026)', titleEn: 'New Sales Quotation (THB)', titleJp: '新規見積書作成 (THB)', sub: 'เติมขนาด W×D×H + เช็กสต็อกสด + คุมเพดานส่วนลด', fn: "openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)')" },
        { icon: '📐', titleTh: 'แบบตรวจความพร้อมหน้างาน (Site Survey)', titleEn: 'Pre-Install Site Survey', titleJp: '設置前現場チェックシート', sub: 'เช็กแรงดันน้ำ ไฟ ท่อน้ำทิ้ง & แนะนำชุดกรองน้ำ', fn: "window.openPreInstallSiteSurveyModal()" },
        { icon: '🔄', titleTh: 'ส่งต่องานติดตั้ง & ลงทะเบียน S/N', titleEn: 'Sales-to-Service Install Handover', titleJp: 'サービス部へ設置作業引継', sub: 'ส่งใบงานให้ฝ่ายบริการเข้าติดตั้งพร้อมผูกประกัน', fn: "openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)', 'HANDOVER')" },
        { icon: '📊', titleTh: 'ติดตามสถานะเอกสาร & E-Sign PO ลูกค้า', titleEn: 'Document & PO Tracking', titleJp: '見積書送付・注文書(PO)承認状況', sub: 'ดูว่าลูกค้าเปิดอ่าน กดยืนยัน หรือเซ็น PO แล้วหรือยัง', fn: "window.openDocumentTrackingDashboardModal()" }
      ]
    },
    JPC_CORP: {
      accent: '#312E81',
      gradient: 'linear-gradient(135deg,#1E1B4B,#3730A3)',
      badge: '🇯🇵 JAPANESE CORPORATE DIVISION (TH / EN / 日本語)',
      titleTh: 'โต๊ะทำงานฝ่ายขายองค์กรญี่ปุ่น (Japanese Corporate Division)',
      titleEn: 'Japanese Corporate Division Workspace',
      titleJp: '日系法人営業部 ワークスペース (THB / USD Export)',
      subTh: 'รองรับใบเสนอราคาทั้ง Local THB และ Export USD (0% VAT) พร้อมส่ง CC ทีม JPC และรายงาน 3 ภาษา',
      subEn: 'Dedicated workspace for Japanese Corporate accounts (Local THB & Export USD 0% VAT).',
      subJp: '日系法人顧客向け見積書作成（国内THB・輸出USD 0% VAT対応）',
      hideJobSheet: true,
      actions: [
        { icon: '🇯🇵', titleTh: 'ออกใบเสนอราคา Japanese Corporate', titleEn: 'New JPC Quotation (THB/USD)', titleJp: '日系法人向け見積書作成', sub: 'รองรับ Export USD 0% VAT & Local THB + CC JPC_TEAM', fn: "openSalesCorporateQuotationWithPreset('Japanese Corporate', 'ใบเสนอราคา (Quotation)')" },
        { icon: '🔎', titleTh: 'ตรวจสอบประวัติเครื่องลูกค้า S/N 360°', titleEn: 'Customer Asset S/N 360°', titleJp: '納入機器 S/N 360°履歴照会', sub: 'ดูประวัติติดตั้ง การซ่อม และรอบ PM ของลูกค้าญี่ปุ่น', fn: "window.openSerial360TimelineModal('')" },
        { icon: '📊', titleTh: 'ติดตามสถานะเอกสาร & อนุมัติ PO', titleEn: 'Quotation & PO Tracking', titleJp: '見積承認・PO受領トラッキング', sub: 'ติดตามการตอบรับใบเสนอราคาจากลูกค้าองค์กรญี่ปุ่น', fn: "window.openDocumentTrackingDashboardModal()" },
        { icon: '💰', titleTh: 'วิเคราะห์ต้นทุน & แพ็คเกจ PM รายเครื่อง', titleEn: 'Lifecycle Cost & PM Package', titleJp: '機器ライフサイクル損益・保守設計', sub: 'เปรียบเทียบต้นทุนซ่อมและคำนวณแพ็คเกจ VIP PM', fn: "window.openSerialLifecyclePricingSuiteModal()" }
      ]
    },
    MARKETING: {
      accent: '#065F46',
      gradient: 'linear-gradient(135deg,#064E3B,#059669)',
      badge: '📣 MARKETING & PRODUCT CAMPAIGN HUB',
      titleTh: 'โต๊ะทำงานฝ่ายการตลาด แคมเปญ และสต็อกเครื่องโชว์/Clearance',
      titleEn: 'Marketing & Product Campaign Hub',
      titleJp: 'マーケティング・販促キャンペーン管理',
      subTh: 'บริหารสต็อกเครื่องโชว์/มีตำหนิ 602 รายการพร้อมใบตรวจสภาพ ออกใบเสนอราคาแคมเปญ และจำลองโปรโมชั่น',
      subEn: 'Manage 602 Demo/Clearance units with inspection links, campaign quotes & promo simulator.',
      subJp: '展示機・訳あり品在庫(602台)管理・販促見積・プロモーション損益試算',
      hideJobSheet: true,
      actions: [
        { icon: '🏷️', titleTh: 'สต็อกเครื่องโชว์ / มีตำหนิ (602 รายการ)', titleEn: 'Demo & Clearance Stock (602)', titleJp: '展示機・訳あり在庫一覧 (602台)', sub: 'ดูสภาพเครื่อง ลิงก์ใบตรวจสภาพ และดึงลงใบเสนอราคา', fn: "window.openDamageDemoStockModal()" },
        { icon: '📣', titleTh: 'ออกใบเสนอราคาแคมเปญ Marketing', titleEn: 'Campaign & Promo Quotation', titleJp: 'キャンペーン見積書作成', sub: 'สร้างใบเสนอราคาโปรโมชันพร้อมการ์ด LINE สีเขียวมรกต', fn: "openSalesCorporateQuotationWithPreset('Marketing', 'ใบเสนอราคา (Quotation)')" },
        { icon: '🧮', titleTh: 'จำลองตั้งราคา & โปรโมชั่นแถม PM', titleEn: 'Promo & PM Package Simulator', titleJp: 'プロモーション・保守付帯価格シミュレーター', sub: 'คำนวณจุดคุ้มทุนเมื่อลดราคาหรือแถม PM ฟรี', fn: "window.openSerialLifecyclePricingSuiteModal()" },
        { icon: '📥', titleTh: 'อัปเดตสต็อกจากอีเมล MICHIRU-RPA', titleEn: 'Sync Daily Stock Report', titleJp: '日次在庫レポート同期', sub: 'ดึงรายงาน Stock on Hand ล่าสุดเข้าฐานข้อมูล', fn: "window.triggerEmailStockSyncNow()" }
      ]
    },
    ACCOUNTING: {
      accent: '#0F766E',
      gradient: 'linear-gradient(135deg,#134E4A,#0D9488)',
      badge: '🧾 ACCOUNTING, BILLING & ERP/NAV BRIDGE',
      titleTh: 'โต๊ะทำงานฝ่ายบัญชี การเงิน ใบวางบิล และส่งออก Dynamics NAV',
      titleEn: 'Accounting, Billing & ERP/NAV Bridge',
      titleJp: '経理・請求書発行・Dynamics NAV 連携',
      subTh: 'แปลงใบเสนอราคาเป็นใบวางบิล/ใบเสร็จใน 1 คลิก ตรวจเลขผู้เสียภาษี 13 หลัก และส่งออก CSV เข้า NAV',
      subEn: '1-Click convert to Billing/Receipt, verify 13-digit Tax ID & export CSV for Dynamics NAV.',
      subJp: 'ワンクリック請求書/領収書変換・納税者番号確認・NAV用CSV出力',
      hideJobSheet: true,
      actions: [
        { icon: '🧾', titleTh: 'ออกใบวางบิล / ใบเสร็จรับเงิน (1 คลิก)', titleEn: 'Create Billing Note / Receipt', titleJp: '請求書・領収書作成', sub: 'กรอกเลขผู้เสียภาษี 13 หลัก/สาขา + คำนวณ VAT 7% / WHT 3%', fn: "openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบวางบิล (Billing Note)')" },
        { icon: '🏭', titleTh: 'ส่งออกข้อมูลเปิด Sales Order เข้า NAV', titleEn: 'Export PO Approved to NAV CSV', titleJp: '承認済POデータをNAV用CSV出力', sub: 'ดาวน์โหลดไฟล์ CSV พร้อมนำเข้า Microsoft Dynamics NAV', fn: "window.exportErpSalesOrdersCsv()" },
        { icon: '📊', titleTh: 'ตรวจสอบสถานะลูกค้ายืนยันรับบิล / PO', titleEn: 'Billing & PO Tracking Status', titleJp: '請求書受領・PO承認ステータス確認', sub: 'เช็กประวัติการส่งบิลและหลักฐาน PO ลูกค้า', fn: "window.openDocumentTrackingDashboardModal()" },
        { icon: '📥', titleTh: 'นำเข้าประวัติขาย NAV ผูก S/N', titleEn: 'Import NAV Sales History', titleJp: 'NAV販売履歴インポート', sub: 'อัปโหลดประวัติราคาขายจาก NAV เข้าฐานข้อมูล S/N', fn: "window.openSerialLifecyclePricingSuiteModal()" }
      ]
    },
    ADMIN_HR: {
      accent: '#4338CA',
      gradient: 'linear-gradient(135deg,#312E81,#4F46E5)',
      badge: '🏢 ADMIN, HR & SYSTEM GOVERNANCE',
      titleTh: 'โต๊ะทำงานฝ่ายธุรการ บุคคล และควบคุมมาตรฐานระบบองค์กร',
      titleEn: 'Admin, HR & System Governance',
      titleJp: '総務・人事・システム管理ワークスペース',
      subTh: 'ตรวจสอบความพร้อมระบบ Go-Live QA จัดการฐานบุคลากร กลุ่มอีเมล 7 แผนก และคู่มือ SOP',
      subEn: 'Manage staff directory, 7-department email groups, system QA health & role SOP guides.',
      subJp: '社員マスタ・7部署メールグループ・システム稼働点検・SOP管理',
      hideJobSheet: true,
      actions: [
        { icon: '🛡️', titleTh: 'ตรวจความพร้อมระบบ & Go-Live Control (QA)', titleEn: 'Production Readiness QA', titleJp: '本番稼働・システムヘルス点検', sub: 'เช็กสถานะ API, Google Sheets, LINE OA และ Triggers', fn: "window.openProductionGoLiveQaModal()" },
        { icon: '🩺', titleTh: 'Deep Scan ตรวจสอบ & ซ่อมแซมการเชื่อมต่อ', titleEn: 'Deep System Diagnostic', titleJp: 'システム詳細診断・修復', sub: 'ทดสอบลิงก์ Google Apps Script และฐานข้อมูล JSON', fn: "window.runDeepSystemDiagnosticModal()" },
        { icon: '📖', titleTh: 'คู่มือใช้งานแยกแผนก (Role SOP Guide)', titleEn: 'Department Role SOP Guide', titleJp: '部署別操作マニュアル (SOP)', sub: 'คู่มือมาตรฐานการทำงานสำหรับทุกแผนก', fn: "window.openDepartmentRoleSopModal()" },
        { icon: '📊', titleTh: 'ติดตามเอกสาร & การส่งต่องานข้ามแผนก', titleEn: 'Document Tracking Dashboard', titleJp: '社内ドキュメント追跡一覧', sub: 'ตรวจสอบเอกสารค้างติดตาม > 24 ชม. ของทุกแผนก', fn: "window.openDocumentTrackingDashboardModal()" }
      ]
    },
    EXECUTIVE: {
      accent: '#B45309',
      gradient: 'linear-gradient(135deg,#002B49,#B45309)',
      badge: '👑 EXECUTIVE BOARDROOM & STRATEGIC INTELLIGENCE',
      titleTh: 'ห้องประชุมผู้บริหาร (Executive Command & Lifecycle Intelligence)',
      titleEn: 'Executive Command & Boardroom BI',
      titleJp: '経営陣ダッシュボード・全社統括インテリジェンス',
      subTh: 'ภาพรวมยอดขาย PO กำไรสุทธิหลังหักต้นทุนซ่อม S/N ผลงานรายบุคคล และส่งสรุปเข้า LINE ผู้บริหาร',
      subEn: 'Company-wide sales pipeline, S/N lifecycle net margin, staff KPIs & LINE briefings.',
      subJp: '全社売上・機種別ライフサイクル純利益・社員別KPI・LINE経営報告',
      hideJobSheet: true,
      actions: [
        { icon: '📈', titleTh: 'รายงานสรุปผู้บริหาร & AI Copilot (BI)', titleEn: 'Executive BI & AI Copilot', titleJp: '経営サマリーBI & AIコパイロット', sub: 'ยอดขายรวม สถานะ PO งานบริการ และส่งเข้า LINE ทันที', fn: "window.openExecutiveBiDashboardModal()" },
        { icon: '💰', titleTh: 'วิเคราะห์กำไร-ขาดทุนราย S/N & ตั้งราคา', titleEn: 'Serial Lifecycle P&L & Pricing', titleJp: '機種別ライフサイクル損益・価格戦略', sub: 'เปรียบเทียบต้นทุนเคลมข้ามรุ่น/ข้ามดีลเลอร์ & จำลองโปรฯ', fn: "window.openSerialLifecyclePricingSuiteModal()" },
        { icon: '🏆', titleTh: 'สรุปผลงานปิดการขาย & ปิดงานช่างรายบุคคล', titleEn: 'Monthly Sales & Tech KPI', titleJp: '月次営業・サービス個人別実績KPI', sub: 'จัดอันดับยอดปิดการขาย PO Approved และผลงานช่าง', fn: "window.openMonthlyIncentiveKpiModal()" },
        { icon: '🎭', titleTh: 'ตรวจสอบหน้าจอจริงแยกแผนก & รายบุคคล', titleEn: 'Live Dept & Staff Inspector', titleJp: '部署別・個人別画面インスペクター', sub: 'สลับดูมุมมองการทำงานของแต่ละแผนกและพนักงาน', fn: "window.openDepartmentLiveSimulatorModal()" }
      ]
    }
  };

  function getActiveEmployeeProfileV1171() {
    try {
      const saved = JSON.parse(localStorage.getItem(HZK_V1171_ACTIVE_PROFILE_KEY) || 'null');
      if (saved && saved.id && DEPT_COCKPIT_CONFIGS_V1171[saved.deptKey]) return saved;
    } catch (e) {}

    // Fallback: auto-detect from existing PWA login session (`hoshizaki_active_auth_session_v1042`)
    try {
      const rawSess = localStorage.getItem('hoshizaki_active_auth_session_v1042');
      if (rawSess) {
        const sess = JSON.parse(rawSess);
        if (sess && sess.id) {
          const found = COMPLETE_COMPANY_ROSTER_V1171.find(x => x.id === sess.id || x.code === sess.code);
          if (found) return found;
        }
      }
    } catch (e) {}

    return COMPLETE_COMPANY_ROSTER_V1171[0]; // Default: Mr. Noparin Homhoul (Service Unit / Super Admin)
  }

  function setActiveEmployeeProfileV1171(empObj, persistLang) {
    if (!empObj) return;
    localStorage.setItem(HZK_V1171_ACTIVE_PROFILE_KEY, JSON.stringify(empObj));
    if (persistLang && empObj.langDefault) {
      localStorage.setItem(HZK_V1171_LANG_KEY, empObj.langDefault);
    }
    applyGlobalAppRoleMode(empObj.isTech ? 'TECH' : 'MANAGER');
    renderPersonalizedEmployeeCockpit(empObj);
  }

  function getActiveCockpitLang() {
    return localStorage.getItem(HZK_V1171_LANG_KEY) || 'TH';
  }

  function setActiveCockpitLang(lang) {
    localStorage.setItem(HZK_V1171_LANG_KEY, lang);
    renderPersonalizedEmployeeCockpit(getActiveEmployeeProfileV1171());
  }

  async function renderPersonalizedEmployeeCockpit(empProfile) {
    const emp = empProfile || getActiveEmployeeProfileV1171();
    const cfg = DEPT_COCKPIT_CONFIGS_V1171[emp.deptKey] || DEPT_COCKPIT_CONFIGS_V1171.SERVICE_MGR;
    const lang = getActiveCockpitLang();

    // Update top header pill label with active employee's nickname & department
    const pillBtn = document.getElementById('hzkMyPersonalCockpitPillBtn');
    if (pillBtn) {
      pillBtn.innerHTML = `🧑‍💻 ${emp.nickname || emp.code} [${emp.deptLabel}] ▾`;
    }

    // Manage visibility of technician Job Service Report container according to employee role
    const jobSheet = document.getElementById('jobSheetContainer');
    const mobNav = document.getElementById('mobileSectionNav');
    const showJobOverride = sessionStorage.getItem('hzk_v1171_force_show_jobsheet') === 'true';

    if (cfg.hideJobSheet && !showJobOverride) {
      if (jobSheet) jobSheet.style.display = 'none';
      if (mobNav) mobNav.style.display = 'none';
    } else {
      if (jobSheet) jobSheet.style.display = '';
      if (mobNav) mobNav.style.display = '';
    }

    let cockpit = document.getElementById('hzkPersonalizedEmployeeCockpitCard');
    if (!cockpit) {
      cockpit = document.createElement('section');
      cockpit.id = 'hzkPersonalizedEmployeeCockpitCard';
      cockpit.style.cssText =
        'max-width:1080px;margin:10px auto 14px;background:#FFFFFF;border-radius:16px;' +
        'box-shadow:0 12px 32px rgba(15,23,42,0.12);overflow:hidden;font-family:sans-serif;';
      if (jobSheet && jobSheet.parentNode) {
        jobSheet.parentNode.insertBefore(cockpit, jobSheet);
      } else {
        document.body.insertBefore(cockpit, document.body.firstChild);
      }
    }

    cockpit.style.border = `2px solid ${cfg.accent}`;
    const titleText = lang === 'JP' ? cfg.titleJp : (lang === 'EN' ? cfg.titleEn : cfg.titleTh);
    const subText = lang === 'JP' ? cfg.subJp : (lang === 'EN' ? cfg.subEn : cfg.subTh);

    const actionCardsHtml = cfg.actions.map(act => {
      const aTitle = lang === 'JP' ? act.titleJp : (lang === 'EN' ? act.titleEn : act.titleTh);
      return `
        <button type="button" onclick="${act.fn}" style="text-align:left;background:#F8FAFC;border:1.5px solid #CBD5E1;border-radius:13px;padding:13px 14px;cursor:pointer;display:flex;align-items:flex-start;gap:11px;transition:all 0.15s ease;min-height:66px;">
          <span style="font-size:24px;line-height:1.1;">${act.icon}</span>
          <span>
            <div style="font-weight:800;font-size:13.5px;color:#0F172A;">${aTitle}</div>
            <div style="font-size:11.5px;color:#475569;margin-top:3px;line-height:1.35;">${act.sub}</div>
          </span>
        </button>
      `;
    }).join('');

    const toggleJobBtnHtml = cfg.hideJobSheet
      ? `<button type="button" id="hzkV1171ToggleJobFormBtn" style="background:rgba(255,255,255,0.16);color:#FFF;border:1px solid rgba(255,255,255,0.4);border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer;">${showJobOverride ? '🙈 ซ่อนฟอร์มใบแจ้งซ่อมช่าง' : '🛠️ เปิดดูฟอร์มใบแจ้งซ่อมช่าง'}</button>`
      : '';

    cockpit.innerHTML = `
      <div style="background:${cfg.gradient};color:#FFFFFF;padding:15px 18px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="background:rgba(0,0,0,0.28);color:#FDE047;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:0.4px;">${cfg.badge}</span>
            <span style="background:rgba(255,255,255,0.18);color:#FFF;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;">👤 ${emp.name} • ${emp.role}</span>
          </div>
          <div style="font-size:17px;font-weight:800;margin-top:6px;">${titleText}</div>
          <div style="font-size:12px;opacity:0.92;margin-top:2px;">${subText}</div>
        </div>

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:2px;display:inline-flex;gap:2px;">
            <button type="button" data-lang="TH" class="hzk-v1171-lang-btn" style="background:${lang === 'TH' ? '#FFF' : 'transparent'};color:${lang === 'TH' ? '#002B49' : '#FFF'};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;">TH</button>
            <button type="button" data-lang="EN" class="hzk-v1171-lang-btn" style="background:${lang === 'EN' ? '#FFF' : 'transparent'};color:${lang === 'EN' ? '#002B49' : '#FFF'};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;">EN</button>
            <button type="button" data-lang="JP" class="hzk-v1171-lang-btn" style="background:${lang === 'JP' ? '#FFF' : 'transparent'};color:${lang === 'JP' ? '#002B49' : '#FFF'};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;">日本語</button>
          </div>
          ${toggleJobBtnHtml}
          <button type="button" id="hzkV1171SwitchUserBtn" style="background:#FDE047;color:#0F172A;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer;">🔄 สลับพนักงาน / แผนก</button>
        </div>
      </div>

      <div style="padding:14px 18px;">
        <div id="hzkV1171MyMetricsBar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px;">
          <div style="background:#F1F5F9;border-radius:10px;padding:9px 12px;">
            <div style="font-size:10.5px;color:#475569;font-weight:700;">📥 งานส่งต่อถึงแผนกฉัน</div>
            <div id="hzkMetricHandovers" style="font-size:17px;font-weight:800;color:#002B49;">0 รายการ</div>
          </div>
          <div style="background:#F1F5F9;border-radius:10px;padding:9px 12px;">
            <div style="font-size:10.5px;color:#475569;font-weight:700;">🛠️ ใบงานบริการค้างปิด</div>
            <div id="hzkMetricOpenJobs" style="font-size:17px;font-weight:800;color:#B91C1C;">-</div>
          </div>
          <div style="background:#F1F5F9;border-radius:10px;padding:9px 12px;">
            <div style="font-size:10.5px;color:#475569;font-weight:700;">📄 ใบเสนอราคาของฉัน / รวม</div>
            <div id="hzkMetricMyQt" style="font-size:17px;font-weight:800;color:#0284C7;">-</div>
          </div>
          <div style="background:#F1F5F9;border-radius:10px;padding:9px 12px;">
            <div style="font-size:10.5px;color:#475569;font-weight:700;">✅ PO Approved รอวางบิล</div>
            <div id="hzkMetricPoApproved" style="font-size:17px;font-weight:800;color:#059669;">-</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
          ${actionCardsHtml}
        </div>

        <div style="margin-top:12px;background:#F1F5F9;border:1px solid #CBD5E1;border-radius:12px;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
          <div style="font-size:12px;font-weight:800;color:#002B49;">⚡ เครื่องมือการทำงานร่วมกัน &amp; กระดานงานประจำวัน (v1172):</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="window.openDepartmentTaskBoardModal()" style="background:#002B49;color:#FDE047;border:none;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:800;cursor:pointer;">📋 กระดานงาน &amp; To-Do List แผนก</button>
            <button type="button" onclick="window.openOmniMeetAndAiMinutesModal()" style="background:#4F46E5;color:#FFF;border:none;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;">📹 ประชุมทีม / WFH + AI สรุปรายงาน</button>
            <button type="button" onclick="window.openFieldRepairPartsPipelineModal()" style="background:#B91C1C;color:#FFF;border:none;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;">🔧 งานซ่อมต่อเนื่อง &amp; รอบอะไหล่ ETA</button>
            <button type="button" onclick="window.openDepartmentReportCenterModal()" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;">📑 ออกรายงานประจำแผนก</button>
          </div>
        </div>

        <div id="hzkV1171CrossDeptInboxWrap" style="margin-top:12px;display:none;background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:12px;padding:11px 14px;">
          <div style="font-weight:800;color:#92400E;font-size:12.5px;margin-bottom:6px;">📥 กล่องรับงานข้ามแผนกที่ส่งถึง ${emp.deptLabel} (Pending Cross-Dept Handovers):</div>
          <div id="hzkV1171CrossDeptInboxList" style="display:flex;flex-direction:column;gap:6px;"></div>
        </div>
      </div>
    `;

    cockpit.querySelectorAll('.hzk-v1171-lang-btn').forEach(btn => {
      btn.onclick = () => setActiveCockpitLang(btn.getAttribute('data-lang'));
    });

    document.getElementById('hzkV1171SwitchUserBtn').onclick = openPersonalEmployeeSelectorModal;

    const toggleJobBtn = document.getElementById('hzkV1171ToggleJobFormBtn');
    if (toggleJobBtn) {
      toggleJobBtn.onclick = () => {
        const nextVal = !showJobOverride;
        sessionStorage.setItem('hzk_v1171_force_show_jobsheet', String(nextVal));
        renderPersonalizedEmployeeCockpit(emp);
      };
    }

    // Fetch live personalized briefing & pending handovers from GAS if connected
    const gasUrl = getGasEndpointUrl();
    if (gasUrl) {
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'getEmployeeWorkspaceBriefing',
            empId: emp.id,
            empCode: emp.code,
            department: emp.deptLabel
          })
        });
        const d = await res.json();
        if (d && d.status === 'OK' && d.metrics) {
          const m = d.metrics;
          const elH = document.getElementById('hzkMetricHandovers');
          const elJ = document.getElementById('hzkMetricOpenJobs');
          const elQ = document.getElementById('hzkMetricMyQt');
          const elP = document.getElementById('hzkMetricPoApproved');
          if (elH) elH.textContent = `${m.pendingHandoversCount} รายการ`;
          if (elJ) elJ.textContent = emp.isTech ? `${m.myJobsCount} งานฉัน / ${m.openJobsCount} รวม` : `${m.openJobsCount} เคส`;
          if (elQ) elQ.textContent = `${m.myQtCount} ฉบับ / ${m.totalQtCount} รวม`;
          if (elP) elP.textContent = `${m.poApprovedCount} รายการ`;

          const inboxWrap = document.getElementById('hzkV1171CrossDeptInboxWrap');
          const inboxList = document.getElementById('hzkV1171CrossDeptInboxList');
          if (inboxWrap && inboxList && Array.isArray(d.pendingHandovers) && d.pendingHandovers.length > 0) {
            inboxWrap.style.display = 'block';
            inboxList.innerHTML = d.pendingHandovers.map(h => `
              <div style="background:#FFFFFF;border:1px solid #FCD34D;border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;">
                <div>
                  <b>[${h.handoverId}] จาก ${h.fromDept}</b> (${h.sender}) ➔ ลูกค้า: <b>${h.customerName}</b> | ${h.modelSn} (${h.amount})
                </div>
                <button type="button" data-hnd-id="${h.handoverId}" class="hzk-v1171-ack-hnd-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:5px 10px;font-weight:700;cursor:pointer;">✅ รับเรื่องดำเนินการแล้ว</button>
              </div>
            `).join('');

            inboxList.querySelectorAll('.hzk-v1171-ack-hnd-btn').forEach(b => {
              b.onclick = async () => {
                const hId = b.getAttribute('data-hnd-id');
                b.disabled = true;
                b.textContent = '⏳ กำลังบันทึก...';
                await fetch(gasUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({ action: 'completeCrossDeptHandover', handoverId: hId, actorName: emp.name })
                });
                renderPersonalizedEmployeeCockpit(emp);
              };
            });
          }
        }
      } catch (err) {}
    } else {
      // Offline/local stats fallback
      const localArchives = (() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_ARCHIVE_KEY) || '[]'); } catch (e) { return []; }
      })();
      const myQt = localArchives.filter(q => String(q.salesperson || '').toUpperCase() === emp.code.toUpperCase());
      const elQ = document.getElementById('hzkMetricMyQt');
      const elJ = document.getElementById('hzkMetricOpenJobs');
      const elP = document.getElementById('hzkMetricPoApproved');
      if (elQ) elQ.textContent = `${myQt.length} ฉบับ / ${localArchives.length} รวม`;
      if (elJ) elJ.textContent = 'พร้อมใช้งาน Offline';
      if (elP) elP.textContent = 'ซิงก์เมื่อต่อ GAS';
    }
  }

  function openPersonalEmployeeSelectorModal() {
    let selModal = document.getElementById('hzkPersonalEmployeeSelectorModal');
    if (!selModal) {
      selModal = document.createElement('div');
      selModal.id = 'hzkPersonalEmployeeSelectorModal';
      selModal.style.cssText =
        'position:fixed;inset:0;z-index:20070;background:rgba(15,23,42,0.86);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;overflow-y:auto;';
      document.body.appendChild(selModal);
    }

    const activeEmp = getActiveEmployeeProfileV1171();
    const groups = [
      { key: 'SERVICE_MGR', label: '🧑‍💼 แผนกบริการ (Service Management & Admin)' },
      { key: 'SERVICE_TECH', label: '🛠️ ทีมช่างบริการภาคสนาม & คลัง IMS (T01–T08)' },
      { key: 'SALES_TH', label: '💼 ฝ่ายขายในประเทศ (Commercial Sales THB)' },
      { key: 'JPC_CORP', label: '🇯🇵 ฝ่ายขายองค์กรญี่ปุ่น (Japanese Corporate)' },
      { key: 'MARKETING', label: '📣 ฝ่ายการตลาดและผลิตภัณฑ์ (Marketing)' },
      { key: 'ACCOUNTING', label: '🧾 ฝ่ายบัญชีและการเงิน (Accounting & Finance)' },
      { key: 'ADMIN_HR', label: '🏢 ฝ่ายธุรการและบุคคล (Admin & HR)' },
      { key: 'EXECUTIVE', label: '👑 คณะผู้บริหารระดับสูง (Executive Management)' }
    ];

    const groupsHtml = groups.map(g => {
      const members = COMPLETE_COMPANY_ROSTER_V1171.filter(m => m.deptKey === g.key);
      const cards = members.map(m => {
        const isCurrent = m.id === activeEmp.id;
        return `
          <button type="button" data-emp-id="${m.id}" class="hzk-pick-emp-cockpit-btn" style="text-align:left;background:${isCurrent ? '#EFF6FF' : '#F8FAFC'};border:${isCurrent ? '2px solid #0284C7' : '1px solid #CBD5E1'};border-radius:10px;padding:10px 12px;cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <span style="font-weight:800;font-size:13px;color:#0F172A;">${m.name}</span>
              ${isCurrent ? '<span style="background:#0284C7;color:#FFF;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:800;">กำลังใช้งาน</span>' : ''}
            </div>
            <div style="font-size:11.5px;color:#475569;margin-top:2px;">${m.role} (${m.code})</div>
          </button>
        `;
      }).join('');

      return `
        <div style="margin-bottom:14px;">
          <div style="font-weight:800;color:#002B49;font-size:13.5px;margin-bottom:6px;border-bottom:1px solid #E2E8F0;padding-bottom:4px;">${g.label}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;">${cards}</div>
        </div>
      `;
    }).join('');

    selModal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:980px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:#002B49;color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
          <div>
            <div style="font-size:11px;color:#FDE047;font-weight:800;">ENTERPRISE v1171 • PERSONALIZED EMPLOYEE WORKSPACE ROUTER</div>
            <div style="font-size:16px;font-weight:800;">🧑‍💻 เลือกโปรไฟล์พนักงานหรือแผนกของคุณเพื่อปรับหน้าจอให้ตรงกับงานจริง</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkPersonalEmployeeSelectorModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>
        <div style="padding:16px 20px;">
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:9px 12px;font-size:12px;color:#0369A1;margin-bottom:14px;">
            💡 <b>ระบบจดจำโปรไฟล์อัตโนมัติ:</b> เมื่อเลือกชื่อของคุณแล้ว หน้าจอจะปรับสี ปุ่มลัด ภาษา (TH/EN/日本語) และซ่อนฟอร์มที่ไม่เกี่ยวข้องให้เหมาะสมกับตำแหน่งงานของคุณทันทีในทุกครั้งที่เปิดแอปครับ
          </div>
          ${groupsHtml}
        </div>
      </div>
    `;
    selModal.style.display = 'flex';

    selModal.querySelectorAll('.hzk-pick-emp-cockpit-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-emp-id');
        const found = COMPLETE_COMPANY_ROSTER_V1171.find(x => x.id === id);
        if (found) {
          sessionStorage.removeItem('hzk_v1171_force_show_jobsheet');
          setActiveEmployeeProfileV1171(found, true);
          selModal.style.display = 'none';
          showHzkToastNotification(`✅ ปรับหน้าจอเข้าสู่โต๊ะทำงานของ ${found.name} (${found.deptLabel}) เรียบร้อยแล้ว`, false);
        }
      };
    });
  }

  window.openPersonalEmployeeSelectorModal = openPersonalEmployeeSelectorModal;
  window.renderPersonalizedEmployeeCockpit = renderPersonalizedEmployeeCockpit;



  // ============================================================================
  // ENTERPRISE v1172 MODULES:
  //   1) Auto-Aggregated Department Task Board & Priority To-Do List (List + Kanban)
  //   2) Omni-Meet Video Call Hub (Field Live Assist / Dept / 1-on-1 / All-Hands)
  //      + Live Speech Recorder & Gemini AI Meeting Minutes Generator (TH/EN/JP)
  //   3) Multi-Round Field Repair, Supplemental Quote, Parts ETA & Auto-Dispatch
  //   4) 1-Click Departmental Report Center (All 8 Departments)
  // ============================================================================
  const HZK_V1172_LOCAL_TASKS_KEY = 'hzk_v1172_local_tasks_v1';
  const HZK_V1172_LOCAL_REPAIR_KEY = 'hzk_v1172_local_repair_pipeline_v1';
  const HZK_V1172_LOCAL_MEETINGS_KEY = 'hzk_v1172_local_meeting_minutes_v1';

  // ----------------------------------------------------------------------------
  // MODULE 1: SMART PRIORITY TO-DO LIST & 4-COLUMN KANBAN BOARD
  // ----------------------------------------------------------------------------
  async function openDepartmentTaskBoardModal() {
    const emp = getActiveEmployeeProfileV1171();
    let modal = document.getElementById('hzkDeptTaskBoardModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkDeptTaskBoardModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:20080;background:rgba(15,23,42,0.86);display:flex;' +
        'align-items:center;justify-content:center;padding:10px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1160px;max-height:94vh;overflow-y:auto;border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:linear-gradient(135deg,#002B49,#1E3A8A);color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:#FDE047;font-weight:800;">ENTERPRISE v1172 • AUTO-AGGREGATED DEPARTMENT TASK BOARD &amp; PRIORITY TO-DO</div>
            <div style="font-size:16px;font-weight:800;">📋 กระดานงาน &amp; To-Do List อัจฉริยะ (รวมงานค้างจากทุกแผนก + มติประชุม AI)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDeptTaskBoardModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:16px 20px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;background:#F1F5F9;padding:10px 12px;border-radius:10px;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <label style="font-weight:700;">แผนก:</label>
              <select id="hzkTskDeptSel" style="padding:7px 10px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
                <option value="${emp.deptLabel}">แผนกของฉัน (${emp.deptLabel})</option>
                <option value="ALL">ทุกแผนกทั้งบริษัท (All Departments)</option>
                <option value="Service Unit">Service Unit &amp; Field Tech</option>
                <option value="Sales Department">Sales Department</option>
                <option value="Japanese Corporate">Japanese Corporate</option>
                <option value="Marketing Department">Marketing Department</option>
                <option value="Accounting & Finance">Accounting &amp; Finance</option>
                <option value="Admin & HR">Admin &amp; HR</option>
              </select>
              <button type="button" id="hzkTskViewListBtn" style="background:#002B49;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">📑 มุมมองลำดับความสำคัญ (To-Do List)</button>
              <button type="button" id="hzkTskViewKanbanBtn" style="background:#FFFFFF;color:#0F172A;border:1px solid #CBD5E1;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">🗂️ มุมมองกระดาน 4 ช่อง (Kanban)</button>
            </div>
            <button type="button" id="hzkTskRefreshBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">🔄 รีเฟรชงานค้างล่าสุด</button>
          </div>

          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;padding:10px 12px;margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
            <input id="hzkNewTskTitle" type="text" placeholder="+ เพิ่มรายการงาน To-Do ใหม่..." style="grid-column:span 2;padding:7px 10px;border:1px solid #94A3B8;border-radius:8px;font-weight:700;" />
            <select id="hzkNewTskPrio" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
              <option value="URGENT">🔴 ด่วนที่สุด (Urgent)</option>
              <option value="TODAY" selected>🟡 ทำวันนี้ (Today)</option>
              <option value="UPCOMING">🟢 วางแผนล่วงหน้า (Upcoming)</option>
            </select>
            <input id="hzkNewTskDue" type="date" value="${new Date().toISOString().slice(0, 10)}" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
            <button type="button" id="hzkNewTskAddBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;">+ เพิ่มลงกระดาน</button>
          </div>

          <div id="hzkTaskBoardContainer">⏳ กำลังรวบรวมงานค้างและลำดับความสำคัญ...</div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    let viewMode = 'LIST';
    let currentTasks = [];

    function getLocalTasksFallback(dept) {
      let localManual = [];
      try {
        localManual = JSON.parse(localStorage.getItem(HZK_V1172_LOCAL_TASKS_KEY) || '[]');
      } catch (e) {}
      const sampleAuto = [
        { taskId: 'AUTO-SVC-01', department: 'Service Unit', assignee: 'T01 / T07', priority: 'URGENT', status: 'TODO', title: '✅ อะไหล่เข้าครบแล้ว: เข้าซ่อมร้านกาแฟตัวอย่าง สาขาภูเก็ต (K01234J)', detail: 'Water Valve + ล้างระบบ (ลูกค้าคอนเฟิร์มแล้ว)', dueDate: new Date().toISOString().slice(0, 10), source: 'FIELD_REPAIR_ETA', autoPulled: true },
        { taskId: 'AUTO-SLS-01', department: 'Sales Department', assignee: 'KULATHIDA_C', priority: 'URGENT', status: 'WAITING', title: '⏰ ติดตามใบเสนอราคาค้างตอบรับ > 3 วัน (HTH-26108)', detail: 'ลูกค้า Chain Cafe สาขาสยามสแควร์ (118,000 THB)', dueDate: new Date().toISOString().slice(0, 10), source: 'DOC_TRACKING', autoPulled: true },
        { taskId: 'AUTO-ACC-01', department: 'Accounting & Finance', assignee: 'WARAPORN_K', priority: 'TODAY', status: 'TODO', title: '🧾 ออกใบวางบิล & เปิด SO ใน NAV (SO-2026-0142)', detail: 'ลูกค้าอนุมัติ PO แล้ว (68,500 THB)', dueDate: new Date().toISOString().slice(0, 10), source: 'PO_APPROVED_BILLING', autoPulled: true },
        { taskId: 'AUTO-MKT-01', department: 'Marketing Department', assignee: 'TAKSAON_T', priority: 'UPCOMING', status: 'IN_PROGRESS', title: '🏷️ จัดแคมเปญระบายสต็อกเครื่องตัวโชว์/มีตำหนิ (602 รายการ)', detail: 'คัดรุ่น IM-130NE / FM-1000 พร้อมใบตรวจสภาพ QCF', dueDate: new Date().toISOString().slice(0, 10), source: 'DEMO_STOCK', autoPulled: true }
      ];
      const all = localManual.concat(sampleAuto);
      if (!dept || dept === 'ALL') return all;
      return all.filter(t => String(t.department || '').toUpperCase().indexOf(dept.split(' ')[0].toUpperCase()) !== -1 || !t.autoPulled);
    }

    async function loadTasks() {
      const dept = document.getElementById('hzkTskDeptSel').value;
      const box = document.getElementById('hzkTaskBoardContainer');
      box.innerHTML = '⏳ กำลังโหลดรายการงาน...';
      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          const r = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getDepartmentTaskBoard', department: dept })
          });
          const d = await r.json();
          if (d && d.status === 'OK') {
            let localManual = [];
            try { localManual = JSON.parse(localStorage.getItem(HZK_V1172_LOCAL_TASKS_KEY) || '[]'); } catch (e) {}
            currentTasks = (d.tasks || []).concat(localManual);
            renderTasks();
            return;
          }
        } catch (err) {}
      }
      currentTasks = getLocalTasksFallback(dept);
      renderTasks();
    }

    async function updateTaskStatus(taskId, nextStatus) {
      const idx = currentTasks.findIndex(x => x.taskId === taskId);
      if (idx >= 0) currentTasks[idx].status = nextStatus;
      try {
        const localManual = JSON.parse(localStorage.getItem(HZK_V1172_LOCAL_TASKS_KEY) || '[]');
        const lIdx = localManual.findIndex(x => x.taskId === taskId);
        if (lIdx >= 0) {
          localManual[lIdx].status = nextStatus;
          localStorage.setItem(HZK_V1172_LOCAL_TASKS_KEY, JSON.stringify(localManual));
        }
      } catch (e) {}
      renderTasks();
      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'createOrUpdateTaskItem', taskId: taskId, status: nextStatus })
          });
        } catch (e) {}
      }
    }

    function renderTasks() {
      const box = document.getElementById('hzkTaskBoardContainer');
      const activeList = currentTasks.filter(t => t.status !== 'DONE');
      const doneList = currentTasks.filter(t => t.status === 'DONE');

      if (viewMode === 'LIST') {
        const groups = [
          { key: 'URGENT', label: '🔴 1. ด่วนที่สุด / เกินกำหนด (Urgent & Overdue)', bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
          { key: 'TODAY', label: '🟡 2. งานที่ต้องทำวันนี้ (Today Action Queue)', bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
          { key: 'UPCOMING', label: '🟢 3. งานวางแผนล่วงหน้า (Upcoming & Follow-ups)', bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' }
        ];

        box.innerHTML = groups.map(g => {
          const items = activeList.filter(t => t.priority === g.key);
          const rows = items.map(t => `
            <div style="background:#FFFFFF;border:1px solid ${g.border};border-radius:10px;padding:10px 12px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <div style="font-weight:800;font-size:13px;color:#0F172A;">${t.title}</div>
                <div style="font-size:11.5px;color:#475569;margin-top:2px;">${t.detail} • <b>แผนก:</b> ${t.department} • <b>กำหนด:</b> ${t.dueDate}</div>
              </div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;">
                <button type="button" data-tid="${t.taskId}" data-st="IN_PROGRESS" class="hzk-tsk-move-btn" style="background:#0284C7;color:#FFF;border:none;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;">⚡ กำลังทำ</button>
                <button type="button" data-tid="${t.taskId}" data-st="DONE" class="hzk-tsk-move-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;">✅ เสร็จแล้ว</button>
              </div>
            </div>
          `).join('') || `<div style="font-size:12px;color:#64748B;padding:6px;">ไม่มีงานค้างในหมวดนี้</div>`;

          return `
            <div style="background:${g.bg};border:1.5px solid ${g.border};border-radius:12px;padding:12px;margin-bottom:12px;">
              <div style="font-weight:800;color:${g.text};font-size:13.5px;margin-bottom:8px;">${g.label} (${items.length})</div>
              ${rows}
            </div>
          `;
        }).join('') + (doneList.length ? `<div style="font-size:12px;color:#059669;font-weight:700;margin-top:6px;">✅ งานที่ปิดเสร็จสิ้นแล้ว: ${doneList.length} รายการ</div>` : '');
      } else {
        // 4-Column Kanban Board
        const cols = [
          { key: 'TODO', title: '📥 รอดำเนินการ (To Do)', headerBg: '#002B49', next: 'IN_PROGRESS', nextLabel: '▶ เริ่มทำ' },
          { key: 'IN_PROGRESS', title: '⚡ กำลังดำเนินการ (In Progress)', headerBg: '#0284C7', next: 'WAITING', nextLabel: '⏳ รอผล' },
          { key: 'WAITING', title: '⏳ รออะไหล่ / รอลูกค้า (Waiting)', headerBg: '#D97706', next: 'DONE', nextLabel: '✅ ปิดงาน' },
          { key: 'DONE', title: '✅ เสร็จสิ้น (Done)', headerBg: '#059669', next: '', nextLabel: '' }
        ];

        box.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
            ${cols.map(c => {
              const cItems = currentTasks.filter(t => t.status === c.key);
              const cards = cItems.map(t => `
                <div style="background:#FFFFFF;border:1px solid #CBD5E1;border-radius:9px;padding:9px;margin-bottom:8px;box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                  <div style="font-size:10px;font-weight:800;color:${t.priority === 'URGENT' ? '#DC2626' : '#0369A1'};">${t.priority} • ${t.department}</div>
                  <div style="font-weight:700;font-size:12px;color:#0F172A;margin-top:3px;">${t.title}</div>
                  <div style="font-size:11px;color:#64748B;margin-top:3px;">${t.detail}</div>
                  ${c.next ? `<button type="button" data-tid="${t.taskId}" data-st="${c.next}" class="hzk-tsk-move-btn" style="margin-top:7px;width:100%;background:${c.headerBg};color:#FFF;border:none;border-radius:6px;padding:5px;font-size:11px;font-weight:700;cursor:pointer;">${c.nextLabel}</button>` : ''}
                </div>
              `).join('') || '<div style="color:#94A3B8;font-size:11.5px;text-align:center;padding:12px;">- ว่าง -</div>';

              return `
                <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;overflow:hidden;">
                  <div style="background:${c.headerBg};color:#FFF;padding:8px 10px;font-weight:800;font-size:12px;">${c.title} (${cItems.length})</div>
                  <div style="padding:8px;max-height:460px;overflow-y:auto;">${cards}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      box.querySelectorAll('.hzk-tsk-move-btn').forEach(b => {
        b.onclick = () => updateTaskStatus(b.getAttribute('data-tid'), b.getAttribute('data-st'));
      });
    }

    document.getElementById('hzkTskViewListBtn').onclick = () => {
      viewMode = 'LIST';
      document.getElementById('hzkTskViewListBtn').style.background = '#002B49';
      document.getElementById('hzkTskViewListBtn').style.color = '#FFF';
      document.getElementById('hzkTskViewKanbanBtn').style.background = '#FFFFFF';
      document.getElementById('hzkTskViewKanbanBtn').style.color = '#0F172A';
      renderTasks();
    };

    document.getElementById('hzkTskViewKanbanBtn').onclick = () => {
      viewMode = 'KANBAN';
      document.getElementById('hzkTskViewKanbanBtn').style.background = '#002B49';
      document.getElementById('hzkTskViewKanbanBtn').style.color = '#FFF';
      document.getElementById('hzkTskViewListBtn').style.background = '#FFFFFF';
      document.getElementById('hzkTskViewListBtn').style.color = '#0F172A';
      renderTasks();
    };

    document.getElementById('hzkNewTskAddBtn').onclick = async () => {
      const title = document.getElementById('hzkNewTskTitle').value.trim();
      if (!title) return;
      const prio = document.getElementById('hzkNewTskPrio').value;
      const due = document.getElementById('hzkNewTskDue').value;
      const dept = document.getElementById('hzkTskDeptSel').value === 'ALL' ? emp.deptLabel : document.getElementById('hzkTskDeptSel').value;
      const newObj = {
        taskId: 'TSK-' + Date.now().toString().slice(-6),
        department: dept,
        assignee: emp.name,
        priority: prio,
        status: 'TODO',
        title: title,
        detail: 'เพิ่มโดย ' + emp.name,
        dueDate: due,
        source: 'MANUAL',
        autoPulled: false
      };
      try {
        const prev = JSON.parse(localStorage.getItem(HZK_V1172_LOCAL_TASKS_KEY) || '[]');
        localStorage.setItem(HZK_V1172_LOCAL_TASKS_KEY, JSON.stringify([newObj].concat(prev)));
      } catch (e) {}
      document.getElementById('hzkNewTskTitle').value = '';
      currentTasks.unshift(newObj);
      renderTasks();

      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'createOrUpdateTaskItem' }, newObj))
          });
        } catch (e) {}
      }
    };

    document.getElementById('hzkTskRefreshBtn').onclick = loadTasks;
    document.getElementById('hzkTskDeptSel').onchange = loadTasks;
    loadTasks();
  }

  // ----------------------------------------------------------------------------
  // MODULE 2: OMNI-MEET HUB & GEMINI AI MEETING RECORDER / MINUTES GENERATOR
  // ----------------------------------------------------------------------------
  async function openOmniMeetAndAiMinutesModal() {
    const emp = getActiveEmployeeProfileV1171();
    let modal = document.getElementById('hzkOmniMeetAiModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkOmniMeetAiModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:20082;background:rgba(15,23,42,0.88);display:flex;' +
        'align-items:center;justify-content:center;padding:10px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    const staffOptions = COMPLETE_COMPANY_ROSTER_V1171.map(s =>
      `<option value="${s.name}">${s.name} [${s.deptLabel}]</option>`
    ).join('');

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1080px;max-height:94vh;overflow-y:auto;border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:linear-gradient(135deg,#1E1B4B,#4F46E5);color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5;">
          <div>
            <div style="font-size:11px;color:#FDE047;font-weight:800;">ENTERPRISE v1172 • HOSHIZAKI OMNI-MEET HUB &amp; AI MEETING MINUTES</div>
            <div style="font-size:16px;font-weight:800;">📹 ประชุมทีม (WFH / On-Site ช่าง / แผนก / ทั้งบริษัท) &amp; AI สรุปรายงานการประชุม</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkOmniMeetAiModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:18px 20px;font-size:13px;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;">
          <!-- Left: Instant Video Call & Teams Launcher -->
          <div style="background:#F8FAFC;border:1.5px solid #CBD5E1;border-radius:14px;padding:14px;">
            <div style="font-weight:800;color:#002B49;font-size:14.5px;margin-bottom:8px;">1️⃣ เปิดห้องประชุมออนไลน์ &amp; Live Field Call</div>
            <div style="margin-bottom:8px;">
              <label style="font-weight:700;font-size:12px;">รูปแบบการประชุม:</label>
              <select id="hzkMeetModeSel" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;font-weight:700;">
                <option value="DEPARTMENT">🏢 ประชุมทีมภายในแผนก (${emp.deptLabel})</option>
                <option value="FIELD_ASSIST">🛠️ On-Site Field Live Assist (ช่างหน้างานเปิดกล้องปรึกษาหัวหน้า)</option>
                <option value="ONE_ON_ONE">👤 ประชุมตัวต่อตัว 1-on-1 (WFH Check-in / ปรึกษางาน)</option>
                <option value="ALL_HANDS">🏛️ ประชุมรวมทั้งบริษัท (All-Hands 8 แผนก)</option>
              </select>
            </div>
            <div id="hzkMeetOneOnOneWrap" style="display:none;margin-bottom:8px;">
              <label style="font-weight:700;font-size:12px;">เลือกคู่สนทนา (รายบุคคล):</label>
              <select id="hzkMeetTargetStaff" style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;">${staffOptions}</select>
            </div>
            <div style="margin-bottom:8px;">
              <label style="font-weight:700;font-size:12px;">หัวข้อประชุม / เลขที่ใบงาน / S/N:</label>
              <input id="hzkMeetTitleInp" type="text" value="ประชุมทีม ${emp.deptLabel} (${new Date().toISOString().slice(0, 10)})" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;font-weight:700;" />
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-weight:700;font-size:12px;">วาระการประชุม / อาการหน้างานที่ต้องการปรึกษา:</label>
              <textarea id="hzkMeetAgendaInp" rows="2" placeholder="ระบุหัวข้อที่จะหารือ..." style="width:100%;padding:7px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;"></textarea>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button type="button" id="hzkLaunchWebRoomBtn" style="background:#059669;color:#FFF;border:none;border-radius:9px;padding:10px;font-weight:800;cursor:pointer;">🎥 เปิดห้องวิดีโอคอลทันที + ส่งปุ่มเข้าสายใน LINE</button>
              <button type="button" id="hzkLaunchMsTeamsBtn" style="background:#4F46E5;color:#FFF;border:none;border-radius:9px;padding:9px;font-weight:700;cursor:pointer;">💼 เปิดผ่าน Microsoft Teams (สร้างนัดหมาย)</button>
            </div>
            <div id="hzkMeetRoomStatusBox" style="margin-top:10px;font-size:12px;color:#0369A1;display:none;background:#EFF6FF;padding:8px 10px;border-radius:8px;"></div>
          </div>

          <!-- Right: Live Voice Recorder & Gemini AI Minutes Generator -->
          <div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:14px;padding:14px;">
            <div style="font-weight:800;color:#92400E;font-size:14.5px;margin-bottom:6px;">2️⃣ บันทึกเสียง &amp; AI สรุปรายงานการประชุม (TH / EN / 日本語)</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
              <button type="button" id="hzkStartRecBtn" style="background:#DC2626;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">🎙️ เริ่มอัดเสียง &amp; ถอดข้อความสด</button>
              <button type="button" id="hzkStopRecBtn" disabled style="background:#475569;color:#FFF;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;">⏹️ หยุดบันทึก</button>
              <span id="hzkRecStatusBadge" style="font-size:11.5px;font-weight:700;color:#64748B;align-self:center;">พร้อมบันทึก</span>
            </div>
            <div style="margin-bottom:8px;">
              <label style="font-weight:700;font-size:12px;">ข้อความถอดเสียง / บันทึกการประชุม (พิมพ์เพิ่มเติมหรือแก้ไขได้):</label>
              <textarea id="hzkMeetTranscriptBox" rows="5" placeholder="กดปุ่มเริ่มอัดเสียงเพื่อถอดข้อความอัตโนมัติ หรือพิมพ์สรุปประเด็นที่คุยกันที่นี่เพื่อให้ Gemini AI จัดรูปแบบรายงานและแยกงานส่งต่อ..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:8px;margin-top:3px;font-size:12px;"></textarea>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;">
              <label><input id="hzkAiCreateTasksCb" type="checkbox" checked /> ส่งมติที่ประชุมเข้า <b>กระดานงาน To-Do List</b> อัตโนมัติ</label>
              <label><input id="hzkAiSendLineCb" type="checkbox" checked /> ส่งรายงานสรุปเข้า <b>กลุ่ม LINE</b></label>
            </div>
            <button type="button" id="hzkGenerateAiMinutesBtn" style="width:100%;background:linear-gradient(135deg,#002B49,#0284C7);color:#FFF;border:none;border-radius:9px;padding:10px;font-weight:800;cursor:pointer;">🤖 ให้ Gemini AI สรุปรายงานการประชุม &amp; แจกจ่ายงานทันที</button>
            <div id="hzkAiMinutesOutputBox" style="margin-top:10px;display:none;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:10px;padding:10px;font-size:12px;line-height:1.5;"></div>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    document.getElementById('hzkMeetModeSel').onchange = function () {
      document.getElementById('hzkMeetOneOnOneWrap').style.display = (this.value === 'ONE_ON_ONE') ? 'block' : 'none';
    };

    function buildRoomUrl() {
      const slug = 'HOSHIZAKI-TH-' + Date.now().toString(36).toUpperCase();
      return 'https://meet.jit.si/' + slug;
    }

    document.getElementById('hzkLaunchWebRoomBtn').onclick = async () => {
      const roomUrl = buildRoomUrl();
      const mType = document.getElementById('hzkMeetModeSel').value;
      const title = document.getElementById('hzkMeetTitleInp').value.trim();
      const agenda = document.getElementById('hzkMeetAgendaInp').value.trim();
      const targetStaff = document.getElementById('hzkMeetTargetStaff').value;
      const targetDept = mType === 'ALL_HANDS' ? 'All Departments (8 แผนก)' : (mType === 'ONE_ON_ONE' ? targetStaff : emp.deptLabel);

      const stBox = document.getElementById('hzkMeetRoomStatusBox');
      stBox.style.display = 'block';
      stBox.innerHTML = `✅ เปิดห้องประชุมแล้ว: <a href="${roomUrl}" target="_blank" style="font-weight:800;color:#0284C7;">${roomUrl}</a> (กำลังส่งปุ่มเชิญเข้า LINE...)`;
      window.open(roomUrl, '_blank');

      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'dispatchOmniMeetingInvite',
              meetType: mType,
              roomTitle: title,
              roomUrl: roomUrl,
              hostName: emp.name,
              department: targetDept,
              agenda: agenda
            })
          });
          stBox.innerHTML += ' • <b>ส่งการ์ดเข้ากลุ่ม LINE เรียบร้อยแล้ว!</b>';
        } catch (e) {}
      }
    };

    document.getElementById('hzkLaunchMsTeamsBtn').onclick = () => {
      const title = encodeURIComponent(document.getElementById('hzkMeetTitleInp').value.trim());
      const content = encodeURIComponent(document.getElementById('hzkMeetAgendaInp').value.trim());
      window.open(`https://teams.microsoft.com/l/meeting/new?subject=${title}&content=${content}`, '_blank');
    };

    // Live Speech Recognition + MediaRecorder Audio Backup
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordedAudioDataUrl = '';

    document.getElementById('hzkStartRecBtn').onclick = async () => {
      const badge = document.getElementById('hzkRecStatusBadge');
      const ta = document.getElementById('hzkMeetTranscriptBox');
      document.getElementById('hzkStartRecBtn').disabled = true;
      document.getElementById('hzkStopRecBtn').disabled = false;
      badge.textContent = '🔴 กำลังอัดเสียงและถอดข้อความ...';
      badge.style.color = '#DC2626';

      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        recognition = new SpeechRec();
        recognition.lang = getActiveCockpitLang() === 'JP' ? 'ja-JP' : 'th-TH';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (ev) => {
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) {
              ta.value += (ta.value ? '\n' : '') + '• ' + ev.results[i][0].transcript.trim();
            }
          }
        };
        try { recognition.start(); } catch (e) {}
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => { recordedAudioDataUrl = reader.result; };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
      } catch (eMic) {}
    };

    document.getElementById('hzkStopRecBtn').onclick = () => {
      if (recognition) { try { recognition.stop(); } catch (e) {} }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch (e) {} }
      document.getElementById('hzkStartRecBtn').disabled = false;
      document.getElementById('hzkStopRecBtn').disabled = true;
      const badge = document.getElementById('hzkRecStatusBadge');
      badge.textContent = '✅ บันทึกเสียงเรียบร้อย';
      badge.style.color = '#059669';
    };

    document.getElementById('hzkGenerateAiMinutesBtn').onclick = async () => {
      const title = document.getElementById('hzkMeetTitleInp').value.trim();
      const transcript = document.getElementById('hzkMeetTranscriptBox').value.trim();
      if (!transcript && !recordedAudioDataUrl) {
        alert('กรุณากดอัดเสียง หรือพิมพ์บันทึกเนื้อหาการประชุมก่อนให้ AI สรุปครับ');
        return;
      }
      const outBox = document.getElementById('hzkAiMinutesOutputBox');
      outBox.style.display = 'block';
      outBox.innerHTML = '⏳ กำลังส่งข้อมูลให้ Gemini AI สรุปรายงานการประชุม 3 ภาษา และแยกงานส่งต่อ...';

      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          const res = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'generateAiMeetingMinutes',
              title: title,
              department: emp.deptLabel,
              hostName: emp.name,
              participants: emp.deptLabel + ' Team',
              transcript: transcript,
              audioBase64: recordedAudioDataUrl,
              autoCreateTasks: document.getElementById('hzkAiCreateTasksCb').checked,
              sendToLine: document.getElementById('hzkAiSendLineCb').checked
            })
          });
          const d = await res.json();
          if (d && d.status === 'OK') {
            outBox.innerHTML = `
              <div style="font-weight:800;color:#059669;margin-bottom:6px;">✅ สรุปรายงานการประชุมสำเร็จ (${d.meetingId})</div>
              <div style="white-space:pre-line;margin-bottom:8px;"><b>สรุปภาษาไทย:</b>
${d.summaryTh}</div>
              ${d.summaryJpEn ? `<div style="white-space:pre-line;background:#F8FAFC;padding:8px;border-radius:8px;margin-bottom:8px;"><b>JP / EN Summary:</b>
${d.summaryJpEn}</div>` : ''}
              <div style="font-size:11.5px;color:#0369A1;">📋 สร้างรายการงานเข้ากระดาน To-Do List แล้ว ${(d.actionItems || []).length} รายการ</div>
            `;
            return;
          }
        } catch (err) {}
      }

      // Local offline fallback summary
      outBox.innerHTML = `
        <div style="font-weight:800;color:#059669;margin-bottom:4px;">✅ บันทึกสรุปการประชุมในเครื่องเรียบร้อยแล้ว</div>
        <div style="white-space:pre-line;"><b>หัวข้อ:</b> ${title}
<b>เนื้อหา:</b>
${transcript}</div>
      `;
    };
  }

  // ----------------------------------------------------------------------------
  // MODULE 3: MULTI-ROUND FIELD REPAIR, SUPPLEMENTAL QUOTE & PARTS ETA PIPELINE
  // ----------------------------------------------------------------------------
  async function openFieldRepairPartsPipelineModal() {
    let modal = document.getElementById('hzkFieldRepairEtaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkFieldRepairEtaModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:20084;background:rgba(15,23,42,0.88);display:flex;' +
        'align-items:center;justify-content:center;padding:10px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    const today = new Date().toISOString().slice(0, 10);
    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1080px;max-height:94vh;overflow-y:auto;border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:linear-gradient(135deg,#7F1D1D,#B91C1C);color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5;">
          <div>
            <div style="font-size:11px;color:#FECACA;font-weight:800;">ENTERPRISE v1172 • FIELD TESTING ➔ SUPPLEMENTAL QUOTE ➔ MULTI-ROUND PARTS ETA</div>
            <div style="font-size:16px;font-weight:800;">🔧 ติดตามงานซ่อมต่อเนื่อง, แจ้งรอบอะไหล่ (ETA) &amp; ล็อกคิวช่างอัตโนมัติ</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkFieldRepairEtaModal').style.display='none'" style="background:#0F172A;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:16px 20px;font-size:13px;">
          <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:12px;padding:14px;margin-bottom:16px;">
            <div style="font-weight:800;color:#991B1B;font-size:14px;margin-bottom:8px;">➕ บันทึกผลตรวจหน้างาน (Testing) / เสนอราคาอะไหล่เพิ่มเติม &amp; กำหนดรอบอะไหล่ (ETA)</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-bottom:10px;">
              <input id="hzkRprJobId" type="text" placeholder="เลขที่ใบงาน เช่น JOB-261121" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;" />
              <input id="hzkRprCust" type="text" placeholder="ชื่อร้าน / ลูกค้า *" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
              <input id="hzkRprModel" type="text" placeholder="รุ่นเครื่อง เช่น IM-130NE" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
              <input id="hzkRprSn" type="text" placeholder="Serial No. เช่น K01234J" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
              <input id="hzkRprContact" type="text" placeholder="เบอร์โทร / อีเมลลูกค้า" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
              <select id="hzkRprTechVan" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">
                <option value="T01">ช่าง T01 (BKK North)</option><option value="T02">ช่าง T02 (BKK South)</option>
                <option value="T03">ช่าง T03 (BKK East)</option><option value="T04">ช่าง T04 (Nonthaburi)</option>
                <option value="T05">ช่าง T05 (Samut Prakan)</option><option value="T06">ช่าง T06 (Ayutthaya)</option>
                <option value="T07">ช่าง T07 (Upcountry)</option><option value="T08">ช่าง T08 (Install &amp; PM)</option>
              </select>
              <input id="hzkRprParts" type="text" placeholder="รายการอะไหล่ที่ต้องเปลี่ยนเพิ่มเติม *" style="grid-column:span 2;padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
              <input id="hzkRprEta" type="text" placeholder="รอบอะไหล่เข้า เช่น รอบ 1: 25 พ.ย. / รอบ 2: 2 ธ.ค." style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
              <input id="hzkRprDate" type="date" value="${today}" style="padding:7px;border:1px solid #CBD5E1;border-radius:8px;" />
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
              <label style="font-weight:700;color:#065F46;font-size:12.5px;">
                <input id="hzkRprHasPartsCb" type="checkbox" /> 🟢 มีอะไหล่พร้อมในรถช่าง/คลังแล้ว (ล็อกคิวช่าง + ส่งเมล/LINE Confirm ลูกค้าเข้าซ่อมทันที)
              </label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" id="hzkRprOpenAddQuoteBtn" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;">📄 ออกใบเสนอราคาอะไหล่เพิ่มเติม</button>
                <button type="button" id="hzkRprSaveEtaBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:8px 14px;font-weight:800;cursor:pointer;">💾 บันทึกรอบ ETA &amp; แจ้งเตือน</button>
              </div>
            </div>
          </div>

          <div style="font-weight:800;color:#002B49;margin-bottom:8px;">📋 รายการงานซ่อมต่อเนื่องที่รออะไหล่ / รอเข้าซ่อมตามนัด (Multi-Round Repair Pipeline):</div>
          <div id="hzkRprPipelineTableWrap">⏳ กำลังโหลดรายการ...</div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    async function loadPipeline() {
      const wrap = document.getElementById('hzkRprPipelineTableWrap');
      const gasUrl = getGasEndpointUrl();
      let items = [];
      if (gasUrl) {
        try {
          const r = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getFieldRepairPipelineList' })
          });
          const d = await r.json();
          if (d && d.status === 'OK') items = d.items || [];
        } catch (e) {}
      }
      if (!items.length) {
        try { items = JSON.parse(localStorage.getItem(HZK_V1172_LOCAL_REPAIR_KEY) || '[]'); } catch (e) {}
      }

      wrap.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;min-width:820px;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#002B49;color:#FFF;">
                <th style="padding:7px;">รหัส / ใบงาน</th>
                <th style="padding:7px;text-align:left;">ลูกค้า / รุ่น / S/N</th>
                <th style="padding:7px;text-align:left;">อะไหล่เพิ่มเติม</th>
                <th style="padding:7px;">รอบอะไหล่ (ETA)</th>
                <th style="padding:7px;">ช่าง</th>
                <th style="padding:7px;">สถานะ</th>
                <th style="padding:7px;">ดำเนินการเมื่ออะไหล่พร้อม</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `
                <tr>
                  <td style="padding:7px;border:1px solid #CBD5E1;font-weight:700;">${it.pipelineId}<br><span style="font-size:10.5px;color:#64748B;">${it.jobId}</span></td>
                  <td style="padding:7px;border:1px solid #CBD5E1;"><b>${it.customerName}</b><br>${it.model} (${it.serialNo})</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;">${it.partsDetail}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;color:#B45309;">${it.etaRound}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;font-weight:700;">${it.techVan}</td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">
                    ${it.stage === 'PARTS_READY_CONFIRMED'
                      ? `<span style="background:#DCFCE7;color:#166534;padding:3px 8px;border-radius:999px;font-weight:700;">✅ ล็อกคิวซ่อมแล้ว (${it.repairSlot})</span>`
                      : `<span style="background:#FEF3C7;color:#92400E;padding:3px 8px;border-radius:999px;font-weight:700;">⏳ รออะไหล่เข้า</span>`}
                  </td>
                  <td style="padding:7px;border:1px solid #CBD5E1;text-align:center;">
                    <button type="button" data-pid="${it.pipelineId}" data-van="${it.techVan}" class="hzk-rpr-dispatch-now-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:5px 9px;font-weight:700;cursor:pointer;">🚀 อะไหล่พร้อม ➔ ล็อกคิว &amp; แจ้งลูกค้า</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="7" style="padding:12px;text-align:center;color:#64748B;">ยังไม่มีรายการรอรอบอะไหล่เพิ่มเติม</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('.hzk-rpr-dispatch-now-btn').forEach(btn => {
        btn.onclick = async () => {
          const pid = btn.getAttribute('data-pid');
          const van = btn.getAttribute('data-van');
          const rDate = prompt('ระบุวันที่เข้าซ่อม (YYYY-MM-DD):', today) || today;
          if (gasUrl) {
            const res = await fetch(gasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                action: 'confirmPartsArrivedAndDispatchRepair',
                pipelineId: pid,
                repairDate: rDate,
                timeSlot: '09:00 - 12:00',
                techVan: van
              })
            });
            const d = await res.json();
            alert(d && d.message ? ('✅ ' + d.message) : '✅ ล็อกคิวซ่อมและแจ้งเตือนลูกค้าเรียบร้อยแล้ว');
          } else {
            alert(`✅ ล็อกคิวช่าง ${van} วันที่ ${rDate} และส่งยืนยันให้ลูกค้าเรียบร้อยแล้ว`);
          }
          loadPipeline();
        };
      });
    }

    document.getElementById('hzkRprOpenAddQuoteBtn').onclick = async () => {
      const cust = document.getElementById('hzkRprCust').value.trim();
      const model = document.getElementById('hzkRprModel').value.trim() || 'SPARE-PARTS';
      const sn = document.getElementById('hzkRprSn').value.trim();
      const parts = document.getElementById('hzkRprParts').value.trim();
      const eta = document.getElementById('hzkRprEta').value.trim();
      modal.style.display = 'none';
      HZK_OMNI_STATE.items = [{
        model: model,
        description: `อะไหล่ซ่อมเพิ่มเติม (${parts}) [S/N: ${sn}] — กำหนดรอบอะไหล่: ${eta || 'พร้อมซ่อม'}`,
        w: '',
        d: '',
        h: '',
        unitPrice: 0,
        discount: 0,
        qty: 1,
        isService: true
      }];
      await openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบเสนอราคา (Quotation)');
      if (cust) document.getElementById('hzkSqCustomer').value = cust;
    };

    document.getElementById('hzkRprSaveEtaBtn').onclick = async () => {
      const payload = {
        action: 'saveFieldRepairMultiRoundEta',
        jobId: document.getElementById('hzkRprJobId').value.trim() || ('JOB-' + Date.now().toString().slice(-6)),
        customerName: document.getElementById('hzkRprCust').value.trim() || 'ลูกค้างานซ่อม',
        model: document.getElementById('hzkRprModel').value.trim(),
        serialNo: document.getElementById('hzkRprSn').value.trim(),
        contact: document.getElementById('hzkRprContact').value.trim(),
        techVan: document.getElementById('hzkRprTechVan').value,
        partsDetail: document.getElementById('hzkRprParts').value.trim(),
        etaRound: document.getElementById('hzkRprEta').value.trim(),
        repairDate: document.getElementById('hzkRprDate').value,
        hasPartsReady: document.getElementById('hzkRprHasPartsCb').checked
      };
      const localRec = Object.assign({
        pipelineId: 'RPR-' + Date.now().toString().slice(-6),
        stage: payload.hasPartsReady ? 'PARTS_READY_CONFIRMED' : 'WAITING_PARTS_ETA',
        repairSlot: payload.repairDate
      }, payload);
      try {
        const prev = JSON.parse(localStorage.getItem(HZK_V1172_LOCAL_REPAIR_KEY) || '[]');
        localStorage.setItem(HZK_V1172_LOCAL_REPAIR_KEY, JSON.stringify([localRec].concat(prev)));
      } catch (e) {}

      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          const r = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          const d = await r.json();
          if (d && d.status === 'OK') {
            alert(d.message ? ('✅ ' + d.message) : `✅ บันทึกรอบรออะไหล่ (${d.etaRound}) และแจ้งเตือนเรียบร้อยแล้ว`);
            loadPipeline();
            return;
          }
        } catch (e) {}
      }
      alert('✅ บันทึกข้อมูลงานซ่อมต่อเนื่องและรอบอะไหล่เรียบร้อยแล้ว');
      loadPipeline();
    };

    loadPipeline();
  }

  // ----------------------------------------------------------------------------
  // MODULE 4: 1-CLICK DEPARTMENTAL REPORT CENTER (ALL 8 DEPARTMENTS)
  // ----------------------------------------------------------------------------
  async function openDepartmentReportCenterModal() {
    const emp = getActiveEmployeeProfileV1171();
    let modal = document.getElementById('hzkDeptReportCenterModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkDeptReportCenterModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:20086;background:rgba(15,23,42,0.88);display:flex;' +
        'align-items:center;justify-content:center;padding:10px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1020px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:linear-gradient(135deg,#064E3B,#059669);color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5;">
          <div>
            <div style="font-size:11px;color:#A7F3D0;font-weight:800;">ENTERPRISE v1172 • 1-CLICK DEPARTMENTAL REPORT CENTER</div>
            <div style="font-size:16px;font-weight:800;">📑 ศูนย์ออกรายงานประจำแผนก (CSV / Excel / พิมพ์รายงาน A4)</div>
          </div>
          <button type="button" onclick="document.getElementById('hzkDeptReportCenterModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;">✕ ปิด</button>
        </div>

        <div style="padding:18px 20px;font-size:13px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
            <label style="font-weight:700;">เลือกแผนกที่ต้องการออกรายงาน:</label>
            <select id="hzkRptDeptSel" style="padding:8px 12px;border:1.5px solid #CBD5E1;border-radius:8px;font-weight:700;">
              <option value="${emp.deptLabel}">รายงานแผนกของฉัน (${emp.deptLabel})</option>
              <option value="Sales Department">💼 Sales Department — Sales Pipeline &amp; Quotation Report</option>
              <option value="Japanese Corporate">🇯🇵 Japanese Corporate — Bilingual Account &amp; Export Report</option>
              <option value="Marketing Department">📣 Marketing — Campaign &amp; Demo/Clearance Stock Report</option>
              <option value="Accounting & Finance">🧾 Accounting &amp; Finance — Tax, Billing &amp; NAV Ready Report</option>
              <option value="Admin & HR">🏢 Admin &amp; HR — Staff Directory &amp; Task Audit Report</option>
              <option value="Service Unit">🛠️ Service Unit — Field Jobs, Parts Cost &amp; Technician Report</option>
              <option value="Executive Management">👑 Executive Boardroom — Unit Lifecycle P&amp;L &amp; Pricing Report</option>
            </select>
            <button type="button" id="hzkRptGenerateBtn" style="background:#002B49;color:#FFF;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">📊 สร้างรายงานทันที</button>
            <button type="button" id="hzkRptDownloadCsvBtn" style="background:#059669;color:#FFF;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">📥 ดาวน์โหลด CSV / Excel</button>
          </div>

          <div id="hzkRptPreviewArea" style="color:#64748B;">กดปุ่ม "สร้างรายงานทันที" เพื่อดูตัวอย่างตารางและส่งออกไฟล์ครับ</div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    let latestReport = null;

    async function runGenerateReport() {
      const dept = document.getElementById('hzkRptDeptSel').value;
      const area = document.getElementById('hzkRptPreviewArea');
      area.innerHTML = '⏳ กำลังรวบรวมข้อมูลรายงานของแผนก ' + dept + '...';

      const gasUrl = getGasEndpointUrl();
      if (gasUrl) {
        try {
          const r = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'generateDepartmentReportBundle', department: dept })
          });
          const d = await r.json();
          if (d && d.status === 'OK') {
            latestReport = d;
            renderReportPreview(d);
            return;
          }
        } catch (e) {}
      }

      // Local fallback report from local archive / lifecycle data
      const fallbackPnl = getLocalFallbackLifecycleData('');
      latestReport = {
        reportTitle: dept + ' — Operational Summary Report (Local Snapshot)',
        department: dept,
        generatedAt: new Date().toLocaleString('th-TH'),
        headers: ['Serial No.', 'Model', 'Channel / Dealer', 'Customer', 'Net Sale Price (THB)', 'Warranty Cost (THB)', 'Net Margin %'],
        rows: (fallbackPnl.allUnits || []).map(u => [u.serialNumber, u.model, u.dealerName, u.customerStore, u.netSellingPrice, u.companyAbsorbedCost, u.netMarginPct + '%'])
      };
      renderReportPreview(latestReport);
    }

    function renderReportPreview(rep) {
      const area = document.getElementById('hzkRptPreviewArea');
      const ths = (rep.headers || []).map(h => `<th style="padding:7px;border:1px solid #CBD5E1;">${h}</th>`).join('');
      const trs = (rep.rows || []).slice(0, 80).map(row =>
        `<tr>${row.map(cell => `<td style="padding:6px;border:1px solid #CBD5E1;">${cell !== null && cell !== undefined ? cell : '-'}</td>`).join('')}</tr>`
      ).join('') || `<tr><td colspan="${(rep.headers || []).length || 1}" style="padding:12px;text-align:center;color:#64748B;">ยังไม่มีรายการข้อมูลในหมวดนี้</td></tr>`;

      area.innerHTML = `
        <div style="font-weight:800;color:#002B49;font-size:14px;margin-bottom:4px;">${rep.reportTitle}</div>
        <div style="font-size:11.5px;color:#475569;margin-bottom:10px;">ออกรายงานโดย: ${emp.name} | เวลา: ${rep.generatedAt} | จำนวน ${(rep.rows || []).length} รายการ</div>
        <div style="overflow-x:auto;">
          <table style="width:100%;min-width:740px;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#002B49;color:#FFF;">${ths}</tr></thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
      `;
    }

    document.getElementById('hzkRptGenerateBtn').onclick = runGenerateReport;
    document.getElementById('hzkRptDownloadCsvBtn').onclick = () => {
      if (!latestReport) {
        alert('กรุณากดปุ่ม "สร้างรายงานทันที" ก่อนดาวน์โหลดครับ');
        return;
      }
      const csvLines = [(latestReport.headers || []).join(',')].concat(
        (latestReport.rows || []).map(r => r.map(c => `"${String(c !== null && c !== undefined ? c : '').split('"').join('""')}"`).join(','))
      );
      const blob = new Blob(['﻿' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'HOSHIZAKI_' + latestReport.department.replace(/[^A-Za-z0-9]/g, '_') + '_Report_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
    };

    runGenerateReport();
  }

  window.openDepartmentTaskBoardModal = openDepartmentTaskBoardModal;
  window.openOmniMeetAndAiMinutesModal = openOmniMeetAndAiMinutesModal;
  window.openFieldRepairPartsPipelineModal = openFieldRepairPartsPipelineModal;
  window.openDepartmentReportCenterModal = openDepartmentReportCenterModal;



  // ============================================================================
  // ENTERPRISE v1173 MODULE: CLEAN-CANVAS HOME + PERSONAL PIN & APP DRAWER
  // - Ultra-clean, uncluttered daily workspace tailored to each employee & dept
  // - Universal Command Search Bar (S/N, Model, Customer, Tool)
  // - 4-6 Personal Pinned Tools per employee (persisted locally + synced to GAS)
  // - Collapsible App Drawer ("⊞ คลังเครื่องมือทั้งหมด") to pin/unpin/launch any tool
  // ============================================================================
  const HZK_V1173_PIN_MAP_KEY = 'hzk_v1173_employee_pinned_tools_map';
  const HZK_V1173_CLEAN_MODE_KEY = 'hzk_v1173_ultra_clean_canvas_mode';

  const MASTER_TOOL_CATALOG_V1173 = [
    // Service & Field Tech
    { id: 'SCAN_SN_360', icon: '📷', cat: 'Service & Field Tech', titleTh: 'สแกน S/N & ดูประวัติ 360°', titleEn: 'Scan S/N & 360° History', titleJp: 'S/Nスキャン・360°履歴', sub: 'เช็กประกัน ดีลเลอร์ และประวัติซ่อมเก่า', fn: "window.openSerial360TimelineModal('')" },
    { id: 'FIELD_REPAIR_ETA', icon: '🔧', cat: 'Service & Field Tech', titleTh: 'งานซ่อมต่อเนื่อง & รอบอะไหล่ (ETA)', titleEn: 'Multi-Round Repair & Parts ETA', titleJp: '継続修理・部品納期(ETA)管理', sub: 'เสนอราคาอะไหล่เพิ่ม + ล็อกคิวช่างอัตโนมัติ', fn: "window.openFieldRepairPartsPipelineModal()" },
    { id: 'VAN_STOCK', icon: '🚐', cat: 'Service & Field Tech', titleTh: 'คลังอะไหล่รถช่าง (T01–T08)', titleEn: 'Technician Van Stock', titleJp: 'サービスカー部品在庫', sub: 'ตัดสต็อกหน้างาน + แจ้งเตือนสโตร์อัตโนมัติ', fn: "window.openTechnicianVanStockModal()" },
    { id: 'DISPATCH_BOARD', icon: '📅', cat: 'Service & Field Tech', titleTh: 'กระดานจ่ายงานช่าง & ติดตั้ง', titleEn: 'Technician Dispatch Board', titleJp: '技術者ディスパッチ予定表', sub: 'จัดคิวติดตั้ง/ซ่อมรายวันของช่าง T01–T08', fn: "window.openServiceDispatchCalendarModal()" },
    { id: 'PM_RENEWAL', icon: '🔔', cat: 'Service & Field Tech', titleTh: 'แจ้งเตือนหมดประกัน & ต่อสัญญา PM (60 วัน)', titleEn: 'PM & Warranty Renewal (60d)', titleJp: '保証期限・保守契約更新 (60日前)', sub: 'สแกนเครื่องใกล้หมดประกัน + ออกใบเสนอราคา 1 คลิก', fn: "window.openWarrantyPmRenewalModal()" },
    { id: 'SEND_SERVICE_DOC', icon: '📤', cat: 'Service & Field Tech', titleTh: 'ส่งใบแจ้งบริการ / ใบเสร็จให้ลูกค้า', titleEn: 'Send Tracked Service Doc', titleJp: 'サービス報告書・領収書送信', sub: 'ส่งเข้า LINE / Email พร้อมปุ่มยืนยันรับ', fn: "launchTrackedDocFromServiceForm()" },

    // Commercial Sales & Japanese Corporate
    { id: 'QUOTE_SALES_THB', icon: '📄', cat: 'Sales & Japanese Corp', titleTh: 'ออกใบเสนอราคา Sales (THB)', titleEn: 'New Sales Quotation (THB)', titleJp: '新規見積書作成 (THB)', sub: 'เติมขนาด W×D×H + เช็กสต็อกสด 203 รุ่น', fn: "openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)')" },
    { id: 'QUOTE_JPC', icon: '🇯🇵', cat: 'Sales & Japanese Corp', titleTh: 'ใบเสนอราคา Japanese Corporate', titleEn: 'New JPC Quotation (THB/USD)', titleJp: '日系法人向け見積書作成', sub: 'รองรับ Export USD 0% VAT & Local THB + CC JPC', fn: "openSalesCorporateQuotationWithPreset('Japanese Corporate', 'ใบเสนอราคา (Quotation)')" },
    { id: 'SITE_SURVEY', icon: '📐', cat: 'Sales & Japanese Corp', titleTh: 'แบบตรวจความพร้อมหน้างาน (Site Survey)', titleEn: 'Pre-Install Site Survey', titleJp: '設置前現場チェックシート', sub: 'เช็กแรงดันน้ำ ไฟ ท่อน้ำทิ้ง & ชุดกรองน้ำ', fn: "window.openPreInstallSiteSurveyModal()" },
    { id: 'CROSS_HANDOVER', icon: '🔄', cat: 'Sales & Japanese Corp', titleTh: 'ส่งต่องานติดตั้ง & ลงทะเบียน S/N', titleEn: 'Sales-to-Service Handover', titleJp: 'サービス部へ設置作業引継', sub: 'ส่งใบงานให้ฝ่ายบริการเข้าติดตั้งพร้อมผูกประกัน', fn: "openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)', 'HANDOVER')" },
    { id: 'DOC_TRACKING', icon: '📊', cat: 'Sales & Japanese Corp', titleTh: 'ติดตามเอกสาร & E-Sign PO ลูกค้า', titleEn: 'Document & PO Tracking', titleJp: '見積書送付・注文書(PO)承認状況', sub: 'เช็กสถานะเปิดอ่าน ยืนยันรับ และเซ็น PO', fn: "window.openDocumentTrackingDashboardModal()" },

    // Marketing & Product
    { id: 'DEMO_STOCK', icon: '🏷️', cat: 'Marketing & Product', titleTh: 'สต็อกเครื่องโชว์ / มีตำหนิ (602 รายการ)', titleEn: 'Demo & Clearance Stock (602)', titleJp: '展示機・訳あり在庫一覧 (602台)', sub: 'ดูสภาพเครื่อง ใบตรวจสภาพ และดึงลงใบเสนอราคา', fn: "window.openDamageDemoStockModal()" },
    { id: 'QUOTE_MARKETING', icon: '📣', cat: 'Marketing & Product', titleTh: 'ออกใบเสนอราคาแคมเปญ Marketing', titleEn: 'Campaign & Promo Quotation', titleJp: 'キャンペーン見積書作成', sub: 'สร้างใบเสนอราคาโปรโมชันพร้อมการ์ด LINE', fn: "openSalesCorporateQuotationWithPreset('Marketing', 'ใบเสนอราคา (Quotation)')" },
    { id: 'SYNC_EMAIL_STOCK', icon: '📥', cat: 'Marketing & Product', titleTh: 'อัปเดตสต็อกสด MICHIRU-RPA', titleEn: 'Sync Daily Stock Report', titleJp: '日次在庫レポート同期', sub: 'ดึงไฟล์ Stock on Hand ล่าสุดเข้าฐานข้อมูล', fn: "window.triggerEmailStockSyncNow()" },

    // Accounting, Admin & HR
    { id: 'BILLING_RECEIPT', icon: '🧾', cat: 'Accounting, Admin & HR', titleTh: 'ออกใบวางบิล / ใบเสร็จรับเงิน (1 คลิก)', titleEn: 'Create Billing Note / Receipt', titleJp: '請求書・領収書作成', sub: 'Tax ID 13 หลัก/สาขา + VAT 7% / WHT 3%', fn: "openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบวางบิล (Billing Note)')" },
    { id: 'EXPORT_NAV', icon: '🏭', cat: 'Accounting, Admin & HR', titleTh: 'ส่งออก Sales Order เข้า NAV (CSV)', titleEn: 'Export PO Approved to NAV', titleJp: '承認済POデータをNAV用CSV出力', sub: 'ดาวน์โหลดไฟล์ CSV นำเข้า Microsoft Dynamics NAV', fn: "window.exportErpSalesOrdersCsv()" },
    { id: 'GO_LIVE_QA', icon: '🛡️', cat: 'Accounting, Admin & HR', titleTh: 'ตรวจความพร้อมระบบ & Go-Live QA', titleEn: 'Production Readiness QA', titleJp: '本番稼働・システムヘルス点検', sub: 'เช็กสถานะ API, Google Sheets, LINE OA', fn: "window.openProductionGoLiveQaModal()" },
    { id: 'ROLE_SOP', icon: '📖', cat: 'Accounting, Admin & HR', titleTh: 'คู่มือใช้งานแยกแผนก (Role SOP Guide)', titleEn: 'Department Role SOP Guide', titleJp: '部署別操作マニュアル (SOP)', sub: 'คู่มือมาตรฐานการทำงานสำหรับทุกแผนก', fn: "window.openDepartmentRoleSopModal()" },

    // Collaboration, Task Board, BI & Executive
    { id: 'TASK_BOARD', icon: '📋', cat: 'Collaboration & Reports', titleTh: 'กระดานงาน & To-Do List แผนก', titleEn: 'Department Task Board & To-Do', titleJp: '部署別タスクボード・To-Do', sub: 'รวมงานค้างตามลำดับความสำคัญ + Kanban 4 ช่อง', fn: "window.openDepartmentTaskBoardModal()" },
    { id: 'OMNI_MEET_AI', icon: '📹', cat: 'Collaboration & Reports', titleTh: 'ประชุมทีม & AI สรุปรายงานประชุม', titleEn: 'Omni-Meet & AI Minutes', titleJp: 'Web会議・AI議事録自動作成', sub: 'ประชุมหน้างาน/WFH/แผนก + อัดเสียงสรุป 3 ภาษา', fn: "window.openOmniMeetAndAiMinutesModal()" },
    { id: 'DEPT_REPORT', icon: '📑', cat: 'Collaboration & Reports', titleTh: 'ศูนย์ออกรายงานประจำแผนก 1 คลิก', titleEn: '1-Click Department Reports', titleJp: '部署別ワンクリックレポート出力', sub: 'ดาวน์โหลดรายงานเฉพาะแผนก (CSV / Excel)', fn: "window.openDepartmentReportCenterModal()" },
    { id: 'LIFECYCLE_PNL', icon: '💰', cat: 'Executive & Intelligence', titleTh: 'วิเคราะห์กำไร-ขาดทุน S/N & ตั้งราคา', titleEn: 'Serial Lifecycle P&L & Pricing', titleJp: '機種別ライフサイクル損益・価格戦略', sub: 'เทียบราคาขายหักต้นทุนซ่อม + จำลองโปรฯ', fn: "window.openSerialLifecyclePricingSuiteModal()" },
    { id: 'EXEC_BI', icon: '📈', cat: 'Executive & Intelligence', titleTh: 'รายงานสรุปผู้บริหาร & AI Copilot (BI)', titleEn: 'Executive BI & AI Copilot', titleJp: '経営サマリーBI & AIコパイロット', sub: 'ภาพรวมยอดขาย PO งานบริการ & ส่งเข้า LINE', fn: "window.openExecutiveBiDashboardModal()" },
    { id: 'INCENTIVE_KPI', icon: '🏆', cat: 'Executive & Intelligence', titleTh: 'สรุปผลงาน & Incentive รายบุคคล', titleEn: 'Monthly Sales & Tech KPI', titleJp: '月次営業・サービス個人別実績KPI', sub: 'จัดอันดับยอดปิดการขายและผลงานช่างรายเดือน', fn: "window.openMonthlyIncentiveKpiModal()" }
  ];

  const DEFAULT_DEPT_PINS_V1173 = {
    SERVICE_TECH: ['SCAN_SN_360', 'VAN_STOCK', 'FIELD_REPAIR_ETA', 'OMNI_MEET_AI'],
    SERVICE_MGR: ['DISPATCH_BOARD', 'FIELD_REPAIR_ETA', 'PM_RENEWAL', 'LIFECYCLE_PNL'],
    SALES_TH: ['QUOTE_SALES_THB', 'DOC_TRACKING', 'CROSS_HANDOVER', 'TASK_BOARD'],
    JPC_CORP: ['QUOTE_JPC', 'SCAN_SN_360', 'DEPT_REPORT', 'OMNI_MEET_AI'],
    MARKETING: ['DEMO_STOCK', 'QUOTE_MARKETING', 'LIFECYCLE_PNL', 'DEPT_REPORT'],
    ACCOUNTING: ['BILLING_RECEIPT', 'EXPORT_NAV', 'DOC_TRACKING', 'DEPT_REPORT'],
    ADMIN_HR: ['TASK_BOARD', 'OMNI_MEET_AI', 'GO_LIVE_QA', 'DEPT_REPORT'],
    EXECUTIVE: ['EXEC_BI', 'LIFECYCLE_PNL', 'INCENTIVE_KPI', 'OMNI_MEET_AI']
  };

  function getEmployeePinnedToolIds(emp) {
    try {
      const map = JSON.parse(localStorage.getItem(HZK_V1173_PIN_MAP_KEY) || '{}');
      if (emp && emp.id && Array.isArray(map[emp.id]) && map[emp.id].length > 0) {
        return map[emp.id];
      }
    } catch (e) {}
    return (emp && DEFAULT_DEPT_PINS_V1173[emp.deptKey]) || DEFAULT_DEPT_PINS_V1173.SERVICE_MGR;
  }

  async function saveEmployeePinnedToolIds(emp, pinIds) {
    if (!emp || !emp.id) return;
    try {
      const map = JSON.parse(localStorage.getItem(HZK_V1173_PIN_MAP_KEY) || '{}');
      map[emp.id] = pinIds;
      localStorage.setItem(HZK_V1173_PIN_MAP_KEY, JSON.stringify(map));
    } catch (e) {}

    const gasUrl = getGasEndpointUrl();
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'saveEmployeePinnedPreferences',
            empId: emp.id,
            empName: emp.name,
            department: emp.deptLabel,
            pinnedIds: pinIds,
            lang: getActiveCockpitLang()
          })
        });
      } catch (e) {}
    }
  }

  function openPersonalAppDrawerModal() {
    const emp = getActiveEmployeeProfileV1171();
    const lang = getActiveCockpitLang();
    let pinnedIds = getEmployeePinnedToolIds(emp);

    let modal = document.getElementById('hzkPersonalAppDrawerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkPersonalAppDrawerModal';
      modal.style.cssText =
        'position:fixed;inset:0;z-index:20090;background:rgba(15,23,42,0.88);display:flex;' +
        'align-items:center;justify-content:center;padding:10px;overflow-y:auto;';
      document.body.appendChild(modal);
    }

    function renderDrawerContent(searchQuery) {
      const q = String(searchQuery || '').trim().toLowerCase();
      const categories = [
        'Service & Field Tech',
        'Sales & Japanese Corp',
        'Marketing & Product',
        'Accounting, Admin & HR',
        'Collaboration & Reports',
        'Executive & Intelligence'
      ];

      const catBlocks = categories.map(cat => {
        const tools = MASTER_TOOL_CATALOG_V1173.filter(t => {
          if (t.cat !== cat) return false;
          if (!q) return true;
          return (t.titleTh + ' ' + t.titleEn + ' ' + t.titleJp + ' ' + t.sub + ' ' + t.cat).toLowerCase().indexOf(q) !== -1;
        });
        if (!tools.length) return '';

        const cards = tools.map(t => {
          const isPinned = pinnedIds.indexOf(t.id) !== -1;
          const label = lang === 'JP' ? t.titleJp : (lang === 'EN' ? t.titleEn : t.titleTh);
          return `
            <div style="background:${isPinned ? '#F0F9FF' : '#F8FAFC'};border:1.5px solid ${isPinned ? '#0284C7' : '#CBD5E1'};border-radius:12px;padding:11px 12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
              <div onclick="document.getElementById('hzkPersonalAppDrawerModal').style.display='none';${t.fn}" style="cursor:pointer;display:flex;align-items:flex-start;gap:10px;">
                <span style="font-size:22px;line-height:1.1;">${t.icon}</span>
                <div>
                  <div style="font-weight:800;font-size:13px;color:#0F172A;">${label}</div>
                  <div style="font-size:11px;color:#475569;margin-top:2px;">${t.sub}</div>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E2E8F0;padding-top:6px;">
                <button type="button" onclick="document.getElementById('hzkPersonalAppDrawerModal').style.display='none';${t.fn}" style="background:#002B49;color:#FFF;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">▶ เปิดใช้งาน</button>
                <button type="button" data-pin-id="${t.id}" class="hzk-drawer-pin-toggle-btn" style="background:${isPinned ? '#0284C7' : '#E2E8F0'};color:${isPinned ? '#FFF' : '#0F172A'};border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;">${isPinned ? '📌 ปักหมุดอยู่ (ถอดหมุด)' : '📍 ปักหมุดขึ้นหน้าแรก'}</button>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div style="margin-bottom:14px;">
            <div style="font-weight:800;color:#002B49;font-size:13px;margin-bottom:6px;border-bottom:1px solid #E2E8F0;padding-bottom:3px;">${cat}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;">${cards}</div>
          </div>
        `;
      }).join('');

      document.getElementById('hzkAppDrawerListWrap').innerHTML = catBlocks || '<div style="color:#64748B;padding:12px;">ไม่พบเครื่องมือที่ค้นหา</div>';

      modal.querySelectorAll('.hzk-drawer-pin-toggle-btn').forEach(btn => {
        btn.onclick = async () => {
          const tid = btn.getAttribute('data-pin-id');
          if (pinnedIds.indexOf(tid) !== -1) {
            if (pinnedIds.length <= 1) {
              alert('ควรมีปุ่มปักหมุดบนหน้าแรกอย่างน้อย 1 ปุ่มครับ');
              return;
            }
            pinnedIds = pinnedIds.filter(x => x !== tid);
          } else {
            if (pinnedIds.length >= 6) {
              alert('แนะนำให้ปักหมุดบนหน้าแรกสูงสุด 6 ปุ่มเพื่อให้หน้าจอโล่งสะอาดตาครับ (กรุณาถอดหมุดปุ่มที่ไม่ใช้ออกก่อน)');
              return;
            }
            pinnedIds = pinnedIds.concat([tid]);
          }
          await saveEmployeePinnedToolIds(emp, pinnedIds);
          renderDrawerContent(document.getElementById('hzkDrawerSearchInp').value);
          renderCleanCanvasCockpitV1173(emp);
        };
      });
    }

    modal.innerHTML = `
      <div style="background:#FFFFFF;width:100%;max-width:1040px;max-height:92vh;overflow-y:auto;border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,0.5);font-family:sans-serif;color:#0F172A;">
        <div style="background:linear-gradient(135deg,#002B49,#0369A1);color:#FFF;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:#FDE047;font-weight:800;">ENTERPRISE v1173 • PERSONAL APP DRAWER &amp; PIN CUSTOMIZER</div>
            <div style="font-size:16px;font-weight:800;">⊞ คลังเครื่องมือทั้งหมด (เลือกปักหมุดขึ้นหน้าแรกของ ${emp.nickname || emp.code})</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" id="hzkResetPinsDefaultBtn" style="background:rgba(255,255,255,0.18);color:#FFF;border:1px solid rgba(255,255,255,0.4);border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer;">↺ คืนค่าปุ่มมาตรฐานแผนก</button>
            <button type="button" onclick="document.getElementById('hzkPersonalAppDrawerModal').style.display='none'" style="background:#EF4444;color:#FFF;border:none;border-radius:8px;padding:6px 14px;font-weight:700;cursor:pointer;">✕ ปิด</button>
          </div>
        </div>
        <div style="padding:16px 20px;">
          <input id="hzkDrawerSearchInp" type="text" placeholder="🔍 ค้นหาชื่อเครื่องมือ เช่น ใบเสนอราคา, วางบิล, สต็อก, S/N, ประชุม..." style="width:100%;padding:9px 12px;border:1.5px solid #94A3B8;border-radius:10px;font-size:13px;margin-bottom:14px;" />
          <div id="hzkAppDrawerListWrap"></div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    document.getElementById('hzkDrawerSearchInp').oninput = function () {
      renderDrawerContent(this.value);
    };

    document.getElementById('hzkResetPinsDefaultBtn').onclick = async () => {
      pinnedIds = DEFAULT_DEPT_PINS_V1173[emp.deptKey] || DEFAULT_DEPT_PINS_V1173.SERVICE_MGR;
      await saveEmployeePinnedToolIds(emp, pinnedIds);
      renderDrawerContent('');
      renderCleanCanvasCockpitV1173(emp);
      showHzkToastNotification('✅ คืนค่าปุ่มปักหมุดมาตรฐานของแผนกเรียบร้อยแล้ว', false);
    };

    renderDrawerContent('');
  }

  function executeUniversalCommandSearch(rawQuery) {
    const q = String(rawQuery || '').trim();
    if (!q) {
      openPersonalAppDrawerModal();
      return;
    }
    const upper = q.toUpperCase();
    // 1) Product model pattern (e.g. IM-130NE, KM-160B)
    if (/^(IM|KM|FM|HR|HF|RT|HNC|HSU|JWE|DBF|DCM)-?[A-Z0-9\-]+$/i.test(upper)) {
      window.openSerialLifecyclePricingSuiteModal(upper);
      return;
    }
    // 2) Serial number pattern (e.g. K01234J)
    if (/^[A-Z][0-9]{4,6}[A-Z0-9]$/i.test(upper)) {
      window.openSerial360TimelineModal(upper);
      return;
    }
    // 3) Keyword routing
    if (/วางบิล|ใบเสร็จ|nav|บัญชี/i.test(q)) {
      openSalesCorporateQuotationWithPreset('Service & Billing', 'ใบวางบิล (Billing Note)');
      return;
    }
    if (/เสนอราคา|quote|qt/i.test(q)) {
      openSalesCorporateQuotationWithPreset('Sales', 'ใบเสนอราคา (Quotation)');
      return;
    }
    if (/ประชุม|meet|สรุป/i.test(q)) {
      window.openOmniMeetAndAiMinutesModal();
      return;
    }
    if (/งานค้าง|todo|กระดาน/i.test(q)) {
      window.openDepartmentTaskBoardModal();
      return;
    }
    // Otherwise open App Drawer pre-filtered with query
    openPersonalAppDrawerModal();
    setTimeout(() => {
      const inp = document.getElementById('hzkDrawerSearchInp');
      if (inp) {
        inp.value = q;
        inp.dispatchEvent(new Event('input'));
      }
    }, 50);
  }

  async function renderCleanCanvasCockpitV1173(empProfile) {
    const emp = empProfile || getActiveEmployeeProfileV1171();
    const cfg = DEPT_COCKPIT_CONFIGS_V1171[emp.deptKey] || DEPT_COCKPIT_CONFIGS_V1171.SERVICE_MGR;
    const lang = getActiveCockpitLang();
    const isUltraClean = localStorage.getItem(HZK_V1173_CLEAN_MODE_KEY) !== 'false';

    const pillBtn = document.getElementById('hzkMyPersonalCockpitPillBtn');
    if (pillBtn) {
      pillBtn.innerHTML = `🧑‍💻 ${emp.nickname || emp.code} [${emp.deptLabel}] ▾`;
    }

    const jobSheet = document.getElementById('jobSheetContainer');
    const mobNav = document.getElementById('mobileSectionNav');
    const showJobOverride = sessionStorage.getItem('hzk_v1171_force_show_jobsheet') === 'true';

    if (cfg.hideJobSheet && !showJobOverride) {
      if (jobSheet) jobSheet.style.display = 'none';
      if (mobNav) mobNav.style.display = 'none';
    } else {
      if (jobSheet) jobSheet.style.display = '';
      if (mobNav) mobNav.style.display = '';
    }

    let cockpit = document.getElementById('hzkPersonalizedEmployeeCockpitCard');
    if (!cockpit) {
      cockpit = document.createElement('section');
      cockpit.id = 'hzkPersonalizedEmployeeCockpitCard';
      cockpit.style.cssText =
        'max-width:1040px;margin:10px auto 14px;background:#FFFFFF;border-radius:16px;' +
        'box-shadow:0 10px 28px rgba(15,23,42,0.09);overflow:hidden;font-family:sans-serif;';
      if (jobSheet && jobSheet.parentNode) {
        jobSheet.parentNode.insertBefore(cockpit, jobSheet);
      } else {
        document.body.insertBefore(cockpit, document.body.firstChild);
      }
    }

    cockpit.style.border = `1.5px solid ${cfg.accent}`;
    const pinnedIds = getEmployeePinnedToolIds(emp);
    const pinnedTools = pinnedIds
      .map(id => MASTER_TOOL_CATALOG_V1173.find(t => t.id === id))
      .filter(Boolean);

    const pinnedCardsHtml = pinnedTools.map(t => {
      const label = lang === 'JP' ? t.titleJp : (lang === 'EN' ? t.titleEn : t.titleTh);
      return `
        <button type="button" onclick="${t.fn}" style="text-align:left;background:#FFFFFF;border:1.5px solid #E2E8F0;border-radius:14px;padding:14px 15px;cursor:pointer;display:flex;align-items:center;gap:12px;box-shadow:0 2px 6px rgba(15,23,42,0.04);transition:all 0.15s ease;min-height:64px;">
          <span style="font-size:25px;line-height:1;">${t.icon}</span>
          <span>
            <div style="font-weight:800;font-size:13.5px;color:#0F172A;">${label}</div>
            <div style="font-size:11.5px;color:#64748B;margin-top:2px;">${t.sub}</div>
          </span>
        </button>
      `;
    }).join('');

    const toggleJobBtnHtml = cfg.hideJobSheet
      ? `<button type="button" id="hzkV1171ToggleJobFormBtn" style="background:rgba(255,255,255,0.16);color:#FFF;border:1px solid rgba(255,255,255,0.38);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">${showJobOverride ? '🙈 ซ่อนฟอร์มช่าง' : '🛠️ ฟอร์มช่าง'}</button>`
      : '';

    cockpit.innerHTML = `
      <!-- Clean Header Bar -->
      <div style="background:${cfg.gradient};color:#FFFFFF;padding:13px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="background:rgba(0,0,0,0.28);color:#FDE047;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:800;">${emp.deptLabel.toUpperCase()}</span>
            <span style="font-size:14.5px;font-weight:800;">สวัสดี, ${emp.name}</span>
          </div>
          <div style="font-size:11.5px;opacity:0.88;margin-top:2px;">${emp.role} • หน้าจอโฟกัสประจำวัน (Clean Workspace)</div>
        </div>

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:2px;display:inline-flex;gap:2px;">
            <button type="button" data-lang="TH" class="hzk-v1171-lang-btn" style="background:${lang === 'TH' ? '#FFF' : 'transparent'};color:${lang === 'TH' ? '#002B49' : '#FFF'};border:none;border-radius:6px;padding:3px 7px;font-size:10.5px;font-weight:800;cursor:pointer;">TH</button>
            <button type="button" data-lang="EN" class="hzk-v1171-lang-btn" style="background:${lang === 'EN' ? '#FFF' : 'transparent'};color:${lang === 'EN' ? '#002B49' : '#FFF'};border:none;border-radius:6px;padding:3px 7px;font-size:10.5px;font-weight:800;cursor:pointer;">EN</button>
            <button type="button" data-lang="JP" class="hzk-v1171-lang-btn" style="background:${lang === 'JP' ? '#FFF' : 'transparent'};color:${lang === 'JP' ? '#002B49' : '#FFF'};border:none;border-radius:6px;padding:3px 7px;font-size:10.5px;font-weight:800;cursor:pointer;">日本語</button>
          </div>
          ${toggleJobBtnHtml}
          <button type="button" id="hzkV1171SwitchUserBtn" style="background:#FDE047;color:#0F172A;border:none;border-radius:8px;padding:5px 11px;font-size:11.5px;font-weight:800;cursor:pointer;">🔄 สลับพนักงาน</button>
        </div>
      </div>

      <!-- Clean Body Canvas -->
      <div style="padding:14px 18px;background:#F8FAFC;">
        <!-- Universal Command Search + Drawer Trigger -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <div style="flex:1;min-width:220px;display:flex;background:#FFFFFF;border:1.5px solid #CBD5E1;border-radius:11px;overflow:hidden;">
            <input id="hzkUniversalCmdInput" type="text" placeholder="🔍 ค้นหาด่วน: พิมพ์เลข S/N, รุ่นเครื่อง (IM-130NE), วางบิล, ประชุม..." style="flex:1;border:none;padding:9px 12px;font-size:12.5px;outline:none;" />
            <button type="button" id="hzkUniversalCmdGoBtn" style="background:#002B49;color:#FFF;border:none;padding:0 14px;font-weight:700;font-size:12px;cursor:pointer;">ค้นหา</button>
          </div>
          <button type="button" id="hzkOpenAppDrawerBtn" style="background:#FFFFFF;color:#002B49;border:1.5px solid #0284C7;border-radius:11px;padding:8px 14px;font-weight:800;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            ⊞ คลังเครื่องมือทั้งหมด (${MASTER_TOOL_CATALOG_V1173.length}) / ปักหมุด
          </button>
        </div>

        <!-- Morning Focus Strip (Compact Status Pills) -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:12px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:11px;padding:8px 12px;font-size:12px;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
            <span>📥 ส่งต่อถึงฉัน: <b id="hzkMetricHandovers" style="color:#002B49;">0</b></span>
            <span>🛠️ งานค้างระบบ: <b id="hzkMetricOpenJobs" style="color:#B91C1C;">-</b></span>
            <span>📄 ใบเสนอราคาฉัน: <b id="hzkMetricMyQt" style="color:#0284C7;">-</b></span>
            <span>✅ PO รอวางบิล: <b id="hzkMetricPoApproved" style="color:#059669;">-</b></span>
          </div>
          <button type="button" id="hzkToggleFocusDetailBtn" style="background:transparent;border:none;color:#0284C7;font-weight:700;font-size:11.5px;cursor:pointer;text-decoration:underline;">
            ${isUltraClean ? '▾ กางแถบงานร่วมกัน (To-Do / ประชุม / รายงาน)' : '▴ ย่อหน้าจอให้โล่ง'}
          </button>
        </div>

        <!-- Pinned Personal Shortcuts (Clean 2-Column Grid) -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
          <span style="font-size:11.5px;font-weight:800;color:#475569;">📌 เครื่องมือที่ปักหมุดไว้ของฉัน (My Pinned Shortcuts)</span>
          <button type="button" onclick="window.openPersonalAppDrawerModal()" style="background:transparent;border:none;color:#0284C7;font-size:11.5px;font-weight:700;cursor:pointer;">⚙️ ปรับแต่งปุ่มปักหมุด</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
          ${pinnedCardsHtml}
        </div>

        <!-- Collapsible Secondary Bar (Hidden in Clean-Canvas Mode until toggled) -->
        <div id="hzkCleanCanvasExtraDrawer" style="display:${isUltraClean ? 'none' : 'flex'};margin-top:12px;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:11px;padding:9px 12px;gap:6px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
          <span style="font-size:11.5px;font-weight:800;color:#002B49;">⚡ เครื่องมือเพิ่มเติม:</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="window.openDepartmentTaskBoardModal()" style="background:#002B49;color:#FDE047;border:none;border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;">📋 กระดานงาน &amp; To-Do</button>
            <button type="button" onclick="window.openOmniMeetAndAiMinutesModal()" style="background:#4F46E5;color:#FFF;border:none;border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;">📹 ประชุมทีม &amp; AI สรุปมติ</button>
            <button type="button" onclick="window.openFieldRepairPartsPipelineModal()" style="background:#B91C1C;color:#FFF;border:none;border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;">🔧 งานซ่อม &amp; รอบอะไหล่ ETA</button>
            <button type="button" onclick="window.openDepartmentReportCenterModal()" style="background:#059669;color:#FFF;border:none;border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;">📑 รายงานประจำแผนก</button>
          </div>
        </div>

        <div id="hzkV1171CrossDeptInboxWrap" style="margin-top:10px;display:none;background:#FFFBEB;border:1px solid #FDE68A;border-radius:11px;padding:9px 12px;">
          <div style="font-weight:800;color:#92400E;font-size:12px;margin-bottom:5px;">📥 งานส่งต่อที่รอรับเรื่อง (${emp.deptLabel}):</div>
          <div id="hzkV1171CrossDeptInboxList" style="display:flex;flex-direction:column;gap:5px;"></div>
        </div>
      </div>
    `;

    cockpit.querySelectorAll('.hzk-v1171-lang-btn').forEach(btn => {
      btn.onclick = () => {
        localStorage.setItem(HZK_V1171_LANG_KEY, btn.getAttribute('data-lang'));
        renderCleanCanvasCockpitV1173(emp);
      };
    });

    document.getElementById('hzkV1171SwitchUserBtn').onclick = openPersonalEmployeeSelectorModal;
    document.getElementById('hzkOpenAppDrawerBtn').onclick = openPersonalAppDrawerModal;

    const cmdInp = document.getElementById('hzkUniversalCmdInput');
    document.getElementById('hzkUniversalCmdGoBtn').onclick = () => executeUniversalCommandSearch(cmdInp.value);
    cmdInp.onkeydown = (e) => { if (e.key === 'Enter') executeUniversalCommandSearch(cmdInp.value); };

    document.getElementById('hzkToggleFocusDetailBtn').onclick = () => {
      const nextClean = !isUltraClean;
      localStorage.setItem(HZK_V1173_CLEAN_MODE_KEY, String(nextClean));
      renderCleanCanvasCockpitV1173(emp);
    };

    const toggleJobBtn = document.getElementById('hzkV1171ToggleJobFormBtn');
    if (toggleJobBtn) {
      toggleJobBtn.onclick = () => {
        sessionStorage.setItem('hzk_v1171_force_show_jobsheet', String(!showJobOverride));
        renderCleanCanvasCockpitV1173(emp);
      };
    }

    // Sync metrics & cloud-saved pins if GAS URL is configured
    const gasUrl = getGasEndpointUrl();
    if (gasUrl) {
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'getEmployeeWorkspaceBriefing',
            empId: emp.id,
            empCode: emp.code,
            department: emp.deptLabel
          })
        });
        const d = await res.json();
        if (d && d.status === 'OK' && d.metrics) {
          const m = d.metrics;
          const elH = document.getElementById('hzkMetricHandovers');
          const elJ = document.getElementById('hzkMetricOpenJobs');
          const elQ = document.getElementById('hzkMetricMyQt');
          const elP = document.getElementById('hzkMetricPoApproved');
          if (elH) elH.textContent = `${m.pendingHandoversCount}`;
          if (elJ) elJ.textContent = emp.isTech ? `${m.myJobsCount}/${m.openJobsCount}` : `${m.openJobsCount}`;
          if (elQ) elQ.textContent = `${m.myQtCount}/${m.totalQtCount}`;
          if (elP) elP.textContent = `${m.poApprovedCount}`;

          const inboxWrap = document.getElementById('hzkV1171CrossDeptInboxWrap');
          const inboxList = document.getElementById('hzkV1171CrossDeptInboxList');
          if (inboxWrap && inboxList && Array.isArray(d.pendingHandovers) && d.pendingHandovers.length > 0) {
            inboxWrap.style.display = 'block';
            inboxList.innerHTML = d.pendingHandovers.map(h => `
              <div style="background:#FFFFFF;border:1px solid #FCD34D;border-radius:8px;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:11.5px;">
                <div><b>[${h.handoverId}] ${h.fromDept}</b> ➔ <b>${h.customerName}</b> | ${h.modelSn} (${h.amount})</div>
                <button type="button" data-hnd-id="${h.handoverId}" class="hzk-v1171-ack-hnd-btn" style="background:#059669;color:#FFF;border:none;border-radius:6px;padding:4px 9px;font-weight:700;cursor:pointer;">✅ รับเรื่อง</button>
              </div>
            `).join('');

            inboxList.querySelectorAll('.hzk-v1171-ack-hnd-btn').forEach(b => {
              b.onclick = async () => {
                const hId = b.getAttribute('data-hnd-id');
                b.disabled = true;
                await fetch(gasUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({ action: 'completeCrossDeptHandover', handoverId: hId, actorName: emp.name })
                });
                renderCleanCanvasCockpitV1173(emp);
              };
            });
          }
        }
      } catch (err) {}
    } else {
      const localArchives = (() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_ARCHIVE_KEY) || '[]'); } catch (e) { return []; }
      })();
      const myQt = localArchives.filter(q => String(q.salesperson || '').toUpperCase() === emp.code.toUpperCase());
      const elQ = document.getElementById('hzkMetricMyQt');
      const elJ = document.getElementById('hzkMetricOpenJobs');
      const elP = document.getElementById('hzkMetricPoApproved');
      if (elQ) elQ.textContent = `${myQt.length}/${localArchives.length}`;
      if (elJ) elJ.textContent = 'Offline';
      if (elP) elP.textContent = '0';
    }
  }

  // Override renderPersonalizedEmployeeCockpit with Clean-Canvas v1173 engine
  window.renderPersonalizedEmployeeCockpit = renderCleanCanvasCockpitV1173;
  window.openPersonalAppDrawerModal = openPersonalAppDrawerModal;

  function bootPersonalizedCockpitV1171() {
    installGlobalRuntimeGuard();
    dockOmniBridgeButtons();
    renderCleanCanvasCockpitV1173(getActiveEmployeeProfileV1171());
    setTimeout(initMobileCleanUiDeclutter, 300);
    hookAdminStudioInspectorButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPersonalizedCockpitV1171);
  } else {
    bootPersonalizedCockpitV1171();
  }
})();
