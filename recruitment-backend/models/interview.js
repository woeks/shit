module.exports = (sequelize, DataTypes) => {
  const Interview = sequelize.define(
    'Interview',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: DataTypes.UUID,
      interviewer: DataTypes.STRING,
      scheduled_time: DataTypes.DATE,
      actual_time: DataTypes.DATE,
      result: DataTypes.STRING,
      technical_score: DataTypes.INTEGER,
      communication_score: DataTypes.INTEGER,
      culture_score: DataTypes.INTEGER,
      recommendation: DataTypes.STRING,
      evaluation: DataTypes.TEXT,
      reason: DataTypes.TEXT,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'interviews' }
  );

  Interview.associate = (models) => {
    Interview.belongsTo(models.Resume, { foreignKey: 'resume_id' });
  };

  return Interview;
};
