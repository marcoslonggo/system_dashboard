'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { slugify as sharedSlugify } from '@/lib/slugify'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Server, 
  HardDrive, 
  Cpu, 
  MemoryStick, 
  Activity, 
  Power, 
  PowerOff,
  RotateCcw,
  Settings,
  Wifi,
  WifiOff,
  Database,
  Clock,
  Thermometer,
  GripVertical,
  ChevronDown,
  Image as ImageIcon,
  X,
  Search,
  SlidersHorizontal,
  Battery,
  PlugZap,
  MoreVertical,
  Eye,
  EyeOff,
  Copy
} from 'lucide-react'
import { validateHost, validatePort } from '@/lib/system-config-validation'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'

interface SystemInfo {
  id?: string
  name: string
  type: 'truenas' | 'unraid'
  status: 'online' | 'offline' | 'warning'
  uptime: string
  cpu: number
  memory: number
  storage: number
  temperature: number
  gpu?: number | null
  apps: App[]
}

interface App {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  cpu: number | null
  memory: number | null
  icon?: string
  url?: string
  slug?: string
}

interface AggregatedApp extends App {
  globalId: string
  systemId?: string
  systemName: string
  systemType: 'truenas' | 'unraid'
  systemStatus: SystemInfo['status']
  hostCpu: number
  hostMemory: number
  fallbackIcon: string
}

interface DashboardPreferences {
  refreshInterval: number
  notifications: boolean
}

interface NutConfig {
  host: string
  port: number
  username: string
  password?: string
  upsName?: string
  enabled: boolean
  hasPassword?: boolean
}

interface NutStatus {
  upsName: string
  status?: string
  charge?: number
  runtimeSeconds?: number
  load?: number
  inputVoltage?: number
  outputVoltage?: number
}

interface StoredSystemConfig {
  id: string
  name: string
  host: string
  port: number
  type: 'truenas' | 'unraid'
  useSsl: boolean
  allowSelfSigned: boolean
  enabled: boolean
  hasApiKey: boolean
}

interface SystemConfigForm {
  id?: string | null
  name: string
  host: string
  port: number
  type: 'truenas' | 'unraid'
  apiKey: string
  useSsl: boolean
  allowSelfSigned: boolean
  enabled: boolean
}

const APP_ORDER_STORAGE_KEY = 'dashboard-app-order'
const CARD_WIDTH_STORAGE_KEY = 'dashboard-card-width'
const DASHBOARD_PREFS_STORAGE_KEY = 'dashboard-preferences'
const APP_VISIBILITY_STORAGE_KEY = 'dashboard-app-visibility'
const DEFAULT_CARD_WIDTH = 320
const DOCKER_ICON_FALLBACK = '/docker-icon.svg'

const SYSTEM_META: Record<SystemInfo['type'], { label: string; badgeClass: string; icon: typeof HardDrive }> = {
  truenas: {
    label: 'TrueNAS',
    badgeClass: 'bg-sky-100 text-sky-900',
    icon: HardDrive
  },
  unraid: {
    label: 'Unraid',
    badgeClass: 'bg-amber-100 text-amber-900',
    icon: Server
  }
}

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const slugifyName = (name?: string) => sharedSlugify(name)

const deriveAppIcon = (provided?: string, slug?: string, name?: string) => {
  const finalSlug = slug || slugifyName(name)
  const slugIcon = finalSlug ? `/api/icons/${finalSlug}` : DOCKER_ICON_FALLBACK

  if (provided && provided.length > 0) {
    return { primary: provided, fallback: slugIcon }
  }

  if (finalSlug) {
    return { primary: slugIcon, fallback: DOCKER_ICON_FALLBACK }
  }

  return { primary: DOCKER_ICON_FALLBACK, fallback: DOCKER_ICON_FALLBACK }
}

const normalizeAppUrl = (url?: string | null) => {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    new URL(trimmed)
    return trimmed
  } catch {
    return null
  }
}

type ResolvedUrl = { url: string | null; guessed: boolean; source: string }
const HTTP_PORTS = new Set([80, 81, 3000, 3001, 8080, 8081, 8880])
const HTTPS_PORTS = new Set([443, 444, 8443, 9443])
const NON_WEB_PORTS = new Set([22, 23, 25, 110, 143, 3306, 5432, 6379, 11211, 27017, 33060])

const getStatusColor = (status: string) => {
  switch (status) {
    case 'online':
    case 'running':
      return 'bg-green-500'
    case 'offline':
    case 'stopped':
      return 'bg-red-500'
    case 'warning':
    case 'error':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-500'
  }
}

