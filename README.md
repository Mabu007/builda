# BUILDA — Contractor OS

BUILDA is a contractor-first operations workspace for South African construction companies. The landing page introduces the product; the private app brings tender intelligence, business information and compliance documents into one interface.

## Implemented in this branch

- Premium responsive dashboard: meaningful business-readiness and document counts, saved tenders and recent published opportunities; no fabricated analytics.
- Live government-data proxy: National Treasury's public OCDS /api/OCDSReleases endpoint, paginated 250 at a time and filtered by publication date (60 days by default). Heuristic construction classification, source attribution, status, government document links, search and saved opportunities. Data is only a subset: do not treat it as exhaustive, verified, or proof of eligibility.
- AI: on-demand plain-language tender interpretation via server-side OpenRouter. Model selection in Settings; models limited by current catalogue price and a modest call-rate guard. AI never submits bids or claims a firm is eligible.
- Private R2 document vault: server-issued 5-minute signed upload, download and delete URLs. File metadata, optional expiry and category live in per-contractor Firestore subcollections. Files limited to 15 MB and selected PDF/images/DOCX/XLSX formats.
- Firebase Auth and Firestore: existing email/password auth, editable private company profile, saved tender list and AI settings. Rules in `firestore.rules`.
- Scoped server APIs: user-signed Firebase ID tokens are checked cryptographically before access. OpenRouter and R2 secrets remain server-side.

### What is **not** included

Automatic tender bidding, procurement portal submissions, source PDF reading, qualification verification, bulk government tender indexing, procurement amendments/awards tracking, human approvals, automated agents, production usage metering and email notifications are not implemented. This is an initial tender intelligence and compliance workspace, not a turnkey tender service. No subscription billing.

## Setup: Firebase

1. Create/confirm a Firebase project, register the web app, enable **Authentication > Email/Password** and create Firestore in production mode.
2. Set the public `VITE_FIREBASE_*` fields in **Vercel > Project > Settings > Environment Variables** for the environments where you run the app. These are public Firebase web-app config values (not Admin SDK private keys).
3. Deploy the rules from the root of the repository, after authenticating with Firebase CLI and selecting the correct Firebase project:
   ```bash
   npx firebase-tools use YOUR_FIREBASE_PROJECT_ID
   npx firebase-tools deploy --only firestore:rules
   ```
   The repository's `firebase.json` points to `firestore.rules`. **A Vercel deploy does not automatically deploy Firestore rules.** Verify with one normal contractor user and ensure that another user cannot access their documents or profile.
4. Confirm Firebase **Authorized domains** include the BUILDA production domain and any preview domains used for authentication.

## Setup: Cloudflare R2

Create a private bucket, create a scoped R2 API token with object read/write permissions for **only this bucket**, and configure the **server-side** environment variables `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` on Vercel.

Configure the R2 bucket's CORS policy for allowed BUILDA website origins. At minimum, allow `PUT` from the exact Vercel deployment origin(s), with `Content-Type` as an allowed header. For example:

```json
[
  {
    "AllowedOrigins": ["https://builda-five.vercel.app"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add only trusted preview origins as needed. Do not expose the bucket publicly; do not place R2 credentials in browser-visible `VITE_` variables. Uploaded metadata is recorded in Firestore after a successful R2 upload. Client/browser upload limits alone do not enforce storage quotas; harden server-side usage controls before opening registration broadly. Check for orphaned objects and content-type/content-length abuse before accepting sensitive files.

## Setup: OpenRouter

Set `OPENROUTER_API_KEY` in Vercel as a **server-only** secret. The UI fetches the available low-cost model catalogue from OpenRouter and stores each contractor's selected model. Budget and rate limits should also be applied at OpenRouter account level; the in-memory per-instance rate guard is not distributed.

## eTenders data

The OCDS REST API is public and does **not** need an API key:
- Transparency portal: https://data.etenders.gov.za/
- Official OpenAPI schema: https://ocds-api.etenders.gov.za/swagger/v1/swagger.json
- Versioned releases endpoint: https://ocds-api.etenders.gov.za/api/OCDSReleases

The app queries the **server-side** proxy at `GET /api/tenders?page=1` with a signed-in user's Firebase ID token, not the upstream endpoint directly from the browser. The backend filters source dates and caches results briefly. The viewer initially shows construction-related opportunities with future deadlines; use the other filters and Load More to broaden. Check the official tender notice, attachments and the issuing department before acting. The feed is public but not guaranteed complete or real-time.

## Local setup and builds

```bash
npm ci
cp .env.example .env.local
# Fill the local Firebase configuration; add server secrets to your server environment.
npm run build
npm run dev
```

Vite local dev alone does not run Vercel Node functions in `/api`. To test API routes locally, use the Vercel CLI development runtime with an authorised project link, or test them in Vercel preview. Never commit `.env.local`.

## Release checklist

- [ ] Vercel preview `npm run build` passes and API routes deploy.
- [ ] Firebase rules are deployed to the correct project; authentication, signup, reload and inter-tenant isolation checked.
- [ ] Verify authenticated real OCDS responses, pagination, duplicate handling and source links.
- [ ] Verify OpenRouter model listing and a genuine tender explanation with usage caps.
- [ ] Verify R2 upload/download/delete, CORS and owner isolation with two different accounts.
- [ ] Mobile navigation, empty, error and loading states visually verified.
- [ ] Add Firestore rules emulator and end-to-end regression tests before public beta.
- [ ] Configure App Check, centralised rate limiting, quotas and logging before production release.
- [ ] Production merge and domain assignment only after these checks.

Do not claim the app is ready for public tender administration until the external services and cross-user security have been tested.


## November 2026 dashboard fixes

- Company-aware opportunity ranking is **explainable heuristic matching** over the currently loaded API batch, using stated services, location and CIDB. It is **not** an eligibility determination or an exhaustive search. Open a tender and request AI analysis for a model-generated assessment with the business context.
- PWA: `npm run build` generates branded 192/512px icons and `favicon.ico` automatically; `public/manifest.webmanifest` declares standalone app and `public/sw.js` caches **public static shell only**. Never cache authenticated APIs or business documents. Install panel hides after install and in standalone display mode.
- Firebase permissions: Vercel does **not** publish `firestore.rules`. Ensure Firestore database exists and production web config targets the same project as auth. Review and deploy with `firebase deploy --only firestore:rules --project <YOUR_FIREBASE_PROJECT_ID>` from a machine authenticated to the project. Existing contractor records without `ownerId` can be updated by their matching UID, after which ownership is enforced.
- R2 upload still requires CORS permitting `https://builda-five.vercel.app`, method PUT, header Content-Type and signed URL GET access. Verify actual document round trip before real compliance files.
- The frontend uses localStorage only for the theme, not for private business data. If Firestore is unavailable, show an explicit error rather than a misleading empty vault.
