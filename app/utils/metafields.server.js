/**
 * Metafield Helper - Centralized metafield operations
 * Handles all App-owned metafield operations for overlay configurations
 */

const METAFIELD_NAMESPACE = '$app'; // Use $app for app-owned metafields
const METAFIELD_TYPE = 'json';

/**
 * Get AppInstallation GID for app metafields
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<string>} AppInstallation GID
 */
async function getAppInstallationGid(admin) {
  const query = `
    query {
      appInstallation {
        id
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const data = await response.json();
    return data.data?.appInstallation?.id || null;
  } catch (error) {
    console.error('[Metafields] Error getting AppInstallation GID:', error);
    throw error;
  }
}

/**
 * Create or update an app metafield (app-owned)
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} key - Metafield key (e.g., "all_overlays")
 * @param {Object} value - JSON value to store
 * @returns {Promise<Object>} Created/updated metafield
 */
export async function upsertAppMetafield(admin, key, value) {
  const appInstallationGid = await getAppInstallationGid(admin);
  if (!appInstallationGid) {
    throw new Error('Could not get AppInstallation GID for app metafield');
  }

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: appInstallationGid,
        namespace: METAFIELD_NAMESPACE,
        key: key,
        type: METAFIELD_TYPE,
        value: JSON.stringify(value),
      },
    ],
  };

  try {
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = data.data.metafieldsSet.userErrors;
      throw new Error(`Metafield error: ${errors.map((e) => e.message).join(', ')}`);
    }

    return data.data?.metafieldsSet?.metafields?.[0] || null;
  } catch (error) {
    console.error('[Metafields] Error upserting metafield:', error);
    throw error;
  }
}

/**
 * Delete an app metafield
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string[]} metafieldIds - Array of metafield GIDs to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteAppMetafields(admin, metafieldIds) {
  if (!metafieldIds || metafieldIds.length === 0) {
    return true;
  }

  const mutation = `
    mutation metafieldsDelete($metafieldIds: [ID!]!) {
      metafieldsDelete(metafieldIds: $metafieldIds) {
        deletedIds
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafieldIds: metafieldIds,
  };

  try {
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.data?.metafieldsDelete?.userErrors?.length > 0) {
      const errors = data.data.metafieldsDelete.userErrors;
      throw new Error(`Metafield delete error: ${errors.map((e) => e.message).join(', ')}`);
    }

    return true;
  } catch (error) {
    console.error('[Metafields] Error deleting metafields:', error);
    throw error;
  }
}

/**
 * Get app metafield (app-owned)
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} key - Metafield key (e.g., "all_overlays")
 * @returns {Promise<Object|null>} Metafield value or null
 */
export async function getAppMetafield(admin, key) {
  const appInstallationGid = await getAppInstallationGid(admin);
  console.log(appInstallationGid, 'appInstallationGid------');
  if (!appInstallationGid) {
    console.error('[Metafields] Could not get AppInstallation GID');
    return null;
  }

  const query = `
    query getAppMetafield($id: ID!, $namespace: String!, $key: String!) {
      appInstallation(id: $id) {
        metafield(namespace: $namespace, key: $key) {
          id
          namespace
          key
          value
          type
        }
      }
    }
  `;

  const variables = {
    id: appInstallationGid,
    namespace: METAFIELD_NAMESPACE,
    key: key,
  };

  try {
    const response = await admin.graphql(query, { variables });
    const data = await response.json();
    const metafield = data.data?.appInstallation?.metafield;
    console.log(metafield, 'data--------')
    if (metafield?.value) {
      try {
        return JSON.parse(metafield.value);
      } catch {
        return metafield.value;
      }
    }
    return null;
  } catch (error) {
    console.error('[Metafields] Error getting app metafield:', error);
    return null;
  }
}

/**
 * Get all app metafields (app-owned)
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<Object>} Object with all metafields keyed by their key
 */
export async function getAllAppMetafields(admin) {
  const appInstallationGid = await getAppInstallationGid(admin);
  if (!appInstallationGid) {
    console.error('[Metafields] Could not get AppInstallation GID');
    return {};
  }

  const query = `
    query getAppMetafields($id: ID!, $namespace: String!) {
      appInstallation(id: $id) {
        metafields(namespace: $namespace, first: 250) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `;

  const variables = {
    id: appInstallationGid,
    namespace: METAFIELD_NAMESPACE,
  };

  try {
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    const metafields = data.data?.shop?.metafields?.edges || [];
    const result = {};
    metafields.forEach((edge) => {
      const node = edge.node;
      if (node.value) {
        try {
          result[node.key] = JSON.parse(node.value);
        } catch {
          result[node.key] = node.value;
        }
      }
    });

    return result;
  } catch (error) {
    console.error('[Metafields] Error getting all app metafields:', error);
    return {};
  }
}

/**
 * Save overlay configuration as app metafield for a product
 * Stores all product overlays in a single "all_overlays" metafield keyed by product ID
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} productId - Product ID (numeric string)
 * @param {Object} overlayConfig - Overlay configuration object
 * @returns {Promise<Object>} Created/updated metafield
 */
export async function saveOverlayMetafield(admin, productId, overlayConfig) {
  // Get existing all_overlays metafield
  const allOverlays = await getAppMetafield(admin, 'all_overlays') || {};

  console.log(allOverlays, 'all overlays-----------');

  // Update the specific product's overlay
  if (overlayConfig.overlays && overlayConfig.overlays.length > 0) {
    allOverlays[productId] = overlayConfig;
  } else {
    // Remove if no overlays
    delete allOverlays[productId];
  }

  // Save the updated object
  return upsertAppMetafield(admin, 'all_overlays', allOverlays);
}

