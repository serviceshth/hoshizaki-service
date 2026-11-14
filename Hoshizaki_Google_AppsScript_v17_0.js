/**
 * ============================================================================
 * HOSHIZAKI GLOBAL ENTERPRISE - Google Apps Script Backend (v17.0)
 * รองรับ:
 * 1. API_SECRET_KEY ตรวจสอบความปลอดภัยคำขอเข้า-ออก
 * 2. สร้างไฟล์ PDF ใบแจ้งบริการ (ฝังโลโก้บริษัท + ลายเซ็นลูกค้า/ช่าง) และใบเสนอราคา/ใบเสร็จ
 *    บันทึกลง Google Drive (แยกโฟลเดอร์ ปี-เดือน/รหัสช่าง) และส่ง Gmail Backup (ป้องกันส่งซ้ำ)
 * 3. ใช้ TextFinder & CacheService เพิ่มความเร็วสูงสุดในการค้นหาและดึงข้อมูล 2 ทาง
 * 4. ซิงค์รายชื่อพนักงาน (Staff_Directory), การตั้งค่าสาขา/โลโก้ (Global_Config)
 *    และสถานะคืนอะไหล่เคลม/การชำระเงินข้ามเครื่อง
 * ============================================================================
 */

var API_SECRET_KEY = 'HTH-SECURE-2026';
var ROOT_DRIVE_FOLDER_NAME = 'HOSHIZAKI_SERVICE_REPORTS_ARCHIVE';
var DEFAULT_BACKUP_EMAIL = 'services@hoshizaki.co.th';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(25000);
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    if (API_SECRET_KEY && data.apiSecretKey && data.apiSecretKey !== API_SECRET_KEY) {
      return jsonOut({ status: 'unauthorized', message: 'Invalid API Secret Key' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = data.actionType || 'SAVE_JOB';

    if (action === 'SAVE_GLOBAL_CONFIG') {
      saveGlobalConfigAndStaff(ss, data);
      CacheService.getScriptCache().remove('PULL_ALL_JOBS_V17');
      return jsonOut({ status: 'ok', action: action });
    }

    if (action === 'SYNC_STAFF_DIRECTORY') {
      saveGlobalConfigAndStaff(ss, { technicians: data.technicians, coordinators: data.coordinators });
      return jsonOut({ status: 'ok', action: action });
    }

    if (action === 'UPDATE_ENTERPRISE_OPS_STATUS') {
      updateOpsStatusInSheet(ss, data);
      CacheService.getScriptCache().remove('PULL_ALL_JOBS_V17');
      return jsonOut({ status: 'ok', jobNo: data.jobNo });
    }

    if (action === 'SAVE_QUOTATION' || action === 'SAVE_QUOTATION_PDF_BACKUP') {
      upsertQuotationToSheet(ss, data);
      if (data.autoPdfBackup) {
        var qtPdfFile = generateQuotationPdfAndSaveToDrive(data);
        if (qtPdfFile) {
          var qtSigHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, (data.offerNo || '') + '|' + (data.grandTotal || '')));
          var props = PropertiesService.getScriptProperties();
          var lastHash = props.getProperty('QT_MAIL_' + (data.offerNo || ''));
          if (lastHash !== qtSigHash && MailApp.getRemainingDailyQuota() > 5) {
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
          var jobHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, (data.jobNo || '') + '|' + (data.jobStatus || '') + '|' + (data.grandTotal || '') + '|' + (data.partsSummary || '')));
          var props = PropertiesService.getScriptProperties();
          var prevJobHash = props.getProperty('JOB_MAIL_' + (data.jobNo || ''));

          if (shouldEmail && prevJobHash !== jobHash && MailApp.getRemainingDailyQuota() > 5) {
            sendBackupEmailWithPdf(
              data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
              '[HOSHIZAKI-JOB-BACKUP][' + (data.jobNo || 'JOB') + '][' + (data.jobStatus || '') + '][S/N: ' + (data.serial || '-') + '] ' + (data.store || ''),
              'สำรองข้อมูลใบแจ้งบริการ (Service Report)\nเลขที่ใบงาน: ' + (data.jobNo || '-') + '\nวันที่: ' + (data.date || '-') + '\nสถานะ: ' + (data.jobStatus || '-') + '\nลูกค้า: ' + (data.store || '-') + '\nรุ่น/S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nช่างผู้รับผิดชอบ: ' + (data.responsibleTech || '-') + '\nยอดรวมสุทธิ: ' + (data.grandTotal || '0.00') + '\nโฟลเดอร์ Google Drive: ' + driveFolder.getUrl(),
              jobPdfFile
            );
            props.setProperty('JOB_MAIL_' + (data.jobNo || ''), jobHash);
          }
        }
      }

      if (data.jobStatus === 'Waiting Parts' && MailApp.getRemainingDailyQuota() > 5) {
        MailApp.sendEmail({
          to: data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
          subject: '[ALERT: WAITING PARTS] ใบงาน ' + (data.jobNo || '') + ' รออะไหล่ - ' + (data.store || ''),
          body: 'แจ้งเตือนงานรออะไหล่ (Waiting Parts)\nJob No.: ' + (data.jobNo || '-') + '\nลูกค้า: ' + (data.store || '-') + '\nModel / S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nรายการอะไหล่: ' + (data.partsSummary || '-') + '\nช่างผู้แจ้ง: ' + (data.responsibleTech || '-')
        });
      }

      upsertJobToSheet(ss, data, driveFolder.getUrl(), pdfUrl);
      CacheService.getScriptCache().remove('PULL_ALL_JOBS_V17');
      return jsonOut({ status: 'ok', jobNo: data.jobNo, pdfUrl: pdfUrl, remainingEmailQuota: MailApp.getRemainingDailyQuota() });
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

    return jsonOut({ status: 'ignored' });
  } catch (err) {
    return jsonOut({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'pullAllData') {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('PULL_ALL_JOBS_V17');
    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }
    var limit = Number((e.parameter && e.parameter.limit) || 400);
    var jobs = readRecentJobsFromSheet(ss, limit);
    var payloadStr = JSON.stringify({ status: 'ok', jobs: jobs });
    if (payloadStr.length < 95000) {
      cache.put('PULL_ALL_JOBS_V17', payloadStr, 60);
    }
    return ContentService.createTextOutput(payloadStr).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getSerialHistory') {
    var serial = String((e.parameter && e.parameter.serial) || '').trim().toUpperCase();
    var allJobs = readRecentJobsFromSheet(ss, 2500);
    var matched = allJobs.filter(function(j) {
      return String(j.serial || '').trim().toUpperCase() === serial;
    });
    return jsonOut({ status: 'ok', records: matched });
  }

  if (action === 'getStaffDirectory') {
    return jsonOut(readGlobalConfigAndStaff(ss));
  }

  return jsonOut({ status: 'ready', version: 'v17.0-Global-Enterprise' });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
    jobNo, data.date || '', data.jobStatus || 'Completed', data.techCode || '',
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
      diagSymptom: r[17], diagDetected: r[18], diagAction: r[19],
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

function generateJobServicePdfAndSaveToDrive(data, folder) {
  var cfg = data.companyConfig || {};
  var compName = cfg.companyName || 'HOSHIZAKI (THAILAND) LIMITED';
  var compAddr = cfg.address || '';
  var currency = cfg.currency || 'THB';
  var logoHtml = cfg.logoDataUrl ? '<img src="' + cfg.logoDataUrl + '" style="height:48px;vertical-align:middle;margin-right:10px;">' : '';

  var partsRows = '';
  var parts = Array.isArray(data.parts) ? data.parts : [];
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i].desc) continue;
    partsRows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(parts[i].desc) + '</td><td align="center">' + escapeHtml(parts[i].qty) + '</td><td align="right">' + escapeHtml(parts[i].price) + '</td></tr>';
  }
  if (!partsRows) partsRows = '<tr><td colspan="4" align="center">- No Spare Parts / ไม่มีรายการอะไหล่ -</td></tr>';

  var custSigHtml = data.sigCustomerDataUrl ? '<img src="' + data.sigCustomerDataUrl + '" style="height:45px;">' : '<div style="height:45px;"></div>';
  var techSigHtml = data.sigTechDataUrl ? '<img src="' + data.sigTechDataUrl + '" style="height:45px;">' : '<div style="height:45px;"></div>';

  var html = '<html><head><style>body{font-family:sans-serif;font-size:10.5px;color:#111}h2{color:#002B49;margin:0}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #888;padding:5px}th{background:#002B49;color:#fff}</style></head><body>' +
    '<div>' + logoHtml + '<span style="font-size:15px;font-weight:bold;color:#002B49;">' + escapeHtml(compName) + ' - SERVICE REPORT</span><br><span style="font-size:9.5px;color:#555;">' + escapeHtml(compAddr) + '</span></div>' +
    '<p><b>Job No.:</b> ' + escapeHtml(data.jobNo) + ' | <b>Date:</b> ' + escapeHtml(data.date) + ' | <b>Status:</b> ' + escapeHtml(data.jobStatus) + '</p>' +
    '<table><tr><th colspan="2">Customer & Equipment Information / ข้อมูลลูกค้าและเครื่อง</th></tr>' +
    '<tr><td><b>Customer/Store:</b> ' + escapeHtml(data.store) + '</td><td><b>Model / S/N:</b> ' + escapeHtml(data.model) + ' / ' + escapeHtml(data.serial) + '</td></tr>' +
    '<tr><td><b>Contact:</b> ' + escapeHtml(data.contact) + '</td><td><b>Warranty:</b> ' + escapeHtml(data.warranty) + '</td></tr>' +
    '<tr><td colspan="2"><b>Address:</b> ' + escapeHtml(data.address) + '</td></tr></table>' +
    '<table><tr><th colspan="2">Service & Troubleshooting / รายละเอียดการตรวจเช็คและซ่อม</th></tr>' +
    '<tr><td width="30%"><b>Symptom (อาการเสีย):</b></td><td>' + escapeHtml(data.diagSymptom) + '</td></tr>' +
    '<tr><td><b>Detected Cause (สาเหตุ):</b></td><td>' + escapeHtml(data.diagDetected) + '</td></tr>' +
    '<tr><td><b>Action Taken (การแก้ไข):</b></td><td>' + escapeHtml(data.diagAction) + '</td></tr>' +
    '<tr><td><b>Technician (ช่างซ่อม):</b></td><td>' + escapeHtml(data.responsibleTech) + ' (' + escapeHtml(data.timeIn) + ' - ' + escapeHtml(data.timeOut) + ')</td></tr></table>' +
    '<table><tr><th width="8%">#</th><th>Spare Parts / รายการอะไหล่</th><th width="15%">Qty</th><th width="20%">Unit Price (' + escapeHtml(currency) + ')</th></tr>' + partsRows + '</table>' +
    '<p align="right"><b>GRAND TOTAL: ' + escapeHtml(data.grandTotal || '0.00') + ' ' + escapeHtml(currency) + '</b></p>' +
    '<table><tr><th width="50%">Customer Signature / ลายเซ็นลูกค้า</th><th width="50%">Technician Signature / ลายเซ็นช่างซ่อม</th></tr>' +
    '<tr><td align="center">' + custSigHtml + '<br>' + escapeHtml(data.nameCustomer || '') + '</td><td align="center">' + techSigHtml + '<br>' + escapeHtml(data.responsibleTech || '') + '</td></tr></table>' +
    '</body></html>';

  var pdfBlob = HtmlService.createHtmlOutput(html).getAs('application/pdf')
    .setName((data.jobNo || 'JOB') + '_' + (data.serial || 'SN') + '.pdf');
  return folder.createFile(pdfBlob);
}

