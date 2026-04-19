// workers/orderWorker.js
import { Worker } from 'bullmq';
import { redisConnection } from '../utils/redis.js';
import db from "../app/db.server.js";

console.log('🚨 Uninstall worker started');

const worker = new Worker(
  'uninstall-job',
  async (job) => {

    const { shop, session } = job.data;
    console.log(`🧹 Cleaning up for shop: ${shop} for ${JSON.stringify(session)}`);

    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }
  },
  {
    connection: redisConnection,
  }
);

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});
