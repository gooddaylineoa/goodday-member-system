import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// --- สลับหน้า ---
function showView(id) {
  document.querySelectorAll('#login-view, #register-view, #profile-view')
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
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById('prof-memberid').innerText = data.memberId;
      document.getElementById('prof-name').innerText = data.name;
    }
    showView('profile-view');
  } else {
    showView('login-view');
  }
});