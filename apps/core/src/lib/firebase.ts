const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Google sign-in is offered only when every `VITE_FIREBASE_*` value is set. */
export const isFirebaseConfigured = Object.values(config).every(Boolean);

/** True when the user closed the Google pop-up instead of finishing sign-in. */
export function isPopupDismissed(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

/**
 * Opens the Google sign-in pop-up and resolves to a Firebase ID token, which
 * the API exchanges for a BossByte session (POST /auth/firebase).
 *
 * The Firebase SDK is imported on first use, so it costs nothing until
 * someone clicks the button. Firebase only proves who the user is; the
 * session itself is BossByte's, so the Firebase one is dropped straight away.
 *
 * @example
 *   const idToken = await signInWithGoogle();
 *   const outcome = await authApi.firebaseLogin({ idToken });
 */
export async function signInWithGoogle(): Promise<string> {
  const [{ getApp, getApps, initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup }] =
    await Promise.all([import('firebase/app'), import('firebase/auth')]);

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
  const idToken = await user.getIdToken();
  await auth.signOut();
  return idToken;
}
