import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PlanMasterSeeder = async () => {
    console.log('🌱 Seeding Plan Master...');

    const plans = [
        {
            title: 'Free',
            slug: 'free',
            monthly_price: "0",
            trial_days: "0",
            access_products: "3",
            old_db_id: null,
        },
        {
            title: 'Plus',
            slug: 'business',
            monthly_price: "10",
            trial_days: "7",
            access_products: 'UNLIMITED',
            old_db_id: null,
        },
        // {
        //     title: 'Enterprise Plan',
        //     slug: 'enterprise',
        //     monthly_price: "20",
        //     trial_days: "7",
        //     access_products: 'UNLIMITED',
        //     old_db_id: null,
        // },
    ];

    for (const plan of plans) {
        const existingPlan =
            await prisma.plan_master.findFirst({
                where: { slug: plan.slug },
            });
        if (existingPlan) {
            await prisma.plan_master.update({
                where: { id: existingPlan.id },
                data: {
                    title: plan.title,
                    monthly_price: plan.monthly_price,
                    trial_days: plan.trial_days,
                    access_products: plan.access_products,
                    old_db_id: plan.old_db_id,
                    updated_at: new Date(),
                },
            });
        } else {
            await prisma.plan_master.create({
                data: {
                    ...plan,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        }
    }

    console.log('✅ Plan Master seeded successfully');
};

export default PlanMasterSeeder;
