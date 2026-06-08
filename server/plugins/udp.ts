import dgram from 'node:dgram'

const { public: { fh6UdpPort } } = useRuntimeConfig()

/**
 * Parses the 324-byte FH6 Data Out packet into a typed object.
 * All values are little-endian per the Forza Data Out spec.
 */
function parsePacket(buf: Buffer): TelemetryPacket {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let o = 0
 
  const s32 = () => { const n = v.getInt32(o, true); o += 4; return n }
  const u32 = () => { const n = v.getUint32(o, true); o += 4; return n }
  const f32 = () => { const n = v.getFloat32(o, true); o += 4; return n }
  const u16 = () => { const n = v.getUint16(o, true); o += 2; return n }
  const u8  = () => { const n = v.getUint8(o); o += 1; return n }
  const s8  = () => { const n = v.getInt8(o); o += 1; return n }
 
  return {
    isRaceOn: s32(),
    timestampMs: u32(),
    engineMaxRpm: f32(),
    engineIdleRpm: f32(),
    currentEngineRpm: f32(),
    accelerationX: f32(),
    accelerationY: f32(),
    accelerationZ: f32(),
    velocityX: f32(),
    velocityY: f32(),
    velocityZ: f32(),
    angularVelocityX: f32(),
    angularVelocityY: f32(),
    angularVelocityZ: f32(),
    yaw: f32(),
    pitch: f32(),
    roll: f32(),
    normalizedSuspensionTravelFrontLeft: f32(),
    normalizedSuspensionTravelFrontRight: f32(),
    normalizedSuspensionTravelRearLeft: f32(),
    normalizedSuspensionTravelRearRight: f32(),
    tireSlipRatioFrontLeft: f32(),
    tireSlipRatioFrontRight: f32(),
    tireSlipRatioRearLeft: f32(),
    tireSlipRatioRearRight: f32(),
    wheelRotationSpeedFrontLeft: f32(),
    wheelRotationSpeedFrontRight: f32(),
    wheelRotationSpeedRearLeft: f32(),
    wheelRotationSpeedRearRight: f32(),
    wheelOnRumbleStripFrontLeft: s32(),
    wheelOnRumbleStripFrontRight: s32(),
    wheelOnRumbleStripRearLeft: s32(),
    wheelOnRumbleStripRearRight: s32(),
    wheelInPuddleFrontLeft: s32(),
    wheelInPuddleFrontRight: s32(),
    wheelInPuddleRearLeft: s32(),
    wheelInPuddleRearRight: s32(),
    surfaceRumbleFrontLeft: f32(),
    surfaceRumbleFrontRight: f32(),
    surfaceRumbleRearLeft: f32(),
    surfaceRumbleRearRight: f32(),
    tireSlipAngleFrontLeft: f32(),
    tireSlipAngleFrontRight: f32(),
    tireSlipAngleRearLeft: f32(),
    tireSlipAngleRearRight: f32(),
    tireCombinedSlipFrontLeft: f32(),
    tireCombinedSlipFrontRight: f32(),
    tireCombinedSlipRearLeft: f32(),
    tireCombinedSlipRearRight: f32(),
    suspensionTravelMetersFrontLeft: f32(),
    suspensionTravelMetersFrontRight: f32(),
    suspensionTravelMetersRearLeft: f32(),
    suspensionTravelMetersRearRight: f32(),
    carOrdinal: s32(),
    carClass: s32(),
    carPerformanceIndex: s32(),
    drivetrainType: s32(),
    numCylinders: s32(),
    carGroup: u32(),
    smashableVelDiff: f32(),
    smashableMass: f32(),
    positionX: f32(),
    positionY: f32(),
    positionZ: f32(),
    speed: f32(),
    power: f32(),
    torque: f32(),
    tireTempFrontLeft: f32(),
    tireTempFrontRight: f32(),
    tireTempRearLeft: f32(),
    tireTempRearRight: f32(),
    boost: f32(),
    fuel: f32(),
    distanceTraveled: f32(),
    bestLap: f32(),
    lastLap: f32(),
    currentLap: f32(),
    currentRaceTime: f32(),
    lapNumber: u16(),
    racePosition: u8(),
    accel: u8(),
    brake: u8(),
    clutch: u8(),
    handBrake: u8(),
    gear: u8(),
    steer: s8(),
    normalizedDrivingLine: s8(),
    normalizedAIBrakeDifference: s8(),
  }
}
 
export default defineNitroPlugin(() => {
  const socket = dgram.createSocket('udp4')
 
  socket.on('message', (msg) => {
    if (msg.length !== 324) return
    try {
      const packet = parsePacket(msg)
      if (packet.isRaceOn === 0) return  // ignore menu/pause frames
      telemetryEmitter.emit('packet', packet)
    }
    catch (err) {
      console.error('[fh6-telemetry] failed to parse packet:', err)
    }
  })
 
  socket.on('error', (err) => {
    console.error('[fh6-telemetry] UDP socket error:', err)
    socket.close()
  })
 
  socket.bind(fh6UdpPort, () => {
    console.log(`[fh6-telemetry] listening on UDP port ${fh6UdpPort}`)
  })
})
 

