/**
 * ============================================================================
 * HOSHIZAKI (THAILAND) LIMITED — ENTERPRISE SERVICE MANAGEMENT & DUAL LINE BOT
 * Backend Version: Enterprise v1155-DEEP-SCAN-VERIFIED
 * Complete Production System Includes:
 *   1) Closed-Loop S/N & Dealer Routing (`Serial_Dealer_Master` sheet + S/N Lookup)
 *   2) Stage 1 Customer AI Self-Check Triage with 2-Button Resolution Feedback:
 *      - "✅ ทำตามแล้ว หายปกติครับ" (Closes ticket as FCR_RESOLVED)
 *      - "🆘 ยังไม่หาย / ขอติดต่อช่างหรือตัวแทนจำหน่าย" (Escalates to Hoshizaki Group)
 *   3) Stage 2 Hoshizaki Tech Group Card with Full Customer + S/N + Dealer Details,
 *      Clickable Customer Photo, and 5 Action Buttons:
 *      - "🖼️ เปิดดูรูปภาพจากลูกค้า (ขยายเต็มจอ)" (when photo attached)
 *      - "🤝 แชร์ข้อมูลติดต่อดีลเลอร์ให้ลูกค้าคุยโดยตรง" (sends Dealer Contact Card to customer)
 *      - "📨 ส่งเคสเข้ากลุ่มดีลเลอร์ (พร้อมปุ่มกดรับเรื่อง)" (dispatches to Dealer LINE Group)
 *      - "✅ กดรับเรื่องทันที (ทีม HOSHIZAKI ดูแลเอง)"
 *      - "✍️ พิมพ์ตอบกลับลูกค้าเอง" (opens mobile keyboard with `REPLY TK-xxxx `)
 *   4) Stage 3 Dealer Group Card with 1-Tap Acknowledge Loop:
 *      - "✅ ดีลเลอร์รับเรื่องดูแลแล้ว (แจ้งกลับ HOSHIZAKI & ลูกค้า)" -> updates status to
 *        `DEALER_ACCEPTED`, notifies Hoshizaki Tech Group & notifies Customer automatically!
 *      - "🆘 ขอซัพพอร์ต/ส่งต่อช่าง HOSHIZAKI (Sub-Service)" -> escalates back to Hoshizaki
 *   5) 2-Hour SLA Watchdog (`checkDealerSlaWatchdog`) + Nightly Drive Indexer (`rebuildDrivePdfIndexSheet`)
 *
 * Prepared By: นพรินทร์ หอมหวล (Noparin Homhoul) — Deputy Service Manager
 * ============================================================================
 */

// ============================================================================
// SECTION 1: GOOGLE DRIVE FOLDER IDS & SYSTEM CONSTANTS
// ============================================================================
var SPEC_SHEET_FOLDER_ID = '1J-8iMryohfrHaD9gc_iiIRtZrqMECVPV'; // [1] Spec Sheet (includes Dimension Drawings)
var MANUAL_PDF_FOLDER_IDS = [
  '1HVU-f-05Ts8ipWxwXdsXoI20TossTeL4', // [2] Service Manual
  '1gxzMZ4l5wjXKoRTM0TRIH_l505y8AVsj', // [3] Instruction Manual
  '16FbLyB9eredvW8RH-dmk_NwhyaCOkiDR'  // [4] Parts List
];

var DEFAULT_PWA_URL = 'https://serviceshth.github.io/hoshizaki-service/';
var DEFAULT_TECH_GROUP_ID = 'C0a03d14ed8b4b41549e927402b875fd5';
var GEMINI_MODEL_NAME = 'gemini-2.5-flash';
var CUSTOMER_PHOTO_FOLDER_NAME = 'HOSHIZAKI_LINE_Customer_Photos';

function getAppSecrets_() {
  var props = PropertiesService.getScriptProperties();
  var fallbackToken = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  var customerToken = props.getProperty('CUSTOMER_LINE_CHANNEL_ACCESS_TOKEN') || fallbackToken;
  var internalToken = props.getProperty('INTERNAL_LINE_CHANNEL_ACCESS_TOKEN') || fallbackToken;
  var rawPwaUrl = props.getProperty('PWA_WEB_APP_URL') || DEFAULT_PWA_URL;
  if (rawPwaUrl.indexOf('https://www.google.com/url?') === 0) {
    rawPwaUrl = DEFAULT_PWA_URL;
  }
  return {
    customerToken: customerToken,
    internalToken: internalToken,
    fallbackToken: fallbackToken,
    lineGroupId: props.getProperty('LINE_TECH_GROUP_ID') || DEFAULT_TECH_GROUP_ID,
    mgmtGroupId: props.getProperty('LINE_MGMT_GROUP_ID') || props.getProperty('LINE_TECH_GROUP_ID') || DEFAULT_TECH_GROUP_ID,
    pwaUrl: rawPwaUrl,
    geminiApiKey: String(props.getProperty('GEMINI_API_KEY') || '').trim(),
    autoNotifyNewJob: (props.getProperty('LINE_AUTO_NOTIFY_NEW_JOB') || 'true') === 'true'
  };
}

function isLineGroupConfigured() {
  var s = getAppSecrets_();
  return Boolean(s.lineGroupId && s.lineGroupId.indexOf('C') === 0);
}

function isLineTokenConfigured() {
  var s = getAppSecrets_();
  return Boolean(s.internalToken || s.customerToken || s.fallbackToken);
}

function isGeminiConfigured_() {
  var s = getAppSecrets_();
  return Boolean(s.geminiApiKey && s.geminiApiKey.length > 10);
}

// ============================================================================
// SECTION 2: ONE-CLICK AUTOMATION & MASTER SHEET INITIALIZER (RUN ONCE)
// ============================================================================
function installNightlyDriveIndexTrigger() {
  var fnName = 'rebuildDrivePdfIndexSheet';
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === fnName) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  ScriptApp.newTrigger(fnName)
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .inTimezone('Asia/Bangkok')
    .create();

  return { status: 'OK', functionName: fnName, schedule: 'Daily at 02:00 AM (Asia/Bangkok)', replacedCount: removed };
}

function installDealerSlaWatchdogTrigger() {
  var fnName = 'checkDealerSlaWatchdog';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === fnName) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger(fnName)
    .timeBased()
    .everyMinutes(30)
    .create();
  return { status: 'OK', functionName: fnName, schedule: 'Every 30 minutes' };
}

/**
 * สร้างชีตฐานข้อมูลเครื่อง-ดีลเลอร์-ลูกค้า (`Serial_Dealer_Master`) พร้อมข้อมูลตัวอย่าง
 * เพื่อให้ระบบค้นหา S/N และจับคู่ดีลเลอร์ได้ทันที
 */
function ensureSerialDealerMasterSheet_(ss) {
  var sheet = ss.getSheetByName('Serial_Dealer_Master');
  if (!sheet) {
    sheet = ss.insertSheet('Serial_Dealer_Master');
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 11)
      .setValues([[
        'Serial Number', 'Model', 'Customer / Store Name', 'Customer Phone', 'Province / Area',
        'Warranty Status', 'Dealer Name', 'Dealer Contact Person', 'Dealer Phone', 'Dealer LINE Group ID', 'Notes'
      ]])
      .setFontWeight('bold')
      .setBackground('#002B49')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    // Sample master rows (editable directly in Google Sheets)
    sheet.getRange(2, 1, 3, 11).setValues([
      ['K01234J', 'IM-130NE', 'ร้านกาแฟตัวอย่าง สาขาภูเก็ต', '0819793085', 'ภูเก็ต', 'IN-WARRANTY (หมด 2027-12-31)', 'บริษัท อันดามัน คูลลิ่ง จำกัด (Dealer A)', 'คุณสมชาย (ฝ่ายบริการ)', '0891112233', DEFAULT_TECH_GROUP_ID, 'ติดตั้งโดย Dealer A'],
      ['L05678M', 'KM-160B', 'โรงแรมตัวอย่าง กรุงเทพฯ', '0890001122', 'กรุงเทพฯ', 'IN-WARRANTY (หมด 2027-08-15)', 'บริษัท สยามไอซ์เทค จำกัด (Dealer B)', 'คุณวิชัย (หัวหน้าช่าง)', '0812223344', DEFAULT_TECH_GROUP_ID, 'ดูแลโดย Dealer B'],
      ['M09876P', 'FM-120KE', 'ร้านอาหารญี่ปุ่น เชียงใหม่', '0865556677', 'เชียงใหม่', 'OUT-OF-WARRANTY', 'HOSHIZAKI Direct Service', 'ศูนย์บริการ HOSHIZAKI', '029730594', DEFAULT_TECH_GROUP_ID, 'ดูแลโดยตรง']
    ]);
  }
  return sheet;
}

/**
 * รันฟังก์ชันนี้ 1 ครั้งเพื่อติดตั้งระบบอัตโนมัติทั้งหมดพร้อมกัน:
 * 1) สร้างชีต Serial_Dealer_Master
 * 2) สร้างดัชนีไฟล์ Google Drive 747 ไฟล์
 * 3) ติดตั้ง Nightly Trigger (02:00 น.) + Dealer 2-Hr SLA Watchdog (ทุก 30 นาที)
 */
function setupAllAutomationAndRebuildIndex() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSerialDealerMasterSheet_(ss);
  var indexRes = rebuildDrivePdfIndexSheet();
  var trigRes = installNightlyDriveIndexTrigger();
  var slaRes = installDealerSlaWatchdogTrigger();
  Logger.log('🎉 v1140 Setup Complete: ' + JSON.stringify({ index: indexRes, trigger: trigRes, sla: slaRes }));
  return { status: 'OK', index: indexRes, trigger: trigRes, slaWatchdog: slaRes };
}

// ============================================================================
// SECTION 3: WEB APP ENTRYPOINTS (`doGet` & `doPost`)
// ============================================================================
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || '').trim();

  if (action === 'specFullScreen') {
    var model = String(params.model || 'IM-130NE').trim().toUpperCase();
    var html = buildFullScreenModelSpecHtmlPage_(model);
    return HtmlService.createHtmlOutput(html)
      .setTitle('HOSHIZAKI Technical Spec & 5-Doc Suite — ' + model)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'viewPhoto') {
    var fileId = String(params.id || '').trim();
    var tk = String(params.tk || '').trim();
    var photoHtml = buildCustomerPhotoViewerHtmlPage_(fileId, tk);
    return HtmlService.createHtmlOutput(photoHtml)
      .setTitle('HOSHIZAKI Customer Photo Inspection — ' + (tk || fileId))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'portal') {
    var ssPortal = SpreadsheetApp.getActiveSpreadsheet();
    var pHtml = buildCustomerDealerSelfServicePortalHtml_(ssPortal, params.type || 'customer', params.q || '');
    return HtmlService.createHtmlOutput(pHtml)
      .setTitle('HOSHIZAKI Customer & Dealer Self-Service Portal')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'trackDoc') {
    var tId = String(params.id || '').trim();
    var tMode = String(params.mode || 'ack').trim().toLowerCase();
    var trackHtml = buildWebDocumentTrackingHtmlPage_(tId, tMode);
    return HtmlService.createHtmlOutput(trackHtml)
      .setTitle('HOSHIZAKI Document Confirmation — ' + tId)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'ping' || action === 'health') {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'OK',
      version: 'Enterprise-v1155-DEEP-SCAN-VERIFIED',
      geminiEnabled: isGeminiConfigured_(),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getCloudSnapshot') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var snap = readPwaCloudSnapshot_(ss);
    return ContentService.createTextOutput(JSON.stringify(snap))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:24px;color:#002B49;">' +
    '<h2>❄️ HOSHIZAKI (THAILAND) Enterprise Backend v1140 (Closed-Loop Dealer Routing)</h2>' +
    '<p>Status: <b>ONLINE &amp; VERIFIED</b> | Gemini AI: <b>' + (isGeminiConfigured_() ? 'ACTIVE' : 'NOT SET') + '</b></p>' +
    '<p><a href="' + DEFAULT_PWA_URL + '" target="_blank">Open HOSHIZAKI Service Management PWA &rarr;</a></p>' +
    '</div>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {}

  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(rawBody);
    var params = (e && e.parameter) ? e.parameter : {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (payload && Array.isArray(payload.events)) {
      var botMode = String(params.bot || '').toLowerCase();
      routeDualLineWebhook_(ss, payload.events, botMode);
      return ContentService.createTextOutput(JSON.stringify({ status: 'OK' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var action = String(payload.action || params.action || '').trim();
    var result = handlePwaApiAction_(ss, action, payload);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (ex) {
    Logger.log('❌ doPost Error: ' + ex.message + '\n' + ex.stack);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ERROR',
      message: ex.message
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ============================================================================
// SECTION 4: DUAL LINE OA WEBHOOK ROUTER (CLOSED-LOOP CUSTOMER <-> HZK <-> DEALER)
// ============================================================================
function routeDualLineWebhook_(ss, events, botMode) {
  var secrets = getAppSecrets_();

  events.forEach(function(ev) {
    var sourceType = (ev.source && ev.source.type) ? ev.source.type : 'user';
    var isGroupOrRoom = (sourceType === 'group' || sourceType === 'room');
    var groupId = (ev.source && (ev.source.groupId || ev.source.roomId)) || '';
    var userId = (ev.source && ev.source.userId) || '';

    var effectiveMode = botMode || (isGroupOrRoom ? 'internal' : 'customer');
    var activeToken = (effectiveMode === 'customer' && !isGroupOrRoom)
      ? secrets.customerToken
      : secrets.internalToken;

    // ------------------------------------------------------------------------
    // A) HANDLE POSTBACK EVENTS (ALL CLOSED-LOOP BUTTONS)
    // ------------------------------------------------------------------------
    if (ev.type === 'postback' && ev.postback && ev.postback.data) {
      var pb = String(ev.postback.data);

      // 0) Document Tracking 1-Tap Postback (Quotation / Service Report / Invoice / Receipt)
      if (pb.indexOf('DOC_TRACK_ACK:') === 0) {
        var ackParts = pb.split(':');
        var ackTrackId = ackParts[1] || '';
        var ackDept = ackParts[2] || '';
        var actor = getLineUserDisplayName_(userId, activeToken);
        var ackRes = updateDocumentTrackingStatus_(ss, ackTrackId, 'ACKNOWLEDGED', 'ลูกค้ากดยืนยันได้รับเอกสารผ่าน LINE', actor);
        replyLineMessageWithToken_(
          ev.replyToken,
          '✅ ขอบพระคุณครับ ระบบบันทึกการยืนยันรับ' + (ackRes.docType || 'เอกสาร') + ' เลขที่ ' + (ackRes.docNo || ackTrackId) + ' จากแผนก ' + (ackRes.department || ackDept) + ' (ผู้ส่ง: ' + (ackRes.senderName || '-') + ') เรียบร้อยแล้วครับ',
          activeToken
        );
        return;
      }

      if (pb.indexOf('MGR_DISCOUNT_APPROVE:') === 0) {
        var mParts = pb.split(':');
        var mResp = handleManagerApprovalDecision_(ss, mParts[1] || '', mParts[2] || '', true, userId);
        replyLineMessageWithToken_(ev.replyToken, mResp, activeToken);
        return;
      }

      if (pb.indexOf('MGR_DISCOUNT_REJECT:') === 0) {
        var rParts = pb.split(':');
        var rResp = handleManagerApprovalDecision_(ss, rParts[1] || '', rParts[2] || '', false, userId);
        replyLineMessageWithToken_(ev.replyToken, rResp, activeToken);
        return;
      }

      if (pb.indexOf('DOC_PO_APPROVE:') === 0) {
        var poParts = pb.split(':');
        var poTrackId = poParts[1] || '';
        var poDept = poParts[2] || '';
        var poActor = getLineUserDisplayName_(userId, activeToken);
        var poRes = updateDocumentTrackingStatus_(ss, poTrackId, 'PO_APPROVED', 'ลูกค้ากดอนุมัติสั่งซื้อ / ยืนยันเอกสารผ่าน LINE', poActor);
        replyLineMessageWithToken_(
          ev.replyToken,
          '🎉 ขอบพระคุณครับ! ระบบบันทึกการอนุมัติสั่งซื้อสำหรับ ' + (poRes.docType || 'เอกสาร') + ' เลขที่ ' + (poRes.docNo || poTrackId) + ' และแจ้งไปยังแผนก ' + (poRes.department || poDept) + ' เรียบร้อยแล้วครับ',
          activeToken
        );
        return;
      }

      if (pb.indexOf('DOC_TRACK_MISSING:') === 0) {
        var missParts = pb.split(':');
        var missTrackId = missParts[1] || '';
        var missDept = missParts[2] || '';
        var missActor = getLineUserDisplayName_(userId, activeToken);
        var missRes = updateDocumentTrackingStatus_(ss, missTrackId, 'MISSING_REPORTED', 'ลูกค้าแจ้งไม่ได้รับเอกสารผ่าน LINE ขอให้ส่งซ้ำ', missActor);
        replyLineMessageWithToken_(
          ev.replyToken,
          '🆘 รับทราบครับ ระบบแจ้งเตือนด่วนไปยังแผนก ' + (missRes.department || missDept) + ' และคุณ ' + (missRes.senderName || 'เจ้าหน้าที่ผู้ดูแล') + ' เรียบร้อยแล้ว เจ้าหน้าที่จะรีบจัดส่งเอกสารเลขที่ ' + (missRes.docNo || missTrackId) + ' ให้อีกครั้งโดยเร็วที่สุดครับ',
          activeToken
        );
        return;
      }

      // 1) Customer Stage 1 Self-Check Feedback: Resolved!
      if (pb.indexOf('SELF_CHECK_RESOLVED:') === 0) {
        var rTkId = pb.split(':')[1] || '';
        updateTicketStatusAndNotes_(ss, rTkId, 'FCR_RESOLVED', 'ลูกค้าแก้ไขเบื้องต้นตามคำแนะนำ AI แล้วหายปกติ');
        replyLineMessageWithToken_(
          ev.replyToken,
          '🎉 ยินดีด้วยครับ! ระบบบันทึกปิดเคส ' + rTkId + ' เรียบร้อยแล้ว หากพบอาการผิดปกติเพิ่มเติมสามารถทักแชทหาเราได้ตลอดเวลาครับ',
          activeToken
        );
        if (isLineGroupConfigured()) {
          pushLineMessagesWithToken_(secrets.lineGroupId, [{
            type: 'text',
            text: '✅ [FCR Resolved] ลูกค้าแจ้งว่าทำตามคำแนะนำ AI เบื้องต้นแล้วเครื่องกลับมาทำงานปกติ (ปิดเคส ' + rTkId + ' อัตโนมัติ)'
          }], secrets.internalToken);
        }
        return;
      }

      // 2) Customer Stage 1 Self-Check Feedback: Still Not Working -> Escalate Now!
      if (pb.indexOf('ESCALATE_TO_TECH:') === 0) {
        var eTkId = pb.split(':')[1] || '';
        updateTicketStatusAndNotes_(ss, eTkId, 'ESCALATED_URGENT', 'ลูกค้าแจ้งว่าทำตามคำแนะนำเบื้องต้นแล้วยังไม่หาย ขอเจ้าหน้าที่ติดต่อกลับ');
        replyLineMessageWithToken_(
          ev.replyToken,
          '🆘 รับทราบครับ ระบบส่งคำขอด่วนสำหรับรหัสอ้างอิง ' + eTkId + ' ให้ทีมวิศวกรบริการ HOSHIZAKI และตัวแทนจำหน่ายที่ดูแลเครื่องของคุณแล้ว เจ้าหน้าที่จะรีบติดต่อกลับโดยเร็วที่สุดครับ',
          activeToken
        );
        if (isLineGroupConfigured()) {
          pushLineMessagesWithToken_(secrets.lineGroupId, [{
            type: 'text',
            text: '🚨 [ลูกค้ากดปุ่ม: ยังไม่หาย / ขอติดต่อช่างด่วน]\n• รหัสเคส: ' + eTkId + '\n• กรุณากดปุ่ม "แชร์ข้อมูลดีลเลอร์ให้ลูกค้า" หรือ "ส่งเคสเข้ากลุ่มดีลเลอร์" บนการ์ดด้านบนได้เลยครับ'
          }], secrets.internalToken);
        }
        return;
      }

      // 3) Hoshizaki Team Button: Share Dealer Contact Card directly to Customer
      if (pb.indexOf('SHARE_DEALER_TO_CUST:') === 0) {
        var sTkId = pb.split(':')[1] || '';
        var shareRes = shareDealerContactCardToCustomer_(ss, sTkId, userId);
        replyLineMessageWithToken_(ev.replyToken, shareRes, activeToken);
        return;
      }

      // 4) Hoshizaki Team Button: Dispatch Case to Dealer LINE Group
      if (pb.indexOf('DISPATCH_DEALER_GRP:') === 0) {
        var dTkId = pb.split(':')[1] || '';
        var dispRes = dispatchTicketToDealerGroup_(ss, dTkId, userId);
        replyLineMessageWithToken_(ev.replyToken, dispRes, activeToken);
        return;
      }

      // 5) Dealer Group Button: Dealer Acknowledges Case -> Tag Back to Hoshizaki & Customer!
      if (pb.indexOf('DEALER_ACK_CASE:') === 0) {
        var ackTkId = pb.split(':')[1] || '';
        var ackRes = handleDealerAcknowledgeTicket_(ss, ackTkId, userId);
        replyLineMessageWithToken_(ev.replyToken, ackRes, activeToken);
        return;
      }

      // 6) Dealer Group Button: Dealer Requests Hoshizaki Sub-Service Support
      if (pb.indexOf('DEALER_REQ_HZK_SUB:') === 0) {
        var subTkId = pb.split(':')[1] || '';
        var subRes = handleDealerRequestHzkSubService_(ss, subTkId, userId);
        replyLineMessageWithToken_(ev.replyToken, subRes, activeToken);
        return;
      }

      // 7) Hoshizaki Tech 1-Tap Quick Reply
      if (pb.indexOf('QUICK_REPLY_TK:') === 0) {
        var parts = pb.split(':');
        var tkId = parts[1] || '';
        var mode = parts[2] || 'ACK';
        var autoMsg = (mode === 'TOMORROW')
          ? 'รับเรื่องเรียบร้อยครับ ทีมช่างจะเข้าตรวจสอบเครื่องให้พรุ่งนี้เวลา 10:00 น. หากมีการเปลี่ยนแปลงจะแจ้งให้ทราบล่วงหน้าครับ'
          : 'รับเรื่องเรียบร้อยครับ ทีมวิศวกรบริการ HOSHIZAKI กำลังตรวจสอบข้อมูลและจะติดต่อกลับโดยเร็วที่สุดครับ';
        var resTxt = replyToCustomerTicketFromTech_(ss, tkId, autoMsg, userId);
        replyLineMessageWithToken_(ev.replyToken, resTxt, activeToken);
        return;
      }

      if (pb.indexOf('OPEN_REPLY_KEYBOARD:') === 0) {
        return;
      }

      if (pb.indexOf('CONFIRM_APPT:') === 0) {
        var jobId = pb.split(':')[1] || '';
        logCustomerPostback_(ss, 'APPT_CONFIRMED', jobId, userId);
        replyLineMessageWithToken_(ev.replyToken, '✅ ขอบคุณครับ ระบบบันทึกการยืนยันเวลานัดหมายสำหรับใบงาน ' + jobId + ' เรียบร้อยแล้วครับ', activeToken);
        return;
      }

      if (pb.indexOf('CSAT_RATE:') === 0) {
        var cParts = pb.split(':');
        var cJobId = cParts[1] || '';
        var score = Number(cParts[2] || 5);
        logCustomerPostback_(ss, 'CSAT_' + score, cJobId, userId);
        replyLineMessageWithToken_(ev.replyToken, '🙏 ขอบพระคุณสำหรับคะแนนประเมิน ' + score + '/5 ดาว สำหรับใบงาน ' + cJobId + ' ครับ', activeToken);
        return;
      }
      return;
    }

    // ------------------------------------------------------------------------
    // B) HANDLE IMAGE MESSAGE EVENTS (GEMINI VISION + S/N DEALER LOOKUP + GALLERY)
    // ------------------------------------------------------------------------
    if (ev.type === 'message' && ev.message && ev.message.type === 'image') {
      if (!isGroupOrRoom && effectiveMode === 'customer') {
        handleCustomerOaImageWithGemini_(ss, ev, ev.message.id, userId, activeToken);
      } else if (isGroupOrRoom) {
        handleTechGroupPhotoNote_(ss, ev, ev.message.id, groupId, userId, activeToken);
      }
      return;
    }

    // ------------------------------------------------------------------------
    // C) HANDLE TEXT MESSAGE EVENTS
    // ------------------------------------------------------------------------
    if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
    var text = String(ev.message.text || '').trim();
    var upper = text.toUpperCase();

    if (upper === 'ID' || upper === 'GROUPID') {
      var idInfo = isGroupOrRoom
        ? ('🆔 Group ID: ' + groupId + '\n👤 Your User ID: ' + userId)
        : ('👤 Your User ID: ' + userId);
      replyLineMessageWithToken_(ev.replyToken, idInfo, activeToken);
      return;
    }

    if (upper === 'SELFTEST') {
      var testSummary = runLineSelfTestSummary_(ss, groupId);
      replyLineMessageWithToken_(ev.replyToken, testSummary, activeToken);
      return;
    }

    var isTechCommand = /^(SPEC|SCAN|MANUAL|REPLY|TICKETS|AI|SN|HISTORY|VAN)\b/i.test(text);
    if (isGroupOrRoom || effectiveMode === 'internal' || isTechCommand) {
      handleInternalTechMessage_(ss, ev, text, groupId, userId, activeToken);
      return;
    }

    handleCustomerOaMessage_(ss, ev, text, userId, activeToken);
  });
}

// ============================================================================
// SECTION 5: SERIAL NUMBER (S/N) & DEALER MASTER LOOKUP ENGINE
// ============================================================================
function lookupSerialAndDealerMaster_(ss, serialNo, customerPhone) {
  var sheet = ensureSerialDealerMasterSheet_(ss);
  var data = sheet.getDataRange().getValues();
  var cleanSn = String(serialNo || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  var cleanPhone = String(customerPhone || '').replace(/[^0-9]/g, '');

  for (var i = 1; i < data.length; i++) {
    var rowSn = String(data[i][0] || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    var rowPhone = String(data[i][3] || '').replace(/[^0-9]/g, '');
    if ((cleanSn && cleanSn !== 'ไม่พบSNในภาพ' && rowSn === cleanSn) || (cleanPhone && cleanPhone.length >= 9 && rowPhone === cleanPhone)) {
      return {
        found: true,
        serialNumber: String(data[i][0] || cleanSn),
        model: String(data[i][1] || ''),
        customerStore: String(data[i][2] || ''),
        customerPhone: String(data[i][3] || ''),
        province: String(data[i][4] || ''),
        warrantyStatus: String(data[i][5] || 'ตรวจสอบสิทธิ์รับประกัน'),
        dealerName: String(data[i][6] || 'HOSHIZAKI Direct Service'),
        dealerContact: String(data[i][7] || 'ฝ่ายบริการลูกค้า'),
        dealerPhone: String(data[i][8] || '029730594'),
        dealerGroupId: String(data[i][9] || DEFAULT_TECH_GROUP_ID).trim(),
        notes: String(data[i][10] || '')
      };
    }
  }

  return {
    found: false,
    serialNumber: cleanSn || 'ไม่ระบุ S/N',
    model: '',
    customerStore: '',
    customerPhone: cleanPhone || '',
    province: 'ไม่ระบุพื้นที่',
    warrantyStatus: '⚠️ S/N ยังไม่ลงทะเบียนในระบบ',
    dealerName: 'ยังไม่ได้ผูกตัวแทนจำหน่าย (รอทีม HOSHIZAKI มอบหมาย)',
    dealerContact: 'ศูนย์บริการ HOSHIZAKI (Thailand)',
    dealerPhone: '029730594',
    dealerGroupId: DEFAULT_TECH_GROUP_ID,
    notes: ''
  };
}

function lookupCustomerPhoneByLineUser_(ss, userId) {
  var sheet = ss.getSheetByName('Customer_Phone_LINE_Map');
  if (!sheet || sheet.getLastRow() < 2) return '';
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1] || '').trim() === userId) {
      return String(data[i][0] || '').replace(/[^0-9]/g, '');
    }
  }
  return '';
}

// ============================================================================
// SECTION 6: GEMINI AI TEXT & VISION NAMEPLATE EXTRACTOR (WITH DEALER ROUTING)
// ============================================================================
function callGeminiLineTextAssistant_(userText, detectedModel, roleContext) {
  var secrets = getAppSecrets_();
  if (!isGeminiConfigured_()) return null;

  var isTech = (roleContext === 'tech');
  var systemPrompt = isTech
    ? 'คุณคือวิศวกรเทคนิคอาวุโสประจำศูนย์บริการ HOSHIZAKI (ประเทศไทย) ตอบคำถามช่างภาคสนามด้วยภาษาไทยที่กระชับ ชัดเจน ระบุค่ามาตรฐาน (แรงดันน้ำยา, อุณหภูมิ, Error Code, อะไหล่ที่เกี่ยวข้อง) เป็นข้อๆ อ่านง่ายบนมือถือ'
    : 'คุณคือผู้ช่วยอัจฉริยะศูนย์บริการลูกค้า HOSHIZAKI (ประเทศไทย) ตอบด้วยภาษาไทยสุภาพ เป็นมืออาชีพ วิเคราะห์อาการเสียเบื้องต้นของเครื่องทำน้ำแข็ง/ตู้แช่ HOSHIZAKI รุ่น ' + (detectedModel || 'ทั่วไป') + ' ให้คำแนะนำการตรวจสอบเบื้องต้นที่ปลอดภัยสำหรับลูกค้า 2-3 ข้อสั้นๆ เพื่อทดลองแก้ไขด้วยตนเองก่อน ห้ามแนะนำให้ลูกค้าแกะฝาครอบไฟฟ้าเองเด็ดขาด ตอบไม่เกิน 450 ตัวอักษร';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL_NAME + ':generateContent?key=' + encodeURIComponent(secrets.geminiApiKey);
  var body = {
    contents: [{
      role: 'user',
      parts: [{ text: systemPrompt + '\n\nคำถาม/อาการที่แจ้ง:\n' + userText }]
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
  };

  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText());
      var candidate = json && json.candidates && json.candidates[0];
      var outText = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
      if (outText) return String(outText).trim();
    }
  } catch (err) {}
  return null;
}

function getOrCreateCustomerPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(CUSTOMER_PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CUSTOMER_PHOTO_FOLDER_NAME);
}

function handleCustomerOaImageWithGemini_(ss, ev, messageId, userId, token) {
  var secrets = getAppSecrets_();
  var detectedModel = 'ไม่ระบุรุ่นในภาพ';
  var detectedSerial = '';
  var plateSpecs = '';
  var aiDiagnosis = 'ลูกค้าส่งรูปภาพหน้างาน/ป้ายเครื่องเข้ามาในระบบ';
  var driveFileId = '';
  var driveViewUrl = '';
  var directThumbUrl = '';

  if (messageId && token) {
    try {
      var imgRes = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content', {
        method: 'get',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });

      if (imgRes.getResponseCode() === 200) {
        var blob = imgRes.getBlob();
        var mimeType = blob.getContentType() || 'image/jpeg';
        var ext = (mimeType.indexOf('png') !== -1) ? '.png' : '.jpg';
        var tsName = 'HZK_LINE_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmmss') + '_' + String(messageId).slice(-5) + ext;
        blob.setName(tsName);

        try {
          var folder = getOrCreateCustomerPhotoFolder_();
          var savedFile = folder.createFile(blob);
          savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          driveFileId = savedFile.getId();
          driveViewUrl = savedFile.getUrl();
          directThumbUrl = 'https://lh3.googleusercontent.com/d/' + driveFileId + '=w1000';
        } catch (driveErr) {}

        if (isGeminiConfigured_()) {
          var base64Data = Utilities.base64Encode(blob.getBytes());
          var prompt =
            'คุณคือผู้เชี่ยวชาญฝ่ายบริการเทคนิค HOSHIZAKI (ประเทศไทย) จงอ่านและวิเคราะห์รูปภาพนี้อย่างละเอียด:\n' +
            '- หากเป็นป้าย Nameplate / สติกเกอร์ข้อมูลเครื่อง HOSHIZAKI ให้อ่านค่า Model, Serial Number (S/N), แรงดันไฟ/สารทำความเย็น บนป้ายให้แม่นยำที่สุด\n' +
            '- หากเป็นภาพตัวเครื่อง / หน้าจอไฟกะพริบ / ก้อนน้ำแข็ง / จุดรั่วซึม ให้ระบุอาการที่เห็นและคำแนะนำเบื้องต้นสำหรับลูกค้า 2 ข้อ\n\n' +
            'ตอบกลับตามรูปแบบ 4 บรรทัดนี้เท่านั้น (ห้ามใส่เครื่องหมาย ** หรือ Markdown):\n' +
            'MODEL: <ชื่อรุ่นเครื่องที่อ่านได้ เช่น IM-130NE หรือ UNKNOWN>\n' +
            'SERIAL: <หมายเลข Serial Number ที่อ่านได้ เช่น K01234J หรือ UNKNOWN>\n' +
            'SPEC_INFO: <ข้อมูลเพิ่มเติมบนป้าย เช่น 220-240V 50Hz R404A หรือ ไม่มี>\n' +
            'DIAGNOSIS: <สรุปผลการตรวจสอบภาพและคำแนะนำเบื้องต้นเป็นภาษาไทยกระชับ 2-3 บรรทัด>';

          var gemUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL_NAME + ':generateContent?key=' + encodeURIComponent(secrets.geminiApiKey);
          var gemPayload = {
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mimeType, data: base64Data } }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
          };

          var gRes = UrlFetchApp.fetch(gemUrl, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(gemPayload),
            muteHttpExceptions: true
          });

          if (gRes.getResponseCode() === 200) {
            var gJson = JSON.parse(gRes.getContentText());
            var rawAi = gJson && gJson.candidates && gJson.candidates[0] && gJson.candidates[0].content && gJson.candidates[0].content.parts && gJson.candidates[0].content.parts[0] && gJson.candidates[0].content.parts[0].text;
            if (rawAi) {
              var mMatch = rawAi.match(/MODEL:\s*([^\n\r]+)/i);
              var sMatch = rawAi.match(/SERIAL:\s*([^\n\r]+)/i);
              var spMatch = rawAi.match(/SPEC_INFO:\s*([^\n\r]+)/i);
              var dMatch = rawAi.match(/DIAGNOSIS:\s*([\s\S]+)/i);

              if (mMatch && mMatch[1] && mMatch[1].trim().toUpperCase() !== 'UNKNOWN') {
                detectedModel = mMatch[1].trim().toUpperCase();
              }
              if (sMatch && sMatch[1] && sMatch[1].trim().toUpperCase() !== 'UNKNOWN') {
                detectedSerial = sMatch[1].trim().toUpperCase();
              }
              if (spMatch && spMatch[1] && spMatch[1].trim() !== 'ไม่มี') {
                plateSpecs = spMatch[1].trim();
              }
              aiDiagnosis = (dMatch && dMatch[1]) ? dMatch[1].trim() : rawAi.trim();
            }
          }
        }
      }
    } catch (e) {}
  }

  // Lookup Serial & Dealer Master automatically using S/N or registered phone
  var regPhone = lookupCustomerPhoneByLineUser_(ss, userId);
  var masterInfo = lookupSerialAndDealerMaster_(ss, detectedSerial, regPhone);
  if (detectedModel === 'ไม่ระบุรุ่นในภาพ' && masterInfo.model) {
    detectedModel = masterInfo.model;
  }
  var displaySerial = detectedSerial || (masterInfo.found ? masterInfo.serialNumber : 'ไม่พบ S/N ในภาพ');

  var scriptUrl = ScriptApp.getService().getUrl();
  var viewerUrl = driveFileId
    ? (scriptUrl + '?action=viewPhoto&id=' + encodeURIComponent(driveFileId))
    : (driveViewUrl || secrets.pwaUrl);

  var structuredSummary =
    '❄️ รุ่นเครื่อง: ' + detectedModel + ' | S/N: ' + displaySerial + '\n' +
    (plateSpecs ? ('⚡ สเปกป้าย: ' + plateSpecs + '\n') : '') +
    '📋 ผลวิเคราะห์ AI: ' + aiDiagnosis;

  // Create Ticket & Send Complete Closed-Loop Card to Hoshizaki Group
  var ticketInfo = createClosedLoopServiceTicket_(ss, userId, structuredSummary, detectedModel, displaySerial, masterInfo, {
    photoFileId: driveFileId,
    photoViewerUrl: viewerUrl,
    photoDirectUrl: directThumbUrl,
    driveViewUrl: driveViewUrl
  });

  // Reply Customer with Stage 1 Self-Check Card + 2 Resolution Buttons
  var customerBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '📸 ผลการสแกนข้อมูลจากรูปภาพ (AI)', weight: 'bold', size: 'sm', color: '#002B49', wrap: true },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F0F9FF',
          cornerRadius: '8px',
          paddingAll: '10px',
          spacing: 'xs',
          contents: [
            { type: 'text', text: '❄️ รุ่นเครื่อง: ' + detectedModel, weight: 'bold', size: 'xs', color: '#0369A1', wrap: true },
            { type: 'text', text: '🔢 Serial No.: ' + displaySerial, weight: 'bold', size: 'xs', color: '#0F172A', wrap: true },
            { type: 'text', text: '🏢 ตัวแทนดูแล: ' + masterInfo.dealerName, size: 'xxs', color: '#475569', wrap: true }
          ]
        },
        { type: 'text', text: '💡 คำแนะนำเบื้องต้นให้ทดลองแก้ไข:\n' + aiDiagnosis.substring(0, 550), size: 'xs', color: '#334155', wrap: true },
        { type: 'text', text: '📌 รหัสอ้างอิง: ' + ticketInfo.ticketId, weight: 'bold', size: 'xs', color: '#B91C1C', margin: 'xs', wrap: true }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#059669',
          height: 'sm',
          action: {
            type: 'postback',
            label: '✅ ทำตามแล้ว หายปกติครับ',
            data: 'SELF_CHECK_RESOLVED:' + ticketInfo.ticketId,
            displayText: 'ทำตามคำแนะนำเบื้องต้นแล้ว เครื่องหายปกติครับ'
          }
        },
        {
          type: 'button',
          style: 'primary',
          color: '#DC2626',
          height: 'sm',
          action: {
            type: 'postback',
            label: '🆘 ยังไม่หาย / ขอติดต่อช่างหรือดีลเลอร์',
            data: 'ESCALATE_TO_TECH:' + ticketInfo.ticketId,
            displayText: 'ยังไม่หายครับ ขอให้ช่างหรือตัวแทนจำหน่ายติดต่อกลับ'
          }
        },
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: { type: 'uri', label: '🖼️ เปิดดูรูปภาพที่ส่งมา', uri: viewerUrl }
        }
      ]
    }
  };

  if (directThumbUrl) {
    customerBubble.hero = {
      type: 'image',
      url: directThumbUrl,
      size: 'full',
      aspectRatio: '16:9',
      aspectMode: 'cover',
      action: { type: 'uri', label: 'ดูรูปภาพเต็มจอ', uri: viewerUrl }
    };
  }

  replyLineFlexWithToken_(ev.replyToken, [{
    type: 'flex',
    altText: '📸 สแกนรูปภาพสำเร็จ: ' + detectedModel + ' | S/N: ' + displaySerial + ' (' + ticketInfo.ticketId + ')',
    contents: customerBubble
  }], token);
}

