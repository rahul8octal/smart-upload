import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteFile } from "../helper";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const overlaysWithImages = await db.product_overlays.findMany({
      where: {
        shop_id: shop,
        image_url: { not: null },
      },
      select: { image_url: true },
    });

    for (const overlay of overlaysWithImages) {
      try {
        await deleteFile(overlay.image_url);
      } catch (err) {
        console.warn(`[Uninstall] Failed to delete image ${overlay.image_url}`, err);
      }
    }

    await db.product_overlays.deleteMany({ where: { shop_id: shop } });
    await db.shop_plans.deleteMany({ where: { shop } });
    await db.shop_settings.deleteMany({ where: { shop } });

    if (db.session) {
      await db.session.deleteMany({ where: { shop } });
    } else if (db.Session) {
      await db.Session.deleteMany({ where: { shop } });
    }

    console.log(`[Uninstall] Cleanup completed for ${shop}`);
  } catch (error) {
    console.error(`[Uninstall] Cleanup failed for ${shop}:`, error);
  }

  return new Response(null, { status: 200 });
};
