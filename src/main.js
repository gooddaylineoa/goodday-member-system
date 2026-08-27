import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  linkWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp, where } from 'firebase/firestore';
import { initLineAuth } from './lineAuth.js';

// ⚠️ แทนที่ด้วยค่าจริงของพี่จาก Cloudinary Dashboard
const CLOUDINARY_CLOUD_NAME = 'l1htg1ks';
const CLOUDINARY_UPLOAD_PRESET = 'goodday_unsigned';

// ===================== ระบบแจ้งเตือน Toast (ใช้แทน alert ทั้งแอป) =====================
function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) { alert(message); return; }

  const styles = {
    success: { bg: 'bg-emerald-500', icon: 'fa-circle-check' },
    error: { bg: 'bg-rose-500', icon: 'fa-circle-exclamation' },
    info: { bg: 'bg-blue-500', icon: 'fa-circle-info' }
  };
  const s = styles[type] || styles.info;

  const toast = document.createElement('div');
  toast.className = `toast-pop ${s.bg} text-white rounded-2xl shadow-lg px-4 py-3.5 flex items-start gap-3 text-sm font-bold`;
  toast.innerHTML = `
    <i class="fa-solid ${s.icon} text-lg mt-0.5 shrink-0"></i>
    <span class="flex-1 leading-snug">${message}</span>
    <button class="toast-close opacity-70 hover:opacity-100 shrink-0"><i class="fa-solid fa-xmark"></i></button>
  `;

  const remove = () => {
    if (!toast.isConnected) return;
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector('.toast-close').onclick = remove;
  container.appendChild(toast);
  setTimeout(remove, duration);
}
window.showToast = showToast;

// --- ป็อปอัพแจ้งผลสำเร็จแบบทั่วไป (ใช้ตอน Check-in เข้าสู่ระบบ WWW) ---
function showAppModal({ title = 'สำเร็จ!', message = '', okText = 'OK', icon = 'fa-check', onOk } = {}) {
  const modal = document.getElementById('app-modal');
  if (!modal) return;
  document.getElementById('app-modal-title').innerText = title;
  document.getElementById('app-modal-message').innerText = message;
  document.getElementById('app-modal-ok').innerText = okText;
  document.getElementById('app-modal-icon').className = `fa-solid ${icon}`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('app-modal-ok').onclick = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (onOk) onOk();
  };
}
window.showAppModal = showAppModal;

// --- สลับหน้า ---
function showView(id) {
  document.querySelectorAll('.page-section')
    .forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
window.showView = showView;

document.getElementById('btn-login-line').onclick = () => {
  initLineAuth();
};

document.getElementById('btn-login').onclick = async () => {
  const phone = document.getElementById('login-phone').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errBox = document.getElementById('login-error');

  if (!phone || !pass) {
    errBox.innerText = 'กรุณากรอกเบอร์โทรศัพท์และรหัสผ่านให้ครบ';
    errBox.classList.remove('hidden');
    return;
  }

  showLoading('กำลังเข้าสู่ระบบ...');
  try {
    await signInWithEmailAndPassword(auth, phoneToSyntheticEmail(phone), pass);
    errBox.classList.add('hidden');
  } catch (err) {
    let msg = 'เข้าสู่ระบบไม่สำเร็จ';
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
      msg = 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง';
    }
    errBox.innerText = msg;
    errBox.classList.remove('hidden');
  } finally {
    hideLoading();
  }
};

// --- ออกจากระบบ ---
document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- เช็คสถานะล็อกอินตลอดเวลา ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    await loadProfile(currentUid);
    const complete = await checkProfileComplete(currentUid);
    if (complete) showView('profile-view');
  } else {
    currentUid = null;
    showView('login-view');   // ✅ แค่โชว์หน้า login เฉยๆ ไม่บังคับ LINE
  }
});

// รายชื่อจังหวัด (ใส่ไม่ครบ 77 จังหวัด แค่ตัวอย่าง พี่เติมที่เหลือเองได้)
const provinces = ["กรุงเทพมหานคร","นครปฐม","นนทบุรี","ปทุมธานี","สมุทรปราการ","ชลบุรี","เชียงใหม่","ขอนแก่น"];

let currentUid = null; // เก็บ uid ของคนที่ login ไว้ใช้ตอนบันทึกที่อยู่

const goEditAddressBtn = document.getElementById('go-edit-address');
if (goEditAddressBtn) {
  goEditAddressBtn.onclick = async () => {
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
}

document.getElementById('btn-cancel-address').onclick = () => showView('profile-view');

document.getElementById('btn-save-address').onclick = async () => {
  const subdist = document.getElementById('addr-subdist').value.trim();
  const dist = document.getElementById('addr-dist').value.trim();
  const prov = document.getElementById('addr-prov').value;
  const zip = document.getElementById('addr-zip').value.trim();

  if (!subdist || !dist || !prov || !zip) {
    showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUid), {
      address: { subdist, dist, prov, zip }
    });
    await loadProfile(currentUid); // โหลดข้อมูลใหม่มาแสดง
    showToast('บันทึกที่อยู่สำเร็จ', 'success');
    showView('profile-view');
  } catch (err) {
    showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  }
};

function phoneToSyntheticEmail(phone) {
  return `${phone.replace(/-/g, '')}@goodday.local`;
}

// แยกฟังก์ชันโหลดโปรไฟล์ออกมา เพื่อเรียกซ้ำได้ (ตอน login และตอนบันทึกที่อยู่เสร็จ)
async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return;   // 🆕 กันเอกสารยังไม่มีเลย (เพิ่งสร้างบัญชีเสร็จหมาดๆ)
  const data = snap.data();
  document.getElementById('prof-memberid').innerText = data.memberId || '-';
  document.getElementById('prof-name').innerText = data.name || 'สมาชิกใหม่';

  const headerName = document.getElementById('header-name');
  if (headerName) headerName.innerText = data.name || 'ผู้ใช้งาน';   // 🆕 เพิ่ม fallback

  const profPic = document.getElementById('prof-pic');
  if (profPic && data.profileImage) {
    profPic.src = data.profileImage;
  }

  const addrBox = document.getElementById('prof-address');
  if (addrBox) {
    if (data.address) {
      const a = data.address;
      addrBox.innerText = `${a.subdist} ${a.dist} ${a.prov} ${a.zip}`;
    } else {
      addrBox.innerText = 'ยังไม่ได้กรอกที่อยู่';
    }
  }

  renderWasteBox(data);

  const wwwMenu = document.getElementById('www-menu-item');
  if (wwwMenu) wwwMenu.classList.toggle('hidden', data.wellProject !== true);
}

// --- แสดงกล่อง Waste box ในหน้าโปรไฟล์ ตามสถานะ ---
// หมายเหตุ: ไม่แตะ className/โครง HTML ของ #waste-box อีกต่อไป (โครงเดิมใน index.html
// มีไอคอน + ลูกศรเหมือนเมนูอื่นๆ อยู่แล้ว) แก้แค่ข้อความกับ onclick ให้ตรงสถานะ เพื่อให้
// ปุ่มนี้หน้าตาเหมือนเมนูอื่นทุกอันในหน้าแรก
function renderWasteBox(data) {
  const box = document.getElementById('waste-box');
  const titleEl = document.getElementById('waste-title');
  const subtitleEl = document.getElementById('waste-subtitle');
  if (!box || !titleEl || !subtitleEl) return;

  if (data.wasteMoney) {
    titleEl.innerText = 'สมุดสะสม Waste for Wealth';
    subtitleEl.innerText = 'คลิกดูยอดสะสมและประวัติส่งขยะของฉัน';
    box.onclick = openWasteLogbook;
  } else {
    titleEl.innerText = 'Waste for Wealth';
    subtitleEl.innerText = 'สะสมยอดขายขยะ เปลี่ยนเป็นส่วนลดสินค้า';
    box.onclick = () => showView('waste-join-view');
  }
}

document.getElementById('btn-cancel-waste-join').onclick = () => showView('profile-view');

document.getElementById('btn-join-waste').onclick = async () => {
  const house = document.getElementById('wj-house').value.trim();
  const subdist = document.getElementById('wj-subdist').value.trim();
  const dist = document.getElementById('wj-dist').value.trim();
  const prov = document.getElementById('wj-prov').value.trim();

  if (!house || !subdist || !dist || !prov) {
    showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUid), {
      wasteMoney: true,
      wastePickupAddress: { house, subdist, dist, prov }
    });
    await loadProfile(currentUid);
    showToast('เข้าร่วมโครงการ Waste for Wealth สำเร็จ!', 'success');
    showView('profile-view');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
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
  showToast('ฟีเจอร์นี้ยังไม่เปิดใช้งาน กำลังพัฒนาอยู่ครับ 🚧', 'info');
};

