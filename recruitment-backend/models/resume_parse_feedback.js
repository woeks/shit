module.exports = (sequelize, DataTypes) => {
  const ResumeParseFeedback = sequelize.define(
    'ResumeParseFeedback',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: { type: DataTypes.UUID, allowNull: false },
      platform_resume_record_id: DataTypes.UUID,
      field_name: { type: DataTypes.STRING, allowNull: false },
      predicted_value: DataTypes.TEXT,
      corrected_value: DataTypes.TEXT,
      operator_id: DataTypes.UUID,
      operator_name: DataTypes.STRING,
      source_label: DataTypes.STRING,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    {
      timestamps: false,
      tableName: 'resume_parse_feedbacks'
    }
  );

  ResumeParseFeedback.associate = (models) => {
    ResumeParseFeedback.belongsTo(models.Resume, { foreignKey: 'resume_id' });
    ResumeParseFeedback.belongsTo(models.PlatformResumeRecord, { foreignKey: 'platform_resume_record_id' });
  };

  return ResumeParseFeedback;
};
