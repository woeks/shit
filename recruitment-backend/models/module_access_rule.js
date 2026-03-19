module.exports = (sequelize, DataTypes) => {
  const ModuleAccessRule = sequelize.define(
    'ModuleAccessRule',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      module_code: { type: DataTypes.STRING, allowNull: false, unique: true },
      grant_modules: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'module_access_rules' }
  );

  return ModuleAccessRule;
};
