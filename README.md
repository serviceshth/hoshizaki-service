# HOSHIZAKI (THAILAND) — Job Service Management System (v18.2 LINE OA + Spec)

ระบบบริหารจัดการงานบริการภาคสนาม (Service Report PWA) เชื่อมต่อ **Google Apps Script**, **Google Drive**, **Google Sheets** และ **LINE Official Account**

## รายการไฟล์สำหรับอัปโหลดขึ้น GitHub (Root Repository)
1. `index.html` — หน้าเว็บแอปพลิเคชันหลัก (PWA) รองรับการใช้งานทั้ง Mobile, Tablet และ Desktop (ทำงานออฟไลน์ได้)
2. `sw.js` — Service Worker สำหรับแคชไฟล์และฐานข้อมูลออฟไลน์ (`hoshizaki-service-pwa-v18-2`)
3. `manifest.json` — ไฟล์ตั้งค่าการติดตั้งแอปลงหน้าจอมือถือ (Add to Home Screen)
4. `serial_db.json` — ฐานข้อมูล Serial Number และสถานะการรับประกัน (6,749 รายการ)
5. `parts_catalog.json` — ฐานข้อมูลอะไหล่มาตรฐาน Hoshizaki (2,127 รายการ)
6. `quotation_archive.json` — ฐานข้อมูลใบเสนอราคาเก่าสำหรับค้นหาและออกบิลซ้ำ (2,486 ฉบับ)
7. `Hoshizaki_Google_AppsScript_v18_2.js` — โค้ด Backend สำหรับนำไปวางใน Google Apps Script (ไม่จำเป็นต้องรันบน GitHub Pages แต่เก็บสำรองใน Repo ได้)

## สรุปการอัปเดตในเวอร์ชัน v18.2
- **LINE OA Bot ค้นหา Spec Sheet & คู่มือ PDF ใน Google Drive อัตโนมัติ:** พิมพ์ `SPEC <รุ่นเครื่อง>` หรือ `MANUAL <รุ่นเครื่อง>` บอทจะค้นหาไฟล์ PDF ในโฟลเดอร์ Spec Sheet (`1J-8iMryohfrHaD9gc_iiIRtZrqMECVPV`) และโฟลเดอร์คู่มือหลักทั้ง 3 โฟลเดอร์ (รวมโฟลเดอร์ย่อยทั้งหมด) พร้อมส่งลิงก์เปิดไฟล์ PDF กลับมาในแชททันที
- **ปุ่มเปิด Spec Sheet PDF ในหน้าเว็บแอป PWA:** เพิ่มปุ่ม **Spec Sheet PDF** บนการ์ดค่ามาตรฐานโรงงาน และเพิ่มหมวดหมู่ค้นหา **Spec Sheet / Catalogue** ในเมนูค้นหาคู่มือ Google Drive

## ขั้นตอนอัปโหลดขึ้น GitHub Pages
1. เปิด Repository ของโปรเจกต์บน GitHub → กด **Add file** → **Upload files**
2. ลากไฟล์ทั้งหมด (`index.html`, `sw.js`, `manifest.json`, `serial_db.json`, `parts_catalog.json`, `quotation_archive.json`, `README.md`, `Hoshizaki_Google_AppsScript_v18_2.js`) วางลงในหน้าอัปโหลด
3. พิมพ์ข้อความ Commit เช่น `Release v18.2: LINE OA + Google Drive Spec Sheet Search` แล้วกด **Commit changes**
4. รอประมาณ 1–2 นาที ระบบ GitHub Pages จะอัปเดตหน้าเว็บแอปเป็นเวอร์ชัน `v18.2 LINE OA + Spec` อัตโนมัติ
