module.exports = (sequelize, DataTypes) => {
  const Offer = sequelize.define(
    'Offer',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      resume_id: { type: DataTypes.UUID, allowNull: false },
      salary: DataTypes.STRING,
      level: DataTypes.STRING,
      join_date: DataTypes.DATE,
      status: { type: DataTypes.STRING, defaultValue: 'offer_pending' },
      notes: DataTypes.TEXT,
      sent_at: DataTypes.DATE,
      decided_at: DataTypes.DATE,
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { timestamps: false, tableName: 'offers' }
  );

  Offer.associate = (models) => {
    Offer.belongsTo(models.Resume, { foreignKey: 'resume_id' });
  };

  return Offer;
};
