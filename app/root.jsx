import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";

if (typeof window !== "undefined" && typeof process === "undefined") {
  window.process = { env: {} };
}
import { json } from "@remix-run/node";
// import './style.css';
import "@shopify/polaris/build/esm/styles.css";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import customStyles from "./style.css?url";
import { useEffect, useRef } from "react";
import { onLCP } from "web-vitals";
import { I18nProvider } from "./i18n";
import { authenticate } from "./shopify.server";
import prisma from "./db.server";
import { getMessages } from "./i18n.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const isAuthRoute = url.pathname.startsWith("/auth");

  let locale = "en";
  let shop = null;

  if (!isAuthRoute) {
    try {
      const { session } = await authenticate.admin(request);
      shop = session?.shop;
    } catch (error) {
      if (error instanceof Response && error.status >= 300 && error.status < 400) {
        throw error;
      }
      console.log("Root loader auth skipped or failed:", error.message);
    }
  }

  if (shop) {
    const settings = await prisma.shop_settings.findUnique({
      where: { shop },
      select: { app_language: true },
    });
    if (settings?.app_language) {
      locale = String(settings.app_language).toLowerCase();
    }
  }

  const { messages } = await getMessages(locale);

  return json({
    locale,
    messages,
  });
}

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: customStyles },
];

export default function App() {
  const { locale, messages } = useLoaderData();
  const lcpSent = useRef(false);

  useEffect(() => {
    function sendToAnalytics({ name, value, rating, entries }) {
      if (name === "LCP" && !lcpSent.current) {
        console.log("--metric.name", name);
        console.log("--metric.value", value);
        console.log("--metric.rating", rating);
        console.log("--metric.entries", entries);
        lcpSent.current = true;
      }
    }

    onLCP(sendToAnalytics);
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />

      </head>
      <body suppressHydrationWarning>
        <I18nProvider locale={locale} messages={messages}>
          <Outlet />
        </I18nProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
