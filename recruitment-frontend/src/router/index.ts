import { createRouter, createWebHistory } from 'vue-router';
import { getStoredModules, getStoredRole, getToken } from '../utils/auth';

const routes = [
  {
    path: '/login',
    component: () => import('../views/Login.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'dashboard' }
      },
      { path: 'jobs', component: () => import('../views/Jobs.vue'), meta: { roles: ['super_admin', 'hr_manager'], module: 'jobs' } },
      {
        path: 'resumes',
        component: () => import('../views/Resumes.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'resumes' }
      },
      {
        path: 'resumes/screening',
        component: () => import('../views/Screening.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'screening' }
      },
      {
        path: 'resumes/review',
        component: () => import('../views/Review.vue'),
        meta: { roles: ['super_admin', 'hr_manager', 'interviewer'], module: 'review' }
      },
      {
        path: 'interviews/scheduling',
        component: () => import('../views/SchedulingQueue.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'scheduling' }
      },
      {
        path: 'interviews',
        component: () => import('../views/Interviews.vue'),
        meta: { roles: ['super_admin', 'hr_manager', 'interviewer'], module: 'interviews' }
      },
      {
        path: 'offers',
        component: () => import('../views/Offers.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'offers' }
      },
      {
        path: 'interviews/schedule/:resumeId',
        component: () => import('../views/ScheduleInterview.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'scheduling' }
      },
      {
        path: 'talent-pool',
        component: () => import('../views/TalentPool.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'talent_pool' }
      },
      { path: 'people', component: () => import('../views/People.vue'), meta: { roles: ['super_admin', 'hr_manager'], module: 'people' } },
      {
        path: 'auth/audit',
        component: () => import('../views/AuthAudit.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'auth_audit' }
      },
      {
        path: 'platforms',
        component: () => import('../views/Platforms.vue'),
        meta: { roles: ['super_admin', 'hr_manager'], module: 'platforms' }
      },
      { path: 'reports', component: () => import('../views/Reports.vue'), meta: { roles: ['super_admin', 'hr_manager'], module: 'reports' } }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

const getDefaultHome = (role: string) => (role === 'interviewer' ? '/resumes/review' : '/dashboard');

router.beforeEach((to, _from, next) => {
  const token = getToken();
  const role = getStoredRole();
  const requiresAuth = Boolean(to.matched.find((record) => record.meta?.requiresAuth));
  const isGuestOnly = Boolean(to.matched.find((record) => record.meta?.guestOnly));
  const allowedRoles = to.matched.flatMap((record) =>
    Array.isArray(record.meta?.roles) ? (record.meta.roles as string[]) : []
  );
  const allowedModules = to.matched.flatMap((record) =>
    record.meta?.module ? [record.meta.module as string] : []
  );
  const modulePermissions = getStoredModules();

  if (requiresAuth && !token) {
    return next('/login');
  }

  if (isGuestOnly && token) {
    return next(getDefaultHome(role));
  }

  if (allowedRoles.length && role && !allowedRoles.includes(role)) {
    return next(getDefaultHome(role));
  }

  if (allowedModules.length && modulePermissions.length) {
    const allowed = allowedModules.some((moduleCode) => modulePermissions.includes(moduleCode));
    if (!allowed) {
      return next(getDefaultHome(role));
    }
  }

  next();
});

export default router;
