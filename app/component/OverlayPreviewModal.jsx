import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Modal,
  Text,
  Thumbnail,
} from "@shopify/polaris";

export const OverlayPreviewModal = ({
  openOverlayPreviewModal,
  setOpenOverlayPreviewModal,
  handleTabChange,
}) => {
  return (
    <Modal
      open={openOverlayPreviewModal}
      size="medium"
      title={"Add a New Text or Image Overlay"}
      onClose={() => setOpenOverlayPreviewModal(false)}
    >
      <Box padding={400}>
        <InlineGrid columns={2} gap={400}>
          <Card padding="400">
            <BlockStack gap={400}>
              <InlineStack align="center">
                <Text as="h2" variant="headingMd">
                  Text Overlay
                </Text>
              </InlineStack>
              <InlineStack align="center">
                <Button
                  variant="plain"
                  onClick={() => {
                    handleTabChange(1);
                    setOpenOverlayPreviewModal(false);
                  }}
                >
                  <Thumbnail
                    source="/Image/text_overlay.png"
                    size="large"
                    alt="Small document"
                  />
                </Button>
              </InlineStack>
              <InlineStack align="center">
                <Button
                  size="large"
                  variant="primary"
                  onClick={() => {
                    handleTabChange(1);
                    setOpenOverlayPreviewModal(false);
                  }}
                >
                  Create Text Overlay
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
          <Card padding="400">
            <BlockStack gap={400}>
              <InlineStack align="center">
                <Text as="h2" variant="headingMd">
                  Image Overlay
                </Text>
              </InlineStack>

              <InlineStack align="center">
                <Button
                  variant="plain"
                  onClick={() => {
                    handleTabChange(2);
                    setOpenOverlayPreviewModal(false);
                  }}
                >
                  <Thumbnail
                    source="/Image/image_overlay.png"
                    size="large"
                    alt="Small document"
                  />
                </Button>
              </InlineStack>
              <InlineStack align="center">
                <Button
                  variant="primary"
                  onClick={() => {
                    handleTabChange(2);
                    setOpenOverlayPreviewModal(false);
                  }}
                >
                  Create Image Overlay
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </InlineGrid>
      </Box>
    </Modal>
  );
};
