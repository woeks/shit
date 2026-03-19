module.exports = (sequelize, DataTypes) => {
  const PlatformSyncLog = sequelize.define(
    'PlatformSyncLog',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      platform_account_id: { type: DataTypes.UUID, allowNull: false },
      job_platform_record_id: DataTypes.UUID,
      action_type: { type: DataTypes.STRING, allowNull: false },
      target_type: { type: DataTypes.STRING, allowNull: false },
      status: { type: DataTypes.STRING, defaultValue: 'success' },
      message: DataTypes.TEXT,
      payload_snapshot: DataTypes.JSONB,
      operator_id: DataTypes.UUID,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    {
      timestamps: false,
      tableName: 'platform_sync_logs'
    }
  );

  PlatformSyncLog.associate = (models) => {
    PlatformSyncLog.belongsTo(models.PlatformAccount, { foreignKey: 'platform_account_id' });
    PlatformSyncLog.belongsTo(models.JobPlatformRecord, { foreignKey: 'job_platform_record_id' });
    PlatformSyncLog.belongsTo(models.User, { foreignKey: 'operator_id', as: 'Operator' });
  };

  return PlatformSyncLog;
};
