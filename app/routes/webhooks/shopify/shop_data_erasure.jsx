import { authenticate } from "../../../shopify.server";

export const action = async ({ request }) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const body = await request.json();
    console.log("Shop Data Erasure Payload:", body);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Webhook validation failed:", error);

    // Shopify REQUIRES 401 for invalid HMAC
    return new Response("Unauthorized", { status: 401 });
  }
};
