import dgram from 'node:dgram'

// Only usable in development — guard at task level too
if (process.env.NODE_ENV !== 'development') {
  throw new Error('This task can only run in development')
}

const INTERVAL_MS = 16  // ~60fps
const DT = INTERVAL_MS / 1000

const DRIVE_SCRIPT = [
  { duration: 5, targetSpeed: 28, throttle: 255, brake: 0, steer: 0 },
  { duration: 9, targetSpeed: 63, throttle: 235, brake: 0, steer: 8 },
  { duration: 6, targetSpeed: 56, throttle: 115, brake: 0, steer: -6 },
  { duration: 8, targetSpeed: 44, throttle: 135, brake: 25, steer: 76 },
  { duration: 7, targetSpeed: 66, throttle: 245, brake: 0, steer: 0 },
  { duration: 8, targetSpeed: 42, throttle: 125, brake: 35, steer: -82 },
  { duration: 5, targetSpeed: 24, throttle: 20, brake: 210, steer: -20 },
] as const

// --- Mutable simulation state ---

function createInitialState() {
  return {
    speed: 0,         // m/s
    rpm: 900,
    torque: 380,
    gear: 1,
    steer: 0,
    accel: 0,
    brake: 0,
    boost: 0,
    fuel: 0.8,
    distanceTraveled: 0,
    bestLap: 0,
    lastLap: 0,
    tireFL: 72, tireFR: 72, tireRL: 74, tireRR: 74,
    suspFL: 0.5, suspFR: 0.5, suspRL: 0.5, suspRR: 0.5,
    slipRatioFL: 0.02, slipRatioFR: 0.02, slipRatioRL: 0.05, slipRatioRR: 0.05,
    slipAngleFL: 0.02, slipAngleFR: 0.02, slipAngleRL: 0.08, slipAngleRR: 0.08,
    combinedSlipFL: 0.03, combinedSlipFR: 0.03, combinedSlipRL: 0.12, combinedSlipRR: 0.12,
    accelerationX: 0,
    accelerationY: 0,
    accelerationZ: 0,
    angVelY: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    positionX: 100,
    positionZ: 200,
    heading: 0,
    racePosition: 3,
  }
}

let timestamp = 0
let raceTime = 0
let currentLap = 0
let lapNumber = 1
let scriptIndex = 0
let phaseTime = 0

const state = createInitialState()

