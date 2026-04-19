/*
  Warnings:

  - The values [text,image] on the enum `product_overlays_type` will be removed. If these variants are still used in the database, this will fail.
  - The values [left,center,right] on the enum `product_overlays_text_align` will be removed. If these variants are still used in the database, this will fail.
  - The values [top_left,top_center,top_right,middle_left,middle_center,middle_right,bottom_left,bottom_center,bottom_right] on the enum `product_overlays_position` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `product_overlays` ADD COLUMN `old_db_id` INTEGER NULL,
    MODIFY `type` ENUM('TEXT', 'IMAGE') NOT NULL,
    MODIFY `text_align` ENUM('LEFT', 'CENTER', 'RIGHT') NULL,
    MODIFY `position` ENUM('TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'MIDDLE_CENTER', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT') NULL;

-- CreateTable
CREATE TABLE `plan_master` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `monthly_price` VARCHAR(191) NULL,
    `trial_days` VARCHAR(191) NULL,
    `access_products` VARCHAR(191) NULL,
    `old_db_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop` VARCHAR(191) NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `monthly_price` VARCHAR(191) NULL,
    `access_products` VARCHAR(191) NULL,
    `start_date` VARCHAR(191) NULL,
    `end_date` VARCHAR(191) NULL,
    `status` ENUM('Active', 'Inactive') NULL DEFAULT 'Active',
    `charge_id` VARCHAR(191) NULL,
    `charge_status` VARCHAR(191) NULL,
    `plan_type` VARCHAR(191) NOT NULL,
    `plan_name` VARCHAR(191) NULL,
    `return_url` TEXT NULL,
    `is_test` VARCHAR(191) NULL,
    `activated_on` VARCHAR(191) NULL,
    `trial_ends_on` VARCHAR(191) NULL,
    `cancelled_on` VARCHAR(191) NULL,
    `trial_days` VARCHAR(191) NULL,
    `confirmation_url` TEXT NULL,
    `old_db_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shop_plans` ADD CONSTRAINT `shop_plans_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plan_master`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