// ============================================================================
// SECTION 7: CLOSED-LOOP TICKET ENGINE (HOSHIZAKI <-> CUSTOMER <-> DEALER)
// ============================================================================
function createClosedLoopServiceTicket_(ss, userId, summaryText, detectedModel, serialNo, masterInfo, photoMeta) {
  var secrets = getAppSecrets_();
  var meta = photoMeta || {};
  var sheet = ss.getSheetByName('LINE_Tech_Support_Tickets') || ss.insertSheet('LINE_Tech_Support_Tickets');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 14)
      .setValues([[
        'Ticket ID', 'Created At', 'LINE User ID', 'Customer Name', 'Model', 'Serial No',
        'Customer Message', 'Status', 'Dealer Name', 'Dealer Phone', 'Dealer Group ID',
        'Tech / Dealer Reply', 'Updated At', 'Photo URL'
      ]])
      .setFontWeight('bold')
      .setBackground('#002B49')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var ticketId = 'TK-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
  var lineDisplayName = getLineUserDisplayName_(userId, secrets.customerToken);
  var customerDisplay = masterInfo.found
    ? (masterInfo.customerStore + ' (' + lineDisplayName + ')')
    : lineDisplayName;
  var customerPhone = masterInfo.customerPhone || lookupCustomerPhoneByLineUser_(ss, userId) || 'ไม่ระบุเบอร์';
  var photoLink = meta.driveViewUrl || meta.photoViewerUrl || '';

  sheet.appendRow([
    ticketId, nowStr, userId || '', customerDisplay, detectedModel || 'GENERAL', serialNo || '',
    summaryText, 'OPEN_TRIAGE', masterInfo.dealerName, masterInfo.dealerPhone, masterInfo.dealerGroupId,
    '', nowStr, photoLink
  ]);

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    var footerButtons = [];

    if (meta.photoViewerUrl || meta.driveViewUrl) {
      footerButtons.push({
        type: 'button',
        style: 'primary',
        color: '#4F46E5',
        height: 'sm',
        action: {
          type: 'uri',
          label: '🖼️ เปิดดูรูปภาพจากลูกค้า (ขยายเต็มจอ)',
          uri: meta.photoViewerUrl || meta.driveViewUrl
        }
      });
    }

    // Button to share Dealer contact directly to Customer
    footerButtons.push({
      type: 'button',
      style: 'primary',
      color: '#D97706',
      height: 'sm',
      action: {
        type: 'postback',
        label: '🤝 แชร์ข้อมูลติดต่อดีลเลอร์ให้ลูกค้าคุยโดยตรง',
        data: 'SHARE_DEALER_TO_CUST:' + ticketId,
        displayText: 'แชร์ข้อมูลติดต่อดีลเลอร์ให้ลูกค้าเคส ' + ticketId
      }
    });

    // Button to dispatch ticket directly to Dealer Group (with 1-Tap Acknowledge loop)
    footerButtons.push({
      type: 'button',
      style: 'primary',
      color: '#0284C7',
      height: 'sm',
      action: {
        type: 'postback',
        label: '📨 ส่งเคสเข้ากลุ่มดีลเลอร์ (รอแท็กตอบรับ)',
        data: 'DISPATCH_DEALER_GRP:' + ticketId,
        displayText: 'ส่งเคส ' + ticketId + ' เข้ากลุ่มดีลเลอร์แล้ว'
      }
    });

    footerButtons.push({
      type: 'button',
      style: 'primary',
      color: '#059669',
      height: 'sm',
      action: {
        type: 'postback',
        label: '✅ ทีม HOSHIZAKI รับเรื่องดูแลเองทันที',
        data: 'QUICK_REPLY_TK:' + ticketId + ':ACK',
        displayText: 'ทีม HOSHIZAKI รับเรื่องเคส ' + ticketId + ' แล้ว'
      }
    });

    footerButtons.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'postback',
        label: '✍️ พิมพ์ตอบกลับลูกค้าเอง',
        data: 'OPEN_REPLY_KEYBOARD:' + ticketId,
        inputOption: 'openKeyboard',
        fillInText: 'REPLY ' + ticketId + ' '
      }
    });

    var bubbleObj = {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#B91C1C',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '🆘 CLOSED-LOOP SERVICE TICKET', color: '#FECACA', size: 'xxs', weight: 'bold' },
          { type: 'text', text: ticketId + ' — ' + customerDisplay, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            cornerRadius: '8px',
            paddingAll: '10px',
            spacing: 'xs',
            contents: [
              { type: 'text', text: '❄️ รุ่น / S/N: ' + (detectedModel || '-') + ' | ' + (serialNo || '-'), weight: 'bold', size: 'xs', color: '#0369A1', wrap: true },
              { type: 'text', text: '👤 ลูกค้า/โทร: ' + customerDisplay + ' (' + customerPhone + ')', size: 'xs', color: '#0F172A', wrap: true },
              { type: 'text', text: '🛡️ ประกัน: ' + masterInfo.warrantyStatus, size: 'xs', color: '#047857', wrap: true },
              { type: 'text', text: '🏢 ดีลเลอร์ดูแล: ' + masterInfo.dealerName + ' (' + masterInfo.dealerContact + ' โทร ' + masterInfo.dealerPhone + ')', weight: 'bold', size: 'xs', color: '#B45309', wrap: true }
            ]
          },
          { type: 'text', text: '💬 อาการ & ผลวิเคราะห์เบื้องต้น:\n' + String(summaryText).substring(0, 600), size: 'xs', color: '#1E293B', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '12px',
        contents: footerButtons
      }
    };

    if (meta.photoDirectUrl) {
      bubbleObj.hero = {
        type: 'image',
        url: meta.photoDirectUrl,
        size: 'full',
        aspectRatio: '16:9',
        aspectMode: 'cover',
        action: { type: 'uri', label: 'เปิดดูรูปภาพต้นฉบับ', uri: meta.photoViewerUrl || meta.driveViewUrl }
      };
    }

    var outboundMsgs = [];
    if (meta.photoDirectUrl) {
      outboundMsgs.push({
        type: 'image',
        originalContentUrl: meta.photoDirectUrl,
        previewImageUrl: meta.photoDirectUrl
      });
    }
    outboundMsgs.push({
      type: 'flex',
      altText: '🆘 เคสบริการ [' + ticketId + '] ' + (detectedModel || '') + ' — ดีลเลอร์: ' + masterInfo.dealerName,
      contents: bubbleObj
    });

    pushLineMessagesWithToken_(secrets.lineGroupId, outboundMsgs, secrets.internalToken);
  }

  return { ticketId: ticketId, customerName: customerDisplay };
}

// ============================================================================
// SECTION 8: DEALER ROUTING ACTIONS (SHARE CONTACT, DISPATCH & ACKNOWLEDGE LOOP)
// ============================================================================
function findTicketRowById_(ss, ticketId) {
  var sheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  if (!sheet || sheet.getLastRow() < 2) return null;
  var cleanId = String(ticketId || '').trim().toUpperCase();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || '').trim().toUpperCase() === cleanId) {
      return { sheet: sheet, rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

function updateTicketStatusAndNotes_(ss, ticketId, newStatus, noteText) {
  var found = findTicketRowById_(ss, ticketId);
  if (!found) return;
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  found.sheet.getRange(found.rowIndex, 8).setValue(newStatus);
  found.sheet.getRange(found.rowIndex, 12).setValue(noteText);
  found.sheet.getRange(found.rowIndex, 13).setValue(nowStr);
}

/**
 * 1) แชร์ข้อมูลติดต่อตัวแทนจำหน่าย (Dealer Contact Card) ส่งให้ลูกค้าคุยโดยตรง
 */
function shareDealerContactCardToCustomer_(ss, ticketId, staffUserId) {
  var secrets = getAppSecrets_();
  var found = findTicketRowById_(ss, ticketId);
  if (!found) return '❌ ไม่พบรหัสเคส ' + ticketId + ' ในระบบครับ';

  var r = found.row;
  var customerUserId = String(r[2] || '').trim();
  var customerName = String(r[3] || 'ลูกค้า').trim();
  var model = String(r[4] || '-').trim();
  var serialNo = String(r[5] || '-').trim();
  var dealerName = String(r[8] || 'ตัวแทนจำหน่าย HOSHIZAKI').trim();
  var dealerPhone = String(r[9] || '029730594').trim();
  var cleanTel = dealerPhone.replace(/[^0-9+]/g, '');
  var staffName = getLineUserDisplayName_(staffUserId, secrets.internalToken);

  updateTicketStatusAndNotes_(ss, ticketId, 'DEALER_CONTACT_SHARED', 'แชร์ข้อมูลติดต่อ ' + dealerName + ' ให้ลูกค้าโดย ' + staffName);

  if (customerUserId) {
    var dealerCard = {
      type: 'flex',
      altText: '🤝 ข้อมูลติดต่อตัวแทนจำหน่ายดูแลเครื่องของคุณ (' + dealerName + ')',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#002B49',
          paddingAll: '14px',
          contents: [
            { type: 'text', text: '🤝 ข้อมูลติดต่อตัวแทนจำหน่าย (AUTHORIZED DEALER)', color: '#FBBF24', size: 'xxs', weight: 'bold' },
            { type: 'text', text: dealerName, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '14px',
          contents: [
            { type: 'text', text: '📌 อ้างอิงเคส: ' + ticketId, weight: 'bold', size: 'xs', color: '#B91C1C' },
            { type: 'text', text: '❄️ รุ่น / S/N: ' + model + ' (' + serialNo + ')', size: 'xs', color: '#0369A1', wrap: true },
            { type: 'text', text: '📞 เบอร์โทรติดต่อโดยตรง: ' + dealerPhone, weight: 'bold', size: 'sm', color: '#0F172A', wrap: true },
            { type: 'text', text: 'คุณลูกค้าสามารถกดปุ่มโทรออกด้านล่างเพื่อประสานงานนัดหมายกับตัวแทนจำหน่ายได้โดยตรง หรือแจ้งให้เราประสานงานเพิ่มเติมได้ตลอดเวลาครับ', size: 'xs', color: '#475569', wrap: true }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#059669',
              height: 'sm',
              action: { type: 'uri', label: '📞 โทรติดต่อตัวแทนจำหน่าย (' + dealerPhone + ')', uri: 'tel:' + cleanTel }
            }
          ]
        }
      }
    };
    pushLineMessagesWithToken_(customerUserId, [dealerCard], secrets.customerToken);
  }

  return '✅ ส่งการ์ดข้อมูลติดต่อ "' + dealerName + '" (โทร ' + dealerPhone + ') ให้คุณ "' + customerName + '" เรียบร้อยแล้วครับ';
}

/**
 * 2) ส่งเคสเข้ากลุ่มตัวแทนจำหน่าย (Dealer Group) พร้อมปุ่มกดรับเรื่อง (Acknowledge Loop)
 */
function dispatchTicketToDealerGroup_(ss, ticketId, staffUserId) {
  var secrets = getAppSecrets_();
  var found = findTicketRowById_(ss, ticketId);
  if (!found) return '❌ ไม่พบรหัสเคส ' + ticketId + ' ในระบบครับ';

  var r = found.row;
  var customerName = String(r[3] || 'ลูกค้า').trim();
  var model = String(r[4] || '-').trim();
  var serialNo = String(r[5] || '-').trim();
  var symptom = String(r[6] || '-').trim();
  var dealerName = String(r[8] || 'ตัวแทนจำหน่าย').trim();
  var targetDealerGroupId = String(r[10] || secrets.lineGroupId).trim();
  var photoUrl = String(r[13] || '').trim();
  var staffName = getLineUserDisplayName_(staffUserId, secrets.internalToken);

  updateTicketStatusAndNotes_(ss, ticketId, 'DISPATCHED_TO_DEALER', 'ส่งเรื่องเข้ากลุ่ม ' + dealerName + ' โดย ' + staffName);

  var dealerButtons = [
    {
      type: 'button',
      style: 'primary',
      color: '#059669',
      height: 'sm',
      action: {
        type: 'postback',
        label: '✅ ดีลเลอร์รับเรื่องดูแลแล้ว (แจ้งกลับ HOSHIZAKI)',
        data: 'DEALER_ACK_CASE:' + ticketId,
        displayText: 'ดีลเลอร์รับเรื่องเคส ' + ticketId + ' เรียบร้อยแล้ว'
      }
    },
    {
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'postback',
        label: '🆘 ขอซัพพอร์ต/ส่งต่อช่าง HOSHIZAKI (Sub-Service)',
        data: 'DEALER_REQ_HZK_SUB:' + ticketId,
        displayText: 'ขอซัพพอร์ต/ส่งต่อช่าง HOSHIZAKI สำหรับเคส ' + ticketId
      }
    }
  ];

  if (photoUrl) {
    dealerButtons.unshift({
      type: 'button',
      style: 'primary',
      color: '#4F46E5',
      height: 'sm',
      action: { type: 'uri', label: '🖼️ เปิดดูรูปภาพหน้างานจากลูกค้า', uri: photoUrl }
    });
  }

  var dealerDispatchCard = {
    type: 'flex',
    altText: '📢 [HOSHIZAKI DISPATCH] มอบหมายงานบริการเคส ' + ticketId + ' ถึง ' + dealerName,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#002B49',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '📢 HOSHIZAKI SERVICE DISPATCH TO DEALER', color: '#FBBF24', size: 'xxs', weight: 'bold' },
          { type: 'text', text: ticketId + ' — ถึง: ' + dealerName, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '👤 ลูกค้า: ' + customerName, weight: 'bold', size: 'xs', color: '#0F172A', wrap: true },
          { type: 'text', text: '❄️ รุ่น / S/N: ' + model + ' | ' + serialNo, weight: 'bold', size: 'xs', color: '#0369A1', wrap: true },
          { type: 'text', text: '💬 รายละเอียดอาการ:\n' + symptom.substring(0, 600), size: 'xs', color: '#334155', wrap: true },
          { type: 'text', text: '⏱️ กรุณากดปุ่ม "ดีลเลอร์รับเรื่องดูแลแล้ว" ด้านล่างเพื่อยืนยันรับงาน (SLA 2 ชม.)', size: 'xxs', color: '#B45309', margin: 'sm', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '12px',
        contents: dealerButtons
      }
    }
  };

  pushLineMessagesWithToken_(targetDealerGroupId, [dealerDispatchCard], secrets.internalToken);
  return '📨 ส่งการ์ดมอบหมายเคส ' + ticketId + ' ไปยังกลุ่มของ "' + dealerName + '" เรียบร้อยแล้วครับ (รอดีลเลอร์กดปุ่มตอบรับ)';
}

/**
 * 3) เมื่อดีลเลอร์กดปุ่ม "ดีลเลอร์รับเรื่องดูแลแล้ว" -> แท็กกลับมาแจ้งกลุ่ม HOSHIZAKI และแจ้งลูกค้าทันที!
 */
