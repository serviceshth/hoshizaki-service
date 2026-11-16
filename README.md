# HOSHIZAKI (THAILAND) LIMITED — Job Service Management System & Smart LINE Chatbot (Enterprise v191.3)

## 1. รายการไฟล์ในชุดติดตั้ง (Deployment Package)
1. `index.html` — เว็บแอปพลิเคชันหลัก (Offline-First PWA + LINE Support Ticket Center + Full-Screen Technical Viewer)
2. `sw.js` — Service Worker สำหรับทำงานแบบ Offline 100%
3. `manifest.json` — PWA Manifest สำหรับติดตั้งลงหน้าจอโฮม iOS / Android / Desktop
4. `serial_db.json` — ฐานข้อมูลหมายเลขเครื่อง (Serial Number Master Database)
5. `parts_catalog.json` — แค็ตตาล็อกอะไหล่และราคามาตรฐาน (2,120 รายการ)
6. `quotation_archive.json` — คลังประวัติใบเสนอราคาเริ่มต้น
7. `Hoshizaki_Google_AppsScript_Enterprise_v191_3.js` — โค้ด Backend สำหรับ Google Apps Script (Cloud Sync, PDF Backup, Smart LINE Chatbot & Two-Way Technician Escalation)

## 2. ขั้นตอนการอัปเดตระบบ (Deployment Guide)
### ฝั่ง Web App (GitHub Pages / Web Hosting)
- คัดลอกไฟล์ทั้งหมดในโฟลเดอร์นี้ (`index.html`, `sw.js`, `manifest.json`, `serial_db.json`, `parts_catalog.json`, `quotation_archive.json`) ไปวางทับไฟล์เดิมใน Repository ของคุณ

### ฝั่ง Google Apps Script Backend
1. เปิดโปรเจกต์ Google Apps Script ที่ผูกกับ Google Sheets ของระบบ
2. คัดลอกโค้ดทั้งหมดจากไฟล์ `Hoshizaki_Google_AppsScript_Enterprise_v191_3.js` ไปวางทับโค้ดเดิมแล้วกด **Save**
3. กด **Deploy > Manage deployments > แก้ไข (รูปดินสอ) > เลือก Version: New version > กด Deploy**
4. เปิดเว็บแอป > เข้าเมนู **ศูนย์ควบคุมงาน (Operations Control) > คิวคำถามลูกค้าจาก LINE Bot** แล้วกดปุ่ม **"ซิงค์ราคาอะไหล่ให้ LINE Bot"** 1 ครั้ง เพื่อให้ LINE Bot ตอบราคาอะไหล่ได้ทันที
