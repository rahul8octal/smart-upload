export const matchImagesToProducts = async (images, products, matchingType, metafieldSettings = null) => {
  const matches = [];
  const unmatched = [];

  // Helper to strip common suffixes like _1, _2, -1, (1), etc.
  const getBaseFilename = (name) => {
    // Remove extension
    let filename = name.split('.').slice(0, -1).join('.').toLowerCase().trim();
    // Remove suffixes like _1, -1, (1)
    // Match patterns: _[digit], -[digit], ([digit])
    const base = filename.replace(/(_\d+|-?\d+| \(\d+\))$/, '').trim();
    return { filename, base };
  };

  images.forEach(image => {
    const { filename, base } = getBaseFilename(image.name);

    let matchedProduct = null;
    let matchedVariant = null;

    for (const product of products) {
      const pTitle = product.title.toLowerCase().trim();

      // 1. Match by Title (Product or Variant combinations)
      if (matchingType === 'title') {
        const normalizedFilename = filename.replace(/-/g, ' ').replace(/_/g, ' ');
        const normalizedPTitle = pTitle.replace(/-/g, ' ').replace(/_/g, ' ');

        // Check exact product title match
        if (pTitle === filename || pTitle === base || normalizedPTitle === normalizedFilename) {
          matchedProduct = product;
        }

        // Check Variant title combinations (e.g. "Color ProductTitle" or "ProductTitle Color")
        if (!matchedProduct) {
          for (const variant of product.variants.nodes) {
            const vTitle = variant.title.toLowerCase().trim();
            const combo1 = `${vTitle} ${pTitle}`.replace(/-/g, ' ').replace(/_/g, ' ');
            const combo2 = `${pTitle} ${vTitle}`.replace(/-/g, ' ').replace(/_/g, ' ');
            
            if (normalizedFilename === vTitle.replace(/-/g, ' ').replace(/_/g, ' ') || normalizedFilename === combo1 || normalizedFilename === combo2) {
              matchedVariant = variant;
              matchedProduct = product;
              break;
            }
          }
        }
      }

      // 2. Match by SKU or Barcode in variants
      if (!matchedProduct && (matchingType === 'sku' || matchingType === 'barcode')) {
        for (const variant of product.variants.nodes) {
          const identifier = (matchingType === 'sku' ? variant.sku : variant.barcode)?.toLowerCase().trim();
          if (identifier && (identifier === filename || identifier === base)) {
            matchedVariant = variant;
            matchedProduct = product;
            break;
          }
        }
      }

      // 3. Match by Metafield (if settings provided)
      if (!matchedProduct && matchingType === 'metafield' && metafieldSettings?.key) {
        const metafields = product.metafields?.nodes || [];
        const target = metafields.find(m => `${m.namespace}.${m.key}` === metafieldSettings.key);
        if (target && target.value.toLowerCase().trim() === filename) {
          matchedProduct = product;
        }

        // Check variant metafields
        if (!matchedProduct) {
          for (const variant of product.variants.nodes) {
             const vMetafields = variant.metafields?.nodes || [];
             const vTarget = vMetafields.find(m => `${m.namespace}.${m.key}` === metafieldSettings.key);
             if (vTarget && vTarget.value.toLowerCase().trim() === filename) {
               matchedVariant = variant;
               matchedProduct = product;
               break;
             }
          }
        }
      }
      
      if (matchedProduct) break;
    }

    if (matchedProduct) {
      matches.push({
        image,
        product: matchedProduct,
        variant: matchedVariant,
      });
    } else {
      unmatched.push(image);
    }
  });

  return { matches, unmatched };
};

export const fetchAllProducts = async (admin, metafieldKey = null) => {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  const [namespace, key] = metafieldKey ? metafieldKey.split('.') : [null, null];

  while (hasNextPage) {
    const query = `
      query getProducts($cursor: String ${metafieldKey ? ', $namespace: String, $key: String' : ''}) {
        products(first: 50, after: $cursor) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
            variants(first: 100) {
              nodes {
                id
                title
                sku
                barcode
                ${metafieldKey ? `metafield(namespace: $namespace, key: $key) { id namespace key value }` : ''}
              }
            }
            ${metafieldKey ? `metafield(namespace: $namespace, key: $key) { id namespace key value }` : ''}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = { cursor };
    if (metafieldKey) {
      variables.namespace = namespace;
      variables.key = key;
    }

    const response = await admin.graphql(query, { variables });

    const data = await response.json();
    if (data.errors) {
      console.error("GraphQL errors fetching products:", data.errors);
      hasNextPage = false;
      continue;
    }
    const products = data.data.products;

    // Normalize metafields into arrays for consistency with my logic above
    const nodes = products.nodes.map(p => ({
      ...p,
      metafields: { nodes: p.metafield ? [p.metafield] : [] },
      variants: {
        nodes: p.variants.nodes.map(v => ({
          ...v,
          metafields: { nodes: v.metafield ? [v.metafield] : [] }
        }))
      }
    }));

    allProducts = [...allProducts, ...nodes];
    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  return allProducts;
};
