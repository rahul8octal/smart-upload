import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const targetDb = new PrismaClient({
    datasources: {
        db: {
            url: process.env.TARGET_DATABASE_URL,
        },
    },
});

const BATCH_SIZE = 100;

async function processInBatches(data, handler) {
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);

        try {
            const processed = await prisma.$transaction(async (tx) => {
                return handler(batch, tx);
            }, {
                maxWait: 30000,
                timeout: 30000,
            });

            successCount += processed;
        } catch (err) {
            errors.push({ batch: i, error: err.message });
        }
    }

    return { successCount, errors };
}

async function migrateSessions() {
    const shopData = await targetDb.$queryRaw`SELECT * FROM shop_masters`;

    const handler = async (batch, tx) => {
        let count = 0;

        for (const shop of batch) {
            try {
                await tx.session.upsert({
                    where: { id: `offline_${shop.shop}` },
                    update: { accessToken: shop.token },
                    create: {
                        id: `offline_${shop.shop}`,
                        shop: shop.shop,
                        accessToken: shop.token,
                        isOnline: false,
                        scope: "read_products",
                        state: "",
                        expires: null,
                        userId: null,
                        firstName: null,
                        lastName: null,
                        email: null,
                        accountOwner: false,
                        locale: null,
                        collaborator: false,
                        emailVerified: false,
                    },
                });
                count++;
            } catch (err) {
                console.error(`Session migrate error for shop: ${shop.shop}`, err.message);
            }
        }

        return count;
    };

    return processInBatches(shopData, handler);
}

async function migrateOverlays() {
    // TODO: modify query need to get all record so we add left join and remove where condition

    const overlayRecord = await targetDb.$queryRaw`
    SELECT
      p.sp_shop as shop,
      p.sp_product_id as product_id,
      so_py_pro.title as product_title,
      o.*
    FROM shop_product_overlays o
    LEFT JOIN shop_products p ON o.spo_sp_id = p.id
    LEFT JOIN shopify_products so_py_pro ON p.sp_product_id = so_py_pro.id
--     WHERE o.spo_sp_id IS NOT NULL
--         AND o.spo_type IS NOT NULL
--         AND TRIM(o.spo_type) <> ''
  `;

    const handler = async (batch, tx) => {
        let count = 0;

        for (const overlay of batch) {
            try {
                const display_in = [];
                if (overlay.spo_display_in_product === 'Yes') display_in.push('product');
                if (overlay.spo_display_in_collection === 'Yes') display_in.push('collection');
                if (overlay.spo_display_in_search === 'Yes') display_in.push('search');

                const overlayData = {
                    shop_id: overlay?.shop || '',
                    product_title: overlay?.product_title,
                    product_handle: '',
                    product_id: overlay?.product_id?.toString() || '',
                    type: overlay?.spo_type || (overlay?.spo_image_url ? 'IMAGE' : 'TEXT'),
                    image_url: overlay?.spo_image_url || null,
                    text: overlay?.spo_text || null,
                    font_family: overlay?.spo_font_family || null,
                    font_size: overlay?.spo_font_size?.toString() || null,
                    font_color: overlay?.spo_font_color || null,
                    bg_color: overlay?.spo_bg_color || null,
                    opacity: overlay?.spo_opacity?.toString() || null,
                    rotation: overlay?.spo_rotation?.toString() || null,
                    padding_top: overlay?.spo_padding_top?.toString() || null,
                    padding_right: overlay?.spo_padding_right?.toString() || null,
                    padding_bottom: overlay?.spo_padding_background?.toString() || null,
                    padding_left: overlay?.spo_padding_left?.toString() || null,
                    text_align: overlay?.spo_text_align || null,
                    position: overlay?.spo_position || null,
                    display_in,
                    scale_in_product: overlay?.spo_scale_in_product?.toString() || null,
                    scale_in_collection: overlay?.spo_scale_in_collection?.toString() || null,
                    scale_in_search: overlay?.spo_scale_in_search?.toString() || null,
                    status: overlay?.spo_status || 'Active',
                    old_db_id: overlay?.id,
                    created_at: overlay?.created_at || new Date(),
                    updated_at: overlay?.updated_at || new Date(),
                };

                const existing = await tx.product_overlays.findFirst({
                    where: { old_db_id: overlay.id },
                });

                if (existing) {
                    await tx.product_overlays.update({
                        where: { id: existing.id },
                        data: overlayData,
                    });
                } else {
                    await tx.product_overlays.create({
                        data: overlayData
                    });
                }

                count++;
            } catch (err) {
                console.error(`Overlay migrate error for shop: ${overlay?.shop}, product: ${overlay?.product_id}`, err.message);
            }
        }

        return count;
    };

    return processInBatches(overlayRecord, handler);
}

