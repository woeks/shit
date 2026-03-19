export const statusLabelMap: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  closed: '已关闭',
  queued: '待发布',
  offline: '已下线',
  active: '启用',
  inactive: '停用',
  new: '待初筛',
  review_pending: '待复筛',
  schedule_pending: '待安排面试',
  interviewing: '面试中',
  offer_pending: '待发放录用',
  offer_sent: '已发放录用',
  offer_accepted: '已接受录用',
  offer_declined: '已拒绝录用',
  hired: '已录用',
  rejected: '已淘汰',
  pending: '待处理',
  running: '同步中',
  completed: '已完成',
  cancelled: '已取消',
  success: '成功',
  failed: '失败'
};

export const sourceLabelMap: Record<string, string> = {
  manual: '手动录入',
  boss: 'BOSS直聘',
  lagou: '拉勾招聘',
  email: '邮箱投递'
};

export const syncModeLabelMap: Record<string, string> = {
  official_api: '官方接口',
  email_ingest: '邮箱同步',
  file_import: '文件导入'
};

export const authTypeLabelMap: Record<string, string> = {
  api_key: '接口密钥',
  oauth2: 'OAuth2授权',
  imap: '邮箱授权',
  file_import: '文件导入'
};

export const actionTypeLabelMap: Record<string, string> = {
  test_connection: '测试连接',
  publish_job: '发布岗位',
  retry_publish: '重试发布',
  offline_job: '下线岗位'
};

export const recommendationLabelMap: Record<string, string> = {
  strong_hire: '强烈推荐',
  hire: '推荐录用',
  hold: '建议保留',
  no_hire: '不推荐'
};

export const resultLabelMap: Record<string, string> = {
  pending: '待反馈',
  passed: '通过',
  failed: '不通过'
};

export const assignmentTypeLabelMap: Record<string, string> = {
  reviewer: '复筛',
  interviewer: '面试',
  both: '复筛/面试'
};

export const rejectionStageLabelMap: Record<string, string> = {
  rejected_screening: '初筛淘汰',
  rejected_review: '复筛淘汰',
  rejected_interview: '面试淘汰',
  rejected_offer: '录用拒绝'
};

export const stageLabelMap: Record<string, string> = {
  screening: '初筛',
  review: '复筛',
  interview: '面试',
  offer: '录用'
};

export const stageActionLabelMap: Record<string, string> = {
  passed: '通过',
  rejected: '淘汰',
  scheduled: '已安排',
  failed: '未通过',
  passed_round: '本轮通过',
  passed_final: '终面通过',
  sent: '已发放',
  accepted: '已接受',
  declined: '已拒绝'
};

export const toLabel = (value: string | null | undefined, map: Record<string, string>) => {
  if (!value) {
    return '-';
  }

  return map[value] || value;
};
