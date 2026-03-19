module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'PlatformConfig',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      platform_name: DataTypes.STRING,
      sync_mode: { type: DataTypes.STRING, defaultValue: 'official_api' },
      api_endpoint: DataTypes.STRING,
      api_key_encrypted: DataTypes.TEXT,
      resume_import_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
      job_publish_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      last_sync_at: DataTypes.DATE,
      notes: DataTypes.TEXT,
      status: { type: DataTypes.STRING, defaultValue: 'active' },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'platform_configs' }
  );
};