// ===================== คำนวณผลประเมินสุขภาพแบบเรียลไทม์ (อิงเกณฑ์จากระบบเดิม) =====================
function calcHealthRealtime() {
  const genderEl = document.getElementById('hf-gender');
  const ageEl = document.getElementById('hf-age');
  if (!genderEl || !ageEl) return; // หน้านี้ยังไม่ถูกโหลด

  const gender = genderEl.value;
  const age = parseFloat(ageEl.value) || 0;
  const h = parseFloat(document.getElementById('hf-height').value) || 0;
  const w = parseFloat(document.getElementById('hf-weight').value) || 0;
  const waist = parseFloat(document.getElementById('hf-waist').value) || 0;
  const visceral = parseFloat(document.getElementById('hf-visceral').value) || 0;
  const bodyAge = parseFloat(document.getElementById('hf-bodyage').value) || 0;
  const bmr = parseFloat(document.getElementById('hf-bmr').value) || 0;
  const sys = parseFloat(document.getElementById('hf-sys').value) || 0;
  const fat = parseFloat(document.getElementById('hf-fat').value) || 0;
  const mus = parseFloat(document.getElementById('hf-muscle').value) || 0;

  // น้ำหนักมาตรฐาน + BMI
  if (h > 0 && w > 0) {
    const resWeight = document.getElementById('res-weight-hf');
    if (!gender) {
      resWeight.innerHTML = '<span class="text-red-500">กรุณาเลือกเพศเพื่อประเมินผล</span>';
    } else {
      const stdW = gender === 'male' ? h - 105 : h - 110;
      const diffW = w - stdW;
      let wColor = 'text-green-600', wText = 'ปกติและสมส่วน';
      if (Math.abs(diffW) > 10) { wColor = 'text-red-600'; wText = 'เริ่มมีความเสี่ยง'; }
      else if (diffW > 5) { wColor = 'text-yellow-600'; wText = 'เริ่มอ้วน'; }
      else if (diffW <= -5) { wColor = 'text-yellow-600'; wText = 'เริ่มผอม'; }
      resWeight.innerHTML = `ค่ามาตรฐาน: <strong class="text-blue-600">${stdW.toFixed(1)} kg</strong> <br><span class="${wColor}">(${wText})</span>`;
    }
    document.getElementById('res-bmi-hf').innerText = (w / Math.pow(h / 100, 2)).toFixed(1);
  }

  // ไขมันร่างกาย
  const resFat = document.getElementById('res-fat-hf');
  if (fat > 0 && gender) {
    let fColor = 'text-green-600', fText = 'ปกติ';
    if (gender === 'male') {
      if (fat >= 25) { fColor = 'text-red-600'; fText = 'อ้วน'; }
      else if (fat >= 20 || fat < 10) { fColor = 'text-yellow-600'; fText = fat < 10 ? 'ต่ำไป' : 'เริ่มอ้วน'; }
    } else {
      if (fat >= 35) { fColor = 'text-red-600'; fText = 'อ้วน'; }
      else if (fat >= 30 || fat < 20) { fColor = 'text-yellow-600'; fText = fat < 20 ? 'ต่ำไป' : 'เริ่มอ้วน'; }
    }
    resFat.innerHTML = `<span class="${fColor}">(${fText})</span>`;
  } else if (resFat) { resFat.innerHTML = ''; }

  // มวลกล้ามเนื้อ
  const resMus = document.getElementById('res-muscle-hf');
  if (mus > 0 && gender) {
    let mColor = 'text-green-600', mText = 'ปกติ';
    if (gender === 'male') {
      if (mus < 20) { mColor = 'text-red-600'; mText = 'ต่ำ'; }
      else if (mus < 30) { mColor = 'text-yellow-600'; mText = 'เริ่มต่ำ'; }
    } else {
      if (mus < 15) { mColor = 'text-red-600'; mText = 'ต่ำ'; }
      else if (mus < 25) { mColor = 'text-yellow-600'; mText = 'เริ่มต่ำ'; }
    }
    resMus.innerHTML = `<span class="${mColor}">(${mText})</span>`;
  } else if (resMus) { resMus.innerHTML = ''; }

  // ไขมันช่องท้อง
  if (visceral > 0) {
    let vColor = 'text-green-600', vText = 'สุขภาพดี';
    if (visceral >= 10) { vColor = 'text-red-600'; vText = 'ระดับอันตราย'; }
    else if (visceral > 5) { vColor = 'text-yellow-600'; vText = 'ค่อนข้างสูง'; }
    document.getElementById('res-visceral-hf').innerHTML = `<span class="${vColor}">${vText}</span>`;
  }

  // อายุร่างกาย เทียบอายุจริง
  if (bodyAge > 0 && age > 0) {
    const diffAge = bodyAge - age;
    let aColor = 'text-green-600', aText = 'ระดับดีเยี่ยม';
    if (diffAge >= 10) { aColor = 'text-red-600'; aText = 'เริ่มมีความเสี่ยง'; }
    else if (diffAge >= 5) { aColor = 'text-yellow-600'; aText = 'ควรเริ่มดูแลสุขภาพ'; }
    document.getElementById('res-bodyage-hf').innerHTML = `<span class="${aColor}">${aText}</span>`;
  }

  // CV Risk (ประมาณการอย่างง่าย ไม่ใช่ค่าทางการแพทย์)
  const resCv = document.getElementById('res-cv-hf');
  if (age > 0 && sys > 0 && h > 0) {
    const isDiabetes = document.getElementById('hf-diabetes').checked;
    const isSmoking = document.getElementById('hf-smoking').checked;
    let baseScore = (age * 0.1) + (sys > 140 ? 5 : 0) + (isSmoking ? 5 : 0) + (isDiabetes ? 6 : 0);
    if (waist > 0 && (waist / h) > 0.5) baseScore += 3;
    resCv.classList.remove('hidden');
    document.getElementById('cv-score-hf').innerText = baseScore.toFixed(1);
  } else if (resCv) {
    resCv.classList.add('hidden');
  }

  // TDEE
  if (bmr > 0) {
    const activityEl = document.getElementById('hf-activity');
    const multiplier = activityEl ? parseFloat(activityEl.value) : 1.2;
    document.getElementById('display-tdee-hf').innerText = Math.round(bmr * multiplier);
  }
}
window.calcHealthRealtime = calcHealthRealtime;

document.getElementById('btn-cancel-health-form').onclick = () => showView('profile-view');
document.getElementById('btn-back-from-health').onclick = () => showView('profile-view');

