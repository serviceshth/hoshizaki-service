# HOSHIZAKI (THAILAND) — Job Service Management System (v18.4.0 Enterprise Security + Flex OA + Unlimited Drive Search)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v18.4 Enterprise) รองรับสแกน Barcode/QR Code ผ่านกล้องมือถือทุกเบราว์เซอร์ (iOS/Android/Desktop) และซิงค์สต็อกรถช่างขึ้น Cloud อัตโนมัติ
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-4`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_4_0.js` — โค้ด Backend ล่าสุด (รองรับ ScriptProperties Security, LINE Flex Message Cards, Unlimited Drive PDF Index, First-Page PDF OCR Auto-Rename, Daily PM Alert Cron และ Van Stock Cloud Sync)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่าความปลอดภัย

## การตั้งค่าความปลอดภัยและ Trigger อัตโนมัติใน Google Apps Script (v18.4.0)
1. วางโค้ด `Hoshizaki_Google_AppsScript_v18_4_0.js` ลงใน `Code.gs` แล้วกด **บันทึก (`Ctrl + S`)**
2. เลือกฟังก์ชัน **`setupScriptPropertiesSecrets`** แล้วกด **Run** 1 ครั้งเพื่อบันทึก `LINE_CHANNEL_ACCESS_TOKEN` และ `API_SECRET_KEY` ลงใน **Project Settings > Script Properties** อย่างปลอดภัย
3. เลือกฟังก์ชัน **`rebuildDrivePdfIndexSheet`** แล้วกด **Run** 1 ครั้งเพื่อสร้างดัชนีไฟล์ PDF ทั้งหมดแบบไม่จำกัดจำนวนในแท็บ `Drive_PDF_Index`
4. เลือกฟังก์ชัน **`installEnterpriseDailyTriggers`** แล้วกด **Run** 1 ครั้งเพื่อเปิดระบบแจ้งเตือน PM ครบกำหนดเข้ากลุ่ม LINE ทุกเช้าเวลา 08:00 น.
5. กด **Deploy > Manage deployments > แก้ไข (ดินสอ) > New version > Deploy**
