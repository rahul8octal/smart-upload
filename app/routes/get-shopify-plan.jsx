import { redirect } from "@remix-run/react";
import prisma from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop_name = url.searchParams.get("shop_name");
  const plan_id = url.searchParams.get("sel_plan");
  const charge_id = url.searchParams.get("charge_id");
  const host = Buffer.from(shop_name + "/admin").toString("base64");

  const dbShop = await prisma.Session.findFirst({
    where: { shop: shop_name },
  });

  const PlanDataExist = await prisma.plan_master.findUnique({
    where: { id: Number(plan_id) },
  });

  if (!PlanDataExist) {
    return "Invalid plan_id. Plan detail is not found.";
  } else {
    // Get existing shop plan
    let shopPlan = await prisma.shop_plans.findFirst({
      where: {
        shop: shop_name,
        plan_id: Number(plan_id),
        charge_id: charge_id || undefined,
      },
      orderBy: { id: "desc" },
    });

    if (!shopPlan) {
      return { error: "Shop plan not found" };
    }

    // Get charge data if charge_id exists
    let chargeData = null;
    if (charge_id) {
      const response = await fetch(
        `https://${shop_name}/admin/api/2025-04/recurring_application_charges/${charge_id}.json`,
        {
          headers: {
            "X-Shopify-Access-Token": dbShop.accessToken,
            "Content-Type": "application/json",
          },
        },
      );
      const data = await response.json();
      chargeData = data?.recurring_application_charge;
    }

    // Update database if requested
    if (chargeData) {
      await prisma.shop_plans.update({
        where: { id: shopPlan.id },
        data: {
          status: chargeData.status === "active" ? "Active" : "",
          charge_status: chargeData.status,
          activated_on: chargeData.activated_on
            ? new Date(chargeData.activated_on).toISOString()
            : "",
          trial_ends_on: chargeData.trial_ends_on
            ? new Date(chargeData.trial_ends_on).toISOString()
            : "",
          cancelled_on: chargeData.cancelled_on
            ? new Date(chargeData.cancelled_on).toISOString()
            : "",
          trial_days: chargeData.trial_days.toString(),
        },
      });
    }

    // Deactivate other plans if this one is active
    if (!chargeData || chargeData?.status === "active") {
      await prisma.shop_plans.updateMany({
        where: {
          shop: shop_name,
          status: "Active",
          NOT: { id: shopPlan.id },
        },
        data: { status: "Inactive" },
      });

      if (shopPlan.access_products !== "UNLIMITED") {
        // Deactivate "All Products" overlays
        const allProductsOverlays = await prisma.product_overlays.findMany({
          where: {
            shop_id: shop_name,
            status: "Active",
            OR: [
              { product_id: "ALL_PRODUCTS" },
              { overlay_targets: { some: { scope: "ALL_PRODUCTS" } } },
            ],
          },
          select: { id: true },
        });

        if (allProductsOverlays.length > 0) {
          await prisma.product_overlays.updateMany({
            where: { id: { in: allProductsOverlays.map((o) => o.id) } },
            data: { status: "Inactive" },
          });
        }

        const activeOverlays = await prisma.product_overlays.findMany({
          where: { shop_id: shop_name, status: "Active" },
          orderBy: { created_at: "desc" }, // Keep newest, disable oldest
        });

        // Group by product_id
        const productIds = [...new Set(activeOverlays.map((o) => o.product_id))];

        if (productIds.length > Number(shopPlan.access_products)) {
          // Get the IDs of products allowed to stay active (e.g., first 3 unique product IDs found in newest overlays)
          const allowedProductIds = productIds.slice(
            0,
            Number(shopPlan.access_products),
          );

          // Find overlays that belong to products NOT in the allowed list
          const overlaysToDeactivate = activeOverlays.filter(
            (o) => !allowedProductIds.includes(o.product_id),
          );

          if (overlaysToDeactivate.length > 0) {
            await prisma.product_overlays.updateMany({
              where: {
                shop_id: shop_name,
                id: { in: overlaysToDeactivate.map((o) => o.id) },
              },
              data: { status: "Inactive" },
            });
          }
        }
      }
    }
  }

  return redirect(`/app?shop=${shop_name}&host=${host}`);
}
