import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'

/**
 * Derives a fixed 32-byte AES-256 key from ENCRYPTION_KEY.
 * Accepted forms:
 *   1. 64 hex chars            -> decoded as 32 bytes
 *   2. 44 base64 chars ("==")  -> decoded as 32 bytes
 *   3. any other non-empty string -> hashed (SHA-256) into 32 bytes
 * A value shorter than 16 chars is rejected to nudge users toward a strong key.
 */
export function getKey() {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not configured. Generate one with: openssl rand -hex 32',
    )
  }

  let key = null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else if (/^[A-Za-z0-9+/]{44}==?$/.test(raw)) {
    try {
      key = Buffer.from(raw, 'base64')
      if (key.length !== 32) key = null
    } catch {
      key = null
    }
  }

  if (!key) {
    if (raw.length < 16) {
      throw new Error('ENCRYPTION_KEY is too weak. Use at least 16 characters (recommend: openssl rand -hex 32).')
    }
    key = crypto.createHash('sha256').update(raw).digest()
  }

  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must resolve to a 32-byte key.')
  }
  return key
}

export const encryptionConfigured = Boolean(process.env.ENCRYPTION_KEY)

/**
 * Encrypts a plaintext (e.g. a JSON blob of Google tokens) and returns a
 * versioned, self-contained string: v1:ivHex:authTagHex:cipherBase64
 */
export function sealSecret(plainText) {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`
}

/** Decrypts a payload produced by sealSecret. Throws on tampering. */
export function openSecret(payload) {
  const key = getKey()
  const parts = String(payload || '').split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Encrypted payload is malformed or from an unknown version.')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parts[1], 'hex'))
  decipher.setAuthTag(Buffer.from(parts[2], 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** Wraps token JSON into an encrypted column value. */
export function sealTokens(tokens) {
  return sealSecret(JSON.stringify(tokens))
}

/** Parses and decrypts a stored token column back into an object. */
export function openTokens(encryptedValue) {
  if (!encryptedValue) return null
  return JSON.parse(openSecret(encryptedValue))
}