function generateQuotationPdfAndSaveToDrive(data) {
  var cfg = data.companyConfig || {};
  var compName = cfg.companyName || 'HOSHIZAKI (THAILAND) LIMITED';
  var currency = cfg.currency || 'THB';
  var folder = getOrCreateMonthlyTechFolder(data.date, 'QUOTATIONS_PDF');
  var partsRows = '';
  var parts = Array.isArray(data.parts) ? data.parts : [];
  for (var i = 0; i < parts.length; i++) {
    partsRows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(parts[i].desc) + '</td><td align="center">' + escapeHtml(parts[i].qty) + '</td><td align="right">' + escapeHtml(parts[i].price) + '</td></tr>';
  }
  if (!partsRows) partsRows = '<tr><td colspan="4" align="center">' + escapeHtml(data.partsSummary || '-') + '</td></tr>';

  var html = '<html><head><style>body{font-family:sans-serif;font-size:11px;color:#111}h2{color:#002B49;margin:0}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #888;padding:5px}th{background:#002B49;color:#fff}</style></head><body>' +
    '<h2>' + escapeHtml(compName) + ' - ' + escapeHtml(data.docType || 'QUOTATION') + '</h2>' +
    '<p><b>Offer No.:</b> ' + escapeHtml(data.offerNo) + ' | <b>Ref Job:</b> ' + escapeHtml(data.refJobNo) + ' | <b>Date:</b> ' + escapeHtml(data.date) + '</p>' +
    '<p><b>Customer:</b> ' + escapeHtml(data.customerStore) + ' | <b>Contact:</b> ' + escapeHtml(data.contact) + '<br><b>Address:</b> ' + escapeHtml(data.address) + '<br><b>Model / S/N:</b> ' + escapeHtml(data.model) + ' / ' + escapeHtml(data.serial) + '</p>' +
    '<table><tr><th width="8%">#</th><th>Description</th><th width="15%">Qty</th><th width="20%">Unit Price (' + escapeHtml(currency) + ')</th></tr>' + partsRows + '</table>' +
    '<p align="right">Subtotal: ' + escapeHtml(data.subtotal) + ' | VAT: ' + escapeHtml(data.vat) + '<br><b>GRAND TOTAL: ' + escapeHtml(data.grandTotal) + ' ' + escapeHtml(currency) + '</b></p>' +
    '<p><b>Remark:</b> ' + escapeHtml(data.remark) + '</p>' +
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

function escapeHtml(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
