import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons')
const DEFAULT_ICON_PATH = path.join(ICONS_DIR, 'default.svg')

const sanitizeSlug = (slug: string) => {
  const cleaned = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!cleaned) return null
  return cleaned
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const sanitized = sanitizeSlug(params.slug || '')
    if (!sanitized) {
      const fallback = await fs.readFile(DEFAULT_ICON_PATH)
      return new NextResponse(fallback, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600'
        }
      })
    }

    const iconPath = path.join(ICONS_DIR, `${sanitized}.svg`)
    let file = null
    try {
      file = await fs.readFile(iconPath)
    } catch {
      file = await fs.readFile(DEFAULT_ICON_PATH)
    }

    return new NextResponse(file, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  } catch (error) {
    console.error('Icon handler error', error)
    return new NextResponse('Icon not found', { status: 404 })
  }
}
