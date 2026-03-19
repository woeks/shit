module.exports = (sequelize, DataTypes) => {
  const LoginAudit = sequelize.define(
    'LoginAudit',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: DataTypes.UUID,
      username: DataTypes.STRING,
      status: { type: DataTypes.STRING, defaultValue: 'success' },
      ip_address: DataTypes.STRING,
      user_agent: DataTypes.TEXT,
      failure_reason: DataTypes.TEXT,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'login_audits' }
  );

  LoginAudit.associate = (models) => {
    LoginAudit.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return LoginAudit;
};
