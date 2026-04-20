import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getOAuthClient } from "../utils/google-drive.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const url = new URL(request.url);
    const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host") || url.host;
    const protocol = request.headers.get("X-Forwarded-Proto") || "https";
    
    // Prefer environment variable if it matches the current environment (ngrok)
    const baseUrl = process.env.SHOPIFY_APP_URL || `${protocol}://${host}`;
    
    console.log("DEBUG: Final Auth baseUrl:", baseUrl);
    const oauth2Client = getOAuthClient(baseUrl);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
      state: shop,
    });

    console.log("Generating Auth URL:", authUrl);
    return redirect(authUrl);
  } catch (error) {
    console.error("Error generating Google Auth URL:", error);
    throw new Response("Failed to generate Auth URL", { status: 500 });
  }
};
