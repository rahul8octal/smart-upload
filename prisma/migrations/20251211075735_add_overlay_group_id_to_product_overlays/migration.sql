-- AlterTable
ALTER TABLE `overlay_targets`
    ALTER COLUMN `updated_at` DROP DEFAULT,
    MODIFY `target_handle` VARCHAR(225) NULL;

-- AlterTable
ALTER TABLE `product_overlays` ADD COLUMN `overlay_group_id` VARCHAR(191) NULL,
    MODIFY `image_url` TEXT NULL,
    MODIFY `product_handle` VARCHAR(225) NULL;
