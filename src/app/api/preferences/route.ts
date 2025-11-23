import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')?.trim()
  if (!username) {
    return NextResponse.json({ success: false, error: 'username is required' }, { status: 400 })
  }

  try {
    const pref = await prisma.userPreference.findUnique({
      where: { username }
    })
    return NextResponse.json({ success: true, data: pref?.data ?? null })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: 'Failed to load preferences' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const username = String(body.username || '').trim()
    const data = body.data
    if (!username) {
      return NextResponse.json({ success: false, error: 'username is required' }, { status: 400 })
    }
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ success: false, error: 'data is required' }, { status: 400 })
    }
    await prisma.userPreference.upsert({
      where: { username },
      update: { data },
      create: { username, data }
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: 'Failed to save preferences' }, { status: 500 })
  }
}
