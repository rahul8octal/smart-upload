import { PrismaClient } from '@prisma/client';
import PlanMasterSeeder from './seeders/PlanMasterSeeder.js';

const prisma = new PrismaClient();

async function main () {
    console.log('🚀 Running Database Seeder...');

    await PlanMasterSeeder();
    console.log('🎉 All seeders completed successfully!');
}

main().catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
