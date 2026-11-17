===========================================================================
HOSHIZAKI SERVICE MANAGEMENT SYSTEM (v1013-SEC) — PRODUCTION GO-LIVE GUIDE
URL: https://serviceshth.github.io/hoshizaki-service-management-system/
===========================================================================

1. เปลี่ยนชื่อ Repository บน GitHub:
   - เข้าไปที่ Repository เดิม (hoshizaki-service) -> Settings -> General
   - เปลี่ยน Repository name เป็น: hoshizaki-service-management-system แล้วกด Rename
   - ไปที่ Settings -> Pages ติ๊กถูก Enforce HTTPS

2. อัปโหลดไฟล์ขึ้น GitHub Repository:
   - นำไฟล์ manifest.json และ sw.js ในแพ็กเกจนี้ไปวางแทนที่ไฟล์เดิมใน GitHub
   - นำโค้ดในไฟล์ index_v1013_modules.html ไปวางใน <head> และก่อนแท็ก </body> ของ index.html
   - ห้ามนำไฟล์ parts_cost_2025.json ใส่ในโฟลเดอร์สาธารณะบน GitHub

3. อัปเดต Google Apps Script (Code.gs):
   - นำฟังก์ชันในไฟล์ Code_v1013_backend.gs ไปวางต่อท้าย Code.gs
   - กด Deploy -> New deployment -> Web app (Execute as: Me / Access: Anyone)

4. เปิดใช้งานจริง (Phase 1: Service Unit & Service Center):
   - เปิดลิงก์ https://serviceshth.github.io/hoshizaki-service-management-system/
   - กดปุ่มสีแดง "อัปเดตแอป" และกด "Auto Self-Check" เพื่อยืนยันสถานะ PASS
