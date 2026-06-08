<script setup lang="ts">
type Mode = 'race' | 'drift' | 'drag' | 'spotter'
type SpeedUnit = 'kmh' | 'mph'
type PowerUnit = 'kw' | 'hp'
type TorqueUnit = 'nm' | 'lbft'
type TemperatureUnit = 'c' | 'f'

const STORAGE_KEYS = {
  mode: 'fh6-pitwall:mode',
  speedUnit: 'fh6-pitwall:speed-unit',
  powerUnit: 'fh6-pitwall:power-unit',
  torqueUnit: 'fh6-pitwall:torque-unit',
  temperatureUnit: 'fh6-pitwall:temperature-unit',
} as const

function readStoredValue<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!import.meta.client) return fallback

  const stored = window.localStorage.getItem(key)
  return stored && allowed.includes(stored as T) ? (stored as T) : fallback
}

const CAR_CLASS_LABELS: Record<number, string> = {
  0: 'D',
  1: 'C',
  2: 'B',
  3: 'A',
  4: 'S1',
  5: 'S2',
  6: 'X',
  7: 'X',
}

interface CarLookupResponse {
  carOrdinal: number | null
  carGroup: number | null
  car: {
    id: number
    displayName: string
    year: number | null
    make: string | null
    model: string | null
    asset: string | null
    confidence: string | null
  } | null
  carGroupName: string | null
}

const mode = ref<Mode>('race')
const speedUnitSetting = ref<SpeedUnit>('kmh')
const powerUnitSetting = ref<PowerUnit>('hp')
const torqueUnitSetting = ref<TorqueUnit>('nm')
const temperatureUnitSetting = ref<TemperatureUnit>('c')
const carDetails = ref<CarLookupResponse | null>(null)
let carDetailsRequestId = 0
const { theme, toggleTheme } = useTheme()

const {
  data,
  streamState,
  rpmPercent,
  throttlePct,
  brakePct,
  yawRate,
  driftAngleDeg,
  launchRpm,
  zeroToHundred,
  rearWheelspin,
  lapDelta,
} = useTelemetry()

function tireTempColor(temp: number): string {
  if (temp < 70) return '#378ADD'
  if (temp < 90) return '#BA7517'
  if (temp < 105) return '#D85A30'
  return '#A32D2D'
}

function slipColor(slip: number): string {
  const abs = Math.abs(slip)
  if (abs < 0.3) return '#3B6D11'
  if (abs < 0.8) return '#BA7517'
  return '#A32D2D'
}

