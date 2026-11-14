/**
 * ============================================================================
 * HOSHIZAKI (THAILAND) LIMITED - Google Apps Script Backend (v16.0 Enterprise)
 * รองรับ:
 * 1. บันทึกใบแจ้งบริการ (SAVE_JOB) + อัปโหลดรูปภาพลง Google Drive แยกตาม ปี/เดือน/รหัสช่าง
 * 2. สร้างไฟล์ PDF ใบแจ้งบริการ (Job Service) และใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ (QT/IV/RE) อัตโนมัติ
 *    บันทึกลง Google Drive และส่งเข้าอีเมล Gmail Backup (Dual-Layer Audit Trail)
 * 3. บันทึกใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ (SAVE_QUOTATION / SAVE_QUOTATION_PDF_BACKUP)
 * 4. แจ้งเตือนอีเมลอัตโนมัติทันทีเมื่อใบงานติดสถานะ Waiting Parts (รออะไหล่)
 * 5. Two-Way Cloud Sync (doGet ?action=pullAllData และ ?action=getSerialHistory)
 * ============================================================================
 */

var ROOT_DRIVE_FOLDER_NAME = 'HOSHIZAKI_SERVICE_REPORTS_ARCHIVE';
var DEFAULT_BACKUP_EMAIL = 'services@hoshizaki.co.th';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(25000);
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = data.actionType || 'SAVE_JOB';

    if (action === 'SAVE_QUOTATION' || action === 'SAVE_QUOTATION_PDF_BACKUP') {
      upsertQuotationToSheet(ss, data);
      if (data.autoPdfBackup) {
        var qtPdfFile = generateQuotationPdfAndSaveToDrive(data);
        if (qtPdfFile) {
          sendBackupEmailWithPdf(
            data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
            '[HOSHIZAKI-QT-BACKUP][' + (data.offerNo || 'QT') + '][S/N: ' + (data.serial || '-') + '] ' + (data.customerStore || ''),
            'แนบไฟล์ PDF เอกสาร ' + (data.docType || 'QUOTATION') + ' เลขที่ ' + (data.offerNo || '-') + '\nลูกค้า: ' + (data.customerStore || '-') + '\nรุ่น/S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nยอดรวมสุทธิ: ' + (data.grandTotal || '0.00') + ' THB\nลิงก์ไฟล์ใน Google Drive: ' + qtPdfFile.getUrl(),
            qtPdfFile
          );
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', action: action })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'SAVE_JOB') {
      var driveFolder = getOrCreateMonthlyTechFolder(data.date, data.techCode || 'GENERAL');
      var pdfUrl = '';

      // สร้าง PDF ใบแจ้งบริการอัตโนมัติลง Google Drive และส่งเข้า Gmail Backup
      if (data.autoPdfBackup) {
        var jobPdfFile = generateJobServicePdfAndSaveToDrive(data, driveFolder);
        if (jobPdfFile) {
          pdfUrl = jobPdfFile.getUrl();
          var mode = data.backupGmailMode || 'ALL_SAVES';
          var shouldEmail = (mode === 'ALL_SAVES') || (mode === 'COMPLETED_AND_QT' && data.jobStatus === 'Completed');
          if (shouldEmail) {
            sendBackupEmailWithPdf(
              data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
              '[HOSHIZAKI-JOB-BACKUP][' + (data.jobNo || 'JOB') + '][' + (data.jobStatus || '') + '][S/N: ' + (data.serial || '-') + '] ' + (data.store || ''),
              'สำรองข้อมูลใบแจ้งบริการ (Service Report)\nเลขที่ใบงาน: ' + (data.jobNo || '-') + '\nวันที่: ' + (data.date || '-') + '\nสถานะ: ' + (data.jobStatus || '-') + '\nลูกค้า: ' + (data.store || '-') + '\nรุ่น/S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nช่างผู้รับผิดชอบ: ' + (data.responsibleTech || '-') + '\nยอดรวมสุทธิ: ' + (data.grandTotal || '0.00') + ' THB\nโฟลเดอร์ Google Drive: ' + driveFolder.getUrl(),
              jobPdfFile
            );
          }
        }
      }

      // แจ้งเตือนฝ่ายอะไหล่ทันทีหากสถานะเป็น Waiting Parts
      if (data.jobStatus === 'Waiting Parts') {
        MailApp.sendEmail({
          to: data.backupGmailRecipient || DEFAULT_BACKUP_EMAIL,
          subject: '[ALERT: WAITING PARTS] ใบงาน ' + (data.jobNo || '') + ' รออะไหล่ - ' + (data.store || ''),
          body: 'แจ้งเตือนงานรออะไหล่ (Waiting Parts)\nJob No.: ' + (data.jobNo || '-') + '\nลูกค้า: ' + (data.store || '-') + '\nModel / S/N: ' + (data.model || '-') + ' / ' + (data.serial || '-') + '\nรายการอะไหล่: ' + (data.partsSummary || '-') + '\nช่างผู้แจ้ง: ' + (data.responsibleTech || '-')
        });
      }

      upsertJobToSheet(ss, data, driveFolder.getUrl(), pdfUrl);
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', jobNo: data.jobNo, pdfUrl: pdfUrl })).setMimeType(ContentService.MimeType.JSON);
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
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', uploaded: data.photosPayload.length })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ignored' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: String(err) })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'pullAllData') {
    var limit = Number((e.parameter && e.parameter.limit) || 300);
    var jobs = readRecentJobsFromSheet(ss, limit);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', jobs: jobs })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getSerialHistory') {
    var serial = String((e.parameter && e.parameter.serial) || '').trim().toUpperCase();
    var allJobs = readRecentJobsFromSheet(ss, 2000);
    var matched = allJobs.filter(function(j) {
      return String(j.serial || '').trim().toUpperCase() === serial;
    });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', records: matched })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ready', version: 'v16.0' })).setMimeType(ContentService.MimeType.JSON);
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
      'Grand Total (THB)', 'Drive Folder URL', 'PDF Backup URL', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#002B49').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var jobNo = String(data.jobNo || '').trim();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowValues = [
    jobNo, data.date || '', data.jobStatus || 'Completed', data.techCode || '',
    data.responsibleTech || '', data.techniciansSummary || '',
    data.store || '', data.dealer || '', data.contact || '', data.address || '',
    data.model || '', data.serial || '', data.productType || '', data.warranty || '',
    data.timeIn || '', data.timeOut || '', data.diagGps || '',
    data.diagSymptom || '', data.diagDetected || '', data.diagAction || '', data.partsSummary || '',
    data.grandTotal || '0.00', folderUrl || '', pdfUrl || '', nowStr
  ];

  var lastRow = sheet.getLastRow();
  var targetRow = -1;
  if (lastRow >= 2 && jobNo) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0]).trim() === jobNo) {
        targetRow = i + 2;
        if (!pdfUrl) rowValues[23] = sheet.getRange(targetRow, 24).getValue();
        break;
      }
    }
  }
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
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

  var lastRow = sheet.getLastRow();
  var targetRow = -1;
  if (lastRow >= 2 && offerNo) {
    var existingOffers = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existingOffers.length; i++) {
      if (String(existingOffers[i][0]).trim() === offerNo) {
        targetRow = i + 2;
        break;
      }
    }
  }
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function readRecentJobsFromSheet(ss, limit) {
  var sheet = ss.getSheetByName('Service_Jobs');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - limit + 1);
  var numRows = lastRow - startRow + 1;
  var values = sheet.getRange(startRow, 1, numRows, 25).getValues();
  return values.reverse().map(function(r) {
    return {
      jobNo: r[0], date: r[1], jobStatus: r[2], techCode: r[3], responsibleTech: r[4],
      store: r[6], dealer: r[7], contact: r[8], address: r[9],
      model: r[10], serial: r[11], productType: r[12], warranty: r[13],
      timeIn: r[14], timeOut: r[15], diagGps: r[16],
      diagSymptom: r[17], diagDetected: r[18], diagAction: r[19],
      grandTotal: r[21], driveFolderUrl: r[22], pdfBackupUrl: r[23], updatedAt: r[24]
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
  var partsRows = '';
  var parts = Array.isArray(data.parts) ? data.parts : [];
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i].desc) continue;
    partsRows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(parts[i].desc) + '</td><td align="center">' + escapeHtml(parts[i].qty) + '</td><td align="right">' + escapeHtml(parts[i].price) + '</td></tr>';
  }
  if (!partsRows) partsRows = '<tr><td colspan="4" align="center">- ไม่มีรายการอะไหล่ -</td></tr>';

  var html = '<html><head><style>body{font-family:sans-serif;font-size:11px;color:#111}h2{color:#002B49;margin:0}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #888;padding:5px}th{background:#002B49;color:#fff}</style></head><body>' +
    '<h2>HOSHIZAKI (THAILAND) LIMITED - SERVICE REPORT</h2>' +
    '<p><b>Job No.:</b> ' + escapeHtml(data.jobNo) + ' | <b>Date:</b> ' + escapeHtml(data.date) + ' | <b>Status:</b> ' + escapeHtml(data.jobStatus) + '</p>' +
    '<table><tr><th colspan="2">ข้อมูลลูกค้า & เครื่อง</th></tr>' +
    '<tr><td><b>ลูกค้า/ร้าน:</b> ' + escapeHtml(data.store) + '</td><td><b>Model / S/N:</b> ' + escapeHtml(data.model) + ' / ' + escapeHtml(data.serial) + '</td></tr>' +
    '<tr><td><b>ผู้ติดต่อ:</b> ' + escapeHtml(data.contact) + '</td><td><b>การรับประกัน:</b> ' + escapeHtml(data.warranty) + '</td></tr>' +
    '<tr><td colspan="2"><b>ที่อยู่:</b> ' + escapeHtml(data.address) + '</td></tr></table>' +
    '<table><tr><th colspan="2">รายละเอียดการตรวจเช็คและซ่อม</th></tr>' +
    '<tr><td width="30%"><b>อาการเสีย:</b></td><td>' + escapeHtml(data.diagSymptom) + '</td></tr>' +
    '<tr><td><b>สาเหตุที่พบ:</b></td><td>' + escapeHtml(data.diagDetected) + '</td></tr>' +
    '<tr><td><b>การแก้ไข:</b></td><td>' + escapeHtml(data.diagAction) + '</td></tr>' +
    '<tr><td><b>ช่างผู้รับผิดชอบ:</b></td><td>' + escapeHtml(data.responsibleTech) + ' (' + escapeHtml(data.timeIn) + ' - ' + escapeHtml(data.timeOut) + ')</td></tr></table>' +
    '<table><tr><th width="8%">#</th><th>รายการอะไหล่</th><th width="15%">จำนวน</th><th width="20%">ราคา/หน่วย</th></tr>' + partsRows + '</table>' +
    '<p align="right"><b>ยอดรวมสุทธิ (Grand Total): ' + escapeHtml(data.grandTotal || '0.00') + ' THB</b></p>' +
    '</body></html>';

  var pdfBlob = HtmlService.createHtmlOutput(html).getAs('application/pdf')
    .setName((data.jobNo || 'JOB') + '_' + (data.serial || 'SN') + '.pdf');
  return folder.createFile(pdfBlob);
}

