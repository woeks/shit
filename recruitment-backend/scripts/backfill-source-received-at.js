#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = require('../models');

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pickSourceReceivedAt = (record) => {
  const rawPayload = record.raw_payload || {};
  return parseDateValue(rawPayload.email_received_at);
};

const main = async () => {
  const records = await db.PlatformResumeRecord.findAll({
    include: [
      {
        model: db.Resume,
        where: {
          source: 'email',
          source_received_at: null
        },
        required: true
      }
    ],
    order: [['imported_at', 'DESC']]
  });

  const latestByResume = new Map();
  for (const record of records) {
    if (!record.resume_id || latestByResume.has(record.resume_id)) {
      continue;
    }
    latestByResume.set(record.resume_id, record);
  }

  let updated = 0;
  let skipped = 0;

  for (const record of latestByResume.values()) {
    const sourceReceivedAt = pickSourceReceivedAt(record);

    if (!sourceReceivedAt) {
      skipped += 1;
      continue;
    }

    const transaction = await db.sequelize.transaction();

    try {
      await record.Resume.update(
        {
          source_received_at: sourceReceivedAt,
          updated_at: new Date()
        },
        { transaction }
      );

      const rawPayload = record.raw_payload || {};
      await transaction.commit();
      updated += 1;
    } catch (error) {
      await transaction.rollback();
      skipped += 1;
      console.error(`backfill failed: ${record.resume_id}`, error.message);
    }
  }

  console.log(JSON.stringify({ updated, skipped, total: latestByResume.size }));
  await db.sequelize.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
