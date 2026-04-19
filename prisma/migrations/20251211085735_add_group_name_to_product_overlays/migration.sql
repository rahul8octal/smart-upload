-- Add group_name to product_overlays to store a human-friendly identifier per group
ALTER TABLE `product_overlays` ADD COLUMN `group_name` VARCHAR(191) NULL;
