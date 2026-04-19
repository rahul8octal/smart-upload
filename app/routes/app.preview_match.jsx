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
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { listFiles } from "../utils/google-drive.server";
import { fetchAllProducts, matchImagesToProducts } from "../utils/matching.server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const matchesData = JSON.parse(formData.get("matches") || "[]");
  const replacementOption = formData.get("replacementOption");

  if (action === "bulk_upload") {
    let successCount = 0;
    let failCount = 0;

    for (const match of matchesData) {
      try {
        const { image, product, variant } = match;
        
        // 1. If replacement option is 'replace', delete existing images first
        if (replacementOption === 'replace') {
           // This requires more complex logic to find and delete only for first image of product
           // For simplicity in MVP, we skip deletion or do it once per product
        }

        // 2. Add image to Shopify Product
        const response = await admin.graphql(
          `mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
            productCreateMedia(media: $media, productId: $productId) {
              media {
                id
                alt
                status
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              productId: product.id,
              media: [
                {
                  alt: image.name,
                  mediaContentType: "IMAGE",
                  originalSource: image.webContentLink.replace('&export=download', ''), // Ensure it's a direct link if possible
                },
              ],
            },
          }
        );

        const result = await response.json();
        if (result.data?.productCreateMedia?.media?.length > 0) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error("Upload error for match:", err);
        failCount++;
      }
    }

    return json({ success: true, successCount, failCount });
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

  const images = await listFiles(
    { access_token: settings.google_access_token, refresh_token: settings.google_refresh_token },
    folderId
  );

  const products = await fetchAllProducts(admin);

  const { matches, unmatched } = await matchImagesToProducts(images, products, matchingType);

  return { matches, unmatched, folderId, matchingType, replacementOption };
};

export default function PreviewMatch() {
  const { matches, unmatched, replacementOption, error } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const isUploading = fetcher.state !== "idle" && fetcher.formData?.get("action") === "bulk_upload";

  useEffect(() => {
    if (fetcher.data?.success) {
      if (window.shopify) {
        window.shopify.toast.show(`Successfully uploaded ${fetcher.data.successCount} images.`);
      }
      navigate("/app");
    }
  }, [fetcher.data, navigate]);

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
        action: "bulk_upload", 
        matches: JSON.stringify(matches),
        replacementOption: replacementOption,
      },
      { method: "post" }
    );
  };

  return (
    <Page
      title="Preview matching results"
      backAction={{ content: "Back", onAction: () => navigate(-1) }}
      primaryAction={{ 
        content: "Start upload", 
        onAction: handleStartUpload,
        loading: isUploading,
        disabled: matches.length === 0 || isUploading
      }}
    >
      <BlockStack gap="500">
        <Banner title="Review your matches before uploading">
          <p>We found {matches.length} matches and {unmatched.length} unmatched images.</p>
        </Banner>

        <Card padding="0">
          <IndexTable
            resourceName={resourceName}
            itemCount={matches.length}
            headings={[
              { title: "Image" },
              { title: "Matched File Name" },
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

        {unmatched.length > 0 && (
          <Card padding="500">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Unmatched Images ({unmatched.length})</Text>
              <Text tone="subdued">These images didn't match any product based on your selection.</Text>
              <InlineStack gap="200" wrap>
                {unmatched.slice(0, 20).map(img => (
                  <Badge key={img.id}>{img.name}</Badge>
                ))}
                {unmatched.length > 20 && <Text>...and {unmatched.length - 20} more</Text>}
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