function formatLap(seconds: number): string {
  if (seconds === 0) return '--:--.--'
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function deltaColor(delta: number | null): string {
  if (delta === null) return '#888'
  return delta <= 0 ? '#3B6D11' : '#A32D2D'
}

const lapDeltaFormatted = computed(() => {
  if (lapDelta.value === null) return '--'
  const sign = lapDelta.value <= 0 ? '-' : '+'
  return sign + Math.abs(lapDelta.value).toFixed(3)
})

const steerPercent = computed(() => {
  if (!data.value) return 50
  return 50 + (data.value.steer / 127) * 46
})
const speedDisplay = computed(() => {
  if (!data.value) return 0
  const speedKmh = data.value.speed * 3.6
  return Math.round(speedUnitSetting.value === 'kmh' ? speedKmh : speedKmh * 0.621371)
})
const speedUnit = computed(() => speedUnitSetting.value === 'kmh' ? 'km/h' : 'mph')
const powerDisplay = computed(() => {
  if (!data.value) return 0
  return Math.round(powerUnitSetting.value === 'kw' ? data.value.power / 1000 : data.value.power / 745.7)
})
const powerUnit = computed(() => powerUnitSetting.value === 'kw' ? 'kW' : 'hp')
const torqueDisplay = computed(() => {
  if (!data.value) return 0
  return Math.round(torqueUnitSetting.value === 'nm' ? data.value.torque : data.value.torque * 0.737562)
})
const torqueUnit = computed(() => torqueUnitSetting.value === 'nm' ? 'Nm' : 'lb-ft')
const distanceDisplay = computed(() => {
  if (!data.value) return 0
  if (speedUnitSetting.value === 'kmh') return Math.round(data.value.distanceTraveled)
  return Number((data.value.distanceTraveled / 1609.344).toFixed(2))
})
const distanceUnit = computed(() => speedUnitSetting.value === 'kmh' ? 'm' : 'mi')
const tempUnit = computed(() => temperatureUnitSetting.value === 'c' ? 'C' : 'F')
function formatTemperature(tempC: number): string {
  const value = temperatureUnitSetting.value === 'c' ? tempC : (tempC * 9) / 5 + 32
  return `${Math.round(value)}°${tempUnit.value}`
}
const carClassLabel = computed(() => {
  if (!data.value) return '--'
  return CAR_CLASS_LABELS[data.value.carClass] ?? String(data.value.carClass)
})
const drivetrainLabel = computed(() => {
  if (!data.value) return '--'
  return ['FWD', 'RWD', 'AWD'][data.value.drivetrainType] ?? String(data.value.drivetrainType)
})
const carIdentityKey = computed(() => {
  if (!data.value) return ''
  return `${data.value.carOrdinal}:${data.value.carGroup}`
})
const carDisplayName = computed(() => {
  if (carDetails.value?.car) return carDetails.value.car.displayName
  return data.value ? `Car #${data.value.carOrdinal}` : '--'
})
const carGroupDisplayName = computed(() => {
  if (carDetails.value?.carGroupName) return carDetails.value.carGroupName
  return data.value ? `Group ${data.value.carGroup}` : '--'
})
const streamStatusLabel = computed(() => {
  if (streamState.value === 'live') return 'Live'
  if (streamState.value === 'connected') return 'Connected - waiting for data'
  return 'Disconnected'
})
const showHelp = ref(false)
const showSettings = ref(false)
const { public: { fh6UdpPort } } = useRuntimeConfig()

onMounted(() => {
  mode.value = readStoredValue(STORAGE_KEYS.mode, ['race', 'drift', 'drag', 'spotter'] as const, mode.value)
  speedUnitSetting.value = readStoredValue(STORAGE_KEYS.speedUnit, ['kmh', 'mph'] as const, speedUnitSetting.value)
  powerUnitSetting.value = readStoredValue(STORAGE_KEYS.powerUnit, ['kw', 'hp'] as const, powerUnitSetting.value)
  torqueUnitSetting.value = readStoredValue(STORAGE_KEYS.torqueUnit, ['nm', 'lbft'] as const, torqueUnitSetting.value)
  temperatureUnitSetting.value = readStoredValue(STORAGE_KEYS.temperatureUnit, ['c', 'f'] as const, temperatureUnitSetting.value)
})

if (import.meta.client) {
  watch(mode, (value) => window.localStorage.setItem(STORAGE_KEYS.mode, value))
  watch(speedUnitSetting, (value) => window.localStorage.setItem(STORAGE_KEYS.speedUnit, value))
  watch(powerUnitSetting, (value) => window.localStorage.setItem(STORAGE_KEYS.powerUnit, value))
  watch(torqueUnitSetting, (value) => window.localStorage.setItem(STORAGE_KEYS.torqueUnit, value))
  watch(temperatureUnitSetting, (value) => window.localStorage.setItem(STORAGE_KEYS.temperatureUnit, value))
}

watch(carIdentityKey, async (identityKey) => {
  if (!identityKey) {
    carDetails.value = null
    return
  }

  const [ordinal, group] = identityKey.split(':')
  const requestId = ++carDetailsRequestId
  carDetails.value = null

  try {
    const details = await $fetch<CarLookupResponse>('/api/cars/lookup', {
      query: { ordinal, group },
    })

    if (requestId === carDetailsRequestId) {
      carDetails.value = details
    }
  }
  catch {
    if (requestId === carDetailsRequestId) {
      carDetails.value = {
        carOrdinal: Number(ordinal),
        carGroup: Number(group),
        car: null,
        carGroupName: null,
      }
    }
  }
})
</script>

<template>
  <div class="dashboard">
    <div class="status-bar">
      <span :class="['status-dot', `status-dot--${streamState}`]" />
      <span>{{ streamStatusLabel }}</span>
      <a
        class="github-link"
        href="https://github.com/kevinfrom/fh6-pitwall"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open GitHub repository"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.84-.01-1.53-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.15-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.83.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.42 7.42 0 0 1 8 3.96c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.91 3.83-3.73 4.04.29.26.55.76.55 1.54 0 1.1-.01 1.99-.01 2.26 0 .22.15.48.55.4A8.14 8.14 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
        </svg>
      </a>
      <button class="settings-btn" aria-label="Settings" @click="showSettings = true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.28 7.28 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.24-1.18.56-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46c-.12.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.13.22.39.31.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.22.09.48 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
        </svg>
      </button>
      <button class="theme-btn" :aria-label="`Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`" :title="`Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`" @click="toggleTheme">
        <svg v-if="theme.value === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM4.22 6.34a1 1 0 0 1 1.41 0l1.06 1.06a1 1 0 1 1-1.41 1.41L4.22 7.75a1 1 0 0 1 0-1.41ZM5.5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1.5a1 1 0 0 1 1 1Zm1.19 4.6-1.06 1.06a1 1 0 1 1-1.41-1.41l1.06-1.06a1 1 0 1 1 1.41 1.41ZM12 18.5a1 1 0 0 1 1 1V21a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1Zm5.31-1.84 1.06 1.06a1 1 0 1 1-1.41 1.41l-1.06-1.06a1 1 0 1 1 1.41-1.41ZM20.5 12a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-1.5a1 1 0 0 1-1-1Zm-2.67-5.14a1 1 0 0 1 0-1.41l1.06-1.06a1 1 0 1 1 1.41 1.41l-1.06 1.06a1 1 0 0 1-1.41 0Z" />
        </svg>
      </button>
      <button class="help-btn" aria-label="Setup help" @click="showHelp = true">?</button>
    </div>

    <div v-if="showSettings" class="modal-backdrop" @click.self="showSettings = false">
      <section class="settings-modal" aria-modal="true" role="dialog" aria-labelledby="settings-title">
        <div class="modal-title-row">
          <h2 id="settings-title">Settings</h2>
          <button class="modal-close" aria-label="Close settings" @click="showSettings = false">x</button>
        </div>

        <p class="section-label">Units</p>
        <div class="unit-settings">
          <div class="unit-setting-row">
            <span>Speed</span>
            <div class="segmented-control" role="group" aria-label="Speed unit">
              <button
                :class="['segment-btn', speedUnitSetting === 'kmh' && 'segment-btn--active']"
                @click="speedUnitSetting = 'kmh'"
              >
                km/h
              </button>
              <button
                :class="['segment-btn', speedUnitSetting === 'mph' && 'segment-btn--active']"
                @click="speedUnitSetting = 'mph'"
              >
                mph
              </button>
            </div>
          </div>
          <div class="unit-setting-row">
            <span>Power</span>
            <div class="segmented-control" role="group" aria-label="Power unit">
              <button
                :class="['segment-btn', powerUnitSetting === 'hp' && 'segment-btn--active']"
                @click="powerUnitSetting = 'hp'"
              >
                hp
              </button>
              <button
                :class="['segment-btn', powerUnitSetting === 'kw' && 'segment-btn--active']"
                @click="powerUnitSetting = 'kw'"
              >
                kW
              </button>
            </div>
          </div>
          <div class="unit-setting-row">
            <span>Torque</span>
            <div class="segmented-control" role="group" aria-label="Torque unit">
              <button
                :class="['segment-btn', torqueUnitSetting === 'nm' && 'segment-btn--active']"
                @click="torqueUnitSetting = 'nm'"
              >
                Nm
              </button>
              <button
                :class="['segment-btn', torqueUnitSetting === 'lbft' && 'segment-btn--active']"
                @click="torqueUnitSetting = 'lbft'"
              >
                lb-ft
              </button>
            </div>
          </div>
          <div class="unit-setting-row">
            <span>Temperature</span>
            <div class="segmented-control" role="group" aria-label="Temperature unit">
              <button
                :class="['segment-btn', temperatureUnitSetting === 'c' && 'segment-btn--active']"
                @click="temperatureUnitSetting = 'c'"
              >
                °C
              </button>
              <button
                :class="['segment-btn', temperatureUnitSetting === 'f' && 'segment-btn--active']"
                @click="temperatureUnitSetting = 'f'"
              >
                °F
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="showHelp" class="modal-backdrop" @click.self="showHelp = false">
      <section class="settings-modal" aria-modal="true" role="dialog" aria-labelledby="help-title">
        <div class="modal-title-row">
          <h2 id="help-title">FH6 Data Out setup</h2>
          <button class="modal-close" aria-label="Close help" @click="showHelp = false">x</button>
        </div>

        <p class="help-body">In Forza Horizon 6, go to <strong>Settings &rarr; HUD and Gameplay</strong> and configure the following:</p>
        <div class="help-row"><span class="help-key">Data Out</span><span class="help-val">On</span></div>
        <div class="help-row"><span class="help-key">Data Out IP Address</span><span class="help-val">127.0.0.1</span></div>
        <div class="help-row"><span class="help-key">Data Out IP Port</span><span class="help-val">{{ fh6UdpPort }}</span></div>
        <p class="help-note">Data is only sent while actively driving — not in menus or paused.</p>
        <button class="help-close" @click="showHelp = false">Got it</button>
      </section>
    </div>

    <p class="section-label">Current car</p>
    <div class="car-card">
      <div class="car-card-main">
        <p class="car-name">{{ carDisplayName }}</p>
        <p class="car-subtitle">{{ carGroupDisplayName }}</p>
        <p class="car-specs">{{ carClassLabel }} {{ data?.carPerformanceIndex ?? '--' }} - {{ drivetrainLabel }}</p>
      </div>
    </div>

    <div class="mode-switcher">
      <button
        :class="['mode-btn', mode === 'race' && 'mode-btn--race']"
        @click="mode = 'race'"
      >
        Race
      </button>
      <button
        :class="['mode-btn', mode === 'drift' && 'mode-btn--drift']"
        @click="mode = 'drift'"
      >
        Drift
      </button>
      <button
        :class="['mode-btn', mode === 'drag' && 'mode-btn--drag']"
        @click="mode = 'drag'"
      >
        Drag
      </button>
      <button
        :class="['mode-btn', mode === 'spotter' && 'mode-btn--spotter']"
        @click="mode = 'spotter'"
      >
        Spotter
      </button>
    </div>

    <!-- Race mode -->
    <template v-if="mode === 'race'">
      <p class="section-label">Speed & engine</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Speed</p>
          <p class="metric-value">{{ speedDisplay }}<span class="metric-unit">{{ speedUnit }}</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">RPM</p>
          <p class="metric-value">{{ data ? Math.round(data.currentEngineRpm).toLocaleString() : '0' }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Power</p>
          <!-- TODO: Verify this matches what FH6 actually sends once connected to real data.
               See useTelemetry.ts for details and fallback formula. -->
          <p class="metric-value">{{ powerDisplay }}<span class="metric-unit">{{ powerUnit }}</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">Torque</p>
          <p class="metric-value">{{ torqueDisplay }}<span class="metric-unit">{{ torqueUnit }}</span></p>
        </div>
      </div>

      <p class="section-label">Throttle & brake</p>
      <div class="bar-grid">
        <div class="bar-card">
          <p class="metric-label">Throttle</p>
          <div class="bar-track">
            <div class="bar-fill bar-fill--throttle" :style="{ width: throttlePct + '%' }" />
          </div>
          <p class="bar-value">{{ throttlePct }}%</p>
        </div>
        <div class="bar-card">
          <p class="metric-label">Brake</p>
          <div class="bar-track">
            <div class="bar-fill bar-fill--brake" :style="{ width: brakePct + '%' }" />
          </div>
          <p class="bar-value">{{ brakePct }}%</p>
        </div>
      </div>

      <p class="section-label">Gear & steering</p>
      <div class="gear-row">
        <div class="gear-box">
          <p class="gear-value">{{ data?.gear ?? '-' }}</p>
          <p class="metric-label">gear</p>
        </div>
        <div class="bar-card">
          <p class="metric-label">Steering</p>
          <div class="steer-track">
            <div class="steer-center" />
            <div class="steer-dot steer-dot--race" :style="{ left: steerPercent + '%' }" />
          </div>
          <div class="steer-labels">
            <span>L</span>
            <span>{{ data ? (data.steer >= 0 ? '+' : '') + data.steer : '0' }}</span>
            <span>R</span>
          </div>
        </div>
      </div>

      <p class="section-label">Tire temps</p>
      <div class="tire-grid">
        <div v-for="(key, label) in { FL: 'tireTempFrontLeft', FR: 'tireTempFrontRight', RL: 'tireTempRearLeft', RR: 'tireTempRearRight' }" :key="label" class="tire-card">
          <p class="tire-pos">{{ label }}</p>
          <p class="tire-temp" :style="{ color: tireTempColor(data?.[key] ?? 0) }">
            {{ data ? formatTemperature(data[key]) : '--' }}
          </p>
        </div>
      </div>

      <p class="section-label">Lap times</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Current</p>
          <p class="metric-value metric-value--sm">{{ formatLap(data?.currentLap ?? 0) }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Last</p>
          <p class="metric-value metric-value--sm">{{ formatLap(data?.lastLap ?? 0) }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Best</p>
          <p class="metric-value metric-value--sm metric-value--best">{{ formatLap(data?.bestLap ?? 0) }}</p>
        </div>
      </div>
    </template>

    <!-- Drift mode -->
    <template v-else-if="mode === 'drift'">
      <p class="section-label">Speed & engine</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Speed</p>
          <p class="metric-value">{{ speedDisplay }}<span class="metric-unit">{{ speedUnit }}</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">RPM</p>
          <p class="metric-value">{{ data ? Math.round(data.currentEngineRpm).toLocaleString() : '0' }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Boost</p>
          <p class="metric-value">{{ data ? data.boost.toFixed(1) : '0.0' }}<span class="metric-unit">psi</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">Throttle</p>
          <p class="metric-value">{{ throttlePct }}<span class="metric-unit">%</span></p>
        </div>
      </div>

      <p class="section-label">Drift angle</p>
      <div class="drift-angle-row">
        <div class="angle-card">
          <p class="angle-value">{{ driftAngleDeg }}°</p>
          <p class="metric-label">slip angle</p>
        </div>
        <div class="bar-card">
          <p class="metric-label">Yaw rate</p>
          <p class="yaw-value">{{ yawRate }} <span class="metric-unit">rad/s</span></p>
          <p class="metric-label" style="margin-top: 12px;">Counter-steer</p>
          <div class="steer-track">
            <div class="steer-center" />
            <div class="steer-dot steer-dot--drift" :style="{ left: steerPercent + '%' }" />
          </div>
          <div class="steer-labels">
            <span>L</span>
            <span>{{ data ? (data.steer >= 0 ? '+' : '') + data.steer : '0' }}</span>
            <span>R</span>
          </div>
        </div>
      </div>

      <p class="section-label">Tire slip per wheel</p>
      <div class="tire-grid">
        <div v-for="(key, label) in { FL: 'tireCombinedSlipFrontLeft', FR: 'tireCombinedSlipFrontRight', RL: 'tireCombinedSlipRearLeft', RR: 'tireCombinedSlipRearRight' }" :key="label" class="tire-card">
          <p class="tire-pos">{{ label }}</p>
          <p class="tire-temp" :style="{ color: slipColor(data?.[key] ?? 0) }">
            {{ data ? Math.abs(data[key]).toFixed(2) : '0.00' }}
          </p>
        </div>
      </div>

      <p class="section-label">Tire temps</p>
      <div class="tire-grid">
        <div v-for="(key, label) in { FL: 'tireTempFrontLeft', FR: 'tireTempFrontRight', RL: 'tireTempRearLeft', RR: 'tireTempRearRight' }" :key="label" class="tire-card">
          <p class="tire-pos">{{ label }}</p>
          <p class="tire-temp" :style="{ color: tireTempColor(data?.[key] ?? 0) }">
            {{ data ? formatTemperature(data[key]) : '--' }}
          </p>
        </div>
      </div>

      <p class="section-label">Session</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Distance</p>
          <p class="metric-value">{{ distanceDisplay }}<span class="metric-unit">{{ distanceUnit }}</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">Race time</p>
          <p class="metric-value metric-value--sm">{{ formatLap(data?.currentRaceTime ?? 0) }}</p>
        </div>
      </div>
    </template>
    <!-- Drag mode -->
    <template v-else-if="mode === 'drag'">
      <p class="section-label">Run</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Speed</p>
          <p class="metric-value">{{ speedDisplay }}<span class="metric-unit">{{ speedUnit }}</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">Gear</p>
          <p class="metric-value">{{ data?.gear ?? '-' }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">RPM</p>
          <p class="metric-value" style="font-size: 16px;">{{ data ? Math.round(data.currentEngineRpm).toLocaleString() : '0' }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Launch RPM</p>
          <p class="metric-value" style="font-size: 16px;">{{ launchRpm > 0 ? launchRpm.toLocaleString() : '--' }}</p>
        </div>
      </div>

      <p class="section-label">0–100 km/h</p>
      <div class="big-metric">
        <p class="big-metric-value">
          {{ zeroToHundred !== null ? zeroToHundred.toFixed(2) : '--' }}
          <span class="metric-unit">s</span>
        </p>
        <p class="metric-label">{{ zeroToHundred !== null ? 'latched — drop to 0 to reset' : 'waiting for launch…' }}</p>
      </div>

      <p class="section-label">Rear wheelspin</p>
      <div :class="['wheelspin-indicator', rearWheelspin && 'wheelspin-indicator--active']">
        {{ rearWheelspin ? 'Spinning' : 'Grip' }}
      </div>

      <p class="section-label">Inputs</p>
      <div class="bar-grid">
        <div class="bar-card">
          <p class="metric-label">Throttle</p>
          <div class="bar-track">
            <div class="bar-fill bar-fill--throttle" :style="{ width: throttlePct + '%' }" />
          </div>
          <p class="bar-value">{{ throttlePct }}%</p>
        </div>
        <div class="bar-card">
          <p class="metric-label">Brake</p>
          <div class="bar-track">
            <div class="bar-fill bar-fill--brake" :style="{ width: brakePct + '%' }" />
          </div>
          <p class="bar-value">{{ brakePct }}%</p>
        </div>
      </div>
    </template>

    <!-- Spotter mode -->
    <template v-else-if="mode === 'spotter'">
      <p class="section-label">Position</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Position</p>
          <p class="metric-value">{{ data?.racePosition ?? '--' }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Lap</p>
          <p class="metric-value">{{ data?.lapNumber ?? '--' }}</p>
        </div>
      </div>

      <p class="section-label">Delta to best lap</p>
      <div class="big-metric">
        <p class="big-metric-value" :style="{ color: deltaColor(lapDelta) }">
          {{ lapDeltaFormatted }}
          <span class="metric-unit" style="font-size: 16px;">s</span>
        </p>
        <p class="metric-label">{{ lapDelta === null ? 'no best lap yet' : lapDelta <= 0 ? 'ahead of best' : 'behind best' }}</p>
      </div>

      <p class="section-label">Lap times</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Current</p>
          <p class="metric-value metric-value--sm">{{ formatLap(data?.currentLap ?? 0) }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Last</p>
          <p class="metric-value metric-value--sm">{{ formatLap(data?.lastLap ?? 0) }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Best</p>
          <p class="metric-value metric-value--sm metric-value--best">{{ formatLap(data?.bestLap ?? 0) }}</p>
        </div>
      </div>

      <p class="section-label">Speed</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Speed</p>
          <p class="metric-value">{{ speedDisplay }}<span class="metric-unit">{{ speedUnit }}</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">Gear</p>
          <p class="metric-value">{{ data?.gear ?? '-' }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard { padding: 1rem; font-family: var(--pw-font, sans-serif); }

.status-bar { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--pw-text-muted); margin-bottom: 1rem; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pw-text-muted); }
.status-dot--connected { background: var(--pw-amber); }
.status-dot--disconnected { background: var(--pw-text-muted); }
.status-dot--live { background: var(--pw-green); }

.car-card { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(220px, 1fr); align-items: center; gap: 12px; background: var(--pw-surface); border-radius: 8px; padding: 0.8rem 1rem; margin-bottom: 1.25rem; }
.car-card-main { min-width: 0; }
.car-name { margin: 0; color: var(--pw-text); font-size: 15px; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere; }
.car-subtitle { margin: 3px 0 0; color: var(--pw-text-muted); font-size: 12px; line-height: 1.2; overflow-wrap: anywhere; }
.car-specs { margin: 6px 0 0; color: var(--pw-text-mono); font-family: monospace; font-size: 13px; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere; }

.mode-switcher { display: flex; gap: 8px; margin-bottom: 1.25rem; }
.mode-btn { flex: 1; padding: 8px; border-radius: 8px; border: 0.5px solid var(--pw-border-subtle); background: transparent; font-size: 13px; font-weight: 500; cursor: pointer; }
.mode-btn--race { background: var(--pw-blue-bg); border-color: var(--pw-blue-border); color: var(--pw-blue-text); }
.mode-btn--drift { background: var(--pw-amber-bg); border-color: var(--pw-amber-border); color: var(--pw-amber-text); }

.section-label { font-size: 11px; color: var(--pw-text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin: 1.25rem 0 0.5rem; }

.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
.metric { background: var(--pw-surface); border-radius: 8px; padding: 0.75rem 1rem; }
.metric-label { font-size: 11px; color: var(--pw-text-muted); margin: 0 0 4px; }
.metric-value { font-size: 22px; font-weight: 500; margin: 0; line-height: 1; }
.metric-value--sm { font-size: 16px; }
.metric-value--best { color: var(--pw-green); }
.metric-unit { font-size: 12px; color: var(--pw-text-muted); margin-left: 2px; }

.bar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bar-card { background: var(--pw-surface); border-radius: 8px; padding: 0.75rem 1rem; }
.bar-track { background: var(--pw-border); border-radius: 4px; height: 6px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.15s ease; }
.bar-fill--throttle { background: var(--pw-green); }
.bar-fill--brake { background: var(--pw-red); }
.bar-value { font-size: 12px; color: var(--pw-text-muted); margin: 4px 0 0; }

.gear-row { display: grid; grid-template-columns: 80px 1fr; gap: 10px; }
.gear-box { background: var(--pw-surface); border-radius: 8px; padding: 0.75rem 1rem; text-align: center; }
.gear-value { font-size: 40px; font-weight: 500; margin: 0; line-height: 1; }

.steer-track { position: relative; height: 6px; background: var(--pw-border); border-radius: 4px; margin-top: 8px; }
.steer-center { position: absolute; left: 50%; top: -2px; width: 2px; height: 10px; background: var(--pw-border-subtle); transform: translateX(-50%); }
.steer-dot { position: absolute; top: -5px; width: 16px; height: 16px; border-radius: 50%; transform: translateX(-50%); transition: left 0.1s ease; }
.steer-dot--race { background: var(--pw-blue-border); }
.steer-dot--drift { background: var(--pw-amber-border); }
.steer-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--pw-text-muted); margin-top: 10px; }

.tire-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tire-card { background: var(--pw-surface); border-radius: 8px; padding: 0.6rem 0.75rem; text-align: center; }
.tire-pos { font-size: 10px; color: var(--pw-text-muted); margin: 0 0 2px; }
.tire-temp { font-size: 18px; font-weight: 500; margin: 0; }

.mode-btn--drag { background: var(--pw-teal-bg); border-color: var(--pw-teal-border); color: var(--pw-teal-text); }
.mode-btn--spotter { background: var(--pw-purple-bg); border-color: var(--pw-purple-border); color: var(--pw-purple-text); }

.big-metric { background: var(--pw-surface); border-radius: 8px; padding: 1.25rem 1rem; text-align: center; }
.big-metric-value { font-size: 48px; font-weight: 500; margin: 0; line-height: 1; }

.wheelspin-indicator { background: var(--pw-surface); border-radius: 8px; padding: 0.75rem 1rem; text-align: center; font-size: 18px; font-weight: 500; color: var(--pw-green); border: 2px solid transparent; transition: all 0.1s; }
.wheelspin-indicator--active { background: var(--pw-red-bg); color: var(--pw-red); border-color: var(--pw-red-border); }

.drift-angle-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.angle-card { background: var(--pw-surface); border-radius: 8px; padding: 1rem; text-align: center; }
.angle-value { font-size: 48px; font-weight: 500; margin: 0; line-height: 1; color: var(--pw-amber); }
.yaw-value { font-size: 28px; font-weight: 500; margin: 4px 0 0; }

.github-link,
.settings-btn,
.theme-btn,
.help-btn { width: 20px; height: 20px; border-radius: 50%; border: 0.5px solid var(--pw-border-subtle); background: transparent; color: var(--pw-text-muted); cursor: pointer; line-height: 1; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.github-link { margin-left: auto; }
.github-link svg { width: 13px; height: 13px; fill: currentColor; }
.settings-btn svg { width: 14px; height: 14px; fill: currentColor; }
.theme-btn svg { width: 13px; height: 13px; fill: currentColor; }
.help-btn { font-size: 12px; font-weight: 500; }
.github-link:hover,
.settings-btn:hover,
.theme-btn:hover,
.help-btn:hover { background: var(--pw-surface); }

.modal-backdrop { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgb(0 0 0 / 0.45); }
.settings-modal { width: min(360px, 100%); max-height: min(640px, 90vh); overflow: auto; background: var(--pw-bg); border: 0.5px solid var(--pw-border); border-radius: 8px; padding: 1rem; box-shadow: 0 18px 60px rgb(0 0 0 / 0.25); }
.modal-title-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.modal-title-row h2 { font-size: 16px; font-weight: 600; margin: 0; }
.modal-close { width: 24px; height: 24px; border-radius: 50%; border: 0.5px solid var(--pw-border-subtle); background: transparent; color: var(--pw-text-muted); cursor: pointer; line-height: 1; padding: 0; }
.modal-close:hover { background: var(--pw-surface); }
.unit-settings { display: grid; gap: 8px; }
.unit-setting-row { display: grid; grid-template-columns: minmax(92px, 1fr) minmax(148px, 1.4fr); align-items: center; gap: 10px; font-size: 13px; }
.unit-setting-row > span { color: var(--pw-text-muted); }
.segmented-control { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--pw-surface); border-radius: 8px; border: 0.5px solid var(--pw-border); }
.segment-btn { min-height: 32px; border: 0; border-radius: 6px; background: transparent; color: var(--pw-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; }
.segment-btn--active { background: var(--pw-bg); color: var(--pw-text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.help-body { font-size: 13px; color: var(--pw-text-secondary); margin: 0.75rem 0; }
.help-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 0.5px solid var(--pw-border); }
.help-key { font-size: 12px; color: var(--pw-text-muted); }
.help-val { font-size: 13px; font-weight: 500; font-family: monospace; color: var(--pw-text-mono); }
.help-note { font-size: 12px; color: var(--pw-text-muted); margin: 0.75rem 0 0.75rem; border-top: 0.5px solid var(--pw-border); padding-top: 0.75rem; }
.help-close { width: 100%; padding: 8px; border-radius: 8px; border: 0.5px solid var(--pw-border-subtle); background: transparent; font-size: 13px; cursor: pointer; }
.help-close:hover { background: var(--pw-hover); }

@media (max-width: 560px) {
  .car-card { grid-template-columns: 1fr; }
}
</style>
