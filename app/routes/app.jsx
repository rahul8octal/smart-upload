import { Link, Outlet, useLoaderData, useRouteError, useNavigation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { SkeletonPage, SkeletonBodyText, SkeletonDisplayText, Box } from "@shopify/polaris";
import { useEffect, useRef } from "react";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";
import { useI18n } from "../i18n";
import prisma from "../db.server";

// export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  try {
    // Fetch session data with email and name
    const sessionData = await prisma.Session.findFirst({
      where: { shop: session?.shop },
      select: {
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    let activePlan = await prisma.shop_plans.findFirst({
      where: { shop: session?.shop, status: "Active" },
    });

    if (!activePlan) {
      const freePlan = await prisma.plan_master.findFirst({ where: { slug: "free" } });
      if (freePlan) {
        activePlan = await prisma.shop_plans.create({
          data: {
            shop: session.shop,
            plan_id: freePlan.id,
            monthly_price: freePlan.monthly_price,
            access_products: freePlan.access_products,
            plan_name: freePlan.title,
            plan_type: "MONTHLY",
            status: "Active",
            trial_days: "0",
            start_date: new Date().toISOString(),
            created_at: new Date(),
            updated_at: new Date(),
          }
        });
      }
    }

    const testStores = (process.env.TEST_PLAN_STORES || '').split(',').map(s => s.trim());
    const isTest = testStores.includes(session.shop);
    const trialDays = 7;

    // Check for active billing subscription
    const isFreePlan = activePlan && String(activePlan.monthly_price) === "0";
    let billingCheck = null;

    if (!isFreePlan) {
      billingCheck = await billing.require({
        plans: [MONTHLY_PLAN],
        isTest: isTest,
        trialDays: trialDays,
        onFailure: async () => {
          if (!activePlan) {
            const billingRequest = await billing.request({
              plan: MONTHLY_PLAN,
              isTest: isTest,
              trialDays: 7,
              returnUrl: new URL(
                `/app?shop=${session.shop}&host=${host}`,
                request.url,
              ).toString(),
            });

            // Throw a redirect response instead of returning
            throw new Response(null, {
              status: 302,
              headers: {
                Location: billingRequest.confirmationUrl,
              },
            });
          }
          return null;
        },
      });
    }

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      billingStatus: billingCheck,
      shop: session.shop,
      host,
      // Crisp data
      customerEmail: sessionData?.email || null,
      customerName: sessionData?.firstName
        ? `${sessionData.firstName}${sessionData.lastName ? ' ' + sessionData.lastName : ''}`
        : null,
      customerPlan: activePlan?.plan_name || null,
      subscriptionStatus: activePlan?.status || null,
      installedOn: activePlan?.start_date || activePlan?.created_at?.toISOString() || null,
      trialEndsOn: activePlan?.trial_ends_on || null,
      planPrice: activePlan?.monthly_price || null,
    };
  } catch (error) {
    // Check if the error is a Response (redirect)
    if (error instanceof Response || error?.status === 302) {
      return error;
    }

    console.error("Loader error details:", {
      message: error?.message,
      stack: error?.stack,
      type: typeof error,
      stringified: String(error),
      constructor: error?.constructor?.name
    });

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session?.shop || "",
      host: url.searchParams.get("host"),
      error: "Failed to load app data",
      details: error?.message || String(error),
    };
  }
};

export default function App() {
  const data = useLoaderData();
  const { t } = useI18n();
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";
  const welcomeMessageShown = useRef(false);

  // Crisp Chat integration - set all user data
  useEffect(() => {
    if (typeof window === "undefined" || !window.$crisp) return;

    const {
      shop,
      customerEmail,
      customerName,
      customerPlan,
      subscriptionStatus,
      installedOn,
      trialEndsOn,
      planPrice,
    } = data;

    const storeUrl = shop ? `https://${shop}` : null;

    // Function to set Crisp data
    const setCrispData = () => {
      try {
        // MERCHANT IDENTITY (Always visible in Crisp dashboard)
        if (customerName) {
          window.$crisp.push(["set", "user:nickname", [customerName]]);
        } else if (shop) {
          window.$crisp.push(["set", "user:nickname", [shop]]);
        }

        if (customerEmail) {
          window.$crisp.push(["set", "user:email", [customerEmail]]);
        }

        if (storeUrl) {
          window.$crisp.push(["set", "user:website", storeUrl]);
        }

        // SESSION DATA (Custom data visible in Crisp visitor profile)
        if (shop) {
          window.$crisp.push(["set", "session:data", ["shop", shop]]);
        }
        if (storeUrl) {
          window.$crisp.push(["set", "session:data", ["store_url", storeUrl]]);
        }
        if (customerEmail) {
          window.$crisp.push(["set", "session:data", ["customer_email", customerEmail]]);
        }
        if (customerPlan) {
          window.$crisp.push(["set", "session:data", ["app_subscription_plan", customerPlan]]);
        }
        if (planPrice) {
          window.$crisp.push(["set", "session:data", ["plan_price", planPrice]]);
        }
        if (subscriptionStatus) {
          window.$crisp.push(["set", "session:data", ["subscription_status", subscriptionStatus]]);
        }
        if (installedOn) {
          window.$crisp.push(["set", "session:data", ["installed_on", installedOn]]);
        }
        if (trialEndsOn) {
          window.$crisp.push(["set", "session:data", ["trial_ends_on", trialEndsOn]]);
        }

        console.log("Crisp data set successfully");
      } catch (error) {
        console.error("Error setting Crisp data:", error);
      }
    };

    // Function to show welcome message
    const showWelcomeMessage = () => {
      if (welcomeMessageShown.current) return;

      try {
        const displayName = customerName || shop || "there";
        const welcomeMessage = `Hello ${displayName}! Welcome to Image Overlays! We're here to help you with any questions about adding overlays to your products. How can we assist you today?`;

        if (window.$crisp && Array.isArray(window.$crisp)) {
          window.$crisp.push(["do", "message:show", ["text", welcomeMessage]]);
          welcomeMessageShown.current = true;
        }
      } catch (error) {
        console.error("Error showing welcome message:", error);
      }
    };

    // Set data when session is loaded
    window.$crisp.push(["on", "session:loaded", function () {
      setCrispData();
      // Set data again after a short delay to ensure it's applied
      setTimeout(setCrispData, 1000);
    }]);

    // Show welcome message when chatbox opens
    window.$crisp.push(["on", "chat:opened", function () {
      setTimeout(showWelcomeMessage, 500);
    }]);

    // Try setting data immediately (in case session already loaded)
    setCrispData();
  }, [data]);

  return (
    <AppProvider isEmbeddedApp apiKey={data.apiKey}>
      <NavMenu>
        <Link to="/app" prefetch="intent" rel="home">
          {t("navigation.home", "Home")}
        </Link>
        <Link to="/app/setting" prefetch="intent">{t("navigation.settings", "Settings")}</Link>
        <Link to="/app/plan" prefetch="intent">{t("navigation.plan", "Plan")}</Link>
      </NavMenu>
      {isNavigating ? (
        <Box paddingBlock="400" paddingInline="400">
          <SkeletonPage backAction>
            <Box paddingBlockEnd="400">
              <SkeletonDisplayText size="small" />
            </Box>
            <SkeletonBodyText lines={3} />
            <Box paddingBlockStart="600">
              <SkeletonBodyText lines={5} />
            </Box>
          </SkeletonPage>
        </Box>
      ) : (
        <Outlet />
      )}
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
