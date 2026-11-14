# HOSHIZAKI (THAILAND) — Job Service Management System (v18.5.0 Full-Screen Spec Sheet + Flex OA + Unlimited Drive Search)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v18.5) เพิ่มหน้าต่าง **Full-Screen Spec Sheet Viewer** แสดงตารางสเปกมาตรฐาน Hoshizaki + ภาพหน้าปกจาก Drive + ส่งออก PNG + ส่งเข้ากลุ่ม LINE
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-5`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_5_0.js` — โค้ด Backend ล่าสุด (ส่งรูปภาพ Spec Sheet คมชัด + การ์ด Flex Message + ปุ่มเปิด PDF เข้า LINE OA/กลุ่ม LINE เมื่อพิมพ์ `SPEC <รุ่นเครื่อง>`)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
