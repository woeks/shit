module.exports = (sequelize, DataTypes) => {
  const ResumeStageLog = sequelize.define(
    'ResumeStageLog',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: { type: DataTypes.UUID, allowNull: false },
      stage: { type: DataTypes.STRING, allowNull: false },
      action: { type: DataTypes.STRING, allowNull: false },
      operator_id: DataTypes.UUID,
      operator_name: DataTypes.STRING,
      comment: DataTypes.TEXT,
      metadata: DataTypes.JSON,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'resume_stage_logs' }
  );

  ResumeStageLog.associate = (models) => {
    ResumeStageLog.belongsTo(models.Resume, { foreignKey: 'resume_id' });
    ResumeStageLog.belongsTo(models.User, { foreignKey: 'operator_id' });
  };

  return ResumeStageLog;
};
