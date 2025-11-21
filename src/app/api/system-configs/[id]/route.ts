import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encryptSensitive } from '@/lib/encryption'

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
    if (name !== undefined) data.name = name
    if (host !== undefined) data.host = host
    if (port !== undefined) data.port = Number(port) || 443
    if (type !== undefined) data.type = type
    if (useSsl !== undefined) data.useSsl = Boolean(useSsl)
    if (allowSelfSigned !== undefined)
      data.allowSelfSigned = Boolean(allowSelfSigned)
    if (enabled !== undefined) data.enabled = Boolean(enabled)
    if (apiKey) {
      data.apiKeyEncrypted = encryptSensitive(apiKey)
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
