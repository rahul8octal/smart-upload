import { redirect } from "@remix-run/node";
import { getTokensFromCode, getUserInfo } from "../utils/google-drive.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("state"); // This is the shop domain we passed

  if (!code || !shop) {
    return new Response("Missing code or shop", { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host") || url.host;
    const protocol = request.headers.get("X-Forwarded-Proto") || "https";
    const baseUrl = `${protocol}://${host}`;
    
    console.log("DEBUG: Final Callback baseUrl:", baseUrl);
    console.log("Exchanging code for tokens with baseUrl:", baseUrl);
    
    const tokens = await getTokensFromCode(code, baseUrl);
    console.log("Tokens received, fetching user info...");
    const userInfo = await getUserInfo(tokens);
    console.log("User info fetched for:", userInfo.email);

    console.log("Upserting settings for shop:", shop, "with email:", userInfo.email);

    await prisma.shop_settings.upsert({
      where: { shop: shop },
      update: {
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        storage_account_email: userInfo.email,
        storage_account_name: userInfo.name,
        storage_service: 'google_drive',
      },
      create: {
        shop: shop,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        storage_account_email: userInfo.email,
        storage_account_name: userInfo.name,
        storage_service: 'google_drive',
      },
    });

    return redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/create_upload?status=google_connected`);
  } catch (error) {
    console.error("Google Auth Error:", error);
    return redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/create_upload?error=google_auth_exception`);
  }
};
