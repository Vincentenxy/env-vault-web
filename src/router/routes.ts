import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由表。本期实际接入的页面:
 *  - /login(开发自测登录)
 *  - /app/organizations(组织管理)
 *  - /app/projects(项目列表 - 卡片网格)
 *  - /app/projects/:projectId(项目详情:env 多选 + 目录树 + Secrets/Folder Tab)
 *  - /app/envs(环境管理)
 *  - /app/secrets(密钥管理)
 *
 * 注:原 /app/folders 已合并到 /app/projects/:projectId,目录管理与密钥的浏览、
 * 创建、删除都在项目详情页内完成。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/app',
    component: () => import('@/layouts/DefaultLayout.vue'),
    redirect: '/app/organizations',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'organizations',
        name: 'OrganizationList',
        component: () => import('@/views/organization/OrganizationListView.vue'),
        meta: { title: '组织管理', requiresAuth: true },
      },
      {
        path: 'projects',
        name: 'ProjectList',
        component: () => import('@/views/project/ProjectListView.vue'),
        meta: { title: '项目管理', requiresAuth: true },
      },
      {
        path: 'projects/:projectId',
        name: 'ProjectDetail',
        component: () => import('@/views/project/ProjectDetailView.vue'),
        meta: { title: '项目详情', requiresAuth: true },
      },
      {
        path: 'envs',
        name: 'EnvList',
        component: () => import('@/views/env/EnvListView.vue'),
        meta: { title: '环境管理', requiresAuth: true },
      },
      {
        path: 'secrets',
        name: 'SecretList',
        component: () => import('@/views/secret/SecretListView.vue'),
        meta: { title: '密钥管理', requiresAuth: true },
      },
    ],
  },
  {
    path: '/forbidden',
    name: 'Forbidden',
    component: () => import('@/views/error/ForbiddenView.vue'),
    meta: { title: '无权访问', requiresAuth: false },
  },
  {
    path: '/',
    redirect: '/app/organizations',
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/NotFoundView.vue'),
    meta: { title: '未找到', requiresAuth: false },
  },
]
