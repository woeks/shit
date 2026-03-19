module.exports = (sequelize, DataTypes) => {
  const InterviewSchedule = sequelize.define(
    'InterviewSchedule',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: { type: DataTypes.UUID, allowNull: false },
      interviewer_id: DataTypes.UUID,
      round_index: { type: DataTypes.INTEGER, allowNull: false },
      round_name: DataTypes.STRING,
      interviewer: DataTypes.STRING,
      interview_mode: { type: DataTypes.STRING, defaultValue: 'offline' },
      scheduled_time: DataTypes.DATE,
      actual_time: DataTypes.DATE,
      status: { type: DataTypes.STRING, defaultValue: 'pending' },
      result: DataTypes.STRING,
      technical_score: DataTypes.INTEGER,
      communication_score: DataTypes.INTEGER,
      culture_score: DataTypes.INTEGER,
      recommendation: DataTypes.STRING,
      evaluation: DataTypes.TEXT,
      reason: DataTypes.TEXT,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'interview_schedules' }
  );

  InterviewSchedule.associate = (models) => {
    InterviewSchedule.belongsTo(models.Resume, { foreignKey: 'resume_id' });
    InterviewSchedule.belongsTo(models.User, { foreignKey: 'interviewer_id', as: 'Interviewer' });
  };

  return InterviewSchedule;
};
