const ENVIRONMENT_ORDER_STEP = 10

interface OrderedEnvironment {
  orderNo: number
}

export function calculateEnvironmentOrderNo(
  environments: OrderedEnvironment[],
  insertionIndex: number,
): number {
  if (!environments.length) return ENVIRONMENT_ORDER_STEP

  const index = Math.min(Math.max(insertionIndex, 0), environments.length)
  const previous = environments[index - 1]
  const next = environments[index]

  if (!previous && next) {
    return next.orderNo > 1 ? Math.max(1, next.orderNo - ENVIRONMENT_ORDER_STEP) : next.orderNo
  }
  if (previous && !next) return previous.orderNo + ENVIRONMENT_ORDER_STEP
  if (!previous || !next) return ENVIRONMENT_ORDER_STEP

  const gap = next.orderNo - previous.orderNo
  return gap > 1 ? Math.floor((previous.orderNo + next.orderNo) / 2) : next.orderNo
}
