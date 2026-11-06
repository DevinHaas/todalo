const messages = {
  KEYCHAIN_UNAVAILABLE: "Apple Keychain is unavailable. Unlock your device and try again.",
  KEYCHAIN_INVALID: "The saved credential is invalid. Sign out and try again.",
  KEYCHAIN_SAVE_FAILED: "Your session could not be saved in Apple Keychain. Try again.",
  KEYCHAIN_REMOVE_FAILED: "Your saved session could not be removed from Apple Keychain. Try signing out again.",
  KEYCHAIN_CONFIGURATION_FAILED: "Cannot configure protected credential storage.",
  API_CONFIGURATION_REQUIRED: "Configure the native API endpoint.",
  API_CONFIGURATION_INVALID: "The native API endpoint must be an HTTPS origin; only loopback HTTP is allowed in debug builds.",
  ACCOUNT_UNAVAILABLE: "Your account could not be loaded. Try again.",
  ACCOUNT_INVALID: "The server returned an invalid account response.",
  INVALID_DETAILS: "Check your account details and try again.",
  SIGN_IN_FAILED: "Could not sign in. Check your email and password.",
  REGISTRATION_FAILED: "Could not create your account. Check your details or sign in if you already have an account.",
  SESSION_UNAVAILABLE: "Your account could not be loaded. Try signing in again.",
  SIGNED_SESSION_REQUIRED: "The server did not issue a signed session. Try again.",
  GOOGLE_UNAVAILABLE: "Cannot open Google sign-in. Try again.",
  GOOGLE_CANCELLED: "Google sign-in was cancelled.",
  GOOGLE_EXPIRED: "Google sign-in took too long. Try again.",
  GOOGLE_NOT_LINKED: "This email already has a todalo account. Sign in with your password, then link Google from your account.",
  GOOGLE_ALREADY_LINKED: "That Google account is already linked to a different todalo account.",
  GOOGLE_FAILED: "Google sign-in could not be completed. Try again.",
  CONNECTION_FAILED: "Cannot reach todalo. Check your connection and try again.",
  LOGOUT_CONNECTION_FAILED: "Cannot reach todalo. Try again to revoke this session.",
  LOGOUT_UNCONFIRMED: "Sign-out was not confirmed by the server. Try again.",
  UNAUTHENTICATED: "Please sign in again.",
  TASKS_UNAVAILABLE: "Your tasks could not be loaded. Try again.",
  SETTINGS_UNAVAILABLE: "Your preferences could not be loaded. Try again.",
  CALENDAR_UNAVAILABLE: "Your calendars could not be loaded. Try again.",
  CALENDAR_NOT_FOUND: "This calendar account does not exist or you do not have access to it.",
  CALENDAR_OPEN_FAILED: "Cannot open Google Calendar. Try again.",
  INVALID_RESPONSE: "The server returned an invalid response.",
  INVALID_INPUT: "Check your entry and try again.",
  SAVE_FAILED: "Your changes could not be saved. Try again.",
  FILES_TOO_LARGE: "A paste batch must be at most 10 MB.",
  PROJECT_NOT_FOUND: "This project does not exist or you do not have access to it.",
  TASK_NOT_FOUND: "This task does not exist or you do not have access to it.",
  TASK_CHANGED: "This task changed on another device. Review it and try again.",
  DOWNLOAD_FAILED: "The file could not be downloaded. Try again.",
  FILE_SAVE_FAILED: "The file could not be saved on this device. Try again.",
  IMPORT_UNAVAILABLE: "The Todoist import is unavailable. Try again.",
  UNKNOWN_NATIVE_ERROR: "The native account operation could not finish. Try again.",
} as const;

export type AccountErrorCode = keyof typeof messages;

export class AccountTransportError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(messages[code]);
    this.name = "AccountTransportError";
  }
}

// Rust currently returns static safe strings. Recognize only exact messages;
// unrecognized IPC exceptions never become product copy or reveal their data.
export function nativeAccountError(error: unknown): AccountTransportError {
  const code = typeof error === "string"
    ? (Object.keys(messages) as AccountErrorCode[]).find((code) => messages[code] === error)
    : undefined;
  return new AccountTransportError(code ?? "UNKNOWN_NATIVE_ERROR");
}
