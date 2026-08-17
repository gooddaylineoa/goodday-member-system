import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

// --- สลับหน้า ---
function showView(id) {
  document.querySelectorAll('.page-section')
    .forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
window.showView = showView;

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

    if (data.profileImage) {
      document.getElementById('prof-pic').src = data.profileImage;
    }

    const addrBox = document.getElementById('prof-address');
    if (data.address) {
      const a = data.address;
      addrBox.innerText = `${a.subdist} ${a.dist} ${a.prov} ${a.zip}`;
    } else {
      addrBox.innerText = 'ยังไม่ได้กรอกที่อยู่';
    }

    renderWasteBox(data);   // ← เพิ่มบรรทัดนี้
  }
}

// --- แสดงกล่อง Waste box ในหน้าโปรไฟล์ ตามสถานะ ---
function renderWasteBox(data) {
  const box = document.getElementById('waste-box');
  if (data.wasteMoney) {
    box.className = 'rounded-xl p-4 mb-4 text-white cursor-pointer bg-emerald-500';
    box.innerHTML = `<p class="font-bold">สมุดสะสม Waste for Wealth</p><p class="text-xs opacity-80">ดูยอดสะสมและประวัติของฉัน</p>`;
    box.onclick = openWasteLogbook;
  } else {
    box.className = 'rounded-xl p-4 mb-4 text-white cursor-pointer bg-emerald-500';
    box.innerHTML = `<p class="font-bold">Waste for Wealth</p><p class="text-xs opacity-80">สะสมยอดขายขยะ เปลี่ยนเป็นส่วนลดสินค้า</p>`;
    box.onclick = () => showView('waste-join-view');
  }
}

document.getElementById('btn-cancel-waste-join').onclick = () => showView('profile-view');

document.getElementById('btn-join-waste').onclick = async () => {
  const house = document.getElementById('wj-house').value.trim();
  const subdist = document.getElementById('wj-subdist').value.trim();
  const dist = document.getElementById('wj-dist').value.trim();
  const prov = document.getElementById('wj-prov').value.trim();
  const errorBox = document.getElementById('wj-error');

  if (!house || !subdist || !dist || !prov) {
    errorBox.innerText = 'กรุณากรอกข้อมูลให้ครบ';
    errorBox.classList.remove('hidden');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUid), {
      wasteMoney: true,
      wastePickupAddress: { house, subdist, dist, prov }
    });
    errorBox.classList.add('hidden');
    await loadProfile(currentUid);
    showView('profile-view');
  } catch (err) {
    errorBox.innerText = 'เกิดข้อผิดพลาด: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

document.getElementById('btn-back-from-logbook').onclick = () => showView('profile-view');

// --- เปิดสมุดบันทึก: ดึง log ทั้งหมดจาก sub-collection มารวมยอด ---
async function openWasteLogbook() {
  showView('waste-logbook-view');
  const listBox = document.getElementById('wl-history-list');
  listBox.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">กำลังโหลด...</p>';

  const logsRef = collection(db, 'users', currentUid, 'wasteLogs');
  const snap = await getDocs(logsRef);

  let total = 0;
  const logs = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    total += d.amount || 0;
    logs.push(d);
  });

  document.getElementById('wl-total').innerText = total.toFixed(2);
  const remaining = total % 100;
  document.getElementById('wl-progress-text').innerText = `${remaining.toFixed(0)} / 100 บาท`;
  document.getElementById('wl-progress-bar').style.width = remaining + '%';

  if (logs.length === 0) {
    listBox.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">ยังไม่มีประวัติการส่งขยะ</p>';
  } else {
    listBox.innerHTML = logs.map(l => `
      <div class="bg-white border rounded-lg p-3 flex justify-between items-center">
        <span class="text-sm text-gray-600">${l.date || '-'}</span>
        <span class="font-bold text-emerald-600">+${(l.amount || 0).toFixed(2)} บาท</span>
      </div>
    `).join('');
  }
}

