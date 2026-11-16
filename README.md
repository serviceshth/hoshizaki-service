# HOSHIZAKI (THAILAND) LIMITED — Job Service Management System & Dual LINE OA Bridge (Enterprise v191.4)

## 1. โครงสร้างการเชื่อมโยง 2 บัญชี LINE Official Account
- **`Hoshizaki_Th` (บัญชีหลักของออฟฟิศ):** เปิดโหมด **แชท (1:1 Chat)** ให้แอดมินออฟฟิศตอบคำถามลูกค้าและประสานงานทั่วไปตามปกติ + ติดตั้งปุ่ม **Rich Menu** ลิงก์ไปหา `ServiceBot Hoshizaki`
- **`ServiceBot Hoshizaki` (บัญชีแชทบอท):** ผูก **Webhook URL** และ **Channel Access Token** กับ Google Apps Script + เปิดโหมด **อนุญาตให้เข้าร่วมแชทกลุ่ม** เพื่อเป็นบอทผู้ช่วยทั้งในแชท 1:1 และใน **กลุ่มประสานงานกลาง (ออฟฟิศ + ทีมช่าง)**

## 2. ขั้นตอนการตั้งค่าเชื่อมโยง 2 บัญชี (ทำครั้งเดียว)
1. **อัปเดตโค้ด Backend:** นำไฟล์ `Hoshizaki_Google_AppsScript_Enterprise_v191_4.js` ไปวางทับโค้ดเดิมใน Google Apps Script > กด **Save** > **Deploy > Manage deployments > แก้ไข > เลือก Version: New version > Deploy**
2. **นำ Webhook URL ไปวางใน LINE Developers:** เข้า LINE Developers Console ของบัญชี **`ServiceBot Hoshizaki`** > แท็บ **Messaging API** > วาง Web App URL ในช่อง **Webhook URL** และกด **Use webhook = เปิด**
3. **เชิญบอทเข้ากลุ่มประสานงานกลาง:** เชิญ **`ServiceBot Hoshizaki`** เข้ากลุ่ม LINE ที่มีแอดมินออฟฟิศ (`Hoshizaki_Th`) และทีมช่างอยู่ร่วมกัน แล้วพิมพ์คำสั่ง `ID` ในกลุ่มเพื่อรับรหัส `Group ID` (ขึ้นต้นด้วย `C...`)
4. **ตั้งค่าใน Web App (`จัดการบุคลากร / Staff`):**
   - กรอก **Token บัญชีแชทบอท (`ServiceBot Hoshizaki`)**
   - กรอก **LINE Group ID** ของกลุ่มประสานงานกลาง
   - กรอก **LINE ID บอท (`@...`)** และ **LINE ID ออฟฟิศหลัก (`@...`)** แล้วกด **บันทึก**
   - กดปุ่ม **"ลิงก์บอท (ใส่RichMenuหลัก)"** เพื่อคัดลอก URL ไปวางในปุ่ม Rich Menu ของ **`Hoshizaki_Th`** และกด **"ลิงก์ออฟฟิศ"** เพื่อนำไปวางในปุ่ม Rich Menu ของ **`ServiceBot Hoshizaki`**
