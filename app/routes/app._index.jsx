import {
  useLoaderData,
  useNavigate,
  useFetcher,
  useNavigation,
  Link as RemixLink,
} from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Box,
  Button,
  Card,
  InlineStack,
  Text,
  Page,
  IndexTable,
  Banner,
  Modal,
  EmptySearchResult,
  Pagination,
  Badge,
  Icon,
  TextField,
  Select,
  Tag, InlineGrid, BlockStack, ProgressBar,
} from '@shopify/polaris';
import {
  EditIcon,
  DeleteIcon,
  ProductIcon,
  ProductListIcon,
  SearchIcon,
  SearchRecentIcon
} from '@shopify/polaris-icons';
import React, { useState, useEffect, useMemo } from "react";
import { authenticate, apiVersion } from "../shopify.server";
import prisma from "../db.server";
import { useI18n } from "../i18n";
import { CommonModal } from "../component/CommonModal";
import { syncOverlaysToMetafields, getAppMetafield, upsertAppMetafield } from "../utils/metafields.server";

const fetchThemeSettingsData = async (session) => {
  if (!session?.shop || !session?.accessToken) {
    return null;
  }

  const baseUrl = `https://${session.shop}/admin/api/${apiVersion}`;
  const headers = {
    "X-Shopify-Access-Token": session.accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    const themeResponse = await fetch(`${baseUrl}/themes.json?fields=id,role`, {
      headers,
    });
    if (!themeResponse.ok) {
      throw new Error(
        `Failed to fetch themes: ${themeResponse.status} ${themeResponse.statusText}`,
      );
    }
    const themesPayload = await themeResponse.json();
    const mainThemeId = themesPayload?.themes?.find(
      (theme) => theme.role === "main",
    )?.id;
    if (!mainThemeId) {
      return null;
    }

    const assetResponse = await fetch(
      `${baseUrl}/themes/${mainThemeId}/assets.json?asset[key]=config/settings_data.json`,
      { headers },
    );
    if (!assetResponse.ok) {
      throw new Error(
        `Failed to fetch settings_data: ${assetResponse.status} ${assetResponse.statusText}`,
      );
    }
    const assetPayload = await assetResponse.json();
    const settingsValue = assetPayload?.asset?.value;
    if (!settingsValue) {
      return null;
    }

    return JSON.parse(settingsValue);
  } catch (error) {
    console.error("Error fetching theme settings data:", error);
    return null;
  }
};

