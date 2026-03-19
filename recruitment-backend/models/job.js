module.exports = (sequelize, DataTypes) => {
  const Job = sequelize.define(
    'Job',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title: { type: DataTypes.STRING, allowNull: false },
      description: DataTypes.TEXT,
      department: DataTypes.STRING,
      status: { type: DataTypes.STRING, defaultValue: 'draft' },
      interview_rounds: { type: DataTypes.INTEGER, defaultValue: 3 },
      round_names: {
        type: DataTypes.JSON,
        defaultValue: ['技术一面', '技术二面', 'HR终面']
      },
      aliases: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'jobs' }
  );

  Job.associate = (models) => {
    Job.hasMany(models.Resume, { foreignKey: 'job_id' });
    Job.hasMany(models.JobAssignment, { foreignKey: 'job_id' });
    Job.hasMany(models.JobPlatformRecord, { foreignKey: 'job_id' });
  };

  return Job;
};
