import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encryptSensitive } from '@/lib/encryption'

const DEFAULT_ID = 'default'

const sanitize = (config: any) =>
  config
    ? {
        id: config.id,
        host: config.host,
        port: config.port,
        username: config.username,
        upsName: config.upsName,
        enabled: config.enabled,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      }
    : null

export async function GET() {
  const config = await prisma.nutConfig.findUnique({
    where: { id: DEFAULT_ID }
  })

  return NextResponse.json({
    success: true,
    data: sanitize(config)
  })
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      host,
      port = 3493,
      username,
      password,
      upsName,
      enabled = true
    } = body

    if (!host || !host.trim()) {
      return NextResponse.json({ error: 'host is required' }, { status: 400 })
    }
    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }
    const numericPort = Number(port) || 3493

    const existing = await prisma.nutConfig.findUnique({ where: { id: DEFAULT_ID } })
    const passwordEncrypted =
      password && password.trim().length > 0
        ? encryptSensitive(password.trim())
        : existing?.passwordEncrypted

    if (!passwordEncrypted) {
      return NextResponse.json({ error: 'password is required' }, { status: 400 })
    }

    const config = await prisma.nutConfig.upsert({
      where: { id: DEFAULT_ID },
      create: {
        id: DEFAULT_ID,
        host: host.trim(),
        port: numericPort,
        username: username.trim(),
        passwordEncrypted,
        upsName: upsName?.trim() || null,
        enabled: Boolean(enabled)
      },
      update: {
        host: host.trim(),
        port: numericPort,
        username: username.trim(),
        passwordEncrypted,
        upsName: upsName?.trim() || null,
        enabled: Boolean(enabled)
      }
    })

    return NextResponse.json({
      success: true,
      data: sanitize(config)
    })
  } catch (error) {
    console.error('Failed to save NUT config', error)
    return NextResponse.json({ error: 'Failed to save NUT configuration' }, { status: 500 })
  }
}
