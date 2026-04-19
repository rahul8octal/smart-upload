import { BlockStack, ColorPicker, Popover } from "@shopify/polaris";

export const ColorPickerPopover = ({ popoverActive, togglePopover, color, handleColorChange }) => {

    function hexToHsba(hex) {
        const [r, g, b, a] = hexToRgba(hex);
        return rgbToHsba(r, g, b, a);
    }

    // Convert HEX to RGBA
    function hexToRgba(hex) {
        hex = hex.replace(/^#/, '');

        // Handle different hex formats
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const alpha = hex.length === 8
            ? parseInt(hex.slice(6, 8), 16) / 255
            : 1;

        return [r, g, b, alpha];
    }

    // Convert RGBA to HSBA
    function rgbToHsba(r, g, b, a) {
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;

        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        const delta = max - min;

        let hue = 0;
        if (delta !== 0) {
            if (max === rNorm) {
                hue = ((gNorm - bNorm) / delta) % 6;
            } else if (max === gNorm) {
                hue = (bNorm - rNorm) / delta + 2;
            } else {
                hue = (rNorm - gNorm) / delta + 4;
            }
            hue = Math.round(hue * 60);
            if (hue < 0) hue += 360;
        }

        const saturation = max === 0 ? 0 : delta / max;
        const brightness = max;

        return {
            hue,
            saturation: Number(saturation.toFixed(4)),
            brightness: Number(brightness.toFixed(4)),
            alpha: a
        };
    }

    const activator = (
        <div className="ColorPickerBox" style={{marginTop: "25px"}}>
            <div
                onClick={togglePopover}
                style={{
                    backgroundColor: color,
                    width: "55px",
                    height: "32px",
                    borderRadius: "5px",
                    border: "1px solid #d3d3d3",
                    position: "absolute",
                    zIndex: 2,
                }}
            />
            <img
                src={'/Image/transparent.svg'}
                loading='lazy'
                fetchpriority='low'
                style={{
                    width: "55px",
                    height: "32px",
                    borderRadius: "5px",
                    border: "1px solid #d3d3d3",
                    position: "relative",
                    zIndex: 1,
                }}
            />
        </div>
    );

    return (
        <Popover
            active={popoverActive}
            activator={activator}
            onClose={togglePopover}
            sectioned
            preventCloseOnChildOverlayClick
        >
            <div onClick={(e) => e.stopPropagation()}>
                <BlockStack gap="100">
                    <ColorPicker
                        allowAlpha
                        color={hexToHsba(color)}
                        onChange={handleColorChange}
                    />
                </BlockStack>
            </div>
        </Popover>
    );
};
