import { createHmac, timingSafeEqual } from 'node:crypto'

export type SessionData = {
  token: string
  gistId: string | null
  login: string
}

const COOKIE_NAME = 'session'
const ALGORITHM = 'sha256'

function sign(payload: string, secret: string): string {
  return createHmac(ALGORITHM, secret).update(payload).digest('base64url')
}

function encode(data: SessionData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url')
}

function decode(payload: string): SessionData | null {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as SessionData
  } catch {
    return null
  }
}

/**
 * Returns a Set-Cookie header value string for the session.
 */
export async function createSessionCookie(data: SessionData, secret: string): Promise<string> {
  const payload = encode(data)
  const sig = sign(payload, secret)
  const value = `${payload}.${sig}`
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
}

/**
 * Parses and verifies the session from a Cookie header string.
 * Returns the session data or null if invalid/missing.
 */
export async function parseSessionCookie(
  cookieHeader: string | undefined,
  secret: string,
): Promise<SessionData | null> {
  if (!cookieHeader) return null

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(part => {
      const [k, ...rest] = part.trim().split('=')
      return [k.trim(), rest.join('=').trim()]
    }),
  )

  const raw = cookies[COOKIE_NAME]
  if (!raw) return null

  const lastDot = raw.lastIndexOf('.')
  if (lastDot === -1) return null

  const payload = raw.slice(0, lastDot)
  const givenSig = raw.slice(lastDot + 1)
  const expectedSig = sign(payload, secret)

  // Constant-time comparison to prevent timing attacks
  const givenBuf = Buffer.from(givenSig)
  const expectedBuf = Buffer.from(expectedSig)
  if (givenBuf.length !== expectedBuf.length) return null
  if (!timingSafeEqual(givenBuf, expectedBuf)) return null

  return decode(payload)
}

/**
 * Returns a Set-Cookie header value that clears the session cookie.
 */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}
