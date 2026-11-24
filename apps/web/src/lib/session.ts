// apps/web/src/lib/session.ts
// Edge-compatible HMAC-SHA256 session token signing and verification using Web Crypto API.

const SESSION_PAYLOAD = 'phone-studio-owner-v1';

async function computeHmacHex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getSessionSecret(fallbackEnvSecret?: string): string {
  const secret = process.env.SESSION_SECRET || fallbackEnvSecret;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set in .env and be at least 32 characters long.');
  }
  return secret;
}

export async function createSessionToken(secret: string): Promise<string> {
  const sig = await computeHmacHex(SESSION_PAYLOAD, secret);
  return `${SESSION_PAYLOAD}.${sig}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (payload !== SESSION_PAYLOAD) return false;

  const expected = await computeHmacHex(payload, secret);
  if (sig.length !== expected.length) return false;

  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
