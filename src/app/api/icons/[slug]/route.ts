import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons')
const DEFAULT_ICON_PATH = path.join(ICONS_DIR, 'default.svg')
const REMOTE_BASE = 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg'

const vendorPrefixes = ['binhex-', 'linuxserver-', 'linuxserverio-', 'lscr-']
const suffixes = ['-vpn', '-docker', '-container']

const slugAliases: Record<string, string[]> = {
  jacket: ['jackett'],
  radarr: ['binhex-radarr'],
  sonarr: ['binhex-sonarr'],
  qbittorrentvpn: ['qbittorrent'],
  qbittorrent: ['qbittorrentvpn'],
  homeassistant: ['home-assistant'],
  booklore: ['mariadb-booklore'],
  mediaserver: ['plex', 'emby', 'jellyfin'],
  valheim: ['valheim-server'],
  kiwix: ['kiwix-serve'],
  livekit: ['livekit-server']
}

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

  const expanded = Array.from(candidates)
  expanded.forEach((candidate) => {
    const aliases = slugAliases[candidate]
    if (aliases) {
      aliases.forEach((alias) => candidates.add(alias))
    }
  })

  return Array.from(candidates).filter(Boolean)
}

const LOCAL_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.webp']
const MIME_MAP: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const readLocalIcon = async (slug: string) => {
  try {
    const files = await fs.readdir(ICONS_DIR)
    for (const file of files) {
      const lower = file.toLowerCase()
      for (const ext of LOCAL_EXTS) {
        if (lower === `${slug}${ext}`) {
          const iconPath = path.join(ICONS_DIR, file)
          const buffer = await fs.readFile(iconPath)
          return { buffer, contentType: MIME_MAP[ext] }
        }
      }
    }
  } catch (error) {
    console.warn('Unable to read local icons directory', error)
  }
  return null
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

const iconResponse = (payload: Buffer, contentType: string = 'image/svg+xml') =>
  new NextResponse(payload, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400'
    }
  })

const palette = [
  ['#0EA5E9', '#38BDF8'],
  ['#6366F1', '#8B5CF6'],
  ['#F97316', '#FB923C'],
  ['#14B8A6', '#2DD4BF'],
  ['#EC4899', '#F472B6'],
  ['#A855F7', '#C084FC'],
  ['#22D3EE', '#67E8F9']
]

const hashString = (value: string) =>
  value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)

const generateIconSvg = (slug: string) => {
  const hash = hashString(slug)
  const [start, end] = palette[hash % palette.length]
  const initials = slug
    .split('-')
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'APP'

  return Buffer.from(
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${start}"/>
          <stop offset="100%" stop-color="${end}"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#grad)"/>
      <text x="50%" y="52%" font-family="Inter, sans-serif" font-size="26" fill="#ffffff" font-weight="600" text-anchor="middle" dominant-baseline="middle">
        ${initials}
      </text>
    </svg>`
  )
}

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

    const override = await prisma.appIconOverride.findUnique({ where: { slug: sanitized } })
    if (override) {
      const overrideSlug = override.iconSlug
      const localOverride = await readLocalIcon(overrideSlug)
      if (localOverride) {
        return iconResponse(localOverride.buffer, localOverride.contentType)
      }
      const remoteOverride = await fetchRemoteIcon(overrideSlug)
      if (remoteOverride) {
        return iconResponse(remoteOverride)
      }
    }

    const candidates = buildCandidates(sanitized)
    for (const candidate of candidates) {
      const localMatch = await readLocalIcon(candidate)
      if (localMatch) {
        return iconResponse(localMatch.buffer, localMatch.contentType)
      }
    }

    for (const candidate of candidates) {
      const remote = await fetchRemoteIcon(candidate)
      if (remote) {
        return iconResponse(remote)
      }
    }

    const generated = generateIconSvg(sanitized)
    if (generated) {
      return iconResponse(generated)
    }

    const fallback = await fs.readFile(DEFAULT_ICON_PATH)
    return iconResponse(fallback)
  } catch (error) {
    console.error('Icon handler error', error)
    return new NextResponse('Icon not found', { status: 404 })
  }
}
