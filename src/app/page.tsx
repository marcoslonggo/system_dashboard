'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
import { cn } from '@/lib/utils'
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
  ChevronDown
} from 'lucide-react'

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
}

interface AggregatedApp extends App {
  globalId: string
  systemId?: string
  systemName: string
  systemType: 'truenas' | 'unraid'
  systemStatus: SystemInfo['status']
  hostCpu: number
  hostMemory: number
}

interface DashboardPreferences {
  refreshInterval: number
  notifications: boolean
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

const deriveAppIcon = (provided?: string, name?: string) => {
  if (provided && provided.length > 0) {
    return provided
  }
  if (!name) {
    return DOCKER_ICON_FALLBACK
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) {
    return DOCKER_ICON_FALLBACK
  }
  return `https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg/${slug}.svg`
}

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

export default function Dashboard() {
  const [systems, setSystems] = useState<SystemInfo[]>([
    {
      name: 'TrueNAS Server',
      type: 'truenas',
      status: 'online',
      uptime: '15 days, 7 hours',
      cpu: 25,
      memory: 60,
      storage: 45,
      temperature: 42,
      gpu: null,
      apps: [
        { id: '1', name: 'Plex Media Server', status: 'running', cpu: 15, memory: 2048, url: 'http://192.168.1.100:32400' },
        { id: '2', name: 'Home Assistant', status: 'running', cpu: 8, memory: 512, url: 'http://192.168.1.100:8123' },
        { id: '3', name: 'Nextcloud', status: 'stopped', cpu: 0, memory: 0, url: 'http://192.168.1.100:443' },
        { id: '4', name: 'Jellyfin', status: 'running', cpu: 12, memory: 1024, url: 'http://192.168.1.100:8096' },
      ]
    },
    {
      name: 'Unraid Server',
      type: 'unraid',
      status: 'online',
      uptime: '32 days, 14 hours',
      cpu: 40,
      memory: 75,
      storage: 68,
      temperature: 38,
      gpu: null,
      apps: [
        { id: '5', name: 'AdGuard Home', status: 'running', cpu: 2, memory: 256, url: 'http://192.168.1.200:80' },
        { id: '6', name: 'Pi-hole', status: 'running', cpu: 1, memory: 128, url: 'http://192.168.1.200:80/admin' },
        { id: '7', name: 'Portainer', status: 'running', cpu: 5, memory: 512, url: 'http://192.168.1.200:9000' },
        { id: '8', name: 'Watchtower', status: 'error', cpu: 0, memory: 0 },
      ]
    }
  ])

  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [systemDetailsOpen, setSystemDetailsOpen] = useState<Record<string, boolean>>({})
  const [cardMinWidth, setCardMinWidth] = useState(DEFAULT_CARD_WIDTH)
  const [appOrder, setAppOrder] = useState<string[]>([])
  const [config, setConfig] = useState<DashboardPreferences>({
    refreshInterval: 5000,
    notifications: true
  })
  const [systemConfigs, setSystemConfigs] = useState<StoredSystemConfig[]>([])
  const [configForm, setConfigForm] = useState<SystemConfigForm>(emptyConfigForm)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
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

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/systems')
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setSystems(data.data)
            setLastUpdated(new Date())
          }
        }
      } catch (error) {
        console.error('Failed to refresh data:', error)
      }
    }, config.refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, config.refreshInterval])

  // Initial data fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const response = await fetch('/api/systems')
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setSystems(data.data)
            setLastUpdated(new Date())
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error)
      }
    }

    fetchInitialData()
  }, [])

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        setConfigLoading(true)
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
        setConfigLoading(false)
      }
    }
    loadConfigs()
  }, [])

  const appsWithMeta = useMemo<AggregatedApp[]>(() => {
    return systems.flatMap((system) =>
      system.apps.map((app) => ({
        ...app,
        icon: deriveAppIcon(app.icon, app.name),
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

  const handleSystemToggle = useCallback((name: string, open: boolean) => {
    setSystemDetailsOpen((prev) => ({
      ...prev,
      [name]: open
    }))
  }, [])

  const resetConfigForm = () => {
    setConfigForm(emptyConfigForm)
    setEditingConfigId(null)
    setConfigError(null)
  }

  const refreshSystemConfigs = async () => {
    const response = await fetch('/api/system-configs')
    if (response.ok) {
      const json = await response.json()
      setSystemConfigs(json.data || [])
    }
  }

  const handleConfigSubmit = async () => {
    try {
      setConfigLoading(true)
      setConfigError(null)
      const payload: any = {
        name: configForm.name,
        host: configForm.host,
        port: configForm.port,
        type: configForm.type,
        useSsl: configForm.useSsl,
        allowSelfSigned: configForm.allowSelfSigned,
        enabled: configForm.enabled
      }
      if (configForm.apiKey) {
        payload.apiKey = configForm.apiKey
      }
      if (!configForm.apiKey && !editingConfigId) {
        setConfigError('API key is required for new systems.')
        setConfigLoading(false)
        return
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
    } catch (err) {
      console.error(err)
      setConfigError('Failed to update system')
    }
  }

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
        setSystems(prev => prev.map(system => {
          if (system.name === systemId) {
            return {
              ...system,
              apps: system.apps.map(app => {
                if (app.id === appId) {
                  const newStatus = action === 'stop' ? 'stopped' : 'running'
                  return { ...app, status: newStatus as any }
                }
                return app
              })
            }
          }
          return system
        }))
      } else {
        // Show error message
        alert(`Error: ${data.error || 'Failed to perform action'}`)
      }
    } catch (error) {
      console.error('Failed to perform app action:', error)
      alert('Network error: Failed to perform action')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">System Dashboard</h1>
                <p className="text-sm text-muted-foreground">Manage your TrueNAS and Unraid servers</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                <span className="text-sm">Auto Refresh</span>
              </div>
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <Button variant="outline" size="sm" asChild>
                  <DialogTrigger>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DialogTrigger>
                </Button>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Dashboard Settings</DialogTitle>
                  <DialogDescription>
                    Manage monitored systems and tweak dashboard preferences.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
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
                    <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
                      {configLoading ? (
                        <p className="text-sm text-muted-foreground">Loading systems...</p>
                      ) : systemConfigs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No systems configured yet.</p>
                      ) : (
                        systemConfigs.map((system) => (
                          <Card key={system.id}>
                            <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-medium">{system.name}</p>
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
                                <Button variant="outline" size="sm" onClick={() => handleEditConfig(system)}>
                                  Edit
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteConfig(system.id)}>
                                  Delete
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-base font-medium">
                        {editingConfigId ? 'Edit System' : 'Add System'}
                      </h4>
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
                            placeholder={editingConfigId ? 'Leave blank to keep existing key' : 'Required'}
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
                            onCheckedChange={(checked) => setConfigForm((prev) => ({ ...prev, enabled: checked }))}
                          />
                          <Label>Enabled</Label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        {editingConfigId && (
                          <Button variant="outline" onClick={resetConfigForm}>
                            Cancel
                          </Button>
                        )}
                        <Button onClick={handleConfigSubmit} disabled={configLoading}>
                          {editingConfigId ? 'Save Changes' : 'Add System'}
                        </Button>
                      </div>
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
              </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* System Overview */}
        <div className="mb-6 flex flex-col gap-2 md:flex-row">
          {systems.map((system) => (
            <Card key={system.name} className="flex-1 border-border/60 bg-muted/40">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs sm:text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${getStatusColor(system.status)}`} />
                  <span className="font-semibold text-foreground">{system.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>{system.uptime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span>{system.cpu}% CPU</span>
                </div>
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-primary" />
                  <span>{system.memory}% RAM</span>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span>{system.storage}% Storage</span>
                </div>
                <div className="flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-primary" />
                  <span>{system.temperature}°C</span>
                </div>
                {typeof system.gpu === 'number' && (
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <span>{system.gpu}% GPU</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
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
            <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
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
            </div>
          </div>
          {orderedApps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No applications detected. Configure your systems to begin monitoring.
              </CardContent>
            </Card>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={orderedApps.map((app) => app.globalId)}
                strategy={rectSortingStrategy}
              >
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(${cardMinWidth}px, 1fr))`
                  }}
                >
                  {orderedApps.map((app) => (
                    <SortableAppCard
                      key={app.globalId}
                      app={app}
                      minWidth={cardMinWidth}
                      onAction={(action) =>
                        handleAppAction({ id: app.systemId, type: app.systemType }, app.id, action)
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  )
}

type SortableAppCardProps = {
  app: AggregatedApp
  onAction: (action: 'start' | 'stop' | 'restart') => void
  minWidth: number
}

function SortableAppCard({ app, onAction, minWidth }: SortableAppCardProps) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: app.globalId
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }
  const meta = SYSTEM_META[app.systemType]
  const HostIcon = meta.icon
  const hasCpu = typeof app.cpu === 'number'
  const hasMemory = typeof app.memory === 'number'

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, minWidth: `${minWidth}px` }}
      className={cn('w-full', isDragging && 'cursor-grabbing opacity-90 drop-shadow-lg')}
      {...attributes}
      {...listeners}
    >
      <Card className={cn('h-full border border-border/60', isDragging && 'ring-2 ring-primary/40')}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Badge className={cn('flex items-center gap-1', meta.badgeClass)}>
              <HostIcon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">{app.name}</CardTitle>
          <CardDescription className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${getStatusColor(app.status)}`} />
            <span className="capitalize">{app.status}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-md bg-muted p-1">
                <img
                  src={app.icon || DOCKER_ICON_FALLBACK}
                  alt={`${app.name} icon`}
                  className="h-full w-full object-contain"
                  onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = DOCKER_ICON_FALLBACK
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{app.systemName}</p>
                <div className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusColor(app.systemStatus)}`} />
                  <span className="capitalize">{app.systemStatus}</span>
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
          {app.url && (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-muted-foreground underline underline-offset-2"
            >
              {app.url}
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            {app.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={app.url} target="_blank" rel="noopener noreferrer">
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
