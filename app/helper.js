export const CSV_HEADERS = {
    // product_id: 'ProductId',
    product_id: "ProductShopId",
    product_title: "ProductTitle",
    product_handle: "ProductHandle",
    product_type: "ProductType",
    id: "OverlayId",
    type: "OverlayType",
    image_url: "OverlayImage",
    text: "OverlayText",
    font_family: "OverlayFontFamily",
    font_size: "OverlayFontSize",
    font_color: "OverlayFontColor",
    bg_color: "OverlayBackgroundColor",
    opacity: "OverlayOpacity",
    rotation: "OverlayRotation",
    text_align: "OverlayAlign",
    padding_top: "OverlayPaddingTop",
    padding_right: "OverlayPaddingRight",
    padding_bottom: "OverlayPaddingBottom",
    padding_left: "OverlayPaddingLeft",
    position: "OverlayPosition",
    display_in_collection: "DisplayInCollection",
    display_in_product: "DisplayInProduct",
    display_in_search: "DisplayInSearch",
    scale_in_collection: "ScaleInCollection",
    scale_in_product: "ScaleInProduct",
    scale_in_search: "ScaleInSearch",
    status: "OverlayStatus",
};

export const uploadFile = async ({ fileName, filePath, fileType, bucket, key }) => {
    const AWS = (await import('aws-sdk')).default;
    AWS.config.update({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    });
    const s3 = new AWS.S3();
    return new Promise((resolve, reject) => {
        s3.upload({
            Bucket: bucket,
            Key: key,
            Body: filePath,
            ContentType: fileType,
            // ACL : 'public-read',
        }, (err, data) => {
            if (err) return reject(err);
            resolve(data.Location);
        });
    });
};

export const deleteFile = async (fileUrl) => {
    if (!fileUrl) return;

    try {
        const AWS = (await import('aws-sdk')).default;
        AWS.config.update({
            region: process.env.AWS_REGION,
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_KEY,
        });

        const s3 = new AWS.S3();
        const key = fileUrl.split('.amazonaws.com/')[1];
        if (!key) throw new Error('Invalid S3 URL — could not extract key.');

        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
        };

        await s3.deleteObject(params).promise();

        console.log('✅ File deleted from S3:', key);
        return true;
    } catch (err) {
        console.error('❌ Error deleting file from S3:', err);
        return false;
    }
};
