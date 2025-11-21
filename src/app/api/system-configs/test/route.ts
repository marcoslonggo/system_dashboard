import { NextRequest, NextResponse } from 'next/server'
import { SystemAPIClient } from '@/lib/api-clients'
import { validateConfigPayload, normalizeConfigInput } from '@/lib/system-config-validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name = '',
      host = '',
      port = 443,
      type,
      apiKey = '',
      useSsl = true,
      allowSelfSigned = false
    } = body

    const normalized = normalizeConfigInput({
      name,
      host,
      port,
      apiKey
    })

    const validationError = validateConfigPayload({
      name: normalized.name,
      host: normalized.host,
      port: normalized.port,
      apiKey: normalized.apiKey,
      requireApiKey: true
    })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    if (!type || !['truenas', 'unraid'].includes(type)) {
      return NextResponse.json({ error: 'type must be truenas or unraid' }, { status: 400 })
    }

    const apiClient = new SystemAPIClient()

    if (type === 'truenas') {
      apiClient.initializeTrueNAS(
        normalized.host,
        normalized.apiKey,
        normalized.port,
        useSsl,
        allowSelfSigned
      )
      await apiClient.getTrueNASInfo()
    } else {
      apiClient.initializeUnraid(
        normalized.host,
        normalized.apiKey,
        normalized.port,
        useSsl,
        allowSelfSigned
      )
      await apiClient.getUnraidInfo()
    }

    return NextResponse.json({
      success: true,
      message: 'Connection verified'
    })
  } catch (error) {
    console.error('System test failed', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to validate system connection'
      },
      { status: 500 }
    )
  }
}
