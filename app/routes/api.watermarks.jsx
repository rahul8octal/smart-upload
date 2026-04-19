import { json } from "@remix-run/node";
import prisma from "../db.server";

// Helper to format responses (mimicking ApiResponse)
const ApiResponse = {
    success: (message, data, headers) => json({ status: "success", message, data }, { headers }),
    error: (message, status = "400", headers) =>
        json(
            { status: "error", message },
            { status: parseInt(status, 10), headers },
        ),
};

// Helper to generate CORS headers
const getCorsHeaders = (origin) => {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
};

export const loader = async ({ request }) => {

    let origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: getCorsHeaders(origin)
        });
    } else {
        const url = new URL(request.url);
        const query = Object.fromEntries(url.searchParams);
        const { shop, product_ids, page } = query;

        const shopSettings = await prisma.Session.findFirst({
            where: { shop }
        });
        if (!shopSettings) {
            return { error: "App is not found." }, { status: 400 };
        }

        // Check shop plan
        // const shopPlan = await prisma.shopPlans.findFirst({
        //     where: { shop: shop, status: "Active", charge_status: "active" },
        // });
        // if (!shopPlan) {
        //     return json({ error: "Plan is disabled." }, { status: 400 });
        // }
        // if (shopPlan.end_date && new Date(shopPlan.end_date) < new Date()) {
        //     return json({ error: "Plan is expired." }, { status: 400 });
        // }

        const productIdList = product_ids
            ? product_ids.split(",").map((p) => p.trim()).filter(Boolean)
            : [];

        if (productIdList.length === 0) {
            return ApiResponse.success("data retrieved successfully", [], getCorsHeaders(origin));
        }
        const targets = await prisma.overlay_targets.findMany({
            where: {
                OR: [
                    { scope: "ALL_PRODUCTS" },
                    { scope: "PRODUCT", target_id: { in: productIdList } },
                ],
                product_overlays: {
                    shop_id: shop,
                    status: { in: ["active", "Active"] },
                },
            },
            include: {
                product_overlays: true,
            },
        });

        const globalOverlays = [];     // ALL_PRODUCTS
        const productOverlays = {};    // PRODUCT overlays keyed by handle

        targets.forEach(item => {
            if (item.scope === "ALL_PRODUCTS") {
                globalOverlays.push(item.product_overlays);
            } else if (item.scope === "PRODUCT") {
                const productId = item.target_id;
                if (!productOverlays[productId]) {
                    productOverlays[productId] = [];
                }
                productOverlays[productId].push(item.product_overlays);
            }
        });

        // BUILD FINAL RESPONSE BASED ON REQUESTED HANDLES

        const formattedResponse = productIdList?.map(productId => {
            const overlays = [
                ...globalOverlays,                    // ALL PRODUCTS ALWAYS APPLY
                ...(productOverlays[productId] || []),   // PRODUCT SPECIFIC
            ];

            const productHandle = overlays.find(o => o.product_handle)?.product_handle;

            return {
                id: productId,
                product_id: productId,
                handle: productHandle || null,
                title: overlays[0]?.product_title ?? null,
                overlays: overlays?.map(overlay => {
                    if (!overlay?.display_in.includes(page)) {
                        return {}
                    }

                    return {
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
                    }
                }),
            };
        });

        return ApiResponse.success("data retrieved successfully", formattedResponse, getCorsHeaders(origin));
    }

};
