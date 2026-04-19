
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const shopName = 'klapshoes.myshopify.com';

    const freePlan = await prisma.plan_master.findFirst({
        where: { slug: 'free' }
    });

    if (!freePlan) {
        console.error('Free plan not found in plan_master');
        process.exit(1);
    }

    const currentActivePlan = await prisma.shop_plans.findFirst({
        where: {
            shop: shopName,
            status: "Active",
            NOT: { charge_id: null }
        }
    });

    if (currentActivePlan && currentActivePlan.charge_id) {
        console.log(`Found active charge ID: ${currentActivePlan.charge_id}. Attempting to cancel...`);

        const session = await prisma.session.findFirst({
            where: { shop: shopName }
        });

        if (session && session.accessToken) {
            try {
                const response = await fetch(`https://${shopName}/admin/api/2024-01/recurring_application_charges/${currentActivePlan.charge_id}.json`, {
                    method: 'DELETE',
                    headers: {
                        'X-Shopify-Access-Token': session.accessToken,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    console.log(`Successfully cancelled charge ${currentActivePlan.charge_id} on Shopify.`);
                } else {
                    console.error(`Failed to cancel charge. Status: ${response.status} ${response.statusText}`);
                    const errText = await response.text();
                    console.error('Response:', errText);
                }
            } catch (error) {
                console.error('Error calling Shopify API:', error);
            }
        } else {
            console.warn(`Could not find valid session/accessToken for ${shopName}. Skipping Shopify API cancellation.`);
        }
    } else {
        console.log("No active recurring charge found to cancel.");
    }

    const updateResult = await prisma.shop_plans.updateMany({
        where: {
            shop: shopName,
            status: "Active",
        },
        data: {
            status: "Inactive",
            cancelled_on: new Date().toISOString()
        },
    });
    console.log(`Deactivated ${updateResult.count} existing active plans for ${shopName}`);

    const newPlan = await prisma.shop_plans.create({
        data: {
            shop: shopName,
            plan_id: freePlan.id,
            monthly_price: freePlan.monthly_price,
            access_products: freePlan.access_products,
            plan_type: 'MONTHLY',
            plan_name: freePlan.title,
            status: 'Active',
            charge_status: 'active',
            activated_on: new Date().toISOString(),
            is_test: 'false'
        }
    });

    console.log(`Created new Free plan (ShopPlan ID: ${newPlan.id})`);
    console.log('Downgrade completed successfully.');

}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
