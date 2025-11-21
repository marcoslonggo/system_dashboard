import { NextRequest, NextResponse } from 'next/server'
import { SystemAPIClient } from '@/lib/api-clients'
import { prisma } from '@/lib/db'
import { decryptSensitive } from '@/lib/encryption'

interface AppActionRequest {
  systemId?: string
  systemType?: 'truenas' | 'unraid'
  appId: string
  action: 'start' | 'stop' | 'restart'
}

const fallbackConfigs = {
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

export async function POST(request: NextRequest) {
  try {
    const body: AppActionRequest = await request.json()
    const { systemId, systemType, appId, action } = body

    if (!appId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: appId, action' },
        { status: 400 }
      )
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be start, stop, or restart' },
        { status: 400 }
      )
    }

    let resolvedType = systemType || ''
    let success = false
    let error: string | null = null
    const apiClient = new SystemAPIClient()

    const storedConfig = systemId
      ? await prisma.systemConfig.findUnique({ where: { id: systemId } })
      : null

    if (storedConfig) {
      if (!storedConfig.enabled) {
        return NextResponse.json(
          { error: `${storedConfig.name} is disabled` },
          { status: 400 }
        )
      }

      resolvedType = storedConfig.type

      try {
        const apiKey = decryptSensitive(storedConfig.apiKeyEncrypted)
        if (storedConfig.type === 'truenas') {
          apiClient.initializeTrueNAS(
            storedConfig.host,
            apiKey,
            storedConfig.port,
            storedConfig.useSsl,
            storedConfig.allowSelfSigned
          )
          success = await apiClient.executeTrueNASAction(appId, action)
        } else {
          apiClient.initializeUnraid(
            storedConfig.host,
            apiKey,
            storedConfig.port,
            storedConfig.useSsl,
            storedConfig.allowSelfSigned
          )
          success = await apiClient.executeUnraidAction(appId, action)
        }
      } catch (apiError) {
        console.error('Stored system API error', apiError)
        error = apiError instanceof Error ? apiError.message : 'Unknown API error'
      }
    } else {
      let fallbackType: 'truenas' | 'unraid' | null = null
      if (
        (systemType ?? '').toLowerCase() === 'truenas' ||
        systemId?.toLowerCase().includes('truenas')
      ) {
        fallbackType = 'truenas'
      } else if (
        (systemType ?? '').toLowerCase() === 'unraid' ||
        systemId?.toLowerCase().includes('unraid')
      ) {
        fallbackType = 'unraid'
      }

      if (!fallbackType) {
        return NextResponse.json(
          { error: 'Unknown system. Please add it in settings.' },
          { status: 400 }
        )
      }

      const fallback = fallbackConfigs[fallbackType]
      if (!fallback.enabled) {
        return NextResponse.json(
          { error: `${fallbackType} monitoring is disabled` },
          { status: 400 }
        )
      }

      if (!fallback.apiKey) {
        return NextResponse.json(
          { error: `${fallbackType} API key required. Configure it in settings or environment variables.` },
          { status: 400 }
        )
      }

      resolvedType = fallbackType

      try {
        if (fallbackType === 'truenas') {
          apiClient.initializeTrueNAS(
            fallback.host,
            fallback.apiKey,
            fallback.port,
            fallback.useSsl,
            fallback.allowSelfSigned
          )
          success = await apiClient.executeTrueNASAction(appId, action)
        } else {
          apiClient.initializeUnraid(
            fallback.host,
            fallback.apiKey,
            fallback.port,
            fallback.useSsl,
            fallback.allowSelfSigned
          )
          success = await apiClient.executeUnraidAction(appId, action)
        }
      } catch (apiError) {
        console.error('Fallback system API error', apiError)
        error = apiError instanceof Error ? apiError.message : 'Unknown API error'
      }
    }

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Successfully ${action}ed ${appId}`,
        systemType: resolvedType,
        appId,
        action,
        timestamp: new Date().toISOString()
      })
    }

    return NextResponse.json(
      { 
        error: error || `Failed to ${action} ${appId}`,
        systemType: resolvedType,
        appId,
        action,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  } catch (error) {
    console.error('App action error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
