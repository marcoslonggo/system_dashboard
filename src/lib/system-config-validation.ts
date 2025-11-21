const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$|^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)$/

export const isValidHost = (host: string) =>
  IPV4_REGEX.test(host) || HOSTNAME_REGEX.test(host)

export const validateHost = (host: string) => {
  const trimmed = host.trim()
  if (!trimmed) {
    return 'Host/IP is required'
  }
  if (!isValidHost(trimmed)) {
    return 'Host/IP must be a valid IPv4 address or hostname'
  }
  return null
}

export const validatePort = (port: number) => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'Port must be between 1 and 65535'
  }
  return null
}

export const validateConfigPayload = ({
  name,
  host,
  port,
  apiKey,
  requireApiKey = false
}: {
  name: string
  host: string
  port: number
  apiKey: string
  requireApiKey?: boolean
}) => {
  if (!name.trim()) {
    return 'Name is required'
  }
  const hostError = validateHost(host)
  if (hostError) {
    return hostError
  }
  const portError = validatePort(port)
  if (portError) {
    return portError
  }
  if (requireApiKey && !apiKey.trim()) {
    return 'API key is required'
  }
  return null
}

export const normalizeConfigInput = ({
  name,
  host,
  port,
  apiKey
}: {
  name: string
  host: string
  port: number
  apiKey: string
}) => ({
  name: name.trim(),
  host: host.trim(),
  port: Number(port) || 443,
  apiKey: apiKey.trim()
})

export { IPV4_REGEX, HOSTNAME_REGEX }