/**
 * Delete overlay metafield for a product
 * Removes the product from the all_overlays metafield
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} productId - Product ID (numeric string)
 * @returns {Promise<boolean>} Success status
 */
export async function deleteOverlayMetafield(admin, productId) {
  // Get existing all_overlays metafield
  const allOverlays = await getAppMetafield(admin, 'all_overlays') || {};

  // Remove the product
  delete allOverlays[productId];

  // Save the updated object (or delete if empty)
  if (Object.keys(allOverlays).length > 0) {
    return await upsertAppMetafield(admin, 'all_overlays', allOverlays);
  } else {
    // Delete the metafield if no overlays remain
    const appInstallationGid = await getAppInstallationGid(admin);
    if (!appInstallationGid) {
      return false;
    }

    const query = `
      query getAppMetafield($id: ID!, $namespace: String!, $key: String!) {
        appInstallation(id: $id) {
          metafield(namespace: $namespace, key: $key) {
            id
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, {
        variables: {
          id: appInstallationGid,
          namespace: METAFIELD_NAMESPACE,
          key: 'all_overlays',
        },
      });
      const data = await response.json();
      const metafieldId = data.data?.appInstallation?.metafield?.id;

      if (metafieldId) {
        return await deleteAppMetafields(admin, [metafieldId]);
      }
      return true;
    } catch (error) {
      console.error('[Metafields] Error deleting overlay metafield:', error);
      return false;
    }
  }
}

/**
 * Get overlay metafield for a specific product
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} productId - Product ID (numeric string)
 * @returns {Promise<Object|null>} Overlay configuration or null
 */
export async function getOverlayMetafield(admin, productId) {
  const allOverlays = await getAppMetafield(admin, 'all_overlays');
  if (!allOverlays || typeof allOverlays !== 'object') {
    return null;
  }
  return allOverlays[productId] || null;
}

/**
 * Sync all existing overlays from database to app metafields
 * This should be called on first app open or when metafields are missing
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} shop - Shop domain
 * @param {Object} prisma - Prisma client instance
 * @returns {Promise<boolean>} Success status
 */
export async function syncOverlaysToMetafields(admin, shop, prisma, force = false) {
  try {
    // Check if app metafield already exists
    if (!force) {
      const existingMetafield = await getAppMetafield(admin, 'all_overlays');
      if (existingMetafield && Object.keys(existingMetafield).length > 0) {
        console.log('[Metafields] App metafield already exists, skipping sync');
        return true;
      }
    }


    console.log('[Metafields] Syncing existing overlays to app metafields...');

    // Fetch all active overlays from database
    const targets = await prisma.overlay_targets.findMany({
      where: {
        OR: [
          { scope: 'ALL_PRODUCTS' },
          { scope: 'PRODUCT' },
        ],
        product_overlays: {
          shop_id: shop,
          status: { in: ['active', 'Active'] },
        },
      },
      include: {
        product_overlays: true,
      },
    });

    // Separate ALL_PRODUCTS and PRODUCT scoped overlays
    const globalOverlays = [];
    const productOverlaysMap = {};

    targets.forEach((item) => {
      const overlay = item.product_overlays;
      if (!overlay || overlay.status !== 'Active') return;

      // Format overlay data
      const overlayData = {
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
      };

      if (item.scope === 'ALL_PRODUCTS') {
        // Collect global overlays (will be added to all products)
        const exists = globalOverlays.some((o) => o.overlay_id === overlay.id);
        if (!exists) {
          globalOverlays.push(overlayData);
        }
      } else if (item.scope === 'PRODUCT' && item.target_id) {
        const productId = String(item.target_id);

        if (!productOverlaysMap[productId]) {
          productOverlaysMap[productId] = {
            product_id: productId,
            handle: item.target_handle,
            overlays: [],
          };
        } else if (!productOverlaysMap[productId].handle && item.target_handle) {
          productOverlaysMap[productId].handle = item.target_handle;
        }

        // Check if overlay already exists in the array (avoid duplicates)
        const exists = productOverlaysMap[productId].overlays.some(
          (o) => o.overlay_id === overlay.id
        );

        if (!exists) {
          productOverlaysMap[productId].overlays.push(overlayData);
        }
      }
    });

    if (globalOverlays.length > 0) {
      productOverlaysMap['ALL_PRODUCTS'] = {
        product_id: 'ALL_PRODUCTS',
        handle: null,
        overlays: globalOverlays
      };
    }

    // Combine global overlays with each product's overlays
    Object.keys(productOverlaysMap).forEach((productId) => {
      if (productId === 'ALL_PRODUCTS') return;
      // Add global overlays to each product (if not already present)
      globalOverlays.forEach((globalOverlay) => {
        const exists = productOverlaysMap[productId].overlays.some(
          (o) => o.overlay_id === globalOverlay.overlay_id
        );
        if (!exists) {
          productOverlaysMap[productId].overlays.push(globalOverlay);
        }
      });
    });

    // Save all overlays to app metafield
    if (Object.keys(productOverlaysMap).length > 0) {
      await upsertAppMetafield(admin, 'all_overlays', productOverlaysMap);
      console.log(`[Metafields] Successfully synced ${Object.keys(productOverlaysMap).length} products to app metafields`);
      return true;
    } else {
      console.log('[Metafields] No active overlays found to sync');
      // Create empty metafield to mark that sync has been attempted
      await upsertAppMetafield(admin, 'all_overlays', {});
      return true;
    }
  } catch (error) {
    console.error('[Metafields] Error syncing overlays to metafields:', error);
    return false;
  }
}