document.getElementById('btn-save-health').onclick = async () => {
  const nickname = document.getElementById('hf-nickname').value.trim();
  const gender = document.getElementById('hf-gender').value;
  const age = document.getElementById('hf-age').value;
  const height = document.getElementById('hf-height').value;
  const weight = document.getElementById('hf-weight').value;

  if (!nickname || !gender || !age || !height || !weight) {
    showToast('กรุณากรอก ชื่อเล่น, เพศ, อายุ, ส่วนสูง, น้ำหนัก ให้ครบ', 'error');
    return;
  }

  const logsRef = collection(db, 'users', currentUid, 'healthLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');
  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    showToast('คุณบันทึกข้อมูลของวันนี้ไปแล้ว กรุณากลับมาใหม่พรุ่งนี้', 'error');
    return;
  }

  const healthData = {
    date: todayStr,
    nickname, gender,
    age: Number(document.getElementById('hf-age').value) || 0,
    height: Number(height), weight: Number(weight),
    fat: Number(document.getElementById('hf-fat').value) || 0,
    visceral: Number(document.getElementById('hf-visceral').value) || 0,
    muscle: Number(document.getElementById('hf-muscle').value) || 0,
    bodyAge: Number(document.getElementById('hf-bodyage').value) || 0,
    bmr: Number(document.getElementById('hf-bmr').value) || 0,
    waist: Number(document.getElementById('hf-waist').value) || 0,
    sys: Number(document.getElementById('hf-sys').value) || 0,
    dia: Number(document.getElementById('hf-dia').value) || 0,
    diabetes: document.getElementById('hf-diabetes').checked,
    smoking: document.getElementById('hf-smoking').checked,
    activity: Number(document.getElementById('hf-activity').value) || 1.2,
    cvRisk: document.getElementById('cv-score-hf').innerText || '-',
    tdee: Number(document.getElementById('display-tdee-hf').innerText) || 0,
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
      showToast('บันทึกข้อมูลสุขภาพสำเร็จ! (อัปเดตกราฟ WWW ให้ด้วยแล้ว)', 'success');
      showView('profile-view');
    } else if (wantJoin) {
      // ยังไม่เข้าร่วม แต่ติ๊กอยากเข้าร่วม -> เริ่มขั้นตอนตั้งเป้าหมาย Well Well Well! ใหม่
      showToast('บันทึกข้อมูลสุขภาพสำเร็จ! ต่อไปมาตั้งเป้าหมาย Well Well Well! กันครับ', 'success');
      wizardState = { goals: [], monthlyGoal: '', bodyData: {}, ambassador: '', attendOnsite: false, email: userData.email || '' };
      renderWizardGoals();
      showView('www-wizard-view');
    } else {
      showToast('บันทึกข้อมูลสุขภาพสำเร็จ!', 'success');
      showView('profile-view');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

// รายการ metric ที่จะแสดงในกราฟแนวโน้ม (ส่วนที่ 2)
const hhTrendMetrics = [
  { key: 'weight',   label: 'น้ำหนัก (kg)',      field: 'weight' },
  { key: 'fat',      label: 'ไขมัน (%)',         field: 'fat' },
  { key: 'visceral', label: 'ไขมันช่องท้อง',      field: 'visceral' },
  { key: 'muscle',   label: 'มวลกล้ามเนื้อ (%)',  field: 'muscle' },
  { key: 'bodyage',  label: 'อายุร่างกาย (ปี)',   field: 'bodyAge' },
  { key: 'bmr',      label: 'BMR (Kcal)',        field: 'bmr' }
];

async function openHealthHistory() {
  showView('health-history-view');

  ['hh-profile-card', 'hh-trend-section', 'hh-cards-section', 'hh-risk-section', 'hh-summary-section'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('hh-empty-state').classList.add('hidden');
  document.getElementById('hh-profile-card').classList.remove('hidden');
  document.getElementById('hh-profile-card').innerHTML = '<p class="text-center text-white/70 text-sm py-8">กำลังโหลด...</p>';

  const logsRef = collection(db, 'users', currentUid, 'healthLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  if (snap.empty) {
    document.getElementById('hh-profile-card').classList.add('hidden');
    document.getElementById('hh-empty-state').classList.remove('hidden');
    return;
  }

  const logsDesc = [];
  snap.forEach(d => logsDesc.push(d.data()));
  const logsAsc = [...logsDesc].reverse();
  const latest = logsDesc[0];

  renderHHProfileCard(latest);
  renderHHTrendSection(logsAsc);
  renderHHCardsSection(logsDesc);
  renderHHRiskSection(latest);
  renderHHSummarySection(latest);

  ['hh-profile-card', 'hh-trend-section', 'hh-cards-section', 'hh-risk-section', 'hh-summary-section'].forEach(id => {
    document.getElementById(id).classList.remove('hidden');
  });
}
window.openHealthHistory = openHealthHistory;

// ส่วนแรก: การ์ดโปรไฟล์
function renderHHProfileCard(latest) {
  const genderText = latest.gender === 'male' ? 'ชาย' : latest.gender === 'female' ? 'หญิง' : '-';
  document.getElementById('hh-profile-card').innerHTML = `
    <span class="inline-block bg-white/20 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">ส่วนแรก</span>
    <h2 class="text-xl font-black mb-3">${latest.nickname || '-'}</h2>
    <div class="grid grid-cols-3 gap-2 text-sm mb-3">
      <div><p class="text-blue-100 text-[10px]">อายุ</p><p class="font-bold">${latest.age || '-'} ปี</p></div>
      <div><p class="text-blue-100 text-[10px]">เพศ</p><p class="font-bold">${genderText}</p></div>
      <div><p class="text-blue-100 text-[10px]">ส่วนสูง</p><p class="font-bold">${latest.height || '-'} ซม.</p></div>
    </div>
    <p class="text-blue-100 text-[10px]">โรคประจำตัว</p>
    <p class="font-bold text-sm">${latest.disease && latest.disease !== '-' ? latest.disease : '-'}</p>
  `;
}

// ส่วนที่ 2: กราฟแนวโน้ม
function renderHHTrendSection(logsAsc) {
  const rowsBox = document.getElementById('hh-trend-rows');
  rowsBox.innerHTML = hhTrendMetrics.map(m => `
    <div class="flex items-center border-b border-gray-100 last:border-b-0 p-2">
      <div class="w-20 text-[10px] font-bold text-gray-600 shrink-0">${m.label}</div>
      <div class="flex-1">
        <div class="flex justify-between text-[10px] font-bold text-gray-700 px-1 mb-0.5">
          <span>${logsAsc[0][m.field] ?? '-'}</span>
          <span>${logsAsc[logsAsc.length - 1][m.field] ?? '-'}</span>
        </div>
        <div class="h-12 relative"><canvas id="chart-hh-${m.key}"></canvas></div>
      </div>
    </div>
  `).join('');

  hhTrendMetrics.forEach(m => {
    renderMiniChart(`chart-hh-${m.key}`, logsAsc.map(l => l.date), logsAsc.map(l => l[m.field] || 0), '#2563eb');
  });

  document.getElementById('hh-trend-date-start').innerText = logsAsc[0].date || '-';
  document.getElementById('hh-trend-date-end').innerText = logsAsc[logsAsc.length - 1].date || '-';
}

// ส่วนที่ 3: การ์ดข้อมูลรายวัน (เลื่อนแนวนอน)
function renderHHCardsSection(logsDesc) {
  document.getElementById('hh-cards-scroll').innerHTML = logsDesc.map((l, i) => `
    <div class="min-w-[220px] bg-white rounded-xl shadow-sm border border-gray-200 p-4 shrink-0">
      <p class="text-xs font-bold text-blue-700 mb-3"><i class="fa-regular fa-calendar mr-1"></i> ข้อมูลวันที่ ${l.date}</p>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between items-center">
          <span class="text-gray-500">น้ำหนัก</span>
          <span class="font-bold text-gray-800">${l.weight} kg ${i === 0 ? '<span class="ml-1 bg-emerald-50 text-emerald-600 text-[9px] font-bold px-2 py-0.5 rounded-full">ชั่งน้ำหนัก</span>' : ''}</span>
        </div>
        <div class="flex justify-between"><span class="text-gray-500">ไขมัน (Fat)</span><span class="font-bold text-gray-800">${l.fat}%</span></div>
        <div class="flex justify-between"><span class="text-gray-500">ไขมันช่องท้อง</span><span class="font-bold text-gray-800">${l.visceral}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">มวลกล้ามเนื้อ</span><span class="font-bold text-gray-800">${l.muscle}%</span></div>
        <div class="flex justify-between"><span class="text-gray-500">อายุร่างกาย</span><span class="font-bold text-gray-800">${l.bodyAge} ปี</span></div>
        <div class="flex justify-between"><span class="text-gray-500">BMR</span><span class="font-bold text-gray-800">${l.bmr} Kcal</span></div>
      </div>
    </div>
  `).join('');
}

// ส่วนที่ 4: ประเมินความเสี่ยง + TDEE (คำนวณจากข้อมูลล่าสุดที่บันทึกไว้แล้ว)
function renderHHRiskSection(latest) {
  document.getElementById('hh-bp').innerText = `${latest.sys || '-'}/${latest.dia || '-'}`;
  document.getElementById('hh-waist').innerText = latest.waist > 0 ? latest.waist : '-';

  const cvScore = parseFloat(latest.cvRisk) || 0;
  document.getElementById('hh-cv-score').innerText = cvScore + '%';
  document.getElementById('hh-cv-bar').style.width = Math.min(cvScore * 3, 100) + '%';

  const activitySelect = document.getElementById('hh-activity-select');
  activitySelect.value = latest.activity || 1.2;

  const recalcTDEE = () => {
    const multiplier = parseFloat(activitySelect.value);
    document.getElementById('hh-tdee').innerText = Math.round((latest.bmr || 0) * multiplier);
  };
  activitySelect.onchange = recalcTDEE;
  recalcTDEE();
}

// ส่วนที่ 5: สรุปสถานะ (ใช้เกณฑ์เดียวกับ calcHealthRealtime เพื่อให้ผลตรงกันทุกที่ในแอป)
function renderHHSummarySection(latest) {
  const items = [];
  const h = latest.height || 0, w = latest.weight || 0, gender = latest.gender;

  if (h > 0 && w > 0 && gender) {
    const stdW = gender === 'male' ? h - 105 : h - 110;
    const diffW = w - stdW;
    let wPill = { text: 'ปกติสมส่วน', color: 'emerald' };
    if (Math.abs(diffW) > 10) wPill = { text: 'เริ่มมีความเสี่ยง', color: 'red' };
    else if (diffW > 5) wPill = { text: 'เริ่มอ้วน', color: 'amber' };
    else if (diffW <= -5) wPill = { text: 'เริ่มผอม', color: 'amber' };

    const bmi = w / Math.pow(h / 100, 2);
    let bmiText = 'ปกติ', bmiColor = 'emerald';
    if (bmi < 18.5) { bmiText = 'ผอม'; bmiColor = 'amber'; }
    else if (bmi >= 25) { bmiText = 'อ้วน'; bmiColor = 'red'; }
    else if (bmi >= 23) { bmiText = 'ท้วม'; bmiColor = 'amber'; }

    items.push({ label: 'น้ำหนัก / BMI', pills: [wPill, { text: 'BMI: ' + bmiText, color: bmiColor }] });
  }

  if (latest.fat > 0 && gender) {
    let p = { text: 'ปกติ', color: 'emerald' };
    if (gender === 'male') {
      if (latest.fat >= 25) p = { text: 'อ้วน', color: 'red' };
      else if (latest.fat >= 20) p = { text: 'เริ่มอ้วน', color: 'amber' };
      else if (latest.fat < 10) p = { text: 'ต่ำไป', color: 'amber' };
    } else {
      if (latest.fat >= 35) p = { text: 'อ้วน', color: 'red' };
      else if (latest.fat >= 30) p = { text: 'เริ่มอ้วน', color: 'amber' };
      else if (latest.fat < 20) p = { text: 'ต่ำไป', color: 'amber' };
    }
    items.push({ label: 'ไขมันในร่างกาย', pills: [p] });
  }

  if (latest.visceral > 0) {
    let p = { text: 'สุขภาพดี', color: 'emerald' };
    if (latest.visceral >= 10) p = { text: 'ระดับอันตราย', color: 'red' };
    else if (latest.visceral > 5) p = { text: 'ค่อนข้างสูง', color: 'amber' };
    items.push({ label: 'ไขมันช่องท้อง', pills: [p] });
  }

  if (latest.muscle > 0 && gender) {
    let p = { text: 'ปกติ', color: 'emerald' };
    if (gender === 'male') {
      if (latest.muscle < 20) p = { text: 'ต่ำ', color: 'red' };
      else if (latest.muscle < 30) p = { text: 'เริ่มต่ำ', color: 'amber' };
    } else {
      if (latest.muscle < 15) p = { text: 'ต่ำ', color: 'red' };
      else if (latest.muscle < 25) p = { text: 'เริ่มต่ำ', color: 'amber' };
    }
    items.push({ label: 'มวลกล้ามเนื้อโครงร่าง', pills: [p] });
  }

  if (latest.bodyAge > 0 && latest.age > 0) {
    const diffAge = latest.bodyAge - latest.age;
    let p = { text: 'ดีเยี่ยม', color: 'emerald' };
    if (diffAge >= 10) p = { text: 'เริ่มมีความเสี่ยง', color: 'red' };
    else if (diffAge >= 5) p = { text: 'ควรเริ่มดูแลสุขภาพ', color: 'amber' };
    items.push({ label: 'อายุร่างกาย', pills: [p] });
  }

  const colorClass = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600'
  };

  document.getElementById('hh-summary-list').innerHTML = items.map(it => `
    <div class="flex justify-between items-center p-3">
      <span class="text-sm font-bold text-gray-700">${it.label}</span>
      <div class="flex gap-1.5 flex-wrap justify-end">
        ${it.pills.map(p => `<span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${colorClass[p.color]}">${p.text}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

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

// --- สถานะชั่วคราวระหว่างทำขั้นตอนเข้าร่วม Well Well Well! ---
// (ยังไม่เขียนอะไรลง Firestore จนกว่าจะ Check-in สำเร็จในขั้นตอนสุดท้าย)
let wizardState = { goals: [], monthlyGoal: '', bodyData: {}, ambassador: '', attendOnsite: false, email: '' };

async function openWWWEntry() {
  const snap = await getDoc(doc(db, 'users', currentUid));
  const data = snap.data();
  if (data.wellProject) {
    showView('www-hub-view');
  } else {
    wizardState = { goals: [], monthlyGoal: '', bodyData: {}, ambassador: '', attendOnsite: false, email: data.email || '' };
    renderWizardGoals();
    showView('www-wizard-view');
  }
}
window.openWWWEntry = openWWWEntry;

async function openLibraryEntry() {
  const snap = await getDoc(doc(db, 'users', currentUid));
  const data = snap.data();
  if (data.libraryMember && data.libraryMember.joined) {
    document.getElementById('lib-card-id').innerText = data.libraryMember.cardId || '-';
    document.getElementById('lib-card-prov').innerText = data.libraryMember.province || '-';
    document.getElementById('lib-card-branch').innerText = data.libraryMember.branchName || '-';
    showView('library-card-view');
  } else {
    showView('library-join-view');
  }
}
window.openLibraryEntry = openLibraryEntry;

document.getElementById('btn-cancel-wizard').onclick = () => showView('profile-view');

// ขั้น 1 -> ขั้น 2: เลือกเป้าหมายแล้วไปหน้าสรุป
document.getElementById('btn-wizard-next').onclick = () => {
  const checked = Array.from(document.querySelectorAll('.wiz-goal-cb:checked')).map(cb => cb.value);

  if (checked.length === 0) {
    showToast('กรุณาเลือกเป้าหมายอย่างน้อย 1 ข้อ', 'error');
    return;
  }
  wizardState.goals = checked;
  renderGoalSummary();
  showView('www-goal-summary-view');
};

// สรุปเป้าหมายที่เลือก แยกตามหมวดหมู่
function renderGoalSummary() {
  const container = document.getElementById('goal-summary-container');
  const html = wwwGoalsMaster.map(cat => {
    const picked = cat.tags.filter(t => wizardState.goals.includes(t));
    if (picked.length === 0) return '';
    return `
      <div class="mb-3">
        <h4 class="font-bold text-gray-800 text-sm mb-1">${cat.title}</h4>
        <ul class="list-disc pl-5 text-xs text-gray-600 space-y-0.5">
          ${picked.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>`;
  }).join('');
  container.innerHTML = html || '<p class="text-xs text-gray-400">ยังไม่ได้เลือกเป้าหมาย</p>';
  document.getElementById('goal-summary-monthly').value = wizardState.monthlyGoal || '';
}

document.getElementById('btn-back-summary').onclick = () => showView('www-wizard-view');

// ขั้น 2 -> ขั้น 3: บันทึกเป้าหมายประจำเดือนแล้วไปกรอกข้อมูลร่างกาย
document.getElementById('btn-goal-summary-next').onclick = async () => {
  const monthlyGoal = document.getElementById('goal-summary-monthly').value.trim();
  if (!monthlyGoal) {
    showToast('กรุณาเขียนเป้าหมายประจำเดือน', 'error');
    return;
  }
  wizardState.monthlyGoal = monthlyGoal;
  await prefillWizardBodyData();
  showView('www-bodydata-view');
};

document.getElementById('btn-back-to-wizard').onclick = () => showView('www-goal-summary-view');

// ขั้น 3 -> ขั้น 4: เก็บข้อมูลร่างกายไว้ใน wizardState (ยังไม่บันทึกลงฐานข้อมูล) แล้วไปหน้าเชิญชวน
document.getElementById('btn-submit-www').onclick = () => {
  const weight = document.getElementById('wbd-weight').value;
  const ambassador = document.getElementById('wbd-ambassador').value.trim();

  if (!weight || !ambassador) {
    showToast('กรุณากรอกน้ำหนักและผู้แนะนำให้ครบ', 'error');
    return;
  }

  wizardState.bodyData = {
    weight: Number(weight),
    fat: Number(document.getElementById('wbd-fat').value) || 0,
    visceral: Number(document.getElementById('wbd-visceral').value) || 0,
    muscle: Number(document.getElementById('wbd-muscle').value) || 0,
    ecw: Number(document.getElementById('wbd-ecw').value) || 0,
    bodyAge: Number(document.getElementById('wbd-bodyage').value) || 0,
    bmr: Number(document.getElementById('wbd-bmr').value) || 0
  };
  wizardState.ambassador = ambassador;
  showView('www-invite-view');
};

document.getElementById('btn-back-invite').onclick = () => showView('www-bodydata-view');

// ขั้น 4: เชิญติดตาม Facebook + ลงทะเบียน Onsite (หรือข้าม) แล้วไปขั้นตอนยืนยันอีเมล
document.getElementById('btn-follow-fb').onclick = () => {
  // TODO: เปลี่ยนเป็นลิงก์เพจ Facebook จริงของโครงการ
  window.open('https://www.facebook.com/', '_blank');
};

document.getElementById('btn-register-onsite').onclick = () => {
  wizardState.attendOnsite = true;
  // TODO: เปลี่ยนเป็นลิงก์แบบฟอร์มลงทะเบียนกิจกรรม Onsite จริง
  window.open('https://forms.gle/', '_blank');
  goToEmailConfirm();
};

document.getElementById('btn-skip-onsite').onclick = () => {
  wizardState.attendOnsite = false;
  goToEmailConfirm();
};

function goToEmailConfirm() {
  document.getElementById('www-email-input').value = wizardState.email || '';
  showView('www-email-confirm-view');
}

document.getElementById('btn-back-email').onclick = () => showView('www-invite-view');

// ขั้น 5 (สุดท้าย): ยืนยันอีเมล -> เขียนข้อมูลทั้งหมดลง Firestore จริง + Check-in เข้าสู่ระบบ WWW
document.getElementById('btn-checkin-www').onclick = async () => {
  const email = document.getElementById('www-email-input').value.trim();
  if (!email || !email.includes('@')) {
    showToast('กรุณากรอกอีเมลให้ถูกต้อง', 'error');
    return;
  }
  wizardState.email = email;

  try {
    await updateDoc(doc(db, 'users', currentUid), {
      wellProject: true,
      goals: wizardState.goals,
      monthlyGoal: wizardState.monthlyGoal,
      wwwEmail: email,
      wwwAttendOnsite: wizardState.attendOnsite,
      wellProjectJoinedAt: serverTimestamp() // 🆕 เพิ่มตรงนี้แทน
    });

    await addDoc(collection(db, 'users', currentUid, 'wwwLogs'), {
      date: new Date().toLocaleDateString('th-TH'),
      ...wizardState.bodyData,
      ambassador: wizardState.ambassador,
      createdAt: serverTimestamp()
    });

    await loadProfile(currentUid); // ปลดล็อกปุ่มเหลือง Well Well Well! บนหน้าโปรไฟล์

    showAppModal({
      title: 'ยินดีต้อนรับ!',
      message: 'เข้าสู่โครงการ Well Well Well! เช็คอีเมลเพื่อรับลิงก์ Zoom ได้เลย',
      okText: 'OK',
      icon: 'fa-check',
      onOk: () => showView('www-hub-view')
    });
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

document.getElementById('btn-back-hub').onclick = () => showView('profile-view');
document.getElementById('btn-open-update').onclick = () => showView('www-update-view');
document.getElementById('btn-cancel-update').onclick = () => showView('www-hub-view');

// อัปเดตข้อมูลองค์ประกอบร่างกาย (จำกัดวันละ 1 ครั้ง เหมือนการบันทึกอื่นๆ ในแอป)
document.getElementById('btn-save-update').onclick = async () => {
  const weight = document.getElementById('wu-weight').value;
  const ambassador = document.getElementById('wu-ambassador').value.trim();
  const confirmed = document.getElementById('wu-confirm').checked;

  if (!weight || !ambassador) {
    showToast('กรุณากรอกน้ำหนักและผู้แนะนำให้ครบ', 'error');
    return;
  }
  if (!confirmed) {
    showToast('กรุณาติ๊กยืนยันว่าตรวจสอบข้อมูลถูกต้องครบถ้วนแล้ว', 'error');
    return;
  }

  // เช็คว่าวันนี้อัปเดตไปแล้วหรือยัง (จำกัดวันละ 1 ครั้ง)
  const logsRef = collection(db, 'users', currentUid, 'wwwLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');

  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    showToast('คุณอัปเดตข้อมูลของวันนี้ไปแล้ว กรุณากลับมาใหม่พรุ่งนี้', 'error');
    return;
  }

  try {
    await addDoc(logsRef, {
      date: todayStr,
      weight: Number(weight),
      fat: Number(document.getElementById('wu-fat').value) || 0,
      visceral: Number(document.getElementById('wu-visceral').value) || 0,
      muscle: Number(document.getElementById('wu-muscle').value) || 0,
      ecw: Number(document.getElementById('wu-ecw').value) || 0,
      bodyAge: Number(document.getElementById('wu-bodyage').value) || 0,
      bmr: Number(document.getElementById('wu-bmr').value) || 0,
      ambassador,
      createdAt: serverTimestamp()
    });
    document.getElementById('wu-confirm').checked = false;
    showToast('บันทึกและอัปเดตสมุดสุขภาพสำเร็จ!', 'success');
    showView('www-hub-view');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
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

// --- สีและป้ายชื่อของแต่ละระดับอารมณ์ (ใช้ทั้งกราฟและ legend) ---
const moodColors = { 1: '#ef4444', 2: '#fb923c', 3: '#facc15', 4: '#2dd4bf', 5: '#4ade80' };
const moodLabels = { 1: 'แย่มาก', 2: 'อ่อนล้า', 3: 'ปกติ', 4: 'ดี', 5: 'ยอดเยี่ยม' };

// --- กราฟอารมณ์การตื่นนอน: มีสีตามระดับ, มีวันที่, มีเส้น grid ---
function renderSleepMoodChart(labels, dataArr) {
  const canvasId = 'chart-sleep-mood';
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (miniCharts[canvasId]) miniCharts[canvasId].destroy();
  const ctx = el.getContext('2d');

  const pointColors = dataArr.map(m => moodColors[m] || '#a1a1aa');

  miniCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: dataArr,
        borderColor: '#d81b60',
        backgroundColor: 'rgba(216, 27, 96, 0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => moodLabels[ctx.parsed.y] || ''
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: { color: '#f6d9e6', drawTicks: false },
          ticks: { font: { size: 9, family: 'Sarabun' }, color: '#9ca3af', maxRotation: 0 }
        },
        y: {
          display: true,
          min: 0.5,
          max: 5.5,
          grid: { color: '#f6d9e6', drawTicks: false },
          ticks: {
            stepSize: 1,
            font: { size: 9, family: 'Sarabun' },
            color: '#9ca3af',
            callback: (v) => moodLabels[v] || ''
          }
        }
      }
    }
  });

  // legend สีใต้กราฟ ให้ดูรู้ทันทีว่าสีไหนคือระดับไหน
  const legendBox = document.getElementById('sleep-chart-legend');
  if (legendBox) {
    legendBox.innerHTML = Object.keys(moodColors).map(k => `
      <div class="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
        <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${moodColors[k]}"></span>
        ${moodLabels[k]}
      </div>
    `).join('');
  }
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
  calcHealthRealtime(); // เคลียร์/อัปเดตผลประเมินให้ตรงกับค่าที่ค้างอยู่ในฟอร์ม
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

document.getElementById('btn-back-march').onclick = () => showView('www-hub-view');
document.getElementById('btn-cancel-march-entry').onclick = () => showView('march-board-view');
document.getElementById('btn-open-march-entry').onclick = () => showView('march-entry-view');

// --- เส้นทาง Thailand Walkathon: หน้าหลัก -> intro -> เลือกจังหวัด -> กระดานตะลอนชลบุรี ---
document.getElementById('btn-open-walkathon-intro').onclick = () => showView('walkathon-intro-view');
document.getElementById('btn-back-walkathon-intro').onclick = () => showView('march-dashboard-view');
document.getElementById('btn-start-walkathon').onclick = () => showView('walkathon-map-view');
document.getElementById('btn-back-walkathon-map').onclick = () => showView('walkathon-intro-view');
document.getElementById('btn-confirm-province').onclick = () => openMarchBoard();
document.getElementById('btn-back-march-board').onclick = () => showView('walkathon-map-view');

async function openMarchDashboard() {
  showView('march-dashboard-view');

  const logsRef = collection(db, 'users', currentUid, 'marchLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  const now = new Date();
  let monthTotal = 0;
  const logs = [];
  const dailyMap = {}; // date string -> steps รวมของวันนั้น (ใช้คำนวณ streak)
  snap.forEach(docSnap => {
    const d = docSnap.data();
    logs.push(d);
    if (d.date) dailyMap[d.date] = (dailyMap[d.date] || 0) + (d.steps || 0);
    if (d.createdAt) {
      const logDate = d.createdAt.toDate();
      if (logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear()) {
        monthTotal += d.steps || 0;
      }
    }
  });

  document.getElementById('march-total').innerText = monthTotal.toLocaleString();
  const percent = Math.min((monthTotal / 210000) * 100, 100);
  document.getElementById('march-circle').style.background = `conic-gradient(#d81b60 ${percent}%, #f3f4f6 0)`;

  // นับจำนวนวันติดต่อกันล่าสุดที่เดินถึง 7,000 ก้าว/วัน (เรียงจากล็อกล่าสุดไล่ย้อนหลัง)
  let streak = 0;
  for (const d of logs) {
    if ((dailyMap[d.date] || 0) >= 7000) streak++;
    else break;
  }
  const badgeTiers = [
    { days: 3, title: 'ไฟเริ่มติด', icon: 'fa-fire' },
    { days: 7, title: 'คนจริงพิชิตวันหยุด', icon: 'fa-star' },
    { days: 15, title: 'ครึ่งเดือนไม่เคยหย่อน', icon: 'fa-medal' },
    { days: 30, title: 'ไร้พ่าย', icon: 'fa-crown' }
  ];
  document.getElementById('streak-badges-container').innerHTML = badgeTiers.map(b => {
    const unlocked = streak >= b.days;
    const box = unlocked ? 'text-amber-500 bg-amber-50 border-amber-200 shadow-sm' : 'text-gray-300 bg-gray-50 border-gray-100 opacity-60';
    return `
      <div class="flex flex-col items-center justify-center p-2 rounded-2xl border ${box} text-center">
        <i class="fa-solid ${b.icon} text-2xl mb-1"></i>
        <p class="text-[10px] font-bold leading-tight ${unlocked ? 'text-amber-700' : 'text-gray-400'}">${b.title}</p>
      </div>`;
  }).join('');
}
window.openMarchDashboard = openMarchDashboard;

document.getElementById('btn-submit-march').onclick = async () => {
  const steps = document.getElementById('march-steps-input').value;

  if (!steps || Number(steps) <= 0) {
    showToast('กรุณากรอกจำนวนก้าวให้ถูกต้อง', 'error');
    return;
  }

  const logsRef = collection(db, 'users', currentUid, 'marchLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');

  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    showToast('คุณบันทึกก้าวเดินของวันนี้ไปแล้ว', 'error');
    return;
  }

  try {
    await addDoc(logsRef, {
      date: todayStr,
      steps: Number(steps),
      createdAt: serverTimestamp()
    });
    document.getElementById('march-steps-input').value = '';
    showToast('บันทึกก้าวเดินสำเร็จ!', 'success');
    await openMarchBoard();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

const chonburiMilestones = [
  { steps: 3500, q: "คำขวัญของจังหวัดชลบุรีคืออะไร?", a: "ทะเลงาม ข้าวหลามอร่อย อ้อยหวาน จักสานดี ประเพณีวิ่งควาย" },
  { steps: 7000, q: "เกาะที่ใหญ่ที่สุดในจังหวัดชลบุรีคือเกาะอะไร?", a: "เกาะสีชัง" },
  { steps: 14000, q: "ไปหนองมน คนพื้นที่จริงๆ เขาซื้อข้าวหลามแบบไหนกิน?", a: "ข้าวหลามช็อต" },
  { steps: 21000, q: '"ขนมกันถั่ว" มีชื่อเรียกอีกอย่างว่าอะไร?', a: "ขนมจักจั่น" },
  { steps: 28000, q: '"ซอสพริกศรีราชา" ดั้งเดิมมีรสชาติเด่นอย่างไร?', a: "ครบรส เปรี้ยว เผ็ด เค็ม หวาน กลมกล่อม" },
  { steps: 35000, q: "ครกหินที่ดีที่สุดในไทย ทำจากตำบลอะไร?", a: "ตำบลอ่างศิลา" },
  { steps: 49000, q: "ประเพณีวันออกพรรษาในตัวเมืองชลบุรีคือ?", a: "ประเพณีวิ่งควาย" },
  { steps: 63000, q: "ประเพณีก่อเจดีย์ทรายที่บางแสนเรียกว่า?", a: "ประเพณีวันไหลบางแสน" },
  { steps: 70000, q: '"แกรนด์แคนยอนชลบุรี" อดีตเคยเป็นอะไร?', a: "เหมืองหินเก่า" },
  { steps: 84000, q: "เกาะที่จำกัดนักท่องเที่ยวเพื่ออนุรักษ์ปะการังคือ?", a: "เกาะแสมสาร" },
  { steps: 95000, q: "ท่าเรือขนส่งสินค้าที่ใหญ่ที่สุดในไทยคือ?", a: "ท่าเรือแหลมฉบัง" },
  { steps: 105000, q: "สัญลักษณ์ทางวัฒนธรรมของพนัสนิคมคือ?", a: "เครื่องจักสานพนัสนิคม" },
  { steps: 125000, q: "สโมสรฟุตบอลชลบุรีมีฉายาว่า?", a: '"ฉลามชล"' },
  { steps: 145000, q: "ชลบุรีอยู่ในโครงการพัฒนาที่เรียกว่า?", a: "EEC" },
  { steps: 165000, q: "แผ่นแป้งทอดใส่กุ้งที่หนองมนเรียกว่า?", a: "ขนมฝักบัว" },
  { steps: 185000, q: "อำเภอไหนมีฉายาว่า Little Tokyo?", a: "ศรีราชา" },
  { steps: 210000, q: "ชลบุรีมีชายหาดกี่หาด?", a: "30 กว่าหาด" },
  { steps: 230000, q: "ชลบุรีมีเกาะทั้งหมดกี่เกาะ?", a: "มากกว่า 40 เกาะ" },
  { steps: 250000, q: "ชลบุรีมีส่วนกับการติดหวานของคนไทยยังไง?", a: "ขยายฐานผลิตน้ำตาลทราย" },
  { steps: 270000, q: '"พัทยา" เกิดขึ้นได้เพราะอะไร?', a: "ทหารจีไออเมริกันช่วงสงครามเวียดนาม" },
  { steps: 285000, q: '"Cobra Gold" คืออะไร?', a: "การฝึกรบร่วมที่ใหญ่ที่สุดในอาเซียน" },
  { steps: 300000, q: "กลิ่นป๊อปคอร์นที่สวนสัตว์เขาเขียวมาจากอะไร?", a: 'หมีขอ (บินตุรง)' }
];

async function openMarchBoard() {
  showView('march-board-view');

  const logsRef = collection(db, 'users', currentUid, 'marchLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  let allTimeTotal = 0;
  const logs = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    logs.push(d);
    allTimeTotal += d.steps || 0;
  });

  document.getElementById('march-board-total').innerText = allTimeTotal.toLocaleString();

  const grid = document.getElementById('march-board-grid');
  grid.innerHTML = chonburiMilestones.map((m, index) => {
    const unlocked = allTimeTotal >= m.steps;
    const boxStyle = unlocked ? 'bg-white border-2 border-pink-200 shadow-md' : 'bg-gray-100 border-2 border-gray-200 opacity-60';
    const icon = unlocked
      ? `<i class="fa-solid fa-star text-3xl text-pink-500"></i>`
      : `<i class="fa-solid fa-lock text-3xl text-gray-300"></i>`;
    const clickAttr = unlocked ? `onclick="showMilestoneDetail(${index})"` : `onclick="window.showToast('สะสมให้ถึง ${m.steps.toLocaleString()} ก้าวเพื่อเปิดอ่าน', 'info')"`;
    return `
      <div ${clickAttr} class="flex flex-col items-center cursor-pointer">
        <div class="w-full aspect-square rounded-2xl flex items-center justify-center ${boxStyle}">${icon}</div>
        <p class="text-sm font-black mt-2 ${unlocked ? 'text-pink-600' : 'text-gray-400'}">${(m.steps/1000).toFixed(0)}k</p>
      </div>`;
  }).join('');

  // กราฟ 7 วันล่าสุด (เรียงเก่า -> ใหม่)
  const last7 = [...logs].reverse().slice(-7);
  renderMiniChart('chart-march-7day', last7.map(l => l.date), last7.map(l => l.steps), '#d81b60');
}
window.openMarchBoard = openMarchBoard;

function showMilestoneDetail(index) {
  const m = chonburiMilestones[index];
  showToast(`🎉 พิชิต ${m.steps.toLocaleString()} ก้าว! — Q: ${m.q} A: ${m.a}`, 'success', 5000);
}
window.showMilestoneDetail = showMilestoneDetail;

// --- ย่อรูปก่อนประมวลผล (กันไฟล์ใหญ่เกิน) ---
function resizeImageForAI(file, maxSize = 1200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
      else if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้')); };
    img.src = url;
  });
}

// --- แปลงรูปครอปแล้วให้ขาว-ดำ ช่วย OCR อ่านง่ายขึ้น ---
function preprocessForOCR(imgEl) {
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.width * 2;
  canvas.height = imgEl.height * 2;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i+1] + data[i+2]) / 3;
    const value = gray > 140 ? 255 : 0;
    data[i] = data[i+1] = data[i+2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function ocrDetectSteps(canvas) {
  const result = await Tesseract.recognize(canvas, 'eng', {
    tessedit_char_whitelist: '0123456789,',
    tessedit_pageseg_mode: '7'
  });
  const cleaned = result.data.text.replace(/,/g, '').trim();
  const matches = cleaned.match(/\d+/g);
  if (!matches) return null;
  return parseInt(matches.reduce((a, b) => (b.length > a.length ? b : a)), 10);
}

let cropperInstance = null;
let pendingImageDataUrl = null;

document.getElementById('btn-upload-march-image').onclick = async () => {
  const fileInput = document.getElementById('march-image-input');
  if (!fileInput.files.length) { showToast('กรุณาเลือกรูปภาพก่อน', 'error'); return; }

  // เช็คว่าวันนี้บันทึกไปแล้วหรือยัง (ใช้ logic เดียวกับบันทึกมือ)
  const logsRef = collection(db, 'users', currentUid, 'marchLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');
  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    showToast('คุณบันทึกก้าวเดินของวันนี้ไปแล้ว', 'error');
    return;
  }

  try {
    pendingImageDataUrl = await resizeImageForAI(fileInput.files[0]);
    openCropModal(pendingImageDataUrl);
  } catch (err) {
    showToast('ขัดข้อง: ' + err.message, 'error');
  }
};

