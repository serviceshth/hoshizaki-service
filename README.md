# HOSHIZAKI (THAILAND) — Job Service Management System (v18.8.0 Dishwasher Error Codes + Thermistor Table + Tech Doc Manager)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v18.8) ครบตาราง Error Code เครื่องล้างจาน (`HSU / JWE Series`), ตารางค่าความต้านทาน Thermistor (`kΩ vs °C` + เครื่องคำนวณค่ามิเตอร์สด) และระบบเพิ่ม/แก้ไข/อัปเดต **Spec Sheet, Parts List, Service Manual, Instruction Manual, Drawing**
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-8`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_8_0.js` — โค้ด Backend ล่าสุด (รองรับคำสั่ง `ERR HSU-400 E01` / `ERR JWE-500 E03` ใน LINE OA และซิงค์คลังเอกสารทางเทคนิค `SYNC_TECHNICAL_DOCS`)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