const getStatusBadge = (status: string, uptime?: string) => {
  switch (status) {
    case 'online':
    case 'running':
      return <Badge variant="default" className="bg-green-100 text-green-800">Online</Badge>
    case 'offline':
    case 'stopped':
      if (uptime === 'API key required') {
        return <Badge variant="destructive">API Key Required</Badge>
      }
      return <Badge variant="destructive">Offline</Badge>
    case 'warning':
    case 'error':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Warning</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const emptyConfigForm: SystemConfigForm = {
  name: '',
  host: '',
  port: 443,
  type: 'truenas',
  apiKey: '',
  useSsl: true,
  allowSelfSigned: false,
  enabled: true
}

const validateSystemConfigForm = (form: SystemConfigForm, isEditing: boolean) => {
  if (!form.name.trim()) {
    return 'Name is required.'
  }
  const host = form.host.trim()
  if (!host) {
    return 'Host/IP is required.'
  }
  const hostError = validateHost(host)
  if (hostError) {
    return hostError
  }
  const portError = validatePort(form.port)
  if (portError) {
    return portError
  }
  if (!isEditing && !form.apiKey.trim()) {
    return 'API key is required.'
  }
  return null
}

const connectionSignatureFields = (form: SystemConfigForm) => ({
  host: form.host.trim(),
  port: form.port,
  type: form.type,
  apiKey: form.apiKey.trim(),
  useSsl: form.useSsl,
  allowSelfSigned: form.allowSelfSigned
})

const getConnectionSignature = (form: SystemConfigForm) =>
  JSON.stringify(connectionSignatureFields(form))

export default function Dashboard() {
  const [systems, setSystems] = useState<SystemInfo[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cardMinWidth, setCardMinWidth] = useState(DEFAULT_CARD_WIDTH)
  const [appOrder, setAppOrder] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)
  const [serverDetails, setServerDetails] = useState<SystemInfo | null>(null)
  const [config, setConfig] = useState<DashboardPreferences>({
    refreshInterval: 5000,
    notifications: true
  })
  const [systemConfigs, setSystemConfigs] = useState<StoredSystemConfig[]>([])
  const [configForm, setConfigForm] = useState<SystemConfigForm>(emptyConfigForm)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configListLoading, setConfigListLoading] = useState(false)
  const [connectionTest, setConnectionTest] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error'
    message?: string
    signature?: string
  }>({ status: 'idle' })
  const [hiddenApps, setHiddenApps] = useState<Record<string, boolean>>({})
  const [openDisabled, setOpenDisabled] = useState<Record<string, boolean>>({})
  const [showHidden, setShowHidden] = useState(false)
  const [iconOverrides, setIconOverrides] = useState<Record<string, string>>({})
  const [iconCatalog, setIconCatalog] = useState<{ slug: string; url: string }[]>([])
  const [iconPickerTarget, setIconPickerTarget] = useState<AggregatedApp | null>(null)
  const [iconSearch, setIconSearch] = useState('')
  const [prefetchedIcons, setPrefetchedIcons] = useState<Record<string, boolean>>({})
  const [nutConfig, setNutConfig] = useState<NutConfig>({
    host: '',
    port: 3493,
    username: '',
    password: '',
    upsName: '',
    enabled: false,
    hasPassword: false
  })
  const [nutStatus, setNutStatus] = useState<NutStatus | null>(null)
  const [nutLoading, setNutLoading] = useState(false)
  const [nutError, setNutError] = useState<string | null>(null)
  const [nutMessage, setNutMessage] = useState<string | null>(null)
  const [nutDetailsOpen, setNutDetailsOpen] = useState(false)
  const persistVisibility = useCallback(
    (hidden: Record<string, boolean>, openMap: Record<string, boolean>) => {
      if (typeof window === 'undefined') return
      const payload = { hidden, openDisabled: openMap }
      window.localStorage.setItem(APP_VISIBILITY_STORAGE_KEY, JSON.stringify(payload))
    },
    []
  )
  const prefsHydratedRef = useRef(false)
  const isMobile = useIsMobile()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(APP_ORDER_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setAppOrder(parsed)
        }
      } catch {
        // ignore malformed storage
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(CARD_WIDTH_STORAGE_KEY)
    if (stored) {
      const parsed = Number(stored)
      if (!Number.isNaN(parsed) && parsed >= 220 && parsed <= 480) {
        setCardMinWidth(parsed)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(APP_VISIBILITY_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed?.hidden && typeof parsed.hidden === 'object') {
          setHiddenApps(parsed.hidden)
        }
        if (parsed?.openDisabled && typeof parsed.openDisabled === 'object') {
          setOpenDisabled(parsed.openDisabled)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    persistVisibility(hiddenApps, openDisabled)
  }, [hiddenApps, openDisabled, persistVisibility])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(DASHBOARD_PREFS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setConfig((prev) => ({
          ...prev,
          refreshInterval: typeof parsed.refreshInterval === 'number' ? parsed.refreshInterval : prev.refreshInterval,
          notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : prev.notifications
        }))
      }
    } catch (err) {
      console.warn('Failed to parse stored dashboard preferences', err)
    } finally {
      prefsHydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !prefsHydratedRef.current) return
    window.localStorage.setItem(DASHBOARD_PREFS_STORAGE_KEY, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.crypto === 'object' && typeof window.crypto.randomUUID !== 'function') {
      window.crypto.randomUUID = () => {
        const bytes = new Uint8Array(16)
        window.crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('')
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      }
    }
  }, [])

  const nutConfigured =
    nutConfig.enabled &&
    nutConfig.host.trim().length > 0 &&
    nutConfig.username.trim().length > 0

  const fetchNutStatus = useCallback(async () => {
    if (!nutConfigured) {
      setNutStatus(null)
      setNutError(null)
      setNutMessage(null)
      return
    }
    try {
      setNutLoading(true)
      setNutError(null)
      setNutMessage(null)
      const res = await fetch('/api/nut-status')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setNutError(data?.error || 'NUT status unavailable')
        setNutStatus(null)
        return
      }
      const data = await res.json()
      if (data?.success) {
        setNutStatus(data.data)
        const charge = data.data?.charge
        const runtime = data.data?.runtimeSeconds
        const runtimeMinutes =
          typeof runtime === 'number' ? Math.max(0, Math.round(runtime / 60)) : null
        const parts = [
          charge !== undefined ? `${charge}%` : null,
          runtimeMinutes !== null ? `${runtimeMinutes}m runtime` : null
        ].filter(Boolean)
        setNutMessage(`UPS online${parts.length ? ` • ${parts.join(' • ')}` : ''}`)
      }
    } catch (error) {
      setNutError('Failed to reach UPS')
      setNutStatus(null)
    } finally {
      setNutLoading(false)
    }
  }, [nutConfigured])

  const fetchNutConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/nut-config')
      if (!res.ok) return
      const data = await res.json()
      if (data?.data) {
        setNutConfig((prev) => ({
          ...prev,
          ...data.data,
          password: ''
        }))
        if (data.data.enabled && data.data.host) {
          await fetchNutStatus()
        }
      }
    } catch (error) {
      console.warn('Failed to load NUT config', error)
    }
  }, [fetchNutStatus])

  const fetchSystems = useCallback(async () => {
    try {
      const response = await fetch('/api/systems')
      if (!response.ok) {
        throw new Error('Failed to fetch systems')
      }
      const data = await response.json()
      if (data.success) {
        setSystems(data.data)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Failed to fetch system data:', error)
    }
  }, [])

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || settingsOpen) return
    const interval = setInterval(() => {
      fetchSystems()
      if (nutConfigured) {
        fetchNutStatus()
      }
    }, config.refreshInterval)
    return () => clearInterval(interval)
  }, [autoRefresh, config.refreshInterval, fetchNutStatus, fetchSystems, nutConfigured, settingsOpen])

  // Initial data fetch
  useEffect(() => {
    fetchSystems()
    fetchNutConfig()
  }, [fetchSystems, fetchNutConfig])

  useEffect(() => {
    if (nutConfigured) {
      fetchNutStatus()
    }
  }, [fetchNutStatus, nutConfigured])

  const appsWithMeta = useMemo<AggregatedApp[]>(() => {
    return systems.flatMap((system) =>
      system.apps.map((app) => ({
        ...app,
        slug: app.slug || slugifyName(app.name),
        ...(() => {
          const iconData = deriveAppIcon(app.icon, app.slug, app.name)
          return {
            icon: iconData.primary,
            fallbackIcon: iconData.fallback
          }
        })(),
        globalId: `${system.type}:${app.id}`,
        systemId: system.id,
        systemName: system.name,
        systemType: system.type,
        systemStatus: system.status,
        hostCpu: system.cpu,
        hostMemory: system.memory
      }))
    )
  }, [systems])

  const editingSystem = useMemo(
    () => systemConfigs.find((config) => config.id === editingConfigId) || null,
    [systemConfigs, editingConfigId]
  )
  const isAddMode = !editingConfigId
  const currentSignature = useMemo(
    () => getConnectionSignature(configForm),
    [configForm.host, configForm.port, configForm.type, configForm.apiKey, configForm.useSsl, configForm.allowSelfSigned]
  )
  const addModeTestPassed = useMemo(
    () =>
      connectionTest.status === 'success' &&
      connectionTest.signature === currentSignature,
    [connectionTest.status, connectionTest.signature, currentSignature]
  )
  const filteredIcons = useMemo(() => {
    const term = iconSearch.toLowerCase().trim()
    if (!term) return iconCatalog.slice(0, 200)
    return iconCatalog.filter((icon) => icon.slug.includes(term)).slice(0, 200)
  }, [iconCatalog, iconSearch])

  const currentAppIds = useMemo(() => appsWithMeta.map((app) => app.globalId), [appsWithMeta])
  const persistOrder = useCallback((order: string[]) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(APP_ORDER_STORAGE_KEY, JSON.stringify(order))
  }, [])
  const currentIdsSignature = currentAppIds.join('|')

  useEffect(() => {
    if (!currentAppIds.length) return
    setAppOrder((prev) => {
      const filtered = prev.filter((id) => currentAppIds.includes(id))
      const missing = currentAppIds.filter((id) => !filtered.includes(id))
      const next = [...filtered, ...missing]
      if (arraysEqual(next, prev)) {
        return prev
      }
      persistOrder(next)
      return next
    })
  }, [currentIdsSignature, currentAppIds, persistOrder])

  const orderedApps = useMemo(() => {
    if (!appsWithMeta.length) return []
    if (!appOrder.length) return appsWithMeta
    const map = new Map(appsWithMeta.map((app) => [app.globalId, app]))
    const ordered: AggregatedApp[] = []
    appOrder.forEach((id) => {
      const app = map.get(id)
      if (app) {
        ordered.push(app)
        map.delete(id)
      }
    })
    map.forEach((app) => ordered.push(app))
    return ordered
  }, [appsWithMeta, appOrder])

  const visibleApps = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const base = orderedApps.filter((app) => (showHidden ? true : !hiddenApps[app.globalId]))
    if (!term) return base
    return base.filter((app) => {
      const haystack = `${app.name} ${app.systemName} ${app.slug || ''} ${app.status}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [orderedApps, searchTerm, hiddenApps, showHidden])

  useEffect(() => {
    setHiddenApps((prev) => {
      const next: Record<string, boolean> = {}
      currentAppIds.forEach((id) => {
        if (prev[id]) next[id] = true
      })
      return next
    })
    setOpenDisabled((prev) => {
      const next: Record<string, boolean> = {}
      currentAppIds.forEach((id) => {
        if (prev[id]) next[id] = true
      })
      return next
    })
  }, [currentAppIds])

  const resolveAppUrl = useCallback((rawUrl: string | undefined | null): ResolvedUrl => {
    const source = rawUrl || ''
    const trimmed = source.trim()
    if (!trimmed) {
      return { url: null, guessed: false, source }
    }

    const coerceProtocol = (value: string) => {
      try {
        const parsed = new URL(value)
        const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
        if (parsed.protocol === 'https:' && !HTTPS_PORTS.has(port)) {
          parsed.protocol = 'http:'
          return parsed.toString()
        }
        if (parsed.protocol === 'https:' && HTTP_PORTS.has(port)) {
          parsed.protocol = 'http:'
          return parsed.toString()
        }
        if (parsed.protocol === 'http:' && HTTPS_PORTS.has(port)) {
          parsed.protocol = 'https:'
          return parsed.toString()
        }
        return parsed.toString()
      } catch {
        return null
      }
    }

    const lower = trimmed.toLowerCase()
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      const coerced = coerceProtocol(trimmed)
      return { url: coerced || trimmed, guessed: false, source }
    }

    const guessed = `http://${trimmed}`
    const coerced = coerceProtocol(guessed)
    return { url: coerced || guessed, guessed: true, source }
  }, [])

  const isLikelyWebUrl = (url: string | null | undefined) => {
    if (!url) return false
    try {
      const parsed = new URL(url)
      const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
      if (Number.isNaN(port)) return false
      return !NON_WEB_PORTS.has(port)
    } catch {
      return false
    }
  }

  const appLinkMap = useMemo(() => {
    const map: Record<string, ResolvedUrl> = {}
    appsWithMeta.forEach((app) => {
      map[app.globalId] = resolveAppUrl(app.url)
    })
    return map
  }, [appsWithMeta, resolveAppUrl])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      setAppOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string)
        const newIndex = prev.indexOf(over.id as string)
        if (oldIndex === -1 || newIndex === -1) return prev
        const next = arrayMove(prev, oldIndex, newIndex)
        persistOrder(next)
        return next
      })
    },
    [persistOrder]
  )

  const handleCardWidthChange = useCallback((value: number[]) => {
    const width = value[0]
    setCardMinWidth(width)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CARD_WIDTH_STORAGE_KEY, String(width))
    }
  }, [])

  const resetConfigForm = () => {
    setConfigForm(emptyConfigForm)
    setEditingConfigId(null)
    setConfigError(null)
    setConnectionTest({ status: 'idle' })
  }

  const refreshIconOverrides = useCallback(async () => {
    try {
      const response = await fetch('/api/icon-overrides')
      if (!response.ok) return
      const json = await response.json()
      const map: Record<string, string> = {}
      ;(json.data || []).forEach((entry: { slug: string; iconSlug: string }) => {
        map[entry.slug] = entry.iconSlug
      })
      setIconOverrides(map)
    } catch (error) {
      console.warn('Failed to refresh icon overrides', error)
    }
  }, [])

  const refreshSystemConfigs = useCallback(async () => {
    try {
      setConfigError(null)
      setConfigListLoading(true)
      const response = await fetch('/api/system-configs')
      if (!response.ok) {
        throw new Error('Failed to load system configs')
      }
      const json = await response.json()
      setSystemConfigs(json.data || [])
    } catch (err) {
      console.error(err)
      setConfigError('Failed to load system configs')
    } finally {
      setConfigListLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSystemConfigs()
  }, [refreshSystemConfigs])

  const prefetchIcon = useCallback((url?: string) => {
    if (!url || typeof window === 'undefined') return
    setPrefetchedIcons((prev) => {
      if (prev[url]) return prev
      const img = new Image()
      img.src = url
      return { ...prev, [url]: true }
    })
  }, [])

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch('/api/icon-catalog')
        if (!response.ok) return
        const json = await response.json()
        setIconCatalog(json.data || [])
      } catch (error) {
        console.warn('Failed to load icon catalog', error)
      }
    }

    refreshIconOverrides()
    fetchCatalog()
  }, [refreshIconOverrides])

  useEffect(() => {
    if (!iconPickerTarget?.slug) return
    const overrideSlug = iconOverrides[iconPickerTarget.slug]
    const catalogEntry = iconCatalog.find((entry) => entry.slug === overrideSlug)
    if (catalogEntry?.url) {
      prefetchIcon(catalogEntry.url)
    } else {
      prefetchIcon(iconPickerTarget.icon)
    }
  }, [iconCatalog, iconOverrides, iconPickerTarget, prefetchIcon])

  useEffect(() => {
    if (!isAddMode) return
    if (connectionTest.status === 'success' && connectionTest.signature !== currentSignature) {
      setConnectionTest({ status: 'idle' })
    }
  }, [isAddMode, connectionTest.status, connectionTest.signature, currentSignature])

  const handleTestConnection = useCallback(async () => {
    if (!isAddMode) return
    const validationError = validateSystemConfigForm(configForm, false)
    if (validationError) {
      setConnectionTest({ status: 'error', message: validationError })
      setConfigError(validationError)
      return
    }

    try {
      setConnectionTest({ status: 'testing' })
      const payload = {
        ...connectionSignatureFields(configForm),
        name: configForm.name.trim(),
        type: configForm.type,
        enabled: configForm.enabled
      }
      const response = await fetch('/api/system-configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setConnectionTest({
          status: 'success',
          message: 'Connection verified successfully.',
          signature: currentSignature
        })
        setConfigError(null)
      } else {
        setConnectionTest({
          status: 'error',
          message: data.error || 'Failed to validate system connection.'
        })
      }
    } catch (err) {
      console.error('Connection test failed', err)
      setConnectionTest({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error'
      })
    }
  }, [configForm, currentSignature, isAddMode])

  const handleConfigSubmit = async () => {
    try {
      setConfigLoading(true)
      setConfigError(null)
      const validationError = validateSystemConfigForm(configForm, Boolean(editingConfigId))
      if (validationError) {
        setConfigError(validationError)
        setConfigLoading(false)
        return
      }
      if (!editingConfigId) {
        if (!addModeTestPassed) {
          setConfigError('Please test and verify the connection before adding a system.')
          setConfigLoading(false)
          return
        }
      }
      const payload: any = {
        name: configForm.name.trim(),
        host: configForm.host.trim(),
        port: configForm.port,
        type: configForm.type,
        useSsl: configForm.useSsl,
        allowSelfSigned: configForm.allowSelfSigned,
        enabled: configForm.enabled
      }
      if (configForm.apiKey.trim()) {
        payload.apiKey = configForm.apiKey.trim()
      }
      const url = editingConfigId
        ? `/api/system-configs/${editingConfigId}`
        : '/api/system-configs'
      const method = editingConfigId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      await refreshSystemConfigs()
      await fetchSystems()
      resetConfigForm()
    } catch (err) {
      console.error(err)
      setConfigError('Failed to save system')
    } finally {
      setConfigLoading(false)
    }
  }

  const handleEditConfig = (config: StoredSystemConfig) => {
    setEditingConfigId(config.id)
    setConnectionTest({ status: 'idle' })
    setConfigForm({
      id: config.id,
      name: config.name,
      host: config.host,
      port: config.port,
      type: config.type,
      apiKey: '',
      useSsl: config.useSsl,
      allowSelfSigned: config.allowSelfSigned,
      enabled: config.enabled
    })
  }

  const handleDeleteConfig = async (id: string) => {
    if (!confirm('Delete this system configuration?')) return
    try {
      await fetch(`/api/system-configs/${id}`, { method: 'DELETE' })
      await refreshSystemConfigs()
      await fetchSystems()
    } catch (err) {
      console.error(err)
      setConfigError('Failed to delete system')
    }
  }

  const handleToggleConfigEnabled = async (config: StoredSystemConfig, value: boolean) => {
    try {
      await fetch(`/api/system-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: value })
      })
      await refreshSystemConfigs()
      await fetchSystems()
    } catch (err) {
      console.error(err)
      setConfigError('Failed to update system')
    }
  }

  const handleIconOverrideChange = useCallback(
    async (targetSlug: string | undefined, iconSlug: string | null) => {
      if (!targetSlug) return
      const selectedIcon = iconCatalog.find((icon) => icon.slug === iconSlug)
      if (selectedIcon?.url) {
        prefetchIcon(selectedIcon.url)
      }
      try {
        if (iconSlug) {
          await fetch(`/api/icon-overrides/${targetSlug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iconSlug })
          })
        } else {
          await fetch(`/api/icon-overrides/${targetSlug}`, {
            method: 'DELETE'
          })
        }
        await refreshIconOverrides()
        await fetchSystems()
        setIconPickerTarget(null)
        setIconSearch('')
        if (iconSlug) {
          toast.success('Icon updated', {
            description: `Using ${iconSlug} for ${targetSlug}`
          })
        } else {
          toast.success('Icon reset', {
            description: `Reverted ${targetSlug} to default icon`
          })
        }
      } catch (error) {
        console.error('Failed to update icon override', error)
        alert('Could not update icon override')
      }
    },
    [fetchSystems, iconCatalog, prefetchIcon, refreshIconOverrides]
  )

  const handleSaveNutConfig = useCallback(async () => {
    try {
      setNutLoading(true)
      setNutError(null)
      const payload: any = {
        host: nutConfig.host.trim(),
        port: nutConfig.port,
        username: nutConfig.username.trim(),
        upsName: nutConfig.upsName?.trim() || null,
        enabled: nutConfig.enabled
      }
      if (nutConfig.password && nutConfig.password.trim()) {
        payload.password = nutConfig.password.trim()
      }
      const res = await fetch('/api/nut-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save NUT config')
      }
      const data = await res.json()
      setNutConfig((prev) => ({
        ...prev,
        ...data.data,
        password: '',
        hasPassword: true
      }))
      await fetchNutStatus()
    } catch (error: any) {
      setNutError(error?.message || 'Failed to save NUT config')
    } finally {
      setNutLoading(false)
    }
  }, [fetchNutStatus, nutConfig])

  const handleAppAction = async (
    system: { id?: string; type: 'truenas' | 'unraid' },
    appId: string,
    action: 'start' | 'stop' | 'restart'
  ) => {
    try {
      const response = await fetch('/api/apps/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemId: system.id,
          systemType: system.type,
          appId,
          action
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Update local state optimistically
        setSystems((prevSystems) =>
          prevSystems.map((prevSystem) => {
            const matchesId = system.id && prevSystem.id === system.id
            const matchesType = !system.id && prevSystem.type === system.type
            if (!matchesId && !matchesType) {
              return prevSystem
            }
            return {
              ...prevSystem,
              apps: prevSystem.apps.map((app) => {
                if (app.id !== appId) return app
                const newStatus = action === 'stop' ? 'stopped' : 'running'
                return { ...app, status: newStatus }
              })
            }
          })
        )
        await fetchSystems()
      } else {
        // Show error message
        alert(`Error: ${data.error || 'Failed to perform action'}`)
      }
    } catch (error) {
      console.error('Failed to perform app action:', error)
      alert('Network error: Failed to perform action')
    }
  }

  const renderSettingsContent = (padded = false) => (
    <div className={cn('space-y-6', padded && 'pb-4')}>
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">UPS (NUT) Monitoring</h3>
        <p className="text-sm text-muted-foreground">
          Connect to a Network UPS Tools (NUT) daemon to show charge/runtime in the header.
        </p>
        {nutError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {nutError}
          </div>
        )}
        <Card className="border-border/60">
          <CardContent className="space-y-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PlugZap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {nutConfigured ? 'UPS Enabled' : 'UPS Disabled'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={nutConfig.enabled}
                  onCheckedChange={(checked) => {
                    setNutConfig((prev) => ({ ...prev, enabled: checked }))
                    if (!checked) {
                      setNutStatus(null)
                      setNutMessage(null)
                      setNutError(null)
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">Enabled</span>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Host/IP</Label>
                <Input
                  value={nutConfig.host}
                  onChange={(e) => setNutConfig((prev) => ({ ...prev, host: e.target.value }))}
                  placeholder="192.168.1.24"
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={nutConfig.port}
                  onChange={(e) => setNutConfig((prev) => ({ ...prev, port: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={nutConfig.username}
                  onChange={(e) => setNutConfig((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="upsmon"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={nutConfig.password}
                  onChange={(e) => setNutConfig((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder={nutConfig.hasPassword ? '•••••••• (leave blank to keep)' : ''}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>UPS Name (optional)</Label>
                <Input
                  value={nutConfig.upsName || ''}
                  onChange={(e) => setNutConfig((prev) => ({ ...prev, upsName: e.target.value }))}
                  placeholder="ups"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={fetchNutStatus} disabled={nutLoading}>
                {nutLoading ? 'Testing...' : 'Test connection'}
              </Button>
              <Button onClick={handleSaveNutConfig} disabled={nutLoading}>
                Save UPS settings
              </Button>
              {nutMessage && (
                <span className="text-xs text-green-700">{nutMessage}</span>
              )}
              {nutError && (
                <span className="text-xs text-destructive">{nutError}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Connected Systems</h3>
          <p className="text-sm text-muted-foreground">
            Add TrueNAS or Unraid servers. API keys are stored encrypted in SQLite.
          </p>
        </div>
        {configError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {configError}
          </div>
        )}
        <div className="space-y-3 pr-1 max-h-[60vh] overflow-y-auto">
          {configListLoading ? (
            <p className="text-sm text-muted-foreground">Loading systems...</p>
          ) : systemConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No systems configured yet.</p>
          ) : (
            systemConfigs.map((system) => {
              const isEditing = editingConfigId === system.id
              return (
                <Collapsible key={system.id} open={isEditing}>
                  <Card
                    className={cn(
                      'border-border/60 transition-all',
                      isEditing && 'border-primary/60 shadow-lg ring-1 ring-primary/30'
                    )}
                  >
                    <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{system.name}</p>
                          {isEditing && (
                            <Badge variant="outline" className="border-primary text-primary shadow-sm">
                              Editing
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {system.host}:{system.port}
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize">
                        {system.type}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={system.enabled}
                          onCheckedChange={(checked) => handleToggleConfigEnabled(system, checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {system.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            isEditing ? resetConfigForm() : handleEditConfig(system)
                          }
                        >
                          {isEditing ? 'Close' : 'Edit'}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteConfig(system.id)}>
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                    <CollapsibleContent className="overflow-hidden border-t border-border/70 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                      {isEditing && (
                        <div className="space-y-4 px-4 py-4 text-sm">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input
                                value={configForm.name}
                                onChange={(e) =>
                                  setConfigForm((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="My NAS"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Platform</Label>
                              <Select
                                value={configForm.type}
                                onValueChange={(value: 'truenas' | 'unraid') =>
                                  setConfigForm((prev) => ({ ...prev, type: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="truenas">TrueNAS</SelectItem>
                                  <SelectItem value="unraid">Unraid</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Host/IP</Label>
                              <Input
                                value={configForm.host}
                                onChange={(e) =>
                                  setConfigForm((prev) => ({ ...prev, host: e.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Port</Label>
                              <Input
                                type="number"
                                value={configForm.port}
                                onChange={(e) =>
                                  setConfigForm((prev) => ({
                                    ...prev,
                                    port: Number(e.target.value)
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>API Key</Label>
                              <Input
                                type="password"
                                value={configForm.apiKey}
                                onChange={(e) =>
                                  setConfigForm((prev) => ({ ...prev, apiKey: e.target.value }))
                                }
                                placeholder="Leave blank to keep existing key"
                              />
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={configForm.useSsl}
                                onCheckedChange={(checked) =>
                                  setConfigForm((prev) => ({ ...prev, useSsl: checked }))
                                }
                              />
                              <Label>Use HTTPS</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={configForm.allowSelfSigned}
                                onCheckedChange={(checked) =>
                                  setConfigForm((prev) => ({ ...prev, allowSelfSigned: checked }))
                                }
                              />
                              <Label>Allow self-signed</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={configForm.enabled}
                                onCheckedChange={(checked) =>
                                  setConfigForm((prev) => ({ ...prev, enabled: checked }))
                                }
                              />
                              <Label>Enabled</Label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={resetConfigForm}>
                              Cancel
                            </Button>
                            <Button onClick={handleConfigSubmit} disabled={configLoading}>
                              Save Changes
                            </Button>
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )
            })
          )}
        </div>
        <Separator />
        <div className="space-y-3">
          {editingConfigId ? (
            <div className="flex flex-col gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
              <p>
                Editing <span className="font-medium">{editingSystem?.name || 'system'}</span>. Update the
                fields directly inside the expanded card above.
              </p>
              <div>
                <Button variant="outline" size="sm" onClick={resetConfigForm}>
                  Cancel Editing
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="text-base font-medium">Add System</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={configForm.name}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="My TrueNAS"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select
                    value={configForm.type}
                    onValueChange={(value: 'truenas' | 'unraid') =>
                      setConfigForm((prev) => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="truenas">TrueNAS</SelectItem>
                      <SelectItem value="unraid">Unraid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Host/IP</Label>
                  <Input
                    value={configForm.host}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, host: e.target.value }))}
                    placeholder="192.168.1.24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={configForm.port}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, port: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={configForm.apiKey}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Required"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={configForm.useSsl}
                    onCheckedChange={(checked) => setConfigForm((prev) => ({ ...prev, useSsl: checked }))}
                  />
                  <Label>Use HTTPS</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={configForm.allowSelfSigned}
                    onCheckedChange={(checked) =>
                      setConfigForm((prev) => ({ ...prev, allowSelfSigned: checked }))
                    }
                  />
                  <Label>Allow self-signed</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={configForm.enabled}
                    onCheckedChange={(checked) =>
                      setConfigForm((prev) => ({ ...prev, enabled: checked }))
                    }
                  />
                  <Label>Enabled</Label>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={connectionTest.status === 'testing'}
                >
                  {connectionTest.status === 'testing' ? 'Testing...' : 'Test Connection'}
                </Button>
                {connectionTest.status === 'success' && (
                  <span className="text-sm text-green-600">{connectionTest.message}</span>
                )}
                {connectionTest.status === 'error' && (
                  <span className="text-sm text-destructive">{connectionTest.message}</span>
                )}
                {connectionTest.status !== 'success' && (
                  <span className="text-xs text-muted-foreground">
                    Please test the connection before adding the system.
                  </span>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleConfigSubmit}
                  disabled={
                    configLoading ||
                    connectionTest.status === 'testing' ||
                    !addModeTestPassed
                  }
                >
                  Add System
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-lg font-medium">Dashboard Preferences</h3>
        <div className="space-y-2">
          <Label htmlFor="refresh-interval">Refresh Interval</Label>
          <Select
            value={config.refreshInterval.toString()}
            onValueChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                refreshInterval: parseInt(value)
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">1 second</SelectItem>
              <SelectItem value="5000">5 seconds</SelectItem>
              <SelectItem value="10000">10 seconds</SelectItem>
              <SelectItem value="30000">30 seconds</SelectItem>
              <SelectItem value="60000">1 minute</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="notifications"
            checked={config.notifications}
            onCheckedChange={(checked) =>
              setConfig((prev) => ({
                ...prev,
                notifications: checked
              }))
            }
          />
          <Label htmlFor="notifications">Enable notifications</Label>
        </div>
      </div>
    </div>
  )

  const allowDrag = !isMobile
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : '—'
  const appTotalsLabel =
    searchTerm.trim().length > 0
      ? `${visibleApps.length} / ${orderedApps.length} apps`
      : `${orderedApps.length} apps`
  const pickerOverrideSlug = iconPickerTarget?.slug ? iconOverrides[iconPickerTarget.slug] : null
  const pickerCatalogEntry = pickerOverrideSlug
    ? iconCatalog.find((icon) => icon.slug === pickerOverrideSlug)
    : null
  const pickerPreview =
    pickerCatalogEntry?.url ||
    iconPickerTarget?.icon ||
    iconPickerTarget?.fallbackIcon ||
    DOCKER_ICON_FALLBACK
  const nutRuntimeMinutes =
    typeof nutStatus?.runtimeSeconds === 'number'
      ? Math.max(0, Math.round(nutStatus.runtimeSeconds / 60))
      : null
  const nutCharge = typeof nutStatus?.charge === 'number' ? nutStatus.charge : null
  const nutStatusString = nutStatus?.status?.toLowerCase() || ''
  const nutOnline = !!nutStatusString && (nutStatusString.includes('ol') || nutStatusString.includes('online')) && !nutError
  const nutOnBattery = !!nutStatusString && (nutStatusString.includes('ob') || nutStatusString.includes('onbatt')) && !nutError
  const nutIndicatorClass = (() => {
    if (!nutConfigured) return 'bg-muted text-foreground'
    if (nutError) return 'bg-destructive/20 text-destructive'
    if (nutOnBattery) return 'bg-amber-100 text-amber-900'
    if (nutOnline) return 'bg-green-100 text-green-800'
    return 'bg-muted text-foreground'
  })()
  const nutIndicatorDot = (() => {
    if (!nutConfigured) return 'bg-muted-foreground/50'
    if (nutError) return 'bg-destructive'
    if (nutOnBattery) return 'bg-amber-500'
    if (nutOnline) return 'bg-green-500'
    return 'bg-muted-foreground/50'
  })()

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-[var(--page-gutter)] py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Server className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">System Dashboard</h1>
                <p className="text-sm text-muted-foreground">Manage your TrueNAS and Unraid servers</p>
              </div>
            </div>
            <div className="hidden items-center gap-4 md:flex">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                <span className="text-sm">Auto Refresh</span>
              </div>
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <Button variant="outline" size="sm" className="hidden md:inline-flex" asChild>
                  <DialogTrigger>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DialogTrigger>
                </Button>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Dashboard Settings</DialogTitle>
                    <DialogDescription>
                      Manage monitored systems and tweak dashboard preferences.
                    </DialogDescription>
                  </DialogHeader>
                  {renderSettingsContent()}
                </DialogContent>
              </Dialog>
            </div>
            <Drawer open={mobileControlsOpen} onOpenChange={setMobileControlsOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                  <SlidersHorizontal className="h-5 w-5" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="md:hidden">
                <DrawerHeader>
                  <DrawerTitle>Quick Controls</DrawerTitle>
                </DrawerHeader>
                <div className="space-y-4 px-[var(--page-gutter)] pb-6">
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Activity className="h-4 w-4" />
                      <span>Last updated</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{lastUpdatedLabel}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">UPS</span>
                      <span className="text-xs text-muted-foreground">
                        {!nutConfigured
                          ? 'Disabled'
                          : nutError
                            ? 'Error'
                            : nutOnBattery
                              ? 'On Battery'
                              : 'Online'}
                        {nutCharge !== null ? ` • ${nutCharge}%` : ''}
                        {nutRuntimeMinutes !== null ? ` • ${nutRuntimeMinutes}m` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => nutConfigured && setNutDetailsOpen(true)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1 text-xs transition',
                        nutIndicatorClass,
                        !nutConfigured && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <span className={cn('h-2.5 w-2.5 rounded-full', nutIndicatorDot)} />
                      <Battery className="h-5 w-5 text-primary" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Auto Refresh</span>
                      <span className="text-xs text-muted-foreground">Pause to save battery</span>
                    </div>
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                </div>
                <div className="rounded-lg border">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-semibold">Settings</p>
                    <p className="text-xs text-muted-foreground">Manage systems & preferences</p>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
                    {renderSettingsContent(true)}
                  </div>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>Last updated: {lastUpdatedLabel}</span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground">{appTotalsLabel}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => nutConfigured && setNutDetailsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (nutConfigured) setNutDetailsOpen(true)
                  }
                }}
                className={cn(
                  'hidden cursor-pointer items-center gap-2 rounded-full border px-2 py-1 text-xs transition sm:flex',
                  nutIndicatorClass,
                  !nutConfigured && 'pointer-events-none opacity-70'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', nutIndicatorDot)} />
                <PlugZap className="h-3.5 w-3.5" />
                <span>
                  {!nutConfigured
                    ? 'UPS Disabled'
                    : nutError
                      ? 'UPS Error'
                      : nutOnBattery
                        ? 'On Battery'
                        : 'UPS Online'}
                </span>
                {nutCharge !== null && <span className="opacity-80">{nutCharge}%</span>}
                {nutRuntimeMinutes !== null && <span className="opacity-80">{nutRuntimeMinutes}m</span>}
              </span>
            </div>
            <div className="w-full md:max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search apps or systems"
                  className="w-full pl-10"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl space-y-[var(--section-gap)] px-[var(--page-gutter)] py-6">
        {/* System Overview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Servers</h2>
            {systems.length > 0 && (
              <span className="text-xs text-muted-foreground">Click a chip to view details</span>
            )}
          </div>
          {systems.length === 0 ? (
            <Card className="w-full border-border/60 bg-muted/50">
              <CardContent className="flex flex-col gap-2 px-4 py-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No systems connected yet.</p>
                <p>Add a TrueNAS or Unraid host from the Settings dialog to start monitoring.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-[var(--panel-radius)] border border-border/60 bg-card shadow-sm">
              <div className="flex flex-wrap gap-2 px-3 py-3 text-xs sm:text-sm">
                {systems.map((system) => (
                  <button
                    key={system.name}
                    type="button"
                    onClick={() => setServerDetails(system)}
                    className={cn(
                      'flex items-center gap-3 rounded-full border px-3 py-2 transition hover:border-primary hover:text-foreground',
                      'border-border/70 bg-muted/50'
                    )}
                  >
                    <span className={`h-2 w-2 rounded-full ${getStatusColor(system.status)}`} />
                    <span className="font-semibold text-foreground">{system.name}</span>
                    <span className="text-muted-foreground">CPU {system.cpu}%</span>
                    <span className="text-muted-foreground">RAM {system.memory}%</span>
                    <span className="text-muted-foreground">Storage {system.storage}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Apps Management */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Applications</h2>
              <p className="text-sm text-muted-foreground">
                Reorder cards and manage containers from a unified view.
              </p>
            </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-3">
              <span>Card size</span>
              <Slider
                className="w-40"
                  min={220}
                  max={420}
                  step={20}
                  value={[cardMinWidth]}
                  onValueChange={handleCardWidthChange}
                />
                <span className="text-muted-foreground">{cardMinWidth}px</span>
              </div>
              {isMobile && (
                <div className="flex items-center gap-2 text-xs">
                  <GripVertical className="h-4 w-4" />
                  <span>Drag reordering is disabled on touch</span>
                </div>
              )}
            </div>
          </div>
          {orderedApps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No applications detected. Configure your systems to begin monitoring.
              </CardContent>
            </Card>
          ) : visibleApps.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {searchTerm.trim().length > 0
                  ? 'No applications match your search.'
                  : 'No applications available.'}
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={allowDrag ? sensors : []}
              onDragEnd={allowDrag ? handleDragEnd : undefined}
            >
              <SortableContext
                items={visibleApps.map((app) => app.globalId)}
                strategy={rectSortingStrategy}
              >
                <div
                  className="grid gap-[var(--card-gap)]"
                  style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(${cardMinWidth}px, 1fr))`
                  }}
                >
                  {visibleApps.map((app) => {
                    const resolved = appLinkMap[app.globalId]
                    const normalized = resolved?.url ?? normalizeAppUrl(app.url)
                    const isWeb = isLikelyWebUrl(normalized)
                    const isHidden = hiddenApps[app.globalId]
                    const openEnabled = !openDisabled[app.globalId]
                    return (
                      <SortableAppCard
                        key={app.globalId}
                        app={app}
                        minWidth={cardMinWidth}
                        onAction={(action) =>
                          handleAppAction({ id: app.systemId, type: app.systemType }, app.id, action)
                        }
                        onPickIcon={setIconPickerTarget}
                        isMobile={isMobile}
                        resolvedUrl={normalized}
                        isWeb={isWeb}
                        isHidden={!!isHidden}
                        showOpen={!!(normalized && isWeb && openEnabled)}
                        onToggleOpen={() =>
                          setOpenDisabled((prev) => {
                            const next = { ...prev, [app.globalId]: !prev[app.globalId] }
                            return next
                          })
                        }
                        onHide={() =>
                          setHiddenApps((prev) => ({
                            ...prev,
                            [app.globalId]: true
                          }))
                        }
                        onUnhide={() =>
                          setHiddenApps((prev) => {
                            const next = { ...prev }
                            delete next[app.globalId]
                            return next
                          })
                        }
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
      </div>
    </div>

      <Dialog
        open={!!iconPickerTarget}
        onOpenChange={(open) => {
          if (!open) {
            setIconPickerTarget(null)
            setIconSearch('')
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Choose an icon</DialogTitle>
            <DialogDescription>
              Select an icon from the GitHub catalog or reset to default for this container.
            </DialogDescription>
          </DialogHeader>
          {iconPickerTarget?.slug ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{iconPickerTarget.name}</p>
                  <p className="text-xs text-muted-foreground">Slug: {iconPickerTarget.slug}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border bg-white">
                      <img src={pickerPreview} alt="Selected icon preview" className="h-full w-full object-contain" />
                    </div>
                    <div className="text-xs">
                      <p className="font-medium text-foreground">
                        {pickerOverrideSlug || 'Default icon'}
                      </p>
                      <p className="text-muted-foreground">
                        {pickerOverrideSlug ? 'Selected override' : 'Using generated fallback'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search icons..."
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      className="w-64"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleIconOverrideChange(iconPickerTarget.slug, null)}
                    >
                      Use default
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto md:grid-cols-4 lg:grid-cols-5">
                {filteredIcons.map((icon) => (
                  <IconGridItem
                    key={icon.slug}
                    icon={icon}
                    selected={iconOverrides[iconPickerTarget.slug] === icon.slug}
                    onSelect={(slug) => handleIconOverrideChange(iconPickerTarget.slug, slug)}
                  />
                ))}
                {filteredIcons.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">No icons match your search.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select an application to customize its icon.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={nutDetailsOpen} onOpenChange={setNutDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>UPS Details</DialogTitle>
            <DialogDescription>Status and key metrics from the NUT server.</DialogDescription>
          </DialogHeader>
          {nutConfigured ? (
            nutStatus ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', nutIndicatorDot)} />
                  <span className="font-medium">{nutStatus.upsName || 'UPS'}</span>
                  <Badge variant="outline">
                    {nutOnBattery ? 'On Battery' : nutOnline ? 'Online' : 'Unknown'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-medium">{nutStatus.status || '—'}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Charge</p>
                    <p className="font-medium">{nutCharge !== null ? `${nutCharge}%` : '—'}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Runtime</p>
                    <p className="font-medium">
                      {nutRuntimeMinutes !== null ? `${nutRuntimeMinutes} min` : '—'}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Load</p>
                    <p className="font-medium">
                      {typeof nutStatus.load === 'number' ? `${nutStatus.load}%` : '—'}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Input Voltage</p>
                    <p className="font-medium">
                      {typeof nutStatus.inputVoltage === 'number' ? `${nutStatus.inputVoltage} V` : '—'}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Output Voltage</p>
                    <p className="font-medium">
                      {typeof nutStatus.outputVoltage === 'number' ? `${nutStatus.outputVoltage} V` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No UPS data yet. Try running Test connection from Settings.
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">UPS monitoring is disabled.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!serverDetails} onOpenChange={(open) => !open && setServerDetails(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{serverDetails?.name || 'Server Details'}</DialogTitle>
            <DialogDescription>
              {serverDetails?.type ? serverDetails.type.toUpperCase() : 'Server'} summary
            </DialogDescription>
          </DialogHeader>
          {serverDetails ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 rounded-full', getStatusColor(serverDetails.status))} />
                <span className="font-medium capitalize">{serverDetails.status}</span>
                <Badge variant="outline">{serverDetails.type}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Uptime</p>
                  <p className="font-medium">{serverDetails.uptime}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">CPU</p>
                  <p className="font-medium">{serverDetails.cpu}%</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Memory</p>
                  <p className="font-medium">{serverDetails.memory}%</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Storage</p>
                  <p className="font-medium">{serverDetails.storage}%</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Temperature</p>
                  <p className="font-medium">{serverDetails.temperature}°C</p>
                </div>
                {typeof serverDetails.gpu === 'number' && (
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">GPU</p>
                    <p className="font-medium">{serverDetails.gpu}%</p>
                  </div>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Applications</p>
                <p className="font-medium">{serverDetails.apps?.length ?? 0} detected</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a server to view details.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function IconGridItem({
  icon,
  selected,
  onSelect
}: {
  icon: { slug: string; url: string }
  selected: boolean
  onSelect: (slug: string) => void
}) {
  return (
    <button
      onClick={() => onSelect(icon.slug)}
      className={cn(
        'flex flex-col items-center gap-2 rounded-md border bg-card p-3 text-xs capitalize transition hover:border-primary',
        selected && 'border-primary ring-1 ring-primary'
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-white">
        <img src={icon.url} alt={icon.slug} className="h-full w-full object-contain" />
      </div>
      <span className="truncate w-20">{icon.slug}</span>
    </button>
  )
}

type SortableAppCardProps = {
  app: AggregatedApp
  onAction: (action: 'start' | 'stop' | 'restart') => void
  minWidth: number
  onPickIcon?: (app: AggregatedApp | null) => void
  isMobile: boolean
  resolvedUrl?: string | null
  isWeb?: boolean
  isHidden?: boolean
  showOpen?: boolean
  onToggleOpen?: () => void
  onHide?: () => void
  onUnhide?: () => void
}

function SortableAppCard({
  app,
  onAction,
  minWidth,
  onPickIcon,
  isMobile,
  resolvedUrl,
  isWeb,
  isHidden,
  showOpen = true,
  onToggleOpen,
  onHide,
  onUnhide
}: SortableAppCardProps) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: app.globalId
  })
  const meta = SYSTEM_META[app.systemType]
  const HostIcon = meta.icon
  const fallbackIcon = app.fallbackIcon || DOCKER_ICON_FALLBACK
  const normalizedUrl = resolvedUrl ?? null
  const canOpen = Boolean(normalizedUrl && isWeb)
  const effectiveMinWidth = isMobile ? Math.min(minWidth, 380) : minWidth
  const style = isMobile
    ? {}
    : {
      transform: CSS.Transform.toString(transform),
      transition
    }
  const dragAttributes = isMobile ? undefined : attributes
  const dragListeners = isMobile ? undefined : listeners

  const renderIcon = (sizeClass = 'h-10 w-10') => (
    <div className={`${sizeClass} overflow-hidden rounded-md bg-muted p-1`}>
      <img
        src={app.icon || fallbackIcon}
        alt={`${app.name} icon`}
        className="h-full w-full object-contain"
        onError={(event) => {
          const imgEl = event.currentTarget
          if (imgEl.dataset.fallbackUsed !== 'true' && fallbackIcon) {
            imgEl.dataset.fallbackUsed = 'true'
            imgEl.src = fallbackIcon
            return
          }
          imgEl.onerror = null
          imgEl.src = DOCKER_ICON_FALLBACK
        }}
      />
    </div>
  )

  if (isMobile) {
    return (
      <div ref={setNodeRef} style={{ minWidth: `${effectiveMinWidth}px` }} className="w-full">
        <Card className="border border-border/60">
          <CardContent className="flex items-start gap-3 p-3">
            {renderIcon('h-12 w-12')}
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${getStatusColor(app.status)}`} />
                    <p className="text-sm font-semibold">{app.name}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge className={cn('flex items-center gap-1', meta.badgeClass)}>
                      <HostIcon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <span className="capitalize">{app.status}</span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={!canOpen} onClick={onToggleOpen}>
                      {showOpen ? 'Disable Open button' : 'Enable Open button'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onPickIcon?.(app)}>
                      Change icon
                    </DropdownMenuItem>
                    {normalizedUrl && (
                      <DropdownMenuItem
                        onClick={() => normalizedUrl && navigator.clipboard?.writeText(normalizedUrl)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy URL
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {isHidden ? (
                      <DropdownMenuItem onClick={onUnhide}>
                        <Eye className="mr-2 h-4 w-4" />
                        Unhide card
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={onHide}>
                        <EyeOff className="mr-2 h-4 w-4" />
                        Hide card
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  Host {app.hostCpu}% CPU
                </span>
                <span className="flex items-center gap-1">
                  <MemoryStick className="h-3 w-3" />
                  Host {app.hostMemory}% RAM
                </span>
              </div>
            </div>
          </CardContent>
          <CardContent className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            {showOpen && canOpen && normalizedUrl && (
              <Button variant="default" size="sm" asChild>
                <a href={normalizedUrl} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              </Button>
            )}
            {app.status === 'running' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction('restart')}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restart
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onAction('stop')}
                  className="flex items-center gap-1"
                >
                  <PowerOff className="h-3 w-3" />
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAction('start')}
                className="flex items-center gap-1"
              >
                <Power className="h-3 w-3" />
                Start
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, minWidth: `${effectiveMinWidth}px` }}
      className={cn('w-full', isDragging && 'cursor-grabbing opacity-90 drop-shadow-lg')}
      {...dragAttributes}
      {...dragListeners}
    >
      <Card className={cn('h-full border border-border/60', isDragging && 'ring-2 ring-primary/40')}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Badge className={cn('flex items-center gap-1', meta.badgeClass)}>
              <HostIcon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <div className="flex items-center gap-1">
              {app.slug && onPickIcon && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => onPickIcon(app)}
                  title="Customize icon"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </Button>
              )}
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-base">{app.name}</CardTitle>
          <CardDescription className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${getStatusColor(app.status)}`} />
            <span className="capitalize">{app.status}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {renderIcon()}
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{app.systemName}</p>
              <div className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusColor(app.systemStatus)}`} />
                <span className="capitalize">{app.systemStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showHidden} onCheckedChange={setShowHidden} id="show-hidden" />
                <Label htmlFor="show-hidden" className="text-xs sm:text-sm">
                  Show hidden
                </Label>
              </div>
            </div>
          </div>
          {(hasCpu || hasMemory) ? (
            <div className="grid grid-cols-2 gap-3">
              {hasCpu && (
                <div>
                  <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                    <span>CPU</span>
                    <span>{app.cpu}%</span>
                  </div>
                  <Progress value={Math.min(Math.max(app.cpu ?? 0, 0), 100)} className="h-2" />
                </div>
              )}
              {hasMemory && (
                <div>
                  <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                    <span>Memory</span>
                    <span>{app.memory}%</span>
                  </div>
                  <Progress value={Math.min(Math.max(app.memory ?? 0, 0), 100)} className="h-2" />
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Container metrics not available from this system.
            </p>
          )}
          {canOpen && normalizedUrl && (
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-muted-foreground underline underline-offset-2"
            >
              {normalizedUrl.replace(/\/$/, '')}
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            {canOpen && normalizedUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={normalizedUrl} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              </Button>
            )}
            {app.status === 'running' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction('restart')}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restart
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onAction('stop')}
                  className="flex items-center gap-1"
                >
                  <PowerOff className="h-3 w-3" />
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={() => onAction('start')}
                className="flex items-center gap-1"
              >
                <Power className="h-3 w-3" />
                Start
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
