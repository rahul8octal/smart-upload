import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useFetcher,
} from "@remix-run/react";
import {
  Box,
  Button,
  Card,
  InlineStack,
  Text,
  Page,
  Icon,
  BlockStack,
  Layout,
  TextField,
  Select,
  Banner,
} from '@shopify/polaris';
import {
  ArrowLeftIcon,
  RefreshIcon,
  SearchIcon
} from '@shopify/polaris-icons';
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useI18n } from "../i18n";



export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const settings = await prisma.shop_settings.findUnique({
    where: { shop: session.shop }
  });

  console.log("DEBUG: settings for", session.shop, settings);

  return {
    settings: {
      ...settings,
      storage_service: settings?.storage_service || 'google_drive'
    },
    shop: session.shop,
    host: new URL(request.url).searchParams.get("host"),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "disconnect") {
    await prisma.shop_settings.update({
      where: { shop: session.shop },
      data: {
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
        storage_account_email: null,
        storage_account_name: null,
      }
    });
    return { success: true };
  }

  if (action === "connect_google") {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);
    const hostName = request.headers.get("X-Forwarded-Host") || request.headers.get("Host") || url.host;
    const protocol = request.headers.get("X-Forwarded-Proto") || "https";
    const baseUrl = process.env.SHOPIFY_APP_URL || `${protocol}://${hostName}`;
    
    const { getOAuthClient } = await import("../utils/google-drive.server");
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
    
    return json({ authUrl });
  }

  if (action === "fetch_folders") {
    const settings = await prisma.shop_settings.findUnique({
      where: { shop: session.shop }
    });
    if (!settings || !settings.google_access_token) {
      return { success: false, error: "Not connected" };
    }
    const { listFolders } = await import("../utils/google-drive.server");
    const folders = await listFolders({
      access_token: settings.google_access_token,
      refresh_token: settings.google_refresh_token,
    });
    return { success: true, folders };
  }
  return { success: false };
};

