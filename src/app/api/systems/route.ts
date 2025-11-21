import { NextRequest, NextResponse } from 'next/server'
import { SystemAPIClient } from '@/lib/api-clients'
import { prisma } from '@/lib/db'
import { decryptSensitive } from '@/lib/encryption'

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

// Fallback configuration when no systems are stored in SQLite
const envConfigs = {
  truenas: {
    host: process.env.TRUENAS_HOST || '192.168.1.100',
    apiKey: process.env.TRUENAS_API_KEY || '',
    port: parseInt(process.env.TRUENAS_PORT || '443'),
    enabled: process.env.TRUENAS_ENABLED !== 'false',
    useSsl: process.env.TRUENAS_USE_SSL ? process.env.TRUENAS_USE_SSL !== 'false' : true,
    allowSelfSigned: process.env.TRUENAS_ALLOW_SELF_SIGNED === 'true'
  },
  unraid: {
    host: process.env.UNRAID_HOST || '192.168.1.200',
    apiKey: process.env.UNRAID_API_KEY || '',
    port: parseInt(process.env.UNRAID_PORT || '80'),
    enabled: process.env.UNRAID_ENABLED !== 'false',
    useSsl: process.env.UNRAID_USE_SSL ? process.env.UNRAID_USE_SSL === 'true' : false,
    allowSelfSigned: process.env.UNRAID_ALLOW_SELF_SIGNED === 'true'
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const typeFilter = searchParams.get('type') as 'truenas' | 'unraid' | null
    const systems: SystemInfo[] = []
    const apiClient = new SystemAPIClient()

    const storedConfigs = await prisma.systemConfig.findMany({
      orderBy: { createdAt: 'asc' }
    })

    if (storedConfigs.length > 0) {
      for (const config of storedConfigs) {
        if (typeFilter && config.type !== typeFilter) continue

        if (!config.enabled) {
          systems.push({
            id: config.id,
            name: config.name,
            type: config.type,
            status: 'offline',
            uptime: 'Disabled',
            cpu: 0,
            memory: 0,
            storage: 0,
            temperature: 0,
            gpu: null,
            apps: []
          })
          continue
        }

        try {
          const apiKey = decryptSensitive(config.apiKeyEncrypted)
          if (config.type === 'truenas') {
            apiClient.initializeTrueNAS(
              config.host,
              apiKey,
              config.port,
              config.useSsl,
              config.allowSelfSigned
            )
            const info = await apiClient.getTrueNASInfo()
            systems.push({ ...info, id: config.id, name: config.name })
          } else {
            apiClient.initializeUnraid(
              config.host,
              apiKey,
              config.port,
              config.useSsl,
              config.allowSelfSigned
            )
            const info = await apiClient.getUnraidInfo()
            systems.push({ ...info, id: config.id, name: config.name })
          }
        } catch (err) {
          console.error(`Failed to fetch ${config.name}`, err)
          systems.push({
            id: config.id,
            name: config.name,
            type: config.type,
            status: 'offline',
            uptime: 'Connection failed',
            cpu: 0,
            memory: 0,
            storage: 0,
            temperature: 0,
            gpu: null,
            apps: []
          })
        }
      }
    } else {
      await fetchFromEnvConfigs({ typeFilter, systems, apiClient })
    }

    return NextResponse.json({
      success: true,
      data: systems,
      timestamp: new Date().toISOString(),
      source: 'api'
    })
  } catch (error) {
    console.error('Systems API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch system information',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

async function fetchFromEnvConfigs({
  typeFilter,
  systems,
  apiClient
}: {
  typeFilter: 'truenas' | 'unraid' | null
  systems: SystemInfo[]
  apiClient: SystemAPIClient
}) {
  if (!typeFilter || typeFilter === 'truenas') {
    const cfg = envConfigs.truenas
    if (!cfg.enabled) {
      systems.push({
        name: 'TrueNAS Server',
        type: 'truenas',
        status: 'offline',
        uptime: 'N/A',
        cpu: 0,
        memory: 0,
        storage: 0,
        temperature: 0,
        gpu: null,
        apps: []
      })
    } else if (!cfg.apiKey) {
      systems.push({
        name: 'TrueNAS Server',
        type: 'truenas',
        status: 'offline',
        uptime: 'API key required',
        cpu: 0,
        memory: 0,
        storage: 0,
        temperature: 0,
        gpu: null,
        apps: []
      })
    } else {
      try {
        apiClient.initializeTrueNAS(cfg.host, cfg.apiKey, cfg.port, cfg.useSsl, cfg.allowSelfSigned)
        const info = await apiClient.getTrueNASInfo()
        systems.push(info)
      } catch (err) {
        console.error('TrueNAS fallback error', err)
        systems.push({
          name: 'TrueNAS Server',
          type: 'truenas',
          status: 'offline',
          uptime: 'Connection failed',
          cpu: 0,
          memory: 0,
          storage: 0,
          temperature: 0,
          gpu: null,
          apps: []
        })
      }
    }
  }

  if (!typeFilter || typeFilter === 'unraid') {
    const cfg = envConfigs.unraid
    if (!cfg.enabled) {
      systems.push({
        name: 'Unraid Server',
        type: 'unraid',
        status: 'offline',
        uptime: 'N/A',
        cpu: 0,
        memory: 0,
        storage: 0,
        temperature: 0,
        gpu: null,
        apps: []
      })
    } else if (!cfg.apiKey) {
      systems.push({
        name: 'Unraid Server',
        type: 'unraid',
        status: 'offline',
        uptime: 'API key required',
        cpu: 0,
        memory: 0,
        storage: 0,
        temperature: 0,
        gpu: null,
        apps: []
      })
    } else {
      try {
        apiClient.initializeUnraid(cfg.host, cfg.apiKey, cfg.port, cfg.useSsl, cfg.allowSelfSigned)
        const info = await apiClient.getUnraidInfo()
        systems.push(info)
      } catch (err) {
        console.error('Unraid fallback error', err)
        systems.push({
          name: 'Unraid Server',
          type: 'unraid',
          status: 'offline',
          uptime: 'Connection failed',
          cpu: 0,
          memory: 0,
          storage: 0,
          temperature: 0,
          gpu: null,
          apps: []
        })
      }
    }
  }
}
