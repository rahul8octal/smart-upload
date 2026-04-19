import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Layout,
  Page,
  Button,
  SkeletonPage,
  SkeletonBodyText,
  Frame,
  Banner,
  Modal,
  Text,
  EmptyState,
  InlineStack,
  Grid,
  BlockStack, Bleed, Box, InlineGrid,
} from '@shopify/polaris';
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { CREATE_SUBSCRIPTION_IN_SHOPIFY } from "../component/ShopifyQuery";
import moment from "moment";
import { useI18n } from "../i18n";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop;

  try {
    const plans = await prisma.plan_master.findMany({
      orderBy: { monthly_price: 'asc' },
      select: {
        id: true,
        title: true,
        slug: true,
        trial_days: true,
        monthly_price: true,
        access_products: true,
        shop_plans: {
          where: { shop: shop },
          orderBy: { id: "desc" },
          take: 5,
        },
      },
    });

    const enrichedPlans = plans?.map((plan) => {
      const shopPlans = plan.shop_plans;
      const activePlan = shopPlans.find((p) => p.status === "Active");
      const lastPlan = shopPlans[0]; // latest plan
      return {
        id: plan.id,
        title: plan.title,
        slug: plan.slug,
        trial_days: plan.trial_days,
        monthly_price: plan.monthly_price,
        access_products: plan.access_products,
        activated: activePlan ? 1 : 0,
        charge_id: activePlan?.charge_id ?? null,
        last_charge_id: lastPlan?.charge_id ?? null,
        last_charge_status: lastPlan?.charge_status ?? null,
      };
    });

    const ShopPlansData = await prisma.shop_plans.findMany({
      where: { shop: shop, status: "Active" },
      orderBy: { id: "desc" },
    });

    const ShopProductCount = await prisma.product_overlays.count({
      where: { shop_id: shop },
    });

    const respReasult = {
      shop_plan_access_products: ShopPlansData?.length
        ? ShopPlansData[0]?.access_products
        : null,
      shop_product_overlay_count: ShopProductCount,
    };

    const env = {
      TEST_PLAN_STORES: process.env.TEST_PLAN_STORES,
      PUBLIC_HOST: process.env.PUBLIC_HOST,
      PUBLIC_FOLDER_PATH: process.env.PUBLIC_FOLDER_PATH,
    };

    return {
      admin,
      env,
      data: enrichedPlans,
      shop: shop,
      respReasult: respReasult,
    };
  } catch (err) {
    console.error(err);
    return { error: err.message };
  }
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = session?.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  let trialDaysLeft = 7;

  try {
    if (actionType === "selectNewPlan") {
      const selectPlanInfo = formData.get("selectPlanInfo")
        ? JSON.parse(formData.get("selectPlanInfo"))
        : null;

      if (!selectPlanInfo || !selectPlanInfo.plan_id) {
        return {
          success: false,
          message: "Invalid or missing plan information.",
        };
      }

      const PlanDataExist = await prisma.plan_master.findUnique({
        where: { id: selectPlanInfo.plan_id },
      });

      const activePlan = await prisma.shop_plans.findFirst({
        where: { status: 'Active' },
      });

      if (activePlan) {
        const trialEnds = activePlan?.trial_ends_on;
        if (trialEnds) {
          const today = moment.utc().startOf("day");
          const end = moment.utc(trialEnds, "YYYY-MM-DD").endOf("day");
          trialDaysLeft = Math.max(0, end.diff(today, "days"));
          trialDaysLeft = trialDaysLeft >= 7 ? 7 : trialDaysLeft;
        }
      }

      if (!PlanDataExist) {
        return {
          success: false,
          message: "Invalid plan_id. Plan detail is not found.",
        };
      }

      const ShopPlanExist = await prisma.shop_plans.findMany({
        where: {
          shop: shop,
          plan_id: selectPlanInfo.plan_id,
          status: "Active",
        },
      });

      if (ShopPlanExist?.length) {
        return {
          success: false,
          message: "Plan is already active for your shop.",
        };
      }

      let result = await prisma.shop_plans.create({
        data: {
          shop: shop,
          plan_id: selectPlanInfo.plan_id,
          monthly_price: PlanDataExist.monthly_price,
          access_products: PlanDataExist.access_products,
          start_date: selectPlanInfo.start_date || "",
          end_date: selectPlanInfo.end_date || "",
          charge_id: selectPlanInfo.charge_id || "",
          charge_status: selectPlanInfo.charge_status || "",
          plan_type: selectPlanInfo.plan_type || "",
          plan_name: selectPlanInfo.plan_name || "",
          return_url: selectPlanInfo.return_url || "",
          is_test: selectPlanInfo.is_test || "",
          activated_on: selectPlanInfo.activated_on || "",
          trial_ends_on: selectPlanInfo.trial_ends_on || "",
          cancelled_on: selectPlanInfo.cancelled_on || "",
          trial_days: selectPlanInfo.trial_days || "",
          confirmation_url: selectPlanInfo.confirmation_url || "",
          status: selectPlanInfo.status || "Inactive",
        },
      });

      let return_fields = {
        shop: result.shop,
        plan_id: result.plan_id,
        monthly_price: result.monthly_price,
        access_products: result.access_products,
        start_date: result.start_date,
        end_date: result.end_date,
        charge_id: result.charge_id,
        charge_status: result.charge_status,
        plan_type: result.plan_type,
        plan_name: result.plan_name,
        return_url: result.return_url,
        is_test: result.is_test,
        activated_on: result.activated_on,
        trial_ends_on: result.trial_ends_on,
        cancelled_on: result.cancelled_on,
        trial_days: result.trial_days,
        confirmation_url: result.confirmation_url,
        status: result.status,
        createdAt: result.created_at,
      };

      // If the plan is free (monthly_price === 0), return immediately
      if (parseInt(PlanDataExist?.monthly_price) === 0) {
        const freePlanRedirectURL = `/get-shopify-plan?shop_name=${shop}&sel_plan=${selectPlanInfo.plan_id}&charge_id=`;
        return redirect(freePlanRedirectURL, { target: "_top" });
      }

      // Create Shopify subscription for non-free plans
      const returnUrl = `${process.env.PUBLIC_HOST}${process.env.PUBLIC_FOLDER_PATH}get-shopify-plan?shop_name=${shop}&sel_plan=${selectPlanInfo.plan_id}`;
      console.log(returnUrl, 'return host')
      //         const returnUrl = `https://latina-impressed-demands-adjacent.trycloudflare.com
      // /get-shopify-plan?shop_name=${shop}&sel_plan=${selectPlanInfo.plan_id}`;
      const response = await admin.graphql(CREATE_SUBSCRIPTION_IN_SHOPIFY, {
        variables: {
          name: selectPlanInfo.plan_name,
          returnUrl,
          test: selectPlanInfo.is_test === "true",
          trialDays: trialDaysLeft,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: Number(PlanDataExist.monthly_price).toFixed(2),
                    currencyCode: "USD",
                  },
                  interval: "EVERY_30_DAYS",
                },
              },
            },
          ],
        },
      });

      const { data, errors } = await response.json();

      if (errors || !data || !data.appSubscriptionCreate) {
        return {
          success: false,
          message: "Failed to create Shopify subscription.",
          errors: errors || "No data returned from Shopify API.",
        };
      }

      if (data.appSubscriptionCreate.userErrors?.length > 0) {
        return {
          success: false,
          message: "Shopify subscription creation failed.",
          errors: data.appSubscriptionCreate.userErrors,
        };
      }

      const charge_id = data.appSubscriptionCreate.appSubscription?.id?.replace(
        "gid://shopify/AppSubscription/",
        "",
      );
      const confirmation_url = data.appSubscriptionCreate.confirmationUrl;

      if (!charge_id || !confirmation_url) {
        return {
          success: false,
          message: "Invalid subscription response from Shopify.",
          errors: "Missing charge_id or confirmation_url.",
        };
      }

      // Update shop_plans with charge_id and confirmation_url
      await prisma.shop_plans.update({
        where: { id: result.id },
        data: {
          charge_id,
          confirmation_url,
          return_url: returnUrl,
        },
      });

      return redirect(confirmation_url, { target: "_top" });
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("Action error:", error);
    return { success: false, error: error.message };
  }
}

