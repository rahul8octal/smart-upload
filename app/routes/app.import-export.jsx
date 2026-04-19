import { useNavigate, useFetcher } from '@remix-run/react';
import { json } from "@remix-run/node";
import {
    ActionList,
    BlockStack,
    Button,
    Card,
    Divider,
    InlineStack,
    Page,
    Popover,
    Toast,
    Text,
    Frame,
    Banner,
    Link,
} from '@shopify/polaris';
import { useCallback, useState, useEffect, useRef } from 'react';
import prisma from '../db.server.js';
import {CSV_HEADERS} from '../helper.js';
import Papa from "papaparse";
import { authenticate } from '../shopify.server.js';
import {
    GET_ALL_SHOPIFY_PRODUCTS_PAGINATED,
} from '../component/ShopifyQuery.jsx';

export const loader = async ({ request }) => {
    return null;
};

const fetchProducts = async (
    admin, shop, allProductsItems = [], overlaysItems = [], isExportAllProduct) => {
    try {
        // get shopify all prisNot Same products
        let allProducts = [];
        let hasNextPage = true;
        let cursor = null;
        
        while (hasNextPage) {
            const response = await admin.graphql(GET_ALL_SHOPIFY_PRODUCTS_PAGINATED, {
                variables: { after: cursor },
            });

            const json = await response.json();
            const productsData = json.data.products;

            // Extract products from edges
            const products = productsData.edges.map((edge) => edge.node);
            allProducts = [...allProducts, ...products];

            // Update pagination info
            hasNextPage = productsData.pageInfo.hasNextPage;
            cursor = productsData.pageInfo.endCursor;
        }

        let matchedProductArray = [];
        if (!isExportAllProduct && allProductsItems?.length > 0) {
            allProductsItems.forEach((overlay) => {
                allProducts.forEach((product) => {
                    let overlayProduct = { ...overlay };
                    overlayProduct.product_id = product?.legacyResourceId;
                    overlayProduct.product_title = product?.title;
                    overlayProduct.handle = product.handle;
                    matchedProductArray.push(overlayProduct);
                });
            });

            if (overlaysItems?.length > 0) {
                overlaysItems.forEach((overlay) => {
                    const isExist = allProducts.find(
                        (product) => product?.legacyResourceId ===
                            overlay?.product_id);
                    if (isExist) {
                        matchedProductArray.push(overlay);
                    }
                });
            }
        }
        
        if (isExportAllProduct){
            allProducts.forEach((product) => {
                let isNotSame = true;
                overlaysItems.forEach(overlay => {
                    if(product?.legacyResourceId === overlay?.product_id){
                        matchedProductArray.push(overlay)
                        isNotSame = false;
                    }
                })
                if (allProductsItems?.length > 0) {
                    allProductsItems.forEach((overlay) => {
                        let overlayProductItem = { ...overlay };
                        overlayProductItem.product_id = product?.legacyResourceId;
                        overlayProductItem.product_title = product?.title;
                        overlayProductItem.handle = product.handle;
                        matchedProductArray.push(overlayProductItem)
                    });
                }

                if (isNotSame && !allProductsItems?.length){
                    matchedProductArray.push({
                        id: null,
                        product_id: product?.legacyResourceId,
                        product_title: product?.title,
                        handle: product.handle,
                        type: "",
                        image_url: "",
                        text: "",
                        font_family: "",
                        font_size: "",
                        font_color: "",
                        font_weight: "",
                        font_style: "",
                        bg_color: "",
                        opacity: "",
                        rotation: "",
                        padding_top: "",
                        padding_right: "",
                        padding_bottom: "",
                        padding_left: "",
                        text_align: "",
                        position: "",
                        display_in: [],
                        scale_in_collection: "",
                        scale_in_product: "",
                        scale_in_search: "",
                        status: "",
                    });
                }
            });
        }
        return matchedProductArray;

    } catch (error) {
        throw error;
    }
};