function handleDealerAcknowledgeTicket_(ss, ticketId, dealerUserId) {
  var secrets = getAppSecrets_();
  var found = findTicketRowById_(ss, ticketId);
  if (!found) return '❌ ไม่พบรหัสเคส ' + ticketId + ' ในระบบครับ';

  var r = found.row;
  var customerUserId = String(r[2] || '').trim();
  var customerName = String(r[3] || 'ลูกค้า').trim();
  var model = String(r[4] || '-').trim();
  var serialNo = String(r[5] || '-').trim();
  var dealerName = String(r[8] || 'ตัวแทนจำหน่าย').trim();
  var dealerPhone = String(r[9] || '').trim();
  var ackPersonName = getLineUserDisplayName_(dealerUserId, secrets.internalToken);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  updateTicketStatusAndNotes_(ss, ticketId, 'DEALER_ACCEPTED', 'ดีลเลอร์รับเรื่องแล้วโดย: ' + ackPersonName + ' (' + nowStr + ')');

  // Tag back to Hoshizaki Tech Group immediately!
  if (isLineGroupConfigured()) {
    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        '🏷️ [DEALER ACKNOWLEDGED — ดีลเลอร์รับเรื่องแล้ว]\n' +
        '✅ ตัวแทนจำหน่าย "' + dealerName + '" กดรับเรื่องดูแลเคสเรียบร้อยแล้ว\n' +
        '• รหัสเคส: ' + ticketId + '\n' +
        '• ลูกค้า: ' + customerName + '\n' +
        '• รุ่น / S/N: ' + model + ' (' + serialNo + ')\n' +
        '• ผู้รับเรื่องฝั่งดีลเลอร์: ' + ackPersonName + '\n' +
        '• เวลาตอบรับ: ' + nowStr
    }], secrets.internalToken);
  }

  // Notify Customer automatically that Dealer has accepted the case!
  if (customerUserId) {
    pushLineMessagesWithToken_(customerUserId, [{
      type: 'text',
      text:
        '✅ [อัปเดตสถานะงานบริการ HOSHIZAKI - ' + ticketId + ']\n' +
        'ตัวแทนจำหน่าย "' + dealerName + '" ได้รับเรื่องดูแลเครื่องรุ่น ' + model + ' ของคุณเรียบร้อยแล้วครับ\n' +
        '• ผู้รับเรื่อง: ' + ackPersonName + '\n' +
        (dealerPhone ? ('• เบอร์ติดต่อดีลเลอร์: ' + dealerPhone + '\n') : '') +
        'ทีมช่างของตัวแทนจำหน่ายจะติดต่อนัดหมายเข้าตรวจสอบให้โดยเร็วที่สุดครับ'
    }], secrets.customerToken);
  }

  return '✅ บันทึกการรับเรื่องเคส ' + ticketId + ' เรียบร้อยแล้ว ระบบได้แท็กแจ้งกลับไปยังศูนย์บริการ HOSHIZAKI และแจ้งลูกค้าอัตโนมัติครับ';
}

function handleDealerRequestHzkSubService_(ss, ticketId, dealerUserId) {
  var secrets = getAppSecrets_();
  var found = findTicketRowById_(ss, ticketId);
  if (!found) return '❌ ไม่พบรหัสเคส ' + ticketId + ' ในระบบครับ';

  var r = found.row;
  var customerName = String(r[3] || 'ลูกค้า').trim();
  var model = String(r[4] || '-').trim();
  var serialNo = String(r[5] || '-').trim();
  var dealerName = String(r[8] || 'ตัวแทนจำหน่าย').trim();
  var reqPerson = getLineUserDisplayName_(dealerUserId, secrets.internalToken);

  updateTicketStatusAndNotes_(ss, ticketId, 'DEALER_REQ_SUB_SERVICE', 'ดีลเลอร์ขอซัพพอร์ตจาก HOSHIZAKI โดย: ' + reqPerson);

  if (isLineGroupConfigured()) {
    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        '🆘 [DEALER SUB-SERVICE REQUEST]\n' +
        'ตัวแทนจำหน่าย "' + dealerName + '" ขอซัพพอร์ต/ส่งต่อทีมช่าง HOSHIZAKI เข้าดูแลร่วม\n' +
        '• รหัสเคส: ' + ticketId + '\n' +
        '• ลูกค้า: ' + customerName + '\n' +
        '• รุ่น / S/N: ' + model + ' (' + serialNo + ')\n' +
        '• ผู้แจ้ง: ' + reqPerson
    }], secrets.internalToken);
  }

  return '🆘 ส่งคำขอซัพพอร์ตไปยังทีมวิศวกรบริการ HOSHIZAKI เรียบร้อยแล้วครับ';
}

/**
 * 2-Hour SLA Watchdog (รันอัตโนมัติทุก 30 นาที)
 */
function checkDealerSlaWatchdog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var sheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  if (!sheet || sheet.getLastRow() < 2 || !isLineGroupConfigured()) return;

  var data = sheet.getDataRange().getValues();
  var nowMs = Date.now();
  var twoHoursMs = 2 * 60 * 60 * 1000;

  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][7] || '').trim();
    if (status === 'DISPATCHED_TO_DEALER') {
      var updatedAt = new Date(data[i][12] || data[i][1]).getTime();
      if (!isNaN(updatedAt) && (nowMs - updatedAt) >= twoHoursMs) {
        var tkId = String(data[i][0]);
        var cust = String(data[i][3]);
        var dealer = String(data[i][8]);
        var dPhone = String(data[i][9]);
        sheet.getRange(i + 1, 8).setValue('DEALER_SLA_OVERDUE');
        pushLineMessagesWithToken_(secrets.lineGroupId, [{
          type: 'text',
          text:
            '⏰ [SLA ALERT > 2 ชม.] ดีลเลอร์ยังไม่กดรับเรื่อง!\n' +
            '• รหัสเคส: ' + tkId + '\n' +
            '• ลูกค้า: ' + cust + '\n' +
            '• ดีลเลอร์: ' + dealer + ' (โทร ' + dPhone + ')\n' +
            'กรุณาโทรติดตามดีลเลอร์หรือกดรับเรื่องดูแลแทนครับ'
        }], secrets.internalToken);
      }
    }
  }
}

// ============================================================================
// SECTION 9: CUSTOMER TEXT HANDLER & INTERNAL TECH COMMANDS (`SN`, `SPEC`, `AI`)
// ============================================================================
function handleCustomerOaMessage_(ss, ev, text, userId, token) {
  var secrets = getAppSecrets_();

  var regMatch = text.match(/ลงทะเบียน\s*([0-9\-]{9,12})/i);
  if (regMatch) {
    var cleanPhone = regMatch[1].replace(/[^0-9]/g, '');
    registerCustomerPhoneMap_(ss, cleanPhone, userId, token);
    replyLineMessageWithToken_(
      ev.replyToken,
      '✅ ลงทะเบียนผูกเบอร์โทรศัพท์ ' + cleanPhone + ' เรียบร้อยแล้ว\nคุณจะได้รับการแจ้งเตือนนัดหมายและรายงานบริการอัตโนมัติครับ',
      token
    );
    return;
  }

  if (/^(STATUS|เช็กสถานะ|ตรวจสอบสถานะ)/i.test(text)) {
    var statusText = lookupCustomerActiveJobsByLineUser_(ss, userId);
    replyLineMessageWithToken_(ev.replyToken, statusText, token);
    return;
  }

  var custSnOnly = text.match(/^SN\s+([A-Z0-9\-]+)/i);
  if (custSnOnly) {
    var cSn = custSnOnly[1].toUpperCase();
    var cInfo = lookupSerialAndDealerMaster_(ss, cSn, '');
    var cReply = cInfo.found
      ? ('❄️ ข้อมูลเครื่อง HOSHIZAKI ของคุณ\n' +
         '• Serial No.: ' + cInfo.serialNumber + '\n' +
         '• รุ่นเครื่อง: ' + cInfo.model + '\n' +
         '• สถานะรับประกัน: ' + cInfo.warrantyStatus + '\n' +
         '• ตัวแทนจำหน่ายดูแล: ' + cInfo.dealerName + ' (' + cInfo.dealerPhone + ')')
      : ('⚠️ ไม่พบหมายเลข S/N ' + cSn + ' ในฐานข้อมูล กรุณาส่งรูปถ่ายป้าย Nameplate หรือพิมพ์อาการเสียเพื่อติดต่อเจ้าหน้าที่ครับ');
    replyLineMessageWithToken_(ev.replyToken, cReply, token);
    return;
  }

  var modelMatch = text.toUpperCase().match(/\b(IM|KM|FM|HR|HF|RT|HNC|HSU|JWE|DBF|DCM)-[A-Z0-9\-]+\b/);
  var detectedModel = modelMatch ? modelMatch[0] : 'CUSTOMER_INQUIRY';
  var snMatch = text.toUpperCase().match(/\b([A-Z][0-9]{5}[A-Z0-9])\b/);
  var detectedSn = snMatch ? snMatch[1] : '';

  var regPhone = lookupCustomerPhoneByLineUser_(ss, userId);
  var masterInfo = lookupSerialAndDealerMaster_(ss, detectedSn, regPhone);
  if (detectedModel === 'CUSTOMER_INQUIRY' && masterInfo.model) {
    detectedModel = masterInfo.model;
  }
  var displaySerial = detectedSn || (masterInfo.found ? masterInfo.serialNumber : 'ไม่ระบุ S/N');

  var aiAdvice = callGeminiLineTextAssistant_(text, detectedModel, 'customer');
  var adviceBody = aiAdvice
    ? ('💡 คำแนะนำเบื้องต้นให้ทดลองแก้ไข:\n' + aiAdvice)
    : 'เบื้องต้นกรุณาตรวจสอบวาล์วน้ำเข้า แผ่นกรองอากาศ และเบรกเกอร์หลักของเครื่องครับ';

  var ticketLogText = aiAdvice ? (text + '\n[AI Triage]: ' + aiAdvice) : text;
  var ticketInfo = createClosedLoopServiceTicket_(ss, userId, ticketLogText, detectedModel, displaySerial, masterInfo, null);

  var customerCard = {
    type: 'flex',
    altText: '🐧 ศูนย์บริการ HOSHIZAKI ได้รับข้อความของคุณแล้ว (' + ticketInfo.ticketId + ')',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🐧 ศูนย์บริการ HOSHIZAKI (THAILAND)', weight: 'bold', size: 'sm', color: '#002B49', wrap: true },
          { type: 'text', text: adviceBody.substring(0, 650), size: 'xs', color: '#334155', wrap: true },
          { type: 'text', text: '📌 รหัสอ้างอิง: ' + ticketInfo.ticketId, weight: 'bold', size: 'xs', color: '#B91C1C', margin: 'sm', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#059669',
            height: 'sm',
            action: {
              type: 'postback',
              label: '✅ ทำตามแล้ว หายปกติครับ',
              data: 'SELF_CHECK_RESOLVED:' + ticketInfo.ticketId,
              displayText: 'ทำตามคำแนะนำเบื้องต้นแล้ว เครื่องหายปกติครับ'
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#DC2626',
            height: 'sm',
            action: {
              type: 'postback',
              label: '🆘 ยังไม่หาย / ขอติดต่อช่างหรือดีลเลอร์',
              data: 'ESCALATE_TO_TECH:' + ticketInfo.ticketId,
              displayText: 'ยังไม่หายครับ ขอให้ช่างหรือตัวแทนจำหน่ายติดต่อกลับ'
            }
          }
        ]
      }
    }
  };

  replyLineFlexWithToken_(ev.replyToken, [customerCard], token);
}

function handleInternalTechMessage_(ss, ev, text, groupId, userId, token) {
  var replyMatch = text.match(/^REPLY\s+(TK-[0-9\-]+)\s+([\s\S]+)$/i);
  if (replyMatch) {
    var tkId = replyMatch[1];
    var replyBody = replyMatch[2].trim();
    var resMsg = replyToCustomerTicketFromTech_(ss, tkId, replyBody, userId);
    replyLineMessageWithToken_(ev.replyToken, resMsg, token);
    return;
  }

  // `HISTORY <serial>` -> 360-degree Serial Lifecycle summary
  var histMatch = text.match(/^HISTORY\s+([A-Z0-9\-]+)/i);
  if (histMatch) {
    var hSn = histMatch[1].toUpperCase();
    var hData = getSerial360LifecycleTimeline_(ss, hSn);
    var hLines = (hData.timeline || []).slice(0, 6).map(function(ev) {
      return '• [' + ev.date + '] ' + ev.title + ' — ' + ev.detail;
    });
    var hReply = '🔎 ประวัติเครื่อง S/N: ' + hSn + ' (' + (hData.master.model || '-') + ')\n' +
      '• ลูกค้า: ' + (hData.master.customerStore || '-') + '\n' +
      '• ประกัน: ' + (hData.master.warrantyStatus || '-') + '\n' +
      (hLines.length ? ('📋 ไทม์ไลน์ล่าสุด:\n' + hLines.join('\n')) : 'ยังไม่มีประวัติซ่อม/ติดตั้งในระบบ');
    replyLineMessageWithToken_(ev.replyToken, hReply, token);
    return;
  }

  // `VAN STOCK <T01-T08>` -> Technician Van Stock lookup
  var vanMatch = text.match(/^VAN\s*STOCK\s*(T0[1-8])?/i);
  if (vanMatch) {
    var vCode = vanMatch[1] ? vanMatch[1].toUpperCase() : 'ALL';
    var vItems = getVanStockItems_(ss, vCode);
    var vLines = vItems.slice(0, 12).map(function(v) {
      return '• [' + v.vanCode + '] ' + v.partCode + ' (' + v.partName + '): คงเหลือ ' + v.qty + ' ชิ้น';
    });
    replyLineMessageWithToken_(ev.replyToken, '🚐 คลังอะไหล่รถช่าง (' + vCode + '):\n' + (vLines.join('\n') || 'ไม่พบรายการอะไหล่'), token);
    return;
  }

  // `SN <serial>` -> Lookup Serial & Dealer Master instantly
  var snCmdMatch = text.match(/^SN\s+([A-Z0-9\-]+)/i);
  if (snCmdMatch) {
    var qSn = snCmdMatch[1].toUpperCase();
    var info = lookupSerialAndDealerMaster_(ss, qSn, '');
    var snMsg = info.found
      ? ('🔎 ข้อมูลเครื่อง S/N: ' + info.serialNumber + '\n' +
         '• รุ่นเครื่อง: ' + info.model + '\n' +
         '• ลูกค้า/ร้าน: ' + info.customerStore + ' (' + info.province + ')\n' +
         '• เบอร์โทรลูกค้า: ' + info.customerPhone + '\n' +
         '• สถานะประกัน: ' + info.warrantyStatus + '\n' +
         '• ตัวแทนจำหน่าย: ' + info.dealerName + '\n' +
         '• ผู้ติดต่อดีลเลอร์: ' + info.dealerContact + ' (' + info.dealerPhone + ')')
      : ('⚠️ ไม่พบข้อมูล S/N ' + qSn + ' ในแท็บ Serial_Dealer_Master ครับ');
    replyLineMessageWithToken_(ev.replyToken, snMsg, token);
    return;
  }

  if (/^TICKETS$/i.test(text)) {
    var openSummary = listOpenCustomerTicketsSummary_(ss);
    replyLineMessageWithToken_(ev.replyToken, openSummary, token);
    return;
  }

  var aiMatch = text.match(/^AI\s+([\s\S]+)$/i);
  if (aiMatch) {
    var q = aiMatch[1].trim();
    var aiResp = callGeminiLineTextAssistant_(q, '', 'tech') || '⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Script Properties ครับ';
    replyLineMessageWithToken_(ev.replyToken, '🤖 [HOSHIZAKI AI Field Co-Pilot]\n' + aiResp, token);
    return;
  }

  var specMatch = text.match(/^(?:SPEC|MANUAL)\s+([A-Z0-9\-]+)/i);
  if (specMatch) {
    var model = specMatch[1].toUpperCase();
    var bubble = buildComplete5DocSpecFlexBubble_(ss, model);
    replyLineFlexWithToken_(ev.replyToken, [bubble], token);
    return;
  }

  var scanMatch = text.match(/^SCAN\s+([A-Z0-9\-]+)/i);
  if (scanMatch) {
    var scanModel = scanMatch[1].toUpperCase();
    var docs = lookupModelDocsFromDriveIndex_(ss, scanModel);
    var msg = '🔍 ผลการสแกนคลังเอกสาร Drive รุ่น ' + scanModel + ':\n' +
      '1️⃣ Spec Sheet: ' + (docs.SPEC.length ? docs.SPEC[0].name : 'ไม่พบไฟล์ตรงรุ่น') + '\n' +
      '2️⃣ Instruction Manual: ' + (docs.INSTRUCTION.length ? docs.INSTRUCTION[0].name : 'เปิดโฟลเดอร์รวม') + '\n' +
      '3️⃣ Service Manual: ' + (docs.SERVICE.length ? docs.SERVICE[0].name : 'เปิดโฟลเดอร์รวม') + '\n' +
      '4️⃣ Parts List: ' + (docs.PARTS.length ? docs.PARTS[0].name : 'เปิดโฟลเดอร์รวม') + '\n' +
      '5️⃣ Dimension Drawing: ' + (docs.DRAWING.length ? docs.DRAWING[0].name : (docs.SPEC.length ? docs.SPEC[0].name + ' (แบบขนาดใน Spec)' : 'เปิดโฟลเดอร์รวม'));
    replyLineMessageWithToken_(ev.replyToken, msg, token);
    return;
  }
}

function replyToCustomerTicketFromTech_(ss, ticketId, replyMessage, responderUserId) {
  var secrets = getAppSecrets_();
  var found = findTicketRowById_(ss, ticketId);
  if (!found) return '❌ ไม่พบรหัสเคส ' + ticketId + ' ในระบบครับ';

  var r = found.row;
  var customerUserId = String(r[2] || '').trim();
  var customerName = String(r[3] || 'ลูกค้า').trim();
  var responderName = getLineUserDisplayName_(responderUserId, secrets.internalToken);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  found.sheet.getRange(found.rowIndex, 8).setValue('ANSWERED');
  found.sheet.getRange(found.rowIndex, 12).setValue(replyMessage + ' (โดย: ' + responderName + ')');
  found.sheet.getRange(found.rowIndex, 13).setValue(nowStr);

  if (customerUserId) {
    var msgToCustomer =
      '👨‍🔧 [คำตอบจากทีมช่างเทคนิค HOSHIZAKI - ' + ticketId + ']\n' +
      replyMessage + '\n' +
      '— ตอบโดย: ' + responderName;
    pushLineMessagesWithToken_(customerUserId, [{ type: 'text', text: msgToCustomer }], secrets.customerToken);
  }

  return '✅ ส่งคำตอบกลับไปยังคุณ "' + customerName + '" (' + ticketId + ') เรียบร้อยแล้วครับ';
}

// ============================================================================
// SECTION 10: PHOTO VIEWER, 5-CATEGORY DRIVE INDEXER, PWA SYNC & HELPERS
// ============================================================================
function buildCustomerPhotoViewerHtmlPage_(fileId, tk) {
  var secrets = getAppSecrets_();
  var cleanId = String(fileId || '').replace(/[^A-Za-z0-9_\-]/g, '');
  var imgSrc = cleanId ? ('https://lh3.googleusercontent.com/d/' + cleanId + '=w1600') : '';
  var driveLink = cleanId ? ('https://drive.google.com/file/d/' + cleanId + '/view') : secrets.pwaUrl;

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HOSHIZAKI Customer Photo Inspection</title></head>' +
    '<body style="margin:0;background:#0F172A;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
    '<div style="background:#002B49;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1E293B;">' +
    '<div><div style="font-size:11px;color:#38BDF8;font-weight:800;">❄️ HOSHIZAKI FIELD PHOTO INSPECTION</div>' +
    '<div style="font-size:15px;font-weight:700;">ภาพถ่ายหน้างาน / ป้าย Nameplate ลูกค้า</div></div>' +
    '<a href="' + driveLink + '" target="_blank" style="background:#059669;color:#FFFFFF;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;">เปิดใน Google Drive</a>' +
    '</div>' +
    '<div style="padding:16px;text-align:center;">' +
    (imgSrc
      ? ('<img src="' + imgSrc + '" style="max-width:100%;max-height:82vh;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.5);" alt="Customer Equipment Photo" />')
      : '<p style="color:#94A3B8;padding:40px;">ไม่พบรหัสไฟล์รูปภาพ</p>') +
    '</div></body></html>';
}

function rebuildDrivePdfIndexSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Drive_PDF_Index') || ss.insertSheet('Drive_PDF_Index');
  sheet.clear();
  sheet.getRange(1, 1, 1, 7)
    .setValues([['Category', 'Model Key', 'File Name', 'File ID', 'File URL', 'Folder ID', 'Indexed At']])
    .setFontWeight('bold')
    .setBackground('#002B49')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  var foldersToScan = [
    { id: SPEC_SHEET_FOLDER_ID, defaultCat: 'SPEC' },
    { id: MANUAL_PDF_FOLDER_IDS[0], defaultCat: 'SERVICE' },
    { id: MANUAL_PDF_FOLDER_IDS[1], defaultCat: 'INSTRUCTION' },
    { id: MANUAL_PDF_FOLDER_IDS[2], defaultCat: 'PARTS' }
  ];

  var rows = [];
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  foldersToScan.forEach(function(item) {
    if (!item.id) return;
    try {
      var folder = DriveApp.getFolderById(item.id);
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var name = f.getName();
        var upper = name.toUpperCase();
        var cat = item.defaultCat;
        if (upper.indexOf('DRAWING') !== -1 || upper.indexOf('CAD') !== -1 || upper.indexOf('DIMENSION') !== -1) {
          cat = 'DRAWING';
        }
        var mMatch = upper.match(/\b(IM|KM|FM|HR|HF|RT|HNC|HSU|JWE|DBF|DCM)-[A-Z0-9]+\b/);
        var modelKey = mMatch ? mMatch[0] : 'GENERAL';
        rows.push([cat, modelKey, name, f.getId(), f.getUrl(), item.id, nowStr]);
      }
    } catch (err) {}
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
  return { status: 'OK', indexedCount: rows.length, updatedAt: nowStr };
}

function lookupModelDocsFromDriveIndex_(ss, model) {
  var result = { SPEC: [], INSTRUCTION: [], SERVICE: [], PARTS: [], DRAWING: [] };
  var sheet = ss.getSheetByName('Drive_PDF_Index');
  if (!sheet || sheet.getLastRow() < 2) return result;
  var m = String(model || '').trim().toUpperCase();
  var baseM = m.replace(/-[A-Z0-9]+$/, '');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var cat = String(data[i][0] || '').trim().toUpperCase();
    var key = String(data[i][1] || '').trim().toUpperCase();
    var fname = String(data[i][2] || '');
    var furl = String(data[i][4] || '');
    if (!result[cat]) continue;
    if (key === m || fname.toUpperCase().indexOf(m) !== -1 || (baseM.length >= 4 && fname.toUpperCase().indexOf(baseM) !== -1)) {
      result[cat].push({ name: fname, url: furl, exact: (key === m || fname.toUpperCase().indexOf(m) !== -1) });
    }
  }
  return result;
}

function buildComplete5DocSpecFlexBubble_(ss, model) {
  var m = String(model || 'IM-130NE').trim().toUpperCase();
  var docs = lookupModelDocsFromDriveIndex_(ss, m);
  var fSpec = docs.SPEC[0] || null;
  var fInst = docs.INSTRUCTION[0] || null;
  var fServ = docs.SERVICE[0] || null;
  var fPart = docs.PARTS[0] || null;
  var fDraw = docs.DRAWING[0] || null;

  var specUrl = fSpec ? fSpec.url : ('https://drive.google.com/drive/folders/' + SPEC_SHEET_FOLDER_ID);
  var instUrl = fInst ? fInst.url : ('https://drive.google.com/drive/folders/' + MANUAL_PDF_FOLDER_IDS[1]);
  var servUrl = fServ ? fServ.url : ('https://drive.google.com/drive/folders/' + MANUAL_PDF_FOLDER_IDS[0]);
  var partUrl = fPart ? fPart.url : ('https://drive.google.com/drive/folders/' + MANUAL_PDF_FOLDER_IDS[2]);
  var hasDimDrawing = Boolean(fDraw || fSpec);
  var drawingUrl = fDraw ? fDraw.url : specUrl;

  var scriptUrl = ScriptApp.getService().getUrl();
  var fullScreenUrl = scriptUrl + '?action=specFullScreen&model=' + encodeURIComponent(m);

  return {
    type: 'flex',
    altText: '❄️ HOSHIZAKI Technical Spec & 5-Doc Suite: ' + m,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#002B49',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '❄️ HOSHIZAKI TECHNICAL SUITE', color: '#38BDF8', size: 'xxs', weight: 'bold' },
          { type: 'text', text: m + ' — 5-Doc Engineering Pack', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '12px',
        contents: [
          { type: 'button', style: 'primary', color: '#005A9C', height: 'sm', action: { type: 'uri', label: fSpec ? ('📄 1. Spec Sheet (' + m + ')') : '📂 1. โฟลเดอร์ Spec Sheet', uri: specUrl } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: fInst ? ('📘 2. Instruction (' + m + ')') : '📂 2. โฟลเดอร์ Instruction Manual', uri: instUrl } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: fServ ? ('🛠️ 3. Service Manual (' + m + ')') : '📂 3. โฟลเดอร์ Service Manual', uri: servUrl } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: fPart ? ('🔩 4. Parts List (' + m + ')') : '📂 4. โฟลเดอร์ Parts List', uri: partUrl } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: hasDimDrawing ? ('📐 5. Dimension Drawing (' + m + ')') : '📂 5. โฟลเดอร์แบบขนาดรวม', uri: drawingUrl } },
          { type: 'button', style: 'primary', color: '#059669', height: 'sm', action: { type: 'uri', label: '🖥️ เปิดดูสเปกเต็มจอ (Full Screen)', uri: fullScreenUrl } }
        ]
      }
    }
  };
}

function buildFullScreenModelSpecHtmlPage_(model) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var m = String(model || 'IM-130NE').trim().toUpperCase();
  var docs = lookupModelDocsFromDriveIndex_(ss, m);
  var secrets = getAppSecrets_();

  function renderDocRow(num, title, list, fallbackFolderId) {
    var hasFile = list && list.length > 0;
    var url = hasFile ? list[0].url : ('https://drive.google.com/drive/folders/' + fallbackFolderId);
    var sub = hasFile ? ('ไฟล์ที่พบ: ' + list[0].name) : 'เปิดโฟลเดอร์รวมใน Google Drive';
    var badge = hasFile
      ? '<span style="background:#DCFCE7;color:#166534;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">ตรงรุ่น ✓</span>'
      : '<span style="background:#FEF3C7;color:#92400E;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">เปิดโฟลเดอร์</span>';
    return '<a href="' + url + '" target="_blank" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid #E2E8F0;border-radius:10px;text-decoration:none;color:#0F172A;margin-bottom:8px;background:#F8FAFC;">' +
      '<div><div style="font-weight:700;font-size:14px;">' + num + '. ' + title + '</div><div style="font-size:12px;color:#64748B;margin-top:2px;">' + sub + '</div></div>' +
      badge + '</a>';
  }

  var drawingList = (docs.DRAWING && docs.DRAWING.length > 0) ? docs.DRAWING : docs.SPEC;

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HOSHIZAKI Technical Spec — ' + m + '</title></head>' +
    '<body style="margin:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:16px;">' +
    '<div style="max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,43,73,0.12);">' +
    '<div style="background:#002B49;color:#FFFFFF;padding:20px 24px;">' +
    '<div style="color:#FBBF24;font-size:11px;font-weight:800;letter-spacing:0.06em;">❄️ HOSHIZAKI TECHNICAL SPECIFICATION &amp; 5-DOC SUITE</div>' +
    '<h1 style="margin:6px 0 0;font-size:22px;">' + m + ' — Engineering &amp; Service Pack</h1></div>' +
    '<div style="padding:20px 24px;">' +
    '<div style="font-weight:700;font-size:15px;color:#002B49;margin-bottom:12px;">📚 คลังเอกสารทางเทคนิค 5 หมวด (แยกตามเนื้อหาจริง):</div>' +
    renderDocRow('1', 'Spec Sheet PDF (' + m + ')', docs.SPEC, SPEC_SHEET_FOLDER_ID) +
    renderDocRow('2', 'Instruction &amp; Installation Manual', docs.INSTRUCTION, MANUAL_PDF_FOLDER_IDS[1]) +
    renderDocRow('3', 'Service Manual (คู่มือซ่อม)', docs.SERVICE, MANUAL_PDF_FOLDER_IDS[0]) +
    renderDocRow('4', 'Parts List / Exploded View', docs.PARTS, MANUAL_PDF_FOLDER_IDS[2]) +
    renderDocRow('5', 'CAD / Dimension Drawing (' + m + ')', drawingList, SPEC_SHEET_FOLDER_ID) +
    '<a href="' + secrets.pwaUrl + '" target="_blank" style="display:block;text-align:center;background:#047857;color:#FFFFFF;font-weight:700;padding:14px;border-radius:10px;text-decoration:none;margin-top:16px;">📲 เข้าสู่หน้าหลักแอปจัดการงานบริการ HOSHIZAKI PWA</a>' +
    '</div></div></body></html>';
}

