# HOSHIZAKI (THAILAND) — Job Service Management System (v18.3.2 LINE OA + Drive Auto-Rename & Spec Search)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA) รองรับการใช้งานทั้ง Mobile, Tablet และ Desktop (ทำงานออฟไลน์ได้)
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-2`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_3_2.js` — โค้ด Backend ล่าสุดสำหรับ Google Apps Script (รองรับ Batch Auto-Rename ไฟล์ PDF ใน Drive แยกตามโฟลเดอร์หลัก + ค้นหา Spec Sheet PDF ใน LINE OA)
8. `README.md` — เอกสารสรุปโครงสร้างไฟล์และบันทึกการอัปเดตประจำ Repository

## การแยกประเภทโฟลเดอร์ Google Drive สำหรับเปลี่ยนชื่อ PDF อัตโนมัติ (v18.3.2)
- โฟลเดอร์ `1J-8iMryohfrHaD9gc_iiIRtZrqMECVPV` → `Spec Sheet_<Models>.pdf`
- โฟลเดอร์ `1gxzMZ4l5wjXKoRTM0TRIH_l505y8AVsj` (คู่มือ 1) → `Service Manual_<Models>.pdf`
- โฟลเดอร์ `16FbLyB9eredvW8RH-dmk_NwhyaCOkiDR` (คู่มือ 2) → `Instruction Manual_<Models>.pdf`
- โฟลเดอร์ `1HVU-f-05Ts8ipWxwXdsXoI20TossTeL4` (คู่มือ 3) → `Parts List_<Models>.pdf`
