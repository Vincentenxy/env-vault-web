import type { Actor } from './user'
import type { Uuid } from './api'

export interface Organization extends Actor {
  id: Uuid
  code: string
  name: string
  comment: string
  createdAt: string
  updatedAt: string
}
