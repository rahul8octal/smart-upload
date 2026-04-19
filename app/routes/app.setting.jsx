import React, { useState, useCallback, useEffect, useMemo } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
    Page,
    Card,
    Box,
    Text,
    InlineStack,
    Button,
    InlineGrid,
    Select,
    Checkbox,
    TextField,
    Link,
    Frame,
    Toast,
    BlockStack,
    Divider,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { useI18n } from "../i18n";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";


const localeLabelMap = {
    ar: "Arabic",
    ca: "Catalan",
    cs: "Czech",
    da: "Danish",
    de: "German",
    en: "English",
    es: "Spanish",
    fi: "Finnish",
    fr: "French",
    hi: "Hindi",
    hu: "Hungarian",
    is: "Icelandic",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    "nb-no": "Norwegian (Bokmål)",
    nb: "Norwegian (Bokmål)",
    nl: "Dutch",
    no: "Norwegian",
    pl: "Polish",
    "pt-br": "Portuguese (Brazil)",
    "pt-pt": "Portuguese (Portugal)",
    pt: "Portuguese",
    "ro-ro": "Romanian",
    sv: "Swedish",
    th: "Thai",
    tr: "Turkish",
    vi: "Vietnamese",
    "zh-cn": "Chinese (Simplified)",
    "zh-tw": "Chinese (Traditional)",
    zh: "Chinese",
};

const availableLocales = Object.keys(localeLabelMap);

const getLocaleLabel = (code, fallback = "") => {
    if (!code) return fallback || "Unknown";
    const lc = String(code).toLowerCase();
    return fallback || localeLabelMap[lc] || code.toUpperCase();
};

export async function loader({ request }) {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;

    const languageOptions = availableLocales.map((locale) => ({
        value: locale,
        label: getLocaleLabel(locale),
    }));

    const settings = await prisma.shop_settings.findUnique({
        where: { shop },
    });

    const initialSettings = settings || {
        storage_service: "google_drive",
        metafield_type: "",
        metafield_key: "",
        dont_attach_to_variants: false,
        dont_delete_replaced_images: false,
        app_language: "en",
    };

    return json({
        languageOptions,
        settings: initialSettings,
    });
}

export async function action({ request }) {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;

    const formData = await request.formData();
    const app_language = formData.get("app_language");
    const storage_service = formData.get("storage_service");
    const metafield_type = formData.get("metafield_type");
    const metafield_key = formData.get("metafield_key");
    const dont_attach_to_variants = formData.get("dont_attach_to_variants") === "true";
    const dont_delete_replaced_images = formData.get("dont_delete_replaced_images") === "true";

    try {
        await prisma.shop_settings.upsert({
            where: { shop },
            update: {
                app_language,
                storage_service,
                metafield_type,
                metafield_key,
                dont_attach_to_variants,
                dont_delete_replaced_images,
            },
            create: {
                shop,
                app_language,
                storage_service,
                metafield_type,
                metafield_key,
                dont_attach_to_variants,
                dont_delete_replaced_images,
            },
        });

        return json({ success: true });
    } catch (error) {
        console.error("Failed to save settings", error);
        return json({ success: false, error: "Failed to save settings." }, { status: 500 });
    }
}