function openCropModal(dataUrl) {
  const modal = document.getElementById('crop-modal');
  const imgTarget = document.getElementById('crop-target-img');
  imgTarget.src = dataUrl;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  imgTarget.onload = () => {
    if (cropperInstance) cropperInstance.destroy();
    cropperInstance = new Cropper(imgTarget, { viewMode: 1, autoCropArea: 0.4 });
  };
}

document.getElementById('btn-cancel-crop').onclick = () => {
  if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  document.getElementById('crop-modal').classList.add('hidden');
  document.getElementById('crop-modal').classList.remove('flex');
};

document.getElementById('btn-confirm-crop').onclick = async () => {
  const croppedCanvas = cropperInstance.getCroppedCanvas();
  cropperInstance.destroy(); cropperInstance = null;
  document.getElementById('crop-modal').classList.add('hidden');
  document.getElementById('crop-modal').classList.remove('flex');

  const btn = document.getElementById('btn-upload-march-image');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'กำลังอ่านตัวเลข...';

  let detectedSteps = null;
  try {
    const processed = preprocessForOCR(croppedCanvas);
    detectedSteps = await ocrDetectSteps(processed);
  } catch (e) {
    console.error('OCR error:', e);
  }

  btn.disabled = false;
  btn.innerText = originalText;

  if (detectedSteps === null) {
    const manual = prompt('ระบบอ่านตัวเลขไม่ชัด กรุณากรอกจำนวนก้าวเดินด้วยตนเอง:');
    if (!manual || isNaN(Number(manual))) return;
    detectedSteps = Number(manual);
  } else {
    const confirmSteps = confirm(`ตรวจพบก้าวเดิน: ${detectedSteps.toLocaleString()} ก้าว\n\nกด OK เพื่อยืนยัน หรือ Cancel เพื่อแก้ไข`);
    if (!confirmSteps) {
      const manual = prompt('กรอกจำนวนก้าวที่ถูกต้อง:', detectedSteps);
      if (!manual || isNaN(Number(manual))) return;
      detectedSteps = Number(manual);
    }
  }

  if (detectedSteps <= 0) return;

  // อัปโหลดรูปเก็บเป็นหลักฐาน (Cloudinary) แล้วบันทึกเข้า Firestore
  btn.disabled = true;
  btn.innerText = 'กำลังบันทึก...';

  try {
    const blob = await (await fetch(pendingImageDataUrl)).blob();
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST', body: formData
    });
    const uploadData = await res.json();

    await addDoc(collection(db, 'users', currentUid, 'marchLogs'), {
      date: new Date().toLocaleDateString('th-TH'),
      steps: detectedSteps,
      imageUrl: uploadData.secure_url || null,
      createdAt: serverTimestamp()
    });

    showToast(`บันทึก ${detectedSteps.toLocaleString()} ก้าวเรียบร้อย!`, 'success');
    document.getElementById('march-image-input').value = '';
    await openMarchBoard();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
};