// ฟังก์ชันกลางสำหรับปุ่มที่ยังไม่ได้ทำฟังก์ชันจริง
window.notReady = function () {
  alert('ฟีเจอร์นี้ยังไม่เปิดใช้งาน กำลังพัฒนาอยู่ครับ 🚧');
};

document.getElementById('btn-cancel-health-form').onclick = () => showView('profile-view');
document.getElementById('btn-back-from-health').onclick = () => showView('profile-view');

document.getElementById('btn-save-health').onclick = async () => {
  const nickname = document.getElementById('hf-nickname').value.trim();
  const gender = document.getElementById('hf-gender').value;
  const height = document.getElementById('hf-height').value;
  const weight = document.getElementById('hf-weight').value;
  const errorBox = document.getElementById('hf-error');

  if (!nickname || !gender || !height || !weight) {
    errorBox.innerText = 'กรุณากรอก ชื่อเล่น, เพศ, ส่วนสูง, น้ำหนัก ให้ครบ';
    errorBox.classList.remove('hidden');
    return;
  }

  const logsRef = collection(db, 'users', currentUid, 'healthLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');
  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    errorBox.innerText = 'คุณบันทึกข้อมูลของวันนี้ไปแล้ว กรุณากลับมาใหม่พรุ่งนี้';
    errorBox.classList.remove('hidden');
    return;
  }

  const healthData = {
    date: todayStr,
    nickname, gender,
    height: Number(height), weight: Number(weight),
    fat: Number(document.getElementById('hf-fat').value) || 0,
    visceral: Number(document.getElementById('hf-visceral').value) || 0,
    muscle: Number(document.getElementById('hf-muscle').value) || 0,
    bodyAge: Number(document.getElementById('hf-bodyage').value) || 0,
    bmr: Number(document.getElementById('hf-bmr').value) || 0,
    waist: Number(document.getElementById('hf-waist').value) || 0,
    sys: Number(document.getElementById('hf-sys').value) || 0,
    dia: Number(document.getElementById('hf-dia').value) || 0,
    disease: document.getElementById('hf-disease').value.trim() || '-',
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(logsRef, healthData);
    await updateDoc(doc(db, 'users', currentUid), { nickname, gender });

    // 🌟 จุดเชื่อมกับ WWW
    const userSnap = await getDoc(doc(db, 'users', currentUid));
    const userData = userSnap.data();
    const wantJoin = document.getElementById('hf-join-www').checked;

    if (userData.wellProject === true) {
      // เข้าร่วมอยู่แล้ว -> ก๊อปข้อมูลนี้เข้า wwwLogs ด้วยอัตโนมัติ
      await addDoc(collection(db, 'users', currentUid, 'wwwLogs'), {
        date: todayStr, weight: healthData.weight, fat: healthData.fat,
        visceral: healthData.visceral, muscle: healthData.muscle,
        bodyAge: healthData.bodyAge, bmr: healthData.bmr,
        ambassador: '-', createdAt: serverTimestamp()
      });
      errorBox.classList.add('hidden');
      alert('บันทึกข้อมูลสุขภาพสำเร็จ! (อัปเดตกราฟ WWW ให้ด้วยแล้ว)');
      showView('profile-view');
    } else if (wantJoin) {
      // ยังไม่เข้าร่วม แต่ติ๊กอยากเข้าร่วม -> ไปหน้าตั้งเป้าหมายต่อ
      errorBox.classList.add('hidden');
      alert('บันทึกข้อมูลสุขภาพสำเร็จ! ต่อไปมาตั้งเป้าหมาย Well Well Well! กันครับ');
      renderWizardGoals();
      await prefillWizardBodyData();
      showView('www-wizard-view');
    } else {
      errorBox.classList.add('hidden');
      alert('บันทึกข้อมูลสุขภาพสำเร็จ!');
      showView('profile-view');
    }
  } catch (err) {
    errorBox.innerText = 'เกิดข้อผิดพลาด: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

async function openHealthHistory() {
  showView('health-history-view');
  // เพิ่มก่อนบรรทัด listBox.innerHTML = html; เดิม
  const ascLogs = [...logs].reverse(); // เรียงเก่า -> ใหม่ สำหรับกราฟ
  if (ascLogs.length > 0) {
    document.getElementById('health-charts-container').classList.remove('hidden');
    const labels = ascLogs.map(l => l.date);
    renderMiniChart('chart-h-weight', labels, ascLogs.map(l => l.weight), '#2563eb');
    renderMiniChart('chart-h-fat', labels, ascLogs.map(l => l.fat), '#2563eb');
    renderMiniChart('chart-h-muscle', labels, ascLogs.map(l => l.muscle), '#2563eb');
    renderMiniChart('chart-h-bmr', labels, ascLogs.map(l => l.bmr), '#2563eb');
  }
  const listBox = document.getElementById('health-history-list');
  listBox.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">กำลังโหลด...</p>';

  const logsRef = collection(db, 'users', currentUid, 'healthLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  if (snap.empty) {
    listBox.innerHTML = `
      <div class="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
        <p class="text-gray-500 font-bold text-sm mb-1">ยังไม่มีข้อมูลสุขภาพ</p>
        <p class="text-gray-400 text-xs">กรุณากรอกข้อมูลเริ่มต้นเพื่อเปิดใช้งาน</p>
      </div>`;
    return;
  }

  let html = '';
const logs = [];
snap.forEach(docSnap => {
  const d = docSnap.data();
  logs.push(d);
    html += `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <p class="text-xs text-gray-400 font-bold mb-2"><i class="fa-regular fa-calendar mr-1"></i> ${d.date}</p>
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div><p class="text-gray-400">น้ำหนัก</p><p class="font-bold text-blue-700">${d.weight} kg</p></div>
          <div><p class="text-gray-400">ไขมัน</p><p class="font-bold text-blue-700">${d.fat}%</p></div>
          <div><p class="text-gray-400">กล้ามเนื้อ</p><p class="font-bold text-blue-700">${d.muscle}%</p></div>
        </div>
      </div>`;
  });
  listBox.innerHTML = html;
}
window.openHealthHistory = openHealthHistory;

// --- ข้อมูลเป้าหมาย (สร้าง checkbox แบบไดนามิก) ---
const wwwGoalsMaster = [
  { title: 'การนอน', tags: ['นอนครบ 7-9 ชม.', 'ลดการดื่มคาเฟอีน', 'รู้สึกสดชื่นตอนตื่น'] },
  { title: 'น้ำหนัก', tags: ['ลดน้ำหนัก', 'เพิ่มกล้ามเนื้อ', 'ลดสัดส่วน'] },
  { title: 'พลังงานใจ', tags: ['เครียดน้อยลง', 'มีแรงบันดาลใจมากขึ้น', 'ลดเสพโซเชียล'] },
  { title: 'ความแข็งแรง', tags: ['ไม่เหนื่อยง่าย', 'เดิน/วิ่งได้ไกลขึ้น'] }
];

function renderWizardGoals() {
  const container = document.getElementById('wizard-goals-container');
  container.innerHTML = wwwGoalsMaster.map(cat => `
    <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
      <h3 class="text-sm font-bold text-gray-800 mb-2">${cat.title}</h3>
      <div class="flex flex-wrap gap-2">
        ${cat.tags.map(tag => `
          <label class="cursor-pointer">
            <input type="checkbox" value="${tag}" class="peer hidden wiz-goal-cb">
            <div class="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium border peer-checked:bg-amber-500 peer-checked:text-white peer-checked:border-amber-500">${tag}</div>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function openWWWEntry() {
  const snap = await getDoc(doc(db, 'users', currentUid));
  const data = snap.data();
  if (data.wellProject) {
    showView('www-hub-view');
  } else {
    renderWizardGoals();
    await prefillWizardBodyData();   // ← เพิ่มบรรทัดนี้
    showView('www-wizard-view');
  }
}
window.openWWWEntry = openWWWEntry;

document.getElementById('btn-cancel-wizard').onclick = () => showView('profile-view');

document.getElementById('btn-wizard-next').onclick = () => {
  const checked = document.querySelectorAll('.wiz-goal-cb:checked');
  const monthlyGoal = document.getElementById('wiz-monthly-goal').value.trim();
  const errorBox = document.getElementById('wiz-error');

  if (checked.length === 0) {
    errorBox.innerText = 'กรุณาเลือกเป้าหมายอย่างน้อย 1 ข้อ';
    errorBox.classList.remove('hidden');
    return;
  }
  if (!monthlyGoal) {
    errorBox.innerText = 'กรุณาเขียนเป้าหมายประจำเดือน';
    errorBox.classList.remove('hidden');
    return;
  }
  errorBox.classList.add('hidden');
  showView('www-bodydata-view');
};

document.getElementById('btn-back-to-wizard').onclick = () => showView('www-wizard-view');

document.getElementById('btn-submit-www').onclick = async () => {
  const weight = document.getElementById('wbd-weight').value;
  const ambassador = document.getElementById('wbd-ambassador').value.trim();
  const errorBox = document.getElementById('wbd-error');

  if (!weight || !ambassador) {
    errorBox.innerText = 'กรุณากรอกน้ำหนักและผู้แนะนำให้ครบ';
    errorBox.classList.remove('hidden');
    return;
  }

  const goals = Array.from(document.querySelectorAll('.wiz-goal-cb:checked')).map(cb => cb.value);
  const monthlyGoal = document.getElementById('wiz-monthly-goal').value.trim();

  try {
    await updateDoc(doc(db, 'users', currentUid), {
      wellProject: true, goals, monthlyGoal
    });

    await addDoc(collection(db, 'users', currentUid, 'wwwLogs'), {
      date: new Date().toLocaleDateString('th-TH'),
      weight: Number(weight),
      fat: Number(document.getElementById('wbd-fat').value) || 0,
      visceral: Number(document.getElementById('wbd-visceral').value) || 0,
      muscle: Number(document.getElementById('wbd-muscle').value) || 0,
      bodyAge: Number(document.getElementById('wbd-bodyage').value) || 0,
      bmr: Number(document.getElementById('wbd-bmr').value) || 0,
      ambassador,
      createdAt: serverTimestamp()
    });

    errorBox.classList.add('hidden');
    alert('เข้าร่วมโครงการ Well Well Well! สำเร็จ 🎉');
    showView('www-hub-view');
  } catch (err) {
    errorBox.innerText = 'เกิดข้อผิดพลาด: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

document.getElementById('btn-back-hub').onclick = () => showView('profile-view');
document.getElementById('btn-open-update').onclick = () => showView('www-update-view');
document.getElementById('btn-cancel-update').onclick = () => showView('www-hub-view');

document.getElementById('btn-save-update').onclick = async () => {
  const weight = document.getElementById('wu-weight').value;
  const ambassador = document.getElementById('wu-ambassador').value.trim();
  const errorBox = document.getElementById('wu-error');

  if (!weight || !ambassador) {
    errorBox.innerText = 'กรุณากรอกน้ำหนักและผู้แนะนำให้ครบ';
    errorBox.classList.remove('hidden');
    return;
  }

  // เช็คว่าอัปเดตล่าสุดเกิน 14 วันหรือยัง
  const logsRef = collection(db, 'users', currentUid, 'wwwLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);

  if (!lastSnap.empty) {
    const lastData = lastSnap.docs[0].data();
    if (lastData.createdAt) {
      const lastDate = lastData.createdAt.toDate();
      const diffDays = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
      if (diffDays < 14) {
        errorBox.innerText = `คุณเพิ่งอัปเดตไปเมื่อไม่นานมานี้ กรุณารออีก ${Math.ceil(14 - diffDays)} วัน`;
        errorBox.classList.remove('hidden');
        return;
      }
    }
  }

  try {
    await addDoc(logsRef, {
      date: new Date().toLocaleDateString('th-TH'),
      weight: Number(weight),
      fat: Number(document.getElementById('wu-fat').value) || 0,
      visceral: Number(document.getElementById('wu-visceral').value) || 0,
      muscle: Number(document.getElementById('wu-muscle').value) || 0,
      bodyAge: Number(document.getElementById('wu-bodyage').value) || 0,
      bmr: Number(document.getElementById('wu-bmr').value) || 0,
      ambassador,
      createdAt: serverTimestamp()
    });
    errorBox.classList.add('hidden');
    alert('อัปเดตข้อมูลสำเร็จ!');
    showView('www-hub-view');
  } catch (err) {
    errorBox.innerText = 'เกิดข้อผิดพลาด: ' + err.message;
    errorBox.classList.remove('hidden');
  }
};

document.getElementById('btn-open-history').onclick = async () => {
  showView('www-history-view');
  const listBox = document.getElementById('www-history-list');
  listBox.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">กำลังโหลด...</p>';

  const logsRef = collection(db, 'users', currentUid, 'wwwLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  if (snap.empty) {
    listBox.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">ยังไม่มีข้อมูล</p>';
    return;
  }

  let html = '';
  const logs = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    logs.push(d);
    html += `
      <div class="bg-white rounded-xl shadow-sm border border-pink-100 p-4">
        <p class="text-xs text-gray-400 font-bold mb-2">${d.date}</p>
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div><p class="text-gray-400">น้ำหนัก</p><p class="font-bold theme-text">${d.weight} kg</p></div>
          <div><p class="text-gray-400">ไขมัน</p><p class="font-bold theme-text">${d.fat}%</p></div>
          <div><p class="text-gray-400">กล้ามเนื้อ</p><p class="font-bold theme-text">${d.muscle}%</p></div>
        </div>
      </div>`;
  });
  const ascLogs = [...logs].reverse();
    if (ascLogs.length > 0) {
      document.getElementById('www-charts-container').classList.remove('hidden');
      const labels = ascLogs.map(l => l.date);
      renderMiniChart('chart-w-weight', labels, ascLogs.map(l => l.weight), '#d81b60');
      renderMiniChart('chart-w-fat', labels, ascLogs.map(l => l.fat), '#d81b60');
      renderMiniChart('chart-w-muscle', labels, ascLogs.map(l => l.muscle), '#d81b60');
    }
  listBox.innerHTML = html;
};
document.getElementById('btn-back-history').onclick = () => showView('www-hub-view');

let miniCharts = {};
function renderMiniChart(canvasId, labels, dataArr, color) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (miniCharts[canvasId]) miniCharts[canvasId].destroy();
  const ctx = el.getContext('2d');
  miniCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data: dataArr, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 3, tension: 0.2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
  });
}

async function openHealthForm() {
  const snap = await getDoc(doc(db, 'users', currentUid));
  const data = snap.data();
  const optinBox = document.getElementById('hf-www-optin');
  if (data.wellProject === true) {
    optinBox.classList.add('hidden'); // เข้าร่วมแล้ว ไม่ต้องถามซ้ำ
  } else {
    optinBox.classList.remove('hidden');
  }
  showView('health-form-view');
}
window.openHealthForm = openHealthForm;

async function prefillWizardBodyData() {
  const logsRef = collection(db, 'users', currentUid, 'healthLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0].data();
    document.getElementById('wbd-weight').value = d.weight || '';
    document.getElementById('wbd-fat').value = d.fat || '';
    document.getElementById('wbd-visceral').value = d.visceral || '';
    document.getElementById('wbd-muscle').value = d.muscle || '';
    document.getElementById('wbd-bodyage').value = d.bodyAge || '';
    document.getElementById('wbd-bmr').value = d.bmr || '';
  }
}