function handleTechGroupPhotoNote_(ss, ev, messageId, groupId, userId, token) {
  var sheet = ss.getSheetByName('Field_Photo_Logs') || ss.insertSheet('Field_Photo_Logs');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Group ID', 'User ID', 'Sender Name', 'LINE Image Message ID']]).setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([nowStr, groupId, userId, getLineUserDisplayName_(userId, token), messageId]);
}

function handlePwaApiAction_(ss, action, payload) {
  var secrets = getAppSecrets_();

  if (action === 'syncJob' || action === 'saveJob' || action === 'upsertJob') {
    var job = payload.job || payload.data || payload;
    var sheet = ss.getSheetByName('Service_Jobs') || ss.insertSheet('Service_Jobs');
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 10)
        .setValues([['Job ID', 'Date', 'Customer', 'Phone', 'Model', 'Serial', 'Symptom', 'Technician', 'Status', 'Updated At']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
    var jobId = String(job.jobId || job.id || ('JOB-' + Date.now()));
    var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([
      jobId,
      job.date || nowStr.slice(0, 10),
      job.customerName || job.customer || '',
      job.phone || job.customerPhone || '',
      job.model || '',
      job.serial || job.serialNo || '',
      job.symptom || job.issue || '',
      job.technician || '',
      job.status || 'OPEN',
      nowStr
    ]);

    var cleanPhone = String(job.phone || job.customerPhone || '').replace(/[^0-9]/g, '');
    if (cleanPhone) {
      var custLineId = lookupLineUserByPhone_(ss, cleanPhone);
      if (custLineId) {
        pushLineMessagesWithToken_(custLineId, [{
          type: 'text',
          text: '❄️ แจ้งเตือนงานบริการ HOSHIZAKI\n• เลขที่ใบงาน: ' + jobId + '\n• รุ่นเครื่อง: ' + (job.model || '-') + '\n• สถานะ: ' + (job.status || 'OPEN') + '\nตรวจสอบรายละเอียดเพิ่มเติมได้ที่เว็บแอปบริการครับ'
        }], secrets.customerToken);
      }
    }

    if (secrets.autoNotifyNewJob && isLineGroupConfigured()) {
      pushLineMessagesWithToken_(secrets.lineGroupId, [{
        type: 'text',
        text: '🛠️ อัปเดตใบงานบริการ [' + jobId + ']\n• ลูกค้า: ' + (job.customerName || '-') + '\n• รุ่น: ' + (job.model || '-') + ' (S/N: ' + (job.serial || '-') + ')\n• สถานะ: ' + (job.status || 'OPEN')
      }], secrets.internalToken);
    }
    return { status: 'OK', jobId: jobId, syncedAt: nowStr };
  }

  if (action === 'syncQuotation' || action === 'saveQuotation') {
    var qt = payload.quotation || payload.data || payload;
    var qSheet = ss.getSheetByName('Quotations') || ss.insertSheet('Quotations');
    if (qSheet.getLastRow() === 0) {
      qSheet.getRange(1, 1, 1, 8)
        .setValues([['QT ID', 'Date', 'Customer', 'Phone', 'Model', 'Grand Total', 'Status', 'Updated At']])
        .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
      qSheet.setFrozenRows(1);
    }
    var qtId = String(qt.qtId || qt.id || ('QT-' + Date.now()));
    var qNow = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    qSheet.appendRow([qtId, qt.date || qNow.slice(0, 10), qt.customerName || '', qt.phone || '', qt.model || '', qt.grandTotal || 0, qt.status || 'SENT', qNow]);
    return { status: 'OK', qtId: qtId, syncedAt: qNow };
  }

  if (action === 'rebuildDriveIndex') {
    return rebuildDrivePdfIndexSheet();
  }

  if (action === 'importSalesMasterData') {
    return importSalesMasterDataBatch_(ss, payload);
  }

  if (action === 'reassignCustomerSalesperson') {
    return reassignCustomerSalesperson_(ss, payload.customerName, payload.salespersonCode, payload.paymentTerms);
  }

  if (action === 'saveSalesQuotation') {
    return saveSalesCorporateQuotation_(ss, payload.quotation || payload);
  }

  if (action === 'shareSalesQuotation') {
    return shareSalesQuotationMultiChannel_(ss, payload);
  }

  if (action === 'sendServiceTrackedDoc') {
    // Supports Service Report, Quotation, Billing Note (ใบวางบิล), Receipt (ใบเสร็จรับเงิน)
    var svcDoc = payload.document || payload;
    svcDoc.department = svcDoc.department || 'Service & Billing';
    return shareSalesQuotationMultiChannel_(ss, {
      channel: payload.channel || 'LINE',
      attachType: payload.attachType || 'PDF',
      toEmail: payload.toEmail || svcDoc.customerEmail || '',
      ccEmail: payload.ccEmail || '',
      senderName: payload.senderName || svcDoc.senderName || 'นพรินทร์ หอมหวล (Service Dept)',
      replyToEmail: payload.replyToEmail || 'noparin@hoshizaki.co.th',
      quotation: svcDoc
    });
  }

  if (action === 'getDocumentTrackingList') {
    return {
      status: 'OK',
      records: getDocumentTrackingList_(ss, payload.department || 'ALL')
    };
  }

  if (action === 'getWarrantyPmRenewals') {
    return { status: 'OK', items: getWarrantyAndPmRenewalCandidates_(ss) };
  }

  if (action === 'requestDiscountApproval') {
    return requestManagerDiscountApproval_(ss, payload.quotation || payload);
  }

  if (action === 'getAiSalesFollowUps') {
    return { status: 'OK', items: runAiSalesFollowUpCopilot_(ss), portalUrl: ScriptApp.getService().getUrl() + '?action=portal' };
  }

  if (action === 'submitCustomerSignedPo') {
    return submitCustomerSignedPoAndEsign_(ss, payload);
  }

  if (action === 'getSerial360Timeline') {
    return getSerial360LifecycleTimeline_(ss, payload.serialNo);
  }

  if (action === 'getVanStock') {
    return { status: 'OK', items: getVanStockItems_(ss, payload.vanCode || 'ALL') };
  }

  if (action === 'adjustVanStock') {
    return adjustVanStockItem_(ss, payload);
  }

  if (action === 'getDispatchSchedule') {
    return { status: 'OK', items: getDispatchScheduleList_(ss) };
  }

  if (action === 'createDispatchSlot') {
    return createDispatchScheduleSlot_(ss, payload);
  }

  if (action === 'getMonthlyIncentiveKpi') {
    return getMonthlyIncentiveKpiSummary_(ss);
  }

  if (action === 'exportErpSalesOrders') {
    return exportPoApprovedOrdersForErp_(ss);
  }

  if (action === 'runProductionQaCheck' || action === 'runDeepSystemScan') {
    return runProductionReadinessCheck_();
  }

  if (action === 'resetDemoDataSafe') {
    return resetDemoDataForProductionGoLive();
  }

  if (action === 'deployCustomerRichMenu') {
    return deployCustomerLineRichMenu();
  }

  if (action === 'syncEmailStockNow') {
    return importDailyStockFromGmail();
  }

  if (action === 'getDamageDemoList') {
    return { status: 'OK', items: getDamageDemoInspectionList_(ss) };
  }

  if (action === 'sendExecutiveBriefingNow') {
    return sendWeeklyExecutiveBriefing();
  }

  if (action === 'getExecutiveBiSummary') {
    return getUnifiedExecutiveBiSummary_(ss);
  }

  if (action === 'getLiveSalesCrmMaster') {
    return getLiveSalesCrmMasterFromSheets_(ss);
  }

  if (action === 'dispatchCrossDeptHandover') {
    return dispatchCrossDeptHandover_(ss, payload);
  }

  if (action === 'getSalesCrmMaster') {
    var crmSheets = ensureSalesCrmSheets_(ss);
    return {
      status: 'OK',
      companyHeader: CURRENT_COMPANY_HEADER,
      staffCount: Math.max(0, crmSheets.staffSheet.getLastRow() - 1),
      customerCount: Math.max(0, crmSheets.custSheet.getLastRow() - 1),
      modelCount: Math.max(0, crmSheets.modelSheet.getLastRow() - 1),
      quotationCount: Math.max(0, crmSheets.qtSheet.getLastRow() - 1)
    };
  }

  return { status: 'OK', action: action || 'NOOP' };
}

function readPwaCloudSnapshot_(ss) {
  function readSheetRows(name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getDataRange().getValues();
    var headers = vals[0];
    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        obj[String(headers[c])] = vals[r][c];
      }
      out.push(obj);
    }
    return out;
  }
  return {
    status: 'OK',
    version: 'Enterprise-v1155-DEEP-SCAN-VERIFIED',
    jobs: readSheetRows('Service_Jobs'),
    quotations: readSheetRows('Quotations'),
    tickets: readSheetRows('LINE_Tech_Support_Tickets'),
    serialMaster: readSheetRows('Serial_Dealer_Master')
  };
}

function registerCustomerPhoneMap_(ss, cleanPhone, userId, token) {
  var sheet = ss.getSheetByName('Customer_Phone_LINE_Map') || ss.insertSheet('Customer_Phone_LINE_Map');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4)
      .setValues([['Phone', 'LINE User ID', 'Display Name', 'Registered At']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var displayName = getLineUserDisplayName_(userId, token);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').replace(/[^0-9]/g, '') === cleanPhone) {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[userId, displayName, nowStr]]);
      return;
    }
  }
  sheet.appendRow([cleanPhone, userId, displayName, nowStr]);
}

function lookupLineUserByPhone_(ss, cleanPhone) {
  var sheet = ss.getSheetByName('Customer_Phone_LINE_Map');
  if (!sheet || sheet.getLastRow() < 2) return '';
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || '').replace(/[^0-9]/g, '') === cleanPhone) {
      return String(data[i][1] || '').trim();
    }
  }
  return '';
}

function lookupCustomerActiveJobsByLineUser_(ss, userId) {
  var tSheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  var lines = [];
  if (tSheet && tSheet.getLastRow() >= 2) {
    var rows = tSheet.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1 && lines.length < 3; i--) {
      if (String(rows[i][2] || '').trim() === userId) {
        lines.push('• ' + rows[i][0] + ' [' + rows[i][7] + '] — ' + rows[i][4] + ' (' + rows[i][8] + ')');
      }
    }
  }
  if (lines.length === 0) {
    return '📋 ยังไม่พบประวัติการแจ้งซ่อมในบัญชี LINE นี้ครับ สามารถพิมพ์อาการเสียและรุ่นเครื่องเพื่อเปิดเคสใหม่ได้ทันทีครับ';
  }
  return '📋 สถานะเคสแจ้งซ่อมล่าสุดของคุณ:\n' + lines.join('\n');
}

function listOpenCustomerTicketsSummary_(ss) {
  var sheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  if (!sheet || sheet.getLastRow() < 2) return '✅ ไม่มีเคสลูกค้าค้างตอบในระบบครับ';
  var rows = sheet.getDataRange().getValues();
  var open = [];
  for (var i = rows.length - 1; i >= 1 && open.length < 10; i--) {
    var st = String(rows[i][7] || '').toUpperCase();
    if (st.indexOf('OPEN') !== -1 || st.indexOf('ESCALATED') !== -1 || st.indexOf('DISPATCHED') !== -1) {
      open.push('• ' + rows[i][0] + ' [' + st + '] (' + rows[i][3] + ' / ' + rows[i][8] + ')');
    }
  }
  return open.length > 0
    ? ('🆘 รายการเคสที่กำลังติดตาม (' + open.length + ' เคส):\n' + open.join('\n'))
    : '✅ ไม่มีเคสลูกค้าค้างตอบในระบบครับ';
}

function logCustomerPostback_(ss, eventType, refId, userId) {
  var sheet = ss.getSheetByName('Customer_LINE_Postbacks') || ss.insertSheet('Customer_LINE_Postbacks');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Event Type', 'Ref ID', 'LINE User ID']]).setFontWeight('bold');
  }
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([nowStr, eventType, refId, userId]);
}

function runLineSelfTestSummary_(ss, currentGroupId) {
  var s = getAppSecrets_();
  var idxSheet = ss.getSheetByName('Drive_PDF_Index');
  var idxCount = idxSheet ? Math.max(0, idxSheet.getLastRow() - 1) : 0;
  var snSheet = ss.getSheetByName('Serial_Dealer_Master');
  var snCount = snSheet ? Math.max(0, snSheet.getLastRow() - 1) : 0;
  return '🧪 HOSHIZAKI LINE BOT SELFTEST (v1140 Closed-Loop)\n' +
    '1. Customer Token: ' + (s.customerToken ? '✅ OK' : '❌ Missing') + '\n' +
    '2. Internal Token: ' + (s.internalToken ? '✅ OK' : '❌ Missing') + '\n' +
    '3. Gemini AI Vision: ' + (isGeminiConfigured_() ? '✅ ACTIVE (' + GEMINI_MODEL_NAME + ')' : '❌ Missing GEMINI_API_KEY') + '\n' +
    '4. Drive 5-Doc Index: ✅ ' + idxCount + ' files\n' +
    '5. Serial & Dealer Master: ✅ ' + snCount + ' records\n' +
    '6. Target Tech Group ID: ' + s.lineGroupId;
}

function getLineUserDisplayName_(userId, token) {
  if (!userId || !token) return 'ลูกค้า HOSHIZAKI';
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText());
      if (json && json.displayName) return json.displayName;
    }
  } catch (e) {}
  return 'ผู้ใช้ LINE (' + String(userId).slice(-6) + ')';
}

function replyLineMessageWithToken_(replyToken, text, token) {
  if (!replyToken || !token) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: String(text || '') }]
    }),
    muteHttpExceptions: true
  });
}

function replyLineFlexWithToken_(replyToken, flexMessages, token) {
  if (!replyToken || !token) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: flexMessages
    }),
    muteHttpExceptions: true
  });
}

function pushLineMessagesWithToken_(toId, messages, token) {
  if (!toId || !token || !messages || !messages.length) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: toId,
      messages: messages
    }),
    muteHttpExceptions: true
  });
}


// ============================================================================
// SECTION 12: SALES, MARKETING & JAPANESE CORPORATE CRM + QUOTATION ENGINE (v1141)
// ============================================================================
var CURRENT_COMPANY_HEADER = {
  companyNameEn: 'HOSHIZAKI (THAILAND) LIMITED',
  companyNameTh: 'บริษัท โฮชิซากิ (ประเทศไทย) จำกัด',
  addressLine1: 'Building A, 1st floor, No. 10/11 Soi Vibhavadi Rangsit 64 (Mahanakorn),',
  addressLine2: 'Talat Bang Khen Subdistrict, Lak Si District, Bangkok 10210 Thailand',
  tel: '(+66)97-230-5941 / 02-005-9980-83',
  web: 'https://hoshizaki-sea.com',
  bankInfo: 'Bank of Ayudhya Public Company Limited Future Park Rangsit Branch Current Account No. 062-0-04476-2 Branch No. 0062'
};

var DEFAULT_ACTIVE_SALES_STAFF = [
  ['FURUJO', 'Mr. Furujo', 'Japanese Corporate', 'Japanese Corporate Manager', 'ACTIVE', ''],
  ['NOPARIN_H', 'นพรินทร์ หอมหวล (Noparin Homhoul)', 'Service & Technical Support', 'Deputy Service Manager', 'ACTIVE', 'noparin@hoshizaki.co.th'],
  ['KETSARAPORN', 'Ketsaraporn', 'Sales', 'Sales Executive', 'ACTIVE', ''],
  ['KULATHIDA_C', 'Kulathida C.', 'Sales', 'Sales Executive', 'ACTIVE', ''],
  ['JANYALUCK_P', 'Janyaluck P.', 'Sales', 'Sales Executive', 'ACTIVE', ''],
  ['MARKETING_TH', 'Marketing & Product Team', 'Marketing', 'Marketing Coordinator', 'ACTIVE', '']
];

