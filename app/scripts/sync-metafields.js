
import prisma from "../db.server.js";
import { syncOverlaysToMetafields } from "../utils/metafields.server.js";
import { LATEST_API_VERSION } from "@shopify/shopify-app-remix/server";
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, Session } from "@shopify/shopify-api";

// Initialize Shopify API client manually for offline usage
console.log({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES?.split(','),
    hostName: process.env.SHOPIFY_APP_URL ? process.env.SHOPIFY_APP_URL.replace(/https:\/\//, "") : "",
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
})

const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES?.split(','),
    hostName: process.env.SHOPIFY_APP_URL ? process.env.SHOPIFY_APP_URL.replace(/https:\/\//, "") : "",
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
});

async function main() {
    try {
        // Fetch all sessions
        const allSessions = await prisma.session.findMany();

        if (allSessions.length === 0) {
            console.log("No sessions found in the database.");
            process.exit(0);
        }

        // Deduplicate shops: Prefer offline sessions if available, otherwise take online
        const uniqueShops = new Map();

        allSessions.forEach(session => {
            if (!session.accessToken) return;

            if (!uniqueShops.has(session.shop)) {
                uniqueShops.set(session.shop, session);
            } else {
                // If we already have a session, but the current one is offline, replace it (prefer offline)
                const existing = uniqueShops.get(session.shop);
                if (existing.isOnline && !session.isOnline) {
                    uniqueShops.set(session.shop, session);
                }
            }
        });

        const shopsToSync = Array.from(uniqueShops.values());

        console.log(`Found ${shopsToSync.length} unique shops with access tokens. Starting sync...`);

        for (const sessionData of shopsToSync) {
            const shop = sessionData.shop;
            console.log(`\nProcessing ${shop}...`);
            try {
                // 2. Reconstruct session object
                const session = new Session(sessionData);

                // 3. Create admin client
                const client = new shopify.clients.Graphql({ session });

                const adminClient = {
                    graphql: async (query, options) => {
                        const response = await client.query({
                            data: {
                                query: query,
                                variables: options?.variables
                            }
                        });
                        // Standardize response to match what fetch returns (json method)
                        return {
                            json: async () => response.body
                        };
                    }
                };

                await syncOverlaysToMetafields(adminClient, shop, prisma, true); // force=true
                console.log(`Successfully synced ${shop}`);

            } catch (error) {
                console.error(`Failed to sync ${shop}:`, error);
            }
        }

        console.log("\nDone.");
        process.exit(0);
    } catch (e) {
        console.error("Critical error in main script:", e);
        process.exit(1);
    }
}

main();
