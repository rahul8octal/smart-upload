import { useLoaderData, useNavigate } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Card,
  IndexTable,
  BlockStack,
  Text,
  Badge,
  Thumbnail,
  InlineStack,
  Button,
  Layout,
  Icon,
  Box,
  Banner,
} from "@shopify/polaris";
import { 
  ChevronLeftIcon,
  AlertBubbleIcon,
  SearchIcon
} from '@shopify/polaris-icons';
import { authenticate } from "../shopify.server";

import prisma from "../db.server";
import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const matchesData = JSON.parse(formData.get("matches") || "[]");
  const replacementOption = formData.get("replacementOption");

  if (action === "create_job") {
    const job = await prisma.upload_jobs.create({
      data: {
        shop: session.shop,
        folder_name: formData.get("folderName"),
        total_files: matchesData.length,
        status: "running",
        logs: [{ time: new Date().toISOString(), message: "Starting upload job...", type: "info" }]
      }
    });

    return json({ success: true, jobId: job.id });
  }

  return json({ success: false });
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const folderId = url.searchParams.get("folderId");
  const matchingType = url.searchParams.get("matchingType");
  const replacementOption = url.searchParams.get("replacementOption");

  if (!folderId || !matchingType) {
    return json({ error: "Missing parameters" }, { status: 400 });
  }

  const settings = await prisma.shop_settings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings || !settings.google_access_token) {
    return json({ error: "Google Drive not connected" }, { status: 401 });
  }

  const { listFiles } = await import("../utils/google-drive.server");
  const images = await listFiles(
    { access_token: settings.google_access_token, refresh_token: settings.google_refresh_token },
    folderId
  );

  const { fetchAllProducts, matchImagesToProducts } = await import("../utils/matching.server");
  const products = await fetchAllProducts(admin, settings.metafield_key);

  const { matches, unmatched } = await matchImagesToProducts(
    images, 
    products, 
    matchingType, 
    { key: settings.metafield_key, type: settings.metafield_type }
  );

  return { 
    matches, 
    unmatched, 
    folderId, 
    matchingType, 
    replacementOption,
    folderName: url.searchParams.get("folderName") || "Unknown" 
  };
};

