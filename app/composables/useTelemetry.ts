import type { TelemetryPacket } from '~/types/telemetry'

export function useTelemetry() {
  const data = ref<TelemetryPacket | null>(null)
  const connected = ref(false)
  let source: EventSource | null = null

  function connect() {
    if (import.meta.server) return

    source = new EventSource('/api/telemetry/stream')

    source.onopen = () => {
      connected.value = true
    }

    source.onmessage = (event) => {
      data.value = JSON.parse(event.data) as TelemetryPacket
    }

    source.onerror = () => {
      connected.value = false
      // EventSource auto-reconnects; nothing to do here
    }
  }

  function disconnect() {
    source?.close()
    source = null
    connected.value = false
  }

  onMounted(connect)
  onUnmounted(disconnect)

  // --- Derived values ---

  const speedKmh = computed(() =>
    data.value ? Math.round(data.value.speed * 3.6) : 0,
  )

  const rpmPercent = computed(() => {
    if (!data.value) return 0
    const { currentEngineRpm, engineMaxRpm } = data.value
    return engineMaxRpm > 0 ? (currentEngineRpm / engineMaxRpm) * 100 : 0
  })

  // TODO: Verify this matches what FH6 actually sends once connected to real data.
  // Power should dynamically follow RPM and torque. Verify the raw `power` field
  // in the packet already reflects this — if not, compute it as:
  //   power (kW) = (torque * currentEngineRpm * Math.PI) / 30 / 1000
  const powerKw = computed(() =>
    data.value ? Math.round(data.value.power / 1000) : 0,
  )

  const throttlePct = computed(() =>
    data.value ? Math.round((data.value.accel / 255) * 100) : 0,
  )

  const brakePct = computed(() =>
    data.value ? Math.round((data.value.brake / 255) * 100) : 0,
  )

  // Drift-specific: yaw rate is angularVelocityY in the car's local space
  const yawRate = computed(() =>
    data.value ? Math.abs(data.value.angularVelocityY).toFixed(2) : '0.00',
  )

  // Approximate drift angle from rear tire combined slip — larger = more sideways
  const driftAngleDeg = computed(() => {
    if (!data.value) return 0
    const avgRearSlip = (
      Math.abs(data.value.tireSlipAngleRearLeft) +
      Math.abs(data.value.tireSlipAngleRearRight)
    ) / 2
    return Math.round(avgRearSlip * 45)  // rough mapping; tune once on real data
  })

  // --- Drag derived values ---

  // Latched RPM at the moment the throttle first goes full — launch RPM reference.
  // Reset when speed drops back to near zero (new run).
  const launchRpm = ref(0)
  const _dragArmed = ref(false)

  watch(data, (packet) => {
    if (!packet) return
    const speedKmhNow = packet.speed * 3.6
    if (speedKmhNow < 5) {
      _dragArmed.value = true
      launchRpm.value = 0
    }
    if (_dragArmed.value && launchRpm.value === 0 && packet.accel > 200) {
      launchRpm.value = Math.round(packet.currentEngineRpm)
      _dragArmed.value = false
    }
  })

  // Time to reach 100 km/h from a standing start, derived from raceTime.
  // Latches when speed first crosses 100 km/h and resets when speed drops below 5.
  const zeroToHundred = ref<number | null>(null)
  const _zeroToHundredStartTime = ref<number | null>(null)

  watch(data, (packet) => {
    if (!packet) return
    const speedKmhNow = packet.speed * 3.6
    if (speedKmhNow < 5) {
      zeroToHundred.value = null
      _zeroToHundredStartTime.value = null
    }
    if (_zeroToHundredStartTime.value === null && packet.accel > 200 && speedKmhNow < 10) {
      _zeroToHundredStartTime.value = packet.currentRaceTime
    }
    if (
      _zeroToHundredStartTime.value !== null &&
      zeroToHundred.value === null &&
      speedKmhNow >= 100
    ) {
      zeroToHundred.value = packet.currentRaceTime - _zeroToHundredStartTime.value
    }
  })

  // Rear wheelspin: true when either rear tire slip ratio exceeds 1.0
  const rearWheelspin = computed(() => {
    if (!data.value) return false
    return (
      Math.abs(data.value.tireSlipRatioRearLeft) > 1.0 ||
      Math.abs(data.value.tireSlipRatioRearRight) > 1.0
    )
  })

  // --- Spotter derived values ---

  // Delta to best lap in seconds — negative means ahead of best, positive means behind.
  // Returns null when bestLap is 0 (no best lap set yet).
  const lapDelta = computed((): number | null => {
    if (!data.value || data.value.bestLap === 0) return null
    return data.value.currentLap - data.value.bestLap
  })

  return {
    data,
    connected,
    speedKmh,
    rpmPercent,
    powerKw,
    throttlePct,
    brakePct,
    yawRate,
    driftAngleDeg,
    launchRpm,
    zeroToHundred,
    rearWheelspin,
    lapDelta,
  }
}
