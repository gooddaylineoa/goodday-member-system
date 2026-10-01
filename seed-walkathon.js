import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// ใส่ path ไฟล์ service account key ของ Firebase (ดาวน์โหลดจาก Project Settings > Service Accounts)
const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const chonburiMilestones = [
  { steps: 3500, question: "คำขวัญของจังหวัดชลบุรีคืออะไร?", answer: "ทะเลงาม ข้าวหลามอร่อย อ้อยหวาน จักสานดี ประเพณีวิ่งควาย", stampImage: "" },
  { steps: 7000, question: "เกาะที่ใหญ่ที่สุดในจังหวัดชลบุรีคือเกาะอะไร?", answer: "เกาะสีชัง", stampImage: "" },
  { steps: 14000, question: "ไปหนองมน คนพื้นที่จริงๆ เขาซื้อข้าวหลามแบบไหนกิน?", answer: "ข้าวหลามช็อต", stampImage: "" },
  { steps: 21000, question: '"ขนมกันถั่ว" มีชื่อเรียกอีกอย่างว่าอะไร?', answer: "ขนมจักจั่น", stampImage: "" },
  { steps: 28000, question: '"ซอสพริกศรีราชา" ดั้งเดิมมีรสชาติเด่นอย่างไร?', answer: "ครบรส เปรี้ยว เผ็ด เค็ม หวาน กลมกล่อม", stampImage: "" },
  { steps: 35000, question: "ครกหินที่ดีที่สุดในไทย ทำจากตำบลอะไร?", answer: "ตำบลอ่างศิลา", stampImage: "" },
  { steps: 49000, question: "ประเพณีวันออกพรรษาในตัวเมืองชลบุรีคือ?", answer: "ประเพณีวิ่งควาย", stampImage: "" },
  { steps: 63000, question: "ประเพณีก่อเจดีย์ทรายที่บางแสนเรียกว่า?", answer: "ประเพณีวันไหลบางแสน", stampImage: "" },
  { steps: 70000, question: '"แกรนด์แคนยอนชลบุรี" อดีตเคยเป็นอะไร?', answer: "เหมืองหินเก่า", stampImage: "" },
  { steps: 84000, question: "เกาะที่จำกัดนักท่องเที่ยวเพื่ออนุรักษ์ปะการังคือ?", answer: "เกาะแสมสาร", stampImage: "" },
  { steps: 95000, question: "ท่าเรือขนส่งสินค้าที่ใหญ่ที่สุดในไทยคือ?", answer: "ท่าเรือแหลมฉบัง", stampImage: "" },
  { steps: 105000, question: "สัญลักษณ์ทางวัฒนธรรมของพนัสนิคมคือ?", answer: "เครื่องจักสานพนัสนิคม", stampImage: "" },
  { steps: 125000, question: "สโมสรฟุตบอลชลบุรีมีฉายาว่า?", answer: '"ฉลามชล"', stampImage: "" },
  { steps: 145000, question: "ชลบุรีอยู่ในโครงการพัฒนาที่เรียกว่า?", answer: "EEC", stampImage: "" },
  { steps: 165000, question: "แผ่นแป้งทอดใส่กุ้งที่หนองมนเรียกว่า?", answer: "ขนมฝักบัว", stampImage: "" },
  { steps: 185000, question: "อำเภอไหนมีฉายาว่า Little Tokyo?", answer: "ศรีราชา", stampImage: "" },
  { steps: 210000, question: "ชลบุรีมีชายหาดกี่หาด?", answer: "30 กว่าหาด", stampImage: "" },
  { steps: 230000, question: "ชลบุรีมีเกาะทั้งหมดกี่เกาะ?", answer: "มากกว่า 40 เกาะ", stampImage: "" },
  { steps: 250000, question: "ชลบุรีมีส่วนกับการติดหวานของคนไทยยังไง?", answer: "ขยายฐานผลิตน้ำตาลทราย", stampImage: "" },
  { steps: 270000, question: '"พัทยา" เกิดขึ้นได้เพราะอะไร?', answer: "ทหารจีไออเมริกันช่วงสงครามเวียดนาม", stampImage: "" },
  { steps: 285000, question: '"Cobra Gold" คืออะไร?', answer: "การฝึกรบร่วมที่ใหญ่ที่สุดในอาเซียน", stampImage: "" },
  { steps: 300000, question: "กลิ่นป๊อปคอร์นที่สวนสัตว์เขาเขียวมาจากอะไร?", answer: "หมีขอ (บินตุรง)", stampImage: "" }
];

async function seed() {
  await db.collection('walkathonProvinces').doc('chonburi').set({
    name: 'ชลบุรี',
    posterImage: '',   // 👈 ใส่ลิงก์รูปโปสเตอร์ทีหลังผ่าน Firebase Console
    active: true,
    order: 1,
    milestones: chonburiMilestones
  });

  await db.collection('walkathonProvinces').doc('songkhla').set({
    name: 'สงขลา',
    posterImage: '',
    active: false,   // 👈 ยังเป็น "เร็วๆ นี้"
    order: 2,
    milestones: []
  });

  console.log('✅ Seed ข้อมูล Walkathon สำเร็จ');
}
seed();