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
    Frame,
    Toast,
    BlockStack,
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

    const primaryLocale = "en";
    const fallbackLocale = languageOptions?.[0]?.value || "en";

    const settings = await prisma.shop_settings.findUnique({
        where: { shop },
    });

    const selectedLanguage =
        (settings?.app_language || primaryLocale || fallbackLocale || "en").toLowerCase();

    return json({
        languageOptions,
        selectedLanguage,
    });
}

export async function action({ request }) {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;

    const formData = await request.formData();
    const appLanguage = (formData.get("app_language") || "").toString().trim().toLowerCase();

    const allowedValues = availableLocales;

    if (!appLanguage || !allowedValues.includes(appLanguage)) {
        return json(
            { success: false, error: "Invalid language selection." },
            { status: 400 },
        );
    }

    try {
        await prisma.shop_settings.upsert({
            where: { shop },
            update: { app_language: appLanguage },
            create: { shop, app_language: appLanguage },
        });

        return json({ success: true, app_language: appLanguage });
    } catch (error) {
        console.error("Failed to save settings", error);
        return json({ success: false, error: "Failed to save settings." }, { status: 500 });
    }
}

export default function InstallationPage() {
    const { languageOptions, selectedLanguage: initialLanguage } = useLoaderData();
    const { t } = useI18n();
    const fetcher = useFetcher();
    const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
    const [toastActive, setToastActive] = useState(false);
    const [toastError, setToastError] = useState("");
    const appBridge = useAppBridge();

    const isDirty = useMemo(() => {
        return initialLanguage !== selectedLanguage;
    }, [initialLanguage, selectedLanguage]);

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

    const handleLanguageChange = useCallback(
        (value) => setSelectedLanguage(value),
        []
    );

    const handleSave = () => {
        const formData = new FormData();
        formData.append("app_language", selectedLanguage);
        fetcher.submit(formData, { method: "post" });
    };

    const handleDiscard = () => {
        setSelectedLanguage(initialLanguage);
    };


    return (
        <Frame>
            <Page title={t("settings.title", "Settings")}>
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
                        <BlockStack gap="400">
                            <Select
                                label={t("settings.language.label", "Language")}
                                name="app_language"
                                options={languageOptions}
                                onChange={handleLanguageChange}
                                value={selectedLanguage}
                                disabled={fetcher.state !== "idle"}
                            />
                            <InlineStack align="end">
                                <Button
                                    variant="primary"
                                    onClick={handleSave}
                                    loading={fetcher.state !== "idle"}
                                    disabled={!isDirty}
                                >
                                    {t("settings.language.save", "Save")}
                                </Button>
                            </InlineStack>
                        </BlockStack>
                    </Card>
                </InlineGrid>
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
