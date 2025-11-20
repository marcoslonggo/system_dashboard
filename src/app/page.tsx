'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Container,
  Network,
  AlertTriangle,
  CheckCircle,
  Clock,
  Thermometer,
  Droplets
} from 'lucide-react'

interface SystemInfo {
  name: string
  type: 'truenas' | 'unraid'
  status: 'online' | 'offline' | 'warning'
  uptime: string
  cpu: number
  memory: number
  storage: number
  temperature: number
  apps: App[]
}

interface App {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  cpu: number
  memory: number
  icon?: string
  url?: string
}

interface SystemConfig {
  truenas: {
    host: string
    apiKey: string
    port: number
    enabled: boolean
  }
  unraid: {
    host: string
    apiKey: string
    port: number
    enabled: boolean
  }
  refreshInterval: number
  notifications: boolean
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
      apps: [
        { id: '5', name: 'AdGuard Home', status: 'running', cpu: 2, memory: 256, url: 'http://192.168.1.200:80' },
        { id: '6', name: 'Pi-hole', status: 'running', cpu: 1, memory: 128, url: 'http://192.168.1.200:80/admin' },
        { id: '7', name: 'Portainer', status: 'running', cpu: 5, memory: 512, url: 'http://192.168.1.200:9000' },
        { id: '8', name: 'Watchtower', status: 'error', cpu: 0, memory: 0 },
      ]
    }
  ])

  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedSystem, setSelectedSystem] = useState<string>('all')
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [config, setConfig] = useState<SystemConfig>({
    truenas: {
      host: '192.168.1.100',
      apiKey: '',
      port: 443,
      enabled: true
    },
    unraid: {
      host: '192.168.1.200',
      apiKey: '',
      port: 80,
      enabled: true
    },
    refreshInterval: 5000,
    notifications: true
  })

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

  const handleAppAction = async (systemId: string, appId: string, action: 'start' | 'stop' | 'restart') => {
    try {
      const response = await fetch('/api/apps/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemId, appId, action })
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

  const filteredSystems = selectedSystem === 'all' 
    ? systems 
    : systems.filter(s => s.type === selectedSystem)

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
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Dashboard Settings</DialogTitle>
                    <DialogDescription>
                      Configure your system connections and dashboard preferences.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Configuration Status */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Configuration Status</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">TrueNAS</span>
                            <Badge variant={config.truenas.apiKey ? "default" : "destructive"}>
                              {config.truenas.apiKey ? "Configured" : "Not Configured"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {config.truenas.apiKey ? 
                              `Connected to ${config.truenas.host}:${config.truenas.port}` : 
                              "API key required for real data"
                            }
                          </p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Unraid</span>
                            <Badge variant={config.unraid.apiKey ? "default" : "destructive"}>
                              {config.unraid.apiKey ? "Configured" : "Not Configured"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {config.unraid.apiKey ? 
                              `Connected to ${config.unraid.host}:${config.unraid.port}` : 
                              "API key required for real data"
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    <Separator />
                    {/* TrueNAS Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">TrueNAS Configuration</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="truenas-host">Host/IP Address</Label>
                          <Input
                            id="truenas-host"
                            value={config.truenas.host}
                            onChange={(e) => setConfig(prev => ({
                              ...prev,
                              truenas: { ...prev.truenas, host: e.target.value }
                            }))}
                            placeholder="192.168.1.100"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="truenas-port">Port</Label>
                          <Input
                            id="truenas-port"
                            type="number"
                            value={config.truenas.port}
                            onChange={(e) => setConfig(prev => ({
                              ...prev,
                              truenas: { ...prev.truenas, port: parseInt(e.target.value) }
                            }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="truenas-key">API Key</Label>
                        <Input
                          id="truenas-key"
                          type="password"
                          value={config.truenas.apiKey}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            truenas: { ...prev.truenas, apiKey: e.target.value }
                          }))}
                          placeholder="Enter your TrueNAS API key"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="truenas-enabled"
                          checked={config.truenas.enabled}
                          onCheckedChange={(checked) => setConfig(prev => ({
                            ...prev,
                            truenas: { ...prev.truenas, enabled: checked }
                          }))}
                        />
                        <Label htmlFor="truenas-enabled">Enable TrueNAS monitoring</Label>
                      </div>
                    </div>

                    <Separator />

                    {/* Unraid Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Unraid Configuration</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="unraid-host">Host/IP Address</Label>
                          <Input
                            id="unraid-host"
                            value={config.unraid.host}
                            onChange={(e) => setConfig(prev => ({
                              ...prev,
                              unraid: { ...prev.unraid, host: e.target.value }
                            }))}
                            placeholder="192.168.1.200"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="unraid-port">Port</Label>
                          <Input
                            id="unraid-port"
                            type="number"
                            value={config.unraid.port}
                            onChange={(e) => setConfig(prev => ({
                              ...prev,
                              unraid: { ...prev.unraid, port: parseInt(e.target.value) }
                            }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unraid-key">API Key</Label>
                        <Input
                          id="unraid-key"
                          type="password"
                          value={config.unraid.apiKey}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            unraid: { ...prev.unraid, apiKey: e.target.value }
                          }))}
                          placeholder="Enter your Unraid API key"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="unraid-enabled"
                          checked={config.unraid.enabled}
                          onCheckedChange={(checked) => setConfig(prev => ({
                            ...prev,
                            unraid: { ...prev.unraid, enabled: checked }
                          }))}
                        />
                        <Label htmlFor="unraid-enabled">Enable Unraid monitoring</Label>
                      </div>
                    </div>

                    <Separator />

                    {/* Dashboard Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Dashboard Preferences</h3>
                      <div className="space-y-2">
                        <Label htmlFor="refresh-interval">Refresh Interval</Label>
                        <Select
                          value={config.refreshInterval.toString()}
                          onValueChange={(value) => setConfig(prev => ({
                            ...prev,
                            refreshInterval: parseInt(value)
                          }))}
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
                          onCheckedChange={(checked) => setConfig(prev => ({
                            ...prev,
                            notifications: checked
                          }))}
                        />
                        <Label htmlFor="notifications">Enable notifications</Label>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => {
                        // Save settings logic here
                        console.log('Saving config:', config)
                        setSettingsOpen(false)
                      }}>
                        Save Settings
                      </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {systems.map((system) => (
            <Card key={system.name} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{system.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(system.status)}`} />
                    {getStatusBadge(system.status, system.uptime)}
                  </div>
                </div>
                <CardDescription className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {system.uptime}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    <span>CPU</span>
                  </div>
                  <span className="font-medium">{system.cpu}%</span>
                </div>
                <Progress value={system.cpu} className="h-2" />
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <MemoryStick className="h-4 w-4" />
                    <span>Memory</span>
                  </div>
                  <span className="font-medium">{system.memory}%</span>
                </div>
                <Progress value={system.memory} className="h-2" />
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    <span>Storage</span>
                  </div>
                  <span className="font-medium">{system.storage}%</span>
                </div>
                <Progress value={system.storage} className="h-2" />
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4" />
                    <span>Temperature</span>
                  </div>
                  <span className="font-medium">{system.temperature}°C</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Apps Management */}
        <Tabs defaultValue="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">All Apps</TabsTrigger>
              <TabsTrigger value="truenas">TrueNAS</TabsTrigger>
              <TabsTrigger value="unraid">Unraid</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          </div>

          <TabsContent value="all" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredSystems.map((system) => (
                <Card key={system.name}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Container className="h-5 w-5" />
                      {system.name} Applications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {system.apps.map((app) => (
                        <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(app.status)}`} />
                            <div>
                              <p className="font-medium">{app.name}</p>
                              <p className="text-sm text-muted-foreground">
                                CPU: {app.cpu}% | Memory: {app.memory > 0 ? `${app.memory}MB` : 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {app.url && (
                              <Button variant="outline" size="sm" asChild>
                                <a href={app.url} target="_blank" rel="noopener noreferrer">
                                  Open
                                </a>
                              </Button>
                            )}
                            <div className="flex gap-1">
                              {app.status === 'running' ? (
                                <>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleAppAction(system.name, app.id, 'restart')}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => handleAppAction(system.name, app.id, 'stop')}
                                  >
                                    <PowerOff className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  onClick={() => handleAppAction(system.name, app.id, 'start')}
                                >
                                  <Power className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="truenas">
            <Card>
              <CardHeader>
                <CardTitle>TrueNAS Applications</CardTitle>
                <CardDescription>Manage your TrueNAS apps and services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {systems.find(s => s.type === 'truenas')?.apps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(app.status)}`} />
                        <div>
                          <p className="font-medium">{app.name}</p>
                          <p className="text-sm text-muted-foreground">
                            CPU: {app.cpu}% | Memory: {app.memory > 0 ? `${app.memory}MB` : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {app.url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={app.url} target="_blank" rel="noopener noreferrer">
                              Open
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unraid">
            <Card>
              <CardHeader>
                <CardTitle>Unraid Applications</CardTitle>
                <CardDescription>Manage your Unraid Docker containers and VMs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {systems.find(s => s.type === 'unraid')?.apps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(app.status)}`} />
                        <div>
                          <p className="font-medium">{app.name}</p>
                          <p className="text-sm text-muted-foreground">
                            CPU: {app.cpu}% | Memory: {app.memory > 0 ? `${app.memory}MB` : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {app.url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={app.url} target="_blank" rel="noopener noreferrer">
                              Open
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}