const sleepSymptoms = [
  "ร้อนวูบวาบกลางดึก", "มีเหงื่อออกตามตัว", "ปัสสาวะบ่อยตอนกลางคืน",
  "เล่นโทรศัพท์ก่อนนอน", "คิดมากก่อนนอน", "หลับตื้นตื่นง่าย",
  "กรน", "ฝันร้าย", "ตื่นมาแล้วรู้สึกเพลีย"
];

let selectedMood = 0;

document.getElementById('btn-back-sleep').onclick = () => showView('www-hub-view');

async function openSleepTracker() {
  showView('sleep-view');
  selectedMood = 0;

  // เช็คว่าวันนี้บันทึกไปแล้วหรือยัง
  const logsRef = collection(db, 'users', currentUid, 'sleepLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');
  const saveBtn = document.getElementById('btn-save-sleep');

  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    saveBtn.disabled = true;
    saveBtn.className = 'w-full bg-gray-300 text-gray-500 py-4 rounded-xl font-bold cursor-not-allowed';
    saveBtn.innerText = '🔒 คุณบันทึกการนอนของวันนี้ไปแล้ว';
  } else {
    saveBtn.disabled = false;
    saveBtn.className = 'w-full theme-pink text-white py-4 rounded-xl font-bold shadow-md';
    saveBtn.innerText = 'บันทึกข้อมูลการนอน';
  }

  // สร้างปุ่มอาการแบบไดนามิก
  document.getElementById('sleep-symptoms-container').innerHTML = sleepSymptoms.map(s => `
    <label class="cursor-pointer">
      <input type="checkbox" value="${s}" class="peer hidden sleep-symptom-cb">
      <div class="px-3 py-1.5 rounded-full border border-indigo-200 text-xs text-indigo-700 font-bold peer-checked:bg-indigo-500 peer-checked:text-white">${s}</div>
    </label>
  `).join('');

  // เตรียมปุ่มเลือกอารมณ์
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-indigo-500', 'opacity-100');
    btn.classList.add('opacity-60');
    btn.onclick = () => {
      selectedMood = Number(btn.dataset.mood);
      document.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.add('opacity-60');
        b.classList.remove('ring-2', 'ring-indigo-500', 'opacity-100');
      });
      btn.classList.remove('opacity-60');
      btn.classList.add('ring-2', 'ring-indigo-500', 'opacity-100');
    };
  });

  await renderSleepChart();
}
window.openSleepTracker = openSleepTracker;

