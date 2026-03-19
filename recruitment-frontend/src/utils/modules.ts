export type ModuleCode =
  | 'dashboard'
  | 'jobs'
  | 'resumes'
  | 'screening'
  | 'review'
  | 'scheduling'
  | 'interviews'
  | 'offers'
  | 'talent_pool'
  | 'reports'
  | 'auth_audit'
  | 'platforms'
  | 'people';

export const MODULE_OPTIONS: { code: ModuleCode; label: string }[] = [
  { code: 'dashboard', label: '仪表盘' },
  { code: 'jobs', label: '岗位管理' },
  { code: 'resumes', label: '简历库' },
  { code: 'screening', label: '初筛' },
  { code: 'review', label: '复筛' },
  { code: 'scheduling', label: '待安排面试' },
  { code: 'interviews', label: '面试管理' },
  { code: 'offers', label: '录用管理' },
  { code: 'talent_pool', label: '人才库' },
  { code: 'reports', label: '报表中心' },
  { code: 'auth_audit', label: '登录审计' },
  { code: 'platforms', label: '邮箱同步' },
  { code: 'people', label: '人员权限' }
];

export const HR_MANAGER_DEFAULT_MODULES: ModuleCode[] = MODULE_OPTIONS.slice(0, 10).map((item) => item.code);
