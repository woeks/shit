module.exports = (sequelize, DataTypes) => {
  const PlatformTemplate = sequelize.define(
    'PlatformTemplate',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      category: { type: DataTypes.STRING, allowNull: false },
      supports_job_publish: { type: DataTypes.BOOLEAN, defaultValue: false },
      supports_resume_pull: { type: DataTypes.BOOLEAN, defaultValue: false },
      supports_webhook: { type: DataTypes.BOOLEAN, defaultValue: false },
      auth_schema: DataTypes.JSONB,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'platform_templates' }
  );

  PlatformTemplate.associate = (models) => {
    PlatformTemplate.hasMany(models.PlatformAccount, { foreignKey: 'template_id' });
  };

  return PlatformTemplate;
};
