# HOSHIZAKI (THAILAND) — Job Service Management System (v18.7.0 Model-Specific Error Code Diagnostic Sheet + Flex OA)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA v18.7) เพิ่มหน้าต่าง **Model-Specific Error Code Diagnostic Sheet** แยกรหัส Error ตามแต่ละผลิตภัณฑ์และรุ่นย่อย พร้อมปุ่มเทียบความหมายรหัสเดียวกันข้ามรุ่น, บันทึกภาพ PNG และส่งเข้ากลุ่ม LINE
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-7`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_7_0.js` — โค้ด Backend ล่าสุด (ตอบคำสั่ง `ERR <รุ่นเครื่อง> <รหัส>` เช่น `ERR IM-100NE E1` หรือ `ERR KM-901MAJ E2` เป็นการ์ด Flex Message แยกความหมายตามรุ่น)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และวิธีตั้งค่า
