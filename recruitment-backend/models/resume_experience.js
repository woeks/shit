module.exports = (sequelize, DataTypes) => {
  const ResumeExperience = sequelize.define(
    'ResumeExperience',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: { type: DataTypes.UUID, allowNull: false },
      company_name: { type: DataTypes.STRING, allowNull: false },
      position_name: { type: DataTypes.STRING, allowNull: false },
      start_date: DataTypes.DATE,
      end_date: DataTypes.DATE,
      is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
      description: DataTypes.TEXT,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'resume_experiences' }
  );

  ResumeExperience.associate = (models) => {
    ResumeExperience.belongsTo(models.Resume, { foreignKey: 'resume_id' });
  };

  return ResumeExperience;
};
