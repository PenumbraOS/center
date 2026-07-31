/**
 * MusicKit-JS integration for the "Sign in with Apple Music" flow.
 *
 * Loads Apple's MusicKit JS SDK in the browser, configures it with the Pin's
 * developer token, and runs the Apple ID authorization popup. The returned
 * Music User Token is then written back to the Pin (`PUT /api/settings`), which
 * unlocks the server's `/v1/me` personalized endpoints (library, mixes,
 * favorites) and — once wired — the on-device player's account auth.
 *
 * The SDK is loaded lazily (only when the user clicks sign-in) from Apple's CDN;
 * nothing is bundled. Authorization requires a secure context (https or
 * localhost), which Center's dev/host origin satisfies.
 */

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const SCRIPT_ID = "apple-musickit-js";

// Minimal shape of the pieces of MusicKit we touch — the SDK ships no types.
interface MusicKitInstance {
  authorize(): Promise<string>;
  readonly musicUserToken?: string | null;
}
interface MusicKitGlobal {
  configure(opts: {
    developerToken: string;
    app: { name: string; build: string };
  }): Promise<MusicKitInstance> | MusicKitInstance;
  getInstance(): MusicKitInstance;
}

function musicKitGlobal(): MusicKitGlobal | undefined {
  return (window as unknown as { MusicKit?: MusicKitGlobal }).MusicKit;
}

/** Inject the MusicKit JS script (once) and resolve when `window.MusicKit`
 * is ready. v3 signals readiness with the `musickitloaded` event. */
async function loadMusicKit(): Promise<MusicKitGlobal> {
  const existing = musicKitGlobal();
  if (existing) return existing;

  await new Promise<void>((resolve, reject) => {
    const ready = () => resolve();
    // If the SDK is present but not yet initialized, wait for its event.
    document.addEventListener("musickitloaded", ready, { once: true });

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = MUSICKIT_SRC;
      script.async = true;
      script.addEventListener("error", () =>
        reject(new Error("Failed to load MusicKit JS from Apple's CDN.")),
      );
      document.head.appendChild(script);
    }
    // In case the event already fired before this listener attached.
    if (musicKitGlobal()) {
      document.removeEventListener("musickitloaded", ready);
      resolve();
    }
  });

  const mk = musicKitGlobal();
  if (!mk) throw new Error("MusicKit JS loaded but window.MusicKit is missing.");
  return mk;
}

/**
 * Run the Apple Music sign-in popup and return the Music User Token.
 * @param developerToken the Pin's MusicKit developer token (ES256 JWT).
 */
export async function authorizeAppleMusic(
  developerToken: string,
): Promise<string> {
  if (!developerToken.trim()) {
    throw new Error("No Apple developer token configured on the Pin.");
  }
  const MusicKit = await loadMusicKit();
  await MusicKit.configure({
    developerToken,
    app: { name: "PenumbraOS Center", build: "1.0.0" },
  });
  const music = MusicKit.getInstance();
  const userToken = await music.authorize();
  if (!userToken) {
    throw new Error("Apple Music sign-in did not return a token.");
  }
  return userToken;
}
