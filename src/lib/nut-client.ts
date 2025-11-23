import net from 'net'

export type NutQueryOptions = {
  host: string
  port?: number
  username?: string
  password?: string
  upsName?: string | null
  timeoutMs?: number
}

export type NutStatus = {
  upsName: string
  status?: string
  charge?: number
  runtimeSeconds?: number
  load?: number
  inputVoltage?: number
  outputVoltage?: number
}

const DEFAULT_PORT = 3493
const DEFAULT_TIMEOUT = 8000

const parseVarValue = (line: string) => {
  // Expect: VAR <ups> <key> "<value>"
  const match = line.match(/^VAR\s+\S+\s+(\S+)\s+"(.+)"$/)
  if (!match) return null
  return { key: match[1], value: match[2] }
}

export async function queryNutStatus(options: NutQueryOptions): Promise<NutStatus> {
  const { host, port = DEFAULT_PORT, username, password, upsName, timeoutMs = DEFAULT_TIMEOUT } = options

  const socket = net.createConnection({ host, port })
  socket.setEncoding('utf8')
  socket.setTimeout(timeoutMs)

  let buffer = ''
  const queue: ((line: string) => void)[] = []
  const nextLine = (timeout = timeoutMs) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('NUT read timeout')), timeout)
      queue.push((line) => {
        clearTimeout(timer)
        resolve(line)
      })
    })

  const failEarly = (message: string): never => {
    socket.end()
    socket.destroy()
    throw new Error(message)
  }

  socket.on('data', (chunk) => {
    buffer += chunk
    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      const resolver = queue.shift()
      if (resolver) resolver(line)
    }
  })

  const send = (cmd: string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(`${cmd}\n`, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

  const close = () => {
    socket.end()
    socket.destroy()
  }

  try {
    if (username) {
      await send(`USERNAME ${username}`)
      const res = await nextLine()
      if (!res.startsWith('OK')) failEarly(`NUT username rejected: ${res}`)
    }
    if (password) {
      await send(`PASSWORD ${password}`)
      const res = await nextLine()
      if (!res.startsWith('OK')) failEarly(`NUT password rejected: ${res}`)
    }

    const targetUps = upsName?.trim() || 'ups'

    const varsToFetch = [
      'ups.status',
      'battery.charge',
      'battery.runtime',
      'battery.voltage',
      'ups.load',
      'input.voltage',
      'output.voltage'
    ]

    const results: Record<string, string> = {}

    for (const key of varsToFetch) {
      await send(`GET VAR ${targetUps} ${key}`)
      const line = await nextLine()
      const parsed = parseVarValue(line)
      if (parsed && parsed.key === key) {
        results[key] = parsed.value
      }
      if (line.startsWith('ERR')) {
        continue
      }
    }

    const status: NutStatus = { upsName: targetUps }
    if (results['ups.status']) status.status = results['ups.status']
    if (results['battery.charge']) status.charge = Number(results['battery.charge'])
    if (results['battery.runtime']) status.runtimeSeconds = Number(results['battery.runtime'])
    if (results['battery.voltage']) status.inputVoltage = Number(results['battery.voltage'])
    if (results['ups.load']) status.load = Number(results['ups.load'])
    if (results['input.voltage']) status.inputVoltage = Number(results['input.voltage'])
    if (results['output.voltage']) status.outputVoltage = Number(results['output.voltage'])

    return status
  } finally {
    close()
  }
}
