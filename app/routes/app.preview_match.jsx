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

    // Group matches by product to handle replacement once per product
    const productGroups = {};
    matchesData.forEach(match => {
      const pid = match.product.id;
      if (!productGroups[pid]) productGroups[pid] = { product: match.product, matches: [] };
      productGroups[pid].matches.push(match);
    });

    for (const pid in productGroups) {
      const { product, matches } = productGroups[pid];
      
      try {
        // 1. If replacement option is 'replace', delete all existing product images first
        if (replacementOption === 'replace') {
          // Fetch existing media IDs
          const mediaResponse = await admin.graphql(
            `query getProductMedia($id: ID!) {
              product(id: $id) {
                media(first: 50) {
                  nodes {
                    id
                  }
                }
              }
            }`,
            { variables: { id: pid } }
          );
          const mediaResult = await mediaResponse.json();
          const mediaIds = mediaResult.data?.product?.media?.nodes?.map(n => n.id) || [];
          
          if (mediaIds.length > 0) {
            await admin.graphql(
              `mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
                productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
                  deletedMediaIds
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              { variables: { mediaIds, productId: pid } }
            );
          }
        }

        // 2. Add new images to Shopify Product in one bulk operation
        // Sort matches by filename to ensure SKU_1, SKU_2 order
        const sortedMatches = matches.sort((a, b) => a.image.name.localeCompare(b.image.name, undefined, { numeric: true, sensitivity: 'base' }));
        
        const mediaInput = sortedMatches.map(match => ({
          alt: match.image.name,
          mediaContentType: "IMAGE",
          originalSource: match.image.webContentLink.replace('&export=download', ''),
        }));

        const response = await admin.graphql(
          `mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
            productCreateMedia(media: $media, productId: $productId) {
              media {
                id
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              productId: pid,
              media: mediaInput,
            },
          }
        );

        const result = await response.json();
        if (result.data?.productCreateMedia?.media?.length > 0) {
          successCount += result.data.productCreateMedia.media.length;
        }
        if (result.data?.productCreateMedia?.userErrors?.length > 0) {
          console.error("User errors adding media for", pid, result.data.productCreateMedia.userErrors);
          failCount += result.data.productCreateMedia.userErrors.length;
        }
      } catch (err) {
        console.error("Detailed upload error for product:", pid, err);
        failCount += matches.length;
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

  const products = await fetchAllProducts(admin, settings.metafield_key);

  const { matches, unmatched } = await matchImagesToProducts(
    images, 
    products, 
    matchingType, 
    { key: settings.metafield_key, type: settings.metafield_type }
  );

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
