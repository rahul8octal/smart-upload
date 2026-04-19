export const matchImagesToProducts = async (images, products, matchingType) => {
  const matches = [];
  const unmatched = [];

  images.forEach(image => {
    // Remove extension from filename for matching
    const filename = image.name.split('.').slice(0, -1).join('.').toLowerCase();
    
    let matchedProduct = null;
    let matchedVariant = null;

    for (const product of products) {
      if (matchingType === 'title' && product.title.toLowerCase() === filename) {
        matchedProduct = product;
        break;
      }
      
      // Check variants
      for (const variant of product.variants.nodes) {
        if (matchingType === 'sku' && variant.sku?.toLowerCase() === filename) {
          matchedVariant = variant;
          matchedProduct = product;
          break;
        }
        if (matchingType === 'barcode' && variant.barcode?.toLowerCase() === filename) {
          matchedVariant = variant;
          matchedProduct = product;
          break;
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

export const fetchAllProducts = async (admin) => {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(
      `query ($cursor: String) {
        products(first: 250, after: $cursor) {
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
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { variables: { cursor } }
    );

    const data = await response.json();
    const products = data.data.products;
    allProducts = [...allProducts, ...products.nodes];
    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  return allProducts;
};
