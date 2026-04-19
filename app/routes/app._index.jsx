import {
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import {
  Box,
  Button,
  Card,
  InlineStack,
  Text,
  Page,
  Icon,
  InlineGrid,
  BlockStack,
  ProgressBar,
} from '@shopify/polaris';
import {
  ChevronUpIcon,
  XIcon
} from '@shopify/polaris-icons';
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useI18n } from "../i18n";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const settings = await prisma.shop_settings.findUnique({
    where: { shop: session.shop }
  });

  const activePlan = await prisma.shop_plans.findFirst({
    where: {
      shop: session.shop,
      status: 'Active',
    },
  });

  return {
    settings: settings || { storage_service: 'google_drive' },
    activePlan,
  };
};

export default function Home() {
  const { settings, activePlan } = useLoaderData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [setupStep, setSetupStep] = useState(0);

  return (
    <Page>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="end">
          <BlockStack gap="200">
            <Text variant="headingXl" as="h1">
              {t("home.dashboard.title", "Dashboard")}
            </Text>
            <Text variant="bodyMd" tone="subdued">
              {t("home.dashboard.description", "You can match product images with products or variants based on SKU, barcode, or title, and upload them from Google Drive or Dropbox.")}
            </Text>
          </BlockStack>
          <Button variant="primary" onClick={() => navigate("/app/create_upload")}>
            {t("home.dashboard.createNewUpload", "Create new upload")}
          </Button>
        </InlineStack>

        <InlineGrid columns={2} gap="400">
          <Card padding="600">
            <BlockStack gap="200" align="center">
              <Text variant="headingMd" as="h2" alignment="center">
                {t("home.dashboard.stats.totalUploaded", "Total uploaded")}
              </Text>
              <Text variant="heading2xl" as="p" alignment="center">
                0
              </Text>
            </BlockStack>
          </Card>
          <Card padding="600">
            <BlockStack gap="200" align="center">
              <Text variant="headingMd" as="h2" alignment="center">
                {t("home.dashboard.stats.timeSaved", "Time saved")}
              </Text>
              <Text variant="heading2xl" as="p" alignment="center">
                0 {t("home.dashboard.stats.hours", "hours")}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card padding="0">
          <Box padding="500">
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">
                  {t("home.setupGuide.title", "Setup guide")}
                </Text>
                <InlineStack gap="200">
                   <Button variant="plain" icon={ChevronUpIcon} />
                   <Button variant="plain" icon={XIcon} />
                </InlineStack>
              </InlineStack>
              
              <Text variant="bodyMd" tone="subdued">
                {t("home.setupGuide.description", "Use this personalized guide to get your app up and running.")}
              </Text>
              
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued">
                  {t("home.setupGuide.completed", "{{count}} / {{total}} completed", { count: setupStep, total: 3 })}
                </Text>
                <ProgressBar progress={(setupStep / 3) * 100} size="small" />
              </BlockStack>

              <BlockStack gap="400">
                {/* Step 1: Connect Source */}
                <Box padding="400" background={setupStep === 0 ? "bg-surface-secondary" : "transparent"} borderRadius="200">
                   <BlockStack gap="300">
                     <InlineStack gap="300" blockAlign="center">
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          border: '2px dashed #999', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: '12px'
                        }}>
                          {setupStep > 0 ? "✓" : ""}
                        </div>
                        <Text variant="headingSm">
                          {t("home.setupGuide.steps.connectSource.title", "Connect image source")}
                        </Text>
                     </InlineStack>
                     
                     {setupStep === 0 && (
                       <Box paddingInlineStart="900">
                          <BlockStack gap="300">
                            <Text variant="bodyMd" tone="subdued">
                              {t("home.setupGuide.steps.connectSource.description", "You can use Google Drive or Dropbox as your image source. Google Drive is selected by default.")}
                            </Text>
                            <InlineStack gap="200">
                              <Button variant="primary" onClick={() => navigate("/app/create_upload")}>
                                {settings.storage_service === 'dropbox' ? t("home.setupGuide.steps.connectSource.connectDropbox", "Connect Dropbox") : t("home.setupGuide.steps.connectSource.connectGoogle", "Connect Google Drive")}
                              </Button>
                              <Button onClick={() => navigate("/app/setting")}>
                                {t("home.setupGuide.steps.connectSource.changeSource", "Change source")}
                              </Button>
                            </InlineStack>
                          </BlockStack>
                       </Box>
                     )}
                   </BlockStack>
                </Box>

                {/* Step 2: Match Images */}
                <Box padding="400" background={setupStep === 1 ? "bg-surface-secondary" : "transparent"} borderRadius="200">
                   <InlineStack gap="300" blockAlign="center">
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px dashed #999', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {setupStep > 1 ? "✓" : ""}
                      </div>
                      <Text variant="headingSm" tone={setupStep < 1 ? "subdued" : "active"}>
                        {t("home.setupGuide.steps.matchImages.title", "Match Images")}
                      </Text>
                   </InlineStack>
                </Box>

                {/* Step 3: Preview */}
                <Box padding="400" background={setupStep === 2 ? "bg-surface-secondary" : "transparent"} borderRadius="200">
                   <InlineStack gap="300" blockAlign="center">
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px dashed #999', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {setupStep > 2 ? "✓" : ""}
                      </div>
                      <Text variant="headingSm" tone={setupStep < 2 ? "subdued" : "active"}>
                        {t("home.setupGuide.steps.previewBulk.title", "Preview & bulk upload images")}
                      </Text>
                   </InlineStack>
                </Box>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>

        {activePlan && activePlan.access_products !== 'UNLIMITED' && (
          <Card padding="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodyMd" tone="subdued">
                {t("home.plan.freePlanDesc", "You can use the Free plan to upload up to 25 product images. You haven't uploaded any product images yet. For unlimited image uploads, please upgrade to the Premium plan.")}
              </Text>
              <Button onClick={() => navigate("/app/plan")}>
                {t("common.actions.upgradePlan", "Upgrade Plan")}
              </Button>
            </InlineStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
