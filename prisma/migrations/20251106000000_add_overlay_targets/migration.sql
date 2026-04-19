-- Create overlay_targets table to support multi-scope overlays
CREATE TABLE `overlay_targets` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `overlay_id` INT NOT NULL,
    `scope` ENUM('ALL_PRODUCTS', 'PRODUCT', 'COLLECTION') NOT NULL,
    `target_id` VARCHAR(191) NULL,
    `target_handle` VARCHAR(225) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX `overlay_targets_overlay_id_idx`(`overlay_id`),
    INDEX `overlay_targets_scope_target_id_idx`(`scope`, `target_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `overlay_targets_overlay_id_fkey` FOREIGN KEY (`overlay_id`) REFERENCES `product_overlays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
