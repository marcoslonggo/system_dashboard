import { NextRequest, NextResponse } from 'next/server'
import { SystemAPIClient } from '@/lib/api-clients'

interface AppActionRequest {
  systemId: string
  appId: string
  action: 'start' | 'stop' | 'restart'
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

export async function POST(request: NextRequest) {
  try {
    const body: AppActionRequest = await request.json()
    const { systemId, appId, action } = body

    // Validate request
    if (!systemId || !appId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: systemId, appId, action' },
        { status: 400 }
      )
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be start, stop, or restart' },
        { status: 400 }
      )
    }

    let success = false
    let systemType = ''
    let error = null

    const apiClient = new SystemAPIClient()

    // Determine system type and execute appropriate command
    if (systemId.toLowerCase().includes('truenas')) {
      systemType = 'truenas'
      
      if (!systemConfigs.truenas.enabled) {
        return NextResponse.json(
          { error: 'TrueNAS monitoring is disabled' },
          { status: 400 }
        )
      }
      
      if (!systemConfigs.truenas.apiKey) {
        return NextResponse.json(
          { error: 'TrueNAS API key required. Configure it in settings or environment variables.' },
          { status: 400 }
        )
      }
      
      try {
        apiClient.initializeTrueNAS(
          systemConfigs.truenas.host,
          systemConfigs.truenas.apiKey,
          systemConfigs.truenas.port,
          systemConfigs.truenas.useSsl,
          systemConfigs.truenas.allowSelfSigned
        )
        
        success = await apiClient.executeTrueNASAction(appId, action)
        console.log(`Successfully executed ${action} on TrueNAS app ${appId}`)
      } catch (apiError) {
        console.error(`TrueNAS API error for ${action} ${appId}:`, apiError)
        error = apiError instanceof Error ? apiError.message : 'Unknown TrueNAS API error'
      }
    } else if (systemId.toLowerCase().includes('unraid')) {
      systemType = 'unraid'
      
      if (!systemConfigs.unraid.enabled) {
        return NextResponse.json(
          { error: 'Unraid monitoring is disabled' },
          { status: 400 }
        )
      }
      
      if (!systemConfigs.unraid.apiKey) {
        return NextResponse.json(
          { error: 'Unraid API key required. Configure it in settings or environment variables.' },
          { status: 400 }
        )
      }
      
      try {
        apiClient.initializeUnraid(
          systemConfigs.unraid.host,
          systemConfigs.unraid.apiKey,
          systemConfigs.unraid.port,
          systemConfigs.unraid.useSsl,
          systemConfigs.unraid.allowSelfSigned
        )
        
        success = await apiClient.executeUnraidAction(appId, action)
        console.log(`Successfully executed ${action} on Unraid app ${appId}`)
      } catch (apiError) {
        console.error(`Unraid API error for ${action} ${appId}:`, apiError)
        error = apiError instanceof Error ? apiError.message : 'Unknown Unraid API error'
      }
    } else {
      return NextResponse.json(
        { error: 'Unknown system type' },
        { status: 400 }
      )
    }

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Successfully ${action}ed ${appId} on ${systemId}`,
        systemType,
        appId,
        action,
        timestamp: new Date().toISOString()
      })
    } else {
      return NextResponse.json(
        { 
          error: error || `Failed to ${action} ${appId} on ${systemId}`,
          systemType,
          appId,
          action,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

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