export default function PreviewMatch() {
  const { matches, unmatched, replacementOption, matchingType, folderName, error } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const isUploading = fetcher.state !== "idle" && fetcher.formData?.get("action") === "bulk_upload";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.jobId) {
      // Pass matches data to the progress page via session storage or temporary state
      // Since it's large, we'll store it in sessionStorage for the loop
      sessionStorage.setItem(`job_${fetcher.data.jobId}_matches`, JSON.stringify(matches));
      sessionStorage.setItem(`job_${fetcher.data.jobId}_replacement`, replacementOption);
      
      navigate(`/app/upload_progress/${fetcher.data.jobId}`);
    }
  }, [fetcher.data, navigate, matches, replacementOption]);

  if (error) {
    return (
      <Page>
        <Banner tone="critical">{error}</Banner>
      </Page>
    );
  }

  const resourceName = {
    singular: "match",
    plural: "matches",
  };

  const handleStartUpload = () => {
    fetcher.submit(
      { 
        action: "create_job", 
        matches: JSON.stringify(matches),
        folderName: folderName,
      },
      { method: "post" }
    );
  };

  return (
    <Page
      fullWidth
      backAction={{ content: "Matching results", onAction: () => navigate(-1) }}
      title="Matching results"
    >
      <BlockStack gap="400">
        {/* Header Summary Cards */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Matching details</Text>
                <BlockStack gap="100">
                  <Text variant="bodyMd">
                    <span style={{ color: '#666' }}>Folder:</span> <Button variant="plain" size="slim">{folderName || "products"}</Button>
                  </Text>
                  <Text variant="bodyMd">
                    <span style={{ color: '#666' }}>Matching type:</span> Match by {matchingType.toUpperCase()}
                  </Text>
                  <Text variant="bodyMd">
                    <span style={{ color: '#666' }}>Replace existing images:</span> {replacementOption === 'replace' ? 'YES' : 'NO'}
                  </Text>
                  <Text variant="bodyMd">
                    <span style={{ color: '#666' }}>Total images found inside the folder:</span> {matches.length + unmatched.length}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <Card>
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Matching results</Text>
                  <BlockStack gap="100">
                    <Text variant="bodyMd" fontWeight="bold">
                      <span style={{ color: '#008060' }}>Matched images: {matches.length}</span>
                    </Text>
                    <Text variant="bodyMd" fontWeight="bold">
                      <span style={{ color: '#BF0711' }}>Non matched images: {unmatched.length}</span> <Button variant="plain" size="slim">View details</Button>
                    </Text>
                  </BlockStack>
                </BlockStack>
                <InlineStack gap="200">
                  <Button onClick={() => navigate(-1)}>Match again</Button>
                  <Button 
                    variant="primary" 
                    onClick={handleStartUpload}
                    loading={isUploading}
                    disabled={matches.length === 0 || isUploading}
                  >
                    Start upload
                  </Button>
                </InlineStack>
              </InlineStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Non Matched Images Section */}
        {unmatched.length > 0 && (
          <Card padding="0">
            <BlockStack gap="0">
              <Box padding="400">
                <Text variant="headingMd" as="h2">Non matched images</Text>
              </Box>
              
              <Box padding="400" background="bg-surface-secondary">
                 <div style={{ 
                   backgroundColor: '#FFEBED', 
                   border: '1px solid #FFD5D8', 
                   borderRadius: '8px', 
                   padding: '16px',
                   color: '#BF0711'
                 }}>
                   <BlockStack gap="200">
                      <InlineStack gap="200">
                         <Icon source={AlertBubbleIcon} tone="critical" />
                         <Text variant="bodyMd" fontWeight="bold">
                           A total of {unmatched.length} images couldn't be matched.
                         </Text>
                      </InlineStack>
                      <Text variant="bodySm">
                         Since the expected {matchingType.toUpperCase()} is not in your product list, we could not match the following images. Please check the cases below:
                      </Text>
                      <ul style={{ margin: 0, paddingInlineStart: '20px', fontSize: '13px' }}>
                        <li>Image names and {matchingType.toUpperCase()}s of products can be different (Allowed formats:TITLE.jpg, TITLE.png, TITLE_1.jpeg, or TITLE_2.png)</li>
                        <li>The selected folder can be wrong.</li>
                        <li>The selected matching option can be wrong.</li>
                      </ul>
                      <div style={{ marginTop: '8px' }}>
                        <Button size="slim">Contact support</Button>
                      </div>
                   </BlockStack>
                 </div>
              </Box>

              <IndexTable
                resourceName={{ singular: 'unmatched image', plural: 'unmatched images' }}
                itemCount={unmatched.length}
                headings={[
                  { title: 'Image' },
                  { title: 'Image name' },
                  { title: 'Image size' },
                  { title: `Expected ${matchingType.toUpperCase()}` },
                  { title: 'Manual matching' },
                ]}
                selectable={false}
              >
                {unmatched.map((image, index) => (
                  <IndexTable.Row id={image.id} key={image.id} position={index}>
                    <IndexTable.Cell>
                      <Thumbnail source={image.thumbnailLink} alt={image.name} size="small" />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd">{image.name}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {image.size ? `${(image.size / 1024).toFixed(0)} KB` : "-"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" tone="subdued">
                        {image.name.split('.').slice(0, -1).join('.').toLowerCase()}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button size="slim">Match manually</Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </BlockStack>
          </Card>
        )}

        {/* Matched Images Section */}
        {matches.length > 0 && (
          <Card padding="0">
            <Box padding="400">
              <Text variant="headingMd" as="h2">Matched images ({matches.length})</Text>
            </Box>
            <IndexTable
              resourceName={resourceName}
              itemCount={matches.length}
              headings={[
                { title: "Image" },
                { title: "Matched File Name" },
                { title: "Size" },
                { title: "Matched Product" },
                { title: "Status" },
              ]}
              selectable={false}
            >
              {matches.map(({ image, product, variant }, index) => (
                <IndexTable.Row id={image.id} key={image.id} position={index}>
                  <IndexTable.Cell>
                    <Thumbnail source={image.thumbnailLink} alt={image.name} size="small" />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold">
                      {image.name}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {image.size ? (
                      <BlockStack gap="100">
                        <Text variant="bodySm">{(image.size / (1024 * 1024)).toFixed(2)} MB</Text>
                        {parseInt(image.size) > 20 * 1024 * 1024 && (
                          <Badge tone="warning">Too large</Badge>
                        )}
                      </BlockStack>
                    ) : "-"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="100">
                      <Text variant="bodyMd">{product.title}</Text>
                      {variant && (
                        <Text variant="bodySm" tone="subdued">
                          Variant: {variant.title} (SKU: {variant.sku})
                        </Text>
                      )}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone="success">Matched</Badge>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
