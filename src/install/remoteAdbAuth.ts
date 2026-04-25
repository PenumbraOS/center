import {
  AdbAuthType,
  AdbCommand,
  type AdbAuthenticator,
  type AdbCredentialStore,
  type AdbPacketData,
  type AdbPrivateKey,
} from "@yume-chan/adb";
import { logDebug, logError, logInfo } from "../logging";

interface RemoteAuthResponse {
  token: string;
  public_key: string;
}

export interface RemoteAdbAuthClient {
  signToken(token: Uint8Array): Promise<{
    signature: Uint8Array;
    publicKey: Uint8Array;
  }>;
}

class NoopCredentialStore implements AdbCredentialStore {
  generateKey(): AdbPrivateKey {
    throw new Error("Local key generation is disabled for remote ADB auth.");
  }

  iterateKeys(): Iterable<AdbPrivateKey> {
    return [];
  }
}

export const REMOTE_ADB_NOOP_CREDENTIAL_STORE: AdbCredentialStore =
  new NoopCredentialStore();

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function ensureNullTerminated(value: Uint8Array): Uint8Array {
  if (value.length === 0) {
    return new Uint8Array([0]);
  }

  if (value[value.length - 1] === 0) {
    return value;
  }

  const output = new Uint8Array(value.length + 1);
  output.set(value, 0);
  output[value.length] = 0;
  return output;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.trim();
  const decoded = atob(normalized);
  const output = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    output[index] = decoded.charCodeAt(index);
  }

  return output;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

export class HttpRemoteAdbAuthClient implements RemoteAdbAuthClient {
  private readonly remoteAuthUrl: string;

  constructor(remoteAuthUrl: string) {
    this.remoteAuthUrl = remoteAuthUrl;
  }

  async signToken(token: Uint8Array): Promise<{
    signature: Uint8Array;
    publicKey: Uint8Array;
  }> {
    logInfo("remote-adb-auth", "Requesting remote ADB signature", {
      remoteAuthUrl: this.remoteAuthUrl,
      tokenBytes: token.byteLength,
    });

    let response: Response;
    try {
      response = await fetch(this.remoteAuthUrl, {
        method: "POST",
        body: toArrayBuffer(token),
      });
    } catch (error) {
      logError("remote-adb-auth", "Remote ADB auth request failed", error, {
        remoteAuthUrl: this.remoteAuthUrl,
      });
      throw error;
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      logError("remote-adb-auth", "Remote ADB auth server returned error", {
        remoteAuthUrl: this.remoteAuthUrl,
        status: response.status,
        statusText: response.statusText,
        responseText,
      });
      throw new Error(
        `Remote ADB auth failed with ${response.status} ${response.statusText}`,
      );
    }

    let body: RemoteAuthResponse;
    try {
      body = (await response.json()) as RemoteAuthResponse;
    } catch (error) {
      logError("remote-adb-auth", "Failed to parse remote ADB auth response", error, {
        remoteAuthUrl: this.remoteAuthUrl,
      });
      throw new Error("Remote ADB auth returned invalid JSON.");
    }

    if (!body?.token || !body?.public_key) {
      logError("remote-adb-auth", "Remote ADB auth response missing fields", {
        remoteAuthUrl: this.remoteAuthUrl,
        body,
      });
      throw new Error("Remote ADB auth response was missing token or public_key.");
    }

    let signature: Uint8Array;
    try {
      signature = decodeBase64(body.token);
    } catch (error) {
      logError("remote-adb-auth", "Failed to decode remote ADB auth signature", error, {
        remoteAuthUrl: this.remoteAuthUrl,
      });
      throw new Error("Remote ADB auth signature was not valid base64.");
    }

    const publicKey = ensureNullTerminated(encodeUtf8(body.public_key));
    logInfo("remote-adb-auth", "Received remote ADB signature", {
      remoteAuthUrl: this.remoteAuthUrl,
      signatureBytes: signature.byteLength,
      publicKeyBytes: publicKey.byteLength,
    });

    return { signature, publicKey };
  }
}

export function createRemoteAdbAuthenticator(
  client: RemoteAdbAuthClient,
): AdbAuthenticator {
  return async function* remoteAdbAuthenticator(
    _credentialStore: AdbCredentialStore,
    getNextRequest: () => Promise<AdbPacketData>,
  ): AsyncIterable<AdbPacketData> {
    const firstRequest = await getNextRequest();
    if (firstRequest.arg0 !== AdbAuthType.Token) {
      logDebug("remote-adb-auth", "Authenticator skipped non-token request", {
        arg0: firstRequest.arg0,
      });
      return;
    }

    const { signature, publicKey } = await client.signToken(firstRequest.payload);
    yield {
      command: AdbCommand.Auth,
      arg0: AdbAuthType.Signature,
      arg1: 0,
      payload: signature,
    };

    const secondRequest = await getNextRequest();
    if (secondRequest.arg0 !== AdbAuthType.Token) {
      logDebug(
        "remote-adb-auth",
        "Authentication finished after remote signature response",
        {
          arg0: secondRequest.arg0,
        },
      );
      return;
    }

    logInfo("remote-adb-auth", "Device requested remote ADB public key fallback", {
      tokenBytes: secondRequest.payload.byteLength,
    });
    yield {
      command: AdbCommand.Auth,
      arg0: AdbAuthType.PublicKey,
      arg1: 0,
      payload: publicKey,
    };
  };
}
