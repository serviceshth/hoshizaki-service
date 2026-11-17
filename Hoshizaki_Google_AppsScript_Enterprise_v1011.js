/**
 * HOSHIZAKI (THAILAND) LIMITED — Google Apps Script Backend
 * Synchronized with PWA Frontend: Enterprise v1015 (1015-SEC)
 * Phase 1 Scope: Service Unit & Service Center Only
 */
const HZK_BACKEND_VERSION = 'Enterprise v1015';

function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Syncs OCR-scanned or manually created Customer Master records into Google Sheets (Customer_Master_DB)
 * Deduplicates automatically by 13-digit Tax ID or exact Customer Name.
 */
function handleCustomerMasterDbSync_(payload) {
  return withScriptLock_(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Customer_Master_DB');
    if (!sheet) {
      sheet = ss.insertSheet('Customer_Master_DB');
      sheet.appendRow(['Customer_Code', 'Company_Name', 'Tax_ID_13', 'Branch', 'Billing_Address', 'Contact_Info', 'Updated_At', 'Updated_By']);
    }
    const rows = sheet.getDataRange().getValues();
    const taxId = String(payload.taxId || '').trim();
    const name = String(payload.name || '').trim();
    let targetRow = -1;

    for (let i = 1; i < rows.length; i++) {
      if ((taxId && String(rows[i][2]).trim() === taxId) || (!taxId && String(rows[i][1]).trim() === name)) {
        targetRow = i + 1;
        break;
      }
    }

    const rowValues = [
      payload.code || ('CUST-' + new Date().getFullYear() + '-' + String(rows.length).padStart(4, '0')),
      name,
      taxId,
      payload.branch || 'สำนักงานใหญ่',
      payload.address || '',
      payload.contact || '',
      new Date(),
      payload.updatedBy || 'Service PWA v1015'
    ];

    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    return { status: 'success', version: HZK_BACKEND_VERSION, code: rowValues[0] };
  });
}
