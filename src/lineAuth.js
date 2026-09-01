import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase.js';

const LIFF_ID = '2009970638-OFWiuARz';
const LOGIN_ENDPOINT = '/api/line-login';

export async function initLineAuth() {
  await liff.init({ liffId: LIFF_ID });

  if (!liff.isLoggedIn()) {
    liff.login();
    return; // หน้าเว็บกำลังจะเปลี่ยนไปหน้า LINE อยู่แล้ว ไม่ต้องทำอะไรต่อ
  }

  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new Error('ไม่พบ LIFF ID Token'); // 🆕 throw แทน console.error เฉยๆ
  }

  const res = await fetch(LOGIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const data = await res.json();

  if (!res.ok || !data.customToken) {
    // 🆕 throw พร้อมข้อความ error จริงจาก backend (ถ้ามี)
    throw new Error(data.error || 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ');
  }

  await signInWithCustomToken(auth, data.customToken);
}