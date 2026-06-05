/**
 * API 调用的统一包装层。
 *
 * **当前职责**:透传。拦截器已经把所有非 0 码归一为 `ApiError` 并展示 `msg`,
 * store / view 不需要再二次包装,直接 `await apiFn()` 即可。
 *
 * 保留这个文件的原因:
 *  - 调用方不感知 store / composable 边界,统一走同一入口,后续如果需要
 *    集中加"基于具体 code 的差异化处理"(例如 `code: 1401` → 跳登录),
 *    只需要在这里扩展,不需要改 6 个 store。
 */
export async function withApiCall<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}
