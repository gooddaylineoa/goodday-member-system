import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const adminDb = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });
  }

  const { phone, excludeUid } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'ไม่พบเบอร์โทรศัพท์' });
  }

  try {
    const snap = await adminDb.collection('users').where('phone', '==', phone).get();
    const isDuplicate = snap.docs.some(d => d.id !== excludeUid);
    return res.status(200).json({ isDuplicate });
  } catch (err) {
    console.error('check-phone error:', err);
    return res.status(500).json({ error: err.message });
  }
}