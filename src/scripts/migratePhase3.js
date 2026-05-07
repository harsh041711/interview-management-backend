'use strict';

const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');

async function run() {
  await connectDB();

  // Use raw collections to avoid Mongoose schema enforcement on fields not yet
  // declared (Phase 3D adds the experience/timesUsed fields to the schemas).
  const candidates = require('../models/Candidate').collection;
  const questions = require('../models/Question').collection;

  const candResult = await candidates.updateMany(
    { experience: { $in: [null, undefined] } },
    { $set: { experience: 'mid' } },
  );
  const qExpResult = await questions.updateMany(
    { experience: { $in: [null, undefined] } },
    { $set: { experience: 'any' } },
  );
  const qUseResult = await questions.updateMany(
    { timesUsed: { $in: [null, undefined] } },
    { $set: { timesUsed: 0 } },
  );

  console.log('Phase 3 migration complete:');
  console.log(`  candidates.experience backfilled: ${candResult.modifiedCount}`);
  console.log(`  questions.experience  backfilled: ${qExpResult.modifiedCount}`);
  console.log(`  questions.timesUsed   backfilled: ${qUseResult.modifiedCount}`);

  await disconnectDB();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  disconnectDB().finally(() => process.exit(1));
});
