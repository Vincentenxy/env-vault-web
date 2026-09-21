export const CARD_GRID_GAP = 14

// 计算卡片网格在当前可用宽度下可以容纳的列数
export function calculateCardColumns(
  containerWidth: number,
  minCardWidth: number,
  gap = CARD_GRID_GAP,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || minCardWidth <= 0) return 0
  return Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)))
}

// 计算卡片网格在当前可用高度下可以容纳的行数
export function calculateCardRows(
  containerHeight: number,
  cardHeight: number,
  gap = CARD_GRID_GAP,
): number {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0 || cardHeight <= 0) return 0
  return Math.max(1, Math.floor((containerHeight + gap) / (cardHeight + gap)))
}

// 使用当前区域的宽高计算首屏应请求的卡片数量
export function calculateCardPageSize(
  containerWidth: number,
  containerHeight: number,
  minCardWidth: number,
  cardHeight: number,
  gap = CARD_GRID_GAP,
): number {
  const columns = calculateCardColumns(containerWidth, minCardWidth, gap)
  const rows = calculateCardRows(containerHeight, cardHeight, gap)
  return columns && rows ? columns * rows : 0
}

// 获取元素扣除左右内边距后的实际网格宽度
export function measureContentWidth(element: HTMLElement | null): number {
  if (!element) return 0

  const rectWidth = element.getBoundingClientRect?.().width ?? 0
  const elementWidth = element.clientWidth || rectWidth
  if (!elementWidth) return 0

  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return elementWidth
  }

  const styles = window.getComputedStyle(element)
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0
  return Math.max(0, elementWidth - paddingLeft - paddingRight)
}

// 获取元素扣除上下内边距后的实际网格高度
export function measureContentHeight(element: HTMLElement | null): number {
  if (!element) return 0

  const rectHeight = element.getBoundingClientRect?.().height ?? 0
  const elementHeight = element.clientHeight || rectHeight
  if (!elementHeight) return 0

  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return elementHeight
  }

  const styles = window.getComputedStyle(element)
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0
  return Math.max(0, elementHeight - paddingTop - paddingBottom)
}