function ensureSalesCrmSheets_(ss) {
  // 1) Active Staff Directory (Editable in Sheets & PWA)
  var staffSheet = ss.getSheetByName('CRM_Staff_Directory') || ss.insertSheet('CRM_Staff_Directory');
  if (staffSheet.getLastRow() === 0) {
    staffSheet.getRange(1, 1, 1, 6)
      .setValues([['Staff Code', 'Full Name', 'Department', 'Role', 'Status', 'Email / Contact']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    staffSheet.setFrozenRows(1);
    staffSheet.getRange(2, 1, DEFAULT_ACTIVE_SALES_STAFF.length, 6).setValues(DEFAULT_ACTIVE_SALES_STAFF);
  }

  // 2) Flexible Customer & Account Master (Editable Salesperson Assignment)
  var custSheet = ss.getSheetByName('CRM_Customer_Master') || ss.insertSheet('CRM_Customer_Master');
  if (custSheet.getLastRow() === 0) {
    custSheet.getRange(1, 1, 1, 8)
      .setValues([['Customer Name', 'Payment Terms', 'Assigned Sales Code', 'Previous / Legacy Code', 'Address', 'Phone No.', 'Segment / Type', 'Updated At']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    custSheet.setFrozenRows(1);
  }

  // 3) Product Model Master with Dimensions (W x D x H mm.)
  var modelSheet = ss.getSheetByName('CRM_Model_Catalog') || ss.insertSheet('CRM_Model_Catalog');
  if (modelSheet.getLastRow() === 0) {
    modelSheet.getRange(1, 1, 1, 9)
      .setValues([['Status', 'Factory', 'Model', 'Category Type', 'W (mm)', 'D (mm)', 'H (mm)', 'Prefix', 'Description']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    modelSheet.setFrozenRows(1);
  }

  // 4) Sales, Marketing & Japanese Corporate Quotations (Local THB & Export USD + Revisions)
  var qtSheet = ss.getSheetByName('Sales_Quotations_2026') || ss.insertSheet('Sales_Quotations_2026');
  if (qtSheet.getLastRow() === 0) {
    qtSheet.getRange(1, 1, 1, 18)
      .setValues([[
        'Offer No.', 'Rev', 'Date', 'Format (LOCAL/EXPORT)', 'Department', 'Salesperson Code',
        'Customer Name', 'Contact Person', 'Address', 'Phone', 'Payment Terms', 'Project / Subject',
        'Items JSON (with WxDxH)', 'Sub Total', 'VAT', 'WHT 3%', 'Grand Total', 'Status'
      ]])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    qtSheet.setFrozenRows(1);
  }

  return { staffSheet: staffSheet, custSheet: custSheet, modelSheet: modelSheet, qtSheet: qtSheet };
}

/**
 * นำเข้าข้อมูลฐานข้อมูลทั้งหมดจาก JSON (`sales_crm_master_db_y2026.json`) เข้า Google Sheets
 * และล้างรหัสพนักงานขายเดิมที่ไม่อยู่แล้ว (THANAKRIT_CH, PISAK) ให้พร้อมมอบหมายใหม่ได้ยืดหยุ่น
 */
function importSalesMasterDataBatch_(ss, payload) {
  var sheets = ensureSalesCrmSheets_(ss);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var counts = { models: 0, customers: 0, staff: 0 };

  if (Array.isArray(payload.activeStaff) && payload.activeStaff.length > 0) {
    sheets.staffSheet.getRange(2, 1, Math.max(1, sheets.staffSheet.getLastRow()), 6).clearContent();
    var sRows = payload.activeStaff.map(function(s) {
      return [s.code || '', s.name || '', s.dept || 'Sales', s.role || '', 'ACTIVE', s.email || s.phone || ''];
    });
    sheets.staffSheet.getRange(2, 1, sRows.length, 6).setValues(sRows);
    counts.staff = sRows.length;
  }

  if (Array.isArray(payload.models) && payload.models.length > 0) {
    if (sheets.modelSheet.getLastRow() > 1) {
      sheets.modelSheet.getRange(2, 1, sheets.modelSheet.getLastRow() - 1, 9).clearContent();
    }
    var mRows = payload.models.map(function(m) {
      return [m.status || 'active', m.factory || '', m.model || '', m.type || '', m.w || '', m.d || '', m.h || '', m.prefix || '', m.description || ''];
    });
    sheets.modelSheet.getRange(2, 1, mRows.length, 9).setValues(mRows);
    counts.models = mRows.length;
  }

  if (Array.isArray(payload.customers) && payload.customers.length > 0) {
    if (sheets.custSheet.getLastRow() > 1) {
      sheets.custSheet.getRange(2, 1, sheets.custSheet.getLastRow() - 1, 8).clearContent();
    }
    var cRows = payload.customers.map(function(c) {
      return [
        c.name || '',
        c.paymentTerms || '30DAYS',
        c.assignedSales || '',
        c.legacyCode || '',
        c.address || '',
        c.phone || '',
        (c.assignedSales === 'FURUJO') ? 'Japanese Corporate' : 'Commercial / Dealer',
        nowStr
      ];
    });
    sheets.custSheet.getRange(2, 1, cRows.length, 8).setValues(cRows);
    counts.customers = cRows.length;
  }

  return { status: 'OK', imported: counts, updatedAt: nowStr };
}

/**
 * ปรับเปลี่ยนผู้ดูแลลูกค้า (Flexible Salesperson Reassignment) ได้ตลอดเวลาจากหน้า PWA หรือ Google Sheets
 */
function reassignCustomerSalesperson_(ss, customerName, newSalesCode, newPaymentTerms) {
  var sheets = ensureSalesCrmSheets_(ss);
  var target = String(customerName || '').trim().toUpperCase();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var data = sheets.custSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === target) {
      sheets.custSheet.getRange(i + 1, 3).setValue(String(newSalesCode || '').trim().toUpperCase());
      if (newPaymentTerms) {
        sheets.custSheet.getRange(i + 1, 2).setValue(String(newPaymentTerms).trim());
      }
      sheets.custSheet.getRange(i + 1, 8).setValue(nowStr);
      return { status: 'OK', customerName: data[i][0], assignedSales: newSalesCode, updatedAt: nowStr };
    }
  }

  sheets.custSheet.appendRow([customerName, newPaymentTerms || '30DAYS', String(newSalesCode || '').trim().toUpperCase(), '', '', '', 'Custom Account', nowStr]);
  return { status: 'OK', customerName: customerName, assignedSales: newSalesCode, created: true };
}

/**
 * บันทึกใบเสนอราคา Sales / Marketing / Japanese Corporate (พร้อมเลข Offer No. HTH-26xxx, Rev, ขนาด WxDxH)
 */
function saveSalesCorporateQuotation_(ss, qt) {
  var sheets = ensureSalesCrmSheets_(ss);
  var secrets = getAppSecrets_();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var offerNo = String(qt.offerNo || ('HTH-26' + String(Date.now()).slice(-4))).trim().toUpperCase();
  var rev = String(qt.rev || 'Rev.0').trim();
  var formatType = String(qt.format || 'LOCAL').toUpperCase(); // LOCAL (THB) | EXPORT (USD)

  sheets.qtSheet.appendRow([
    offerNo,
    rev,
    qt.date || nowStr.slice(0, 10),
    formatType,
    qt.department || 'Sales',
    qt.salesperson || '',
    qt.customerName || '',
    qt.contactPerson || '',
    qt.address || '',
    qt.phone || '',
    qt.paymentTerms || '30DAYS',
    qt.project || '',
    JSON.stringify(qt.items || []),
    Number(qt.subTotal || 0),
    Number(qt.vatAmount || 0),
    Number(qt.whtAmount || 0),
    Number(qt.grandTotal || 0),
    qt.status || 'ISSUED'
  ]);

  // Also allow flexible customer-salesperson binding update if requested
  if (qt.updateCustomerBinding && qt.customerName) {
    reassignCustomerSalesperson_(ss, qt.customerName, qt.salesperson || '', qt.paymentTerms || '');
  }

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    var currency = (formatType === 'EXPORT') ? 'USD' : 'THB';
    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        '📄 [ใบเสนอราคาใหม่ — ' + (qt.department || 'Sales') + ']\n' +
        '• เลขที่: ' + offerNo + ' (' + rev + ')\n' +
        '• ลูกค้า: ' + (qt.customerName || '-') + '\n' +
        '• ผู้ดูแล: ' + (qt.salesperson || '-') + '\n' +
        '• ยอดสุทธิ: ' + Number(qt.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + currency
    }], secrets.internalToken);
  }

  var reservedList = softReserveStockForQuotation_(ss, offerNo, qt.items || []);
  return { status: 'OK', offerNo: offerNo, rev: rev, reservedStock: reservedList, companyHeader: CURRENT_COMPANY_HEADER, savedAt: nowStr };
}


// ============================================================================
// SECTION 14: SALES & CORPORATE QUOTATION PDF/EXCEL GENERATOR & MULTI-CHANNEL SHARE (v1143)
// ============================================================================
var SALES_QT_FOLDER_NAME = 'HOSHIZAKI_Sales_Quotations_Files';

function getOrCreateSalesQuotationFolder_() {
  var folders = DriveApp.getFoldersByName(SALES_QT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(SALES_QT_FOLDER_NAME);
}

function buildSalesQuotationA4Html_(qt) {
  var hdr = CURRENT_COMPANY_HEADER;
  var fmt = String(qt.format || 'LOCAL').toUpperCase();
  var curr = (fmt === 'EXPORT') ? 'USD' : 'THB';
  var items = Array.isArray(qt.items) ? qt.items : [];

  var rowsHtml = items.map(function(it, idx) {
    var qty = Number(it.qty || 1);
    var up = Number(it.unitPrice || 0);
    var disc = Number(it.discount || 0);
    var amt = Math.max(0, (up - disc) * qty);
    return '<tr>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:center;">' + (idx + 1) + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;font-weight:700;">' + (it.model || '-') + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;">' + (it.description || '-') + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:center;">' + (it.w || '-') + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:center;">' + (it.d || '-') + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:center;">' + (it.h || '-') + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:right;">' + up.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:right;">' + disc.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:center;">' + qty + '</td>' +
      '<td style="border:1px solid #334155;padding:6px;text-align:right;font-weight:700;">' + amt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>' +
      '</tr>';
  }).join('');

  if (!rowsHtml) {
    rowsHtml = '<tr><td colspan="10" style="border:1px solid #334155;padding:12px;text-align:center;color:#64748B;">- No Items -</td></tr>';
  }

  var subTotal = Number(qt.subTotal || 0);
  var vatAmt = Number(qt.vatAmount || 0);
  var whtAmt = Number(qt.whtAmount || 0);
  var grandTotal = Number(qt.grandTotal || 0);
  var remarksLines = String(qt.remarks || '').split(/\r?\n/).map(function(line) {
    return '<div>' + line + '</div>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#0F172A;margin:18px;}' +
    '.hdr{border-bottom:2px solid #002B49;padding-bottom:10px;margin-bottom:12px;display:flex;justify-content:space-between;}' +
    '.title{text-align:center;font-size:18px;font-weight:800;color:#002B49;letter-spacing:1px;margin:8px 0 12px;}' +
    'table{width:100%;border-collapse:collapse;}' +
    'th{background:#002B49;color:#FFFFFF;border:1px solid #002B49;padding:6px;font-size:10px;}' +
    '</style></head><body>' +
    '<div class="hdr">' +
    '<div><div style="font-size:15px;font-weight:800;color:#002B49;">' + hdr.companyNameEn + '</div>' +
    '<div style="font-size:12px;font-weight:700;">' + hdr.companyNameTh + '</div>' +
    '<div>' + hdr.addressLine1 + '</div><div>' + hdr.addressLine2 + '</div>' +
    '<div>Tel: ' + hdr.tel + ' | Web: ' + hdr.web + '</div></div>' +
    '<div style="text-align:right;font-size:10px;color:#475569;">Department: <b>' + (qt.department || 'Sales') + '</b><br>Format: <b>' + fmt + ' (' + curr + ')</b></div>' +
    '</div>' +
    '<div class="title">QUOTATION / ใบเสนอราคา</div>' +
    '<table style="margin-bottom:12px;">' +
    '<tr><td style="width:15%;font-weight:700;">Customer Name :</td><td style="width:45%;">' + (qt.customerName || '-') + (qt.taxId ? (' (Tax ID: ' + qt.taxId + ' / ' + (qt.branch || 'Head Office') + ')') : '') + '</td>' +
    '<td style="width:18%;font-weight:700;">วันที่ / Date :</td><td style="width:22%;">' + (qt.date || '-') + '</td></tr>' +
    '<tr><td style="font-weight:700;">Contact Person :</td><td>' + (qt.contactPerson || '-') + '</td>' +
    '<td style="font-weight:700;">Offer No. :</td><td><b>' + (qt.offerNo || '-') + ' (' + (qt.rev || 'Rev.0') + ')</b></td></tr>' +
    '<tr><td style="font-weight:700;">Address :</td><td>' + (qt.address || '-') + '</td>' +
    '<td style="font-weight:700;">Offered By :</td><td>' + (qt.salesperson || '-') + '</td></tr>' +
    '<tr><td style="font-weight:700;">Tel No. :</td><td>' + (qt.phone || '-') + '</td>' +
    '<td style="font-weight:700;">Term of Payment :</td><td>' + (qt.paymentTerms || '30DAYS') + '</td></tr>' +
    '</table>' +
    '<table><thead>' +
    '<tr><th rowspan="2">NO.</th><th rowspan="2">MODEL</th><th rowspan="2">DESCRIPTION</th><th colspan="3">Dimension (mm.)</th><th rowspan="2">UNIT PRICE<br>(' + curr + ')</th><th rowspan="2">Discount</th><th rowspan="2">Qty</th><th rowspan="2">AMOUNT<br>(' + curr + ')</th></tr>' +
    '<tr><th>W</th><th>D</th><th>H</th></tr>' +
    '</thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<table style="margin-top:8px;"><tr>' +
    '<td style="width:62%;vertical-align:top;padding-right:12px;"><div style="font-weight:700;margin-bottom:4px;">Remark / Terms &amp; Conditions:</div><div style="font-size:10px;line-height:1.45;">' + remarksLines + '</div></td>' +
    '<td style="width:38%;vertical-align:top;">' +
    '<table>' +
    '<tr><td style="border:1px solid #334155;padding:5px;font-weight:700;">SUB TOTAL</td><td style="border:1px solid #334155;padding:5px;text-align:right;font-weight:700;">' + subTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td></tr>' +
    '<tr><td style="border:1px solid #334155;padding:5px;">' + (fmt === 'EXPORT' ? 'VAT 0% (Export)' : 'VAT 7%') + '</td><td style="border:1px solid #334155;padding:5px;text-align:right;">' + vatAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td></tr>' +
    '<tr><td style="border:1px solid #334155;padding:5px;">Withholding Tax 3%</td><td style="border:1px solid #334155;padding:5px;text-align:right;">' + (whtAmt > 0 ? '-' : '') + whtAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td></tr>' +
    '<tr style="background:#F1F5F9;"><td style="border:1px solid #334155;padding:6px;font-weight:800;">GRAND TOTAL (' + curr + ')</td><td style="border:1px solid #334155;padding:6px;text-align:right;font-weight:800;">' + grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td></tr>' +
    '</table></td></tr></table>' +
    '<table style="margin-top:28px;text-align:center;font-size:10px;">' +
    '<tr><td style="width:25%;">Issued By<br><br><br>_______________________<br>' + (qt.salesperson || 'Sales Executive') + '</td>' +
    '<td style="width:25%;">Checked By<br><br><br>_______________________<br>Authorized Signature</td>' +
    '<td style="width:25%;">Approved By<br><br><br>_______________________<br>Authorized Signature</td>' +
    '<td style="width:25%;">Purchased By<br><br><br>_______________________<br>ผู้ซื้อ / Purchased Signature</td></tr>' +
    '</table></body></html>';
}

function generateSalesQuotationFilesInDrive_(qt) {
  var folder = getOrCreateSalesQuotationFolder_();
  var offerNo = String(qt.offerNo || 'HTH-26000').replace(/[^A-Za-z0-9_\-]/g, '_');
  var rev = String(qt.rev || 'Rev0').replace(/[^A-Za-z0-9_\-]/g, '');
  var baseName = offerNo + '_' + rev;

  var htmlContent = buildSalesQuotationA4Html_(qt);

  // 1) Convert HTML to real PDF Blob and save to Drive
  var htmlBlob = Utilities.newBlob(htmlContent, 'text/html', baseName + '.html');
  var pdfBlob = htmlBlob.getAs('application/pdf').setName(baseName + '.pdf');
  var pdfFile = folder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // 2) Create Excel-compatible (.xls) Spreadsheet file in Drive
  var xlsBlob = Utilities.newBlob('\ufeff' + htmlContent, 'application/vnd.ms-excel', baseName + '.xls');
  var xlsFile = folder.createFile(xlsBlob);
  xlsFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    pdfFile: pdfFile,
    xlsFile: xlsFile,
    pdfUrl: pdfFile.getUrl(),
    pdfDownloadUrl: 'https://drive.google.com/uc?export=download&id=' + pdfFile.getId(),
    xlsUrl: xlsFile.getUrl(),
    xlsDownloadUrl: 'https://drive.google.com/uc?export=download&id=' + xlsFile.getId()
  };
}

/**
 * สร้างไฟล์ PDF & Excel และส่ง Email แนบไฟล์จริง พร้อมเลือกผู้ส่ง / Reply-To ได้
 */
function shareSalesQuotationMultiChannel_(ss, payload) {
  var qt = payload.quotation || {};
  var channel = String(payload.channel || 'PDF_LINK').toUpperCase(); // EMAIL | LINE | SMS | PDF_LINK
  var attachType = String(payload.attachType || 'PDF').toUpperCase(); // PDF | EXCEL | BOTH
  var docType = String(qt.docType || 'ใบเสนอราคา (Quotation)');
  var dept = String(qt.department || 'Sales');
  var senderName = String(payload.senderName || qt.senderDisplayName || qt.salesperson || 'HOSHIZAKI Staff').trim();
  var senderEmail = String(payload.replyToEmail || qt.senderEmail || '').trim();

  // Always archive quotation into Google Sheets first
  saveSalesCorporateQuotation_(ss, qt);

  var files = generateSalesQuotationFilesInDrive_(qt);
  var curr = (String(qt.format || 'LOCAL').toUpperCase() === 'EXPORT') ? 'USD' : 'THB';
  var totalStr = Number(qt.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + curr;
  var scriptUrl = ScriptApp.getService().getUrl();

  var recipientContact = (channel === 'EMAIL')
    ? String(payload.toEmail || qt.customerEmail || '')
    : String(payload.smsPhone || qt.phone || '');

  var trackId = logDocumentTrackingRecord_(ss, {
    docType: docType,
    docNo: qt.offerNo || '-',
    department: dept,
    senderName: senderName,
    senderEmail: senderEmail,
    customerName: qt.customerName || 'ลูกค้า',
    recipientContact: recipientContact,
    channel: channel,
    amountText: totalStr,
    status: 'SENT'
  });

  var ackUrl = scriptUrl + '?action=trackDoc&mode=ack&id=' + encodeURIComponent(trackId);
  var missingUrl = scriptUrl + '?action=trackDoc&mode=missing&id=' + encodeURIComponent(trackId);

  if (channel === 'EMAIL') {
    var toEmail = String(payload.toEmail || '').trim();
    if (!toEmail) {
      return { status: 'ERROR', message: 'กรุณาระบุอีเมลผู้รับ (To Email)' };
    }
    var ccEmail = String(payload.ccEmail || '').trim();
    var subject = String(payload.subject || ('[' + dept + '] ' + docType + ' ' + (qt.offerNo || '') + ' (' + (qt.rev || 'Rev.0') + ') — HOSHIZAKI')).trim();

    var attachments = [];
    if (attachType === 'PDF' || attachType === 'BOTH') attachments.push(files.pdfFile.getBlob());
    if (attachType === 'EXCEL' || attachType === 'BOTH') attachments.push(files.xlsFile.getBlob());

    var plainBody =
      'เรียน คุณ' + (qt.contactPerson || qt.customerName || 'ลูกค้า') + '\n\n' +
      'แผนก ' + dept + ' บริษัท โฮชิซากิ (ประเทศไทย) จำกัด ขอนำส่ง ' + docType + ' เลขที่ ' + (qt.offerNo || '') + ' (' + (qt.rev || 'Rev.0') + ')\n' +
      'ผู้ส่งเอกสาร: ' + senderName + '\n' +
      'ยอดรวมสุทธิ: ' + totalStr + '\n\n' +
      'ยืนยันได้รับเอกสารเรียบร้อยแล้ว: ' + ackUrl + '\n' +
      'แจ้งไม่ได้รับไฟล์ / ขอส่งใหม่: ' + missingUrl + '\n' +
      'เปิดดูไฟล์ PDF ออนไลน์: ' + files.pdfUrl;

    var htmlBody =
      '<div style="font-family:Arial,sans-serif;font-size:13px;color:#0F172A;max-width:620px;border:1px solid #CBD5E1;border-radius:12px;overflow:hidden;">' +
      '<div style="background:#002B49;color:#FFF;padding:16px 20px;">' +
      '<div style="font-size:11px;color:#38BDF8;font-weight:bold;">HOSHIZAKI (THAILAND) LIMITED — ' + dept.toUpperCase() + '</div>' +
      '<div style="font-size:16px;font-weight:bold;margin-top:4px;">' + docType + ' : ' + (qt.offerNo || '') + ' (' + (qt.rev || 'Rev.0') + ')</div></div>' +
      '<div style="padding:18px 20px;">' +
      '<p>เรียน คุณ<b>' + (qt.contactPerson || qt.customerName || 'ลูกค้า') + '</b>,</p>' +
      '<p>แผนก <b>' + dept + '</b> (โดยคุณ <b>' + senderName + '</b>) ขอนำส่งเอกสารรายละเอียดดังนี้:</p>' +
      '<ul><li><b>เลขที่เอกสาร:</b> ' + (qt.offerNo || '') + ' (' + (qt.rev || 'Rev.0') + ')</li>' +
      '<li><b>ยอดรวมสุทธิ:</b> ' + totalStr + '</li>' +
      '<li><b>รหัสติดตามเอกสาร:</b> ' + trackId + '</li></ul>' +
      '<div style="margin:18px 0;text-align:center;">' +
      '<a href="' + ackUrl + '" style="display:inline-block;background:#059669;color:#FFF;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;margin:4px;">✅ ยืนยันได้รับเอกสารเรียบร้อยแล้ว</a>' +
      '<a href="' + missingUrl + '" style="display:inline-block;background:#DC2626;color:#FFF;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;margin:4px;">❓ แจ้งไม่ได้รับไฟล์ / ขอส่งใหม่</a>' +
      '</div>' +
      '<p style="font-size:12px;color:#475569;">เปิดดูไฟล์ PDF ออนไลน์: <a href="' + files.pdfUrl + '">' + files.pdfUrl + '</a></p>' +
      '</div></div>';

    var bccEmail = String(payload.bccEmail || '').trim();
    var mailOpts = {
      name: senderName + ' (' + dept + ' — HOSHIZAKI)',
      htmlBody: htmlBody,
      attachments: attachments
    };
    if (ccEmail) mailOpts.cc = ccEmail;
    if (bccEmail) mailOpts.bcc = bccEmail;
    if (senderEmail) mailOpts.replyTo = senderEmail;

    GmailApp.sendEmail(toEmail, subject, plainBody, mailOpts);

    return {
      status: 'OK',
      channel: 'EMAIL',
      trackId: trackId,
      toEmail: toEmail,
      pdfUrl: files.pdfUrl,
      xlsUrl: files.xlsUrl,
      ackUrl: ackUrl,
      message: 'ส่งอีเมลในนาม "' + senderName + ' (' + dept + ')" พร้อมปุ่มยืนยันรับเอกสารไปยัง ' + toEmail + ' เรียบร้อยแล้ว'
    };
  }

  if (channel === 'LINE') {
    var secrets = getAppSecrets_();
    var targetPhone = String(qt.phone || '').replace(/[^0-9]/g, '');
    var custLineId = targetPhone ? lookupLineUserByPhone_(ss, targetPhone) : '';
    var targetId = custLineId || secrets.lineGroupId;
    var targetToken = custLineId ? secrets.customerToken : secrets.internalToken;

    var flexCard = buildDepartmentBrandedDocumentFlexCard_({
      trackId: trackId,
      department: dept,
      docType: docType,
      docNo: qt.offerNo || '-',
      customerName: qt.customerName || 'ลูกค้า',
      senderName: senderName,
      amountText: totalStr,
      pdfUrl: files.pdfUrl,
      xlsUrl: files.xlsUrl
    });

    if (targetId && targetToken) {
      pushLineMessagesWithToken_(targetId, [flexCard], targetToken);
    }
    var extraLineGroups = Array.isArray(payload.extraLineGroupIds) ? payload.extraLineGroupIds : [];
    extraLineGroups.forEach(function(gId) {
      var cleanG = String(gId || '').trim();
      if (cleanG && cleanG !== targetId && secrets.internalToken) {
        pushLineMessagesWithToken_(cleanG, [flexCard], secrets.internalToken);
      }
    });

    return {
      status: 'OK',
      channel: 'LINE',
      trackId: trackId,
      sentToCustomerDirect: Boolean(custLineId),
      pdfUrl: files.pdfUrl,
      xlsUrl: files.xlsUrl,
      ackUrl: ackUrl
    };
  }

  return {
    status: 'OK',
    channel: channel,
    trackId: trackId,
    pdfUrl: files.pdfUrl,
    pdfDownloadUrl: files.pdfDownloadUrl,
    xlsUrl: files.xlsUrl,
    ackUrl: ackUrl,
    missingUrl: missingUrl
  };
}


// ============================================================================
// SECTION 15: DEPARTMENT-BRANDED FLEX CARDS & DOCUMENT TRACKING ENGINE (v1144)
// ============================================================================
function getDepartmentFlexTheme_(dept) {
  var d = String(dept || 'Sales').trim();
  var u = d.toUpperCase();
  if (u.indexOf('JAPAN') !== -1 || u.indexOf('JPC') !== -1 || u.indexOf('FURUJO') !== -1) {
    return {
      deptLabel: 'JAPANESE CORPORATE DIVISION',
      deptShort: 'Japanese Corporate',
      headerBg: '#1E1B4B',
      accentColor: '#FBBF24',
      badgeBg: '#312E81'
    };
  }
  if (u.indexOf('MARKET') !== -1 || u.indexOf('MKT') !== -1) {
    return {
      deptLabel: 'MARKETING & PRODUCT DIVISION',
      deptShort: 'Marketing',
      headerBg: '#065F46',
      accentColor: '#6EE7B7',
      badgeBg: '#047857'
    };
  }
  if (u.indexOf('SERVICE') !== -1 || u.indexOf('BILLING') !== -1 || u.indexOf('ACCOUNT') !== -1) {
    return {
      deptLabel: 'SERVICE & BILLING DIVISION',
      deptShort: 'Service & Billing',
      headerBg: '#7F1D1D',
      accentColor: '#FECACA',
      badgeBg: '#991B1B'
    };
  }
  return {
    deptLabel: 'COMMERCIAL SALES DIVISION',
    deptShort: 'Sales',
    headerBg: '#002B49',
    accentColor: '#38BDF8',
    badgeBg: '#0369A1'
  };
}

function ensureDocumentTrackingSheet_(ss) {
  var sheet = ss.getSheetByName('Document_Tracking_Log') || ss.insertSheet('Document_Tracking_Log');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 14)
      .setValues([[
        'Track ID', 'Doc Type', 'Doc No.', 'Department', 'Sender Name', 'Sender Email',
        'Customer Name', 'Recipient Contact', 'Channel (LINE/EMAIL/SMS)', 'Amount',
        'Tracking Status', 'Sent At', 'Confirmed At', 'Customer Feedback / Note'
      ]])
      .setFontWeight('bold')
      .setBackground('#002B49')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logDocumentTrackingRecord_(ss, info) {
  var sheet = ensureDocumentTrackingSheet_(ss);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var trackId = String(info.trackId || ('TRK-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss')));
  sheet.appendRow([
    trackId,
    info.docType || 'Quotation',
    info.docNo || '',
    info.department || 'Sales',
    info.senderName || 'HOSHIZAKI Staff',
    info.senderEmail || '',
    info.customerName || '',
    info.recipientContact || '',
    info.channel || 'LINE',
    info.amountText || '',
    info.status || 'SENT',
    nowStr,
    '',
    info.note || ''
  ]);
  return trackId;
}

function updateDocumentTrackingStatus_(ss, trackId, newStatus, feedbackNote, actorName) {
  var sheet = ensureDocumentTrackingSheet_(ss);
  var secrets = getAppSecrets_();
  var cleanId = String(trackId || '').trim().toUpperCase();
  if (sheet.getLastRow() < 2) return { status: 'NOT_FOUND', trackId: cleanId };

  var data = sheet.getDataRange().getValues();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || '').trim().toUpperCase() === cleanId) {
      var docType = String(data[i][1] || 'เอกสาร');
      var docNo = String(data[i][2] || '-');
      var dept = String(data[i][3] || 'Sales');
      var senderName = String(data[i][4] || '-');
      var customerName = String(data[i][6] || 'ลูกค้า');
      var channel = String(data[i][8] || '-');

      sheet.getRange(i + 1, 11).setValue(newStatus);
      sheet.getRange(i + 1, 13).setValue(nowStr);
      if (feedbackNote) {
        sheet.getRange(i + 1, 14).setValue(feedbackNote + (actorName ? (' (' + actorName + ')') : ''));
      }

      // Notify internal LINE group clearly identifying Department & Sender
      if (isLineGroupConfigured() && isLineTokenConfigured()) {
        var isAck = (newStatus === 'ACKNOWLEDGED');
        var icon = isAck ? '✅' : '🚨';
        var titleTxt = isAck
          ? 'ลูกค้ายืนยันได้รับเอกสารเรียบร้อยแล้ว (DOCUMENT ACKNOWLEDGED)'
          : 'ลูกค้าแจ้งไม่ได้รับเอกสาร / ขอติดต่อกลับ (MISSING DOC ALERT)';

        pushLineMessagesWithToken_(secrets.lineGroupId, [{
          type: 'text',
          text:
            icon + ' [' + titleTxt + ']\n' +
            '• แผนกเจ้าของเรื่อง: ' + dept + '\n' +
            '• ผู้ส่งเอกสาร: ' + senderName + '\n' +
            '• ประเภท/เลขที่เอกสาร: ' + docType + ' [' + docNo + ']\n' +
            '• ลูกค้า: ' + customerName + (actorName ? (' (' + actorName + ')') : '') + '\n' +
            '• ช่องทางที่ส่ง: ' + channel + '\n' +
            '• สถานะล่าสุด: ' + newStatus + ' (' + nowStr + ')' +
            (feedbackNote ? ('\n• หมายเหตุ: ' + feedbackNote) : '')
        }], secrets.internalToken);
      }

      return {
        status: 'OK',
        trackId: cleanId,
        docType: docType,
        docNo: docNo,
        department: dept,
        senderName: senderName,
        customerName: customerName,
        trackingStatus: newStatus,
        confirmedAt: nowStr
      };
    }
  }
  return { status: 'NOT_FOUND', trackId: cleanId };
}

function buildDepartmentBrandedDocumentFlexCard_(opts) {
  var theme = getDepartmentFlexTheme_(opts.department);
  var scriptUrl = ScriptApp.getService().getUrl();
  var trackId = opts.trackId || '';
  var docTypeLabel = opts.docType || 'ใบเสนอราคา (Quotation)';
  var docNo = opts.docNo || '-';
  var customerName = opts.customerName || 'ลูกค้า';
  var senderName = opts.senderName || 'เจ้าหน้าที่ HOSHIZAKI';
  var amountText = opts.amountText || '-';
  var pdfUrl = opts.pdfUrl || scriptUrl;
  var xlsUrl = opts.xlsUrl || '';

  var footerButtons = [
    {
      type: 'button',
      style: 'primary',
      color: '#059669',
      height: 'sm',
      action: {
        type: 'postback',
        label: '✅ ยืนยันได้รับเอกสารเรียบร้อยแล้ว',
        data: 'DOC_TRACK_ACK:' + trackId + ':' + theme.deptShort,
        displayText: 'ยืนยันได้รับ' + docTypeLabel + ' เลขที่ ' + docNo + ' (' + theme.deptShort + ') เรียบร้อยแล้วครับ'
      }
    },
    {
      type: 'button',
      style: 'primary',
      color: '#0284C7',
      height: 'sm',
      action: {
        type: 'postback',
        label: '✍️ อนุมัติสั่งซื้อ / ยืนยันใบเสนอราคา (Approve)',
        data: 'DOC_PO_APPROVE:' + trackId + ':' + theme.deptShort,
        displayText: 'ยืนยันอนุมัติสั่งซื้อตามเอกสารเลขที่ ' + docNo + ' (' + theme.deptShort + ') ครับ'
      }
    },
    {
      type: 'button',
      style: 'primary',
      color: '#DC2626',
      height: 'sm',
      action: {
        type: 'postback',
        label: '❓ แจ้งไม่ได้รับไฟล์ / ขอส่งใหม่',
        data: 'DOC_TRACK_MISSING:' + trackId + ':' + theme.deptShort,
        displayText: 'แจ้งไม่ได้รับ' + docTypeLabel + ' เลขที่ ' + docNo + ' (' + theme.deptShort + ') รบกวนตรวจสอบครับ'
      }
    },
    {
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'uri',
        label: '📕 เปิดดู / ดาวน์โหลดเอกสาร PDF',
        uri: pdfUrl
      }
    }
  ];

  if (xlsUrl) {
    footerButtons.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'uri',
        label: '📗 ดาวน์โหลดไฟล์ Excel (.xls)',
        uri: xlsUrl
      }
    });
  }

  return {
    type: 'flex',
    altText: '📄 [' + theme.deptShort + '] ' + docTypeLabel + ' เลขที่ ' + docNo + ' จากคุณ ' + senderName,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: theme.headerBg,
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '🏢 ' + theme.deptLabel, color: theme.accentColor, size: 'xxs', weight: 'bold' },
          { type: 'text', text: docTypeLabel + ' : ' + docNo, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '14px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            cornerRadius: '8px',
            paddingAll: '10px',
            spacing: 'xs',
            contents: [
              { type: 'text', text: '🏷️ แผนกที่ส่ง: ' + theme.deptShort, weight: 'bold', size: 'xs', color: theme.headerBg, wrap: true },
              { type: 'text', text: '👤 ผู้ส่งเอกสาร: ' + senderName, weight: 'bold', size: 'xs', color: '#0F172A', wrap: true },
              { type: 'text', text: '🏢 ถึงลูกค้า: ' + customerName, size: 'xs', color: '#334155', wrap: true },
              { type: 'text', text: '💰 ยอดรวมสุทธิ: ' + amountText, weight: 'bold', size: 'sm', color: '#059669', wrap: true }
            ]
          },
          { type: 'text', text: '📌 รหัสติดตามเอกสาร: ' + trackId + '\nกรุณากดปุ่มด้านล่างเพื่อยืนยันการรับเอกสารจากแผนก ' + theme.deptShort + ' ครับ', size: 'xxs', color: '#64748B', margin: 'xs', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '12px',
        contents: footerButtons
      }
    }
  };
}

