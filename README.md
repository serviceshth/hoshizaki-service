# HOSHIZAKI (THAILAND) — Job Service Management System (v18.6.0 Complete Spec Tables + Deep Audited)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v18.6) ครบตารางสเปกเต็มหน้าจอทุกตระกูลหลัก (`IM-21CNE~240DNE`, `KM-40B~150B`, `KM-231~1301`, `FM-150~1800`, `HR/HF ตู้ยืน`, `RT/RTC เคาน์เตอร์`, `DCM/AM/HNC/DBF`) พร้อมภาพหน้าปกจาก Drive + ส่งออก PNG + ส่งเข้ากลุ่ม LINE
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-6`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_6_0.js` — โค้ด Backend ล่าสุดที่ผ่านการตรวจสอบความสอดคล้องของ API Endpoints ครบทุกฟังก์ชัน (`SAVE_JOB`, `SAVE_QUOTATION`, `SUBMIT_WARRANTY_CLAIM`, `UPDATE_SERIAL`, `SYNC_SCHEDULE`, `SYNC_VAN_STOCK`, `SAVE_LINE_CONFIG`, `SEND_LINE_DISPATCH_NOW`, `getModelSpecSheet`, `getAllJobs`, `getSerialUpdates`, `getSchedule`)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
