# ModelHub draft ingestion (preview only)

This branch adds a private cloud-asset bucket and a server-only draft ingestion API for the LayerLabs storefront.

## Safety model

- Drafts are written to `public.store_catalog` with `status: "draft"`; the existing public catalogue loader filters drafts out.
- Original CAD/mesh files are stored in the private `modelhub-assets` Supabase Storage bucket.
- The browser never receives the Supabase service-role key or the ModelHub ingest token.
- The API accepts only draft records and requires a supported, verified commercial-use licence (CC0, CC-BY, CC-BY-SA, or MIT). Unknown, NonCommercial and NoDerivatives licences are rejected.
- No migration is applied automatically. Do not apply this migration to production as part of preview testing.

## Preview environment variables

Configure these in the Vercel **Preview** environment only:

- `SUPABASE_URL`: URL of the exact Supabase project used by the LayerLabs preview.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for that same project. Never use a `VITE_*` prefix.
- `LAYERLABS_MODELHUB_INGEST_TOKEN`: random secret of at least 32 characters, shared with the ModelHub server.

Do not paste secrets into Git, pull requests, chat, or client-side variables.

## Preview setup

1. Create a dedicated Supabase preview project or use a confirmed non-production project.
2. Verify the project ref matches the LayerLabs preview's `VITE_SUPABASE_URL`.
3. Review and apply `supabase/migrations/20261126090000_modelhub_private_asset_ingestion.sql` to that preview project only.
4. Configure the three Vercel Preview environment variables above.
5. Deploy this branch as a Vercel Preview and verify `POST /api/modelhub/draft` returns 401 without a token and 503 if server configuration is missing.
6. Test signed upload using a non-sensitive fixture file, then verify the object is private and the catalogue item remains hidden with `status: "draft"`.

## API contract

All requests are POST and require `Authorization: Bearer <LAYERLABS_MODELHUB_INGEST_TOKEN>`.

### Create a signed upload destination

```json
{
  "action": "create-upload",
  "modelhubModelId": "modelhub_12345678",
  "filename": "bracket.stl",
  "contentType": "model/stl",
  "sizeBytes": 12345,
  "sha256": "<64 lowercase hex characters>"
}
```

The response contains `bucket`, `objectPath`, `uploadUrl`, `uploadToken`, and `contentType`. The ModelHub backend streams the bytes to the signed Supabase upload URL with HTTP PUT; no local workstation download is involved.

### Create a hidden catalogue draft

```json
{
  "action": "create-draft",
  "product": {
    "id": "modelhub-product-123",
    "modelhubModelId": "modelhub_12345678",
    "status": "draft",
    "name": "Verified model name",
    "price": 0,
    "category": "3d-print",
    "description": "Description grounded in source metadata.",
    "licenseCode": "CC-BY-4.0",
    "commercialAllowed": true,
    "licenseVerifiedAt": "2026-11-26T00:00:00.000Z",
    "modelAsset": {
      "bucket": "modelhub-assets",
      "path": "modelhub/modelhub_12345678/<sha256>-bracket.stl",
      "filename": "bracket.stl",
      "format": "stl",
      "sizeBytes": 12345,
      "sha256": "<64 lowercase hex characters>",
      "sourceUrl": "https://example.org/model",
      "creatorName": "Creator",
      "licenseCode": "CC-BY-4.0",
      "licenseVerifiedAt": "2026-11-26T00:00:00.000Z"
    }
  }
}
```

The endpoint invokes `public.modelhub_upsert_draft` using the service role. This endpoint does not publish products live.

## Current limitations

- This storefront branch provides the secure receiving endpoint and database migration; it does not yet run discovery or download source files itself.
- ModelHub's worker must call these endpoints, verify source-specific download permission, stream file bytes, inspect file contents, and then create the draft.
- Printables and MakerWorld remain link-only unless their official APIs or explicit creator-authorized download mechanisms permit automated file transfer.
- The current storefront schema stores product data as one JSON catalogue row. Draft writes lock that row and upsert by ModelHub ID.
- Do not use a production Supabase project for the first test. No migration has been applied and no production deployment has been made.