export default function InstallationPage() {
    const { languageOptions, settings: initialSettings } = useLoaderData();
    const { t } = useI18n();
    const fetcher = useFetcher();
    const [appLanguage, setAppLanguage] = useState(initialSettings.app_language || "en");
    const [storageService, setStorageService] = useState(initialSettings.storage_service);
    const [metafieldType, setMetafieldType] = useState(initialSettings.metafield_type || "");
    const [metafieldKey, setMetafieldKey] = useState(initialSettings.metafield_key || "");
    const [dontAttachToVariants, setDontAttachToVariants] = useState(initialSettings.dont_attach_to_variants);
    const [dontDeleteReplacedImages, setDontDeleteReplacedImages] = useState(initialSettings.dont_delete_replaced_images);

    const [toastActive, setToastActive] = useState(false);
    const [toastError, setToastError] = useState("");
    const appBridge = useAppBridge();

    const isDirty = useMemo(() => {
        return (
            (initialSettings.app_language || "en") !== appLanguage ||
            initialSettings.storage_service !== storageService ||
            (initialSettings.metafield_type || "") !== metafieldType ||
            (initialSettings.metafield_key || "") !== metafieldKey ||
            initialSettings.dont_attach_to_variants !== dontAttachToVariants ||
            initialSettings.dont_delete_replaced_images !== dontDeleteReplacedImages
        );
    }, [initialSettings, appLanguage, storageService, metafieldType, metafieldKey, dontAttachToVariants, dontDeleteReplacedImages]);

    const saveBarId = "app-settings-save-bar";

    useEffect(() => {
        if (!appBridge) return;
        if (isDirty) {
            try { appBridge.saveBar?.show(saveBarId); } catch (e) { }
        } else {
            try { appBridge.saveBar?.hide(saveBarId); } catch (e) { }
        }
    }, [appBridge, isDirty]);

    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data) {
            if (fetcher.data.success) {
                setToastError("");
                setToastActive(true);
            } else if (fetcher.data.error) {
                setToastError(fetcher.data.error);
                setToastActive(true);
            }
        }
    }, [fetcher.state, fetcher.data]);

    const handleSave = () => {
        const formData = new FormData();
        formData.append("app_language", appLanguage);
        formData.append("storage_service", storageService);
        formData.append("metafield_type", metafieldType);
        formData.append("metafield_key", metafieldKey);
        formData.append("dont_attach_to_variants", dontAttachToVariants);
        formData.append("dont_delete_replaced_images", dontDeleteReplacedImages);
        fetcher.submit(formData, { method: "post" });
    };

    const handleDiscard = () => {
        setAppLanguage(initialSettings.app_language || "en");
        setStorageService(initialSettings.storage_service);
        setMetafieldType(initialSettings.metafield_type || "");
        setMetafieldKey(initialSettings.metafield_key || "");
        setDontAttachToVariants(initialSettings.dont_attach_to_variants);
        setDontDeleteReplacedImages(initialSettings.dont_delete_replaced_images);
    };


    return (
        <Frame>
            <Page title={t("settings.title", "Settings")}>
                <BlockStack gap="500">
                    <InlineGrid gap="400" columns={2}>
                        <Box>
                            <Text as="h2" fontWeight="bold">
                                {t("settings.language.heading", "App Language")}
                            </Text>
                            <Text as="p" tone="subdued">
                                {t("settings.language.description", "Choose the language for your app interface.")}
                            </Text>
                        </Box>
                        <Card>
                            <Select
                                label={t("settings.language.label", "Language")}
                                options={languageOptions}
                                value={appLanguage}
                                onChange={setAppLanguage}
                            />
                        </Card>
                    </InlineGrid>

                    <Divider />

                    <InlineGrid gap="400" columns={2}>
                        <Box>
                            <Text as="h2" fontWeight="bold">
                                Image source
                            </Text>
                            <Text as="p" tone="subdued">
                                Choose where your images are stored.
                            </Text>
                        </Box>
                        <Card>
                            <Select
                                label="Storage service"
                                options={[
                                    { label: 'Google Drive', value: 'google_drive' },
                                    { label: 'Dropbox', value: 'dropbox' },
                                ]}
                                value={storageService}
                                onChange={setStorageService}
                            />
                        </Card>
                    </InlineGrid>

                    <Divider />

                    <InlineGrid gap="400" columns={2}>
                        <Box>
                            <Text as="h2" fontWeight="bold">
                                Metafield matching (optional)
                            </Text>
                            <Text as="p" tone="subdued">
                                Choose which metafield to use for image matching. You don't need to set metafields for SKU, Barcode, or Title matches. These options are available automatically once your Google Drive or Dropbox is connected.
                            </Text>
                        </Box>
                        <Card>
                            <BlockStack gap="300">
                                <Select
                                    label="Metafield type"
                                    options={[
                                        { label: 'Choose type', value: '' },
                                        { label: 'Product', value: 'product' },
                                        { label: 'Variant', value: 'variant' },
                                    ]}
                                    value={metafieldType}
                                    onChange={setMetafieldType}
                                />
                                <TextField
                                    label="Metafield namespace and key"
                                    value={metafieldKey}
                                    onChange={setMetafieldKey}
                                    placeholder="namespace.key"
                                    helpText={
                                        <Text as="p" tone="subdued">
                                            The metafield namespace and key can be found in <Link url="https://admin.shopify.com/store/placeholder/settings/custom_data" target="_blank">Custom data</Link>.
                                        </Text>
                                    }
                                    autoComplete="off"
                                />
                            </BlockStack>
                        </Card>
                    </InlineGrid>

                    <Divider />

                    <InlineGrid gap="400" columns={2}>
                        <Box>
                            <Text as="h2" fontWeight="bold">
                                Upload preferences
                            </Text>
                            <Text as="p" tone="subdued">
                                Choose how images are handled during upload.
                            </Text>
                        </Box>
                        <Card>
                            <BlockStack gap="200">
                                <Checkbox
                                    label="Don't attach images to variants"
                                    checked={dontAttachToVariants}
                                    onChange={setDontAttachToVariants}
                                />
                                <Checkbox
                                    label="Don't delete replaced images from 'Files'"
                                    checked={dontDeleteReplacedImages}
                                    onChange={setDontDeleteReplacedImages}
                                />
                            </BlockStack>
                        </Card>
                    </InlineGrid>

                    <InlineStack align="end">
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            loading={fetcher.state !== "idle"}
                            disabled={!isDirty}
                        >
                            Save
                        </Button>
                    </InlineStack>
                </BlockStack>
            </Page>
            <SaveBar id={saveBarId}>
                <button
                    variant="primary"
                    onClick={handleSave}
                    disabled={fetcher.state !== "idle" || !isDirty}
                >
                    {t("settings.language.save", "Save")}
                </button>
                <button
                    onClick={handleDiscard}
                    disabled={fetcher.state !== "idle" || !isDirty}
                >
                    {t("settings.language.discard", "Discard")}
                </button>
            </SaveBar>

            {toastActive && (
                <Toast
                    content={toastError || t("settings.language.saved", "Settings saved")}
                    error={Boolean(toastError)}
                    onDismiss={() => {
                        setToastActive(false);
                        setToastError("");
                    }}
                />
            )}
        </Frame>
    );
}
