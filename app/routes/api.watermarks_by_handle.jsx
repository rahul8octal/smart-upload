import { json } from '@remix-run/node';
import prisma from '../db.server';

const ApiResponse = {
    success: (message, data, headers) =>
        json({ status: 'success', message, data }, { headers }),
    error: (message, status = '400', headers) =>
        json(
            { status: 'error', message },
            { status: parseInt(status, 10), headers },
        ),
};

const getCorsHeaders = (origin) => {
    const allowOrigin = origin || '*';
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
};

export const loader = async ({ request }) => {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: getCorsHeaders(origin),
        });
    }
    return new Response('Method Not Allowed',
        { status: 405, headers: getCorsHeaders(origin) });
};

export const action = async ({ request }) => {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: getCorsHeaders(origin),
        });
    }

    if (request.method !== 'POST') {
        return ApiResponse.error('Method not allowed', '405',
            getCorsHeaders(origin));
    }

    let payload = null;
    try {
        payload = await request.json();
    } catch (error) {
        return ApiResponse.error('Invalid JSON payload', '400',
            getCorsHeaders(origin));
    }

    const shop = payload?.shop;
    const inputHandles = Array.isArray(payload?.handles)
        ? payload?.handles.map((h) => (typeof h === 'string' ? h.trim() : '')).filter(Boolean)
        : [];

    const decodedHandlesSet = new Set();
    inputHandles.forEach(h => {
        try {
            decodedHandlesSet.add(decodeURIComponent(h));
        } catch (e) {
            decodedHandlesSet.add(h);
        }
    });
    const decodedHandles = Array.from(decodedHandlesSet);
    const page = payload?.page;

    if (!shop || inputHandles.length === 0) {
        return ApiResponse.error('Shop or handles missing from request', '400',
            getCorsHeaders(origin));
    }

    const shopSettings = await prisma.Session.findFirst({
        where: { shop },
    });

    if (!shopSettings) {
        return ApiResponse.error('App is not found.', '400',
            getCorsHeaders(origin));
    }

    const targets = await prisma.overlay_targets.findMany({
        where: {
            OR: [
                { scope: 'ALL_PRODUCTS' },
                { scope: 'PRODUCT', target_handle: { in: decodedHandles } },
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

    // SEPARATE THE TWO TYPES
    const globalOverlays = [];     // ALL_PRODUCTS
    const productOverlays = {};    // PRODUCT overlays keyed by handle

    targets.forEach(item => {
        if (item.scope === "ALL_PRODUCTS") {
            globalOverlays.push(item.product_overlays);
        } else if (item.scope === "PRODUCT") {
            const handle = item.target_handle;
            if (!productOverlays[handle]) {
                productOverlays[handle] = [];
            }
            productOverlays[handle].push(item.product_overlays);
        }
    });

    // BUILD FINAL RESPONSE BASED ON REQUESTED HANDLES
    const formattedResponse = inputHandles.map(originalHandle => {
        let decodedHandle;
        try {
            decodedHandle = decodeURIComponent(originalHandle);
        } catch (e) {
            decodedHandle = originalHandle;
        }

        const overlays = [
            ...globalOverlays,                    // ALL PRODUCTS ALWAYS APPLY
            ...(productOverlays[decodedHandle] || []),   // PRODUCT SPECIFIC
        ];
        return {
            id: originalHandle,
            product_id: originalHandle,
            handle: originalHandle,
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
                };
            }),
        };
    });

    return ApiResponse.success(
        'data retrieved successfully',
        formattedResponse,
        getCorsHeaders(origin),
    );
};
