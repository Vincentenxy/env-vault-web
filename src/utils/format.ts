/** 简单 ISO 时间格式化,本期只暴露占位,后续业务用 dayjs / date-fns 替换。 */
export function formatDateTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** UI 层 Secret value 遮显,仅显示前 2 后 2 字符。空值返回空串。 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`
}
