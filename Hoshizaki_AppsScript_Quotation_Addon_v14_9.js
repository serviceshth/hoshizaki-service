/**
 * HOSHIZAKI (THAILAND) - Google Apps Script Add-on for SAVE_QUOTATION (v14.9)
 * วางโค้ดฟังก์ชันนี้ลงในไฟล์ Google Apps Script ของคุณ และเรียกใช้ใน doPost(e) เมื่อ data.actionType === 'SAVE_QUOTATION'
 */
function upsertQuotationToSheet(ss, data) {
  var sheetName = 'Quotations';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = [
      'Offer No.', 'Document Type', 'Ref. Job No.', 'Date',
      'Customer / Store', 'Dealer', 'Contact', 'Address',
      'Model', 'Serial No.', 'Price Tier', 'Parts & Services Summary',
      'Subtotal (THB)', 'VAT 7%', 'WHT 3%', 'Grand Total (THB)',
      'Remark', 'Technician', 'Updated At'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#002B49')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var offerNo = String(data.offerNo || '').trim();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var rowValues = [
    offerNo,
    data.docType || 'QUOTATION',
    data.refJobNo || '',
    data.date || '',
    data.customerStore || '',
    data.dealer || '',
    data.contact || '',
    data.address || '',
    data.model || '',
    data.serial || '',
    data.priceTier || 'DIRECT',
    data.partsSummary || '',
    data.subtotal || '0.00',
    data.vat || '0.00',
    data.wht || '0.00',
    data.grandTotal || '0.00',
    data.remark || '',
    data.technician || '',
    nowStr
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
