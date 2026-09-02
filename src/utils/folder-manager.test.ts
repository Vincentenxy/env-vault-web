import { describe, expect, it } from 'vitest'
import { resolveCreateFolderManagerId } from './folder-manager'

describe('resolveCreateFolderManagerId', () => {
  it('uses the selected manager for a top-level folder', () => {
    expect(resolveCreateFolderManagerId(null, ' selected-manager ')).toBe('selected-manager')
  })

  it('inherits the groups manager for a child folder', () => {
    expect(
      resolveCreateFolderManagerId({ managerId: ' groups-manager ' }, 'selected-manager'),
    ).toBe('groups-manager')
  })
})
