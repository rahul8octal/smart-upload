export const DEFAULT_TEXT_CONFIG = {
  text: "",
  font_size: "17",
  font_family: "Arial",
  font_color: "#13fa00ff",
  font_weight: "bold",
  font_style: "normal",
  bg_color: "#2e0e0eff",
  rotation: "0",
  text_align: "LEFT",
  position: "TOP_LEFT",
  padding_top: "6",
  padding_right: "10",
  padding_bottom: "5",
  padding_left: "9",
  scale_in_product: "100",
  scale_in_collection: "50",
  scale_in_search: "50",
  display_in: ["collection", "product", "search", "index"],
  translations: {},
    border_radius:"0"
};

export const DEFAULT_IMAGE_CONFIG = {
  image_url: "",
  opacity: "1",
  rotation: "0",
  position: "TOP_RIGHT",
  padding_top: "2",
  padding_right: "2",
  padding_bottom: "2",
  padding_left: "2",
  scale_in_product: "31",
  scale_in_collection: "31",
  scale_in_search: "30",
  display_in: ["collection", "product", "search", "index"],
  border_radius:"0"
};

export function thumbShopifyImage(url, size = "_250x250") {
  if (!url) return "/Image/default_product.jpg";
  url = url.replace(".jpg", size + ".jpg");
  url = url.replace(".jpeg", size + ".jpeg");
  url = url.replace(".png", size + ".png");
  url = url.replace(".gif", size + ".gif");
  url = url.replace(".webp", size + ".webp");
  url = url.replace(".tiff", size + ".tiff");
  url = url.replace(".psd", size + ".psd");
  url = url.replace(".raw", size + ".raw");
  url = url.replace(".bmp", size + ".bmp");
  url = url.replace(".heif", size + ".heif");
  url = url.replace(".indd", size + ".indd");
  url = url.replace(".svg", size + ".svg");

  return url;
}
