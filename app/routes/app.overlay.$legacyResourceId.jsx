import { useFetcher, useLoaderData, useNavigate, Link as RemixLink } from "@remix-run/react";
import {
  Autocomplete,
  Avatar,
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  DropZone,
  EmptyState,
  Form,
  FormLayout,
  Icon,
  InlineError,
  InlineGrid,
  InlineStack,
  Label,
  Link,
  List,
  Page,
  Pagination,
  ResourceItem,
  ResourceList,
  Select,
  Tabs,
  Tag,
  Text,
  TextField,
  Thumbnail,
  SkeletonBodyText, Spinner,
} from "@shopify/polaris";
import {
  ArrowLeftIcon,
  DeleteIcon,
  EditIcon,
  ImageWithTextOverlayIcon,
  ListBulletedIcon,
  NoteIcon, PlusCircleIcon,
  TextIcon,
  UploadIcon,
  ViewIcon,
  XIcon,
} from "@shopify/polaris-icons";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ColorPickerPopover } from "../component/ColorPickerPopover";
import { DEFAULT_IMAGE_CONFIG, DEFAULT_TEXT_CONFIG } from "../component/Utils";
import { SaveBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { GET_SHOPIFY_PRODUCT } from "../component/ShopifyQuery";
import prisma from "../db.server";
// import fs from "fs/promises";
// import path from "path";
import { CommonModal } from "../component/CommonModal";
import { OverlayPreviewModal } from "../component/OverlayPreviewModal";
import { deleteFile, uploadFile } from '../helper.js';

const fetchOverlays = async (legacyResourceId, shop, skip, perPage = 10) => {
  try {
    const [overlays, totalCount] = await Promise.all([
      prisma.product_overlays.findMany({
        skip: skip,
        take: perPage,
        where: {
          product_id: legacyResourceId,
          shop_id: shop,
        },
        orderBy: { id: "asc" },
      }),
      prisma.product_overlays.count({
        where: {
          product_id: legacyResourceId,
          shop_id: shop,
        },
      }),
    ]);

    return { overlays, totalCount };
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};
export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { legacyResourceId } = params;
  const perPage = 10;
  const skip = 0;

  const productId = `gid://shopify/Product/${legacyResourceId}`;
  const response = await admin.graphql(GET_SHOPIFY_PRODUCT, {
    variables: { id: productId },
  });
  const data = await response.json();

  const { overlays: productOverlays, totalCount } = await fetchOverlays(
    legacyResourceId,
    session?.shop,
    skip,
    perPage,
  );

  return {
    product: data.data.product,
    productOverlays: productOverlays,
    shop: session?.shop,
    pagination: {
      currentPage: 1,
      perPage,
      totalCount,
      totalPages: Math.ceil(totalCount / perPage),
    },
  };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const product_id = formData.get("product_id");
  const product_title = formData.get("product_title");
  const product_handle = formData.get("product_handle");
  const shop = formData.get("shop");
  const page = parseInt(formData.get("page")) || 1;
  const perPage = parseInt(formData.get("perPage")) || 10;
  const skip = (page - 1) * perPage;

  try {
    let data = null;
    let recordId = null;

    if (actionType === "fetch_page") {
      const page = parseInt(formData.get("page")) || 1;
      const perPage = parseInt(formData.get("perPage")) || 10;
      const skip = (page - 1) * perPage;

      const { overlays: productOverlays, totalCount } = await fetchOverlays(
        product_id,
        shop,
        skip,
        perPage,
      );

      return {
        success: true,
        type: actionType,
        productOverlays,
        pagination: {
          currentPage: page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage),
        },
      };
    } else if (actionType === "TEXT") {
      const textOverlay = JSON.parse(formData.get("textOverlay") || "{}");
      recordId = textOverlay?.id || null;

      data = {
        type: "TEXT",
        shop_id: shop,
        product_title: product_title,
        product_handle: product_handle,
        product_id: product_id,
        text: textOverlay?.text,
        font_family: textOverlay?.font_family,
        font_size: textOverlay?.font_size,
        font_color: textOverlay?.font_color,
        font_weight: textOverlay?.font_weight,
        font_style: textOverlay?.font_style,
        bg_color: textOverlay?.bg_color,
        opacity: textOverlay?.opacity,
        rotation: textOverlay?.rotation,
        text_align: textOverlay?.text_align,
        position: textOverlay?.position,
        padding_top: textOverlay?.padding_top,
        padding_right: textOverlay?.padding_right,
        padding_bottom: textOverlay?.padding_bottom,
        padding_left: textOverlay?.padding_left,
        status: "Active",
        display_in: textOverlay?.display_in,
        scale_in_product: textOverlay.scale_in_product,
        scale_in_collection: textOverlay?.scale_in_collection,
        scale_in_search: textOverlay?.scale_in_search,
      };

    } else if (actionType === "IMAGE") {
      const imageOverlay = JSON.parse(formData.get("imageOverlay"));
      recordId = imageOverlay?.id || null;
      let image_url = imageOverlay.image_url || null;

      // Handle new file upload
      const imageFile = formData.get("image_file");
      if (imageFile && imageFile instanceof File) {
          const fileBuffer = Buffer.from(await imageFile.arrayBuffer());
          try {
          const fileName = `${imageOverlay?.id || "image"}-${Date.now()}.jpg`;
          const fileObj = {
              fileName: fileName,
              filePath: fileBuffer,
              fileType: imageFile.type,
              bucket:'new-easyoverlay-dev',
              key:`public-app/${shop}/${fileName}`,
          }
           const awsFileUrl = await uploadFile(fileObj);
            if (awsFileUrl) {
                // if (recordId){
                //   let overlayItem = await prisma.product_overlays.findUnique({
                //       where: { id: recordId },
                //   });
                //
                //   if (overlayItem?.image_url) {
                //       const deleted = await deleteFile(overlayItem.image_url);
                //       if (!deleted) {
                //           console.warn("⚠️ Image could not be deleted from S3, continuing...");
                //       }
                //   }
                // }
                //TODO:  on the top of the function so i will ask the client and add permission on the aws object it will affect almost all the object so just code it for now

                image_url = awsFileUrl;
            }
        } catch (error) {
          console.error("Error uploading image:", error);
          return {
            success: false,
            errors: [
              {
                path: "toast",
                message: "imageUploadFailed",
              },
            ],
          };
        }
      }

      data = {
        type: 'IMAGE',
        shop_id: shop,
        product_title: product_title,
        product_handle: product_handle,
        product_id: product_id,
        image_url: image_url,
        opacity: imageOverlay.opacity,
        rotation: imageOverlay.rotation,
        position: imageOverlay.position,
        padding_top: imageOverlay.padding_top,
        padding_right: imageOverlay.padding_right,
        padding_bottom: imageOverlay.padding_bottom,
        padding_left: imageOverlay.padding_left,
        scale_in_product: imageOverlay.scale_in_product,
        scale_in_collection: imageOverlay.scale_in_collection,
        scale_in_search: imageOverlay.scale_in_search,
        display_in: imageOverlay.display_in || [],
        status: "Active"
      };
    } else if (actionType === "update_status") {
      const newStatus = formData.get("current_status");
      let overlayId = formData.get("overlay_id");
      const overlay_id =
        typeof overlayId === "string" ? parseInt(overlayId) : overlayId;

      const overlayRecord = await prisma.product_overlays.update({
        where: { id: overlay_id },
        data: { status: newStatus },
      });

      const { overlays: updatedOverlays, totalCount } = await fetchOverlays(
        product_id,
        shop,
        skip,
        perPage,
      );

      return {
        success: true,
        type: actionType,
        data: overlayRecord,
        productOverlays: updatedOverlays,
        pagination: {
          currentPage: page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage),
        },
      };
    } else if (actionType === "delete_overlay") {
      const overlayId = formData.get("overlay_id");
      const overlay_id =
        typeof overlayId === "string" ? parseInt(overlayId) : overlayId;
      const page = 1;
      const perPage = 10;
      const skip = 0;

      //   let overlayItem = await prisma.product_overlays.findUnique({
      //       where: { id: overlay_id },
      //   });
      //   if (!overlayItem) throw new Error("Overlay not found")
      //   if (overlayItem?.image_url) {
      //       const deleted = await deleteFile(overlayItem.image_url);
      //       if (!deleted) {
      //           console.warn("⚠️ Image could not be deleted from S3, continuing...");
      //       }
      //   }
        //TODO:  on the top of the function so i will ask the client and add permission on the aws object it will affect almost all the object so just code it for now

      const overlayRecord = await prisma.product_overlays.delete({
        where: { id: overlay_id },
      });

      const { overlays: updatedOverlays, totalCount } = await fetchOverlays(
        product_id,
        shop,
        skip,
        perPage,
      );

      return {
        success: true,
        type: actionType,
        data: overlayRecord,
        productOverlays: updatedOverlays,
        pagination: {
          currentPage: page,
          perPage,
          totalCount: totalCount,
          totalPages: Math.ceil(totalCount / perPage),
        },
      };
    }

    // Upsert text overlay (update if exists, create if not)
    let overlayRecord = null;
    if (recordId) {
      overlayRecord = await prisma.product_overlays.update({
        where: { id: recordId },
        data: data,
      });
    } else {
      overlayRecord = await prisma.product_overlays.create({
        data: data,
      });
    }

    // Fetch updated overlays after save
    const { overlays: updatedOverlays, totalCount } = await fetchOverlays(
      product_id,
      shop,
      skip,
      perPage,
    );

    return {
      success: true,
      type: actionType,
      data: overlayRecord,
      productOverlays: updatedOverlays,
      pagination: {
        currentPage: page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function Overlay() {
  const initialData = useLoaderData();
  const [overlayList, setOverlayList] = useState(initialData?.productOverlays);
  const [tabSelected, setTabSelected] = useState(0);
  const [showImageError, setShowImageError] = useState("");
  const [activePopover, setActivePopover] = useState(null);
  const initialTextConfig = useRef(DEFAULT_TEXT_CONFIG);
  const initialImageConfig = useRef(DEFAULT_IMAGE_CONFIG);
  const [isBackLoading, setIsBackLoading] = useState(false);

  const [textOverlay, setTextOverlay] = useState(DEFAULT_TEXT_CONFIG);
  const [imageOverlay, setImageOverlay] = useState(DEFAULT_IMAGE_CONFIG);
  const [overlayDetailOpen, setOverlayDetailOpen] = useState(false);
  const [removeOverlayId, setRemoveOverlayId] = useState(0);
  const [removeModalActive, setRemoveModalActive] = useState(false);
  const [updateStatusModal, setUpdateStatusModal] = useState({
    open: false,
    id: null,
    status: "",
  });

  const [openOverlayPreviewModal, setOpenOverlayPreviewModal] = useState(!overlayList?.length);
  const [loader, setLoader] = useState("");
  const fetcher = useFetcher();

  const [ReactSwitch, setReactSwitch] = useState(null);

  useEffect(() => {
    import("react-switch").then((module) => {
      setReactSwitch(() => module.default);
    });
  }, []);

  const [pagination, setPagination] = useState(
    initialData?.pagination || {
      currentPage: 1,
      perPage: 10,
      totalCount: 0,
      totalPages: 1,
    },
  );

  const prodImage =
    initialData?.product?.featuredMedia?.preview?.image?.originalSrc ||
    "/Image/default_product.jpg";

  const saveBarId = "my-save-bar";
  const navigate = useNavigate();

  const tabs = [
    {
      id: "List",
      content: (
        <span style={{ display: "flex", alignItems: "center" }}>
          <span style={{ marginRight: "10px" }}>
            <Icon source={ListBulletedIcon} tone="inherit" />
          </span>
          <span>List</span>
        </span>
      ),
      panelID: "list",
    },
    {
      id: "Text overlay",
      content: (
        <span style={{ display: "flex", alignItems: "center" }}>
          <span style={{ marginRight: "10px" }}>
            <Icon source={TextIcon} tone="inherit" />
          </span>
          <span>Overlay</span>
        </span>
      ),
      panelID: "text-overlay",
    },
    {
      id: "Image overlay",
      content: (
        <span style={{ display: "flex", alignItems: "center" }}>
          <span style={{ marginRight: "10px" }}>
            <Icon source={ImageWithTextOverlayIcon} tone="inherit" />
          </span>
          <span>Overlay</span>
        </span>
      ),
      panelID: "image-overlay",
    },
  ];

  const textAlignOptions = [
    { label: 'Select option', value: '' },
    { label: 'Left', value: 'LEFT' },
    { label: 'Center', value: 'CENTER' },
    { label: 'Right', value: 'RIGHT' },
  ];

  const textPositionOptions = [
    { label: 'Select option', value: '' },
    { label: 'Top Left', value: 'TOP_LEFT' },
    { label: 'Top Center', value: 'TOP_CENTER' },
    { label: 'Top Right', value: 'TOP_RIGHT' },
    { label: 'Middle Left', value: 'MIDDLE_LEFT' },
    { label: 'Middle Center', value: 'MIDDLE_CENTER' },
    { label: 'Middle Right', value: 'MIDDLE_RIGHT' },
    { label: 'Bottom Left', value: 'BOTTOM_LEFT' },
    { label: 'Bottom Center', value: 'BOTTOM_CENTER' },
    { label: 'Bottom Right', value: 'BOTTOM_RIGHT' },
  ];

  const textFontFamilyOptions = [
    { label: "Select option", value: "" },
    { label: "Arial", value: "Arial" },
    { label: "Arial Black", value: "Arial Black" },
    { label: "Verdana", value: "Verdana" },
    { label: "Tahoma", value: "Tahoma" },
    { label: "Trebuchet MS", value: "Trebuchet MS" },
    { label: "Impact", value: "Impact" },
    { label: "Times New Roman", value: "Times New Roman" },
    { label: "Didot", value: "Didot" },
    { label: "Georgia", value: "Georgia" },
    { label: "American Typewriter", value: "American Typewriter" },
    { label: "Andalé Mono", value: "Andalé Mono" },
    { label: "Courier", value: "Courier" },
    { label: "Lucida Console", value: "Lucida Console" },
    { label: "Monaco", value: "Monaco" },
    { label: "Bradley Hand", value: "Bradley Hand" },
    { label: "Brush Script MT", value: "Brush Script MT" },
    { label: "Luminari", value: "Luminari" },
    { label: "Comic Sans MS", value: "Comic Sans MS" },
  ];

  const textFontWeightOptions = [
    { label: "Select option", value: "" },
    { label: "Light", value: "lighter" },
    { label: "Normal", value: "normal" },
    { label: "Bold", value: "bold" },
    { label: "Bolder", value: "bolder" },
  ];

  const textFontStyleOptions = [
    { label: "Select option", value: "" },
    { label: "Normal", value: "normal" },
    { label: "Italic", value: "italic" },
  ];

  function handleTextSetting(key, value) {
    setTextOverlay((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleImageSetting(key, value) {
    setImageOverlay((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  const handleTabChange = (selectedTabIndex) => {
    const isDirty =
      JSON.stringify(textOverlay) !==
      JSON.stringify(initialTextConfig.current) ||
      JSON.stringify(imageOverlay) !==
      JSON.stringify(initialImageConfig.current);
    if (isDirty) {
      shopify.saveBar.leaveConfirmation(saveBarId);
    } else {
      setTabSelected(selectedTabIndex);
      handleElementEditTime(selectedTabIndex == 1);
      setTextOverlay(DEFAULT_TEXT_CONFIG);
      setImageOverlay(DEFAULT_IMAGE_CONFIG);
      initialTextConfig.current = DEFAULT_TEXT_CONFIG;
      initialImageConfig.current = DEFAULT_IMAGE_CONFIG;
    }
  };

  useEffect(() => {
    const isDirty =
      JSON.stringify(textOverlay) !==
      JSON.stringify(initialTextConfig.current) ||
      JSON.stringify(imageOverlay) !==
      JSON.stringify(initialImageConfig.current);
    if (isDirty) {
      shopify.saveBar.show(saveBarId);
    } else {
      shopify.saveBar.hide(saveBarId);
    }
  }, [
    textOverlay,
    imageOverlay,
    initialTextConfig.current,
    initialImageConfig.current,
  ]);

  function SkeletonCard() {
    return (
      <div style={{ marginBottom: "20px" }}>
        <Card>
          <BlockStack gap="200">
            <SkeletonBodyText />
          </BlockStack>
        </Card>
      </div>
    );
  }

  const deselectedOptions = useMemo(
    () => [
      { value: "product", label: "Product" },
      { value: "collection", label: "Collection" },
      { value: "search", label: "Search" },
    ],
    [],
  );

  const removeTag = useCallback(
    (tag) => () => {
      const options = [...textOverlay?.display_in];
      options.splice(options.indexOf(tag), 1);
      handleTextSetting("display_in", options);
    },
    [textOverlay?.display_in],
  );

  const verticalContentMarkup =
    textOverlay?.display_in?.length > 0 ? (
      <InlineStack spacing="extraTight" alignment="center">
        {textOverlay?.display_in?.map((option) => {
          let tagLabel = "";
          tagLabel = option.replace("_", " ");
          return (
            <Tag key={`option${option}`} onRemove={removeTag(option)}>
              {tagLabel}
            </Tag>
          );
        })}
      </InlineStack>
    ) : null;

  const textField = (
    <Autocomplete.TextField
      label="Display in"
      verticalContent={verticalContentMarkup}
      autoComplete="off"
    />
  );

  // Image overlay options
  const removeImageTag = useCallback(
    (tag) => () => {
      const options = [...imageOverlay?.display_in];
      options.splice(options.indexOf(tag), 1);
      handleImageSetting("display_in", options);
    },
    [imageOverlay?.display_in],
  );

  const verticalImageContentMarkup =
    imageOverlay?.display_in?.length > 0 ? (
      <InlineStack spacing="extraTight" alignment="center">
        {imageOverlay?.display_in?.map((option) => {
          let tagLabel = "";
          tagLabel = option.replace("_", " ");
          return (
            <Tag key={`option${option}`} onRemove={removeImageTag(option)}>
              {tagLabel}
            </Tag>
          );
        })}
      </InlineStack>
    ) : null;

  const imageField = (
    <Autocomplete.TextField
      label="Display in"
      verticalContent={verticalImageContentMarkup}
      autoComplete="off"
    />
  );

  const showInlineErrors = () => {
    return <InlineError message={showImageError} />;
  };

  const handleDropZoneDrop = (_dropFiles, acceptedFiles, _rejectedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

      const isImage =
          file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".svg");

    // File type validation
    if (!isImage) {
      setShowImageError("Only image files (including SVG) are allowed.");
      return;
    }

    // File size validation
    const isTooLarge = file.size > 2 * 1024 * 1024;
    if (isTooLarge) {
      setShowImageError("File is too large. Max 2MB allowed.");
      return;
    }
    handleImageSetting("image_url", file);
  };

  // color picker configuration
  const togglePopover = (key) => {
    setActivePopover(activePopover === key ? null : key);
  };

  const handleColorChange = (key, type, value) => {
    let colorVal = type == "TEXT" || type == "text" ? value : hsbaToHex(value);
    if (key === "font_color") handleTextSetting(key, colorVal);
    else handleTextSetting(key, colorVal);
  };
  function hsbaToHex({ hue, saturation, brightness, alpha = 1 }) {
    const rgb = hsbToRgb(hue, saturation, brightness);
    const hex = rgbToHex(rgb);
    const alphaHex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${alphaHex}`;
  }

  // Convert HSB to RGB
  function hsbToRgb(h, s, b) {
    const c = b * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = b - c;

    let r, g, b_;
    if (h >= 0 && h < 60) [r, g, b_] = [c, x, 0];
    else if (h < 120) [r, g, b_] = [x, c, 0];
    else if (h < 180) [r, g, b_] = [0, c, x];
    else if (h < 240) [r, g, b_] = [0, x, c];
    else if (h < 300) [r, g, b_] = [x, 0, c];
    else [r, g, b_] = [c, 0, x];

    return {
      red: Math.round((r + m) * 255),
      green: Math.round((g + m) * 255),
      blue: Math.round((b_ + m) * 255),
    };
  }

  // Convert RGB to HEX
  function rgbToHex({ red, green, blue }) {
    return `#${[red, green, blue]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  const handleSave = async () => {
    try {
      setLoader("save");
      if (tabSelected == 1 && !textOverlay?.text) {
        shopify.toast.show("Please enter text for the overlay", { isError: true });
        setLoader("");
        return;
      }
      if (tabSelected == 2) {
        const hasImage = imageOverlay?.image_url && !(imageOverlay?.image_url instanceof File && imageOverlay?.image_url.name === "");
        if (!hasImage) {
          shopify.toast.show("Please select an image for the overlay", { isError: true });
          setLoader("");
          return;
        }
      }
      const formData = new FormData();
      formData.append("shop", initialData?.shop);
      formData.append("page", pagination.currentPage);
      formData.append("perPage", pagination.perPage);
      formData.append("product_title", initialData?.product?.title);
      formData.append("product_handle", initialData?.product?.handle);
      if (tabSelected == 1) {
        formData.append("actionType", "TEXT");
        formData.append("product_id", initialData?.product?.legacyResourceId);
        formData.append("textOverlay", JSON.stringify(textOverlay));
      } else if (tabSelected == 2) {
        formData.append("actionType", "IMAGE");
        formData.append("product_id", initialData?.product?.legacyResourceId);

        // Append image file if it's a File object
        if (imageOverlay?.image_url instanceof File) {
          formData.append(
            "image_file",
            imageOverlay?.image_url,
            imageOverlay?.image_url.name,
          );
        }
        formData.append("imageOverlay", JSON.stringify(imageOverlay));
      }
      fetcher.submit(formData, {
        method: "post",
        encType: "multipart/form-data",
      });
    } catch (e) {
      console.log(e)
    }

  };

  // Update state when fetcher returns new data
  useEffect(() => {
    if (fetcher.data && fetcher.data.success && fetcher.state === "idle") {
      setLoader("");
      if (fetcher.data.type === "TEXT") {
        shopify.toast.show(`Overlay saved successfully`);
        initialTextConfig.current = textOverlay;
      } else if (fetcher.data.type === "IMAGE") {
        shopify.toast.show(`Overlay saved successfully`);
        initialImageConfig.current = imageOverlay;
      } else if (fetcher.data.type === "update_status") {
        handleUpdateCloseModal();
        shopify.toast.show(`Status updated successfully`);
      } else if (fetcher.data.type === "delete_overlay") {
        shopify.toast.show(`Delete overlay successfully`);
        handleRemoveOvelayModal();
      }
      // Update overlay list with new data from action
      if (fetcher.data.productOverlays) {
        setOverlayList(fetcher.data.productOverlays);
        setPagination(fetcher.data.pagination);
      }
      shopify.saveBar.hide(saveBarId);
      handleTabChange(0);
    }
  }, [fetcher.data, fetcher.state]);

  const handleDiscard = () => {
    setTextOverlay(initialTextConfig.current);
    setImageOverlay(initialImageConfig.current);

    if (shopify.saveBar) {
      setTimeout(() => {
        shopify?.saveBar?.hide(saveBarId);
      }, 100);
    }
  };

  const handleDetailToggle = (targetId) => {
    setOverlayDetailOpen({
      ...overlayDetailOpen,
      [targetId]: overlayDetailOpen[targetId]
        ? !overlayDetailOpen[targetId]
        : true,
    });
  };

  //#region :- Remove Overlay
  const handleRemoveOvelayModal = useCallback(
    () => setRemoveModalActive(!removeModalActive),
    [removeModalActive],
  );
  const handleRemoveOvelay = (overlay_id) => {
    handleRemoveOvelayModal();
    setRemoveOverlayId(overlay_id);
  };

  const handleUpdateCloseModal = () => {
    setUpdateStatusModal({ open: false, id: null, status: "" });
  };

  const handleStatusUpdate = () => {
    handleChangeStatus(updateStatusModal?.id, updateStatusModal?.status);
  };

  //#region :- Change Preview As Per Overlay Settings

    const handleElementEditTime = (isHide = false) => {
        const allTextOverlay = document.querySelectorAll(`.text-data-overlay`);
        if (allTextOverlay?.length > 0) {
            allTextOverlay.forEach(overlayEle => {
                overlayEle.style.display = isHide ? "none" : 'flex';
            })
        }
    }

  useEffect(() => {
    let didComplete = false;
    if (!didComplete) {
      if (document.getElementById("overlayImageBase") != undefined) {
        let imgElem = document.getElementById("overlayImageBase");
        handleElementEditTime(tabSelected == 1);
        let textSelectionLength = document.getElementsByClassName(
          "overlay-text-section",
        ).length;
        let imageSelectionLength = document.getElementsByClassName(
          "overlay-image-section",
        ).length;
        if (
          document.getElementsByClassName("overlay-text-section").length > 0
        ) {
          for (let i = 0; i < textSelectionLength; i++) {
            document.getElementsByClassName("overlay-text-section")[0].remove();
          }
        }
        if (
          document.getElementsByClassName("overlay-image-section").length > 0
        ) {
          for (let i = 0; i < imageSelectionLength; i++) {
            document
              .getElementsByClassName("overlay-image-section")[0]
              .remove();
          }
        }

        if (tabSelected == 1) {
          //text overlay
          var overlayDiv = document.createElement("div");
          overlayDiv.className = "overlay-text-section";

          let isProdScaleAdded = false;
          if (textOverlay?.scale_in_product > 0) {
            isProdScaleAdded = true;
          }

          //default css
          overlayDiv.style.zIndex = "1";
          overlayDiv.style.width = "auto";
          overlayDiv.style.height = "auto";
          overlayDiv.style.position = "absolute";
          overlayDiv.style.lineHeight = "normal";
          overlayDiv.style.wordBreak = "word-break";
          //default css

          overlayDiv.innerHTML = textOverlay?.text;
          overlayDiv.style.wordBreak = 'break-all';
          if (textOverlay?.font_family != "") {
            overlayDiv.style.fontFamily = textOverlay?.font_family;

            //add google font link in <head>
            var overlayFontLink = document.createElement("link");
            overlayFontLink.setAttribute("rel", "stylesheet");
            overlayFontLink.setAttribute(
              "href",
              "https://fonts.googleapis.com/css?family=" +
              textOverlay?.font_family,
            );
            document
              .getElementsByTagName("head")[0]
              .insertAdjacentElement("beforeend", overlayFontLink);
          }
          if (textOverlay?.font_size != "") {
            overlayDiv.style.fontSize = isProdScaleAdded
              ? (textOverlay?.font_size * textOverlay?.scale_in_product) / 100 +
              "px"
              : textOverlay?.font_size + "px";
          }
          if (textOverlay?.font_weight != "") {
            overlayDiv.style.fontWeight = textOverlay?.font_weight;
          }
          if (textOverlay?.font_style != "") {
            overlayDiv.style.fontStyle = textOverlay?.font_style;
          }
          if (textOverlay?.opacity != "") {
            overlayDiv.style.opacity = textOverlay?.opacity;
          }
          if (textOverlay?.text_align != "") {
            overlayDiv.style.textAlign = textOverlay?.text_align;
          }
          if (textOverlay?.font_color != "") {
            overlayDiv.style.color = textOverlay?.font_color;
          } else {
            overlayDiv.style.backgroundColor = "transparent";
          }
          if (textOverlay?.bg_color != "") {
            overlayDiv.style.backgroundColor = textOverlay?.bg_color;
          } else {
            overlayDiv.style.backgroundColor = "transparent";
          }

          if (textOverlay?.padding_top != "") {
            overlayDiv.style.paddingTop = isProdScaleAdded
              ? (textOverlay?.padding_top * textOverlay?.scale_in_product) /
              100 +
              "px"
              : textOverlay?.padding_top + "px";
          }
          if (textOverlay?.padding_right != "") {
            overlayDiv.style.paddingRight = isProdScaleAdded
              ? (textOverlay?.padding_right * textOverlay?.scale_in_product) /
              100 +
              "px"
              : textOverlay?.padding_right + "px";
          }
          if (textOverlay?.padding_bottom != "") {
            overlayDiv.style.paddingBottom = isProdScaleAdded
              ? (textOverlay?.padding_bottom * textOverlay?.scale_in_product) /
              100 +
              "px"
              : textOverlay?.padding_bottom + "px";
          }
          if (textOverlay?.padding_left != "") {
            overlayDiv.style.paddingLeft = isProdScaleAdded
              ? (textOverlay?.padding_left * textOverlay?.scale_in_product) /
              100 +
              "px"
              : textOverlay?.padding_left + "px";
          }

          let rotate_css = "";
          if (textOverlay?.rotation != "") {
            overlayDiv.style.transform =
              "rotate(" + textOverlay?.rotation + "deg)";
            rotate_css = " rotate(" + textOverlay?.rotation + "deg)";
          }

          if (textOverlay?.position == "TOP_LEFT") {
            overlayDiv.style.top = 0;
            overlayDiv.style.left = 0;
          } else if (textOverlay?.position == "TOP_CENTER") {
            overlayDiv.style.top = 0;
            overlayDiv.style.left = "50%";
            overlayDiv.style.transform = "translateX(-50%)" + rotate_css;
          } else if (textOverlay?.position == "TOP_RIGHT") {
            overlayDiv.style.top = 0;
            overlayDiv.style.left = "auto";
            overlayDiv.style.right = 0;
          } else if (textOverlay?.position == "MIDDLE_LEFT") {
            overlayDiv.style.top = "50%";
            overlayDiv.style.left = 0;
            overlayDiv.style.transform = "translateY(-50%)" + rotate_css;
          } else if (textOverlay?.position == "MIDDLE_CENTER") {
            overlayDiv.style.top = "50%";
            overlayDiv.style.left = "50%";
            overlayDiv.style.transform = "translate(-50%,-50%)" + rotate_css;
          } else if (textOverlay?.position == "MIDDLE_RIGHT") {
            overlayDiv.style.top = "50%";
            overlayDiv.style.left = "auto";
            overlayDiv.style.right = 0;
            overlayDiv.style.transform = "translateY(-50%)" + rotate_css;
          } else if (textOverlay?.position == "BOTTOM_LEFT") {
            overlayDiv.style.top = "auto";
            overlayDiv.style.left = 0;
            overlayDiv.style.bottom = 0;
          } else if (textOverlay?.position == "BOTTOM_CENTER") {
            overlayDiv.style.top = "auto";
            overlayDiv.style.left = "50%";
            overlayDiv.style.bottom = 0;
            overlayDiv.style.transform = "translateX(-50%)" + rotate_css;
          } else if (textOverlay?.position == "BOTTOM_RIGHT") {
            overlayDiv.style.top = "auto";
            overlayDiv.style.left = "auto";
            overlayDiv.style.bottom = 0;
            overlayDiv.style.right = 0;
          }

          //set overlay html before img element
          imgElem.insertAdjacentElement("beforebegin", overlayDiv);

          //set relative css in parent element
          imgElem.parentElement.style.position = "relative";
        } else if (tabSelected == 2) {
          //image overlay
          var overlayDiv = document.createElement("div");
          overlayDiv.className = "overlay-image-section";

          let isProdScaleAdded = false;
          if (imageOverlay?.scale_in_product > 0) {
            isProdScaleAdded = true;
          }

          //default css
          overlayDiv.style.zIndex = "1";
          overlayDiv.style.width = "100%";
          overlayDiv.style.height = "100%";
          overlayDiv.style.position = "absolute";
          overlayDiv.style.display = "flex";
          overlayDiv.style.alignItems = "center";
          overlayDiv.style.justifyContent = "center";
          overlayDiv.style.overflow = "hidden";

          //default css
          if (imageOverlay?.padding_top != "") {
            overlayDiv.style.paddingTop = imageOverlay?.padding_top + "px";
          }
          if (imageOverlay?.padding_right != "") {
            overlayDiv.style.paddingRight = imageOverlay?.padding_right + "px";
          }
          if (imageOverlay?.padding_bottom != "") {
            overlayDiv.style.paddingBottom =
              imageOverlay?.padding_bottom + "px";
          }
          if (imageOverlay?.padding_left != "") {
            overlayDiv.style.paddingLeft = imageOverlay?.padding_left + "px";
          }

          let rotate_css = "";
          if (imageOverlay?.rotation != "") {
            overlayDiv.style.transform =
              "rotate(" + imageOverlay?.rotation + "deg)";
            rotate_css = " rotate(" + imageOverlay?.rotation + "deg)";
          }

          if (imageOverlay?.opacity != "") {
            overlayDiv.style.opacity = imageOverlay?.opacity;
          }

          if (imageOverlay?.position == "TOP_LEFT") {
            overlayDiv.style.top = 0;
            overlayDiv.style.left = 0;
            overlayDiv.style.alignItems = "flex-start";
            overlayDiv.style.justifyContent = "left";
          } else if (imageOverlay?.position == "TOP_CENTER") {
            overlayDiv.style.top = 0;
            overlayDiv.style.left = "50%";
            overlayDiv.style.transform = "translateX(-50%)" + rotate_css;
            overlayDiv.style.alignItems = "flex-start";
            overlayDiv.style.justifyContent = "center";
          } else if (imageOverlay?.position == "TOP_RIGHT") {
            overlayDiv.style.top = 0;
            overlayDiv.style.left = "auto";
            overlayDiv.style.right = 0;
            overlayDiv.style.alignItems = "flex-start";
            overlayDiv.style.justifyContent = "right";
          } else if (imageOverlay?.position == "MIDDLE_LEFT") {
            overlayDiv.style.top = "50%";
            overlayDiv.style.left = 0;
            overlayDiv.style.transform = "translateY(-50%)" + rotate_css;
            overlayDiv.style.alignItems = "center";
            overlayDiv.style.justifyContent = "flex-start";
          } else if (imageOverlay?.position == "MIDDLE_CENTER") {
            overlayDiv.style.top = "50%";
            overlayDiv.style.left = "50%";
            overlayDiv.style.transform = "translate(-50%,-50%)" + rotate_css;
            overlayDiv.style.alignItems = "center";
            overlayDiv.style.justifyContent = "center";
          } else if (imageOverlay?.position == "MIDDLE_RIGHT") {
            overlayDiv.style.top = "50%";
            overlayDiv.style.left = "auto";
            overlayDiv.style.right = 0;
            overlayDiv.style.transform = "translateY(-50%)" + rotate_css;
            overlayDiv.style.alignItems = "center";
            overlayDiv.style.justifyContent = "right";
          } else if (imageOverlay?.position == "BOTTOM_LEFT") {
            overlayDiv.style.top = "auto";
            overlayDiv.style.left = 0;
            overlayDiv.style.bottom = 0;
            overlayDiv.style.alignItems = "flex-end";
            overlayDiv.style.justifyContent = "left";
          } else if (imageOverlay?.position == "BOTTOM_CENTER") {
            overlayDiv.style.top = "auto";
            overlayDiv.style.left = "50%";
            overlayDiv.style.bottom = 0;
            overlayDiv.style.transform = "translateX(-50%)" + rotate_css;
            overlayDiv.style.alignItems = "flex-end";
            overlayDiv.style.justifyContent = "center";
          } else if (imageOverlay?.position == "BOTTOM_RIGHT") {
            overlayDiv.style.top = "auto";
            overlayDiv.style.left = "auto";
            overlayDiv.style.bottom = 0;
            overlayDiv.style.right = 0;
            overlayDiv.style.alignItems = "flex-end";
            overlayDiv.style.justifyContent = "right";
          }

          var overlayImg = document.createElement("img");
          overlayImg.style.position = "absolute";
          overlayImg.src =
            imageOverlay?.image_url instanceof File
              ? window.URL.createObjectURL(imageOverlay?.image_url)
              : imageOverlay?.image_url;
          overlayImg.style.maxWidth = isProdScaleAdded
            ? imageOverlay?.scale_in_product + "%"
            : "50%";

          //set overlay html before img element
          overlayDiv.insertAdjacentElement("afterbegin", overlayImg);
          imgElem.insertAdjacentElement("beforebegin", overlayDiv);

          //set relative css in parent element
          imgElem.parentElement.style.position = "relative";
        }
      }
    }
    return () => {
      didComplete = true;
    };
  }, [textOverlay, imageOverlay]);

  const handleEditTab = (item, type) => {
    handleTabChange(type == 'TEXT' ? 1 : 2);
    if (type == 'TEXT') {
      initialTextConfig.current = item;
      setTextOverlay(item);
    } else {
      initialImageConfig.current = item;
      setImageOverlay(item);
    }
  };

  const handleChangeStatus = (id, status, index) => {
    setLoader("update_status");
    const newStatus = (status == 'Active') ? 'Inactive' : 'Active';

    const formData = new FormData();
    formData.append("actionType", "update_status");
    formData.append("overlay_id", id);
    formData.append("current_status", newStatus);
    formData.append("product_id", initialData?.product?.legacyResourceId);
    formData.append("shop", initialData?.shop);
    formData.append("page", pagination.currentPage);
    formData.append("perPage", pagination.perPage);

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  const deleteOvelayConf = () => {
    setLoader("delete");
    const formData = new FormData();
    formData.append("actionType", "delete_overlay");
    formData.append("overlay_id", removeOverlayId);
    formData.append("product_id", initialData?.product?.legacyResourceId);
    formData.append("shop", initialData?.shop);
    formData.append("page", pagination.currentPage);
    formData.append("perPage", pagination.perPage);

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  // Pagination handlers
  const handlePreviousPage = () => {
    if (pagination.currentPage > 1) {
      const newPage = pagination.currentPage - 1;
      fetchPage(newPage);
    }
  };

  const handleNextPage = () => {
    if (pagination.currentPage < pagination.totalPages) {
      const newPage = pagination.currentPage + 1;
      fetchPage(newPage);
    }
  };

  const fetchPage = (page) => {
    const formData = new FormData();
    formData.append("actionType", "fetch_page");
    formData.append("product_id", initialData?.product?.legacyResourceId);
    formData.append("shop", initialData?.shop);
    formData.append("page", page);
    formData.append("perPage", pagination.perPage);

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  const getPositionStyles = (textOverlay) => {
    let rotate_css = "";
    if (textOverlay?.rotation != "") {
      rotate_css = " rotate(" + textOverlay?.rotation + "deg)";
    }

    let prepareStyleObject = {};
    switch (textOverlay.position) {
      case "TOP_LEFT":
          prepareStyleObject = {
            top: 0,
            left: 0,
            alignItems :"flex-start",
            justifyContent : "left",
            transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
        };
          break;
      case "TOP_CENTER":
          prepareStyleObject = {
            top: 0, left: "50%", transform: "translateX(-50%)" + rotate_css,
            alignItems: "flex-start",
            justifyContent: "center",
        };
          break;
      case "TOP_RIGHT":
          prepareStyleObject = { top: 0, right: 0,
            alignItems : "flex-start",
            justifyContent : "right",
            transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
          };
          break;
      case "MIDDLE_LEFT":
          prepareStyleObject = { top: "50%", left: 0, transform: "translateY(-50%)" + rotate_css,
            alignItems: "center",
            justifyContent : "flex-start",
        };
          break;
      case "MIDDLE_CENTER":
          prepareStyleObject = {
            top: "50%", left: "50%", transform: "translate(-50%,-50%)" + rotate_css,
            alignItems : "center",
            justifyContent : "center",
        };
          break;
      case "MIDDLE_RIGHT":
          prepareStyleObject = { top: "50%", right: 0, transform: "translateY(-50%)" + rotate_css,
            alignItems : "center",
            justifyContent : "right",
        };
          break;
      case "BOTTOM_LEFT":
          prepareStyleObject =  {
            bottom: 0, left: 0,
            alignItems: "flex-end",
            justifyContent : "left",
            transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
          };
          break;
      case "BOTTOM_CENTER":
          prepareStyleObject =  { bottom: 0, left: "50%", transform: "translateX(-50%)" + rotate_css,
            alignItems : "flex-end",
            justifyContent : "center",
        };
          break;
      case "BOTTOM_RIGHT":
          prepareStyleObject = {
            bottom: 0, right: 0,
            alignItems : "flex-end",
            justifyContent : "right",
            transform: "rotate(" + (textOverlay?.rotation || 0) + "deg)",
          };
          break;
      default:
          prepareStyleObject = {};
    }

      let isProdScaleAdded = false;
      if (textOverlay?.scale_in_product > 0) {
          isProdScaleAdded = true;
      }

      let paddingObj = {
        padding_top: textOverlay.padding_top,
        padding_right: textOverlay.padding_right,
        padding_bottom: textOverlay.padding_bottom,
        padding_left: textOverlay.padding_left,
    };
    // if (textOverlay?.type === 'TEXT'){
      const isPaddingScaleAdd = textOverlay?.type === 'TEXT' && isProdScaleAdded;
        if (textOverlay?.padding_top != "") {
            paddingObj.padding_top = isPaddingScaleAdd
                ? (parseInt(textOverlay?.padding_top) * parseInt(textOverlay?.scale_in_product)) /
                100 : textOverlay?.padding_top;
        }
        if (textOverlay?.padding_right != "") {
            paddingObj.padding_right = isPaddingScaleAdd
                ? (parseInt(textOverlay?.padding_right) * parseInt(textOverlay?.scale_in_product)) /
                100 : textOverlay?.padding_right;
        }
        if (textOverlay?.padding_bottom != "") {
            paddingObj.padding_bottom = isPaddingScaleAdd
                ? (parseInt(textOverlay?.padding_bottom) * parseInt(textOverlay?.scale_in_product)) /
                100 : textOverlay?.padding_bottom;
        }
        if (textOverlay?.padding_left != "") {
            paddingObj.padding_left = isPaddingScaleAdd
                ? (parseInt(textOverlay?.padding_left) * parseInt(textOverlay?.scale_in_product)) /
                100 : textOverlay?.padding_left;
        }
    // }

      prepareStyleObject.padding = `${paddingObj?.padding_top}px ${paddingObj.padding_right}px ${paddingObj.padding_bottom}px ${paddingObj.padding_left}px`;
      prepareStyleObject.opacity = textOverlay.opacity || 1;
      prepareStyleObject.display = 'flex';
      prepareStyleObject.position = 'absolute';
      if (textOverlay.type !== 'TEXT'){
          prepareStyleObject.zIndex = 1;
          prepareStyleObject.height = '100%';
          prepareStyleObject.width = '100%';
      }else{
          prepareStyleObject.wordBreak = 'break-all';
      }
      prepareStyleObject.color = textOverlay.font_color;
      prepareStyleObject.backgroundColor=  textOverlay.bg_color;
      prepareStyleObject.fontFamily = textOverlay.font_family;
      prepareStyleObject.fontSize = textOverlay?.scale_in_product > 0
          ? (textOverlay?.font_size * textOverlay?.scale_in_product) / 100 +
          "px"
          : textOverlay?.font_size + "px";

      prepareStyleObject.fontWeight = textOverlay.font_weight;
      prepareStyleObject.fontStyle = textOverlay.font_style;
      prepareStyleObject.textAlign = textOverlay.text_align;
      prepareStyleObject.lineHeight = 'normal';

      return prepareStyleObject;
  };
  const handleBackClick = () => {
    if (isBackLoading) return; // prevent double click
    setIsBackLoading(true);

    // Your logic
    handleDiscard();

    setTimeout(() => {
      navigate("/app");
    }, 100);
  };

  return (
    <>
      <RemixLink
        to="/app"
        prefetch="render"
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      >
        Prefetch home
      </RemixLink>
    <Page
      // backAction={{
      //   content: "app",
      //   onAction: () => {
      //     handleDiscard();
      //     navigate("/app");
      //   },
      // }}
      // title={initialData?.product?.title}
    >

      <div
        style={{
          display: "flex",
          justifyContent: "start",
          alignItems: "center",
          gap: "10px",
          cursor: isBackLoading ? "default" : "pointer",
          marginTop: isBackLoading ? "-6px" : "0",
          marginBottom:"20px"
        }}
        onClick={handleBackClick}
      >
        {isBackLoading ? (
          <div style={{ width: "fit-content",marginTop:"6px" }}>
            <Spinner size="small"/>
          </div>
        ) : (
          <div style={{ width: "fit-content" }}>
            <Icon source={ArrowLeftIcon}/>
          </div>
        )}

        <Text as="h1" variant="headingLg">
          {initialData?.product?.title}
        </Text>
      </div>

      <Form method="post" encType="multipart/form-data">
        <SaveBar id={saveBarId}>
          <button
            variant="primary"
            disabled={loader === "save"}
            loading={loader === "save" ? "" : null}
            onClick={handleSave}
          ></button>
          <button disabled={loader === "save"} onClick={handleDiscard}></button>
        </SaveBar>
        <CommonModal
          open={removeModalActive}
          body={
            <p>Are you sure to delete this overlay?. This can’t be undone.</p>
          }
          modalTitle={"Remove overlay"}
          loader={loader === "delete"}
          primaryName={"Delete"}
          secondaryName={"Cancle"}
          handleSaveButton={deleteOvelayConf}
          handleCloseButton={handleRemoveOvelayModal}
        />

        <CommonModal
          open={updateStatusModal?.open}
          body={<p>Are you sure to update status of this overlay?</p>}
          modalTitle={"Update Status"}
          loader={loader === "update_status"}
          primaryName={"Update Status"}
          secondaryName={"Cancle"}
          handleSaveButton={handleStatusUpdate}
          handleCloseButton={handleUpdateCloseModal}
        />

        <OverlayPreviewModal
          openOverlayPreviewModal={openOverlayPreviewModal}
          setOpenOverlayPreviewModal={setOpenOverlayPreviewModal}
          handleTabChange={handleTabChange}
        />

        <InlineGrid columns={2} gap="200">
          <div className="overlay-tabs">
            <BlockStack gap={200}>
              <InlineStack align="end">
                {tabSelected != 1 && tabSelected == 0 ? (
                  <Button
                    variant="primary"
                    onClick={() => setOpenOverlayPreviewModal(true)}
                  >
                    Add Overlay
                  </Button>
                ) : null}
              </InlineStack>
              {/* <Tabs tabs={tabs} selected={tabSelected} onSelect={handleTabChange} fitted> */}
              {tabSelected === 0 && (
                <Card padding="0">
                  <ResourceList
                    emptyState={
                      overlayList?.length == 0 ? (
                        <EmptyState
                          heading="Your overlay will show here"
                          image="https://cdn.shopify.com/shopifycloud/web/assets/v1/a64ef20cde1af82ef69556c7ab33c727.svg"
                        ></EmptyState>
                      ) : undefined
                    }
                    resourceName={{
                      singular: "Overlay",
                      plural: "Overlays",
                    }}
                    items={overlayList}
                    renderItem={(item, index) => {
                      const {
                        id,
                        type,
                        image_url,
                        text,
                        font_family,
                        font_size,
                        font_color,
                        bg_color,
                        opacity,
                        rotation,
                        text_align,
                        position,
                        display_in,
                        status,
                        padding_top,
                        padding_right,
                        padding_bottom,
                        padding_left,
                        scale_in_collection,
                        scale_in_product,
                        scale_in_search,
                      } = item;

                      let parsedDisplayIn =
                        typeof display_in === "string"
                          ? JSON.parse(display_in)
                          : (display_in ?? []);
                      let overlayRowInfo = [];

                      overlayRowInfo.push(
                        <div style={{ marginTop: "20px" }} key={index}>
                          <InlineStack gap={100} wrap={false}>
                            <Text>Display in:</Text>
                            {parsedDisplayIn?.map((tag, i) => {
                              return (
                                <div key={i}>
                                  {tag == "product" ? (
                                    <Badge>Product</Badge>
                                  ) : null}
                                  {tag == "collection" ? (
                                    <Badge>Collection</Badge>
                                  ) : null}
                                  {tag == "search" ? (
                                    <Badge>Search</Badge>
                                  ) : null}
                                </div>
                              );
                            })}
                          </InlineStack>
                          <br />
                        </div>,
                      );
                      {
                      type == 'TEXT' ?
                        overlayRowInfo.push(
                          <BlockStack gap={500} key={index}>
                            <InlineGrid columns={2}>
                              <List type="bullet">
                                <List.Item>Text: {text}</List.Item>
                                <List.Item>Font size: {font_size}</List.Item>
                                <List.Item>Font family: {font_family}</List.Item>
                              </List>
                              <List type="bullet">
                                <List.Item>Font color: {font_color}</List.Item>
                                <List.Item>Background color: {bg_color}</List.Item>
                                <List.Item>Opacity: {opacity}</List.Item>
                              </List>
                            </InlineGrid>

                            <InlineGrid columns={2}>
                              <List type="bullet">
                                <List.Item>Top padding: {padding_top != '' ? padding_top + 'px' : '0px'}</List.Item>
                                <List.Item>Right padding: {padding_right != '' ? padding_right + 'px' : '0px'}</List.Item>
                                <List.Item>Bottom padding: {padding_bottom != '' ? padding_bottom + 'px' : '0px'}</List.Item>
                                <List.Item>Left padding: {padding_left != '' ? padding_left + 'px' : '0px'}</List.Item>
                              </List>
                              <List type="bullet">
                                <List.Item>Rotation: {rotation}</List.Item>
                                <List.Item>Text align: {text_align}</List.Item>
                                <List.Item>Position: {position}</List.Item>
                              </List>
                            </InlineGrid>

                            <InlineGrid>
                              <List type="bullet">
                                <List.Item>Scale in collection: {(scale_in_collection != '' && scale_in_collection != null) ? scale_in_collection + '%' : '0%'}</List.Item>
                                <List.Item>Scale in product: {(scale_in_product != '' && scale_in_product != null) ? scale_in_product + '%' : '0%'}</List.Item>
                                <List.Item>Scale in search: {(scale_in_search != '' && scale_in_search != null) ? scale_in_search + '%' : '0%'}</List.Item>
                              </List>
                            </InlineGrid>
                          </BlockStack>
                        )
                        :
                        overlayRowInfo.push(
                          <BlockStack gap={500} key={index}>
                            <InlineGrid columns={2}>
                              <List type="bullet">
                                <List.Item>Top padding: {padding_top != '' ? padding_top + 'px' : '0px'}</List.Item>
                                <List.Item>Right padding: {padding_right != '' ? padding_right + 'px' : '0px'}</List.Item>
                                <List.Item>Bottom padding: {padding_bottom != '' ? padding_bottom + 'px' : '0px'}</List.Item>
                                <List.Item>Left padding: {padding_left != '' ? padding_left + 'px' : '0px'}</List.Item>
                              </List>
                              <List type="bullet">
                                <List.Item>Position: {position}</List.Item>
                                <List.Item>Rotation: {rotation}</List.Item>
                                <List.Item>Opacity: {opacity}</List.Item>
                              </List>
                            </InlineGrid>

                            <List type="bullet">
                              <List.Item>Scale in collection: {(scale_in_collection != '' && scale_in_collection != null) ? scale_in_collection + '%' : '0%'}</List.Item>
                              <List.Item>Scale in product: {(scale_in_product != '' && scale_in_product != null) ? scale_in_product + '%' : '0%'}</List.Item>
                              <List.Item>Scale in search: {(scale_in_search != '' && scale_in_search != null) ? scale_in_search + '%' : '0%'}</List.Item>
                            </List>
                          </BlockStack>
                        )
                    }

                    return (
                      <ResourceItem
                        id={id}
                        url={''}
                        // media={type == 'text' ? <Avatar size="lg" initials={text.charAt(0)} name="" customer={false} key={index} /> : <Thumbnail size="small" source={image_url instanceof File ? window.URL.createObjectURL(image_url) : image_url} />}
                        accessibilityLabel={`View details for ${id}`}
                        persistActions
                      >
                        <BlockStack gap="200" onClick={()=>handleEditTab(item, type)}>
                          <div style={{ paddingTop: '5px' }}>
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap={300}>
                                  {/* {ReactSwitch ? (
                                    <ReactSwitch
                                      height={15}
                                      width={30}
                                      offColor="#e3e3e3"
                                      onColor="#007b5c"
                                      activeBoxShadow="0 0 2px #007b5c"
                                      uncheckedIcon={false}
                                      checkedIcon={true}
                                      checked={status === "active"}
                                      onChange={() =>
                                        setUpdateStatusModal({
                                          open: true,
                                          id,
                                          status,
                                        })
                                      }
                                    />
                                  ) : (
                                    <div>Loading ...</div> // Fallback UI
                                  )}*/}
                                {type == 'TEXT' ? <Avatar size="lg" initials={text.charAt(0)} name="" customer={false} key={index} /> : <Thumbnail size="small" source={image_url instanceof File ? window.URL.createObjectURL(image_url) : image_url} />}
                                <Text variant="headingSm" breakWord>{type + ': ' + (text || '')}</Text>
                              </InlineStack>
                              <InlineStack gap="300" blockAlign="center">
                                  <Button
                                    variant="plain"
                                    onClick={(e) =>
                                      (e.stopPropagation(),
                                      setUpdateStatusModal({
                                        open: true,
                                        id,
                                        status,
                                      }))
                                    }
                                  >
                                    <Badge
                                      tone={
                                        status === "Active"
                                          ? "success"
                                          : "warning"
                                      }
                                    >
                                      {status === "Active"
                                        ? "Active"
                                        : "Inactive"}
                                    </Badge>
                                  </Button>
                                  <Link
                                    removeUnderline
                                    onClick={(e) =>(
                                      e.stopPropagation(),
                                      handleDetailToggle(`collapsible-${id}`))
                                    }
                                  >
                                    <Icon source={ViewIcon} tone="base" />
                                  </Link>
                                  <Button
                                    variant="plain"
                                    onClick={(e) => (e.stopPropagation(),handleEditTab(item, type))}
                                  >
                                    <Icon source={EditIcon} tone="base" />
                                  </Button>
                                  <Link
                                    removeUnderline
                                    onClick={(e) => (e.stopPropagation(),handleRemoveOvelay(id))}
                                  >
                                    <Icon source={DeleteIcon} tone="critical" />
                                  </Link>
                                </InlineStack>
                              </InlineStack>
                            </div>
                            <Collapsible
                              id={`collapsible-${id}`}
                              open={overlayDetailOpen[`collapsible-${id}`]}
                              transition={{
                                duration: "300ms",
                                timingFunction: "ease-in-out",
                              }}
                            >
                              {overlayRowInfo}
                            </Collapsible>
                          </BlockStack>
                        </ResourceItem>
                      );
                    }}
                  />
                  <Box padding="200">
                    <BlockStack inlineAlign="center">
                      <Pagination
                        hasPrevious={pagination.currentPage > 1}
                        onPrevious={handlePreviousPage}
                        hasNext={pagination.currentPage < pagination.totalPages}
                        onNext={handleNextPage}
                      />
                    </BlockStack>
                  </Box>
                </Card>
              )}
              {
                <Suspense fallback={<SkeletonCard />}>
                  {tabSelected === 1 && (
                    <BlockStack gap="200">
                      <Card>
                        <FormLayout>
                          <BlockStack>
                            <TextField
                              label={<Text fontWeight="bold">Text</Text>}
                              autoComplete="off"
                              placeholder="Enter text"
                              value={textOverlay?.text}
                              onChange={(value) =>
                                handleTextSetting("text", value)
                              }
                            />
                          </BlockStack>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              label={<Text fontWeight="bold">Font size</Text>}
                              type="number"
                              autoComplete="off"
                              placeholder="Enter font size"
                              value={textOverlay?.font_size}
                              onChange={(value) =>
                                handleTextSetting("font_size", value)
                              }
                            />
                            <Select
                              label="Font family"
                              options={textFontFamilyOptions}
                              value={textOverlay?.font_family}
                              onChange={(value) =>
                                handleTextSetting("font_family", value)
                              }
                            />
                          </InlineGrid>
                          <InlineGrid columns="2" gap={100}>
                            <Select
                              label="Font weight"
                              options={textFontWeightOptions}
                              value={textOverlay?.font_weight}
                              onChange={(value) =>
                                handleTextSetting("font_weight", value)
                              }
                            />
                            <Select
                              label="Font style"
                              options={textFontStyleOptions}
                              value={textOverlay?.font_style}
                              onChange={(value) =>
                                handleTextSetting("font_style", value)
                              }
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                      <Card>
                        <FormLayout>
                          <InlineGrid columns="2" gap={100}>
                            <InlineStack gap={100} wrap={false}>
                              <TextField
                                label={
                                  <Text fontWeight="bold">Font color</Text>
                                }
                            value={textOverlay?.font_color || '#ffffffff'}
                                onChange={(value) =>
                                  handleColorChange("font_color", "text", value)
                                }
                                autoComplete="off"
                                prefix={<Icon source={NoteIcon} />}
                              />
                              <ColorPickerPopover
                                popoverActive={activePopover === "font_color"}
                                togglePopover={() =>
                                  togglePopover("font_color")
                                }
                            color={textOverlay?.font_color || '#ffffffff'}
                                handleColorChange={(value) =>
                                  handleColorChange(
                                    "font_color",
                                    "color",
                                    value,
                                  )
                                }
                              />
                            </InlineStack>
                            <InlineStack gap={100} wrap={false}>
                              <TextField
                                label={
                                  <Text fontWeight="bold">
                                    Background color
                                  </Text>
                                }
                            value={textOverlay?.bg_color || '#ffffffff'}
                                onChange={(value) =>
                                  handleColorChange("bg_color", "text", value)
                                }
                                autoComplete="off"
                                prefix={<Icon source={NoteIcon} />}
                              />
                              <ColorPickerPopover
                                popoverActive={activePopover === "bg_color"}
                                togglePopover={() => togglePopover("bg_color")}
                            color={textOverlay?.bg_color || '#ffffffff'}
                                handleColorChange={(value) =>
                                  handleColorChange("bg_color", "color", value)
                                }
                              />
                            </InlineStack>
                          </InlineGrid>
                          <InlineGrid columns="3" gap={100}>
                            <TextField
                              type="number"
                              label={"Rotation"}
                              min="0"
                              max="360"
                              autoComplete="off"
                              value={textOverlay?.rotation}
                              onChange={(value) =>
                                handleTextSetting("rotation", value)
                              }
                            />
                            <Select
                              label="Text align"
                              options={textAlignOptions}
                              value={textOverlay?.text_align}
                              onChange={(value) =>
                                handleTextSetting("text_align", value)
                              }
                            />
                            <Select
                              label="Text position"
                              options={textPositionOptions}
                              value={textOverlay?.position}
                              onChange={(value) =>
                                handleTextSetting("position", value)
                              }
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                      <Card>
                        <FormLayout>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              label="Top padding"
                              autoComplete="off"
                              value={textOverlay?.padding_top}
                              onChange={(value) =>
                                handleTextSetting("padding_top", value)
                              }
                            />
                            <TextField
                              type="number"
                              label="Right padding"
                              autoComplete="off"
                              value={textOverlay?.padding_right}
                              onChange={(value) =>
                                handleTextSetting("padding_right", value)
                              }
                            />
                          </InlineGrid>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              label="Bottom padding"
                              autoComplete="off"
                              value={textOverlay?.padding_bottom}
                              onChange={(value) =>
                                handleTextSetting("padding_bottom", value)
                              }
                            />
                            <TextField
                              type="number"
                              label="Left padding"
                              autoComplete="off"
                              value={textOverlay?.padding_left}
                              onChange={(value) =>
                                handleTextSetting("padding_left", value)
                              }
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                      <Card>
                        <FormLayout>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              min="0"
                              max="100"
                              label="Scale in product"
                              autoComplete="off"
                              suffix="%"
                              value={textOverlay?.scale_in_product}
                              onChange={(value) =>
                                handleTextSetting("scale_in_product", value)
                              }
                            />
                            <TextField
                              type="number"
                              min="0"
                              max="100"
                              label="Scale in collection"
                              autoComplete="off"
                              suffix="%"
                              value={textOverlay?.scale_in_collection}
                              onChange={(value) =>
                                handleTextSetting("scale_in_collection", value)
                              }
                            />
                          </InlineGrid>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              min="0"
                              max="100"
                              label="Scale in search"
                              autoComplete="off"
                              suffix="%"
                              value={textOverlay?.scale_in_search}
                              onChange={(value) =>
                                handleTextSetting("scale_in_search", value)
                              }
                            />
                            <Autocomplete
                              allowMultiple
                              options={deselectedOptions}
                              selected={textOverlay?.display_in}
                              textField={textField}
                              onSelect={(value) =>
                                handleTextSetting("display_in", value)
                              }
                              listTitle="Suggested Tags"
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                    </BlockStack>
                  )}
                </Suspense>
              }

              {
                <Suspense fallback={<SkeletonCard />}>
                  {tabSelected === 2 && (
                    <BlockStack gap="200">
                      <Card>
                        <FormLayout>
                          <BlockStack>
                            <Label>Image</Label>
                            <div
                              className="image_overlay"
                              style={{ display: "flex", marginTop: "10px" }}
                            >
                              <div style={{ width: 125, height: 90 }}>
                                {imageOverlay?.image_url ? (
                                  <img
                                    style={{ width: "125px", height: "90px" }}
                                    src={
                                      imageOverlay?.image_url instanceof File
                                        ? window.URL.createObjectURL(
                                        imageOverlay?.image_url,
                                        )
                                        : imageOverlay.image_url
                                    }
                                  />
                                ) : (
                                  <DropZone
                                    allowMultiple={false}
                                    accept="image/*,image/svg+xml"
                                    type="image"
                                    onDrop={handleDropZoneDrop}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                      }}
                                    >
                                      <Button
                                        onClick={() => setShowImageError("")}
                                      >
                                        <Icon source={UploadIcon} tone="base" />
                                      </Button>
                                    </div>
                                  </DropZone>
                                )}
                              </div>
                              {imageOverlay?.image_url && (
                                <div className="delete_image">
                                  <Button
                                    size="micro"
                                    variant="plain"
                                    onClick={() => {
                                      handleImageSetting("image_url", "");
                                    }}
                                  >
                                    <Icon source={XIcon} tone="base" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </BlockStack>
                          {showInlineErrors()}
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              label={<Text fontWeight="bold">Opacity</Text>}
                              autoComplete="off"
                              min="0.0"
                              max="1.0"
                              step="0.1"
                              value={imageOverlay?.opacity}
                              onChange={(value) => {
                                handleImageSetting("opacity", value);
                              }}
                            />
                            <TextField
                              type="number"
                              min="0"
                              max="360"
                              label={<Text fontWeight="bold">Rotation</Text>}
                              autoComplete="off"
                              value={imageOverlay?.rotation}
                              onChange={(value) => {
                                handleImageSetting("rotation", value);
                              }}
                            />
                          </InlineGrid>
                          <InlineGrid columns="2" gap={100}>
                            <Select
                              label="Image position"
                              options={textPositionOptions}
                              value={imageOverlay?.position}
                              onChange={(value) =>
                                handleImageSetting("position", value)
                              }
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                      <Card>
                        <FormLayout>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              label="Top padding"
                              autoComplete="off"
                              value={imageOverlay?.padding_top}
                              onChange={(value) =>
                                handleImageSetting("padding_top", value)
                              }
                            />
                            <TextField
                              type="number"
                              label="Right padding"
                              autoComplete="off"
                              value={imageOverlay?.padding_right}
                              onChange={(value) =>
                                handleImageSetting("padding_right", value)
                              }
                            />
                          </InlineGrid>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              label="Bottom padding"
                              autoComplete="off"
                              value={imageOverlay?.padding_bottom}
                              onChange={(value) =>
                                handleImageSetting("padding_bottom", value)
                              }
                            />
                            <TextField
                              type="number"
                              label="Left padding"
                              autoComplete="off"
                              value={imageOverlay?.padding_left}
                              onChange={(value) =>
                                handleImageSetting("padding_left", value)
                              }
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                      <Card>
                        <FormLayout>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              min="0"
                              max="100"
                              label="Scale in product"
                              autoComplete="off"
                              suffix="%"
                              value={imageOverlay?.scale_in_product}
                              onChange={(value) =>
                                handleImageSetting("scale_in_product", value)
                              }
                            />
                            <TextField
                              type="number"
                              min="0"
                              max="100"
                              label="Scale in collection"
                              autoComplete="off"
                              suffix="%"
                              value={imageOverlay?.scale_in_collection}
                              onChange={(value) =>
                                handleImageSetting("scale_in_collection", value)
                              }
                            />
                          </InlineGrid>
                          <InlineGrid columns="2" gap={100}>
                            <TextField
                              type="number"
                              min="0"
                              max="100"
                              label="Scale in search"
                              autoComplete="off"
                              suffix="%"
                              value={imageOverlay?.scale_in_search}
                              onChange={(value) =>
                                handleImageSetting("scale_in_search", value)
                              }
                            />
                            <Autocomplete
                              allowMultiple
                              options={deselectedOptions}
                              selected={imageOverlay?.display_in}
                              textField={imageField}
                              onSelect={(value) =>
                                handleImageSetting("display_in", value)
                              }
                            />
                          </InlineGrid>
                        </FormLayout>
                      </Card>
                    </BlockStack>
                  )}
                </Suspense>
              }
            </BlockStack>
            {/* </Tabs> */}
          </div>

          <div style={{ marginTop: "37px" }}>
            <BlockStack gap={200}>
              <Card>
                <div style={{ position: 'relative' }}>
                  <img
                    src={prodImage}
                    id="overlayImageBase"
                    style={{ width: "100%", height: "100%" }}
                  />
                  {overlayList && overlayList.map((overlay, index) => (
                    <div
                      key={index}
                      className={overlay.type === 'TEXT' ? `text-data-overlay` : ''}
                      style={{ ...getPositionStyles(overlay)}}
                    >
                      {tabSelected !== 1 && overlay.type === 'TEXT' ? (
                          overlay.text
                      ) : tabSelected !== 2 && overlay.type === 'IMAGE' && overlay.image_url && (

                        <img
                          src={overlay?.image_url}
                          alt="Overlay"
                          style={{
                              // height: '100%',
                              maxWidth: overlay?.scale_in_product > 0 ? `${overlay?.scale_in_product}%` : '100%',
                              width: '100%',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              {tabSelected != 0 && (
                <>
                  <InlineGrid columns={2} gap="800">
                    <Button
                      variant="primary"
                      size="small"
                      align="start"
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      align="end"
                      onClick={() => handleTabChange(0)}
                    >
                      Disacard
                    </Button>
                  </InlineGrid>
                </>
              )}
            </BlockStack>
          </div>
        </InlineGrid>
      </Form>
    </Page>
    </>
  );
}
