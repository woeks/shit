module.exports = (sequelize, DataTypes) => {
  const JobAssignment = sequelize.define(
    'JobAssignment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      assignment_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'reviewer' },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'job_assignments' }
  );

  JobAssignment.associate = (models) => {
    JobAssignment.belongsTo(models.Job, { foreignKey: 'job_id' });
    JobAssignment.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return JobAssignment;
};
