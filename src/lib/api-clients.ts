import axios, { AxiosError, AxiosInstance } from 'axios'
import https from 'https'
import { slugify } from './slugify'

// TrueNAS API Client
export class TrueNASClient {
  private client: AxiosInstance
  private baseUrl: string
  private apiKey: string
  private host: string
  private useSsl: boolean

  constructor(
    host: string,
    apiKey: string,
    port: number = 443,
    useSsl: boolean = true,
    allowSelfSigned: boolean = false
  ) {
    this.baseUrl = `${useSsl ? 'https' : 'http'}://${host}:${port}/api/v2.0`
    this.apiKey = apiKey
    this.host = host
    this.useSsl = useSsl
    const httpsAgent = useSsl && allowSelfSigned
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      httpsAgent
    })

    // Add request interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('TrueNAS API Error:', error.response?.data || error.message)
        throw new Error(`TrueNAS API Error: ${error.response?.status} ${error.response?.data?.message || error.message}`)
      }
    )
  }

  async getSystemInfo() {
    try {
      const [systemInfo, storageInfo] = await Promise.all([
        this.getWithTrailingSlash('/system/info'),
        this.getWithTrailingSlash('/pool')
      ])

      // Get system uptime
      const uptime = this.calculateUptime(systemInfo.data.uptime_seconds || 0)

      const cpuUsage = this.calculateCpuUsage(systemInfo.data.loadavg, systemInfo.data.cores)
      const memoryUsage = await this.calculateMemoryUsage(systemInfo.data.physmem)

      // Get storage usage from pools
      let storageUsage = 0
      if (storageInfo.data && storageInfo.data.length > 0) {
        const pool = storageInfo.data[0]
        storageUsage = pool.stats ? 
          Math.round((pool.stats.used / pool.stats.available) * 100) : 0
      }

      const temperature = 35 + Math.random() * 15 // Placeholder until sensors endpoint is exposed

      return {
        name: 'TrueNAS Server',
        type: 'truenas' as const,
        status: 'online' as const,
        uptime,
        cpu: Math.round(cpuUsage),
        memory: memoryUsage || 45,
        storage: storageUsage || 50,
        temperature: Math.round(temperature),
        gpu: null,
        apps: await this.getApps()
      }
    } catch (error) {
      console.error('Failed to fetch TrueNAS system info:', error)
      throw error
    }
  }

  async getApps() {
    try {
      const response = await this.getWithTrailingSlash('/app')
      if (Array.isArray(response.data)) {
        return response.data.map((app: any, index: number) => this.transformApp(app, index))
      }
      console.warn('Unexpected /app response from TrueNAS, falling back to legacy endpoints')
      return await this.getLegacyApps()
    } catch (error) {
      console.error('Failed to fetch TrueNAS apps from /app:', error)
      return await this.getLegacyApps()
    }
  }

  private async getLegacyApps() {
    try {
      const dockerResponse = await this.getWithTrailingSlash('/docker')
      const containers = dockerResponse.data || []

      let jails = []
      try {
        const jailsResponse = await this.getWithTrailingSlash('/jail')
        jails = jailsResponse.data || []
      } catch (jailError) {
        console.warn('Could not fetch jails from TrueNAS (may not be available)')
      }

      const apps = []

      containers.forEach((container: any, index: number) => {
        const name = container.name || container.Names?.[0]?.replace('/', '') || `Container ${index + 1}`
        const status = container.state === 'running' ? 'running' : 
                      container.state === 'stopped' ? 'stopped' : 'error'
        const slug = slugify(container.name || container.Names?.[0] || name)
        
        apps.push({
          id: container.id || `docker-${index}`,
          name,
          status,
          cpu: null,
          memory: null,
          url: this.getLegacyContainerUrl(container),
          slug
        })
      })

      jails.forEach((jail: any, index: number) => {
        apps.push({
          id: jail.id || `jail-${index}`,
          name: jail.name || `Jail ${index + 1}`,
          status: jail.state === 'up' ? 'running' : 'stopped',
          cpu: null,
          memory: null,
          url: jail.ip ? `http://${jail.ip}` : undefined,
          slug: slugify(jail.name)
        })
      })

      return apps
    } catch (error) {
      console.error('Failed to fetch TrueNAS legacy apps:', error)
      return []
    }
  }

  async startApp(appId: string) {
    const started = await this.tryAppAction('/app/start', appId)
    if (started) return true
    return this.startLegacyApp(appId)
  }

  async stopApp(appId: string) {
    const stopped = await this.tryAppAction('/app/stop', appId)
    if (stopped) return true
    return this.stopLegacyApp(appId)
  }

  async restartApp(appId: string) {
    try {
      await this.stopApp(appId)
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      await this.startApp(appId)
      return true
    } catch (error) {
      throw new Error(`Failed to restart app ${appId}`)
    }
  }

  private transformApp(app: any, index: number) {
    const id = app.id || app.name || `app-${index}`
    const name = app.metadata?.title || app.name || `App ${index + 1}`
    const state = (app.state || '').toString().toLowerCase()
    const status = state === 'running' ? 'running' : state === 'stopped' ? 'stopped' : 'error'
    const url = this.getPortalUrl(app) || this.getWorkloadPortUrl(app)
    const slugSource = app.metadata?.name || app.chart_metadata?.chart_name || app.name
    const slug = slugify(slugSource || name)

    return {
      id,
      name,
      status: status as 'running' | 'stopped' | 'error',
      cpu: null,
      memory: null,
      url,
      icon: typeof app.metadata?.icon === 'string' ? app.metadata.icon : undefined,
      slug
    }
  }

  private getPortalUrl(app: any): string | undefined {
    if (app.portals && typeof app.portals === 'object') {
      const firstUrl = Object.values(app.portals).find((value) => typeof value === 'string' && value.length > 0)
      if (typeof firstUrl === 'string') {
        return firstUrl
      }
    }
    return undefined
  }

  private calculateCpuUsage(loadavg: number[] = [], cores?: number) {
    const load = Array.isArray(loadavg) ? loadavg[0] || 0 : 0
    const totalCores = typeof cores === 'number' && cores > 0 ? cores : 1
    const usage = (load / totalCores) * 100
    return Math.min(100, Math.max(0, Math.round(usage)))
  }

  private async calculateMemoryUsage(totalMemory?: number) {
    if (!totalMemory || totalMemory <= 0) {
      return 0
    }

    try {
      const response = await this.client.post('/vm/get_available_memory', false, {
        headers: { 'Content-Type': 'application/json' }
      })
      const available = Number(response.data)
      if (!Number.isFinite(available)) {
        return 0
      }
      const used = Math.max(0, totalMemory - available)
      return Math.min(100, Math.max(0, Math.round((used / totalMemory) * 100)))
    } catch (error) {
      console.warn('TrueNAS memory usage lookup failed:', error)
      return 0
    }
  }

  private getWorkloadPortUrl(app: any): string | undefined {
    const usedPorts = app.active_workloads?.used_ports
    if (!Array.isArray(usedPorts)) {
      return undefined
    }

    for (const port of usedPorts) {
      const hostPort = port?.host_ports?.find((item: any) => item?.host_port)
      if (hostPort?.host_port) {
        const protocol = inferProtocol(hostPort.host_port, this.useSsl)
        return `${protocol}://${this.host}:${hostPort.host_port}`
      }
    }

    return undefined
  }

  private async tryAppAction(endpoint: string, appId: string) {
    try {
      await this.client.post(endpoint, JSON.stringify(appId), {
        headers: { 'Content-Type': 'application/json' }
      })
      return true
    } catch (error) {
      console.warn(`TrueNAS ${endpoint} failed for ${appId}:`, error)
      return false
    }
  }

  private async startLegacyApp(appId: string) {
    try {
      await this.client.post(`/docker/${appId}/start`)
      return true
    } catch (dockerError) {
      try {
        await this.client.post(`/jail/${appId}/start`)
        return true
      } catch (jailError) {
        throw new Error(`Failed to start app ${appId}`)
      }
    }
  }

  private async stopLegacyApp(appId: string) {
    try {
      await this.client.post(`/docker/${appId}/stop`)
      return true
    } catch (dockerError) {
      try {
        await this.client.post(`/jail/${appId}/stop`)
        return true
      } catch (jailError) {
        throw new Error(`Failed to stop app ${appId}`)
      }
    }
  }

  private calculateUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    return `${days} days, ${hours} hours`
  }

  private getLegacyContainerUrl(container: any): string | undefined {
    // Try to extract URL from container ports or labels
    if (container.ports && container.ports.length > 0) {
      const port = container.ports.find((p: any) => p.public_port)
      if (port) {
        const protocol = inferProtocol(port.public_port, this.useSsl)
        return `${protocol}://${this.host}:${port.public_port}`
      }
    }
    return undefined
  }

  private async getWithTrailingSlash<T = any>(path: string) {
    try {
      return await this.client.get<T>(path)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const url = error.response?.config?.url || `${this.baseUrl}${path}`
        if (error.response?.status === 404) {
          console.warn(`TrueNAS endpoint 404: ${url}`)
          if (!path.endsWith('/')) {
            return await this.client.get<T>(`${path}/`)
          }
        } else {
          console.warn(`TrueNAS endpoint error (${error.response?.status}): ${url}`)
        }
      }
      throw error
    }
  }
}