export default function CreateUpload() {
  const { settings, shop, host } = useLoaderData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [currentStep, setCurrentStep] = useState(1);
  const googleConnected = !!settings.google_access_token;
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [matchingType, setMatchingType] = useState("");
  const [replacementOption, setReplacementOption] = useState("");

  const folders = fetcher.data?.folders || [];
  const folderOptions = [
    { label: 'Select folder', value: '' },
    ...folders.map(f => ({ label: f.name, value: f.id }))
  ];

  const handleRefreshFolders = () => {
    fetcher.submit({ action: 'fetch_folders' }, { method: 'post' });
  };

  useEffect(() => {
    if (googleConnected && folders.length === 0 && fetcher.state === 'idle') {
      handleRefreshFolders();
    }
  }, [googleConnected]);

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate("/app");
    }
  };

  useEffect(() => {
    if (fetcher.data?.authUrl) {
      console.log("Redirecting to Google Auth URL:", fetcher.data.authUrl);
      window.top.location.href = fetcher.data.authUrl;
    }
  }, [fetcher.data]);

  const handleConnect = () => {
    if (googleConnected) {
       fetcher.submit({ action: 'disconnect' }, { method: 'post' });
    } else {
       fetcher.submit({ action: 'connect_google' }, { method: 'post' });
    }
  };

  const matchingOptions = [
    { label: 'Select', value: '' },
    { label: 'SKU', value: 'sku' },
    { label: 'Barcode', value: 'barcode' },
    { label: 'Title', value: 'title' },
    { label: 'Metafield', value: 'metafield' },
  ];

  const replacementOptions = [
    { label: 'Select', value: '' },
    { label: 'Replace existing images', value: 'replace' },
    { label: 'Add as new images', value: 'add' },
  ];

  return (
    <Page>
       <Box paddingBlockEnd="500">
          <Button variant="plain" icon={ArrowLeftIcon} onClick={handleBack}>
            {currentStep === 1 ? t("common.actions.back", "Back") : "Create upload"}
          </Button>
       </Box>

       <Layout>
          {/* STEP 1: Connect Source */}
          <Layout.Section variant="oneThird">
             <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Step 1: Connect with {settings.storage_service === 'google_drive' ? 'Google Drive™' : 'Dropbox'}
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Connect your {settings.storage_service === 'google_drive' ? 'Google Drive' : 'Dropbox'} account to access your files
                </Text>
             </BlockStack>
          </Layout.Section>
          <Layout.Section>
             <Card>
                <InlineStack align="space-between" blockAlign="center">
                   <InlineStack gap="400" blockAlign="center">
                      <div style={{ padding: '8px', background: '#f4f4f4', borderRadius: '4px' }}>
                         {/* Icon placeholder for Service */}
                         <span>📁</span>
                      </div>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="bold">
                          {settings.storage_service === 'google_drive' ? 'Google Drive™ Account' : 'Dropbox Account'}
                        </Text>
                        <Text variant="bodyMd" tone="subdued">
                          {googleConnected ? settings.storage_account_email : "No account connected"}
                        </Text>
                      </BlockStack>
                   </InlineStack>
                    <Button 
                     variant={googleConnected ? "secondary" : "primary"}
                     onClick={handleConnect}
                     loading={fetcher.state !== 'idle' && fetcher.formData?.get('action') === 'connect_google'}
                    >
                      {googleConnected ? "Disconnect" : "Connect"}
                    </Button>
                </InlineStack>
             </Card>
          </Layout.Section>

          {/* STEP 2: Select Folder */}
          <Layout.Section variant="oneThird">
             <BlockStack gap="200">
                <Text variant="headingMd" as="h2" tone={!googleConnected ? "subdued" : "active"}>
                  Step 2: Select folder
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Select the folder from {settings.storage_service === 'google_drive' ? 'Google Drive' : 'Dropbox'} that contains your product images.
                  <br/><br/>
                  Click on the refresh button if you added your folder recently.
                </Text>
             </BlockStack>
          </Layout.Section>
          <Layout.Section>
             <Card>
                <BlockStack gap="400">
                  <Text variant="bodyMd">Folder name</Text>
                  <InlineStack gap="200">
                    <div style={{ flex: 1 }}>
                      <Select
                        label="Select folder"
                        labelHidden
                        options={folderOptions}
                        value={selectedFolderId}
                        onChange={setSelectedFolderId}
                        disabled={!googleConnected}
                      />
                    </div>
                    <Button 
                      icon={RefreshIcon} 
                      disabled={!googleConnected} 
                      onClick={handleRefreshFolders}
                      loading={fetcher.state !== 'idle' && fetcher.formData?.get('action') === 'fetch_folders'}
                    >
                      Refresh
                    </Button>
                  </InlineStack>
                </BlockStack>
             </Card>
          </Layout.Section>

          {/* STEP 3: Matching Type */}
          <Layout.Section variant="oneThird">
             <BlockStack gap="200">
                <Text variant="headingMd" as="h2" tone={!selectedFolderId ? "subdued" : "active"}>
                  Step 3: Select matching type
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Select the type of matching you want to use to match your product images to your products/variants.
                  <br/><br/>
                  If you want to match by metafields, check <Button variant="plain" onClick={() => navigate("/app/setting")}>settings</Button> page to set metafield namespace and key.
                </Text>
             </BlockStack>
          </Layout.Section>
          <Layout.Section>
             <Card>
                <BlockStack gap="400">
                  <Select
                    label="Matching type"
                    options={matchingOptions}
                    value={matchingType}
                    onChange={setMatchingType}
                    disabled={!selectedFolderId}
                  />
                </BlockStack>
             </Card>
          </Layout.Section>

          {/* STEP 4: Replacement Options */}
          <Layout.Section variant="oneThird">
             <BlockStack gap="200">
                <Text variant="headingMd" as="h2" tone={!matchingType ? "subdued" : "active"}>
                  Step 4: Image replacement options
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  You can decide to delete current images and replace them with new images or add new images without removing current product images.
                  <br/><br/>
                  If you choose replacing, it will remove ALL EXISTING images of the products for which new images will be uploaded.
                </Text>
             </BlockStack>
          </Layout.Section>
          <Layout.Section>
             <Card>
                <BlockStack gap="400">
                  <Select
                    label="Would you like to replace the current images?"
                    options={replacementOptions}
                    value={replacementOption}
                    onChange={setReplacementOption}
                    disabled={!matchingType}
                  />
                </BlockStack>
             </Card>
          </Layout.Section>

          {/* STEP 5: Preview */}
          <Layout.Section variant="oneThird">
             <BlockStack gap="200">
                <Text variant="headingMd" as="h2" tone={!replacementOption ? "subdued" : "active"}>
                  Step 5: Preview matching results
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  You will see how images matched to products before uploading images to products.
                </Text>
             </BlockStack>
          </Layout.Section>
          <Layout.Section>
             <Card>
                <BlockStack gap="400" inlineAlign="start">
                  <Button 
                    variant="primary" 
                    disabled={!replacementOption}
                    onClick={() => {
                      const params = new URLSearchParams({
                        folderId: selectedFolderId,
                        matchingType,
                        replacementOption,
                        folderName: folderOptions.find(f => f.value === selectedFolderId)?.label || "",
                      });
                      navigate(`/app/preview_match?${params.toString()}`);
                    }}
                  >
                    Start matching
                  </Button>
                  <Text variant="bodyMd" tone="subdued">
                    On the next page, you will see how images matched to products.
                  </Text>
                </BlockStack>
             </Card>
          </Layout.Section>
       </Layout>
    </Page>
  );
}
