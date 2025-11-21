import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons')
const DEFAULT_ICON_PATH = path.join(ICONS_DIR, 'default.svg')
const REMOTE_BASE = 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg'

const vendorPrefixes = ['binhex-', 'linuxserver-', 'linuxserverio-', 'lscr-']
const suffixes = ['-vpn', '-docker', '-container']

const sanitizeSlug = (slug: string) => {
  const cleaned = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!cleaned) return null
  return cleaned
}

const buildCandidates = (slug: string) => {
  const candidates = new Set<string>()
  candidates.add(slug)

  vendorPrefixes.forEach((prefix) => {
    if (slug.startsWith(prefix)) {
      candidates.add(slug.slice(prefix.length))
    }
  })

  suffixes.forEach((suffix) => {
    if (slug.endsWith(suffix)) {
      candidates.add(slug.slice(0, -suffix.length))
    }
  })

  // combinations removing prefix+suffix
  vendorPrefixes.forEach((prefix) => {
    suffixes.forEach((suffix) => {
      if (slug.startsWith(prefix) && slug.endsWith(suffix)) {
        candidates.add(slug.slice(prefix.length, -suffix.length))
      }
    })
  })

  return Array.from(candidates).filter(Boolean)
}

const readLocalIcon = async (slug: string) => {
  const iconPath = path.join(ICONS_DIR, `${slug}.svg`)
  try {
    return await fs.readFile(iconPath)
  } catch {
    return null
  }
}

const fetchRemoteIcon = async (slug: string) => {
  try {
    const response = await fetch(`${REMOTE_BASE}/${slug}.svg`, { cache: 'no-store' })
    if (!response.ok) {
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer
  } catch (error) {
    console.warn(`Remote icon fetch failed for ${slug}`, error)
    return null
  }
}

const iconResponse = (payload: Buffer) =>
  new NextResponse(payload, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400'
    }
  })

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params
    const sanitized = sanitizeSlug(slug || '')
    if (!sanitized) {
      const fallback = await fs.readFile(DEFAULT_ICON_PATH)
      return iconResponse(fallback)
    }

    const candidates = buildCandidates(sanitized)
    for (const candidate of candidates) {
      const localMatch = await readLocalIcon(candidate)
      if (localMatch) {
        return iconResponse(localMatch)
      }
    }

    for (const candidate of candidates) {
      const remote = await fetchRemoteIcon(candidate)
      if (remote) {
        return iconResponse(remote)
      }
    }

    const fallback = await fs.readFile(DEFAULT_ICON_PATH)
    return iconResponse(fallback)
  } catch (error) {
    console.error('Icon handler error', error)
    return new NextResponse('Icon not found', { status: 404 })
  }
}