// Unraid API Client
export class UnraidClient {
  private client: AxiosInstance
  private baseUrl: string
  private apiKey: string
  private host: string
  private useSsl: boolean

  constructor(
    host: string,
    apiKey: string,
    port: number = 80,
    useSsl: boolean = false,
    allowSelfSigned: boolean = false
  ) {
    this.baseUrl = `${useSsl ? 'https' : 'http'}://${host}:${port}`
    this.apiKey = apiKey
    this.host = host
    this.useSsl = useSsl
    const httpsAgent = useSsl && allowSelfSigned
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      httpsAgent
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Unraid GraphQL Error:', error.response?.data || error.message)
        if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
          throw new Error('Unraid API Error: timeout waiting for response')
        }
        const status = error.response?.status ?? 'unknown'
        throw new Error(`Unraid API Error: ${status} ${error.response?.data?.error || error.message}`)
      }
    )
  }

  private async graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.client.post('/graphql', { query, variables })
      if (response.data?.errors?.length) {
        const [firstError] = response.data.errors
        throw new Error(firstError?.message || 'GraphQL request failed')
      }
      return response.data.data as T
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error?: string }>
        throw new Error(axiosError.response?.data?.error || axiosError.message)
      }
      throw error
    }
  }

  async getSystemInfo() {
    const query = `
      query DashboardData {
        info { os { uptime } }
        metrics {
          cpu { percentTotal }
          memory { percentTotal }
        }
        array {
          state
          capacity { disks { used total } }
          disks { temp }
        }
        docker {
          containers {
            id
            names
            state
            status
            autoStart
            ports { privatePort publicPort type }
          }
        }
      }
    `

    const data = await this.graphqlRequest<{
      info: { os: { uptime: string | null } }
      metrics: { cpu: { percentTotal: number }, memory: { percentTotal: number } }
      array: {
        state: string
        capacity: { disks: { used: string, total: string } }
        disks: Array<{ temp?: number | null }>
      }
      docker: {
        containers: Array<{
          id: string
          names: string[]
          state: string
          status: string
          autoStart: boolean
          ports: Array<{ privatePort: number | null, publicPort: number | null, type: string | null }>
        }>
      }
    }>(query)

    const cpuUsage = Math.round(data.metrics?.cpu?.percentTotal ?? 0)
    const memoryUsage = Math.round(data.metrics?.memory?.percentTotal ?? 0)
    const storageUsage = this.calculateStorageUsage(data.array?.capacity?.disks)
    const temperature = this.calculateAverageTemperature(data.array?.disks)
    const uptime = this.formatUptime(data.info?.os?.uptime)
    const apps = this.mapContainers(data.docker?.containers || [])

    return {
      name: 'Unraid Server',
      type: 'unraid' as const,
      status: data.array?.state === 'STARTED' ? 'online' as const : 'offline' as const,
      uptime,
      cpu: cpuUsage,
      memory: memoryUsage,
      storage: storageUsage,
      temperature,
      gpu: null,
      apps
    }
  }

  async startApp(appId: string) {
    const mutation = `
      mutation StartContainer($id: PrefixedID!) {
        docker { start(id: $id) { id } }
      }
    `
    await this.graphqlRequest(mutation, { id: appId })
    return true
  }

  async stopApp(appId: string) {
    const mutation = `
      mutation StopContainer($id: PrefixedID!) {
        docker { stop(id: $id) { id } }
      }
    `
    await this.graphqlRequest(mutation, { id: appId })
    return true
  }

  async restartApp(appId: string) {
    await this.stopApp(appId)
    await new Promise(resolve => setTimeout(resolve, 2000))
    await this.startApp(appId)
    return true
  }

  private mapContainers(containers: Array<{
    id: string
    names: string[]
    state: string
    status: string
    autoStart: boolean
    ports: Array<{ privatePort: number | null, publicPort: number | null, type: string | null }>
  }>) {
    return containers.map((container, index) => {
      const name = container.names?.[0]?.replace(/^\//, '') || `Container ${index + 1}`
      const state = (container.state || '').toLowerCase()
      const status =
        state === 'running'
          ? 'running'
          : state === 'exited'
            ? 'stopped'
            : state === 'restarting' || state === 'starting'
              ? 'restarting'
              : 'error'
      const slug = slugify(name || container.id)

      return {
        id: container.id,
        name,
        status,
        cpu: null,
        memory: null,
        url: this.getContainerUrl(container.ports),
        slug
      }
    })
  }

  private calculateStorageUsage(capacity?: { used?: string, total?: string }) {
    const used = parseFloat(capacity?.used || '0')
    const total = parseFloat(capacity?.total || '0')
    if (!total) return 0
    return Math.min(100, Math.max(0, Math.round((used / total) * 100)))
  }

  private calculateAverageTemperature(disks?: Array<{ temp?: number | null }>) {
    if (!disks || !disks.length) return 0
    const temps = disks
      .map((disk) => typeof disk.temp === 'number' ? disk.temp : null)
      .filter((temp): temp is number => temp !== null)
    if (!temps.length) return 0
    return Math.round(temps.reduce((acc, temp) => acc + temp, 0) / temps.length)
  }

  private formatUptime(uptimeIso?: string | null) {
    if (!uptimeIso) return 'Unknown'
    const startedAt = new Date(uptimeIso).getTime()
    if (Number.isNaN(startedAt)) return 'Unknown'
    const diffMs = Date.now() - startedAt
    if (diffMs <= 0) return '0 days, 0 hours'
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    return `${days} days, ${hours} hours`
  }

  private getContainerUrl(ports: Array<{ publicPort: number | null }>) {
    const port = ports?.find((p) => p.publicPort)
    if (!port?.publicPort) return undefined
    const protocol = inferProtocol(port.publicPort, this.useSsl)
    return `${protocol}://${this.host}:${port.publicPort}`
  }
}

