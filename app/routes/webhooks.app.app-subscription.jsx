import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import moment from "moment";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`APP_SUBSCRIPTIONS_UPDATE webhook--- ${topic} webhook for ${shop}`);

  const charge_status = (payload?.app_subscription?.status || "").toLowerCase();
  const updated_at = payload?.app_subscription?.updated_at;
  const charge_id = payload?.app_subscription?.admin_graphql_api_id?.replace(
    "gid://shopify/AppSubscription/",
    "",
  );
  const plan_price = payload?.app_subscription?.price
    ? Number(payload?.app_subscription?.price).toString()
    : "";

  const masterPlan =
    (await prisma.plan_master.findFirst({ where: { monthly_price: plan_price } })) ||
    (await prisma.plan_master.findFirst({ orderBy: { id: "asc" } }));

  const normalizedPlan = masterPlan
    ? {
        ...masterPlan,
        title: "Business Plan",
        slug: "business",
        monthly_price: "10",
        access_products: "UNLIMITED",
        trial_days: masterPlan.trial_days || "7",
      }
    : null;

  const activatedOn = payload?.app_subscription?.created_at
    ? new Date(payload.app_subscription.created_at).toISOString().split("T")[0]
    : "";

  let trialDaysLeft = 7;
  const activePlan = await prisma.shop_plans.findFirst({
    where: { status: "Active" },
  });

  if (activePlan) {
    const trialEnds = activePlan?.trial_ends_on;
    if (trialEnds) {
      const today = moment.utc().startOf("day");
      const end = moment.utc(trialEnds, "YYYY-MM-DD").endOf("day");
      trialDaysLeft = Math.max(0, end.diff(today, "days"));
      trialDaysLeft = trialDaysLeft >= 7 ? 7 : trialDaysLeft;
    }
  }

  let trialEndsOn = "";
  if (activatedOn) {
    const trialEndDate = moment(activatedOn).add(trialDaysLeft, "days");
    trialEndsOn = trialEndDate.format("YYYY-MM-DD");
  }

  const returnUrl =
    process.env.PUBLIC_HOST +
    process.env.PUBLIC_FOLDER_PATH +
    `get-shopify-plan?shop_name=${shop}&sel_plan=${normalizedPlan?.id || masterPlan?.id || ""}`;

  const data = {
    shop: shop,
    plan_id: normalizedPlan?.id || masterPlan?.id || null,
    monthly_price: normalizedPlan?.monthly_price || "10",
    access_products: "UNLIMITED",
    start_date: activatedOn,
    end_date: "",
    status: charge_status === "active" ? "Active" : "Inactive",
    charge_id: charge_id,
    charge_status: charge_status,
    plan_type: "MONTHLY",
    plan_name: normalizedPlan?.title || masterPlan?.title,
    return_url: returnUrl,
    is_test: process.env.PUBLIC_CHARGE_TEST ? "true" : "false",
    activated_on: activatedOn,
    trial_ends_on: trialEndsOn,
    cancelled_on:
      charge_status === "declined" ||
      charge_status === "cancelled" ||
      charge_status === "expired"
        ? updated_at
        : "",
    trial_days: trialDaysLeft ? trialDaysLeft.toString() : null,
    confirmation_url: "",
    old_db_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const existingPlan = await prisma.shop_plans.findFirst({
    where: { shop: shop, charge_id: charge_id },
  });
  const hasSession =
    typeof prisma.Session !== "undefined"
      ? (await prisma.Session.count({ where: { shop } })) > 0
      : true;

  const isActive = charge_status === "active";

  if (!existingPlan && (!hasSession || !isActive)) {
    console.warn(
      `AppSubscription Skipping creation for ${shop} (isActive=${isActive}, hasSession=${hasSession}, existingPlan=${!!existingPlan})`,
    );
    return new Response(null, { status: 200 });
  }

  let shopPlan = null;
  if (existingPlan) {
    shopPlan = await prisma.shop_plans.update({
      where: { id: existingPlan?.id },
      data: {
        shop: shop,
        charge_status: charge_status,
        cancelled_on:
          charge_status === "declined" ||
          charge_status === "cancelled" ||
          charge_status === "expired"
            ? updated_at
            : "",
        access_products: "UNLIMITED",
        monthly_price: "10",
        plan_name: normalizedPlan?.title || masterPlan?.title,
      },
    });
  } else {
    shopPlan = await prisma.shop_plans.create({
      data: data,
    });
  }

  console.log("shopPlan", shopPlan);

  return new Response(null, { status: 200 });
};
