# LayerLabs — Editable React storefront

LayerLabs is built with React 18, TypeScript and Vite. All customer-facing pages, product variants, cart/checkout, order tracking, cancellation requests and the administrator interface live in `src/`; deployments no longer load the application bundle from another Vercel deployment.

## Local development

```bash
npm install
npm run dev
```

Build, typecheck and run the small legacy logic test suite:

```bash
npm run typecheck
npm run build
npm test
```

## Environment

Configure these values in Vercel for **Preview and Production**:

- `VITE_SUPABASE_URL` — the Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the public/publishable Supabase key. Never put a service-role key in Vite environment variables.

The app reads the published catalogue from `public.store_catalog`, creates orders in `public.store_orders`, and uses the narrowly scoped `lookup_store_order` and `request_store_order_cancellation` RPCs. Authoritative pricing, shipping, coupon eligibility, stock, payment-pending state, verifier metadata and audit logging are enforced in Supabase. Manual UPI payments are not marked paid until an administrator reconciles them with bank records.

## Custom CAD requests

The current Supabase project does not have a private CAD-upload bucket. For safety, the custom-print page validates the chosen file locally and launches a WhatsApp request; it **does not upload the CAD file**. Configure private storage, access policies, signed URLs and isolated geometry processing before enabling actual online CAD upload.

## Deployment

Vercel project: `layer-labs-new`. The application must be connected to this repository (`satyasathwik921-sys/LayerLabs-New`) with `main` as the Production Branch. The root `vercel.json` keeps response security headers and a local SPA fallback; there are no cross-deployment asset rewrites.

## Important operating notes

- The catalogue fallback exists for a readable storefront during a temporary connection problem. Checkout and the admin sign-in are disabled unless the shared Supabase catalogue/configuration is available.
- Refunds are reviewed and processed manually; a request/status is not proof that money has been transferred.
- The Content Security Policy is report-only pending real-browser violation review.
