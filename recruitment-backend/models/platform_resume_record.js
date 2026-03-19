module.exports = (sequelize, DataTypes) => {
  const PlatformResumeRecord = sequelize.define(
    'PlatformResumeRecord',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      platform_account_id: { type: DataTypes.UUID, allowNull: false },
      job_platform_record_id: DataTypes.UUID,
      resume_id: DataTypes.UUID,
      external_resume_id: { type: DataTypes.STRING, allowNull: false },
      external_candidate_id: DataTypes.STRING,
      external_job_id: DataTypes.STRING,
      source_label: DataTypes.STRING,
      sync_status: { type: DataTypes.STRING, defaultValue: 'synced' },
      raw_payload: DataTypes.JSONB,
      parsed_snapshot: DataTypes.JSONB,
      imported_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      last_sync_at: DataTypes.DATE,
      sync_error: DataTypes.TEXT
    },
    {
      timestamps: false,
      tableName: 'platform_resume_records',
      indexes: [{ unique: true, fields: ['platform_account_id', 'external_resume_id'] }]
    }
  );

  PlatformResumeRecord.associate = (models) => {
    PlatformResumeRecord.belongsTo(models.PlatformAccount, { foreignKey: 'platform_account_id' });
    PlatformResumeRecord.belongsTo(models.JobPlatformRecord, { foreignKey: 'job_platform_record_id' });
    PlatformResumeRecord.belongsTo(models.Resume, { foreignKey: 'resume_id' });
    PlatformResumeRecord.hasMany(models.ResumeParseFeedback, { foreignKey: 'platform_resume_record_id' });
  };

  return PlatformResumeRecord;
};