function generateQuotationPdfAndSaveToDrive(data) {
  var folder = getOrCreateMonthlyTechFolder(data.date, 'QUOTATIONS_PDF');
  var partsRows = '';
  var parts = Array.isArray(data.parts) ? data.parts : [];
  for (var i = 0; i < parts.length; i++) {
    partsRows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(parts[i].desc) + '</td><td align="center">' + escapeHtml(parts[i].qty) + '</td><td align="right">' + escapeHtml(parts[i].price) + '</td></tr>';
  }
  if (!partsRows) partsRows = '<tr><td colspan="4" align="center">' + escapeHtml(data.partsSummary || '-') + '</td></tr>';

  var html = '<html><head><style>body{font-family:sans-serif;font-size:11px;color:#111}h2{color:#002B49;margin:0}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #888;padding:5px}th{background:#002B49;color:#fff}</style></head><body>' +
    '<h2>HOSHIZAKI (THAILAND) LIMITED - ' + escapeHtml(data.docType || 'QUOTATION') + '</h2>' +
    '<p><b>Offer No.:</b> ' + escapeHtml(data.offerNo) + ' | <b>Ref Job:</b> ' + escapeHtml(data.refJobNo) + ' | <b>Date:</b> ' + escapeHtml(data.date) + '</p>' +
    '<p><b>ลูกค้า:</b> ' + escapeHtml(data.customerStore) + ' | <b>ติดต่อ:</b> ' + escapeHtml(data.contact) + '<br><b>ที่อยู่:</b> ' + escapeHtml(data.address) + '<br><b>Model / S/N:</b> ' + escapeHtml(data.model) + ' / ' + escapeHtml(data.serial) + '</p>' +
    '<table><tr><th width="8%">#</th><th>รายการอะไหล่และบริการ</th><th width="15%">จำนวน</th><th width="20%">ราคา/หน่วย</th></tr>' + partsRows + '</table>' +
    '<p align="right">Subtotal: ' + escapeHtml(data.subtotal) + ' THB | VAT 7%: ' + escapeHtml(data.vat) + ' THB<br><b>GRAND TOTAL: ' + escapeHtml(data.grandTotal) + ' THB</b></p>' +
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
