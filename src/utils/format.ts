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

/**
 * UI 层 Secret value 遮显 —— 无论原值多长,统一显示 `********`(8 个 *)。
 *
 * 不再暴露首尾字符(避免暗示长度/内容),不再随原值长度变星号数。
 * 空值返回空串(让调用方走 "—" 占位分支)。
 */
const MASKED = '********'
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  return MASKED
}