function buildWebDocumentTrackingHtmlPage_(trackId, actionType) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var scriptUrl = ScriptApp.getService().getUrl();

  if (actionType === 'missing') {
    var resMiss = updateDocumentTrackingStatus_(ss, trackId, 'MISSING_REPORTED', 'ลูกค้ากดปุ่มแจ้งไม่ได้รับเอกสารผ่านลิงก์ Email/SMS', 'Web Link');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>HOSHIZAKI Document Alert — ' + trackId + '</title></head>' +
      '<body style="margin:0;background:#F1F5F9;font-family:Arial,sans-serif;padding:20px;">' +
      '<div style="max-width:520px;margin:30px auto;background:#FFF;border-radius:16px;padding:22px;box-shadow:0 10px 25px rgba(0,0,0,0.1);">' +
      '<h2 style="color:#991B1B;margin-top:0;">⚠️ แจ้งเตือนฝ่ายดูแลเอกสารเรียบร้อยแล้ว</h2>' +
      '<p>ระบบแจ้งเตือนไปยังแผนก <b>' + (resMiss.department || '') + '</b> และคุณ <b>' + (resMiss.senderName || '') + '</b> เพื่อรีบจัดส่งเอกสารเลขที่ <b>' + (resMiss.docNo || trackId) + '</b> ให้อีกครั้งครับ</p>' +
      '</div></body></html>';
  }

  // Record receipt acknowledgement immediately on open, and present E-Signature + PO Upload form!
  var resAck = updateDocumentTrackingStatus_(ss, trackId, 'ACKNOWLEDGED', 'ลูกค้าเปิดลิงก์ยืนยันรับเอกสาร', 'Web Portal');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HOSHIZAKI E-Signature & PO Confirmation — ' + trackId + '</title></head>' +
    '<body style="margin:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;padding:14px;color:#0F172A;">' +
    '<div style="max-width:560px;margin:16px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(0,43,73,0.14);">' +
    '<div style="background:#002B49;color:#FFFFFF;padding:18px 22px;">' +
    '<div style="font-size:11px;color:#38BDF8;font-weight:800;">HOSHIZAKI (THAILAND) LIMITED — DIGITAL PO &amp; E-SIGNATURE</div>' +
    '<div style="font-size:17px;font-weight:700;margin-top:4px;">ยืนยันรับเอกสาร &amp; ลงนามอนุมัติสั่งซื้อ (E-Sign)</div></div>' +
    '<div style="padding:20px 22px;">' +
    '<div style="background:#DCFCE7;color:#166534;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;margin-bottom:14px;">✅ บันทึกการยืนยันรับเอกสารเรียบร้อยแล้ว (' + (resAck.docNo || trackId) + ')</div>' +
    '<div style="font-size:12.5px;color:#334155;line-height:1.6;margin-bottom:14px;background:#F8FAFC;padding:10px 12px;border-radius:10px;border:1px solid #E2E8F0;">' +
    '<div><b>รหัสติดตาม:</b> ' + trackId + ' | <b>แผนก:</b> ' + (resAck.department || '-') + '</div>' +
    '<div><b>ผู้ส่งเอกสาร:</b> ' + (resAck.senderName || '-') + ' | <b>ลูกค้า:</b> ' + (resAck.customerName || '-') + '</div>' +
    '</div>' +
    '<div style="font-weight:700;font-size:14px;color:#002B49;margin-bottom:8px;">✍️ ลงนามอนุมัติสั่งซื้อ / แนบใบสั่งซื้อ (PO) กลับเข้าระบบ:</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px;">' +
    '<input id="signerName" type="text" placeholder="ชื่อ-นามสกุล ผู้มีอำนาจลงนาม *" style="padding:9px;border:1px solid #CBD5E1;border-radius:8px;" />' +
    '<input id="signerTitle" type="text" placeholder="ตำแหน่ง / แผนก (เช่น ผู้จัดการฝ่ายจัดซื้อ)" style="padding:9px;border:1px solid #CBD5E1;border-radius:8px;" />' +
    '<input id="customerPoNo" type="text" placeholder="เลขที่ใบสั่งซื้อของลูกค้า Customer PO No. (ถ้ามี)" style="padding:9px;border:1px solid #CBD5E1;border-radius:8px;" />' +
    '<div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">แนบไฟล์ใบสั่งซื้อ PO (PDF / รูปถ่าย - ถ้ามี):</label>' +
    '<input id="poFileInput" type="file" accept=".pdf,image/*" style="font-size:12px;" /></div>' +
    '<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
    '<span style="font-size:12px;font-weight:700;">วาดลายเซ็นอิเล็กทรอนิกส์ (E-Signature):</span>' +
    '<button type="button" onclick="clearSig()" style="background:#E2E8F0;border:none;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">ล้างลายเซ็น</button></div>' +
    '<canvas id="sigPad" width="480" height="150" style="width:100%;height:150px;border:1.5px dashed #64748B;border-radius:10px;background:#FFF;touch-action:none;"></canvas></div>' +
    '<button type="button" id="submitPoBtn" onclick="submitSignedPo()" style="background:#059669;color:#FFF;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:14px;cursor:pointer;">🚀 ยืนยันลงนาม &amp; ส่งอนุมัติสั่งซื้อทันที</button>' +
    '<div id="resMsg" style="display:none;padding:12px;border-radius:10px;font-size:13px;"></div>' +
    '</div></div></div>' +
    '<script>' +
    'var canvas=document.getElementById("sigPad"),ctx=canvas.getContext("2d"),drawing=false;' +
    'function getPos(e){var r=canvas.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return {x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)};}' +
    'canvas.addEventListener("mousedown",function(e){drawing=true;var p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);});' +
    'canvas.addEventListener("mousemove",function(e){if(!drawing)return;var p=getPos(e);ctx.lineWidth=2.5;ctx.lineCap="round";ctx.strokeStyle="#002B49";ctx.lineTo(p.x,p.y);ctx.stroke();});' +
    'window.addEventListener("mouseup",function(){drawing=false;});' +
    'canvas.addEventListener("touchstart",function(e){e.preventDefault();drawing=true;var p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);},{passive:false});' +
    'canvas.addEventListener("touchmove",function(e){e.preventDefault();if(!drawing)return;var p=getPos(e);ctx.lineWidth=2.5;ctx.lineCap="round";ctx.strokeStyle="#002B49";ctx.lineTo(p.x,p.y);ctx.stroke();},{passive:false});' +
    'canvas.addEventListener("touchend",function(){drawing=false;});' +
    'function clearSig(){ctx.clearRect(0,0,canvas.width,canvas.height);}' +
    'function submitSignedPo(){' +
    '  var sName=document.getElementById("signerName").value.trim();' +
    '  if(!sName){alert("กรุณาระบุชื่อผู้มีอำนาจลงนามครับ");return;}' +
    '  var btn=document.getElementById("submitPoBtn");btn.disabled=true;btn.textContent="⏳ กำลังบันทึกข้อมูลและลายเซ็น...";' +
    '  var fInp=document.getElementById("poFileInput");' +
    '  var sendPayload=function(fileB64,fName,fMime){' +
    '    fetch("' + scriptUrl + '",{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},' +
    '      body:JSON.stringify({action:"submitCustomerSignedPo",trackId:"' + trackId + '",signerName:sName,' +
    '        signerTitle:document.getElementById("signerTitle").value,customerPoNo:document.getElementById("customerPoNo").value,' +
    '        signatureDataUrl:canvas.toDataURL("image/png"),poFileBase64:fileB64||"",poFileName:fName||"",poMimeType:fMime||""})' +
    '    }).then(function(r){return r.json();}).then(function(d){' +
    '      var box=document.getElementById("resMsg");box.style.display="block";box.style.background="#DCFCE7";box.style.color="#166534";' +
    '      box.innerHTML="🎉 <b>ลงนามอนุมัติสั่งซื้อสำเร็จ!</b> ระบบแจ้งไปยังฝ่ายขายและฝ่ายบัญชี HOSHIZAKI เรียบร้อยแล้วครับ";' +
    '      btn.textContent="✅ บันทึกเรียบร้อยแล้ว";' +
    '    });' +
    '  };' +
    '  if(fInp.files&&fInp.files[0]){var fr=new FileReader();fr.onload=function(){sendPayload(fr.result,fInp.files[0].name,fInp.files[0].type);};fr.readAsDataURL(fInp.files[0]);}' +
    '  else{sendPayload("","","");}' +
    '}' +
    '</script></body></html>';
}

function getDocumentTrackingList_(ss, deptFilter) {
  var sheet = ensureDocumentTrackingSheet_(ss);
  if (sheet.getLastRow() < 2) return [];
  var vals = sheet.getDataRange().getValues();
  var out = [];
  var filterU = String(deptFilter || '').trim().toUpperCase();
  for (var i = vals.length - 1; i >= 1 && out.length < 100; i--) {
    var dept = String(vals[i][3] || '');
    if (filterU && filterU !== 'ALL' && dept.toUpperCase().indexOf(filterU) === -1) continue;
    out.push({
      trackId: vals[i][0],
      docType: vals[i][1],
      docNo: vals[i][2],
      department: dept,
      senderName: vals[i][4],
      senderEmail: vals[i][5],
      customerName: vals[i][6],
      recipientContact: vals[i][7],
      channel: vals[i][8],
      amountText: vals[i][9],
      status: vals[i][10],
      sentAt: vals[i][11],
      confirmedAt: vals[i][12],
      note: vals[i][13]
    });
  }
  return out;
}


// ============================================================================
// SECTION 16: OMNI-BRIDGE CROSS-DEPARTMENT HANDOVER, LIVE SYNC & 24H WATCHDOG (v1145)
// ============================================================================
function getLiveSalesCrmMasterFromSheets_(ss) {
  var sheets = ensureSalesCrmSheets_(ss);
  var staff = [];
  if (sheets.staffSheet.getLastRow() >= 2) {
    var sVals = sheets.staffSheet.getDataRange().getValues();
    for (var i = 1; i < sVals.length; i++) {
      if (!sVals[i][0]) continue;
      if (String(sVals[i][4] || 'ACTIVE').toUpperCase() === 'INACTIVE') continue;
      staff.push({
        code: String(sVals[i][0]).trim(),
        name: String(sVals[i][1] || sVals[i][0]).trim(),
        dept: String(sVals[i][2] || 'Sales').trim(),
        role: String(sVals[i][3] || '').trim(),
        email: String(sVals[i][5] || '').trim()
      });
    }
  }

  var customers = [];
  if (sheets.custSheet.getLastRow() >= 2) {
    var cVals = sheets.custSheet.getDataRange().getValues();
    for (var j = 1; j < cVals.length; j++) {
      if (!cVals[j][0]) continue;
      customers.push({
        name: String(cVals[j][0]).trim(),
        paymentTerms: String(cVals[j][1] || '30DAYS').trim(),
        assignedSales: String(cVals[j][2] || '').trim(),
        address: String(cVals[j][4] || '').trim(),
        phone: String(cVals[j][5] || '').trim()
      });
    }
  }

  var models = [];
  if (sheets.modelSheet.getLastRow() >= 2) {
    var mVals = sheets.modelSheet.getDataRange().getValues();
    for (var k = 1; k < mVals.length; k++) {
      if (!mVals[k][2]) continue;
      models.push({
        status: String(mVals[k][0] || 'active').trim(),
        factory: String(mVals[k][1] || '').trim(),
        model: String(mVals[k][2]).trim(),
        type: String(mVals[k][3] || '').trim(),
        w: mVals[k][4] !== '' ? mVals[k][4] : '',
        d: mVals[k][5] !== '' ? mVals[k][5] : '',
        h: mVals[k][6] !== '' ? mVals[k][6] : '',
        prefix: String(mVals[k][7] || '').trim(),
        description: String(mVals[k][8] || '').trim()
      });
    }
  }

  return {
    status: 'OK',
    companyHeader: CURRENT_COMPANY_HEADER,
    activeStaff: staff,
    customers: customers,
    models: models,
    emailGroups: getEmailGroupsFromSheets_(ss),
    stockMap: getLiveStockMap_(ss),
    portalUrl: ScriptApp.getService().getUrl() + '?action=portal',
    damageDemoList: getDamageDemoInspectionList_(ss)
  };
}

/**
 * ศูนย์ส่งต่องานข้ามแผนก 1 คลิก (Cross-Department Handover Hub)
 * - SALES_TO_SERVICE_INSTALL: ส่งต่อเปิดงานติดตั้งเครื่องใหม่ + ลงทะเบียน S/N เข้าฐานรับประกัน
 * - TO_ACCOUNTING_BILLING: ส่งต่อออกใบวางบิล / ใบกำกับภาษี / ใบเสร็จรับเงิน
 * - SERVICE_TO_SALES_REPLACE: ส่งต่อโอกาสขายเครื่องใหม่ / Trade-in จากงานซ่อม
 */
function dispatchCrossDeptHandover_(ss, payload) {
  var secrets = getAppSecrets_();
  var handoverType = String(payload.handoverType || 'SALES_TO_SERVICE_INSTALL').toUpperCase();
  var fromDept = String(payload.fromDept || 'Sales').trim();
  var toDept = String(payload.toDept || 'Service & Installation').trim();
  var senderName = String(payload.senderName || 'เจ้าหน้าที่ HOSHIZAKI').trim();
  var refDocNo = String(payload.refDocNo || '-').trim();
  var customerName = String(payload.customerName || '-').trim();
  var customerPhone = String(payload.customerPhone || '-').trim();
  var address = String(payload.address || '-').trim();
  var modelSummary = String(payload.modelSummary || '-').trim();
  var serialNo = String(payload.serialNo || '').trim().toUpperCase();
  var amountText = String(payload.amountText || '-').trim();
  var notes = String(payload.notes || '').trim();

  var sheet = ss.getSheetByName('Cross_Dept_Handovers') || ss.insertSheet('Cross_Dept_Handovers');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 12)
      .setValues([[
        'Handover ID', 'Created At', 'Handover Type', 'From Dept', 'To Dept', 'Sender',
        'Ref Doc No.', 'Customer Name', 'Phone', 'Model / S/N', 'Amount', 'Status & Notes'
      ]])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var hId = 'HND-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');

  sheet.appendRow([
    hId, nowStr, handoverType, fromDept, toDept, senderName,
    refDocNo, customerName, customerPhone, modelSummary + (serialNo ? (' | S/N: ' + serialNo) : ''),
    amountText, 'OPEN' + (notes ? (' — ' + notes) : '')
  ]);

  // If Sales -> Service Installation & Serial No provided, auto-register into Serial_Dealer_Master!
  if (handoverType === 'SALES_TO_SERVICE_INSTALL' && serialNo) {
    var snSheet = ensureSerialDealerMasterSheet_(ss);
    snSheet.appendRow([
      serialNo,
      modelSummary,
      customerName,
      customerPhone,
      address,
      'IN-WARRANTY (ติดตั้งใหม่จาก ' + refDocNo + ')',
      'HOSHIZAKI Direct (' + fromDept + ')',
      senderName,
      '02-005-9980',
      secrets.lineGroupId,
      'ส่งต่อติดตั้งจากใบเสนอราคา ' + refDocNo
    ]);
  }

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    var badgeTitle = '🔄 ส่งต่องานข้ามแผนก (' + fromDept + ' ➔ ' + toDept + ')';
    if (handoverType === 'SALES_TO_SERVICE_INSTALL') badgeTitle = '🛠️ เปิดงานติดตั้งเครื่องใหม่ (' + fromDept + ' ➔ Service)';
    if (handoverType === 'TO_ACCOUNTING_BILLING') badgeTitle = '🧾 ส่งต่อออกใบวางบิล/ใบเสร็จ (' + fromDept + ' ➔ Accounting)';
    if (handoverType === 'SERVICE_TO_SALES_REPLACE') badgeTitle = '💡 แจ้งโอกาสขายเครื่องใหม่/Trade-in (Service ➔ Sales)';

    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        badgeTitle + '\n' +
        '• รหัสส่งต่อ: ' + hId + ' (อ้างอิง: ' + refDocNo + ')\n' +
        '• ผู้ส่งเรื่อง: ' + senderName + ' [' + fromDept + ']\n' +
        '• ลูกค้า: ' + customerName + ' (' + customerPhone + ')\n' +
        '• รุ่นเครื่อง/รายการ: ' + modelSummary + (serialNo ? (' | S/N: ' + serialNo) : '') + '\n' +
        '• มูลค่า: ' + amountText +
        (notes ? ('\n• หมายเหตุ: ' + notes) : '')
    }], secrets.internalToken);
  }

  return {
    status: 'OK',
    handoverId: hId,
    fromDept: fromDept,
    toDept: toDept,
    serialRegistered: Boolean(handoverType === 'SALES_TO_SERVICE_INSTALL' && serialNo),
    createdAt: nowStr
  };
}

/**
 * 24-Hour Unacknowledged Document Follow-Up Watchdog
 */
function checkDocumentTrackingWatchdog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var sheet = ensureDocumentTrackingSheet_(ss);
  if (sheet.getLastRow() < 2 || !isLineGroupConfigured()) return;

  var data = sheet.getDataRange().getValues();
  var nowMs = Date.now();
  var dayMs = 24 * 60 * 60 * 1000;

  for (var i = 1; i < data.length; i++) {
    var st = String(data[i][10] || '').trim().toUpperCase();
    if (st === 'SENT') {
      var sentMs = new Date(data[i][11]).getTime();
      if (!isNaN(sentMs) && (nowMs - sentMs) >= dayMs) {
        var trkId = String(data[i][0]);
        var docType = String(data[i][1]);
        var docNo = String(data[i][2]);
        var dept = String(data[i][3]);
        var sender = String(data[i][4]);
        var cust = String(data[i][6]);
        sheet.getRange(i + 1, 11).setValue('FOLLOWUP_24H');
        pushLineMessagesWithToken_(secrets.lineGroupId, [{
          type: 'text',
          text:
            '⏰ [ติดตามเอกสารค้างตอบรับ > 24 ชม.]\n' +
            '• แผนก / ผู้ส่ง: ' + dept + ' (' + sender + ')\n' +
            '• เอกสาร: ' + docType + ' [' + docNo + '] (' + trkId + ')\n' +
            '• ลูกค้า: ' + cust + '\n' +
            'ลูกค้ายังไม่กดยืนยันรับเอกสาร แนะนำให้โทรหรือทักติดตามครับ'
        }], secrets.internalToken);
      }
    }
  }
}

function installAllWatchdogTriggersV1145() {
  var docFn = 'checkDocumentTrackingWatchdog';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === docFn) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger(docFn).timeBased().everyHours(6).create();
  var dealerRes = installDealerSlaWatchdogTrigger();
  return { status: 'OK', docWatchdog: 'Every 6 hours', dealerWatchdog: dealerRes };
}


// ============================================================================
// SECTION 17: GROUP CC/BCC (7 DEPARTMENTS), TAX ID, 1-CLICK CONVERT & BI DASHBOARD (v1146)
// ============================================================================
var DEFAULT_EMAIL_GROUPS = [
  ['SALES_ALL', 'All Sales Team', 'ketsaraporn@hoshizaki.co.th, kulathida@hoshizaki.co.th, janyaluck@hoshizaki.co.th', '', 'CC', 'Sales'],
  ['JPC_TEAM', 'Japanese Corporate Division', 'furujo@hoshizaki.co.th', '', 'CC', 'Japanese Corporate'],
  ['MARKETING_ALL', 'Marketing & Product Team', 'marketing@hoshizaki.co.th', '', 'CC', 'Marketing'],
  ['SERVICE_ALL', 'Service & Technical Support', 'noparin@hoshizaki.co.th, services@hoshizaki.co.th', '', 'CC', 'Service'],
  ['FINANCE_ACC', 'Finance & Accounting Dept', 'accounting@hoshizaki.co.th', '', 'CC', 'Accounting'],
  ['ADMIN_HR', 'Admin & HR Dept', 'admin@hoshizaki.co.th', '', 'CC', 'Admin'],
  ['MANAGEMENT_BCC', 'Executive Management (BCC)', 'noparin@hoshizaki.co.th', '', 'BCC', 'Management']
];

function ensureEmailGroupsSheet_(ss) {
  var sheet = ss.getSheetByName('CRM_Email_Groups') || ss.insertSheet('CRM_Email_Groups');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 6)
      .setValues([['Group Code', 'Group Label', 'Member Emails (Comma Separated)', 'LINE Group ID (Optional)', 'Default Mode (CC/BCC)', 'Department']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, DEFAULT_EMAIL_GROUPS.length, 6).setValues(DEFAULT_EMAIL_GROUPS);
  }
  return sheet;
}

function getEmailGroupsFromSheets_(ss) {
  var sheet = ensureEmailGroupsSheet_(ss);
  var vals = sheet.getDataRange().getValues();
  var groups = [];
  for (var i = 1; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    groups.push({
      code: String(vals[i][0]).trim(),
      label: String(vals[i][1] || vals[i][0]).trim(),
      emails: String(vals[i][2] || '').trim(),
      lineGroupId: String(vals[i][3] || '').trim(),
      defaultMode: String(vals[i][4] || 'CC').trim().toUpperCase(),
      department: String(vals[i][5] || 'General').trim()
    });
  }
  return groups;
}

function setupEmailGroupsAndTaxMasterV1146() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureEmailGroupsSheet_(ss);
  ensureSalesCrmSheets_(ss);
  ensureDocumentTrackingSheet_(ss);
  return { status: 'OK', version: 'v1146-ENTERPRISE-COMPLETE', groupsReady: true };
}

function getUnifiedExecutiveBiSummary_(ss) {
  var qtSheet = ss.getSheetByName('Sales_Quotations_2026');
  var trkSheet = ensureDocumentTrackingSheet_(ss);
  var tktSheet = ss.getSheetByName('LINE_Tech_Support_Tickets');

  var totalQtCount = 0;
  var totalQtAmountThb = 0;
  var deptBreakdown = {};

  if (qtSheet && qtSheet.getLastRow() >= 2) {
    var qVals = qtSheet.getDataRange().getValues();
    for (var i = 1; i < qVals.length; i++) {
      totalQtCount++;
      var dept = String(qVals[i][4] || 'Sales');
      var amt = Number(qVals[i][16] || 0);
      totalQtAmountThb += amt;
      deptBreakdown[dept] = (deptBreakdown[dept] || 0) + amt;
    }
  }

  var trkStats = { SENT: 0, ACKNOWLEDGED: 0, PO_APPROVED: 0, MISSING_REPORTED: 0, FOLLOWUP_24H: 0 };
  if (trkSheet && trkSheet.getLastRow() >= 2) {
    var tVals = trkSheet.getDataRange().getValues();
    for (var j = 1; j < tVals.length; j++) {
      var st = String(tVals[j][10] || 'SENT').toUpperCase();
      if (trkStats[st] !== undefined) trkStats[st]++;
      else trkStats.SENT++;
    }
  }

  var svcStats = { totalTickets: 0, fcrResolved: 0, dealerAccepted: 0, openTickets: 0 };
  if (tktSheet && tktSheet.getLastRow() >= 2) {
    var sVals = tktSheet.getDataRange().getValues();
    for (var k = 1; k < sVals.length; k++) {
      svcStats.totalTickets++;
      var sst = String(sVals[k][7] || '').toUpperCase();
      if (sst === 'FCR_RESOLVED') svcStats.fcrResolved++;
      else if (sst === 'DEALER_ACCEPTED') svcStats.dealerAccepted++;
      else if (sst.indexOf('OPEN') !== -1 || sst.indexOf('ESCALATED') !== -1 || sst.indexOf('DISPATCHED') !== -1) svcStats.openTickets++;
    }
  }

  return {
    status: 'OK',
    quotations: { count: totalQtCount, totalAmount: totalQtAmountThb, byDept: deptBreakdown },
    tracking: trkStats,
    service: svcStats
  };
}


// ============================================================================
// SECTION 18: 5-PILLAR ENTERPRISE NEXT-GEN SUITE (v1148)
//   1) Predictive PM & Warranty Renewal Engine (60-Day Advance Alert + Auto Draft)
//   2) Customer & Dealer Self-Service Web Portal (`?action=portal`)
//   3) Multi-Tier Discount & Manager Approval Matrix (0-5% Auto | 5.1-12% Mgr | >12% MD/JPC)
//   4) Live Stock-on-Hand & Lead-Time Checker + Soft Reserve (`Live_Stock_Master`)
//   5) Automated Weekly Executive Briefing & AI Sales Follow-Up Copilot
// ============================================================================

// --- PILLAR 4: LIVE STOCK-ON-HAND & LEAD-TIME MASTER ---
function ensureLiveStockMasterSheet_(ss) {
  var sheet = ss.getSheetByName('Live_Stock_Master') || ss.insertSheet('Live_Stock_Master');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 7)
      .setValues([['Model', 'Ready Stock (Units)', 'Reserved (Units)', 'Available (Units)', 'Lead Time', 'Warehouse', 'Updated At']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sheet.getRange(2, 1, 8, 7).setValues([
      ['IM-30CNE', 12, 0, 12, 'พร้อมส่ง (3-7 วัน)', 'BKK-WH1', nowStr],
      ['IM-45CNE', 9, 1, 8, 'พร้อมส่ง (3-7 วัน)', 'BKK-WH1', nowStr],
      ['IM-65NE', 6, 0, 6, 'พร้อมส่ง (3-7 วัน)', 'BKK-WH1', nowStr],
      ['IM-100NE', 5, 1, 4, 'พร้อมส่ง (7-15 วัน)', 'BKK-WH1', nowStr],
      ['IM-130NE', 4, 0, 4, 'พร้อมส่ง (7-15 วัน)', 'BKK-WH1', nowStr],
      ['IM-240ANE', 2, 0, 2, 'พร้อมส่ง (7-15 วัน)', 'BKK-WH1', nowStr],
      ['KM-470AJ', 0, 0, 0, 'สั่งนำเข้า (45-60 วัน)', 'HC-FACTORY', nowStr],
      ['FM-300AKE-SB', 1, 0, 1, 'พร้อมส่ง (7-15 วัน)', 'BKK-WH1', nowStr]
    ]);
  }
  return sheet;
}

function getLiveStockMap_(ss) {
  var sheet = ensureLiveStockMasterSheet_(ss);
  var vals = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < vals.length; i++) {
    var m = String(vals[i][0] || '').trim().toUpperCase();
    if (!m) continue;
    var ready = Number(vals[i][1] || 0);
    var resv = Number(vals[i][2] || 0);
    var avail = Math.max(0, ready - resv);
    map[m] = {
      model: m,
      ready: ready,
      reserved: resv,
      available: avail,
      leadTime: String(vals[i][4] || (avail > 0 ? 'พร้อมส่ง (7-15 วัน)' : 'สั่งนำเข้า (60-90 วัน)')).trim(),
      warehouse: String(vals[i][5] || 'BKK-WH1').trim()
    };
  }
  return map;
}

function softReserveStockForQuotation_(ss, offerNo, items) {
  var sheet = ensureLiveStockMasterSheet_(ss);
  var vals = sheet.getDataRange().getValues();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var reservedModels = [];
  (items || []).forEach(function(it) {
    var m = String(it.model || '').trim().toUpperCase();
    var qty = Number(it.qty || 1);
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim().toUpperCase() === m) {
        var ready = Number(vals[i][1] || 0);
        var curRes = Number(vals[i][2] || 0);
        var newRes = curRes + qty;
        var avail = Math.max(0, ready - newRes);
        sheet.getRange(i + 1, 3, 1, 2).setValues([[newRes, avail]]);
        sheet.getRange(i + 1, 7).setValue(nowStr);
        reservedModels.push(m + ' x' + qty);
      }
    }
  });
  return reservedModels;
}

// --- PILLAR 3: MULTI-TIER DISCOUNT & MANAGER APPROVAL MATRIX ---
function evaluateDiscountApprovalTier_(qt) {
  var items = Array.isArray(qt.items) ? qt.items : [];
  var gross = 0;
  var totalDisc = 0;
  items.forEach(function(it) {
    var q = Number(it.qty || 1);
    var up = Number(it.unitPrice || 0);
    var d = Number(it.discount || 0);
    gross += up * q;
    totalDisc += d * q;
  });
  var discPct = gross > 0 ? (totalDisc / gross) * 100 : 0;
  var grand = Number(qt.grandTotal || 0);

  if (discPct > 12 || grand >= 500000) {
    return {
      required: true,
      tier: 'TIER_3_EXECUTIVE_MD',
      approverRole: 'Managing Director / Japanese Corporate Head',
      discountPct: Math.round(discPct * 100) / 100
    };
  }
  if (discPct > 5 || grand >= 250000) {
    return {
      required: true,
      tier: 'TIER_2_DEPT_MANAGER',
      approverRole: 'Department Manager (Sales / Service Manager)',
      discountPct: Math.round(discPct * 100) / 100
    };
  }
  return {
    required: false,
    tier: 'TIER_1_AUTO_APPROVED',
    approverRole: 'Self-Approved (<= 5%)',
    discountPct: Math.round(discPct * 100) / 100
  };
}

