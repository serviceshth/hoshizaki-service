# HOSHIZAKI (THAILAND) — Job Service Management System (v18.9.0 Board Pinout & LED Blink Codes + Error Matrix)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v18.9) เพิ่มคู่มือผังขั้วต่อสายไฟ (Terminal Pinout) และรหัสไฟกะพริบ LED / เสียงเตือนของแผงบอร์ด **IM, KM และ FM Series** ในหน้าต่าง Error Code
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-9`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_9_0.js` — โค้ด Backend ล่าสุด (รองรับคำสั่ง `PINOUT IM` / `PINOUT KM` / `PINOUT FM` ใน LINE OA)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
