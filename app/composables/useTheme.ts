export type ThemePreference = 'light' | 'dark'

const THEME_STORAGE_KEY = 'fh6-pitwall:theme'

function systemTheme(): ThemePreference {
  if (!import.meta.client) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: ThemePreference) {
  if (!import.meta.client) return

  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function useTheme() {
  const theme = useState<ThemePreference>('fh6-theme', () => systemTheme())

  function setTheme(nextTheme: ThemePreference) {
    theme.value = nextTheme
    if (import.meta.client) {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      applyTheme(nextTheme)
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  if (import.meta.client) {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      theme.value = stored
    }
    else {
      theme.value = systemTheme()
    }

    applyTheme(theme.value)
  }

  return {
    theme,
    setTheme,
    toggleTheme,
  }
}
