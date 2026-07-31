/**
 * Spotify OAuth (Authorization Code + PKCE) for the "Connect Spotify Account"
 * flow. Runs entirely in the browser: it opens Spotify's sign-in popup, captures
 * the authorization code via a lightweight callback page, and returns the code +
 * PKCE verifier. The actual token exchange happens on the user's Pin (so tokens
 * never transit a shared server), mirroring the Apple flow.
 *
 * Scopes cover reading the user's saved tracks and playlists (their library),
 * not playback — on-device streaming is a separate concern (librespot).
 */

const SCOPES =
  "user-library-read playlist-read-private playlist-read-collaborative";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

export interface SpotifyAuthResult {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/** The redirect URI the user must register in their Spotify app settings. */
export function spotifyRedirectUri(): string {
  return `${window.location.origin}/spotify-callback.html`;
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

function base64url(buffer: ArrayBuffer): string {
  let str = "";
  const bytes = new Uint8Array(buffer);
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(digest);
}

/**
 * Run the Spotify sign-in popup and return the authorization code + PKCE
 * verifier for the Pin to exchange.
 * @param clientId the user's Spotify app Client ID.
 */
export async function authorizeSpotify(
  clientId: string,
): Promise<SpotifyAuthResult> {
  if (!clientId.trim()) {
    throw new Error("No Spotify Client ID configured on the Pin.");
  }
  const redirectUri = spotifyRedirectUri();
  const codeVerifier = randomString(96);
  const codeChallenge = await pkceChallenge(codeVerifier);
  const state = randomString(16);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);

  const popup = window.open(url.toString(), "spotify-oauth", "width=480,height=760");
  if (!popup) {
    throw new Error("Popup blocked — allow popups for this site and retry.");
  }

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Spotify sign-in window was closed."));
      }
    }, 500);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        source?: string;
        code?: string;
        state?: string;
        error?: string;
      };
      if (!data || data.source !== "spotify-oauth") return;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      if (data.error) return reject(new Error(`Spotify: ${data.error}`));
      if (data.state !== state) return reject(new Error("OAuth state mismatch."));
      if (!data.code) return reject(new Error("No authorization code returned."));
      resolve(data.code);
    };
    function cleanup() {
      clearInterval(timer);
      window.removeEventListener("message", onMessage);
    }
    window.addEventListener("message", onMessage);
  });

  return { code, codeVerifier, redirectUri };
}
