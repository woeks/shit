module.exports = (sequelize, DataTypes) => {
  const Resume = sequelize.define(
    'Resume',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      job_id: DataTypes.UUID,
      name: { type: DataTypes.STRING, allowNull: false },
      gender: DataTypes.STRING,
      age: DataTypes.INTEGER,
      education: DataTypes.STRING,
      work_years: DataTypes.INTEGER,
      school_major: DataTypes.STRING,
      current_company: DataTypes.STRING,
      current_position: DataTypes.STRING,
      phone: DataTypes.STRING,
      email: DataTypes.STRING,
      file_url: DataTypes.STRING,
      source: DataTypes.STRING,
      source_received_at: DataTypes.DATE,
      hr_owner_id: DataTypes.UUID,
      hr_owner_name: DataTypes.STRING,
      screening_reason: DataTypes.TEXT,
      current_round: { type: DataTypes.INTEGER, defaultValue: 0 },
      total_rounds: { type: DataTypes.INTEGER, defaultValue: 3 },
      status: { type: DataTypes.STRING, defaultValue: 'new' },
      received_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      screened_at: DataTypes.DATE,
      reviewer: DataTypes.STRING,
      review_reason: DataTypes.TEXT,
      reviewed_at: DataTypes.DATE,
      interview_scheduled_at: DataTypes.DATE,
      interviewed_at: DataTypes.DATE,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'resumes' }
  );

  Resume.associate = (models) => {
    Resume.belongsTo(models.Job, { foreignKey: 'job_id' });
    Resume.hasMany(models.InterviewSchedule, { foreignKey: 'resume_id' });
    Resume.hasMany(models.ResumeExperience, { foreignKey: 'resume_id' });
    Resume.hasOne(models.TalentPool, { foreignKey: 'resume_id' });
    Resume.hasMany(models.ResumeStageLog, { foreignKey: 'resume_id' });
    Resume.hasOne(models.Offer, { foreignKey: 'resume_id' });
    Resume.hasMany(models.PlatformResumeRecord, { foreignKey: 'resume_id' });
    Resume.hasMany(models.ResumeParseFeedback, { foreignKey: 'resume_id' });
  };

  return Resume;
};
