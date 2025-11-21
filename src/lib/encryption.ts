import crypto from 'crypto'

const SECRET = process.env.SYSTEM_CONFIG_SECRET

function getKey() {
  if (!SECRET || SECRET.length === 0) {
    throw new Error('SYSTEM_CONFIG_SECRET is not set')
  }
  return crypto.createHash('sha256').update(SECRET).digest()
}

export function encryptSensitive(value: string) {
  const key = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

export function decryptSensitive(payload: string) {
  const key = getKey()
  const [ivHex, dataHex, tagHex] = payload.split(':')
  if (!ivHex || !dataHex || !tagHex) {
    throw new Error('Invalid encrypted payload')
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final()
  ])
  return decrypted.toString('utf8')
}