function requestManagerDiscountApproval_(ss, qt) {
  var secrets = getAppSecrets_();
  var rule = evaluateDiscountApprovalTier_(qt);
  var offerNo = String(qt.offerNo || ('HTH-26' + String(Date.now()).slice(-4))).trim().toUpperCase();
  var rev = String(qt.rev || 'Rev.0').trim();
  var dept = String(qt.department || 'Sales').trim();
  var sender = String(qt.senderDisplayName || qt.salesperson || 'Sales Executive').trim();
  var curr = (String(qt.format || 'LOCAL').toUpperCase() === 'EXPORT') ? 'USD' : 'THB';
  var totalStr = Number(qt.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + curr;

  var appSheet = ss.getSheetByName('Quotation_Approvals') || ss.insertSheet('Quotation_Approvals');
  if (appSheet.getLastRow() === 0) {
    appSheet.getRange(1, 1, 1, 10)
      .setValues([['Approval ID', 'Offer No.', 'Rev', 'Department', 'Requester', 'Customer', 'Grand Total', 'Discount %', 'Required Tier', 'Status / Approver']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    appSheet.setFrozenRows(1);
  }

  var appId = 'APR-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
  appSheet.appendRow([
    appId, offerNo, rev, dept, sender, qt.customerName || '-',
    totalStr, rule.discountPct + '%', rule.approverRole, 'PENDING'
  ]);

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    var flexApproval = {
      type: 'flex',
      altText: '🔐 ขออนุมัติส่วนลด/ใบเสนอราคา ' + offerNo + ' (' + rule.discountPct + '%)',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#7C2D12',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: '🔐 MANAGER APPROVAL REQUEST (' + rule.tier + ')', color: '#FDE68A', size: 'xxs', weight: 'bold' },
            { type: 'text', text: offerNo + ' (' + rev + ') — ส่วนลด ' + rule.discountPct + '%', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          paddingAll: '14px',
          contents: [
            { type: 'text', text: '• แผนก / ผู้ขออนุมัติ: ' + dept + ' — ' + sender, size: 'xs', color: '#0F172A', wrap: true },
            { type: 'text', text: '• ลูกค้า: ' + (qt.customerName || '-'), size: 'xs', color: '#334155', wrap: true },
            { type: 'text', text: '• ยอดสุทธิหลังส่วนลด: ' + totalStr, weight: 'bold', size: 'sm', color: '#059669', wrap: true },
            { type: 'text', text: '• ผู้อนุมัติตามเกณฑ์: ' + rule.approverRole, size: 'xs', color: '#B45309', wrap: true }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#059669',
              height: 'sm',
              action: {
                type: 'postback',
                label: '✅ อนุมัติใบเสนอราคา (Approve Discount)',
                data: 'MGR_DISCOUNT_APPROVE:' + appId + ':' + offerNo,
                displayText: 'อนุมัติส่วนลดใบเสนอราคา ' + offerNo + ' (' + appId + ') เรียบร้อยแล้ว'
              }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#DC2626',
              height: 'sm',
              action: {
                type: 'postback',
                label: '❌ ไม่อนุมัติ / ขอให้ปรับราคาใหม่ (Reject)',
                data: 'MGR_DISCOUNT_REJECT:' + appId + ':' + offerNo,
                displayText: 'ไม่อนุมัติส่วนลดใบเสนอราคา ' + offerNo + ' กรุณาปรับราคาใหม่'
              }
            }
          ]
        }
      }
    };
    pushLineMessagesWithToken_(secrets.lineGroupId, [flexApproval], secrets.internalToken);
  }

  return {
    status: 'OK',
    approvalId: appId,
    offerNo: offerNo,
    rule: rule,
    message: 'ส่งคำขออนุมัติส่วนลด (' + rule.discountPct + '%) ไปยัง ' + rule.approverRole + ' ผ่าน LINE เรียบร้อยแล้ว'
  };
}

function handleManagerApprovalDecision_(ss, appId, offerNo, isApproved, managerUserId) {
  var secrets = getAppSecrets_();
  var mgrName = getLineUserDisplayName_(managerUserId, secrets.internalToken);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var appSheet = ss.getSheetByName('Quotation_Approvals');
  if (appSheet && appSheet.getLastRow() >= 2) {
    var vals = appSheet.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]).trim().toUpperCase() === String(appId).trim().toUpperCase()) {
        appSheet.getRange(i + 1, 10).setValue((isApproved ? 'APPROVED by ' : 'REJECTED by ') + mgrName + ' (' + nowStr + ')');
        break;
      }
    }
  }
  return (isApproved ? '✅ บันทึกการอนุมัติใบเสนอราคา ' : '❌ บันทึกการไม่อนุมัติใบเสนอราคา ') + offerNo + ' โดยคุณ ' + mgrName + ' เรียบร้อยแล้วครับ';
}

// --- PILLAR 1: PREDICTIVE PM & WARRANTY RENEWAL ENGINE ---
function getWarrantyAndPmRenewalCandidates_(ss) {
  var sheet = ensureSerialDealerMasterSheet_(ss);
  var vals = sheet.getDataRange().getValues();
  var candidates = [];
  var today = new Date();
  var sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  for (var i = 1; i < vals.length; i++) {
    var sn = String(vals[i][0] || '').trim();
    if (!sn) continue;
    var model = String(vals[i][1] || '').trim();
    var cust = String(vals[i][2] || '').trim();
    var phone = String(vals[i][3] || '').trim();
    var province = String(vals[i][4] || '').trim();
    var warrantyTxt = String(vals[i][5] || '').trim();
    var dealer = String(vals[i][6] || '').trim();

    var dateMatch = warrantyTxt.match(/(20[2-3][0-9]-[0-1][0-9]-[0-3][0-9])/);
    var daysRemaining = null;
    var urgency = 'PM_CYCLE_DUE';
    if (dateMatch) {
      var expDate = new Date(dateMatch[1] + 'T00:00:00');
      daysRemaining = Math.round((expDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (daysRemaining <= 0) urgency = 'WARRANTY_EXPIRED';
      else if (daysRemaining <= 60) urgency = 'EXPIRING_WITHIN_60D';
      else urgency = 'ACTIVE_PM_CONTRACT';
    }

    candidates.push({
      serialNumber: sn,
      model: model,
      customerName: cust,
      phone: phone,
      province: province,
      warrantyStatus: warrantyTxt,
      daysRemaining: daysRemaining,
      urgency: urgency,
      dealerName: dealer,
      suggestedPmPrice: /IM-240|KM-470|KM-590|FM-600|FM-1000/i.test(model) ? 6500 : 4500
    });
  }
  return candidates;
}

function checkWarrantyAndPmRenewalWatchdog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  if (!isLineGroupConfigured()) return { status: 'NO_GROUP' };

  var list = getWarrantyAndPmRenewalCandidates_(ss);
  var dueList = list.filter(function(x) {
    return x.urgency === 'EXPIRING_WITHIN_60D' || x.urgency === 'WARRANTY_EXPIRED';
  });

  if (dueList.length > 0) {
    var lines = dueList.slice(0, 10).map(function(d) {
      return '• S/N ' + d.serialNumber + ' (' + d.model + ') — ' + d.customerName +
        ' [' + (d.daysRemaining !== null ? ('เหลือ ' + d.daysRemaining + ' วัน') : d.warrantyStatus) + ']';
    });
    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        '🔔 [PREDICTIVE PM & WARRANTY RENEWAL ALERT]\n' +
        'พบเครื่องใกล้หมดประกัน / ถึงรอบต่อสัญญา PM รายปี (' + dueList.length + ' รายการ):\n' +
        lines.join('\n') + '\n' +
        '👉 เปิดเมนู "ต่ออายุสัญญา PM & ประกัน" บนเว็บแอปเพื่อสร้างใบเสนอราคาต่อสัญญาได้ทันทีครับ'
    }], secrets.internalToken);
  }
  return { status: 'OK', alertCount: dueList.length };
}

// --- PILLAR 2: CUSTOMER & DEALER SELF-SERVICE WEB PORTAL (`?action=portal`) ---
function buildCustomerDealerSelfServicePortalHtml_(ss, portalType, queryKey) {
  var pType = String(portalType || 'customer').toLowerCase();
  var q = String(queryKey || '').trim().toUpperCase();
  var snSheet = ensureSerialDealerMasterSheet_(ss);
  var snVals = snSheet.getDataRange().getValues();
  var tktSheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  var tktVals = (tktSheet && tktSheet.getLastRow() >= 2) ? tktSheet.getDataRange().getValues() : [];

  var assets = [];
  for (var i = 1; i < snVals.length; i++) {
    var rowStr = snVals[i].join(' ').toUpperCase();
    if (!q || rowStr.indexOf(q) !== -1) {
      assets.push({
        sn: snVals[i][0],
        model: snVals[i][1],
        cust: snVals[i][2],
        phone: snVals[i][3],
        province: snVals[i][4],
        warranty: snVals[i][5],
        dealer: snVals[i][6]
      });
    }
  }

  var tickets = [];
  for (var j = tktVals.length - 1; j >= 1 && tickets.length < 30; j--) {
    var tStr = tktVals[j].join(' ').toUpperCase();
    if (!q || tStr.indexOf(q) !== -1) {
      tickets.push({
        id: tktVals[j][0],
        date: tktVals[j][1],
        cust: tktVals[j][3],
        model: tktVals[j][4],
        sn: tktVals[j][5],
        status: tktVals[j][7],
        dealer: tktVals[j][8],
        reply: tktVals[j][11]
      });
    }
  }

  var assetRows = assets.slice(0, 40).map(function(a) {
    return '<tr><td style="border:1px solid #CBD5E1;padding:7px;font-weight:700;">' + a.sn + '</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + a.model + '</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + a.cust + ' (' + a.province + ')</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + a.warranty + '</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + a.dealer + '</td></tr>';
  }).join('') || '<tr><td colspan="5" style="padding:14px;text-align:center;color:#64748B;">ไม่พบรายการเครื่องที่ค้นหา</td></tr>';

  var ticketRows = tickets.map(function(t) {
    return '<tr><td style="border:1px solid #CBD5E1;padding:7px;font-weight:700;">' + t.id + '</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + t.cust + '</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + t.model + ' (' + t.sn + ')</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;font-weight:700;">' + t.status + '</td>' +
      '<td style="border:1px solid #CBD5E1;padding:7px;">' + (t.reply || '-') + '</td></tr>';
  }).join('') || '<tr><td colspan="5" style="padding:14px;text-align:center;color:#64748B;">ยังไม่มีประวัติงานบริการ</td></tr>';

  var scriptUrl = ScriptApp.getService().getUrl();
  var titleLabel = (pType === 'dealer')
    ? 'AUTHORIZED DEALER SERVICE & WARRANTY PORTAL'
    : 'CUSTOMER FLEET & SERVICE HISTORY PORTAL';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HOSHIZAKI ' + titleLabel + '</title></head>' +
    '<body style="margin:0;background:#F1F5F9;font-family:Arial,sans-serif;color:#0F172A;">' +
    '<div style="background:#002B49;color:#FFF;padding:18px 24px;">' +
    '<div style="font-size:11px;color:#38BDF8;font-weight:800;">HOSHIZAKI (THAILAND) LIMITED — SELF-SERVICE PORTAL</div>' +
    '<h2 style="margin:4px 0 0;font-size:19px;">' + titleLabel + '</h2></div>' +
    '<div style="max-width:980px;margin:18px auto;padding:0 14px;">' +
    '<form method="get" action="' + scriptUrl + '" style="background:#FFF;padding:14px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
    '<input type="hidden" name="action" value="portal" />' +
    '<select name="type" style="padding:9px;border:1px solid #CBD5E1;border-radius:8px;font-weight:700;">' +
    '<option value="customer"' + (pType === 'customer' ? ' selected' : '') + '>🏢 Customer Fleet Portal (ลูกค้า)</option>' +
    '<option value="dealer"' + (pType === 'dealer' ? ' selected' : '') + '>🤝 Dealer Service Portal (ตัวแทนจำหน่าย)</option>' +
    '</select>' +
    '<input type="text" name="q" value="' + q + '" placeholder="พิมพ์ชื่อร้าน / เบอร์โทร / Serial No. / ชื่อดีลเลอร์..." style="flex:1;min-width:220px;padding:9px;border:1px solid #CBD5E1;border-radius:8px;" />' +
    '<button type="submit" style="background:#0284C7;color:#FFF;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;">🔎 ค้นหาข้อมูล</button>' +
    '</form>' +
    '<div style="background:#FFF;padding:16px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);margin-bottom:16px;overflow-x:auto;">' +
    '<h3 style="margin:0 0 10px;color:#002B49;">❄️ รายการเครื่องและสถานะการรับประกัน (Registered Equipment Fleet)</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
    '<thead><tr style="background:#002B49;color:#FFF;"><th style="padding:8px;">Serial No.</th><th style="padding:8px;">Model</th><th style="padding:8px;">ลูกค้า / สาขา</th><th style="padding:8px;">สถานะประกัน</th><th style="padding:8px;">ผู้ดูแล / ดีลเลอร์</th></tr></thead>' +
    '<tbody>' + assetRows + '</tbody></table></div>' +
    '<div style="background:#FFF;padding:16px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);overflow-x:auto;">' +
    '<h3 style="margin:0 0 10px;color:#002B49;">🛠️ ประวัติการแจ้งซ่อมและบำรุงรักษา (Service &amp; PM Logs)</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
    '<thead><tr style="background:#0F172A;color:#FFF;"><th style="padding:8px;">Ticket ID</th><th style="padding:8px;">ลูกค้า</th><th style="padding:8px;">รุ่น / S/N</th><th style="padding:8px;">สถานะ</th><th style="padding:8px;">บันทึกการดำเนินการ</th></tr></thead>' +
    '<tbody>' + ticketRows + '</tbody></table></div></div></body></html>';
}

// --- PILLAR 5: WEEKLY EXECUTIVE BRIEFING & AI SALES FOLLOW-UP COPILOT ---
function runAiSalesFollowUpCopilot_(ss) {
  var trkSheet = ensureDocumentTrackingSheet_(ss);
  var vals = trkSheet.getDataRange().getValues();
  var staleItems = [];
  var nowMs = Date.now();
  var threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  for (var i = 1; i < vals.length; i++) {
    var st = String(vals[i][10] || '').toUpperCase();
    if (st === 'SENT' || st === 'ACKNOWLEDGED' || st === 'FOLLOWUP_24H') {
      var sentMs = new Date(vals[i][11]).getTime();
      if (!isNaN(sentMs) && (nowMs - sentMs) >= threeDaysMs) {
        staleItems.push({
          trackId: vals[i][0],
          docType: vals[i][1],
          docNo: vals[i][2],
          dept: vals[i][3],
          sender: vals[i][4],
          customer: vals[i][6],
          amount: vals[i][9],
          daysAgo: Math.floor((nowMs - sentMs) / (24 * 60 * 60 * 1000))
        });
      }
    }
  }
  return staleItems;
}

function sendWeeklyExecutiveBriefing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var bi = getUnifiedExecutiveBiSummary_(ss);
  var pmDue = getWarrantyAndPmRenewalCandidates_(ss).filter(function(x) {
    return x.urgency === 'EXPIRING_WITHIN_60D' || x.urgency === 'WARRANTY_EXPIRED';
  });
  var staleQt = runAiSalesFollowUpCopilot_(ss);

  var reportText =
    '📊 [HOSHIZAKI WEEKLY EXECUTIVE BRIEFING]\n' +
    '1️⃣ ฝ่ายขาย & องค์กรญี่ปุ่น (Sales / JPC):\n' +
    '   • ใบเสนอราคาสะสม: ' + bi.quotations.count + ' ฉบับ (มูลค่ารวม ' + Number(bi.quotations.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ')\n' +
    '   • ลูกค้าอนุมัติสั่งซื้อ (PO Approved): ' + (bi.tracking.PO_APPROVED || 0) + ' รายการ\n' +
    '   • เอกสารรอติดตามผล (> 3 วัน): ' + staleQt.length + ' รายการ\n' +
    '2️⃣ ฝ่ายบริการ & ตัวแทนจำหน่าย (Service & Dealers):\n' +
    '   • เคสบริการทั้งหมด: ' + bi.service.totalTickets + ' เคส | ปิดจบเอง (FCR): ' + bi.service.fcrResolved + ' | ดีลเลอร์รับงาน: ' + bi.service.dealerAccepted + '\n' +
    '   • เครื่องใกล้หมดประกัน / รอต่อสัญญา PM: ' + pmDue.length + ' เครื่อง\n' +
    '🔗 เปิดดู Dashboard เต็มรูปแบบ: ' + secrets.pwaUrl;

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessagesWithToken_(secrets.mgmtGroupId || secrets.lineGroupId, [{ type: 'text', text: reportText }], secrets.internalToken);
  }
  return { status: 'OK', summary: reportText };
}

function installAllPhase2TriggersV1148() {
  installAllWatchdogTriggersV1145();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'checkWarrantyAndPmRenewalWatchdog' || fn === 'sendWeeklyExecutiveBriefing') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkWarrantyAndPmRenewalWatchdog').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('sendWeeklyExecutiveBriefing').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(17).inTimezone('Asia/Bangkok').create();
  return { status: 'OK', triggers: ['DealerSLA(30m)', 'DocWatchdog(6h)', 'PMRenewal(Daily 08:00)', 'ExecBriefing(Fri 17:00)'] };
}


// ============================================================================
// SECTION 19: AUTOMATED MICHIRU-RPA EMAIL STOCK-ON-HAND IMPORTER (v1149)
//   - Searches Gmail for `subject:"Daily stock report"` with attachment `Stock on Hand*.xlsx`
//   - Archives original .xlsx into Drive folder `HOSHIZAKI_Daily_Stock_Archive`
//   - Parses exact columns of `Stock on Hand` (Row 19 header) & `Sheet` (602 Damage/Demo links)
//   - Updates `Live_Stock_Master` & `Damage_Demo_Inspection` sheets + pushes LINE summary!
// ============================================================================
var DAILY_STOCK_ARCHIVE_FOLDER = 'HOSHIZAKI_Daily_Stock_Archive';

function getOrCreateDailyStockFolder_() {
  var folders = DriveApp.getFoldersByName(DAILY_STOCK_ARCHIVE_FOLDER);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DAILY_STOCK_ARCHIVE_FOLDER);
}

function importDailyStockFromGmail() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var secrets = getAppSecrets_();
  var threads = GmailApp.search('subject:"Daily stock report" has:attachment', 0, 5);
  if (!threads || threads.length === 0) {
    return { status: 'NO_EMAIL', message: 'ไม่พบอีเมลหัวข้อ "Daily stock report" ที่มีไฟล์แนบใน Gmail' };
  }

  var targetBlob = null;
  var emailSubject = '';
  var emailDateStr = '';

  for (var t = 0; t < threads.length && !targetBlob; t++) {
    var msgs = threads[t].getMessages();
    for (var m = msgs.length - 1; m >= 0 && !targetBlob; m--) {
      var atts = msgs[m].getAttachments();
      for (var a = 0; a < atts.length; a++) {
        var name = String(atts[a].getName() || '');
        if (/stock\s*on\s*hand.*\.xlsx?$/i.test(name)) {
          targetBlob = atts[a].copyBlob();
          emailSubject = msgs[m].getSubject();
          emailDateStr = Utilities.formatDate(msgs[m].getDate(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
          break;
        }
      }
    }
  }

  if (!targetBlob) {
    return { status: 'NO_XLSX', message: 'พบอีเมล แต่ไม่พบไฟล์แนบ Stock on Hand (.xlsx)' };
  }

  // 1) Save original .xlsx file to Google Drive archive folder
  var archiveFolder = getOrCreateDailyStockFolder_();
  var savedXlsx = archiveFolder.createFile(targetBlob);

  // 2) Convert .xlsx to temporary Google Spreadsheet (Supports BOTH Drive API v3 `create` & v2 `insert`)
  var tempFileId = '';
  try {
    if (typeof Drive !== 'undefined' && Drive.Files) {
      if (typeof Drive.Files.create === 'function') {
        // Drive API v3 (Default in modern Google Apps Script)
        var resV3 = {
          name: 'TEMP_SOH_' + Date.now(),
          mimeType: MimeType.GOOGLE_SHEETS,
          parents: [archiveFolder.getId()]
        };
        var convV3 = Drive.Files.create(resV3, targetBlob);
        tempFileId = convV3.id;
      } else if (typeof Drive.Files.insert === 'function') {
        // Drive API v2 legacy fallback
        var resV2 = {
          title: 'TEMP_SOH_' + Date.now(),
          mimeType: MimeType.GOOGLE_SHEETS,
          parents: [{ id: archiveFolder.getId() }]
        };
        var convV2 = Drive.Files.insert(resV2, targetBlob, { convert: true });
        tempFileId = convV2.id;
      }
    }
    if (!tempFileId) {
      throw new Error('Drive Advanced Service ยังไม่ถูกเปิดใช้งาน');
    }
  } catch (convErr) {
    return {
      status: 'DRIVE_API_REQUIRED',
      fileUrl: savedXlsx.getUrl(),
      message: 'บันทึกไฟล์ลง Drive แล้ว แต่กรุณาเปิด Services (+) > Drive API ใน Google Apps Script เพื่อแปลงไฟล์ .xlsx อัตโนมัติ: ' + convErr.message
    };
  }

  try {
    var tempSs = SpreadsheetApp.openById(tempFileId);
    var sohSheet = tempSs.getSheetByName('Stock on Hand') || tempSs.getSheets()[1] || tempSs.getSheets()[0];
    var dmgSheet = tempSs.getSheetByName('Sheet');

    var sohVals = sohSheet.getDataRange().getValues();
    var headerIdx = -1;
    var colMap = {};

    for (var r = 0; r < Math.min(30, sohVals.length); r++) {
      var rowStr = sohVals[r].map(function(c) { return String(c || '').trim(); });
      if (rowStr.indexOf('No.') !== -1 && rowStr.indexOf('Item No.') !== -1) {
        headerIdx = r;
        rowStr.forEach(function(colName, idx) {
          if (colName && colMap[colName] === undefined) colMap[colName] = idx;
        });
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error('ไม่พบแถวหัวตาราง (No. / Item No.) ในชีต Stock on Hand');
    }

    var idxNo = colMap['No.'];
    var idxItem = colMap['Item No.'];
    var idxDesc = colMap['Item Description'] !== undefined ? colMap['Item Description'] : 4;
    var idxPoQty = colMap['Qty Receipt PO'] !== undefined ? colMap['Qty Receipt PO'] : 14;
    var idxLoc = colMap['Location'] !== undefined ? colMap['Location'] : 17;
    var idxAge = colMap['Item Age'] !== undefined ? colMap['Item Age'] : 20;
    var idxQty = colMap['Qty'] !== undefined ? colMap['Qty'] : 22;
    var idxSb = colMap['Sale Blanket Order No'] !== undefined ? colMap['Sale Blanket Order No'] : 27;

    var damageLocs = { 'HHE-DAMAGE': 1, 'NNR-DAMAGE': 1, 'BKK-DAMAGE': 1, 'SC-DAMAGE': 1, 'SC-TRANING': 1, 'BORROW': 1 };
    var summary = {};

    for (var i = headerIdx + 1; i < sohVals.length; i++) {
      var row = sohVals[i];
      var noVal = Number(row[idxNo]);
      if (!noVal || isNaN(noVal)) continue;

      var qty = Number(row[idxQty] || 0);
      var poQty = Number(row[idxPoQty] || 0);
      if (qty <= 0 && poQty <= 0) continue;

      var model = String(row[idxItem] || '').trim().toUpperCase();
      if (!model) continue;

      var desc = String(row[idxDesc] || '').trim();
      var loc = String(row[idxLoc] || '').trim().toUpperCase();
      var sbNo = String(row[idxSb] || '').trim();
      var age = Number(row[idxAge] || 0);

      if (!summary[model]) {
        summary[model] = {
          model: model,
          description: desc,
          ready: 0,
          reserved: 0,
          incomingPo: 0,
          damageHold: 0,
          warehouses: {},
          maxAge: 0
        };
      }
      var rec = summary[model];
      if (damageLocs[loc]) {
        rec.damageHold += qty;
      } else {
        rec.ready += qty;
        if (sbNo && qty > 0) rec.reserved += qty;
      }
      rec.incomingPo += poQty;
      if (loc) rec.warehouses[loc] = true;
      if (age > rec.maxAge) rec.maxAge = age;
    }

    var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    var stockRows = [];
    var readyModelCount = 0;

    Object.keys(summary).sort().forEach(function(m) {
      var s = summary[m];
      var avail = Math.max(0, s.ready - s.reserved);
      if (avail > 0) readyModelCount++;
      var whStr = Object.keys(s.warehouses).join(',') || 'HHE';
      var leadTxt = avail > 0
        ? ('พร้อมส่ง ' + avail + ' เครื่อง (' + whStr + ')')
        : (s.incomingPo > 0 ? ('PO กำลังเข้า ' + s.incomingPo + ' เครื่อง') : (s.damageHold > 0 ? ('เครื่องโชว์/มีตำหนิ ' + s.damageHold + ' เครื่อง') : 'สั่งนำเข้า (60-90 วัน)'));

      stockRows.push([m, s.ready, s.reserved, avail, leadTxt, whStr, nowStr]);
    });

    var liveSheet = ensureLiveStockMasterSheet_(ss);
    if (liveSheet.getLastRow() > 1) {
      liveSheet.getRange(2, 1, liveSheet.getLastRow() - 1, 7).clearContent();
    }
    if (stockRows.length > 0) {
      liveSheet.getRange(2, 1, stockRows.length, 7).setValues(stockRows);
    }

    // 3) Also parse Damage / Demo / Inspection Report sheet (`Sheet`)
    var dmgCount = 0;
    if (dmgSheet) {
      var dVals = dmgSheet.getDataRange().getValues();
      var dOut = [];
      for (var d = 3; d < dVals.length; d++) {
        var dItem = String(dVals[d][1] || '').trim();
        var dSn = String(dVals[d][2] || '').trim();
        var dRem = String(dVals[d][4] || dVals[d][3] || '').trim();
        var dLink = String(dVals[d][5] || '').trim();
        if (dItem && dItem !== 'Item No.' && dItem !== 'False') {
          dOut.push([dItem, dSn, dRem, dLink.indexOf('http') === 0 ? dLink : '', nowStr]);
        }
      }
      var targetDmgSheet = ss.getSheetByName('Damage_Demo_Inspection') || ss.insertSheet('Damage_Demo_Inspection');
      targetDmgSheet.clear();
      targetDmgSheet.getRange(1, 1, 1, 5)
        .setValues([['Model', 'Serial No.', 'Inspection Remark', 'Report Link', 'Updated At']])
        .setFontWeight('bold').setBackground('#7C2D12').setFontColor('#FFFFFF');
      targetDmgSheet.setFrozenRows(1);
      if (dOut.length > 0) {
        targetDmgSheet.getRange(2, 1, dOut.length, 5).setValues(dOut);
      }
      dmgCount = dOut.length;
    }

    if (isLineGroupConfigured() && isLineTokenConfigured()) {
      pushLineMessagesWithToken_(secrets.lineGroupId, [{
        type: 'text',
        text:
          '📦 [AUTO EMAIL STOCK SYNC — MICHIRU-RPA]\n' +
          '✅ อัปเดตสต็อกสินค้าประจำวันอัตโนมัติเรียบร้อยแล้ว\n' +
          '• อีเมลต้นทาง: ' + emailSubject + ' (' + emailDateStr + ')\n' +
          '• รุ่นเครื่องในระบบสต็อก: ' + stockRows.length + ' รุ่น (พร้อมส่งทันที ' + readyModelCount + ' รุ่น)\n' +
          '• รายการเครื่องโชว์/มีตำหนิพร้อมใบตรวจสภาพ: ' + dmgCount + ' เครื่อง'
      }], secrets.internalToken);
    }

    return {
      status: 'OK',
      emailSubject: emailSubject,
      totalModels: stockRows.length,
      readyModels: readyModelCount,
      damageDemoCount: dmgCount,
      updatedAt: nowStr
    };
  } finally {
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (eDel) {}
    }
  }
}

function getDamageDemoInspectionList_(ss) {
  var sh = ss.getSheetByName('Damage_Demo_Inspection');
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    out.push({
      model: vals[i][0],
      serialNo: vals[i][1],
      remark: vals[i][2],
      link: vals[i][3]
    });
  }
  return out;
}

function installDailyEmailStockTriggerV1149() {
  installAllPhase2TriggersV1148();
  var fnName = 'importDailyStockFromGmail';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === fnName) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Runs daily at 18:00 (20 mins after MICHIRU-RPA 17:39 daily email)
  ScriptApp.newTrigger(fnName)
    .timeBased()
    .everyDays(1)
    .atHour(18)
    .inTimezone('Asia/Bangkok')
    .create();
  return { status: 'OK', emailStockTrigger: 'Daily at 18:00 (Asia/Bangkok)' };
}


