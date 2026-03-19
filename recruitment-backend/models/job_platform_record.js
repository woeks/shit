module.exports = (sequelize, DataTypes) => {
  const JobPlatformRecord = sequelize.define(
    'JobPlatformRecord',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      platform_account_id: { type: DataTypes.UUID, allowNull: false },
      publish_status: { type: DataTypes.STRING, defaultValue: 'draft' },
      external_job_id: DataTypes.STRING,
      external_job_url: DataTypes.TEXT,
      publish_payload: DataTypes.JSONB,
      last_publish_at: DataTypes.DATE,
      last_sync_at: DataTypes.DATE,
      sync_error: DataTypes.TEXT,
      created_by: DataTypes.UUID,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    {
      timestamps: false,
      tableName: 'job_platform_records',
      indexes: [{ unique: true, fields: ['job_id', 'platform_account_id'] }]
    }
  );

  JobPlatformRecord.associate = (models) => {
    JobPlatformRecord.belongsTo(models.Job, { foreignKey: 'job_id' });
    JobPlatformRecord.belongsTo(models.PlatformAccount, { foreignKey: 'platform_account_id' });
    JobPlatformRecord.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
    JobPlatformRecord.hasMany(models.PlatformResumeRecord, { foreignKey: 'job_platform_record_id' });
    JobPlatformRecord.hasMany(models.PlatformSyncLog, { foreignKey: 'job_platform_record_id' });
  };

  return JobPlatformRecord;
};
