import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shop_settings.findMany();
  return json({
    currentShop: session.shop,
    allSettings: settings
  });
};
