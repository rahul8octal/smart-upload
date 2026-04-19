import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/login")) {
    return null;
  }
  await authenticate.admin(request);

  return null;
};
