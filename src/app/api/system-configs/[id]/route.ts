import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encryptSensitive } from '@/lib/encryption'
import { isValidHost, validatePort } from '@/lib/system-config-validation'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const {
      name,
      host,
      port,
      type,
      apiKey,
      useSsl,
      allowSelfSigned,
      enabled
    } = body

    const data: any = {}
    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      }
      data.name = trimmed
    }
    if (host !== undefined) {
      const trimmedHost = String(host).trim()
      if (!trimmedHost) {
        return NextResponse.json({ error: 'Host/IP is required' }, { status: 400 })
      }
      if (!isValidHost(trimmedHost)) {
        return NextResponse.json(
          { error: 'Host/IP must be a valid IPv4 address or hostname' },
          { status: 400 }
        )
      }
      data.host = trimmedHost
    }
    if (port !== undefined) {
      const numericPort = Number(port)
      const portError = validatePort(numericPort)
      if (portError) {
        return NextResponse.json({ error: portError }, { status: 400 })
      }
      data.port = numericPort
    }
    if (type !== undefined) {
      if (!['truenas', 'unraid'].includes(type)) {
        return NextResponse.json({ error: 'type must be truenas or unraid' }, { status: 400 })
      }
      data.type = type
    }
    if (useSsl !== undefined) data.useSsl = Boolean(useSsl)
    if (allowSelfSigned !== undefined)
      data.allowSelfSigned = Boolean(allowSelfSigned)
    if (enabled !== undefined) data.enabled = Boolean(enabled)
    if (apiKey !== undefined) {
      const trimmedKey = String(apiKey).trim()
      if (!trimmedKey) {
        return NextResponse.json({ error: 'API key cannot be empty' }, { status: 400 })
      }
      data.apiKeyEncrypted = encryptSensitive(trimmedKey)
    }

    const updated = await prisma.systemConfig.update({
      where: { id: params.id },
      data
    })

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        host: updated.host,
        port: updated.port,
        type: updated.type,
        useSsl: updated.useSsl,
        allowSelfSigned: updated.allowSelfSigned,
        enabled: updated.enabled,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        hasApiKey: !!updated.apiKeyEncrypted
      }
    })
  } catch (error) {
    console.error('Failed to update system config', error)
    return NextResponse.json(
      { error: 'Failed to update system configuration' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.systemConfig.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete system config', error)
    return NextResponse.json(
      { error: 'Failed to delete system configuration' },
      { status: 500 }
    )
  }
}
