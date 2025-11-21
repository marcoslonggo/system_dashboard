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
  slug?: string
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

    if (storedConfigs.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
        source: 'db'
      })
    }

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