export const action = async ({request}) => {
    const formData = await request.formData();
    let data = {};
    if(request.method === 'POST') {
        const { admin, session } = await authenticate.admin(request);
        
        if (formData.get('filter') === 'withOverlay' || formData.get('filter') === 'all'){
             const productOverlays = await prisma.product_overlays.findMany({
                where:{
                    shop_id: session?.shop
                },
                include: {
                    overlay_targets: true,
                },
            });
             
             const overlayTargets = [];
             productOverlays.forEach((overlay) => {
                overlay?.overlay_targets?.forEach((target) => {
                    let newOverlay = overlay;
                    delete newOverlay.overlay_targets;
                    target.overlay = newOverlay;
                    overlayTargets.push(target);
                })
            });
            let overlaysItems = [];
            let allProductsItems = [];
            overlayTargets.forEach((target) => {
                let item = {...target.overlay};
                item.product_id = target.target_id;
                item.product_handle = target.target_handle;
                if (target.scope === 'ALL_PRODUCTS') {
                    allProductsItems.push(item);
                }else{
                    overlaysItems.push(item);
                }
            });
            if (formData.get('filter') === 'withOverlay'){
                if (allProductsItems?.length > 0) {
                    data.products = await fetchProducts(admin, session?.shop, allProductsItems, overlaysItems, false);
                }else{
                    data.products = overlaysItems;
                }
                data.withOverlay = true;
            }
            if (formData.get('filter') === 'all'){
                data.products = await fetchProducts(admin, session?.shop, allProductsItems, overlaysItems, true);
                data.withOverlay = true;
            }
        }
        
        if (formData.get('importOverlay')) {
            const response = {
                deleted: [],
                added: [],
                updated: [],
                limitExceed: false
            }
            const overlayDataRaw = formData.getAll('overlayData[]');
            const newOverlays = overlayDataRaw.map(o => JSON.parse(o));
            
            const newIds = newOverlays.map(o => +o.id);
            const oldOverlays = await prisma.product_overlays.findMany({
                where: {
                    id: { in: newIds.map(Number) },
                    shop_id: session?.shop
                },
            })
            const oldIds = oldOverlays.map(o => o.id);
            
            // ===============Delete Operation===============
            const deletedIds = oldIds.filter(x => !newIds.includes(x));
            if (deletedIds?.length > 0) {
                await prisma.product_overlays.delete({
                    where: {id: deletedIds},
                });   
            }
            response.deleted = deletedIds;
            // ===============End Delete Operation===============

            // ===============Add Overlay Operation===============
            const addedOverlays = newOverlays.filter(item => !item?.id && item?.product_id && item?.type);
            let isCreateNew = false;
            if (addedOverlays?.length > 0) {
                for (const overlay of addedOverlays) {
                    isCreateNew = false;
                    const shopProduct = await prisma.product_overlays.findFirst({
                        where: {
                            shop_id: session?.shop,
                            id: Number(overlay.id),
                            product_id: overlay.product_id,
                        },
                    });
                    let spo_sp_id = null
                    if (shopProduct) {
                        spo_sp_id = shopProduct.id;
                    }else{
                        // reach limit plan checking
                        const shopPlans = await prisma.shop_plans.findFirst({
                            where: {
                             shop: session?.shop,
                             status: 'Active',
                             charge_status: 'active',
                            }
                        });
                        if (shopPlans){
                            let accessProductCount = shopPlans?.access_products;
                            const activeProductCount = await prisma.product_overlays.count({
                                where:{
                                    shop_id: session?.shop
                                }
                            });
                            if (activeProductCount !== 'UNLIMITED' && accessProductCount <= activeProductCount){
                                response.limitExceed = true;
                                console.log('Product limit exceed. Please upgrade plan.');
                                break;
                            }else{
                                isCreateNew = true;
                            }
                        }
                    }

                    if (spo_sp_id || isCreateNew) {
                        const {
                            product_title, product_handle, product_id, type, image_url, text, font_family, font_size, font_color, bg_color, opacity,
                            rotation, text_align, padding_top, padding_right, padding_bottom, padding_left,
                            position, status, display_in_collection, display_in_product, display_in_search,
                            scale_in_collection, scale_in_product, scale_in_search
                        } = overlay;
                        const input = {
                            shop_id: session?.shop,
                            product_title,
                            product_handle: product_handle || "",
                            product_id,
                            type,
                            image_url: image_url || "",
                            text: text || "",
                            font_family: font_family || "",
                            font_size: font_size || "",
                            font_color: font_color || "",
                            bg_color: bg_color || "",
                            opacity: opacity || "",
                            rotation: rotation || "",
                            text_align: text_align || 'RIGHT',
                            padding_top: padding_top || "",
                            padding_right: padding_right || "",
                            padding_bottom: padding_bottom || "",
                            padding_left: padding_left || "",
                            position: position || 'TOP_CENTER',
                            status: status || "Active",
                            scale_in_collection: scale_in_collection || "",
                            scale_in_product: scale_in_product || "",
                            scale_in_search: scale_in_search || "",
                            display_in: [],
                        }
                        if (display_in_collection ===
                            'Yes') input.display_in.push('collection');
                        if (display_in_product === 'Yes') input.display_in.push(
                            'product');
                        if (display_in_search === 'Yes') input.display_in.push(
                            'search');
                        // crate overlay here
                        await prisma.product_overlays.create({
                            data: {...input}
                        })
                        response.added.push(input)
                    }
                }
            }
            // ===============End Add Overlay Operation===============
            
            // ===============Update Overlay Code===============
            const isChangeTextAlignValue = (newValue, oldValue) => {
                newValue = newValue ?? ""; // convert null/undefined → ""
                oldValue = oldValue ?? "";
                return newValue.trim() !== oldValue.trim();
            }
            
            const overlapIds = oldIds.filter(x => newIds.includes(x));
            for (const overlapId of overlapIds) {
                const oldOverlay = oldOverlays.find((item) => item?.id === overlapId);
                
                const newOverlayData = newOverlays.find((item) => item.id == overlapId)
                if (!newOverlayData) continue;
                let newOverlayDisplayIn = [];
                if (newOverlayData?.display_in_collection &&
                    newOverlayData?.display_in_collection === 'Yes') {
                    newOverlayDisplayIn.push('collection');
                }
                if (newOverlayData?.display_in_product &&
                    newOverlayData?.display_in_product === 'Yes') {
                    newOverlayDisplayIn.push('product');
                }
                if (newOverlayData?.display_in_search &&
                    newOverlayData?.display_in_search === 'Yes') {
                    newOverlayDisplayIn.push('search');
                }
                
                const displayCondition = JSON.stringify(newOverlayDisplayIn) !== JSON.stringify(oldOverlay.display_in);
                if (newOverlayData?.product_title !== oldOverlay?.product_title ||
                    newOverlayData?.product_handle !== oldOverlay?.product_handle ||
                    newOverlayData?.type !== oldOverlay?.type || 
                    newOverlayData?.image_url !== oldOverlay?.image_url || 
                    newOverlayData?.text !== oldOverlay?.text ||
                    newOverlayData?.font_family !== oldOverlay?.font_family || 
                    newOverlayData?.font_size !== oldOverlay?.font_size ||
                    newOverlayData?.font_color !== oldOverlay?.font_color ||
                    newOverlayData?.bg_color !== oldOverlay?.bg_color || 
                    newOverlayData?.opacity !== oldOverlay?.opacity ||
                    newOverlayData?.rotation !== oldOverlay?.rotation ||
                    isChangeTextAlignValue(newOverlayData?.text_align,oldOverlay?.text_align)  ||
                    newOverlayData?.padding_top !== oldOverlay?.padding_top ||
                    newOverlayData?.padding_right !== oldOverlay?.padding_right ||
                    newOverlayData?.padding_bottom !== oldOverlay?.padding_bottom ||
                    newOverlayData?.padding_left !== oldOverlay?.padding_left ||
                    newOverlayData?.position !== oldOverlay?.position ||
                    displayCondition ||
                    newOverlayData?.scale_in_collection !== oldOverlay?.scale_in_collection ||
                    newOverlayData?.scale_in_product !== oldOverlay?.scale_in_product ||
                    newOverlayData?.scale_in_search !== oldOverlay?.scale_in_search ||
                    newOverlayData?.status !== oldOverlay?.status) {
                    const input = {
                        product_title: newOverlayData?.product_title,
                        product_handle: newOverlayData?.product_handle || "",
                        type: newOverlayData?.type,
                        image_url: newOverlayData?.image_url || "",
                        text: newOverlayData?.text || "",
                        font_family: newOverlayData?.font_family || "",
                        font_size: newOverlayData?.font_size || "",
                        font_color: newOverlayData?.font_color || "",
                        bg_color: newOverlayData?.bg_color || "",
                        opacity: newOverlayData?.opacity || "",
                        rotation: newOverlayData?.rotation || "",
                        text_align: newOverlayData?.text_align || null,
                        padding_top: newOverlayData?.padding_top || "",
                        padding_right: newOverlayData?.padding_right || "",
                        padding_bottom: newOverlayData?.padding_bottom || "",
                        padding_left: newOverlayData?.padding_left || "",
                        position: newOverlayData?.position,
                        status: newOverlayData?.status || "Active",
                        scale_in_collection: newOverlayData?.scale_in_collection || "",
                        scale_in_product: newOverlayData?.scale_in_product || "",
                        scale_in_search: newOverlayData?.scale_in_search || "",
                        display_in: newOverlayDisplayIn
                    }
                    await prisma.product_overlays.update({
                        where: { id: overlapId },
                        data: input
                    });
                    response.updated.push(input)
                }
            }
            // ===============End update overlay code===============

            data.importResponse = response;
        }
    }
    
    return json({ data });
}

