module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      username: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      email: DataTypes.STRING,
      password_hash: DataTypes.STRING,
      status: { type: DataTypes.STRING, defaultValue: 'active' },
      role_id: { type: DataTypes.UUID, allowNull: false },
      module_permissions: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    {
      timestamps: false,
      tableName: 'users',
      defaultScope: {
        attributes: { exclude: ['password_hash'] }
      },
      scopes: {
        withPassword: {
          attributes: { include: ['password_hash'] }
        }
      }
    }
  );

  User.associate = (models) => {
    User.belongsTo(models.Role, { foreignKey: 'role_id' });
    User.hasMany(models.JobAssignment, { foreignKey: 'user_id' });
    User.hasMany(models.InterviewSchedule, { foreignKey: 'interviewer_id' });
    User.hasMany(models.ResumeStageLog, { foreignKey: 'operator_id' });
    User.hasMany(models.PlatformAccount, { foreignKey: 'created_by', as: 'CreatedPlatformAccounts' });
    User.hasMany(models.JobPlatformRecord, { foreignKey: 'created_by', as: 'CreatedJobPlatformRecords' });
    User.hasMany(models.PlatformSyncLog, { foreignKey: 'operator_id', as: 'PlatformSyncOperations' });
  };

  return User;
};
