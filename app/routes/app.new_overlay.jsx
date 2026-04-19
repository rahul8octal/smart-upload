import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Grid,
  LegacyCard,
  Page,
  RadioButton,
  Button,
  BlockStack,
  InlineStack,
  Icon,
  Text,
  InlineGrid,
  Card,
  TextField,
  Select,
  Autocomplete,
  Tag,
  Badge,
  Label,
  DropZone,
  InlineError, RangeSlider, Spinner, Layout, Link, Tooltip, Popover,
  Frame,
  Divider,
} from "@shopify/polaris";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DeleteIcon,
  XIcon,
  NoteIcon,
  UploadIcon,
  EditIcon,
  LanguageTranslateIcon,
  LanguageFilledIcon,
  ViewIcon,
  CheckIcon
} from "@shopify/polaris-icons";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { ColorPickerPopover } from "../component/ColorPickerPopover.jsx";
import { CommonModal } from "../component/CommonModal.jsx";
import { DEFAULT_IMAGE_CONFIG, DEFAULT_TEXT_CONFIG, thumbShopifyImage } from "../component/Utils.jsx";
import { useFetcher, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { uploadFile, deleteFile } from "../helper";
import { randomUUID } from "crypto";
import { useI18n } from "../i18n";
import { saveOverlayMetafield, deleteOverlayMetafield } from "../utils/metafields.server";

const overlayTargetsSupported = typeof prisma?.overlay_targets?.createMany === "function";
const localeLabelMap = {
  ar: "Arabic",
  ca: "Catalan",
  cs: "Czech",
  da: "Danish",
  de: "German",
  en: "English",
  es: "Spanish",
  fi: "Finnish",
  fr: "French",
  hi: "Hindi",
  hu: "Hungarian",
  is: "Icelandic",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  "nb-no": "Norwegian (Bokmål)",
  nb: "Norwegian (Bokmål)",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  "pt-br": "Portuguese (Brazil)",
  "pt-pt": "Portuguese (Portugal)",
  pt: "Portuguese",
  "ro-ro": "Romanian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  vi: "Vietnamese",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  zh: "Chinese",
};
const getLocaleLabel = (code, fallback = "") => {
  if (!code) return fallback || "Unknown";
  const lc = String(code).toLowerCase();
  return fallback || localeLabelMap[lc] || code.toUpperCase();
};
const getLocaleFlag = (code) => {
  const lc = String(code || "").toLowerCase();
  const map = {
    ar: "🇸🇦",
    ca: "🇪🇸",
    cs: "🇨🇿",
    da: "🇩🇰",
    de: "🇩🇪",
    en: "🇺🇸",
    es: "🇪🇸",
    fi: "🇫🇮",
    fr: "🇫🇷",
    hi: "🇮🇳",
    hu: "🇭🇺",
    is: "🇮🇸",
    it: "🇮🇹",
    ja: "🇯🇵",
    ko: "🇰🇷",
    "nb-no": "🇳🇴",
    nb: "🇳🇴",
    nl: "🇳🇱",
    no: "🇳🇴",
    pl: "🇵🇱",
    "pt-br": "🇧🇷",
    "pt-pt": "🇵🇹",
    pt: "🇵🇹",
    "ro-ro": "🇷🇴",
    sv: "🇸🇪",
    th: "🇹🇭",
    tr: "🇹🇷",
    vi: "🇻🇳",
    "zh-cn": "🇨🇳",
    "zh-tw": "🇹🇼",
    zh: "🇨🇳",
  };
  return map[lc] || "🌐";
};

const toSimpleProductId = (id) =>
  typeof id === "string" ? id.replace("gid://shopify/Product/", "") : id;
const toSimpleCollectionId = (id) =>
  typeof id === "string" ? id.replace("gid://shopify/Collection/", "") : id;
const toProductGid = (id) =>
  id && !String(id).startsWith("gid://shopify/Product/") ? `gid://shopify/Product/${id}` : id;
const toCollectionGid = (id) =>
  id && !String(id).startsWith("gid://shopify/Collection/") ? `gid://shopify/Collection/${id}` : id;

const GET_FIRST_PRODUCT_IMAGE_FROM_COLLECTION = `
  query FirstProductFromCollection($id: ID!) {
    collection(id: $id) {
      products(first: 1) {
        nodes {
          featuredMedia {
            preview {
              image {
                originalSrc
              }
            }
          }
        }
      }
    }
  }
`;

const GET_FIRST_ACTIVE_PRODUCT_IMAGE = `
  query FirstActiveProductImage($query: String) {
    products(first: 10, query: $query) {
      nodes {
        id
        title
        handle
        featuredMedia {
          preview {
            image {
              originalSrc
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCTS_BY_IDS = `
  query ProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredMedia {
          preview {
            image {
              originalSrc
            }
          }
        }
      }
    }
  }
