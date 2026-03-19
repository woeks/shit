const { ResumeStageLog } = require('../models');

const appendResumeStageLog = async ({
  resume_id,
  stage,
  action,
  operator,
  comment,
  metadata,
  transaction
}) => {
  if (!resume_id || !stage || !action) {
    return null;
  }

  return ResumeStageLog.create(
    {
      resume_id,
      stage,
      action,
      operator_id: operator?.id || null,
      operator_name: operator?.name || null,
      comment: comment || null,
      metadata: metadata || null
    },
    { transaction }
  );
};

module.exports = {
  appendResumeStageLog
};
