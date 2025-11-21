const REMOTE_TREE_URL = 'https://api.github.com/repos/walkxcode/dashboard-icons/git/trees/main?recursive=1'
const REMOTE_BASE = 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main'

export interface CatalogEntry {
  slug: string
  path: string
  url: string
}

interface CacheState {
  expiresAt: number
  icons: CatalogEntry[]
}

let cache: CacheState | null = null

export async function getIconCatalog(force = false) {
  const now = Date.now()
  if (!force && cache && cache.expiresAt > now) {
    return cache.icons
  }

  const response = await fetch(REMOTE_TREE_URL, {
    headers: {
      'User-Agent': 'SystemDashboard/1.0',
      Accept: 'application/vnd.github+json'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error('Failed to fetch icon catalog from GitHub')
  }

  const json = await response.json()
  const tree = Array.isArray(json?.tree) ? json.tree : []
  const icons: CatalogEntry[] = tree
    .filter((node: any) => node.type === 'blob' && typeof node.path === 'string' && node.path.startsWith('svg/') && node.path.endsWith('.svg'))
    .map((node: any) => {
      const fileName = node.path.split('/').pop() || ''
      const slug = fileName.replace(/\.svg$/i, '')
      return {
        slug,
        path: node.path,
        url: `${REMOTE_BASE}/${node.path}`
      }
    })

  cache = {
    expiresAt: now + 1000 * 60 * 60 * 12,
    icons
  }
  return icons
}