export default function ImportExport() {
    const navigate = useNavigate();
    const [popoverActive, setPopoverActive] = useState(false);
    const fetcher = useFetcher();
    const [queryToast, setQueryToast] = useState([]);
    const [isExportFile, setIsExportFile] = useState(false);
    const [isExportStart, setIsExportStart] = useState(false);
    const [importing, setImporting] = useState(false);
    const inputFile = useRef(null);
    const [importResult, setImportResult] = useState(null);
    
    const togglePopoverActive = useCallback(
        () => setPopoverActive((popoverActive) => !popoverActive),
        [],
    );

    const downloadFile = ({ data, fileName, fileType }) => {
        const blob = new Blob([data], { type: fileType });
        // to trigger a download
        const a = document.createElement("a");
        a.download = fileName;
        a.href = window.URL.createObjectURL(blob);
        const clickEvt = new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true,
        });
        a.dispatchEvent(clickEvt);
        a.remove();
    };

    const handleExport = async (filter = "all") => {
        const formData = new FormData();
        formData.append("filter", filter);
        setIsExportStart(true);
        setIsExportFile(true);
        setPopoverActive(false);
        await fetcher.submit(formData, { method: "POST", action: "/app/import-export" });
    }

    const handleDownloadCVS = (products) => {
        if (products.length) {
            const convertToCSV = (headers, items) => {
                const replacer = (key, value) => (value === null ? "" : value);
                const csv = [
                    Object.values(headers).join(","), // header row first
                    ...items.map((row) =>
                        Object.keys(headers)
                        .map((key) => {
                            if(key === 'display_in_collection' && row?.display_in?.includes('collection')){
                                row.display_in_collection = 'Yes';
                            }
                            if(key === 'display_in_product' && row?.display_in?.includes('product')){
                                row.display_in_product = 'Yes';
                            }
                            if(key === 'display_in_search' && row?.display_in?.includes('search')){
                                row.display_in_search = 'Yes';
                            }
                            return JSON.stringify(row[key], replacer)
                        })
                        .join(",")
                    ),
                ].join("\r\n");
                return csv;
            };
            const csv = convertToCSV(CSV_HEADERS, products);
            const d = new Date();
            const dformat = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}`;

            downloadFile({
                data: csv,
                fileName: `Overlays_${dformat}.csv`,
                fileType: "text/csv",
            });
        } else {
            setQueryToast([
                <Toast
                    onDismiss={() => setQueryToast([])}
                    duration={1500}
                    content={"No data available for export."}
                    error={false}
                    key="toast_no_csv_available"
                />,
            ]);
        }
    }
    
    useEffect(() => {
        if (fetcher.state === 'idle') {
            // for export response
            if (fetcher?.data?.data?.withOverlay && isExportStart){
                const products = fetcher?.data?.data.products;
                handleDownloadCVS(products);
                setIsExportFile(false)
                setIsExportStart(false)   
            }
            // for import response
            if(fetcher.data?.data?.importResponse){
                setImportResult(fetcher.data?.data?.importResponse)
            }
        }
    }, [fetcher.state, fetcher.data]);
    
    const handleImport = async (e) => {
        if (!e.target.files[0]) return;

        setImporting(true);

        Papa.parse(e.target.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const csvHeaders = {};

                    Object.keys(CSV_HEADERS).map((key) => {
                        csvHeaders[CSV_HEADERS[key]] = key;
                    });

                    const overlays = results.data.map((row) => {
                        const rowData = {};

                        Object.keys(row).map((key) => {
                            rowData[csvHeaders[key]] = row[key];
                        });

                        return rowData;
                    });

                    const formData = new FormData();
                    overlays?.forEach((overlay) => {
                        formData.append('overlayData[]',JSON.stringify(overlay));
                    })
                    formData.append('importOverlay', true);
                    fetcher.submit(formData,{
                        method: "POST",
                    })

                    // setImportResult(data.importOverlays.data);
                    setImporting(false);

                    setQueryToast([
                        <Toast
                            onDismiss={() => {
                                setQueryToast([]);
                            }}
                            duration="1500"
                            content={"CSV was uploaded successfully."}
                            error={false}
                            key="csv_uploaded"
                        />,
                    ]);
                } catch (e) {
                    console.log(e);
                    setQueryToast([
                        <Toast
                            onDismiss={() => {
                                setQueryToast([]);
                            }}
                            duration="1500"
                            content={"CSV is not valid."}
                            error={true}
                            key="invalid_csv"
                        />,
                    ]);
                    setImporting(false);
                }finally {
                    inputFile.current.value = null;
                }
            },
            error: (e) => {
                console.log(e);
                setImporting(false);
                e.target.value = null;

                setQueryToast([
                    <Toast
                        onDismiss={() => {
                            setQueryToast([]);
                        }}
                        duration="1500"
                        content={"CSV is not valid."}
                        error={false}
                        key="invalid_csv"
                    />,
                ]);
            },
        });
    };

    return (
        <Frame>
            {queryToast}
        <Page
            backAction={{
                content: 'app',
                onAction: () => {
                    navigate('/app')
                },
            }}
            title={'Import/Export CSV'}
        >
            <Card>
                <BlockStack gap={500}>
                    {
                        isExportFile ?
                            <Toast
                                onDismiss={() => setIsExportFile(false)}
                                duration={1500}
                                content={"Your product export is being processed."}
                                error={false}
                                key="export_file_all_product"
                            />
                            : null
                    }
                    <InlineStack gap={200} align="space-between" blockAlign="center">
                    <Text as="h4" variant="headingMd">Import / Export</Text>
                    <Link
                        url="https://www.youtube.com/watch?v=RzJk2QgW8B4&t=41s"
                        removeUnderline
                        target="_blank"
                    >
                        <Text as="span" variant="bodyMd" tone="subdued">
                            How to Use Import Export
                        </Text>
                    </Link>
                    </InlineStack>
                    <Divider />
                    <InlineStack gap={300}>
                        <Popover
                            active={popoverActive}
                            activator={
                                <Button
                                  onClick={togglePopoverActive}
                                  disclosure
                                >
                                    Export CSV
                                </Button>
                            }
                            preferredAlignment="left"
                            autofocusTarget="first-node"
                            onClose={togglePopoverActive}
                        >
                            <ActionList
                                actionRole="menuitem"
                                items={[
                                    // { content: 'All Products', onAction: handleExport },
                                    {
                                        content: "Only products with overlays",
                                        onAction: () => handleExport("withOverlay"),
                                    },
                                    {
                                        content: "All products",
                                        onAction: handleExport,
                                    }
                                ]}
                            />
                        </Popover>
                        <Button
                            loading={importing}
                            onClick={() => inputFile.current.click()}>
                            Import CSV
                        </Button>
                        <input
                            style={{ display: "none" }}
                            type="file"
                            accept=".csv, .json"
                            onChange={handleImport}
                            ref={inputFile}
                        />
                    </InlineStack>
                </BlockStack>
                {importResult && (
                    <Banner
                        status="success"
                        title="Imported!"
                        onDismiss={() => setImportResult(null)}
                    >
                        <BlockStack>
                            {importResult?.limitExceed && (
                                <p>
                                    Product limit exceed. Please{" "}
                                    <Link>click</Link>{" "}
                                    here to upgrade plan.
                                </p>
                            )}

                            <p>
                                <b>Added:</b> {importResult.added.length || 0},{" "}
                                <b>Deleted:</b> {importResult.deleted.length || 0},{" "}
                                <b>Updated:</b> {importResult.updated.length || 0}
                            </p>
                        </BlockStack>
                    </Banner>
                )}
            </Card>
        </Page>
        </Frame>
    );
}
