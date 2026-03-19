'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const rawConfig = require(path.join(__dirname, '..', 'config', 'config.json'))[env];

const config = {
  ...rawConfig,
  host: process.env.DB_HOST || rawConfig.host,
  username: process.env.DB_USER || rawConfig.username,
  password: process.env.DB_PASSWORD || rawConfig.password,
  database: process.env.DB_NAME || rawConfig.database,
  dialect: process.env.DB_DIALECT || rawConfig.dialect
};

const sequelize = new Sequelize(config.database, config.username, config.password, config);
const db = {};

fs.readdirSync(__dirname)
  .filter((file) => file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js')
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