function resetSimulation() {
  timestamp = 0
  raceTime = 0
  currentLap = 0
  lapNumber = 1
  scriptIndex = 0
  phaseTime = 0
  Object.assign(state, createInitialState())
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function approach(current: number, target: number, maxDelta: number) {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}
function wave(amplitude: number, frequency: number, phase = 0) {
  return Math.sin(raceTime * frequency + phase) * amplitude
}
function targetGearForSpeed(speed: number) {
  if (speed < 11) return 1
  if (speed < 19) return 2
  if (speed < 30) return 3
  if (speed < 42) return 4
  if (speed < 55) return 5
  if (speed < 68) return 6
  return 7
}

function tick() {
  timestamp += INTERVAL_MS
  raceTime += DT
  currentLap += DT
  phaseTime += DT

  // Simulate a lap reset every ~90 seconds
  if (currentLap > 90) {
    if (state.bestLap === 0 || currentLap < state.bestLap) state.bestLap = currentLap
    state.lastLap = currentLap
    currentLap = 0
    lapNumber++
  }

  const command = DRIVE_SCRIPT[scriptIndex]
  if (phaseTime > command.duration) {
    phaseTime = 0
    scriptIndex = (scriptIndex + 1) % DRIVE_SCRIPT.length
  }

  const active = DRIVE_SCRIPT[scriptIndex]
  const progress = clamp(phaseTime / active.duration, 0, 1)
  const cornerSteer = Math.abs(active.steer) > 30
    ? active.steer * Math.sin(Math.PI * progress)
    : active.steer + wave(4, 0.7, scriptIndex)
  const targetThrottle = active.throttle + wave(8, 0.9, 1.7)
  const targetBrake = active.brake + (active.brake > 0 ? wave(10, 1.1, 0.4) : 0)

  state.accel = approach(state.accel, clamp(targetThrottle, 0, 255), 220 * DT)
  state.brake = approach(state.brake, clamp(targetBrake, 0, 255), 260 * DT)
  state.steer = approach(state.steer, clamp(cornerSteer, -127, 127), 150 * DT)

  const previousSpeed = state.speed
  const speedRate = active.targetSpeed > state.speed ? 8 : 14
  state.speed = clamp(approach(state.speed, active.targetSpeed, speedRate * DT), 0, 80)
  state.accelerationZ = (state.speed - previousSpeed) / DT

  state.gear = targetGearForSpeed(state.speed)
  const gearFactors = [0, 390, 260, 190, 145, 115, 95, 80, 68]
  const rpmTarget = 900 + state.speed * gearFactors[state.gear]
  state.rpm = approach(state.rpm, clamp(rpmTarget + wave(90, 1.5), 850, 7800), 2400 * DT)

  const throttlePct = state.accel / 255
  const brakePct = state.brake / 255
  const steerPct = Math.abs(state.steer) / 127
  const speedPct = state.speed / 80
  const torqueCurve = 0.65 + 0.35 * Math.sin((state.rpm / 8000) * Math.PI)
  state.torque = approach(state.torque, 100 + throttlePct * 480 * torqueCurve, 260 * DT)
  state.boost = approach(state.boost, throttlePct > 0.35 ? throttlePct * 16 : 0, 5 * DT)

  state.fuel = clamp(state.fuel - (0.000004 + throttlePct * 0.000012), 0, 1)
  state.distanceTraveled += state.speed * DT
  state.heading += (state.steer / 127) * state.speed * 0.0035 * DT
  state.positionX += Math.sin(state.heading) * state.speed * DT
  state.positionZ += Math.cos(state.heading) * state.speed * DT

  const yawTarget = clamp((state.steer / 127) * speedPct * 2.2, -2, 2)
  state.angVelY = approach(state.angVelY, yawTarget, 2.5 * DT)
  state.yaw = state.heading + wave(0.015, 0.6)
  state.pitch = clamp(-state.accelerationZ * 0.01 + wave(0.004, 1.3), -0.08, 0.08)
  state.roll = clamp(-(state.steer / 127) * speedPct * 0.08 + wave(0.004, 1.1), -0.1, 0.1)
  state.accelerationX = state.angVelY * state.speed * 0.45
  state.accelerationY = 0.1 + brakePct * 0.6 + wave(0.15, 2.2)

  const rearSlipTarget = clamp((throttlePct - 0.45) * 1.5 + brakePct * 0.25 + steerPct * speedPct * 0.65, 0.02, 2)
  const frontSlipTarget = clamp(0.02 + steerPct * speedPct * 0.18 + brakePct * 0.12, 0.01, 0.5)
  const frontSlipAngleTarget = clamp(0.02 + steerPct * speedPct * 0.3, 0.02, 1)
  const rearSlipAngleTarget = clamp(0.04 + steerPct * speedPct * 0.55 + Math.max(0, throttlePct - 0.75) * 0.3, 0.04, 1.4)
  const sideBias = state.steer >= 0 ? 1 : -1

  state.slipRatioFL = approach(state.slipRatioFL, frontSlipTarget * (sideBias > 0 ? 1.15 : 0.95), 0.45 * DT)
  state.slipRatioFR = approach(state.slipRatioFR, frontSlipTarget * (sideBias < 0 ? 1.15 : 0.95), 0.45 * DT)
  state.slipRatioRL = approach(state.slipRatioRL, rearSlipTarget * (sideBias > 0 ? 1.12 : 0.94), 1.1 * DT)
  state.slipRatioRR = approach(state.slipRatioRR, rearSlipTarget * (sideBias < 0 ? 1.12 : 0.94), 1.1 * DT)
  state.slipAngleFL = approach(state.slipAngleFL, frontSlipAngleTarget * (sideBias > 0 ? 1.15 : 0.9), 0.5 * DT)
  state.slipAngleFR = approach(state.slipAngleFR, frontSlipAngleTarget * (sideBias < 0 ? 1.15 : 0.9), 0.5 * DT)
  state.slipAngleRL = approach(state.slipAngleRL, rearSlipAngleTarget * (sideBias > 0 ? 1.12 : 0.92), 0.65 * DT)
  state.slipAngleRR = approach(state.slipAngleRR, rearSlipAngleTarget * (sideBias < 0 ? 1.12 : 0.92), 0.65 * DT)
  state.combinedSlipFL = approach(state.combinedSlipFL, state.slipAngleFL + state.slipRatioFL * 0.35, 0.7 * DT)
  state.combinedSlipFR = approach(state.combinedSlipFR, state.slipAngleFR + state.slipRatioFR * 0.35, 0.7 * DT)
  state.combinedSlipRL = approach(state.combinedSlipRL, state.slipAngleRL + state.slipRatioRL * 0.45, 1.1 * DT)
  state.combinedSlipRR = approach(state.combinedSlipRR, state.slipAngleRR + state.slipRatioRR * 0.45, 1.1 * DT)

  const lateralLoad = (state.steer / 127) * speedPct
  const longitudinalLoad = brakePct * 0.16 - throttlePct * 0.08
  state.suspFL = approach(state.suspFL, clamp(0.5 + lateralLoad * 0.08 + longitudinalLoad, 0, 1), 0.8 * DT)
  state.suspFR = approach(state.suspFR, clamp(0.5 - lateralLoad * 0.08 + longitudinalLoad, 0, 1), 0.8 * DT)
  state.suspRL = approach(state.suspRL, clamp(0.5 + lateralLoad * 0.06 - longitudinalLoad, 0, 1), 0.8 * DT)
  state.suspRR = approach(state.suspRR, clamp(0.5 - lateralLoad * 0.06 - longitudinalLoad, 0, 1), 0.8 * DT)

  const frontTempTarget = 68 + state.speed * 0.18 + frontSlipTarget * 22 + brakePct * 18
  const rearTempTarget = 70 + state.speed * 0.2 + rearSlipTarget * 16 + throttlePct * 8
  state.tireFL = approach(state.tireFL, frontTempTarget * (sideBias > 0 ? 1.03 : 0.99), 2.4 * DT)
  state.tireFR = approach(state.tireFR, frontTempTarget * (sideBias < 0 ? 1.03 : 0.99), 2.4 * DT)
  state.tireRL = approach(state.tireRL, rearTempTarget * (sideBias > 0 ? 1.03 : 0.99), 2.8 * DT)
  state.tireRR = approach(state.tireRR, rearTempTarget * (sideBias < 0 ? 1.03 : 0.99), 2.8 * DT)
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
  f32(state.accelerationX)  // accelerationX
  f32(state.accelerationY)  // accelerationY
  f32(state.accelerationZ)  // accelerationZ
  f32(Math.sin(state.heading) * state.speed) // velocityX
  f32(0)                    // velocityY
  f32(Math.cos(state.heading) * state.speed) // velocityZ (forward)
  f32(state.roll * 0.2)     // angularVelocityX
  f32(state.angVelY)        // angularVelocityY (yaw)
  f32(state.pitch * 0.2)    // angularVelocityZ
  f32(state.yaw)            // yaw
  f32(state.pitch)          // pitch
  f32(state.roll)           // roll
  f32(state.suspFL)         // normalizedSuspensionTravelFrontLeft
  f32(state.suspFR)         // normalizedSuspensionTravelFrontRight
  f32(state.suspRL)         // normalizedSuspensionTravelRearLeft
  f32(state.suspRR)         // normalizedSuspensionTravelRearRight
  f32(state.slipRatioFL)    // tireSlipRatioFrontLeft
  f32(state.slipRatioFR)    // tireSlipRatioFrontRight
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
  f32(state.positionX)      // positionX
  f32(0)                    // positionY
  f32(state.positionZ)      // positionZ
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
    resetSimulation()

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
