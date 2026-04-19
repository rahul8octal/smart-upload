import { authenticate } from "../../../shopify.server";

export const action = async ({ request }) => {
    const { shop, session, topic } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const body = await request.json();
    console.log("Customer Data Request", body);

    // Process as needed...

    return new Response(null, { status: 200 });
};
