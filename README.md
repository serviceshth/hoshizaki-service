# HOSHIZAKI (THAILAND) — Job Service Management System (Enterprise v191.0)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (**Enterprise v191.0**) รองรับ Auto-Save ข้อมูลใหม่เข้าฐานข้อมูลถาวร (Serial No., Model, อะไหล่, ลูกค้า), อัปโหลดไฟล์ PDF (Parts List, Service Manual, Instruction Manual, Spec Sheet, Drawing) และรูปภาพอะไหล่ตรงเข้า Google Drive, ระบบ Auto Check-In/Check-Out ด้วยพิกัด GPS หน้างาน (แก้ไขเวลาได้), โหมดระบุเฉพาะรุ่นเครื่องเมื่อเนมเพลทจาง และหัวกระดาษที่อยู่บริษัทตามรูปแบบมาตรฐานล่าสุด
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v191-0`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_Enterprise_v191_0.js` — โค้ด Backend ล่าสุด รองรับการอัปโหลดไฟล์ PDF/รูปภาพอะไหล่เข้าโฟลเดอร์ Google Drive พร้อมลงดัชนีค้นหาใน LINE Bot ทันที
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
