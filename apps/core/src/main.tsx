import '@/lib/zod-config';

// Loaded on demand rather than imported, so that everything the app pulls in —
// including the schemas in @bossbyte/shared — is evaluated after the line above
// has run. With a plain import the bundler is free to evaluate a shared chunk
// of schemas first.
void import('./bootstrap');
