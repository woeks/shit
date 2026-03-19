module.exports = (sequelize, DataTypes) => {
  const TalentPool = sequelize.define(
    'TalentPool',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: { type: DataTypes.UUID, allowNull: false },
      rejection_stage: DataTypes.STRING,
      rejection_reason: DataTypes.TEXT,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'talent_pool' }
  );

  TalentPool.associate = (models) => {
    TalentPool.belongsTo(models.Resume, { foreignKey: 'resume_id' });
  };

  return TalentPool;
};