// ============================================================================
// SECTION 20: ERP/NAV ORDER EXPORT, LINE RICH MENU DEPLOYER & GO-LIVE QA SUITE (v1150)
// ============================================================================

/**
 * 1) ส่งออกรายการที่ลูกค้าอนุมัติสั่งซื้อ (`PO_APPROVED`) หรือใบเสนอราคาเป็นรูปแบบพร้อมนำเข้า ERP / NAV
 */
function exportPoApprovedOrdersForErp_(ss) {
  var qtSheet = ss.getSheetByName('Sales_Quotations_2026');
  var trkSheet = ensureDocumentTrackingSheet_(ss);
  var approvedNos = {};

  if (trkSheet && trkSheet.getLastRow() >= 2) {
    var tVals = trkSheet.getDataRange().getValues();
    for (var i = 1; i < tVals.length; i++) {
      var st = String(tVals[i][10] || '').toUpperCase();
      if (st === 'PO_APPROVED') {
        approvedNos[String(tVals[i][2] || '').trim().toUpperCase()] = {
          confirmedAt: tVals[i][12],
          note: tVals[i][13]
        };
      }
    }
  }

  var erpRows = [];
  if (qtSheet && qtSheet.getLastRow() >= 2) {
    var qVals = qtSheet.getDataRange().getValues();
    for (var r = 1; r < qVals.length; r++) {
      var offerNo = String(qVals[r][0] || '').trim().toUpperCase();
      var rev = String(qVals[r][1] || 'Rev.0').trim();
      var dateStr = String(qVals[r][2] || '').trim();
      var currency = String(qVals[r][3] || 'LOCAL').toUpperCase() === 'EXPORT' ? 'USD' : 'THB';
      var dept = String(qVals[r][4] || 'Sales').trim();
      var salesCode = String(qVals[r][5] || '').trim();
      var custName = String(qVals[r][6] || '').trim();
      var payTerms = String(qVals[r][10] || '30DAYS').trim();
      var itemsJson = String(qVals[r][12] || '[]');
      var status = String(qVals[r][17] || 'ISSUED').trim();

      var isApproved = Boolean(approvedNos[offerNo]) || status === 'PO_APPROVED';
      var items = [];
      try { items = JSON.parse(itemsJson); } catch (e) {}

      if (items.length === 0) {
        erpRows.push({
          orderStatus: isApproved ? 'PO_APPROVED' : status,
          offerNo: offerNo,
          rev: rev,
          date: dateStr,
          department: dept,
          salespersonCode: salesCode,
          customerName: custName,
          paymentTerms: payTerms,
          currency: currency,
          itemNo: '-',
          description: '-',
          qty: 0,
          unitPrice: 0,
          discount: 0,
          lineAmount: Number(qVals[r][13] || 0)
        });
      } else {
        items.forEach(function(it) {
          var q = Number(it.qty || 1);
          var up = Number(it.unitPrice || 0);
          var disc = Number(it.discount || 0);
          erpRows.push({
            orderStatus: isApproved ? 'PO_APPROVED' : status,
            offerNo: offerNo,
            rev: rev,
            date: dateStr,
            department: dept,
            salespersonCode: salesCode,
            customerName: custName,
            paymentTerms: payTerms,
            currency: currency,
            itemNo: it.model || '-',
            description: it.description || '-',
            qty: q,
            unitPrice: up,
            discount: disc,
            lineAmount: Math.max(0, (up - disc) * q)
          });
        });
      }
    }
  }

  return { status: 'OK', rows: erpRows };
}

/**
 * 2) ติดตั้ง LINE Rich Menu 6 ปุ่มมาตรฐานบน Customer LINE OA และ Internal LINE OA อัตโนมัติ
 */
function deployCustomerLineRichMenu() {
  var secrets = getAppSecrets_();
  if (!secrets.customerToken) {
    return { status: 'ERROR', message: 'ไม่พบ CUSTOMER_LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties' };
  }

  var richMenuObj = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'HOSHIZAKI_Customer_Menu_v1150',
    chatBarText: 'เมนูบริการ HOSHIZAKI ▾',
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: 'camera', label: 'สแกนป้าย/แจ้งซ่อม' } },
      { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: 'message', label: 'เช็กสถานะงานซ่อม', text: 'STATUS' } },
      { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: 'uri', label: 'เช็กประกัน & ประวัติเครื่อง', uri: ScriptApp.getService().getUrl() + '?action=portal&type=customer' } },
      { bounds: { x: 0, y: 843, width: 833, height: 843 }, action: { type: 'message', label: 'ขอใบเสนอราคาเครื่องใหม่', text: 'สนใจขอใบเสนอราคาเครื่องทำน้ำแข็ง / ตู้แช่ HOSHIZAKI ครับ' } },
      { bounds: { x: 833, y: 843, width: 834, height: 843 }, action: { type: 'message', label: 'สั่งไส้กรองน้ำ 4HC-H / PM', text: 'สนใจสั่งซื้อไส้กรองน้ำ 4HC-H / นัดล้างบำรุงรักษา PM ครับ' } },
      { bounds: { x: 1667, y: 843, width: 833, height: 843 }, action: { type: 'uri', label: 'โทรศูนย์บริการ', uri: 'tel:020059980' } }
    ]
  };

  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secrets.customerToken },
    payload: JSON.stringify(richMenuObj),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText() || '{}');
  return {
    status: res.getResponseCode() === 200 ? 'OK' : 'ERROR',
    richMenuId: json.richMenuId || '',
    note: 'สร้างโครงสร้าง Rich Menu 6 ปุ่มสำเร็จ (อัปโหลดภาพพื้นหลัง 2500x1686 px ใน LINE Official Account Manager เพื่อเปิดแสดงผล)'
  };
}

/**
 * 3) ระบบตรวจสอบความพร้อมก่อน Go-Live (Pre-Launch QA) และล้างข้อมูลทดสอบอย่างปลอดภัย
 */
function runProductionReadinessCheck_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = getAppSecrets_();
  var checks = [
    { item: 'Customer LINE OA Token', ok: Boolean(s.customerToken), detail: s.customerToken ? 'Configured' : 'Missing' },
    { item: 'Internal Staff LINE OA Token', ok: Boolean(s.internalToken), detail: s.internalToken ? 'Configured' : 'Missing' },
    { item: 'Target LINE Group ID', ok: isLineGroupConfigured(), detail: s.lineGroupId },
    { item: 'Gemini AI Vision Key', ok: isGeminiConfigured_(), detail: isGeminiConfigured_() ? GEMINI_MODEL_NAME : 'Not Set' },
    { item: 'Google Drive Advanced API (v2/v3)', ok: (typeof Drive !== 'undefined' && Boolean(Drive.Files)), detail: (typeof Drive !== 'undefined' && Drive.Files) ? (typeof Drive.Files.create === 'function' ? 'Drive API v3 Active' : 'Drive API v2 Active') : 'Disabled (Enable in Services +)' },
    { item: 'CRM Staff Directory', ok: Boolean(ss.getSheetByName('CRM_Staff_Directory')), detail: (ss.getSheetByName('CRM_Staff_Directory') ? Math.max(0, ss.getSheetByName('CRM_Staff_Directory').getLastRow() - 1) : 0) + ' staff' },
    { item: 'CRM Customer Master (700)', ok: Boolean(ss.getSheetByName('CRM_Customer_Master')), detail: (ss.getSheetByName('CRM_Customer_Master') ? Math.max(0, ss.getSheetByName('CRM_Customer_Master').getLastRow() - 1) : 0) + ' customers' },
    { item: 'CRM Model Catalog (331)', ok: Boolean(ss.getSheetByName('CRM_Model_Catalog')), detail: (ss.getSheetByName('CRM_Model_Catalog') ? Math.max(0, ss.getSheetByName('CRM_Model_Catalog').getLastRow() - 1) : 0) + ' models' },
    { item: '7-Dept Email CC/BCC Groups', ok: Boolean(ss.getSheetByName('CRM_Email_Groups')), detail: (ss.getSheetByName('CRM_Email_Groups') ? Math.max(0, ss.getSheetByName('CRM_Email_Groups').getLastRow() - 1) : 0) + ' groups' },
    { item: 'Live Stock Master (MICHIRU-RPA)', ok: Boolean(ss.getSheetByName('Live_Stock_Master')), detail: (ss.getSheetByName('Live_Stock_Master') ? Math.max(0, ss.getSheetByName('Live_Stock_Master').getLastRow() - 1) : 0) + ' models in stock' },
    { item: 'Active Automation Triggers', ok: ScriptApp.getProjectTriggers().length > 0, detail: ScriptApp.getProjectTriggers().length + ' triggers active' }
  ];
  return { status: 'OK', version: 'v1155-DEEP-SCAN-VERIFIED', checks: checks };
}

function resetDemoDataForProductionGoLive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Only clear transactional test logs — NEVER touch CRM_Staff_Directory, CRM_Customer_Master, CRM_Model_Catalog, CRM_Email_Groups, Live_Stock_Master, or Serial_Dealer_Master!
  var transactionalSheets = [
    'LINE_Tech_Support_Tickets',
    'Document_Tracking_Log',
    'Cross_Dept_Handovers',
    'Quotation_Approvals',
    'Customer_LINE_Postbacks',
    'Field_Photo_Logs'
  ];
  var cleared = [];
  transactionalSheets.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      cleared.push(name);
    }
  });
  return {
    status: 'OK',
    clearedSheets: cleared,
    preservedMasterSheets: ['CRM_Staff_Directory', 'CRM_Customer_Master', 'CRM_Model_Catalog', 'CRM_Email_Groups', 'Live_Stock_Master', 'Serial_Dealer_Master'],
    resetAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
  };
}


// ============================================================================
// SECTION 21: E-SIGNATURE & PO UPLOAD, S/N 360 TIMELINE, VAN STOCK & DISPATCH (v1153)
// ============================================================================
var SIGNED_PO_FOLDER_NAME = 'HOSHIZAKI_Signed_PO_Archive';

function getOrCreateSignedPoFolder_() {
  var folders = DriveApp.getFoldersByName(SIGNED_PO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(SIGNED_PO_FOLDER_NAME);
}

/**
 * 1) Customer E-Signature & PO File Upload Processor
 */
function submitCustomerSignedPoAndEsign_(ss, payload) {
  var secrets = getAppSecrets_();
  var trackId = String(payload.trackId || '').trim().toUpperCase();
  var signerName = String(payload.signerName || 'ลูกค้าผู้มีอำนาจลงนาม').trim();
  var signerTitle = String(payload.signerTitle || '').trim();
  var customerPoNo = String(payload.customerPoNo || '').trim();
  var sigBase64 = String(payload.signatureDataUrl || '').trim();
  var poFileBase64 = String(payload.poFileBase64 || '').trim();
  var poFileName = String(payload.poFileName || ('PO_' + trackId + '.pdf')).trim();
  var poMimeType = String(payload.poMimeType || 'application/pdf').trim();

  var folder = getOrCreateSignedPoFolder_();
  var sigUrl = '';
  var poFileUrl = '';

  if (sigBase64 && sigBase64.indexOf('base64,') !== -1) {
    try {
      var rawSig = sigBase64.split('base64,')[1];
      var sigBytes = Utilities.base64Decode(rawSig);
      var sigBlob = Utilities.newBlob(sigBytes, 'image/png', 'ESIGN_' + trackId + '_' + Date.now() + '.png');
      var sigFile = folder.createFile(sigBlob);
      sigFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sigUrl = sigFile.getUrl();
    } catch (e1) {}
  }

  if (poFileBase64 && poFileBase64.indexOf('base64,') !== -1) {
    try {
      var rawPo = poFileBase64.split('base64,')[1];
      var poBytes = Utilities.base64Decode(rawPo);
      var poBlob = Utilities.newBlob(poBytes, poMimeType, 'PO_' + trackId + '_' + poFileName);
      var poFile = folder.createFile(poBlob);
      poFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      poFileUrl = poFile.getUrl();
    } catch (e2) {}
  }

  var noteParts = ['E-Signed by: ' + signerName + (signerTitle ? (' (' + signerTitle + ')') : '')];
  if (customerPoNo) noteParts.push('Customer PO#: ' + customerPoNo);
  if (sigUrl) noteParts.push('Signature: ' + sigUrl);
  if (poFileUrl) noteParts.push('PO File: ' + poFileUrl);

  var upd = updateDocumentTrackingStatus_(ss, trackId, 'PO_APPROVED', noteParts.join(' | '), signerName);

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        '🎉✍️ [ลูกค้าลงลายเซ็น E-Signature & อนุมัติสั่งซื้อ (PO APPROVED)]\n' +
        '• รหัสติดตาม: ' + trackId + ' (เอกสาร: ' + (upd.docNo || '-') + ')\n' +
        '• แผนก / ผู้ส่ง: ' + (upd.department || '-') + ' (' + (upd.senderName || '-') + ')\n' +
        '• ลูกค้า: ' + (upd.customerName || '-') + '\n' +
        '• ผู้ลงนาม: ' + signerName + (signerTitle ? (' — ' + signerTitle) : '') + '\n' +
        (customerPoNo ? ('• เลขที่ PO ลูกค้า: ' + customerPoNo + '\n') : '') +
        (poFileUrl ? ('• ไฟล์ PO แนบ: ' + poFileUrl + '\n') : '') +
        (sigUrl ? ('• ลายเซ็นดิจิทัล: ' + sigUrl) : '')
    }], secrets.internalToken);
  }

  return {
    status: 'OK',
    trackId: trackId,
    docNo: upd.docNo || '',
    signatureUrl: sigUrl,
    poFileUrl: poFileUrl,
    confirmedAt: upd.confirmedAt || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
  };
}

/**
 * 2) Serial Number 360° Lifecycle Timeline & Photo Gallery (`getSerial360LifecycleTimeline_`)
 */
function getSerial360LifecycleTimeline_(ss, serialNo) {
  var qSn = String(serialNo || '').replace(/[^A-Z0-9\-]/gi, '').toUpperCase();
  if (!qSn) return { status: 'ERROR', message: 'กรุณาระบุหมายเลข Serial Number' };

  var masterInfo = lookupSerialAndDealerMaster_(ss, qSn, '');
  var timeline = [];
  var photos = [];

  // A) Check Damage / Demo / Inspection Sheet
  var dmgSheet = ss.getSheetByName('Damage_Demo_Inspection');
  if (dmgSheet && dmgSheet.getLastRow() >= 2) {
    var dVals = dmgSheet.getDataRange().getValues();
    for (var i = 1; i < dVals.length; i++) {
      if (String(dVals[i][1] || '').toUpperCase().indexOf(qSn) !== -1) {
        timeline.push({
          stage: 'PRE-SALE INSPECTION / DEMO LOG',
          date: String(dVals[i][4] || '-'),
          title: 'บันทึกตรวจสภาพคลังสินค้า (' + dVals[i][0] + ')',
          detail: String(dVals[i][2] || '-'),
          link: String(dVals[i][3] || '')
        });
      }
    }
  }

  // B) Check Cross-Dept Handovers (Sales -> Service Installation)
  var hndSheet = ss.getSheetByName('Cross_Dept_Handovers');
  if (hndSheet && hndSheet.getLastRow() >= 2) {
    var hVals = hndSheet.getDataRange().getValues();
    for (var j = 1; j < hVals.length; j++) {
      if (hVals[j].join(' ').toUpperCase().indexOf(qSn) !== -1) {
        timeline.push({
          stage: 'SALES ➔ SERVICE INSTALLATION HANDOVER',
          date: String(hVals[j][1] || '-'),
          title: 'ส่งต่อเปิดงานติดตั้ง (' + hVals[j][6] + ')',
          detail: 'ผู้ส่ง: ' + hVals[j][5] + ' | ลูกค้า: ' + hVals[j][7] + ' | ' + hVals[j][11],
          link: ''
        });
      }
    }
  }

  // C) Check Service_Jobs
  var jobSheet = ss.getSheetByName('Service_Jobs');
  if (jobSheet && jobSheet.getLastRow() >= 2) {
    var jVals = jobSheet.getDataRange().getValues();
    for (var k = 1; k < jVals.length; k++) {
      if (String(jVals[k][5] || '').toUpperCase().indexOf(qSn) !== -1) {
        timeline.push({
          stage: 'FIELD SERVICE JOB (' + jVals[k][8] + ')',
          date: String(jVals[k][1] || '-'),
          title: 'ใบแจ้งบริการ ' + jVals[k][0] + ' — ช่าง: ' + (jVals[k][7] || '-'),
          detail: String(jVals[k][6] || '-'),
          link: ''
        });
      }
    }
  }

  // D) Check LINE_Tech_Support_Tickets & Before/After Photos
  var tktSheet = ss.getSheetByName('LINE_Tech_Support_Tickets');
  if (tktSheet && tktSheet.getLastRow() >= 2) {
    var tVals = tktSheet.getDataRange().getValues();
    for (var m = 1; m < tVals.length; m++) {
      if (tVals[m].join(' ').toUpperCase().indexOf(qSn) !== -1) {
        var pUrl = String(tVals[m][13] || '').trim();
        if (pUrl) {
          photos.push({
            ticketId: String(tVals[m][0]),
            date: String(tVals[m][1]),
            caption: String(tVals[m][4]) + ' — ' + String(tVals[m][3]),
            url: pUrl
          });
        }
        timeline.push({
          stage: 'LINE OA SUPPORT TICKET (' + tVals[m][7] + ')',
          date: String(tVals[m][1] || '-'),
          title: 'เคสแจ้งซ่อม ' + tVals[m][0] + ' (' + tVals[m][8] + ')',
          detail: String(tVals[m][6] || '-') + (tVals[m][11] ? (' | ตอบกลับ: ' + tVals[m][11]) : ''),
          link: pUrl
        });
      }
    }
  }

  return {
    status: 'OK',
    serialNumber: qSn,
    master: masterInfo,
    timeline: timeline,
    photos: photos
  };
}

/**
 * 3) Technician Van Stock Inventory (`Van_Stock_Inventory`)
 */
function ensureVanStockSheet_(ss) {
  var sheet = ss.getSheetByName('Van_Stock_Inventory') || ss.insertSheet('Van_Stock_Inventory');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 7)
      .setValues([['Van Code', 'Technician Name', 'Part Code', 'Part Description', 'Qty On Van', 'Min Qty', 'Updated At']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sheet.getRange(2, 1, 10, 7).setValues([
      ['T01', 'ช่างบริการ T01 (BKK North)', '4HC-H', 'Water Filter Cartridge 4HC-H', 6, 2, nowStr],
      ['T01', 'ช่างบริการ T01 (BKK North)', 'P01873-01', 'Water Pump Motor Assembly (IM)', 2, 1, nowStr],
      ['T01', 'ช่างบริการ T01 (BKK North)', '4A5498G01', 'Thermistor / Cube Control Sensor', 3, 1, nowStr],
      ['T02', 'ช่างบริการ T02 (BKK South)', '4HC-H', 'Water Filter Cartridge 4HC-H', 5, 2, nowStr],
      ['T02', 'ช่างบริการ T02 (BKK South)', '3A2647-01', 'Inlet Water Valve 220V', 2, 1, nowStr],
      ['T03', 'ช่างบริการ T03 (BKK East)', '4HC-H', 'Water Filter Cartridge 4HC-H', 4, 2, nowStr],
      ['T04', 'ช่างบริการ T04 (Nonthaburi)', '4HC-H', 'Water Filter Cartridge 4HC-H', 4, 2, nowStr],
      ['T05', 'ช่างบริการ T05 (Samut Prakan)', 'P01873-01', 'Water Pump Motor Assembly (IM)', 2, 1, nowStr],
      ['T06', 'ช่างบริการ T06 (Ayutthaya)', '4HC-H', 'Water Filter Cartridge 4HC-H', 3, 2, nowStr],
      ['T08', 'ช่างบริการ T08 (Install & PM)', '4HC-H', 'Water Filter Cartridge 4HC-H', 8, 3, nowStr]
    ]);
  }
  return sheet;
}

function getVanStockItems_(ss, vanFilter) {
  var sheet = ensureVanStockSheet_(ss);
  var vals = sheet.getDataRange().getValues();
  var vFilter = String(vanFilter || 'ALL').trim().toUpperCase();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var vCode = String(vals[i][0] || '').trim().toUpperCase();
    if (!vCode) continue;
    if (vFilter && vFilter !== 'ALL' && vCode !== vFilter) continue;
    out.push({
      rowIndex: i + 1,
      vanCode: vCode,
      techName: String(vals[i][1] || ''),
      partCode: String(vals[i][2] || ''),
      partName: String(vals[i][3] || ''),
      qty: Number(vals[i][4] || 0),
      minQty: Number(vals[i][5] || 1),
      updatedAt: String(vals[i][6] || '')
    });
  }
  return out;
}

function adjustVanStockItem_(ss, payload) {
  var secrets = getAppSecrets_();
  var sheet = ensureVanStockSheet_(ss);
  var vanCode = String(payload.vanCode || 'T01').trim().toUpperCase();
  var partCode = String(payload.partCode || '').trim().toUpperCase();
  var partName = String(payload.partName || partCode).trim();
  var delta = Number(payload.delta || 0); // negative = consume on job, positive = restock
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var vals = sheet.getDataRange().getValues();

  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toUpperCase() === vanCode && String(vals[i][2]).trim().toUpperCase() === partCode) {
      var curQty = Number(vals[i][4] || 0);
      var minQty = Number(vals[i][5] || 1);
      var newQty = Math.max(0, curQty + delta);
      sheet.getRange(i + 1, 5).setValue(newQty);
      sheet.getRange(i + 1, 7).setValue(nowStr);

      if (newQty < minQty && isLineGroupConfigured() && isLineTokenConfigured()) {
        pushLineMessagesWithToken_(secrets.lineGroupId, [{
          type: 'text',
          text:
            '⚠️🔩 [VAN STOCK LOW — ขอเบิกอะไหล่เติมรถช่าง]\n' +
            '• รถช่าง: ' + vanCode + ' (' + vals[i][1] + ')\n' +
            '• รหัสอะไหล่: ' + partCode + ' — ' + vals[i][3] + '\n' +
            '• คงเหลือบนรถ: ' + newQty + ' ชิ้น (เกณฑ์ขั้นต่ำ ' + minQty + ' ชิ้น)\n' +
            'กรุณาจัดเตรียมเบิกเติมอะไหล่จากสโตร์กลางครับ'
        }], secrets.internalToken);
      }
      return { status: 'OK', vanCode: vanCode, partCode: partCode, newQty: newQty, lowStockAlert: newQty < minQty };
    }
  }

  var initQty = Math.max(0, delta);
  sheet.appendRow([vanCode, 'ช่างบริการ ' + vanCode, partCode, partName, initQty, 1, nowStr]);
  return { status: 'OK', vanCode: vanCode, partCode: partCode, newQty: initQty, created: true };
}

/**
 * 4) Installation & Service Dispatch Calendar (`Service_Dispatch_Schedule`) + Monthly Incentive KPI
 */
function ensureDispatchScheduleSheet_(ss) {
  var sheet = ss.getSheetByName('Service_Dispatch_Schedule') || ss.insertSheet('Service_Dispatch_Schedule');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 9)
      .setValues([['Dispatch ID', 'Scheduled Date', 'Time Slot', 'Van / Tech Code', 'Job Type', 'Customer / Store', 'Model / S/N', 'Status', 'Notes']])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getDispatchScheduleList_(ss) {
  var sheet = ensureDispatchScheduleSheet_(ss);
  if (sheet.getLastRow() < 2) return [];
  var vals = sheet.getDataRange().getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 1 && out.length < 80; i--) {
    out.push({
      dispatchId: vals[i][0],
      date: vals[i][1],
      timeSlot: vals[i][2],
      vanCode: vals[i][3],
      jobType: vals[i][4],
      customer: vals[i][5],
      modelSn: vals[i][6],
      status: vals[i][7],
      notes: vals[i][8]
    });
  }
  return out;
}

function createDispatchScheduleSlot_(ss, payload) {
  var secrets = getAppSecrets_();
  var sheet = ensureDispatchScheduleSheet_(ss);
  var dId = 'DSP-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
  var sDate = String(payload.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')).trim();
  var tSlot = String(payload.timeSlot || '09:00 - 12:00').trim();
  var van = String(payload.vanCode || 'T01').trim().toUpperCase();
  var jType = String(payload.jobType || 'New Installation').trim();
  var cust = String(payload.customer || '-').trim();
  var mSn = String(payload.modelSn || '-').trim();
  var notes = String(payload.notes || '').trim();

  sheet.appendRow([dId, sDate, tSlot, van, jType, cust, mSn, 'SCHEDULED', notes]);

  if (isLineGroupConfigured() && isLineTokenConfigured()) {
    pushLineMessagesWithToken_(secrets.lineGroupId, [{
      type: 'text',
      text:
        '📅🛠️ [ตารางนัดหมายติดตั้ง / จ่ายงานช่าง — ' + van + ']\n' +
        '• รหัสคิวงาน: ' + dId + ' (' + jType + ')\n' +
        '• วัน-เวลา: ' + sDate + ' เวลา ' + tSlot + '\n' +
        '• ลูกค้า: ' + cust + '\n' +
        '• รุ่น / S/N: ' + mSn +
        (notes ? ('\n• หมายเหตุ: ' + notes) : '')
    }], secrets.internalToken);
  }
  return { status: 'OK', dispatchId: dId };
}

function getMonthlyIncentiveKpiSummary_(ss) {
  var qtSheet = ss.getSheetByName('Sales_Quotations_2026');
  var trkSheet = ensureDocumentTrackingSheet_(ss);
  var jobSheet = ss.getSheetByName('Service_Jobs');

  var approvedOffers = {};
  if (trkSheet && trkSheet.getLastRow() >= 2) {
    var tVals = trkSheet.getDataRange().getValues();
    for (var i = 1; i < tVals.length; i++) {
      if (String(tVals[i][10] || '').toUpperCase() === 'PO_APPROVED') {
        approvedOffers[String(tVals[i][2] || '').trim().toUpperCase()] = true;
      }
    }
  }

  var salesMap = {};
  if (qtSheet && qtSheet.getLastRow() >= 2) {
    var qVals = qtSheet.getDataRange().getValues();
    for (var j = 1; j < qVals.length; j++) {
      var sp = String(qVals[j][5] || 'UNASSIGNED').trim().toUpperCase();
      var offNo = String(qVals[j][0] || '').trim().toUpperCase();
      var amt = Number(qVals[j][16] || 0);
      if (!salesMap[sp]) salesMap[sp] = { code: sp, quotedCount: 0, quotedAmount: 0, wonCount: 0, wonAmount: 0 };
      salesMap[sp].quotedCount++;
      salesMap[sp].quotedAmount += amt;
      if (approvedOffers[offNo] || String(qVals[j][17]).toUpperCase() === 'PO_APPROVED') {
        salesMap[sp].wonCount++;
        salesMap[sp].wonAmount += amt;
      }
    }
  }

  var techMap = {};
  if (jobSheet && jobSheet.getLastRow() >= 2) {
    var jVals = jobSheet.getDataRange().getValues();
    for (var k = 1; k < jVals.length; k++) {
      var tech = String(jVals[k][7] || 'GENERAL').trim();
      if (!techMap[tech]) techMap[tech] = { tech: tech, totalJobs: 0, completedJobs: 0 };
      techMap[tech].totalJobs++;
      if (/CLOSE|DONE|COMPLETE/i.test(String(jVals[k][8] || ''))) techMap[tech].completedJobs++;
    }
  }

  return {
    status: 'OK',
    salesRanking: Object.keys(salesMap).map(function(k) { return salesMap[k]; }),
    techRanking: Object.keys(techMap).map(function(k) { return techMap[k]; })
  };
}