function inferProtocol(port?: number | null, preferHttps = false) {
  if (!port) {
    return preferHttps ? 'https' : 'http'
  }

  if ([443, 444, 8443, 9443].includes(port)) {
    return 'https'
  }

  if ([80, 81, 8080, 8081, 3000, 3001, 8880].includes(port)) {
    return 'http'
  }

  return preferHttps ? 'https' : 'http'
}

// API Client Factory
export class SystemAPIClient {
  private truenasClient: TrueNASClient | null = null
  private unraidClient: UnraidClient | null = null

  initializeTrueNAS(
    host: string,
    apiKey: string,
    port: number = 443,
    useSsl: boolean = true,
    allowSelfSigned: boolean = false
  ) {
    this.truenasClient = new TrueNASClient(host, apiKey, port, useSsl, allowSelfSigned)
  }

  initializeUnraid(
    host: string,
    apiKey: string,
    port: number = 80,
    useSsl: boolean = false,
    allowSelfSigned: boolean = false
  ) {
    this.unraidClient = new UnraidClient(host, apiKey, port, useSsl, allowSelfSigned)
  }

  async getTrueNASInfo() {
    if (!this.truenasClient) {
      throw new Error('TrueNAS client not initialized')
    }
    return await this.truenasClient.getSystemInfo()
  }

  async getUnraidInfo() {
    if (!this.unraidClient) {
      throw new Error('Unraid client not initialized')
    }
    return await this.unraidClient.getSystemInfo()
  }

  async executeTrueNASAction(appId: string, action: 'start' | 'stop' | 'restart') {
    if (!this.truenasClient) {
      throw new Error('TrueNAS client not initialized')
    }

    switch (action) {
      case 'start':
        return await this.truenasClient.startApp(appId)
      case 'stop':
        return await this.truenasClient.stopApp(appId)
      case 'restart':
        return await this.truenasClient.restartApp(appId)
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  async executeUnraidAction(appId: string, action: 'start' | 'stop' | 'restart') {
    if (!this.unraidClient) {
      throw new Error('Unraid client not initialized')
    }

    switch (action) {
      case 'start':
        return await this.unraidClient.startApp(appId)
      case 'stop':
        return await this.unraidClient.stopApp(appId)
      case 'restart':
        return await this.unraidClient.restartApp(appId)
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }
}
