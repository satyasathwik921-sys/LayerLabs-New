import { createHash, timingSafeEqual } from "node:crypto";

const BUCKET = "modelhub-assets";
const MAX_BYTES = 200 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".obj": "model/obj",
  ".step": "model/step",
  ".stp": "model/step",
  ".iges": "model/iges",
  ".igs": "model/iges",
  ".amf": "application/octet-stream",
  ".ply": "application/octet-stream",
  ".glb": "model/gltf-binary",
};

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function response(res: any, status: number, body: unknown) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

function config() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const token = process.env.LAYERLABS_MODELHUB_INGEST_TOKEN || "";
  if (!url || !key || token.length < 32) throw new Error("ModelHub draft ingestion is not configured.");
  return { url, key, token };
}

async function supabaseFetch(url: string, key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(url + path, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Supabase request failed (${res.status}): ${String((body as any).message || (body as any).error || "unknown error").slice(0, 180)}`);
  return body as Record<string, unknown>;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return response(res, 405, { error: "Method not allowed." });
  let cfg: ReturnType<typeof config>;
  try { cfg = config(); } catch (error) { return response(res, 503, { error: (error as Error).message }); }

  const auth = String(req.headers.authorization || "");
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secretMatches(supplied, cfg.token)) return response(res, 401, { error: "Unauthorized." });

  const body = req.body || {};
  try {
    if (body.action === "create-upload") {
      const modelId = String(body.modelhubModelId || "");
      const filename = String(body.filename || "");
      const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
      const expectedMime = EXTENSIONS[ext];
      const mime = String(body.contentType || expectedMime || "application/octet-stream");
      const size = Number(body.sizeBytes);
      const sha256 = String(body.sha256 || "").toLowerCase();

      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(modelId)) return response(res, 400, { error: "Invalid modelhubModelId." });
      if (!expectedMime || mime !== expectedMime) return response(res, 415, { error: "Unsupported model file type." });
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) return response(res, 413, { error: "Model file must be between 1 byte and 200 MB." });
      if (!/^[a-f0-9]{64}$/.test(sha256)) return response(res, 400, { error: "A SHA-256 checksum is required." });

      const safeName = filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const objectPath = `modelhub/${modelId}/${sha256}-${safeName}`;
      const signed = await supabaseFetch(cfg.url, cfg.key,
        `/storage/v1/object/upload/sign/${BUCKET}/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upsert: false }) }
      );
      const signedPath = String(signed.url || signed.signedURL || "");
      if (!signedPath) throw new Error("Supabase did not return a signed upload URL.");
      const uploadUrl = signedPath.startsWith("http") ? signedPath : `${cfg.url}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
      const token = new URL(uploadUrl).searchParams.get("token");
      if (!token) throw new Error("Supabase signed upload response did not include a token.");
      return response(res, 200, {
        bucket: BUCKET,
        objectPath,
        uploadUrl,
        uploadToken: token,
        contentType: mime,
        maxBytes: MAX_BYTES,
        expiresInSeconds: 7200,
      });
    }

    if (body.action === "create-draft") {
      const product = body.product;
      if (!product || typeof product !== "object" || Array.isArray(product)) return response(res, 400, { error: "Product object is required." });
      if (product.status !== "draft") return response(res, 403, { error: "This endpoint only accepts draft products." });
      const modelId = String(product.modelhubModelId || "");
      const asset = product.modelAsset || {};
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(modelId) || asset.bucket !== BUCKET || !String(asset.path || "").startsWith(`modelhub/${modelId}/`)) {
        return response(res, 400, { error: "Invalid cloud model asset reference." });
      }
      const license = String(product.licenseCode || "UNKNOWN");
      if (!["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "MIT"].includes(license) || product.commercialAllowed !== true || !product.licenseVerifiedAt) {
        return response(res, 403, { error: "A verified commercial-use licence is required. Unknown, NC and ND licences are blocked." });
      }
      const result = await supabaseFetch(cfg.url, cfg.key, "/rest/v1/rpc/modelhub_upsert_draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_product: product }),
      });
      return response(res, 200, { ok: true, status: "draft", product: result });
    }

    return response(res, 400, { error: "Unknown action." });
  } catch (error) {
    return response(res, 502, { error: (error as Error).message || "Draft ingestion failed." });
  }
}
