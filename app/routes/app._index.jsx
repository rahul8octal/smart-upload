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

  const isConnected = !!(settings?.google_access_token || settings?.dropbox_access_token);
  
  const allJobs = await prisma.upload_jobs.findMany({
    where: { shop: session.shop }
  });

  const totalUploaded = allJobs.reduce((sum, job) => sum + (job.processed_files || 0), 0);
  // Assuming each image upload saves roughly 2 minutes of manual work
  const timeSaved = Math.max(0, (totalUploaded * 2) / 60).toFixed(1);

  let completedSteps = 0;
  if (isConnected) completedSteps++;
  if (allJobs.length > 0) completedSteps++;
  if (totalUploaded > 0) completedSteps++;

  return {
    settings: settings || { storage_service: 'google_drive' },
    activePlan,
    isConnected,
    totalUploaded,
    timeSaved: timeSaved === "0.0" ? "0" : timeSaved,
    completedSteps,
    hasJobs: allJobs.length > 0
  };
};

export default function Home() {
  const { settings, activePlan, isConnected, totalUploaded, timeSaved, completedSteps, hasJobs } = useLoaderData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [setupStep, setSetupStep] = useState(isConnected ? 1 : 0);

  return (
    <Page>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingXl" as="h1">
            {t("home.dashboard.title", "Dashboard")}
          </Text>
          <Button variant="primary" onClick={() => navigate("/app/create_upload")}>
            {t("home.dashboard.createNewUpload", "Create new upload")}
          </Button>
        </InlineStack>

        <Box paddingBlockEnd="200">
          <Text variant="bodyMd" tone="subdued">
            {t("home.dashboard.description", "You can match product images with products or variants based on SKU, barcode, or title, and upload them from Google Drive or Dropbox.")}
          </Text>
        </Box>

        <InlineGrid columns={2} gap="400">
          <Card padding="400">
            <BlockStack gap="200" align="center">
              <Text variant="headingMd" as="h2" alignment="center">
                {t("home.dashboard.stats.totalUploaded", "Total uploaded")}
              </Text>
              <Text variant="heading2xl" as="p" alignment="center">
                {totalUploaded}
              </Text>
            </BlockStack>
          </Card>
          <Card padding="600">
            <BlockStack gap="200" align="center">
              <Text variant="headingMd" as="h2" alignment="center">
                {t("home.dashboard.stats.timeSaved", "Time saved")}
              </Text>
              <Text variant="heading2xl" as="p" alignment="center">
                {timeSaved} {t("home.dashboard.stats.hours", "hours")}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card padding="0">
          <Box padding="400">
            <BlockStack gap="300">
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
                  {t("home.setupGuide.completed", "{{count}} / {{total}} completed", { count: completedSteps, total: 3 })}
                </Text>
                <ProgressBar progress={(completedSteps / 3) * 100} size="small" />
              </BlockStack>

              <BlockStack gap="300">
                {/* Step 1: Connect Source */}
                <Box padding="300" background={setupStep === 0 ? "bg-surface-secondary" : "transparent"} borderRadius="200">
                   <BlockStack gap="200">
                     <div onClick={() => setSetupStep(0)} style={{ cursor: 'pointer' }}>
                        <InlineStack gap="300" blockAlign="center">
                           <div style={{ 
                             width: '24px', 
                             height: '24px', 
                             borderRadius: '50%', 
                             border: isConnected ? 'none' : '2px dashed #999', 
                             background: isConnected ? '#008060' : 'transparent',
                             color: 'white',
                             display: 'flex', 
                             alignItems: 'center', 
                             justifyContent: 'center',
                             fontSize: '12px'
                           }}>
                             {isConnected ? "✓" : ""}
                           </div>
                           <Text variant="headingSm">
                             {t("home.setupGuide.steps.connectSource.title", "Connect image source")}
                           </Text>
                        </InlineStack>
                     </div>
                     
                     {setupStep === 0 && (
                        <Box paddingInlineStart="900" paddingBlockEnd="200">
                           <BlockStack gap="300">
                             <Text variant="bodyMd" tone="subdued">
                               {t("home.setupGuide.steps.connectSource.description", "You can use Google Drive or Dropbox as your image source. Google Drive is selected by default.")}
                             </Text>
                             <InlineStack gap="200">
                               <Button variant="primary" onClick={(e) => { e.stopPropagation(); navigate("/app/create_upload"); }}>
                                 {settings.storage_service === 'dropbox' ? t("home.setupGuide.steps.connectSource.connectDropbox", "Connect Dropbox") : t("home.setupGuide.steps.connectSource.connectGoogle", "Connect Google Drive")}
                               </Button>
                               <Button onClick={(e) => { e.stopPropagation(); navigate("/app/setting"); }}>
                                 {t("home.setupGuide.steps.connectSource.changeSource", "Change source")}
                               </Button>
                             </InlineStack>
                           </BlockStack>
                        </Box>
                     )}
                   </BlockStack>
                </Box>

                {/* Step 2: Match Images */}
                <Box 
                  padding="300" 
                  background={setupStep === 1 ? "bg-surface-secondary" : "transparent"} 
                  borderRadius="200"
                >
                   <BlockStack gap="200">
                      <div onClick={() => setSetupStep(1)} style={{ cursor: 'pointer' }}>
                        <InlineStack gap="300" blockAlign="center">
                           <div style={{ 
                             width: '24px', 
                             height: '24px', 
                             borderRadius: '50%', 
                             border: hasJobs ? 'none' : '2px dashed #999', 
                             background: hasJobs ? '#008060' : 'transparent',
                             color: 'white',
                             display: 'flex', 
                             alignItems: 'center', 
                             justifyContent: 'center',
                             fontSize: '12px'
                           }}>
                             {hasJobs ? "✓" : ""}
                           </div>
                           <Text variant="headingSm" tone={setupStep < 1 ? "subdued" : "active"}>
                             {t("home.setupGuide.steps.matchImages.title", "Match images")}
                           </Text>
                        </InlineStack>
                      </div>
                      
                      {setupStep === 1 && (
                        <Box paddingInlineStart="900" paddingBlockEnd="200">
                           <BlockStack gap="300">
                             <Text variant="bodyMd" tone="subdued">
                               {t("home.setupGuide.steps.matchImages.description", "Match images with products or variants based on SKU, barcode, title or metafields.")}
                             </Text>
                             <div style={{ maxWidth: '200px' }}>
                               <Button variant="primary" onClick={(e) => { e.stopPropagation(); navigate("/app/create_upload"); }} fullWidth>
                                 {t("home.setupGuide.steps.matchImages.action", "Start matching")}
                               </Button>
                             </div>
                           </BlockStack>
                        </Box>
                      )}
                   </BlockStack>
                </Box>

                {/* Step 3: Preview */}
                <Box 
                  padding="300" 
                  background={setupStep === 2 ? "bg-surface-secondary" : "transparent"} 
                  borderRadius="200"
                >
                   <BlockStack gap="200">
                      <div onClick={() => setSetupStep(2)} style={{ cursor: 'pointer' }}>
                        <InlineStack gap="300" blockAlign="center">
                           <div style={{ 
                             width: '24px', 
                             height: '24px', 
                             borderRadius: '50%', 
                             border: totalUploaded > 0 ? 'none' : '2px dashed #999', 
                             background: totalUploaded > 0 ? '#008060' : 'transparent',
                             color: 'white',
                             display: 'flex', 
                             alignItems: 'center', 
                             justifyContent: 'center',
                             fontSize: '12px'
                           }}>
                             {totalUploaded > 0 ? "✓" : ""}
                           </div>
                           <Text variant="headingSm" tone={setupStep < 2 ? "subdued" : "active"}>
                             {t("home.setupGuide.steps.previewBulk.title", "Preview & bulk upload images")}
                           </Text>
                        </InlineStack>
                      </div>
                      
                      {setupStep === 2 && (
                        <Box paddingInlineStart="900" paddingBlockEnd="200">
                           <BlockStack gap="300">
                             <Text variant="bodyMd" tone="subdued">
                               {t("home.setupGuide.steps.previewBulk.description", "Review your matching results and bulk upload images to your Shopify products.")}
                             </Text>
                             <div style={{ maxWidth: '200px' }}>
                               <Button variant="primary" onClick={(e) => { e.stopPropagation(); navigate("/app/create_upload"); }} fullWidth>
                                 {t("home.setupGuide.steps.previewBulk.action", "Preview results")}
                               </Button>
                             </div>
                           </BlockStack>
                        </Box>
                      )}
                   </BlockStack>
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
