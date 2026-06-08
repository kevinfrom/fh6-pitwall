import { EventEmitter } from 'node:events'

export const telemetryEmitter = new EventEmitter()
telemetryEmitter.setMaxListeners(100)

