<script setup lang="ts">
type Mode = 'race' | 'drift' | 'drag' | 'spotter'

const mode = ref<Mode>('race')

const {
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
const showHelp = ref(false)
const { public: { fh6UdpPort } } = useRuntimeConfig()
</script>

<template>
  <div class="dashboard">
    <div class="status-bar">
      <span :class="['status-dot', connected ? 'status-dot--live' : 'status-dot--off']" />
      <span>{{ connected ? 'Live' : 'Waiting for data…' }}</span>
      <button class="help-btn" aria-label="Setup help" @click="showHelp = !showHelp">?</button>
    </div>

    <div v-if="showHelp" class="help-panel">
      <p class="help-title">FH6 Data Out setup</p>
      <p class="help-body">In Forza Horizon 6, go to <strong>Settings &rarr; HUD and Gameplay</strong> and configure the following:</p>
      <div class="help-row"><span class="help-key">Data Out</span><span class="help-val">On</span></div>
      <div class="help-row"><span class="help-key">Data Out IP Address</span><span class="help-val">127.0.0.1</span></div>
      <div class="help-row"><span class="help-key">Data Out IP Port</span><span class="help-val">{{ fh6UdpPort }}</span></div>
      <p class="help-note">Data is only sent while actively driving — not in menus or paused.</p>
      <button class="help-close" @click="showHelp = false">Got it</button>
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
          <p class="metric-value">{{ speedKmh }}<span class="metric-unit">km/h</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">RPM</p>
          <p class="metric-value">{{ data ? Math.round(data.currentEngineRpm).toLocaleString() : '0' }}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Power</p>
          <!-- TODO: Verify this matches what FH6 actually sends once connected to real data.
               See powerKw in useTelemetry.ts for details and fallback formula. -->
          <p class="metric-value">{{ powerKw }}<span class="metric-unit">kW</span></p>
        </div>
        <div class="metric">
          <p class="metric-label">Torque</p>
          <p class="metric-value">{{ data ? Math.round(data.torque) : '0' }}<span class="metric-unit">Nm</span></p>
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
            {{ data ? Math.round(data[key]) : '--' }}°
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
          <p class="metric-value">{{ speedKmh }}<span class="metric-unit">km/h</span></p>
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
            {{ data ? Math.round(data[key]) : '--' }}°
          </p>
        </div>
      </div>

      <p class="section-label">Session</p>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Distance</p>
          <p class="metric-value">{{ data ? Math.round(data.distanceTraveled) : '0' }}<span class="metric-unit">m</span></p>
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
          <p class="metric-value">{{ speedKmh }}<span class="metric-unit">km/h</span></p>
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
          <p class="metric-value">{{ speedKmh }}<span class="metric-unit">km/h</span></p>
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
.status-dot--live { background: var(--pw-green); }
.status-dot--off { background: var(--pw-text-muted); }

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

.help-btn { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; border: 0.5px solid var(--pw-border-subtle); background: transparent; font-size: 12px; font-weight: 500; color: var(--pw-text-muted); cursor: pointer; line-height: 1; padding: 0; }
.help-btn:hover { background: var(--pw-surface); }

.help-panel { background: var(--pw-surface); border-radius: 8px; border: 0.5px solid var(--pw-border); padding: 1rem; margin-bottom: 1.25rem; }
.help-title { font-size: 14px; font-weight: 500; margin: 0 0 0.5rem; }
.help-body { font-size: 13px; color: var(--pw-text-secondary); margin: 0 0 0.75rem; }
.help-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 0.5px solid var(--pw-border); }
.help-key { font-size: 12px; color: var(--pw-text-muted); }
.help-val { font-size: 13px; font-weight: 500; font-family: monospace; color: var(--pw-text-mono); }
.help-note { font-size: 12px; color: var(--pw-text-muted); margin: 0.75rem 0 0.75rem; border-top: 0.5px solid var(--pw-border); padding-top: 0.75rem; }
.help-close { width: 100%; padding: 8px; border-radius: 8px; border: 0.5px solid var(--pw-border-subtle); background: transparent; font-size: 13px; cursor: pointer; }
.help-close:hover { background: var(--pw-hover); }
</style>
