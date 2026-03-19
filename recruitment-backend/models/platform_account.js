module.exports = (sequelize, DataTypes) => {
  const PlatformAccount = sequelize.define(
    'PlatformAccount',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      template_id: { type: DataTypes.UUID, allowNull: false },
      account_name: { type: DataTypes.STRING, allowNull: false },
      status: { type: DataTypes.STRING, defaultValue: 'active' },
      auth_type: { type: DataTypes.STRING, allowNull: false },
      credentials_encrypted: DataTypes.TEXT,
      auth_snapshot: DataTypes.JSONB,
      access_token_expires_at: DataTypes.DATE,
      last_auth_at: DataTypes.DATE,
      last_test_at: DataTypes.DATE,
      last_test_status: { type: DataTypes.STRING, defaultValue: 'pending' },
      last_test_message: DataTypes.TEXT,
      last_sync_at: DataTypes.DATE,
      resume_import_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
      job_publish_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      notes: DataTypes.TEXT,
      created_by: DataTypes.UUID,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'platform_accounts' }
  );

  PlatformAccount.associate = (models) => {
    PlatformAccount.belongsTo(models.PlatformTemplate, { foreignKey: 'template_id' });
    PlatformAccount.belongsTo(models.User, { foreignKey: 'created_by', as: 'Creator' });
    PlatformAccount.hasMany(models.JobPlatformRecord, { foreignKey: 'platform_account_id' });
    PlatformAccount.hasMany(models.PlatformResumeRecord, { foreignKey: 'platform_account_id' });
    PlatformAccount.hasMany(models.PlatformSyncLog, { foreignKey: 'platform_account_id' });
  };

  return PlatformAccount;
};