const isThemeEmbedEnabled = (settingsData, extensionUuid) => {
  if (!settingsData || !extensionUuid) {
    return false;
  }

  const blocks = settingsData?.current?.blocks;
  if (!blocks) {
    return false;
  }

  return Object.values(blocks).some(
    (block) =>
      block?.type?.includes(extensionUuid) && block?.disabled !== true,
  );
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const themeExtensionId = process.env.SHOPIFY_THEME_EXTENSION_ID || "";

  // Sync existing overlays to app metafields on first app open (if metafield doesn't exist)
  try {
    await syncOverlaysToMetafields(admin, session.shop, prisma);
  } catch (error) {
    console.error('[App Index] Error syncing overlays to metafields:', error);
    // Don't fail the page load if sync fails
  }

  // Parallelize database queries
  const [overlays, activePlan] = await Promise.all([
    prisma.product_overlays.findMany({
      where: { shop_id: session?.shop },
      include: { overlay_targets: true },
      orderBy: { id: "desc" },
      take: 100,
    }),
    prisma.shop_plans.findFirst({
      where: {
        shop: session?.shop,
        status: 'Active',
      },
    })
  ]);

  // Derive activeUniqueProductIds from the overlays we already fetched
  const uniqueIds = new Set();
  overlays.filter(ov => ov.status === "Active").forEach(ov => {
    if (ov.product_id && ov.product_id !== 'ALL_PRODUCTS') uniqueIds.add(ov.product_id);
    ov.overlay_targets && ov.overlay_targets.forEach(t => {
      if (t.target_id) uniqueIds.add(t.target_id);
    });
  });
  const activeUniqueProductIds = Array.from(uniqueIds);

  const groupMap = new Map();
  overlays.forEach((ov) => {
    const groupId = ov.overlay_group_id || `legacy-${ov.id}`;
    const displayId = ov.group_name
      ? ov.group_name
      : groupId.startsWith("legacy-")
        ? `Overlay-${groupId.replace("legacy-", "")}`
        : groupId.startsWith("Overlay-")
          ? groupId
          : `Overlay-${groupId}`;
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { groupId, displayId, overlays: [], groupName: ov.group_name || "" });
    } else if (!groupMap.get(groupId).groupName && ov.group_name) {
      const existing = groupMap.get(groupId);
      groupMap.set(groupId, { ...existing, groupName: ov.group_name });
    }
    groupMap.get(groupId).overlays.push(ov);
  });

  const overlayGroups = Array.from(groupMap.values()).map((group) => {
    const scopes = new Set();
    const targets = [];
    let isAllProducts = false;

    group.overlays.forEach((ov) => {
      if (ov.product_id) {
        if (ov.product_id === "ALL_PRODUCTS") {
          scopes.add("ALL_PRODUCTS");
          isAllProducts = true;
        } else {
          scopes.add("PRODUCT");
          targets.push({
            id: ov.product_id,
            handle: ov.product_handle || null,
          });
        }
      }

      (ov.overlay_targets || []).forEach((t) => {
        scopes.add(t.scope);
        if (t.scope === "ALL_PRODUCTS") {
          isAllProducts = true;
        }
        if (t.target_id) {
          targets.push({
            id: t.target_id,
            handle: t.target_handle || ov.product_handle || null,
          });
        }
      });
    });

    const dedupedTargets = [];
    const seen = new Set();
    targets.forEach((t) => {
      const key = t.id || t.handle;
      if (!key || seen.has(key)) return;
      seen.add(key);
      dedupedTargets.push(t);
    });

    const isActiveGroup = group.overlays.some(
      (o) => String(o.status || "").toLowerCase() === "active",
    );

    return {
      groupId: group.groupId,
      displayId: group.displayId,
      groupName: group.groupName || "",
      count: group.overlays.length,
      isActive: isActiveGroup,
      isAllProducts,
      targets: dedupedTargets,
      targetCount: dedupedTargets.length,
      createdAt: group.overlays[0]?.created_at || null,
    };
  });

  const embedEnabled = false; // Initial state, will be updated by client-side check if needed
  const themeEditorUr = `https://${session.shop}/admin/themes/current/editor?context=apps&activateAppId=${process.env.SHOPIFY_API_KEY}/easy-overlay`;

  return {
    activeUniqueProductIds,
    overlayGroups,
    activePlan,
    isThemeEmbedEnabled: embedEnabled,
    themeEditorUr,
    sessionData: {
      shop: session.shop,
      accessToken: session.accessToken
    }
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const deleteGroupId = formData.get("deleteGroupId");
  const actionType = formData.get("actionType");

  if (actionType === "checkEmbed") {
    const settingsData = await fetchThemeSettingsData(session);
    const themeExtensionId = process.env.SHOPIFY_THEME_EXTENSION_ID || "";
    const enabled = isThemeEmbedEnabled(settingsData, themeExtensionId);
    return json({ isThemeEmbedEnabled: enabled });
  }

  if (deleteGroupId) {
    // 1. Get IDs of overlays to be deleted
    const overlaysToDelete = await prisma.product_overlays.findMany({
      where: { shop_id: session?.shop, overlay_group_id: deleteGroupId },
      select: { id: true }
    });
    const deletedOverlayIds = new Set(overlaysToDelete.map(o => o.id));

    // 2. Delete from DB
    await prisma.product_overlays.deleteMany({
      where: { shop_id: session?.shop, overlay_group_id: deleteGroupId },
    });

    // 3. Cleanup Metafields
    try {
      const allOverlays = await getAppMetafield(admin, 'all_overlays') || {};
      let hasChanges = false;

      Object.keys(allOverlays).forEach(key => {
        const productConfig = allOverlays[key];
        if (productConfig && Array.isArray(productConfig.overlays)) {
          const originalLength = productConfig.overlays.length;
          const newOverlays = productConfig.overlays.filter(o => !deletedOverlayIds.has(o.overlay_id));

          if (newOverlays.length !== originalLength) {
            hasChanges = true;
            if (newOverlays.length === 0) {
              delete allOverlays[key];
            } else {
              productConfig.overlays = newOverlays;
            }
          }
        }
      });

      if (hasChanges) {
        await upsertAppMetafield(admin, 'all_overlays', allOverlays);
      }
    } catch (err) {
      console.error("Error cleaning up metafields after delete:", err);
    }

    return json({ deleted: true, deleteGroupId });
  }

  if (actionType === "update_group_status") {
    const groupId = formData.get("groupId");
    const newStatus = formData.get("newStatus");
    if (groupId) {
      const isLegacy = groupId.startsWith("legacy-");
      const legacyId = isLegacy ? parseInt(groupId.replace("legacy-", ""), 10) : null;
      const targetWhere = isLegacy ? { id: legacyId } : { overlay_group_id: groupId };

      if (newStatus === "Active") {
        const activePlan = await prisma.shop_plans.findFirst({
          where: { shop: session.shop, status: 'Active' },
        });

        if (activePlan && activePlan.access_products !== 'UNLIMITED') {
          const allowedCount = parseInt(activePlan.access_products, 10);

          // 1. Get products in the group we want to activate
          const targetOverlays = await prisma.product_overlays.findMany({
            where: { shop_id: session.shop, ...targetWhere },
            include: { overlay_targets: true }
          });

          const groupProductIds = new Set();
          let targetIsAllProducts = false;
          for (const ov of targetOverlays) {
            if (ov.product_id === 'ALL_PRODUCTS') targetIsAllProducts = true;
            else if (ov.product_id) groupProductIds.add(ov.product_id);

            ov.overlay_targets?.forEach(t => {
              if (t.scope === 'ALL_PRODUCTS') targetIsAllProducts = true;
              if (t.target_id) groupProductIds.add(t.target_id);
            });
          }

          if (targetIsAllProducts) {
            return json({ success: false, error: "Cannot activate 'All Products' overlay on the Free plan." }, { status: 403 });
          }

          // 2. Get active products from OTHER groups
          const otherActiveOverlays = await prisma.product_overlays.findMany({
            where: {
              shop_id: session.shop,
              status: 'Active',
              NOT: isLegacy ? { id: legacyId } : { overlay_group_id: groupId }
            },
            include: { overlay_targets: true }
          });

          const activeGlobalIds = new Set();
          for (const ov of otherActiveOverlays) {
            if (ov.product_id && ov.product_id !== 'ALL_PRODUCTS') activeGlobalIds.add(ov.product_id);
            ov.overlay_targets?.forEach(t => {
              if (t.target_id) activeGlobalIds.add(t.target_id);
            });
          }

          // 3. Combined unique check
          for (const id of groupProductIds) {
            activeGlobalIds.add(id);
          }

          if (activeGlobalIds.size > allowedCount) {
            return json({
              success: false,
              error: `Product limit reached(3). Please upgrade to activate more overlays.`
            }, { status: 403 });
          }
        }
      }

      await prisma.product_overlays.updateMany({
        where: { shop_id: session?.shop, ...targetWhere },
        data: { status: newStatus },
      });
      return json({ statusUpdated: true, groupId, newStatus });
    }
  }

  return json({});
};

