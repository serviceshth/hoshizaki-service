# HOSHIZAKI (THAILAND) — Job Service Management System (v19.0.0 Universal Red CLOSE + ExcelJS Logo + LINE Full-Screen Preview)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v19.0) เพิ่มปุ่มกากบาทสีแดง **`✕ CLOSE`** ตรึงมุมขวาบนทุกหน้าจอ Pop-up และอัปเกรดระบบส่งออก Excel ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จรับเงินด้วย **ExcelJS** พร้อมฝังโลโก้บริษัทและจัดหน้ากระดาษ A4 สมบูรณ์
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v19-0`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v19_0_0.js` — โค้ด Backend ล่าสุด เพิ่มการ์ด Flex Message และปุ่ม **`🖥️ พรีวิวเต็มจอ (Full Screen)`** ในทุกคำสั่งของ LINE Bot
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
