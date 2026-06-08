import dgram from 'node:dgram'

// Only usable in development — guard at task level too
if (process.env.NODE_ENV !== 'development') {
  throw new Error('This task can only run in development')
}

const INTERVAL_MS = 16  // ~60fps

// --- Mutable simulation state ---

let timestamp = 0
let raceTime = 0
let currentLap = 0
let lapNumber = 1

const state = {
  speed: 50,         // m/s
  rpm: 4000,
  torque: 380,
  gear: 3,
  steer: 0,
  accel: 180,
  brake: 0,
  boost: 5,
  fuel: 0.8,
  distanceTraveled: 0,
  bestLap: 0,
  lastLap: 0,
  tireFL: 85, tireFR: 85, tireRL: 95, tireRR: 95,
  suspFL: 0.5, suspFR: 0.5, suspRL: 0.5, suspRR: 0.5,
  slipRatioRL: 0.05, slipRatioRR: 0.05,
  slipAngleFL: 0.02, slipAngleFR: 0.02, slipAngleRL: 0.08, slipAngleRR: 0.08,
  combinedSlipFL: 0.03, combinedSlipFR: 0.03, combinedSlipRL: 0.12, combinedSlipRR: 0.12,
  angVelY: 0.1,
  racePosition: 3,
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function jit(v: number, d: number) { return v + (Math.random() - 0.5) * d }

function tick() {
  timestamp += INTERVAL_MS
  raceTime += INTERVAL_MS / 1000
  currentLap += INTERVAL_MS / 1000

  // Simulate a lap reset every ~90 seconds
  if (currentLap > 90) {
    if (state.bestLap === 0 || currentLap < state.bestLap) state.bestLap = currentLap
    state.lastLap = currentLap
    currentLap = 0
    lapNumber++
  }

  state.speed       = clamp(jit(state.speed, 3), 20, 80)
  state.rpm         = clamp(jit(state.rpm, 300), 1500, 7500)
  state.torque      = clamp(jit(state.torque, 20), 100, 600)
  state.accel       = clamp(jit(state.accel, 20), 0, 255)
  state.brake       = state.accel < 80 ? clamp(jit(50, 30), 0, 255) : 0
  state.steer       = clamp(jit(state.steer, 15), -127, 127)
  state.boost       = clamp(jit(state.boost, 0.5), 0, 20)
  state.fuel        = clamp(state.fuel - 0.00001, 0, 1)
  state.distanceTraveled += state.speed * (INTERVAL_MS / 1000)
  state.angVelY     = clamp(jit(state.angVelY, 0.05), -2, 2)
  if (Math.random() > 0.97) state.gear = clamp(state.gear + (Math.random() > 0.5 ? 1 : -1), 1, 8)

  ;(['FL','FR','RL','RR'] as const).forEach(w => {
    const key = `tire${w}` as keyof typeof state
    ;(state as any)[key] = clamp(jit((state as any)[key], 1.5), 60, 130)
  })

  state.suspFL = clamp(jit(state.suspFL, 0.05), 0, 1)
  state.suspFR = clamp(jit(state.suspFR, 0.05), 0, 1)
  state.suspRL = clamp(jit(state.suspRL, 0.05), 0, 1)
  state.suspRR = clamp(jit(state.suspRR, 0.05), 0, 1)

  state.slipRatioRL   = clamp(jit(state.slipRatioRL, 0.08), 0, 2)
  state.slipRatioRR   = clamp(jit(state.slipRatioRR, 0.08), 0, 2)
  state.slipAngleRL   = clamp(jit(state.slipAngleRL, 0.05), 0, 2)
  state.slipAngleRR   = clamp(jit(state.slipAngleRR, 0.05), 0, 2)
  state.combinedSlipRL = clamp(jit(state.combinedSlipRL, 0.06), 0, 2.5)
  state.combinedSlipRR = clamp(jit(state.combinedSlipRR, 0.06), 0, 2.5)
}

/**
 * Writes the simulation state into a 324-byte little-endian buffer
 * matching the FH6 Data Out packet format exactly.
 */
function buildPacket(): Buffer {
  const buf = Buffer.alloc(324)
  const v = new DataView(buf.buffer)
  let o = 0

  const s32 = (n: number) => { v.setInt32(o, n, true); o += 4 }
  const u32 = (n: number) => { v.setUint32(o, n, true); o += 4 }
  const f32 = (n: number) => { v.setFloat32(o, n, true); o += 4 }
  const u16 = (n: number) => { v.setUint16(o, n, true); o += 2 }
  const u8  = (n: number) => { v.setUint8(o, n); o += 1 }
  const s8  = (n: number) => { v.setInt8(o, n); o += 1 }

  const power = (state.torque * state.rpm * Math.PI) / 30  // watts

  s32(1)                    // isRaceOn
  u32(timestamp)            // timestampMs
  f32(8000)                 // engineMaxRpm
  f32(800)                  // engineIdleRpm
  f32(state.rpm)            // currentEngineRpm
  f32(jit(0, 2))            // accelerationX
  f32(jit(0, 1))            // accelerationY
  f32(jit(5, 3))            // accelerationZ
  f32(jit(0, 1))            // velocityX
  f32(jit(0, 0.5))          // velocityY
  f32(state.speed)          // velocityZ (forward)
  f32(jit(0, 0.05))         // angularVelocityX
  f32(state.angVelY)        // angularVelocityY (yaw)
  f32(jit(0, 0.05))         // angularVelocityZ
  f32(jit(0, 0.05))         // yaw
  f32(jit(0, 0.02))         // pitch
  f32(jit(0, 0.02))         // roll
  f32(state.suspFL)         // normalizedSuspensionTravelFrontLeft
  f32(state.suspFR)         // normalizedSuspensionTravelFrontRight
  f32(state.suspRL)         // normalizedSuspensionTravelRearLeft
  f32(state.suspRR)         // normalizedSuspensionTravelRearRight
  f32(jit(0.02, 0.03))      // tireSlipRatioFrontLeft
  f32(jit(0.02, 0.03))      // tireSlipRatioFrontRight
  f32(state.slipRatioRL)    // tireSlipRatioRearLeft
  f32(state.slipRatioRR)    // tireSlipRatioRearRight
  f32(state.speed * 3.8)    // wheelRotationSpeedFrontLeft (approx rad/s)
  f32(state.speed * 3.8)    // wheelRotationSpeedFrontRight
  f32(state.speed * 3.8)    // wheelRotationSpeedRearLeft
  f32(state.speed * 3.8)    // wheelRotationSpeedRearRight
  s32(0)                    // wheelOnRumbleStripFrontLeft
  s32(0)                    // wheelOnRumbleStripFrontRight
  s32(0)                    // wheelOnRumbleStripRearLeft
  s32(0)                    // wheelOnRumbleStripRearRight
  s32(0)                    // wheelInPuddleFrontLeft
  s32(0)                    // wheelInPuddleFrontRight
  s32(0)                    // wheelInPuddleRearLeft
  s32(0)                    // wheelInPuddleRearRight
  f32(0)                    // surfaceRumbleFrontLeft
  f32(0)                    // surfaceRumbleFrontRight
  f32(0)                    // surfaceRumbleRearLeft
  f32(0)                    // surfaceRumbleRearRight
  f32(state.slipAngleFL)    // tireSlipAngleFrontLeft
  f32(state.slipAngleFR)    // tireSlipAngleFrontRight
  f32(state.slipAngleRL)    // tireSlipAngleRearLeft
  f32(state.slipAngleRR)    // tireSlipAngleRearRight
  f32(state.combinedSlipFL) // tireCombinedSlipFrontLeft
  f32(state.combinedSlipFR) // tireCombinedSlipFrontRight
  f32(state.combinedSlipRL) // tireCombinedSlipRearLeft
  f32(state.combinedSlipRR) // tireCombinedSlipRearRight
  f32(state.suspFL * 0.15)  // suspensionTravelMetersFrontLeft
  f32(state.suspFR * 0.15)  // suspensionTravelMetersFrontRight
  f32(state.suspRL * 0.15)  // suspensionTravelMetersRearLeft
  f32(state.suspRR * 0.15)  // suspensionTravelMetersRearRight
  s32(1234)                 // carOrdinal
  s32(4)                    // carClass (S class)
  s32(750)                  // carPerformanceIndex
  s32(1)                    // drivetrainType (RWD)
  s32(6)                    // numCylinders
  u32(1)                    // carGroup
  f32(0)                    // smashableVelDiff
  f32(0)                    // smashableMass
  f32(jit(100, 5))          // positionX
  f32(0)                    // positionY
  f32(jit(200, 5))          // positionZ
  f32(state.speed)          // speed (m/s)
  f32(power)                // power (watts)
  f32(state.torque)         // torque (Nm)
  f32(state.tireFL)         // tireTempFrontLeft
  f32(state.tireFR)         // tireTempFrontRight
  f32(state.tireRL)         // tireTempRearLeft
  f32(state.tireRR)         // tireTempRearRight
  f32(state.boost)          // boost (PSI)
  f32(state.fuel)           // fuel (0–1)
  f32(state.distanceTraveled) // distanceTraveled (m)
  f32(state.bestLap)        // bestLap (s)
  f32(state.lastLap)        // lastLap (s)
  f32(currentLap)           // currentLap (s)
  f32(raceTime)             // currentRaceTime (s)
  u16(lapNumber)            // lapNumber
  u8(state.racePosition)    // racePosition
  u8(clamp(Math.round(state.accel), 0, 255))  // accel
  u8(clamp(Math.round(state.brake), 0, 255))  // brake
  u8(0)                     // clutch
  u8(0)                     // handBrake
  u8(state.gear)            // gear
  s8(clamp(Math.round(state.steer), -127, 127))  // steer
  s8(0)                     // normalizedDrivingLine
  s8(0)                     // normalizedAIBrakeDifference

  return buf
}

export default defineTask({
  meta: {
    description: 'Send mock FH6 Data Out UDP packets to localhost for development',
  },
  async run() {
    const { public: { fh6UdpPort } } = useRuntimeConfig()
    const socket = dgram.createSocket('udp4')

    console.log(`[mock-udp] sending packets to 127.0.0.1:${fh6UdpPort} at ~60fps`)

    const interval = setInterval(() => {
      tick()
      const packet = buildPacket()
      socket.send(packet, fh6UdpPort, '127.0.0.1', (err: Error | null | undefined) => {
        if (err) {
            console.error('[mock-udp] send error:', err)
        }
      })
    }, INTERVAL_MS)

    // Run for 60 seconds then stop, or until the process exits
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        clearInterval(interval)
        socket.close()
        resolve()
      }, 60_000)
    })

    return {
        result: 'done'
    }
  },
})
