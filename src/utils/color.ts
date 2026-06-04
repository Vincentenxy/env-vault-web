/**
 * Element Plus 主色调 shade 工具。
 *
 * Element Plus 的 primary 色用了一组 CSS 变量:
 *   --el-color-primary
 *   --el-color-primary-light-3
 *   --el-color-primary-light-5
 *   --el-color-primary-light-7
 *   --el-color-primary-light-8
 *   --el-color-primary-light-9
 *   --el-color-primary-dark-2
 *
 * 这里实现与 Element Plus 内部 mix 一致的简化算法:把目标色与白/黑按比例混合。
 */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): [number, number, number] | null {
  const s = hex.trim().replace(/^#/, '')
  if (s.length !== 3 && s.length !== 6) return null
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return [r, g, b]
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** 把 color 按 weight(0-100) 比例与 mixWith 混合。weight=0 返回 color,100 返回 mixWith。 */
export function mixColor(color: string, mixWith: string, weight: number): string {
  const a = hexToRgb(color)
  const b = hexToRgb(mixWith)
  if (!a || !b) return color
  const w = clamp(weight, 0, 100) / 100
  const [ar, ag, ab] = a
  const [br, bg, bb] = b
  return rgbToHex(ar + (br - ar) * w, ag + (bg - ag) * w, ab + (bb - ab) * w)
}

/**
 * 应用主色到 :root,把 --el-color-primary 及其 shade 全部写入。
 * 失败时静默回退,不影响应用启动。
 */
export function applyPrimaryColor(color: string): void {
  if (typeof document === 'undefined') return
  if (!hexToRgb(color)) return
  const root = document.documentElement
  root.style.setProperty('--el-color-primary', color)
  // 与 Element Plus 一致的 shade
  root.style.setProperty('--el-color-primary-light-3', mixColor(color, '#ffffff', 30))
  root.style.setProperty('--el-color-primary-light-5', mixColor(color, '#ffffff', 50))
  root.style.setProperty('--el-color-primary-light-7', mixColor(color, '#ffffff', 70))
  root.style.setProperty('--el-color-primary-light-8', mixColor(color, '#ffffff', 80))
  root.style.setProperty('--el-color-primary-light-9', mixColor(color, '#ffffff', 90))
  root.style.setProperty('--el-color-primary-dark-2', mixColor(color, '#000000', 20))
}

export const DefaultPrimaryColor = '#409eff'