async function migratePlans() {
    const planData = await targetDb.$queryRaw`SELECT * FROM plan_masters`;

    let successCount = 0;

    for (const plan of planData) {
        try {

            const existing = await prisma.plan_master.findFirst({
                where: { old_db_id: plan.id },
            });

            if (existing) {
                await prisma.plan_master.update({
                    where: { id: existing.id },
                    data: {
                        title: plan.pm_title,
                        slug: plan.pm_slug,
                        monthly_price: plan.pm_monthly_price,
                        trial_days: plan.pm_trial_days || '7',
                        access_products: plan.pm_access_products,
                        old_db_id: plan.id,
                        created_at: plan.created_at,
                        updated_at: plan.updated_at,
                    },
                });
            } else {
                await prisma.plan_master.create({
                    data: {
                        title: plan.pm_title,
                        slug: plan.pm_slug,
                        monthly_price: plan.pm_monthly_price,
                        trial_days: plan.pm_trial_days,
                        access_products: plan.pm_access_products,
                        old_db_id: plan.id,
                        created_at: plan.created_at,
                        updated_at: plan.updated_at,
                    }
                });
            }
            successCount++;
        } catch (err) {
            console.error(`Plan master migrate error for plan: ${plan.pm_title}`, err.message);
        }
    }

    console.log(`Plan master migrated: ${successCount}`);
}

async function migrateShopPlans() {
    const shopPlanData = await targetDb.$queryRaw`SELECT * FROM shop_plans`;

    const handler = async (batch, tx) => {
        let count = 0;

        for (const plan of batch) {
            try {

                const existing = await tx.shop_plans.findFirst({
                    where: { old_db_id: plan.id },
                });

                const planMaster = await tx.plan_master.findFirst({
                    where: { old_db_id: plan.sp_plan_id }
                });

                if (existing) {
                    await tx.shop_plans.update({
                        where: { id: existing.id },
                        data: {
                            shop: plan.sp_shop,
                            plan_id: planMaster.id,
                            monthly_price: plan.sp_monthly_price,
                            access_products: plan.sp_access_products,
                            start_date: plan.sp_start_date,
                            end_date: plan.sp_end_date,
                            status: plan.sp_status,
                            charge_id: plan.sp_charge_id,
                            charge_status: plan.sp_charge_status,
                            plan_type: plan.sp_plan_type,
                            plan_name: plan.sp_plan_name,
                            return_url: plan.sp_return_url,
                            is_test: plan.sp_is_test,
                            activated_on: plan.sp_activated_on,
                            trial_ends_on: plan.sp_trial_ends_on,
                            cancelled_on: plan.sp_cancelled_on,
                            trial_days: plan.sp_trial_days,
                            confirmation_url: plan.sp_confirmation_url,
                            old_db_id: plan.id,
                            created_at: plan.created_at,
                            updated_at: plan.updated_at,
                        },
                    });
                } else {
                    await tx.shop_plans.create({
                        data: {
                            shop: plan.sp_shop,
                            plan_id: planMaster.id,
                            monthly_price: plan.sp_monthly_price,
                            access_products: plan.sp_access_products,
                            start_date: plan.sp_start_date,
                            end_date: plan.sp_end_date,
                            status: plan.sp_status,
                            charge_id: plan.sp_charge_id,
                            charge_status: plan.sp_charge_status,
                            plan_type: plan.sp_plan_type,
                            plan_name: plan.sp_plan_name,
                            return_url: plan.sp_return_url,
                            is_test: plan.sp_is_test,
                            activated_on: plan.sp_activated_on,
                            trial_ends_on: plan.sp_trial_ends_on,
                            cancelled_on: plan.sp_cancelled_on,
                            trial_days: plan.sp_trial_days,
                            confirmation_url: plan.sp_confirmation_url,
                            old_db_id: plan.id,
                            created_at: plan.created_at,
                            updated_at: plan.updated_at,
                        }
                    });
                }
                count++;
            } catch (err) {
                console.error(`Shop plan migrate error for plan id: ${plan.id}`, err.message);
            }
        }

        return count;
    };

    return processInBatches(shopPlanData, handler);
}

async function migrateOldData() {
    try {
        console.log("Starting session migration...");
        const sessionStats = await migrateSessions();

        console.log("Session migration done", sessionStats);

        console.log("Starting overlay migration...");
        const overlayStats = await migrateOverlays();
        console.log("Overlay migration done", overlayStats);

        console.log("Starting plan master migration...");
        await migratePlans();

        console.log("Starting shop plan migration...");
        const shopPlanStats = await migrateShopPlans();
        console.log("Shop plan migration done", shopPlanStats);

    } catch (err) {
        console.error("Migration failed:", err.message);
    } finally {
        await prisma.$disconnect();
        await targetDb.$disconnect();
    }
}

migrateOldData();
