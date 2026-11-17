===========================================================================
HOSHIZAKI SERVICE MANAGEMENT SYSTEM (Enterprise v1013-FINAL)
คู่มือการจัดการไฟล์บน GitHub และอัปเดต Google Apps Script (ฉบับแก้ไขสมบูรณ์)
URL: https://serviceshth.github.io/hoshizaki-service-management-system/
===========================================================================

[ส่วนที่ 1] ไฟล์ที่ต้องเก็บไว้และอัปเดตทับบน GitHub Repository
---------------------------------------------------------------------------
1. index.html              -> นำโค้ดใน index_HEAD_patch.html วางใน <head> (แทน <title> และ manifest เดิม)
                              และนำโค้ดทั้งหมดใน index_BODY_v1013_full.html วางเหนือแท็ก </body>
                              จากนั้นอัปโหลดทับไฟล์ index.html เดิมบน GitHub
2. manifest.json           -> อัปโหลดทับไฟล์ manifest.json เดิมบน GitHub (version: 1013-SEC)
3. sw.js                   -> อัปโหลดทับไฟล์ sw.js เดิมบน GitHub (CACHE_NAME: v1013-final)
4. parts_catalog.json      -> เก็บไว้ห้ามลบ (ฐานข้อมูลอะไหล่)
5. quotation_archive.json  -> เก็บไว้ห้ามลบ (ฐานข้อมูลใบเสนอราคา)
6. serial_db.json          -> เก็บไว้ห้ามลบ (ฐานข้อมูล Serial Number เครื่อง)
7. README.md               -> เก็บไว้ได้ตามปกติ

[ส่วนที่ 2] ไฟล์ส่วนเกินที่ต้องลบออกจาก GitHub (คลิกที่ไฟล์ -> จุดสามจุดมุมขวา -> Delete file)
---------------------------------------------------------------------------
- ลบ index_v1013_modules.html                        (ไฟล์แยกชื่อผิด เบราว์เซอร์ไม่โหลด)
- ลบ Code_v1013_backend.gs                           (โค้ดฝั่ง Apps Script ไม่ต้องวางบน GitHub)
- ลบ Hoshizaki_Google_AppsScript_Enterprise_v1011.js (สคริปต์เวอร์ชันเก่า)
- ลบ README_GO_LIVE.txt                              (ไฟล์คู่มือส่วนเกิน)
- ตรวจสอบว่าไม่มีไฟล์ parts_cost_2025.json อยู่ในโฟลเดอร์สาธารณะ

[ส่วนที่ 3] การอัปเดต Google Apps Script (Code.gs) — แก้ไข Syntax Error แล้ว
---------------------------------------------------------------------------
1. เปิดโปรเจกต์ Google Apps Script -> เลือกไฟล์ Code.gs
2. กด Ctrl+A แล้วกด Delete ลบของเดิมทั้งหมด
3. คัดลอกโค้ดทั้งหมดจากไฟล์ Code_v1013_FINAL_CLEAN.js ไปวางแทนที่แล้วกด Save (Ctrl+S)
4. กดปุ่ม Deploy (มุมบนขวา) -> Manage deployments -> คลิกไอคอนรูปดินสอ (Edit)
   -> ช่อง Version เลือก New version -> กด Deploy (จะได้ Web App URL เดิม)

[ส่วนที่ 4] การเปิดใช้งานจริงวันแรก (Phase 1: Service Unit & Service Center)
---------------------------------------------------------------------------
1. เปิดลิงก์ https://serviceshth.github.io/hoshizaki-service-management-system/
2. กดปุ่มสีแดง "อัปเดตแอป" (หรือกด F12 -> Application -> Clear site data แล้วรีเฟรช)
3. กดปุ่ม "ดึงใบงานเก่า & อะไหล่ Cloud" -> วาง Web App URL (.../exec) แล้วกด บันทึก URL
4. กดปุ่ม "ดึงรายการใบงานเก่าจาก Cloud" และ "ดึงฐานข้อมูลอะไหล่จาก Cloud" เพื่อซิงค์ข้อมูลทันที
