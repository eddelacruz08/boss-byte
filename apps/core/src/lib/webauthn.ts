import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};

/** False in browsers (and test environments) without WebAuthn; hide passkey UI there. */
export const isPasskeySupported = browserSupportsWebAuthn;

/**
 * Asks the browser to create a passkey from the options the API issued.
 * Send the result back to the API to be verified and stored.
 *
 * @example
 *   const options = await authApi.passkeyRegisterOptions();
 *   const response = await createPasskey(options);
 *   await authApi.passkeyRegisterVerify({ response, name: 'MacBook' });
 */
export function createPasskey(
  optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  return startRegistration({ optionsJSON });
}

/**
 * Asks the browser to sign in with one of the user's passkeys.
 *
 * @example
 *   const { challengeId, options } = await authApi.passkeyLoginOptions();
 *   const response = await getPasskeyAssertion(options);
 *   const tokens = await authApi.passkeyLoginVerify({ challengeId, response });
 */
export function getPasskeyAssertion(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  return startAuthentication({ optionsJSON });
}

/** True when the user dismissed the browser's passkey prompt; not worth an error message. */
export function isPasskeyPromptDismissed(error: unknown): boolean {
  if (error instanceof WebAuthnError) return error.code === 'ERROR_CEREMONY_ABORTED';
  return (
    error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

/** A user-facing message for anything a passkey ceremony can throw. */
export function passkeyErrorMessage(error: unknown): string {
  if (
    error instanceof WebAuthnError &&
    error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
  ) {
    return 'This device already has a passkey for your account.';
  }
  return 'The passkey could not be used. Please try again.';
}
