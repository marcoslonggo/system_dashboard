import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const from = String(body.from || '').trim()
    const to = String(body.to || '').trim()
    if (!from || !to) {
      return NextResponse.json({ success: false, error: 'from and to are required' }, { status: 400 })
    }
    const source = await prisma.userPreference.findUnique({ where: { username: from } })
    if (!source?.data) {
      return NextResponse.json({ success: false, error: 'No preferences found for source user' }, { status: 404 })
    }
    await prisma.userPreference.upsert({
      where: { username: to },
      update: { data: source.data },
      create: { username: to, data: source.data }
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: 'Failed to copy preferences' }, { status: 500 })
  }
}