export default function Home() {
  const initialData = useLoaderData();
  const { t } = useI18n();
  const [redirectUrl, setRedirectUrl] = useState(initialData.themeEditorUr);
  const [activePlan, setActivePlan] = useState(initialData.activePlan);
  const [overlayGroups, setOverlayGroups] = useState(initialData?.overlayGroups || []);
  const [deleteTargetGroup, setDeleteTargetGroup] = useState(null);
  const fetcher = useFetcher();
  const isDeletingGroup =
    fetcher.state !== "idle" &&
    !!(fetcher.formData && fetcher.formData.get("deleteGroupId"));
  const isUpdatingStatus =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("actionType") === "update_group_status";
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isNavigatingToNewOverlay =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/app/new_overlay";
  const [uniqueProductIds, setUniqueProductIds] = useState([]); // Store unique product IDs
  const [isAppEmbedEnabled, setIsAppEmbedEnabled] = useState(initialData?.isThemeEmbedEnabled);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updateStatusModal, setUpdateStatusModal] = useState({ open: false, groupId: "", status: "", groupName: "" });

  const filteredGroups = useMemo(() => {
    let data = overlayGroups || [];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.filter((g) => {
        const name = (g.groupName || g.displayId || "").toLowerCase();
        return name.includes(term);
      });
    }
    if (statusFilter === "active") {
      data = data.filter((g) => g.isActive);
    } else if (statusFilter === "inactive") {
      data = data.filter((g) => !g.isActive);
    }
    return data;
  }, [overlayGroups, searchTerm, statusFilter]);

  const totalItems = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (page > totalPages) setPage(totalPages);

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, page, pageSize]);

  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalItems);
  const hasFiltersApplied = searchTerm.trim() || statusFilter !== "all";

  // Set uniqueProductIds on initial load
  useEffect(() => {
    if (initialData?.activeUniqueProductIds) {
      setUniqueProductIds(initialData.activeUniqueProductIds);
    }
  }, [initialData?.activeUniqueProductIds]);

  // Client-side check for theme embed status to speed up initial page load
  useEffect(() => {
    const formData = new FormData();
    formData.append("actionType", "checkEmbed");
    fetcher.submit(formData, { method: "post" });
  }, []);

  useEffect(() => {
    if (fetcher.data && fetcher.data.isThemeEmbedEnabled !== undefined) {
      setIsAppEmbedEnabled(fetcher.data.isThemeEmbedEnabled);
    }
  }, [fetcher.data]);

  const [loadingImportExport, setLoadingImportExport] = useState(false);

  // Update state when fetcher returns new data
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.deleted && fetcher.data.deleteGroupId) {
        setOverlayGroups((prev) =>
          (prev || []).filter((g) => g.groupId !== fetcher.data.deleteGroupId),
        );
        setDeleteTargetGroup(null);
        return;
      }
      if (fetcher.data.statusUpdated) {
        setOverlayGroups((prev) =>
          (prev || []).map((g) =>
            g.groupId === fetcher.data.groupId ? { ...g, isActive: fetcher.data.newStatus === "Active" } : g
          ),
        );
        setUpdateStatusModal({ open: false, groupId: "", status: "", groupName: "" });
        return;
      }
      if (fetcher.data.success === false && fetcher.data.error) {
        if (typeof window !== "undefined" && window.shopify) {
          window.shopify.toast.show(fetcher.data.error, { isError: true });
        }
        setUpdateStatusModal({ open: false, groupId: "", status: "", groupName: "" });
        return;
      }
    }
  }, [fetcher.data, fetcher.state]);
  const overlayResourceName = useMemo(() => ({
    singular: t("common.resources.overlay", "overlay"),
    plural: t("common.resources.overlays", "overlays"),
  }), [t]);

  const handleInstallApp = async () => {
    window.open(redirectUrl, "_blank");
  }

  const handleUpdateCloseModal = () => {
    setUpdateStatusModal({ open: false, groupId: "", status: "", groupName: "" });
  };

  const handleStatusUpdate = () => {
    if (!updateStatusModal.groupId) return;
    const formData = new FormData();
    formData.append("actionType", "update_group_status");
    formData.append("groupId", updateStatusModal.groupId);
    formData.append("newStatus", updateStatusModal.status === "Active" ? "Inactive" : "Active");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <CommonModal
        open={updateStatusModal.open}
        body={
          <p>
            {t("home.statusModal.body", "Are you sure you want to update the status of the '{{groupName}}' overlay group?", { groupName: updateStatusModal.groupName })}
          </p>
        }
        modalTitle={t("home.statusModal.title", "Update Status")}
        loader={isUpdatingStatus}
        primaryName={t("builder.statusModal.confirm", "Update Status")}
        secondaryName={t("common.actions.cancel", "Cancel")}
        handleSaveButton={handleStatusUpdate}
        handleCloseButton={handleUpdateCloseModal}
      />
      {activePlan && activePlan.access_products !== 'UNLIMITED' && (
        <div style={{ marginBottom: "1rem" }}>
          <Card padding="400">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Box>
                    <Badge tone="info">{t("home.plan.freeBadge", "Free Plan")}</Badge>
                  </Box>
                  <div style={{ width: "150px" }}>
                    <div style={{ height: "4px", overflow: "hidden", borderRadius: "2px" }}>
                      <ProgressBar
                        progress={Math.min((uniqueProductIds.length / parseInt(activePlan.access_products)) * 100, 100)}
                        tone="primary"
                      />
                    </div>
                  </div>
                  <Text variant="bodySm" fontWeight="medium" tone="subdued">
                    {uniqueProductIds.length}/{parseInt(activePlan.access_products)} {t("home.plan.productsUsedLabel", "products used")}
                  </Text>
                </InlineStack>
                <Button variant="primary" size="slim" onClick={() => navigate("/app/plan")}>
                  {t("common.actions.upgradePlan", "Upgrade Plan")}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </div>
      )}

      <Box paddingBlockEnd="300">
        <Card>
          <Modal
            open={!!deleteTargetGroup}
            onClose={() => setDeleteTargetGroup(null)}
            title={t("home.modal.deleteTitle", "Delete overlay group?")}
            primaryAction={{
              destructive: true,
              content: t("common.actions.delete", "Delete"),
              loading: isDeletingGroup,
              disabled: isDeletingGroup,
              onAction: () => {
                if (!deleteTargetGroup) return;
                const formData = new FormData();
                formData.append("deleteGroupId", deleteTargetGroup);
                fetcher.submit(formData, { method: "post" });
              },
            }}
            secondaryActions={[
              {
                content: t("common.actions.cancel", "Cancel"),
                disabled: isDeletingGroup,
                onAction: () => setDeleteTargetGroup(null),
              },
            ]}
          >
            <Modal.Section>
              <Text as="p">{t("home.modal.deleteBody", "Are you sure you want to delete this overlay group? This cannot be undone.")}</Text>
            </Modal.Section>
          </Modal>
          <Box padding="100">
            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" variant="headingLg" fontWeight="bold">
                {t("home.table.heading", "Overlays")}
              </Text>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: '8px' }}>
                <RemixLink
                  to="/app/new_overlay"
                  prefetch="intent"
                  style={{ textDecoration: "none" }}
                  onClick={(e) => {
                    if (activePlan && activePlan.access_products !== 'UNLIMITED') {
                      const limit = parseInt(activePlan.access_products, 10);
                      if (uniqueProductIds.length >= limit) {
                        e.preventDefault();
                        if (window.shopify) {
                          window.shopify.toast.show(
                            `Free plan product limit (${limit}) is reached.`,
                            { isError: true }
                          );
                        }
                      }
                    }
                  }}
                >
                  <Button
                    variant="primary"
                    loading={isNavigatingToNewOverlay}
                    disabled={isNavigatingToNewOverlay}
                  >
                    {t("common.actions.createOverlay", "Create Overlay")}
                  </Button>
                </RemixLink>
              </div>
            </InlineStack>

            <Box>
              <BlockStack gap="300" inlineAlign="start">
                {
                  hasFiltersApplied && (
                    <Box paddingBlock="200">
                      <InlineStack gap="300" blockAlign="center">
                        {statusFilter !== 'all' && (
                          <Tag onRemove={() => {
                            setStatusFilter('all');
                            setPage(1);
                          }}>
                            {t("home.filters.statusLabel", "Status")}: {statusFilter === 'active'
                              ? t("common.status.active", "Active")
                              : t("common.status.inactive", "Inactive")}
                          </Tag>
                        )}
                        {searchTerm.trim() && (
                          <Tag onRemove={() => {
                            setSearchTerm('');
                            setPage(1);
                          }}>
                            {t("home.filters.searchPlaceholder", "Search by group name")}: {searchTerm}
                          </Tag>
                        )}
                        {hasFiltersApplied && (
                          <Button variant="plain" size="slim" onClick={() => {
                            setSearchTerm('');
                            setStatusFilter('all');
                            setPage(1);
                          }}>
                            {t("common.actions.clearAll", "Clear all")}
                          </Button>
                        )}
                      </InlineStack>
                    </Box>
                  )
                }
              </BlockStack>
            </Box>
            <Box paddingBlock="200">
              <InlineGrid columns={['twoThirds', 'oneThird']} gap="300">
                <TextField
                  label={t("home.filters.searchPlaceholder", "Search by group name")}
                  placeholder={t("home.filters.searchPlaceholder", "Search by group name")}
                  value={searchTerm}
                  onChange={(val) => {
                    setSearchTerm(val);
                    setPage(1);
                  }}
                  autoComplete="off"
                  prefix={<Icon
                    source={SearchIcon}
                    tone="base"
                  />}
                />
                <Select
                  label={t("home.filters.statusLabel", "Status")}
                  options={[
                    { label: t("common.status.all", "All"), value: "all" },
                    { label: t("common.status.active", "Active"), value: "active" },
                    { label: t("common.status.inactive", "Inactive"), value: "inactive" },
                  ]}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                />
              </InlineGrid>
            </Box>
          </Box>
          <Card padding={0}>
            <IndexTable
              resourceName={overlayResourceName}
              itemCount={overlayGroups.length}
              selectable={false}
              headings={[
                { title: "" },
                { title: <Text fontWeight="bold">{t("home.table.group", "Group")}</Text> },
                { title: <Text fontWeight="bold">{t("home.table.targets", "Targets")}</Text> },
                { title: <Text fontWeight="bold" alignment="end">{t("home.table.status", "Status")}</Text> },
                {
                  title: <Text fontWeight="bold">{t("home.table.action", "Action")}</Text>,
                  alignment: 'end',
                },
              ]}
              emptyState={
                <EmptySearchResult
                  title={t("common.table.noResultsTitle", "No overlays yet")}
                  description={t("common.table.noResultsDesc", "Create new overlays for your store")}
                  withIllustration
                />
              }
            >
              {paginatedGroups.map((group, index) => {
                const targetCount = group.targets?.length || 0;
                const hasMultipleTargets = group.isAllProducts || targetCount > 1;
                const iconSource = hasMultipleTargets ? ProductListIcon : ProductIcon;

                // IMPORTANT: IndexTable `position` should be the absolute position, not page-local
                const absoluteIndex = (page - 1) * pageSize + index;

                return (
                  <IndexTable.Row
                    id={group.groupId}
                    key={group.groupId}
                    position={absoluteIndex}
                    onClick={() => {
                      navigate(`/app/new_overlay?groupId=${encodeURIComponent(group.groupId)}`);
                    }}
                    rowType="data"
                    hoverable
                    selectionDisabled
                    style={{ cursor: "pointer" }}
                  >
                    <IndexTable.Cell>
                      <div style={{ padding: '17px 0' }}>
                        <Icon source={iconSource} />
                      </div>
                    </IndexTable.Cell>

                    <IndexTable.Cell>
                      <div style={{ padding: '17px 0', minWidth: "280px" }}>
                        <Text variant="bodyMd" fontWeight="medium">
                          {group.groupName
                            ? group.groupName
                            : t("home.table.fallbackName", "Overlay {{index}}", { index: absoluteIndex + 1 })}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    <IndexTable.Cell>
                      <div style={{ padding: '17px 0', minWidth: "120px" }}>

                        <InlineStack gap="200" wrap>
                          {group.isAllProducts ? (
                            <Text variant="bodySm" tone="subdued">
                              {t("common.targets.allProducts", "All products")}
                            </Text>
                          ) : (
                            <Text variant="bodySm">
                              {targetCount === 1
                                ? t("common.targets.products", "{{count}} product", { count: targetCount })
                                : t("common.targets.productsPlural", "{{count}} products", { count: targetCount })}
                            </Text>
                          )}
                        </InlineStack>
                      </div>
                    </IndexTable.Cell>

                    <IndexTable.Cell>
                      <div style={{
                        padding: "17px 0",
                        display: "flex",
                        justifyContent: "flex-end",
                        minWidth: "70px"
                      }}>
                        <div
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setUpdateStatusModal({
                              open: true,
                              groupId: group.groupId,
                              status: group.isActive ? "Active" : "Inactive",
                              groupName: group.groupName || group.displayId
                            });
                          }}
                        >
                          <Badge tone={group.isActive ? "success" : "warning"}>
                            {group.isActive ? t("common.status.active", "Active") : t("common.status.inactive", "Inactive")}
                          </Badge>
                        </div>
                      </div>
                    </IndexTable.Cell>

                    <IndexTable.Cell>
                      <div style={{ textAlign: "right", minWidth: "80px" }}>
                        <InlineStack gap="200" align="end">
                          {activePlan &&
                            activePlan.access_products !== "UNLIMITED" &&
                            group.isAllProducts ? (
                            <div title={t("home.table.editBlocked", "Upgrade to edit All Products overlay")}>
                              <Button size="micro" variant="plain" icon={EditIcon} disabled />
                            </div>
                          ) : (
                            <RemixLink
                              to={`/app/new_overlay?groupId=${encodeURIComponent(group.groupId)}`}
                              prefetch="intent"
                              style={{ textDecoration: "none" }}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <Button
                                size="micro"
                                variant="plain"
                                icon={EditIcon}
                              />
                            </RemixLink>)}

                          <Button
                            size="micro"
                            icon={DeleteIcon}
                            tone="critical"
                            variant="plain"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargetGroup(group.groupId);
                            }}
                          />
                        </InlineStack>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
          </Card>

          <Box padding="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text tone="subdued" variant="bodySm">
                {totalItems === 0
                  ? `${t("common.table.showing", "Showing")} 0 ${overlayResourceName.plural}`
                  : `${t("common.table.showing", "Showing")} ${startIndex}-${endIndex} ${t("common.table.of", "of")} ${totalItems} ${overlayResourceName.plural}`}
              </Text>
              <InlineStack gap="300" blockAlign="center">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("common.actions.previous", "Previous")}
                </Button>
                <Text variant="bodyMd">
                  {t("common.table.page", "Page")} {page} {t("common.table.of", "of")} {totalPages}
                </Text>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("common.actions.next", "Next")}
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>
      </Box>

    </Page>
  );
}
