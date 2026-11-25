import type {
  AuthTokens,
  ChangePasswordInput,
  FirebaseLoginInput,
  LoginInput,
  LoginResponse,
  MfaVerifyInput,
  Passkey,
  RegisterInput,
  TotpDisableInput,
  TotpEnableInput,
  TotpSetupResponse,
  UpdateProfileInput,
  User,
} from '@bossbyte/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@/lib/webauthn';

// These endpoints run before there is an access token, on cookies alone.
const cookieOnly = { anonymous: true } as const;

export interface PasskeyLoginOptions {
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}

export const authApi = {
  login: (input: LoginInput) => api.post<LoginResponse>('/auth/login', input, cookieOnly),
  register: (input: RegisterInput) => api.post<AuthTokens>('/auth/register', input, cookieOnly),
  verifyMfa: (input: MfaVerifyInput) => api.post<AuthTokens>('/auth/mfa/verify', input, cookieOnly),
  firebaseLogin: (input: FirebaseLoginInput) =>
    api.post<LoginResponse>('/auth/firebase', input, cookieOnly),
  passkeyLoginOptions: () =>
    api.post<PasskeyLoginOptions>('/auth/passkeys/login/options', undefined, cookieOnly),
  passkeyLoginVerify: (input: { challengeId: string; response: AuthenticationResponseJSON }) =>
    api.post<AuthTokens>('/auth/passkeys/login/verify', input, cookieOnly),

  updateProfile: (input: UpdateProfileInput) => api.patch<User>('/auth/me', input),
  changePassword: (input: ChangePasswordInput) => api.post('/auth/change-password', input),

  totpSetup: () => api.post<TotpSetupResponse>('/auth/totp/setup'),
  totpEnable: (input: TotpEnableInput) => api.post('/auth/totp/enable', input),
  totpDisable: (input: TotpDisableInput) => api.post('/auth/totp/disable', input),

  passkeyRegisterOptions: () =>
    api.post<PublicKeyCredentialCreationOptionsJSON>('/auth/passkeys/register/options'),
  passkeyRegisterVerify: (input: { response: RegistrationResponseJSON; name: string }) =>
    api.post<Passkey>('/auth/passkeys/register/verify', input),
  deletePasskey: (id: string) => api.delete(`/auth/passkeys/${id}`),
};

export const passkeysQueryOptions = queryOptions({
  queryKey: ['auth', 'passkeys'],
  queryFn: ({ signal }) => api.get<Passkey[]>('/auth/passkeys', { signal }),
});