document.getElementById('btn-save-sleep').onclick = async () => {
  if (selectedMood === 0) {
    showToast('กรุณาเลือกอารมณ์การตื่นนอนเช้านี้', 'error');
    return;
  }

  const symptoms = Array.from(document.querySelectorAll('.sleep-symptom-cb:checked')).map(cb => cb.value);

  try {
    await addDoc(collection(db, 'users', currentUid, 'sleepLogs'), {
      date: new Date().toLocaleDateString('th-TH'),
      mood: selectedMood,
      symptoms,
      createdAt: serverTimestamp()
    });
    showToast('บันทึกข้อมูลการนอนสำเร็จ!', 'success');
    showView('www-hub-view');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

async function renderSleepChart() {
  const logsRef = collection(db, 'users', currentUid, 'sleepLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(7));
  const snap = await getDocs(q);

  const logs = [];
  snap.forEach(docSnap => logs.push(docSnap.data()));
  const ascLogs = logs.reverse();

  const labels = ascLogs.map(l => l.date);
  const dataArr = ascLogs.map(l => l.mood);
  renderSleepMoodChart(labels, dataArr);
}

let globalFoodData = [];

document.getElementById('btn-back-food-list').onclick = () => showView('www-hub-view');
document.getElementById('btn-back-food-detail').onclick = () => showView('food-list-view');

async function openFoodDirectory() {
  showView('food-list-view');
  const container = document.getElementById('food-list-container');
  container.innerHTML = '<p class="text-center text-gray-400 py-8">กำลังโหลดเมนู...</p>';

  const snap = await getDocs(collection(db, 'foods'));
  if (snap.empty) {
    container.innerHTML = '<p class="text-center text-gray-400 py-8">ยังไม่มีเมนูอาหาร</p>';
    return;
  }

  globalFoodData = [];
  snap.forEach(docSnap => {
    globalFoodData.push({ id: docSnap.id, ...docSnap.data() });
  });

  container.innerHTML = globalFoodData.map(f => `
    <div class="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
      <img src="${f.image}" class="w-full h-40 object-cover">
      <div class="p-4">
        <h3 class="font-black text-gray-800 text-base mb-1">${f.name}</h3>
        <p class="text-xs text-gray-500 mb-3">${f.concept}</p>
        <button onclick="openFoodDetail('${f.id}')" class="w-full bg-pink-600 text-white text-sm font-bold py-2.5 rounded-xl">
          <i class="fa-solid fa-utensils mr-2"></i> ดูสูตรและวิธีทำ
        </button>
      </div>
    </div>
  `).join('');
}
window.openFoodDirectory = openFoodDirectory;

function renderBulletList(lines) {
  let html = '';
  let inSub = false;
  lines.forEach(line => {
    const text = line.trim();
    if (text.startsWith('-')) {
      if (!inSub) { html += '<ul class="list-disc pl-5 space-y-1 text-gray-600">'; inSub = true; }
      html += `<li>${text.substring(1).trim()}</li>`;
    } else {
      if (inSub) { html += '</ul>'; inSub = false; }
      html += `<p class="font-bold text-gray-800 mt-2">${text}</p>`;
    }
  });
  if (inSub) html += '</ul>';
  return html;
}

let currentFoodId = null;

function openFoodDetail(id) {
  currentFoodId = id; // 🆕 เพิ่มบรรทัดนี้บนสุดของฟังก์ชันเดิม
  const food = globalFoodData.find(f => f.id === id);
  if (!food) return;

  document.getElementById('fd-title-header').innerText = food.name;
  document.getElementById('fd-title').innerText = food.name;
  document.getElementById('fd-concept').innerText = food.concept;
  document.getElementById('fd-image').src = food.image;
  document.getElementById('fd-ingredients').innerHTML = renderBulletList(food.ingredients || []);

  let stepCount = 1;
  document.getElementById('fd-instructions').innerHTML = (food.instructions || []).map(line => {
    const text = line.trim();
    if (text.startsWith('-')) return `<p class="text-gray-600 pl-9 -mt-2">${text.substring(1).trim()}</p>`;
    return `<div class="flex gap-3"><div class="w-6 h-6 rounded-full bg-pink-100 text-pink-600 font-black text-xs flex items-center justify-center shrink-0">${stepCount++}</div><p class="font-bold text-gray-800">${text}</p></div>`;
  }).join('');

  document.getElementById('fd-tips').innerHTML = (food.tips || []).map(tip => `
    <div onclick="window.showToast('${tip.title}: ${tip.detail}', 'info', 4500)" class="min-w-[110px] w-[110px] bg-white rounded-2xl p-4 shadow-sm border border-gray-200 shrink-0 cursor-pointer text-center">
      <div class="text-3xl mb-2">${tip.icon}</div>
      <h4 class="font-bold text-gray-800 text-xs">${tip.title}</h4>
    </div>
  `).join('');

  showView('food-detail-view');
}
window.openFoodDetail = openFoodDetail;

document.getElementById('btn-mark-cooked').onclick = async () => {
  if (!currentFoodId) return;
  const food = globalFoodData.find(f => f.id === currentFoodId);

  const logsRef = collection(db, 'users', currentUid, 'mealLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(1));
  const lastSnap = await getDocs(q);
  const todayStr = new Date().toLocaleDateString('th-TH');

  if (!lastSnap.empty && lastSnap.docs[0].data().date === todayStr) {
    showToast('คุณบันทึกเมนูของวันนี้ไปแล้ว กลับมาบันทึกใหม่พรุ่งนี้นะครับ', 'info');
    return;
  }

  try {
    await addDoc(logsRef, {
      date: todayStr,
      foodId: currentFoodId,
      foodName: food ? food.name : '-',
      createdAt: serverTimestamp()
    });
    showToast('บันทึกแล้ว! นับเป็นมื้ออาหารที่เปลี่ยนใน Recap เดือนนี้ 🎉', 'success');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

document.getElementById('btn-back-zone2').onclick = () => showView('march-dashboard-view');
document.getElementById('btn-open-zone2').onclick = () => {
  document.getElementById('zone2-intro').classList.remove('hidden');
  document.getElementById('zone2-selection').classList.add('hidden');
  showView('zone2-view');
};
document.getElementById('btn-start-zone2').onclick = () => {
  document.getElementById('zone2-intro').classList.add('hidden');
  document.getElementById('zone2-selection').classList.remove('hidden');
  renderZone2Levels();
};

const bpmLevels = [
  { id: 'audio-1', label: 'ระดับ 1 (BPM 90-100)', src: 'https://www.dropbox.com/scl/fi/f7m71xm4azpncffsnl5iy/1.mp3?rlkey=d6o2r7y84p67kra3i3vp82tdh&st=h6klrwsb&raw=1' },
  { id: 'audio-2', label: 'ระดับ 2 (BPM 100-120)', src: 'https://www.dropbox.com/scl/fi/c6begszcww5fcuix0w4is/2.mp3?rlkey=3zycfu2f7knz0ihbg2ijrkqbe&st=eqhiq2if&raw=1' },
  { id: 'audio-3', label: 'ระดับ 3 (BPM 120 ขึ้นไป)', src: 'https://www.dropbox.com/scl/fi/yo75bom9nqcc8dxo3yna4/3.mp3?rlkey=awqr3ifqhcx48qsdfcbjvybg1&st=kl9q0vpv&raw=1' },
  { id: 'audio-4', label: 'ระดับ 4 (เร็ว - ค่อนวิ่ง)', src: 'https://www.dropbox.com/scl/fi/z0pioh3ahnyfqjq7p43bi/4.mp3?rlkey=2homnxrx9w9tphph86psh5bed&st=hwka4c6e&raw=1' }
];

function renderZone2Levels() {
  const container = document.getElementById('zone2-levels-container');
  container.innerHTML = bpmLevels.map(l => `
    <div class="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
      <div class="flex justify-between items-center mb-3">
        <span class="font-black text-gray-800">${l.label}</span>
        <button class="zone2-play-btn bg-pink-50 theme-text w-10 h-10 rounded-full flex items-center justify-center" data-audio="${l.id}">
          <i class="fa-solid fa-play"></i>
        </button>
        <audio id="${l.id}" class="hidden" src="${l.src}"></audio>
      </div>
      <button class="zone2-confirm-btn w-full bg-pink-50 theme-text py-2.5 rounded-xl font-bold border border-pink-200" data-label="${l.label}">เลือกระดับนี้</button>
    </div>
  `).join('');

  document.querySelectorAll('.zone2-play-btn').forEach(btn => {
    btn.onclick = () => {
      const audioId = btn.dataset.audio;
      const isPlaying = !document.getElementById(audioId).paused;

      document.querySelectorAll('audio').forEach(a => a.pause());
      document.querySelectorAll('.zone2-play-btn i').forEach(i => {
        i.classList.remove('fa-pause');
        i.classList.add('fa-play');
      });

      if (!isPlaying) {
        document.getElementById(audioId).play();
        btn.querySelector('i').classList.remove('fa-play');
        btn.querySelector('i').classList.add('fa-pause');
      }
    };
  });

  document.querySelectorAll('.zone2-confirm-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('audio').forEach(a => a.pause());
      showToast(`ยืนยันแล้ว! ความเร็วเพลงที่คุณเลือกคือ "${btn.dataset.label}" (สามารถเปลี่ยนได้ภายหลัง)`, 'success');
      showView('march-dashboard-view');
    };
  });
}

document.getElementById('btn-back-playlist').onclick = () => showView('march-dashboard-view');
document.getElementById('btn-open-playlist').onclick = () => {
  renderPlaylist();
  showView('playlist-view');
};

const playlistData = [
  { level: 'ระดับ 4', bpm: 'BPM เร็ว - ค่อนวิ่ง', color: 'from-rose-600 to-pink-600', ytMusic: 'https://music.youtube.com/playlist?list=PLEUrzSZuZSNI' },
  { level: 'ระดับ 3', bpm: 'BPM 120 ขึ้นไป', color: 'from-pink-500 to-rose-500', ytMusic: 'https://music.youtube.com/playlist?list=PLPUdqx0IABTo' },
  { level: 'ระดับ 2', bpm: 'BPM 100-120', color: 'from-fuchsia-500 to-pink-500', ytMusic: 'https://music.youtube.com/playlist?list=PLLCO9fhQm3xk' },
  { level: 'ระดับ 1', bpm: 'BPM 90-100', color: 'from-rose-400 to-pink-400', ytMusic: 'https://music.youtube.com/playlist?list=PLCOog2omdZYE' }
];

function renderPlaylist() {
  document.getElementById('playlist-container').innerHTML = playlistData.map(p => `
    <div class="bg-gradient-to-r ${p.color} p-5 rounded-3xl shadow-md text-white">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-black text-lg">${p.level}</h3>
        <span class="bg-white/20 text-xs font-bold px-3 py-1.5 rounded-lg">${p.bpm}</span>
      </div>
      <div class="flex gap-2">
        <button onclick="window.open('https://open.spotify.com/', '_blank')" class="flex-1 bg-white/20 text-white text-xs font-bold py-3 rounded-xl"><i class="fa-brands fa-spotify"></i> Spotify</button>
        <button onclick="window.open('${p.ytMusic}', '_blank')" class="flex-1 bg-white/20 text-white text-xs font-bold py-3 rounded-xl"><i class="fa-brands fa-youtube"></i> YT Music</button>
        <button onclick="window.open('https://youtube.com/', '_blank')" class="flex-1 bg-white/20 text-white text-xs font-bold py-3 rounded-xl"><i class="fa-solid fa-play"></i> YouTube</button>
      </div>
    </div>
  `).join('');
}

// ============ Well Well Well! Recap ============

const STEP_LENGTH_M = 0.75; // TODO: ปรับตามค่าอ้างอิงจริงที่น้ำขิงหาให้

// TODO: แทนที่ด้วยตารางระยะทางอ้างอิงจริง (ต้นทาง-ปลายทาง) เทียบกับระยะทางที่เดินได้ในเดือนนั้น
const distanceRoutes = [
  { maxKm: 3,   from: 'บ้านของคุณ',        to: 'สวนสาธารณะใกล้บ้าน' },
  { maxKm: 8,   from: 'หาดบางแสน',         to: 'หาดวอนนภา' },
  { maxKm: 20,  from: 'ตัวเมืองชลบุรี',     to: 'พัทยา' },
  { maxKm: 50,  from: 'สนามบินสุวรรณภูมิ',  to: 'ตัวเมืองชลบุรี' },
  { maxKm: 120, from: 'กรุงเทพฯ',           to: 'ระยอง' },
  { maxKm: Infinity, from: 'กรุงเทพฯ',      to: 'เชียงใหม่ (และไกลกว่านั้นอีก!)' }
];
function distanceToRouteText(km) {
  const route = distanceRoutes.find(r => km <= r.maxKm) || distanceRoutes[distanceRoutes.length - 1];
  return `${route.from} ไป ${route.to}`;
}

const sleepMoodEmoji = { 1: '😩', 2: '😔', 3: '😐', 4: '🙂', 5: '😄' };

// true เฉพาะวันสุดท้ายของเดือนปฏิทิน
// TODO: ถ้ารอบโครงการไม่ตรงกับสิ้นเดือนปฏิทินจริง ให้แก้ logic ตรงนี้ตามรอบของพี่
function isRecapDay(d = new Date()) {
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  return t.getMonth() !== d.getMonth();
}

function isSameMonth(dateObj, ref) {
  return dateObj.getMonth() === ref.getMonth() && dateObj.getFullYear() === ref.getFullYear();
}

let recapSlides = [];
let recapIndex = 0;

async function openRecap() {
  const snap = await getDoc(doc(db, 'users', currentUid));
  const userData = snap.data();

  if (!userData.wellProject) {
    showToast('ต้องเข้าร่วมโครงการ Well Well Well! ก่อนถึงจะใช้ Recap ได้นะครับ', 'info');
    return;
  }

  showView('www-recap-view');

  if (!isRecapDay()) {
    showRecapSubview('recap-comingsoon');
    return;
  }

  showRecapSubview('recap-story');
  document.getElementById('recap-slide-content').innerHTML = '<p class="text-gray-300">กำลังสรุปผลของคุณ...</p>';

  const stats = await computeRecapStats(userData);
  recapSlides = buildRecapSlides(stats);
  recapIndex = 0;
  renderRecapSlide();
}
window.openRecap = openRecap;

function showRecapSubview(id) {
  ['recap-comingsoon', 'recap-story', 'recap-eval', 'recap-final'].forEach(vid => {
    const el = document.getElementById(vid);
    el.classList.add('hidden');
    el.classList.remove('flex');
  });
  const target = document.getElementById(id);
  target.classList.remove('hidden');
  target.classList.add('flex');
}

async function computeRecapStats(userData) {
  const now = new Date();

  // 1. วันที่เข้าร่วม
  let joinDateText = '-';
  if (userData.wellProjectJoinedAt) {
    joinDateText = userData.wellProjectJoinedAt.toDate()
      .toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    // fallback สำหรับสมาชิกเก่าก่อนอัปเดตนี้: ใช้ log แรกสุดใน wwwLogs
    const oldLogsSnap = await getDocs(query(
      collection(db, 'users', currentUid, 'wwwLogs'), orderBy('createdAt', 'asc'), limit(1)
    ));
    if (!oldLogsSnap.empty) joinDateText = oldLogsSnap.docs[0].data().date;
  }

  // 2. มื้ออาหารที่เปลี่ยนแล้ว (เดือนนี้ จาก mealLogs)
  const mealLogsSnap = await getDocs(collection(db, 'users', currentUid, 'mealLogs'));
  let mealsChanged = 0;
  mealLogsSnap.forEach(d => {
    const l = d.data();
    if (l.createdAt && isSameMonth(l.createdAt.toDate(), now)) mealsChanged++;
  });

  // 3. ก้าวเดินสะสม + streak ครบ 10,000 ก้าว/วัน (เดือนนี้)
  const marchLogsSnap = await getDocs(query(collection(db, 'users', currentUid, 'marchLogs'), orderBy('createdAt', 'desc')));
  let stepsThisMonth = 0;
  const monthlyDaily = {};
  const monthlyLogsDesc = [];
  marchLogsSnap.forEach(d => {
    const l = d.data();
    if (l.createdAt && isSameMonth(l.createdAt.toDate(), now)) {
      stepsThisMonth += l.steps || 0;
      monthlyDaily[l.date] = (monthlyDaily[l.date] || 0) + (l.steps || 0);
      monthlyLogsDesc.push(l);
    }
  });
  let streak10k = 0;
  for (const l of monthlyLogsDesc) {
    if ((monthlyDaily[l.date] || 0) >= 10000) streak10k++;
    else break;
  }
  const distanceKm = (stepsThisMonth * STEP_LENGTH_M) / 1000;

  // 4. การนอน/ตื่น เฉลี่ย (เดือนนี้)
  const sleepLogsSnap = await getDocs(collection(db, 'users', currentUid, 'sleepLogs'));
  let sleepSum = 0, sleepCount = 0;
  sleepLogsSnap.forEach(d => {
    const l = d.data();
    if (l.createdAt && isSameMonth(l.createdAt.toDate(), now)) { sleepSum += l.mood || 0; sleepCount++; }
  });
  const sleepAvg = sleepCount > 0 ? Math.round(sleepSum / sleepCount) : 0;

  // 5. กิจกรรมแทนมือถือ/โซเชียล (เดือนนี้)
  const activities = [];
  if (userData.wwwAttendOnsite) activities.push('เข้าร่วมกิจกรรม Onsite ประจำเดือน');
  if (Object.keys(monthlyDaily).length > 0) activities.push('เดินสะสมก้าวใน The Long March');
  if (sleepCount > 0) activities.push('บันทึกการนอนใน Sleep well - Wake me up');
  if (mealsChanged > 0) activities.push('ทำเมนูสุขภาพจาก Good Food, Good Mood');

  // TODO: ยังไม่มีจุดเก็บข้อมูลจริง — รอฟีเจอร์ห้องสมุด และระบบเช็กอินคนที่เจอในงาน
  const readingMinutes = userData.readingMinutesThisMonth || 0;
  const eventConnections = userData.eventConnectionsThisMonth || 0;

  return { joinDateText, mealsChanged, stepsThisMonth, distanceKm, streak10k, sleepAvg, activities, readingMinutes, eventConnections };
}

function buildRecapSlides(s) {
  const slides = [];

  slides.push(`
    <i class="fa-solid fa-flag-checkered text-5xl text-amber-400 mb-6"></i>
    <p class="text-sm text-gray-300 mb-2">1 / 5</p>
    <h2 class="text-2xl font-black leading-relaxed">คุณเข้าร่วมโครงการ<br>ในวันที่<br><span class="text-amber-400">${s.joinDateText}</span></h2>
  `);

  slides.push(`
    <i class="fa-solid fa-bowl-food text-5xl text-emerald-400 mb-6"></i>
    <p class="text-sm text-gray-300 mb-2">2 / 5</p>
    <h2 class="text-2xl font-black leading-relaxed">คุณได้เปลี่ยนมื้ออาหาร<br>ให้กินดีมากขึ้น<br><span class="text-emerald-400">${s.mealsChanged} มื้อ</span></h2>
    <p class="text-xs text-gray-400 mt-4">เงินทั้งหมดได้ไปสนับสนุนมูลนิธิการศึกษา<br>เพื่อการพัฒนาที่ยั่งยืน</p>
  `);

  slides.push(`
    <i class="fa-solid fa-shoe-prints text-5xl text-pink-400 mb-6"></i>
    <p class="text-sm text-gray-300 mb-2">3 / 5</p>
    <h2 class="text-2xl font-black leading-relaxed">ก้าวเดินสะสมตลอดเดือนนี้<br><span class="text-pink-400">${s.stepsThisMonth.toLocaleString()} ก้าว</span></h2>
    <p class="text-xs text-gray-300 mt-4">เทียบเท่าการเดินจาก<br>${distanceToRouteText(s.distanceKm)}</p>
    <p class="text-xs text-gray-400 mt-2">และเดินติดต่อกันครบ 10,000 ก้าว ${s.streak10k} วัน</p>
  `);

  slides.push(`
    <p class="text-6xl mb-6">${sleepMoodEmoji[s.sleepAvg] || '💤'}</p>
    <p class="text-sm text-gray-300 mb-2">4 / 5</p>
    <h2 class="text-2xl font-black leading-relaxed">การนอนและตื่นของคุณ<br>โดยเฉลี่ยเดือนนี้</h2>
  `);

  slides.push(`
    <i class="fa-solid fa-seedling text-5xl text-teal-400 mb-6"></i>
    <p class="text-sm text-gray-300 mb-2">5 / 5</p>
    <h2 class="text-xl font-black leading-relaxed mb-4">คุณเปลี่ยนเวลาจากมือถือ/โซเชียล<br>ไปสู่สิ่งสร้างสรรค์</h2>
    <div class="text-sm text-gray-200 text-left space-y-1">
      ${s.activities.length ? s.activities.map(a => `<p>• ${a}</p>`).join('') : '<p class="text-gray-400">ยังไม่มีข้อมูลกิจกรรมเดือนนี้</p>'}
      ${s.readingMinutes > 0 ? `<p>• ใช้เวลากับหนังสือเล่มโปรด ${s.readingMinutes} นาที</p>` : ''}
      ${s.eventConnections > 0 ? `<p>• ได้เจอเพื่อนใหม่ ${s.eventConnections} คนจากงานกิจกรรม</p>` : ''}
    </div>
  `);

  // สรุปรวมหน้าเดียว
  slides.push(`
    <h2 class="text-lg font-black mb-5">สรุปเดือนนี้ของคุณ</h2>
    <div class="text-left text-sm text-gray-200 space-y-3 w-full">
      <p>🚩 เข้าร่วมวันที่ ${s.joinDateText}</p>
      <p>🥗 เปลี่ยนมื้ออาหาร ${s.mealsChanged} มื้อ</p>
      <p>👣 เดิน ${s.stepsThisMonth.toLocaleString()} ก้าว (ครบ 10,000/วัน ${s.streak10k} วัน)</p>
      <p>${sleepMoodEmoji[s.sleepAvg] || '💤'} คุณภาพการนอนเฉลี่ย</p>
      <p>🌱 ${s.activities.length} กิจกรรมที่เข้าร่วมแทนโซเชียล</p>
    </div>
  `);

  return slides;
}

function renderRecapProgress() {
  const container = document.getElementById('recap-progress-container');
  container.innerHTML = recapSlides.map((_, i) => `
    <div class="h-1 flex-1 rounded-full ${i <= recapIndex ? 'bg-amber-400' : 'bg-white/20'}"></div>
  `).join('');
}

function renderRecapSlide() {
  document.getElementById('recap-slide-content').innerHTML =
    `<div class="flex flex-col items-center">${recapSlides[recapIndex]}</div>`;
  renderRecapProgress();
}

document.getElementById('recap-tap-next').onclick = () => {
  if (recapIndex < recapSlides.length - 1) {
    recapIndex++;
    renderRecapSlide();
  } else {
    openRecapEval();
  }
};

document.getElementById('recap-tap-prev').onclick = () => {
  if (recapIndex > 0) {
    recapIndex--;
    renderRecapSlide();
  }
};

const recapEvalLabels = ['น้อย', 'ปานกลาง', 'มาก'];
let recapEvalChoice = '';

function openRecapEval() {
  recapEvalChoice = '';
  document.getElementById('recap-eval-text').value = '';
  document.getElementById('recap-eval-error').classList.add('hidden');
  document.getElementById('recap-eval-options').innerHTML = recapEvalLabels.map(label => `
    <button data-choice="${label}" class="recap-eval-btn bg-white/10 text-white py-3 rounded-xl font-bold border border-white/10">${label}</button>
  `).join('');
  document.querySelectorAll('.recap-eval-btn').forEach(btn => {
    btn.onclick = () => {
      recapEvalChoice = btn.dataset.choice;
      document.querySelectorAll('.recap-eval-btn').forEach(b => b.classList.remove('bg-amber-500', 'border-amber-400'));
      btn.classList.add('bg-amber-500', 'border-amber-400');
    };
  });
  showRecapSubview('recap-eval');
}

document.getElementById('btn-recap-submit').onclick = async () => {
  const text = document.getElementById('recap-eval-text').value.trim();
  const errBox = document.getElementById('recap-eval-error');

  if (!recapEvalChoice || !text) {
    errBox.innerText = 'กรุณาเลือกระดับการเปลี่ยนแปลง และเล่าประสบการณ์ของคุณ';
    errBox.classList.remove('hidden');
    return;
  }

  try {
    const monthKey = new Date().toISOString().slice(0, 7); // เช่น 2026-08
    await setDoc(doc(db, 'users', currentUid, 'wwwRecap', monthKey), {
      evaluation: recapEvalChoice,
      experienceText: text,
      submittedAt: serverTimestamp()
    });
    showRecapSubview('recap-final');
  } catch (err) {
    errBox.innerText = 'เกิดข้อผิดพลาด: ' + err.message;
    errBox.classList.remove('hidden');
  }
};

document.getElementById('btn-recap-comingsoon-close').onclick = () => showView('www-hub-view');
document.getElementById('btn-recap-close').onclick = () => showView('www-hub-view');
document.getElementById('btn-recap-finish').onclick = () => showView('www-hub-view');

// รายชื่อสาขา ผูกกับจังหวัด (ถ้าสาขาไม่เยอะ เก็บเป็น static config พอ ไม่ต้องทำ Firestore collection)
const libraryBranches = {
  "ชลบุรี": [
    { id: "cb-01", name: "ห้องสมุดประชาชนจังหวัดชลบุรี" },
    { id: "cb-02", name: "ห้องสมุดประชาชนอำเภอศรีราชา" }
  ],
  "สงขลา": [ /* ... */ ]
};

document.getElementById('lib-prov-select').onchange = (e) => {
  const branches = libraryBranches[e.target.value] || [];
  document.getElementById('lib-branch-select').innerHTML =
    '<option value="">-- เลือกสาขา --</option>' +
    branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
};

document.getElementById('btn-join-library').onclick = async () => {
  const prov = document.getElementById('lib-prov-select').value;
  const branchId = document.getElementById('lib-branch-select').value;
  if (!prov || !branchId) { showToast('กรุณาเลือกจังหวัดและสาขา', 'error'); return; }

  const branchObj = (libraryBranches[prov] || []).find(b => b.id === branchId);
  if (!branchObj) { showToast('ไม่พบข้อมูลสาขาที่เลือก', 'error'); return; }

  const cardId = 'LIB-' + Math.floor(10000 + Math.random() * 90000);

  await updateDoc(doc(db, 'users', currentUid), {
    libraryMember: { joined: true, province: prov, branchId, branchName: branchObj.name, cardId, joinedAt: serverTimestamp() }
  });
  await loadProfile(currentUid);
  showView('library-card-view');
};

document.getElementById('btn-cancel-library').onclick = () => showView('profile-view');
document.getElementById('btn-back-library-card').onclick = () => showView('profile-view');

// ============ ระบบกรอกข้อมูลส่วนตัวหลัง LINE Login ครั้งแรก ============

function showLoading(msg = 'กำลังประมวลผล...') {
  const el = document.getElementById('loading-overlay');
  el.querySelector('p').innerText = msg;
  el.classList.remove('hidden');
  el.classList.add('flex');
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  el.classList.add('hidden');
  el.classList.remove('flex');
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// เช็คว่ากรอกข้อมูลครบหรือยัง เรียกจาก onAuthStateChanged
async function checkProfileComplete(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : null;
  if (!data || !data.profileComplete) {
    renderRegisterProvinceOptions();
    showView('register-step1-view');
    return false;
  }
  return true;
}
window.checkProfileComplete = checkProfileComplete;

function renderRegisterProvinceOptions() {
  const sel = document.getElementById('r2-prov');
  if (sel.options.length > 1) return; // เติมแล้วไม่ต้องเติมซ้ำ
  fillProvinceSelect(sel);
}

// คำนวณอายุจากวันเกิดอัตโนมัติ
// คำนวณอายุ + แปลง พ.ศ. จากวันเกิดอัตโนมัติ
document.getElementById('r1-birthdate').oninput = (e) => {
  const bd = new Date(e.target.value);
  const infoBox = document.getElementById('r1-birthdate-info');

  if (isNaN(bd)) {
    infoBox.classList.add('hidden');
    return;
  }

  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;

  document.getElementById('r1-age').value = age;

  const buddhistYear = bd.getFullYear() + 543;
  infoBox.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> เกิดปี พ.ศ. ${buddhistYear} — อายุ ${age} ปี`;
  infoBox.classList.remove('hidden');
};

// สลับโหมด ไม่ทราบวันเกิด
document.getElementById('r1-no-birthdate').onchange = (e) => {
  const unknown = e.target.checked;
  document.getElementById('r1-birthdate').closest('div').querySelector('input[type="date"]').disabled = unknown;
  document.getElementById('r1-birthdate').value = '';
  document.getElementById('r1-year-box').classList.toggle('hidden', !unknown);
  document.getElementById('r1-age-box').classList.toggle('hidden', !unknown);
  if (unknown) document.getElementById('r1-age').readOnly = false;
  else document.getElementById('r1-age').readOnly = true;
};

document.getElementById('btn-r1-next').onclick = () => {
  const fullname = document.getElementById('r1-fullname').value.trim();
  const noBirthdate = document.getElementById('r1-no-birthdate').checked;
  const birthdate = document.getElementById('r1-birthdate').value;
  const birthyear = document.getElementById('r1-birthyear').value;
  const errBox = document.getElementById('r1-error');

  if (!fullname) {
    errBox.innerText = 'กรุณากรอกชื่อ-นามสกุล';
    errBox.classList.remove('hidden');
    return;
  }
  if (!noBirthdate && !birthdate) {
    errBox.innerText = 'กรุณาเลือกวันเกิด หรือติ๊ก "ไม่ทราบวันเกิด"';
    errBox.classList.remove('hidden');
    return;
  }
  if (noBirthdate && !birthyear) {
    errBox.innerText = 'กรุณาระบุปีเกิด';
    errBox.classList.remove('hidden');
    return;
  }
  errBox.classList.add('hidden');

  registerState.title = document.getElementById('r1-title').value.trim();
  registerState.fullname = fullname;
  registerState.lineIdInput = document.getElementById('r1-lineid').value.trim();
  registerState.birthdate = noBirthdate ? `01/01/${birthyear}` : birthdate;
  registerState.age = document.getElementById('r1-age').value || null;
  registerState.birthdateUnknown = noBirthdate;

  showView('register-step2-view');
};

document.getElementById('btn-r2-back').onclick = () => showView('register-step1-view');

document.getElementById('btn-pdpa-link').onclick = () => {
  // TODO: เปลี่ยนเป็นลิงก์นโยบาย PDPA จริงของโครงการ
  window.open('https://example.com/pdpa', '_blank');
};

let registerState = {};

document.getElementById('btn-r2-submit').onclick = async () => {
  const phone = document.getElementById('r2-phone').value.trim();
  const subdist = document.getElementById('r2-subdist').value.trim();
  const dist = document.getElementById('r2-dist').value.trim();
  const prov = document.getElementById('r2-prov').value;
  const zip = document.getElementById('r2-zip').value.trim();
  const pdpaChecked = document.getElementById('r2-pdpa').checked;
  const password = document.getElementById('r2-password').value;
  const password2 = document.getElementById('r2-password2').value;
  const errBox = document.getElementById('r2-error');

  if (!phone) {
    errBox.innerText = 'กรุณากรอกเบอร์โทรศัพท์';
    errBox.classList.remove('hidden');
    return;
  }
  if (!/^[0-9]{9,10}$/.test(phone.replace(/-/g, ''))) {
    errBox.innerText = 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง';
    errBox.classList.remove('hidden');
    return;
  }
  if (!subdist || !dist || !prov || !zip) {
    errBox.innerText = 'กรุณากรอกที่อยู่ให้ครบ';
    errBox.classList.remove('hidden');
    return;
  }
  if (!password || password.length < 8) {
    errBox.innerText = 'กรุณาตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร';
    errBox.classList.remove('hidden');
    return;
  }
  if (password !== password2) {
    errBox.innerText = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    errBox.classList.remove('hidden');
    return;
  }
  if (!pdpaChecked) {
    errBox.innerText = 'กรุณายอมรับนโยบาย PDPA ก่อนสมัครสมาชิก';
    errBox.classList.remove('hidden');
    return;
  }
  errBox.classList.add('hidden');

  showLoading('กำลังตรวจสอบข้อมูล...');

  // 🆕 เช็คเบอร์ซ้ำตรงนี้แทน (ย้ายมาจากหน้า 1/2)
  const dupQ = query(collection(db, 'users'), where('phone', '==', phone));
  const dupSnap = await getDocs(dupQ);
  const isDuplicate = dupSnap.docs.some(d => d.id !== currentUid);

  if (isDuplicate) {
    hideLoading();
    errBox.innerText = 'เบอร์โทรศัพท์นี้มีการสมัครสมาชิกไปแล้ว กรุณาใช้เบอร์อื่น';
    errBox.classList.remove('hidden');
    return;
  }

  showLoading('กำลังสร้างบัญชีสมาชิก...');

  try {
    const syntheticEmail = phoneToSyntheticEmail(phone);
    try {
      const credential = EmailAuthProvider.credential(syntheticEmail, password);
      await linkWithCredential(auth.currentUser, credential);
    } catch (linkErr) {
      if (linkErr.code !== 'auth/provider-already-linked') throw linkErr;
    }

    const memberId = await generateUniqueMemberId();

    await updateDoc(doc(db, 'users', currentUid), {
      title: registerState.title || '',
      name: registerState.fullname,
      phone: phone,
      lineIdInput: registerState.lineIdInput || '',
      birthdate: registerState.birthdate,
      birthdateUnknown: registerState.birthdateUnknown,
      age: registerState.age,
      hasPasswordLogin: true,
      address: { subdist, dist, prov, zip },
      pdpaAccepted: true,
      pdpaAcceptedAt: serverTimestamp(),
      memberId,
      profileComplete: true,
      createdAt: serverTimestamp()
    });

    await loadProfile(currentUid);
    hideLoading();
    showView('profile-view');
    showToast('สมัครสมาชิกสำเร็จ ยินดีต้อนรับ!', 'success');
  } catch (err) {
    hideLoading();
    let msg = err.message;
    if (err.code === 'auth/weak-password') {
      msg = 'รหัสผ่านไม่ปลอดภัยพอ กรุณาตั้งรหัสผ่านที่ซับซ้อนกว่านี้';
    }
    showToast('เกิดข้อผิดพลาด: ' + msg, 'error');
  }
};

// รหัสสมาชิกสุ่ม 6 หลัก ไม่ชนกับที่มีอยู่แล้ว
async function generateUniqueMemberId() {
  let memberId, exists = true;
  while (exists) {
    const rand = Math.floor(100000 + Math.random() * 900000); // 6 หลัก
    memberId = 'GD-' + rand;
    const q = query(collection(db, 'users'), where('memberId', '==', memberId));
    const snap = await getDocs(q);
    exists = !snap.empty;
  }
  return memberId;
}

function fillProvinceSelect(selectEl) {
  if (!selectEl) return;
  provinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.innerText = p;
    selectEl.appendChild(opt);
  });
}

// แทนที่โค้ดเดิมที่เติมแค่ addr-prov
fillProvinceSelect(document.getElementById('addr-prov'));
fillProvinceSelect(document.getElementById('wj-prov'));

function fillLibraryProvinceSelect() {
  const sel = document.getElementById('lib-prov-select');
  if (!sel) return;
  Object.keys(libraryBranches).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.innerText = p;
    sel.appendChild(opt);
  });
}
fillLibraryProvinceSelect();