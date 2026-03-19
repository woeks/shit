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

const sameMoment = (left, right) => {
  const leftDate = parseDateValue(left);
  const rightDate = parseDateValue(right);
  if (!leftDate || !rightDate) {
    return false;
  }
  return leftDate.getTime() === rightDate.getTime();
};

const main = async () => {
  const records = await db.PlatformResumeRecord.findAll({
    include: [
      {
        model: db.Resume,
        where: { source: 'email' },
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

  let cleared = 0;
  let skipped = 0;

  for (const record of latestByResume.values()) {
    const rawPayload = record.raw_payload || {};
    const approximate =
      !rawPayload.email_received_at || sameMoment(rawPayload.email_received_at, record.imported_at);

    if (!approximate || !record.Resume.source_received_at) {
      skipped += 1;
      continue;
    }

    const transaction = await db.sequelize.transaction();
    try {
      await record.Resume.update(
        {
          source_received_at: null,
          updated_at: new Date()
        },
        { transaction }
      );

      if (rawPayload.email_received_at && sameMoment(rawPayload.email_received_at, record.imported_at)) {
        const nextPayload = { ...rawPayload };
        delete nextPayload.email_received_at;
        await record.update(
          {
            raw_payload: nextPayload,
            last_sync_at: new Date()
          },
          { transaction }
        );
      }

      await transaction.commit();
      cleared += 1;
    } catch (error) {
      await transaction.rollback();
      skipped += 1;
      console.error(`cleanup failed: ${record.resume_id}`, error.message);
    }
  }

  console.log(JSON.stringify({ cleared, skipped, total: latestByResume.size }));
  await db.sequelize.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
