import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const overrides = await prisma.appIconOverride.findMany({
    orderBy: { updatedAt: 'desc' }
  })

  return NextResponse.json({
    success: true,
    data: overrides
  })
}
