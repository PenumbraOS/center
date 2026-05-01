const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};
const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "penumbraos-github-releases-proxy";
const INSTALLATION_TOKEN_REFRESH_BUFFER_MS = 60_000;

interface Env {
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
}

interface InstallationTokenResponse {
  token?: string;
  expires_at?: string;
}

interface GitHubErrorResponse {
  message?: string;
  documentation_url?: string;
}

let installationTokenCache: {
  token: string;
  expiresAt: number;
} | null = null;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function encodeJsonBase64Url(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function getPemBlock(pem: string): { type: string; body: string } {
  const match = normalizePem(pem).match(
    /-----BEGIN ([A-Z ]+)-----\s*([A-Za-z0-9+/=\s]+)\s*-----END \1-----/u,
  );

  if (!match) {
    throw new Error("GitHub app private key is not a valid PEM block.");
  }

  return {
    type: match[1],
    body: match[2].replace(/\s+/g, ""),
  };
}

function encodeDerLength(length: number): number[] {
  if (length < 0x80) {
    return [length];
  }

  const bytes: number[] = [];
  let remaining = length;

  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }

  return [0x80 | bytes.length, ...bytes];
}

function encodeDerSequence(...values: Uint8Array[]): Uint8Array {
  const bodyLength = values.reduce((total, value) => total + value.length, 0);
  const header = new Uint8Array([0x30, ...encodeDerLength(bodyLength)]);
  const output = new Uint8Array(header.length + bodyLength);

  output.set(header, 0);

  let offset = header.length;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }

  return output;
}

function encodeDerVersionZeroInteger(): Uint8Array {
  return new Uint8Array([0x02, 0x01, 0x00]);
}

function encodeDerRsaEncryptionOid(): Uint8Array {
  return new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
}

function encodeDerOctetString(value: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(value);
  const header = new Uint8Array([0x04, ...encodeDerLength(bytes.length)]);
  const output = new Uint8Array(header.length + bytes.length);
  output.set(header, 0);
  output.set(bytes, header.length);
  return output;
}

function toPlainArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function pemToPkcs8Der(pem: string): ArrayBuffer {
  const pemBlock = getPemBlock(pem);
  const der = base64ToArrayBuffer(pemBlock.body);

  if (pemBlock.type === "PRIVATE KEY") {
    return der;
  }

  if (pemBlock.type === "RSA PRIVATE KEY") {
    const pkcs8 = encodeDerSequence(
      encodeDerVersionZeroInteger(),
      encodeDerRsaEncryptionOid(),
      encodeDerOctetString(der),
    );

    return toPlainArrayBuffer(pkcs8);
  }

  throw new Error(`Unsupported private key type: ${pemBlock.type}`);
}

async function generateGitHubAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJsonBase64Url({ alg: "RS256", typ: "JWT" });
  const payload = encodeJsonBase64Url({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: env.GITHUB_APP_CLIENT_ID,
  });
  const signingInput = `${header}.${payload}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Der(env.GITHUB_APP_PRIVATE_KEY),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

function getCachedInstallationToken(): string | null {
  if (!installationTokenCache) {
    return null;
  }

  if (
    Date.now() >=
    installationTokenCache.expiresAt - INSTALLATION_TOKEN_REFRESH_BUFFER_MS
  ) {
    installationTokenCache = null;
    return null;
  }

  return installationTokenCache.token;
}

async function getInstallationToken(env: Env): Promise<string> {
  const cachedToken = getCachedInstallationToken();
  if (cachedToken) {
    return cachedToken;
  }

  const jwt = await generateGitHubAppJwt(env);
  const tokenResponse = await fetch(
    `${GITHUB_API_ORIGIN}/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "User-Agent": GITHUB_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );

  if (!tokenResponse.ok) {
    const responseText = await tokenResponse.text();
    let message = responseText.trim();

    try {
      const errorPayload = JSON.parse(responseText) as GitHubErrorResponse;
      if (errorPayload.message) {
        message = errorPayload.message;
      }
      if (errorPayload.documentation_url) {
        message = `${message} (${errorPayload.documentation_url})`;
      }
    } catch {
      // Leave message as raw text.
    }

    const acceptedPermissions = tokenResponse.headers.get(
      "X-Accepted-GitHub-Permissions",
    );
    const details = [
      `GitHub app auth failed with ${tokenResponse.status} ${tokenResponse.statusText}`,
      message || "No response body.",
      acceptedPermissions ? `Accepted permissions: ${acceptedPermissions}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    console.error("GitHub app auth error", {
      installationId: env.GITHUB_APP_INSTALLATION_ID,
      clientId: env.GITHUB_APP_CLIENT_ID,
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      acceptedPermissions,
      responseText,
    });

    throw new Error(details);
  }

  const payload = (await tokenResponse.json()) as InstallationTokenResponse;
  if (!payload.token || !payload.expires_at) {
    throw new Error(
      "GitHub app auth returned an invalid installation token response.",
    );
  }

  installationTokenCache = {
    token: payload.token,
    expiresAt: Date.parse(payload.expires_at),
  };

  return payload.token;
}

function buildUpstreamHeaders(request: Request, token: string): Headers {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("User-Agent", GITHUB_USER_AGENT);
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/vnd.github+json");
  }

  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    if (
      !url.pathname.startsWith("/repos/") ||
      !url.pathname.includes("/releases")
    ) {
      return withCors(new Response("Not found", { status: 404 }));
    }

    try {
      const installationToken = await getInstallationToken(env);
      const response = await fetch(
        `${GITHUB_API_ORIGIN}${url.pathname}${url.search}`,
        {
          method: request.method,
          headers: buildUpstreamHeaders(request, installationToken),
          redirect: "follow",
        },
      );
      return withCors(response);
    } catch (error) {
      return withCors(
        new Response(
          error instanceof Error
            ? error.message
            : "GitHub proxy request failed.",
          {
            status: 502,
          },
        ),
      );
    }
  },
};
