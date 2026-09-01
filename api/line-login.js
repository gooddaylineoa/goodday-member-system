import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

const adminAuth = getAuth();
const adminDb = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });
  }

  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'ไม่พบ idToken' });
  }

  try {
    const params = new URLSearchParams();
    params.append('id_token', idToken);
    params.append('client_id', process.env.LINE_CHANNEL_ID);

    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'LINE token ไม่ถูกต้อง', detail: verifyData });
    }

    const lineUserId = verifyData.sub;
    const uid = `line_${lineUserId}`;

    const userDocRef = adminDb.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    const isNewUser = !userDoc.exists;

    if (isNewUser) {
      let memberId, exists = true;
      while (exists) {
        const rand = Math.floor(100000 + Math.random() * 900000);
        memberId = 'GD-' + rand;
        const dupSnap = await adminDb.collection('users').where('memberId', '==', memberId).get();
        exists = !dupSnap.empty;
      }

      await userDocRef.set({
        name: verifyData.name || 'สมาชิก Goodday',
        profileImage: verifyData.picture || '',
        memberId,
        profileComplete: true,
        pdpaAccepted: false,
        createdAt: new Date()
      });
    }

    const customToken = await adminAuth.createCustomToken(uid);

    return res.status(200).json({ customToken, isNewUser, lineName: verifyData.name || '' });
  } catch (err) {
    console.error('LINE login error:', err);
    return res.status(500).json({ error: err.message });
  }
}