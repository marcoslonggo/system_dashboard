import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decryptSensitive } from '@/lib/encryption'
import { queryNutStatus } from '@/lib/nut-client'

export async function GET() {
  try {
    const config = await prisma.nutConfig.findUnique({ where: { id: 'default' } })
    if (!config || !config.enabled) {
      return NextResponse.json({ success: false, error: 'NUT config not set or disabled' }, { status: 404 })
    }

    const password = decryptSensitive(config.passwordEncrypted)
    const status = await queryNutStatus({
      host: config.host,
      port: config.port,
      username: config.username,
      password,
      upsName: config.upsName
    })

    return NextResponse.json({ success: true, data: status })
  } catch (error: any) {
    // Handle missing table/record gracefully when DB is empty
    if (error?.code === 'P2021' || error?.code === 'P1008') {
      return NextResponse.json({ success: false, error: 'NUT config not set or unavailable' }, { status: 404 })
    }
    console.error('Failed to fetch NUT status', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch NUT status' },
      { status: 500 }
    )
  }
}
