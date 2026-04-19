#!/usr/bin/env node
import "dotenv/config";
import prisma from "../app/db.server.js";
import { ApiVersion } from "@shopify/shopify-app-remix/server";

const apiVersion = ApiVersion.January25;

const PRODUCT_QUERY = /* GraphQL */ `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      handle
      title
      legacyResourceId
    }
  }
`;

const toProductGid = (productId) =>
  productId?.startsWith("gid://shopify/Product/")
    ? productId
    : `gid://shopify/Product/${productId}`;

async function getAccessTokenForShop(shop) {
  const session = await prisma.Session.findFirst({
    where: { shop },
    orderBy: { expires: "desc" },
  });

  if (!session?.accessToken) {
    console.warn(`[Backfill] No session access token found for ${shop}`);
    return null;
  }

  return session.accessToken;
}

async function fetchProduct(shop, productId, token) {
  const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: PRODUCT_QUERY,
      variables: { id: toProductGid(productId) },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `[Backfill] Shopify GraphQL error (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(
      `[Backfill] Shopify GraphQL responded with errors: ${JSON.stringify(payload.errors)}`,
    );
  }

  const product = payload?.data?.product;
  if (!product) {
    throw new Error(
      `[Backfill] No product data returned for ${shop} / ${productId}`,
    );
  }

  return {
    handle: product.handle,
    title: product.title,
    legacyId: String(product.legacyResourceId || productId),
  };
}

async function backfillHandles() {
  const overlays = await prisma.product_overlays.findMany({
    where: {
      OR: [{ product_handle: null }, { product_handle: "" }],
    },
    select: {
      shop_id: true,
      product_id: true,
    },
  });

  if (overlays.length === 0) {
    console.log("[Backfill] All overlays already have handles. Nothing to do.");
    return;
  }

  const tasks = new Map();
  overlays.forEach(({ shop_id, product_id }) => {
    if (!shop_id || !product_id) return;
    const key = `${shop_id}::${product_id}`;
    if (!tasks.has(key)) {
      tasks.set(key, { shop: shop_id, productId: product_id });
    }
  });

  console.log(
    `[Backfill] Found ${tasks.size} unique products without stored handles.`,
  );

  let successCount = 0;
  let failureCount = 0;

  for (const { shop, productId } of tasks.values()) {
    try {
      const token = await getAccessTokenForShop(shop);
      if (!token) {
        failureCount += 1;
        continue;
      }

      const product = await fetchProduct(shop, productId, token);
      if (!product.handle) {
        console.warn(
          `[Backfill] Product returned without handle for ${shop} / ${productId}`,
        );
        failureCount += 1;
        continue;
      }

      await prisma.product_overlays.updateMany({
        where: {
          shop_id: shop,
          product_id: productId,
        },
        data: {
          product_handle: product.handle,
          product_title: product.title || undefined,
        },
      });

      console.log(
        `[Backfill] Updated ${shop} / ${productId} with handle "${product.handle}".`,
      );
      successCount += 1;
    } catch (error) {
      console.error(
        `[Backfill] Failed to update ${shop} / ${productId}:`,
        error.message,
      );
      failureCount += 1;
    }
  }

  console.log(
    `[Backfill] Completed. Successes: ${successCount}, Failures: ${failureCount}`,
  );
}

backfillHandles()
  .catch((error) => {
    console.error("[Backfill] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
