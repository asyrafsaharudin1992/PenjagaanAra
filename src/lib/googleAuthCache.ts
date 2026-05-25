/**
 * Caches the Google OAuth access token in memory (and sessionStorage for
 * persistence across page reloads in the same tab). Used after a successful
 * Google sign-in so subsequent Google Sheets / Drive API calls can authorize
 * without re-prompting the user.
 *
 * Pass `null` to clear the cached token (e.g. on logout).
 */

const STORAGE_KEY = 'google_access_token';

let cachedToken: string | null = null;

export function setCachedGoogleToken(token: string | null): void {
  cachedToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem(STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      // sessionStorage may be unavailable (e.g. private mode); fall back to in-memory only
      console.warn('Could not persist Google token to sessionStorage:', err);
    }
  }
}

export function getCachedGoogleToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof window !== 'undefined') {
    try {
      cachedToken = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return cachedToken;
}