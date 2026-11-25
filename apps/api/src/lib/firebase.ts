import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from '../config/env';
import { notImplemented, unauthorized } from './errors';

/**
 * Firebase Admin is optional. It is only initialised — lazily, on first use —
 * when the three FIREBASE_* variables are set.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

function getFirebaseApp(): App {
  if (!isFirebaseConfigured()) {
    throw notImplemented(
      'Firebase sign-in is not configured on this server',
      'firebase_not_configured',
    );
  }
  return (
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        // Environment variables cannot hold real newlines portably.
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  );
}

export interface FirebaseIdentity {
  uid: string;
  email: string;
  name: string;
}

/** Verifies an ID token issued by the Firebase web SDK, including revocation. */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  const app = getFirebaseApp();
  const decoded = await getAuth(app)
    .verifyIdToken(idToken, true)
    .catch(() => {
      throw unauthorized('Invalid Firebase token', 'invalid_firebase_token');
    });

  if (!decoded.email || !decoded.email_verified) {
    throw unauthorized('A verified email address is required', 'email_not_verified');
  }
  const email = decoded.email.toLowerCase();
  return {
    uid: decoded.uid,
    email,
    name: typeof decoded.name === 'string' && decoded.name ? decoded.name : email.split('@')[0]!,
  };
}
