import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getFileBuffer } from "../utils/google-drive.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const jobId = parseInt(formData.get("jobId"));
  const matchString = formData.get("match");
  
  if (!matchString) {
      return json({ success: false, error: "No match data provided" });
  }

  const match = JSON.parse(matchString);
  const replacementOption = formData.get("replacementOption");

  try {
    const pid = match.product.id;
    const shop = session.shop;

    // 1. Get Google Drive tokens
    const settings = await prisma.shop_settings.findUnique({
      where: { shop: shop }
    });

    if (!settings || !settings.google_access_token) {
        throw new Error("Google Drive connection lost. Please reconnect.");
    }

    // 2. Download File from Google Drive
    const fileBuffer = await getFileBuffer(
        { access_token: settings.google_access_token, refresh_token: settings.google_refresh_token },
        match.image.id
    );

    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error("The image file from Google Drive appears to be empty.");
    }

    // 3. Create Staged Upload in Shopify
    const fileName = match.image.name || "image.jpg";
    // Force a clean mimeType to avoid GCS Access Denied errors
    const mimeType = match.image.mimeType && match.image.mimeType !== "application/octet-stream" 
        ? match.image.mimeType 
        : "image/jpeg";

    const fileBlob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    const fileSize = String(fileBlob.size);

    const stagedResponse = await admin.graphql(
      `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: [{
            filename: fileName,
            mimeType: mimeType,
            resource: "IMAGE",
            fileSize: fileSize,
            httpMethod: "POST",
          }]
        }
      }
    );

    const stagedData = await stagedResponse.json();
    const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];

    if (!target) {
        const error = stagedData.data?.stagedUploadsCreate?.userErrors?.[0]?.message || "Shopify could not prepare storage for this image.";
        throw new Error(error);
    }

    if (!target.url) {
        throw new Error("Shopify did not return an upload URL. The staged upload might have failed.");
    }

    // 4. Upload to Shopify's Staged Target
    // IMPORTANT: The order of parameters must match what Shopify returns
    const uploadForm = new FormData();
    if (target.parameters) {
        target.parameters.forEach(p => {
            uploadForm.append(p.name, p.value);
        });
    }
    
    // Create the file part
    uploadForm.append("file", fileBlob, fileName);

    const uploadResponse = await fetch(target.url, {
        method: "POST",
        body: uploadForm,
        // Do NOT set headers manually, fetch + FormData handles everything
    });

    if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.text();
        console.error("Storage rejection details:", errorBody);
        
        if (errorBody.includes("SignatureDoesNotMatch") || errorBody.includes("AccessDenied")) {
            throw new Error("Shopify storage rejected the security signature. This usually means the file type or size is unexpected.");
        }
        throw new Error(`Storage error: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    // 5. Connect the staged file to Shopify Product
    const response = await admin.graphql(
      `mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media { id alt }
          userErrors { message }
        }
      }`,
      {
        variables: {
          productId: pid,
          media: [{
            alt: fileName,
            mediaContentType: "IMAGE",
            originalSource: target.resourceUrl,
          }]
        }
      }
    );

    const createResult = await response.json();
    const createdMedia = createResult.data?.productCreateMedia?.media || [];
    
    if (createdMedia.length > 0) {
      const mediaId = createdMedia[0].id;
      
      // 6. Link to Variant if applicable
      if (match.variant && match.variant.id) {
        await admin.graphql(
          `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants { id }
              userErrors { message }
            }
          }`,
          { 
            variables: { 
              productId: pid,
              variants: [{ id: match.variant.id, mediaId: mediaId }] 
            } 
          }
        );
      }

      // Update Database
      const job = await prisma.upload_jobs.findUnique({ where: { id: jobId } });
      const currentLogs = Array.isArray(job?.logs) ? job.logs : [];
      const newLog = {
          time: new Date().toISOString(),
          message: `${fileName} uploaded and linked successfully.`,
          type: "info"
      };

      await prisma.upload_jobs.update({
        where: { id: jobId },
        data: {
          processed_files: { increment: 1 },
          logs: [...currentLogs, newLog]
        }
      });

      return json({ success: true });
    } else {
        throw new Error(createResult.data?.productCreateMedia?.userErrors?.[0]?.message || "Shopify failed to link the image to the product.");
    }

  } catch (error) {
    console.error("Task Final Error:", error);
    try {
        const currentJob = await prisma.upload_jobs.findUnique({ where: { id: jobId } });
        const existingLogs = Array.isArray(currentJob?.logs) ? currentJob.logs : [];
        await prisma.upload_jobs.update({
          where: { id: jobId },
          data: { 
              logs: [...existingLogs, {
                  time: new Date().toISOString(),
                  message: `Critical: ${error.message}`,
                  type: "error"
              }] 
          }
        });
    } catch (dbErr) {
        console.error("Log persistence failure:", dbErr);
    }
    return json({ success: false, error: error.message });
  }
};
