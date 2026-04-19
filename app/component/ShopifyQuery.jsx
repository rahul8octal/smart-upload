export const GET_ALL_SHOPIFY_PRODUCTS = `
    query getAllProducts($first: Int, $after: String, $last: Int, $before: String, $query: String) {
        products(first: $first, after: $after, last: $last, before: $before, query: $query) {
            pageInfo {
                hasPreviousPage
                hasNextPage
                startCursor
                endCursor
            }
            edges {
                    cursor
                    node {
                    id
                    legacyResourceId
                    title
                    handle
                    status
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

export const GET_SHOPIFY_PRODUCT = `
    query getProducts($id: ID!) {
        product(id: $id) {
            id
            legacyResourceId
            title
            handle
            featuredMedia {
                preview {
                    image {
                        originalSrc
                        width
                        height
                    }
                }
            }
        }
    }
`;

export const CREATE_SUBSCRIPTION_IN_SHOPIFY = `
  mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $trialDays: Int! $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      lineItems: $lineItems,
      trialDays: $trialDays,
    ) {
      appSubscription {
        id
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

export const GET_ALL_SHOPIFY_PRODUCTS_PAGINATED = `
  query getAllProducts($after: String) {
    products(first: 250, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          legacyResourceId
          title
          handle
          status
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
