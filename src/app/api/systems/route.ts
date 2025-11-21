import { NextRequest, NextResponse } from 'next/server'
import { SystemAPIClient } from '@/lib/api-clients'

interface SystemInfo {
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

// Configuration storage (in production, this should be in a database)
const systemConfigs = {
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
    const type = searchParams.get('type') // 'truenas', 'unraid', or null for both

    let systems: SystemInfo[] = []
    const apiClient = new SystemAPIClient()

    // Check TrueNAS configuration
    if (!type || type === 'truenas') {
      if (!systemConfigs.truenas.enabled) {
        systems.push({
          name: 'TrueNAS Server',
          type: 'truenas',
          status: 'offline',
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          storage: 0,
          temperature: 0,
          apps: []
        })
      } else if (!systemConfigs.truenas.apiKey) {
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
          apiClient.initializeTrueNAS(
            systemConfigs.truenas.host,
            systemConfigs.truenas.apiKey,
            systemConfigs.truenas.port,
            systemConfigs.truenas.useSsl,
            systemConfigs.truenas.allowSelfSigned
          )
          
          const truenasInfo = await apiClient.getTrueNASInfo()
          systems.push(truenasInfo)
          console.log('Successfully fetched TrueNAS data via API')
        } catch (error) {
          console.error('Failed to fetch TrueNAS info via API:', error)
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

    // Check Unraid configuration
    if (!type || type === 'unraid') {
      if (!systemConfigs.unraid.enabled) {
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
      } else if (!systemConfigs.unraid.apiKey) {
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
          apiClient.initializeUnraid(
            systemConfigs.unraid.host,
            systemConfigs.unraid.apiKey,
            systemConfigs.unraid.port,
            systemConfigs.unraid.useSsl,
            systemConfigs.unraid.allowSelfSigned
          )
          
          const unraidInfo = await apiClient.getUnraidInfo()
          systems.push(unraidInfo)
          console.log('Successfully fetched Unraid data via API')
        } catch (error) {
          console.error('Failed to fetch Unraid info via API:', error)
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

    return NextResponse.json({
      success: true,
      data: systems,
      timestamp: new Date().toISOString(),
      source: 'api',
      config: {
        truenas: {
          enabled: systemConfigs.truenas.enabled,
          hasApiKey: !!systemConfigs.truenas.apiKey,
          host: systemConfigs.truenas.host,
          useSsl: systemConfigs.truenas.useSsl,
          allowSelfSigned: systemConfigs.truenas.allowSelfSigned
        },
        unraid: {
          enabled: systemConfigs.unraid.enabled,
          hasApiKey: !!systemConfigs.unraid.apiKey,
          host: systemConfigs.unraid.host,
          useSsl: systemConfigs.unraid.useSsl,
          allowSelfSigned: systemConfigs.unraid.allowSelfSigned
        }
      }
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
