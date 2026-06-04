/** 后端 v5+ 5 段式 Secret 路径解析结果。 */
export interface ParsedSecretPath {
  orgCode: string
  projectCode: string
  envCode: string
  folderCode: string
  key: string
}