`;

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const groupIdParam = url.searchParams.get("groupId");

  // Define parallel tasks
  const tasks = [
    // Task 0: Preview Products
    admin.graphql(GET_FIRST_ACTIVE_PRODUCT_IMAGE, { variables: { query: "status:active" } }).then(r => r.json()),
    // Task 1: Active Plan
    prisma.shop_plans.findFirst({ where: { shop: session?.shop, status: "Active" } }),
    // Task 2: Translation Languages (from Session)
    prisma.Session.findFirst({ where: { shop: session?.shop }, select: { locales: true } }),
    // Task 3: Base overlays list (first 50)
    prisma.product_overlays.findMany({ where: { shop_id: session?.shop }, orderBy: { id: "asc" }, take: 50 })
  ];

  // If editing a group, add the group fetch task
  if (groupIdParam) {
    const orConditions = [{ overlay_group_id: groupIdParam }];
    if (groupIdParam.startsWith("legacy-")) {
      const legacyId = parseInt(groupIdParam.replace("legacy-", ""), 10);
      if (!Number.isNaN(legacyId)) orConditions.push({ id: legacyId });
    }
    tasks.push(prisma.product_overlays.findMany({
      where: { shop_id: session?.shop, OR: orConditions },
      include: { overlay_targets: true },
      orderBy: { id: "asc" },
      take: 50
    }));
  }

  const results = await Promise.all(tasks);

  // Parse Task 0: Preview Products
  const previewData = results[0];
  const previewNodes = previewData?.data?.products?.nodes || [];
  const previewProducts = previewNodes.map(n => ({
    id: n?.id ? n.id.replace("gid://shopify/Product/", "") : "",
    title: n?.title || "",
    handle: n?.handle || "",
    image: n?.featuredMedia?.preview?.image?.originalSrc || "",
  }));
  const previewImage = previewProducts?.[0]?.image || "";

  // Parse Task 1: Active Plan
  const activePlan = results[1];

  // Parse Task 2: Translation Languages
  const sessionLocales = results[2];
  const localesList = Array.isArray(sessionLocales?.locales) ? sessionLocales.locales : [];
  const localeMap = new Map();

  // Always ensure English is present first
  localeMap.set("en", { code: "en", label: getLocaleLabel("en") });

  localesList.filter(loc => loc?.locale).forEach(loc => {
    const code = String(loc.locale).toLowerCase();
    if (!localeMap.has(code)) {
      localeMap.set(code, { code, label: getLocaleLabel(code) });
    }
  });
  const translationLanguages = Array.from(localeMap.values());

  // Parse Task 3: Base Overlays
  const productOverlays = results[3];

  // Parse Task 4: Edit Group (if exists)
  let editOverlays = [];
  let editPreviewProducts = [];

  if (groupIdParam && results[4]) {
    editOverlays = results[4];
    const productTargetIds = [];
    editOverlays.forEach(ov => {
      (ov.overlay_targets || []).forEach(t => {
        if (t.scope === "PRODUCT" && t.target_id) productTargetIds.push(t.target_id);
      });
    });

    if (productTargetIds.length > 0) {
      const gidList = Array.from(new Set(productTargetIds.map(id => toProductGid(id))));
      try {
        const prodResp = await admin.graphql(GET_PRODUCTS_BY_IDS, { variables: { ids: gidList } });
        const prodData = await prodResp.json();
        editPreviewProducts = prodData?.data?.nodes?.filter(n => n && n.id)?.map(n => ({
          id: toSimpleProductId(n.id),
          title: n.title || "",
          handle: n.handle || "",
          image: n.featuredMedia?.preview?.image?.originalSrc || "",
        })) || [];
      } catch (err) {
        console.error("Failed to fetch edit preview products", err);
      }
    }
  }

  return json({
    productOverlays,
    previewImage,
    previewProducts,
    editPreviewProducts,
    editOverlays,
    editGroupId: groupIdParam || null,
    activePlan,
    shopDomain: session?.shop || null,
    translationLanguages,
  });
}


export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "get_collection_image") {
    const collectionId = formData.get("collectionId");
    if (!collectionId) {
      return json({ image: "" });
    }

    const response = await admin.graphql(
      GET_FIRST_PRODUCT_IMAGE_FROM_COLLECTION,
      { variables: { id: collectionId } },
    );
    const data = await response.json();

    const image =
      data?.data?.collection?.products?.nodes?.[0]?.featuredMedia?.preview?.image
        ?.originalSrc || "";

    return json({ image });
  }

  if (actionType === "get_first_product_image") {
    const response = await admin.graphql(
      GET_FIRST_ACTIVE_PRODUCT_IMAGE,
      { variables: { query: "status:active" } },
    );
    const data = await response.json();
    const image =
      data?.data?.products?.nodes?.[0]?.featuredMedia?.preview?.image
        ?.originalSrc || "";
    const products = (data?.data?.products?.nodes || []).map((n) => ({
      id: n?.id ? n.id.replace("gid://shopify/Product/", "") : "",
      title: n?.title || "",
      handle: n?.handle || "",
      image: n?.featuredMedia?.preview?.image?.originalSrc || "",
    }));

    return json({ image, products });
  }

  if (actionType === "save_overlay") {
    try {
      let overlayGroupId = formData.get("overlay_group_id");
      if (!overlayGroupId) {
        try {
          overlayGroupId = randomUUID();
        } catch {
          overlayGroupId = `${Date.now()}`;
        }
      }

      const activePlan = await prisma.shop_plans.findFirst({
        where: { shop: session.shop, status: "Active" }
      });

      if (activePlan && activePlan.access_products !== "UNLIMITED") {
        const allowedCount = parseInt(activePlan.access_products, 10);
        const selection = formData.get("selection") || "all";

        if (selection === "all") {
          return json(
            { success: false, error: "The 'All Products' scope is only available on the Unlimited plan." },
            { status: 403 }
          );
        }

        // Get current unique products from ALL active overlays, including those in targets
        const currentOverlays = await prisma.product_overlays.findMany({
          where: { shop_id: session.shop, status: "Active" },
          select: {
            product_id: true,
            overlay_group_id: true,
            overlay_targets: {
              where: { scope: "PRODUCT" },
              select: { target_id: true }
            }
          }
        });

        // Current edited group ID/legacy ID
        let currentGroupId = overlayGroupId;
        // If it's a legacy overlay (no group ID yet) and we are editing it, we might need to match by ID?
        // But for safe limits, we filter by group ID if present.

        const currentProductIds = new Set();

        for (const ov of currentOverlays) {
          // Skip if it belongs to the group we are currently editing/saving
          if (currentGroupId && ov.overlay_group_id === currentGroupId) continue;

          if (ov.product_id && ov.product_id !== "ALL_PRODUCTS") {
            currentProductIds.add(ov.product_id);
          }
          if (ov.overlay_targets) {
            ov.overlay_targets.forEach(t => {
              if (t.target_id) currentProductIds.add(t.target_id);
            });
          }
        }

        // Determine products being added/updated
        const newProducts = formData.get("products")
          ? JSON.parse(formData.get("products")).map((p) => toSimpleProductId(p.id))
          : [];

        // Check cumulative limit
        for (const prodId of newProducts) {
          if (!currentProductIds.has(prodId)) {
            currentProductIds.add(prodId);
          }
          if (currentProductIds.size > allowedCount) {
            return json(
              { success: false, error: `Product limit reached (${allowedCount}). Upgrade to Plus Plan to add more products.` },
              { status: 403 }
            );
          }
        }
      }

      const legacyId =
        overlayGroupId && overlayGroupId.startsWith("legacy-")
          ? parseInt(overlayGroupId.replace("legacy-", ""), 10)
          : null;

      const existingOverlays = overlayGroupId
        ? await prisma.product_overlays.findMany({
          where: {
            shop_id: session?.shop || "",
            OR: [
              { overlay_group_id: overlayGroupId },
              ...(legacyId ? [{ overlay_group_id: null, id: legacyId }] : []),
            ],
          },
          select: { id: true },
        })
        : [];

      const selection = formData.get("selection") || "all";
      const groupName = (formData.get("group_name") || "").toString().trim();
      const products = formData.get("products")
        ? JSON.parse(formData.get("products")).map((p) => ({
          ...p,
          id: toSimpleProductId(p.id),
        }))
        : [];
      const collections = formData.get("collections")
        ? JSON.parse(formData.get("collections")).map((c) => ({
          ...c,
          id: toSimpleCollectionId(c.id),
        }))
        : [];

      const offerEntries = [];
      for (const [key, value] of formData.entries()) {
        if (key.startsWith("offer_json_")) {
          try {
            const offerId = key.replace("offer_json_", "");
            offerEntries.push({
              id: offerId,
              offer: JSON.parse(value),
            });
          } catch (err) {
            console.error("Invalid offer payload", err);
            return json(
              { success: false, error: "Invalid overlay payload" },
              { status: 400 },
            );
          }
        }
      }

      if (selection === "products" && products.length === 0) {
        return json(
          { success: false, error: "Please select at least one product." },
          { status: 400 },
        );
      }

      if (selection === "collections" && collections.length === 0) {
        return json(
          { success: false, error: "Please select at least one collection." },
          { status: 400 },
        );
      }

      if (offerEntries.length === 0) {
        return json(
          { success: false, error: "Please add at least one overlay." },
          { status: 400 },
        );
      }

      const createdOverlays = [];

      for (const entry of offerEntries) {
        const offer = entry.offer;
        const overlayData = offer?.overlayData || {};
        const type = overlayData?.type === "IMAGE" ? "IMAGE" : "TEXT";
        const trimmedText = String(overlayData?.text || "").trim();

        if (type === "TEXT" && !trimmedText) {
          return json(
            { success: false, error: "Please enter text for the text overlay." },
            { status: 400 },
          );
        }

        const fileKey = `offer_image_${entry.id}`;
        const imageFile = formData.get(fileKey);

        let imageUrl = overlayData?.image_url || null;
        let deleteOldImage = false;
        if (type === "IMAGE") {
          if (imageFile && imageFile instanceof File) {
            const buffer = Buffer.from(await imageFile.arrayBuffer());
            const fileName = `${overlayData?.id || "overlay"}-${Date.now()}.jpg`;
            const fileObj = {
              fileName,
              filePath: buffer,
              fileType: imageFile.type,
              bucket: process.env.AWS_S3_BUCKET,
              key: `public-app/${session?.shop || "shop"}/${fileName}`,
            };
            const uploaded = await uploadFile(fileObj);
            if (!uploaded) {
              return json(
                { success: false, error: "Image upload failed." },
                { status: 500 },
              );
            }
            deleteOldImage = !!overlayData?.image_url;
            imageUrl = uploaded;
          } else if (!imageUrl) {
            return json(
              { success: false, error: "Please add an image for the image overlay." },
              { status: 400 },
            );
          }
        }

        const primaryTarget =
          selection === "products"
            ? products?.[0]
            : selection === "collections"
              ? collections?.[0]
              : null;

        const primaryTargetId = primaryTarget?.id || "ALL_PRODUCTS";

        const groupIdForOverlay = overlayData?.overlay_group_id || overlayGroupId;
        overlayGroupId = groupIdForOverlay || overlayGroupId;

        const overlayPayload = {
          shop_id: session?.shop || "",
          product_id: primaryTargetId,
          overlay_group_id: groupIdForOverlay || null,
          group_name: groupName || null,
          product_title:
            selection === "products" ? primaryTarget?.title || null : null,
          product_handle:
            selection === "products" ? primaryTarget?.handle || null : null,
          type,
          image_url: imageUrl,
          text: trimmedText,
          font_family: overlayData?.font_family || "",
          font_size: overlayData?.font_size?.toString() || "",
          font_color: overlayData?.font_color || "",
          font_weight: overlayData?.font_weight || "",
          font_style: overlayData?.font_style || "",
          bg_color: overlayData?.bg_color || "",
          opacity: overlayData?.opacity?.toString() || "",
          rotation: overlayData?.rotation?.toString() || "",
          padding_top: overlayData?.padding_top?.toString() || "",
          padding_right: overlayData?.padding_right?.toString() || "",
          padding_bottom: overlayData?.padding_bottom?.toString() || "",
          padding_left: overlayData?.padding_left?.toString() || "",
          border_radius: overlayData?.border_radius?.toString() || "",
          text_align: overlayData?.text_align || null,
          position: overlayData?.position || null,
          display_in: overlayData?.display_in || [],
          scale_in_collection: overlayData?.scale_in_collection?.toString() || "",
          scale_in_product: overlayData?.scale_in_product?.toString() || "",
          scale_in_search: overlayData?.scale_in_search?.toString() || "",
          status: overlayData?.status || "Active",
          translations: overlayData?.translations || {},
        };

        const targets = [];
        if (selection === "all") {
          targets.push({ scope: "ALL_PRODUCTS" });
        } else if (selection === "products") {
          products.forEach((p) => {
            if (p?.id) {
              targets.push({
                scope: "PRODUCT",
                target_id: toSimpleProductId(p.id),
                target_handle: p.handle || null,
              });
            }
          });
        } else if (selection === "collections") {
          collections.forEach((c) => {
            if (c?.id) {
              targets.push({
                scope: "COLLECTION",
                target_id: toSimpleCollectionId(c.id),
                target_handle: c.handle || null,
              });
            }
          });
        }

        const savedOverlay = await prisma.$transaction(async (tx) => {
          let record = null;
          if (overlayData?.id) {
            const existing = await tx.product_overlays.findUnique({
              where: { id: overlayData.id },
            });
            record = await tx.product_overlays.update({
              where: { id: overlayData.id },
              data: overlayPayload,
            });
            if (overlayTargetsSupported) {
              await tx.overlay_targets.deleteMany({
                where: { overlay_id: record.id },
              });
            }
            if (deleteOldImage && existing?.image_url) {
              try {
                await deleteFile(existing.image_url);
              } catch (err) {
                console.warn("Failed to delete old image", err);
              }
            }
          } else {
            record = await tx.product_overlays.create({
              data: overlayPayload,
            });
          }

          if (overlayTargetsSupported && targets.length > 0) {
            await tx.overlay_targets.createMany({
              data: targets.map((t) => ({
                ...t,
                overlay_id: record.id,
              })),
            });
          }

          return record;
        });

        createdOverlays.push(savedOverlay);
      }

      if (overlayGroupId && existingOverlays.length > 0) {
        const keepIds = new Set(createdOverlays.map((o) => o.id));
        const deleteIds = existingOverlays
          .map((o) => o.id)
          .filter((id) => !keepIds.has(id));
        if (deleteIds.length > 0) {
          await prisma.product_overlays.deleteMany({
            where: {
              shop_id: session?.shop || "",
              id: { in: deleteIds },
            },
          });
        }
      }

      // Save metafields for affected products
      try {
        const productIdsToUpdate = new Set();
        
        // Collect product IDs from targets
        if (selection === "all") {
          // Save a global configuration for "All Products"
          productIdsToUpdate.add("ALL_PRODUCTS");
        } else if (selection === "products") {
          products.forEach((p) => {
            if (p?.id) {
              productIdsToUpdate.add(toSimpleProductId(p.id));
            }
          });
        } else if (selection === "collections") {
          // For collections, we need to get all products in those collections
          // This is complex, so we'll handle it per-product when accessed
          // For now, skip bulk update
        }

        // Update metafields for each product
        for (const productId of productIdsToUpdate) {
          try {
            // Fetch all active overlays for this product
            const targets = await prisma.overlay_targets.findMany({
              where: {
                OR: [
                  { scope: "ALL_PRODUCTS" },
                  { scope: "PRODUCT", target_id: productId },
                ],
                product_overlays: {
                  shop_id: session.shop,
                  status: { in: ["active", "Active"] },
                },
              },
              include: {
                product_overlays: true,
              },
            });

            const globalOverlays = [];
            const productOverlays = [];

            targets.forEach((item) => {
              if (item.scope === "ALL_PRODUCTS") {
                globalOverlays.push(item.product_overlays);
              } else if (item.scope === "PRODUCT" && item.target_id === productId) {
                productOverlays.push({
                  ...item.product_overlays,
                  target_handle: item.target_handle
                });
              }
            });

            // Should get handle from the target matching the product
            const targetWithHandle = targets.find(t => t.scope === 'PRODUCT' && t.target_id === productId);
            const productHandle = targetWithHandle ? targetWithHandle.target_handle : null;

            const allOverlays = [...globalOverlays, ...productOverlays];

            // Format overlay data like API response
            const overlayConfig = {
              product_id: productId,
              handle: productHandle,
              overlays: allOverlays
                .filter((ov) => ov && ov.status === "Active")
                .map((overlay) => ({
                  overlay_id: overlay.id,
                  type: overlay.type,
                  image_url: overlay.image_url,
                  text: overlay.text,
                  translations: overlay.translations || {},
                  font_family: overlay.font_family,
                  font_size: overlay.font_size,
                  font_weight: overlay.font_weight,
                  font_style: overlay.font_style,
                  font_color: overlay.font_color,
                  bg_color: overlay.bg_color,
                  opacity: overlay.opacity,
                  rotation: overlay.rotation,
                  text_align: overlay.text_align,
                  padding_top: overlay.padding_top,
                  padding_right: overlay.padding_right,
                  padding_bottom: overlay.padding_bottom,
                  padding_left: overlay.padding_left,
                  position: overlay.position,
                  scale_in_collection: overlay.scale_in_collection,
                  scale_in_product: overlay.scale_in_product,
                  scale_in_search: overlay.scale_in_search,
                  border_radius: overlay.border_radius,
                  display_in: overlay.display_in || [],
                })),
            };

            // Save metafield if there are overlays, otherwise delete
            // Use product ID directly (not GID) for app metafields
            if (overlayConfig.overlays.length > 0) {
              await saveOverlayMetafield(admin, productId, overlayConfig);
            } else {
              await deleteOverlayMetafield(admin, productId);
            }
          } catch (metafieldError) {
            console.error(`[Metafields] Error updating metafield for product ${productId}:`, metafieldError);
            // Continue with other products even if one fails
          }
        }
      } catch (metafieldError) {
        console.error("[Metafields] Error in metafield update process:", metafieldError);
        // Don't fail the entire save if metafield update fails
      }

      return json({
        success: true,
        type: "save_overlay",
        overlays: createdOverlays,
        overlay_group_id: overlayGroupId || null,
      });
    } catch (error) {
      console.error("Save overlay error", error);
      return json(
        { success: false, error: "Failed to save overlays." },
        { status: 500 },
      );
    }
  }

  if (actionType === "update_status") {
    try {
      const overlayId = Number(formData.get("overlay_id"));
      const status = formData.get("status");

      const activePlan = await prisma.shop_plans.findFirst({
        where: { shop: session.shop, status: "Active" }
      });

      if (status === "Active" && activePlan && activePlan.access_products !== "UNLIMITED") {
        const allowedCount = parseInt(activePlan.access_products, 10);

        // Fetch target overlay to see its scope/product
        const targetOverlay = await prisma.product_overlays.findUnique({
          where: { id: overlayId },
          select: { product_id: true, overlay_targets: true, overlay_group_id: true }
        });

        if (targetOverlay) {
          // Check if it is All Products
          const isAllProducts = targetOverlay.product_id === "ALL_PRODUCTS" || targetOverlay.overlay_targets?.some(t => t.scope === "ALL_PRODUCTS");
          if (isAllProducts) {
            return json({ success: false, error: "Cannot activate 'All Products' overlay on the Free plan." }, { status: 403 });
          }

          // Collect IDs from THIS overlay
          const targetProductIds = new Set();
          if (targetOverlay.product_id && targetOverlay.product_id !== "ALL_PRODUCTS") {
            targetProductIds.add(targetOverlay.product_id);
          }
          targetOverlay.overlay_targets?.forEach(t => {
            if (t.scope === "PRODUCT" && t.target_id) targetProductIds.add(t.target_id);
          });


          // Check limit against OTHER active overlays
          const currentOverlays = await prisma.product_overlays.findMany({
            where: { shop_id: session.shop, status: "Active" },
            select: {
              product_id: true,
              overlay_group_id: true,
              overlay_targets: { where: { scope: "PRODUCT" }, select: { target_id: true } }
            }
          });

          const activeGlobalIds = new Set();
          for (const ov of currentOverlays) {
            // Skip the one we are activating (if it was already active/partially active? unlikely but safe)
            // Actually we are activating it, so it MIGHT be "Inactive" now.
            // If it's already "Active" (redundant request?), we exclude it to avoid double count.
            if (ov.overlay_group_id === targetOverlay.overlay_group_id) continue;

            if (ov.product_id && ov.product_id !== "ALL_PRODUCTS") activeGlobalIds.add(ov.product_id);
            ov.overlay_targets?.forEach(t => {
              if (t.target_id) activeGlobalIds.add(t.target_id);
            });
          }

          // Merge
          for (const id of targetProductIds) {
            activeGlobalIds.add(id);
          }

          if (activeGlobalIds.size > allowedCount) {
            return json(
              { success: false, error: `Product limit reached (${allowedCount}). Cannot activate overlay.` },
              { status: 403 }
            );
          }
        }
      }
      if (!overlayId || !status) {
        return json({ success: false, error: "Invalid status update payload." }, { status: 400 });
      }
      const existing = await prisma.product_overlays.findFirst({
        where: { id: overlayId, shop_id: session?.shop || "" },
      });
      if (!existing) {
        return json({ success: false, error: "Overlay not found." }, { status: 404 });
      }
      const updated = await prisma.product_overlays.update({
        where: { id: overlayId },
        data: { status },
      });
      return json({ success: true, type: "update_status", overlay: updated });
    } catch (error) {
      console.error("Update status error", error);
      return json({ success: false, error: "Failed to update status." }, { status: 500 });
    }
  }

  return json({ image: "" });
}

export default function OverlayPage() {
  const fetcher = useFetcher();
  const initialData = useLoaderData();
  const { t } = useI18n();
  const [selected, setSelected] = useState("all");
  const [offers, setOffers] = useState([]);
  const [textOverlay, setTextOverlay] = useState(DEFAULT_TEXT_CONFIG);
  const [imageOverlay, setImageOverlay] = useState(DEFAULT_IMAGE_CONFIG);
  const [productItems, setProductItems] = useState([]);
  const [tabSelected, setTabSelected] = useState(1);
  const [offerErrors, setOfferErrors] = useState({});

  const normalizeOverlay = (overlay) => ({
    ...overlay,
    overlay_group_id: overlay?.overlay_group_id || null,
    group_name: overlay?.group_name || "",
    status: overlay?.status || "Active",
    translations: (() => {
      if (!overlay?.translations) return {};
      if (typeof overlay.translations === "string") {
        try { return JSON.parse(overlay.translations); } catch { return {}; }
      }
      if (typeof overlay.translations === "object") return overlay.translations;
      return {};
    })(),
    display_in: Array.isArray(overlay?.display_in)
      ? overlay.display_in
      : (typeof overlay?.display_in === "string"
        ? (() => {
          try {
            return JSON.parse(overlay.display_in);
          } catch {
            return [];
          }
        })()
        : []),
  });

  const [collectionItems, setCollectionItems] = useState([]);
  const [showImageError, setShowImageError] = useState("");
  const [activePopover, setActivePopover] = useState(null);

  const placeholderImage = "/Image/default_product.jpg";
  const [prodImage, setProdImage] = useState(initialData?.previewImage || placeholderImage);
  const [hasFetchedAllProductImage, setHasFetchedAllProductImage] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeOfferId, setActiveOfferId] = useState(null);
  const [overlayList, setOverlayList] = useState(
    (initialData?.productOverlays || []).map(normalizeOverlay),
  );
  const [overlayGroupId, setOverlayGroupId] = useState(initialData?.editGroupId || "");
  const [groupName, setGroupName] = useState(initialData?.editOverlays?.[0]?.group_name || "");
  const [loader, setLoader] = useState("");
  const [updateStatusModal, setUpdateStatusModal] = useState({ open: false, id: null, status: "", type: "" });
  const [deleteConfirmation, setDeleteConfirmation] = useState({ open: false, id: null });
  const [showProductsError, setShowProductsError] = useState(false);

  const [previewProducts, setPreviewProducts] = useState(initialData?.previewProducts || []);
  const [selectedPreviewId, setSelectedPreviewId] = useState(
    initialData?.previewProducts?.[0]?.id || "",
  );
  const [productSearch, setProductSearch] = useState("");
  const [lastProductSelection, setLastProductSelection] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const baselineRef = useRef(null);
  const baselineTriggerRef = useRef(0);
  const [baselineTrigger, setBaselineTrigger] = useState(() => Date.now());
  const appBridge = useAppBridge();
  const [translationPopoverActive, setTranslationPopoverActive] = useState(false);
  const [editingLocale, setEditingLocale] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [selectedPreviewLocale, setSelectedPreviewLocale] = useState(() => {
    const langs = (initialData?.translationLanguages && initialData.translationLanguages.length > 0)
      ? initialData.translationLanguages
      : [{ code: "en", label: getLocaleLabel("en") }];
    return langs?.[0]?.code || "en";
  });
  const [showPublishCard, setShowPublishCard] = useState(false);
  const translationLanguages =
    (initialData?.translationLanguages && initialData.translationLanguages.length > 0)
      ? initialData.translationLanguages
      : [{ code: "en", label: getLocaleLabel("en") }];
  const defaultTranslationLocale = useMemo(() => {
    if (!translationLanguages || translationLanguages.length === 0) return null;
    const en = translationLanguages.find((l) => (l.code || "").toLowerCase() === "en");
    return (en?.code || translationLanguages[0]?.code || null);
  }, [translationLanguages]);

  const previewLocaleOptions = translationLanguages.map((lang) => ({
    label: getLocaleLabel(lang.code, lang.label),
    value: lang.code,
    prefix: <Icon source={LanguageFilledIcon} />
  }));

  const hasMissingTranslations = useMemo(() => {
    if (!translationLanguages?.length) return false;
    return translationLanguages.some((lang) => {
      const val = textOverlay?.translations?.[lang.code];
      return !val || String(val).trim() === "";
    });
  }, [translationLanguages, textOverlay?.translations]);
  const saveBarId = "new-overlay-save-bar";


  const navigate = useNavigate();
  const navigation = useNavigation();
  const isNavigatingBack =
    navigation.state === "loading" && navigation.location?.pathname === "/app";

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (initialData?.editOverlays && initialData.editOverlays.length > 0) {
      const overlays = initialData.editOverlays.map(normalizeOverlay);
      const first = overlays[0];
      const targets = first?.overlay_targets || [];

      let derivedSelection = "all";
      if (targets.some((t) => t.scope === "ALL_PRODUCTS")) {
        derivedSelection = "all";
      } else if (targets.some((t) => t.scope === "COLLECTION")) {
        derivedSelection = "collections";
      } else if (targets.some((t) => t.scope === "PRODUCT")) {
        derivedSelection = "products";
      } else if (first?.product_id && first.product_id !== "ALL_PRODUCTS") {
        derivedSelection = "products";
      }

      const productSelection = targets
        .filter((t) => t.scope === "PRODUCT" && t.target_id)
        .map((t) => {
          const match =
            initialData?.editPreviewProducts?.find(
              (p) =>
                p.id === t.target_id ||
                p.id === String(t.target_id).replace("gid://shopify/Product/", ""),
            ) || {};
          return {
            id: t.target_id,
            handle: t.target_handle || match.handle || first?.product_handle || null,
            title: match.title || first?.product_title || null,
            image: match.image || "",
          };
        });

      if (productSelection.length === 0 && derivedSelection === "products" && first?.product_id) {
        productSelection.push({
          id: first.product_id,
          handle: first?.product_handle || null,
          title: first?.product_title || null,
        });
      }

      const collectionSelection = targets
        .filter((t) => t.scope === "COLLECTION" && t.target_id)
        .map((t) => ({
          id: t.target_id,
          handle: t.target_handle || null,
        }));

      setSelected(derivedSelection);
      if (productSelection.length) {
        setProductItems(productSelection);
        setLastProductSelection(productSelection);
      }
      if (collectionSelection.length) setCollectionItems(collectionSelection);
      setOverlayGroupId(first?.overlay_group_id || initialData.editGroupId || overlayGroupId || "");
      setGroupName(first?.group_name || "");
      if (derivedSelection === "products" && productSelection.length > 0) {
        const previewList =
          initialData?.editPreviewProducts?.length ? initialData.editPreviewProducts : productSelection;
        setPreviewProducts(previewList);
        setSelectedPreviewId(productSelection[0].id);
        setProdImage(productSelection[0].image || placeholderImage);
      }

      const offersData = overlays.map((ov, idx) => {
        const overlayData = {
          ...(ov.type === "IMAGE" ? { ...DEFAULT_IMAGE_CONFIG } : { ...DEFAULT_TEXT_CONFIG }),
          ...ov,
          type: ov.type,
        };
        return {
          id: ov.id,
          type: ov.type === "IMAGE" ? "image" : "text",
          open: idx === 0,
          overlayData,
        };
      });

      setOffers(offersData);
      const firstOffer = offersData[0];
      setActiveOfferId(firstOffer?.id || null);
      if (firstOffer) {
        if (firstOffer.type === "text") {
          setTextOverlay(firstOffer.overlayData);
          setTabSelected(1);
        } else {
          setImageOverlay(firstOffer.overlayData);
          setTabSelected(2);
        }
      }
    }
    // reset baseline on initial load/edit data
    setBaselineTrigger(Date.now());
  }, [initialData]);

  const getShopify = () => {
    if (typeof window === "undefined") return null;
    return window.shopify || null;
  };

  const getLocalImageSrc = (imageValue) => {
    if (!imageValue) return "";
    if (imageValue instanceof File) {
      if (typeof window === "undefined") return "";
      return window.URL.createObjectURL(imageValue);
    }
    return imageValue;
  };



  const openPicker = async () => {
    try {
      let pickerType =
        selected === "products"
          ? "product"
          : selected === "collections"
            ? "collection"
            : null;

      if (!pickerType) return;

      const currentSelection =
        pickerType === "product" ? productItems : collectionItems;

      const result = await shopify.resourcePicker({
        type: pickerType,
        multiple: true,
        selectionIds:
          pickerType === "product"
            ? currentSelection.map((p) => ({ id: toProductGid(p.id) }))
            : currentSelection.map((c) => ({ id: toCollectionGid(c.id) })),
      });

      const ids = result.map((item) => ({
        id: pickerType === "product" ? toSimpleProductId(item.id) : toSimpleCollectionId(item.id),
        handle: item.handle || null,
        title: item.title || null,
        image: item?.images?.[0]?.originalSrc || item?.featuredImage?.originalSrc || "",
      }));

      if (pickerType === "product") {
        setProductItems(ids);
        setLastProductSelection(ids);
        if (ids.length > 0) {
          setSelectedPreviewId(ids[0].id);
          setProdImage(ids[0].image || placeholderImage);
        }
      } else {
        setCollectionItems(ids);
        if (ids.length > 0) {
          const formData = new FormData();
          formData.append("actionType", "get_collection_image");
          formData.append("collectionId", ids[0].id);
          fetcher.submit(formData, {
            method: "post",
            encType: "multipart/form-data",
          });
        }
      }
      console.log(result, "result");
      setProdImage(result?.[0]?.images?.[0]?.originalSrc)
    } catch (error) {
      console.error("Picker closed or error:", error);
    }
  };

  const handleSelectAllProducts = () => {
    setLastProductSelection(productItems);
    setSelected("all");
    setProductItems([]);
    setCollectionItems([]);
    setProdImage(initialData?.previewImage || placeholderImage);
    setSelectedPreviewId(previewProducts?.[0]?.id || "");
    setHasFetchedAllProductImage(false);
  };
  const handleSelectProducts = () => {
    setSelected("products");
    if (productItems.length === 0 && lastProductSelection.length > 0) {
      setProductItems(lastProductSelection);
      const first = lastProductSelection[0];
      if (first) {
        setSelectedPreviewId(first.id);
        setProdImage(first.image || placeholderImage);
      }
    }
  };
  const handleRemoveProduct = (productId) => {
    setProductItems((prev) => {
      const updated = prev.filter((p) => p.id !== productId);
      setLastProductSelection(updated);
      if (selectedPreviewId === productId) {
        if (updated.length > 0) {
          setSelectedPreviewId(updated[0].id);
          setProdImage(updated[0].image || placeholderImage);
        } else {
          setSelectedPreviewId("");
          setProdImage(initialData?.previewImage || placeholderImage);
        }
      }
      return updated;
    });
  };
  const adminProductUrl = useMemo(() => {
    if (!initialData?.shopDomain) return null;
    return (id) => `https://${initialData.shopDomain}/admin/products/${id}`;
  }, [initialData?.shopDomain]);
  const shopDomain = initialData?.shopDomain || "";
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return productItems;
    return productItems.filter((p) => {
      return (
        String(p.id || "").toLowerCase().includes(term) ||
        String(p.title || "").toLowerCase().includes(term) ||
        String(p.handle || "").toLowerCase().includes(term)
      );
    });
  }, [productItems, productSearch]);
  const buildSnapshot = useCallback(() => {
    const safeOffers = (offers || []).map((o) => ({
      id: o.id,
      type: o.type,
      overlayData: {
        ...(o.overlayData || {}),
        image_url:
          (typeof File !== "undefined" && o.overlayData?.image_url instanceof File)
            ? (o.overlayData.image_url.name || "file")
            : o.overlayData?.image_url || "",
        translations: o.overlayData?.translations || {},
      },
    }));
    const payload = {
      selected,
      productItems,
      collectionItems,
      offers: safeOffers,
      groupName,
      overlayGroupId,
    };
    return JSON.stringify(payload);
  }, [selected, productItems, collectionItems, offers, groupName, overlayGroupId]);
  const resolvePreviewTarget = useCallback(() => {
    const source =
      selected === "products"
        ? productItems && productItems.length > 0
          ? productItems
          : []
        : previewProducts || [];
    if (selectedPreviewId) {
      const match = source.find((p) => p.id === selectedPreviewId);
      if (match) return match;
    }
    return source[0] || null;
  }, [selected, productItems, selectedPreviewId, previewProducts]);

  const buildPreviewUrl = useCallback(() => {
    if (!shopDomain) return null;
    const target = resolvePreviewTarget();
    if (!target) return null;
    const handle =
      target.handle ||
      target.product_handle ||
      target.target_handle ||
      null;
    if (!handle) return null;
    return `https://${shopDomain}/products/${handle}`;
  }, [resolvePreviewTarget, shopDomain]);

  const buildProductPreviewUrl = useCallback((product) => {
    if (!shopDomain || !product) return null;
    const handle = product.handle || product.product_handle || product.target_handle || null;
    if (!handle) return null;
    return `https://${shopDomain}/products/${handle}`;
  }, [shopDomain]);

  const previewUrl = useMemo(() => buildPreviewUrl(), [buildPreviewUrl]);
  const previewDisabled = !overlayGroupId || !previewUrl;
  const previewTooltip = !overlayGroupId
    ? t("builder.preview.tooltip.saveFirst", "Save overlay to preview")
    : !previewUrl
      ? t("builder.preview.tooltip.selectProduct", "Select a product to preview")
      : t("builder.preview.tooltip.open", "Preview overlay on storefront");

  const handlePreviewClick = () => {
    const shopify = getShopify();
    if (!previewUrl) {
      shopify?.toast?.show(previewTooltip, { isError: true });
      return;
    }
    window.open(previewUrl, "_blank", "noopener");
  };
  const handleProductPreviewClick = (product) => {
    const shopify = getShopify();
    const url = buildProductPreviewUrl(product);
    if (!overlayGroupId) {
      shopify?.toast?.show(t("builder.preview.tooltip.saveFirst", "Save overlay to preview"), { isError: true });
      return;
    }
    if (!url) {
      shopify?.toast?.show(t("builder.preview.tooltip.noHandle", "No product handle available to preview"), { isError: true });
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  useEffect(() => {
    if (!isHydrated) return;
    const snap = buildSnapshot();
    if (baselineRef.current === null || baselineTrigger !== baselineTriggerRef.current) {
      baselineRef.current = snap;
      baselineTriggerRef.current = baselineTrigger;
      setIsDirty(false);
      return;
    }
    setIsDirty(baselineRef.current !== snap);
  }, [isHydrated, buildSnapshot, baselineTrigger]);

  const hasValidOverlay = useMemo(() => {
    return (offers || []).some(o => {
      if (o.type === "text" || o.type === "TEXT") {
        return String(o.overlayData?.text || "").trim().length > 0;
      }
      if (o.type === "image" || o.type === "IMAGE") {
        return !!o.overlayData?.image_url;
      }
      return false;
    });
  }, [offers]);

  useEffect(() => {
    if (!appBridge) return;
    const id = saveBarId;
    if (isDirty) {
      try { appBridge.saveBar?.show(id); } catch (e) { /* ignore */ }
    } else {
      try { appBridge.saveBar?.hide(id); } catch (e) { /* ignore */ }
    }
    return () => {
      try { appBridge.saveBar?.hide(id); } catch (e) { /* ignore */ }
    };
  }, [appBridge, isDirty, saveBarId]);

  useEffect(() => {
    return () => {
      try { appBridge?.saveBar?.hide(saveBarId); } catch (e) { }
    };
  }, [appBridge, saveBarId]);

  const createOffer = (type) => {
    const defaultTranslations = {};
    const saleTranslations = {
      ar: "تخفيضات",
      ca: "Rebaixes",
      cs: "Výprodej",
      da: "Udsalg",
      de: "Sale",
      en: "Sale",
      es: "Rebajas",
      fi: "Ale",
      fr: "Soldes",
      hi: "बिक्री",
      hu: "Akció",
      is: "Útsala",
      it: "Saldi",
      ja: "セール",
      ko: "세일",
      "nb-no": "Salg",
      nb: "Salg",
      nl: "Uitverkoop",
      no: "Salg",
      pl: "Wyprzedaż",
      "pt-br": "Promoção",
      "pt-pt": "Promoção",
      pt: "Promoção",
      "ro-ro": "Reduceri",
      sv: "Rea",
      th: "ลดราคา",
      tr: "İndirim",
      vi: "Giảm giá",
      "zh-cn": "特卖",
      "zh-tw": "特賣",
      zh: "特卖",
    };

    if (type === "text") {
      translationLanguages.forEach(lang => {
        if (lang.code) {
          const code = String(lang.code).toLowerCase();
          defaultTranslations[code] = saleTranslations[code] || "Sale";
        }
      });
    }

    const newOffer = {
      id: Date.now(),
      type,
      products: productItems,
      collections: collectionItems,
      open: true,
      overlayData: type === "text"
        ? {
          ...DEFAULT_TEXT_CONFIG,
          text: "Sale",
          type: "TEXT",
          overlay_group_id: overlayGroupId || null,
          status: "Active",
          translations: defaultTranslations
        }
        : { ...DEFAULT_IMAGE_CONFIG, type: "IMAGE", overlay_group_id: overlayGroupId || null, status: "Active" },
    };

    setOffers((prev) =>
      [
        ...prev.map((o) => ({ ...o, open: false })),
        newOffer,
      ],
    );

    // Clear any existing errors for this offer
    setOfferErrors(prev => ({
      ...prev,
      [newOffer.id]: null
    }));

    setActiveOfferId(newOffer.id);
    if (type === "text") {
      setTextOverlay(newOffer.overlayData);
      setTabSelected(1);
    } else {
      setImageOverlay(newOffer.overlayData);
      setTabSelected(2);
    }
  };

  const textAlignOptions = [
    { label: 'Select option', value: '' },
    { label: 'Left', value: 'LEFT' },
    { label: 'Center', value: 'CENTER' },
    { label: 'Right', value: 'RIGHT' },
  ];

  const textPositionOptions = [
    { label: 'Select option', value: '' },
    { label: 'Top Left', value: 'TOP_LEFT' },
    { label: 'Top Center', value: 'TOP_CENTER' },
    { label: 'Top Right', value: 'TOP_RIGHT' },
    { label: 'Middle Left', value: 'MIDDLE_LEFT' },
    { label: 'Middle Center', value: 'MIDDLE_CENTER' },
    { label: 'Middle Right', value: 'MIDDLE_RIGHT' },
    { label: 'Bottom Left', value: 'BOTTOM_LEFT' },
    { label: 'Bottom Center', value: 'BOTTOM_CENTER' },
    { label: 'Bottom Right', value: 'BOTTOM_RIGHT' },
  ];

  const textFontFamilyOptions = [
    { label: "Select option", value: "" },
    { label: "Arial", value: "Arial" },
    { label: "Arial Black", value: "Arial Black" },
    { label: "Verdana", value: "Verdana" },
    { label: "Tahoma", value: "Tahoma" },
    { label: "Trebuchet MS", value: "Trebuchet MS" },
    { label: "Impact", value: "Impact" },
    { label: "Times New Roman", value: "Times New Roman" },
    { label: "Didot", value: "Didot" },
    { label: "Georgia", value: "Georgia" },
    { label: "American Typewriter", value: "American Typewriter" },
    { label: "Andalé Mono", value: "Andalé Mono" },
    { label: "Courier", value: "Courier" },
    { label: "Lucida Console", value: "Lucida Console" },
    { label: "Monaco", value: "Monaco" },
    { label: "Bradley Hand", value: "Bradley Hand" },
    { label: "Brush Script MT", value: "Brush Script MT" },
    { label: "Luminari", value: "Luminari" },
    { label: "Comic Sans MS", value: "Comic Sans MS" },
  ];

  const textFontWeightOptions = [
    { label: "Select option", value: "" },
    { label: "Light", value: "lighter" },
    { label: "Normal", value: "normal" },
    { label: "Bold", value: "bold" },
    { label: "Bolder", value: "bolder" },
  ];

  const textFontStyleOptions = [
    { label: "Select option", value: "" },
    { label: "Normal", value: "normal" },
    { label: "Italic", value: "italic" },
  ];

  const handleTranslationChange = (locale, value) => {
    setTextOverlay((prev) => {
      const nextTranslations = { ...(prev.translations || {}) };
      nextTranslations[locale] = value;
      return { ...prev, translations: nextTranslations };
    });
    if (activeOfferId) {
      setOffers((prev) =>
        prev.map((o) =>
          o.id === activeOfferId
            ? {
              ...o,
              overlayData: {
                ...(o.overlayData || {}),
                type: "TEXT",
                translations: {
                  ...(o.overlayData?.translations || {}),
                  [locale]: value,
                },
              },
            }
            : o,
        ),
      );
      setIsDirty(true);
    }
  };

  const handleTextSetting = (key, value) => {
    setTextOverlay((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "text" && defaultTranslationLocale
        ? {
          translations: {
            ...(prev.translations || {}),
            [defaultTranslationLocale]: value,
          },
        }
        : {}),
    }));
    if (activeOfferId) {
      setOffers((prev) =>
        prev.map((o) =>
          o.id === activeOfferId
            ? {
              ...o,
              overlayData: {
                ...(o.overlayData || {}),
                type: "TEXT",
                [key]: value,
                ...(key === "text" && defaultTranslationLocale
                  ? {
                    translations: {
                      ...(o.overlayData?.translations || {}),
                      [defaultTranslationLocale]: value,
                    },
                  }
                  : {}),
              },
            }
            : o,
        ),
      );
    }
  };

  const handleImageSetting = (key, value) => {
    setImageOverlay((prev) => ({
      ...prev,
      [key]: value,
    }));
    if (activeOfferId) {
      setOffers((prev) =>
        prev.map((o) =>
          o.id === activeOfferId
            ? {
              ...o,
              overlayData: {
                ...(o.overlayData || {}),
                type: "IMAGE",
                [key]: value,
              },
            }
            : o,
        ),
      );
    }
  };

  const togglePopover = (key) => {
    setActivePopover(activePopover === key ? null : key);
  };

  const handleColorChange = (key, type, value) => {
    let colorVal = type == "TEXT" || type == "text" ? value : hsbaToHex(value);
    if (key === "font_color") handleTextSetting(key, colorVal);
    else handleTextSetting(key, colorVal);
  };

  function hsbaToHex({ hue, saturation, brightness, alpha = 1 }) {
    const rgb = hsbToRgb(hue, saturation, brightness);
    const hex = rgbToHex(rgb);
    const alphaHex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${alphaHex}`;
  }

  function hsbToRgb(h, s, b) {
    const c = b * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = b - c;

    let r, g, b_;
    if (h >= 0 && h < 60) [r, g, b_] = [c, x, 0];
    else if (h < 120) [r, g, b_] = [x, c, 0];
    else if (h < 180) [r, g, b_] = [0, c, x];
    else if (h < 240) [r, g, b_] = [0, x, c];
    else if (h < 300) [r, g, b_] = [x, 0, c];
    else[r, g, b_] = [c, 0, x];

    return {
      red: Math.round((r + m) * 255),
      green: Math.round((g + m) * 255),
      blue: Math.round((b_ + m) * 255),
    };
  }

  function rgbToHex({ red, green, blue }) {
    return `#${[red, green, blue]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  const handleDropZoneDrop = (_dropFiles, acceptedFiles, _rejectedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const isImage =
      file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".svg");

    if (!isImage) {
      setShowImageError("Only image files (including SVG) are allowed.");
      return;
    }

    const isTooLarge = file.size > 2 * 1024 * 1024;
    if (isTooLarge) {
      setShowImageError("File is too large. Max 2MB allowed.");
      return;
    }
    handleImageSetting("image_url", file);
    if (offerErrors[activeOfferId]) {
      setOfferErrors(prev => ({
        ...prev,
        [activeOfferId]: null
      }));
    }
  };
  const deselectedOptions = useMemo(
    () => [
      { value: "product", label: "Product" },
      { value: "index", label: "Home" },
      { value: "collection", label: "Collection" },
      { value: "search", label: "Search" },
    ],
    [],
  );
  const removeTag = useCallback(
    (tag) => () => {
      const options = [...textOverlay?.display_in];
      options.splice(options.indexOf(tag), 1);
      handleTextSetting("display_in", options);
    },
    [textOverlay?.display_in],
  );
  const verticalContentMarkup =
    textOverlay?.display_in?.length > 0 ? (
      <InlineStack spacing="extraTight" alignment="center">
        {textOverlay?.display_in?.map((option) => {
          let tagLabel = "";
          tagLabel = option.replace("_", " ");
          return (
            <div style={{ marginBottom: '6px' }}>
              <Tag key={`option${option}`} onRemove={removeTag(option)}>
                {tagLabel}
              </Tag>
            </div>
          );
        })}
      </InlineStack>
    ) : null;

  const textField = (
    <Autocomplete.TextField
      label="Display in"
      verticalContent={verticalContentMarkup}
      autoComplete="off"
    />
  );

  const removeImageTag = useCallback(
    (tag) => () => {
      const options = [...imageOverlay?.display_in];
      options.splice(options.indexOf(tag), 1);
      handleImageSetting("display_in", options);
    },
    [imageOverlay?.display_in],
  );

  const verticalImageContentMarkup =
    imageOverlay?.display_in?.length > 0 ? (
      <InlineStack spacing="extraTight" alignment="center">
        {imageOverlay?.display_in?.map((option) => {
          let tagLabel = "";
          tagLabel = option.replace("_", " ");
          return (
            <div style={{ marginBottom: '6px' }}>
              <Tag key={`option${option}`} onRemove={removeImageTag(option)}>
                {tagLabel}
              </Tag>
            </div>

          );
        })}
      </InlineStack>
    ) : null;

  const imageField = (
    <Autocomplete.TextField
      label="Display in"
      verticalContent={verticalImageContentMarkup}
      autoComplete="off"
    />
  );

  const showInlineErrors = () => {
    return <InlineError message={showImageError} />;
  };
  const handleUpdateCloseModal = () => {
    setUpdateStatusModal({ open: false, id: null, status: "", type: "" });
  };

  const handleStatusUpdate = () => {
    if (!updateStatusModal?.id) {
      handleUpdateCloseModal();
      return;
    }
    setLoader("update_status");
    const formData = new FormData();
    formData.append("actionType", "update_status");
    formData.append(
      "status",
      updateStatusModal.status === "Active" ? "Inactive" : "Active",
    );
    formData.append("overlay_id", updateStatusModal.id);
    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ open: false, id: null });
  };

  const handleDeleteConfirm = () => {
    const offerId = deleteConfirmation.id;
    if (!offerId) {
      handleDeleteCancel();
      return;
    }

    // Removed check for last overlay deletion as requested.
    // The Save button will be disabled if offers.length becomes 0.

    setOffers((prev) => prev.filter((o) => o.id !== offerId));
    setTextOverlay(DEFAULT_TEXT_CONFIG);
    setImageOverlay(DEFAULT_IMAGE_CONFIG);
    if (activeOfferId === offerId) {
      setActiveOfferId(null);
    }
    setOfferErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[offerId];
      return newErrors;
    });
    handleDeleteCancel();
  };

  const renderTextOverlaySection = () => {
    const error = offerErrors[activeOfferId];

    return (
      <>
        <BlockStack gap="200">

          <Card sectioned>
            <div style={{ marginBottom: "16px" }}>
              <Text variant="headingSm" as="h6">
                {t("builder.form.fontSettings", "Font Settings")}
              </Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <BlockStack gap="300">
                <TextField
                  focused={error && !String(textOverlay?.text || "").trim() ? " " : undefined}
                  id="enter_text"
                  label={(
                    <div className="d-flex align-items-center justify-content-between w-100 label-with-translation">
                      <Text>Text</Text>

                    </div>
                  )}
                  autoComplete="off"
                  placeholder="Enter text"
                  value={textOverlay?.text}
                  onChange={(value) => {
                    handleTextSetting("text", value);
                    if (error) {
                      setOfferErrors(prev => ({
                        ...prev,
                        [activeOfferId]: null
                      }));
                    }
                  }}
                  error={error && !String(textOverlay?.text || "").trim() ? "Enter overlay text" : undefined} connectedRight={(
                    <Popover
                      active={translationPopoverActive}
                      activator={(
                        <Tooltip content="Edit this text separately for each language in your store.">
                          <div className="relative cursor-pointer" onClick={() => setTranslationPopoverActive((prev) => !prev)}>
                            <span style={{ display: "inline-flex", transform: "scale(1.4)", marginLeft: "5px" }}>
                              <Icon
                                source={LanguageTranslateIcon}
                                tone={hasMissingTranslations ? "critical" : undefined}
                                accessibilityLabel="Manage translations"
                              />
                            </span>

                            {hasMissingTranslations && <div className="red-dot"></div>}
                          </div>
                        </Tooltip>
                      )}
                      onClose={() => {
                        setTranslationPopoverActive(false);
                        setEditingLocale(null);
                        setEditingValue("");
                      }}
                      preferredAlignment="right"
                    >
                      <div style={{ minWidth: '325px' }}>
                        <Card>
                          <BlockStack gap="200" padding="300">
                            <Text as="h2" variant="headingSm">
                              Translations
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Default: {textOverlay?.text || "Not set"}
                            </Text>
                            <div style={{ borderTop: "1px solid #E1E3E5", margin: "8px -12px 0", paddingTop: 8 }} />
                            <BlockStack gap="100">
                              {translationLanguages.map((lang) => {
                                const val = textOverlay?.translations?.[lang.code] || "";
                                const isEditing = editingLocale === lang.code;
                                return (
                                  <div
                                    key={lang.code}
                                    style={{
                                      background: isEditing ? "#F6F6F7" : "#fff",
                                      borderRadius: 8,
                                      padding: "10px 12px",
                                      border: "1px solid #E1E3E5",
                                    }}
                                  >
                                    {isEditing ? (
                                      <BlockStack gap="100">
                                        <InlineStack align="space-between" blockAlign="center">
                                          <InlineStack gap="300" blockAlign="center">
                                            <Text variant="bodyMd">{getLocaleFlag(lang.code)}</Text>
                                            <Text variant="bodyMd">{getLocaleLabel(lang.code, lang.label)}</Text>
                                          </InlineStack>
                                        </InlineStack>
                                        <TextField
                                          label={`${lang.label} translation`}
                                          labelHidden
                                          value={editingValue}
                                          onChange={setEditingValue}
                                          autoComplete="off"
                                        />
                                        <InlineStack gap="200" align="end">
                                          <Button
                                            onClick={() => {
                                              setEditingLocale(null);
                                              setEditingValue("");
                                            }}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            primary
                                            onClick={() => {
                                              handleTranslationChange(lang.code, editingValue);
                                              setEditingLocale(null);
                                              setEditingValue("");
                                            }}
                                          >
                                            Save
                                          </Button>
                                        </InlineStack>
                                      </BlockStack>
                                    ) : (
                                      <InlineStack align="space-between" blockAlign="center">
                                        <InlineStack gap="300" blockAlign="center">
                                          <Text variant="bodyMd">{getLocaleFlag(lang.code)}</Text>
                                          <BlockStack gap="050">
                                            <Text variant="bodyMd">{getLocaleLabel(lang.code, lang.label)}</Text>
                                            <Text variant="bodySm" tone="subdued">
                                              {val || "(no translation)"}
                                            </Text>
                                          </BlockStack>
                                        </InlineStack>
                                        <InlineStack gap="100" blockAlign="center">
                                          <Badge tone={val ? "success" : "warning"}>
                                            {val ? "Translated" : "Missing"}
                                          </Badge>
                                          <Button
                                            icon={EditIcon}
                                            variant="plain"
                                            onClick={() => {
                                              setEditingLocale(lang.code);
                                              setEditingValue(val || "");
                                            }}
                                            accessibilityLabel={`Edit ${lang.label} translation`}
                                          />
                                        </InlineStack>
                                      </InlineStack>
                                    )}
                                  </div>
                                );
                              })}
                            </BlockStack>
                          </BlockStack>
                        </Card>
                      </div>

                    </Popover>
                  )}
                />
                <InlineGrid columns={2} gap="300">
                  <BlockStack>
                    <Text>Font size</Text>

                    <div style={{ marginTop: "8px" }}>
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        style={{ width: "100%" }}
                      >
                        <div style={{ flex: 1, marginRight: 12 }}>
                          <RangeSlider
                            output
                            min={10}
                            max={100}
                            step={1}
                            value={Number(textOverlay?.font_size) || 16}
                            onChange={(value) => handleTextSetting("font_size", value)}
                          />
                        </div>

                        <Text
                          variant="bodyMd"

                          style={{ width: 40, textAlign: "right" }}
                        >
                          {Number(textOverlay?.font_size) || 16}px
                        </Text>
                      </InlineStack>
                    </div>
                  </BlockStack>


                  <Select
                    label="Font family"
                    options={textFontFamilyOptions}
                    value={textOverlay?.font_family}
                    onChange={(value) => handleTextSetting("font_family", value)}
                  />
                </InlineGrid>
                <InlineGrid columns={2} gap="300">
                  <Select
                    label="Font weight"
                    options={textFontWeightOptions}
                    value={textOverlay?.font_weight}
                    onChange={(value) => handleTextSetting("font_weight", value)}
                  />

                  <Select
                    label="Font style"
                    options={textFontStyleOptions}
                    value={textOverlay?.font_style}
                    onChange={(value) => handleTextSetting("font_style", value)}
                  />
                </InlineGrid>
                <InlineGrid columns={2} gap="300">
                  <InlineStack gap={100} wrap={false}>
                    <TextField
                      label={<Text>Font color</Text>}
                      value={textOverlay?.font_color || "#ffffffff"}
                      onChange={(value) =>
                        handleColorChange("font_color", "text", value)
                      }
                      prefix={<Icon source={NoteIcon} />}
                      autoComplete="off"
                    />

                    <ColorPickerPopover
                      popoverActive={activePopover === "font_color"}
                      togglePopover={() => togglePopover("font_color")}
                      color={textOverlay?.font_color || "#ffffffff"}
                      handleColorChange={(value) =>
                        handleColorChange("font_color", "color", value)
                      }
                    />
                  </InlineStack>

                  <InlineStack gap={100} wrap={false}>
                    <TextField
                      label={<Text>Background color</Text>}
                      value={textOverlay?.bg_color || "#ffffffff"}
                      onChange={(value) =>
                        handleColorChange("bg_color", "text", value)
                      }
                      prefix={<Icon source={NoteIcon} />}
                      autoComplete="off"
                    />

                    <ColorPickerPopover
                      popoverActive={activePopover === "bg_color"}
                      togglePopover={() => togglePopover("bg_color")}
                      color={textOverlay?.bg_color || "#ffffffff"}
                      handleColorChange={(value) =>
                        handleColorChange("bg_color", "color", value)
                      }
                    />
                  </InlineStack>
                </InlineGrid>
              </BlockStack>
            </div>

            <Divider />

            <div style={{ margin: "20px 0" }}>
              <Text variant="headingSm" as="h6">{t("builder.form.sectionSettings", "Section Settings")}</Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <BlockStack gap={300}>
                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Scale in product</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={100}
                          step={1}
                          value={Number(textOverlay?.scale_in_product) || 0}
                          onChange={(value) => handleTextSetting("scale_in_product", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }}>
                        {Number(textOverlay?.scale_in_product) || 0}%
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack>
                    <Text>Scale in collection</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={100}
                          step={1}
                          value={Number(textOverlay?.scale_in_collection) || 0}
                          onChange={(value) => handleTextSetting("scale_in_collection", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }}>
                        {Number(textOverlay?.scale_in_collection) || 0}%
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
                <InlineGrid columns={2} gap="500">

                  <BlockStack>
                    <Text>Scale in search</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={100}
                          step={1}
                          value={Number(textOverlay?.scale_in_search) || 0}
                          onChange={(value) => handleTextSetting("scale_in_search", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }}>
                        {Number(textOverlay?.scale_in_search) || 0}%
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <Autocomplete
                    allowMultiple
                    options={deselectedOptions}
                    selected={textOverlay?.display_in}
                    textField={textField}
                    onSelect={(value) =>
                      handleTextSetting("display_in", value)
                    }
                    listTitle="Suggested Tags"
                  />
                </InlineGrid>
              </BlockStack>
            </div>

            <Divider />

            <div style={{ margin: "20px 0" }}>
              <Text variant="headingSm" as="h6">{t("builder.form.alignmentSettings", "Alignment & Position")}</Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <BlockStack gap={300}>
                <InlineGrid columns={2} gap="300">
                  <BlockStack>
                    <Text>Rotation</Text>

                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                      style={{ width: "100%" }}
                    >
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={360}
                          step={1}
                          value={Number(textOverlay?.rotation) || 0}
                          onChange={(value) => handleTextSetting("rotation", value)}
                        />
                      </div>

                      <Text
                        variant="bodyMd"

                        style={{ width: 50, textAlign: "right" }}
                      >
                        {Number(textOverlay?.rotation) || 0}°
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack>
                    <Text>Border radius</Text>

                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                      style={{ width: "100%" }}
                    >
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={360}
                          step={1}
                          value={Number(textOverlay?.border_radius) || 0}
                          onChange={(value) => handleTextSetting("border_radius", value)}
                        />
                      </div>

                      <Text
                        variant="bodyMd"

                        style={{ width: 50, textAlign: "right" }}
                      >
                        {Number(textOverlay?.border_radius) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>

                <InlineGrid columns={2} gap="300">
                  <Select
                    label={<Text>Text align</Text>}
                    options={textAlignOptions}
                    value={textOverlay?.text_align}
                    onChange={(value) => handleTextSetting("text_align", value)}
                  />

                  <Select
                    label={<Text>Text position</Text>}
                    options={textPositionOptions}
                    value={textOverlay?.position}
                    onChange={(value) => handleTextSetting("position", value)}
                  />
                </InlineGrid>
              </BlockStack>
            </div>

            <Divider />

            <div style={{ margin: "20px 0" }}>
              <Text variant="headingSm" as="h6">{t("builder.form.spacingSettings", "Spacing Settings")}</Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <BlockStack gap={300}>
                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Top padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(textOverlay?.padding_top) || 0}
                          onChange={(value) => handleTextSetting("padding_top", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(textOverlay?.padding_top) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <BlockStack>
                    <Text>Right padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(textOverlay?.padding_right) || 0}
                          onChange={(value) => handleTextSetting("padding_right", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(textOverlay?.padding_right) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Bottom padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(textOverlay?.padding_bottom) || 0}
                          onChange={(value) => handleTextSetting("padding_bottom", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(textOverlay?.padding_bottom) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <BlockStack>
                    <Text>Left padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(textOverlay?.padding_left) || 0}
                          onChange={(value) => handleTextSetting("padding_left", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(textOverlay?.padding_left) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </div>
          </Card>
        </BlockStack>
      </>
    )
  };

  const renderImageOverlaySection = () => {
    const error = offerErrors[activeOfferId];

    return (
      <>
        <BlockStack gap="200">
          <Card sectioned>
            <div style={{ marginBottom: "16px" }}>
              <Text variant="headingSm" as="h6">
                {t("builder.form.imageSettings", "Image Settings")}
              </Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <InlineGrid columns={2} gap="300">
                <BlockStack gap="300">
                  <Label>Image</Label>
                  <div
                    className="image_overlay"
                    style={{ display: "flex" }}
                  >
                    <div style={{ width: 125, height: 90 }}>
                      {imageOverlay?.image_url ? (
                        <img
                          style={{ width: "125px", height: "90px" }}
                          src={
                            imageOverlay?.image_url instanceof File
                              ? window.URL.createObjectURL(imageOverlay?.image_url)
                              : imageOverlay.image_url
                          }
                          alt="Overlay preview"
                        />
                      ) : (
                        <DropZone
                          allowMultiple={false}
                          accept="image/*,image/svg+xml"
                          type="image"
                          onDrop={handleDropZoneDrop}
                          error={error && !imageOverlay?.image_url}
                          style={{ border: "2px solid red !important" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <Button onClick={() => setShowImageError("")}>
                              <Icon source={UploadIcon} tone="base" />
                            </Button>
                          </div>
                        </DropZone>
                      )}
                    </div>
                    {imageOverlay?.image_url && (
                      <div className="delete_image">
                        <Button
                          size="micro"
                          variant="plain"
                          onClick={() => {
                            handleImageSetting("image_url", "");
                          }}
                        >
                          <Icon source={XIcon} tone="base" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {error && !imageOverlay?.image_url && (
                    <div style={{ marginTop: "8px" }}>
                      <InlineError message="Select Image" fieldID="image-upload-error" />
                    </div>
                  )}
                  {showInlineErrors()}
                </BlockStack>
                <div>
                  <BlockStack gap="300">
                    <Select
                      label="Image position"
                      options={textPositionOptions}
                      value={imageOverlay?.position}
                      onChange={(value) => handleImageSetting("position", value)}
                    />
                    <BlockStack>
                      <Text>Border radius</Text>

                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        style={{ width: "100%" }}
                      >
                        <div style={{ flex: 1, marginRight: 12 }}>
                          <RangeSlider
                            output
                            min={0}
                            max={360}
                            step={1}
                            value={Number(imageOverlay?.border_radius) || 0}
                            onChange={(value) => handleImageSetting("border_radius", value)}
                          />
                        </div>

                        <Text
                          variant="bodyMd"

                          style={{ width: 50, textAlign: "right" }}
                        >
                          {Number(imageOverlay?.border_radius) || 0}px
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </div>
              </InlineGrid>
            </div>

            <Divider />

            <div style={{ margin: "20px 0" }}>
              <Text variant="headingSm" as="h6">Section Settings</Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <BlockStack gap={300}>
                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Scale in product</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={100}
                          step={1}
                          value={Number(imageOverlay?.scale_in_product) || 0}
                          onChange={(value) => handleImageSetting("scale_in_product", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.scale_in_product) || 0}%
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <BlockStack>
                    <Text>Scale in collection</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={100}
                          step={1}
                          value={Number(imageOverlay?.scale_in_collection) || 0}
                          onChange={(value) => handleImageSetting("scale_in_collection", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.scale_in_collection) || 0}%
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Scale in search</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={100}
                          step={1}
                          value={Number(imageOverlay?.scale_in_search) || 0}
                          onChange={(value) => handleImageSetting("scale_in_search", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.scale_in_search) || 0}%
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <Autocomplete
                    allowMultiple
                    options={deselectedOptions}
                    selected={imageOverlay?.display_in}
                    textField={imageField}
                    onSelect={(value) => handleImageSetting("display_in", value)}
                  />
                </InlineGrid>
              </BlockStack>
            </div>

            <Divider />

            <div style={{ margin: "20px 0" }}>
              <Text variant="headingSm" as="h6">{t("builder.form.spacingSettings", "Spacing Settings")}</Text>
            </div>

            <div style={{ paddingBottom: "20px" }}>
              <BlockStack gap={300}>
                <InlineGrid columns={2} gap={300}>
                  <BlockStack>
                    <Text>Opacity</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={1}
                          step={0.1}
                          value={Number(imageOverlay?.opacity) || 1}
                          onChange={(value) => handleImageSetting("opacity", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }}>
                        {Number(imageOverlay?.opacity) || 1}
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack>
                    <Text>Rotation</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={360}
                          step={1}
                          value={Number(imageOverlay?.rotation) || 0}
                          onChange={(value) => handleImageSetting("rotation", value)}
                        />
                      </div>
                      <Text style={{ width: 50, textAlign: "right" }}>
                        {Number(imageOverlay?.rotation) || 0}°
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>

                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Top padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(imageOverlay?.padding_top) || 0}
                          onChange={(value) => handleImageSetting("padding_top", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.padding_top) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack>
                    <Text>Right padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(imageOverlay?.padding_right) || 0}
                          onChange={(value) => handleImageSetting("padding_right", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.padding_right) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
                <InlineGrid columns={2} gap="500">
                  <BlockStack>
                    <Text>Bottom padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(imageOverlay?.padding_bottom) || 0}
                          onChange={(value) => handleImageSetting("padding_bottom", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.padding_bottom) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack>
                    <Text>Left padding</Text>
                    <InlineStack align="space-between" blockAlign="center" style={{ width: "100%" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <RangeSlider
                          output
                          min={0}
                          max={200}
                          step={1}
                          value={Number(imageOverlay?.padding_left) || 0}
                          onChange={(value) => handleImageSetting("padding_left", value)}
                        />
                      </div>
                      <Text style={{ width: 40, textAlign: "right" }} fontWeight="bold">
                        {Number(imageOverlay?.padding_left) || 0}px
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </div>
          </Card>
        </BlockStack>
      </>
    )
  };

  const getPositionStyles = (textOverlay) => {
    let rotate_css = "";
    if (textOverlay?.rotation != "") {
      rotate_css = " rotate(" + textOverlay?.rotation + "deg)";
    }

    let prepareStyleObject = {};
    switch (textOverlay.position) {
      case "TOP_LEFT":
        prepareStyleObject = {
          top: 0,
          left: 0,
          alignItems: "flex-start",
          justifyContent: "left",
          transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
        };
        break;
      case "TOP_CENTER":
        prepareStyleObject = {
          top: 0, left: "50%", transform: "translateX(-50%)" + rotate_css,
          alignItems: "flex-start",
          justifyContent: "center",
        };
        break;
      case "TOP_RIGHT":
        prepareStyleObject = {
          top: 0, right: 0,
          alignItems: "flex-start",
          justifyContent: "right",
          transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
        };
        break;
      case "MIDDLE_LEFT":
        prepareStyleObject = {
          top: "50%", left: 0, transform: "translateY(-50%)" + rotate_css,
          alignItems: "center",
          justifyContent: "flex-start",
        };
        break;
      case "MIDDLE_CENTER":
        prepareStyleObject = {
          top: "50%", left: "50%", transform: "translate(-50%,-50%)" + rotate_css,
          alignItems: "center",
          justifyContent: "center",
        };
        break;
      case "MIDDLE_RIGHT":
        prepareStyleObject = {
          top: "50%", right: 0, transform: "translateY(-50%)" + rotate_css,
          alignItems: "center",
          justifyContent: "right",
        };
        break;
      case "BOTTOM_LEFT":
        prepareStyleObject = {
          bottom: 0, left: 0,
          alignItems: "flex-end",
          justifyContent: "left",
          transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
        };
        break;
      case "BOTTOM_CENTER":
        prepareStyleObject = {
          bottom: 0, left: "50%", transform: "translateX(-50%)" + rotate_css,
          alignItems: "flex-end",
          justifyContent: "center",
        };
        break;
      case "BOTTOM_RIGHT":
        prepareStyleObject = {
          bottom: 0, right: 0,
          alignItems: "flex-end",
          justifyContent: "right",
          transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
        };
        break;
      default:
        prepareStyleObject = {};
    }

    let isProdScaleAdded = false;
    if (textOverlay?.scale_in_product > 0) {
      isProdScaleAdded = true;
    }

    let paddingObj = {
      padding_top: textOverlay.padding_top,
      padding_right: textOverlay.padding_right,
      padding_bottom: textOverlay.padding_bottom,
      padding_left: textOverlay.padding_left,
    };
    const isPaddingScaleAdd = textOverlay?.type === 'TEXT' && isProdScaleAdded;
    if (textOverlay?.padding_top != "") {
      paddingObj.padding_top = isPaddingScaleAdd
        ? (parseInt(textOverlay?.padding_top) * parseInt(textOverlay?.scale_in_product)) /
        100 : textOverlay?.padding_top;
    }
    if (textOverlay?.padding_right != "") {
      paddingObj.padding_right = isPaddingScaleAdd
        ? (parseInt(textOverlay?.padding_right) * parseInt(textOverlay?.scale_in_product)) /
        100 : textOverlay?.padding_right;
    }
    if (textOverlay?.padding_bottom != "") {
      paddingObj.padding_bottom = isPaddingScaleAdd
        ? (parseInt(textOverlay?.padding_bottom) * parseInt(textOverlay?.scale_in_product)) /
        100 : textOverlay?.padding_bottom;
    }
    if (textOverlay?.padding_left != "") {
      paddingObj.padding_left = isPaddingScaleAdd
        ? (parseInt(textOverlay?.padding_left) * parseInt(textOverlay?.scale_in_product)) /
        100 : textOverlay?.padding_left;
    }

    prepareStyleObject.padding = `${paddingObj?.padding_top}px ${paddingObj.padding_right}px ${paddingObj.padding_bottom}px ${paddingObj.padding_left}px`;
    prepareStyleObject.opacity = textOverlay.opacity || 1;
    prepareStyleObject.display = 'flex';
    prepareStyleObject.position = 'absolute';
    if (textOverlay.type !== 'TEXT') {
      prepareStyleObject.zIndex = 1;
      prepareStyleObject.height = '100%';
      prepareStyleObject.width = '100%';
    } else {
      prepareStyleObject.wordBreak = 'break-all';
    }

    if (textOverlay.type === 'TEXT') {
      if (textOverlay.font_color) {
        prepareStyleObject.color = textOverlay.font_color;
      }
      if (textOverlay.bg_color) {
        prepareStyleObject.backgroundColor = textOverlay.bg_color;
      }
      if (textOverlay.font_family) {
        prepareStyleObject.fontFamily = textOverlay.font_family;
      }
      const fontSizeNum = parseFloat(textOverlay?.font_size);
      if (!Number.isNaN(fontSizeNum)) {
        prepareStyleObject.fontSize = textOverlay?.scale_in_product > 0
          ? (fontSizeNum * Number(textOverlay?.scale_in_product)) / 100 + "px"
          : fontSizeNum + "px";
      }
      if (textOverlay.font_weight) {
        prepareStyleObject.fontWeight = textOverlay.font_weight;
      }
      if (textOverlay.font_style) {
        prepareStyleObject.fontStyle = textOverlay.font_style;
      }
      if (textOverlay.text_align) {
        prepareStyleObject.textAlign = textOverlay.text_align;
      }
      prepareStyleObject.lineHeight = 'normal';
      if (textOverlay.border_radius) {
        prepareStyleObject.borderRadius = textOverlay.border_radius + "px";
      }
    }

    return prepareStyleObject;
  };

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const shopify = getShopify();

      if (fetcher.data?.error || fetcher.data?.success === false) {
        shopify?.toast?.show(fetcher.data?.error || t("builder.toast.somethingWrong", "Something went wrong"), { isError: true });
        setLoader("");
        return;
      }

      if (fetcher.data?.image) {
        setProdImage(fetcher.data.image || placeholderImage);
        if (fetcher.data.products) {
          setPreviewProducts(fetcher.data.products);
          setSelectedPreviewId(fetcher.data.products?.[0]?.id || "");
        }
      }

      if (fetcher.data?.type === "update_status" && fetcher.data?.success) {
        setLoader("");
        const updated = fetcher.data.overlay;
        setOverlayList((prev) =>
          prev.map((ov) =>
            ov.id === updated?.id ? normalizeOverlay(updated) : ov,
          ),
        );
        setOffers((prev) =>
          prev.map((o) =>
            o.overlayData?.id === updated?.id
              ? { ...o, overlayData: { ...o.overlayData, status: updated.status } }
              : o,
          ),
        );
        setUpdateStatusModal({ open: false, id: null, status: "", type: "" });
        shopify?.toast?.show(t("builder.toast.statusUpdated", "Status updated successfully"));
        return;
      }

      if (fetcher.data?.type === "save_overlay" && fetcher.data?.success) {
        const normalizedOverlays = (fetcher.data?.overlays || []).map(normalizeOverlay);
        const newGroupId = fetcher.data.overlay_group_id || overlayGroupId || "";
        if (normalizedOverlays.length) {
          setOverlayList((prev) => {
            const filtered = newGroupId
              ? (prev || []).filter(
                (ov) => (ov.overlay_group_id || `legacy-${ov.id}`) !== newGroupId,
              )
              : prev || [];
            return [
              ...filtered,
              ...normalizedOverlays,
            ];
          });

          const newOffers = normalizedOverlays.map((ov, idx) => ({
            id: ov.id,
            type: ov.type === "IMAGE" ? "image" : "text",
            open: idx === 0,
            overlayData: {
              ...(ov.type === "IMAGE" ? { ...DEFAULT_IMAGE_CONFIG } : { ...DEFAULT_TEXT_CONFIG }),
              ...ov,
              type: ov.type,
            },
          }));
          setOffers(newOffers);
          const first = newOffers[0];
          setActiveOfferId(first?.id || null);
          if (first) {
            if (first.type === "text") {
              setTextOverlay(first.overlayData);
              setTabSelected(1);
            } else {
              setImageOverlay(first.overlayData);
              setTabSelected(2);
            }
          }
        }
        setOverlayGroupId(newGroupId);
        shopify?.toast?.show(t("builder.toast.overlaySaved", "Overlay saved successfully"));
        setBaselineTrigger(Date.now());
        setShowPublishCard(true);
        return;
      }
    }
  }, [fetcher.data, fetcher.state, navigate, overlayGroupId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (selected === "all" && !hasFetchedAllProductImage && fetcher.state === "idle") {
      const formData = new FormData();
      formData.append("actionType", "get_first_product_image");
      fetcher.submit(formData, {
        method: "post",
        encType: "multipart/form-data",
      });
      setHasFetchedAllProductImage(true);
    }
  }, [selected, isHydrated, hasFetchedAllProductImage, fetcher.state, fetcher]);

  useEffect(() => {
    // Relying on React-rendered preview instead of manual DOM overlays for multiple items.
  }, [textOverlay, imageOverlay, activeOfferId]);

  const previewOverlays = useMemo(() => {
    const activeOnly = (list) =>
      list
        .filter(Boolean)
        .filter((o) => (o?.status || "Active") !== "Inactive");

    if (offers.length > 0) {
      return activeOnly(offers.map((o) => o.overlayData));
    }
    if (overlayGroupId) {
      return activeOnly(
        (overlayList || []).filter(
          (ov) => (ov?.overlay_group_id || null) === overlayGroupId,
        ),
      );
    }
    return [];
  }, [offers, overlayGroupId, overlayList]);

  useEffect(() => {
    if (selected === "all" && previewProducts.length > 0 && !selectedPreviewId) {
      setSelectedPreviewId(previewProducts[0].id);
      setProdImage(previewProducts[0].image || placeholderImage);
    }
    if (selected === "products" && productItems.length > 0 && !selectedPreviewId) {
      const p = productItems[0];
      setSelectedPreviewId(p.id);
      setProdImage(p.image || p.images?.[0]?.originalSrc || placeholderImage);
    }
  }, [selected, previewProducts, productItems, selectedPreviewId]);

  const handleSaveAll = () => {
    const shopify = getShopify();

    // Clear all previous errors
    const newErrors = {};
    setShowProductsError(false);

    if (!offers.length) {
      shopify?.toast?.show(t("builder.toast.addOverlay", "Please add at least one overlay."), { isError: true });
      return;
    }

    if (selected === "products" && productItems.length === 0) {
      shopify?.toast?.show(t("builder.toast.selectProduct", "Please select at least one product."), { isError: true });
      setShowProductsError(true);
      setTimeout(() => {
        const element = document.getElementById("products-selection-section");
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    if (selected === "collections" && collectionItems.length === 0) {
      shopify?.toast?.show(t("builder.toast.selectCollection", "Please select at least one collection."), { isError: true });
      return;
    }

    let hasErrors = false;

    for (const offer of offers) {
      if (offer.type === "text") {
        const textVal = String(offer?.overlayData?.text || "").trim();
        if (!textVal) {
          newErrors[offer.id] = t("builder.errors.textRequired", "Please enter text for the text overlay.");
          hasErrors = true;
        }
      } else {
        const hasImage =
          offer?.overlayData?.image_url &&
          !(offer?.overlayData?.image_url instanceof File && offer?.overlayData?.image_url.name === "");
        if (!hasImage) {
          newErrors[offer.id] = t("builder.errors.imageRequired", "Please add an image for the image overlay.");
          hasErrors = true;
        }
      }
    }

    // Update error state
    setOfferErrors(newErrors);

    if (hasErrors) {
      // Auto-open the first overlay that has an error
      const firstErrorOfferId = Object.keys(newErrors)[0];
      if (firstErrorOfferId) {
        setOffers(prev =>
          prev.map(o => ({
            ...o,
            open: o.id === parseInt(firstErrorOfferId)
          }))
        );
        console.log("firstErrorOfferId", firstErrorOfferId);
        console.log("offers", offers);

        // Set as active
        const erroredOffer = offers.find(o => o.id === parseInt(firstErrorOfferId));
        if (erroredOffer) {
          setActiveOfferId(erroredOffer.id);
          if (erroredOffer.type === "text") {
            setTextOverlay(erroredOffer.overlayData || { ...DEFAULT_TEXT_CONFIG, type: "TEXT" });
            setTabSelected(1);
          } else {
            setImageOverlay(erroredOffer.overlayData || { ...DEFAULT_IMAGE_CONFIG, type: "IMAGE" });
            setTabSelected(2);
          }
        }

        // Scroll to the errored overlay
        setTimeout(() => {
          const element = document.querySelector(`[data-offer-id="${firstErrorOfferId}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }

      // Show a general toast
      const firstErrorMessage = newErrors[firstErrorOfferId] || t("builder.toast.fixErrors", "Please fix the errors in your overlay(s).");
      shopify?.toast?.show(firstErrorMessage, { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "save_overlay");
    formData.append("selection", selected || "all");
    formData.append("products", JSON.stringify(productItems));
    formData.append("collections", JSON.stringify(collectionItems));
    formData.append("overlay_group_id", overlayGroupId || "");
    formData.append("group_name", groupName || "");

    offers.forEach((offer) => {
      const offerId = offer.id || `${Date.now()}`;
      formData.append(`offer_json_${offerId}`, JSON.stringify(offer));
      if (offer?.overlayData?.image_url instanceof File) {
        formData.append(
          `offer_image_${offerId}`,
          offer.overlayData.image_url,
          offer.overlayData.image_url.name,
        );
      }
    });

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };
  const isSaving =
    fetcher.state !== "idle" &&
    fetcher?.formData?.get("actionType") === "save_overlay";

  const handleDiscard = () => {
    try { appBridge?.saveBar?.hide(saveBarId); } catch (e) { }
    setIsDirty(false);
    navigate("/app");
  };
  const handleBackClick = () => {
    if (isDirty) {
      const shopify = getShopify();
      shopify?.toast?.show(t("builder.toast.leaveWarning", "Save or discard changes before leaving."), { isError: true });
      return;
    }
    navigate("/app");
  };
  return (
    <div style={{ padding: 20 }}>
      <CommonModal
        open={updateStatusModal?.open}
        body={
          <p>
            {updateStatusModal.type === "image"
              ? t("builder.statusModal.bodyImage", "Are you sure to update status of this Image overlay?")
              : updateStatusModal.type === "text"
                ? t("builder.statusModal.bodyText", "Are you sure to update status of this text overlay?")
                : t("builder.statusModal.body", "Are you sure to update status of this overlay?")}
          </p>
        }
        modalTitle={t("builder.statusModal.title", "Update Status")}
        loader={loader === "update_status"}
        primaryName={t("builder.statusModal.confirm", "Update Status")}
        secondaryName={t("common.actions.cancel", "Cancel")}
        handleSaveButton={handleStatusUpdate}
        handleCloseButton={handleUpdateCloseModal}
      />
      <CommonModal
        open={deleteConfirmation.open}
        body={<p>{t("builder.deleteModal.body", "Are you sure you want to delete this overlay?")}</p>}
        modalTitle={t("builder.deleteModal.title", "Delete Overlay")}
        primaryName={t("common.actions.delete", "Delete")}
        primaryTone="critical"
        secondaryName={t("common.actions.cancel", "Cancel")}
        handleSaveButton={handleDeleteConfirm}
        handleCloseButton={handleDeleteCancel}
      />

      <Frame>
        {isNavigatingBack && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            aria-hidden="false"
            aria-busy="true"
            aria-label={t("common.loading", "Loading")}
          >
            <Spinner size="large" />
          </div>
        )}
        <SaveBar id={saveBarId} >
          <button
            type="button"
            variant="primary"
            onClick={handleSaveAll}
            disabled={!isDirty || offers.length === 0 || isSaving}
          >
            {t("common.actions.save", "Save")}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty || isSaving}
          >
            {t("common.actions.discard", "Discard")}
          </button>
        </SaveBar>
        <Page
          backAction={{ content: "Overlays", onAction: handleBackClick }}
          title={t("builder.form.manageOverlay", "Manage overlay")}
        >

          {showPublishCard && (
            <div className="success_card" style={{ marginBottom: '20px' }}>
              <Card padding="0">
                <div
                  style={{
                    background: "#177857",
                    color: "#fff",
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTopLeftRadius: "var(--p-border-radius-400)",
                    borderTopRightRadius: "var(--p-border-radius-400)",
                  }}
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckIcon} tone="inherit" />
                    <Text as="span" variant="bodyMd" fontWeight="medium" color="text-inverse">
                      {t("builder.publish.banner", "Overlay published!")}
                    </Text>
                  </InlineStack>
                  <span className="cursor-pointer" onClick={() => setShowPublishCard(false)}>
                    <Icon
                      tone="inherit"
                      source={XIcon}
                      accessibilityLabel={t("builder.publish.dismiss", "Dismiss overlay publish notice")}
                    />
                  </span>

                </div>
                <div style={{ padding: '20px' }}>
                  <InlineStack gap={600}>
                    <div style={{ maxWidth: '20%' }}>
                      <img
                        src="/Image/success_overlay.jpg"
                        alt="Overlay published"
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: '10px' }}
                      />
                    </div>

                    <BlockStack gap={400}>
                      <Text as="h3" variant="headingMd">
                        {t("builder.publish.title", "Is your overlay visible on your store?")}
                      </Text>
                      <Text as="p" tone="subdued">
                        {t("builder.publish.helpText", "If your overlay is not displayed on the product page or you want it in a different position, contact us.")}
                      </Text>
                      <InlineStack gap="200" align="start">
                        <Button
                          tone="primary"
                          variant="primary"
                          onClick={() => {
                            const shopify = getShopify();
                            shopify?.toast?.show(t("builder.toast.looksGreat", "Great! Overlay looks good."));
                            setShowPublishCard(false);
                          }}
                        >
                          {t("builder.publish.confirmYes", "Yes, perfect!")}
                        </Button>
                        <Button
                          tone="secondary"
                          variant="secondary"
                          onClick={() => {
                            if (window.$crisp) {
                              window.$crisp.push(['do', 'chat:open']);
                            }
                          }}
                        >
                          {t("builder.publish.confirmNo", "There are problems")}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                </div>
              </Card>
            </div>
          )}


          <Layout>

            {/*left layout section*/}
            <Layout.Section>
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 12, md: 12, lg: 12, xl: 12 }}>
                  <LegacyCard title={t("builder.form.overlayGroupTitle", "Overlay Group")} sectioned>
                    <BlockStack gap="300">
                      <TextField
                        label={t("builder.form.groupNameLabel", "Group name")}
                        value={groupName}
                        onChange={(val) => setGroupName(val)}
                        autoComplete="off"
                        placeholder={t("builder.form.groupNamePlaceholder", "e.g. Holiday Promo")}
                      />
                      <Text variant="headingSm" as="h6">
                        {t("builder.form.selectSource", "Select Source")}
                      </Text>
                      <RadioButton
                        label={
                          (initialData?.activePlan && initialData.activePlan.access_products !== 'UNLIMITED') ? (
                            <InlineStack gap="200" align="start" blockAlign="center"><Text>{t("builder.form.allProducts", "All Products")}</Text><Badge tone="info">{t("builder.form.allProductsBadge", "Plus Plan")}</Badge></InlineStack>
                          ) : t("builder.form.allProducts", "All Products")
                        }
                        checked={selected === "all"}
                        id="all"
                        name="overlay-type"
                        onChange={handleSelectAllProducts}
                        disabled={initialData?.activePlan && initialData.activePlan.access_products !== 'UNLIMITED'}
                      />

                      {/*<RadioButton*/}
                      {/*  label="Collections"*/}
                      {/*  checked={selected === "collections"}*/}
                      {/*  id="collections"*/}
                      {/*  name="overlay-type"*/}
                      {/*  onChange={() => setSelected("collections")}*/}
                      {/*/>*/}

                      {/*{selected === "collections" && (*/}
                      {/*  <InlineStack gap="200">*/}
                      {/*    <Button fullWidth onClick={openPicker}>*/}
                      {/*      {collectionItems.length > 0*/}
                      {/*        ? `(${collectionItems.length}) Selected`*/}
                      {/*        : "Select"}*/}
                      {/*    </Button>*/}
                      {/*  </InlineStack>*/}
                      {/*)}*/}


                      <div id="products-selection-section" style={{
                        border: showProductsError ? '2px solid var(--p-color-border-critical)' : 'none',
                        borderRadius: 'var(--p-border-radius-200)',
                        padding: showProductsError ? '4px' : '0'
                      }}>
                        <InlineStack gap="200" align="space-between">
                          <RadioButton
                            label={t("builder.form.products", "Products")}
                            checked={selected === "products"}
                            id="products"
                            name="overlay-type"
                            onChange={() => {
                              handleSelectProducts();
                              setShowProductsError(false);
                            }}
                          />
                          {selected === "products" && (
                            <Button onClick={() => {
                              openPicker();
                              setShowProductsError(false);
                            }}>
                              {productItems.length > 0
                                ? (productItems.length > 1
                                  ? t("builder.form.productsSelectedPlural", "{{count}} products selected", { count: productItems.length })
                                  : t("builder.form.productsSelected", "{{count}} product selected", { count: productItems.length }))
                                : t("builder.form.selectProducts", "Select Products")}
                            </Button>
                          )}
                        </InlineStack>
                      </div>
                      {selected === "products" && (
                        <div style={{ marginTop: "12px", border: "1px solid #E1E3E5", borderRadius: 8, padding: "12px" }}>
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="headingSm" as="h6">{t("builder.form.productListHeading", "Product(s)")}</Text>
                            <Badge tone="success">
                              {t("builder.form.productListSelectedBadge", "{{count}} selected", { count: productItems.length })}
                            </Badge>
                          </InlineStack>
                          <div style={{ marginTop: 8 }}>
                            <TextField
                              label=""
                              labelHidden
                              placeholder={t("builder.form.searchProducts", "Search products")}
                              autoComplete="off"
                              value={productSearch}
                              onChange={setProductSearch}
                            />
                          </div>
                          <div
                            style={{
                              marginTop: 12,
                              maxHeight: 250,
                              overflowY: "auto",
                              borderTop: "1px solid #F1F2F3",
                            }}
                          >
                            {filteredProducts.length === 0 ? (
                              <div style={{ padding: "12px 0" }}>
                                <Text tone="subdued" variant="bodySm">
                                  {t("builder.preview.noProducts", "No products selected")}
                                </Text>
                              </div>
                            ) : (
                              filteredProducts.map((product) => {
                                const adminUrl = adminProductUrl ? adminProductUrl(product.id) : null;
                                const productPreviewUrl = buildProductPreviewUrl(product);
                                const productPreviewDisabled = !overlayGroupId || !productPreviewUrl;
                                const productPreviewTooltip = !overlayGroupId
                                  ? t("builder.preview.tooltip.saveFirst", "Preview is disabled until you save your overlay changes.")
                                  : productPreviewUrl
                                    ? t("builder.preview.tooltip.open", "Preview overlay on storefront")
                                    : t("builder.preview.tooltip.noHandle", "No product handle available to preview");
                                return (
                                  <div
                                    key={product.id}
                                    style={{
                                      padding: "10px 0",
                                      borderBottom: "1px solid #F4F5F6",
                                    }}
                                  >
                                    <InlineStack align="space-between" blockAlign="center" gap="200">
                                      <InlineStack gap="200" blockAlign="center">
                                        <div
                                          style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: 8,
                                            overflow: "hidden",
                                            background: "#F6F6F7",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <img
                                            alt={product.title || product.id}
                                            src={thumbShopifyImage(product.image || placeholderImage, "_80x80")}
                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            onError={(e) => { e.currentTarget.src = placeholderImage; }}
                                          />
                                        </div>
                                        {adminUrl ? (
                                          <Link onClick={() => window.open(adminUrl, "_blank", "noopener")} removeUnderline>
                                            {product.title || product.id}
                                          </Link>
                                        ) : (
                                          <Text variant="bodyMd">{product.title || product.id}</Text>
                                        )}
                                      </InlineStack>
                                      <InlineStack gap="50" blockAlign="center">
                                        <Tooltip content={productPreviewTooltip}>
                                          <span style={{ display: "inline-flex" }}>
                                            <Button
                                              size="micro"
                                              icon={ViewIcon}
                                              variant="plain"
                                              disabled={productPreviewDisabled}
                                              onClick={() => handleProductPreviewClick(product)}
                                              accessibilityLabel={t("builder.form.productPreviewTooltip", "Preview this product on storefront")}
                                            />
                                          </span>
                                        </Tooltip>
                                        <Button
                                          size="micro"
                                          icon={XIcon}
                                          variant="plain"
                                          onClick={() => handleRemoveProduct(product.id)}
                                        />
                                      </InlineStack>
                                    </InlineStack>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                    </BlockStack>
                  </LegacyCard>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 12, md: 12, lg: 12, xl: 12 }}>
                  <LegacyCard title={t("builder.form.createOverlayTitle", "Create Overlay")} sectioned>
                    <InlineGrid gap="400" columns={2}>
                      <Button
                        variant="primary"
                        fullWidth
                        onClick={() => {
                          setTabSelected(1);
                          createOffer("text");

                        }}
                      >
                        {t("builder.form.createTextOverlay", "Text Overlay")}
                      </Button>

                      <Button
                        variant="primary"
                        fullWidth
                        onClick={() => {
                          setTabSelected(2);
                          createOffer("image");

                        }}
                      >
                        {t("builder.form.createImageOverlay", "Image Overlay")}
                      </Button>
                    </InlineGrid>

                  </LegacyCard>
                </Grid.Cell>
              </Grid>

              <div style={{ marginTop: "16px" }}>
                {offers.map((offer, index) => (
                  <LegacyCard sectioned>
                    <div key={offer.id} data-offer-id={offer.id}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10xp",
                          cursor: "pointer"
                        }}
                        onClick={() => {
                          setActiveOfferId(offer.id);
                          setTabSelected(offer.type === "text" ? 1 : 2);
                          if (offer.type === "text") {
                            setTextOverlay(offer.overlayData || { ...DEFAULT_TEXT_CONFIG, type: "TEXT" });
                          } else {
                            setImageOverlay(offer.overlayData || { ...DEFAULT_IMAGE_CONFIG, type: "IMAGE" });
                          }

                          setOffers((prev) =>
                            prev.map((o) =>
                              o.id === offer.id ? { ...o, open: !o.open } : { ...o, open: false },
                            ),
                          );
                        }}
                      >
                        <InlineStack blockAlign="center" gap="300" align="start">
                          <div
                          >
                            <Icon
                              source={offer.open ? ChevronUpIcon : ChevronDownIcon}
                            />
                          </div>

                          <Text as="h3" variant="bodyLg">
                            {offer.type === "text" ? "Text Overlay" : "Image Overlay"}
                          </Text>
                          <Badge
                            tone={
                              (offer?.overlayData?.status || "Active") === "Active"
                                ? "success"
                                : "warning"
                            }
                          >
                            {(offer?.overlayData?.status || "Active") === "Active"
                              ? t("common.status.active", "Active")
                              : t("common.status.inactive", "Inactive")}
                          </Badge>
                        </InlineStack>

                        <InlineStack gap="200" blockAlign="center">
                          <label className="switch micro chart-filter" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={(offer?.overlayData?.status || "Active") === "Active"}
                              onChange={(e) => {
                                e.stopPropagation();
                                const currentStatus = offer?.overlayData?.status || "Active";
                                if (offer?.overlayData?.id) {
                                  setUpdateStatusModal({
                                    open: true,
                                    id: offer.overlayData.id,
                                    status: currentStatus,
                                    type: offer.type,
                                  });
                                } else {
                                  const nextStatus = currentStatus === "Active" ? "Inactive" : "Active";
                                  setOffers((prev) =>
                                    prev.map((o) =>
                                      o.id === offer.id
                                        ? {
                                          ...o,
                                          overlayData: { ...(o.overlayData || {}), status: nextStatus },
                                        }
                                        : o,
                                    ),
                                  );
                                }
                              }}
                            />
                            <span className="slider round" />
                          </label>
                          {offers.length > 1 && (
                            <div
                              style={{ cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmation({ open: true, id: offer.id });
                              }}
                            >
                              <Icon source={DeleteIcon} tone="critical" />
                            </div>
                          )}
                        </InlineStack>
                      </div>

                      {offer.open && (
                        <div style={{ padding: "16px" }}>
                          {offer.type === "text" && renderTextOverlaySection()}
                          {offer.type === "image" && renderImageOverlaySection()}
                        </div>
                      )}
                    </div>
                  </LegacyCard>
                ))}
              </div>
            </Layout.Section>

            {/*right layout section*/}
            <Layout.Section variant="oneThird">
              <div className="sticky-section">
                <div className="translation_selector">
                  <Select
                    label={t("builder.preview.previewLanguage", "Preview language")}
                    labelHidden
                    options={previewLocaleOptions}
                    value={selectedPreviewLocale}
                    onChange={setSelectedPreviewLocale}
                  />
                </div>
                <LegacyCard sectioned>
                  <BlockStack gap="200" padding="400">
                    <Text variant="headingSm" as="h6">
                      {t("builder.preview.selectProduct", "Select Product For Preview")}
                    </Text>
                    <Select
                      label=""
                      labelHidden
                      options={
                        selected === "all"
                          ? (previewProducts.length
                            ? previewProducts.map((p) => ({ label: p.title || p.id, value: p.id }))
                            : [{ label: t("builder.preview.loading", "Loading..."), value: "" }])
                          : productItems.length
                            ? productItems.map((p) => ({ label: p.title || p.id, value: p.id }))
                            : [{ label: t("builder.preview.noProducts", "No products selected"), value: "" }]
                      }
                      value={selectedPreviewId}
                      onChange={(value) => {
                        setSelectedPreviewId(value);
                        const match =
                          (selected === "all" ? previewProducts : productItems)?.find((p) => p.id === value);
                        setProdImage(match?.image || match?.images?.[0]?.originalSrc || placeholderImage);
                      }}
                      placeholder={
                        selected === "all"
                          ? t("builder.preview.placeholderAll", "All products")
                          : t("builder.preview.placeholderSelected", "Selected products")
                      }
                    />
                    <Text as="span" tone="subdued" variant="bodySm">
                      {t("builder.preview.note", "For preview display only.")}
                    </Text>
                  </BlockStack>
                </LegacyCard>
                <LegacyCard sectioned>
                  <div style={{ marginBottom: '10px' }}>
                    <InlineStack gap="50" blockAlign="center">
                      <p className="Polaris-Text--root Polaris-Text--headingSm">
                        {t("builder.preview.title", "Preview")}
                      </p>
                      <Tooltip content={previewTooltip} preferredPosition="above">
                        <Button
                          icon={ViewIcon}
                          variant="plain"
                          size="slim"
                          disabled={previewDisabled}
                          onClick={handlePreviewClick}
                          accessibilityLabel={t("builder.preview.tooltip.open", "Preview overlay on storefront")}
                        >
                        </Button>
                      </Tooltip>
                    </InlineStack>
                  </div>

                  <style>
                    {`
                    @keyframes skeleton-loading {
                      0% {
                        background-position: 200% 0;
                      }
                      100% {
                        background-position: -200% 0;
                      }
                    }
                  `}
                  </style>

                  <div style={{ position: 'relative' }}>
                    <img
                      src={getLocalImageSrc(prodImage || placeholderImage)}
                      id="overlayImageBase"
                      style={{ width: "100%", height: "100%", display: 'block' }}
                      onError={() => setProdImage(placeholderImage)}
                    />

                    {previewOverlays.map((overlay, index) => {
                      const resolvedText =
                        selectedPreviewLocale
                          ? (overlay?.translations?.[selectedPreviewLocale] || overlay.text)
                          : overlay.text;
                      return (
                        <div
                          key={index}
                          className={overlay.type === 'TEXT' ? `text-data-overlay` : 'tata-image-overly'}
                          style={{ ...getPositionStyles(overlay) }}
                        >
                          {overlay.type === 'TEXT' ? (
                            resolvedText
                          ) : overlay.type === 'IMAGE' && overlay.image_url && (
                            <img
                              src={getLocalImageSrc(overlay?.image_url)}
                              alt="Overlay 2"
                              style={{
                                maxWidth:
                                  overlay?.scale_in_product > 0
                                    ? `${overlay?.scale_in_product}%`
                                    : '100%',
                                maxHeight: '100%',
                                width: '100%',
                                objectFit: 'contain',
                                borderRadius: overlay?.border_radius ? `${overlay.border_radius}px` : undefined
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                </LegacyCard>
                <div style={{ marginTop: "16px" }}>
                  <InlineStack align="end" gap="100">
                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        onClick={handleSaveAll}
                        loading={isSaving}
                        disabled={offers.length === 0 || isSaving}
                      >
                        {t("common.actions.save", "Save")}
                      </Button>
                      <Button onClick={handleDiscard}>{t("common.actions.discard", "Discard")}</Button>
                    </InlineStack>
                  </InlineStack>
                </div>
              </div>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    </div>
  );
}