export default function PlanIndex() {
  const { env, shop, data, respReasult } = useLoaderData();
  const [isLoading, setIsLoading] = useState(false);
  const [chargeBanner, setChargeBanner] = useState([]);
  const [modalActive, setModalActive] = useState(false);
  const [isPlanModalLoading, setIsPlanModalLoading] = useState(false);
  const [chooseNewPlanInfo, setChooseNewPlanInfo] = useState({});
  const [shopProductOverlayCount, setShopProductOverlayCount] = useState(0);
  const [submittingPlanId, setSubmittingPlanId] = useState(null);
  const fetcher = useFetcher();
  const formData = new FormData();
  const navigate = useNavigate();
  const { t } = useI18n();

  useEffect(() => {
    if (
      respReasult?.shop_product_overlay_count ||
      respReasult?.shop_plan_access_products
    ) {
      setShopProductOverlayCount(respReasult?.shop_product_overlay_count);
    }
  }, [respReasult]);

  useEffect(() => {
    const activatedPlan = data?.filter(
      (plan) =>
        plan?.activated === 1 &&
        ["cancelled", "declined", "expired", "frozen"].includes(
          plan?.last_charge_status,
        ),
    );

    if (activatedPlan?.length) {
      const planWarninMsg = t("plans.billingWarning", "Your billing is {{status}}", { status: activatedPlan[0].last_charge_status });
      setChargeBanner([
        <div key="0">
          <Banner onDismiss={() => setChargeBanner([])} tone="warning">
            <p>{planWarninMsg}</p>
          </Banner>
          <br />
        </div>,
      ]);
    }
  }, [data, t]);

  const upgradePlan = (plan_id, title, monthly_price, access_products) => {
    setModalActive(true);
    setChooseNewPlanInfo({
      plan_id,
      title,
      monthly_price,
      access_products,
    });
  };

  const skeletonState = () => (
    <Layout.Section>
      <Card sectioned>
        <SkeletonPage>
          <SkeletonBodyText lines={5} />
        </SkeletonPage>
      </Card>
    </Layout.Section>
  );

  const planInfo = (planData) => {
    if (!planData?.length) {
      return (
        <Grid.Cell columnSpan={{ xs: 12, sm: 12, md: 12, lg: 12, xl: 12 }}>
          <Layout.Section>
            <Card sectioned>
              <EmptyState
                heading={t("plans.errors.somethingWrong", "Something is going wrong")}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>{t("plans.errors.patience", "We are working on it. Thanks for your patience")}</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Grid.Cell>
      );
    }

    return planData?.map((plan, i) => {
      let button = null;
      if (plan.activated) {
        button = <Button disabled>{t("plans.current", "Current")}</Button>;
      } else {
        const isBtnDisable = false; // Always enable button if not active, let modal warn about consequences

        button = (
          <Button
            size={'large'}
            tone="primary"
            variant="primary"
            loading={submittingPlanId === plan.id}
            disabled={isBtnDisable}
            onClick={() =>
              selectNewPlan(
                plan.id,
                plan.title,
                plan.monthly_price,
              )
            }
          >
            {plan.monthly_price === '0' ? t("plans.downgrade", "Downgrade") : t("plans.upgrade", "Upgrade")}
          </Button>
        );
      }

      return (
        <Card key={i}>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text variant="headingXl" as="h2">
                {plan.title}
              </Text>
              <InlineStack align="start" blockAlign="baseline" gap="100">
                <Text variant="heading2xl" as="span">
                  ${plan?.monthly_price}
                </Text>
                <Text tone="subdued" as="span">{t("plans.perMonth", "/ month")}</Text>
              </InlineStack>
            </BlockStack>

            <Text variant="bodyLg" tone="subdued">
              {plan.access_products === 'UNLIMITED'
                ? t("plans.unlimitedProducts", "Unlimited active products")
                : t("plans.limitedProducts", "Up to {{count}} active products", { count: plan.access_products })}
            </Text>

            <Box paddingBlockStart="200">
              {button}
            </Box>
          </BlockStack>
        </Card>
      );
    });
  };

  const selectNewPlan = async (plan_id, title, monthly_price) => {
    setSubmittingPlanId(plan_id);
    setIsPlanModalLoading(true);
    const isTestStore = (env.TEST_PLAN_STORES || '').split(',').map(s => s.trim()).includes(shop);

    const selectPlanInfo = {
      plan_id,
      start_date: new Date().toISOString(),
      charge_status: "pending",
      status: parseInt(monthly_price) === 0 ? "Active" : "Inactive",
      plan_type: "MONTHLY",
      trial_days: "7",
      plan_name: title,
      is_test: isTestStore ? "true" : "false",
    };

    formData.append("actionType", "selectNewPlan");
    formData.append("selectPlanInfo", JSON.stringify(selectPlanInfo));

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  useEffect(() => {
    const handleFetcherData = async () => {
      if (fetcher.data && fetcher.data.success && fetcher.state === "idle") {
        // Redirection is now handled by the action using return redirect(..., { target: "_top" })
      } else if (
        fetcher.data &&
        !fetcher.data.success &&
        fetcher.state === "idle"
      ) {
        let errorMessage = fetcher.data.message || "An error occurred";
        if (fetcher.data.errors) {
          if (Array.isArray(fetcher.data.errors)) {
            errorMessage += `: ${fetcher.data.errors.map((e) => e.message).join(", ")}`;
          } else {
            errorMessage += `: ${JSON.stringify(fetcher.data.errors)}`;
          }
        }
        shopify.toast.show(errorMessage, { isError: true });
        setIsPlanModalLoading(false);
        setSubmittingPlanId(null);
      }
    };

    handleFetcherData();
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (fetcher.state === "idle" && submittingPlanId) {
      setSubmittingPlanId(null);
      setIsPlanModalLoading(false);
    }
  }, [fetcher.state, submittingPlanId]);

  const showSkeleton = fetcher.state === "loading" && !fetcher.formData;

  const handleModalChange = useCallback(() => {
    if (modalActive) setChooseNewPlanInfo({});
    setModalActive(!modalActive);
    setIsLoading(false);
    setIsPlanModalLoading(false);
  }, [modalActive]);

  return (
    <Frame>
      <Page title={t("plans.title", "Plan & Pricing")}>
        {chargeBanner}

        <Modal
          open={modalActive}
          onClose={handleModalChange}
          title={t("plans.modal.title", "Change Plan")}
          primaryAction={{
            content: t("plans.modal.confirm", "Confirm Change"),
            onAction: () =>
              selectNewPlan(
                chooseNewPlanInfo.plan_id,
                chooseNewPlanInfo.title,
                chooseNewPlanInfo.monthly_price,
              ),
            loading: isPlanModalLoading,
          }}
          secondaryActions={[
            {
              content: t("plans.modal.cancel", "Cancel"),
              onAction: handleModalChange,
              disabled: isPlanModalLoading,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                {t("plans.modal.switchingTo", "You are switching to **{{title}}**.", { title: chooseNewPlanInfo.title })}
              </Text>
              {chooseNewPlanInfo.access_products !== "UNLIMITED" && (
                <Banner tone="warning">
                  <p>
                    {t("plans.modal.limitWarning", "This plan is limited to {{count}} products. If you usage exceeds this limit, excess products will be deactivated (but not deleted).", { count: chooseNewPlanInfo.access_products })}
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Layout>
          <Layout.Section>
            {showSkeleton ? (
              skeletonState()
            ) : (
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400" alignItems="start">
                {planInfo(data)}
              </InlineGrid>
            )}
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
