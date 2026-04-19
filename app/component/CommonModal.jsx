import { Modal, Text } from "@shopify/polaris";

export function CommonModal({ open, body, modalTitle, loader, primaryName, secondaryName, handleSaveButton, handleCloseButton }) {
    return (
        <Modal
            open={open}
            onClose={handleCloseButton}
            title={modalTitle}
            primaryAction={{
                destructive: true,
                content: primaryName,
                disabled: loader,
                loading: loader,
                onAction: handleSaveButton
            }}
            secondaryActions={[{
                content: secondaryName,
                disabled: loader,
                onAction: handleCloseButton
            }]}
        >
            <Modal.Section>
                <Text>
                    {body}
                </Text>
            </Modal.Section>
        </Modal>
    )
}