import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

// --- สลับหน้า ---
function showView(id) {
  document.querySelectorAll('#login-view, #register-view, #profile-view, #edit-address-view')
    .forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

document.getElementById('go-register').onclick = () => showView('register-view');
document.getElementById('go-login').onclick = () => showView('login-view');

// --- สมัครสมาชิก ---
document.getElementById('btn-register').onclick = async () => {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const errorBox = document.getElementById('reg-error');

  if (!name || !phone || !email || !pass) {
    errorBox.innerText = 'กรุณากรอกข้อมูลให้ครบ';
    errorBox.classList.remove('hidden');
    return;
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = result.user.uid;
    const memberId = 'GD-' + uid.slice(0, 5).toUpperCase();

    await setDoc(doc(db, 'users', uid), {
      memberId, name, phone, email,
      wasteMoney: false,
      wellProject: 'no',
      gender: 'unspecified',
      libraryMember: false,
      createdAt: new Date()
    });

    errorBox.classList.add('hidden');
  } catch (err) {
    errorBox.innerText = 'สมัครไม่สำเร็จ: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

// --- เข้าสู่ระบบ ---
document.getElementById('btn-login').onclick = async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errorBox = document.getElementById('login-error');

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    errorBox.classList.add('hidden');
  } catch (err) {
    errorBox.innerText = 'เข้าสู่ระบบไม่สำเร็จ: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

// --- ออกจากระบบ ---
document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- เช็คสถานะล็อกอินตลอดเวลา ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    await loadProfile(currentUid);
    showView('profile-view');
  } else {
    currentUid = null;
    showView('login-view');
  }
});

// รายชื่อจังหวัด (ใส่ไม่ครบ 77 จังหวัด แค่ตัวอย่าง พี่เติมที่เหลือเองได้)
const provinces = ["กรุงเทพมหานคร","นครปฐม","นนทบุรี","ปทุมธานี","สมุทรปราการ","ชลบุรี","เชียงใหม่","ขอนแก่น"];
const provSelect = document.getElementById('addr-prov');
provinces.forEach(p => {
  const opt = document.createElement('option');
  opt.value = p;
  opt.innerText = p;
  provSelect.appendChild(opt);
});

let currentUid = null; // เก็บ uid ของคนที่ login ไว้ใช้ตอนบันทึกที่อยู่

document.getElementById('go-edit-address').onclick = async () => {
  // ดึงข้อมูลที่อยู่เดิม (ถ้ามี) มาเติมในฟอร์มก่อน
  const snap = await getDoc(doc(db, 'users', currentUid));
  const data = snap.data();
  if (data.address) {
    document.getElementById('addr-subdist').value = data.address.subdist || '';
    document.getElementById('addr-dist').value = data.address.dist || '';
    document.getElementById('addr-prov').value = data.address.prov || '';
    document.getElementById('addr-zip').value = data.address.zip || '';
  }
  showView('edit-address-view');
};

document.getElementById('btn-cancel-address').onclick = () => showView('profile-view');

document.getElementById('btn-save-address').onclick = async () => {
  const subdist = document.getElementById('addr-subdist').value.trim();
  const dist = document.getElementById('addr-dist').value.trim();
  const prov = document.getElementById('addr-prov').value;
  const zip = document.getElementById('addr-zip').value.trim();
  const errorBox = document.getElementById('addr-error');

  if (!subdist || !dist || !prov || !zip) {
    errorBox.innerText = 'กรุณากรอกข้อมูลให้ครบ';
    errorBox.classList.remove('hidden');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUid), {
      address: { subdist, dist, prov, zip }
    });
    errorBox.classList.add('hidden');
    await loadProfile(currentUid); // โหลดข้อมูลใหม่มาแสดง
    showView('profile-view');
  } catch (err) {
    errorBox.innerText = 'บันทึกไม่สำเร็จ: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

// แยกฟังก์ชันโหลดโปรไฟล์ออกมา เพื่อเรียกซ้ำได้ (ตอน login และตอนบันทึกที่อยู่เสร็จ)
async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const data = snap.data();
    document.getElementById('prof-memberid').innerText = data.memberId;
    document.getElementById('prof-name').innerText = data.name;

    const addrBox = document.getElementById('prof-address');
    if (data.address) {
      const a = data.address;
      addrBox.innerText = `${a.subdist} ${a.dist} ${a.prov} ${a.zip}`;
    } else {
      addrBox.innerText = 'ยังไม่ได้กรอกที่อยู่';
    }
  }
}