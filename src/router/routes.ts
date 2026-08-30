import type { RouteRecordRaw } from 'vue-router'
import { Permission } from '@/constants/permission'

/**
 * 路由表。本期实际接入的页面:
 *  - /masterKey(系统启动阶段的受认证等待与分片输入页)
 *  - /login(系统本地认证登录)
 *  - /app/organizations(组织管理)
 *  - /app/projects(项目列表 - 卡片网格)
 *  - /app/projects/:projectId(项目详情:env 多选 + 目录树 + Secrets/Folder Tab)
 *  - /app/envs(环境管理)
 *  - /app/secrets(密钥管理)
 *  - /app/settings/profile(个人信息)
 *  - /app/settings/users(用户管理)
 *
 * 注:原 /app/folders 已合并到 /app/projects/:projectId,目录管理与密钥的浏览、
 * 创建、删除都在项目详情页内完成。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/masterKey',
    name: 'MasterKeySetup',
    component: () => import('@/views/auth/MasterKeyView.vue'),
    meta: { title: '系统主密钥', requiresAuth: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/app',
    component: () => import('@/layouts/DefaultLayout.vue'),
    redirect: '/app/secrets',
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
        meta: { title: '秘钥中心', requiresAuth: true },
      },
      {
        path: 'settings/profile',
        name: 'UserProfile',
        component: () => import('@/views/settings/UserProfileView.vue'),
        meta: { title: '个人信息', requiresAuth: true },
      },
      {
        path: 'settings/users',
        name: 'UserManagement',
        component: () => import('@/views/settings/UserManagementView.vue'),
        // 权限查询接口接入后，路由守卫使用该权限跳转 /forbidden。
        meta: { title: '用户管理', requiresAuth: true, permissions: [Permission.UserManage] },
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
    redirect: '/app/secrets',
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/NotFoundView.vue'),
    meta: { title: '未找到', requiresAuth: false },
  },
]
