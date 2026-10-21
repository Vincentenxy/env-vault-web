import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { installGuards } from './guards'
import { isPlatformEmbedded } from '@/utils/platform'

export const router = createRouter({
  history: isPlatformEmbedded
    ? createMemoryHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes,
})

installGuards(router)
