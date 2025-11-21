import { NextRequest, NextResponse } from 'next/server'
import { getIconCatalog } from '@/lib/icon-catalog'

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1'
    const icons = await getIconCatalog(force)
    return NextResponse.json({ success: true, data: icons })
  } catch (error) {
    console.error('Failed to fetch icon catalog', error)
    return NextResponse.json({ error: 'Failed to load icon catalog' }, { status: 500 })
  }
}
