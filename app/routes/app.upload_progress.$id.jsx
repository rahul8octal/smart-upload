import { 
  Page, 
  Card, 
  ProgressBar, 
  Text, 
  BlockStack, 
  Box, 
  Button, 
  InlineStack,
  Icon,
  Banner
} from "@shopify/polaris";
import { ChevronLeftIcon } from "@shopify/polaris-icons";
import { useLoaderData, useNavigate, useParams, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import { useState, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const jobId = parseInt(params.id);

  const job = await prisma.upload_jobs.findUnique({
    where: { id: jobId }
  });

  if (!job || job.shop !== session.shop) {
    throw new Response("Not Found", { status: 404 });
  }

  return json({ job });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const jobId = parseInt(params.id);
  const formData = await request.formData();
  const status = formData.get("status");

  await prisma.upload_jobs.update({
    where: { id: jobId, shop: session.shop },
    data: { status: status }
  });

  return json({ success: true });
};

export default function UploadProgress() {
  const { job: initialJob } = useLoaderData();
  const { id: jobId } = useParams();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const [processedCount, setProcessedCount] = useState(0);
  const [logs, setLogs] = useState(Array.isArray(initialJob.logs) ? initialJob.logs : []);
  const [isStopped, setIsStopped] = useState(false);
  const [isCompleted, setIsCompleted] = useState(initialJob.status === "completed");
  const logEndRef = useRef(null);
  
  // Progress state
  const matchesRef = useRef([]);
  const replacementOptionRef = useRef("add");
  const startedRef = useRef(false);

  useEffect(() => {
    // 1. Load matches from sessionStorage
    const storedMatches = sessionStorage.getItem(`job_${jobId}_matches`);
    const storedReplacement = sessionStorage.getItem(`job_${jobId}_replacement`);
    
    if (storedMatches) {
      matchesRef.current = JSON.parse(storedMatches);
      replacementOptionRef.current = storedReplacement;
    }

    if (!startedRef.current && matchesRef.current.length > 0 && initialJob.status === "running") {
      startedRef.current = true;
      runUploadLoop();
    }
  }, []);

  const runUploadLoop = async () => {
    const matches = matchesRef.current;
    const replacementOption = replacementOptionRef.current;
    const handledProducts = new Set();

    for (let i = 0; i < matches.length; i++) {
        if (isStopped) break;

        const match = matches[i];
        const isFirstForProduct = !handledProducts.has(match.product.id);
        handledProducts.add(match.product.id);

        const formData = new FormData();
        formData.append("jobId", jobId);
        formData.append("match", JSON.stringify(match));
        formData.append("replacementOption", replacementOption);
        formData.append("isFirstForProduct", isFirstForProduct ? "true" : "false");

        try {
            const response = await fetch("/api/upload_item", {
                method: "POST",
                body: formData
            });
            const result = await response.json();
            
            if (result.success) {
                setProcessedCount(prev => prev + 1);
                setLogs(prev => [...prev, {
                    time: new Date().toISOString(),
                    message: `${match.image.name} uploaded successfully.`,
                    type: "info"
                }]);
            } else {
                setLogs(prev => [...prev, {
                    time: new Date().toISOString(),
                    message: `Error: ${result.error}`,
                    type: "error"
                }]);
            }
        } catch (err) {
            setLogs(prev => [...prev, {
                time: new Date().toISOString(),
                message: `Network error: ${err.message}`,
                type: "error"
            }]);
        }
    }

    if (!isStopped) {
      finishJob();
    }
  };

  const finishJob = () => {
    setIsCompleted(true);
    statusFetcher.submit({ status: "completed" }, { method: "post" });
    setLogs(prev => [...prev, {
        time: new Date().toISOString(),
        message: "Upload job completed!",
        type: "info"
    }]);
  };

  const stopJob = () => {
    setIsStopped(true);
    statusFetcher.submit({ status: "stopped" }, { method: "post" });
    setLogs(prev => [...prev, {
        time: new Date().toISOString(),
        message: "Job stopped by user.",
        type: "warning"
    }]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const progress = (processedCount / matchesRef.current.length) * 100 || 0;

  return (
    <Page
      fullWidth
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title={
        <InlineStack gap="200" align="center">
          <Text variant="headingLg" as="h1">Upload job #{jobId}</Text>
          <Text variant="bodyMd" tone={isCompleted ? "success" : isStopped ? "critical" : "primary"}>
            {isCompleted ? "completed" : isStopped ? "stopped" : "running"}
          </Text>
        </InlineStack>
      }
      primaryAction={
        !isCompleted && !isStopped && (
          <Button tone="critical" onClick={stopJob}>Stop job</Button>
        )
      }
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <ProgressBar progress={progress} tone="primary" size="large" />
            
            <BlockStack gap="200">
              <Text variant="bodyMd" fontWeight="bold">
                Folder name: {initialJob.folder_name} (shared)
              </Text>
              <Text variant="bodyMd" tone="subdued">
                Total {processedCount}/{matchesRef.current.length} images uploaded.
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card padding="0">
          <Box padding="400">
            <Text variant="headingMd" as="h2">Upload logs:</Text>
          </Box>
          <Box 
            padding="400" 
            background="bg-surface-secondary" 
            minHeight="300px" 
            maxHeight="500px" 
            overflowY="auto"
          >
            <div style={{ fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap" }}>
              {logs.map((log, i) => (
                <div key={i} style={{ marginBottom: "4px", color: log.type === "error" ? "#BF0711" : "#202223" }}>
                  [{new Date(log.time).toLocaleDateString()} {new Date(log.time).toLocaleTimeString()}] [info] {log.message}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </Box>
        </Card>

        {isCompleted && (
          <Banner tone="success" title="Success!">
             Your upload was completed successfully. You can now close this page or return to the dashboard.
          </Banner>
        )}
      </BlockStack>
    </Page>
  );
}
