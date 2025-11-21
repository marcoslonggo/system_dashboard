import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const body = await request.json()
    const iconSlug = (body?.iconSlug || '').toString().trim()

    if (!iconSlug) {
      return NextResponse.json({ error: 'iconSlug is required' }, { status: 400 })
    }

    const { slug } = await context.params

    const result = await prisma.appIconOverride.upsert({
      where: { slug },
      update: { iconSlug },
      create: { slug, iconSlug }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Failed to save icon override', error)
    return NextResponse.json({ error: 'Failed to save icon override' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params
    await prisma.appIconOverride.delete({ where: { slug } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete icon override', error)
    return NextResponse.json({ error: 'Failed to delete icon override' }, { status: 500 })
  }
}
