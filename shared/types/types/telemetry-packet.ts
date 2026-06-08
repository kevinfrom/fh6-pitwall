export interface TelemetryPacket {
  // Race state
  isRaceOn: number
  timestampMs: number

  // Engine
  engineMaxRpm: number
  engineIdleRpm: number
  currentEngineRpm: number

  // Acceleration (car local space, m/s²)
  accelerationX: number
  accelerationY: number
  accelerationZ: number

  // Velocity (car local space, m/s)
  velocityX: number
  velocityY: number
  velocityZ: number

  // Angular velocity (rad/s): X = pitch, Y = yaw, Z = roll
  angularVelocityX: number
  angularVelocityY: number
  angularVelocityZ: number

  // Orientation (radians)
  yaw: number
  pitch: number
  roll: number

  // Suspension travel normalized (0 = max stretch, 1 = max compression)
  normalizedSuspensionTravelFrontLeft: number
  normalizedSuspensionTravelFrontRight: number
  normalizedSuspensionTravelRearLeft: number
  normalizedSuspensionTravelRearRight: number

  // Tire slip ratio (0 = 100% grip, |ratio| > 1 = loss of grip)
  tireSlipRatioFrontLeft: number
  tireSlipRatioFrontRight: number
  tireSlipRatioRearLeft: number
  tireSlipRatioRearRight: number

  // Wheel rotation speed (rad/s)
  wheelRotationSpeedFrontLeft: number
  wheelRotationSpeedFrontRight: number
  wheelRotationSpeedRearLeft: number
  wheelRotationSpeedRearRight: number

  // Rumble strip flags
  wheelOnRumbleStripFrontLeft: number
  wheelOnRumbleStripFrontRight: number
  wheelOnRumbleStripRearLeft: number
  wheelOnRumbleStripRearRight: number

  // Puddle flags
  wheelInPuddleFrontLeft: number
  wheelInPuddleFrontRight: number
  wheelInPuddleRearLeft: number
  wheelInPuddleRearRight: number

  // Surface rumble (for force feedback)
  surfaceRumbleFrontLeft: number
  surfaceRumbleFrontRight: number
  surfaceRumbleRearLeft: number
  surfaceRumbleRearRight: number

  // Tire slip angle (0 = 100% grip, |angle| > 1 = loss of grip)
  tireSlipAngleFrontLeft: number
  tireSlipAngleFrontRight: number
  tireSlipAngleRearLeft: number
  tireSlipAngleRearRight: number

  // Tire combined slip
  tireCombinedSlipFrontLeft: number
  tireCombinedSlipFrontRight: number
  tireCombinedSlipRearLeft: number
  tireCombinedSlipRearRight: number

  // Actual suspension travel (meters)
  suspensionTravelMetersFrontLeft: number
  suspensionTravelMetersFrontRight: number
  suspensionTravelMetersRearLeft: number
  suspensionTravelMetersRearRight: number

  // Car info
  carOrdinal: number
  carClass: number        // 0 (D) to 7 (X)
  carPerformanceIndex: number  // 100–999
  drivetrainType: number  // 0 = FWD, 1 = RWD, 2 = AWD
  numCylinders: number
  carGroup: number

  // Collision
  smashableVelDiff: number  // velocity loss from collision (m/s)
  smashableMass: number     // mass of hit object (kg)

  // World position (meters)
  positionX: number
  positionY: number
  positionZ: number

  // Dynamics
  speed: number    // m/s
  power: number    // watts
  torque: number   // Nm

  // Tire temps (°C)
  tireTempFrontLeft: number
  tireTempFrontRight: number
  tireTempRearLeft: number
  tireTempRearRight: number

  // Misc
  boost: number     // PSI above atmospheric
  fuel: number      // 0.0 = empty, 1.0 = full
  distanceTraveled: number  // meters

  // Lap times (seconds, 0 if not applicable)
  bestLap: number
  lastLap: number
  currentLap: number
  currentRaceTime: number

  // Race status
  lapNumber: number
  racePosition: number

  // Inputs (0–255)
  accel: number
  brake: number
  clutch: number
  handBrake: number

  // Gear & steering
  gear: number   // current gear
  steer: number  // -127 = full left, 0 = center, 127 = full right

  // Driving line
  normalizedDrivingLine: number       // -127 to 127
  normalizedAIBrakeDifference: number // -127 to 127
}

