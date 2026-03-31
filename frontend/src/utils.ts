// Shared utility functions

export const normalizeUrl = (u: string) => u.replace(/\/$/, '').toLowerCase()

export function calcAutoTheme(lightStart: string, darkStart: string): 'dark' | 'light' {
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [lH, lM] = (lightStart || '08:00').split(':').map(Number)
  const [dH, dM] = (darkStart || '20:00').split(':').map(Number)
  const light = lH * 60 + lM
  const dark = dH * 60 + dM
  if (light < dark) return current >= light && current < dark ? 'light' : 'dark'
  return current >= light || current < dark ? 'light' : 'dark'
}

export function containerCounts(containers: { state: string }[]) {
  let running = 0, stopped = 0, restarting = 0
  for (const c of containers) {
    if (c.state === 'running') running++
    else if (c.state === 'restarting') restarting++
    else if (c.state === 'exited' || c.state === 'dead' || c.state === 'created') stopped++
  }
  return { running, stopped, restarting }
}

/** Convert Celsius to Fahrenheit, rounded to one decimal. */
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10
}

/**
 * Format a temperature value for display, converting units if needed.
 * @param raw       - numeric value or string (e.g. entity.state)
 * @param rawUnit   - unit from the data source ("°C", "°F", or undefined)
 * @param prefUnit  - user preference from settings.temp_unit
 */
export function formatTemperature(
  raw: number | string,
  rawUnit: string | null | undefined,
  prefUnit: 'celsius' | 'fahrenheit' = 'celsius',
): { value: string; unit: string } {
  const num = typeof raw === 'number' ? raw : parseFloat(raw)
  if (isNaN(num)) return { value: String(raw), unit: rawUnit ?? '' }
  const sourceIsCelsius = !rawUnit || rawUnit === '°C' || rawUnit.toLowerCase() === 'c'
  if (prefUnit === 'fahrenheit' && sourceIsCelsius) {
    const converted = celsiusToFahrenheit(num)
    return { value: Number.isInteger(converted) ? String(converted) : converted.toFixed(1), unit: '°F' }
  }
  const display = Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '')
  return { value: display, unit: rawUnit ?? '°C' }
}
