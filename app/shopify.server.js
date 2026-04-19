import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
export const MONTHLY_PLAN = 'Monthly subscription';
export const ANNUAL_PLAN = 'Annual subscription';

const COMBINED_SHOP_DATA_QUERY = `
  query {
    shopLocales {
      locale
      primary
      published
    }
    shop {
      email
      shopOwnerName
    }
  }
`;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/uninstalled",
    },
    APP_SUBSCRIPTIONS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/app-subscription",
    },
    CUSTOMERS_DATA_REQUEST: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/shopify/customer_data_request",
    },
    CUSTOMERS_REDACT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/shopify/customer_data_erasure",
    },
    SHOP_REDACT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/shopify/shop_data_erasure",
    }
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      try {
        const webhookResult = await shopify.registerWebhooks({ session });
        console.log("webhookResult---", webhookResult, session);

        // Fetch and persist shop details (locales and owner info)
        try {
          const combinedResp = await admin.graphql(COMBINED_SHOP_DATA_QUERY);
          const combinedData = await combinedResp.json();
          const shopLocales = combinedData?.data?.shopLocales || [];
          const shopInfo = combinedData?.data?.shop;
          console.log('afterAuth for ==>', session.shop)
          // Update Session with combined data
          const updateData = {};
          if (Array.isArray(shopLocales) && shopLocales.length > 0) {
            updateData.locales = shopLocales;
          }
          if (shopInfo) {
            const ownerName = shopInfo.shopOwnerName || "";
            const nameParts = ownerName.split(" ");
            updateData.firstName = nameParts[0] || "";
            updateData.lastName = nameParts.slice(1).join(" ") || "";
            updateData.email = shopInfo.email;
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.Session.updateMany({
              where: { shop: session.shop },
              data: updateData,
            });
          }

          // Set default app language from primary locale if not already set
          if (Array.isArray(shopLocales) && shopLocales.length > 0) {
            const primaryLocale =
              shopLocales.find((loc) => loc?.primary)?.locale ||
              shopLocales[0]?.locale ||
              null;

            if (primaryLocale) {
              const normalizedLocale = String(primaryLocale).toLowerCase();
              const existingSettings = await prisma.shop_settings.findUnique({
                where: { shop: session.shop },
              });

              if (!existingSettings) {
                await prisma.shop_settings.create({
                  data: {
                    shop: session.shop,
                    app_language: normalizedLocale,
                  },
                });
              } else if (!existingSettings.app_language) {
                await prisma.shop_settings.update({
                  where: { shop: session.shop },
                  data: { app_language: normalizedLocale },
                });
              }
            }
          }
        } catch (err) {
          console.error("Error fetching/saving shop details after auth:", err);
        }

        // Auto-assign Free plan if no plan exists
        const existingPlan = await prisma.shop_plans.findFirst({
          where: { shop: session.shop, status: "Active" }
        });

        if (!existingPlan) {
          const freePlan = await prisma.plan_master.findFirst({
            where: { slug: "free" }
          });

          if (freePlan) {
            await prisma.shop_plans.create({
              data: {
                shop: session.shop,
                plan_id: freePlan.id,
                monthly_price: freePlan.monthly_price,
                access_products: freePlan.access_products,
                plan_name: freePlan.title,
                plan_type: "MONTHLY",
                status: "Active",
                trial_days: "0",
                start_date: new Date().toISOString()
              }
            });
            console.log("Automatically assigned Free plan to new shop:", session.shop);
          }
        }
      } catch (error) {
        console.error("Error in afterAuth hook:", error);
      }
    },
  },
  billing: {
    [MONTHLY_PLAN]: {
      amount: 10,
      currencyCode: 'USD',
      interval: BillingInterval.Every30Days,
    },
    [ANNUAL_PLAN]: {
      amount: 50,
      currencyCode: 'USD',
      interval: BillingInterval.Annual,
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
