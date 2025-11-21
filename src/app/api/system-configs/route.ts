import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encryptSensitive } from '@/lib/encryption'

export async function GET() {
  const configs = await prisma.systemConfig.findMany({
    orderBy: { createdAt: 'asc' }
  })

  return NextResponse.json({
    success: true,
    data: configs.map((config) => ({
      id: config.id,
      name: config.name,
      host: config.host,
      port: config.port,
      type: config.type,
      useSsl: config.useSsl,
      allowSelfSigned: config.allowSelfSigned,
      enabled: config.enabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      hasApiKey: !!config.apiKeyEncrypted
    }))
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      host,
      port,
      type,
      apiKey,
      useSsl = true,
      allowSelfSigned = false,
      enabled = true
    } = body

    if (!name || !host || !type || !apiKey) {
      return NextResponse.json(
        { error: 'name, host, type and apiKey are required' },
        { status: 400 }
      )
    }

    const encryptedKey = encryptSensitive(apiKey)

    const config = await prisma.systemConfig.create({
      data: {
        name,
        host,
        port: Number(port) || 443,
        type,
        apiKeyEncrypted: encryptedKey,
        useSsl: Boolean(useSsl),
        allowSelfSigned: Boolean(allowSelfSigned),
        enabled: Boolean(enabled)
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        type: config.type,
        useSsl: config.useSsl,
        allowSelfSigned: config.allowSelfSigned,
        enabled: config.enabled,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        hasApiKey: true
      }
    })
  } catch (error) {
    console.error('Failed to create system config', error)
    return NextResponse.json(
      { error: 'Failed to create system configuration' },
      { status: 500 }
    )
  }
}
