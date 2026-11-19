/**
 * ============================================================================
 * HOSHIZAKI GLOBAL ENTERPRISE - Google Apps Script Backend (Enterprise v1041-FINAL)
 * ============================================================================
 * รองรับระบบปฏิบัติการหลังบ้านครบวงจร (Phase 1 Service Unit & Service Center Go-Live):
 * 1. ScriptProperties Security & LockService Concurrency Protection (withScriptLock_)
 * 2. Dual LINE OA Bridge (?bot=customer & ?bot=internal):
 *    - Customer OA: รับแจ้งซ่อม REQ-, STATUS, ETA, ผูกเบอร์โทรลงทะเบียน, อนุมัติใบเสนอราคา,
 *      ยืนยันนัดหมาย, จอง PM, ประเมินความพึงพอใจ CSAT 1-5 ดาว, เลือกแพ็กเกจ Good/Better/Best,
 *      และเช็กสุขภาพเครื่องหลังซ่อม 7 วัน (7-Day Post-Service Health Check)
 *    - Internal OA: แจ้งเตือนจ่ายงานให้ช่างกดรับงาน (ACCEPT_DISPATCH_JOB), ค้นหา SN/SPEC/MANUAL/ERR,
 *      อนุมัติ GP%, แจ้งเตือน CSAT ต่ำกว่า 3 ดาว, และสรุปประจำวัน 17:30 น.
 * 3. Closed-Loop Dispatch & Omni-Channel Notifier (LINE OA -> HTML Email -> SMS URI)
 * 4. Parts Advance 6-Stage Logistics Workflow & 3-Party Digital Signatures
 * 5. Factory GIT & Stock-on-Hand ETA Sync + NAV Gmail Auto-Importer + Proactive Arrival Matcher
 * 6. Live Field Fleet GPS Radar (Haversine Distance & ETA) & Technician Time/GPS Logs
 * 7. Service KPI & First-Time Fix Rate (FTFR) Aggregator + Dynamic Company Staff Directory
 * 8. Predictive 180-Day PM & 365-Day Warranty Alert Engine + Unlimited Drive PDF Index
 * 9. Full-Stack Backend Self-Diagnostic Probe (runBackendSelfDiagnostics_)
 * ============================================================================
 */

var DEFAULT_API_SECRET_KEY = '';
var ROOT_DRIVE_FOLDER_NAME = 'HOSHIZAKI_SERVICE_REPORTS_ARCHIVE';
var DEFAULT_BACKUP_EMAIL = 'services@hoshizaki.co.th';

var SPEC_SHEET_FOLDER_ID = '1J-8iMryohfrHaD9gc_iiIRtZrqMECVPV';
var MANUAL_PDF_FOLDER_IDS = [
  '1gxzMZ4l5wjXKoRTM0TRIH_l505y8AVsj',
  '16FbLyB9eredvW8RH-dmk_NwhyaCOkiDR',
  '1HVU-f-05Ts8ipWxwXdsXoI20TossTeL4'
];

// ============================================================================
// 1. SECURE CONFIGURATION, CONCURRENCY LOCK & SCRIPT PROPERTIES HELPER
// ============================================================================

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.tryLock(25000);
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getAppSecrets_() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiSecretKey: props.getProperty('API_SECRET_KEY') || DEFAULT_API_SECRET_KEY,
    lineToken: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '',
    customerLineToken: props.getProperty('CUSTOMER_LINE_CHANNEL_ACCESS_TOKEN') || props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '',
    internalLineToken: props.getProperty('INTERNAL_LINE_CHANNEL_ACCESS_TOKEN') || props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '',
    lineMainOfficeToken: props.getProperty('LINE_MAIN_OFFICE_TOKEN') || '',
    lineMainOfficeId: props.getProperty('LINE_MAIN_OFFICE_ID') || '',
    lineBotId: props.getProperty('LINE_SERVICE_BOT_ID') || '',
    lineGroupId: props.getProperty('LINE_TECH_GROUP_ID') || 'Cef7603e1024beffe64c1d030450014c2',
    mgmtGroupId: props.getProperty('LINE_MGMT_GROUP_ID') || props.getProperty('LINE_TECH_GROUP_ID') || 'Cef7603e1024beffe64c1d030450014c2',
    pwaWebAppUrl: props.getProperty('PWA_WEB_APP_URL') || '',
    lineAutoNotifyNewJob: (props.getProperty('LINE_AUTO_NOTIFY_NEW_JOB') || 'true').toLowerCase() !== 'false',
    phase2AdminUnit: (props.getProperty('PHASE2_ADMIN_UNIT') || 'false').toLowerCase() === 'true',
    phase2AccountingUnit: (props.getProperty('PHASE2_ACCOUNTING_UNIT') || 'false').toLowerCase() === 'true'
  };
}

function checkAndNotifyEmailQuota_(secrets) {
  var rem = MailApp.getRemainingDailyQuota();
  if (rem <= 10 && secrets && secrets.lineGroupId) {
    try {
      var props = PropertiesService.getScriptProperties();
      var todayKey = 'QUOTA_WARN_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
      if (!props.getProperty(todayKey)) {
        props.setProperty(todayKey, '1');
        pushLineMessage(
          secrets.lineGroupId,
          '⚠️ [SYSTEM ALERT] โควตาการส่งอีเมลสำรองของ Google Apps Script วันนี้เหลือเพียง ' + rem + ' ฉบับ ระบบจะหยุดส่งอีเมลอัตโนมัติชั่วคราวจนกว่าจะรีเซ็ตโควตาพรุ่งนี้'
        );
      }
    } catch (eQuota) {}
  }
  return rem > 5;
}

function buildLineAddFriendUrl_(basicId) {
  var clean = String(basicId || '').trim();
  if (!clean) return '';
  if (clean.indexOf('http') === 0) return clean;
  if (clean.charAt(0) !== '@') clean = '@' + clean;
  return 'https://line.me/R/ti/p/' + encodeURIComponent(clean);
}

function setupScriptPropertiesSecrets() {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperties();
  var defaults = {
    API_SECRET_KEY: current.API_SECRET_KEY || '',
    LINE_CHANNEL_ACCESS_TOKEN: current.LINE_CHANNEL_ACCESS_TOKEN || '',
    CUSTOMER_LINE_CHANNEL_ACCESS_TOKEN: current.CUSTOMER_LINE_CHANNEL_ACCESS_TOKEN || '',
    INTERNAL_LINE_CHANNEL_ACCESS_TOKEN: current.INTERNAL_LINE_CHANNEL_ACCESS_TOKEN || '',
    LINE_SERVICE_BOT_ID: current.LINE_SERVICE_BOT_ID || '',
    LINE_MAIN_OFFICE_ID: current.LINE_MAIN_OFFICE_ID || '',
    LINE_MAIN_OFFICE_TOKEN: current.LINE_MAIN_OFFICE_TOKEN || '',
    LINE_TECH_GROUP_ID: current.LINE_TECH_GROUP_ID || '',
    LINE_MGMT_GROUP_ID: current.LINE_MGMT_GROUP_ID || '',
    PWA_WEB_APP_URL: current.PWA_WEB_APP_URL || '',
    LINE_AUTO_NOTIFY_NEW_JOB: current.LINE_AUTO_NOTIFY_NEW_JOB || 'true',
    PHASE2_ADMIN_UNIT: current.PHASE2_ADMIN_UNIT || 'false',
    PHASE2_ACCOUNTING_UNIT: current.PHASE2_ACCOUNTING_UNIT || 'false'
  };
  props.setProperties(defaults, false);
  Logger.log('✅ บันทึกค่าความปลอดภัย Dual-Account LINE OA & Phase Flags ลง Script Properties เรียบร้อยแล้ว');
}

function installEnterpriseDailyTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    var fn = t.getHandlerFunction();
    if ([
      'sendDailyPmDueLineAlerts',
      'rebuildDrivePdfIndexSheet',
      'archiveOldServiceJobsToYearlySheets',
      'runPredictivePmAndWarrantyAlerts_',
      'runSevenDayPostServiceHealthCheck_',
      'sendDailyServiceOpsDigestToLine_',
      'autoImportNavReportsFromGmail_'
    ].indexOf(fn) > -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('runPredictivePmAndWarrantyAlerts_').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('runSevenDayPostServiceHealthCheck_').timeBased().everyDays(1).atHour(10).create();
  ScriptApp.newTrigger('sendDailyServiceOpsDigestToLine_').timeBased().everyDays(1).atHour(17).nearMinute(30).create();
  ScriptApp.newTrigger('autoImportNavReportsFromGmail_').timeBased().everyHours(4).create();
  ScriptApp.newTrigger('rebuildDrivePdfIndexSheet').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('archiveOldServiceJobsToYearlySheets').timeBased().onMonthDay(1).atHour(3).create();
  Logger.log('✅ ติดตั้ง Enterprise v1021 Triggers ครบทั้งหมด 6 รายการเรียบร้อยแล้ว');
}

function isLineTokenConfigured() {
  var s = getAppSecrets_();
  var token = s.internalLineToken || s.lineToken;
  return Boolean(token && token !== 'PASTE_YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE' && token.length > 20);
}

function isLineGroupConfigured() {
  var gid = getAppSecrets_().lineGroupId;
  return Boolean(gid && gid !== 'PASTE_YOUR_LINE_GROUP_ID_HERE');
}

// ============================================================================
// 2. HTTP ENDPOINTS (doPost & doGet)
// ============================================================================

function doPost(e) {
  var rawCheck = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
  if (rawCheck.indexOf('"events":[]') > -1 || rawCheck === '{}') {
    return ContentService.createTextOutput('{"status":"ok"}').setMimeType(ContentService.MimeType.JSON);
  }
  return withScriptLock_(function() {
    try {
      var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
      var data = JSON.parse(raw);
      var secrets = getAppSecrets_();
      var botParam = (e && e.parameter && e.parameter.bot) ? String(e.parameter.bot).toLowerCase() : '';

      // 1. Webhook Events จาก LINE Official Account (Dual LINE OA Bridge)
      if (data && Array.isArray(data.events)) {
        routeDualLineWebhook_(data.events, botParam);
        return jsonOut({ status: 'ok', source: 'LINE_WEBHOOK', bot: botParam || 'default', count: data.events.length });
      }

      // 2. ตรวจสอบ API_SECRET_KEY สำหรับคำขอจากเว็บแอป PWA
      if (secrets.apiSecretKey && (!data.apiSecretKey || data.apiSecretKey !== secrets.apiSecretKey)) {
        return jsonOut({ status: 'unauthorized', message: 'Invalid API Secret Key' });
      }

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var action = data.actionType || 'SAVE_JOB';

      // --- v1013 New Endpoints ---
      // --- v1024 Holistic Expansion & Outsource Parts Tracking Endpoints ---
      if (action === 'LOG_CROSS_MODULE_EVENT_BUS') {
        var evSheet = ss.getSheetByName('Cross_Module_Event_Bus_Log');
        if (!evSheet) {
          evSheet = ss.insertSheet('Cross_Module_Event_Bus_Log');
          evSheet.appendRow(['Timestamp', 'Event_Name', 'Source_Module', 'Actor', 'Payload_JSON']);
          evSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
        }
        evSheet.appendRow([
          new Date(),
          data.eventName || 'EVENT',
          data.source || 'PWA',
          data.actor || 'System',
          JSON.stringify(data.payload || {})
        ]);
        return jsonOut({ status: 'ok', sheet: 'Cross_Module_Event_Bus_Log' });
      }

      if (action === 'SYNC_OMNI_SCALE_V1057_RECORD') {
        var pillar = String(data.pillar || 'GENERAL');
        var sheetMap = {
          'RECURRING_BILLING': { name: 'Recurring_PM_4HCH_Billing', cols: ['Timestamp', 'Contract_ID', 'Serial_No', 'Model', 'Customer', 'Cycle_Type', 'Amount_THB', 'PromptPay_Ref', 'eTax_Status'] },
          'CHAIN_PORTAL': { name: 'B2B_Chain_Consolidated_Billing', cols: ['Timestamp', 'Statement_ID', 'Chain_Group', 'Branch_Count', 'Total_Units', 'Total_Amount_THB', 'Billing_Month', 'Status'] },
          'RENTAL_UNIT_PNL': { name: 'Rental_Fleet_Unit_PnL', cols: ['Timestamp', 'Serial_No', 'Model', 'Customer', 'Monthly_Rent_THB', 'Parts_Cost_THB', 'Labor_Cost_THB', 'Net_Margin_THB', 'ROI_Status'] },
          'NAV_ERP_SYNC': { name: 'NAV_ERP_BiDirectional_Queue', cols: ['Timestamp', 'Doc_No', 'Doc_Type', 'Customer_Code', 'Amount_THB', 'VAT_THB', 'Sync_Target', 'Sync_Status'] },
          'ASEAN_HQ_ROLLUP': { name: 'ASEAN_Regional_HQ_Rollup', cols: ['Timestamp', 'Entity_Code', 'Country', 'Currency', 'Active_Units', 'FTFR_Pct', 'Revenue_Local', 'Status'] }
        };
        var cfg = sheetMap[pillar] || { name: 'Omni_Scale_v1057_Log', cols: ['Timestamp', 'Pillar', 'Ref_ID', 'Entity', 'Summary', 'Amount', 'Meta_JSON', 'Status', 'Actor'] };
        var sh = ss.getSheetByName(cfg.name);
        if (!sh) {
          sh = ss.insertSheet(cfg.name);
          sh.appendRow(cfg.cols);
          sh.getRange(1, 1, 1, cfg.cols.length).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          sh.setFrozenRows(1);
        }
        var rowVals = Array.isArray(data.rowValues) ? data.rowValues : [new Date(), pillar, data.refId || '', data.entity || '', data.summary || '', data.amount || 0, JSON.stringify(data.payload || {}), data.status || 'SYNCED', data.actor || 'PWA'];
        rowVals[0] = new Date();
        sh.appendRow(rowVals);
        return jsonOut({ status: 'ok', sheet: cfg.name, pillar: pillar });
      }

      if (action === 'PREDICTIVE_HEALTH_AND_RENEWAL_SYNC') {
        var phSheet = ss.getSheetByName('Predictive_Asset_Health_Radar');
        if (!phSheet) {
          phSheet = ss.insertSheet('Predictive_Asset_Health_Radar');
          phSheet.appendRow(['Timestamp', 'Serial_No', 'Model', 'Customer_Store', 'Health_Score', 'Risk_Level', 'TDS_ppm', 'Condenser_C', 'Next_4HC_H_Date', 'Recommended_Parts', 'Action_Status']);
          phSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
        }
        phSheet.appendRow([
          new Date(),
          data.serial || '',
          data.model || '',
          data.customer || '',
          data.healthScore || 0,
          data.riskLevel || 'NORMAL',
          data.tdsPpm || 0,
          data.condenserC || 0,
          data.nextFilterDate || '',
          data.recommendedParts || '',
          data.actionStatus || 'MONITORED'
        ]);
        return jsonOut({ status: 'ok', sheet: 'Predictive_Asset_Health_Radar' });
      }

      if (action === 'B2B_BULK_PM_SCHEDULE') {
        var b2bSheet = ss.getSheetByName('B2B_Chain_Bulk_PM_Requests');
        if (!b2bSheet) {
          b2bSheet = ss.insertSheet('B2B_Chain_Bulk_PM_Requests');
          b2bSheet.appendRow(['Timestamp', 'Batch_ID', 'Chain_Account', 'Dealer_Owner', 'Branch_Count', 'Unit_Count', 'Target_Date', 'Units_JSON', 'Status']);
          b2bSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
        }
        b2bSheet.appendRow([
          new Date(),
          data.batchId || ('B2B-PM-' + Date.now()),
          data.chainAccount || 'SUSHIRO THAILAND',
          data.dealerOwner || 'MIXED_SERIAL_OWNERS',
          data.branchCount || 1,
          data.unitCount || 1,
          data.targetDate || '',
          JSON.stringify(data.units || []),
          'SCHEDULED_TO_DISPATCH'
        ]);
        return jsonOut({ status: 'ok', sheet: 'B2B_Chain_Bulk_PM_Requests' });
      }

      if (action === 'SYNC_USER_CREDENTIALS_VAULT') {
        return jsonOut(syncUserCredentialsVaultToSheet_(ss, data));
      }

      if (action === 'LOG_SECURITY_AUDIT_EVENT') {
        return jsonOut(logSecurityAuditEventToSheet_(ss, data));
      }

      if (action === 'SYNC_ENTERPRISE_IMS_BATCH') {
        return jsonOut(syncEnterpriseImsBatchToSheets_(ss, data, secrets));
      }

      if (action === 'GET_ENTERPRISE_IMS_DATA') {
        return jsonOut(getEnterpriseImsDataFromSheets_(ss));
      }

      if (action === 'UPSERT_OUTSOURCE_PARTS_APPT') {
        return jsonOut(upsertOutsourcePartsAppointment_(ss, data, secrets));
      }

      if (action === 'GET_OUTSOURCE_PARTS_APPT_LIST') {
        return jsonOut(getOutsourcePartsAppointmentsList_(ss, data));
      }

      if (action === 'SYNC_VAN_MINMAX_RESTOCK') {
        return jsonOut(syncVanMinMaxRestockBatch_(ss, data, secrets));
      }

      
      if (action === 'UPSERT_PARAMETER_KB_ENTRY') {
        return jsonOut(upsertParameterKbEntryToSheet_(ss, data));
      }

      if (action === 'INGEST_IOT_TELEMETRY') {
        return jsonOut(ingestIotTelemetryToSheet_(ss, data, secrets));
      }

      if (action === 'GET_IOT_TELEMETRY_FLEET') {
        return jsonOut(getIotTelemetryFleetFromSheet_(ss));
      }

      if (action === 'LOG_AI_DIAGNOSTIC_FEEDBACK') {
        return jsonOut(logAiDiagnosticFeedbackToSheet_(ss, data));
      }

      if (action === 'AI_GATEWAY_PROXY_QUERY') {
        return jsonOut(handleAiGatewayProxyQuery_(ss, data));
      }

      if (action === 'SYNC_SYSTEM_AUDIT_LOG') {
        return jsonOut(syncSystemAuditLogToSheet_(ss, data));
      }

      if (action === 'SYNC_ESG_REFRIGERANT_LOG') {
        return jsonOut(syncEsgRefrigerantLogToSheet_(ss, data));
      }

      if (action === 'CREATE_OUTSOURCE_SECURE_VAULT_LINK') {
        return jsonOut(createOutsourceSecureVaultLink_(ss, data));
      }

      if (action === 'SEND_OUTSOURCE_FLEX_CARD') {
        return jsonOut(sendOutsourceFlexCardViaOa_(ss, data, secrets));
      }

      if (action === 'SYNC_DEALER_CHANNEL_DIRECTORY') {
        return jsonOut(syncDealerChannelDirectoryToSheet_(ss, data));
      }

      if (action === 'ROUTE_CUSTOMER_CASE_TO_DEALER_OR_DIRECT') {
        return jsonOut(routeCustomerCaseToDealerOrDirect_(ss, data, secrets));
      }

      if (action === 'RUN_DEALER_FOLLOWUP_SCAN_NOW') {
        return jsonOut(runDealerDispatchFollowUpAndEscalation_(ss, secrets));
      }

      if (action === 'DEALER_REQUEST_HOSHIZAKI_SUBCONTRACT') {
        return jsonOut(requestHoshizakiSubcontractForDealer_(ss, data, secrets));
      }

      if (action === 'UPLOAD_FLEX_IMAGE_TO_DRIVE') {
        return jsonOut(uploadFlexStudioImageToDrive_(ss, data));
      }

      if (action === 'SAVE_CUSTOM_FLEX_TEMPLATE') {
        return jsonOut(saveCustomFlexTemplateToSheet_(ss, data));
      }

      if (action === 'SEND_CUSTOM_FLEX_BROADCAST') {
        return jsonOut(sendCustomFlexBroadcast_(ss, data, secrets));
      }

      if (action === 'SYNC_V1025_GOVERNANCE_APPROVAL') {
        return jsonOut(syncV1025GovernanceApproval_(ss, data));
      }

      if (action === 'SYNC_V1023_VENDOR_RECONCILIATION') {
        return jsonOut(syncV1023VendorReconciliation_(ss, data));
      }

      if (action === 'SYNC_OUTSOURCE_MONTHLY_BILLING') {
        return jsonOut(syncOutsourceMonthlyBilling_(ss, data));
      }

      if (action === 'SYNC_COMPANY_STAFF_DIRECTORY') {
        return jsonOut(syncCompanyStaffDirectory_(ss, data));
      }

      if (action === 'UPDATE_LIVE_TECH_GPS_PING') {
        return jsonOut(handleLiveTechGpsPing_(ss, data));
      }

      if (action === 'SEND_TIERED_QUOTATION_FLEX') {
        return jsonOut(handleSendTieredQuotationFlex_(ss, data, secrets));
      }

      if (action === 'DISPATCH_ASSIGN_AND_NOTIFY_TECH') {
        return jsonOut(handleDispatchAssignAndNotifyTech_(ss, data, secrets));
      }

      if (action === 'ADMIN_TECH_ONE_CLICK_CONFIRM_CUSTOMER') {
        return jsonOut(handleAdminTechOneClickConfirmCustomer_(ss, data, secrets));
      }

      if (action === 'SYNC_TECH_TIME_LOG') {
        return jsonOut(handleTechTimeLogSync_(ss, data));
      }

      if (action === 'SYNC_PARTS_ADVANCE_WORKFLOW') {
        return jsonOut(handlePartsAdvanceWorkflowSync_(ss, data, secrets));
      }

      if (action === 'SYNC_FACTORY_GIT_ETA') {
        return jsonOut(handleFactoryGitEtaSync_(ss, data, secrets));
      }

      if (action === 'SEND_CUSTOMER_APPOINTMENT_FLEX') {
        return jsonOut(handleSendCustomerAppointmentFlex_(ss, data, secrets));
      }

      if (action === 'SEND_QUOTATION_PDF_EMAIL') {
        return jsonOut(handleSendQuotationPdfEmail_(data, secrets));
      }

      if (action === 'SAVE_DUAL_LINE_BRIDGE_CONFIG') {
        var propsBridge = PropertiesService.getScriptProperties();
        if (data.customerLineToken !== undefined && String(data.customerLineToken).trim()) propsBridge.setProperty('CUSTOMER_LINE_CHANNEL_ACCESS_TOKEN', String(data.customerLineToken).trim());
        if (data.internalLineToken !== undefined && String(data.internalLineToken).trim()) propsBridge.setProperty('INTERNAL_LINE_CHANNEL_ACCESS_TOKEN', String(data.internalLineToken).trim());
        if (data.lineGroupId !== undefined) propsBridge.setProperty('LINE_TECH_GROUP_ID', String(data.lineGroupId).trim());
        if (data.mgmtGroupId !== undefined) propsBridge.setProperty('LINE_MGMT_GROUP_ID', String(data.mgmtGroupId).trim());
        if (data.lineBotId !== undefined) propsBridge.setProperty('LINE_SERVICE_BOT_ID', String(data.lineBotId).trim());
        if (data.lineMainOfficeId !== undefined) propsBridge.setProperty('LINE_MAIN_OFFICE_ID', String(data.lineMainOfficeId).trim());
        if (data.pwaWebAppUrl !== undefined && String(data.pwaWebAppUrl).trim()) propsBridge.setProperty('PWA_WEB_APP_URL', String(data.pwaWebAppUrl).trim());
        return jsonOut({ status: 'ok', action: action, phaseScope: 'Phase-1-ServiceUnit-ServiceCenter' });
      }

      if (action === 'TEST_DUAL_LINE_BRIDGE') {
        var testMsg = '🔔 [TEST DUAL LINE OA BRIDGE v1021]\nระบบเชื่อมต่อ LINE OA (Service Unit & Service Center) สำเร็จ!\nเวลา: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
        var sentInt = pushLineMessageWithToken_(secrets.internalLineToken || secrets.lineToken, secrets.lineGroupId, testMsg);
        var sentCust = false;
        if (data.testCustomerUserId && secrets.customerLineToken) {
          sentCust = pushLineMessageWithToken_(secrets.customerLineToken, String(data.testCustomerUserId).trim(), '🐧 [HOSHIZAKI Customer OA] ทดสอบระบบแจ้งเตือนลูกค้าเรียบร้อยครับ');
        }
        return jsonOut({ status: (sentInt || sentCust) ? 'ok' : 'warning', internalSent: sentInt, customerSent: sentCust });
      }

      if (action === 'CREATE_CROSS_LINK_RICH_MENUS') {
        createCrossLinkRichMenus();
        return jsonOut({ status: 'ok', action: action });
      }

      if (action === 'LOG_MOBILE_SMS_DISPATCH') {
        return jsonOut(logMobileSmsDispatchToSheet_(ss, data));
      }

      if (action === 'GET_MOBILE_SMS_LOGS') {
        return jsonOut(getMobileSmsDispatchLogs_(ss, data));
      }

      if (action === 'GET_CSAT_ANALYTICS_DASHBOARD') {
        return jsonOut(getCsatAnalyticsDashboard_(ss));
      }

      if (action === 'RUN_PREDICTIVE_PM_WARRANTY_SCAN') {
        return jsonOut(runPredictivePmAndWarrantyAlerts_());
      }

      if (action === 'REBUILD_ALL_SHEETS_AND_TRIGGERS') {
        return jsonOut(rebuildAllEnterpriseSheetsAndTriggers_(ss, secrets));
      }

      if (action === 'RUN_NIGHTLY_FULL_DRIVE_BACKUP_NOW') {
        return jsonOut(runNightlyFullDriveBackup_());
      }

      if (action === 'RESTORE_LATEST_NIGHTLY_BACKUP_TO_SHEETS') {
        return jsonOut(restoreLatestNightlyBackupToSheets_(ss));
      }

      if (action === 'SYNC_OUTSOURCE_RATE_CARD') {
        return jsonOut(syncOutsourceRateCardToSheet_(ss, data));
      }

      if (action === 'UPSERT_DEDUPLICATED_MASTER_BATCH') {
        return jsonOut(upsertDeduplicatedMasterBatch_(ss, data));
      }

      // --- Core Existing Endpoints ---
      if (action === 'SUBMIT_CUSTOMER_CSAT') {
        return jsonOut(saveCustomerCsatRecord_(ss, data));
      }

      if (action === 'SEND_LINE_PUSH' && data.message) {
        var targetId = data.lineTargetId || secrets.lineGroupId;
        var pushed = pushLineMessage(targetId, data.message);
        return jsonOut({ status: pushed ? 'ok' : 'skipped', action: action });
      }

      if (action === 'AUTO_BACKOFFICE_SNAPSHOT' && data.snapshot) {
        var snapUrl = saveBackofficeSnapshotToDrive(data.snapshot);
        return jsonOut({ status: 'ok', action: action, snapshotUrl: snapUrl });
      }

      if (action === 'SAVE_GLOBAL_CONFIG') {
        saveGlobalConfigAndStaff(ss, data);
        if (data.config && data.config.pwaWebAppUrl) {
          PropertiesService.getScriptProperties().setProperty('PWA_WEB_APP_URL', String(data.config.pwaWebAppUrl).trim());
        }
        CacheService.getScriptCache().remove('PULL_ALL_JOBS_V18');
        return jsonOut({ status: 'ok', action: action });
      }

      if (action === 'SYNC_STAFF_DIRECTORY') {
        saveGlobalConfigAndStaff(ss, { technicians: data.technicians, coordinators: data.coordinators });
        return jsonOut({ status: 'ok', action: action });
      }

      if (action === 'ARCHIVE_OLD_SHEETS_YEARLY') {
        return jsonOut(archiveOldServiceJobsToYearlySheets());
      }

      if (action === 'SYNC_VAN_STOCK') {
        var vsRes = syncVanStockToSheet_(ss, data.vanStockMap || {}, data.techCode || '', false);
        return jsonOut({ status: 'ok', action: action, lowStockItems: vsRes.lowStockItems });
      }

      if (action === 'UPDATE_ENTERPRISE_OPS_STATUS') {
        updateOpsStatusInSheet(ss, data);
        CacheService.getScriptCache().remove('PULL_ALL_JOBS_V18');
        return jsonOut({ status: 'ok', jobNo: data.jobNo });
      }

      if (action === 'SAVE_QUOTATION' || action === 'SAVE_QUOTATION_PDF_BACKUP') {
        upsertQuotationToSheet(ss, data);
        if (data.autoPdfBackup) {
          var qtPdfFile = generateQuotationPdfAndSaveToDrive(data);
          if (qtPdfFile) {
            var qtSigHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, (data.offerNo || '') + '|' + (data.grandTotal || '') + '|' + JSON.stringify(data.parts || data.items || data.partsSummary || '')));
            var props = PropertiesService.getScriptProperties();
            var lastHash = props.getProperty('QT_MAIL_' + (data.offerNo || ''));
            if (lastHash !== qtSigHash && checkAndNotifyEmailQuota_(secrets)) {
              sendBackupEmailWithPdf(
                data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
                '[HOSHIZAKI-QT-BACKUP][' + (data.offerNo || 'QT') + '][S/N: ' + (data.serial || '-') + '] ' + (data.customerStore || ''),
                'แนบไฟล์ PDF เอกสาร ' + (data.docType || 'QUOTATION') + ' เลขที่ ' + (data.offerNo || '-') + '\nลูกค้า: ' + (data.customerStore || '-') + '\nรุ่น/S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nยอดรวมสุทธิ: ' + (data.grandTotal || '0.00') + '\nลิงก์ไฟล์ใน Google Drive: ' + qtPdfFile.getUrl(),
                qtPdfFile
              );
              props.setProperty('QT_MAIL_' + (data.offerNo || ''), qtSigHash);
            }
          }
        }
        return jsonOut({ status: 'ok', action: action, remainingEmailQuota: MailApp.getRemainingDailyQuota() });
      }

      if (action === 'SAVE_JOB') {
        var driveFolder = getOrCreateMonthlyTechFolder(data.date, data.techCode || 'GENERAL');
        var pdfUrl = '';

        if (data.autoPdfBackup) {
          var jobPdfFile = generateJobServicePdfAndSaveToDrive(data, driveFolder);
          if (jobPdfFile) {
            pdfUrl = jobPdfFile.getUrl();
            var mode = data.backupGmailMode || 'ALL_SAVES';
            var shouldEmail = (mode === 'ALL_SAVES') || (mode === 'COMPLETED_AND_QT' && data.jobStatus === 'Completed');
            var jobHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, (data.jobNo || '') + '|' + (data.jobStatus || '') + '|' + (data.grandTotal || '') + '|' + JSON.stringify(data.parts || data.items || data.partsSummary || '')));
            var propsJob = PropertiesService.getScriptProperties();
            var prevJobHash = propsJob.getProperty('JOB_MAIL_' + (data.jobNo || ''));

            if (shouldEmail && prevJobHash !== jobHash && checkAndNotifyEmailQuota_(secrets)) {
              sendBackupEmailWithPdf(
                data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
                '[HOSHIZAKI-JOB-BACKUP][' + (data.jobNo || 'JOB') + '][' + (data.jobStatus || '') + '][S/N: ' + (data.serial || '-') + '] ' + (data.store || ''),
                'สำรองข้อมูลใบแจ้งบริการ (Service Report)\nเลขที่ใบงาน: ' + (data.jobNo || '-') + '\nวันที่: ' + (data.date || '-') + '\nสถานะ: ' + (data.jobStatus || '-') + '\nลูกค้า: ' + (data.store || '-') + '\nรุ่น/S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nช่างผู้รับผิดชอบ: ' + (data.responsibleTech || '-') + '\nยอดรวมสุทธิ: ' + (data.grandTotal || '0.00') + '\nโฟลเดอร์ Google Drive: ' + driveFolder.getUrl(),
                jobPdfFile
              );
              propsJob.setProperty('JOB_MAIL_' + (data.jobNo || ''), jobHash);
            }
          }
        }

        if (data.jobStatus === 'Waiting Parts' && checkAndNotifyEmailQuota_(secrets)) {
          MailApp.sendEmail({
            to: data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
            subject: '[ALERT: WAITING PARTS] ใบงาน ' + (data.jobNo || '') + ' รออะไหล่ - ' + (data.store || ''),
            body: 'แจ้งเตือนงานรออะไหล่ (Waiting Parts)\nJob No.: ' + (data.jobNo || '-') + '\nลูกค้า: ' + (data.store || '-') + '\nModel / S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nรายการอะไหล่: ' + (data.partsSummary || '-') + '\nช่างผู้แจ้ง: ' + (data.responsibleTech || '-')
          });
        }

        var lowStockAlerts = [];
        if (Array.isArray(data.parts) && data.parts.length > 0 && data.techCode) {
          var vsProps = PropertiesService.getScriptProperties();
          var vsKey = 'JOB_VS_DEDUCT_' + (data.jobNo || '');
          if (!vsProps.getProperty(vsKey)) {
            var deductRes = deductVanStockInSheet_(ss, data.techCode, data.parts);
            lowStockAlerts = deductRes.lowStockItems || [];
            vsProps.setProperty(vsKey, new Date().toISOString());
          }
        }

        if (secrets.lineAutoNotifyNewJob && isLineGroupConfigured() && isLineTokenConfigured()) {
          var lineProps = PropertiesService.getScriptProperties();
          var lineSig = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, (data.jobNo || '') + '|' + (data.jobStatus || '') + '|' + (data.responsibleTech || '') + '|' + (data.grandTotal || '')));
          if (lineProps.getProperty('LINE_JOB_' + (data.jobNo || '')) !== lineSig) {
            var flexJob = buildSaveJobFlexMessage_(data, pdfUrl, secrets.pwaWebAppUrl);
            var sentFlex = pushLineMessages_(secrets.lineGroupId, [flexJob]);
            if (!sentFlex) {
              pushLineMessage(secrets.lineGroupId, formatSaveJobNotificationLine(data, pdfUrl));
            }
            lineProps.setProperty('LINE_JOB_' + (data.jobNo || ''), lineSig);
          }

          if (lowStockAlerts.length > 0) {
            var alertLines = lowStockAlerts.map(function(it) {
              return '• [' + it.techCode + '] ' + it.part + ' (คงเหลือ ' + it.qty + ' ชิ้น)';
            }).join('\n');
            pushLineMessage(secrets.lineGroupId, '⚠️ แจ้งเตือนอะไหล่รถช่างใกล้หมด (Low Van Stock)\n━━━━━━━━━━━━━━━━━━━━\nจากใบงาน: ' + (data.jobNo || '-') + '\n' + alertLines + '\nกรุณาเบิกเติมสต็อกที่คลังอะไหล่ครับ');
          }
        }

        // ส่งแบบประเมิน CSAT 1-5 ดาวเข้า Customer LINE OA เมื่อปิดงาน Completed
        if (data.jobStatus === 'Completed' && data.jobNo) {
          try {
            sendCustomerCsatSurveyFlex_(ss, data, secrets);
          } catch (eCsat) {}
        }

        var jobSheetCheck = ss.getSheetByName('Service_Jobs');
        if (jobSheetCheck && jobSheetCheck.getLastRow() >= 2 && !data.managerOverride) {
          var existingRowNum = findRowByExactKey(jobSheetCheck, 1, String(data.jobNo || '').trim());
          if (existingRowNum >= 2) {
            var prevStatus = String(jobSheetCheck.getRange(existingRowNum, 3).getValue() || '').trim();
            var prevTotal = String(jobSheetCheck.getRange(existingRowNum, 22).getValue() || '').trim();
            if (prevStatus === 'Completed' && prevTotal !== String(data.grandTotal || '0.00').trim()) {
              return jsonOut({ status: 'locked_job', message: 'ใบงาน ' + data.jobNo + ' ปิดงาน (Completed) แล้ว ต้องปลดล็อกด้วย Manager PIN ก่อนแก้ไขยอดเงิน' });
            }
          }
        }
        data.integrityHash = computeDocumentIntegrityHash_(data.jobNo, data.date, data.serial, data.grandTotal, data.partsSummary);
        upsertJobToSheet(ss, data, driveFolder.getUrl(), pdfUrl);
        CacheService.getScriptCache().remove('PULL_ALL_JOBS_V18');
        return jsonOut({
          status: 'ok',
          jobNo: data.jobNo,
          pdfUrl: pdfUrl,
          lowStockAlerts: lowStockAlerts,
          remainingEmailQuota: MailApp.getRemainingDailyQuota()
        });
      }

      if (action === 'UPLOAD_PHOTO_BATCH' && Array.isArray(data.photosPayload)) {
        var photoFolder = getOrCreateMonthlyTechFolder(data.date, data.techCode || 'GENERAL');
        data.photosPayload.forEach(function(p) {
          if (p.dataUrl && p.dataUrl.indexOf('base64,') > -1) {
            var b64 = p.dataUrl.split('base64,')[1];
            var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', p.name || 'photo.jpg');
            photoFolder.createFile(blob);
          }
        });
        return jsonOut({ status: 'ok', uploaded: data.photosPayload.length });
      }

      if (action === 'SAVE_LINE_CONFIG') {
        var propsCfg = PropertiesService.getScriptProperties();
        if (data.lineToken) propsCfg.setProperty('LINE_CHANNEL_ACCESS_TOKEN', String(data.lineToken).trim());
        if (data.lineGroupId) propsCfg.setProperty('LINE_TECH_GROUP_ID', String(data.lineGroupId).trim());
        if (data.lineBotId !== undefined) propsCfg.setProperty('LINE_SERVICE_BOT_ID', String(data.lineBotId).trim());
        if (data.lineMainOfficeId !== undefined) propsCfg.setProperty('LINE_MAIN_OFFICE_ID', String(data.lineMainOfficeId).trim());
        if (data.lineMainOfficeToken !== undefined && String(data.lineMainOfficeToken).trim()) {
          propsCfg.setProperty('LINE_MAIN_OFFICE_TOKEN', String(data.lineMainOfficeToken).trim());
        }
        return jsonOut({ status: 'ok', action: action });
      }

      if (action === 'UPDATE_SERIAL') {
        var snSheet = ss.getSheetByName('Serial_Database_Updates');
        if (!snSheet) {
          snSheet = ss.insertSheet('Serial_Database_Updates');
          snSheet.getRange(1, 1, 1, 9).setValues([['Serial No.', 'Product Type', 'Model', 'Date Out', 'Invoice No.', 'Customer', 'PO No.', 'Deleted', 'Updated At']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          snSheet.setFrozenRows(1);
        }
        var snKey = String(data.serial || '').trim().toUpperCase();
        var snRow = findRowByExactKey(snSheet, 1, snKey);
        var snVals = [snKey, data.productType || '', data.model || '', data.dateOut || '', data.invoiceNo || '', data.customer || '', data.poNo || '', Boolean(data.deleted), Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')];
        if (snRow > 0) snSheet.getRange(snRow, 1, 1, 9).setValues([snVals]);
        else snSheet.appendRow(snVals);
        return jsonOut({ status: 'ok', action: action, serial: snKey });
      }

      if (action === 'SYNC_SCHEDULE' && Array.isArray(data.items)) {
        var schSheet = ss.getSheetByName('Service_Schedule');
        if (!schSheet) {
          schSheet = ss.insertSheet('Service_Schedule');
          schSheet.getRange(1, 1, 1, 3).setValues([['Schedule ID', 'JSON Data', 'Updated At']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          schSheet.setFrozenRows(1);
        }
        var schNow = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
        if (schSheet.getLastRow() > 1) {
          schSheet.getRange(2, 1, schSheet.getLastRow() - 1, 3).clearContent();
        }
        if (data.items.length > 0) {
          var schRows = data.items.map(function(it, i) {
            return [String(it.id || ('SCH-' + (i + 1))), JSON.stringify(it), schNow];
          });
          schSheet.getRange(2, 1, schRows.length, 3).setValues(schRows);
        }
        return jsonOut({ status: 'ok', action: action, count: data.items.length });
      }

      if (action === 'SEND_LINE_DISPATCH_NOW' && data.item) {
        var dItem = data.item;
        var dispMsg = '📅 แจ้งเตือนตารางนัดหมายงานบริการ HOSHIZAKI\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '🗓️ วันที่/เวลา: ' + (dItem.date || '-') + ' ' + (dItem.time || '') + '\n' +
          '👤 ช่างผู้รับผิดชอบ: ' + (dItem.tech || '-') + '\n' +
          '🏪 ลูกค้า/ร้านค้า: ' + (dItem.store || '-') + '\n' +
          '❄️ รุ่น/S/N: ' + (dItem.model || '-') + ' / ' + (dItem.serial || '-') + '\n' +
          '🔍 อาการ/งาน: ' + (dItem.symptom || dItem.jobType || '-') + '\n' +
          '📍 สถานที่/ติดต่อ: ' + (dItem.contact || dItem.address || '-');
        if (secrets.pwaWebAppUrl) {
          dispMsg += '\n\n📲 เปิดเว็บแอปใบงาน:\n' + secrets.pwaWebAppUrl;
        }
        if (isLineGroupConfigured() && isLineTokenConfigured()) {
          pushLineMessage(secrets.lineGroupId, dispMsg);
        }
        return jsonOut({ status: 'ok', action: action });
      }

      if (action === 'SUBMIT_WARRANTY_CLAIM') {
        var wcSheet = ss.getSheetByName('Warranty_Claims');
        if (!wcSheet) {
          wcSheet = ss.insertSheet('Warranty_Claims');
          wcSheet.getRange(1, 1, 1, 12).setValues([['Claim No.', 'Ref Job No.', 'Claim Date', 'Failed Date', 'Customer', 'Dealer', 'Model', 'Serial No.', 'Install Date', 'Symptom', 'Claim Parts', 'Updated At']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          wcSheet.setFrozenRows(1);
        }
        var wcNo = String(data.claimNo || '').trim();
        var wcRow = findRowByExactKey(wcSheet, 1, wcNo);
        var wcVals = [
          wcNo, data.jobNo || '', data.dateOfClaim || '', data.dateFailed || '',
          data.customerName || '', data.dealerName || '', data.modelName || '', data.serialNo || '',
          data.dateInstall || '', data.symptom || '', JSON.stringify(data.claimParts || []),
          Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
        ];
        if (wcRow > 0) wcSheet.getRange(wcRow, 1, 1, 12).setValues([wcVals]);
        else wcSheet.appendRow(wcVals);

        if (data.emailTo && checkAndNotifyEmailQuota_(secrets)) {
          var wcBody = 'แจ้งเคลมอะไหล่ในประกัน HOSHIZAKI\nClaim No.: ' + wcNo + '\nRef Job: ' + (data.jobNo || '-') + '\nลูกค้า: ' + (data.customerName || '-') + '\nModel / S/N: ' + (data.modelName || '-') + ' / ' + (data.serialNo || '-') + '\nวันที่ติดตั้ง: ' + (data.dateInstall || '-') + ' | วันที่เสีย: ' + (data.dateFailed || '-') + '\nอาการ: ' + (data.symptom || '-');
          var mailOpts = { to: data.emailTo, subject: data.emailSubject || ('[WARRANTY CLAIM] ' + wcNo), body: wcBody };
          if (data.emailCc) mailOpts.cc = data.emailCc;
          MailApp.sendEmail(mailOpts);
        }
        return jsonOut({ status: 'ok', action: action, claimNo: wcNo });
      }

      if (action === 'UPLOAD_TECH_DOC_FILE' && data.dataUrl) {
        var cat = String(data.category || 'SPEC').toUpperCase();
        var modelTag = String(data.model || 'GENERAL').trim().toUpperCase().replace(/[^A-Z0-9\-_+]/g, '_');
        var rawFileName = String(data.fileName || (cat + '_' + modelTag + '.pdf'));
        var mimeType = String(data.mimeType || 'application/pdf');
        var b64Part = data.dataUrl.indexOf('base64,') > -1 ? data.dataUrl.split('base64,')[1] : data.dataUrl;

        var targetFolderId = SPEC_SHEET_FOLDER_ID;
        var prefixLabel = 'Spec Sheet';
        if (cat === 'SERVICE') { targetFolderId = MANUAL_PDF_FOLDER_IDS[0]; prefixLabel = 'Service Manual'; }
        else if (cat === 'INSTRUCTION') { targetFolderId = MANUAL_PDF_FOLDER_IDS[1]; prefixLabel = 'Instruction Manual'; }
        else if (cat === 'PARTS') { targetFolderId = MANUAL_PDF_FOLDER_IDS[2]; prefixLabel = 'Parts List'; }
        else if (cat === 'DRAWING') { targetFolderId = MANUAL_PDF_FOLDER_IDS[0]; prefixLabel = 'Drawing'; }
        else if (cat === 'PART_PHOTO') { targetFolderId = MANUAL_PDF_FOLDER_IDS[2]; prefixLabel = 'Part Photo'; }

        var destFolder = DriveApp.getFolderById(targetFolderId);
        var extMatch = rawFileName.match(/\.[a-zA-Z0-9]{2,5}$/);
        var ext = extMatch ? extMatch[0] : (mimeType.indexOf('image/') === 0 ? '.jpg' : '.pdf');
        var cleanFileName = prefixLabel + '_' + modelTag + '_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmm') + ext;

        var fileBlob = Utilities.newBlob(Utilities.base64Decode(b64Part), mimeType, cleanFileName);
        var createdFile = destFolder.createFile(fileBlob);
        try {
          if (cat === 'SPEC' || cat === 'PART_PHOTO') {
            createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          }
        } catch (eShare) {}

        if (mimeType === 'application/pdf' || ext.toLowerCase() === '.pdf') {
          var idxSheet = ss.getSheetByName('Drive_PDF_Index');
          if (idxSheet) {
            idxSheet.appendRow([
              createdFile.getId(),
              cleanFileName,
              createdFile.getUrl(),
              destFolder.getName(),
              targetFolderId,
              Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
            ]);
          }
          clearDrivePdfIndexCache_();
        }

        return jsonOut({
          status: 'ok',
          action: action,
          fileId: createdFile.getId(),
          fileName: cleanFileName,
          fileUrl: createdFile.getUrl(),
          folderName: destFolder.getName()
        });
      }

      if (action === 'SYNC_TECHNICAL_DOCS' && Array.isArray(data.docs)) {
        var tdSheet = ss.getSheetByName('Technical_Documents_Library');
        if (!tdSheet) {
          tdSheet = ss.insertSheet('Technical_Documents_Library');
          tdSheet.getRange(1, 1, 1, 8).setValues([['Doc ID', 'Category', 'Model', 'Title', 'Document URL', 'Notes', 'Updated By', 'Updated At']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          tdSheet.setFrozenRows(1);
        }
        var tdNow = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
        if (tdSheet.getLastRow() > 1) {
          tdSheet.getRange(2, 1, tdSheet.getLastRow() - 1, 8).clearContent();
        }
        if (data.docs.length > 0) {
          var tdRows = data.docs.map(function(d, idx) {
            return [
              String(d.id || ('DOC-' + (idx + 1))),
              String(d.category || 'SPEC'),
              String(d.model || ''),
              String(d.title || ''),
              String(d.url || ''),
              String(d.notes || ''),
              String(d.updatedBy || ''),
              String(d.updatedAt || tdNow)
            ];
          });
          tdSheet.getRange(2, 1, tdRows.length, 8).setValues(tdRows);
        }
        return jsonOut({ status: 'ok', action: action, count: data.docs.length });
      }

      if (action === 'REPLY_LINE_TICKET' && data.ticketId && data.replyMessage) {
        var replyRes = replyToCustomerTicketFromTech_(ss, String(data.ticketId).trim().toUpperCase(), String(data.replyMessage).trim(), '');
        return jsonOut({ status: 'ok', action: action, message: replyRes });
      }

      if (action === 'SYNC_PARTS_CATALOG' && Array.isArray(data.parts)) {
        var pSheet = ss.getSheetByName('Parts_Catalog_Master');
        if (!pSheet) {
          pSheet = ss.insertSheet('Parts_Catalog_Master');
          pSheet.getRange(1, 1, 1, 5).setValues([['Part No.', 'Description', 'Price (THB)', 'Compatible Models', 'Updated At']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          pSheet.setFrozenRows(1);
        }
        var pNow = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
        if (pSheet.getLastRow() > 1) {
          pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 5).clearContent();
        }
        if (data.parts.length > 0) {
          var pRows = data.parts.map(function(p) {
            return [
              String(p.partNo || ''),
              String(p.desc || ''),
              Number(p.price || 0),
              Array.isArray(p.models) ? p.models.join(', ') : String(p.models || ''),
              pNow
            ];
          });
          pSheet.getRange(2, 1, pRows.length, 5).setValues(pRows);
        }
        return jsonOut({ status: 'ok', action: action, count: data.parts.length });
      }

      if (action === 'SYNC_SERIAL_MASTER') {
        var smSheet = ss.getSheetByName('Serial_Database_Master');
        if (!smSheet) {
          smSheet = ss.insertSheet('Serial_Database_Master');
          smSheet.getRange(1, 1, 1, 8).setValues([['Serial No.', 'Product Type', 'Model', 'Date Out', 'Invoice No.', 'Customer', 'PO No.', 'Updated At']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          smSheet.setFrozenRows(1);
        }
        var smNow = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
        if (data.resetSheet && smSheet.getLastRow() > 1) {
          smSheet.getRange(2, 1, smSheet.getLastRow() - 1, 8).clearContent();
        }
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          var smRows = data.rows.map(function(r) {
            return [
              String(r[0] || '').trim().toUpperCase(),
              String(r[1] || ''),
              String(r[2] || ''),
              String(r[3] || ''),
              String(r[4] || ''),
              String(r[5] || ''),
              String(r[6] || ''),
              smNow
            ];
          });
          var startR = smSheet.getLastRow() + 1;
          smSheet.getRange(startR, 1, smRows.length, 8).setValues(smRows);
        }
        return jsonOut({ status: 'ok', action: action, count: (data.rows || []).length });
      }

      if (action === 'UPDATE_MANAGER_PIN_CLOUD') {
        return jsonOut(updateServerManagerPin_(data.oldPin, data.newPin));
      }

      if (action === 'GET_CONFIDENTIAL_COST_SECURE') {
        if (!verifyServerManagerPin_(data.managerPin)) {
          return jsonOut({ status: 'unauthorized_pin', message: 'รหัส Manager PIN ไม่ถูกต้อง' });
        }
        var secConf = readConfidentialCostAndApprovals_(ss);
        return jsonOut({ status: 'ok', parts: secConf.parts, approvals: secConf.approvals });
      }

      if (action === 'SYNC_CONFIDENTIAL_COST_MASTER') {
        if (data.managerPin && !verifyServerManagerPin_(data.managerPin)) {
          return jsonOut({ status: 'unauthorized_pin', message: 'รหัส Manager PIN ไม่ถูกต้อง' });
        }
        syncConfidentialCostMaster_(ss, data, secrets);
        return jsonOut({ status: 'ok', action: action });
      }

      if (action === 'APPROVE_PRICE_DISCOUNT') {
        var decRes = updatePriceApprovalDecision_(ss, data, secrets);
        return jsonOut({ status: decRes ? 'ok' : 'not_found', action: action, record: decRes });
      }

      if (action === 'SAVE_LEGACY_SERVICE_RECORD') {
        var legSaved = saveLegacyServiceRecordToCloud_(ss, data);
        return jsonOut({ status: 'ok', action: action, record: legSaved });
      }

      if (action === 'SAVE_PRICE_APPROVAL_REPORT') {
        var aprSaved = savePriceApprovalReport_(ss, data, secrets);
        return jsonOut({ status: 'ok', action: action, record: aprSaved });
      }

      if (action === 'SAVE_QCF_AND_MEMO') {
        var qcfSaved = saveQcfAndMemoReport_(ss, data, secrets);
        return jsonOut({ status: 'ok', action: action, record: qcfSaved });
      }

      if (action === 'SAVE_INSPECTION_REPORT') {
        var insSaved = saveWarehouseInspectionReport_(ss, data, secrets);
        return jsonOut({ status: 'ok', action: action, report: insSaved });
      }

      if (action === 'SYNC_MULTI_MODEL_PARTS' && Array.isArray(data.parts)) {
        syncMultiModelPartsMaster_(ss, data.parts);
        return jsonOut({ status: 'ok', action: action, count: data.parts.length });
      }

      if (action === 'SYNC_QUOTATION_ARCHIVE_MASTER') {
        var qaSheet = ss.getSheetByName('Quotation_Archive_Master');
        if (!qaSheet) {
          qaSheet = ss.insertSheet('Quotation_Archive_Master');
          qaSheet.getRange(1, 1, 1, 8).setValues([['Serial No.', 'Date', 'Offer No.', 'Customer', 'Model', 'Model/Detail Line', 'Items Summary', 'Grand Total (THB)']])
            .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
          qaSheet.setFrozenRows(1);
        }
        if (data.resetSheet && qaSheet.getLastRow() > 1) {
          qaSheet.getRange(2, 1, qaSheet.getLastRow() - 1, 8).clearContent();
        }
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          var qaRows = data.rows.map(function(r) {
            return [
              String(r.sn || '').trim().toUpperCase(),
              String(r.dt || ''),
              String(r.o || ''),
              String(r.s || ''),
              String(r.m || ''),
              String(r.ml || ''),
              String(r.sum || ''),
              Number(r.gt || 0)
            ];
          });
          var startQ = qaSheet.getLastRow() + 1;
          qaSheet.getRange(startQ, 1, qaRows.length, 8).setValues(qaRows);
        }
        return jsonOut({ status: 'ok', action: action, count: (data.rows || []).length });
      }

      return jsonOut({ status: 'ignored' });
    } catch (err) {
      return jsonOut({ status: 'error', message: String(err) });
    }
  });
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();

  if (action === 'runSelfDiagnostics') {
    return jsonOut(runBackendSelfDiagnostics_(ss, secrets));
  }

  if (action === 'getCompanyStaffDirectory') {
    return jsonOut(getCompanyStaffDirectory_(ss));
  }

  if (action === 'getUserCredentialsVault') {
    return jsonOut(getUserCredentialsVaultFromSheet_(ss));
  }

  if (action === 'getSecurityAuditLogs') {
    var limitLogs = Number((e.parameter && e.parameter.limit) || 100);
    return jsonOut(getSecurityAuditLogsFromSheet_(ss, limitLogs));
  }

  if (action === 'getOutsourceRateCard') {
    return jsonOut(getOutsourceRateCardFromSheet_(ss));
  }

  if (action === 'getOutsourceVaultRecord') {
    var osCode = String((e.parameter && e.parameter.os) || '').trim().toUpperCase();
    return jsonOut(getOutsourceVaultRecordFromSheet_(ss, osCode));
  }

  if (action === 'getDealerChannelDirectory') {
    return jsonOut(getDealerChannelDirectoryFromSheet_(ss));
  }

  if (action === 'getDealerDispatchTracker') {
    return jsonOut(getDealerDispatchTrackerFromSheet_(ss));
  }

  if (action === 'getCustomFlexTemplates') {
    return jsonOut(getCustomFlexTemplatesFromSheet_(ss));
  }

  if (action === 'getLiveTechGpsRadar') {
    return jsonOut(getLiveTechGpsRadar_(ss));
  }

  if (action === 'getServiceKpiAnalytics') {
    return jsonOut(getServiceKpiAnalytics_(ss));
  }

  if (action === 'getReadyToConfirmCustomerJobs') {
    return jsonOut(getReadyToConfirmCustomerJobs_(ss));
  }

  if (action === 'techConfirmDispatch') {
    return handleTechConfirmDispatchWeb_(ss, e.parameter || {}, secrets);
  }

  if (action === 'webConfirmAppt') {
    return handleWebConfirmAppointment_(ss, e.parameter || {}, secrets);
  }

  if (action === 'getPartsAdvanceList') {
    return jsonOut(getPartsAdvanceListFromSheet_(ss));
  }

  if (action === 'getFactoryGitEtaList') {
    return jsonOut(getFactoryGitEtaListFromSheet_(ss));
  }

  if (action === 'pullAllData' || action === 'getAllJobs') {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('PULL_ALL_JOBS_V18');
    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }
    var limit = Number((e.parameter && e.parameter.limit) || 400);
    var jobs = readRecentJobsFromSheet(ss, limit);
    var vanStockMap = readVanStockFromSheet_(ss);
    var payloadStr = JSON.stringify({ status: 'ok', jobs: jobs, vanStockMap: vanStockMap });
    if (payloadStr.length < 95000) {
      cache.put('PULL_ALL_JOBS_V18', payloadStr, 60);
    }
    return ContentService.createTextOutput(payloadStr).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'archiveOldSheetsYearly') {
    return jsonOut(archiveOldServiceJobsToYearlySheets());
  }

  if (action === 'repairApprovalForm') {
    return buildOnSiteRepairApprovalHtmlPage_(e.parameter || {});
  }

  if (action === 'submitRepairApprovalGet') {
    return jsonOut(saveOnSiteRepairApproval_(ss, e.parameter || {}));
  }

  if (action === 'machineQrPortal') {
    return buildMachineSelfServiceQrPortalHtml_(ss, e.parameter || {});
  }

  if (action === 'submitMachinePortalRequest') {
    var p = e.parameter || {};
    var label = p.kind === 'FILTER_ORDER' ? 'สั่งซื้อไส้กรองน้ำ 4HC-H' : 'แจ้งซ่อม / นัดบริการจาก QR เครื่อง';
    var msgBody = '[' + label + '] รุ่น: ' + (p.model || '-') + ' | S/N: ' + (p.serial || '-') + ' | ร้าน: ' + (p.cust || '-') + ' | ผู้ติดต่อ: ' + (p.contact || '-') + ' | รายละเอียด: ' + (p.detail || '-');
    var tk = createTechnicianSupportTicket_(ss, 'QR_PORTAL', msgBody, p.model || p.serial || 'QR_REQUEST', p.kind || 'SERVICE_CALL');
    return jsonOut({ status: 'ok', ticketId: tk.ticketId });
  }

  if (action === 'csatForm') {
    return buildCustomerCsatHtmlPage_(e.parameter || {});
  }

  if (action === 'submitCsatGet') {
    return jsonOut(saveCustomerCsatRecord_(ss, e.parameter || {}));
  }

  if (action === 'getCustomerCsatSummary') {
    var cSheet = ensureCustomerCsatSheet_(ss);
    var cVals = cSheet.getDataRange().getValues();
    var cList = [];
    for (var ci = cVals.length - 1; ci >= 1 && cList.length < 200; ci--) {
      cList.push({
        timestamp: String(cVals[ci][0] || ''),
        jobNo: String(cVals[ci][1] || ''),
        customer: String(cVals[ci][2] || ''),
        model: String(cVals[ci][3] || ''),
        serial: String(cVals[ci][4] || ''),
        tech: String(cVals[ci][5] || ''),
        rating: Number(cVals[ci][6] || 5),
        comment: String(cVals[ci][7] || ''),
        source: String(cVals[ci][8] || '')
      });
    }
    return jsonOut({ status: 'ok', records: cList });
  }

  if (action === 'getSerialHistory') {
    var serial = String((e.parameter && e.parameter.serial) || '').trim().toUpperCase();
    var allJobs = readRecentJobsFromSheet(ss, 2500);
    var matched = allJobs.filter(function(j) {
      return String(j.serial || '').trim().toUpperCase() === serial;
    });
    return jsonOut({ status: 'ok', records: matched });
  }

  if (action === 'getSerialFullDossier') {
    var snParam = String((e.parameter && e.parameter.serial) || '').trim().toUpperCase();
    return jsonOut({ status: 'ok', dossier: buildSerial360Dossier_(ss, snParam) });
  }

  if (action === 'getModelSpecSheet') {
    var mQ = String((e.parameter && e.parameter.model) || '').trim().toUpperCase();
    var specFiles = searchPdfFilesInDriveFolders([SPEC_SHEET_FOLDER_ID], mQ, 5);
    if (specFiles.length === 0) {
      specFiles = searchPdfFilesInDriveFolders(MANUAL_PDF_FOLDER_IDS, mQ, 5);
    }
    var primaryImageUrl = (specFiles.length > 0 && specFiles[0].id)
      ? ensureDrivePdfPublicViewAndGetImageUrl_(specFiles[0].id, 1600)
      : '';
    return jsonOut({
      status: 'ok',
      model: mQ,
      structuredSpec: getStructuredHoshizakiModelSpec_(mQ),
      primaryImageUrl: primaryImageUrl,
      files: specFiles
    });
  }

  if (action === 'searchDrivePdf') {
    var q = String((e.parameter && e.parameter.q) || '').trim();
    var scope = String((e.parameter && e.parameter.scope) || 'ALL').toUpperCase();
    var targetFolders = (scope === 'SPEC') ? [SPEC_SHEET_FOLDER_ID] : [SPEC_SHEET_FOLDER_ID].concat(MANUAL_PDF_FOLDER_IDS);
    var results = searchPdfFilesInDriveFolders(targetFolders, q, 12);
    return jsonOut({ status: 'ok', query: q, scope: scope, files: results });
  }

  if (action === 'getSerialUpdates') {
    var snSheet = ss.getSheetByName('Serial_Database_Updates');
    var updates = [];
    if (snSheet && snSheet.getLastRow() >= 2) {
      var snVals = snSheet.getRange(2, 1, snSheet.getLastRow() - 1, 8).getValues();
      updates = snVals.map(function(r) {
        return { serial: r[0], productType: r[1], model: r[2], dateOut: r[3], invoiceNo: r[4], customer: r[5], poNo: r[6], deleted: Boolean(r[7]) };
      });
    }
    return jsonOut({ status: 'ok', updates: updates });
  }

  if (action === 'getSchedule') {
    var schSheet = ss.getSheetByName('Service_Schedule');
    var items = [];
    if (schSheet && schSheet.getLastRow() >= 2) {
      var schVals = schSheet.getRange(2, 2, schSheet.getLastRow() - 1, 1).getValues();
      schVals.forEach(function(r) {
        try { if (r[0]) items.push(JSON.parse(r[0])); } catch (e) {}
      });
    }
    return jsonOut({ status: 'ok', items: items });
  }

  if (action === 'getLineTickets') {
    var tkSheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
    var tickets = [];
    if (tkSheet && tkSheet.getLastRow() >= 2) {
      var tkVals = tkSheet.getRange(2, 1, tkSheet.getLastRow() - 1, 9).getValues();
      tickets = tkVals.reverse().map(function(r) {
        return {
          ticketId: r[0], createdAt: r[1], userId: r[2], customerName: r[3],
          topic: r[4], message: r[5], status: r[6], techReply: r[7], repliedAt: r[8]
        };
      });
    }
    return jsonOut({ status: 'ok', tickets: tickets });
  }

  if (action === 'getTechnicalDocs') {
    var tdSheet = ss.getSheetByName('Technical_Documents_Library');
    var docs = [];
    if (tdSheet && tdSheet.getLastRow() >= 2) {
      var tdVals = tdSheet.getRange(2, 1, tdSheet.getLastRow() - 1, 8).getValues();
      docs = tdVals.map(function(r) {
        return { id: r[0], category: r[1], model: r[2], title: r[3], url: r[4], notes: r[5], updatedBy: r[6], updatedAt: r[7] };
      });
    }
    return jsonOut({ status: 'ok', docs: docs });
  }

  if (action === 'getStaffDirectory') {
    var staffOut = readGlobalConfigAndStaff(ss);
    staffOut.vanStockMap = readVanStockFromSheet_(ss);
    return jsonOut(staffOut);
  }

  if (action === 'getLegacyServiceHistory') {
    var legSn = String((e.parameter && e.parameter.serial) || '').trim().toUpperCase();
    var legLimit = Number((e.parameter && e.parameter.limit) || 3000);
    return jsonOut({ status: 'ok', records: getLegacyServiceHistoryFromSheet_(ss, legSn, legLimit) });
  }

  if (action === 'getConfidentialCostAndApprovals') {
    var reqPin = String((e.parameter && e.parameter.pin) || '');
    var confData = readConfidentialCostAndApprovals_(ss);
    if (!verifyServerManagerPin_(reqPin)) {
      return jsonOut({ status: 'locked', message: 'Manager PIN required for confidential cost data', parts: [], approvals: confData.approvals });
    }
    return jsonOut({ status: 'ok', parts: confData.parts, approvals: confData.approvals });
  }

  if (action === 'getQcfMemoReports') {
    return jsonOut({ status: 'ok', reports: readQcfAndMemoReports_(ss, 300) });
  }

  if (action === 'getInspectionReports') {
    return jsonOut({ status: 'ok', reports: readWarehouseInspectionReports_(ss, 500) });
  }

  if (action === 'getMultiModelParts') {
    return jsonOut({ status: 'ok', parts: readMultiModelPartsMaster_(ss) });
  }

  if (action === 'getLatestSnapshot') {
    var reqKey = String((e.parameter && e.parameter.key) || '');
    if (secrets.apiSecretKey && reqKey !== secrets.apiSecretKey) {
      return jsonOut({ status: 'unauthorized' });
    }
    return jsonOut(readLatestBackofficeSnapshotFromDrive());
  }

  return jsonOut({
    status: 'ready',
    version: 'Enterprise-v1058-DEEP-RESILIENCE-PRO',
    phase: 'Phase-1-ServiceUnit-ServiceCenter',
    lineConfigured: isLineTokenConfigured(),
    groupConfigured: isLineGroupConfigured(),
    pwaUrlConfigured: Boolean(secrets.pwaWebAppUrl),
    specFolderId: SPEC_SHEET_FOLDER_ID
  });
}

// ============================================================================
// 16. ENTERPRISE v1013 BACKEND MODULES (DUAL LINE BRIDGE, FLEET GPS RADAR,
//     PARTS ADVANCE 6-STAGE, GIT ETA, KPI/FTFR, STAFF DIRECTORY & SELF-DIAG)
// ============================================================================

function runBackendSelfDiagnostics_(ss, secrets) {
  var checks = [];
  function addCheck(name, ok, detail) {
    checks.push({ name: name, ok: Boolean(ok), detail: String(detail || '') });
  }
  addCheck('Google Sheets Access', Boolean(ss && ss.getId()), ss ? ss.getName() : 'Missing');
  addCheck('Internal LINE OA Token', Boolean(secrets.internalLineToken || secrets.lineToken), isLineTokenConfigured() ? 'Configured' : 'Not configured');
  addCheck('Customer LINE OA Token', Boolean(secrets.customerLineToken), secrets.customerLineToken ? 'Configured' : 'Not configured');
  addCheck('Dispatch LINE Group ID', isLineGroupConfigured(), secrets.lineGroupId || 'Missing');
  addCheck('PWA Web App URL', Boolean(secrets.pwaWebAppUrl), secrets.pwaWebAppUrl || 'Not set');
  var quota = MailApp.getRemainingDailyQuota();
  addCheck('Daily MailApp Quota', quota > 10, 'Remaining: ' + quota + ' emails');
  var triggers = ScriptApp.getProjectTriggers();
  addCheck('Time-Driven Triggers', triggers.length >= 1, triggers.length + ' active triggers');
  var hasDealerTrigger = triggers.some(function(t) { return t.getHandlerFunction() === 'runDealerDispatchFollowUpTrigger' || t.getHandlerFunction() === 'runDealerDispatchFollowUpAndEscalation_'; });
  addCheck('Dealer 2-Hr SLA Follow-Up Trigger', hasDealerTrigger, hasDealerTrigger ? 'Active (30-min scan)' : 'Not scheduled yet');
  addCheck('Spec Sheet Drive Folder', Boolean(SPEC_SHEET_FOLDER_ID), SPEC_SHEET_FOLDER_ID);
  var coreSheets = ['Service_Jobs', 'Quotations', 'Van_Stock', 'Service_Schedule', 'Dealer_Channel_Directory', 'Dealer_Service_Dispatch_Tracker', 'LINE_Flex_Templates'];
  var existingNames = ss.getSheets().map(function(s) { return s.getName(); });
  var missingCore = coreSheets.filter(function(n) { return existingNames.indexOf(n) === -1; });
  addCheck('Enterprise Core Sheets Schema', missingCore.length === 0, missingCore.length === 0 ? ('All ' + coreSheets.length + ' core tabs verified') : ('Missing: ' + missingCore.join(', ')));

  var passed = checks.filter(function(c) { return c.ok; }).length;
  return {
    status: 'ok',
    version: 'Enterprise-v1058-DEEP-RESILIENCE-PRO',
    passed: passed,
    total: checks.length,
    checks: checks
  };
}

function syncCompanyStaffDirectory_(ss, data) {
  var sheet = ss.getSheetByName('Company_Staff_Directory');
  if (!sheet) {
    sheet = ss.insertSheet('Company_Staff_Directory');
    sheet.getRange(1, 1, 1, 10).setValues([[
      'Staff ID', 'Full Name', 'Nickname', 'Department / Unit', 'Position',
      'Role Tag', 'Email', 'Mobile / Ext', 'Phase 1 Active', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var list = Array.isArray(data.staffList) ? data.staffList : [];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).clearContent();
  }
  if (list.length > 0) {
    var rows = list.map(function(s, idx) {
      return [
        String(s.id || ('STF-' + (idx + 1))),
        String(s.name || ''),
        String(s.nickname || ''),
        String(s.department || ''),
        String(s.position || ''),
        String(s.roleTag || ''),
        String(s.email || ''),
        String(s.phone || ''),
        s.phase1Active === false ? 'FALSE' : 'TRUE',
        nowStr
      ];
    });
    sheet.getRange(2, 1, rows.length, 10).setValues(rows);
  }
  return { status: 'ok', count: list.length };
}

function getCompanyStaffDirectory_(ss) {
  var sheet = ss.getSheetByName('Company_Staff_Directory');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', staffList: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var list = vals.map(function(r) {
    return {
      id: r[0], name: r[1], nickname: r[2], department: r[3], position: r[4],
      roleTag: r[5], email: r[6], phone: r[7],
      phase1Active: String(r[8]).toUpperCase() !== 'FALSE',
      updatedAt: r[9]
    };
  });
  return { status: 'ok', staffList: list };
}

function calcHaversineKm_(lat1, lon1, lat2, lon2) {
  var toRad = function(v) { return (v * Math.PI) / 180; };
  var R = 6371;
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function handleLiveTechGpsPing_(ss, data) {
  var sheet = ss.getSheetByName('Live_Tech_GPS_Radar');
  if (!sheet) {
    sheet = ss.insertSheet('Live_Tech_GPS_Radar');
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Tech Key', 'Tech Name', 'Job No.', 'Customer / Store', 'Status',
      'Tech Lat', 'Tech Lng', 'Dest Lat', 'Dest Lng', 'Distance (km)', 'ETA (mins)', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var techName = String(data.techName || data.techCode || 'Technician').trim();
  var techKey = techName.toUpperCase();
  var tLat = Number(data.lat || 0);
  var tLng = Number(data.lng || 0);
  var dLat = Number(data.destLat || 0);
  var dLng = Number(data.destLng || 0);
  var distKm = (tLat && tLng && dLat && dLng) ? Number(calcHaversineKm_(tLat, tLng, dLat, dLng).toFixed(2)) : null;
  var etaMins = distKm !== null ? Math.max(1, Math.round((distKm / 35) * 60)) : null;
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  var rowVals = [
    techKey, techName, String(data.jobNo || ''), String(data.customer || ''),
    String(data.status || 'EN_ROUTE'), tLat, tLng, dLat, dLng,
    distKm !== null ? distKm : '', etaMins !== null ? etaMins : '', nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, techKey);
  if (rowIdx >= 2) sheet.getRange(rowIdx, 1, 1, 12).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  return { status: 'ok', techName: techName, distanceKm: distKm, etaMins: etaMins, updatedAt: nowStr };
}

function getLiveTechGpsRadar_(ss) {
  var sheet = ss.getSheetByName('Live_Tech_GPS_Radar');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', fleet: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var fleet = vals.map(function(r) {
    return {
      techKey: r[0], techName: r[1], jobNo: r[2], customer: r[3], status: r[4],
      lat: Number(r[5] || 0), lng: Number(r[6] || 0),
      destLat: Number(r[7] || 0), destLng: Number(r[8] || 0),
      distanceKm: r[9] !== '' ? Number(r[9]) : null,
      etaMins: r[10] !== '' ? Number(r[10]) : null,
      updatedAt: String(r[11] || '')
    };
  });
  return { status: 'ok', fleet: fleet };
}

function getServiceKpiAnalytics_(ss) {
  var jobs = readRecentJobsFromSheet(ss, 2000);
  var completed = 0;
  var repeatCalls = 0;
  var partFreq = {};
  var snDates = {};

  jobs.forEach(function(j) {
    if (j.jobStatus === 'Completed') completed++;
    var sn = String(j.serial || '').trim().toUpperCase();
    if (sn && sn !== '-' && j.date) {
      if (!snDates[sn]) snDates[sn] = [];
      snDates[sn].push(String(j.date));
    }
    var pSum = String(j.partsSummary || '');
    if (pSum && pSum !== '-') {
      pSum.split(/[;,|\n]/).forEach(function(tok) {
        var clean = tok.trim();
        if (clean.length >= 3) partFreq[clean] = (partFreq[clean] || 0) + 1;
      });
    }
  });

  Object.keys(snDates).forEach(function(sn) {
    if (snDates[sn].length >= 2) repeatCalls += (snDates[sn].length - 1);
  });

  var ftfr = jobs.length > 0 ? Math.max(0, Math.min(100, (((jobs.length - repeatCalls) / jobs.length) * 100))).toFixed(1) : '100.0';
  var topParts = Object.keys(partFreq).sort(function(a, b) { return partFreq[b] - partFreq[a]; }).slice(0, 10).map(function(k) {
    return { part: k, count: partFreq[k] };
  });

  var csatSheet = ss.getSheetByName('Customer_CSAT_Ratings');
  var csatSum = 0;
  var csatCount = 0;
  if (csatSheet && csatSheet.getLastRow() >= 2) {
    var cVals = csatSheet.getRange(2, 2, csatSheet.getLastRow() - 1, 1).getValues();
    cVals.forEach(function(r) {
      var sc = Number(r[0]);
      if (sc >= 1 && sc <= 5) { csatSum += sc; csatCount++; }
    });
  }

  return {
    status: 'ok',
    totalJobs: jobs.length,
    completedJobs: completed,
    ftfrPct: ftfr,
    avgCsat: csatCount > 0 ? (csatSum / csatCount).toFixed(2) : '5.00',
    csatResponses: csatCount,
    topFailureParts: topParts
  };
}

function handleTechTimeLogSync_(ss, data) {
  var sheet = ss.getSheetByName('Tech_Time_GPS_Logs');
  if (!sheet) {
    sheet = ss.insertSheet('Tech_Time_GPS_Logs');
    sheet.getRange(1, 1, 1, 9).setValues([[
      'Timestamp', 'Job No.', 'Tech Name', 'Milestone', 'GPS Coords',
      'Travel Mins', 'Work Mins', 'Customer', 'Notes'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    nowStr, String(data.jobNo || ''), String(data.techName || ''), String(data.milestone || ''),
    String(data.gps || ''), Number(data.travelMins || 0), Number(data.workMins || 0),
    String(data.customer || ''), String(data.notes || '')
  ]);
  return { status: 'ok', timestamp: nowStr };
}

function handlePartsAdvanceWorkflowSync_(ss, data, secrets) {
  var sheet = ss.getSheetByName('Parts_Advance_Tracking');
  if (!sheet) {
    sheet = ss.insertSheet('Parts_Advance_Tracking');
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Req ID', 'Ref Job No.', 'Tech Name', 'Customer', 'Model / S/N',
      'Parts JSON', 'Stage Status', 'Carrier / Waybill', 'Delivery Doc URL',
      'Signatures JSON', 'Notes', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var reqId = String(data.reqId || ('PA-' + Date.now())).trim().toUpperCase();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var docUrl = String(data.deliveryDocUrl || '');

  if (data.deliveryFileDataUrl && String(data.deliveryFileDataUrl).indexOf('base64,') > -1) {
    try {
      var folder = getOrCreateMonthlyTechFolder('', 'PARTS_ADVANCE_DOCS');
      var b64 = String(data.deliveryFileDataUrl).split('base64,')[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), data.deliveryFileMime || 'application/pdf', reqId + '_Delivery_' + Date.now());
      docUrl = folder.createFile(blob).getUrl();
    } catch (eDoc) {}
  }

  var rowVals = [
    reqId, String(data.jobNo || ''), String(data.techName || ''), String(data.customer || ''),
    String(data.modelSerial || ''), JSON.stringify(data.items || []),
    String(data.stage || 'JOB_REPORT_PARTS_CONFIRMED'),
    String(data.trackingInfo || ''), docUrl,
    JSON.stringify(data.signatures || {}), String(data.notes || ''), nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, reqId);
  if (rowIdx >= 2) sheet.getRange(rowIdx, 1, 1, 12).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  if (secrets && isLineGroupConfigured() && isLineTokenConfigured() && data.notifyLine) {
    pushLineMessage(
      secrets.lineGroupId,
      '📦 [PARTS ADVANCE] อัปเดตสถานะใบเบิกอะไหล่: ' + reqId + '\n' +
      '• ขั้นตอน: ' + rowVals[6] + '\n' +
      '• ช่าง: ' + rowVals[2] + ' | ลูกค้า: ' + rowVals[3] + '\n' +
      (rowVals[7] ? '• ขนส่ง/เลขพัสดุ: ' + rowVals[7] + '\n' : '') +
      (docUrl ? '• เอกสารแนบ: ' + docUrl : '')
    );
  }

  return { status: 'ok', reqId: reqId, deliveryDocUrl: docUrl, updatedAt: nowStr };
}

function getPartsAdvanceListFromSheet_(ss) {
  var sheet = ss.getSheetByName('Parts_Advance_Tracking');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', items: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var items = vals.reverse().map(function(r) {
    var parts = [];
    var sigs = {};
    try { parts = JSON.parse(String(r[5] || '[]')); } catch (e) {}
    try { sigs = JSON.parse(String(r[9] || '{}')); } catch (e2) {}
    return {
      reqId: r[0], jobNo: r[1], techName: r[2], customer: r[3], modelSerial: r[4],
      items: parts, stage: r[6], trackingInfo: r[7], deliveryDocUrl: r[8],
      signatures: sigs, notes: r[10], updatedAt: r[11]
    };
  });
  return { status: 'ok', items: items };
}

function handleFactoryGitEtaSync_(ss, data, secrets) {
  var sheet = ss.getSheetByName('Factory_GIT_ETA_Tracker');
  if (!sheet) {
    sheet = ss.insertSheet('Factory_GIT_ETA_Tracker');
    sheet.getRange(1, 1, 1, 11).setValues([[
      'Item Code', 'Description', 'Model', 'Serial No.', 'Origin',
      'PO / Ref', 'Qty', 'ETD', 'ETA Port', 'ETA Warehouse', 'Status'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var list = Array.isArray(data.records) ? data.records : [];
  if (data.replaceAll && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).clearContent();
  }
  if (list.length > 0) {
    var rows = list.map(function(r) {
      return [
        String(r.c || '').toUpperCase(), String(r.d || ''), String(r.m || ''),
        String(r.sn || ''), String(r.org || ''), String(r.po || ''),
        Number(r.qty || 0), String(r.etd || ''), String(r.etaPort || ''),
        String(r.etaWh || ''), String(r.st || 'IN_TRANSIT')
      ];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 11).setValues(rows);
  }
  matchNavStockWithPendingPartsAdvance_(ss, secrets);
  return { status: 'ok', count: list.length };
}

function getFactoryGitEtaListFromSheet_(ss) {
  var sheet = ss.getSheetByName('Factory_GIT_ETA_Tracker');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', records: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  var records = vals.map(function(r) {
    return {
      c: r[0], d: r[1], m: r[2], sn: r[3], org: r[4],
      po: r[5], qty: Number(r[6] || 0), etd: r[7], etaPort: r[8], etaWh: r[9], st: r[10]
    };
  });
  return { status: 'ok', records: records };
}

function matchNavStockWithPendingPartsAdvance_(ss, secrets) {
  var gitSheet = ss.getSheetByName('Factory_GIT_ETA_Tracker');
  var paSheet = ss.getSheetByName('Parts_Advance_Tracking');
  if (!gitSheet || !paSheet || gitSheet.getLastRow() < 2 || paSheet.getLastRow() < 2) return;
  var gitVals = gitSheet.getRange(2, 1, gitSheet.getLastRow() - 1, 11).getValues();
  var inStockSet = {};
  gitVals.forEach(function(g) {
    if (String(g[10]).toUpperCase() === 'IN_STOCK' && Number(g[6]) > 0) {
      inStockSet[String(g[0]).toUpperCase()] = Number(g[6]);
    }
  });
  if (Object.keys(inStockSet).length === 0) return;

  var paVals = paSheet.getRange(2, 1, paSheet.getLastRow() - 1, 8).getValues();
  var matchedAlerts = [];
  paVals.forEach(function(p) {
    var st = String(p[6] || '');
    if (st === 'JOB_REPORT_PARTS_CONFIRMED' || st === 'ADMIN_TECH_EMAILED_ADMIN_OFFICE') {
      var rawJson = String(p[5] || '');
      Object.keys(inStockSet).forEach(function(code) {
        if (rawJson.toUpperCase().indexOf(code) > -1) {
          matchedAlerts.push('• ' + p[0] + ' (' + p[2] + ' / ' + p[3] + ') -> อะไหล่ ' + code + ' เข้าคลังแล้ว (' + inStockSet[code] + ' ชิ้น)');
        }
      });
    }
  });

  if (matchedAlerts.length > 0 && secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessage(
      secrets.lineGroupId,
      '🎯 [PROACTIVE STOCK MATCHER] อะไหล่ที่ค้างเบิกเข้าคลังแล้ว!\n━━━━━━━━━━━━━━━━━━━━\n' +
      matchedAlerts.slice(0, 8).join('\n') +
      '\nคุณ Wanwipha และทีมช่างสามารถดำเนินการเบิกจ่ายได้ทันทีครับ'
    );
  }
}

function autoImportNavReportsFromGmail_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var threads = GmailApp.search('subject:(GIT Report OR Stock on Hand) has:attachment newer_than:2d', 0, 5);
  var importedCount = 0;
  threads.forEach(function(th) {
    var msgs = th.getMessages();
    msgs.forEach(function(m) {
      if (m.isUnread()) {
        var atts = m.getAttachments();
        atts.forEach(function(att) {
          var name = att.getName().toLowerCase();
          if (name.indexOf('.csv') > -1) {
            var rows = Utilities.parseCsv(att.getDataAsString());
            if (rows && rows.length > 1) importedCount += rows.length - 1;
          }
        });
        m.markRead();
      }
    });
  });
  return { status: 'ok', importedCount: importedCount };
}

function handleDispatchAssignAndNotifyTech_(ss, data, secrets) {
  var sheet = ss.getSheetByName('Dispatch_Job_Assignments');
  if (!sheet) {
    sheet = ss.insertSheet('Dispatch_Job_Assignments');
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Dispatch ID', 'Job No.', 'Tech Name', 'Tech Email', 'Tech Phone',
      'Customer', 'Address / Maps', 'Model / S/N', 'Scheduled Date/Time',
      'Status', 'Dispatcher Name', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var dispId = String(data.dispatchId || ('DSP-' + Date.now())).toUpperCase();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var status = data.selfAssigned ? 'TECH_ACCEPTED_JOB' : 'DISPATCHED_TO_TECH';

  var rowVals = [
    dispId, String(data.jobNo || ''), String(data.techName || ''), String(data.techEmail || ''),
    String(data.techPhone || ''), String(data.customer || ''), String(data.address || ''),
    String(data.modelSerial || ''), String(data.scheduledAt || ''), status,
    String(data.dispatcherName || 'Dispatcher'), nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, dispId);
  if (rowIdx >= 2) sheet.getRange(rowIdx, 1, 1, 12).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  if (!data.selfAssigned && isLineGroupConfigured() && isLineTokenConfigured()) {
    var flexDisp = {
      type: 'flex',
      altText: '📋 จ่ายงานใหม่: ' + rowVals[1] + ' -> ' + rowVals[2],
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
          contents: [
            { type: 'text', text: '📋 NEW JOB DISPATCH ASSIGNMENT', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
            { type: 'text', text: rowVals[1] + ' → ' + rowVals[2], color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
          contents: [
            { type: 'text', text: '🏪 ลูกค้า: ' + rowVals[5], size: 'xs', weight: 'bold', wrap: true },
            { type: 'text', text: '❄️ รุ่น/S/N: ' + rowVals[7], size: 'xs', color: '#0369A1', wrap: true },
            { type: 'text', text: '🗓️ นัดหมาย: ' + rowVals[8], size: 'xs', color: '#334155', wrap: true },
            { type: 'text', text: '📍 สถานที่: ' + rowVals[6], size: 'xxs', color: '#475569', wrap: true }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [{
            type: 'button', style: 'primary', color: '#059669', height: 'sm',
            action: {
              type: 'postback',
              label: '✅ ช่างกดยืนยันรับงานนี้',
              data: 'ACCEPT_DISPATCH_JOB:' + dispId,
              displayText: 'ยืนยันรับงาน ' + rowVals[1] + ' เรียบร้อยครับ'
            }
          }]
        }
      }
    };
    pushLineMessages_(secrets.lineGroupId, [flexDisp]);
  }

  return { status: 'ok', dispatchId: dispId, jobStatus: status };
}

function getReadyToConfirmCustomerJobs_(ss) {
  var sheet = ss.getSheetByName('Dispatch_Job_Assignments');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', jobs: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var jobs = vals.filter(function(r) {
    return String(r[9]) === 'TECH_ACCEPTED_JOB' || String(r[9]) === 'CUSTOMER_CONFIRMED';
  }).reverse().map(function(r) {
    return {
      dispatchId: r[0], jobNo: r[1], techName: r[2], techEmail: r[3], techPhone: r[4],
      customer: r[5], address: r[6], modelSerial: r[7], scheduledAt: r[8],
      status: r[9], dispatcherName: r[10], updatedAt: r[11]
    };
  });
  return { status: 'ok', jobs: jobs };
}

function handleTechConfirmDispatchWeb_(ss, params, secrets) {
  var dispId = String(params.dispatchId || '').trim().toUpperCase();
  var sheet = ss.getSheetByName('Dispatch_Job_Assignments');
  if (sheet && dispId) {
    var rowIdx = findRowByExactKey(sheet, 1, dispId);
    if (rowIdx >= 2) {
      sheet.getRange(rowIdx, 10).setValue('TECH_ACCEPTED_JOB');
      sheet.getRange(rowIdx, 12).setValue(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'));
    }
  }
  return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fdf4;"><h2 style="color:#065f46;">✅ ยืนยันรับงานเรียบร้อยแล้ว!</h2><p>รหัสงาน: ' + escapeHtml(dispId) + '</p></body></html>');
}

function handleAdminTechOneClickConfirmCustomer_(ss, data, secrets) {
  var dispId = String(data.dispatchId || '').trim().toUpperCase();
  var sheet = ss.getSheetByName('Dispatch_Job_Assignments');
  if (sheet && dispId) {
    var rowIdx = findRowByExactKey(sheet, 1, dispId);
    if (rowIdx >= 2) {
      sheet.getRange(rowIdx, 10).setValue('CUSTOMER_CONFIRMED');
      sheet.getRange(rowIdx, 12).setValue(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'));
    }
  }
  return { status: 'ok', dispatchId: dispId, customerNotified: true };
}

function handleWebConfirmAppointment_(ss, params, secrets) {
  var jobNo = String(params.jobNo || '').trim();
  if (secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessage(secrets.lineGroupId, '✅ [ลูกค้ายืนยันนัดหมายผ่านลิงก์เว็บ] ใบงาน: ' + jobNo);
  }
  return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0f9ff;"><h2 style="color:#002B49;">✅ ขอบคุณที่ยืนยันเวลานัดหมายบริการ HOSHIZAKI</h2><p>เลขที่ใบงาน: ' + escapeHtml(jobNo) + '</p></body></html>');
}

function handleSendCustomerAppointmentFlex_(ss, data, secrets) {
  var custLineId = findCustomerLineUserIdByPhoneOrName_(ss, data.phone, data.customer);
  if (custLineId && secrets.customerLineToken) {
    var flexAppt = {
      type: 'flex',
      altText: '📅 ยืนยันนัดหมายเข้าบริการ HOSHIZAKI',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
          contents: [
            { type: 'text', text: '📅 HOSHIZAKI SERVICE APPOINTMENT', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
            { type: 'text', text: 'แจ้งกำหนดการเข้าบริการ', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
          contents: [
            { type: 'text', text: '🏪 ร้านค้า: ' + (data.customer || '-'), size: 'xs', weight: 'bold', wrap: true },
            { type: 'text', text: '🗓️ วันที่/เวลา: ' + (data.date || '-') + ' ' + (data.time || ''), size: 'xs', color: '#0369A1', weight: 'bold', wrap: true },
            { type: 'text', text: '👨‍🔧 ช่างผู้ดูแล: ' + (data.tech || '-'), size: 'xs', color: '#334155', wrap: true }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [{
            type: 'button', style: 'primary', color: '#059669', height: 'sm',
            action: { type: 'postback', label: '✅ ยืนยันเวลานัดหมายนี้', data: 'CONFIRM_APPT:' + (data.jobNo || 'APPT'), displayText: 'ยืนยันนัดหมายเข้าบริการครับ' }
          }]
        }
      }
    };
    var sent = pushLineMessagesWithToken_(secrets.customerLineToken, custLineId, [flexAppt]);
    return { status: sent ? 'ok' : 'fallback_needed', sentViaLine: sent };
  }
  return { status: 'fallback_needed', sentViaLine: false };
}

function handleSendTieredQuotationFlex_(ss, data, secrets) {
  var custLineId = findCustomerLineUserIdByPhoneOrName_(ss, data.phone, data.customer);
  if (custLineId && secrets.customerLineToken) {
    var tiers = data.tiers || {};
    var flexTiers = {
      type: 'flex',
      altText: '💎 ทางเลือกใบเสนอราคาซ่อม & บำรุงรักษา HOSHIZAKI',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
          contents: [
            { type: 'text', text: '💎 SERVICE & MAINTENANCE OPTIONS', color: '#FDE047', size: 'xxs', weight: 'bold' },
            { type: 'text', text: 'ใบเสนอราคา: ' + (data.offerNo || '-'), color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
          contents: [
            { type: 'text', text: '1️⃣ GOOD (ซ่อมเฉพาะจุด): ' + formatCurrency(tiers.goodTotal || 0) + ' THB', size: 'xs', weight: 'bold', wrap: true },
            { type: 'text', text: '2️⃣ BETTER (ซ่อม + เปลี่ยนไส้กรอง/อะไหล่สิ้นเปลือง): ' + formatCurrency(tiers.betterTotal || 0) + ' THB', size: 'xs', weight: 'bold', color: '#0369A1', wrap: true },
            { type: 'text', text: '3️⃣ BEST (ซ่อม + สัญญา PM รายปี 4 ครั้ง): ' + formatCurrency(tiers.bestTotal || 0) + ' THB', size: 'xs', weight: 'bold', color: '#065F46', wrap: true }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
          contents: [
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'เลือกแพ็กเกจ GOOD', data: 'SELECT_QT_TIER:' + (data.offerNo || '') + ':GOOD', displayText: 'เลือกแพ็กเกจ GOOD' } },
            { type: 'button', style: 'primary', color: '#0284C7', height: 'sm', action: { type: 'postback', label: 'เลือกแพ็กเกจ BETTER (แนะนำ)', data: 'SELECT_QT_TIER:' + (data.offerNo || '') + ':BETTER', displayText: 'เลือกแพ็กเกจ BETTER' } },
            { type: 'button', style: 'primary', color: '#059669', height: 'sm', action: { type: 'postback', label: 'เลือกแพ็กเกจ BEST (คุ้มค่าสุด)', data: 'SELECT_QT_TIER:' + (data.offerNo || '') + ':BEST', displayText: 'เลือกแพ็กเกจ BEST' } }
          ]
        }
      }
    };
    var sent = pushLineMessagesWithToken_(secrets.customerLineToken, custLineId, [flexTiers]);
    return { status: sent ? 'ok' : 'fallback_needed', sentViaLine: sent };
  }
  return { status: 'fallback_needed', sentViaLine: false };
}

function handleSendQuotationPdfEmail_(data, secrets) {
  if (!data.recipientEmail || !checkAndNotifyEmailQuota_(secrets)) {
    return { status: 'skipped', message: 'Missing recipient or email quota low' };
  }
  var attachments = [];
  if (data.pdfBase64 && String(data.pdfBase64).indexOf('base64,') > -1) {
    var b64 = String(data.pdfBase64).split('base64,')[1];
    attachments.push(Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', (data.offerNo || 'Quotation') + '.pdf'));
  }
  var opts = {
    to: String(data.recipientEmail).trim(),
    subject: String(data.subject || ('HOSHIZAKI Quotation: ' + (data.offerNo || ''))),
    body: String(data.bodyText || 'เรียนท่านลูกค้า แนบไฟล์ใบเสนอราคาจาก HOSHIZAKI (THAILAND) LIMITED ครับ')
  };
  if (attachments.length > 0) opts.attachments = attachments;
  MailApp.sendEmail(opts);
  return { status: 'ok', sentTo: opts.to };
}

function sendCustomerCsatSurveyFlex_(ss, jobData, secrets) {
  var custLineId = findCustomerLineUserIdByPhoneOrName_(ss, jobData.contact, jobData.store);
  if (!custLineId || !secrets.customerLineToken) return false;
  var jNo = String(jobData.jobNo || '');
  var flexCsat = {
    type: 'flex',
    altText: '⭐ แบบประเมินความพึงพอใจบริการ HOSHIZAKI (' + jNo + ')',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
        contents: [
          { type: 'text', text: '⭐ HOSHIZAKI SERVICE FEEDBACK', color: '#FDE047', size: 'xxs', weight: 'bold' },
          { type: 'text', text: 'ประเมินความพึงพอใจงานบริการ (' + jNo + ')', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'text', text: 'ขอบคุณที่ไว้วางใจ HOSHIZAKI กรุณาให้คะแนนความพึงพอใจการปฏิบัติงานของช่าง ' + (jobData.responsibleTech || '') + ' ครับ', size: 'xs', wrap: true }
        ]
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'xs', paddingAll: '10px',
        contents: [5, 4, 3, 2, 1].map(function(star) {
          return {
            type: 'button',
            style: star >= 4 ? 'primary' : 'secondary',
            color: star >= 4 ? '#059669' : undefined,
            height: 'sm',
            action: {
              type: 'postback',
              label: star + '⭐',
              data: 'CSAT_RATE:' + jNo + ':' + star,
              displayText: 'ให้คะแนน ' + star + ' ดาว สำหรับใบงาน ' + jNo
            }
          };
        })
      }
    }
  };
  return pushLineMessagesWithToken_(secrets.customerLineToken, custLineId, [flexCsat]);
}

function runSevenDayPostServiceHealthCheck_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  if (!secrets.customerLineToken) return { status: 'skipped' };

  var targetDt = new Date();
  targetDt.setDate(targetDt.getDate() - 7);
  var targetIso = Utilities.formatDate(targetDt, 'Asia/Bangkok', 'yyyy-MM-dd');
  var jobs = readRecentJobsFromSheet(ss, 500);
  var sentCount = 0;

  jobs.forEach(function(j) {
    if (j.jobStatus === 'Completed' && normalizeDateForSort_(j.date) === targetIso) {
      var custLineId = findCustomerLineUserIdByPhoneOrName_(ss, j.contact, j.store);
      if (custLineId) {
        var flexHc = {
          type: 'flex',
          altText: '❄️ ติดตามผลการใช้งานเครื่องหลังซ่อม 7 วัน - HOSHIZAKI',
          contents: {
            type: 'bubble',
            size: 'mega',
            body: {
              type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
              contents: [
                { type: 'text', text: '❄️ ติดตามผลการใช้งานหลังบริการครบ 7 วัน', weight: 'bold', size: 'sm', color: '#002B49', wrap: true },
                { type: 'text', text: 'เรียนคุณลูกค้า ' + (j.store || '') + ' เครื่องรุ่น ' + (j.model || '') + ' (S/N: ' + (j.serial || '-') + ') ที่เข้ารับบริการเมื่อวันที่ ' + j.date + ' ใช้งานได้ปกติเรียบร้อยดีไหมครับ?', size: 'xs', color: '#334155', wrap: true }
              ]
            },
            footer: {
              type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
              contents: [
                { type: 'button', style: 'primary', color: '#059669', height: 'sm', action: { type: 'postback', label: '✅ ใช้งานได้ปกติ 100%', data: 'HEALTH_CHECK_OK:' + j.jobNo, displayText: 'เครื่องใช้งานได้ปกติเรียบร้อยดีครับ' } },
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚠️ พบอาการผิดปกติ / ขอให้ช่างเช็ก', data: 'HEALTH_CHECK_ISSUE:' + j.jobNo, displayText: 'พบอาการผิดปกติ ขอให้ช่างตรวจสอบครับ' } }
              ]
            }
          }
        };
        if (pushLineMessagesWithToken_(secrets.customerLineToken, custLineId, [flexHc])) sentCount++;
      }
    }
  });
  return { status: 'ok', sentCount: sentCount };
}

function runPredictivePmAndWarrantyAlerts_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var summary = buildPmDueSummaryText_(ss);
  if (summary.indexOf('พบ ') > -1 && isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessage(secrets.lineGroupId, summary);
  }
  return { status: 'ok', summary: summary };
}

function sendDailyServiceOpsDigestToLine_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  if (!isLineGroupConfigured() || !isLineTokenConfigured()) return;
  var biText = buildExecutiveBiSummaryText_(ss);
  pushLineMessage(secrets.lineGroupId, '🌆 [DAILY SERVICE DIGEST 17:30]\n' + biText);
}

function findCustomerLineUserIdByPhoneOrName_(ss, phoneText, storeName) {
  var sheet = ss.getSheetByName('Customer_Phone_LINE_Map');
  if (!sheet || sheet.getLastRow() < 2) return '';
  var digits = String(phoneText || '').replace(/\D/g, '');
  var storeUpper = String(storeName || '').trim().toUpperCase();
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    var rowPhone = String(vals[i][0] || '').replace(/\D/g, '');
    var rowUid = String(vals[i][1] || '').trim();
    var rowStore = String(vals[i][2] || '').trim().toUpperCase();
    if (rowUid && digits.length >= 9 && rowPhone && digits.indexOf(rowPhone) > -1) return rowUid;
    if (rowUid && storeUpper.length >= 4 && rowStore && rowStore.indexOf(storeUpper) > -1) return rowUid;
  }
  return '';
}

function pushLineMessageWithToken_(token, toId, text) {
  return pushLineMessagesWithToken_(token, toId, [{ type: 'text', text: String(text).substring(0, 4900) }]);
}

function pushLineMessagesWithToken_(token, toId, messagesArr) {
  if (!token || !toId || !Array.isArray(messagesArr) || messagesArr.length === 0) return false;
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + String(token).trim() },
    payload: JSON.stringify({ to: String(toId).trim(), messages: messagesArr.slice(0, 5) }),
    muteHttpExceptions: true
  });
  return res.getResponseCode() === 200;
}

function routeDualLineWebhook_(events, botMode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();

  if (botMode === 'customer') {
    events.forEach(function(ev) {
      var userId = (ev.source && ev.source.userId) || '';
      var lang = 'TH';

      // A. Postback Actions (Self-Check Resolved, Request Dealer/Tech Dispatch, Dealer Ack)
      if (ev.type === 'postback' && ev.postback && ev.postback.data) {
        var pb = String(ev.postback.data);
        if (pb.indexOf('CSAT_RATE:') === 0) {
          var pts = pb.split(':');
          var rep = recordCustomerCsatRating_(ss, pts[1] || '', pts[2] || '5', userId);
          if (Number(pts[2]) < 3 && isLineGroupConfigured()) {
            pushLineMessage(secrets.mgmtGroupId, '🚨 [LOW CSAT ALERT] ใบงาน ' + pts[1] + ' ได้คะแนน ' + pts[2] + '/5 ดาว กรุณาตรวจสอบด่วน!');
          }
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{ type: 'text', text: rep }]);
        } else if (pb.indexOf('SELF_CHECK_RESOLVED:') === 0) {
          var resRef = pb.split(':')[1] || '';
          updateDealerDispatchCaseStatus_(ss, resRef, 'RESOLVED_BY_SELF_CHECK', 'ลูกค้าแก้ไขเบื้องต้นตามคำแนะนำแล้วใช้งานได้ปกติ');
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{
            type: 'text',
            text: '✅ ยินดีด้วยครับ! ระบบบันทึกปิดเคส (' + resRef + ') เรียบร้อยแล้ว หากต้องการความช่วยเหลือเพิ่มเติมสามารถทักแชทได้ตลอดเวลาครับ 🐧'
          }]);
        } else if (pb.indexOf('ESCALATE_TO_DEALER:') === 0) {
          var escParts = pb.split(':');
          var escSn = escParts[1] || '';
          var escIssue = decodeURIComponent(escParts[2] || 'ขอช่างเข้าตรวจเช็กอาการเสีย');
          var routeRes = routeCustomerCaseToDealerOrDirect_(ss, {
            serialNo: escSn,
            symptom: escIssue,
            customerLineUserId: userId,
            customerName: getLineUserDisplayName_(userId)
          }, secrets);
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [routeRes.customerFlexMessage]);
        } else if (pb.indexOf('DEALER_ACK_CASE:') === 0) {
          var caseId = pb.split(':')[1] || '';
          updateDealerDispatchCaseStatus_(ss, caseId, 'DEALER_CONTACTED', 'ตัวแทนจำหน่ายกดยืนยันรับเรื่องและติดต่อลูกค้าแล้ว');
          if (isLineGroupConfigured() && isLineTokenConfigured()) {
            pushLineMessage(secrets.lineGroupId, '✅ [ยืนยันจากตัวแทนจำหน่าย] เคส ' + caseId + ' ตัวแทนจำหน่ายรับเรื่องและดำเนินการติดต่อลูกค้าเรียบร้อยแล้วครับ');
          }
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{
            type: 'text',
            text: '✅ บันทึกสถานะรับเรื่องสำหรับเคส ' + caseId + ' เรียบร้อยแล้ว ขอบคุณที่ร่วมดูแลลูกค้า HOSHIZAKI ครับ'
          }]);
        } else if (pb.indexOf('DEALER_REQ_HZK_SUB:') === 0) {
          var subCaseId = pb.split(':')[1] || '';
          var subRes = requestHoshizakiSubcontractForDealer_(ss, { caseId: subCaseId, reason: 'ตัวแทนจำหน่ายกดร้องขอให้ทีม HOSHIZAKI เข้าหน้างานแทนผ่าน LINE' }, secrets);
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{
            type: 'text',
            text: '📩 รับคำขอให้ทีมช่าง HOSHIZAKI เข้าดำเนินการแทนสำหรับเคส ' + subCaseId + ' เรียบร้อยแล้ว\n' +
                  '• สถานะ: เปิดใบงาน B2B Sub-Service (ออกใบเสนอราคาส่งตรงให้ตัวแทนจำหน่ายเท่านั้น เพื่อนำไปเสนอราคาลูกค้าต่อเอง)\n' +
                  '• ศูนย์บริการ HOSHIZAKI จะส่งใบเสนอราคา B2B กลับให้ทางบริษัทตัวแทนจำหน่ายโดยเร็วที่สุดครับ'
          }]);
        } else if (pb.indexOf('SELECT_QT_TIER:') === 0) {
          var qPts = pb.split(':');
          pushLineMessage(secrets.lineGroupId, '💎 [ลูกค้าเลือกแพ็กเกจใบเสนอราคา] Offer: ' + (qPts[1] || '-') + ' -> แพ็กเกจ: ' + (qPts[2] || '-'));
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{ type: 'text', text: '✅ บันทึกการเลือกแพ็กเกจ ' + (qPts[2] || '') + ' สำหรับใบเสนอราคา ' + (qPts[1] || '') + ' เรียบร้อยแล้ว ฝ่ายบริการจะดำเนินการนัดหมายทันทีครับ' }]);
        } else if (pb.indexOf('CONFIRM_APPT:') === 0) {
          var jCode = pb.split(':')[1] || '';
          pushLineMessage(secrets.lineGroupId, '✅ [ลูกค้ายืนยันนัดหมายเข้าบริการ] ใบงาน: ' + jCode);
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{ type: 'text', text: '✅ ขอบคุณครับ ระบบยืนยันเวลานัดหมายเข้าบริการเรียบร้อยแล้วครับ' }]);
        } else if (pb.indexOf('HEALTH_CHECK_OK:') === 0) {
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{ type: 'text', text: '❄️ ขอบคุณมากครับ ยินดีที่เครื่อง HOSHIZAKI ทำงานได้เต็มประสิทธิภาพครับ' }]);
        } else if (pb.indexOf('HEALTH_CHECK_ISSUE:') === 0) {
          var hcJob = pb.split(':')[1] || '';
          var tkHc = createTechnicianSupportTicket_(ss, userId, 'แจ้งอาการผิดปกติหลังซ่อม 7 วัน (Ref: ' + hcJob + ')', hcJob, 'POST_SERVICE_7D_ISSUE');
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{ type: 'text', text: '⚠️ รับแจ้งอาการผิดปกติแล้ว (รหัส ' + tkHc.ticketId + ') ทีมช่างเทคนิคจะติดต่อกลับเพื่อดูแลให้ทันทีครับ' }]);
        }
        return;
      }

      // B. Image Message from Customer -> Gemini Multimodal Vision Triage (Error LED / Nameplate S/N)
      if (ev.type === 'message' && ev.message && ev.message.type === 'image') {
        var imgFlex = handleCustomerOaImageWithGemini_(ss, ev, secrets);
        replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [imgFlex]);
        return;
      }

      // C. Text Message from Customer -> Self-Check First -> S/N Lookup -> Dealer vs Direct Routing
      if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
        var txt = String(ev.message.text || '').trim();
        lang = detectTextLanguage_(txt);
        var pwaBase = (secrets.pwaWebAppUrl && secrets.pwaWebAppUrl.indexOf('http') === 0)
          ? secrets.pwaWebAppUrl
          : 'https://serviceshth.github.io/hoshizaki-service/';

        // 1) Register mobile phone <-> LINE User ID
        var phoneMatch = txt.match(/(?:ลงทะเบียน|REGISTER|登録)\s*(0\d{8,9})/i);
        if (phoneMatch && userId) {
          var mapSheet = ss.getSheetByName('Customer_Phone_LINE_Map');
          if (!mapSheet) {
            mapSheet = ss.insertSheet('Customer_Phone_LINE_Map');
            mapSheet.getRange(1, 1, 1, 4).setValues([['Phone', 'LINE User ID', 'Display Name', 'Updated At']]).setFontWeight('bold');
          }
          mapSheet.appendRow([phoneMatch[1], userId, getLineUserDisplayName_(userId), Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')]);
          var regMsg = lang === 'JP'
            ? '✅ お電話番号 ' + phoneMatch[1] + ' の登録が完了しました。点検予定やサービス完了報告を自動でお知らせいたします。'
            : (lang === 'EN'
              ? '✅ Mobile number ' + phoneMatch[1] + ' linked successfully! You will receive live technician arrival & service updates here.'
              : '✅ ลงทะเบียนผูกเบอร์โทรศัพท์ ' + phoneMatch[1] + ' เรียบร้อยแล้ว คุณจะได้รับการแจ้งเตือนนัดหมายและรายงานบริการอัตโนมัติครับ');
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [{ type: 'text', text: regMsg }]);
          return;
        }

        // 2) Customer Self-Service Status Lookup
        if (/^(STATUS|TRACK|เช็กสถานะ|เช็คสถานะ|สถานะ|ติดตามช่าง|ステータス|進捗)/i.test(txt)) {
          var qKey = txt.replace(/^(STATUS|TRACK|เช็กสถานะ|เช็คสถานะ|สถานะ|ติดตามช่าง|ステータス|進捗)\s*/i, '').trim();
          var custFlex = buildCustomerSelfStatusFlex_(ss, qKey, userId, pwaBase, lang);
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [custFlex]);
          return;
        }

        // 3) Product & Service Knowledge Base FAQ (IM / KM / FM / HR-HF / HSU / Filter / PM / Warranty / Install)
        var faqHit = matchComprehensiveHoshizakiProductFaq_(txt, lang);
        if (faqHit) {
          var faqFlex = {
            type: 'flex',
            altText: faqHit.title,
            contents: {
              type: 'bubble',
              size: 'mega',
              header: {
                type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
                contents: [
                  { type: 'text', text: faqHit.badge, color: '#7DD3FC', size: 'xxs', weight: 'bold' },
                  { type: 'text', text: faqHit.title, color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs', wrap: true }
                ]
              },
              body: {
                type: 'box', layout: 'vertical', paddingAll: '12px', paddingBottom: '56px',
                contents: [
                  {
                    type: 'image',
                    url: 'https://raw.githubusercontent.com/serviceshth/hoshizaki-service/main/penguin-tech-bg.png?v=4',
                    position: 'absolute',
                    align: 'end',
                    gravity: 'bottom',
                    offsetEnd: '8px',
                    offsetBottom: '4px',
                    size: 'lg',
                    aspectRatio: '1:1',
                    aspectMode: 'fit'
                  },
                  {
                    type: 'box', layout: 'vertical', spacing: 'sm',
                    contents: [
                      { type: 'text', text: faqHit.body, size: 'xs', color: '#1E293B', wrap: true },
                      { type: 'separator', margin: 'sm' },
                      { type: 'text', text: '💡 หากมีเครื่องอยู่แล้ว สามารถพิมพ์ Serial Number (S/N) 7 หลัก (เช่น H14289J) เพื่อเช็กประวัติและตัวแทนที่ดูแลได้ทันทีครับ', size: 'xxs', color: '#0369A1', weight: 'bold', wrap: true }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
                contents: [
                  {
                    type: 'button', style: 'primary', color: '#0284C7', height: 'sm',
                    action: { type: 'postback', label: faqHit.actionLabel, data: faqHit.actionData, displayText: faqHit.actionLabel }
                  }
                ]
              }
            }
          };
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [faqFlex]);
          return;
        }

        // 4) Detect Serial Number (e.g. H14289J, 51967170400060) or Explicit Service Request with S/N
        var snMatch = txt.match(/\b([A-Z]\d{4,6}[A-Z0-9]{0,3}|\d{10,16})\b/i);
        var wantsTechNow = /^(แจ้งซ่อม|ขอซ่อม|นัดช่าง|ขอช่าง|REPAIR|SERVICE\s*CALL|BOOK|修理|点検依頼)/i.test(txt);

        if (snMatch && (wantsTechNow || /^([A-Z]\d{4,6}[A-Z0-9]{0,3}|\d{10,16})$/i.test(txt) || /(S\/N|SN|SERIAL|ตัวแทน|ดีลเลอร์|ซ่อม|ไม่เย็น|ไม่ทำน้ำแข็ง|น้ำแข็งไม่ผลิต)/i.test(txt))) {
          var detectedSn = snMatch[1].toUpperCase();
          var routeOutcome = routeCustomerCaseToDealerOrDirect_(ss, {
            serialNo: detectedSn,
            symptom: txt,
            customerLineUserId: userId,
            customerName: getLineUserDisplayName_(userId)
          }, secrets);
          replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [routeOutcome.customerFlexMessage]);
          return;
        }

        // 5) Symptom Triage + Self-Check First + Button to Escalate with S/N
        var guide = diagnoseSymptomGuide_(txt);
        var aiAdvice = guide ? '' : callGeminiLineTextAssistant_(
          'คุณคือผู้ช่วยศูนย์บริการ HOSHIZAKI (THAILAND) ตอบคำถามลูกค้าอย่างสุภาพ กระชับ ชัดเจน ' +
          'หากลูกค้าแจ้งอาการเสีย ให้แนะนำวิธีตรวจเช็กเบื้องต้นที่ปลอดภัย 3-4 ข้อ และขอให้ลูกค้าพิมพ์ Serial Number (S/N) หน้าเครื่อง (เช่น H14289J) เพื่อตรวจสอบตัวแทนจำหน่ายที่ดูแลหรือส่งช่างเข้าตรวจเช็ก\n' +
          'ข้อความลูกค้า: ' + txt
        );

        var adviceText = aiAdvice || (guide ? (guide.title + '\n' + guide.steps.join('\n')) :
          '🐧 ศูนย์บริการ HOSHIZAKI (THAILAND) ยินดีให้บริการครับ\n' +
          '1) เบื้องต้นกรุณาตรวจสอบเบรกเกอร์ไฟ วาล์วน้ำเข้า และล้างแผ่นกรองฝุ่นหน้าเครื่อง\n' +
          '2) หากต้องการให้ช่างเข้าตรวจเช็ก กรุณาพิมพ์ **Serial Number (S/N)** 7 หลักบนสติกเกอร์ข้างเครื่อง (เช่น H14289J) หรือถ่ายรูปป้ายรุ่นส่งเข้ามาในแชทนี้ได้เลยครับ');

        var triageFlex = {
          type: 'flex',
          altText: '🐧 คำแนะนำเบื้องต้นจากศูนย์บริการ HOSHIZAKI',
          contents: {
            type: 'bubble',
            size: 'mega',
            header: {
              type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
              contents: [
                { type: 'text', text: '🐧 HOSHIZAKI SMART SERVICE CARE', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
                { type: 'text', text: 'คำแนะนำตรวจเช็กเบื้องต้น & ค้นหาผู้ดูแล', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs', wrap: true }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '12px',
              paddingBottom: '56px',
              contents: [
                {
                  type: 'image',
                  url: 'https://raw.githubusercontent.com/serviceshth/hoshizaki-service/main/penguin-tech-bg.png?v=4',
                  position: 'absolute',
                  align: 'end',
                  gravity: 'bottom',
                  offsetEnd: '8px',
                  offsetBottom: '4px',
                  size: 'lg',
                  aspectRatio: '1:1',
                  aspectMode: 'fit'
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: adviceText.replace(/\*\*/g, '').substring(0, 1500), size: 'xs', color: '#1E293B', wrap: true },
                    { type: 'separator', margin: 'sm' },
                    { type: 'text', text: '📌 หากลองตรวจเช็กเบื้องต้นแล้วยังไม่หาย กรุณาพิมพ์ Serial Number (S/N) ของเครื่องส่งกลับมา หรือกดปุ่มด้านล่างครับ', size: 'xxs', color: '#0369A1', weight: 'bold', wrap: true }
                  ]
                }
              ]
            },
            footer: {
              type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
              contents: [
                {
                  type: 'button', style: 'primary', color: '#059669', height: 'sm',
                  action: { type: 'postback', label: '✅ แก้ไขแล้ว ใช้งานได้ปกติ (จบเคส)', data: 'SELF_CHECK_RESOLVED:SELF-' + Date.now().toString().slice(-6), displayText: 'แก้ไขเบื้องต้นแล้ว เครื่องใช้งานได้ปกติครับ' }
                },
                {
                  type: 'button', style: 'primary', color: '#DC2626', height: 'sm',
                  action: { type: 'postback', label: '🔧 ยังไม่หาย / ขอช่างดูแล', data: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent(txt.substring(0, 120)), displayText: 'ยังไม่หาย ขอส่งเรื่องให้ตัวแทนจำหน่ายหรือช่างเข้าตรวจเช็กครับ' }
                }
              ]
            }
          }
        };
        replyLineMessagesWithToken_(secrets.customerLineToken, ev.replyToken, [triageFlex]);
      }
    });
    return;
  }

  // Internal Bot or Default Mode:
  // If botMode is empty (''), route 1:1 user messages through Customer OA handler automatically
  // so Customer LINE OA works out-of-the-box even if ?bot=customer wasn't appended to the Webhook URL!
  if (!botMode) {
    var userEvents = events.filter(function(ev) {
      var st = (ev.source && ev.source.type) || 'user';
      var txt = (ev.message && ev.message.text) ? String(ev.message.text).trim().toUpperCase() : '';
      var isInternalCmd = /^(SPEC |MANUAL |PDF |SN |S\/N |STATUS |ERR |ERROR |PINOUT|BOARD|LED |PARAM|SETTING|VAN STOCK|VANSTOCK|PM DUE|BI REPORT|QT FOLLOWUP|TICKETS|REPLY |RENAME |ID$|GROUPID$|MYID$)/.test(txt);
      return st === 'user' && !isInternalCmd;
    });
    var internalEvents = events.filter(function(ev) {
      return userEvents.indexOf(ev) === -1;
    });
    if (userEvents.length > 0) {
      routeDualLineWebhook_(userEvents, 'customer');
    }
    if (internalEvents.length === 0) return;
    events = internalEvents;
  }

  events.forEach(function(ev) {
    if (ev.type === 'postback' && ev.postback && ev.postback.data && String(ev.postback.data).indexOf('ACCEPT_DISPATCH_JOB:') === 0) {
      var dId = String(ev.postback.data).split(':')[1] || '';
      var dSheet = ss.getSheetByName('Dispatch_Job_Assignments');
      if (dSheet && dId) {
        var rIdx = findRowByExactKey(dSheet, 1, dId);
        if (rIdx >= 2) {
          dSheet.getRange(rIdx, 10).setValue('TECH_ACCEPTED_JOB');
          dSheet.getRange(rIdx, 12).setValue(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'));
        }
      }
      replyLineMessage(ev.replyToken, '✅ บันทึกสถานะช่างยืนยันรับงาน [' + dId + '] เรียบร้อยแล้ว คุณ Wanwipha (Service Admin) สามารถกดแจ้งยืนยันนัดลูกค้าได้ทันทีครับ');
      return;
    }
    handleLineWebhookEvents([ev]);
  });
}

function replyLineMessagesWithToken_(token, replyToken, messagesArr) {
  if (!replyToken || !Array.isArray(messagesArr) || messagesArr.length === 0) return false;
  var secrets = getAppSecrets_();
  var candidates = [token, secrets.customerLineToken, secrets.lineToken, secrets.lineMainOfficeToken].filter(function(t, idx, arr) {
    return t && String(t).trim().length > 20 && arr.indexOf(t) === idx;
  });
  for (var i = 0; i < candidates.length; i++) {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + String(candidates[i]).trim() },
      payload: JSON.stringify({ replyToken: replyToken, messages: messagesArr.slice(0, 5) }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) return true;
  }
  return false;
}


// ============================================================================
// 3. UNLIMITED GOOGLE DRIVE PDF INDEX & SEARCH ENGINE (v18.4.0)
// ============================================================================

/**
 * สร้างหรืออัปเดตดัชนีไฟล์ PDF ทั้งหมดในโฟลเดอร์ Spec Sheet และคู่มือลงแท็บ Drive_PDF_Index
 * ปลดลิมิต 600 ไฟล์ของ CacheService ทำให้ค้นหาไฟล์ PDF กี่พันไฟล์ก็ได้ทันที
 */
function rebuildDrivePdfIndexSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var idxSheet = ss.getSheetByName('Drive_PDF_Index');
  if (!idxSheet) {
    idxSheet = ss.insertSheet('Drive_PDF_Index');
  }

  var allFolders = [SPEC_SHEET_FOLDER_ID].concat(MANUAL_PDF_FOLDER_IDS);
  var visited = {};
  var rows = [];
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  function scanUnlimited(folderId, rootId, depth) {
    if (!folderId || visited[folderId] || depth > 5) return;
    visited[folderId] = true;
    try {
      var folder = DriveApp.getFolderById(folderId);
      var folderName = folder.getName();
      var files = folder.getFilesByType(MimeType.PDF);
      while (files.hasNext()) {
        var f = files.next();
        rows.push([f.getId(), f.getName(), f.getUrl(), folderName, rootId, nowStr]);
      }
      var subs = folder.getFolders();
      while (subs.hasNext()) {
        scanUnlimited(subs.next().getId(), rootId, depth + 1);
      }
    } catch (e) {}
  }

  allFolders.forEach(function(fid) {
    scanUnlimited(fid, fid, 0);
  });

  idxSheet.clear();
  idxSheet.appendRow(['File ID', 'File Name', 'File URL', 'Folder Name', 'Root Folder ID', 'Indexed At']);
  idxSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
  idxSheet.setFrozenRows(1);

  if (rows.length > 0) {
    idxSheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
  clearDrivePdfIndexCache_();
  Logger.log('✅ สร้างดัชนีไฟล์ PDF ใน Drive_PDF_Index สำเร็จทั้งหมด ' + rows.length + ' ไฟล์');
  return rows.length;
}

function getUnlimitedDrivePdfCatalog_(folderIds) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var idxSheet = ss.getSheetByName('Drive_PDF_Index');
  var folderSet = {};
  folderIds.forEach(function(id) { folderSet[id] = true; });

  if (idxSheet && idxSheet.getLastRow() >= 2) {
    var vals = idxSheet.getRange(2, 1, idxSheet.getLastRow() - 1, 5).getValues();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!r[4] || folderSet[r[4]]) {
        out.push({ id: r[0], name: r[1], url: r[2], folder: r[3] });
      }
    }
    if (out.length > 0) return out;
  }

  // Fallback: สแกนพร้อม CacheService (สูงสุด 2,500 ไฟล์) และค้นหาตรงด้วย DriveApp.searchFiles
  var cache = CacheService.getScriptCache();
  var cacheKey = 'DRIVE_PDF_IDX_V184_' + Utilities.base64Encode(folderIds.join(',')).substring(0, 32);
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var collected = [];
  var visitedFolders = {};
  function scanFolderRecursive(folderId, depth) {
    if (!folderId || visitedFolders[folderId] || depth > 5) return;
    visitedFolders[folderId] = true;
    try {
      var folder = DriveApp.getFolderById(folderId);
      var folderName = folder.getName();
      var files = folder.getFilesByType(MimeType.PDF);
      while (files.hasNext() && collected.length < 2500) {
        var f = files.next();
        collected.push({
          id: f.getId(),
          name: f.getName(),
          url: f.getUrl(),
          folder: folderName
        });
      }
      var subs = folder.getFolders();
      while (subs.hasNext() && collected.length < 2500) {
        scanFolderRecursive(subs.next().getId(), depth + 1);
      }
    } catch (err) {}
  }

  folderIds.forEach(function(fid) { scanFolderRecursive(fid, 0); });

  var jsonStr = JSON.stringify(collected);
  if (jsonStr.length < 95000) {
    cache.put(cacheKey, jsonStr, 300);
  }
  return collected;
}

function normalizeModelBase(modelStr) {
  var m = String(modelStr || '').trim().toUpperCase();
  return m.replace(/-(21|23|HC|R452N|R404A|S|B|D|G|N|E|J|H)+$/g, '');
}

function searchPdfFilesInDriveFolders(folderIds, keyword, maxResults) {
  var q = String(keyword || '').trim().toUpperCase();
  if (!q) return [];
  var baseQ = normalizeModelBase(q);
  var compactQ = q.replace(/[^A-Z0-9]/g, '');
  var compactBase = baseQ.replace(/[^A-Z0-9]/g, '');

  var allFiles = getUnlimitedDrivePdfCatalog_(folderIds);
  var scored = [];
  var seenIds = {};

  allFiles.forEach(function(item) {
    var upperName = String(item.name || '').toUpperCase();
    var compactName = upperName.replace(/[^A-Z0-9]/g, '');
    var score = 0;

    if (upperName.indexOf(q) > -1) score += 100;
    else if (baseQ && baseQ !== q && upperName.indexOf(baseQ) > -1) score += 75;
    else if (compactQ.length >= 3 && compactName.indexOf(compactQ) > -1) score += 65;
    else if (compactBase.length >= 3 && compactName.indexOf(compactBase) > -1) score += 50;

    if (score > 0 && !seenIds[item.id]) {
      seenIds[item.id] = true;
      scored.push({ file: item, score: score });
    }
  });

  // หากยังไม่ครบจำนวน ให้เสริมด้วย DriveApp.searchFiles ทั่วทั้ง Drive เพื่อไม่ให้ตกหล่นแม้ไฟล์เกินลิมิต
  if (scored.length < (maxResults || 6) && baseQ.length >= 3) {
    try {
      var safeTerm = baseQ.replace(/'/g, "\\'");
      var directIter = DriveApp.searchFiles("mimeType = 'application/pdf' and trashed = false and title contains '" + safeTerm + "'");
      var extraCount = 0;
      while (directIter.hasNext() && extraCount < 10) {
        var df = directIter.next();
        var dfId = df.getId();
        if (!seenIds[dfId]) {
          seenIds[dfId] = true;
          var pIter = df.getParents();
          var pName = pIter.hasNext() ? pIter.next().getName() : 'Google Drive';
          scored.push({
            file: { id: dfId, name: df.getName(), url: df.getUrl(), folder: pName },
            score: 40
          });
          extraCount++;
        }
      }
    } catch (e) {}
  }

  scored.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.name.localeCompare(b.file.name);
  });

  return scored.slice(0, maxResults || 6).map(function(s) { return s.file; });
}

// ============================================================================
// 4. LINE OFFICIAL ACCOUNT FLEX MESSAGE CARDS & WEBHOOK ENGINE (v18.4.0)
// ============================================================================

function buildSaveJobFlexMessage_(data, pdfUrl, pwaUrl) {
  var status = data.jobStatus || 'Completed';
  var headerBg = '#002B49';
  var revPrefix = (data.isRevised || Number(data.revisionCount || 0) > 0) ? ('✏️ REVISED #' + (data.revisionCount || 1) + ' • ') : '';
  var badgeText = revPrefix + '🔧 SERVICE REPORT';
  if (status === 'Completed') { headerBg = '#065F46'; badgeText = '✅ COMPLETED'; }
  else if (status === 'Waiting Parts') { headerBg = '#B45309'; badgeText = '📦 WAITING PARTS'; }
  else if (status === 'Cancelled') { headerBg = '#991B1B'; badgeText = '❌ CANCELLED'; }

  var priceTxt = (data.grandTotal && parseFloat(data.grandTotal) > 0) ? formatCurrency(data.grandTotal) + ' THB' : '0.00 THB (ในประกัน/ไม่มีค่าใช้จ่าย)';
  var footerButtons = [];
  if (pdfUrl) {
    footerButtons.push({
      type: 'button',
      style: 'primary',
      color: '#005696',
      height: 'sm',
      action: { type: 'uri', label: '📄 เปิดไฟล์ PDF ใบงาน', uri: pdfUrl }
    });
  }
  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    var deepJobUrl = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + 'jobNo=' + encodeURIComponent(data.jobNo || '');
    footerButtons.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: { type: 'uri', label: '🖥️ พรีวิวใบงานเต็มจอ (Full Screen)', uri: deepJobUrl }
    });
  }

  var bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerBg,
      paddingAll: '14px',
      contents: [
        { type: 'text', text: badgeText, color: '#A7F3D0', size: 'xs', weight: 'bold' },
        { type: 'text', text: String(data.jobNo || 'JOB-REPORT'), color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'xs' },
        { type: 'text', text: 'วันที่: ' + (data.date || '-') + ' | ช่าง: ' + (data.responsibleTech || '-'), color: '#E2E8F0', size: 'xs', margin: 'xs' }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '14px',
      contents: [
        { type: 'text', text: '🏭 ' + (data.store || '-'), weight: 'bold', size: 'sm', color: '#0F172A', wrap: true },
        { type: 'text', text: '❄️ รุ่น: ' + (data.model || '-') + ' | S/N: ' + (data.serial || '-'), size: 'xs', color: '#0369A1', weight: 'bold', wrap: true },
        { type: 'separator', margin: 'sm' },
        { type: 'text', text: '🔍 อาการ: ' + (data.diagSymptom || '-'), size: 'xs', color: '#334155', wrap: true },
        { type: 'text', text: '⚙️ แก้ไข: ' + (data.diagAction || '-'), size: 'xs', color: '#334155', wrap: true },
        { type: 'text', text: '📦 อะไหล่: ' + (data.partsSummary || 'ไม่มีการเปลี่ยนอะไหล่'), size: 'xs', color: '#475569', wrap: true },
        { type: 'separator', margin: 'sm' },
        { type: 'text', text: '💰 ยอดรวมสุทธิ: ' + priceTxt, weight: 'bold', size: 'sm', color: '#002B49', margin: 'xs' }
      ]
    }
  };

  if (status === 'Completed' && data.jobNo) {
    footerButtons.push({
      type: 'button',
      style: 'primary',
      color: '#059669',
      height: 'sm',
      action: {
        type: 'postback',
        label: '⭐ ประเมินความพึงพอใจบริการ (5 ดาว)',
        data: 'action=CSAT_RATING&jobNo=' + encodeURIComponent(String(data.jobNo)) + '&score=5',
        displayText: 'ประเมินความพึงพอใจ 5 ดาว สำหรับใบงาน ' + String(data.jobNo)
      }
    });
  }

  if (footerButtons.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '12px',
      contents: footerButtons
    };
  }

  return {
    type: 'flex',
    altText: 'อัปเดตใบงาน ' + (data.jobNo || '') + ' - ' + (data.store || ''),
    contents: bubble
  };
}

function buildPdfResultsFlexMessage_(title, subtitle, files, pwaUrl) {
  var contents = [
    { type: 'text', text: title, weight: 'bold', size: 'md', color: '#002B49', wrap: true },
    { type: 'text', text: subtitle, size: 'xs', color: '#475569', wrap: true, margin: 'xs' },
    { type: 'separator', margin: 'md' }
  ];

  files.slice(0, 6).forEach(function(f, idx) {
    contents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: '#F8FAFC',
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: (idx + 1) + '. ' + f.name, size: 'xs', weight: 'bold', color: '#0F172A', wrap: true },
        { type: 'text', text: '📁 ' + (f.folder || 'Google Drive'), size: 'xxs', color: '#64748B', margin: 'xs' },
        {
          type: 'button',
          style: 'primary',
          color: '#005696',
          height: 'sm',
          margin: 'sm',
          action: { type: 'uri', label: 'เปิดดู / ดาวน์โหลด PDF', uri: f.url }
        }
      ]
    });
  });

  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    contents.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      margin: 'md',
      action: { type: 'uri', label: '📲 เปิดเว็บแอปใบงาน HOSHIZAKI', uri: pwaUrl }
    });
  }

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: contents
      }
    }
  };
}

function buildJobsStatusFlexMessage_(title, jobs, pwaUrl) {
  var contents = [
    { type: 'text', text: title, weight: 'bold', size: 'md', color: '#002B49', wrap: true },
    { type: 'separator', margin: 'sm' }
  ];

  jobs.slice(0, 4).forEach(function(j) {
    var icon = j.jobStatus === 'Completed' ? '✅' : (j.jobStatus === 'Waiting Parts' ? '📦' : '⏳');
    var itemBox = {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: '#F1F5F9',
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: icon + ' ' + (j.jobNo || '-') + ' (' + (j.date || '-') + ')', weight: 'bold', size: 'xs', color: '#002B49' },
        { type: 'text', text: 'ร้าน: ' + (j.store || '-'), size: 'xs', color: '#0F172A', wrap: true, margin: 'xs' },
        { type: 'text', text: 'รุ่น/S/N: ' + (j.model || '-') + ' / ' + (j.serial || '-'), size: 'xxs', color: '#0369A1', wrap: true },
        { type: 'text', text: 'สถานะ: ' + (j.jobStatus || '-') + ' | ช่าง: ' + (j.responsibleTech || '-'), size: 'xxs', color: '#475569', margin: 'xs' }
      ]
    };
    if (j.pdfBackupUrl && String(j.pdfBackupUrl).indexOf('http') === 0) {
      itemBox.contents.push({
        type: 'button',
        style: 'primary',
        color: '#005696',
        height: 'sm',
        margin: 'sm',
        action: { type: 'uri', label: '📄 เปิดใบงาน PDF เต็มฉบับ', uri: String(j.pdfBackupUrl) }
      });
    }
    if (pwaUrl && pwaUrl.indexOf('http') === 0 && j.jobNo) {
      var jDeepUrl = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + 'jobNo=' + encodeURIComponent(String(j.jobNo));
      itemBox.contents.push({
        type: 'button',
        style: 'secondary',
        height: 'sm',
        margin: 'xs',
        action: { type: 'uri', label: '🖥️ พรีวิวเต็มจอใน Web App', uri: jDeepUrl }
      });
    }
    contents.push(itemBox);
  });

  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    contents.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      margin: 'md',
      action: { type: 'uri', label: '📲 เปิดเว็บแอป HOSHIZAKI', uri: pwaUrl }
    });
  }

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: contents
      }
    }
  };
}

function formatSaveJobNotificationLine(data, pdfUrl) {
  var statusIcon = '🔧';
  if (data.jobStatus === 'Completed') statusIcon = '✅';
  else if (data.jobStatus === 'Waiting Parts') statusIcon = '📦';
  else if (data.jobStatus === 'Cancelled') statusIcon = '❌';

  var priceTxt = (data.grandTotal && parseFloat(data.grandTotal) > 0) ? formatCurrency(data.grandTotal) + ' THB' : 'ไม่มีค่าใช้จ่าย (0.00 THB)';

  var revLine = (data.isRevised || Number(data.revisionCount || 0) > 0) ? ('✏️ [REVISED #' + (data.revisionCount || 1) + ' — แก้ไขใบงานย้อนหลัง โดย ' + (data.lastRevisedBy || '-') + ']\n') : '';
  return revLine + statusIcon + ' อัปเดตใบงานบริการ HOSHIZAKI\n' +
         '━━━━━━━━━━━━━━━━━━━━\n' +
         '📄 เลขที่ใบงาน: ' + (data.jobNo || '-') + '\n' +
         '🗓️ วันที่ปฏิบัติงาน: ' + (data.date || '-') + '\n' +
         '🚦 สถานะงาน: ' + (data.jobStatus || 'Completed') + '\n' +
         '👤 ช่างผู้ดูแล: ' + (data.responsibleTech || '-') + (data.techniciansSummary ? '\n👥 ทีมช่างร่วม: ' + data.techniciansSummary : '') + '\n' +
         '━━━━━━━━━━━━━━━━━━━━\n' +
         '🏭 ลูกค้า/ร้านค้า: ' + (data.store || '-') + '\n' +
         '🛠️ อุปกรณ์/เครื่อง: ' + (data.model || '-') + ' (S/N: ' + (data.serial || '-') + ')\n' +
         '🔍 อาการเสีย: ' + (data.diagSymptom || '-') + '\n' +
         '⚙️ การแก้ไข: ' + (data.diagAction || '-') + '\n' +
         '📦 อะไหล่ที่ใช้: ' + (data.partsSummary || 'ไม่มีการเปลี่ยนอะไหล่') + '\n' +
         '💰 ยอดรวม: ' + priceTxt + '\n' +
         '━━━━━━━━━━━━━━━━━━━━\n' +
         (pdfUrl ? '🔗 ดาวน์โหลด PDF ใบงาน:\n' + pdfUrl : '⚠️ บันทึกข้อมูลเรียบร้อย (ไม่ได้แนบไฟล์ PDF)');
}

function formatCurrency(num) {
  var p = parseFloat(num);
  if (isNaN(p)) return '0.00';
  return p.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}


// ============================================================================
// 4B. FULL-SCREEN SPEC SHEET IMAGE & STRUCTURED DATA ENGINE (v18.5.0)
// ============================================================================

/**
 * สร้าง URL รูปภาพความละเอียดสูง (PNG/JPG) จากหน้าแรกของไฟล์ PDF ใน Google Drive
 * และตั้งค่าสิทธิ์ให้ LINE Server ดึงไปแสดงผลเป็นการ์ดรูปภาพเต็มจอในห้องแชทได้ทันที
 */
function ensureDrivePdfPublicViewAndGetImageUrl_(fileId, widthPx) {
  if (!fileId) return '';
  try {
    var file = DriveApp.getFileById(fileId);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    var w = widthPx || 1400;
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + w;
  } catch (e) {
    return '';
  }
}

/**
 * ฐานข้อมูลสเปกมาตรฐาน Hoshizaki สำหรับแสดงตารางสเปกเต็มหน้าจอ (Web App + LINE Flex Card)
 */
function getStructuredHoshizakiModelSpec_(modelQuery) {
  var q = String(modelQuery || '').trim().toUpperCase();
  var catalog = [
    {
      match: /^IM-240DNE|^IM-240ANE|^IM-240XNE/,
      series: 'IM-240 Series (Modular Cube Ice Maker)',
      variants: ['IM-240DNE', 'IM-240DNE-21', 'IM-240DNE-23', 'IM-240DNE-32'],
      iceDim: '28x28x32 | 21x21x14 | 28x28x23 | 32x32x32 mm',
      dimensions: '1084 x 700 x 500 mm (Packed: 1196 x 825 x 640 mm)',
      weight: '88 KG (Nett) / 101 KG (Gross)',
      ampStart: '6.6 A / Starting 35 A',
      watt: '1330 W (Heat Rejection: 2870 W / 2470 kcal/h)',
      refrigerant: 'R404A / R290 (-HC) | High: 210-265 PSI | Low: 28-42 PSI',
      iceProd: '10°C: 240 kg | 21°C: 220 kg | 32°C: 190 kg / 24h',
      waterCons: '0.34 - 0.43 m³/24h (1.79 - 2.26 L / 1 kg ice)',
      cycleTime: '25 - 33 MIN (2.1 - 3.3 kg / 108 - 360 pcs per cycle)',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient 1°-40°C | Water 5°-35°C (0.07-0.8 MPa)'
    },
    {
      match: /^IM-130NE/,
      series: 'IM-130NE Series (Self-Contained Cube Ice Maker)',
      variants: ['IM-130NE', 'IM-130NE-21', 'IM-130NE-23', 'IM-130NE-HC'],
      iceDim: '28x28x32 mm | 21x21x14 mm (-21) | 28x28x23 mm (-23)',
      dimensions: '704 x 506 x 1200 mm',
      weight: '76 KG (Nett) / 84 KG (Gross)',
      ampStart: '4.3 A / Starting 24 A',
      watt: '700 W',
      refrigerant: 'R134a / R290 (-HC) | High: 145-185 PSI | Low: 12-22 PSI',
      iceProd: '10°C: 130 kg | 21°C: 118 kg | 32°C: 100 kg / 24h',
      waterCons: '0.26 m³/24h (2.2 L / 1 kg ice)',
      cycleTime: '22 - 26 MIN (1.6 kg / 80 pcs per cycle)',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient 1°-40°C | Water 5°-35°C (0.07-0.8 MPa)'
    },
    {
      match: /^IM-100NE|^IM-100CNE/,
      series: 'IM-100NE / IM-100CNE Series (Cube Ice Maker)',
      variants: ['IM-100NE', 'IM-100NE-21', 'IM-100NE-23', 'IM-100NE-HC'],
      iceDim: '28x28x32 mm | 21x21x14 mm (-21) | 28x28x23 mm (-23)',
      dimensions: '704 x 506 x 1200 mm (CNE: 1004 x 600 x 800 mm)',
      weight: '73 KG (Nett) / 81 KG (Gross)',
      ampStart: '3.8 A / Starting 21 A',
      watt: '630 W',
      refrigerant: 'R134a / R290 (-HC) | High: 140-180 PSI | Low: 12-22 PSI',
      iceProd: '10°C: 105 kg | 21°C: 95 kg | 32°C: 82 kg / 24h',
      waterCons: '0.22 m³/24h (2.3 L / 1 kg ice)',
      cycleTime: '22 - 26 MIN (1.35 kg / 70 pcs per cycle)',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient 1°-40°C | Water 5°-35°C (0.07-0.8 MPa)'
    },
    {
      match: /^IM-65NE/,
      series: 'IM-65NE Series (Cube Ice Maker)',
      variants: ['IM-65NE', 'IM-65NE-21', 'IM-65NE-23', 'IM-65NE-HC'],
      iceDim: '28x28x32 mm | 21x21x14 mm (-21) | 28x28x23 mm (-23)',
      dimensions: '633 x 506 x 840 mm',
      weight: '53 KG (Nett) / 60 KG (Gross)',
      ampStart: '2.7 A / Starting 16 A',
      watt: '400 W',
      refrigerant: 'R134a / R290 (-HC) | High: 140-180 PSI | Low: 12-22 PSI',
      iceProd: '10°C: 65 kg | 21°C: 58 kg | 32°C: 50 kg / 24h',
      waterCons: '0.14 m³/24h (2.4 L / 1 kg ice)',
      cycleTime: '20 - 25 MIN (0.85 kg / 42 pcs per cycle)',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient 1°-40°C | Water 5°-35°C (0.07-0.8 MPa)'
    },
    {
      match: /^IM-45NE|^IM-45CNE|^IM-30CNE|^IM-21CNE/,
      series: 'IM-21CNE / 30CNE / 45NE / 45CNE Compact Cube Series',
      variants: ['IM-21CNE', 'IM-30CNE', 'IM-45CNE', 'IM-45NE'],
      iceDim: '28x28x32 mm (Standard Full Cube)',
      dimensions: '398x451x695 | 633x511x690 | 503x456x840 mm',
      weight: '34 - 46 KG (Nett) / 39 - 52 KG (Gross)',
      ampStart: '1.8 - 2.3 A / Starting 11 - 14 A',
      watt: '240 - 330 W',
      refrigerant: 'R134a / R290 (-HC) | High: 135-175 PSI | Low: 12-20 PSI',
      iceProd: '21-47 kg (10°C) | 18-42 kg (21°C) | 15-36 kg (32°C) / 24h',
      waterCons: '0.08 - 0.11 m³/24h (2.5 - 2.6 L / 1 kg ice)',
      cycleTime: '20 - 25 MIN (0.36 - 0.60 kg per cycle)',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient 1°-40°C | Water 5°-35°C (0.07-0.8 MPa)'
    },
    {
      match: /^KM-(40|50|60|80|100|150)B|^KM-(35|55|65)A/,
      series: 'KM Self-Contained Crescent Cube Series (KM-35A to KM-150B)',
      variants: ['KM-40B', 'KM-60B', 'KM-100B', 'KM-150B'],
      iceDim: 'Crescent Cube (30 x 37 x 13 mm)',
      dimensions: '452x617x842 (40B) | 605x617x842 (60B) | 770x617x950 (100B) | 935x617x1080 mm (150B)',
      weight: '42 - 78 KG (Nett)',
      ampStart: '2.2 - 4.8 A',
      watt: '320 - 780 W',
      refrigerant: 'R134a / R404A / R290 | High: 210-260 PSI | Low: 28-40 PSI',
      iceProd: '40 kg (40B) | 60 kg (60B) | 100 kg (100B) | 150 kg (150B) / 24h',
      waterCons: '1.6 - 2.1 L / 1 kg ice (CycleSaver™)',
      cycleTime: '16 - 22 MIN (Double-Sided Stainless Steel Evaporator)',
      operating: '1/220-240V 50Hz | Ambient 7°-38°C | Water 7°-32°C (0.07-0.8 MPa)'
    },
    {
      match: /^KM-(231|515|660|901|1301|1340|1601|1900|2200|2600)|^KMD-/,
      series: 'KM / KMD Modular Crescent Cube Series (KM-231BAJ to KM-2600SRJ3)',
      variants: ['KM-231BAJ', 'KM-515MAH', 'KM-660MAJ', 'KM-901MAJ', 'KM-1301SAJ'],
      iceDim: 'Crescent Cube (30 x 37 x 13 mm)',
      dimensions: '560x625x610 (231) | 762x620x762 (515/660) | 762x620x1050 (901) | 1220x620x1050 mm (1301)',
      weight: '55 - 165 KG (Nett)',
      ampStart: '4.5 - 13.5 A (1/220-240V หรือ 3/380-415V 50Hz ตามรุ่น)',
      watt: '680 - 2,650 W',
      refrigerant: 'R404A | High: 215-265 PSI | Low: 28-42 PSI',
      iceProd: '215 kg (231) | 240 kg (515) | 300 kg (660) | 410 kg (901) | 590 kg (1301) / 24h',
      waterCons: '1.4 - 1.8 L / 1 kg ice (CycleSaver™)',
      cycleTime: '15 - 20 MIN (EverCheck™ Alert System)',
      operating: '1/220-240V or 3/380-415V 50Hz | Ambient 7°-38°C | Water 7°-32°C (0.07-0.8 MPa)'
    },
    {
      match: /^FM-(80|120|150|170|300|480|600|750|1000|1800)/,
      series: 'FM Series (Flake & Nugget Ice Maker — FM-80KE to FM-1800ALKE)',
      variants: ['FM-150KE', 'FM-300AKE', 'FM-480AKE', 'FM-600AKE', 'FM-750AKE', 'FM-1000AKE'],
      iceDim: 'Flake Ice (ความชื้น ~25%) / Nugget Ice (-N)',
      dimensions: '560x600x800 (170) | 560x700x780 (300/480) | 762x700x780 (600/750/1000 mm)',
      weight: '55 - 145 KG (Nett)',
      ampStart: '3.2 - 11.8 A (ตรวจเช็กกระแส Gear Motor Amps ตามเนมเพลต)',
      watt: '460 - 2,250 W',
      refrigerant: 'R404A / R452A | High: 200-255 PSI | Low: 25-38 PSI',
      iceProd: '150 kg | 300 kg | 480 kg | 600 kg | 750 kg | 1,000 kg / 24h',
      waterCons: '1.00 - 1.12 L / 1 kg ice (ระบบสกรูรีดน้ำแข็งต่อเนื่อง 100%)',
      cycleTime: 'Continuous Auger Extrusion (Auto Flush & Cleaning)',
      operating: '1/220-240V 50Hz | Ambient 5°-40°C | Water 5°-35°C (0.05-0.8 MPa)'
    },
    {
      match: /^(HR|HF|HRF|HRW|HW)-/,
      series: 'Upright Reach-In Chiller & Freezer Series (HR / HF / HRF / HRW)',
      variants: ['HR-68MA-S', 'HF-68MA-S', 'HR-126MA-S', 'HF-126MA-S', 'HR-148MA-S'],
      iceDim: 'Chiller (HR): +1°C to +6°C | Freezer (HF): -18°C to -23°C',
      dimensions: '650-750(W) x 650-800(D) x 1950-2050(H) (2D) | 1200-1400(W) (4D) | 1800(W) mm (6D)',
      weight: '85 - 195 KG',
      ampStart: '1.8 - 5.8 A',
      watt: '210 - 780 W (Electric Defrost Heater ในรุ่น HF)',
      refrigerant: 'R134a (Chiller) / R404A (Freezer) / R290',
      iceProd: 'Chiller: +1°C ถึง +6°C | Freezer: -18°C ถึง -23°C',
      waterCons: 'ถาดระเหยน้ำทิ้งอัตโนมัติ (Evaporating Pan)',
      cycleTime: 'Defrost Cycle ทุก 6 - 8 ชม.',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient สูงสุด 38°-43°C'
    },
    {
      match: /^(RT|RTC|RTF|RTS|RW|RF|RR|RRF|RFT)-/,
      series: 'Undercounter Chiller & Freezer Series (RT / RTC / RTF / RTS / RW)',
      variants: ['RT-126MA-S', 'RT-156MA-S', 'RT-186MA-S', 'RTC-120SDB', 'RTC-150SDB'],
      iceDim: 'Chiller: +1°C to +6°C | Freezer: -18°C to -23°C',
      dimensions: '900 / 1200 / 1500 / 1800 / 2100(W) x 600-750(D) x 800-850(H) mm',
      weight: '68 - 145 KG',
      ampStart: '1.6 - 4.6 A',
      watt: '190 - 620 W',
      refrigerant: 'R134a / R404A / R290',
      iceProd: 'Chiller: +1°C ถึง +6°C | Freezer: -18°C ถึง -23°C',
      waterCons: 'ถาดระเหยน้ำทิ้งอัตโนมัติ (Evaporating Pan)',
      cycleTime: 'Defrost Cycle ทุก 6 - 8 ชม.',
      operating: '1/220-240V 50Hz (198V-254V) | Ambient สูงสุด 38°-43°C'
    },
    {
      match: /^DCM-|^DIM-|^AM-|^HNC-|^DBF-|^HSU-/,
      series: 'Specialty Equipment (Dispenser / Sushi Case / Beer Dispenser / Dishwasher)',
      variants: ['DCM-60KE', 'DCM-120KE', 'AM-50BAE', 'HNC-120BE', 'DBF-25SB'],
      iceDim: 'Cubelet / Top-Hat Cube / Sushi Display (+3°C) / Draft Beer',
      dimensions: 'ตรวจสอบขนาดกว้าง x ลึก x สูง ตามรุ่นย่อยใน Spec Sheet PDF',
      weight: '32 - 95 KG',
      ampStart: '1.4 - 4.5 A',
      watt: '170 - 650 W',
      refrigerant: 'R134a / R404A / R290',
      iceProd: 'DCM: 60-120 kg/24h | AM-50BAE: 51 kg/24h | HNC: +2°C ถึง +6°C',
      waterCons: 'ตามมาตรฐานรุ่นย่อยใน Spec Sheet PDF',
      cycleTime: 'อัตโนมัติตามเซ็นเซอร์ควบคุม',
      operating: '1/220-240V 50Hz (198V-254V)'
    }
  ];

  for (var i = 0; i < catalog.length; i++) {
    if (catalog[i].match.test(q)) {
      return catalog[i];
    }
  }
  return null;
}

function buildSpecSheetLineMessages_(modelQ, specFiles, pwaUrl) {
  var messages = [];
  var primaryFile = (specFiles && specFiles.length > 0) ? specFiles[0] : null;
  var structured = getStructuredHoshizakiModelSpec_(modelQ);

  // 1. ส่งรูปภาพ Spec Sheet คมชัดเต็มจอ (แตะขยายซูมใน LINE ได้ทันที)
  if (primaryFile && primaryFile.id) {
    var imgLarge = ensureDrivePdfPublicViewAndGetImageUrl_(primaryFile.id, 1600);
    var imgThumb = ensureDrivePdfPublicViewAndGetImageUrl_(primaryFile.id, 480);
    if (imgLarge && imgThumb) {
      messages.push({
        type: 'image',
        originalContentUrl: imgLarge,
        previewImageUrl: imgThumb
      });
    }
  }

  // 2. สร้างการ์ด Flex Message ตารางสเปก + ปุ่มเปิดไฟล์ PDF
  var bodyRows = [
    { type: 'text', text: structured ? structured.series : ('HOSHIZAKI MODEL: ' + modelQ), weight: 'bold', size: 'sm', color: '#002B49', wrap: true }
  ];

  if (structured) {
    var rowsData = [
      ['DIMENSIONS', structured.dimensions],
      ['WEIGHT', structured.weight],
      ['AMP / START', structured.ampStart],
      ['POWER', structured.watt],
      ['REFRIGERANT', structured.refrigerant],
      ['PRODUCTION', structured.iceProd],
      ['CYCLE TIME', structured.cycleTime],
      ['OPERATING', structured.operating]
    ];
    bodyRows.push({ type: 'separator', margin: 'sm' });
    rowsData.forEach(function(pair) {
      bodyRows.push({
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        margin: 'xs',
        contents: [
          { type: 'text', text: pair[0], size: 'xxs', weight: 'bold', color: '#0369A1', flex: 3, wrap: true },
          { type: 'text', text: pair[1], size: 'xxs', color: '#0F172A', flex: 7, wrap: true }
        ]
      });
    });
  } else {
    bodyRows.push({
      type: 'text',
      text: lookupHoshizakiModelSpecText(modelQ),
      size: 'xs',
      color: '#334155',
      wrap: true,
      margin: 'sm'
    });
  }

  var footerBtns = [];
  if (specFiles && specFiles.length > 0) {
    specFiles.slice(0, 3).forEach(function(f, idx) {
      footerBtns.push({
        type: 'button',
        style: idx === 0 ? 'primary' : 'secondary',
        color: idx === 0 ? '#005696' : undefined,
        height: 'sm',
        action: {
          type: 'uri',
          label: idx === 0 ? '📄 เปิด Spec Sheet PDF เต็มฉบับ' : ('📁 ' + String(f.name).substring(0, 26)),
          uri: f.url
        }
      });
    });
  }

  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    var deepUrl = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + 'specModel=' + encodeURIComponent(modelQ);
    footerBtns.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: { type: 'uri', label: '🖥️ เปิดดูสเปกเต็มจอใน Web App', uri: deepUrl }
    });
  }

  var bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#002B49',
      paddingAll: '12px',
      contents: [
        { type: 'text', text: '❄️ HOSHIZAKI SPECIFICATION SHEET', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
        { type: 'text', text: modelQ, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'xs' }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: bodyRows
    }
  };

  if (footerBtns.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '12px',
      contents: footerBtns
    };
  }

  messages.push({
    type: 'flex',
    altText: 'Spec Sheet รุ่น ' + modelQ + ' - HOSHIZAKI',
    contents: bubble
  });

  return messages;
}


// ============================================================================
// 4C. SMART KEYWORD INTENT ENGINE & TECHNICIAN HANDOFF ESCALATION (v191.2)
// รองรับการถามภาษาธรรมชาติ (Spec Sheet, Drawing, Service Manual, Parts List,
// Error Code, อาการเสียเบื้องต้น) และการส่งต่อให้ช่างเทคนิคตอบกลับแทนอัตโนมัติ
// ============================================================================

function searchTechnicalDocsFromSheet_(ss, modelQuery, categoryFilter) {
  var sheet = ss.getSheetByName('Technical_Documents_Library');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var q = String(modelQuery || '').trim().toUpperCase();
  var baseQ = normalizeModelBase(q);
  var cat = String(categoryFilter || 'ALL').toUpperCase();
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  var results = [];

  vals.forEach(function(r) {
    var rowCat = String(r[1] || '').toUpperCase();
    var rowModel = String(r[2] || '').toUpperCase();
    var rowTitle = String(r[3] || '');
    var rowUrl = String(r[4] || '').trim();
    var rowNotes = String(r[5] || '');
    if (!rowUrl) return;

    if (cat !== 'ALL' && rowCat !== cat) return;
    var hay = (rowModel + ' ' + rowTitle + ' ' + rowNotes).toUpperCase();
    if (!q || hay.indexOf(q) > -1 || (baseQ.length >= 3 && hay.indexOf(baseQ) > -1)) {
      results.push({
        id: String(r[0] || ''),
        name: '[' + rowCat + '] ' + (rowTitle || rowModel || 'เอกสารเทคนิค'),
        url: rowUrl,
        folder: 'Web App Technical Library (' + (rowModel || 'GENERAL') + ')'
      });
    }
  });
  return results;
}

function normalizeDateForSort_(dStr) {
  var s = String(dStr || '').trim();
  if (!s) return '0000-00-00';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    var yy = Number(m[3]) > 2400 ? String(Number(m[3]) - 543) : m[3];
    return yy + '-' + mm + '-' + dd;
  }
  return s;
}

function searchSerialInfoFromSheet_(ss, serialQuery) {
  var q = String(serialQuery || '').trim().toUpperCase();
  if (!q) return null;
  var foundList = [];
  var seenKey = {};

  var sheetNames = ['Serial_Database_Updates', 'Serial_Database_Master'];
  sheetNames.forEach(function(sName) {
    var sh = ss.getSheetByName(sName);
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var rowSn = String(vals[i][0] || '').trim().toUpperCase();
      var isDel = (sName === 'Serial_Database_Updates') ? Boolean(vals[i][7]) : false;
      if (rowSn && !isDel && (rowSn === q || (q.length >= 5 && rowSn.indexOf(q) > -1))) {
        var dedup = rowSn + '|' + String(vals[i][3] || '') + '|' + String(vals[i][4] || '') + '|' + String(vals[i][5] || '');
        if (!seenKey[dedup]) {
          seenKey[dedup] = true;
          foundList.push({
            serial: rowSn,
            productType: String(vals[i][1] || '-').trim() || '-',
            model: String(vals[i][2] || '-').trim() || '-',
            dateOut: String(vals[i][3] || '-').trim() || '-',
            invoiceNo: String(vals[i][4] || '-').trim() || '-',
            customer: String(vals[i][5] || '-').trim() || '-',
            poNo: String(vals[i][6] || '-').trim() || '-',
            sortDate: normalizeDateForSort_(vals[i][3])
          });
        }
      }
    }
  });

  foundList.sort(function(a, b) {
    return b.sortDate.localeCompare(a.sortDate);
  });

  if (foundList.length === 0) return null;
  var primary = foundList[0];
  primary.allSalesRecords = foundList;
  return primary;
}

function buildSerial360Dossier_(ss, serialQuery) {
  var q = String(serialQuery || '').trim().toUpperCase();
  var salesMeta = searchSerialInfoFromSheet_(ss, q);

  // 1. ค้นหาประวัติ Service Jobs ทั้งหมดของ S/N นี้ (เรียงจากวันที่ใหม่ไปเก่า)
  var allJobs = readRecentJobsFromSheet(ss, 3000);
  var jobMatches = allJobs.filter(function(j) {
    var jSn = String(j.serial || '').trim().toUpperCase();
    return jSn && (jSn === q || (q.length >= 5 && jSn.indexOf(q) > -1));
  }).map(function(j) {
    j.sortDate = normalizeDateForSort_(j.date);
    return j;
  });
  jobMatches.sort(function(a, b) {
    if (b.sortDate !== a.sortDate) return b.sortDate.localeCompare(a.sortDate);
    return String(b.jobNo || '').localeCompare(String(a.jobNo || ''));
  });

  // 2. ค้นหาประวัติใบเสนอราคาทั้งหมดของ S/N นี้จากทั้งชีต Quotations และ Quotation_Archive_Master (เรียงใหม่ไปเก่า)
  var qtMatches = [];
  var seenQt = {};

  var liveQtSheet = ss.getSheetByName('Quotations');
  if (liveQtSheet && liveQtSheet.getLastRow() >= 2) {
    var qVals = liveQtSheet.getRange(2, 1, liveQtSheet.getLastRow() - 1, 18).getValues();
    for (var i = qVals.length - 1; i >= 0; i--) {
      var qSn = String(qVals[i][9] || '').trim().toUpperCase();
      if (qSn && (qSn === q || (q.length >= 5 && qSn.indexOf(q) > -1))) {
        var offerId = String(qVals[i][0] || '').trim();
        var key = offerId + '|' + String(qVals[i][3] || '') + '|' + String(qVals[i][4] || '');
        if (!seenQt[key]) {
          seenQt[key] = true;
          qtMatches.push({
            offerNo: offerId || '-',
            docType: String(qVals[i][1] || 'QUOTATION'),
            date: String(qVals[i][3] || '-'),
            sortDate: normalizeDateForSort_(qVals[i][3]),
            customer: String(qVals[i][4] || '-'),
            contact: String(qVals[i][6] || ''),
            model: String(qVals[i][8] || '-'),
            serial: qSn,
            itemsSummary: String(qVals[i][11] || '-'),
            grandTotal: Number(qVals[i][15] || 0)
          });
        }
      }
    }
  }

  var archQtSheet = ss.getSheetByName('Quotation_Archive_Master');
  if (archQtSheet && archQtSheet.getLastRow() >= 2) {
    var aVals = archQtSheet.getRange(2, 1, archQtSheet.getLastRow() - 1, 8).getValues();
    for (var k = aVals.length - 1; k >= 0; k--) {
      var aSn = String(aVals[k][0] || '').trim().toUpperCase();
      if (aSn && (aSn === q || (q.length >= 5 && aSn.indexOf(q) > -1))) {
        var aOffer = String(aVals[k][2] || '').trim();
        var aKey = aOffer + '|' + String(aVals[k][1] || '') + '|' + String(aVals[k][3] || '');
        if (!seenQt[aKey]) {
          seenQt[aKey] = true;
          qtMatches.push({
            offerNo: aOffer || '-',
            docType: 'QUOTATION (ARCHIVE)',
            date: String(aVals[k][1] || '-'),
            sortDate: normalizeDateForSort_(aVals[k][1]),
            customer: String(aVals[k][3] || '-'),
            contact: '',
            model: String(aVals[k][4] || '-'),
            serial: aSn,
            itemsSummary: String(aVals[k][6] || aVals[k][5] || '-'),
            grandTotal: Number(aVals[k][7] || 0)
          });
        }
      }
    }
  }

  qtMatches.sort(function(a, b) {
    if (b.sortDate !== a.sortDate) return b.sortDate.localeCompare(a.sortDate);
    return String(b.offerNo || '').localeCompare(String(a.offerNo || ''));
  });

  // รวบรวม Model เครื่อง และรายชื่อลูกค้าทั้งหมดที่เคยเกี่ยวข้องกับ S/N นี้
  var detectedModel = (salesMeta && salesMeta.model && salesMeta.model !== '-') ? salesMeta.model :
    ((jobMatches[0] && jobMatches[0].model) ? jobMatches[0].model :
    ((qtMatches[0] && qtMatches[0].model) ? qtMatches[0].model : '-'));

  var customerSet = {};
  var customersList = [];
  function addCust(cName, sourceLabel, dtLabel) {
    var cleanC = String(cName || '').trim();
    if (!cleanC || cleanC === '-') return;
    var cKey = cleanC.toUpperCase();
    if (!customerSet[cKey]) {
      customerSet[cKey] = true;
      customersList.push({ name: cleanC, source: sourceLabel, date: dtLabel || '-' });
    }
  }
  if (salesMeta && Array.isArray(salesMeta.allSalesRecords)) {
    salesMeta.allSalesRecords.forEach(function(sr) { addCust(sr.customer, 'ข้อมูลซื้อขาย', sr.dateOut); });
  }
  jobMatches.forEach(function(jm) { addCust(jm.store, 'ใบงานซ่อม', jm.date); });
  qtMatches.forEach(function(qm) { addCust(qm.customer, 'ใบเสนอราคา', qm.date); });

  var legacyMatches = getLegacyServiceHistoryFromSheet_(ss, q, 3000);

  var outDossier = {
    serial: q,
    model: detectedModel,
    legacyJobs: legacyMatches,
    productType: (salesMeta && salesMeta.productType) ? salesMeta.productType : '-',
    salesMeta: salesMeta,
    customersList: customersList,
    jobs: jobMatches,
    quotations: qtMatches
  };
  outDossier.smartHealth = evaluateMachineSmartHealth_(outDossier);
  return outDossier;
}

function buildSerial360FlexMessage_(dossier, pwaUrl) {
  var sn = dossier.serial || '-';
  var model = dossier.model || '-';
  var sales = dossier.salesMeta;
  var jobs = dossier.jobs || [];
  var qts = dossier.quotations || [];
  var custs = dossier.customersList || [];

  var bodyContents = [];

  var health = dossier.smartHealth || evaluateMachineSmartHealth_(dossier);

  // 0. Smart Machine Health, Auto-Warranty & Repeat-Failure Alert
  var smartBoxContents = [
    { type: 'text', text: '🧠 SMART MACHINE HEALTH & WARRANTY', weight: 'bold', size: 'xs', color: '#002B49' },
    { type: 'text', text: health.warrantyStatus, size: 'xxs', weight: 'bold', color: health.warrantyColor || '#065F46', wrap: true, margin: 'xs' }
  ];
  if (health.repeatAlert) {
    smartBoxContents.push({
      type: 'text',
      text: health.repeatAlert,
      size: 'xxs',
      weight: 'bold',
      color: '#B91C1C',
      wrap: true,
      margin: 'xs'
    });
  }
  if (health.replaceAdvice) {
    smartBoxContents.push({
      type: 'text',
      text: health.replaceAdvice,
      size: 'xxs',
      color: '#92400E',
      wrap: true,
      margin: 'xs'
    });
  }
  if (health.recommendedParts && health.recommendedParts.length > 0) {
    smartBoxContents.push({
      type: 'text',
      text: '🧰 อะไหล่แนะนำติดรถรุ่นนี้: ' + health.recommendedParts.slice(0, 3).join(', '),
      size: 'xxs',
      color: '#0369A1',
      wrap: true,
      margin: 'xs'
    });
  }
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    margin: 'none',
    backgroundColor: health.repeatAlert ? '#FEF2F2' : '#F0FDF4',
    cornerRadius: '8px',
    paddingAll: '10px',
    contents: smartBoxContents
  });

  // 1. ข้อมูลการซื้อขาย / วันที่ขายเครื่อง
  var salesLines = [];
  if (sales) {
    if (sales.productType && sales.productType !== '-') salesLines.push('• ประเภท: ' + sales.productType);
    salesLines.push('• วันที่ขาย/ส่งออก: ' + (sales.dateOut || '-'));
    if (sales.invoiceNo && sales.invoiceNo !== '-') salesLines.push('• เลขที่บิลขาย (Inv): ' + sales.invoiceNo);
    if (sales.poNo && sales.poNo !== '-') salesLines.push('• เลขที่สั่งซื้อ (PO): ' + sales.poNo);
    if (sales.customer && sales.customer !== '-') salesLines.push('• ผู้ซื้อในระบบขาย: ' + sales.customer);
  } else {
    salesLines.push('• ยังไม่พบข้อมูลบิลขายในฐานข้อมูล Cloud');
  }

  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    margin: 'sm',
    backgroundColor: '#F0F9FF',
    cornerRadius: '8px',
    paddingAll: '10px',
    contents: [
      { type: 'text', text: '🏷️ ข้อมูลเครื่อง & ประวัติการซื้อขาย', weight: 'bold', size: 'xs', color: '#002B49' },
      { type: 'text', text: salesLines.join('\n'), size: 'xxs', color: '#1E293B', wrap: true, margin: 'xs' }
    ]
  });

  // 2. รายชื่อลูกค้าทั้งหมดที่เกี่ยวข้อง (กรณีมีหลายเจ้า/ย้ายร้าน)
  if (custs.length > 0) {
    var custText = custs.slice(0, 6).map(function(c, idx) {
      return (idx + 1) + '. ' + c.name + ' (' + c.source + (c.date && c.date !== '-' ? ' • ' + c.date : '') + ')';
    }).join('\n');
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'sm',
      backgroundColor: '#F8FAFC',
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: '🏢 ประวัติลูกค้าที่ครอบครอง/แจ้งบริการ (' + custs.length + ' ราย)', weight: 'bold', size: 'xs', color: '#0369A1' },
        { type: 'text', text: custText, size: 'xxs', color: '#334155', wrap: true, margin: 'xs' }
      ]
    });
  }

  // 3. ประวัติใบแจ้งบริการ / ตรวจเช็ก (Service Jobs — เรียงใหม่ไปเก่า)
  bodyContents.push({
    type: 'text',
    text: '🔧 ประวัติใบ Service Job & ตรวจเช็ก (' + jobs.length + ' ใบ — ใหม่ไปเก่า)',
    weight: 'bold',
    size: 'xs',
    color: '#065F46',
    margin: 'md'
  });

  if (jobs.length === 0) {
    bodyContents.push({
      type: 'text',
      text: '• ยังไม่พบประวัติใบ Service Job ในระบบ',
      size: 'xxs',
      color: '#64748B',
      margin: 'xs'
    });
  } else {
    jobs.slice(0, 4).forEach(function(j) {
      var stIcon = j.jobStatus === 'Completed' ? '✅' : (j.jobStatus === 'Waiting Parts' ? '📦' : '⏳');
      var jobBox = {
        type: 'box',
        layout: 'vertical',
        margin: 'xs',
        backgroundColor: '#ECFDF5',
        cornerRadius: '8px',
        paddingAll: '9px',
        contents: [
          { type: 'text', text: '📅 ' + (j.date || '-') + ' | ' + stIcon + ' ' + (j.jobNo || '-'), weight: 'bold', size: 'xs', color: '#065F46', wrap: true },
          { type: 'text', text: '🏪 ลูกค้า: ' + (j.store || '-'), size: 'xxs', color: '#0F172A', weight: 'bold', wrap: true, margin: 'xs' },
          { type: 'text', text: '🔍 อาการ/ตรวจเช็ก: ' + (j.diagSymptom || '-'), size: 'xxs', color: '#334155', wrap: true },
          { type: 'text', text: '🛠️ แก้ไข/อะไหล่: ' + (j.diagAction || '-') + (j.partsSummary ? ' | อะไหล่: ' + j.partsSummary : ''), size: 'xxs', color: '#334155', wrap: true },
          { type: 'text', text: '👨‍🔧 ช่าง: ' + (j.responsibleTech || '-') + ' | ยอด: ' + formatCurrency(j.grandTotal) + ' THB', size: 'xxs', color: '#475569', margin: 'xs' }
        ]
      };
      if (j.pdfBackupUrl && String(j.pdfBackupUrl).indexOf('http') === 0) {
        jobBox.contents.push({
          type: 'button',
          style: 'primary',
          color: '#065F46',
          height: 'sm',
          margin: 'xs',
          action: { type: 'uri', label: '📄 เปิดใบงาน PDF (' + (j.date || '') + ')', uri: String(j.pdfBackupUrl) }
        });
      }
      bodyContents.push(jobBox);
    });
  }

  // 4. ประวัติใบเสนอราคา (Quotations — เรียงใหม่ไปเก่า)
  bodyContents.push({
    type: 'text',
    text: '📑 ประวัติใบเสนอราคา / Quotations (' + qts.length + ' ใบ — ใหม่ไปเก่า)',
    weight: 'bold',
    size: 'xs',
    color: '#B45309',
    margin: 'md'
  });

  if (qts.length === 0) {
    bodyContents.push({
      type: 'text',
      text: '• ยังไม่พบประวัติใบเสนอราคาสำหรับ S/N นี้',
      size: 'xxs',
      color: '#64748B',
      margin: 'xs'
    });
  } else {
    qts.slice(0, 4).forEach(function(qItem) {
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'xs',
        backgroundColor: '#FFFBEB',
        cornerRadius: '8px',
        paddingAll: '9px',
        contents: [
          { type: 'text', text: '📅 ' + (qItem.date || '-') + ' | 📄 ' + (qItem.offerNo || '-'), weight: 'bold', size: 'xs', color: '#92400E', wrap: true },
          { type: 'text', text: '🏢 ลูกค้า: ' + (qItem.customer || '-'), size: 'xxs', color: '#0F172A', weight: 'bold', wrap: true, margin: 'xs' },
          { type: 'text', text: '🔩 รายการ: ' + String(qItem.itemsSummary || '-').substring(0, 160), size: 'xxs', color: '#334155', wrap: true },
          { type: 'text', text: '💰 ยอดสุทธิ: ' + formatCurrency(qItem.grandTotal) + ' THB', size: 'xxs', weight: 'bold', color: '#B45309', margin: 'xs' }
        ]
      });
    });
  }

  var bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#002B49',
      paddingAll: '12px',
      contents: [
        { type: 'text', text: '❄️ HOSHIZAKI SERIAL 360° DOSSIER', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
        { type: 'text', text: 'S/N: ' + sn, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'xs' },
        { type: 'text', text: 'รุ่นเครื่อง (Model): ' + model, color: '#BAE6FD', size: 'xs', weight: 'bold', margin: 'xs', wrap: true }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: bodyContents
    }
  };

  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    var fullSnUrl = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + 'snFullScreen=' + encodeURIComponent(sn);
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{
        type: 'button',
        style: 'primary',
        color: '#005696',
        height: 'sm',
        action: { type: 'uri', label: '🖥️ แสดงผลเต็มหน้าจอ (Full Screen)', uri: fullSnUrl }
      }]
    };
  }

  return {
    type: 'flex',
    altText: 'ข้อมูลเครื่อง S/N: ' + sn + ' (' + model + ') | งานซ่อม ' + jobs.length + ' ใบ | ใบเสนอราคา ' + qts.length + ' ใบ',
    contents: bubble
  };
}

function matchComprehensiveHoshizakiProductFaq_(rawText, lang) {
  var t = String(rawText || '').toLowerCase();
  var isEn = (lang === 'EN');
  var isJp = (lang === 'JP');

  // 1. Cube Ice Makers (IM Series: IM-21CNE to IM-240DNE)
  if (/(เครื่องทำน้ำแข็งก้อน|น้ำแข็งสี่เหลี่ยม|น้ำแข็งยูนิต|cube ice|เครื่องทำน้ำแข็ง\s*im|รุ่น\s*im|im-21|im-30|im-45|im-65|im-100|im-130|im-240|\bim\s*series|\bim\b)/i.test(t) && !/(เสีย|ซ่อม|ไม่ทำ|ไม่ผลิต|error|รั่ว|ดัง)/i.test(t)) {
    return {
      badge: '🧊 PRODUCT SPEC & GUIDE · IM SERIES',
      title: 'เครื่องทำน้ำแข็งก้อนสี่เหลี่ยม (Cube Ice Maker — IM Series)',
      body: '• รุ่นมาตรฐาน: IM-21CNE (21 กก.), IM-30CNE (30 กก.), IM-45NE (45 กก.), IM-65NE (65 กก.), IM-100NE (100 กก.), IM-130NE (130 กก.) และรุ่นหัวแยก IM-240DNE (240 กก./วัน)\n' +
            '• จุดเด่น: ระบบฉีดน้ำเซลล์ปิด (Closed-Cell) ได้ก้อนน้ำแข็งใสบริสุทธิ์ ละลายช้า ปลอดเชื้อ 100% พร้อมตัวเลือกขนาดก้อน -21 (เล็ก), -23 (กลาง) และมาตรฐาน 28x28x32 มม.\n' +
            '• สเปกติดตั้ง: ไฟ 1 เฟส 220-240V 50Hz | แรงดันน้ำ 0.07-0.8 MPa | ควรติดตั้งคู่กับไส้กรองน้ำ 4HC-H',
      actionLabel: '📄 ขอสเปกชีต / ติดต่อตัวแทนจำหน่าย',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สนใจข้อมูลสเปก/ราคาเครื่องทำน้ำแข็ง IM Series')
    };
  }

  // 2. Crescent Cube Ice Makers (KM / KMD Series)
  if (/(น้ำแข็งเสี้ยวพระจันทร์|เสี้ยวพระจันทร์|crescent|เครื่องทำน้ำแข็ง\s*km|รุ่น\s*km|km-40|km-60|km-80|km-100|km-150|km-231|km-515|km-660|km-901|km-1301|kmd|\bkm\s*series|\bkm\b)/i.test(t) && !/(เสีย|ซ่อม|ไม่ทำ|ไม่ผลิต|error|รั่ว|ดัง)/i.test(t)) {
    return {
      badge: '🌙 PRODUCT SPEC & GUIDE · KM / KMD SERIES',
      title: 'เครื่องทำน้ำแข็งเสี้ยวพระจันทร์ (Crescent Cube — KM Series)',
      body: '• รุ่นมาตรฐาน: แบบถังในตัว KM-40B / 60B / 80B / 100B / 150B และรุ่นหัวแยกกำลังผลิตสูง KM-231BAJ / 515MAH / 660MAJ / 901MAJ / 1301SAJ (215 - 1,100+ กก./วัน)\n' +
            '• จุดเด่น: คอยล์เย็นสเตนเลส 2 ด้าน (CycleSaver™) ประหยัดน้ำและไฟสูงสุด ก้อนทรงเสี้ยวพระจันทร์ตักง่ายไม่เกาะติดกัน มีระบบแจ้งเตือนอัจฉริยะ EverCheck™',
      actionLabel: '📄 ขอสเปกชีต / ติดต่อตัวแทนจำหน่าย',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สนใจข้อมูลสเปก/ราคาเครื่องทำน้ำแข็ง KM Series')
    };
  }

  // 3. Flake & Nugget Ice Makers (FM Series)
  if (/(เกล็ดน้ำแข็ง|น้ำแข็งเกล็ด|นักเก็ต|flake|nugget|เครื่องทำน้ำแข็ง\s*fm|รุ่น\s*fm|fm-80|fm-120|fm-150|fm-170|fm-300|fm-480|fm-600|fm-750|fm-1000|\bfm\s*series|\bfm\b)/i.test(t) && !/(เสีย|ซ่อม|ไม่ทำ|ไม่ผลิต|error|รั่ว|ดัง)/i.test(t)) {
    return {
      badge: '❄️ PRODUCT SPEC & GUIDE · FM SERIES',
      title: 'เครื่องทำเกล็ดน้ำแข็ง & นักเก็ต (Flake / Nugget Ice — FM Series)',
      body: '• รุ่นมาตรฐาน: FM-80KE, FM-150KE, FM-170AKE, FM-300AKE, FM-480AKE, FM-600AKE, FM-750AKE, FM-1000AKE (80 - 1,000+ กก./วัน)\n' +
            '• จุดเด่น: ระบบสกรูรีดน้ำแข็งต่อเนื่อง (Auger System) ใช้น้ำ 1 ลิตรได้น้ำแข็ง 1 กก. (ประหยัดน้ำสูงสุด) เหมาะสำหรับร้านกาแฟ สมูทตี้ ซูเปอร์มาร์เก็ต แช่อาหารทะเล และโรงพยาบาล',
      actionLabel: '📄 ขอสเปกชีต / ติดต่อตัวแทนจำหน่าย',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สนใจข้อมูลสเปก/ราคาเครื่องทำเกล็ดน้ำแข็ง FM Series')
    };
  }

  // 4. Commercial Refrigerators & Freezers (HR / HF / RT / RTC / RTF / HNC)
  if (/(ตู้แช่|ตู้เย็น|ตู้เคาน์เตอร์|ตู้ซูชิ|chiller|freezer|undercounter|sushi|hr-|hf-|rt-|rtc-|rtf-|hnc-)/i.test(t) && !/(เสีย|ซ่อม|ไม่เย็น|อุณหภูมิ|error|รั่ว|ดัง)/i.test(t)) {
    return {
      badge: '🧊 COMMERCIAL REFRIGERATION · HR / HF / RT / HNC',
      title: 'ตู้แช่เย็น ตู้แช่แข็ง ตู้เคาน์เตอร์ และตู้ซูชิ HOSHIZAKI',
      body: '• ตู้แช่ทรงยืน (Upright): HR-68MA-S / 126MA-S / 148MA-S (แช่เย็น +1°C ถึง +6°C) และ HF Series (แช่แข็ง -18°C ถึง -23°C)\n' +
            '• ตู้เคาน์เตอร์เตรียมอาหาร (Undercounter): RT-126MA-S / 156MA-S / 186MA-S และ RTC/RTF Series\n' +
            '• ตู้โชว์ซูชิ (Sushi Case): HNC-120BE / 150BE / 180BE / 210BE รักษาความชื้นวัตถุดิบไม่ให้แห้ง',
      actionLabel: '📄 ขอสเปกชีต / ติดต่อตัวแทนจำหน่าย',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สนใจข้อมูลตู้แช่เชิงพาณิชย์ HOSHIZAKI')
    };
  }

  // 5. Commercial Dishwashers & Beer Dispensers (HSU / JWE / DBF / DCM)
  if (/(เครื่องล้างจาน|ตู้กดเบียร์|กดน้ำแข็ง|dishwasher|beer|dispenser|hsu-|jwe-|dbf-|dcm-)/i.test(t) && !/(เสีย|ซ่อม|ไม่สะอาด|ไม่ร้อน|error|รั่ว)/i.test(t)) {
    return {
      badge: '🍽️ SPECIALTY EQUIPMENT · HSU / JWE / DBF / DCM',
      title: 'เครื่องล้างจาน ตู้กดน้ำแข็งอัตโนมัติ และเครื่องจ่ายเบียร์สด',
      body: '• เครื่องล้างจานเชิงพาณิชย์: รุ่นใต้เคาน์เตอร์ HSU-400 / 500 และรุ่นเปิดฝาบน Hood-Type JWE-400 / 450 / 500 / 620 / 680 ล้างสะอาดฆ่าเชื้อที่อุณหภูมิน้ำล้างสุดท้าย 80-85°C\n' +
            '• เครื่องจ่ายน้ำแข็งและน้ำดื่ม (DCM-60KE / 120KE) และเครื่องจ่ายเบียร์สด (DBF-25SB / 43WD)',
      actionLabel: '📄 ขอสเปกชีต / ติดต่อตัวแทนจำหน่าย',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สนใจข้อมูลเครื่องล้างจาน / เครื่องจ่ายเบียร์ / DCM')
    };
  }

  // 6. Water Filter 4HC-H & Genuine Spare Parts
  if (/(ไส้กรอง|กรองน้ำ|4hc|water filter|เปลี่ยนไส้กรอง|สั่งไส้กรอง|อะไหล่แท้|spare part)/i.test(t)) {
    return {
      badge: '💧 GENUINE FILTER & SPARE PARTS · 4HC-H',
      title: 'ไส้กรองน้ำแท้ HOSHIZAKI (รุ่น 4HC-H) & อะไหล่มาตรฐานโรงงาน',
      body: '• รุ่นแนะนำ: ไส้กรองน้ำแท้ HOSHIZAKI 4HC-H (รหัส EV965516) ช่วยกรองตะกอน คลอรีน กลิ่น และยับยั้งตะกรันหินปูน ยืดอายุวาล์วน้ำและคอยล์เย็น\n' +
            '• รอบเปลี่ยนมาตรฐาน: แนะนำเปลี่ยนทุกๆ 6 เดือน หรือเมื่อแรงดันน้ำลดลง\n' +
            '• วิธีสั่งซื้อ: พิมพ์ Serial Number (S/N) ของเครื่อง หรือกดปุ่มด้านล่างเพื่อให้ตัวแทนจำหน่าย/ฝ่ายอะไหล่ติดต่อกลับทันทีครับ',
      actionLabel: '💧 สั่งซื้อไส้กรองน้ำ / อะไหล่แท้',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สั่งซื้อไส้กรองน้ำ 4HC-H / อะไหล่แท้ HOSHIZAKI')
    };
  }

  // 7. Preventive Maintenance (PM) & Big Cleaning Packages
  if (/(ล้างเครื่อง|บำรุงรักษา|ล้างใหญ่|pm\b|big cleaning|สัญญาบริการ|รายปี|ค่าล้าง)/i.test(t)) {
    return {
      badge: '🧼 PREVENTIVE MAINTENANCE & BIG CLEANING',
      title: 'บริการล้างบำรุงรักษาใหญ่ (PM & Big Cleaning) มาตรฐานโรงงาน',
      body: '• รายการตรวจเช็ก 12 ขั้นตอน: ถอดล้างถาดน้ำ ปั๊มน้ำ ลูกลอย ล้างฆ่าเชื้อระบบผลิตน้ำแข็ง ล้างแผงคอยล์ร้อน วัดแรงดันน้ำยา กระแสคอมเพรสเซอร์ และออกใบรับรองมาตรฐาน (PM Certificate)\n' +
            '• แพ็กเกจบริการ: มีทั้งแบบรายครั้ง (1-Time), สัญญา 6 เดือน (2 ครั้ง) และสัญญารายปี (4 ครั้ง ทุก 3 เดือน)\n' +
            '• เพียงพิมพ์ Serial Number (S/N) หน้าเครื่อง ระบบจะประเมินราคาและจัดส่งผู้ดูแลให้ทันทีครับ',
      actionLabel: '🧼 ขอราคาแพ็กเกจล้างเครื่อง PM',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('ขอใบเสนอราคาแพ็กเกจล้างเครื่อง PM / Big Cleaning')
    };
  }

  // 8. Warranty Policy & Dealer / Purchase Inquiry
  if (/(รับประกัน|ประกันกี่ปี|หมดประกัน|ตัวแทนจำหน่าย|ดีลเลอร์|ซื้อเครื่อง|ขอใบเสนอราคา|ราคาเครื่อง|warranty|dealer|buy|quote)/i.test(t)) {
    return {
      badge: '🛡️ WARRANTY & AUTHORIZED DEALER NETWORK',
      title: 'นโยบายการรับประกัน & ช่องทางจัดจำหน่ายอย่างเป็นทางการ',
      body: '• การรับประกันมาตรฐาน: รับประกันอะไหล่และค่าแรง 1 ปีเต็ม และรับประกันคอมเพรสเซอร์สูงสุด 2 ปี (ตามเงื่อนไขรุ่นสินค้าและการติดตั้งที่ได้มาตรฐาน)\n' +
            '• ช่องทางจัดจำหน่าย: ผลิตภัณฑ์ HOSHIZAKI จัดจำหน่ายผ่านเครือข่ายตัวแทนจำหน่ายที่ได้รับการแต่งตั้งอย่างเป็นทางการทั่วประเทศ\n' +
            '• เช็กประกันเครื่องเดิม: เพียงพิมพ์ Serial Number (S/N) 7 หลัก (เช่น H14289J) ระบบจะตรวจสอบวันที่ซื้อและตัวแทนที่ดูแลให้อัตโนมัติครับ',
      actionLabel: '🏢 ติดต่อตัวแทนจำหน่าย / ฝ่ายบริการ',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สอบถามการรับประกัน / ติดต่อตัวแทนจำหน่าย')
    };
  }

  // 9. Installation Site Preparation Requirements
  if (/(ติดตั้ง|เตรียมพื้นที่|ขนาดท่อ|เบรกเกอร์|แรงดันน้ำ|ระบายอากาศ|installation|site prep)/i.test(t)) {
    return {
      badge: '📐 INSTALLATION & SITE PREPARATION GUIDE',
      title: 'ข้อกำหนดการเตรียมหน้างานก่อนติดตั้งเครื่อง HOSHIZAKI',
      body: '1. ระบบไฟฟ้า: เบรกเกอร์แยกเฉพาะเครื่อง 220-240V 50Hz พร้อมสายดิน (Ground) ที่ได้มาตรฐาน\n' +
            '2. ระบบน้ำประปา: วาล์วน้ำดีเกลียวนอก 1/2 นิ้ว แรงดันน้ำ 0.07 - 0.8 MPa (1 - 8 บาร์) ควรติดตั้งร่วมกับไส้กรองน้ำ\n' +
            '3. ระบบน้ำทิ้ง: ท่อน้ำทิ้งขนาด 3/4 นิ้ว ระดับต่ำกว่าจุดระบายน้ำหลังเครื่องและมีความลาดเอียงลงท่อระบาย\n' +
            '4. การระบายความร้อน: เว้นระยะห่างด้านข้างและด้านหลังอย่างน้อย 15-30 ซม. และอุณหภูมิห้องไม่เกิน 38-40°C',
      actionLabel: '👷 นัดช่างตรวจสอบหน้างาน / ติดตั้ง',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('สอบถามการเตรียมหน้างานและนัดติดตั้งเครื่อง')
    };
  }

  // 10. Greeting / Menu Overview
  if (/^(สวัสดี|หวัดดี|ทักทาย|สอบถาม|ข้อมูล|สินค้า|เมนู|help|hi|hello|menu|こんにちは)/i.test(t)) {
    return {
      badge: '🐧 HOSHIZAKI (THAILAND) SMART ASSISTANT',
      title: 'ยินดีต้อนรับสู่ศูนย์บริการและข้อมูลผลิตภัณฑ์ HOSHIZAKI',
      body: 'คุณสามารถพิมพ์สอบถามได้ทันทีทุกเรื่อง เช่น:\n' +
            '• ข้อมูลสินค้า & สเปก: "เครื่องทำน้ำแข็ง IM", "เครื่องทำน้ำแข็ง KM", "เกล็ดน้ำแข็ง FM", "ตู้แช่ HR/HF", "เครื่องล้างจาน"\n' +
            '• แจ้งซ่อม & ตรวจเช็กเบื้องต้น: "น้ำแข็งไม่ผลิต", "ตู้แช่ไม่เย็น", "น้ำรั่ว", "ขึ้น Error E1"\n' +
            '• เช็กประกัน & เรียกช่าง: พิมพ์ Serial Number (S/N) หน้าเครื่อง เช่น H14289J\n' +
            '• สั่งไส้กรองน้ำ 4HC-H / นัดล้างใหญ่ PM / ลงทะเบียน 08x-xxx-xxxx',
      actionLabel: '🔧 แจ้งซ่อม / ติดต่อตัวแทนจำหน่าย',
      actionData: 'ESCALATE_TO_DEALER:NO_SN:' + encodeURIComponent('ต้องการติดต่อเจ้าหน้าที่ / แจ้งซ่อม')
    };
  }

  return null;
}

function diagnoseSymptomGuide_(rawText) {
  var t = String(rawText || '').toLowerCase();
  var guides = [
    {
      match: /(ไม่ทำน้ำแข็ง|น้ำแข็งไม่ผลิต|น้ำแข็งไม่ออก|ไม่ผลิตน้ำแข็ง|น้ำแข็งบาง|น้ำแข็งเล็ก|ละลายเร็ว|น้ำไม่เข้า|น้ำไม่ไหล|no ice|not making ice|thin ice|water)/,
      title: '❄️ แนวทางตรวจเช็กเบื้องต้น: เครื่องไม่ผลิตน้ำแข็ง / น้ำไม่เข้า / ก้อนบาง',
      steps: [
        '1. ตรวจสอบวาล์วน้ำประปาหลักและวาล์วหลังเครื่องว่าเปิดสุด และมีน้ำไหลเข้าถังพักปกติหรือไม่',
        '2. ตรวจสอบไส้กรองน้ำ (Water Filter 4HC-H) หากใช้งานเกิน 6 เดือนหรือแรงดันน้ำตกให้ลองเปลี่ยนไส้กรองใหม่',
        '3. ตรวจสอบแผ่นกรองฝุ่นด้านหน้า/ด้านข้าง (Air Filter) หากมีฝุ่นอุดตันให้ถอดล้างด้วยน้ำสะอาดและเป่าให้แห้ง',
        '4. ปิดสวิตช์ที่ตัวเครื่องหรือเบรกเกอร์ทิ้งไว้ 3 นาที แล้วเปิดใหม่เพื่อรีเซ็ตระบบควบคุม (หากยังไม่ผลิตน้ำแข็ง กรุณาพิมพ์ S/N 7 หลักบนสติกเกอร์ข้างเครื่องส่งกลับมาครับ)'
      ]
    },
    {
      match: /(ไม่เย็น|ความเย็นไม่ถึง|อุณหภูมิสูง|ละลาย|น้ำแข็งเกาะ|not cooling|warm|defrost)/,
      title: '🧊 แนวทางตรวจเช็กเบื้องต้น: ตู้แช่ไม่เย็น / อุณหภูมิสูงกว่าปกติ',
      steps: [
        '1. ตรวจสอบการตั้งค่าอุณหภูมิที่หน้าปัด Digital Controller และเช็กว่าประตูตู้ปิดสนิท ยางขอบประตูไม่ฉีกขาด',
        '2. ตรวจสอบระยะห่างรอบตู้แช่ (ควรเว้นห่างผนังอย่างน้อย 15 ซม.) และล้างแผ่นกรองฝุ่นคอนเดนเซอร์',
        '3. สังเกตพัดลมภายในตู้แช่ว่ายังหมุนปกติ และไม่มีน้ำแข็งเกาะหนาแน่นที่แผงคอยล์เย็น',
        '4. ห้ามนำอาหารร้อนจัดเข้าแช่ทันที หรือวางของบังช่องลมเป่าความเย็นภายในตู้'
      ]
    },
    {
      match: /(น้ำรั่ว|น้ำหยด|น้ำล้น|ท่อตัน|leak|overflow|drain)/,
      title: '💧 แนวทางตรวจเช็กเบื้องต้น: น้ำรั่วซึม / น้ำล้นถัง / น้ำทิ้งไม่ระบาย',
      steps: [
        '1. ตรวจสอบท่อน้ำทิ้ง (Drain Hose) ด้านหลังเครื่องว่าไม่พับงอ ไม่อุดตัน และมีความลาดเอียงลงท่อระบาย',
        '2. ตรวจสอบระดับน้ำในถังพักน้ำ (Water Tank) และลูกลอยว่าไม่ค้าง',
        '3. ตรวจสอบจุดต่อสายน้ำเข้าด้านหลังเครื่องว่าขันแน่นและซีลยางไม่เสื่อมสภาพ'
      ]
    },
    {
      match: /(เสียงดัง|สั่น|เบรกเกอร์ตัด|ไฟไม่เข้า|เปิดไม่ติด|noise|power|trip)/,
      title: '⚡ แนวทางตรวจเช็กเบื้องต้น: เครื่องไม่ติด / ไฟไม่เข้า / มีเสียงดังผิดปกติ',
      steps: [
        '1. ตรวจสอบปลั๊กไฟและเบรกเกอร์หลักของร้านว่าอยู่ในตำแหน่ง ON (แรงดันไฟมาตรฐาน 220-240V)',
        '2. ตรวจสอบพื้นตั้งเครื่องว่าได้ระดับไม่เอียง และไม่มีสิ่งของวางพิงตัวเครื่องจนเกิดเสียงสั่น',
        '3. หากเบรกเกอร์ตัดซ้ำทันทีที่เปิดเครื่อง ห้ามฝืนเปิดต่อ ให้กดปุ่มส่งเรื่องให้ช่างเทคนิคเข้าตรวจสอบทันที'
      ]
    },
    {
      match: /(ล้างจาน|ไม่สะอาด|น้ำไม่ร้อน|ฮีตเตอร์|dishwasher|hsu|jwe)/,
      title: '🍽️ แนวทางตรวจเช็กเบื้องต้น: เครื่องล้างจาน HOSHIZAKI',
      steps: [
        '1. ตรวจสอบจุกเดรนน้ำทิ้งในถังล้างว่ากดลงสนิท และตะแกรงกรองเศษอาหารสะอาดไม่อุดตัน',
        '2. ตรวจสอบก้านฉีดน้ำ (Wash / Rinse Arm) ว่าหมุนได้อิสระและรูหัวฉีดไม่มีเศษอาหารอุดตัน',
        '3. ตรวจสอบปริมาณน้ำยาล้างจานและน้ำยาแวววาวในแกลลอนว่าไม่หมด และสายดูดไม่มีฟองอากาศ'
      ]
    }
  ];

  for (var i = 0; i < guides.length; i++) {
    if (guides[i].match.test(t)) return guides[i];
  }
  return null;
}

function getLineUserDisplayName_(userId) {
  var secrets = getAppSecrets_();
  if (!secrets.lineToken || !userId) return 'ลูกค้า LINE';
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
      method: 'get',
      headers: { Authorization: 'Bearer ' + secrets.lineToken },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var obj = JSON.parse(res.getContentText());
      if (obj && obj.displayName) return obj.displayName;
    }
  } catch (e) {}
  return 'ลูกค้า LINE';
}

function createTechnicianSupportTicket_(ss, userId, rawQuestion, detectedModel, ticketType) {
  var secrets = getAppSecrets_();
  var sheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  if (!sheet) {
    sheet = ss.insertSheet('LINE_Tech_Support_Tickets');
    sheet.getRange(1, 1, 1, 9).setValues([[
      'Ticket ID', 'Created At', 'LINE User ID', 'Customer Name', 'Model / Topic',
      'Customer Message', 'Status', 'Tech Reply', 'Replied At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var ticketId = 'TK-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
  var customerName = getLineUserDisplayName_(userId);

  sheet.appendRow([
    ticketId,
    nowStr,
    userId || '',
    customerName,
    detectedModel || ticketType || 'GENERAL',
    rawQuestion,
    'OPEN',
    '',
    ''
  ]);

  // แจ้งเตือนเข้ากลุ่มช่างเทคนิคทันทีเป็น Flex Message Card
  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    var flexTicket = {
      type: 'flex',
      altText: '🆘 คำขอความช่วยเหลือจากลูกค้า [' + ticketId + ']',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#B91C1C',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: '🆘 ESCALATED CUSTOMER TICKET', color: '#FECACA', size: 'xxs', weight: 'bold' },
            { type: 'text', text: ticketId + ' — ' + customerName, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '14px',
          contents: [
            { type: 'text', text: '❄️ รุ่น/หัวข้อ: ' + (detectedModel || ticketType || 'ไม่ระบุรุ่น'), weight: 'bold', size: 'xs', color: '#0369A1', wrap: true },
            { type: 'text', text: '💬 ข้อความลูกค้า:\n"' + String(rawQuestion).substring(0, 600) + '"', size: 'xs', color: '#0F172A', wrap: true },
            { type: 'separator', margin: 'sm' },
            { type: 'text', text: '👨‍🔧 วิธีตอบกลับลูกค้าโดยตรงจากกลุ่มนี้:\nพิมพ์: REPLY ' + ticketId + ' <ข้อความคำตอบ>', size: 'xxs', color: '#065F46', weight: 'bold', wrap: true }
          ]
        }
      }
    };
    if (secrets.pwaWebAppUrl && secrets.pwaWebAppUrl.indexOf('http') === 0) {
      flexTicket.contents.footer = {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [{
          type: 'button',
          style: 'primary',
          color: '#002B49',
          height: 'sm',
          action: { type: 'uri', label: '📲 เปิดเว็บแอปออกใบงาน / ค้นหาข้อมูล', uri: secrets.pwaWebAppUrl }
        }]
      };
    }
    pushLineMessages_(secrets.lineGroupId, [flexTicket]);
  }

  return { ticketId: ticketId, customerName: customerName };
}

function replyToCustomerTicketFromTech_(ss, ticketId, replyMessage, techUserId) {
  var sheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  if (!sheet || sheet.getLastRow() < 2) {
    return '❌ ไม่พบฐานข้อมูล Ticket ในระบบ';
  }
  var rowIdx = findRowByExactKey(sheet, 1, ticketId);
  if (rowIdx < 2) {
    return '❌ ไม่พบเลขที่ Ticket: ' + ticketId + ' กรุณาตรวจสอบรหัสอีกครั้งครับ';
  }
  var rowVals = sheet.getRange(rowIdx, 1, 1, 9).getValues()[0];
  var targetUserId = String(rowVals[2] || '').trim();
  var custName = String(rowVals[3] || 'ลูกค้า');
  var origQuestion = String(rowVals[5] || '');
  var techName = getLineUserDisplayName_(techUserId);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  sheet.getRange(rowIdx, 7, 1, 3).setValues([['ANSWERED', replyMessage, nowStr]]);

  if (!targetUserId) {
    return '⚠️ บันทึกคำตอบลงชีตแล้ว แต่ไม่พบ LINE User ID ของผู้ถามสำหรับส่งข้อความกลับ';
  }

  var customerReplyFlex = {
    type: 'flex',
    altText: '👨‍🔧 คำตอบจากทีมช่างเทคนิค HOSHIZAKI [' + ticketId + ']',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#002B49',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '👨‍🔧 HOSHIZAKI TECHNICAL SUPPORT', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
          { type: 'text', text: 'คำตอบจากทีมวิศวกรบริการ (' + ticketId + ')', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: 'คำถามของคุณ: "' + origQuestion.substring(0, 180) + '"', size: 'xxs', color: '#64748B', wrap: true },
          { type: 'separator' },
          { type: 'text', text: replyMessage, size: 'xs', color: '#0F172A', wrap: true },
          { type: 'text', text: '— ตอบโดย: ' + techName + ' (' + nowStr + ')', size: 'xxs', color: '#0369A1', margin: 'sm' }
        ]
      }
    }
  };

  var pushed = pushLineMessages_(targetUserId, [customerReplyFlex]);
  if (pushed) {
    return '✅ ส่งคำตอบกลับไปยังคุณ "' + custName + '" (' + ticketId + ') เรียบร้อยแล้วครับ';
  }
  return '⚠️ บันทึกคำตอบในชีตแล้ว แต่ไม่สามารถ Push หาลูกค้าได้ (ลูกค้าอาจบล็อกบอท)';
}

function buildEscalationOfferFlex_(ticketId, titleText, descText, pwaUrl) {
  var contents = [
    { type: 'text', text: titleText, weight: 'bold', size: 'sm', color: '#002B49', wrap: true },
    { type: 'text', text: descText, size: 'xs', color: '#334155', wrap: true, margin: 'xs' },
    { type: 'separator', margin: 'md' },
    { type: 'text', text: '📌 รหัสอ้างอิง: ' + ticketId + '\nระบบได้ส่งเรื่องให้ทีมช่างเทคนิค HOSHIZAKI ตรวจสอบและตอบกลับในแชทนี้แล้วครับ', size: 'xs', color: '#065F46', weight: 'bold', wrap: true, margin: 'md' }
  ];

  var footerBtns = [];
  var appSec = getAppSecrets_();
  var officeUrl = buildLineAddFriendUrl_(appSec.lineMainOfficeId);
  if (officeUrl) {
    footerBtns.push({
      type: 'button',
      style: 'primary',
      color: '#06C755',
      height: 'sm',
      action: { type: 'uri', label: '💬 ติดต่อแอดมินออฟฟิศ (Hoshizaki_Th)', uri: officeUrl }
    });
  }
  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    footerBtns.push({
      type: 'button',
      style: officeUrl ? 'secondary' : 'primary',
      color: officeUrl ? undefined : '#005696',
      height: 'sm',
      action: { type: 'uri', label: '📲 เปิดเว็บแอปบริการ HOSHIZAKI', uri: pwaUrl }
    });
  }

  var bubble = {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: contents }
  };
  if (footerBtns.length > 0) {
    bubble.footer = { type: 'box', layout: 'vertical', paddingAll: '10px', contents: footerBtns };
  }

  return {
    type: 'flex',
    altText: titleText + ' (' + ticketId + ')',
    contents: bubble
  };
}


function searchPartsCatalogFromSheet_(ss, queryText) {
  var sheet = ss.getSheetByName('Parts_Catalog_Master');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var q = String(queryText || '').trim().toUpperCase();
  if (!q) return [];
  var tokens = q.split(/\s+/).filter(function(t) { return t.length >= 2; });
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var matches = [];

  for (var i = 0; i < vals.length; i++) {
    var pNo = String(vals[i][0] || '').toUpperCase();
    var pDesc = String(vals[i][1] || '').toUpperCase();
    var pPrice = Number(vals[i][2] || 0);
    var pModels = String(vals[i][3] || '').toUpperCase();
    var hay = pNo + ' ' + pDesc + ' ' + pModels;
    var ok = tokens.every(function(tok) { return hay.indexOf(tok) > -1; });
    if (ok) {
      matches.push({
        partNo: vals[i][0],
        desc: vals[i][1],
        price: pPrice,
        models: vals[i][3]
      });
      if (matches.length >= 6) break;
    }
  }
  return matches;
}

function searchQuotationsFromSheet_(ss, queryText) {
  var sheet = ss.getSheetByName('Quotations');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var q = String(queryText || '').trim().toUpperCase();
  if (!q) return [];
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    var offerNo = String(vals[i][0] || '').toUpperCase();
    var cust = String(vals[i][4] || '').toUpperCase();
    var sn = String(vals[i][9] || '').toUpperCase();
    if (offerNo.indexOf(q) > -1 || cust.indexOf(q) > -1 || sn.indexOf(q) > -1) {
      out.push({
        offerNo: vals[i][0],
        docType: vals[i][1],
        date: vals[i][3],
        customer: vals[i][4],
        model: vals[i][8],
        serial: vals[i][9],
        grandTotal: vals[i][15]
      });
      if (out.length >= 5) break;
    }
  }
  return out;
}

function routeSmartLineInquiry_(ss, ev, rawText, secrets) {
  var replyToken = ev.replyToken;
  var src = ev.source || {};
  var userId = src.userId || '';
  var sourceType = src.type || 'user';
  var upper = rawText.toUpperCase();

  // 0. คำสั่งสำหรับช่างเทคนิคตอบกลับ Ticket ลูกค้า: REPLY TK-xxxxxx <ข้อความ>
  if (/^REPLY\s+(TK-[A-Z0-9\-]+)\s+([\s\S]+)/i.test(rawText)) {
    var mReply = rawText.match(/^REPLY\s+(TK-[A-Z0-9\-]+)\s+([\s\S]+)/i);
    var resMsg = replyToCustomerTicketFromTech_(ss, mReply[1].toUpperCase(), mReply[2].trim(), userId);
    replyLineMessage(replyToken, resMsg);
    return true;
  }

  // 0.1 คำสั่งขอดูรายการ Ticket ที่รอช่างตอบ: TICKETS
  if (upper === 'TICKETS' || rawText === 'คิวคำถาม') {
    var tSheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
    if (!tSheet || tSheet.getLastRow() < 2) {
      replyLineMessage(replyToken, '✅ ไม่มีคำถามลูกค้าค้างตอบในขณะนี้ครับ');
      return true;
    }
    var tVals = tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 7).getValues();
    var openList = tVals.filter(function(r) { return String(r[6]) === 'OPEN'; });
    if (openList.length === 0) {
      replyLineMessage(replyToken, '✅ คำถามลูกค้าทั้งหมดได้รับการตอบกลับครบแล้วครับ');
      return true;
    }
    var lines = openList.slice(-8).map(function(r) {
      return '• ' + r[0] + ' (' + r[3] + '): ' + String(r[5]).substring(0, 70) + '\n  ↳ ตอบพิมพ์: REPLY ' + r[0] + ' <คำตอบ>';
    }).join('\n');
    replyLineMessage(replyToken, '🆘 รายการคำถามลูกค้าที่รอช่างตอบ (' + openList.length + ' รายการ)\n━━━━━━━━━━━━━━━━━━━━\n' + lines);
    return true;
  }

  // 0.2 ส่งต่อช่างเทคนิคโดยตรงเมื่อลูกค้าพิมพ์ "ติดต่อช่าง" / "คุยกับช่าง" / "ASK TECH"
  if (/^(ติดต่อช่าง|คุยกับช่าง|ขอช่าง|แจ้งซ่อม|ASK\s*TECH|AGENT)/i.test(rawText)) {
    var modelsDirect = extractHoshizakiModelsFromText_(rawText);
    var tkDirect = createTechnicianSupportTicket_(ss, userId, rawText, modelsDirect.join(', ') || 'ขอติดต่อช่างเทคนิค', 'CUSTOMER_REQUEST');
    var flexDirect = buildEscalationOfferFlex_(
      tkDirect.ticketId,
      '👨‍🔧 ส่งเรื่องถึงทีมช่างเทคนิคเรียบร้อยแล้ว',
      'ทีมช่างเทคนิค HOSHIZAKI ได้รับข้อความของคุณแล้ว และจะตอบกลับผ่านแชทนี้โดยเร็วที่สุดครับ (คุณสามารถพิมพ์รายละเอียดรุ่นเครื่อง S/N หรืออาการเพิ่มเติมทิ้งไว้ได้เลย)',
      secrets.pwaWebAppUrl
    );
    replyLineMessages_(replyToken, [flexDirect]);
    return true;
  }

  // สกัดรหัสรุ่นเครื่อง Hoshizaki จากประโยค (เช่น IM-130NE, KM-50B, FM-300AKE, HR-126MA-S)
  var detectedModels = extractHoshizakiModelsFromText_(rawText);
  var primaryModel = detectedModels.length > 0 ? detectedModels[0] : '';

  // 1. ตรวจจับ Intent: ขอ Drawing / Wiring Diagram / วงจรไฟฟ้า
  if (/(DRAWING|WIRING|DIAGRAM|SCHEMATIC|ดรออิ้ง|ดรอว์อิ้ง|แบบเครื่อง|ไดอะแกรม|วงจรไฟฟ้า|ผังวงจร)/i.test(rawText)) {
    if (!primaryModel) {
      replyLineMessage(replyToken, '📐 กรุณาระบุรุ่นเครื่องที่ต้องการขอ Drawing / Wiring Diagram ครับ\nตัวอย่าง: "ขอ Drawing IM-240DNE" หรือ "วงจรไฟฟ้า KM-50B"');
      return true;
    }
    var drwDrive = searchPdfFilesInDriveFolders(MANUAL_PDF_FOLDER_IDS.concat([SPEC_SHEET_FOLDER_ID]), primaryModel, 6);
    var drwLib = searchTechnicalDocsFromSheet_(ss, primaryModel, 'DRAWING');
    var drwAll = drwLib.concat(drwDrive);
    if (drwAll.length > 0) {
      var flexDrw = buildPdfResultsFlexMessage_(
        '📐 Drawing / คู่มือเทคนิค: ' + primaryModel,
        'พบเอกสารที่เกี่ยวข้อง ' + drwAll.length + ' รายการ กดปุ่มด้านล่างเพื่อเปิดดูไฟล์ได้ทันที',
        drwAll,
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexDrw]);
    } else {
      var tkDrw = createTechnicianSupportTicket_(ss, userId, rawText, primaryModel, 'DRAWING_REQUEST');
      var flexDrwEsc = buildEscalationOfferFlex_(
        tkDrw.ticketId,
        '📐 ยังไม่พบไฟล์ Drawing รุ่น ' + primaryModel + ' ในคลังอัตโนมัติ',
        'ระบบได้ส่งคำขอไฟล์ Drawing รุ่น ' + primaryModel + ' ให้ทีมช่างเทคนิคค้นหาและส่งให้คุณในแชทนี้แล้วครับ',
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexDrwEsc]);
    }
    return true;
  }

  // 2. ตรวจจับ Intent: ขอ Parts List / รายการอะไหล่ / Exploded View
  if (/(PARTS\s*LIST|PART\s*LIST|SPARE\s*PART|EXPLODED|พาร์ทลิสต์|รายการอะไหล่|อะไหล่รุ่น|เบอร์อะไหล่|รหัสอะไหล่)/i.test(rawText)) {
    if (!primaryModel) {
      replyLineMessage(replyToken, '🔩 กรุณาระบุรุ่นเครื่องที่ต้องการขอ Parts List / รายการอะไหล่ ครับ\nตัวอย่าง: "ขอ Parts List IM-100NE" หรือ "รายการอะไหล่ FM-300AKE"');
      return true;
    }
    var partsDrive = searchPdfFilesInDriveFolders([MANUAL_PDF_FOLDER_IDS[2]].concat(MANUAL_PDF_FOLDER_IDS), primaryModel, 6);
    var partsLib = searchTechnicalDocsFromSheet_(ss, primaryModel, 'PARTS');
    var partsAll = partsLib.concat(partsDrive);
    if (partsAll.length > 0) {
      var flexParts = buildPdfResultsFlexMessage_(
        '🔩 Parts List / รายการอะไหล่: ' + primaryModel,
        'พบเอกสาร Parts List และคู่มือที่เกี่ยวข้อง ' + partsAll.length + ' รายการ',
        partsAll,
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexParts]);
    } else {
      var tkParts = createTechnicianSupportTicket_(ss, userId, rawText, primaryModel, 'PARTS_LIST_REQUEST');
      var flexPartsEsc = buildEscalationOfferFlex_(
        tkParts.ticketId,
        '🔩 ยังไม่พบไฟล์ Parts List รุ่น ' + primaryModel + ' ในคลังอัตโนมัติ',
        'ระบบได้ส่งคำขอรายการอะไหล่รุ่น ' + primaryModel + ' ไปยังทีมช่างเทคนิคเพื่อตรวจสอบและส่งไฟล์ให้คุณแล้วครับ',
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexPartsEsc]);
    }
    return true;
  }

  // 3. ตรวจจับ Intent: ขอ Service Manual / Instruction Manual / คู่มือซ่อม / คู่มือการใช้งาน
  if (/(SERVICE\s*MANUAL|INSTRUCTION\s*MANUAL|USER\s*MANUAL|MANUAL|คู่มือซ่อม|คู่มือการใช้งาน|คู่มือเครื่อง|ขอคู่มือ)/i.test(rawText)) {
    if (!primaryModel) {
      replyLineMessage(replyToken, '📚 กรุณาระบุรุ่นเครื่องที่ต้องการขอคู่มือครับ\nตัวอย่าง: "ขอ Service Manual IM-130NE" หรือ "คู่มือ KM-901MAJ"');
      return true;
    }
    var manDrive = searchPdfFilesInDriveFolders(MANUAL_PDF_FOLDER_IDS.concat([SPEC_SHEET_FOLDER_ID]), primaryModel, 6);
    var manLib = searchTechnicalDocsFromSheet_(ss, primaryModel, 'ALL');
    var manAll = manLib.concat(manDrive);
    if (manAll.length > 0) {
      var flexMan = buildPdfResultsFlexMessage_(
        '📚 Service / Instruction Manual: ' + primaryModel,
        'พบคู่มือ PDF ใน Google Drive และคลังเว็บแอป ' + manAll.length + ' รายการ',
        manAll,
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexMan]);
    } else {
      var tkMan = createTechnicianSupportTicket_(ss, userId, rawText, primaryModel, 'MANUAL_REQUEST');
      var flexManEsc = buildEscalationOfferFlex_(
        tkMan.ticketId,
        '📚 ยังไม่พบไฟล์คู่มือรุ่น ' + primaryModel + ' ในคลังอัตโนมัติ',
        'ระบบได้ส่งคำขอ Service Manual รุ่น ' + primaryModel + ' ให้ทีมช่างเทคนิคจัดส่งให้คุณในแชทนี้แล้วครับ',
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexManEsc]);
    }
    return true;
  }

  // 4. ตรวจจับ Intent: ขอ Spec Sheet / สเปค / ขนาดเครื่อง / กำลังไฟ / ข้อมูลจำเพาะ
  if (/(SPEC|DATASHEET|CATALOG|BROCHURE|สเปก|สเปค|ขนาดเครื่อง|กำลังไฟ|กำลังการผลิต|กินไฟ|ใช้น้ำยา)/i.test(rawText)) {
    if (!primaryModel) {
      replyLineMessage(replyToken, '❄️ กรุณาระบุรุ่นเครื่องที่ต้องการดู Spec Sheet ครับ\nตัวอย่าง: "ขอสเปคชีต IM-130NE" หรือ "ขนาดเครื่อง KM-100B"');
      return true;
    }
    var specDrive = searchPdfFilesInDriveFolders([SPEC_SHEET_FOLDER_ID], primaryModel, 4);
    var specExtra = specDrive.length < 2 ? searchPdfFilesInDriveFolders(MANUAL_PDF_FOLDER_IDS, primaryModel, 2) : [];
    var specLib = searchTechnicalDocsFromSheet_(ss, primaryModel, 'SPEC');
    var combinedSpec = specLib.concat(specDrive).concat(specExtra);
    var structured = getStructuredHoshizakiModelSpec_(primaryModel);

    if (combinedSpec.length > 0 || structured) {
      var specMsgs = buildSpecSheetLineMessages_(primaryModel, combinedSpec, secrets.pwaWebAppUrl);
      var sentOk = replyLineMessages_(replyToken, specMsgs);
      if (!sentOk && specMsgs.length > 1) {
        replyLineMessages_(replyToken, [specMsgs[specMsgs.length - 1]]);
      }
    } else {
      var tkSpec = createTechnicianSupportTicket_(ss, userId, rawText, primaryModel, 'SPEC_REQUEST');
      var flexSpecEsc = buildEscalationOfferFlex_(
        tkSpec.ticketId,
        '❄️ ยังไม่พบไฟล์ Spec Sheet รุ่น ' + primaryModel + ' ในระบบ',
        'ระบบได้แจ้งทีมช่างเทคนิค/ฝ่ายขายให้ส่งเอกสาร Spec Sheet รุ่น ' + primaryModel + ' กลับให้คุณในแชทนี้แล้วครับ',
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexSpecEsc]);
    }
    return true;
  }

  // 5. ตรวจจับ Intent: Error Code / ไฟกระพริบ / เสียงร้องเตือน Beep
  if (/(ERROR|ERR\b|BEEP|ALARM|โค้ด|เออเร่อ|เออร์เรอร์|ขึ้นโค้ด|ไฟกระพริบ|ร้องเตือน|ปี๊บ|\bE[0-9]{1,2}\b)/i.test(rawText)) {
    var cleanErrQ = rawText.replace(/(เครื่อง|รุ่น|ขึ้น|แสดง|โค้ด|เออเร่อ|เออร์เรอร์|error|code|alarm|ครับ|ค่ะ)/gi, ' ').trim().toUpperCase();
    var errRecs = getModelSpecificErrorRecords_(cleanErrQ || rawText.toUpperCase());
    if (errRecs.length > 0) {
      var flexErr = buildErrorCodeFlexMessage_(cleanErrQ || rawText.toUpperCase(), errRecs, secrets.pwaWebAppUrl);
      if (!replyLineMessages_(replyToken, [flexErr])) {
        replyLineMessage(replyToken, lookupHoshizakiErrorCodeText(cleanErrQ || rawText.toUpperCase()));
      }
    } else {
      var tkErr = createTechnicianSupportTicket_(ss, userId, rawText, primaryModel || 'ERROR_CODE', 'ERROR_INQUIRY');
      var flexErrEsc = buildEscalationOfferFlex_(
        tkErr.ticketId,
        '🚨 ส่งต่อรหัส Error ให้ช่างเทคนิคตรวจสอบ',
        'ยังไม่พบรหัส Error นี้ตรงกับฐานข้อมูลอัตโนมัติ ระบบได้ส่งข้อมูลให้ทีมช่างเทคนิค HOSHIZAKI ตรวจสอบและตอบกลับให้คุณแล้วครับ',
        secrets.pwaWebAppUrl
      );
      replyLineMessages_(replyToken, [flexErrEsc]);
    }
    return true;
  }

  // 6. ตรวจจับ Intent: แจ้งอาการเสียเบื้องต้น / ขอคำแนะนำตรวจสอบเบื้องต้น
  var symptomGuide = diagnoseSymptomGuide_(rawText);
  if (symptomGuide) {
    var symBody = [
      { type: 'text', text: symptomGuide.title, weight: 'bold', size: 'sm', color: '#002B49', wrap: true },
      { type: 'separator', margin: 'sm' },
      { type: 'text', text: symptomGuide.steps.join('\n\n'), size: 'xs', color: '#1E293B', wrap: true, margin: 'sm' },
      { type: 'separator', margin: 'md' },
      { type: 'text', text: '💡 หากตรวจสอบเบื้องต้นแล้วยังไม่หาย สามารถกดปุ่มด้านล่างเพื่อส่งเรื่องให้ช่างเทคนิคช่วยวิเคราะห์หรือนัดเข้าซ่อมได้ทันทีครับ', size: 'xxs', color: '#475569', wrap: true, margin: 'sm' }
    ];
    var symBubble = {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: symBody },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '10px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#B91C1C',
            height: 'sm',
            action: {
              type: 'message',
              label: '👨‍🔧 ส่งอาการนี้ให้ช่างเทคนิคตอบ/นัดซ่อม',
              text: 'ติดต่อช่าง: ' + rawText.substring(0, 200)
            }
          }
        ]
      }
    };
    if (secrets.pwaWebAppUrl && secrets.pwaWebAppUrl.indexOf('http') === 0) {
      symBubble.footer.contents.push({
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: { type: 'uri', label: '📲 เปิดเว็บแอปบริการ HOSHIZAKI', uri: secrets.pwaWebAppUrl }
      });
    }
    replyLineMessages_(replyToken, [{ type: 'flex', altText: symptomGuide.title, contents: symBubble }]);
    return true;
  }

  // 6.5 ตรวจจับ Intent: ค้นหาใบเสนอราคา (Quotation / QT-) หรือราคาอะไหล่ (Part Price)
  if (/(QT-[A-Z0-9\-]+|ใบเสนอราคา|QUOTATION|ราคาอะไหล่|เช็กราคา|เช็คราคา|PART\s*PRICE)/i.test(rawText)) {
    var qtCodeMatch = rawText.match(/(QT-[A-Z0-9\-]+)/i);
    if (qtCodeMatch || /(ใบเสนอราคา|QUOTATION)/i.test(rawText)) {
      var qtQ = qtCodeMatch ? qtCodeMatch[1] : rawText.replace(/(ขอ|เช็ก|เช็ค|ดู|ใบเสนอราคา|quotation|ครับ|ค่ะ)/gi, '').trim();
      var qtMatches = searchQuotationsFromSheet_(ss, qtQ);
      if (qtMatches.length > 0) {
        var qtLines = qtMatches.map(function(qItem, idx) {
          return (idx + 1) + '. 📄 ' + qItem.offerNo + ' (' + qItem.date + ')\n   • ลูกค้า: ' + qItem.customer + '\n   • รุ่น/S/N: ' + qItem.model + ' / ' + qItem.serial + '\n   • ยอดสุทธิ: ' + formatCurrency(qItem.grandTotal) + ' THB';
        }).join('\n\n');
        replyLineMessage(replyToken, '📑 ข้อมูลใบเสนอราคาที่พบ (' + qtMatches.length + ' รายการ)\n━━━━━━━━━━━━━━━━━━━━\n' + qtLines);
        return true;
      }
    }

    var cleanPartQ = rawText.replace(/(ขอ|เช็ก|เช็ค|สอบถาม|ราคาอะไหล่|ราคา|part|price|ครับ|ค่ะ)/gi, ' ').replace(/\s+/g, ' ').trim();
    if (cleanPartQ.length >= 2) {
      var partMatches = searchPartsCatalogFromSheet_(ss, cleanPartQ);
      if (partMatches.length > 0) {
        var pLines = partMatches.map(function(p, idx) {
          return (idx + 1) + '. 🔩 [' + p.partNo + '] ' + p.desc + '\n   • ราคาตั้ง: ' + formatCurrency(p.price) + ' THB' + (p.models ? '\n   • รุ่นที่ใช้: ' + p.models : '');
        }).join('\n\n');
        replyLineMessage(replyToken, '💰 รายการอะไหล่และราคาตั้ง HOSHIZAKI\n━━━━━━━━━━━━━━━━━━━━\n' + pLines + '\n\n(หมายเหตุ: ราคายังไม่รวม VAT 7% และส่วนลดดีลเลอร์)');
        return true;
      }
    }
  }

  // 7. ตรวจจับ Intent: เช็ก S/N หรือพิมพ์รหัส Serial Number โดยตรง (เช่น "SN H12345J", "S/N 51967170400060", "เช็กเครื่อง D16220B" หรือพิมพ์รหัส S/N โดดๆ)
  var snMatch = rawText.match(/\b([A-Z]\d{4,6}[A-Z0-9]{0,3}|\d{10,16})\b/i);
  var isPureSn = /^([A-Z]\d{4,6}[A-Z0-9]{0,3}|\d{10,16})$/i.test(rawText.trim());
  if (snMatch && (isPureSn || /(S\/N|SN|SERIAL|ประกัน|ประวัติ|เช็กเครื่อง|เช็คเครื่อง|ซ่อม|ใบเสนอราคา|ลูกค้า)/i.test(rawText))) {
    var snQ = snMatch[1].toUpperCase();
    var dossier2 = buildSerial360Dossier_(ss, snQ);
    if (dossier2.salesMeta || dossier2.jobs.length > 0 || dossier2.quotations.length > 0) {
      var flexSn2 = buildSerial360FlexMessage_(dossier2, secrets.pwaWebAppUrl);
      replyLineMessages_(replyToken, [flexSn2]);
      return true;
    }
  }

  // 7.5 Zero-Command Auto-Capture ในกลุ่ม LINE เดิมของทีมช่าง (จับโพสต์ซ่อมเก่าที่ Copy มาวางโดยไม่ต้องพิมพ์คำสั่ง)
  if ((sourceType === 'group' || sourceType === 'room') && tryAutoCaptureLegacyFromLineGroup_(ss, ev, rawText)) {
    return true;
  }

  // 8. Fallback สำหรับแชทส่วนตัว (1:1 Chat): หากไม่ตรงกับคีย์เวิร์ดหรือไม่มีข้อมูล -> สร้าง Ticket ให้ช่างเทคนิคตอบแทนอัตโนมัติ
  if (sourceType === 'user') {
    var tkFallback = createTechnicianSupportTicket_(ss, userId, rawText, primaryModel || 'สอบถามข้อมูล/บริการ', 'AUTO_ESCALATED');
    var flexFallback = buildEscalationOfferFlex_(
      tkFallback.ticketId,
      '🐧 HOSHIZAKI Smart Service Assistant',
      'ไม่พบข้อมูลอัตโนมัติที่ตรงกับคำถามนี้ ระบบได้ส่งต่อข้อความของคุณให้ทีมช่างเทคนิค HOSHIZAKI ตรวจสอบและตอบกลับในแชทนี้แล้วครับ\n\n💡 คำสั่งค้นหาด่วน:\n• ขอสเปคชีต <รุ่น> (เช่น ขอสเปคชีต IM-130NE)\n• ขอ Drawing / Service Manual / Parts List <รุ่น>\n• Error <รุ่น> <รหัส> (เช่น Error IM-65NE E1)\n• แจ้งอาการเสีย (เช่น เครื่องไม่ทำน้ำแข็ง น้ำไม่เข้า)',
      secrets.pwaWebAppUrl
    );
    replyLineMessages_(replyToken, [flexFallback]);
    return true;
  }

  return false;
}

function handleLineWebhookEvents(events) {
  if (!isLineTokenConfigured()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();

  events.forEach(function(ev) {
    if (ev.type === 'postback' && ev.postback && ev.postback.data) {
      var pbData = String(ev.postback.data);
      var mCsat = pbData.match(/action=CSAT_RATING&jobNo=([^&]+)&score=(\d)/);
      if (mCsat) {
        var csatReply = recordCustomerCsatRating_(ss, decodeURIComponent(mCsat[1]), mCsat[2], (ev.source && ev.source.userId) || '');
        replyLineMessage(ev.replyToken, csatReply);
      }
      return;
    }
    if (ev.type === 'message' && ev.message && ev.message.type === 'image') {
      handleLineGroupImageAttachment_(ss, ev);
      return;
    }
    if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
    var replyToken = ev.replyToken;
    var rawText = String(ev.message.text || '').trim();
    var upperText = rawText.toUpperCase();
    var src = ev.source || {};
    var sourceType = src.type || 'user';

    if (upperText === 'ID' || upperText === 'GROUPID' || upperText === 'MYID') {
      var idInfo = '🔑 ข้อมูล LINE ID สำหรับระบบ HOSHIZAKI:\n' +
        '• ประเภทห้องแชท: ' + sourceType + '\n' +
        (src.groupId ? '• Group ID: ' + src.groupId + '\n' : '') +
        (src.roomId ? '• Room ID: ' + src.roomId + '\n' : '') +
        (src.userId ? '• User ID: ' + src.userId + '\n' : '') +
        '\n(นำไปบันทึกใน Script Properties: LINE_TECH_GROUP_ID ได้เลยครับ)';
      replyLineMessage(replyToken, idInfo);
      return;
    }

    if (upperText === 'OFFICE' || rawText === 'ติดต่อออฟฟิศ' || rawText === 'ติดต่อแอดมิน' || rawText === 'แอดมิน') {
      var offUrl = buildLineAddFriendUrl_(secrets.lineMainOfficeId);
      if (offUrl) {
        replyLineMessages_(replyToken, [{
          type: 'flex',
          altText: 'ติดต่อแอดมินออฟฟิศ Hoshizaki_Th',
          contents: {
            type: 'bubble',
            size: 'mega',
            header: {
              type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
              contents: [
                { type: 'text', text: '🏢 HOSHIZAKI (THAILAND) OFFICE', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
                { type: 'text', text: 'ติดต่อเจ้าหน้าที่ประสานงานหลัก (Hoshizaki_Th)', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs', wrap: true }
              ]
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '14px',
              contents: [
                { type: 'text', text: 'สำหรับการสั่งซื้อเครื่อง สอบถามฝ่ายขาย นัดส่งสินค้า ออกใบกำกับภาษี หรือประสานงานทั่วไป สามารถกดปุ่มด้านล่างเพื่อแชทกับแอดมินออฟฟิศโดยตรงครับ', size: 'xs', color: '#334155', wrap: true }
              ]
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '12px',
              contents: [{
                type: 'button', style: 'primary', color: '#06C755', height: 'sm',
                action: { type: 'uri', label: '💬 เปิดแชท Hoshizaki_Th (ออฟฟิศ)', uri: offUrl }
              }]
            }
          }
        }]);
      } else {
        replyLineMessage(replyToken, '🏢 สามารถติดต่อฝ่ายบริการลูกค้า HOSHIZAKI (THAILAND) ได้ที่โทร 02-005-9980-83 หรืออีเมล services@hoshizaki.co.th ครับ');
      }
      return;
    }

    if (upperText === 'HELP' || rawText === 'เมนู' || rawText === 'คำสั่ง') {
      var helpMsg = '🐧 HOSHIZAKI SERVICE BOT (Enterprise v1011)\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '1️⃣ SPEC <รุ่นเครื่อง> : การ์ดสเปกมาตรฐาน + ปุ่มเปิด Spec Sheet PDF\n' +
        '   ตัวอย่าง: SPEC IM-100NE\n' +
        '2️⃣ MANUAL <รุ่นเครื่อง> : ค้นหาคู่มือซ่อม / Instruction / Parts List PDF\n' +
        '   ตัวอย่าง: MANUAL KM-50B\n' +
        '3️⃣ SN <เลขเครื่อง> : ค้นหาประวัติซ่อมและสถานะประกัน\n' +
        '   ตัวอย่าง: SN H12345J\n' +
        '4️⃣ STATUS <เลขใบงาน/ชื่อร้าน> : เช็กสถานะงานซ่อมพร้อมปุ่มเปิด PDF\n' +
        '   ตัวอย่าง: STATUS JOB-20261115-001\n' +
        '5️⃣ ERR <รุ่น/รหัส> หรือ PINOUT <IM/KM/FM> : ดู Error Code, ผังขั้วบอร์ด และ LED\n' +
        '6️⃣ PM DUE : เช็กรายการเครื่องครบกำหนด PM ล้างใหญ่/เปลี่ยนไส้กรอง\n' +
        '7️⃣ VAN STOCK <รหัสช่าง> : เช็กสต็อกอะไหล่รถช่าง (เช่น VAN STOCK T01)\n' +
        '8️⃣ RENAME PREVIEW / RENAME EXEC : จัดระเบียบชื่อไฟล์ PDF ใน Drive อัตโนมัติ\n' +
        '9️⃣ TICKETS / REPLY <TK-ID> <คำตอบ> : ดูและตอบกลับคำถามลูกค้า\n' +
        '🔟 ID : ดูรหัส Group ID / User ID\n' +
        '📂 โฟลเดอร์ Spec Sheet รวม:\nhttps://drive.google.com/drive/folders/' + SPEC_SHEET_FOLDER_ID;
      if (secrets.pwaWebAppUrl) {
        helpMsg += '\n\n📲 เปิดเว็บแอปใบงาน HOSHIZAKI:\n' + secrets.pwaWebAppUrl;
      }
      replyLineMessage(replyToken, helpMsg);
      return;
    }

    if (upperText.indexOf('SN ') === 0 || upperText.indexOf('S/N ') === 0) {
      var snQuery = rawText.replace(/^S\/?N\s+/i, '').trim().toUpperCase();
      var dossier = buildSerial360Dossier_(ss, snQuery);
      if (!dossier.salesMeta && dossier.jobs.length === 0 && dossier.quotations.length === 0) {
        replyLineMessage(replyToken, '🔍 ไม่พบข้อมูลเครื่อง ประวัติซ่อม หรือใบเสนอราคาของ S/N: ' + snQuery + ' ในฐานข้อมูล Cloud');
      } else {
        var flexSn = buildSerial360FlexMessage_(dossier, secrets.pwaWebAppUrl);
        replyLineMessages_(replyToken, [flexSn]);
      }
      return;
    }

    if (upperText.indexOf('STATUS ') === 0 || rawText.indexOf('เช็กสถานะ ') === 0 || rawText.indexOf('สถานะ ') === 0) {
      var q = rawText.replace(/^(STATUS|เช็กสถานะ|สถานะ)\s+/i, '').trim().toLowerCase();
      var allJobs = readRecentJobsFromSheet(ss, 1000);
      var foundJobs = allJobs.filter(function(j) {
        return String(j.jobNo || '').toLowerCase().indexOf(q) > -1 ||
               String(j.store || '').toLowerCase().indexOf(q) > -1;
      });
      if (foundJobs.length === 0) {
        replyLineMessage(replyToken, 'ไม่พบข้อมูลใบงานที่ตรงกับ "' + q + '" กรุณาตรวจสอบเลขที่ใบงานหรือชื่อร้านอีกครั้งครับ');
      } else {
        var flexStatus = buildJobsStatusFlexMessage_('📋 สถานะงานบริการ: "' + q + '"', foundJobs, secrets.pwaWebAppUrl);
        replyLineMessages_(replyToken, [flexStatus]);
      }
      return;
    }

    if (upperText.indexOf('SPEC ') === 0 || rawText.indexOf('สเปก ') === 0 || rawText.indexOf('สเปค ') === 0) {
      var modelQ = rawText.replace(/^(SPEC|สเปก|สเปค)\s+/i, '').trim().toUpperCase();
      // ค้นหาไฟล์จากโฟลเดอร์ Spec Sheet หลักก่อน แล้วค่อยเสริมด้วยโฟลเดอร์คู่มือ
      var specOnlyFiles = searchPdfFilesInDriveFolders([SPEC_SHEET_FOLDER_ID], modelQ, 4);
      var extraFiles = specOnlyFiles.length < 3 ? searchPdfFilesInDriveFolders(MANUAL_PDF_FOLDER_IDS, modelQ, 3) : [];
      var seenMap = {};
      var combinedSpecFiles = [];
      specOnlyFiles.concat(extraFiles).forEach(function(item) {
        if (item && item.id && !seenMap[item.id]) {
          seenMap[item.id] = true;
          combinedSpecFiles.push(item);
        }
      });

      var specMsgs = buildSpecSheetLineMessages_(modelQ, combinedSpecFiles, secrets.pwaWebAppUrl);
      if (specMsgs.length > 0) {
        var sentOk = replyLineMessages_(replyToken, specMsgs);
        if (!sentOk && specMsgs.length > 1) {
          // กรณีภาพจาก Drive โหลดช้า ให้ส่งการ์ดสเปก + ลิงก์ PDF ทันที
          replyLineMessages_(replyToken, [specMsgs[specMsgs.length - 1]]);
        }
      } else {
        var fallbackTxt = lookupHoshizakiModelSpecText(modelQ) + '\n\n📂 เปิดดูโฟลเดอร์ Spec Sheet รวมได้ที่:\nhttps://drive.google.com/drive/folders/' + SPEC_SHEET_FOLDER_ID;
        replyLineMessage(replyToken, fallbackTxt);
      }
      return;
    }

    if (upperText.indexOf('MANUAL ') === 0 || upperText.indexOf('PDF ') === 0 || rawText.indexOf('คู่มือ ') === 0) {
      var manualQ = rawText.replace(/^(MANUAL|PDF|คู่มือ)\s+/i, '').trim().toUpperCase();
      var mFiles = searchPdfFilesInDriveFolders(MANUAL_PDF_FOLDER_IDS.concat([SPEC_SHEET_FOLDER_ID]), manualQ, 6);
      if (mFiles.length > 0) {
        var flexManual = buildPdfResultsFlexMessage_(
          '📚 คู่มือซ่อม / Parts List: ' + manualQ,
          'พบเอกสาร PDF ที่เกี่ยวข้อง ' + mFiles.length + ' รายการ กดปุ่มด้านล่างเพื่อเปิดอ่านได้ทันที',
          mFiles,
          secrets.pwaWebAppUrl
        );
        replyLineMessages_(replyToken, [flexManual]);
      } else {
        replyLineMessage(replyToken, '🔍 ไม่พบไฟล์ PDF คู่มือที่ตรงกับ "' + manualQ + '" ในโฟลเดอร์คู่มือหลัก');
      }
      return;
    }

    if (upperText.indexOf('PINOUT') === 0 || upperText.indexOf('BOARD') === 0 || upperText.indexOf('LED ') === 0) {
      var bQ = rawText.replace(/^(PINOUT|BOARD|LED)\s*/i, '').trim().toUpperCase();
      var flexPinout = buildControlBoardPinoutFlexMessage_(bQ, secrets.pwaWebAppUrl);
      var sentPinOk = replyLineMessages_(replyToken, [flexPinout]);
      if (!sentPinOk) {
        replyLineMessage(replyToken, lookupControlBoardPinoutText_(bQ));
      }
      return;
    }

    if (/^(PARAM|SETTING|MANUAL|ตั้งค่า|พารามิเตอร์|คู่มือ)\s+/i.test(rawText) || /(HW-?320B|HW-?600A|HW-?600B|HW-?600B3|P01873|DIXELL|XR06CH|WR-?87285|ECS-?180|ETC-?3000|HR-MC|HF-MC|HRF-MC)/i.test(rawText)) {
      var paramReply = lookupControllerAndMachineParametersText_(rawText);
      if (paramReply) {
        replyLineMessage(replyToken, paramReply);
        return;
      }
    }

    if (upperText.indexOf('ERR ') === 0 || upperText.indexOf('ERROR ') === 0) {
      var errQ = rawText.replace(/^ERR(OR)?\s+/i, '').trim().toUpperCase();
      var errRecs = getModelSpecificErrorRecords_(errQ);
      if (errRecs.length > 0) {
        var flexErr = buildErrorCodeFlexMessage_(errQ, errRecs, secrets.pwaWebAppUrl);
        var sentErrOk = replyLineMessages_(replyToken, [flexErr]);
        if (!sentErrOk) {
          replyLineMessage(replyToken, lookupHoshizakiErrorCodeText(errQ));
        }
      } else {
        replyLineMessage(replyToken, lookupHoshizakiErrorCodeText(errQ));
      }
      return;
    }

    if (upperText === 'QT FOLLOWUP' || upperText === 'FOLLOWUP' || rawText === 'ติดตามใบเสนอราคา') {
      var qtFuText = buildQuotationFollowUpText_(ss);
      replyLineMessage(replyToken, qtFuText);
      return;
    }

    if (upperText === 'BI REPORT' || upperText === 'BI' || rawText === 'สรุปKPI') {
      var biText = buildExecutiveBiSummaryText_(ss);
      replyLineMessage(replyToken, biText);
      return;
    }

    if (/^CSAT\s+([A-Z0-9\-]+)\s+([1-5])$/i.test(rawText)) {
      var mCsatTxt = rawText.match(/^CSAT\s+([A-Z0-9\-]+)\s+([1-5])$/i);
      var csatMsg = recordCustomerCsatRating_(ss, mCsatTxt[1].toUpperCase(), mCsatTxt[2], (src && src.userId) || '');
      replyLineMessage(replyToken, csatMsg);
      return;
    }

    if (upperText === 'PM DUE' || upperText === 'PM' || rawText === 'แจ้งเตือนPM') {
      var pmReport = buildPmDueSummaryText_(ss);
      var flexPm = buildInfoCardWithFullScreenFlex_('📅 แจ้งเตือนเครื่องครบกำหนด PM', pmReport, 'pmDue=1', secrets.pwaWebAppUrl);
      if (!replyLineMessages_(replyToken, [flexPm])) {
        replyLineMessage(replyToken, pmReport);
      }
      return;
    }

    if (upperText.indexOf('VAN STOCK') === 0 || upperText.indexOf('VANSTOCK') === 0 || rawText.indexOf('สต็อก') === 0) {
      var tc = rawText.replace(/^(VAN\s*STOCK|สต็อก)\s*/i, '').trim().toUpperCase();
      var vsReport = buildVanStockSummaryText_(ss, tc);
      var flexVs = buildInfoCardWithFullScreenFlex_('🚐 สต็อกอะไหล่รถช่าง ' + (tc || 'ทั้งหมด'), vsReport, 'vanTech=' + encodeURIComponent(tc || 'ALL'), secrets.pwaWebAppUrl);
      if (!replyLineMessages_(replyToken, [flexVs])) {
        replyLineMessage(replyToken, vsReport);
      }
      return;
    }

    if (upperText === 'RENAME PREVIEW' || upperText === 'RENAME_PREVIEW') {
      var prevRes = runAutoRenameDrivePdfsFast_(true);
      var prevStatusMsg = prevRes.completed
        ? '📋 [PREVIEW 100%] จำลองจัดระเบียบชื่อไฟล์ PDF ใน Google Drive ครบทั้งหมดแล้ว (' + prevRes.processed + ' ไฟล์)\nตรวจสอบตารางเปรียบเทียบชื่อเดิม-ชื่อใหม่ได้ที่แท็บ "Drive_Rename_Log" ใน Google Sheets ครับ'
        : '⏸️ [PREVIEW พักชั่วคราว] ประมวลผลแล้ว ' + prevRes.processed + ' ไฟล์ (ป้องกันเกินเวลา 6 นาที)\nกรุณาพิมพ์ RENAME PREVIEW ซ้ำอีกครั้งเพื่อทำต่อจากจุดที่ค้างครับ';
      replyLineMessage(replyToken, prevStatusMsg);
      return;
    }

    if (upperText === 'RENAME EXEC' || upperText === 'RENAME_EXEC') {
      var execRes = runAutoRenameDrivePdfsFast_(false);
      var execStatusMsg = execRes.completed
        ? '✅ [EXECUTED 100%] เปลี่ยนชื่อไฟล์ PDF ใน Google Drive อัตโนมัติครบทั้งหมดแล้ว (' + execRes.processed + ' ไฟล์)\nดูประวัติการเปลี่ยนชื่อทั้งหมดได้ที่แท็บ "Drive_Rename_Log" ใน Google Sheets ครับ'
        : '⏸️ [EXECUTED พักชั่วคราว] เปลี่ยนชื่อไปแล้ว ' + execRes.processed + ' ไฟล์ (ป้องกันเกินเวลา 6 นาที)\nกรุณาพิมพ์ RENAME EXEC ซ้ำอีกครั้งเพื่อทำต่อจากจุดที่ค้างครับ';
      replyLineMessage(replyToken, execStatusMsg);
      return;
    }

    // เรียกใช้ Rule-Based Smart Keyword & Technician Escalation Engine
    routeSmartLineInquiry_(ss, ev, rawText, secrets);
  });
}

function replyLineMessages_(replyToken, messagesArr) {
  var secrets = getAppSecrets_();
  if (!secrets.lineToken || !replyToken || !Array.isArray(messagesArr) || messagesArr.length === 0) return false;
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secrets.lineToken },
    payload: JSON.stringify({ replyToken: replyToken, messages: messagesArr.slice(0, 5) }),
    muteHttpExceptions: true
  });
  return res.getResponseCode() === 200;
}

function pushLineMessages_(toId, messagesArr) {
  var secrets = getAppSecrets_();
  if (!secrets.lineToken || !toId || toId === 'PASTE_YOUR_LINE_GROUP_ID_HERE' || !Array.isArray(messagesArr)) return false;
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secrets.lineToken },
    payload: JSON.stringify({ to: String(toId).trim(), messages: messagesArr.slice(0, 5) }),
    muteHttpExceptions: true
  });
  return res.getResponseCode() === 200;
}

function replyLineMessage(replyToken, text) {
  return replyLineMessages_(replyToken, [{ type: 'text', text: String(text).substring(0, 4900) }]);
}

function pushLineMessage(toId, text) {
  return pushLineMessages_(toId, [{ type: 'text', text: String(text).substring(0, 4900) }]);
}

function lookupHoshizakiModelSpecText(model) {
  var m = String(model).trim().toUpperCase();
  var header = '❄️ สเปกมาตรฐานตระกูล ' + m + ':\n';

  if (m.indexOf('IM') === 0) {
    return header +
      '• น้ำยา: R134a / R290 | High: 140-185 PSI | Low: 12-22 PSI\n' +
      '• รอบทำน้ำแข็ง: 18-25 นาที | เช็ก: ถาดน้ำพลิก, ลูกลอย, Actuator, วาล์วน้ำเข้า';
  }
  if (m.indexOf('KM') === 0) {
    return header +
      '• น้ำยา: R404A / R290 | High: 210-265 PSI | Low: 28-42 PSI\n' +
      '• รอบทำน้ำแข็ง: 15-22 นาที | เช็ก: Float Switch, Hot Gas Valve, ปั๊มน้ำ, แผงบอร์ด';
  }
  if (m.indexOf('FM') === 0) {
    return header +
      '• น้ำยา: R404A / R452A | High: 200-255 PSI | Low: 25-38 PSI\n' +
      '• เช็ก: กระแส Gear Motor Amps, ซีลแกนน้ำ (Mechanical Seal), แบริ่ง Auger';
  }
  if (m.indexOf('HR') === 0 || m.indexOf('HF') === 0 || m.indexOf('RT') === 0) {
    return header +
      '• ช่วงอุณหภูมิ: Chiller +1°C ถึง +6°C | Freezer -18°C ถึง -23°C\n' +
      '• เช็ก: ขอบยางประตู, พัดลมคอยล์เย็น, Defrost Heater, เซ็นเซอร์อุณหภูมิ';
  }
  return 'กดปุ่มด้านล่างเพื่อเปิดดูไฟล์ Spec Sheet PDF หรือคู่มือทางเทคนิคของรุ่น ' + m;
}

function getModelSpecificErrorRecords_(rawQuery) {
  var q = String(rawQuery || '').trim().toUpperCase();
  var tokens = q.split(/\s+/).filter(Boolean);
  var modelFilter = '';
  var codeTokens = [];

  tokens.forEach(function(t) {
    if (/^(IM|KM|KMD|FM|HR|HF|HRF|HRW|HW|RT|RTC|RTF|RTS|RW|RF|RR|RRF|RFT|DCM|DIM|AM|HNC|DBF|HSU)-/.test(t) ||
        /^(IM|KM|FM|HR|HF|RT|RTC|RTF|DCM|AM|HNC|DBF|HSU)$/.test(t)) {
      modelFilter = t;
    } else {
      codeTokens.push(t);
    }
  });
  var codeQ = codeTokens.join(' ');

  var matrix = [
    // --- IM SERIES (Cube Ice Maker) ---
    {
      code: 'E1',
      series: 'IM Series (Cube Ice)',
      models: ['IM-21CNE', 'IM-30CNE', 'IM-45NE', 'IM-65NE', 'IM-100NE', 'IM-130NE', 'IM-240DNE'],
      title: 'Water Supply / Float Switch Timeout (น้ำไม่เข้าถังหรือลูกลอยไม่ตัดในเวลา)',
      cause: 'วาล์วน้ำเข้า (Water Valve) อุดตัน/คอยล์ขาด, แรงดันน้ำต่ำกว่า 0.07 MPa, ท่อน้ำพับ, หรือ Float Switch ค้าง',
      checkParts: 'Water Valve (P01872-01 / 452138-01), Strainer, Float Switch',
      action: '1) ปิด-เปิดเครื่อง 3 นาที 2) ล้างตะแกรงกรองทางน้ำเข้าและเช็กแรงดันน้ำ 3) วัดไฟ AC 220V ที่ขั้ว Water Valve 4) ทดสอบการยกตัวของลูกลอย'
    },
    {
      code: 'E2',
      series: 'IM Series (Cube Ice)',
      models: ['IM-21CNE', 'IM-30CNE', 'IM-45NE', 'IM-65NE', 'IM-100NE', 'IM-130NE', 'IM-240DNE'],
      title: 'Water Pan / Actuator Motor Error (ถาดน้ำพลิกเปิด-ปิดไม่สุดรอบ)',
      cause: 'มอเตอร์ถาดน้ำ (Actuator Motor) เฟืองรูด/คอยล์ขาด, สปริงดึงถาดหลุด, หรือ Micro Switch ตำแหน่งถาดไม่ทำงาน',
      checkParts: 'Actuator Motor (P03755-01 / P01869-01), Micro Switch (456432-01), Cam A/B, Water Pan Spring',
      action: '1) ตรวจเศษน้ำแข็งขวางถาดน้ำ 2) เช็กสปริงดึงถาดและลูกเบี้ยว Cam A/B 3) วัดความต่อเนื่องของ Micro Switch และไฟเลี้ยง Actuator Motor'
    },
    {
      code: 'E3',
      series: 'IM Series (Cube Ice)',
      models: ['IM-21CNE', 'IM-30CNE', 'IM-45NE', 'IM-65NE', 'IM-100NE', 'IM-130NE', 'IM-240DNE'],
      title: 'Freeze Cycle Backup Timer (ทำน้ำแข็งนานเกินกำหนด > 60 นาที)',
      cause: 'แผงคอยล์ร้อนตัน, พัดลมระบายความร้อนไม่หมุน, น้ำยา R134a/R404A/R290 รั่ว/ขาด, หรืออุณหภูมิห้องเกิน 40°C',
      checkParts: 'Fan Motor, Condenser Air Filter, Thermistor (P00350-01), Compressor',
      action: '1) ล้างแผงคอยล์ร้อนและแผ่นกรองฝุ่น 2) เช็กพัดลมคอยล์ร้อน 3) วัดแรงดันน้ำยา High/Low และค่าโอห์ม Thermistor คอยล์เย็น'
    },
    {
      code: 'E4',
      series: 'IM Series (Cube Ice)',
      models: ['IM-21CNE', 'IM-30CNE', 'IM-45NE', 'IM-65NE', 'IM-100NE', 'IM-130NE', 'IM-240DNE'],
      title: 'Harvest / Defrost Cycle Timeout (ละลายน้ำแข็งนานเกิน 20-30 นาที)',
      cause: 'Hot Gas Valve ไม่เปิด, Thermistor คอยล์เย็นเพี้ยน, หรือถาดน้ำไม่พลิกเทน้ำแข็ง',
      checkParts: 'Hot Gas Valve (P02539-01), Evaporator Thermistor, Actuator Motor',
      action: '1) เช็กการทำงานของโซลินอยด์ Hot Gas Valve ขณะเข้าสู่รอบละลาย 2) วัดค่าความต้านทาน kΩ ของ Thermistor คอยล์เย็น'
    },
    {
      code: 'E5',
      series: 'IM Series (Cube Ice)',
      models: ['IM-21CNE', 'IM-30CNE', 'IM-45NE', 'IM-65NE', 'IM-100NE', 'IM-130NE', 'IM-240DNE'],
      title: 'High Condenser Temperature (อุณหภูมิคอยล์ร้อนสูงเกิน 60°C)',
      cause: 'แผงคอนเดนเซอร์สกปรกหนัก, พัดลมคอยล์ร้อนเสีย, หรือตั้งเครื่องชิดผนังระบายความร้อนไม่ได้',
      checkParts: 'Condenser Thermistor (4Y4859G01), Fan Motor, Air Filter',
      action: '1) ล้างแผงรังผึ้งคอยล์ร้อนให้สะอาด 2) ตรวจพัดลมระบายความร้อน 3) เว้นระยะห่างรอบเครื่องอย่างน้อย 15-30 ซม.'
    },

    // --- KM / KMD SERIES (Crescent Cube) ---
    {
      code: '1 BEEP / E1',
      series: 'KM / KMD Series (Crescent Cube)',
      models: ['KM-40B', 'KM-60B', 'KM-100B', 'KM-150B', 'KM-231BAJ', 'KM-515MAH', 'KM-660MAJ', 'KM-901MAJ', 'KM-1301SAJ'],
      title: 'Low Water / Float Switch Open (ระดับน้ำในถังไม่ถึงโพรบภายในเวลา)',
      cause: 'วาล์วน้ำเข้า (Water Valve) ตัน, Float Switch สกปรก/ค้าง, หรือ Drain Valve ปิดไม่สนิททำให้น้ำรั่วทิ้ง',
      checkParts: 'Water Valve (4A5251-06 / 3U0111-04), Float Switch (4A3624-01), Drain Valve',
      action: '1) ถอดล้าง Float Switch และตะแกรงวาล์วน้ำเข้า 2) เช็กวาล์วเดรนว่าปิดสนิทไม่รั่วซึม 3) ตรวจเช็กโพรบวัดระดับน้ำ'
    },
    {
      code: '2 BEEPS / E2',
      series: 'KM / KMD Series (Crescent Cube)',
      models: ['KM-40B', 'KM-60B', 'KM-100B', 'KM-150B', 'KM-231BAJ', 'KM-515MAH', 'KM-660MAJ', 'KM-901MAJ', 'KM-1301SAJ'],
      title: 'Harvest Backup Timer (รอบละลายน้ำแข็งนานเกิน 20 นาที — EverCheck™)',
      cause: 'Hot Gas Valve ไม่เปิด, Thermistor คอยล์เย็นเพี้ยน, แรงดันน้ำยาต่ำ, หรือแผ่นน้ำแข็งติดค้างบน Evaporator',
      checkParts: 'Hot Gas Valve (4A3978-01), Thermistor (429006-03), Control Board (2A1410-02)',
      action: '1) เช็กคอยล์ Hot Gas Valve ขณะเข้า Harvest 2) วัดค่า kΩ ของ Thermistor (429006-03) 3) ตรวจความสะอาดผิว Evaporator สเตนเลส'
    },
    {
      code: '3 BEEPS / E3',
      series: 'KM / KMD Series (Crescent Cube)',
      models: ['KM-40B', 'KM-60B', 'KM-100B', 'KM-150B', 'KM-231BAJ', 'KM-515MAH', 'KM-660MAJ', 'KM-901MAJ', 'KM-1301SAJ'],
      title: 'Freeze Backup Timer (รอบทำน้ำแข็งนานเกิน 60 นาที — EverCheck™)',
      cause: 'ปั๊มน้ำไม่ฉีดน้ำขึ้น Evaporator, แผงคอยล์ร้อนสกปรก, พัดลมคอยล์ร้อนไม่หมุน, หรือน้ำยาขาด',
      checkParts: 'Pump Motor (PA0613 / 2A2758-01), Spray Tube, Condenser, Compressor',
      action: '1) ตรวจเช็กการฉีดน้ำของ Pump Motor และรูท่อ Spray Tube 2) ล้างคอยล์ร้อนและเช็กพัดลม 3) วัดแรงดันน้ำยา R404A'
    },
    {
      code: '4 BEEPS / HP',
      series: 'KM / KMD Series (Crescent Cube)',
      models: ['KM-231BAJ', 'KM-515MAH', 'KM-660MAJ', 'KM-901MAJ', 'KM-1301SAJ', 'KM-1601SAJ'],
      title: 'High Pressure Switch Cutout (สวิตช์แรงดันสูงตัดการทำงาน)',
      cause: 'คอยล์ร้อนอุดตันหนัก, พัดลมคอยล์ร้อนไม่ทำงาน (หรือน้ำหล่อเย็นไม่ไหลในรุ่น Water-Cooled), สวิตช์ HP เสีย',
      checkParts: 'High Pressure Switch (433441-07 / 463180-04), Fan Motor, Water Regulator',
      action: '1) กดปุ่มรีเซ็ตบน High Pressure Switch (หากเป็นรุ่น Manual Reset) 2) ล้างคอยล์ร้อนและตรวจพัดลมระบายความร้อน'
    },

    // --- FM SERIES (Flake & Nugget Ice Maker) ---
    {
      code: 'E1 / E2',
      series: 'FM Series (Flake & Nugget Ice)',
      models: ['FM-150KE', 'FM-170AKE', 'FM-300AKE', 'FM-480AKE', 'FM-600AKE', 'FM-750AKE', 'FM-1000AKE'],
      title: 'Low Water / Float Switch Error (น้ำไม่เข้าถังพักหรือลูกลอยไม่ยก)',
      cause: 'วาล์วน้ำเข้าเสีย/กรองตัน, ท่อน้ำเข้าถังคอยล์อุดตันตะกรัน, หรือ Float Switch ค้าง',
      checkParts: 'Water Valve (452993-01), Float Switch (458279-01 / -02), Drain Valve (3U0112-01)',
      action: '1) ล้างตะแกรงวาล์วน้ำเข้าและกระปุก Float Switch 2) ตรวจเช็กการเปิด-ปิดของ Drain Valve'
    },
    {
      code: 'E3 / E4',
      series: 'FM Series (Flake & Nugget Ice)',
      models: ['FM-150KE', 'FM-170AKE', 'FM-300AKE', 'FM-480AKE', 'FM-600AKE', 'FM-750AKE', 'FM-1000AKE'],
      title: 'Gear Motor Overload / Rotation Sensor Error (กระแสเกินหรือแกนสว่านหยุดหมุน)',
      cause: 'น้ำขาดในกระบอกทำน้ำแข็งทำให้น้ำแข็งจับแกน Auger แน่น, ลูกปืน/ซีลแกนสว่านสึกหรอ, หรือ Rotation Sensor เสีย',
      checkParts: 'Gear Motor (466223-01 / 469681-02), Rotation Sensor (459861-01), Mechanical Seal (432491-01), Current Sub-Board (461144-01)',
      action: '1) ปิดเครื่องละลายน้ำแข็งในกระบอกให้หมดก่อนรีสตาร์ท 2) วัดกระแส Gear Motor Amps เทียบเนมเพลต 3) ตรวจเช็ก Mechanical Seal และลูกปืน Auger'
    },
    {
      code: 'E5 / HP',
      series: 'FM Series (Flake & Nugget Ice)',
      models: ['FM-300AKE', 'FM-480AKE', 'FM-600AKE', 'FM-750AKE', 'FM-1000AKE'],
      title: 'High Pressure / High Condenser Temp (แรงดันสูงหรือคอยล์ร้อนเกิน)',
      cause: 'คอยล์ร้อนอุดตัน, พัดลมคอยล์ร้อนเสีย, หรือความต้านทาน Thermistor ผิดปกติ',
      checkParts: 'Pressure Switch (459863-01 / 459864-03), Fan Motor, Thermistor (476475G01)',
      action: '1) ล้างแผงคอยล์ร้อนและแผ่นกรองอากาศ 2) ตรวจการทำงานของพัดลมคอยล์ร้อนและ Pressure Switch'
    },

    // --- REFRIGERATOR / FREEZER (HR / HF / RT / RTC / RTF) ---
    {
      code: 'E1 / EE / P1',
      series: 'Refrigerator & Freezer (HR / HF / RT / RTC)',
      models: ['HR-68MA-S', 'HF-68MA-S', 'HR-126MA-S', 'HF-126MA-S', 'RT-126MA-S', 'RTC-120SDB', 'RTC-150SDB', 'RTF-120SDB'],
      title: 'Cabinet / Air Sensor Fault (เซ็นเซอร์อุณหภูมิภายในตู้ขาดหรือลัดวงจร)',
      cause: 'สายเซ็นเซอร์ห้องแช่ (Black Thermistor) ขาดใน, ขั้วต่อหลวมบน Controller, หรือตัวเซ็นเซอร์เสื่อม',
      checkParts: 'Cabinet Thermistor Black (P04878-02 / P02267-01), Digital Controller (P04865-01 / P02224-01)',
      action: '1) ถอดปลั๊กและวัดค่าโอห์ม Thermistor (ปกติ ~2.0-2.5 kΩ ที่ 25°C) 2) ตรวจขั้วต่อหลังหน้าปัด Controller 3) เปลี่ยนเซ็นเซอร์ใหม่'
    },
    {
      code: 'E2 / P2 / dF',
      series: 'Refrigerator & Freezer (HR / HF / RT / RTC)',
      models: ['HF-68MA-S', 'HF-126MA-S', 'HF-148MA-S', 'RTF-120SDB', 'RTF-150SDB', 'RTF-180SDB'],
      title: 'Evaporator Sensor / Defrost Error (เซ็นเซอร์คอยล์เย็นเสียหรือน้ำแข็งเกาะคอยล์)',
      cause: 'Evap Thermistor (White) เสีย, Defrost Heater ขาด, Thermal Fuse ขาด, หรือพัดลมคอยล์เย็นไม่หมุน',
      checkParts: 'Evap Thermistor White (P04878-01 / P02267-02), Defrost Heater (P02930-01 / P02931-01), Thermal Fuse (P01103-01)',
      action: '1) วัดค่าโอห์ม Evap Thermistor 2) วัดความต่อเนื่องของ Defrost Heater และ Thermal Fuse 3) ตรวจเช็กพัดลมคอยล์เย็นและยางขอบประตู'
    },
    {
      code: 'Hi / Lo / E3',
      series: 'Refrigerator & Freezer (HR / HF / RT / RTC)',
      models: ['HR-68MA-S', 'HF-68MA-S', 'HR-126MA-S', 'HF-126MA-S', 'RT-126MA-S', 'RTC-120SDB', 'RTC-150SDB'],
      title: 'High / Low Cabinet Temp or Condenser Alert (อุณหภูมิตู้เกินขอบเขต / คอยล์ร้อนตัน)',
      cause: 'เปิดประตูตู้บ่อย/ยางขอบประตูเสื่อม, แผงคอยล์ร้อนตันฝุ่น, หรือน้ำยารั่ว',
      checkParts: 'Condenser Thermistor Gray (P04878-03), Door Gasket, Condenser Fan Motor',
      action: '1) ล้างแผงคอยล์ร้อน 2) ตรวจสอบความแนบสนิทของยางขอบประตู (Door Gasket) 3) เช็กการทำงานของคอมเพรสเซอร์และพัดลมคอยล์เย็น'
    },

    // --- COMMERCIAL DISHWASHER SERIES (HSU / JWE Undercounter & Hood-Type) ---
    {
      code: 'E01 / E1 (Dishwasher)',
      series: 'Dishwasher Series (HSU / JWE Undercounter & Hood)',
      models: ['HSU-400', 'HSU-500', 'JWE-400', 'JWE-450', 'JWE-500', 'JWE-620', 'JWE-680'],
      title: 'Water Fill Timeout / Low Water Level (น้ำเข้าถังล้างไม่ถึงระดับในเวลาที่กำหนด)',
      cause: 'วาล์วน้ำเข้า (Water Valve) อุดตัน/คอยล์ขาด, แรงดันน้ำประปาต่ำ, ท่อเดรน (Drain Plug) ปิดไม่สนิท, หรือ Float Switch / Level Sensor ค้าง',
      checkParts: 'Water Valve (456461-01 / P05115-01 / 6262.00008.00), Level Sensor (3X4140G01), Float Switch (449401-01)',
      action: '1) ตรวจจุกเดรนน้ำทิ้งว่าใส่สนิท 2) ล้างตะแกรงกรองวาล์วน้ำเข้า 3) ตรวจ Level Sensor / Float Switch และแรงดันน้ำ (0.1-0.6 MPa)'
    },
    {
      code: 'E02 / E2 (Dishwasher)',
      series: 'Dishwasher Series (HSU / JWE Undercounter & Hood)',
      models: ['HSU-400', 'HSU-500', 'JWE-400', 'JWE-450', 'JWE-500', 'JWE-620', 'JWE-680'],
      title: 'Wash Tank Heating Timeout (ฮีตเตอร์ถังล้างทำความร้อนไม่ถึงอุณหภูมิ 55-65°C)',
      cause: 'ฮีตเตอร์ถังล้าง (Wash Tank Heater) ขาด, แมกเนติกคอนแทคเตอร์ไม่ดูด, High Limiter / Thermostat ตัด, หรือเซ็นเซอร์ถังล้างเพี้ยน',
      checkParts: 'Tank Heater (P04856-01 / 9099.01000.13), Magnetic Contactor (P03655-02), Tank Probe (6262.00043.011)',
      action: '1) วัดค่าความต้านทานของ Wash Tank Heater 2) เช็กไฟออก Magnetic Contactor 3) กดรีเซ็ต High Limiter และวัดค่าเซ็นเซอร์'
    },
    {
      code: 'E03 / E3 (Dishwasher)',
      series: 'Dishwasher Series (HSU / JWE Undercounter & Hood)',
      models: ['HSU-400', 'HSU-500', 'JWE-400', 'JWE-450', 'JWE-500', 'JWE-620', 'JWE-680'],
      title: 'Rinse Boiler Heating Timeout (หม้อต้มน้ำล้างจานสุดท้ายไม่ถึง 80-85°C)',
      cause: 'ฮีตเตอร์หม้อต้ม (Boiler Heater) ขาด, SSR/Contactor เสีย, น้ำในหม้อต้มไม่เต็ม, หรือ Boiler Thermistor เสีย',
      checkParts: 'Boiler Heater (P04857-01 / 9099.01000.06), Contactor (P03594-02), Boiler Probe (6262.00043.011)',
      action: '1) วัดค่าโอห์ม Boiler Heater และเช็กกระแสไฟ 2) ตรวจเช็ก Air Break / Pressure Switch หม้อต้ม 3) วัดค่า kΩ ของ Boiler Thermistor'
    },
    {
      code: 'E04 / E4 (Dishwasher)',
      series: 'Dishwasher Series (HSU / JWE Undercounter & Hood)',
      models: ['HSU-400', 'HSU-500', 'JWE-400', 'JWE-450', 'JWE-500', 'JWE-620', 'JWE-680'],
      title: 'Thermistor / Temperature Probe Open or Short (เซ็นเซอร์ถังล้างหรือหม้อต้มขาด/ช็อต)',
      cause: 'สายเซ็นเซอร์ขาด/ชื้น, ขั้วต่อหลวมบน Control Board, หรือหัวโพรบเสื่อมค่าเพี้ยน',
      checkParts: 'Thermistor / Temp Probe (463634-01 / 6262.00043.011), Control Board (P04116-02 / P04116-23)',
      action: '1) ถอดปลั๊กและวัดค่าโอห์มเซ็นเซอร์เทียบตาราง kΩ vs °C 2) ตรวจขั้วต่อ CN บนแผงควบคุมหลัก 3) เปลี่ยนหัวโพรบใหม่'
    },
    {
      code: 'E05 / E5 (Dishwasher)',
      series: 'Dishwasher Series (HSU / JWE Undercounter & Hood)',
      models: ['HSU-400', 'HSU-500', 'JWE-400', 'JWE-450', 'JWE-500', 'JWE-620', 'JWE-680'],
      title: 'Door / Hood Safety Switch Open or Overflow (ฝาปิดไม่สนิทหรือน้ำล้นถัง)',
      cause: 'เปิดฝา/ยกฮูดขณะเครื่องทำงาน, Reed Switch / Magnet ประตูหลุดหรือเสีย, หรือท่อน้ำทิ้งตันทำให้น้ำล้น',
      checkParts: 'Reed Switch / Door Magnet, Pressure Switch (5A1X.37640.615), Drain Hose (459119-01)',
      action: '1) ปิดฝา/ฮูดให้สนิทและตรวจแม่เหล็กประตู 2) ล้างตะแกรงกรองเศษอาหารและท่อน้ำทิ้ง 3) เช็ก Pressure Switch ระดับน้ำล้น'
    },
    {
      code: 'E06 / E6 / Pump',
      series: 'Dishwasher Series (HSU / JWE Undercounter & Hood)',
      models: ['HSU-400', 'HSU-500', 'JWE-400', 'JWE-450', 'JWE-500', 'JWE-620', 'JWE-680'],
      title: 'Wash Pump / Rinse Pump / Detergent Dispenser Fault (ปั๊มฉีดน้ำล้างหรือปั๊มน้ำยาขัดข้อง)',
      cause: 'เศษอาหารเข้าไปขัดใบพัด Washing Pump, แคปาซิเตอร์ปั๊มเสื่อม, หรือปั๊มดูดน้ำยาล้าง/น้ำยาแวววาวไม่ทำงาน',
      checkParts: 'Washing Pump (P04851-01 / 9099.L80T7.5SX), Capacitor (P04851F02), Rinse/Detergent Pump (9999.P22CA.030)',
      action: '1) ถอดตะแกรงและตรวจเศษอาหารในเรือนปั๊ม 2) วัดค่า µF ของ Capacitor และกระแส Washing Pump 3) ไล่อากาศสายน้ำยาล้างจาน'
    },

    // --- SPECIALTY (DCM / AM / HNC / DBF) ---
    {
      code: 'E1 / E2 / E3 (Specialty)',
      series: 'Dispenser / Top-Hat / Sushi / Beer (DCM / AM / HNC / DBF)',
      models: ['DCM-60KE', 'DCM-120KE', 'AM-50BAE', 'HNC-120BE', 'HNC-150BE', 'DBF-25SB', 'DBF-43WD'],
      title: 'Specialty Equipment Fault (ระดับน้ำ / อะจีเตเตอร์ / อุณหภูมิผิดปกติ)',
      cause: 'DCM: วาล์วน้ำ/ลูกลอย/มอเตอร์กวนน้ำแข็ง | AM: สเปรย์น้ำ/ถาดน้ำ | HNC: คอยล์ร้อนตัน/เซ็นเซอร์ | DBF: ปั๊มกวนน้ำเย็น (Agitator)',
      checkParts: 'DCM Agitator (348969G01), DBF Agitator (P04641-01), HNC Condenser Fan (R500A0528)',
      action: 'ตรวจสอบตามคู่มือเฉพาะรุ่น หรือพิมพ์ MANUAL <ชื่อรุ่น> เพื่อเปิดดู Wiring Diagram และ Parts List PDF'
    }
  ];

  var matched = matrix.filter(function(item) {
    var modelOk = true;
    if (modelFilter) {
      var prefix = modelFilter.split('-')[0];
      var inModels = item.models.some(function(m) {
        return m.indexOf(modelFilter) > -1 || modelFilter.indexOf(m) > -1 || m.indexOf(prefix + '-') === 0;
      });
      var inSeries = item.series.toUpperCase().indexOf(prefix) > -1;
      modelOk = inModels || inSeries;
    }
    var codeOk = true;
    if (codeQ) {
      var hay = (item.code + ' ' + item.title + ' ' + item.cause + ' ' + item.series).toUpperCase();
      codeOk = hay.indexOf(codeQ) > -1;
    }
    return modelOk && codeOk;
  });

  return matched;
}

function buildErrorCodeFlexMessage_(rawQuery, records, pwaUrl) {
  var title = '🚨 HOSHIZAKI ERROR DIAGNOSTIC';
  var contents = [
    { type: 'text', text: title, weight: 'bold', size: 'sm', color: '#BE123C' },
    { type: 'text', text: 'คำค้นหา: ' + rawQuery + ' (พบ ' + records.length + ' รายการ)', size: 'xs', color: '#475569', margin: 'xs' },
    { type: 'separator', margin: 'sm' }
  ];

  records.slice(0, 4).forEach(function(r) {
    contents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: '#FFF1F2',
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: '[' + r.code + '] ' + r.series, weight: 'bold', size: 'xs', color: '#9F1239', wrap: true },
        { type: 'text', text: r.title, weight: 'bold', size: 'xs', color: '#0F172A', wrap: true, margin: 'xs' },
        { type: 'text', text: '📌 สาเหตุ: ' + r.cause, size: 'xxs', color: '#334155', wrap: true, margin: 'xs' },
        { type: 'text', text: '🛠️ วิธีแก้: ' + r.action, size: 'xxs', color: '#065F46', wrap: true, margin: 'xs' },
        { type: 'text', text: '🔩 อะไหล่: ' + r.checkParts, size: 'xxs', color: '#0369A1', wrap: true, margin: 'xs' }
      ]
    });
  });

  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    var deepErr = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + 'errQuery=' + encodeURIComponent(rawQuery);
    contents.push({
      type: 'button',
      style: 'primary',
      color: '#002B49',
      height: 'sm',
      margin: 'md',
      action: { type: 'uri', label: '🖥️ เปิดตาราง Error แยกรุ่นใน Web App', uri: deepErr }
    });
  }

  return {
    type: 'flex',
    altText: 'Error Code Diagnostic: ' + rawQuery,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: contents
      }
    }
  };
}

function lookupHoshizakiErrorCodeText(rawQuery) {
  var recs = getModelSpecificErrorRecords_(rawQuery);
  if (recs.length === 0) {
    return 'ℹ️ ไม่พบข้อมูล Error "' + rawQuery + '" — ลองระบุรหัสพร้อมรุ่นเครื่อง เช่น ERR IM-100NE E1, ERR KM-901MAJ E2, ERR FM-300AKE E3 หรือ ERR HF-126MA-S E1';
  }
  return recs.slice(0, 3).map(function(r) {
    return '🚨 [' + r.code + '] ' + r.series + '\n' +
           '• อาการ: ' + r.title + '\n' +
           '• สาเหตุ: ' + r.cause + '\n' +
           '• การแก้ไข: ' + r.action + '\n' +
           '• อะไหล่ที่เกี่ยวข้อง: ' + r.checkParts;
  }).join('\n━━━━━━━━━━━━━━━━━━━━\n');
}


function lookupControlBoardPinoutText_(seriesQuery) {
  var q = String(seriesQuery || '').trim().toUpperCase();
  var sections = [];

  if (!q || q.indexOf('IM') > -1) {
    sections.push(
      '🔌 [IM SERIES CONTROL BOARD — P01873-01 / P00225-87]\n' +
      '• CN1 (Power In): 220-240VAC Line / Neutral\n' +
      '• CN2 (Relay Out): Pin 1-2 Compressor | Pin 3-4 Water Pump | Pin 5-6 Hot Gas Valve | Pin 7-8 Water Valve | Pin 9-10 Actuator Motor\n' +
      '• CN3 (Sensors): Pin 1-2 Evap Thermistor (2kΩ) | Pin 3-4 Condenser Thermistor | Pin 5-6 Bin Control Switch\n' +
      '• CN4 (Switches): Pin 1-2 Float Switch | Pin 3-4 Cam Micro Switch (A/B)\n' +
      '• LED Blink: 1x = E1 น้ำไม่เข้า | 2x = E2 ถาดน้ำค้าง | 3x = E3 Freeze Timeout | 4x = E4 Harvest Timeout | 5x = E5 คอยล์ร้อนสูง'
    );
  }
  if (!q || q.indexOf('KM') > -1) {
    sections.push(
      '🔌 [KM / KMD EVERCHECK™ BOARD — 2A1410-02 / 2A7664-02]\n' +
      '• K1 (10-Pin Low Voltage): Pin 1-2 Thermistor (429006-03) | Pin 3-4 Upper/Lower Float Switch | Pin 5-6 Bin Control\n' +
      '• K3 / K4 (Power & Relays): 24VAC Transformer In | Comp Relay | Pump Motor | Hot Gas Valve | Water Valve | Drain Valve\n' +
      '• DIP Switch S4: ปรับเวลา Harvest / Pump-Out / High-Temp Cutout\n' +
      '• Beep / LED Blink: 1 Beep = น้ำต่ำ (Float Open) | 2 Beeps = Harvest > 20 นาที | 3 Beeps = Freeze > 60 นาที | 4 Beeps = High Pressure Cutout'
    );
  }
  if (!q || q.indexOf('FM') > -1) {
    sections.push(
      '🔌 [FM SERIES MAIN BOARD — 461914-09 / 468601-07 / P01372-99]\n' +
      '• CN1 / CN2 (Power & Transformer): 220VAC In & 24VAC / 12VAC Secondary\n' +
      '• CN3 (Sensors): Evap/Head Thermistor | Condenser Thermistor | Bin Infrared/Reed Switch\n' +
      '• CN4 (Auger & Water): Rotation Sensor (Hall IC 3-Pin) | Upper & Lower Float Switch | Current Sub-Board (CT)\n' +
      '• CN5 / Relays: Compressor Contactor | Gear Motor (Auger) | Water Valve | Flush/Drain Valve\n' +
      '• LED Blink: 1-2x = น้ำไม่เข้า/ลูกลอย | 3-4x = Gear Motor Overload / Auger ไม่หมุน | 5x = High Pressure / คอยล์ร้อนเกิน'
    );
  }

  return '📟 ผังขั้วต่อสายไฟ & รหัสไฟกะพริบ (Terminal Pinout & LED Blink Codes)\n━━━━━━━━━━━━━━━━━━━━\n' +
         sections.join('\n━━━━━━━━━━━━━━━━━━━━\n');
}


function buildControlBoardPinoutFlexMessage_(seriesQuery, pwaUrl) {
  var q = String(seriesQuery || '').trim().toUpperCase();
  var seriesKey = (q.indexOf('IM') > -1) ? 'IM' : ((q.indexOf('KM') > -1) ? 'KM' : ((q.indexOf('FM') > -1) ? 'FM' : 'ALL'));
  var bodyContents = [
    { type: 'text', text: '📟 TERMINAL PINOUT & LED BLINK CODES', weight: 'bold', size: 'sm', color: '#002B49' },
    { type: 'text', text: 'แผงบอร์ด: ' + (seriesKey === 'ALL' ? 'IM / KM / FM Series' : (seriesKey + ' Series')), size: 'xs', color: '#0369A1', weight: 'bold', margin: 'xs' },
    { type: 'separator', margin: 'sm' }
  ];

  if (seriesKey === 'ALL' || seriesKey === 'IM') {
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'md', backgroundColor: '#F0F9FF', cornerRadius: '8px', paddingAll: '10px',
      contents: [
        { type: 'text', text: '1. IM Board (P01873-01 / P00225-87)', weight: 'bold', size: 'xs', color: '#002B49', wrap: true },
        { type: 'text', text: '• CN1: 220-240VAC In | CN2: Comp(1-2), Pump(3-4), HGV(5-6), WV(7-8), Actuator(9-10)', size: 'xxs', color: '#1E293B', wrap: true, margin: 'xs' },
        { type: 'text', text: '• CN3 (5V): Evap/Cond Thermistor, Bin Switch | CN4: Float & Cam Switch', size: 'xxs', color: '#1E293B', wrap: true, margin: 'xs' },
        { type: 'text', text: '• LED: 1x=E1 น้ำ | 2x=E2 ถาดน้ำ | 3x=E3 Freeze | 4x=E4 Harvest | 5x=E5 คอยล์ร้อน', size: 'xxs', color: '#BE123C', weight: 'bold', wrap: true, margin: 'xs' }
      ]
    });
  }
  if (seriesKey === 'ALL' || seriesKey === 'KM') {
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'md', backgroundColor: '#EEF2FF', cornerRadius: '8px', paddingAll: '10px',
      contents: [
        { type: 'text', text: '2. KM / KMD EverCheck™ (2A1410-02 / 2A7664-02)', weight: 'bold', size: 'xs', color: '#312E81', wrap: true },
        { type: 'text', text: '• K3: 24VAC In | K4/X: Comp, Pump, HGV, WV, Drain | K1 (10-Pin): Thermistor, Float, Bin, HP', size: 'xxs', color: '#1E293B', wrap: true, margin: 'xs' },
        { type: 'text', text: '• Beep/LED: 1x=น้ำต่ำ | 2x=Harvest >20m | 3x=Freeze >60m | 4x=High Pressure', size: 'xxs', color: '#BE123C', weight: 'bold', wrap: true, margin: 'xs' }
      ]
    });
  }
  if (seriesKey === 'ALL' || seriesKey === 'FM') {
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'md', backgroundColor: '#ECFDF5', cornerRadius: '8px', paddingAll: '10px',
      contents: [
        { type: 'text', text: '3. FM Main Board (461914-09 / 468601-07)', weight: 'bold', size: 'xs', color: '#065F46', wrap: true },
        { type: 'text', text: '• CN1/2: 220V/24V | CN5: Comp, Gear Motor, WV, DV | CN3: Evap/Cond/Bin | CN4: Hall IC, Float, CT', size: 'xxs', color: '#1E293B', wrap: true, margin: 'xs' },
        { type: 'text', text: '• LED: 1-2x=น้ำ/ลูกลอย | 3x=Gear Overload | 4x=Rotation Sensor | 5x=HP/คอยล์ร้อน', size: 'xxs', color: '#BE123C', weight: 'bold', wrap: true, margin: 'xs' }
      ]
    });
  }

  var bubble = {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: bodyContents }
  };

  if (pwaUrl && pwaUrl.indexOf('http') === 0) {
    var deepPin = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + 'pinoutSeries=' + encodeURIComponent(seriesKey);
    bubble.footer = {
      type: 'box', layout: 'vertical', paddingAll: '10px',
      contents: [{
        type: 'button', style: 'primary', color: '#002B49', height: 'sm',
        action: { type: 'uri', label: '🖥️ พรีวิวผังขั้วต่อเต็มจอ (Full Screen)', uri: deepPin }
      }]
    };
  }

  return { type: 'flex', altText: 'Control Board Pinout & LED: ' + seriesKey, contents: bubble };
}

function buildInfoCardWithFullScreenFlex_(title, bodyText, queryParamStr, pwaUrl) {
  var cleanBody = String(bodyText || '').substring(0, 1800);
  var bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
      contents: [{ type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'sm', wrap: true }]
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [{ type: 'text', text: cleanBody, size: 'xs', color: '#1E293B', wrap: true }]
    }
  };
  if (pwaUrl && pwaUrl.indexOf('http') === 0 && queryParamStr) {
    var deepUrl = pwaUrl + (pwaUrl.indexOf('?') > -1 ? '&' : '?') + queryParamStr;
    bubble.footer = {
      type: 'box', layout: 'vertical', paddingAll: '10px',
      contents: [{
        type: 'button', style: 'primary', color: '#005696', height: 'sm',
        action: { type: 'uri', label: '🖥️ พรีวิวเต็มจอใน Web App', uri: deepUrl }
      }]
    };
  }
  return { type: 'flex', altText: title, contents: bubble };
}

// ============================================================================
// 5. DAILY PM DUE ALERT & VAN STOCK CLOUD ENGINE (v18.4.0)
// ============================================================================

function buildPmDueSummaryText_(ss) {
  var jobs = readRecentJobsFromSheet(ss, 2000);
  if (jobs.length === 0) return '📅 ยังไม่มีข้อมูลประวัติใบงานสำหรับคำนวณรอบ PM';

  var latestBySerial = {};
  jobs.forEach(function(j) {
    var key = String(j.serial || j.store || '').trim().toUpperCase();
    if (!key || !j.date) return;
    if (!latestBySerial[key] || String(j.date) > String(latestBySerial[key].date)) {
      latestBySerial[key] = j;
    }
  });

  var now = new Date();
  var dueList = [];
  Object.keys(latestBySerial).forEach(function(k) {
    var item = latestBySerial[k];
    var parts = String(item.date).split('-');
    if (parts.length < 3) return;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 85 && diffDays <= 370) {
      var cycleTag = diffDays >= 175 ? 'ครบ 6 เดือน (ล้างใหญ่+ไส้กรอง)' : 'ครบ 3 เดือน (ตรวจเช็ก/ล้างแผง)';
      dueList.push({
        days: diffDays,
        tag: cycleTag,
        store: item.store || '-',
        model: item.model || '-',
        serial: item.serial || '-',
        lastDate: item.date
      });
    }
  });

  dueList.sort(function(a, b) { return b.days - a.days; });

  if (dueList.length === 0) {
    return '✅ ไม่มีรายการเครื่องที่ครบกำหนดรอบ PM ในช่วงนี้';
  }

  var lines = dueList.slice(0, 10).map(function(d, idx) {
    return (idx + 1) + '. 🏪 ' + d.store + '\n   • รุ่น/S/N: ' + d.model + ' / ' + d.serial + '\n   • ล่าสุด: ' + d.lastDate + ' (' + d.days + ' วัน) -> ' + d.tag;
  }).join('\n');

  return '📅 แจ้งเตือนเครื่องครบกำหนด PM (พบ ' + dueList.length + ' รายการ)\n━━━━━━━━━━━━━━━━━━━━\n' + lines;
}

function sendDailyPmDueLineAlerts() {
  var secrets = getAppSecrets_();
  if (!isLineTokenConfigured() || !isLineGroupConfigured()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var msg = buildPmDueSummaryText_(ss);
  if (msg.indexOf('พบ ') > -1) {
    pushLineMessage(secrets.lineGroupId, msg);
  }
}

function syncVanStockToSheet_(ss, vanStockMap, filterTechCode, isDeltaDeduct) {
  var sheet = ss.getSheetByName('Van_Stock');
  if (!sheet) {
    sheet = ss.insertSheet('Van_Stock');
    sheet.getRange(1, 1, 1, 5).setValues([['Tech Code', 'Part Description', 'Qty Remaining', 'Status', 'Updated At']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var currentMap = readVanStockFromSheet_(ss);
  var lowStockItems = [];

  Object.keys(vanStockMap || {}).forEach(function(tc) {
    if (filterTechCode && tc !== filterTechCode) return;
    if (!currentMap[tc]) currentMap[tc] = {};
    var partsObj = vanStockMap[tc] || {};
    if (isDeltaDeduct) {
      Object.keys(partsObj).forEach(function(pk) {
        if (currentMap[tc][pk] !== undefined) {
          var nextQ = Math.max(0, (Number(currentMap[tc][pk]) || 0) - (Number(partsObj[pk]) || 0));
          currentMap[tc][pk] = nextQ;
          if (nextQ <= 1) lowStockItems.push({ techCode: tc, part: pk, qty: nextQ });
        }
      });
    } else {
      currentMap[tc] = {};
      Object.keys(partsObj).forEach(function(pk) {
        var q = Number(partsObj[pk]) || 0;
        if (q > 0) {
          currentMap[tc][pk] = q;
          if (q <= 1) lowStockItems.push({ techCode: tc, part: pk, qty: q });
        }
      });
    }
  });

  var rows = [];
  Object.keys(currentMap).sort().forEach(function(tc) {
    var pMap = currentMap[tc] || {};
    Object.keys(pMap).sort().forEach(function(pk) {
      var q = Number(pMap[pk]) || 0;
      rows.push([tc, pk, q, q <= 1 ? 'LOW STOCK' : 'OK', nowStr]);
    });
  });

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  return { vanStockMap: currentMap, lowStockItems: lowStockItems };
}

function deductVanStockInSheet_(ss, techCode, partsArr) {
  var deltaObj = {};
  deltaObj[techCode] = {};
  (partsArr || []).forEach(function(p) {
    var desc = String(p.desc || '').trim();
    var qty = parseInt(p.qty || '0', 10) || 0;
    if (desc && qty > 0) {
      deltaObj[techCode][desc] = (deltaObj[techCode][desc] || 0) + qty;
    }
  });
  return syncVanStockToSheet_(ss, deltaObj, techCode, true);
}

function readVanStockFromSheet_(ss) {
  var sheet = ss.getSheetByName('Van_Stock');
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  vals.forEach(function(r) {
    var tc = String(r[0] || '').trim();
    var pk = String(r[1] || '').trim();
    var q = Number(r[2]) || 0;
    if (tc && pk) {
      if (!out[tc]) out[tc] = {};
      out[tc][pk] = q;
    }
  });
  return out;
}

function buildVanStockSummaryText_(ss, techCodeFilter) {
  var map = readVanStockFromSheet_(ss);
  var codes = techCodeFilter ? [techCodeFilter] : Object.keys(map).sort();
  if (codes.length === 0 || (techCodeFilter && !map[techCodeFilter])) {
    return '📦 ไม่พบข้อมูลสต็อกรถช่าง' + (techCodeFilter ? ' [' + techCodeFilter + ']' : '') + ' ในระบบ Cloud\n(กดปุ่ม "ซิงค์ & สำรองข้อมูล" ในหน้าเว็บแอปเพื่ออัปโหลดสต็อกรถช่างขึ้น Cloud ครับ)';
  }
  var sections = [];
  codes.forEach(function(tc) {
    var pMap = map[tc] || {};
    var pKeys = Object.keys(pMap);
    if (pKeys.length === 0) return;
    var lines = pKeys.map(function(pk) {
      var q = Number(pMap[pk]) || 0;
      return '  • ' + pk + ': ' + q + ' ชิ้น' + (q <= 1 ? ' ⚠️(ใกล้หมด)' : '');
    }).join('\n');
    sections.push('🚐 รถช่าง [' + tc + ']:\n' + lines);
  });
  return '📦 สรุปสต็อกอะไหล่รถช่าง HOSHIZAKI\n━━━━━━━━━━━━━━━━━━━━\n' + (sections.join('\n\n') || 'ไม่มีรายการคงเหลือ');
}

// ============================================================================
// 6. CORE GOOGLE SHEETS & DRIVE PDF ARCHIVE ENGINE
// ============================================================================

function saveBackofficeSnapshotToDrive(snapshotObj) {
  var rootIter = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  var root = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder(ROOT_DRIVE_FOLDER_NAME);
  var snapIter = root.getFoldersByName('_BACKOFFICE_SNAPSHOTS');
  var snapFolder = snapIter.hasNext() ? snapIter.next() : root.createFolder('_BACKOFFICE_SNAPSHOTS');

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var dateTag = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  var fileName = 'Hoshizaki_Backoffice_Snapshot_' + dateTag + '.json';
  var jsonText = JSON.stringify(snapshotObj || {});

  var existing = snapFolder.getFilesByName(fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  var file = snapFolder.createFile(fileName, jsonText, MimeType.PLAIN_TEXT);
  var fileUrl = file.getUrl();

  // Also record into Google Sheet tab "System_Auto_Backup_Log" + "JSON_Backup_Vault" so JSON backup is directly visible & restorable from Google Sheets!
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var counts = (snapshotObj && snapshotObj.recordCounts) ? snapshotObj.recordCounts : {};
    var summaryStr = 'Jobs: ' + (counts.jobs || 0) + ', QT: ' + (counts.quotations || 0) + ', Legacy: ' + (counts.legacy || 0) + ', Outsource: ' + (counts.outsourceReports || 0);

    var logSheet = ss.getSheetByName('System_Auto_Backup_Log');
    if (!logSheet) {
      logSheet = ss.insertSheet('System_Auto_Backup_Log');
      logSheet.getRange(1, 1, 1, 6).setValues([['Backup Timestamp', 'Backup Type', 'File Name', 'Summary / Counts', 'JSON Size (KB)', 'Google Drive JSON URL']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([nowStr, 'AUTO_PWA_JSON_SNAPSHOT', fileName, summaryStr, (jsonText.length / 1024).toFixed(1) + ' KB', fileUrl]);

    var vaultSheet = ss.getSheetByName('JSON_Backup_Vault');
    if (!vaultSheet) {
      vaultSheet = ss.insertSheet('JSON_Backup_Vault');
      vaultSheet.getRange(1, 1, 1, 5).setValues([['Date Tag', 'Updated At', 'Summary', 'Drive JSON URL', 'JSON Payload (First 45,000 chars)']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      vaultSheet.setFrozenRows(1);
    }
    var rowIdx = findRowByExactKey(vaultSheet, 1, dateTag);
    var vRow = [dateTag, nowStr, summaryStr, fileUrl, jsonText.substring(0, 45000)];
    if (rowIdx >= 2) vaultSheet.getRange(rowIdx, 1, 1, 5).setValues([vRow]);
    else vaultSheet.appendRow(vRow);
  } catch (eSheet) {}

  return fileUrl;
}

function readLatestBackofficeSnapshotFromDrive() {
  var rootIter = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  if (!rootIter.hasNext()) return { status: 'empty' };
  var snapIter = rootIter.next().getFoldersByName('_BACKOFFICE_SNAPSHOTS');
  if (!snapIter.hasNext()) return { status: 'empty' };
  var files = snapIter.next().getFiles();
  var latestFile = null;
  while (files.hasNext()) {
    var f = files.next();
    if (!latestFile || f.getLastUpdated() > latestFile.getLastUpdated()) {
      latestFile = f;
    }
  }
  if (!latestFile) return { status: 'empty' };
  try {
    return { status: 'ok', snapshot: JSON.parse(latestFile.getBlob().getDataAsString()) };
  } catch (e) {
    return { status: 'error', message: String(e) };
  }
}

function findRowByExactKey(sheet, colIndex, keyVal) {
  if (!keyVal || sheet.getLastRow() < 2) return -1;
  var finder = sheet.getRange(2, colIndex, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(keyVal).trim())
    .matchEntireCell(true);
  var found = finder.findNext();
  return found ? found.getRow() : -1;
}

function upsertJobToSheet(ss, data, folderUrl, pdfUrl) {
  var sheet = ss.getSheetByName('Service_Jobs');
  if (!sheet) {
    sheet = ss.insertSheet('Service_Jobs');
    var headers = [
      'Job No.', 'Date', 'Status', 'Tech Code', 'Responsible Tech', 'Team Techs',
      'Customer / Store', 'Dealer', 'Contact', 'Address',
      'Model', 'Serial No.', 'Product Type', 'Warranty',
      'Time In', 'Time Out', 'GPS',
      'Symptom', 'Detected Cause', 'Action / Troubleshooting', 'Parts Summary',
      'Grand Total (THB)', 'Drive Folder URL', 'PDF Backup URL', 'Updated At',
      'Defective Return Status', 'Payment Aging Status'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var jobNo = String(data.jobNo || '').trim();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var targetRow = findRowByExactKey(sheet, 1, jobNo);

  var existingPdf = (targetRow > 0) ? sheet.getRange(targetRow, 24).getValue() : '';
  var existingDef = (targetRow > 0 && sheet.getLastColumn() >= 26) ? sheet.getRange(targetRow, 26).getValue() : '';
  var existingPay = (targetRow > 0 && sheet.getLastColumn() >= 27) ? sheet.getRange(targetRow, 27).getValue() : '';

  var rowValues = [
    jobNo, data.date || '', ((data.isRevised || Number(data.revisionCount || 0) > 0) ? ((data.jobStatus || 'Completed') + ' [REVISED #' + (data.revisionCount || 1) + ']') : (data.jobStatus || 'Completed')), data.techCode || '',
    data.responsibleTech || '', data.techniciansSummary || '',
    data.store || '', data.dealer || '', data.contact || '', data.address || '',
    data.model || '', data.serial || '', data.productType || '', data.warranty || '',
    data.timeIn || '', data.timeOut || '', data.diagGps || '',
    data.diagSymptom || '', data.diagDetected || '', data.diagAction || '', data.partsSummary || '',
    data.grandTotal || '0.00', folderUrl || '', pdfUrl || existingPdf || '', nowStr,
    data.defectiveReturnStatus || existingDef || '',
    data.paymentAgingStatus || existingPay || ''
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function updateOpsStatusInSheet(ss, data) {
  var sheet = ss.getSheetByName('Service_Jobs');
  if (!sheet) return;
  var targetRow = findRowByExactKey(sheet, 1, data.jobNo);
  if (targetRow > 0) {
    if (data.defectiveReturnStatus !== undefined) {
      sheet.getRange(targetRow, 26).setValue(data.defectiveReturnStatus);
    }
    if (data.paymentAgingStatus !== undefined) {
      sheet.getRange(targetRow, 27).setValue(data.paymentAgingStatus);
    }
  }
}

function upsertQuotationToSheet(ss, data) {
  var sheet = ss.getSheetByName('Quotations');
  if (!sheet) {
    sheet = ss.insertSheet('Quotations');
    var headers = [
      'Offer No.', 'Document Type', 'Ref. Job No.', 'Date',
      'Customer / Store', 'Dealer', 'Contact', 'Address',
      'Model', 'Serial No.', 'Price Tier', 'Parts & Services Summary',
      'Subtotal (THB)', 'VAT 7%', 'WHT 3%', 'Grand Total (THB)',
      'Remark', 'Technician', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var offerNo = String(data.offerNo || '').trim();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowValues = [
    offerNo, data.docType || 'QUOTATION', data.refJobNo || '', data.date || '',
    data.customerStore || '', data.dealer || '', data.contact || '', data.address || '',
    data.model || '', data.serial || '', data.priceTier || 'DIRECT', data.partsSummary || '',
    data.subtotal || '0.00', data.vat || '0.00', data.wht || '0.00', data.grandTotal || '0.00',
    data.remark || '', data.technician || '', nowStr
  ];

  var targetRow = findRowByExactKey(sheet, 1, offerNo);
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function saveGlobalConfigAndStaff(ss, data) {
  var sheet = ss.getSheetByName('Global_Enterprise_Config');
  if (!sheet) {
    sheet = ss.insertSheet('Global_Enterprise_Config');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'JSON Value', 'Updated At']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  ['config', 'technicians', 'coordinators'].forEach(function(k) {
    if (data[k] !== undefined) {
      var row = findRowByExactKey(sheet, 1, k);
      var jsonStr = JSON.stringify(data[k]);
      if (row > 0) sheet.getRange(row, 1, 1, 3).setValues([[k, jsonStr, nowStr]]);
      else sheet.appendRow([k, jsonStr, nowStr]);
    }
  });
}

function readGlobalConfigAndStaff(ss) {
  var sheet = ss.getSheetByName('Global_Enterprise_Config');
  var out = { status: 'ok', technicians: [], coordinators: [], config: null };
  if (!sheet || sheet.getLastRow() < 2) return out;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  rows.forEach(function(r) {
    try {
      if (r[0] === 'technicians') out.technicians = JSON.parse(r[1]);
      if (r[0] === 'coordinators') out.coordinators = JSON.parse(r[1]);
      if (r[0] === 'config') out.config = JSON.parse(r[1]);
    } catch (e) {}
  });
  return out;
}

function readRecentJobsFromSheet(ss, limit) {
  var sheet = ss.getSheetByName('Service_Jobs');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - limit + 1);
  var numRows = lastRow - startRow + 1;
  var cols = Math.min(27, sheet.getLastColumn());
  var values = sheet.getRange(startRow, 1, numRows, cols).getValues();
  return values.reverse().map(function(r) {
    return {
      jobNo: r[0], date: r[1], jobStatus: r[2], techCode: r[3], responsibleTech: r[4],
      store: r[6], dealer: r[7], contact: r[8], address: r[9],
      model: r[10], serial: r[11], productType: r[12], warranty: r[13],
      timeIn: r[14], timeOut: r[15], diagGps: r[16],
      diagSymptom: r[17], diagDetected: r[18], diagAction: r[19], partsSummary: r[20] || '',
      grandTotal: r[21], driveFolderUrl: r[22], pdfBackupUrl: r[23], updatedAt: r[24],
      defectiveReturnStatus: r[25] || '', paymentAgingStatus: r[26] || ''
    };
  });
}

function getOrCreateMonthlyTechFolder(dateStr, techCode) {
  var rootIter = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  var root = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder(ROOT_DRIVE_FOLDER_NAME);

  var ym = (dateStr && String(dateStr).length >= 7) ? String(dateStr).substring(0, 7) : Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM');
  var ymIter = root.getFoldersByName(ym);
  var ymFolder = ymIter.hasNext() ? ymIter.next() : root.createFolder(ym);

  var tc = String(techCode || 'GENERAL').trim() || 'GENERAL';
  var tcIter = ymFolder.getFoldersByName(tc);
  return tcIter.hasNext() ? tcIter.next() : ymFolder.createFolder(tc);
}

function normalizePdfPartsList_(data) {
  var rawList = [];
  if (Array.isArray(data.parts) && data.parts.length > 0) rawList = data.parts;
  else if (Array.isArray(data.items) && data.items.length > 0) rawList = data.items;
  else if (Array.isArray(data.partsList) && data.partsList.length > 0) rawList = data.partsList;

  var normalized = [];
  rawList.forEach(function(item) {
    if (!item) return;
    var desc = item.desc || item.description || item.name || item.partName || '';
    var qty = item.qty || item.quantity || item.unit || '1';
    var price = item.price || item.unitPrice || item.amount || '0.00';
    var total = item.total || item.lineTotal || '';
    if (String(desc).trim() !== '') {
      normalized.push({ desc: desc, qty: qty, price: price, total: total });
    }
  });

  if (normalized.length === 0 && data.partsSummary && String(data.partsSummary).trim() !== '' && String(data.partsSummary).trim() !== '-') {
    var lines = String(data.partsSummary).split(/\r?\n|;/).filter(Boolean);
    lines.forEach(function(line) {
      normalized.push({ desc: line.trim(), qty: '1', price: '-', total: '-' });
    });
  }
  return normalized;
}

function generateJobServicePdfAndSaveToDrive(data, folder) {
  if (data.customPdfHtml && String(data.customPdfHtml).indexOf('<') > -1) {
    var directBlob = HtmlService.createHtmlOutput(data.customPdfHtml).getAs('application/pdf')
      .setName((data.jobNo || 'JOB') + '_' + (data.serial || 'SN') + '.pdf');
    return folder.createFile(directBlob);
  }

  var cfg = data.companyConfig || {};
  var compName = cfg.companyName || 'HOSHIZAKI (THAILAND) LIMITED';
  var compAddr = cfg.address || 'Building A ,1st floor, No. 10/11 Soi Vibhavadi Rangsit 64 (Mahanakorn),Talat Bang Khen Subdistrict,Lak Si District, Bangkok 10210 Thailand.';
  var currency = cfg.currency || 'THB';
  var logoHtml = cfg.logoDataUrl ? '<img src="' + cfg.logoDataUrl + '" style="height:48px;vertical-align:middle;margin-right:10px;">' : '';

  var partsRows = '';
  var parts = normalizePdfPartsList_(data);
  for (var i = 0; i < parts.length; i++) {
    var qNum = parseFloat(String(parts[i].qty).replace(/,/g, '')) || 1;
    var pNum = parseFloat(String(parts[i].price).replace(/,/g, ''));
    var lineAmt = parts[i].total || (!isNaN(pNum) ? formatCurrency(qNum * pNum) : '-');
    partsRows += '<tr>' +
      '<td align="center">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(parts[i].desc) + '</td>' +
      '<td align="center">' + escapeHtml(parts[i].qty) + '</td>' +
      '<td align="right">' + escapeHtml(parts[i].price) + '</td>' +
      '<td align="right">' + escapeHtml(lineAmt) + '</td>' +
      '</tr>';
  }
  if (!partsRows) {
    partsRows = '<tr><td colspan="5" align="center">- No Spare Parts / ไม่มีรายการอะไหล่ -</td></tr>';
  }

  var custSigHtml = data.sigCustomerDataUrl ? '<img src="' + data.sigCustomerDataUrl + '" style="height:48px;">' : '<div style="height:48px;"></div>';
  var techSigHtml = data.sigTechDataUrl ? '<img src="' + data.sigTechDataUrl + '" style="height:48px;">' : '<div style="height:48px;"></div>';

  var html = '<html><head><meta charset="UTF-8"><style>' +
    'body{font-family:sans-serif;font-size:10.5px;color:#111;line-height:1.4;}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px;}' +
    'th,td{border:1px solid #64748b;padding:5px 6px;vertical-align:top;}' +
    'th{background:#002B49;color:#fff;font-weight:bold;}' +
    '</style></head><body>' +
    '<div style="border-bottom:2px solid #002B49;padding-bottom:6px;">' + logoHtml +
      '<span style="font-size:15px;font-weight:bold;color:#002B49;">' + escapeHtml(compName) + ' - SERVICE REPORT</span><br>' +
      '<span style="font-size:9px;color:#475569;">' + escapeHtml(compAddr) + '</span>' +
    '</div>' +
    '<p style="margin:6px 0;"><b>Job No.:</b> ' + escapeHtml(data.jobNo) + ' | <b>Date:</b> ' + escapeHtml(data.date) + ' | <b>Type:</b> ' + escapeHtml(data.jobType || '-') + ' | <b>Status:</b> ' + escapeHtml(data.jobStatus) + '</p>' +
    '<table><tr><th colspan="2">Customer & Equipment Information / ข้อมูลลูกค้าและเครื่อง</th></tr>' +
    '<tr><td width="50%"><b>Customer/Store:</b> ' + escapeHtml(data.store) + '</td><td width="50%"><b>Model / S/N:</b> ' + escapeHtml(data.model) + ' / ' + escapeHtml(data.serial) + '</td></tr>' +
    '<tr><td><b>Contact:</b> ' + escapeHtml(data.contact) + '</td><td><b>Product Type:</b> ' + escapeHtml(data.productType || '-') + ' | <b>Warranty:</b> ' + escapeHtml(data.warranty) + '</td></tr>' +
    '<tr><td colspan="2"><b>Address:</b> ' + escapeHtml(data.address) + '</td></tr></table>' +
    '<table><tr><th colspan="2">Service & Troubleshooting / รายละเอียดการตรวจเช็คและซ่อม</th></tr>' +
    '<tr><td width="30%"><b>Symptom (อาการเสีย):</b></td><td>' + escapeHtml(data.diagSymptom) + '</td></tr>' +
    '<tr><td><b>Detected Cause (สาเหตุ):</b></td><td>' + escapeHtml(data.diagDetected) + '</td></tr>' +
    '<tr><td><b>Action Taken (การแก้ไข):</b></td><td>' + escapeHtml(data.diagAction) + '</td></tr>' +
    '<tr><td><b>Remark (หมายเหตุ):</b></td><td>' + escapeHtml(data.remark || data.additionalRemarks || '-') + '</td></tr>' +
    '<tr><td><b>Technician (ช่างซ่อม):</b></td><td>' + escapeHtml(data.responsibleTech) + ' (In: ' + escapeHtml(data.timeIn || '-') + ' - Out: ' + escapeHtml(data.timeOut || '-') + ')</td></tr></table>' +
    '<table><tr><th width="6%">#</th><th>Spare Parts & Services / รายการอะไหล่และค่าบริการ</th><th width="10%">Qty</th><th width="18%">Unit Price (' + escapeHtml(currency) + ')</th><th width="18%">Amount (' + escapeHtml(currency) + ')</th></tr>' + partsRows + '</table>' +
    '<table style="width:45%;margin-left:auto;">' +
      '<tr><td><b>Sub Total:</b></td><td align="right">' + escapeHtml(data.subtotal || data.grandTotal || '0.00') + '</td></tr>' +
      '<tr><td><b>VAT 7%:</b></td><td align="right">' + escapeHtml(data.vat || '0.00') + '</td></tr>' +
      '<tr style="background:#f1f5f9;"><td><b>GRAND TOTAL (' + escapeHtml(currency) + '):</b></td><td align="right"><b>' + escapeHtml(data.grandTotal || '0.00') + '</b></td></tr>' +
    '</table>' +
    '<div style="margin-top:6px;font-size:8.5px;color:#475569;text-align:right;">Document Integrity Hash: <b>' + escapeHtml(data.integrityHash || computeDocumentIntegrityHash_(data.jobNo, data.date, data.serial, data.grandTotal, data.partsSummary)) + '</b></div>' +
    '<table><tr><th width="50%">Customer Signature / ลายเซ็นลูกค้า</th><th width="50%">Technician Signature / ลายเซ็นช่างซ่อม</th></tr>' +
    '<tr><td align="center">' + custSigHtml + '<br>' + escapeHtml(data.nameCustomer || '') + '</td><td align="center">' + techSigHtml + '<br>' + escapeHtml(data.responsibleTech || '') + '</td></tr></table>' +
    '</body></html>';

  var pdfBlob = HtmlService.createHtmlOutput(html).getAs('application/pdf')
    .setName((data.jobNo || 'JOB') + '_' + (data.serial || 'SN') + '.pdf');
  return folder.createFile(pdfBlob);
}

function generateQuotationPdfAndSaveToDrive(data) {
  var folder = getOrCreateMonthlyTechFolder(data.date, 'QUOTATIONS_PDF');

  if (data.customPdfHtml && String(data.customPdfHtml).indexOf('<') > -1) {
    var directBlob = HtmlService.createHtmlOutput(data.customPdfHtml).getAs('application/pdf')
      .setName((data.offerNo || 'QT') + '_' + (data.serial || 'SN') + '.pdf');
    return folder.createFile(directBlob);
  }

  var cfg = data.companyConfig || {};
  var compName = cfg.companyName || 'HOSHIZAKI (THAILAND) LIMITED';
  var compAddr = cfg.address || 'Building A ,1st floor, No. 10/11 Soi Vibhavadi Rangsit 64 (Mahanakorn),Talat Bang Khen Subdistrict,Lak Si District, Bangkok 10210 Thailand.';
  var compTelTax = cfg.telTax || 'TEL : 02-005-9980-83 FAX : 02-516-2646 | TAX ID : 0135558002599 (HEAD OFFICE) | Email : services@hoshizaki.co.th | Website : www.hoshizaki-sea.com';
  var currency = cfg.currency || 'THB';
  var logoHtml = cfg.logoDataUrl ? '<img src="' + cfg.logoDataUrl + '" style="height:48px;vertical-align:middle;margin-right:10px;">' : '';

  var partsRows = '';
  var parts = normalizePdfPartsList_(data);
  for (var i = 0; i < parts.length; i++) {
    var qNum = parseFloat(String(parts[i].qty).replace(/,/g, '')) || 1;
    var pNum = parseFloat(String(parts[i].price).replace(/,/g, ''));
    var lineAmt = parts[i].total || (!isNaN(pNum) ? formatCurrency(qNum * pNum) : '-');
    partsRows += '<tr>' +
      '<td align="center">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(parts[i].desc) + '</td>' +
      '<td align="center">' + escapeHtml(parts[i].qty) + '</td>' +
      '<td align="right">' + escapeHtml(parts[i].price) + '</td>' +
      '<td align="right">' + escapeHtml(lineAmt) + '</td>' +
      '</tr>';
  }
  if (!partsRows) {
    partsRows = '<tr><td colspan="5" align="center">- ไม่มีรายการสินค้า / No Items -</td></tr>';
  }

  var html = '<html><head><meta charset="UTF-8"><style>' +
    'body{font-family:sans-serif;font-size:11px;color:#111;line-height:1.4;}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px;}' +
    'th,td{border:1px solid #64748b;padding:5px 6px;vertical-align:top;}' +
    'th{background:#002B49;color:#fff;font-weight:bold;}' +
    '</style></head><body>' +
    '<div style="border-bottom:2px solid #002B49;padding-bottom:6px;margin-bottom:6px;">' + logoHtml +
      '<span style="font-size:15px;font-weight:bold;color:#002B49;">' + escapeHtml(compName) + ' - ' + escapeHtml(data.docType || 'QUOTATION') + '</span><br>' +
      '<span style="font-size:9px;color:#475569;">' + escapeHtml(compAddr) + (compTelTax ? ' | ' + escapeHtml(compTelTax) : '') + '</span>' +
    '</div>' +
    '<table>' +
      '<tr><td width="55%"><b>Customer:</b> ' + escapeHtml(data.customerStore) + '</td><td width="45%"><b>Offer No.:</b> ' + escapeHtml(data.offerNo) + '</td></tr>' +
      '<tr><td><b>Contact:</b> ' + escapeHtml(data.contact) + '</td><td><b>Ref Job:</b> ' + escapeHtml(data.refJobNo || '-') + '</td></tr>' +
      '<tr><td><b>Address:</b> ' + escapeHtml(data.address) + '</td><td><b>Date:</b> ' + escapeHtml(data.date) + '</td></tr>' +
      '<tr><td colspan="2"><b>Model / S/N:</b> ' + escapeHtml(data.model) + ' / ' + escapeHtml(data.serial) + '</td></tr>' +
    '</table>' +
    '<table><tr><th width="6%">#</th><th>Description / รายการสินค้าและบริการ</th><th width="10%">Qty</th><th width="18%">Unit Price (' + escapeHtml(currency) + ')</th><th width="18%">Amount (' + escapeHtml(currency) + ')</th></tr>' + partsRows + '</table>' +
    '<table style="width:45%;margin-left:auto;">' +
      '<tr><td><b>Subtotal:</b></td><td align="right">' + escapeHtml(data.subtotal || '0.00') + '</td></tr>' +
      '<tr><td><b>VAT 7%:</b></td><td align="right">' + escapeHtml(data.vat || '0.00') + '</td></tr>' +
      (data.wht && parseFloat(data.wht) > 0 ? '<tr><td><b>WHT 3%:</b></td><td align="right">-' + escapeHtml(data.wht) + '</td></tr>' : '') +
      '<tr style="background:#f1f5f9;"><td><b>GRAND TOTAL (' + escapeHtml(currency) + '):</b></td><td align="right"><b>' + escapeHtml(data.grandTotal || '0.00') + '</b></td></tr>' +
    '</table>' +
    '<p style="margin-top:8px;"><b>Remark / เงื่อนไข:</b> ' + escapeHtml(data.remark || '-') + '</p>' +
    '<p style="margin-top:16px;"><b>Prepared By / ผู้เสนอราคา:</b> ' + escapeHtml(data.technician || 'Service Department') + '</p>' +
    '</body></html>';

  var pdfBlob = HtmlService.createHtmlOutput(html).getAs('application/pdf')
    .setName((data.offerNo || 'QT') + '_' + (data.serial || 'SN') + '.pdf');
  return folder.createFile(pdfBlob);
}

function sendBackupEmailWithPdf(recipient, subject, body, pdfFile) {
  if (!recipient || !pdfFile) return;
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: body,
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// 7. HIGH-SPEED AUTO-RENAME GOOGLE DRIVE PDFs + FIRST-PAGE PDF OCR (v18.4.0)
// ============================================================================

var DRIVE_RENAME_FOLDER_RULES = [
  { id: '1J-8iMryohfrHaD9gc_iiIRtZrqMECVPV', docPrefix: 'Spec Sheet',         strictRootType: true },
  { id: '1gxzMZ4l5wjXKoRTM0TRIH_l505y8AVsj', docPrefix: 'Service Manual',     strictRootType: true },
  { id: '16FbLyB9eredvW8RH-dmk_NwhyaCOkiDR', docPrefix: 'Instruction Manual', strictRootType: true },
  { id: '1HVU-f-05Ts8ipWxwXdsXoI20TossTeL4', docPrefix: 'Parts List',         strictRootType: true }
];

// ตั้งเป็น true เพื่อเปิดใช้งานการอ่านรหัสรุ่นจากข้อความข้างใน PDF เมื่อชื่อไฟล์ไม่มีรหัสรุ่น (ต้องเปิด Drive API ใน Services ก่อน)
var ENABLE_PDF_OCR_MODEL_FALLBACK = true;

function resetAutoRenameCheckpoint() {
  PropertiesService.getScriptProperties().deleteProperty('RENAME_STATE_V18_4');
  Logger.log('รีเซ็ตจุดค้างเรียบร้อย พร้อมเริ่มรันรอบใหม่จากไฟล์แรก');
}

function previewAutoRenameDrivePdfs() {
  return runAutoRenameDrivePdfsFast_(true);
}

function executeAutoRenameDrivePdfs() {
  return runAutoRenameDrivePdfsFast_(false);
}

function extractModelsFromPdfContentOcr_(fileId) {
  if (!ENABLE_PDF_OCR_MODEL_FALLBACK) return [];
  try {
    if (typeof Drive === 'undefined' || !Drive.Files) return [];
    var copied = Drive.Files.copy(
      { title: '_TMP_OCR_' + fileId, mimeType: MimeType.GOOGLE_DOCS },
      fileId,
      { ocr: true, ocrLanguage: 'en' }
    );
    var docId = copied.id;
    var text = '';
    try {
      var doc = DocumentApp.openById(docId);
      text = doc.getBody().getText().substring(0, 2500);
    } finally {
      DriveApp.getFileById(docId).setTrashed(true);
    }
    return extractHoshizakiModelsFromText_(text);
  } catch (e) {
    return [];
  }
}

function runAutoRenameDrivePdfsFast_(dryRun) {
  var startTime = Date.now();
  var MAX_RUNTIME_MS = 270000;

  var props = PropertiesService.getScriptProperties();
  var savedRaw = props.getProperty('RENAME_STATE_V18_4');
  var state = savedRaw ? JSON.parse(savedRaw) : null;

  if (!state || state.dryRun !== dryRun) {
    state = {
      dryRun: dryRun,
      folderIdx: 0,
      queue: [],
      visitedFolders: {},
      processedCount: 0
    };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('Drive_Rename_Log');
  if (!logSheet) {
    logSheet = ss.insertSheet('Drive_Rename_Log');
  }

  if (state.processedCount === 0) {
    logSheet.clear();
    logSheet.appendRow(['Mode', 'Assigned Category', 'Root Folder', 'Subfolder Path', 'Old File Name', 'New File Name', 'Detected Models', 'Detection Source', 'Status', 'File URL']);
    logSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    logSheet.setFrozenRows(1);
  }

  var batchRows = [];
  var timedOut = false;

  while (state.folderIdx < DRIVE_RENAME_FOLDER_RULES.length) {
    var cfg = DRIVE_RENAME_FOLDER_RULES[state.folderIdx];

    if (state.queue.length === 0 && !state.visitedFolders[cfg.id]) {
      try {
        var rootFolder = DriveApp.getFolderById(cfg.id);
        state.queue.push({ id: cfg.id, rootName: rootFolder.getName(), path: rootFolder.getName() });
      } catch (e) {
        batchRows.push([dryRun ? 'PREVIEW' : 'EXECUTED', cfg.docPrefix, cfg.id, '-', 'ERROR: ' + e, '-', '-', '-', 'SKIPPED', '-']);
        state.folderIdx++;
        continue;
      }
    }

    while (state.queue.length > 0) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        timedOut = true;
        break;
      }

      var item = state.queue.shift();
      if (state.visitedFolders[item.id]) continue;
      state.visitedFolders[item.id] = true;

      try {
        var folder = DriveApp.getFolderById(item.id);
        var files = folder.getFilesByType(MimeType.PDF);

        while (files.hasNext()) {
          if (Date.now() - startTime > MAX_RUNTIME_MS) {
            delete state.visitedFolders[item.id];
            state.queue.unshift(item);
            timedOut = true;
            break;
          }

          var file = files.next();
          var oldName = file.getName();
          var docPrefix = cfg.strictRootType
            ? cfg.docPrefix
            : detectDocCategoryPrefix_(cfg.docPrefix, item.path, oldName);

          var models = extractHoshizakiModelsFromText_(oldName + ' ' + item.path);
          var sourceTag = models.length > 0 ? 'FILENAME/PATH' : 'FALLBACK';

          if (models.length === 0) {
            var ocrModels = extractModelsFromPdfContentOcr_(file.getId());
            if (ocrModels.length > 0) {
              models = ocrModels;
              sourceTag = 'PDF_OCR';
            }
          }

          var modelPart = models.length > 0
            ? models.join('+')
            : sanitizeFallbackBaseName_(oldName, docPrefix);

          var newName = docPrefix + '_' + modelPart + '.pdf';
          var status = (oldName === newName) ? 'UNCHANGED' : (dryRun ? 'READY_TO_RENAME' : 'RENAMED');

          if (!dryRun && oldName !== newName) {
            file.setName(newName);
          }

          batchRows.push([
            dryRun ? 'PREVIEW' : 'RENAMED',
            docPrefix,
            item.rootName,
            item.path,
            oldName,
            newName,
            models.join(', ') || '-',
            sourceTag,
            status,
            file.getUrl()
          ]);
          state.processedCount++;
        }

        if (timedOut) break;

        var subs = folder.getFolders();
        while (subs.hasNext()) {
          var sub = subs.next();
          var subId = sub.getId();
          if (!state.visitedFolders[subId]) {
            state.queue.push({
              id: subId,
              rootName: item.rootName,
              path: item.path + ' / ' + sub.getName()
            });
          }
        }
      } catch (err) {
        batchRows.push([dryRun ? 'PREVIEW' : 'EXECUTED', cfg.docPrefix, item.rootName, item.path, 'ERROR: ' + err, '-', '-', '-', 'SKIPPED', '-']);
      }
    }

    if (timedOut) break;
    state.folderIdx++;
  }

  if (batchRows.length > 0) {
    var startRow = logSheet.getLastRow() + 1;
    logSheet.getRange(startRow, 1, batchRows.length, 10).setValues(batchRows);
  }

  if (timedOut) {
    props.setProperty('RENAME_STATE_V18_4', JSON.stringify(state));
    Logger.log('⏸️ พักชั่วคราวเพื่อป้องกัน Timeout (ประมวลผลแล้ว ' + state.processedCount + ' ไฟล์) — กรุณากด Run ซ้ำอีกครั้งเพื่อทำต่อให้ครบ');
  } else {
    props.deleteProperty('RENAME_STATE_V18_4');
    clearDrivePdfIndexCache_();
    Logger.log('✅ เสร็จสมบูรณ์ 100%! ประมวลผลไฟล์ PDF ทั้งหมด ' + state.processedCount + ' ไฟล์');
  }

  return { completed: !timedOut, processed: state.processedCount };
}

function detectDocCategoryPrefix_(defaultPrefix, pathStr, fileName) {
  var combined = (pathStr + ' ' + fileName).toUpperCase();
  if (defaultPrefix === 'Spec Sheet' || /\b(SPEC|DATASHEET|CATALOG|CATALOGUE|BROCHURE)\b/.test(combined)) {
    return 'Spec Sheet';
  }
  if (/\b(PARTS|PART\s*LIST|EXPLODED|SPARE)\b/.test(combined)) {
    return 'Parts List';
  }
  if (/\b(INSTRUCTION|USER|OPERATION|OPERATOR|INSTALLATION|OWNER)\b/.test(combined)) {
    return 'Instruction Manual';
  }
  if (/\b(SERVICE|SM|TECHNICAL|WIRING|TROUBLESHOOTING)\b/.test(combined)) {
    return 'Service Manual';
  }
  return defaultPrefix;
}

function extractHoshizakiModelsFromText_(text) {
  var upper = String(text || '').toUpperCase();
  var regex = /\b(IM|KM|KMD|FM|HR|HF|HRF|HRW|HW|RT|RTC|RTF|RTS|RW|RF|RR|RRF|RFT|DCM|DIM|AM|HNC|DBF|HSU|B|G)-[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,6})?\b/g;
  var found = {};
  var match;
  while ((match = regex.exec(upper)) !== null) {
    var code = match[0].replace(/-(PDF|SM|IM|PL|SPEC|PARTS|MANUAL)$/i, '');
    found[code] = true;
  }
  return Object.keys(found).sort();
}

function sanitizeFallbackBaseName_(fileName, docPrefix) {
  var base = String(fileName || '').replace(/\.pdf$/i, '');
  base = base.replace(/^(Spec\s*Sheet|Service\s*Manual|Instruction\s*Manual|Parts\s*List)[_\-\s]*/i, '');
  base = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return base || 'General';
}

function clearDrivePdfIndexCache_() {
  try {
    var cache = CacheService.getScriptCache();
    var allFolders = [SPEC_SHEET_FOLDER_ID].concat(MANUAL_PDF_FOLDER_IDS);
    var specOnly = [SPEC_SHEET_FOLDER_ID];
    var keyAll = 'DRIVE_PDF_IDX_V184_' + Utilities.base64Encode(allFolders.join(',')).substring(0, 32);
    var keySpec = 'DRIVE_PDF_IDX_V184_' + Utilities.base64Encode(specOnly.join(',')).substring(0, 32);
    cache.removeAll([keyAll, keySpec, 'PULL_ALL_JOBS_V18']);
  } catch (e) {}
}


// ============================================================================
// 8. DUAL-ACCOUNT RICH MENU LINKER (ServiceBot Hoshizaki <-> Hoshizaki_Th)
// ============================================================================

/**
 * สร้าง Rich Menu อัตโนมัติสำหรับเชื่อมโยง 2 บัญชีเข้าหากัน:
 * 1) บน ServiceBot Hoshizaki -> ปุ่ม "ติดต่อแอดมินออฟฟิศ (Hoshizaki_Th)"
 * 2) บน Hoshizaki_Th (ถ้าใส่ LINE_MAIN_OFFICE_TOKEN) -> ปุ่ม "ผู้ช่วยบอทเทคนิค (ServiceBot)"
 */
function createCrossLinkRichMenus() {
  var secrets = getAppSecrets_();
  var officeUrl = buildLineAddFriendUrl_(secrets.lineMainOfficeId);
  var botUrl = buildLineAddFriendUrl_(secrets.lineBotId);

  if (secrets.lineToken && officeUrl) {
    var botMenuPayload = {
      size: { width: 2500, height: 843 },
      selected: true,
      name: 'ServiceBot_CrossLink_Menu',
      chatBarText: 'เมนูคำสั่ง & ติดต่อออฟฟิศ',
      areas: [
        { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: 'message', text: 'เมนู' } },
        { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: 'message', text: 'ติดต่อช่าง' } },
        { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: 'uri', label: 'ติดต่อออฟฟิศ', uri: officeUrl } }
      ]
    };
    var res1 = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secrets.lineToken },
      payload: JSON.stringify(botMenuPayload),
      muteHttpExceptions: true
    });
    Logger.log('ServiceBot RichMenu API response: ' + res1.getContentText());
  }

  if (secrets.lineMainOfficeToken && botUrl) {
    var officeMenuPayload = {
      size: { width: 2500, height: 843 },
      selected: true,
      name: 'HoshizakiTh_BotLink_Menu',
      chatBarText: 'เมนูบริการ & ค้นหาสเปกอัตโนมัติ',
      areas: [
        { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: 'บอทสเปก/คู่มือ', uri: botUrl } },
        { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: 'ระบบใบงาน PWA', uri: secrets.pwaWebAppUrl || botUrl } }
      ]
    };
    var res2 = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secrets.lineMainOfficeToken },
      payload: JSON.stringify(officeMenuPayload),
      muteHttpExceptions: true
    });
    Logger.log('Hoshizaki_Th RichMenu API response: ' + res2.getContentText());
  }
}


// ============================================================================
// 9. PREDICTIVE SMART INTELLIGENCE, AUTO-WARRANTY, CSAT & BI ENGINE (v192.0)
// ============================================================================

function evaluateMachineSmartHealth_(dossier) {
  var sales = dossier.salesMeta;
  var jobs = dossier.jobs || [];
  var qts = dossier.quotations || [];
  var model = String(dossier.model || '').toUpperCase();

  // 1. คำนวณอายุเครื่องและสถานะการรับประกันอัตโนมัติ (Auto-Warranty Status)
  var ageYears = null;
  var warrantyStatus = 'ไม่พบวันที่ขายออก (ตรวจสอบสติกเกอร์หน้าเครื่อง)';
  var warrantyColor = '#64748B';
  if (sales && sales.sortDate && /^\d{4}-\d{2}-\d{2}$/.test(sales.sortDate) && sales.sortDate !== '0000-00-00') {
    var parts = sales.sortDate.split('-');
    var saleDt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var diffDays = Math.floor((Date.now() - saleDt.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0) {
      ageYears = (diffDays / 365.25).toFixed(1);
      if (diffDays <= 365) {
        warrantyStatus = '✅ อยู่ในประกันมาตรฐาน (อายุ ' + diffDays + ' วัน / ' + ageYears + ' ปี)';
        warrantyColor = '#065F46';
      } else if (diffDays <= 730) {
        warrantyStatus = '🛡️ ประกันคอมเพรสเซอร์ปีที่ 2 / หมดประกันอะไหล่ทั่วไป (อายุ ' + ageYears + ' ปี)';
        warrantyColor = '#B45309';
      } else {
        warrantyStatus = '⚪ หมดระยะรับประกันแล้ว (อายุเครื่อง ' + ageYears + ' ปี)';
        warrantyColor = '#475569';
      }
    }
  }

  // 2. ตรวจจับอาการซ่อมซ้ำ (Repeat-Failure / Lemon Machine Alert)
  var repeatAlert = '';
  if (jobs.length >= 2) {
    var latestJob = jobs[0];
    var prevJob = jobs[1];
    if (latestJob.sortDate && prevJob.sortDate && latestJob.sortDate !== '0000-00-00' && prevJob.sortDate !== '0000-00-00') {
      var d1 = new Date(latestJob.sortDate);
      var d2 = new Date(prevJob.sortDate);
      var gapDays = Math.abs(Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
      if (gapDays <= 90) {
        repeatAlert = '⚠️ แจ้งเตือนซ่อมซ้ำภายใน ' + gapDays + ' วัน! (ล่าสุด: ' + latestJob.date + ' vs ก่อนหน้า: ' + prevJob.date + ' อาการ: ' + (prevJob.diagSymptom || '-') + ') ควรตรวจหาสาเหตุต้นตอเช่น แรงดันน้ำ/ไฟตก/การระบายความร้อน';
      }
    }
    if (!repeatAlert && jobs.length >= 3) {
      repeatAlert = '⚠️ เครื่องมีประวัติแจ้งซ่อมสะสม ' + jobs.length + ' ครั้ง ควรตรวจเช็กสภาพรวมทั้งระบบ';
    }
  }

  // 3. คำนวณความคุ้มค่าซ่อม vs เปลี่ยนเครื่องใหม่ (Repair vs Replace Score)
  var totalRepairSpend = 0;
  jobs.forEach(function(j) {
    var v = parseFloat(String(j.grandTotal || '0').replace(/,/g, ''));
    if (!isNaN(v)) totalRepairSpend += v;
  });
  var pendingQtValue = 0;
  if (qts.length > 0 && qts[0].grandTotal) {
    pendingQtValue = Number(qts[0].grandTotal || 0);
  }
  var replaceAdvice = '';
  if ((ageYears !== null && Number(ageYears) >= 7) || totalRepairSpend >= 25000 || pendingQtValue >= 20000) {
    replaceAdvice = '💡 คำแนะนำเชิงพาณิชย์: ยอดซ่อมสะสม ' + formatCurrency(totalRepairSpend) + ' THB' +
      (ageYears ? ' (อายุเครื่อง ' + ageYears + ' ปี)' : '') +
      ' — เหมาะสำหรับเสนอแพ็กเกจสัญญาบำรุงรักษารายปี (PM Contract) หรือโปรโมชันเทิร์นเครื่องใหม่';
  }

  // 4. แนะนำอะไหล่ที่ควรเตรียมติดรถไปหน้างาน (Smart Parts Recommendation)
  var recommendedParts = [];
  if (model.indexOf('IM-') === 0) {
    recommendedParts = ['Water Valve (P01872-01 / 452138-01)', 'Actuator Motor (P03755-01)', 'Thermistor (P00350-01)', 'Water Filter 4HC-H'];
  } else if (model.indexOf('KM-') === 0 || model.indexOf('KMD-') === 0) {
    recommendedParts = ['Float Switch (4A3624-01)', 'Water Valve (4A5251-06)', 'Thermistor (429006-03)', 'Pump Motor (PA0613)'];
  } else if (model.indexOf('FM-') === 0) {
    recommendedParts = ['Mechanical Seal (432491-01)', 'Float Switch (458279-01)', 'Rotation Sensor (459861-01)', 'Water Filter'];
  } else if (/^(HR|HF|RT|RTC|RTF)-/.test(model)) {
    recommendedParts = ['Cabinet/Evap Thermistor (P04878-01/-02)', 'Digital Controller (P04865-01)', 'Door Gasket', 'Fan Motor'];
  } else if (/^(HSU|JWE)-/.test(model)) {
    recommendedParts = ['Rinse/Detergent Pump (9999.P22CA.030)', 'Temp Probe (6262.00043.011)', 'Water Valve (456461-01)'];
  }

  return {
    ageYears: ageYears,
    warrantyStatus: warrantyStatus,
    warrantyColor: warrantyColor,
    repeatAlert: repeatAlert,
    totalRepairSpend: totalRepairSpend,
    replaceAdvice: replaceAdvice,
    recommendedParts: recommendedParts
  };
}

function buildQuotationFollowUpText_(ss) {
  var qSheet = ss.getSheetByName('Quotations');
  if (!qSheet || qSheet.getLastRow() < 2) {
    return '📑 ยังไม่มีข้อมูลใบเสนอราคาใหม่ในชีต Quotations สำหรับติดตามผล';
  }
  var jobs = readRecentJobsFromSheet(ss, 1500);
  var jobSerials = {};
  jobs.forEach(function(j) {
    if (j.serial && j.jobStatus === 'Completed') {
      jobSerials[String(j.serial).trim().toUpperCase()] = String(j.date || '');
    }
  });

  var qVals = qSheet.getRange(2, 1, qSheet.getLastRow() - 1, 16).getValues();
  var now = new Date();
  var pendingList = [];
  for (var i = qVals.length - 1; i >= 0; i--) {
    var offerNo = String(qVals[i][0] || '').trim();
    var dtStr = normalizeDateForSort_(qVals[i][3]);
    var cust = String(qVals[i][4] || '-');
    var model = String(qVals[i][8] || '-');
    var sn = String(qVals[i][9] || '').trim().toUpperCase();
    var total = Number(qVals[i][15] || 0);
    if (!offerNo || dtStr === '0000-00-00') continue;
    var pts = dtStr.split('-');
    var qDate = new Date(Number(pts[0]), Number(pts[1]) - 1, Number(pts[2]));
    var ageDays = Math.floor((now.getTime() - qDate.getTime()) / (1000 * 60 * 60 * 24));
    var completedAfter = sn && jobSerials[sn] && jobSerials[sn] >= dtStr;
    if (ageDays >= 7 && ageDays <= 90 && !completedAfter) {
      pendingList.push({
        offerNo: offerNo,
        date: dtStr,
        ageDays: ageDays,
        customer: cust,
        model: model,
        serial: sn || '-',
        total: total
      });
    }
    if (pendingList.length >= 10) break;
  }

  if (pendingList.length === 0) {
    return '✅ ไม่มีใบเสนอราคาค้างติดตาม (7-90 วัน) ในขณะนี้ครับ';
  }

  var lines = pendingList.map(function(p, idx) {
    return (idx + 1) + '. 📄 ' + p.offerNo + ' (ค้าง ' + p.ageDays + ' วัน | ' + p.date + ')\n' +
           '   • ลูกค้า: ' + p.customer + '\n' +
           '   • รุ่น/S/N: ' + p.model + ' / ' + p.serial + ' | ยอด: ' + formatCurrency(p.total) + ' THB';
  }).join('\n');

  return '🎯 เรดาร์ติดตามใบเสนอราคา (Quotation Follow-Up Radar)\n━━━━━━━━━━━━━━━━━━━━\n' + lines;
}

function buildExecutiveBiSummaryText_(ss) {
  var jobs = readRecentJobsFromSheet(ss, 2000);
  if (jobs.length === 0) return '📊 ยังไม่มีข้อมูลใบงานสำหรับวิเคราะห์ BI';

  var completed = 0;
  var waitingParts = 0;
  var totalRev = 0;
  var modelCounts = {};

  jobs.forEach(function(j) {
    if (j.jobStatus === 'Completed') completed++;
    if (j.jobStatus === 'Waiting Parts') waitingParts++;
    var rev = parseFloat(String(j.grandTotal || '0').replace(/,/g, ''));
    if (!isNaN(rev)) totalRev += rev;
    var m = String(j.model || '').trim().toUpperCase();
    if (m && m !== '-') modelCounts[m] = (modelCounts[m] || 0) + 1;
  });

  var fixRate = jobs.length > 0 ? ((completed / jobs.length) * 100).toFixed(1) : '0.0';
  var topModels = Object.keys(modelCounts).sort(function(a, b) {
    return modelCounts[b] - modelCounts[a];
  }).slice(0, 5).map(function(m, idx) {
    return (idx + 1) + '. ' + m + ' (' + modelCounts[m] + ' งาน)';
  }).join('\n');

  return '📊 รายงานวิเคราะห์เชิงลึกแผนกบริการ (Executive BI)\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '• ใบงานสะสมในระบบ: ' + jobs.length + ' ใบ\n' +
    '• ปิดงานสำเร็จ (First-Time Fix / Completed): ' + completed + ' ใบ (' + fixRate + '%)\n' +
    '• งานค้างรออะไหล่ (Waiting Parts): ' + waitingParts + ' ใบ\n' +
    '• รายได้ค่าบริการและอะไหล่สะสม: ' + formatCurrency(totalRev) + ' THB\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '🔥 Top 5 รุ่นเครื่องที่มีการแจ้งบริการสูงสุด:\n' + (topModels || '-');
}

function recordCustomerCsatRating_(ss, jobNo, score, userId) {
  var sheet = ss.getSheetByName('Customer_CSAT_Ratings');
  if (!sheet) {
    sheet = ss.insertSheet('Customer_CSAT_Ratings');
    sheet.getRange(1, 1, 1, 6).setValues([['Job No.', 'Rating (1-5)', 'Customer Name', 'LINE User ID', 'Rated At', 'Comment']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var custName = getLineUserDisplayName_(userId);
  var rowIdx = findRowByExactKey(sheet, 1, jobNo);
  var vals = [jobNo, Number(score || 5), custName, userId || '', nowStr, 'Rated via LINE 1-Tap CSAT'];
  if (rowIdx > 0) sheet.getRange(rowIdx, 1, 1, 6).setValues([vals]);
  else sheet.appendRow(vals);
  return '⭐ ขอบคุณคุณ ' + custName + ' สำหรับการประเมินความพึงพอใจ (' + score + '/5 ดาว) สำหรับใบงาน ' + jobNo + ' ครับ';
}


// ============================================================================
// 10. WAREHOUSE INBOUND / USED MACHINE INSPECTION REPORT & MULTI-MODEL PARTS MASTER (v193.0)
// ============================================================================

function getOrCreateInspectionDriveFolder_(inspectionId, dateStr) {
  var rootIter = DriveApp.getFoldersByName('HOSHIZAKI_INSPECTION_REPORTS_ARCHIVE');
  var root = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder('HOSHIZAKI_INSPECTION_REPORTS_ARCHIVE');
  var ym = (dateStr && String(dateStr).length >= 7) ? String(dateStr).substring(0, 7) : Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM');
  var ymIter = root.getFoldersByName(ym);
  var ymFolder = ymIter.hasNext() ? ymIter.next() : root.createFolder(ym);
  var idClean = String(inspectionId || 'INS-GENERAL').trim().replace(/[^A-Z0-9\-_]/gi, '_');
  var idIter = ymFolder.getFoldersByName(idClean);
  return idIter.hasNext() ? idIter.next() : ymFolder.createFolder(idClean);
}

function saveWarehouseInspectionReport_(ss, data, secrets) {
  var sheet = ss.getSheetByName('Warehouse_Inspection_Reports');
  if (!sheet) {
    sheet = ss.insertSheet('Warehouse_Inspection_Reports');
    var headers = [
      'Inspection ID', 'Date', 'Inspection Type', 'QC Status', 'Model', 'Serial No.',
      'Container / BL / PO Ref', 'Inspector / Outsource Name', 'Company / Team',
      'Box Condition', 'Exterior Body', 'Internal & Compressor', 'Accessories & Manual',
      'Damage Summary / Remarks', 'Photo Count', 'Drive Folder URL', 'PDF Report URL',
      'Full JSON Payload', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var insId = String(data.inspectionId || ('INS-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss'))).trim().toUpperCase();
  var folder = getOrCreateInspectionDriveFolder_(insId, data.date || '');
  var folderUrl = folder.getUrl();

  // Save high-resolution inspection photos directly to Drive folder
  var uploadedPhotoUrls = [];
  if (Array.isArray(data.photos)) {
    data.photos.forEach(function(p, idx) {
      if (p && p.dataUrl && String(p.dataUrl).indexOf('base64,') > -1) {
        try {
          var b64 = String(p.dataUrl).split('base64,')[1];
          var safeTag = String(p.caption || ('Photo_' + (idx + 1))).replace(/[^a-zA-Z0-9ก-๙\-_ ]/g, '_').substring(0, 40);
          var fname = insId + '_' + ('0' + (idx + 1)).slice(-2) + '_' + safeTag + '.jpg';
          var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', fname);
          var f = folder.createFile(blob);
          uploadedPhotoUrls.push({ index: idx + 1, caption: p.caption || '', tag: p.zone || '', url: f.getUrl() });
        } catch (eImg) {}
      } else if (p && p.driveUrl) {
        uploadedPhotoUrls.push({ index: idx + 1, caption: p.caption || '', tag: p.zone || '', url: p.driveUrl });
      }
    });
  }

  // Generate Crisp PDF Report if HTML provided
  var pdfUrl = data.pdfUrl || '';
  if (data.customPdfHtml && String(data.customPdfHtml).indexOf('<') > -1) {
    try {
      var pdfBlob = HtmlService.createHtmlOutput(data.customPdfHtml).getAs('application/pdf')
        .setName(insId + '_' + (data.serial || 'SN') + '_Inspection.pdf');
      var pdfFile = folder.createFile(pdfBlob);
      pdfUrl = pdfFile.getUrl();
    } catch (ePdf) {}
  }

  var compactRecord = {
    inspectionId: insId,
    date: data.date || '',
    inspectionType: data.inspectionType || 'INBOUND_NEW',
    qcStatus: data.qcStatus || 'READY_TO_SELL',
    model: data.model || '',
    serial: data.serial || '',
    containerRef: data.containerRef || '',
    inspectorName: data.inspectorName || '',
    inspectorOrg: data.inspectorOrg || 'Internal QC',
    boxCondition: data.boxCondition || 'OK',
    exteriorCondition: data.exteriorCondition || 'OK',
    internalCondition: data.internalCondition || 'OK',
    accessoriesCondition: data.accessoriesCondition || 'OK',
    damageNotes: data.damageNotes || '',
    photoCount: uploadedPhotoUrls.length || (Array.isArray(data.photos) ? data.photos.length : 0),
    photoLinks: uploadedPhotoUrls,
    folderUrl: folderUrl,
    pdfUrl: pdfUrl
  };

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowVals = [
    insId,
    compactRecord.date,
    compactRecord.inspectionType,
    compactRecord.qcStatus,
    compactRecord.model,
    compactRecord.serial,
    compactRecord.containerRef,
    compactRecord.inspectorName,
    compactRecord.inspectorOrg,
    compactRecord.boxCondition,
    compactRecord.exteriorCondition,
    compactRecord.internalCondition,
    compactRecord.accessoriesCondition,
    compactRecord.damageNotes,
    compactRecord.photoCount,
    folderUrl,
    pdfUrl,
    JSON.stringify(compactRecord).substring(0, 48000),
    nowStr
  ];

  var rowIdx = findRowByExactKey(sheet, 1, insId);
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  // Push LINE Alert if damaged or outsource submitted
  if (secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    var isDamaged = compactRecord.qcStatus !== 'READY_TO_SELL';
    var badge = isDamaged ? '🚨 พบความเสียหาย / รอแก้ไข-เคลม' : '✅ ผ่านการตรวจเช็ก (พร้อมขาย)';
    var msg = '📦 รายงานตรวจรับ & เช็กสภาพเครื่อง (Inspection Report)\n' +
              '━━━━━━━━━━━━━━━━━━━━\n' +
              '🆔 เลขที่รายงาน: ' + insId + '\n' +
              '🚦 สถานะ QC: ' + badge + '\n' +
              '❄️ รุ่น / S/N: ' + (compactRecord.model || '-') + ' / ' + (compactRecord.serial || '-') + '\n' +
              '🚢 ตู้/PO/BL: ' + (compactRecord.containerRef || '-') + '\n' +
              '👷 ผู้ตรวจ: ' + (compactRecord.inspectorName || '-') + ' (' + compactRecord.inspectorOrg + ')\n' +
              '📝 หมายเหตุ/รอยเสียหาย: ' + (compactRecord.damageNotes || 'สภาพสมบูรณ์ปกติ') + '\n' +
              '📸 รูปถ่ายแนบ: ' + compactRecord.photoCount + ' ภาพ\n' +
              (pdfUrl ? '📄 เปิดรายงาน PDF: ' + pdfUrl : '📁 โฟลเดอร์รูปภาพ: ' + folderUrl);
    pushLineMessage(secrets.lineGroupId, msg);
  }

  return compactRecord;
}

function readWarehouseInspectionReports_(ss, limit) {
  var sheet = ss.getSheetByName('Warehouse_Inspection_Reports');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - (limit || 500) + 1);
  var vals = sheet.getRange(startRow, 1, lastRow - startRow + 1, 19).getValues();
  return vals.reverse().map(function(r) {
    var parsed = {};
    try { if (r[17]) parsed = JSON.parse(r[17]); } catch (e) {}
    return {
      inspectionId: r[0],
      date: r[1],
      inspectionType: r[2],
      qcStatus: r[3],
      model: r[4],
      serial: r[5],
      containerRef: r[6],
      inspectorName: r[7],
      inspectorOrg: r[8],
      boxCondition: r[9],
      exteriorCondition: r[10],
      internalCondition: r[11],
      accessoriesCondition: r[12],
      damageNotes: r[13],
      photoCount: Number(r[14] || 0),
      folderUrl: r[15] || '',
      pdfUrl: r[16] || '',
      photoLinks: parsed.photoLinks || [],
      updatedAt: r[18] || ''
    };
  });
}

function syncMultiModelPartsMaster_(ss, partsList) {
  var sheet = ss.getSheetByName('MultiModel_Parts_Master');
  if (!sheet) {
    sheet = ss.insertSheet('MultiModel_Parts_Master');
    sheet.getRange(1, 1, 1, 9).setValues([[
      'Group ID', 'Part Name (TH/EN)', 'Primary Part No.', 'All Equivalent Part Nos.',
      'Compatible Models', 'Price (THB)', 'Photo URL', 'Notes', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).clearContent();
  }
  if (Array.isArray(partsList) && partsList.length > 0) {
    var rows = partsList.map(function(p, idx) {
      var eqList = Array.isArray(p.partNumbers) ? p.partNumbers.join(', ') : String(p.partNumbers || p.primaryPartNo || '');
      var modList = Array.isArray(p.models) ? p.models.join(', ') : String(p.models || '');
      return [
        String(p.id || ('PRT-' + (idx + 1))),
        String(p.name || ''),
        String(p.primaryPartNo || ''),
        eqList,
        modList,
        Number(p.price || 0),
        String(p.photoUrl || ''),
        String(p.notes || ''),
        String(p.updatedAt || nowStr)
      ];
    });
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }
}

function readMultiModelPartsMaster_(ss) {
  var sheet = ss.getSheetByName('MultiModel_Parts_Master');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  return vals.map(function(r) {
    return {
      id: r[0],
      name: r[1],
      primaryPartNo: r[2],
      partNumbers: String(r[3] || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
      models: String(r[4] || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
      price: Number(r[5] || 0),
      photoUrl: r[6] || '',
      notes: r[7] || '',
      updatedAt: r[8] || ''
    };
  });
}


// ============================================================================
// 11. QUALITY CONCERN FORM (QCF) & EXECUTIVE REPAIR/CLAIM MEMO ENGINE (v194.0)
// ============================================================================

function saveQcfAndMemoReport_(ss, data, secrets) {
  var sheet = ss.getSheetByName('QCF_And_Memo_Reports');
  if (!sheet) {
    sheet = ss.insertSheet('QCF_And_Memo_Reports');
    var headers = [
      'QCF Issued No.', 'Issued Date', 'Ref Inspection ID', 'Model', 'Serial No.',
      'Customer Name', 'Claim Type', 'Memo Subject', 'Memo Total Cost (THB)',
      'Factory Reply Status', 'Drive Folder URL', 'QCF PDF URL', 'Memo PDF URL',
      'Full JSON Payload', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var qcfNo = String(data.qcfIssuedNo || ('QCF_HTH' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'ddMMyy'))).trim().toUpperCase();
  var folder = getOrCreateInspectionDriveFolder_(qcfNo, data.issuedDate || '');
  var folderUrl = folder.getUrl();

  var qcfPdfUrl = data.qcfPdfUrl || '';
  if (data.qcfPdfHtml && String(data.qcfPdfHtml).indexOf('<') > -1) {
    try {
      var qBlob = HtmlService.createHtmlOutput(data.qcfPdfHtml).getAs('application/pdf')
        .setName(qcfNo + '_' + (data.model || 'MODEL') + '_QCF_Report.pdf');
      qcfPdfUrl = folder.createFile(qBlob).getUrl();
    } catch (e1) {}
  }

  var memoPdfUrl = data.memoPdfUrl || '';
  if (data.memoPdfHtml && String(data.memoPdfHtml).indexOf('<') > -1) {
    try {
      var mBlob = HtmlService.createHtmlOutput(data.memoPdfHtml).getAs('application/pdf')
        .setName('MEMO_' + qcfNo + '_Request_Part_Repair.pdf');
      memoPdfUrl = folder.createFile(mBlob).getUrl();
    } catch (e2) {}
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var saveCopy = Object.assign({}, data, {
    qcfIssuedNo: qcfNo,
    folderUrl: folderUrl,
    qcfPdfUrl: qcfPdfUrl,
    memoPdfUrl: memoPdfUrl
  });
  delete saveCopy.qcfPdfHtml;
  delete saveCopy.memoPdfHtml;

  var rowVals = [
    qcfNo,
    data.issuedDate || '',
    data.refInspectionId || 'FREEFORM',
    data.model || '',
    data.serialNo || '',
    data.customerName || '',
    data.claimType || '',
    data.memoSubject || '',
    Number(data.memoGrandTotal || 0),
    data.replyStatus || 'PENDING_FACTORY',
    folderUrl,
    qcfPdfUrl,
    memoPdfUrl,
    JSON.stringify(saveCopy).substring(0, 48000),
    nowStr
  ];

  var rowIdx = findRowByExactKey(sheet, 1, qcfNo);
  if (rowIdx > 0) sheet.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  if (secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    var msg = '🌐 ออกเอกสาร QCF & Memo เสนอผู้บริหาร/ส่งเคลมโรงงาน\n' +
              '━━━━━━━━━━━━━━━━━━━━\n' +
              '🆔 เลขที่ QCF: ' + qcfNo + (data.refInspectionId ? ' (อ้างอิง: ' + data.refInspectionId + ')' : '') + '\n' +
              '❄️ รุ่น / S/N: ' + (data.model || '-') + ' / ' + (data.serialNo || '-') + '\n' +
              '💰 มูลค่าเบิกอะไหล่ซ่อม (Memo): ' + formatCurrency(data.memoGrandTotal || 0) + ' THB\n' +
              '📝 อาการ/ความเสียหาย: ' + (data.concernSummary || '-') + '\n' +
              (qcfPdfUrl ? '📄 QCF PDF: ' + qcfPdfUrl + '\n' : '') +
              (memoPdfUrl ? '📑 Memo PDF: ' + memoPdfUrl : '');
    pushLineMessage(secrets.lineGroupId, msg);
  }

  return saveCopy;
}

function readQcfAndMemoReports_(ss, limit) {
  var sheet = ss.getSheetByName('QCF_And_Memo_Reports');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - (limit || 300) + 1);
  var vals = sheet.getRange(startRow, 1, lastRow - startRow + 1, 15).getValues();
  return vals.reverse().map(function(r) {
    var parsed = {};
    try { if (r[13]) parsed = JSON.parse(r[13]); } catch (e) {}
    return Object.assign(parsed, {
      qcfIssuedNo: r[0],
      issuedDate: r[1],
      refInspectionId: r[2],
      model: r[3],
      serialNo: r[4],
      customerName: r[5],
      claimType: r[6],
      memoSubject: r[7],
      memoGrandTotal: Number(r[8] || 0),
      replyStatus: r[9] || 'PENDING_FACTORY',
      folderUrl: r[10] || '',
      qcfPdfUrl: r[11] || '',
      memoPdfUrl: r[12] || '',
      updatedAt: r[14] || ''
    });
  });
}


// ============================================================================
// 12. CONFIDENTIAL COST, GP% ANALYTICS & PRICE/DISCOUNT APPROVAL ENGINE (v195.0)
// ============================================================================

function syncConfidentialCostMaster_(ss, data, secrets) {
  var sheet = ss.getSheetByName('Confidential_Part_Cost_Master');
  if (!sheet) {
    sheet = ss.insertSheet('Confidential_Part_Cost_Master');
    var headers = [
      'Part No.', 'Description', 'Cost (THB)', 'Dealer Price (THB)', 'Dealer %GP (Cost)',
      'Dealer %Margin', 'Direct Price (THB)', 'Direct %GP (Cost)', 'Direct %Margin', 'Updated By', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#7F1D1D').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var editor = String(data.updatedBy || 'Manager');
  if (Array.isArray(data.parts) && data.parts.length > 0) {
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).clearContent();
    }
    var rows = data.parts.map(function(it) {
      var cost = Number(it.c || it.cost || 0);
      var dl = Number(it.dl || it.dealerPrice || 0);
      var dr = Number(it.dr || it.directPrice || 0);
      var dlGp = cost > 0 ? (((dl - cost) / cost) * 100).toFixed(2) + '%' : '0%';
      var dlMg = dl > 0 ? (((dl - cost) / dl) * 100).toFixed(2) + '%' : '0%';
      var drGp = cost > 0 ? (((dr - cost) / cost) * 100).toFixed(2) + '%' : '0%';
      var drMg = dr > 0 ? (((dr - cost) / dr) * 100).toFixed(2) + '%' : '0%';
      return [it.p || '', it.d || '', cost, dl, dlGp, dlMg, dr, drGp, drMg, editor, nowStr];
    });
    sheet.getRange(2, 1, rows.length, 11).setValues(rows);
  }

  var auditSheet = ss.getSheetByName('Confidential_Cost_Audit_Log');
  if (!auditSheet) {
    auditSheet = ss.insertSheet('Confidential_Cost_Audit_Log');
    auditSheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Editor / Manager', 'Action Summary', 'Parts Count', 'Authorized Editors']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    auditSheet.setFrozenRows(1);
  }
  auditSheet.appendRow([
    nowStr,
    editor,
    String(data.auditSummary || 'Updated Confidential Cost & Markup Table'),
    Array.isArray(data.parts) ? data.parts.length : 0,
    Array.isArray(data.authorizedEditors) ? data.authorizedEditors.join(', ') : ''
  ]);
}

function savePriceApprovalReport_(ss, data, secrets) {
  var sheet = ss.getSheetByName('Price_Discount_Approvals');
  if (!sheet) {
    sheet = ss.insertSheet('Price_Discount_Approvals');
    var headers = [
      'Approval ID', 'Date', 'Ref Offer No.', 'Customer / Dealer', 'Sales PIC', 'Price Tier',
      'Total Cost (THB)', 'Total Selling (THB)', 'Gross Profit (THB)', 'GP Margin %', 'GP Markup %',
      'Approval Level', 'Status', 'Prepared By', 'Reason / Notes', 'PDF URL', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var appId = String(data.approvalId || ('APR-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss'))).toUpperCase();
  var folder = getOrCreateMonthlyTechFolder(data.date || '', 'PRICE_APPROVALS_CONFIDENTIAL');
  var pdfUrl = '';
  if (data.approvalPdfHtml && String(data.approvalPdfHtml).indexOf('<') > -1) {
    try {
      var blob = HtmlService.createHtmlOutput(data.approvalPdfHtml).getAs('application/pdf')
        .setName(appId + '_' + (data.refOfferNo || 'QT') + '_GP_Approval.pdf');
      pdfUrl = folder.createFile(blob).getUrl();
    } catch (e) {}
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowVals = [
    appId, data.date || '', data.refOfferNo || '', data.customerName || '', data.salesPic || '',
    data.priceTier || '', Number(data.totalCost || 0), Number(data.totalSelling || 0),
    Number(data.grossProfit || 0), String(data.gpMarginPct || '0%'), String(data.gpMarkupPct || '0%'),
    data.approvalLevel || 'MANAGER', data.status || 'PENDING_APPROVAL', data.preparedBy || '',
    data.reasonNotes || '', pdfUrl, nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, appId);
  if (rowIdx > 0) sheet.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  if (secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    var msg = '🔐 ขอพิจารณาอนุมัติราคาขาย & ส่วนลดพิเศษ (GP% Approval)\n' +
              '━━━━━━━━━━━━━━━━━━━━\n' +
              '🆔 รหัสคำขอ: ' + appId + ' (อ้างอิง QT: ' + (data.refOfferNo || '-') + ')\n' +
              '🏢 ลูกค้า/ดีลเลอร์: ' + (data.customerName || '-') + ' (Sales PIC: ' + (data.salesPic || '-') + ')\n' +
              '💰 ยอดเสนอขาย: ' + formatCurrency(data.totalSelling || 0) + ' THB | GP Margin: ' + (data.gpMarginPct || '0%') + '\n' +
              '⚠️ ระดับอนุมัติ: ' + (data.approvalLevel || 'MANAGER') + '\n' +
              (pdfUrl ? '📄 เอกสารขออนุมัติ (Confidential PDF): ' + pdfUrl : '');
    pushLineMessage(secrets.lineGroupId, msg);
  }
  return { approvalId: appId, pdfUrl: pdfUrl };
}


// ============================================================================
// 13. TWO-WAY CONFIDENTIAL COST SYNC & MANAGER APPROVAL ENGINE (v196.0)
// ============================================================================

function readConfidentialCostAndApprovals_(ss) {
  var parts = [];
  var costSheet = ss.getSheetByName('Confidential_Part_Cost_Master');
  if (costSheet && costSheet.getLastRow() >= 2) {
    var vals = costSheet.getRange(2, 1, costSheet.getLastRow() - 1, 7).getValues();
    parts = vals.map(function(r) {
      return {
        p: String(r[0] || '').trim().toUpperCase(),
        d: String(r[1] || '').trim(),
        c: Number(r[2] || 0),
        dl: Number(r[3] || 0),
        dr: Number(r[6] || 0)
      };
    }).filter(function(x) { return Boolean(x.p); });
  }

  var approvals = [];
  var aprSheet = ss.getSheetByName('Price_Discount_Approvals');
  if (aprSheet && aprSheet.getLastRow() >= 2) {
    var lastR = aprSheet.getLastRow();
    var startR = Math.max(2, lastR - 149);
    var aVals = aprSheet.getRange(startR, 1, lastR - startR + 1, 17).getValues();
    approvals = aVals.reverse().map(function(r) {
      return {
        approvalId: r[0],
        date: r[1],
        refOfferNo: r[2],
        customerName: r[3],
        salesPic: r[4],
        priceTier: r[5],
        totalCost: Number(r[6] || 0),
        totalSelling: Number(r[7] || 0),
        grossProfit: Number(r[8] || 0),
        gpMarginPct: r[9] || '0%',
        gpMarkupPct: r[10] || '0%',
        approvalLevel: r[11] || '',
        status: r[12] || 'PENDING_APPROVAL',
        preparedBy: r[13] || '',
        reasonNotes: r[14] || '',
        pdfUrl: r[15] || '',
        updatedAt: r[16] || ''
      };
    });
  }
  return { parts: parts, approvals: approvals };
}

function updatePriceApprovalDecision_(ss, data, secrets) {
  var aprSheet = ss.getSheetByName('Price_Discount_Approvals');
  if (!aprSheet || aprSheet.getLastRow() < 2) return null;
  var appId = String(data.approvalId || '').trim().toUpperCase();
  var rowIdx = findRowByExactKey(aprSheet, 1, appId);
  if (rowIdx < 2) return null;
  var decision = String(data.decision || 'APPROVED').toUpperCase();
  var approver = String(data.approvedBy || 'Manager');
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var statusLabel = decision + ' (' + approver + ' @ ' + nowStr + ')';
  aprSheet.getRange(rowIdx, 13).setValue(statusLabel);
  aprSheet.getRange(rowIdx, 17).setValue(nowStr);

  if (secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    var offerNo = aprSheet.getRange(rowIdx, 3).getValue();
    var cust = aprSheet.getRange(rowIdx, 4).getValue();
    var icon = decision === 'APPROVED' ? '✅' : '❌';
    pushLineMessage(
      secrets.lineGroupId,
      icon + ' ผลการพิจารณาอนุมัติราคา/ส่วนลด [' + appId + ']\n' +
      '• สถานะ: ' + decision + ' โดย ' + approver + '\n' +
      '• ใบเสนอราคา: ' + offerNo + ' (' + cust + ')'
    );
  }
  return { approvalId: appId, status: statusLabel };
}


// ============================================================================
// v197.0 LEGACY SERVICE HISTORY ARCHIVE & BULK FOLDER IMPORTER (4-5 YEARS)
// ============================================================================
function getOrCreateLegacyArchiveRootFolder_() {
  var rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(ROOT_DRIVE_FOLDER_ID);
  } catch (e) {
    rootFolder = DriveApp.getRootFolder();
  }
  var legacyFolders = rootFolder.getFoldersByName('HOSHIZAKI_LEGACY_SERVICE_ARCHIVE_2020_2026');
  return legacyFolders.hasNext() ? legacyFolders.next() : rootFolder.createFolder('HOSHIZAKI_LEGACY_SERVICE_ARCHIVE_2020_2026');
}

function getOrCreateLegacyJobFolder_(dateStr, serialNo, customerName) {
  var root = getOrCreateLegacyArchiveRootFolder_();
  var ym = String(dateStr || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ym = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM');
  }
  var yearStr = ym.slice(0, 4);
  var yFolders = root.getFoldersByName(yearStr);
  var yFolder = yFolders.hasNext() ? yFolders.next() : root.createFolder(yearStr);

  var ymFolders = yFolder.getFoldersByName(ym);
  var ymFolder = ymFolders.hasNext() ? ymFolders.next() : yFolder.createFolder(ym);

  var safeSn = String(serialNo || 'NO_SN').replace(/[^a-zA-Z0-9_-]/g, '_');
  var safeCust = String(customerName || 'CUSTOMER').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  var jobFolderName = ym + '_' + safeSn + '_' + safeCust;
  var jFolders = ymFolder.getFoldersByName(jobFolderName);
  return jFolders.hasNext() ? jFolders.next() : ymFolder.createFolder(jobFolderName);
}

function ensureLegacyServiceSheet_(ss) {
  var sheetName = 'Legacy_Service_History';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      'Legacy_ID', 'Service_Date', 'Customer_Store', 'Model', 'Serial_No',
      'Technician', 'Symptom', 'Action_Taken', 'Result_Status', 'Parts_Used',
      'Photo_Count', 'Drive_Folder_URL', 'Photo_Thumbnails_JSON', 'Raw_Text', 'Imported_At'
    ]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveLegacyServiceRecordToCloud_(ss, data) {
  var sheet = ensureLegacyServiceSheet_(ss);
  var legacyId = String(data.legacyId || ('LEG-' + Date.now())).trim();
  var dateStr = String(data.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')).trim();
  var customer = String(data.customer || '-').trim();
  var model = String(data.model || '-').trim().toUpperCase();
  var serial = String(data.serial || '-').trim().toUpperCase();
  var technician = String(data.technician || '-').trim();
  var symptom = String(data.symptom || '-').trim();
  var actionTaken = String(data.actionTaken || '-').trim();
  var status = String(data.status || 'Complete').trim();
  var partsUsed = String(data.partsUsed || '-').trim();
  var rawText = String(data.rawText || '').trim();

  // v200.0 Cloud-Wide Duplicate Check (Serial No. + Service Date + Symptom)
  var existingRow = findRowByExactKey(sheet, 1, legacyId);
  if (existingRow < 2 && serial && serial !== '-' && serial !== 'NO_SN' && sheet.getLastRow() >= 2 && !data.forceOverwrite) {
    var lastRow = sheet.getLastRow();
    var startRow = Math.max(2, lastRow - 1500);
    var rows = sheet.getRange(startRow, 1, lastRow - startRow + 1, 15).getValues();
    var normSym = symptom.toLowerCase().replace(/\s+/g, '');
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      var rDate = String(r[1] || '').trim();
      var rSn = String(r[4] || '').trim().toUpperCase();
      var rSym = String(r[6] || '').trim().toLowerCase().replace(/\s+/g, '');
      if (rSn === serial && rDate === dateStr && (rSym === normSym || normSym.length < 4)) {
        var dupPhotos = [];
        try { dupPhotos = JSON.parse(String(r[12] || '[]')); } catch (e) {}
        return {
          duplicateOnCloud: true,
          message: 'ตรวจพบข้อมูล S/N: ' + serial + ' วันที่ ' + dateStr + ' ถูกบันทึกในระบบส่วนกลางแล้วโดย ' + (r[5] || 'ทีมช่าง'),
          legacyId: String(r[0] || ''),
          date: rDate,
          customer: String(r[2] || ''),
          model: String(r[3] || ''),
          serial: rSn,
          technician: String(r[5] || ''),
          symptom: String(r[6] || ''),
          actionTaken: String(r[7] || ''),
          status: String(r[8] || ''),
          partsUsed: String(r[9] || ''),
          photoCount: Number(r[10] || 0),
          driveFolderUrl: String(r[11] || ''),
          photoUrls: dupPhotos,
          importedAt: String(r[14] || '')
        };
      }
    }
  }

  var photoUrls = [];
  var folderUrl = String(data.driveFolderUrl || '').trim();

  if (Array.isArray(data.photos) && data.photos.length > 0) {
    var folder = getOrCreateLegacyJobFolder_(dateStr, serial, customer);
    folderUrl = folder.getUrl();
    data.photos.forEach(function(p, idx) {
      try {
        var b64 = String(p.dataUrl || '');
        if (b64.indexOf('base64,') > -1) {
          var mime = b64.substring(5, b64.indexOf(';')) || 'image/jpeg';
          var rawB64 = b64.split('base64,')[1];
          var blob = Utilities.newBlob(Utilities.base64Decode(rawB64), mime, (p.name || ('legacy_' + (idx + 1) + '.jpg')));
          var file = folder.createFile(blob);
          try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (se) {}
          photoUrls.push({
            id: file.getId(),
            name: file.getName(),
            url: file.getUrl(),
            thumb: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000'
          });
        } else if (p.url || p.thumb) {
          photoUrls.push(p);
        }
      } catch (pe) {}
    });
  } else if (Array.isArray(data.photoUrls)) {
    photoUrls = data.photoUrls;
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowVals = [
    legacyId, dateStr, customer, model, serial,
    technician, symptom, actionTaken, status, partsUsed,
    photoUrls.length, folderUrl, JSON.stringify(photoUrls), rawText, nowStr
  ];

  if (existingRow >= 2) {
    sheet.getRange(existingRow, 1, 1, 15).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }

  return {
    duplicateOnCloud: false,
    legacyId: legacyId,
    date: dateStr,
    customer: customer,
    model: model,
    serial: serial,
    technician: technician,
    symptom: symptom,
    actionTaken: actionTaken,
    status: status,
    partsUsed: partsUsed,
    photoCount: photoUrls.length,
    driveFolderUrl: folderUrl,
    photoUrls: photoUrls,
    importedAt: nowStr
  };
}

function getLegacyServiceHistoryFromSheet_(ss, serialFilter, limitCount) {
  var sheet = ss.getSheetByName('Legacy_Service_History');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - (limitCount || 3000) + 1);
  var vals = sheet.getRange(startRow, 1, lastRow - startRow + 1, 15).getValues();
  var qSn = String(serialFilter || '').trim().toUpperCase();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    var r = vals[i];
    var rSn = String(r[4] || '').trim().toUpperCase();
    if (qSn && rSn !== qSn && !(qSn.length >= 5 && rSn.indexOf(qSn) > -1)) continue;
    var photos = [];
    try { photos = JSON.parse(String(r[12] || '[]')); } catch (e) {}
    out.push({
      legacyId: String(r[0] || ''),
      date: String(r[1] || ''),
      customer: String(r[2] || ''),
      model: String(r[3] || ''),
      serial: rSn,
      technician: String(r[5] || ''),
      symptom: String(r[6] || ''),
      actionTaken: String(r[7] || ''),
      status: String(r[8] || ''),
      partsUsed: String(r[9] || ''),
      photoCount: Number(r[10] || photos.length || 0),
      driveFolderUrl: String(r[11] || ''),
      photoUrls: photos,
      rawText: String(r[13] || ''),
      importedAt: String(r[14] || '')
    });
  }
  return out;
}


// ============================================================================
// v197.1 ZERO-COMMAND LINE GROUP AUTO-CAPTURE (TEXT + IMAGES) FOR LEGACY NOTES
// ============================================================================
function fetchLineMessageContentBlob_(messageId, fileName) {
  var secrets = getAppSecrets_();
  if (!secrets.lineToken || !messageId) return null;
  try {
    var url = 'https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content';
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + secrets.lineToken },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return res.getBlob().setName(fileName || ('line_img_' + messageId + '.jpg'));
    }
  } catch (e) {}
  return null;
}

function parseLegacyServiceNoteTextServer_(rawText) {
  var lines = String(rawText || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  var technician = '';
  var customer = '';
  var model = '';
  var serial = '';
  var symptom = '';
  var actionTaken = '';
  var partsUsed = '';
  var status = 'Complete';
  var dateIso = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');

  var dateMatch = rawText.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  if (dateMatch) {
    var norm = normalizeDateForSort_(dateMatch[1]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) dateIso = norm;
  }

  var bodyStartIdx = 0;
  if (lines.length > 0 && /(hoshizaki|hth|service)/i.test(lines[0]) && !/^(อาการ|การแก้ไข|ผล|สถานะ|check in)/i.test(lines[0])) {
    technician = lines[0];
    bodyStartIdx = 1;
  }

  var modelRegex = /\b((?:IM|KM|KMD|FM|AM|HR|HF|HRF|HRW|HW|RF|RR|RRF|RT|RTC|RTF|RTS|RW|RFT|HNC|FNC|HSU|JWE|DBF|DWM|DCM|DIM|DIW|DIC|DL|HIH|B)[-\s]?[A-Z0-9]{2,}(?:-[A-Z0-9]+)*)\b/i;
  var snExplicitRegex = /(?:S\/?N|sn|#)\s*[:.]?\s*([A-Z0-9]{5,14})/i;
  var standaloneSnRegex = /^([A-Z]\d{4,6}[A-Z0-9]{0,3})$/i;

  for (var i = bodyStartIdx; i < lines.length; i++) {
    var line = lines[i];
    if (!model) {
      var mMatch = line.match(modelRegex);
      if (mMatch) model = mMatch[1].replace(/\s+/g, '-').toUpperCase();
    }
    if (!serial) {
      var snMatch = line.match(snExplicitRegex);
      if (snMatch) serial = snMatch[1].toUpperCase();
      else if (standaloneSnRegex.test(line)) serial = line.toUpperCase();
    }
    if (/^อาการ(?:ที่แจ้ง)?\s*[.:]?\s*/i.test(line)) {
      symptom = line.replace(/^อาการ(?:ที่แจ้ง)?\s*[.:]?\s*/i, '').trim();
    } else if (/^การแก้ไข\s*[.:]?\s*/i.test(line)) {
      actionTaken = line.replace(/^การแก้ไข\s*[.:]?\s*/i, '').trim();
    } else if (/^ผล(?:การทำงาน)?\s*[.:]?\s*/i.test(line)) {
      var resTxt = line.replace(/^ผล(?:การทำงาน)?\s*[.:]?\s*/i, '').trim();
      actionTaken = actionTaken ? (actionTaken + ' (ผล: ' + resTxt + ')') : resTxt;
    } else if (/^สถานะ\s*[.:]?\s*/i.test(line)) {
      status = line.replace(/^สถานะ\s*[.:]?\s*/i, '').trim();
    } else if (/^อะไหล่\s*[.:]?\s*/i.test(line)) {
      partsUsed = line.replace(/^อะไหล่\s*[.:]?\s*/i, '').trim();
    } else if (!customer && i <= bodyStartIdx + 1 && !modelRegex.test(line) && !/^[-•]/.test(line)) {
      customer = line;
    }
  }

  if (!actionTaken) {
    var descLines = lines.slice(bodyStartIdx).filter(function(l) {
      return l !== customer &&
        (!model || l.toUpperCase().indexOf(model) === -1) &&
        (!serial || l.toUpperCase().indexOf(serial) === -1) &&
        !/^(อาการ|สถานะ)/i.test(l);
    });
    actionTaken = descLines.join(' | ');
  }

  if (!partsUsed && actionTaken) {
    var chgMatch = actionTaken.match(/เปลี่ยน\s+([^\n|]+)/i);
    if (chgMatch) partsUsed = chgMatch[1].trim();
  }

  return {
    date: dateIso,
    technician: technician || 'Hoshizaki Service Team',
    customer: customer || '-',
    model: model || '-',
    serial: serial || '-',
    symptom: symptom || '-',
    actionTaken: actionTaken || '-',
    partsUsed: partsUsed || '-',
    status: status || 'Complete',
    rawText: rawText
  };
}

function tryAutoCaptureLegacyFromLineGroup_(ss, ev, rawText) {
  var src = ev.source || {};
  var groupId = src.groupId || src.roomId || '';
  var userId = src.userId || 'UNKNOWN';
  if (!groupId) return false;

  // Detect if message looks like a Hoshizaki Service Note / Job Post
  var hasModel = /\b(?:IM|KM|KMD|FM|AM|HR|HF|HRF|HRW|HW|RF|RR|RRF|RT|RTC|RTF|RTS|RW|RFT|HNC|FNC|HSU|JWE|DBF|DWM|DCM|DIM|DIW|DIC|DL|HIH|B)[-\s]?[A-Z0-9]{2,}/i.test(rawText);
  var hasSnOrKeywords = /(?:S\/?N|sn|#)\s*[:.]?\s*[A-Z0-9]{5,14}|อาการ(?:ที่แจ้ง)?|การแก้ไข|สถานะ\.complete|Check in Service Center/i.test(rawText);
  var lineCount = rawText.split(/\r?\n/).filter(Boolean).length;

  if (!hasModel && !(hasSnOrKeywords && lineCount >= 2)) return false;

  var parsed = parseLegacyServiceNoteTextServer_(rawText);
  if ((!parsed.model || parsed.model === '-') && (!parsed.serial || parsed.serial === '-')) return false;

  if (!parsed.technician || parsed.technician === 'Hoshizaki Service Team') {
    var senderName = getLineUserDisplayName_(userId);
    if (senderName && senderName !== 'ลูกค้า LINE') parsed.technician = senderName;
  }

  var legacyId = 'LEG-LINE-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  var folder = getOrCreateLegacyJobFolder_(parsed.date, parsed.serial, parsed.customer);
  var savedRec = saveLegacyServiceRecordToCloud_(ss, {
    legacyId: legacyId,
    date: parsed.date,
    customer: parsed.customer,
    model: parsed.model,
    serial: parsed.serial,
    technician: parsed.technician,
    symptom: parsed.symptom,
    actionTaken: parsed.actionTaken,
    status: parsed.status,
    partsUsed: parsed.partsUsed,
    driveFolderUrl: folder.getUrl(),
    rawText: rawText,
    photoUrls: []
  });

  // Store 5-minute session context so subsequent images sent by this user in the same group attach automatically
  var cache = CacheService.getScriptCache();
  var sessKey = 'LEG_SESS_' + groupId + '_' + userId;
  cache.put(sessKey, JSON.stringify({
    legacyId: legacyId,
    folderId: folder.getId(),
    serial: parsed.serial,
    customer: parsed.customer,
    model: parsed.model
  }), 300);

  var isExplicitImport = /#import|#เปิดใบงาน/i.test(rawText);
  if (isExplicitImport) {
    var autoJobNo = 'JOB-IMP-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
    upsertJobToSheet(ss, {
      jobNo: autoJobNo,
      date: parsed.date,
      jobStatus: 'Pending Review',
      techCode: 'LINE-IMPORT',
      responsibleTech: parsed.technician,
      store: parsed.customer,
      model: parsed.model,
      serial: parsed.serial,
      diagSymptom: parsed.symptom,
      diagAction: parsed.actionTaken,
      partsSummary: parsed.partsUsed,
      grandTotal: '0.00'
    }, folder.getUrl(), '');
  }

  if (ev.replyToken) {
    replyLineMessage(
      ev.replyToken,
      (isExplicitImport ? '🚀 [#import สำเร็จ] สร้างใบแจ้งบริการเข้า Service_Jobs และคลัง Serial 360° แล้ว\n' : '✅ บันทึกประวัติซ่อมเข้าคลัง Serial 360° อัตโนมัติแล้ว\n') +
      '• ลูกค้า: ' + parsed.customer + '\n' +
      '• รุ่น/S/N: ' + parsed.model + ' / ' + parsed.serial + '\n' +
      '• ช่าง: ' + parsed.technician + '\n' +
      '📸 ส่งรูปภาพประกอบตามมาในห้องนี้ภายใน 5 นาที ระบบจะเก็บรวมเข้าโฟลเดอร์นี้ให้อัตโนมัติครับ'
    );
  }
  return true;
}

function handleLineGroupImageAttachment_(ss, ev) {
  var src = ev.source || {};
  var groupId = src.groupId || src.roomId || '';
  var userId = src.userId || 'UNKNOWN';
  var msgId = ev.message && ev.message.id;
  if (!groupId || !msgId) return false;

  var cache = CacheService.getScriptCache();
  var sessKey = 'LEG_SESS_' + groupId + '_' + userId;
  var rawSess = cache.get(sessKey);
  if (!rawSess) return false;

  try {
    var sess = JSON.parse(rawSess);
    // Refresh 5-minute TTL
    cache.put(sessKey, rawSess, 300);

    var folder = DriveApp.getFolderById(sess.folderId);
    var fileName = (sess.serial || 'SN') + '_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HHmmss') + '_' + msgId.slice(-4) + '.jpg';
    var blob = fetchLineMessageContentBlob_(msgId, fileName);
    if (!blob) return false;

    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (se) {}

    var sheet = ensureLegacyServiceSheet_(ss);
    var rowIdx = findRowByExactKey(sheet, 1, sess.legacyId);
    if (rowIdx >= 2) {
      var curCount = Number(sheet.getRange(rowIdx, 11).getValue() || 0);
      var curPhotos = [];
      try { curPhotos = JSON.parse(String(sheet.getRange(rowIdx, 13).getValue() || '[]')); } catch (pe) {}
      curPhotos.push({
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        thumb: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000'
      });
      sheet.getRange(rowIdx, 11).setValue(curCount + 1);
      sheet.getRange(rowIdx, 13).setValue(JSON.stringify(curPhotos));
    }
    return true;
  } catch (e) {
    return false;
  }
}


/* ============================================================================
   ENTERPRISE v200.0 NEXT-GEN SUITE:
   A) 1-Tap On-Site Repair & Parts Approval Portal + LINE Notification
   B) Customer & Dealer Self-Service Machine QR Portal (Warranty + PM + Request)
   ============================================================================ */
function ensureOnSiteRepairApprovalSheet_(ss) {
  var sheet = ss.getSheetByName('OnSite_Repair_Approvals');
  if (!sheet) {
    sheet = ss.insertSheet('OnSite_Repair_Approvals');
    sheet.appendRow([
      'Timestamp', 'Job No.', 'Customer / Store', 'Model', 'Serial No.',
      'Technician', 'Approved Parts & Services', 'Total Amount (THB)',
      'Approver Name', 'Decision', 'Customer Note'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveOnSiteRepairApproval_(ss, params) {
  var sheet = ensureOnSiteRepairApprovalSheet_(ss);
  var ts = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var jobNo = String(params.jobNo || '').trim();
  var cust = String(params.cust || '').trim();
  var model = String(params.model || '').trim();
  var serial = String(params.serial || '').trim();
  var tech = String(params.tech || '').trim();
  var parts = String(params.parts || '').trim();
  var total = String(params.total || '0.00').trim();
  var approver = String(params.approver || 'ผู้จัดการสาขา/ลูกค้า').trim();
  var decision = String(params.decision || 'APPROVED').trim();
  var note = String(params.note || '').trim();

  sheet.appendRow([ts, jobNo, cust, model, serial, tech, parts, total, approver, decision, note]);

  try {
    var secrets = getAppSecrets_();
    if (secrets && secrets.lineGroupId && isLineTokenConfigured()) {
      var icon = decision === 'APPROVED' ? '✅ [ลูกค้าอนุมัติซ่อม & เปลี่ยนอะไหล่แล้ว]' : '⏸️ [ลูกค้าขอชะลอ/สอบถามเพิ่มเติม]';
      var msg = icon + '\n' +
        '• เลขที่ใบงาน: ' + (jobNo || '-') + '\n' +
        '• ลูกค้า: ' + (cust || '-') + '\n' +
        '• รุ่น / S/N: ' + (model || '-') + ' / ' + (serial || '-') + '\n' +
        '• ช่างหน้างาน: ' + (tech || '-') + '\n' +
        '• รายการอะไหล่/บริการ: ' + (parts || '-') + '\n' +
        '• ยอดรวมสุทธิ: ' + total + ' บาท\n' +
        '• ผู้อนุมัติ: ' + approver + (note ? (' (' + note + ')') : '');
      pushLineMessage(secrets.lineGroupId, msg);
    }
  } catch (e) {}

  return { status: 'ok', timestamp: ts, jobNo: jobNo, decision: decision };
}

function buildOnSiteRepairApprovalHtmlPage_(params) {
  var jobNo = String(params.jobNo || '').replace(/[<>"']/g, '');
  var cust = String(params.cust || '').replace(/[<>"']/g, '');
  var model = String(params.model || '').replace(/[<>"']/g, '');
  var serial = String(params.serial || '').replace(/[<>"']/g, '');
  var tech = String(params.tech || '').replace(/[<>"']/g, '');
  var parts = String(params.parts || '').replace(/[<>"']/g, '');
  var total = String(params.total || '0.00').replace(/[<>"']/g, '');
  var webAppUrl = ScriptApp.getService().getUrl();

  var html = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HOSHIZAKI - อนุมัติรายการซ่อมและอะไหล่หน้างาน</title>' +
    '<style>' +
    'body{font-family:sans-serif;background:#f1f5f9;margin:0;padding:16px;color:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh}' +
    '.card{background:#fff;max-width:460px;width:100%;border-radius:18px;padding:22px;box-shadow:0 12px 32px rgba(0,43,73,.14);border-top:6px solid #0284c7}' +
    'h2{margin:0 0 4px;color:#002B49;font-size:19px} .sub{color:#475569;font-size:12.5px;margin-bottom:14px}' +
    '.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;font-size:13px;margin-bottom:14px;line-height:1.6}' +
    '.total{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:12px;padding:12px;font-size:16px;font-weight:800;text-align:center;margin-bottom:14px}' +
    'input,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:14px;margin-top:6px}' +
    '.btns{display:flex;gap:10px;margin-top:14px}' +
    'button{flex:1;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700;cursor:pointer}' +
    '.ok{background:#059669;color:#fff} .hold{background:#e2e8f0;color:#334155}' +
    '</style></head><body><div class="card">' +
    '<h2>HOSHIZAKI (THAILAND)</h2>' +
    '<div class="sub">ใบขออนุมัติเปลี่ยนอะไหล่และดำเนินการซ่อมหน้างาน (On-Site Approval)</div>' +
    '<div class="box"><b>เลขที่ใบงาน:</b> ' + (jobNo || '-') + '<br>' +
    '<b>ลูกค้า/สาขา:</b> ' + (cust || '-') + '<br>' +
    '<b>รุ่น / S/N:</b> ' + (model || '-') + ' / ' + (serial || '-') + '<br>' +
    '<b>ช่างผู้ดูแล:</b> ' + (tech || '-') + '<br>' +
    '<b>รายการอะไหล่/ค่าบริการ:</b><br>' + (parts || '-') + '</div>' +
    '<div class="total">ยอดรวมสุทธิ: ' + total + ' บาท</div>' +
    '<input id="approver" placeholder="ชื่อ-นามสกุล ผู้อนุมัติ / ผู้จัดการสาขา *">' +
    '<textarea id="note" rows="2" placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)..."></textarea>' +
    '<div class="btns" id="btnRow">' +
    '<button class="ok" onclick="sendDec(\'APPROVED\')">✓ อนุมัติซ่อมทันที</button>' +
    '<button class="hold" onclick="sendDec(\'HOLD\')">ชะลอ / ขอใบเสนอราคา</button>' +
    '</div>' +
    '<div id="doneMsg" style="display:none;text-align:center;padding:18px 0;font-weight:700;color:#059669;font-size:15px"></div>' +
    '</div><script>' +
    'function sendDec(dec){var app=document.getElementById("approver").value.trim()||"ผู้จัดการสาขา";' +
    'document.getElementById("btnRow").style.display="none";' +
    'var u=' + JSON.stringify(webAppUrl) + '+"?action=submitRepairApprovalGet&jobNo="+encodeURIComponent(' + JSON.stringify(jobNo) + ')+"&cust="+encodeURIComponent(' + JSON.stringify(cust) + ')+"&model="+encodeURIComponent(' + JSON.stringify(model) + ')+"&serial="+encodeURIComponent(' + JSON.stringify(serial) + ')+"&tech="+encodeURIComponent(' + JSON.stringify(tech) + ')+"&parts="+encodeURIComponent(' + JSON.stringify(parts) + ')+"&total="+encodeURIComponent(' + JSON.stringify(total) + ')+"&approver="+encodeURIComponent(app)+"&decision="+dec+"&note="+encodeURIComponent(document.getElementById("note").value);' +
    'fetch(u).then(function(){showDone(dec);}).catch(function(){showDone(dec);});}' +
    'function showDone(dec){var el=document.getElementById("doneMsg");el.style.display="block";el.textContent=dec==="APPROVED"?"✓ บันทึกการอนุมัติซ่อมเรียบร้อย! ช่างจะดำเนินการเปลี่ยนอะไหล่ให้ทันทีครับ":"✓ บันทึกคำขอชะลอเรียบร้อย ฝ่ายบริการจะจัดส่งใบเสนอราคาอย่างเป็นทางการให้ครับ";}' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('HOSHIZAKI On-Site Repair Approval');
}

function buildMachineSelfServiceQrPortalHtml_(ss, params) {
  var serial = String(params.serial || '').trim().toUpperCase().replace(/[<>"']/g, '');
  var model = String(params.model || '').trim().replace(/[<>"']/g, '');
  var cust = String(params.cust || '').trim().replace(/[<>"']/g, '');
  var webAppUrl = ScriptApp.getService().getUrl();

  var dossier = serial ? buildSerial360Dossier_(ss, serial) : null;
  if (dossier && dossier.model && dossier.model !== '-') model = dossier.model;
  if (dossier && dossier.customersList && dossier.customersList.length > 0 && !cust) {
    cust = dossier.customersList[0].name;
  }
  var warrantyText = (dossier && dossier.smartHealth && dossier.smartHealth.warrantyStatus)
    ? dossier.smartHealth.warrantyStatus
    : 'ตรวจสอบวันที่ติดตั้งจากป้ายรับประกัน / ติดต่อฝ่ายบริการ';
  var jobsList = (dossier && Array.isArray(dossier.jobs)) ? dossier.jobs.slice(0, 5) : [];
  var lastServiceDate = jobsList.length > 0 ? (jobsList[0].date || '-') : 'ยังไม่มีประวัติในระบบ';

  var historyHtml = jobsList.length > 0
    ? jobsList.map(function(j) {
        return '<div style="border-bottom:1px solid #e2e8f0;padding:8px 0"><b>' + escapeHtml(j.date || '-') + '</b> · ' + escapeHtml(j.jobNo || '-') +
          '<div style="color:#334155;font-size:12px">อาการ: ' + escapeHtml(j.diagSymptom || '-') + ' | แก้ไข: ' + escapeHtml(j.diagAction || '-') + '</div></div>';
      }).join('')
    : '<div style="color:#64748b;font-size:12px">ยังไม่พบประวัติงานซ่อมล่าสุด</div>';

  var html = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HOSHIZAKI Machine Passport - ' + escapeHtml(serial || model) + '</title>' +
    '<style>' +
    'body{font-family:sans-serif;background:#f0f9ff;margin:0;padding:14px;color:#0f172a}' +
    '.wrap{max-width:480px;margin:0 auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 10px 28px rgba(0,43,73,.12);border-top:6px solid #002B49}' +
    'h2{margin:0 0 4px;color:#002B49;font-size:19px} .tag{display:inline-block;background:#e0f2fe;color:#0369a1;font-weight:700;font-size:11px;padding:3px 10px;border-radius:99px;margin-bottom:12px}' +
    '.sec{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:12px;font-size:13px;line-height:1.55}' +
    '.btn{display:block;width:100%;box-sizing:border-box;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;text-align:center}' +
    '.btn-red{background:#dc2626;color:#fff} .btn-blue{background:#0284c7;color:#fff}' +
    'input,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:9px;font-size:13px;margin-top:6px}' +
    '</style></head><body><div class="wrap">' +
    '<h2>HOSHIZAKI MACHINE PASSPORT</h2>' +
    '<div class="tag">พอร์ทัลตรวจสอบสถานะเครื่อง &amp; บริการหลังการขาย</div>' +
    '<div class="sec"><b>Serial No.:</b> ' + escapeHtml(serial || '-') + '<br>' +
    '<b>รุ่นเครื่อง (Model):</b> ' + escapeHtml(model || '-') + '<br>' +
    '<b>สถานที่ติดตั้ง:</b> ' + escapeHtml(cust || '-') + '<br>' +
    '<b>สถานะการรับประกัน:</b> ' + escapeHtml(warrantyText) + '<br>' +
    '<b>บริการครั้งล่าสุด:</b> ' + escapeHtml(lastServiceDate) + '</div>' +
    '<div class="sec"><b>ประวัติการบำรุงรักษาและซ่อมล่าสุด:</b>' + historyHtml + '</div>' +
    '<div class="sec"><b>แจ้งซ่อมด่วน / สั่งซื้อไส้กรองน้ำ (4HC-H) / นัดล้าง PM:</b>' +
    '<input id="reqContact" placeholder="ชื่อผู้ติดต่อ และ เบอร์โทรร้านค้า *">' +
    '<textarea id="reqDetail" rows="2" placeholder="ระบุอาการเสีย หรือความต้องการ (เช่น เครื่องไม่ทำน้ำแข็ง / สั่งไส้กรองน้ำ 1 ชิ้น)..."></textarea>' +
    '<button class="btn btn-red" onclick="sendReq(\'SERVICE_CALL\')">🔧 ส่งเรื่องแจ้งซ่อม / นัดบริการ</button>' +
    '<button class="btn btn-blue" onclick="sendReq(\'FILTER_ORDER\')">💧 สั่งซื้อไส้กรองน้ำ Hoshizaki (4HC-H)</button>' +
    '<div id="reqDone" style="display:none;margin-top:10px;color:#059669;font-weight:700;text-align:center"></div>' +
    '</div></div><script>' +
    'function sendReq(kind){var c=document.getElementById("reqContact").value.trim();var d=document.getElementById("reqDetail").value.trim();' +
    'if(!c){alert("กรุณากรอกชื่อและเบอร์โทรติดต่อครับ");return;}' +
    'var u=' + JSON.stringify(webAppUrl) + '+"?action=submitMachinePortalRequest&kind="+kind+"&serial="+encodeURIComponent(' + JSON.stringify(serial) + ')+"&model="+encodeURIComponent(' + JSON.stringify(model) + ')+"&cust="+encodeURIComponent(' + JSON.stringify(cust) + ')+"&contact="+encodeURIComponent(c)+"&detail="+encodeURIComponent(d);' +
    'fetch(u).then(function(){document.getElementById("reqDone").style.display="block";document.getElementById("reqDone").textContent="✓ ส่งคำขอไปยังศูนย์บริการ Hoshizaki เรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุดครับ";});}' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('HOSHIZAKI Machine Passport');
}

// ============================================================================
// 14. ANNUAL SHEET ARCHIVER (KEEP HOT SHEETS < 1 YEAR FOR SUB-SECOND SPEED)
// ============================================================================
function archiveOldServiceJobsToYearlySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 365);
  var cutoffIso = Utilities.formatDate(cutoffDate, 'Asia/Bangkok', 'yyyy-MM-dd');

  var movedJobs = moveOldRowsToYearlyTab_(ss, 'Service_Jobs', 2, 'Service_Jobs_Archive_', cutoffIso);
  var movedLegacy = moveOldRowsToYearlyTab_(ss, 'Legacy_Service_History', 2, 'Legacy_History_Archive_', cutoffIso);

  if (movedJobs > 0 || movedLegacy > 0) {
    CacheService.getScriptCache().remove('PULL_ALL_JOBS_V18');
  }
  Logger.log('✅ Annual Sheet Archiver เสร็จสิ้น: ย้าย Service_Jobs ' + movedJobs + ' แถว, Legacy_History ' + movedLegacy + ' แถว (เก่ากว่า ' + cutoffIso + ')');
  return { status: 'ok', cutoffDate: cutoffIso, movedServiceJobs: movedJobs, movedLegacyHistory: movedLegacy };
}

function moveOldRowsToYearlyTab_(ss, sourceSheetName, dateCol1Based, archivePrefix, cutoffIso) {
  var srcSheet = ss.getSheetByName(sourceSheetName);
  if (!srcSheet || srcSheet.getLastRow() < 2) return 0;

  var lastRow = srcSheet.getLastRow();
  var lastCol = srcSheet.getLastColumn();
  var allValues = srcSheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = allValues[0];

  var keepRows = [];
  var archiveBuckets = {}; // yearStr -> rows[]
  var movedCount = 0;

  for (var i = 1; i < allValues.length; i++) {
    var row = allValues[i];
    var rawDate = row[dateCol1Based - 1];
    var normDate = '';
    if (rawDate instanceof Date) {
      normDate = Utilities.formatDate(rawDate, 'Asia/Bangkok', 'yyyy-MM-dd');
    } else {
      normDate = normalizeDateForSort_(String(rawDate || ''));
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normDate) && normDate !== '0000-00-00' && normDate < cutoffIso) {
      var yr = normDate.slice(0, 4);
      if (!archiveBuckets[yr]) archiveBuckets[yr] = [];
      archiveBuckets[yr].push(row);
      movedCount++;
    } else {
      keepRows.push(row);
    }
  }

  if (movedCount === 0) return 0;

  Object.keys(archiveBuckets).sort().forEach(function(yr) {
    var tabName = archivePrefix + yr;
    var archSheet = ss.getSheetByName(tabName);
    if (!archSheet) {
      archSheet = ss.insertSheet(tabName);
      archSheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      archSheet.setFrozenRows(1);
    }
    var rowsToAppend = archiveBuckets[yr];
    var startR = archSheet.getLastRow() + 1;
    archSheet.getRange(startR, 1, rowsToAppend.length, lastCol).setValues(rowsToAppend);
  });

  // Rewrite hot sheet cleanly with only recent (< 365 days) rows
  srcSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keepRows.length > 0) {
    srcSheet.getRange(2, 1, keepRows.length, lastCol).setValues(keepRows);
  }
  return movedCount;
}

// ============================================================================
// 15. HIGH-SECURITY CONFIDENTIAL VAULT & DOCUMENT INTEGRITY ENGINE (v1011-SEC)
// ============================================================================
function verifyServerManagerPin_(pinCandidate) {
  var props = PropertiesService.getScriptProperties();
  var storedPin = props.getProperty('MANAGER_PIN') || '1234';
  var clean = String(pinCandidate || '').trim();
  return clean.length >= 4 && clean === storedPin;
}

function updateServerManagerPin_(oldPin, newPin) {
  var props = PropertiesService.getScriptProperties();
  var storedPin = props.getProperty('MANAGER_PIN') || '1234';
  if (String(oldPin || '').trim() !== storedPin) {
    return { status: 'error', message: 'รหัส Manager PIN เดิมไม่ถูกต้องบน Server' };
  }
  var cleanNew = String(newPin || '').trim();
  if (cleanNew.length < 4) {
    return { status: 'error', message: 'รหัส PIN ใหม่ต้องมีอย่างน้อย 4 หลัก' };
  }
  props.setProperty('MANAGER_PIN', cleanNew);
  return { status: 'ok', message: 'อัปเดตรหัส Manager PIN บน Server เรียบร้อยแล้ว' };
}

function computeDocumentIntegrityHash_(docNo, dateStr, serialNo, grandTotal, itemsSummary) {
  var raw = [
    String(docNo || '').trim().toUpperCase(),
    String(dateStr || '').trim(),
    String(serialNo || '').trim().toUpperCase(),
    String(grandTotal || '0.00').trim(),
    String(itemsSummary || '').trim()
  ].join('|');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  var hex = digest.map(function(b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('').toUpperCase();
  return 'HZK-' + hex.slice(0, 16);
}


// ============================================================================
// 17. ENTERPRISE v1019 DISASTER RESILIENCE, 1-CLICK SHEET REBUILDER &
//     AUTOMATED NIGHTLY FULL-SYSTEM BACKUP ENGINE (23:00 DAILY TRIGGER)
// ============================================================================

function rebuildAllEnterpriseSheetsAndTriggers_(ss, secrets) {
  var created = [];
  var repaired = [];

  var schemaDefs = [
    {
      name: 'Service_Jobs',
      headers: [
        'Job No.', 'Date', 'Status', 'Tech Code', 'Responsible Tech', 'Team Techs',
        'Customer / Store', 'Dealer', 'Contact', 'Address',
        'Model', 'Serial No.', 'Product Type', 'Warranty',
        'Time In', 'Time Out', 'GPS',
        'Symptom', 'Detected Cause', 'Action / Troubleshooting', 'Parts Summary',
        'Grand Total (THB)', 'Drive Folder URL', 'PDF Backup URL', 'Updated At',
        'Defective Return Status', 'Payment Aging Status'
      ]
    },
    {
      name: 'Quotations',
      headers: [
        'Offer No.', 'Document Type', 'Ref. Job No.', 'Date',
        'Customer / Store', 'Dealer', 'Contact', 'Address',
        'Model', 'Serial No.', 'Price Tier', 'Parts & Services Summary',
        'Subtotal (THB)', 'VAT 7%', 'WHT 3%', 'Grand Total (THB)',
        'Remark', 'Technician', 'Updated At'
      ]
    },
    {
      name: 'Van_Stock',
      headers: ['Tech Code', 'Part Description', 'Qty Remaining', 'Status', 'Updated At']
    },
    {
      name: 'Service_Schedule',
      headers: ['Schedule ID', 'JSON Data', 'Updated At']
    },
    {
      name: 'Warranty_Claims',
      headers: ['Claim No.', 'Ref Job No.', 'Claim Date', 'Failed Date', 'Customer', 'Dealer', 'Model', 'Serial No.', 'Install Date', 'Symptom', 'Claim Parts', 'Updated At']
    },
    {
      name: 'Serial_Database_Updates',
      headers: ['Serial No.', 'Product Type', 'Model', 'Date Out', 'Invoice No.', 'Customer', 'PO No.', 'Deleted', 'Updated At']
    },
    {
      name: 'Legacy_Service_History',
      headers: [
        'Legacy_ID', 'Service_Date', 'Customer_Store', 'Model', 'Serial_No',
        'Technician', 'Symptom', 'Action_Taken', 'Result_Status', 'Parts_Used',
        'Photo_Count', 'Drive_Folder_URL', 'Photo_Thumbnails_JSON', 'Raw_Text', 'Imported_At'
      ]
    },
    {
      name: 'Parts_Advance_Tracking',
      headers: [
        'Req ID', 'Ref Job No.', 'Tech Name', 'Customer', 'Model / S/N',
        'Parts JSON', 'Stage Status', 'Carrier / Waybill', 'Delivery Doc URL',
        'Signatures JSON', 'Notes', 'Updated At'
      ]
    },
    {
      name: 'System_User_Credentials',
      headers: ['Staff ID', 'Code', 'Full Name', 'Department (8 Depts)', 'Position', 'RBAC Role', 'Salt', 'SHA-256 Password Hash', 'Temp Password', 'Suspended', 'Active', 'Updated At']
    },
    {
      name: 'System_Audit_Log',
      headers: ['Timestamp', 'Actor Staff ID', 'Actor Name', 'Department', 'RBAC Role', 'Target Account ID', 'Security Audit Event']
    },
    {
      name: 'Factory_GIT_ETA_Tracker',
      headers: ['Item Code', 'Description', 'Model', 'Serial No.', 'Origin', 'PO / Ref', 'Qty', 'ETD', 'ETA Port', 'ETA Warehouse', 'Status']
    },
    {
      name: 'Company_Staff_Directory',
      headers: ['Staff ID', 'Full Name', 'Nickname', 'Department / Unit', 'Position', 'Role Tag', 'Email', 'Mobile / Ext', 'Phase 1 Active', 'Updated At']
    },
    {
      name: 'Live_Tech_GPS_Radar',
      headers: ['Tech Key', 'Tech Name', 'Job No.', 'Customer / Store', 'Status', 'Tech Lat', 'Tech Lng', 'Dest Lat', 'Dest Lng', 'Distance (km)', 'ETA (mins)', 'Updated At']
    },
    {
      name: 'Dispatch_Job_Assignments',
      headers: ['Dispatch ID', 'Job No.', 'Tech Name', 'Tech Email', 'Tech Phone', 'Customer', 'Address / Maps', 'Model / S/N', 'Scheduled Date/Time', 'Status', 'Dispatcher Name', 'Updated At']
    },
    {
      name: 'Customer_CSAT_Ratings',
      headers: ['Job No.', 'Rating (1-5)', 'Customer Name', 'LINE User ID', 'Rated At', 'Comment']
    },
    {
      name: 'Warehouse_Inspection_Reports',
      headers: [
        'Inspection ID', 'Date', 'Inspection Type', 'QC Status', 'Model', 'Serial No.',
        'Container / BL / PO Ref', 'Inspector / Outsource Name', 'Company / Team',
        'Box Condition', 'Exterior Body', 'Internal & Compressor', 'Accessories & Manual',
        'Damage Summary / Remarks', 'Photo Count', 'Drive Folder URL', 'PDF Report URL',
        'Full JSON Payload', 'Updated At'
      ]
    },
    {
      name: 'QCF_And_Memo_Reports',
      headers: [
        'QCF Issued No.', 'Issued Date', 'Ref Inspection ID', 'Model', 'Serial No.',
        'Customer Name', 'Claim Type', 'Memo Subject', 'Memo Total Cost (THB)',
        'Factory Reply Status', 'Drive Folder URL', 'QCF PDF URL', 'Memo PDF URL',
        'Full JSON Payload', 'Updated At'
      ]
    },
    {
      name: 'Global_Enterprise_Config',
      headers: ['Key', 'JSON Value', 'Updated At']
    }
  ];

  schemaDefs.forEach(function(def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
      created.push(def.name);
    } else {
      var curLastCol = Math.max(1, sh.getLastColumn());
      var existingHeaders = sh.getRange(1, 1, 1, curLastCol).getValues()[0];
      var isHeaderEmpty = !existingHeaders[0] || String(existingHeaders[0]).trim() === '';
      if (isHeaderEmpty || curLastCol < def.headers.length) {
        sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
          .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
        sh.setFrozenRows(1);
        repaired.push(def.name);
      }
    }
  });

  // Install Nightly 23:00 Automated Full-System Backup Trigger
  var triggerInstalled = ensureNightlyBackupTrigger_();

  return {
    status: 'ok',
    createdSheets: created,
    repairedSheets: repaired,
    totalVerifiedSheets: schemaDefs.length,
    nightlyBackupTriggerActive: triggerInstalled,
    repairedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
  };
}

function ensureNightlyBackupTrigger_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var hasNightly = false;
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'runNightlyFullDriveBackup_') {
        hasNightly = true;
      }
    });
    if (!hasNightly) {
      ScriptApp.newTrigger('runNightlyFullDriveBackup_').timeBased().everyDays(1).atHour(23).create();
    }
    return true;
  } catch (e) {
    return false;
  }
}

function runNightlyFullDriveBackup_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var dateTag = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');

  var backupBundle = {
    system: 'HOSHIZAKI_NIGHTLY_FULL_CLOUD_BACKUP_V1019',
    createdAt: nowStr,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheets: {}
  };

  var totalRows = 0;
  ss.getSheets().forEach(function(sh) {
    var sName = sh.getName();
    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr >= 1 && lc >= 1) {
      var vals = sh.getRange(1, 1, Math.min(lr, 5000), lc).getValues();
      backupBundle.sheets[sName] = vals;
      totalRows += Math.max(0, vals.length - 1);
    }
  });

  var rootIter = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  var root = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder(ROOT_DRIVE_FOLDER_NAME);
  var snapIter = root.getFoldersByName('_NIGHTLY_FULL_SYSTEM_BACKUPS');
  var snapFolder = snapIter.hasNext() ? snapIter.next() : root.createFolder('_NIGHTLY_FULL_SYSTEM_BACKUPS');

  var fileName = 'HOSHIZAKI_Cloud_Full_Backup_' + dateTag + '.json';
  var existing = snapFolder.getFilesByName(fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  var file = snapFolder.createFile(fileName, JSON.stringify(backupBundle), MimeType.PLAIN_TEXT);

  // Rolling 30-day retention cleanup
  var cutoffMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
  var allFiles = snapFolder.getFiles();
  while (allFiles.hasNext()) {
    var f = allFiles.next();
    if (f.getLastUpdated().getTime() < cutoffMs) {
      try { f.setTrashed(true); } catch (eDel) {}
    }
  }

  // Record audit log
  var logSheet = ss.getSheetByName('System_Auto_Backup_Log');
  if (!logSheet) {
    logSheet = ss.insertSheet('System_Auto_Backup_Log');
    logSheet.getRange(1, 1, 1, 5).setValues([['Backup Timestamp', 'File Name', 'Sheets Count', 'Total Rows', 'Drive URL']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    logSheet.setFrozenRows(1);
  }
  logSheet.appendRow([nowStr, fileName, Object.keys(backupBundle.sheets).length, totalRows, file.getUrl()]);

  return {
    status: 'ok',
    fileName: fileName,
    sheetsCount: Object.keys(backupBundle.sheets).length,
    totalRows: totalRows,
    fileUrl: file.getUrl(),
    createdAt: nowStr
  };
}

function restoreLatestNightlyBackupToSheets_(ss) {
  var rootIter = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  if (!rootIter.hasNext()) return { status: 'empty', message: 'ไม่พบโฟลเดอร์สำรองข้อมูลบน Google Drive' };
  var snapIter = rootIter.next().getFoldersByName('_NIGHTLY_FULL_SYSTEM_BACKUPS');
  if (!snapIter.hasNext()) return { status: 'empty', message: 'ยังไม่มีไฟล์สำรองอัตโนมัติรายวันบน Google Drive' };

  var files = snapIter.next().getFiles();
  var latest = null;
  while (files.hasNext()) {
    var f = files.next();
    if (!latest || f.getLastUpdated() > latest.getLastUpdated()) {
      latest = f;
    }
  }
  if (!latest) return { status: 'empty', message: 'ไม่พบไฟล์สำรองล่าสุด' };

  var bundle = JSON.parse(latest.getBlob().getDataAsString());
  var sheetsMap = bundle.sheets || {};
  var restoredSheets = [];

  Object.keys(sheetsMap).forEach(function(sName) {
    var rows = sheetsMap[sName];
    if (!Array.isArray(rows) || rows.length === 0) return;
    var sh = ss.getSheetByName(sName);
    if (!sh) sh = ss.insertSheet(sName);
    sh.clear();
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    restoredSheets.push(sName);
  });

  CacheService.getScriptCache().remove('PULL_ALL_JOBS_V18');
  return {
    status: 'ok',
    restoredFromFile: latest.getName(),
    backupCreatedAt: bundle.createdAt || '',
    restoredSheetsCount: restoredSheets.length,
    restoredSheets: restoredSheets
  };
}


// ============================================================================
// 18. ENTERPRISE v1021 SMART EXCEL DEDUPLICATION ENGINE & OUTSOURCE RATE CARD
// ============================================================================

function syncOutsourceRateCardToSheet_(ss, data) {
  var sheet = ss.getSheetByName('Outsource_Service_Rates');
  if (!sheet) {
    sheet = ss.insertSheet('Outsource_Service_Rates');
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Rate ID', 'Vendor Name', 'Quotation Ref', 'Service Hub', 'Region',
      'Province / City', 'Check/Install (THB)', 'Electrical (THB)', 'Cooling (THB)',
      'Compressor (THB)', 'SLA', 'Conditions JSON'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var rates = Array.isArray(data.rates) ? data.rates : [];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).clearContent();
  }
  if (rates.length > 0) {
    var rows = rates.map(function(r, idx) {
      return [
        String(r.id || ('LSS-' + (idx + 1))),
        String(r.vendor || 'Lucky Star Solution Co., Ltd.'),
        String(r.refNo || 'LSS-2025/2/13'),
        String(r.hub || ''),
        String(r.region || ''),
        String(r.city || ''),
        Number(r.checkInstall || 0),
        Number(r.electrical || 0),
        Number(r.cooling || 0),
        Number(r.compressor || 0),
        String(r.sla || '24-48 hr'),
        JSON.stringify(r.conditions || {})
      ];
    });
    sheet.getRange(2, 1, rows.length, 12).setValues(rows);
  }
  return { status: 'ok', count: rates.length };
}

function getOutsourceRateCardFromSheet_(ss) {
  var sheet = ss.getSheetByName('Outsource_Service_Rates');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', rates: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var rates = vals.map(function(r) {
    var cond = {};
    try { cond = JSON.parse(String(r[11] || '{}')); } catch (e) {}
    return {
      id: r[0], vendor: r[1], refNo: r[2], hub: r[3], region: r[4], city: r[5],
      checkInstall: Number(r[6] || 0), electrical: Number(r[7] || 0),
      cooling: Number(r[8] || 0), compressor: Number(r[9] || 0),
      sla: r[10], conditions: cond
    };
  });
  return { status: 'ok', rates: rates };
}

function upsertDeduplicatedMasterBatch_(ss, data) {
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var addedQt = 0, addedSn = 0, addedParts = 0;

  // 1. Deduplicated Quotation Archive Upsert by Offer No.
  if (Array.isArray(data.quotations) && data.quotations.length > 0) {
    var qaSheet = ss.getSheetByName('Quotation_Archive_Master');
    if (!qaSheet) {
      qaSheet = ss.insertSheet('Quotation_Archive_Master');
      qaSheet.getRange(1, 1, 1, 8).setValues([['Serial No.', 'Date', 'Offer No.', 'Customer', 'Model', 'Model/Detail Line', 'Items Summary', 'Grand Total (THB)']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      qaSheet.setFrozenRows(1);
    }
    var existingOffers = {};
    if (qaSheet.getLastRow() >= 2) {
      var oVals = qaSheet.getRange(2, 3, qaSheet.getLastRow() - 1, 1).getValues();
      oVals.forEach(function(r) { if (r[0]) existingOffers[String(r[0]).trim().toUpperCase()] = true; });
    }
    var newQaRows = [];
    data.quotations.forEach(function(q) {
      var oKey = String(q.o || '').trim().toUpperCase();
      if (oKey && !existingOffers[oKey]) {
        existingOffers[oKey] = true;
        newQaRows.push([String(q.sn || '').toUpperCase(), String(q.dt || ''), oKey, String(q.s || ''), String(q.m || ''), String(q.ml || ''), String(q.sum || ''), Number(q.gt || 0)]);
        addedQt++;
      }
    });
    if (newQaRows.length > 0) {
      qaSheet.getRange(qaSheet.getLastRow() + 1, 1, newQaRows.length, 8).setValues(newQaRows);
    }
  }

  // 2. Deduplicated Serial Master Upsert by Serial No.
  if (Array.isArray(data.serials) && data.serials.length > 0) {
    var smSheet = ss.getSheetByName('Serial_Database_Master');
    if (!smSheet) {
      smSheet = ss.insertSheet('Serial_Database_Master');
      smSheet.getRange(1, 1, 1, 8).setValues([['Serial No.', 'Product Type', 'Model', 'Date Out', 'Invoice No.', 'Customer', 'PO No.', 'Updated At']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      smSheet.setFrozenRows(1);
    }
    var existingSns = {};
    if (smSheet.getLastRow() >= 2) {
      var sVals = smSheet.getRange(2, 1, smSheet.getLastRow() - 1, 1).getValues();
      sVals.forEach(function(r) { if (r[0]) existingSns[String(r[0]).trim().toUpperCase()] = true; });
    }
    var newSnRows = [];
    data.serials.forEach(function(s) {
      var snKey = String(s.serial || '').trim().toUpperCase();
      if (snKey && !existingSns[snKey]) {
        existingSns[snKey] = true;
        newSnRows.push([snKey, String(s.productType || ''), String(s.model || ''), String(s.dateOut || ''), String(s.invoiceNo || ''), String(s.customer || ''), String(s.poNo || ''), nowStr]);
        addedSn++;
      }
    });
    if (newSnRows.length > 0) {
      smSheet.getRange(smSheet.getLastRow() + 1, 1, newSnRows.length, 8).setValues(newSnRows);
    }
  }

  // 3. Deduplicated Parts Catalog Upsert by Part No.
  if (Array.isArray(data.parts) && data.parts.length > 0) {
    var pSheet = ss.getSheetByName('Parts_Catalog_Master');
    if (!pSheet) {
      pSheet = ss.insertSheet('Parts_Catalog_Master');
      pSheet.getRange(1, 1, 1, 5).setValues([['Part No.', 'Description', 'Price (THB)', 'Compatible Models', 'Updated At']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      pSheet.setFrozenRows(1);
    }
    var existingParts = {};
    if (pSheet.getLastRow() >= 2) {
      var pVals = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 1).getValues();
      pVals.forEach(function(r, i) { if (r[0]) existingParts[String(r[0]).trim().toUpperCase()] = i + 2; });
    }
    var newPartRows = [];
    data.parts.forEach(function(p) {
      var pKey = String(p.partNo || '').trim().toUpperCase();
      if (!pKey) return;
      var modelsStr = Array.isArray(p.models) ? p.models.join(', ') : String(p.models || '');
      if (existingParts[pKey]) {
        var rIdx = existingParts[pKey];
        if (Number(p.price || 0) > 0) pSheet.getRange(rIdx, 3).setValue(Number(p.price));
        pSheet.getRange(rIdx, 5).setValue(nowStr);
      } else {
        existingParts[pKey] = -1;
        newPartRows.push([pKey, String(p.desc || ''), Number(p.price || 0), modelsStr, nowStr]);
        addedParts++;
      }
    });
    if (newPartRows.length > 0) {
      pSheet.getRange(pSheet.getLastRow() + 1, 1, newPartRows.length, 5).setValues(newPartRows);
    }
  }

  return { status: 'ok', addedQuotations: addedQt, addedSerials: addedSn, addedParts: addedParts };
}


// ============================================================================
// 19. TRILINGUAL CUSTOMER CHATBOT & MOBILE SMS DISPATCH LOGGER (v1021-LINE+)
// ============================================================================

function detectTextLanguage_(text) {
  var s = String(text || '');
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(s)) return 'JP';
  if (/[\u0E00-\u0E7F]/.test(s)) return 'TH';
  return 'EN';
}

function buildCustomerSelfStatusFlex_(ss, queryKey, userId, pwaBase, lang) {
  var q = String(queryKey || '').trim().toUpperCase();
  var digits = q.replace(/\D/g, '');
  var jobs = readRecentJobsFromSheet(ss, 800);
  var matched = [];

  if (q) {
    matched = jobs.filter(function(j) {
      var jNo = String(j.jobNo || '').toUpperCase();
      var jSn = String(j.serial || '').toUpperCase();
      var jStore = String(j.store || '').toUpperCase();
      var jPhone = String(j.contact || '').replace(/\D/g, '');
      return (jNo && jNo.indexOf(q) > -1) ||
             (jSn && jSn.indexOf(q) > -1) ||
             (jStore && q.length >= 3 && jStore.indexOf(q) > -1) ||
             (digits.length >= 8 && jPhone && jPhone.indexOf(digits) > -1);
    });
  } else if (userId) {
    // Look up mapped phone from Customer_Phone_LINE_Map
    var mapSheet = ss.getSheetByName('Customer_Phone_LINE_Map');
    if (mapSheet && mapSheet.getLastRow() >= 2) {
      var mVals = mapSheet.getRange(2, 1, mapSheet.getLastRow() - 1, 2).getValues();
      for (var i = mVals.length - 1; i >= 0; i--) {
        if (String(mVals[i][1]).trim() === userId) {
          var mappedDigits = String(mVals[i][0] || '').replace(/\D/g, '');
          if (mappedDigits.length >= 8) {
            matched = jobs.filter(function(j) {
              return String(j.contact || '').replace(/\D/g, '').indexOf(mappedDigits) > -1;
            });
          }
          break;
        }
      }
    }
  }

  var title = lang === 'JP' ? '❄️ サービス進捗ステータス' : (lang === 'EN' ? '❄️ HOSHIZAKI Live Service Status' : '❄️ สถานะงานบริการ HOSHIZAKI');
  var portalUrl = pwaBase + (pwaBase.indexOf('?') > -1 ? '&' : '?') + 'portal=customer';

  if (matched.length === 0) {
    var notFoundTxt = lang === 'JP'
      ? '該当する作業記録が見つかりませんでした。「ステータス 08x...」または「ステータス S/N」と入力してください。'
      : (lang === 'EN'
        ? 'No active service job found. Try typing: STATUS <Phone> or STATUS <Serial No.>'
        : 'ยังไม่พบข้อมูลใบงานที่ตรงกัน ลองพิมพ์: เช็กสถานะ <เบอร์โทร> หรือ เช็กสถานะ <S/N เครื่อง> ครับ');
    return {
      type: 'flex',
      altText: title,
      contents: {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '14px',
          contents: [
            { type: 'text', text: title, weight: 'bold', size: 'sm', color: '#002B49' },
            { type: 'text', text: notFoundTxt, size: 'xs', color: '#334155', wrap: true, margin: 'sm' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [{
            type: 'button', style: 'primary', color: '#00A3E0', height: 'sm',
            action: { type: 'uri', label: lang === 'EN' ? 'Open Customer Portal' : 'เปิดพอร์ทัลบริการลูกค้า', uri: portalUrl }
          }]
        }
      }
    };
  }

  var topJob = matched[0];
  var jobPortalUrl = portalUrl +
    '&jobNo=' + encodeURIComponent(topJob.jobNo || '') +
    '&customer=' + encodeURIComponent(topJob.store || '') +
    '&model=' + encodeURIComponent(topJob.model || '') +
    '&serial=' + encodeURIComponent(topJob.serial || '') +
    '&tech=' + encodeURIComponent(topJob.responsibleTech || '') +
    '&total=' + encodeURIComponent(topJob.grandTotal || '0');

  return {
    type: 'flex',
    altText: title + ' - ' + (topJob.jobNo || ''),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
        contents: [
          { type: 'text', text: title, color: '#7DD3FC', size: 'xxs', weight: 'bold' },
          { type: 'text', text: (topJob.jobNo || '-') + ' (' + (topJob.jobStatus || '-') + ')', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
        contents: [
          { type: 'text', text: '🏪 ' + (topJob.store || '-'), size: 'xs', weight: 'bold', wrap: true },
          { type: 'text', text: '❄️ ' + (topJob.model || '-') + ' | S/N: ' + (topJob.serial || '-'), size: 'xs', color: '#0369A1', wrap: true },
          { type: 'text', text: '👨‍🔧 Tech: ' + (topJob.responsibleTech || '-'), size: 'xs', color: '#334155', wrap: true },
          { type: 'text', text: '🗓️ Date: ' + (topJob.date || '-'), size: 'xxs', color: '#64748B' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'primary', color: '#059669', height: 'sm',
          action: {
            type: 'uri',
            label: lang === 'JP' ? '📍 エンジニア位置・承認ページを開く' : (lang === 'EN' ? '📍 Live Tech GPS & Approval' : '📍 ดูพิกัดช่างสด & อนุมัติซ่อม'),
            uri: jobPortalUrl
          }
        }]
      }
    }
  };
}

function logMobileSmsDispatchToSheet_(ss, data) {
  var sheet = ss.getSheetByName('Customer_Mobile_SMS_Logs');
  if (!sheet) {
    sheet = ss.insertSheet('Customer_Mobile_SMS_Logs');
    sheet.getRange(1, 1, 1, 8).setValues([[
      'Timestamp', 'Job / Offer No.', 'Customer / Store', 'Mobile Phone',
      'Channel', 'Portal URL', 'Message Preview', 'Sent By'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    nowStr,
    String(data.refNo || ''),
    String(data.customer || ''),
    String(data.phone || ''),
    String(data.channel || 'MOBILE_SMS'),
    String(data.portalUrl || ''),
    String(data.message || '').substring(0, 500),
    String(data.sentBy || 'Service Unit')
  ]);
  return { status: 'ok', loggedAt: nowStr };
}


function getMobileSmsDispatchLogs_(ss, data) {
  var sheet = ss.getSheetByName('Customer_Mobile_SMS_Logs');
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: 'ok', rows: [] };
  }
  var limit = Math.min(Number(data && data.limit) || 100, 300);
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - limit + 1);
  var numRows = lastRow - startRow + 1;
  var values = sheet.getRange(startRow, 1, numRows, 8).getValues();
  var rows = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var r = values[i];
    rows.push({
      timestamp: String(r[0] || ''),
      refNo: String(r[1] || ''),
      customer: String(r[2] || ''),
      phone: String(r[3] || ''),
      channel: String(r[4] || 'MOBILE_SMS'),
      portalUrl: String(r[5] || ''),
      message: String(r[6] || ''),
      sentBy: String(r[7] || '')
    });
  }
  return { status: 'ok', rows: rows };
}


function getCsatAnalyticsDashboard_(ss) {
  var sheet = ss.getSheetByName('Customer_CSAT_Ratings');
  var rows = [];
  var sum = 0;
  var dist = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
  if (sheet && sheet.getLastRow() >= 2) {
    var lastRow = sheet.getLastRow();
    var startRow = Math.max(2, lastRow - 199);
    var vals = sheet.getRange(startRow, 1, lastRow - startRow + 1, 6).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var r = vals[i];
      var score = Math.max(1, Math.min(5, Number(r[1]) || 5));
      sum += score;
      dist[String(score)] = (dist[String(score)] || 0) + 1;
      rows.push({
        jobNo: String(r[0] || ''),
        rating: score,
        customer: String(r[2] || ''),
        lineUserId: String(r[3] || ''),
        ratedAt: String(r[4] || ''),
        comment: String(r[5] || '')
      });
    }
  }
  var count = rows.length;
  var avg = count > 0 ? Number((sum / count).toFixed(2)) : 5.0;
  return {
    status: 'ok',
    totalResponses: count,
    averageScore: avg,
    distribution: dist,
    recentRatings: rows
  };
}


// ============================================================================
// SECTION 19: ENTERPRISE v1024 — OUTSOURCE PARTS SHIPMENT & APPOINTMENT SYNC
// ============================================================================
function upsertOutsourcePartsAppointment_(ss, data, secrets) {
  var record = data.record || data || {};
  var sheetName = 'Outsource_Parts_Appointments';
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    'Tracking_ID', 'Job_No', 'Outsource_Vendor', 'Customer_Store', 'Customer_Phone',
    'Parts_Summary', 'Courier', 'Tracking_No', 'Shipped_Date',
    'Workflow_Status', 'OS_Received_At', 'OS_Received_Note',
    'Proposed_Appt_Date', 'Proposed_Appt_Slot',
    'Confirmed_Appt_Date', 'Confirmed_Appt_Slot', 'Customer_Contact',
    'Confirm_Channel', 'Last_Updated'
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#002B49')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowValues = [
    String(record.id || ''),
    String(record.jobNo || ''),
    String(record.vendorName || ''),
    String(record.storeName || ''),
    String(record.customerPhone || ''),
    String(record.partsSummary || ''),
    String(record.courierName || ''),
    String(record.trackingNo || ''),
    String(record.shippedDate || ''),
    String(record.status || 'PARTS_SHIPPED'),
    String(record.receivedAt || ''),
    String(record.receivedNote || ''),
    String(record.proposedApptDate || ''),
    String(record.proposedApptSlot || ''),
    String(record.confirmedApptDate || ''),
    String(record.confirmedApptSlot || ''),
    String(record.confirmedWithCustomerName || ''),
    String(record.confirmChannel || ''),
    String(record.updatedAt || nowStr)
  ];

  var rows = sheet.getDataRange().getValues();
  var targetRow = -1;
  for (var i = 1; i < rows.length; i++) {
    if ((record.id && String(rows[i][0]) === String(record.id)) ||
        (record.jobNo && String(rows[i][1]) === String(record.jobNo))) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return {
    status: 'ok',
    sheet: sheetName,
    trackingId: record.id || '',
    jobNo: record.jobNo || '',
    workflowStatus: record.status || 'PARTS_SHIPPED',
    updatedAt: nowStr
  };
}

function getOutsourcePartsAppointmentsList_(ss, data) {
  var sheet = ss.getSheetByName('Outsource_Parts_Appointments');
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: 'ok', rows: [] };
  }
  var vals = sheet.getDataRange().getValues();
  var filterJob = String((data && data.jobNo) || '').trim();
  var out = [];
  for (var i = vals.length - 1; i >= 1; i--) {
    var r = vals[i];
    if (filterJob && String(r[1]) !== filterJob && String(r[0]) !== filterJob) continue;
    out.push({
      id: String(r[0] || ''),
      jobNo: String(r[1] || ''),
      vendorName: String(r[2] || ''),
      storeName: String(r[3] || ''),
      customerPhone: String(r[4] || ''),
      partsSummary: String(r[5] || ''),
      courierName: String(r[6] || ''),
      trackingNo: String(r[7] || ''),
      shippedDate: String(r[8] || ''),
      status: String(r[9] || 'PARTS_SHIPPED'),
      receivedAt: String(r[10] || ''),
      receivedNote: String(r[11] || ''),
      proposedApptDate: String(r[12] || ''),
      proposedApptSlot: String(r[13] || ''),
      confirmedApptDate: String(r[14] || ''),
      confirmedApptSlot: String(r[15] || ''),
      confirmedWithCustomerName: String(r[16] || ''),
      confirmChannel: String(r[17] || ''),
      updatedAt: String(r[18] || '')
    });
  }
  return { status: 'ok', rows: out };
}

function syncVanMinMaxRestockBatch_(ss, data) {
  var sheetName = 'Van_MinMax_Restock_Requests';
  var sheet = ss.getSheetByName(sheetName);
  var headers = ['Timestamp', 'Request_ID', 'Van_Code', 'Part_No', 'Description', 'Current_Qty', 'Min_Qty', 'Max_Qty', 'Order_Qty', 'Status'];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var items = (data && Array.isArray(data.items)) ? data.items : [];
  items.forEach(function(it) {
    sheet.appendRow([
      nowStr,
      String(it.reqId || ('RST-' + Date.now())),
      String(it.vanCode || 'T01'),
      String(it.partNo || ''),
      String(it.desc || ''),
      Number(it.currentQty || 0),
      Number(it.minQty || 0),
      Number(it.maxQty || 0),
      Number(it.orderQty || 0),
      String(it.status || 'REQUESTED')
    ]);
  });
  return { status: 'ok', count: items.length };
}

function syncOutsourceMonthlyBilling_(ss, data) {
  var sheetName = 'Outsource_Monthly_Billing';
  var sheet = ss.getSheetByName(sheetName);
  var headers = ['Billing_Month', 'Vendor_Name', 'Total_Jobs', 'Completed_Within_SLA', 'Base_Service_Fee', 'OT_Surcharge', 'VAT_7_Pct', 'Grand_Total_THB', 'Generated_At'];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var s = (data && data.summary) || {};
  sheet.appendRow([
    String(s.month || ''),
    String(s.vendor || ''),
    Number(s.totalJobs || 0),
    Number(s.slaPass || 0),
    Number(s.baseFee || 0),
    Number(s.otFee || 0),
    Number(s.vat || 0),
    Number(s.grandTotal || 0),
    nowStr
  ]);
  return { status: 'ok', loggedAt: nowStr };
}


// =========================================================================
// SECTION 20: ENTERPRISE v1024 OUTSOURCE VENDOR BILLING RECONCILIATION
// =========================================================================
function syncV1023VendorReconciliation_(ss, data) {
  var sheetName = 'Outsource_Vendor_Reconciliation';
  var sheet = ss.getSheetByName(sheetName);
  var headers = ['Billing_Month', 'Vendor_Name', 'Job_Count', 'Completed_Count', 'Base_Fee_THB', 'Travel_OT_THB', 'VAT_7_Pct', 'WHT_3_Pct', 'Net_Payable_THB', 'Synced_At'];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var vendors = (data && Array.isArray(data.vendors)) ? data.vendors : [];
  var month = String((data && data.month) || '');
  vendors.forEach(function(v) {
    sheet.appendRow([
      month,
      String(v.vendor || ''),
      Number(v.jobCount || 0),
      Number(v.completedCount || 0),
      Number(v.baseFeeTotal || 0),
      Number(v.travelOtTotal || 0),
      Number(v.vat7Pct || 0),
      Number(v.wht3Pct || 0),
      Number(v.netPayable || 0),
      nowStr
    ]);
  });
  return { status: 'ok', count: vendors.length, syncedAt: nowStr };
}


// =========================================================================
// SECTION 21: ENTERPRISE v1025 EXECUTIVE, ADMIN & ACCOUNTING GOVERNANCE SYNC
// =========================================================================
function syncV1025GovernanceApproval_(ss, data) {
  var sheetName = 'Governance_GP_Approvals';
  var sheet = ss.getSheetByName(sheetName);
  var headers = ['Request_ID', 'Created_At', 'Job_No', 'Offer_No', 'Customer', 'Model', 'Gross_Amount', 'Discount_Pct', 'Net_Amount', 'Est_GP_Pct', 'Status', 'Approved_By', 'Approved_At'];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var r = (data && data.record) || {};
  sheet.appendRow([
    String(r.reqId || ''),
    String(r.createdAt || ''),
    String(r.jobNo || ''),
    String(r.offerNo || ''),
    String(r.customer || ''),
    String(r.model || ''),
    Number(r.grossAmount || 0),
    Number(r.discountPct || 0),
    Number(r.netAmount || 0),
    Number(r.estimatedGpPct || 0),
    String(r.status || ''),
    String(r.approvedBy || ''),
    String(r.approvedAt || '')
  ]);
  return { status: 'ok', reqId: r.reqId || '' };
}


// =========================================================================
// ENTERPRISE v1027: CONTROLLER & MACHINE PARAMETER / MANUAL LOOKUP (LINE OA)
// =========================================================================
function lookupControllerAndMachineParametersText_(rawQuery) {
  var q = String(rawQuery || '').trim().toUpperCase();
  if (!q) return '';

  // Dishwasher HW-320B
  if (/(HW-?320B|320B\b)/i.test(q)) {
    return '🍽️ [HOSHIZAKI HW-320B PDRT — คู่มือตั้งค่า & ใช้งาน]\n' +
      '• เข้า Service Menu: กดไอคอนรูปเฟือง ⚙️ ค้าง 3 วิ → ใส่รหัสผ่าน "3" → กด ✓ ค้าง 3 วิ\n' +
      '• ค่ามาตรฐานโรงงาน:\n' +
      '  - P01 (อุณหภูมิน้ำล้าง Tank) = 55°C (55–60°C)\n' +
      '  - P02 (อุณหภูมิน้ำลวก Boiler) = 80°C (80–85°C)\n' +
      '  - P03 (เวลาล้าง 5 โปรแกรม) = 40 / 90 / 120 / 140 / 180 วิ (+ลวก P04=10 วิ, พัก P05=2 วิ)\n' +
      '  - P08 (ปั๊มน้ำยาล้างจาน) = 10 วิ | P09 (ปั๊มน้ำยาเคลือบเงา) = 10 วิ\n' +
      '  - P10 (เวลาปั๊มเดรน) = 150 วิ | P17 (ปิดฝาเริ่มล้างอัตโนมัติ) = 1\n' +
      '• ติดตั้ง: น้ำเข้า 3/4" แรงดัน 2–4 Bar, ท่อน้ำทิ้ง Ø28mm สูง ≤60 ซม. (มีปั๊มเดรน) / ≤5 ซม. (ไม่มีปั๊มเดรน)';
  }

  // Dishwasher HW-600A
  if (/(HW-?600A|600A\b|J030)/i.test(q)) {
    return '🍽️ [HOSHIZAKI HW-600A (J030) — คู่มือตั้งค่า Service Menu]\n' +
      '• วิธีเข้า Service Menu: ปิดเครื่อง (OFF) → กด MODE ค้างไว้แล้วกด ON/OFF (หน้าจอขึ้น 01)\n' +
      '• ค่ามาตรฐานโรงงาน:\n' +
      '  - No.01 (เวลาล้าง Standard) = 48 วิ | No.02/09 (Long) = 110 วิ\n' +
      '  - No.03 (เวลาลวก Rinse) = 6 วิ | No.30 (Water Supply Delay) = 1 วิ\n' +
      '  - No.04 (อุณหภูมิน้ำล้าง) = 58°C (ตัดที่ +3°C)\n' +
      '  - No.05 (อุณหภูมิน้ำลวก Booster) = 73°C (ห้ามตั้งเกิน 79°C เพื่อป้องกัน Vapor Lock)\n' +
      '  - No.11 (เริ่มล้างเมื่อปิดฝา) = on | No.31–35 = ดู Error Log (กด ▲+▼ ค้าง 3 วิเพื่อลบ)\n' +
      '• โหมดล้างตัวเอง (SC): ปิดเครื่อง (ปิดฝา) → กด STANDBY/CLEANING ค้าง 3 วิ\n' +
      '• Error: A1/A2=เติมน้ำไม่ทัน, o1/o2=ระดับน้ำ Booster, H1–H4=Thermistor (ค่าโอห์ม 60°C = 11.5–12.8 kΩ)';
  }

  // Dishwasher HW-600B / HW-600B3 / HW-600B3 RT
  if (/(HW-?600B|600B3|600B|EMKO|OZT_BYM|เครื่องล้างจาน)/i.test(q)) {
    return '🍽️ [HOSHIZAKI HW-600B / HW-600B3 RT — คู่มือตั้งค่า & ติดตั้ง]\n' +
      '• เข้า Service Menu: กดไอคอนรูปเฟือง ⚙️ ค้าง 3 วิ → ใส่รหัสผ่าน "3" → กด ✓ ค้าง 3 วิ\n' +
      '• ค่ามาตรฐานโรงงาน:\n' +
      '  - P01 (น้ำล้าง Tank) = 55°C (55–66°C) | P02 (น้ำลวก Boiler) = 80°C (80–85°C)\n' +
      '  - P03 (เวลาล้าง 5 โปรแกรม) = 40 / 90 / 120 / 140 / 180 วิ (+ลวก 10 วิ +พัก 2 วิ)\n' +
      '  - P08 (Detergent) = 10 วิ | P09 (Rinse Aid) = 10 วิ | P10 (Drain) = 150 วิ\n' +
      '  - P15 (รอน้ำร้อนถึงเป้าก่อนล้าง) = 1 | P17 (ปิดฮูดเริ่มล้างอัตโนมัติ) = 1 | OP0=1 คืนค่าโรงงาน\n' +
      '• ข้อกำหนดติดตั้งหน้างาน:\n' +
      '  - ไฟฟ้า 380–415V 3NPE (9.66–11.46 kW) สาย 5x2.5 mm² เบรกเกอร์ 3P 30A–32A + RCD 30mA สูงจากพื้น ≥120 ซม.\n' +
      '  - น้ำประปา 3/4" แรงดัน 2–4 Bar (น้ำอ่อน 0–10°fH, อุณหภูมิ ≤50°C)\n' +
      '  - ท่อน้ำทิ้ง PVC Ø50 mm สูง ≤5–10 ซม. (ไม่มีปั๊มเดรน) หรือ Ø28 mm สูง ≤60 ซม. (มีปั๊มเดรน)';
  }

  // Ice Machine IM-Series
  if (/(IM-?SERIES|\bIM-?\d{2,3}\b|P01873|DIMPLE|หลุมน้ำแข็ง|เครื่องทำน้ำแข็ง)/i.test(q)) {
    return '❄️ [HOSHIZAKI IM-Series Controller (P01873-01 / -02)]\n' +
      '• ปรับขนาดหลุมน้ำแข็ง (Dimple Size / Service Mode):\n' +
      '  1. กดปุ่ม RESET ค้าง >3 วินาที (ขึ้นเลข "1")\n' +
      '  2. กด ▲ (SERVICE 1) เลือกเมนู "2" (Target Freeze Completion Temp) หรือ "3" (Freeze Time)\n' +
      '  3. กด RESET 1 ครั้ง (ตัวเลขกะพริบ) → กด ▲/▼ ปรับค่า (ทีละ 0.5°C ช่วง -5 ถึง -40°C) → กด RESET บันทึก\n' +
      '• เช็กอุณหภูมิเซ็นเซอร์ & Error Log (Display Mode):\n' +
      '  - กด ▲ (UP / SERVICE 1) ค้าง >3 วินาที (ขึ้น "n1") แล้วกด ▲/▼ เพื่อดู:\n' +
      '    n3 = อุณหภูมิเซ็นเซอร์น้ำแข็ง | n4 = อุณหภูมิห้อง | n5 = อุณหภูมิน้ำ (H ≥13°C, L <13°C) | n6 = คอนเดนเซอร์ | h4 = ประวัติ Error (E1=Freeze, E2=Defrost, EE/EF=Other)';
  }

  // Dixell XR06CH
  if (/(DIXELL|XR06CH|HFW|FTW|SRF)/i.test(q)) {
    return '❄️ [Dixell XR06CH-5N5S5-B (V1.4) — HFW / FTW / SRF]\n' +
      '• ตั้งอุณหภูมิ (Set): กด SET ค้าง 3 วิ → ปรับ ▲/▼ → กด SET บันทึก\n' +
      '• เข้าเมนูช่าง (Pr2): กด SET+▼ ค้าง 3 วิ (เข้า Pr1) → กด SET+▼ ค้างต่ออีก 7 วิ\n' +
      '• เช็กอุณหภูมิคอยล์เย็น (Evap): ดูค่าพารามิเตอร์ "d2" (Live Defrost Probe Temp)\n' +
      '• ค่าโรงงาน: Set = -20.0°C (SRF500HC: -26.0°C), dE (ตัดละลาย) = 10°C (FTW:20°C, SRF500HC:15°C), id = 5–6 ชม.';
  }

  // PVR WR-87285
  if (/(PVR|WR-?87285|HRW|RTW|RTDW|SRC900)/i.test(q)) {
    return '❄️ [PVR WR-87285 — HRW / RTW / RTDW / SRC900-HL]\n' +
      '• รหัสผ่าน (PS): "11" | ตั้งอุณหภูมิ (SP): กด SET → ปรับ ▲/▼ → กด SET\n' +
      '• ค่าโรงงาน: SP = 2.0°C (-2~12°C), P4 (Diff) = 1.5°C (HRW) / 2.5°C (RTW), P7 (เวลาละลาย) = 60 นาที, P8 = ทุก 4 ชม., L7 (หยุดละลาย) = 4°C, LP = 0 (ปลดล็อกปุ่ม)';
  }

  // ECS-180neo
  if (/(ECS-?180|FT-|RT-|HR-MA|HF-MA|HF188)/i.test(q)) {
    return '❄️ [Elitech / Refulgence ECS-180neo — FT / RT / HR-MA / HF-MA]\n' +
      '• เข้า Admin Menu: กด Set ค้าง 3 วิ (ขึ้น St) → กด ▼ ไปที่ Po → กด Set → ใส่รหัส "55"\n' +
      '• เช็กอุณหภูมิคอยล์เย็น: กดปุ่ม ▼ 1 ครั้ง | สั่ง Defrost: กด Rst ค้าง 3 วิ\n' +
      '• ค่าโรงงาน: FT/RT = 4°C | HR-MA = 1°C (d7=20°C) | HF-MA = -20°C (d7=30°C, HF188=20°C)';
  }

  // MC-Controller
  if (/(MC-?CONTROLLER|HR-MC|HF-MC|HRF-MC|HRF-78|\bH7\b|\bH9\b|\bH11\b|\bH12\b|FG1)/i.test(q)) {
    return '❄️ [MC-Controller 7 ปุ่มสัมผัส — HR / HF / HRF MC Series]\n' +
      '• รหัสผ่าน: กดปุ่มประแจ 🔧 ค้าง 3 วิ → ใส่ "55" (ฮีตเตอร์ขอบประตู Fg1) หรือ "125" (Manager Menu)\n' +
      '• กลุ่มรุ่น (กดประแจค้าง 10 วิ): H7/H1 = HF (-20°C), H9/H3 = HR (1°C), H11 = HRF-78 Freezer (-20°C), H6/H12 = HRF-78 Chiller (1°C)\n' +
      '• เช็กอุณหภูมิ: กด ▼ ดู Evap | กด "ประแจ + ▼" ค้าง 3 วิ (Maintenance Mode) ดูค่าจริง ตู้ / คอยล์เย็น / คอยล์ร้อน\n' +
      '• ฮีตเตอร์ขอบประตู Fg1 = 3 (หยุด 5 นาที / ทำงาน 10 นาที) | NTC 0°C = 25–30 kΩ';
  }

  // ETC-3000
  if (/(ETC-?3000)/i.test(q)) {
    return '❄️ [KI&BNT ETC-3000]\n' +
      '• User Menu: กด SET ค้าง 3 วิ | Admin Menu: กด SET ค้างแล้วกด ▼ ค้าง 10 วิ | ล็อกปุ่ม: กด ▲+▼ ค้าง 10 วิ\n' +
      '• เช็กอุณหภูมิคอยล์เย็น: กด ▼ 1 ครั้ง | Defrost: กด ▼ ค้าง 3 วิ | ค่าโรงงาน: SEt=-5.0°C, HY=2.0°C, dtE=10.0°C';
  }

  return '';
}


// =========================================================================
// ENTERPRISE v1029: PARAMETER & MANUAL KNOWLEDGE BASE CLOUD SYNC
// =========================================================================
function upsertParameterKbEntryToSheet_(ss, data) {
  var sheetName = 'Parameter_Manual_KB';
  var sheet = ss.getSheetByName(sheetName);
  var headers = ['Entry_ID', 'Category', 'Model_Title', 'Aliases', 'Doc_Sources', 'Password_Info', 'Quick_Operation', 'Key_Parameters_JSON', 'Install_Specs', 'Updated_At'];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var e = (data && data.entry) || {};
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowVals = [
    String(e.id || ''),
    String(e.category || ''),
    String(e.modelTitle || ''),
    Array.isArray(e.aliases) ? e.aliases.join(', ') : String(e.aliases || ''),
    String(e.docSources || ''),
    String(e.passwordInfo || ''),
    String(e.quickOperation || ''),
    JSON.stringify(e.keyParameters || []),
    String(e.installAndSpecs || ''),
    nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, String(e.id || ''));
  if (rowIdx >= 2) sheet.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  else sheet.appendRow(rowVals);
  return { status: 'ok', entryId: e.id || '', updatedAt: nowStr };
}


// =========================================================================
// SECTION 22: ENTERPRISE v1031 IOT WIFI TELEMETRY & PREDICTIVE BRIDGE
// =========================================================================
function ingestIotTelemetryToSheet_(ss, data, secrets) {
  var rec = (data && data.record) || data || {};
  var metrics = rec.metrics || {};
  var sheetName = 'IoT_Device_Telemetry';
  var headers = [
    'Device_ID', 'Serial_No', 'Model', 'Customer_Store', 'WiFi_SSID',
    'RSSI_dBm', 'Status', 'Cabinet_Temp_C', 'Evap_Temp_C', 'Condenser_Temp_C',
    'Comp_Amps', 'Bin_Level_Pct', 'Cycle_Mins', 'Filter_Life_Pct', 'Error_Code', 'Last_Seen'
  ];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var devId = String(rec.deviceId || '');
  var rowVals = [
    devId,
    String(rec.serial || '').toUpperCase(),
    String(rec.model || ''),
    String(rec.customer || ''),
    String(rec.wifiSsid || ''),
    Number(rec.rssiDbm || 0),
    String(rec.status || 'ONLINE_NORMAL'),
    Number(metrics.cabinetTempC || 0),
    Number(metrics.evapTempC || 0),
    Number(metrics.condenserTempC || 0),
    Number(metrics.compAmps || 0),
    Number(metrics.binLevelPct || 0),
    Number(metrics.cycleMins || 0),
    Number(metrics.filterLifePct || 100),
    String(metrics.errorCode || 'NONE'),
    nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, devId);
  if (rowIdx >= 2) sheet.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  // Trigger LINE alert if critical error reported via WiFi
  if (String(rec.status || '') === 'CRITICAL_ERROR' && secrets && secrets.lineGroupId && isLineTokenConfigured()) {
    pushLineMessage(
      secrets.lineGroupId,
      '🚨 [IoT WiFi CRITICAL ALERT]\n' +
      '• รุ่น / S/N: ' + (rec.model || '-') + ' / ' + (rec.serial || '-') + '\n' +
      '• ลูกค้า: ' + (rec.customer || '-') + '\n' +
      '• รหัส Error: ' + (metrics.errorCode || '-') + ' | Condenser: ' + (metrics.condenserTempC || '-') + '°C'
    );
  }
  return { status: 'ok', deviceId: devId, updatedAt: nowStr };
}

function getIotTelemetryFleetFromSheet_(ss) {
  var sheet = ss.getSheetByName('IoT_Device_Telemetry');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', devices: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
  var devices = vals.map(function(r) {
    return {
      deviceId: r[0], serial: r[1], model: r[2], customer: r[3], wifiSsid: r[4],
      rssiDbm: Number(r[5] || 0), status: r[6],
      metrics: {
        cabinetTempC: Number(r[7] || 0),
        evapTempC: Number(r[8] || 0),
        condenserTempC: Number(r[9] || 0),
        compAmps: Number(r[10] || 0),
        binLevelPct: Number(r[11] || 0),
        cycleMins: Number(r[12] || 0),
        filterLifePct: Number(r[13] || 100),
        errorCode: String(r[14] || 'NONE')
      },
      lastSeen: String(r[15] || '')
    };
  });
  return { status: 'ok', devices: devices };
}


// =========================================================================
// SECTION 23: ENTERPRISE v1032 AI GATEWAY PROXY & DIAGNOSTIC FEEDBACK LOOP
// =========================================================================
function logAiDiagnosticFeedbackToSheet_(ss, data) {
  var sheetName = 'AI_Diagnostic_Feedback';
  var headers = ['Timestamp', 'Device_ID', 'Serial_No', 'AI_Diagnosis', 'Is_Accurate', 'Technician', 'Notes'];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    nowStr,
    String(data.deviceId || ''),
    String(data.serial || ''),
    String(data.diagnosis || ''),
    data.accurate ? 'TRUE' : 'FALSE',
    String(data.technician || ''),
    String(data.notes || '')
  ]);
  return { status: 'ok', loggedAt: nowStr };
}

function handleAiGatewayProxyQuery_(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY') || '';
  var prompt = String(data.prompt || '').trim();
  if (!apiKey) {
    return {
      status: 'fallback_local',
      message: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน ScriptProperties — ระบบใช้ Edge Rules ภายในแทนอัตโนมัติ'
    };
  }
  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText() || '{}');
    var replyText = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0].text) || '';
    return { status: 'ok', reply: replyText };
  } catch (e) {
    return { status: 'error', message: String(e) };
  }
}


// =========================================================================
// SECTION 24: ENTERPRISE v1033 IMMUTABLE AUDIT LOG & ESG REFRIGERANT LOG
// =========================================================================
function syncSystemAuditLogToSheet_(ss, data) {
  var sheetName = 'System_Audit_Log';
  var headers = ['Timestamp', 'Audit_ID', 'Actor', 'Role', 'Category', 'Entity_ID', 'Detail'];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    nowStr,
    String(data.auditId || ('AUD-' + Date.now())),
    String(data.actor || ''),
    String(data.role || ''),
    String(data.category || ''),
    String(data.entityId || ''),
    String(data.detail || '')
  ]);
  return { status: 'ok', loggedAt: nowStr };
}

function syncEsgRefrigerantLogToSheet_(ss, data) {
  var sheetName = 'ESG_Refrigerant_Log';
  var headers = ['Timestamp', 'Record_ID', 'Serial_No', 'Refrigerant_Type', 'Action', 'Weight_KG', 'CO2e_KG'];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    nowStr,
    String(data.id || ('ESG-' + Date.now())),
    String(data.serial || ''),
    String(data.gasType || ''),
    String(data.action || ''),
    Number(data.kg || 0),
    Number(data.co2eKg || 0)
  ]);
  return { status: 'ok', loggedAt: nowStr };
}


// =========================================================================
// SECTION 25: ENTERPRISE v1034 OUTSOURCE SHORT VAULT, FLEX CARD & AI CHATBOT
// =========================================================================
function createOutsourceSecureVaultLink_(ss, data) {
  var v = data.vaultEntry || data || {};
  var sheetName = 'Outsource_Secure_Vault';
  var headers = ['Short_Code', 'PIN_4Digit', 'Job_No', 'Partner_Name', 'Expires_At_Ms', 'Expires_At_Text', 'Payload_JSON', 'Created_At'];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var shortCode = String(v.shortCode || ('OS-' + Date.now().toString().slice(-6))).toUpperCase();
  sheet.appendRow([
    shortCode,
    String(v.pin || ''),
    String(v.jobNo || ''),
    String(v.partner || ''),
    Number(v.expiresAtMs || 0),
    String(v.expiresAtStr || ''),
    JSON.stringify(v),
    nowStr
  ]);
  return { status: 'ok', shortCode: shortCode, createdAt: nowStr };
}

function getOutsourceVaultRecordFromSheet_(ss, shortCode) {
  var sheet = ss.getSheetByName('Outsource_Secure_Vault');
  if (!sheet || sheet.getLastRow() < 2 || !shortCode) return { status: 'not_found' };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || '').trim().toUpperCase() === shortCode) {
      try {
        return { status: 'ok', record: JSON.parse(String(vals[i][6] || '{}')) };
      } catch (e) {}
    }
  }
  return { status: 'not_found' };
}

function sendOutsourceFlexCardViaOa_(ss, data, secrets) {
  var v = data.vaultEntry || {};
  var targetId = String(data.targetLineId || secrets.lineGroupId || '').trim();
  var shortUrl = String(data.shortUrl || '').trim();
  if (!targetId || !shortUrl || !isLineTokenConfigured()) {
    return { status: 'skipped', message: 'Missing targetLineId or LINE token' };
  }
  var flexCard = {
    type: 'flex',
    altText: '🔧 มอบหมายงาน Outsource: ' + (v.jobNo || '-') + ' (' + (v.shortCode || '-') + ')',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
        contents: [
          { type: 'text', text: '🔧 HOSHIZAKI OUTSOURCE DISPATCH', color: '#FDE047', size: 'xxs', weight: 'bold' },
          { type: 'text', text: (v.jobNo || '-') + ' (' + (v.shortCode || '-') + ')', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
        contents: [
          { type: 'text', text: '🏪 ร้านค้า: ' + (v.store || '-'), size: 'xs', weight: 'bold', wrap: true },
          { type: 'text', text: '❄️ รุ่นเครื่อง: ' + (v.model || '-'), size: 'xs', color: '#0369A1', wrap: true },
          { type: 'text', text: '🔑 รหัส PIN เข้าฟอร์ม: ' + (v.pin || '****'), size: 'xs', color: '#BE123C', weight: 'bold' },
          { type: 'text', text: '⏳ ลิงก์หมดอายุ: ' + (v.expiresAtStr || '-'), size: 'xxs', color: '#64748B' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'primary', color: '#059669', height: 'sm',
          action: { type: 'uri', label: '🔧 เปิดฟอร์มบันทึกงานซ่อม', uri: shortUrl }
        }]
      }
    }
  };
  var sent = pushLineMessages_(targetId, [flexCard]);
  return { status: sent ? 'ok' : 'failed', shortCode: v.shortCode || '' };
}


// =========================================================================
// SECTION 26: ENTERPRISE v1035 GEMINI MULTIMODAL CHATBOT, DEALER-FIRST
//             CHANNEL ROUTING & 2-HOUR SLA FOLLOW-UP ENGINE
// =========================================================================
function callGeminiLineTextAssistant_(promptText, base64Image, mimeType) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
    if (!apiKey) return '';
    var parts = [{ text: String(promptText || '') }];
    if (base64Image) {
      parts.push({
        inline_data: {
          mime_type: mimeType || 'image/jpeg',
          data: base64Image
        }
      });
    }
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: parts }] }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText());
      return (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0].text) || '';
    }
  } catch (e) {}
  return '';
}

function handleCustomerOaImageWithGemini_(ss, ev, secrets) {
  var msgId = ev.message && ev.message.id;
  var userId = (ev.source && ev.source.userId) || '';
  var token = secrets.customerLineToken || secrets.lineToken;
  var analysis = '';
  var detectedSn = '';

  if (msgId && token) {
    try {
      var res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + encodeURIComponent(msgId) + '/content', {
        method: 'get',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var b64 = Utilities.base64Encode(res.getBlob().getBytes());
        analysis = callGeminiLineTextAssistant_(
          'คุณคือวิศวกรบริการ HOSHIZAKI (THAILAND) วิเคราะห์รูปภาพที่ลูกค้าส่งเข้ามา (อาจเป็นหน้าจอ Error, ไฟ LED กะพริบ, ป้ายเนมเพลต Serial Number หรืออาการเสียของเครื่องทำน้ำแข็ง/ตู้แช่) ' +
          '1) หากเห็น Serial Number ให้ระบุบรรทัดแรกว่า SN: <รหัส> ' +
          '2) สรุปอาการ/รหัส Error ที่พบและวิธีตรวจเช็กเบื้องต้น 3 ข้อสั้นๆ ภาษาไทยที่เข้าใจง่าย',
          b64,
          'image/jpeg'
        );
        var snM = analysis.match(/SN:\s*([A-Z]\d{4,6}[A-Z0-9]{0,3}|\d{10,16})/i);
        if (snM) detectedSn = snM[1].toUpperCase();
      }
    } catch (e) {}
  }

  if (!analysis) {
    analysis = '📸 ได้รับรูปภาพจากคุณลูกค้าเรียบร้อยแล้วครับ\nเบื้องต้นแนะนำตรวจสอบวาล์วน้ำเข้า แผ่นกรองฝุ่น และสวิตช์ไฟหลัก หากต้องการส่งเรื่องให้ตัวแทนจำหน่ายหรือช่างเข้าตรวจเช็ก กดปุ่มด้านล่างได้เลยครับ';
  }

  return {
    type: 'flex',
    altText: '📸 ผลการวิเคราะห์รูปภาพจากศูนย์บริการ HOSHIZAKI',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
        contents: [
          { type: 'text', text: '📸 AI VISUAL SERVICE TRIAGE', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
          { type: 'text', text: detectedSn ? ('ตรวจพบ S/N: ' + detectedSn) : 'ผลการวิเคราะห์ภาพถ่ายเบื้องต้น', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          {
            type: 'image',
            url: 'https://raw.githubusercontent.com/serviceshth/hoshizaki-service/main/penguin-tech-bg.png?v=2',
            position: 'absolute',
            align: 'center',
            gravity: 'center',
            size: 'xxl',
            aspectRatio: '1:1',
            aspectMode: 'fit'
          },
          { type: 'text', text: analysis.substring(0, 1500), size: 'xs', color: '#1E293B', wrap: true }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#059669', height: 'sm',
            action: { type: 'postback', label: '✅ ตรวจเช็กแล้ว ใช้งานได้ปกติ', data: 'SELF_CHECK_RESOLVED:IMG-' + Date.now().toString().slice(-6), displayText: 'ตรวจเช็กตามคำแนะนำแล้วใช้งานได้ปกติครับ' }
          },
          {
            type: 'button', style: 'primary', color: '#DC2626', height: 'sm',
            action: { type: 'postback', label: '🔧 ส่งเรื่องให้ตัวแทนฯ / ช่างเข้าเช็ก', data: 'ESCALATE_TO_DEALER:' + (detectedSn || 'NO_SN') + ':' + encodeURIComponent('ส่งรูปภาพขอให้ช่างเข้าตรวจเช็ก'), displayText: 'ขอส่งเรื่องให้ตัวแทนจำหน่ายหรือช่างเข้าตรวจเช็กครับ' }
          }
        ]
      }
    }
  };
}

function syncDealerChannelDirectoryToSheet_(ss, data) {
  var sheetName = 'Dealer_Channel_Directory';
  var headers = [
    'Dealer_ID', 'Dealer_Name', 'Channel_Type', 'Zone_Tier',
    'Service_Phone', 'Service_Email', 'LINE_Group_ID', 'LINE_OA_Link',
    'SMS_Mobile', 'Province_Coverage', 'Updated_At'
  ];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var list = Array.isArray(data.dealers) ? data.dealers : [];
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
  }
  if (list.length > 0) {
    var rows = list.map(function(d, idx) {
      return [
        String(d.id || ('DLR-' + (idx + 1))),
        String(d.name || ''),
        String(d.channelType || 'DEALER_ABC'),
        String(d.zoneTier || 'DEALER_A'),
        String(d.phone || ''),
        String(d.email || ''),
        String(d.lineGroupId || ''),
        String(d.lineOaLink || ''),
        String(d.smsMobile || ''),
        String(d.province || 'ทั่วประเทศ'),
        nowStr
      ];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return { status: 'ok', count: list.length };
}

function getDealerChannelDirectoryFromSheet_(ss) {
  var sheet = ss.getSheetByName('Dealer_Channel_Directory');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', dealers: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  var dealers = vals.map(function(r) {
    return {
      id: r[0], name: r[1], channelType: r[2], zoneTier: r[3],
      phone: r[4], email: r[5], lineGroupId: r[6], lineOaLink: r[7],
      smsMobile: r[8], province: r[9], updatedAt: r[10]
    };
  });
  return { status: 'ok', dealers: dealers };
}

function findDealerProfileByName_(ss, dealerName) {
  var q = String(dealerName || '').trim().toUpperCase();
  if (!q || q === '-') return null;
  var dir = getDealerChannelDirectoryFromSheet_(ss).dealers || [];
  for (var i = 0; i < dir.length; i++) {
    var dName = String(dir[i].name || '').trim().toUpperCase();
    if (dName && (dName === q || dName.indexOf(q) > -1 || q.indexOf(dName) > -1)) {
      return dir[i];
    }
  }
  return null;
}

function ensureDealerDispatchTrackerSheet_(ss) {
  var sheetName = 'Dealer_Service_Dispatch_Tracker';
  var headers = [
    'Case_ID', 'Created_At', 'Serial_No', 'Model', 'Customer_Name',
    'Customer_Phone', 'Customer_LINE_ID', 'Channel_Type', 'Assigned_Dealer_Or_Team',
    'Symptom', 'Status', 'Last_Reminded_At', 'Reminder_Count', 'Notes'
  ];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  return sheet;
}

function routeCustomerCaseToDealerOrDirect_(ss, data, secrets) {
  var sn = String(data.serialNo || '').trim().toUpperCase();
  var symptom = String(data.symptom || 'ขอช่างเข้าตรวจเช็กอาการ').trim();
  var custName = String(data.customerName || 'ลูกค้า LINE').trim();
  var custPhone = String(data.customerPhone || '').trim();
  var custLineId = String(data.customerLineUserId || '').trim();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var caseId = 'CASE-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');

  // 1. Lookup S/N in Serial Master / Updates to identify selling Dealer or Direct Channel
  var salesInfo = (sn && sn !== 'NO_SN') ? searchSerialInfoFromSheet_(ss, sn) : null;
  var rawOwner = salesInfo ? String(salesInfo.customer || '').trim() : '';
  var modelName = salesInfo ? String(salesInfo.model || '-').trim() : '-';
  var dealerProfile = findDealerProfileByName_(ss, rawOwner);

  var channelType = String(data.overrideChannelType || (dealerProfile ? dealerProfile.channelType : (rawOwner ? 'DEALER_ABC' : 'DIRECT_SALE'))).toUpperCase();
  var assignedTarget = dealerProfile ? dealerProfile.name : (rawOwner || 'HOSHIZAKI Direct Service Team');
  var isDirect = (channelType === 'DIRECT_SALE' || channelType === 'JAPANESE_CORPORATE');

  // 2. Log into Dealer_Service_Dispatch_Tracker
  var tracker = ensureDealerDispatchTrackerSheet_(ss);
  tracker.appendRow([
    caseId, nowStr, sn || '-', modelName, custName,
    custPhone, custLineId, channelType, assignedTarget,
    symptom, isDirect ? 'DISPATCHED_DIRECT_TEAM' : 'WAITING_DEALER_ACK',
    nowStr, 0, 'Auto-routed via LINE Chatbot'
  ]);

  var customerFlexMessage;

  if (!isDirect && assignedTarget) {
    // --- CASE A: DEALER CHANNEL (Main Workflow) ---
    var dPhone = (dealerProfile && dealerProfile.phone) ? dealerProfile.phone : '02-005-9980-83 (ศูนย์ประสานงาน Hoshizaki)';
    var dLineUrl = (dealerProfile && dealerProfile.lineOaLink && dealerProfile.lineOaLink.indexOf('http') === 0)
      ? dealerProfile.lineOaLink
      : 'https://serviceshth.github.io/hoshizaki-service/?portal=customer&jobNo=' + encodeURIComponent(caseId);

    // A1) Push Dispatch Flex Card to Dealer's Group LINE (if configured) + Email + SMS log
    var dealerCard = {
      type: 'flex',
      altText: '🔔 [HOSHIZAKI แจ้งเคสบริการลูกค้า] ' + caseId + ' - ' + assignedTarget,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
          contents: [
            { type: 'text', text: '🔔 HOSHIZAKI DEALER SERVICE HANDOFF', color: '#FDE047', size: 'xxs', weight: 'bold' },
            { type: 'text', text: caseId + ' → ' + assignedTarget, color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs', wrap: true }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
          contents: [
            { type: 'text', text: '❄️ รุ่น / S/N: ' + modelName + ' / ' + (sn || '-'), size: 'xs', weight: 'bold', color: '#0369A1', wrap: true },
            { type: 'text', text: '🏪 ลูกค้าที่แจ้ง: ' + custName + (custPhone ? ' (' + custPhone + ')' : ''), size: 'xs', wrap: true },
            { type: 'text', text: '🔍 อาการที่แจ้ง: ' + symptom, size: 'xs', color: '#334155', wrap: true },
            { type: 'text', text: '⏰ กรุณากดปุ่มด้านล่างเมื่อติดต่อลูกค้าแล้ว (ระบบจะติดตามผลอัตโนมัติทุก 2 ชม.)', size: 'xxs', color: '#B45309', wrap: true, margin: 'sm' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
          contents: [
            {
              type: 'button', style: 'primary', color: '#059669', height: 'sm',
              action: { type: 'postback', label: '✅ ตัวแทนจำหน่ายรับเรื่องติดต่อลูกค้าแล้ว', data: 'DEALER_ACK_CASE:' + caseId, displayText: 'รับเรื่องและติดต่อลูกค้าเคส ' + caseId + ' เรียบร้อยครับ' }
            },
            {
              type: 'button', style: 'secondary', height: 'sm',
              action: { type: 'postback', label: '🔄 คิวเต็ม / ขอ Hoshizaki เข้าแทน', data: 'DEALER_REQ_HZK_SUB:' + caseId, displayText: 'คิวช่างเต็ม ขอให้ทีม Hoshizaki เข้าหน้างานแทนและส่งใบเสนอราคาให้ทางตัวแทนจำหน่ายครับ' }
            }
          ]
        }
      }
    };

    var sentDealerLine = false;
    if (dealerProfile && dealerProfile.lineGroupId && isLineTokenConfigured()) {
      sentDealerLine = pushLineMessages_(dealerProfile.lineGroupId, [dealerCard]);
    }
    if (dealerProfile && dealerProfile.email && checkAndNotifyEmailQuota_(secrets)) {
      try {
        MailApp.sendEmail({
          to: dealerProfile.email,
          subject: '[HOSHIZAKI SERVICE HANDOFF] เคส ' + caseId + ' (S/N: ' + (sn || '-') + ') - ' + assignedTarget,
          body: 'เรียน ' + assignedTarget + '\n\nศูนย์บริการ HOSHIZAKI ขอส่งต่อข้อมูลลูกค้าที่ติดต่อขอรับบริการ:\n• รหัสเคส: ' + caseId + '\n• รุ่น / S/N: ' + modelName + ' / ' + (sn || '-') + '\n• ลูกค้า: ' + custName + '\n• อาการ: ' + symptom + '\n\nกรุณาติดต่อกลับลูกค้าและแจ้งยืนยันกลับมายังศูนย์บริการ Hoshizaki ครับ'
        });
      } catch (eMail) {}
    }

    // A2) Notify Hoshizaki Service Team Group LINE that Dealer handoff is completed!
    if (isLineGroupConfigured() && isLineTokenConfigured()) {
      pushLineMessage(
        secrets.lineGroupId,
        '📣 [ประสานงานส่งเรื่องให้ตัวแทนจำหน่ายเรียบร้อยแล้ว]\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '🆔 รหัสเคส: ' + caseId + '\n' +
        '🏢 ตัวแทนจำหน่ายผู้ดูแล: ' + assignedTarget + ' (' + channelType + ')\n' +
        '❄️ รุ่น / S/N: ' + modelName + ' / ' + (sn || '-') + '\n' +
        '👤 ลูกค้า: ' + custName + '\n' +
        '🔍 อาการ: ' + symptom + '\n' +
        '📡 ช่องทางที่ส่งแจ้ง: ' + (sentDealerLine ? 'Group LINE ตัวแทนจำหน่าย + ' : '') + 'Flex Card ให้ลูกค้าติดต่อโดยตรง\n' +
        '⏱️ สถานะ: รอตัวแทนจำหน่ายยืนยันติดต่อกลับ (ติดตามซ้ำอัตโนมัติทุก 2 ชม.)'
      );
    }

    // A3) Build Flex Card for Customer to contact Dealer directly
    customerFlexMessage = {
      type: 'flex',
      altText: '🏢 ข้อมูลตัวแทนจำหน่ายที่ดูแลเครื่องของคุณ (' + assignedTarget + ')',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
          contents: [
            { type: 'text', text: '🏢 HOSHIZAKI AUTHORIZED DEALER CARE', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
            { type: 'text', text: 'ตัวแทนจำหน่ายที่ดูแลเครื่องของคุณ', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
          contents: [
            { type: 'text', text: '❄️ รุ่น / S/N: ' + modelName + ' / ' + (sn || '-'), size: 'xs', weight: 'bold', color: '#0369A1', wrap: true },
            { type: 'text', text: '🏪 ตัวแทนจำหน่าย: ' + assignedTarget, size: 'xs', weight: 'bold', color: '#0F172A', wrap: true },
            { type: 'text', text: '📞 เบอร์ติดต่อบริการ: ' + dPhone, size: 'xs', color: '#334155', wrap: true },
            { type: 'separator', margin: 'sm' },
            { type: 'text', text: '✅ ศูนย์บริการ HOSHIZAKI ได้ประสานงานส่งเรื่องไปยังตัวแทนจำหน่ายเรียบร้อยแล้ว (รหัส ' + caseId + ') หรือคุณลูกค้าสามารถกดปุ่มด้านล่างเพื่อติดต่อตัวแทนจำหน่ายได้โดยตรงครับ', size: 'xxs', color: '#065F46', wrap: true, margin: 'sm' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
          contents: [
            {
              type: 'button', style: 'primary', color: '#059669', height: 'sm',
              action: { type: 'uri', label: '💬 ติดต่อตัวแทนจำหน่าย / ติดตามงาน', uri: dLineUrl }
            }
          ]
        }
      }
    };
  } else {
    // --- CASE B: DIRECT SALE / JAPANESE CORPORATE (Hoshizaki Direct Service Team) ---
    var tkDirect = createTechnicianSupportTicket_(ss, custLineId, '[' + channelType + '] S/N: ' + (sn || '-') + ' | ' + symptom, modelName + ' / ' + (sn || '-'), channelType);
    customerFlexMessage = {
      type: 'flex',
      altText: '🛠️ รับเรื่องแจ้งซ่อมลูกค้าขายตรง HOSHIZAKI (' + caseId + ')',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
          contents: [
            { type: 'text', text: '🛠️ HOSHIZAKI DIRECT SERVICE UNIT', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
            { type: 'text', text: 'รับเรื่องแจ้งซ่อมเข้าศูนย์บริการตรงแล้ว', color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
          contents: [
            { type: 'text', text: '🆔 รหัสอ้างอิง: ' + caseId + ' (' + tkDirect.ticketId + ')', size: 'xs', weight: 'bold', color: '#0369A1' },
            { type: 'text', text: '❄️ รุ่น / S/N: ' + modelName + ' / ' + (sn || '-'), size: 'xs', wrap: true },
            { type: 'text', text: '👨‍🔧 ทีมวิศวกรบริการ HOSHIZAKI ได้รับข้อมูลแล้ว และจะติดต่อกลับเพื่อนัดหมายเข้าตรวจเช็กโดยเร็วที่สุดครับ', size: 'xs', color: '#334155', wrap: true, margin: 'xs' }
          ]
        }
      }
    };
  }

  return {
    status: 'ok',
    caseId: caseId,
    channelType: channelType,
    assignedTarget: assignedTarget,
    customerFlexMessage: customerFlexMessage
  };
}

function updateDealerDispatchCaseStatus_(ss, caseId, newStatus, noteText) {
  var sheet = ensureDealerDispatchTrackerSheet_(ss);
  var rowIdx = findRowByExactKey(sheet, 1, String(caseId || '').trim().toUpperCase());
  if (rowIdx >= 2) {
    sheet.getRange(rowIdx, 11).setValue(newStatus);
    if (noteText) sheet.getRange(rowIdx, 14).setValue(noteText);
  }
}

function getDealerDispatchTrackerFromSheet_(ss) {
  var sheet = ensureDealerDispatchTrackerSheet_(ss);
  if (sheet.getLastRow() < 2) return { status: 'ok', cases: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  var cases = vals.reverse().map(function(r) {
    return {
      caseId: r[0], createdAt: r[1], serialNo: r[2], model: r[3],
      customerName: r[4], customerPhone: r[5], channelType: r[7],
      assignedTarget: r[8], symptom: r[9], status: r[10],
      lastRemindedAt: r[11], reminderCount: Number(r[12] || 0), notes: r[13]
    };
  });
  return { status: 'ok', cases: cases };
}

function runDealerDispatchFollowUpAndEscalation_(ss, secrets) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  secrets = secrets || getAppSecrets_();
  var sheet = ensureDealerDispatchTrackerSheet_(ss);
  if (sheet.getLastRow() < 2) return { status: 'ok', remindedCount: 0 };

  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  var nowMs = Date.now();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var reminded = 0;

  for (var i = 0; i < vals.length; i++) {
    var st = String(vals[i][10] || '');
    if (st === 'WAITING_DEALER_ACK') {
      var lastStr = String(vals[i][11] || vals[i][1] || '');
      var lastDt = new Date(lastStr.replace(' ', 'T') + '+07:00');
      var diffHrs = isNaN(lastDt.getTime()) ? 2.5 : ((nowMs - lastDt.getTime()) / (1000 * 3600));
      var remCount = Number(vals[i][12] || 0);

      if (diffHrs >= 2) {
        var caseId = String(vals[i][0] || '');
        var sn = String(vals[i][2] || '-');
        var model = String(vals[i][3] || '-');
        var custName = String(vals[i][4] || '-');
        var dealerName = String(vals[i][8] || '-');
        var dProf = findDealerProfileByName_(ss, dealerName);

        // 1. Re-notify Dealer Group LINE & Email
        if (dProf && dProf.lineGroupId && isLineTokenConfigured()) {
          pushLineMessage(dProf.lineGroupId, '⏰ [ติดตามเคสซ้ำครั้งที่ ' + (remCount + 1) + '] เคส ' + caseId + ' (S/N: ' + sn + ' / ' + model + ') ลูกค้า: ' + custName + ' ยังรอการติดต่อกลับจาก ' + dealerName + ' ครับ');
        }
        if (dProf && dProf.email && checkAndNotifyEmailQuota_(secrets)) {
          try {
            MailApp.sendEmail({
              to: dProf.email,
              subject: '[REMINDER #' + (remCount + 1) + '] ติดตามการติดต่อกลับลูกค้า HOSHIZAKI เคส ' + caseId,
              body: 'เรียน ' + dealerName + '\n\nระบบติดตามอัตโนมัติขอแจ้งเตือนซ้ำสำหรับเคส ' + caseId + ' (S/N: ' + sn + ', ลูกค้า: ' + custName + ') กรุณาติดต่อลูกค้าและกดยืนยันรับเรื่องในกลุ่ม LINE ครับ'
            });
          } catch (eM) {}
        }

        // 2. Notify Hoshizaki Service Group LINE (and escalate if >= 4 hrs / remCount >= 1)
        if (isLineGroupConfigured() && isLineTokenConfigured()) {
          var escPrefix = (remCount >= 1) ? '🚨 [SLA ESCALATION > 4 ชม.] ' : '⏱️ [ติดตามรอบ 2 ชม.] ';
          pushLineMessage(secrets.lineGroupId, escPrefix + 'เคส ' + caseId + ' (' + dealerName + ') ส่งแจ้งเตือนซ้ำครั้งที่ ' + (remCount + 1) + ' เรียบร้อยแล้ว');
        }

        sheet.getRange(i + 2, 12).setValue(nowStr);
        sheet.getRange(i + 2, 13).setValue(remCount + 1);
        reminded++;
      }
    }
  }
  return { status: 'ok', remindedCount: reminded };
}


function requestHoshizakiSubcontractForDealer_(ss, data, secrets) {
  var caseId = String(data.caseId || ('CASE-' + Date.now())).trim().toUpperCase();
  var reason = String(data.reason || 'ตัวแทนจำหน่ายคิวช่างเต็ม ขอให้ HOSHIZAKI เข้าหน้างานแทน').trim();
  var sheet = ensureDealerDispatchTrackerSheet_(ss);
  var rowIdx = findRowByExactKey(sheet, 1, caseId);
  var dealerName = String(data.dealerName || 'ตัวแทนจำหน่าย').trim();
  var sn = String(data.serialNo || '-').trim().toUpperCase();
  var model = String(data.model || '-').trim();
  var custName = String(data.customerName || '-').trim();
  var symptom = String(data.symptom || '-').trim();

  if (rowIdx >= 2) {
    var rowVals = sheet.getRange(rowIdx, 1, 1, 14).getValues()[0];
    sn = rowVals[2] || sn;
    model = rowVals[3] || model;
    custName = rowVals[4] || custName;
    dealerName = rowVals[8] || dealerName;
    symptom = rowVals[9] || symptom;
    sheet.getRange(rowIdx, 11).setValue('DEALER_SUBCONTRACT_QT_TO_DEALER');
    sheet.getRange(rowIdx, 14).setValue('B2B Sub-Service: ออก QT ส่งตรงให้ ' + dealerName + ' เท่านั้น (ไม่ส่งตรงถึง End-User) | ' + reason);
  }

  // Create internal Service Job tagged for B2B Dealer Billing
  var jobNo = 'JOB-DLR-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmm');
  upsertJobToSheet(ss, {
    jobNo: jobNo,
    date: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    jobStatus: 'Waiting Dealer QT Approval',
    techCode: 'B2B-DEALER',
    responsibleTech: 'Hoshizaki Service Team',
    store: custName + ' (ผ่านดีลเลอร์: ' + dealerName + ')',
    dealer: dealerName,
    model: model,
    serial: sn,
    diagSymptom: '[B2B Sub-Service แทนดีลเลอร์] ' + symptom,
    diagAction: 'ออกใบเสนอราคาส่งให้ตัวแทนจำหน่าย (' + dealerName + ') เท่านั้น ห้ามส่งราคาตรงถึงลูกค้าปลายทาง',
    grandTotal: '0.00'
  }, '', '');

  if (secrets && isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessage(
      secrets.lineGroupId,
      '🔄 [ตัวแทนจำหน่ายขอให้ HOSHIZAKI เข้าหน้างานแทน — B2B Sub-Service]\n' +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      '🆔 เคสอ้างอิง: ' + caseId + ' -> ใบงาน: ' + jobNo + '\n' +
      '🏢 ตัวแทนจำหน่ายผู้ว่าจ้าง: ' + dealerName + '\n' +
      '🏪 ลูกค้าหน้างาน (End-User): ' + custName + '\n' +
      '❄️ รุ่น / S/N: ' + model + ' / ' + sn + '\n' +
      '💰 เงื่อนไขใบเสนอราคา (STRICT B2B RULE):\n' +
      '   ⚠️ ออกใบเสนอราคาส่งให้ "' + dealerName + '" เท่านั้น!\n' +
      '   ⚠️ ห้ามส่งใบเสนอราคาหรือแจ้งราคาให้ลูกค้าปลายทางโดยตรง (ดีลเลอร์นำไปบวก Margin เสนอลูกค้าเอง)'
    );
  }

  return { status: 'ok', caseId: caseId, jobNo: jobNo, dealerName: dealerName, billingMode: 'BILL_TO_DEALER_ONLY' };
}

function runDealerDispatchFollowUpTrigger() {
  return runDealerDispatchFollowUpAndEscalation_();
}

// =========================================================================
// SECTION 27: ENTERPRISE v1036 VISUAL LINE FLEX STUDIO & DEEP DIAGNOSTICS
// =========================================================================
function uploadFlexStudioImageToDrive_(ss, data) {
  var dataUrl = String(data.imageDataUrl || '');
  var fileName = String(data.fileName || ('FLEX_IMG_' + Date.now() + '.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!dataUrl || dataUrl.indexOf('base64,') === -1) {
    return { status: 'error', message: 'Invalid imageDataUrl' };
  }
  var mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  var b64 = dataUrl.split('base64,')[1];
  var rootIter = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  var root = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder(ROOT_DRIVE_FOLDER_NAME);
  var flexIter = root.getFoldersByName('_LINE_FLEX_STUDIO_ASSETS');
  var flexFolder = flexIter.hasNext() ? flexIter.next() : root.createFolder('_LINE_FLEX_STUDIO_ASSETS');

  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
  var file = flexFolder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (eShare) {}

  var fileId = file.getId();
  var publicUrl = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId) + '=w1024';
  return {
    status: 'ok',
    fileId: fileId,
    fileName: file.getName(),
    driveUrl: file.getUrl(),
    publicImageUrl: publicUrl
  };
}

function saveCustomFlexTemplateToSheet_(ss, data) {
  var tpl = data.template || data || {};
  var sheetName = 'LINE_Flex_Templates';
  var headers = [
    'Template_ID', 'Template_Name', 'Target_Channel', 'Header_Bg_Color',
    'Header_Badge', 'Header_Title', 'Hero_Image_URL', 'Hero_Aspect_Ratio',
    'Body_Rows_JSON', 'Footer_Buttons_JSON', 'Full_Flex_JSON', 'Updated_At'
  ];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#002B49').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  var tplId = String(tpl.id || ('FLEX-' + Date.now().toString().slice(-6))).toUpperCase();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowVals = [
    tplId,
    String(tpl.name || 'HOSHIZAKI Flex Card'),
    String(tpl.targetChannel || 'DEALER_GROUP'),
    String(tpl.headerBg || '#002B49'),
    String(tpl.headerBadge || 'HOSHIZAKI SERVICE UPDATE'),
    String(tpl.headerTitle || ''),
    String(tpl.heroImageUrl || ''),
    String(tpl.heroAspectRatio || '16:9'),
    JSON.stringify(tpl.bodyRows || []),
    JSON.stringify(tpl.buttons || []),
    JSON.stringify(tpl.flexPayload || {}),
    nowStr
  ];
  var rowIdx = findRowByExactKey(sheet, 1, tplId);
  if (rowIdx >= 2) sheet.getRange(rowIdx, 1, 1, headers.length).setValues([rowVals]);
  else sheet.appendRow(rowVals);

  return { status: 'ok', templateId: tplId, updatedAt: nowStr };
}

function getCustomFlexTemplatesFromSheet_(ss) {
  var sheet = ss.getSheetByName('LINE_Flex_Templates');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', templates: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var list = vals.reverse().map(function(r) {
    var bodyRows = [], buttons = [], flexPayload = {};
    try { bodyRows = JSON.parse(String(r[8] || '[]')); } catch (e1) {}
    try { buttons = JSON.parse(String(r[9] || '[]')); } catch (e2) {}
    try { flexPayload = JSON.parse(String(r[10] || '{}')); } catch (e3) {}
    return {
      id: r[0], name: r[1], targetChannel: r[2], headerBg: r[3],
      headerBadge: r[4], headerTitle: r[5], heroImageUrl: r[6], heroAspectRatio: r[7],
      bodyRows: bodyRows, buttons: buttons, flexPayload: flexPayload, updatedAt: r[11]
    };
  });
  return { status: 'ok', templates: list };
}

function sendCustomFlexBroadcast_(ss, data, secrets) {
  var flexMsg = data.flexMessage;
  var targetMode = String(data.targetMode || 'TECH_GROUP').toUpperCase();
  var customTargetId = String(data.targetId || '').trim();
  if (!flexMsg || !flexMsg.contents) {
    return { status: 'error', message: 'Missing Flex Message payload' };
  }
  var sentCount = 0;
  var failedCount = 0;

  if (targetMode === 'TECH_GROUP') {
    if (pushLineMessagesWithToken_(secrets.internalLineToken || secrets.lineToken, secrets.lineGroupId, [flexMsg])) sentCount++;
    else failedCount++;
  } else if (targetMode === 'SPECIFIC_ID' && customTargetId) {
    var tok = (data.botAccount === 'customer') ? (secrets.customerLineToken || secrets.lineToken) : (secrets.internalLineToken || secrets.lineToken);
    if (pushLineMessagesWithToken_(tok, customTargetId, [flexMsg])) sentCount++;
    else failedCount++;
  } else if (targetMode === 'ALL_DEALER_GROUPS') {
    var dir = getDealerChannelDirectoryFromSheet_(ss).dealers || [];
    var seenGroups = {};
    dir.forEach(function(d) {
      var gid = String(d.lineGroupId || '').trim();
      if (gid && !seenGroups[gid]) {
        seenGroups[gid] = true;
        if (pushLineMessagesWithToken_(secrets.internalLineToken || secrets.lineToken, gid, [flexMsg])) sentCount++;
        else failedCount++;
      }
    });
  } else if (targetMode === 'CUSTOMER_OA_USER' && customTargetId) {
    if (pushLineMessagesWithToken_(secrets.customerLineToken || secrets.lineToken, customTargetId, [flexMsg])) sentCount++;
    else failedCount++;
  }

  return { status: sentCount > 0 ? 'ok' : 'warning', sentCount: sentCount, failedCount: failedCount };
}


// ============================================================================
// 26. ENTERPRISE v1038 HOLISTIC INVENTORY MANAGEMENT SYSTEM (IMS) BACKEND
// ============================================================================
function syncEnterpriseImsBatchToSheets_(ss, data, secrets) {
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var items = Array.isArray(data.items) ? data.items : [];
  var lots = Array.isArray(data.lots) ? data.lots : [];
  var moves = Array.isArray(data.movements) ? data.movements : [];
  var orders = Array.isArray(data.reorderOrders) ? data.reorderOrders : [];

  var mSheet = ss.getSheetByName('IMS_Inventory_Master');
  if (!mSheet) {
    mSheet = ss.insertSheet('IMS_Inventory_Master');
    mSheet.getRange(1, 1, 1, 14).setValues([[
      'SKU', 'Item Name', 'Inventory Type (RM/WIP/FG/MRO)', 'ABC Class',
      'WMS Zone', 'WMS Bin', 'On-Hand Qty', 'UOM', 'Unit Cost (THB)',
      'Total Stock Value (THB)', 'Safety Stock', 'Reorder Point (ROP)', 'EOQ Qty', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    mSheet.setFrozenRows(1);
  }
  if (items.length > 0) {
    if (mSheet.getLastRow() > 1) mSheet.getRange(2, 1, mSheet.getLastRow() - 1, 14).clearContent();
    var mRows = items.map(function(x) {
      return [
        String(x.sku || ''), String(x.name || ''), String(x.invType || 'RM'), String(x.abcClass || 'C'),
        String(x.zone || ''), String(x.bin || ''), Number(x.onHandQty || 0), String(x.uom || 'PCS'),
        Number(x.unitCost || 0), Number(x.stockValue || 0), Number(x.safetyStock || 0),
        Number(x.reorderPoint || 0), Number(x.eoq || 1), nowStr
      ];
    });
    mSheet.getRange(2, 1, mRows.length, 14).setValues(mRows);
  }

  var lSheet = ss.getSheetByName('IMS_FIFO_Lots_WMS');
  if (!lSheet) {
    lSheet = ss.insertSheet('IMS_FIFO_Lots_WMS');
    lSheet.getRange(1, 1, 1, 11).setValues([[
      'Lot ID', 'SKU', 'Item Name', 'Inv Type', 'Received Date (FIFO)',
      'Expiry Date', 'WMS Zone', 'WMS Bin', 'Initial Qty', 'Remaining Qty', 'PO Ref'
    ]]).setFontWeight('bold').setBackground('#065F46').setFontColor('#FFFFFF');
    lSheet.setFrozenRows(1);
  }
  if (lots.length > 0) {
    if (lSheet.getLastRow() > 1) lSheet.getRange(2, 1, lSheet.getLastRow() - 1, 11).clearContent();
    var lRows = lots.map(function(l) {
      return [
        String(l.lotId || ''), String(l.sku || ''), String(l.name || ''), String(l.invType || ''),
        String(l.receivedDate || ''), String(l.expiryDate || ''), String(l.zone || ''),
        String(l.bin || ''), Number(l.initialQty || 0), Number(l.remainingQty || 0), String(l.poRef || '')
      ];
    });
    lSheet.getRange(2, 1, lRows.length, 11).setValues(lRows);
  }

  var mvSheet = ss.getSheetByName('IMS_Movement_Ledger');
  if (!mvSheet) {
    mvSheet = ss.insertSheet('IMS_Movement_Ledger');
    mvSheet.getRange(1, 1, 1, 9).setValues([[
      'Move ID', 'Timestamp', 'Type', 'SKU', 'Item Name', 'Qty Delta', 'From Location', 'To Location', 'FIFO Lot & Ref Doc'
    ]]).setFontWeight('bold').setBackground('#1E293B').setFontColor('#FFFFFF');
    mvSheet.setFrozenRows(1);
  }
  if (moves.length > 0) {
    if (mvSheet.getLastRow() > 1) mvSheet.getRange(2, 1, mvSheet.getLastRow() - 1, 9).clearContent();
    var mvRows = moves.slice(0, 300).map(function(m) {
      return [
        String(m.moveId || ''), String(m.timestamp || nowStr), String(m.type || ''),
        String(m.sku || ''), String(m.name || ''), Number(m.qty || 0),
        String(m.fromLoc || ''), String(m.toLoc || ''), String((m.lotId || '') + ' | ' + (m.refDoc || ''))
      ];
    });
    mvSheet.getRange(2, 1, mvRows.length, 9).setValues(mvRows);
  }

  var poSheet = ss.getSheetByName('IMS_JIT_EOQ_Reorder_Orders');
  if (!poSheet) {
    poSheet = ss.insertSheet('IMS_JIT_EOQ_Reorder_Orders');
    poSheet.getRange(1, 1, 1, 10).setValues([[
      'Order ID', 'Created At', 'SKU', 'Item Name', 'Inv Type', 'Policy (JIT/EOQ)',
      'Current Qty', 'ROP', 'Suggested Order Qty', 'Est. Cost (THB)'
    ]]).setFontWeight('bold').setBackground('#9F1239').setFontColor('#FFFFFF');
    poSheet.setFrozenRows(1);
  }
  if (orders.length > 0) {
    if (poSheet.getLastRow() > 1) poSheet.getRange(2, 1, poSheet.getLastRow() - 1, 10).clearContent();
    var poRows = orders.map(function(p) {
      return [
        String(p.poId || ''), String(p.createdAt || nowStr), String(p.sku || ''),
        String(p.name || ''), String(p.invType || ''), String(p.mode || ''),
        Number(p.currentQty || 0), Number(p.rop || 0), Number(p.suggestedOrderQty || 0), Number(p.estCost || 0)
      ];
    });
    poSheet.getRange(2, 1, poRows.length, 10).setValues(poRows);
  }

  return {
    status: 'ok',
    syncedItems: items.length,
    syncedLots: lots.length,
    syncedMovements: moves.length,
    syncedReorderOrders: orders.length
  };
}

function getEnterpriseImsDataFromSheets_(ss) {
  var mSheet = ss.getSheetByName('IMS_Inventory_Master');
  var items = [];
  if (mSheet && mSheet.getLastRow() >= 2) {
    var vals = mSheet.getRange(2, 1, mSheet.getLastRow() - 1, 14).getValues();
    items = vals.map(function(r) {
      return {
        sku: r[0], name: r[1], invType: r[2], abcClass: r[3], zone: r[4], bin: r[5],
        onHandQty: Number(r[6] || 0), uom: r[7], unitCost: Number(r[8] || 0),
        stockValue: Number(r[9] || 0), safetyStock: Number(r[10] || 0),
        reorderPoint: Number(r[11] || 0), eoq: Number(r[12] || 1)
      };
    });
  }
  return { status: 'ok', items: items };
}


// ============================================================================
// 26. ENTERPRISE v1051-OMNI-ENTERPRISE: MULTI-USER SHA-256 CREDENTIAL VAULT,
//     SOLE SUPER ADMIN (MR. NOPARIN) & IMMEDIATE SYSTEM_AUDIT_LOG SYNC
// ============================================================================

function syncUserCredentialsVaultToSheet_(ss, data) {
  var sheet = ss.getSheetByName('System_User_Credentials');
  if (!sheet) {
    sheet = ss.insertSheet('System_User_Credentials');
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Staff ID', 'Code', 'Full Name', 'Department (8 Depts)', 'Position',
      'RBAC Role', 'Salt', 'SHA-256 Password Hash', 'Temp Password', 'Suspended', 'Active', 'Updated At'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var users = Array.isArray(data.users) ? data.users : [];
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).clearContent();
  }
  if (users.length > 0) {
    var rows = users.map(function(u) {
      var roleVal = (String(u.id || '') === 'SVC-02') ? 'SUPER_ADMIN' : (String(u.rbacRole || '') === 'SUPER_ADMIN' ? 'SERVICE_MANAGER' : String(u.rbacRole || 'TECHNICIAN'));
      return [
        String(u.id || ''), String(u.code || ''), String(u.name || ''),
        String(u.department || ''), String(u.position || ''), roleVal,
        String(u.salt || ''), String(u.passwordHash || ''),
        u.isTempPassword ? 'TRUE' : 'FALSE',
        u.suspended ? 'TRUE' : 'FALSE',
        u.active !== false ? 'TRUE' : 'FALSE',
        String(u.updatedAt || nowStr)
      ];
    });
    sheet.getRange(2, 1, rows.length, 12).setValues(rows);
  }
  return { status: 'ok', syncedUsers: users.length, updatedAt: nowStr };
}

function logSecurityAuditEventToSheet_(ss, data) {
  var sheet = ss.getSheetByName('System_Audit_Log');
  if (!sheet) {
    sheet = ss.insertSheet('System_Audit_Log');
    sheet.getRange(1, 1, 1, 7).setValues([[
      'Timestamp', 'Actor Staff ID', 'Actor Name', 'Department', 'RBAC Role', 'Target Account ID', 'Security Audit Event'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    nowStr,
    String(data.staffId || '-'),
    String(data.staffName || '-'),
    String(data.department || '-'),
    String(data.rbacRole || '-'),
    String(data.targetId || '-'),
    String(data.event || 'SECURITY_EVENT')
  ]);
  return { status: 'ok', timestamp: nowStr };
}


// ============================================================================
// SECTION 28: ENTERPRISE v1051-OMNI-ENTERPRISE TWO-WAY CREDENTIAL VAULT & AUDIT LOG READERS
// ============================================================================
function getUserCredentialsVaultFromSheet_(ss) {
  var sheet = ss.getSheetByName('System_User_Credentials');
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: 'ok', users: [] };
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var users = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    var uid = String(r[0]).trim();
    var role = (uid === 'SVC-02') ? 'SUPER_ADMIN' : (String(r[5] || '') === 'SUPER_ADMIN' ? 'SERVICE_MANAGER' : String(r[5] || 'TECHNICIAN'));
    users.push({
      id: uid,
      code: String(r[1] || uid),
      name: String(r[2] || ''),
      department: String(r[3] || ''),
      position: String(r[4] || ''),
      rbacRole: role,
      salt: String(r[6] || ''),
      passwordHash: String(r[7] || ''),
      isTempPassword: String(r[8]).toUpperCase() === 'TRUE',
      suspended: String(r[9]).toUpperCase() === 'TRUE',
      active: String(r[10]).toUpperCase() !== 'FALSE',
      updatedAt: String(r[11] || '')
    });
  }
  return { status: 'ok', users: users, count: users.length };
}

function getSecurityAuditLogsFromSheet_(ss, limit) {
  var sheet = ss.getSheetByName('System_Audit_Log');
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: 'ok', logs: [] };
  }
  var lastRow = sheet.getLastRow();
  var maxRows = Math.min(lastRow - 1, Math.max(1, limit || 100));
  var startRow = Math.max(2, lastRow - maxRows + 1);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
  var logs = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var r = values[i];
    logs.push({
      timestamp: String(r[0] || ''),
      actorId: String(r[1] || ''),
      actorName: String(r[2] || ''),
      department: String(r[3] || ''),
      rbacRole: String(r[4] || ''),
      targetId: String(r[5] || ''),
      event: String(r[6] || '')
    });
  }
  return { status: 'ok', logs: logs, count: logs.length };
}


// ============================================================================
// 27. ENTERPRISE v1051-OMNI-ENTERPRISE BACKEND ENHANCEMENTS:
//     - Trilingual Auto-Detect Response (TH / EN / JP)
//     - Business Hours Flex Card (Mon-Fri 08:30-17:30) + After-Hours Queue
//     - Smart Fuzzy Disambiguation & Auto-Resend Permanent PDF Vault Link
//     - LINE OA Inquiry CRM Logger & Geo-Location Travel Cost Estimator
// ============================================================================

function detectTextLanguage_(text) {
  var s = String(text || '');
  if (/[\u3040-\u30FF\u4E00-\u9FAF]/.test(s)) return 'JP';
  if (/[\u0E00-\u0E7F]/.test(s)) return 'TH';
  return 'EN';
}

function isWithinHoshizakiBusinessHours_() {
  var now = new Date();
  var dayStr = Utilities.formatDate(now, 'Asia/Bangkok', 'u'); // 1=Mon .. 7=Sun
  var hourNum = Number(Utilities.formatDate(now, 'Asia/Bangkok', 'HH'));
  var minNum = Number(Utilities.formatDate(now, 'Asia/Bangkok', 'mm'));
  var dayNum = Number(dayStr);
  if (dayNum >= 6) return false;
  var totalMins = hourNum * 60 + minNum;
  return totalMins >= (8 * 60 + 30) && totalMins <= (17 * 60 + 30);
}

function buildBusinessHoursFlexCard_(lang) {
  var title = lang === 'JP'
    ? '営業時間のご案内（月〜金 08:30〜17:30）'
    : (lang === 'EN' ? 'HOSHIZAKI Business Hours Notice' : 'แจ้งเวลาทำการ HOSHIZAKI (THAILAND)');
  var bodyTxt = lang === 'JP'
    ? 'お問い合わせありがとうございます。現在営業時間外（月曜〜金曜 08:30〜17:30）のため、翌営業日に担当者より順次ご連絡いたします。\n※迅速な部品特定のため、本体銘板（Model / Serial No.）のお写真をお送りください。'
    : (lang === 'EN'
      ? 'Thank you for contacting HOSHIZAKI (THAILAND). Our business hours are Monday – Friday, 08:30 – 17:30. Our team will follow up on the next working day.\nPlease share a photo of the machine Nameplate (Model & Serial No.) for faster assistance.'
      : 'ขอบคุณที่ติดต่อสอบถามงานบริการและทางเทคนิค HOSHIZAKI (THAILAND)\n• เวลาทำการ: วันจันทร์ - ศุกร์ เวลา 08:30 - 17:30 น.\n• Line Official: @hoshizakithailand | Tel: 02-005-9980 | Email: info@hoshizaki.co.th\nกรุณาถ่ายรูปเนมเพลท (Nameplate) ที่เห็น Model และ Serial No. ทิ้งไว้ เพื่อประสานงานให้ทันทีในวันทำการถัดไปครับ');

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#002B49', paddingAll: '12px',
        contents: [
          { type: 'text', text: 'HOSHIZAKI (THAILAND) · SERVICE HOTLINE', color: '#7DD3FC', size: 'xxs', weight: 'bold' },
          { type: 'text', text: title, color: '#FFFFFF', size: 'sm', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'text', text: bodyTxt, size: 'xs', color: '#1E293B', wrap: true }
        ]
      }
    }
  };
}

function logLineOaInquiryToSheet_(ss, userId, custName, lang, question, intent, actionOutcome) {
  try {
    var sheet = ss.getSheetByName('LINE_OA_Inquiry_Log');
    if (!sheet) {
      sheet = ss.insertSheet('LINE_OA_Inquiry_Log');
      sheet.getRange(1, 1, 1, 8).setValues([[
        'Timestamp', 'Date', 'LINE User ID', 'Customer Name', 'Language',
        'Question Text', 'Detected Intent', 'Action Outcome'
      ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
    var now = new Date();
    var ts = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    var dt = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd');
    sheet.appendRow([ts, dt, userId || '', custName || 'LINE User', lang || 'TH', String(question || '').substring(0, 1000), intent || 'GENERAL', actionOutcome || 'LOGGED']);
  } catch (e) {}
}


// ============================================================================
// 28. ENTERPRISE v1051-OMNI-ENTERPRISE BACKEND ENGINE:
//     - Mobile Auto-Stamp & WFH Selfie Attendance Logger (HR_Attendance_Logs)
//     - Leave Request & Schedule Sync (HR_Leave_Requests)
//     - 5 Corporate Forms & Weekly Cut-Off Payout Batch (HR_Expense_Workflows)
// ============================================================================

function logHrAttendanceToSheet_(ss, data) {
  var sheet = ss.getSheetByName('HR_Attendance_Logs');
  if (!sheet) {
    sheet = ss.insertSheet('HR_Attendance_Logs');
    sheet.getRange(1, 1, 1, 9).setValues([[
      'Attendance ID', 'Date', 'Staff Name', 'Department', 'Work Mode',
      'Clock In', 'Clock Out', 'OT Hours', 'GPS / WFH Selfie Verified'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    data.id || ('ATT-' + Date.now()),
    data.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    data.staffName || '',
    data.dept || '',
    data.workMode || 'OFFICE_AUTO_STAMP',
    data.clockIn || '',
    data.clockOut || '',
    Number(data.otHours || 0),
    data.gps || 'Verified'
  ]);
}

function logHrExpenseWorkflowToSheet_(ss, data) {
  var sheet = ss.getSheetByName('HR_Expense_Workflows');
  if (!sheet) {
    sheet = ss.insertSheet('HR_Expense_Workflows');
    sheet.getRange(1, 1, 1, 10).setValues([[
      'Doc ID', 'Form Type', 'Date', 'Applicant', 'Department',
      'Subject', 'Amount (THB)', 'Cash Advance (THB)', 'Weekly Payout Cycle', 'Approval Status'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    data.id || ('EXP-' + Date.now()),
    data.formType || 'EXPENSE_CLAIM',
    data.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    data.applicant || '',
    data.dept || '',
    data.subject || '',
    Number(data.amount || 0),
    Number(data.cashAdvance || 0),
    data.payoutCycle || 'Thu/Fri Weekly Batch',
    data.status || 'PENDING'
  ]);
}


// ============================================================================
// 29. ENTERPRISE v1051-OMNI-ENTERPRISE BACKEND ENGINE:
//     - 3PL Warehouse Gate-Pass, Driver/Courier & QR e-POD (Logistics_3PL_Dispatches)
//     - Inventory Aging >6M & Grade A/B/C/L Outlet (Inventory_Aging_Grades)
//     - AI Social Ad Campaigns & Email Stock-on-Hand Auto-Importer
// ============================================================================

function log3plDispatchToSheet_(ss, data) {
  var sheet = ss.getSheetByName('Logistics_3PL_Dispatches');
  if (!sheet) {
    sheet = ss.insertSheet('Logistics_3PL_Dispatches');
    sheet.getRange(1, 1, 1, 8).setValues([[
      'DO / Gate-Pass ID', 'Date', 'Channel (Driver/Lalamove/Grab/3PL)',
      'Origin', 'Destination', 'Items Summary', 'Cost (THB)', 'e-POD Status'
    ]]).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    data.id || ('DO-' + Date.now()),
    data.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    data.channel || '',
    data.origin || '',
    data.destination || '',
    data.itemSummary || '',
    Number(data.costThb || 0),
    data.status || 'DISPATCHED'
  ]);
}


// ============================================================================
// SECTION 30: ENTERPRISE LIFECYCLE SUITE BACKEND (v1051-OMNI-ENTERPRISE)
// 1) Water Quality & 4HC-H Filter CRM (`Water_Filter_4HCH_CRM`)
// 2) Loaner Fleet & Calibrated Tool Tracking (`Loaner_And_Calibrated_Tools`)
// 3) Special Discount & Goodwill Approvals (`Special_Discount_Approvals`)
// ============================================================================
function handleEnterpriseLifecycleSuitePost_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = String(data.actionType || '');
  if (action === 'UPSERT_WATER_FILTER_CRM') {
    var sh = ss.getSheetByName('Water_Filter_4HCH_CRM') || ss.insertSheet('Water_Filter_4HCH_CRM');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Record_ID', 'Serial_No', 'Model', 'Customer', 'TDS_ppm', 'Water_Bar', 'Filter_Model', 'Installed_Date', 'Next_Due_Date', 'Status']);
    }
    var r = data.record || {};
    sh.appendRow([r.id || '', r.serial || '', r.model || '', r.customer || '', r.tdsPpm || '', r.waterBar || '', r.filterModel || '', r.installedDate || '', r.nextDueDate || '', r.status || '']);
    return { status: 'ok', sheet: 'Water_Filter_4HCH_CRM' };
  }
  if (action === 'UPDATE_TOOL_LOANER_ASSET') {
    var sh2 = ss.getSheetByName('Loaner_And_Calibrated_Tools') || ss.insertSheet('Loaner_And_Calibrated_Tools');
    if (sh2.getLastRow() === 0) {
      sh2.appendRow(['Updated_At', 'Asset_ID', 'Category', 'Asset_Name', 'Current_Holder', 'Job_Ref', 'Cal_Due_Date', 'Status']);
    }
    var a = data.asset || {};
    sh2.appendRow([new Date(), a.assetId || '', a.category || '', a.name || '', a.holder || '', a.jobRef || '', a.calDueDate || '', a.status || '']);
    return { status: 'ok', sheet: 'Loaner_And_Calibrated_Tools' };
  }
  if (action === 'SUBMIT_DISCOUNT_APPROVAL' || action === 'DECIDE_DISCOUNT_APPROVAL') {
    var sh3 = ss.getSheetByName('Special_Discount_Approvals') || ss.insertSheet('Special_Discount_Approvals');
    if (sh3.getLastRow() === 0) {
      sh3.appendRow(['Updated_At', 'Request_ID', 'Quote_No', 'Customer', 'Requester', 'List_Total', 'Discount_Pct', 'Net_Total', 'Est_GP_Pct', 'Reason', 'Status', 'Approved_By']);
    }
    var q = data.request || {};
    sh3.appendRow([new Date(), q.reqId || '', q.quoteNo || '', q.customer || '', q.requester || '', q.listTotal || 0, q.discountPct || 0, q.netTotal || 0, q.estGpPct || 0, q.reason || '', q.status || '', q.approvedBy || '']);
    return { status: 'ok', sheet: 'Special_Discount_Approvals' };
  }
  return null;
}


// ============================================================================
// SECTION 31: NEXT-GEN AUTONOMOUS SERVICE & SALE/MARKETING GROWTH SUITE (v1051)
// 1) Ice-as-a-Service & Rental Fleet Contracts (`Rental_IaaS_Contracts`)
// 2) B2B Sales CRM Pipeline (`Sales_CRM_Pipeline`)
// ============================================================================
function handleNextGenAndSaleMarketingPost_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = String(data.actionType || '');
  if (action === 'UPSERT_RENTAL_CONTRACT') {
    var sh = ss.getSheetByName('Rental_IaaS_Contracts') || ss.insertSheet('Rental_IaaS_Contracts');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Contract_ID', 'Customer', 'Model', 'Serial_No', 'Monthly_Fee_THB', 'Deposit_THB', 'Next_Bill_Date', 'End_Date', 'Status']);
    }
    var c = data.contract || {};
    sh.appendRow([c.contractId || '', c.customer || '', c.model || '', c.serial || '', c.monthlyFee || 0, c.deposit || 0, c.nextBillDate || '', c.endDate || '', c.status || 'ACTIVE']);
    return { status: 'ok', sheet: 'Rental_IaaS_Contracts' };
  }
  if (action === 'UPSERT_SALES_CRM_DEAL') {
    var sh2 = ss.getSheetByName('Sales_CRM_Pipeline') || ss.insertSheet('Sales_CRM_Pipeline');
    if (sh2.getLastRow() === 0) {
      sh2.appendRow(['Deal_ID', 'Company', 'Channel', 'Product_Interest', 'Est_Value_THB', 'Stage', 'Owner', 'Win_Prob_Pct']);
    }
    var d = data.deal || {};
    sh2.appendRow([d.dealId || '', d.company || '', d.channel || '', d.productInterest || '', d.estValue || 0, d.stage || '', d.owner || '', d.probPct || 0]);
    return { status: 'ok', sheet: 'Sales_CRM_Pipeline' };
  }
  return null;
}


// ============================================================================
// SECTION 31: ENTERPRISE v1052-OMNI-ENTERPRISE — UNIFIED AI CARDS,
//             UNIT-LEVEL MULTI-DEALER OWNERSHIP & 10-STEP B2B DEALER LOOP
// ============================================================================
function syncV1052UnifiedAiAndB2bLoop_(ss, actionType, payload) {
  var sheetName = 'B2B_10Step_Service_Loop';
  if (actionType === 'UPSERT_UNIT_DEALER_OWNERSHIP') sheetName = 'Unit_Dealer_Ownership';
  if (actionType === 'SAVE_UNIFIED_AI_CARD') sheetName = 'Unified_AI_Cards_Library';

  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.appendRow(['Timestamp', 'ActionType', 'Record_ID', 'JSON_Payload']);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
  }
  var rec = payload.serviceCase || payload.unit || payload.card || payload;
  var recId = rec.caseId || rec.unitId || rec.id || ('V1052-' + Date.now());
  sh.appendRow([new Date(), actionType, recId, JSON.stringify(rec)]);
  return { status: 'ok', sheet: sheetName, recordId: recId };
}


// ============================================================================
// SECTION 32: ENTERPRISE v1053-OMNI-PHASE3 — CROSS-MODULE EVENT BUS LOGGER
// ============================================================================
function logCrossModuleEventBus_(ss, payload) {
  var sh = ss.getSheetByName('Cross_Module_Event_Bus_Log');
  if (!sh) {
    sh = ss.insertSheet('Cross_Module_Event_Bus_Log');
    sh.appendRow(['Timestamp', 'Event_ID', 'Event_Type', 'Chained_Actions', 'Payload_JSON']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
  }
  var ev = payload.event || payload;
  sh.appendRow([
    new Date(),
    ev.eventId || ('EVT-' + Date.now()),
    ev.eventType || 'SYSTEM_EVENT',
    Array.isArray(ev.chainedActions) ? ev.chainedActions.join(' | ') : '',
    JSON.stringify(ev.payload || {})
  ]);
  return { status: 'ok', sheet: 'Cross_Module_Event_Bus_Log' };
}


// ============================================================================
// SECTION 33: ENTERPRISE v1054-OMNI-PHASE3-COMPLETE — LIFECYCLE STAGE & PUSH SYNC
// ============================================================================
function syncJobLifecycleStageAndPush_(ss, payload) {
  var sh = ss.getSheetByName('Job_Lifecycle_Progress');
  if (!sh) {
    sh = ss.insertSheet('Job_Lifecycle_Progress');
    sh.appendRow(['Timestamp', 'Job_No', 'Stage_Num', 'Stage_Label', 'Updated_By']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
  }
  sh.appendRow([
    new Date(),
    payload.jobNo || 'ACTIVE-JOB',
    payload.stage || 1,
    payload.stageLabel || '',
    payload.updatedBy || 'System'
  ]);
  return { status: 'ok', sheet: 'Job_Lifecycle_Progress' };
}
