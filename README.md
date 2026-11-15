# OPPOTRON — Opportunity Intelligence, Powered by AI

**Your business. The right opportunities. Automatically.**

OPPOTRON is the evolution of BUILDA into a multi-sector SaaS opportunity-intelligence workspace for **private companies and NPOs**. Its long-term ambition is an intelligent opportunity administration department: profile, documents, source discovery, matching, preparation, application tracking and human-approved automation.

The actual shipped MVP must be described accurately. Some capabilities are currently implemented; others are explicitly planned.

## Implemented now

- **React + Vite workspace** and premium public SaaS landing website branded as OPPOTRON.
- **Firebase Authentication** (email/password), plus a first-sign-in organisation selector: **Private Company** or **NPO**. The selection is saved to a private Firestore profile and updates the profile terminology. Organisation profiles include sector, services/mission, operating areas, programmes/projects, contact information and goals.
- **Public procurement data** from National Treasury's OCDS release feed, fetched by an authenticated server API (`/api/tenders`), paginated and shown as recent releases. The feed is NOT an exhaustive government tender database. Company-aware keyword/category, geography and CIDB relevance ranking uses the fields supplied; never treats a match as verified eligibility.
- **Document vault** on R2 with per-user signed URLs and Firestore metadata. Multiple files per upload batch, required display names, optional descriptions/categories/expiry dates, and document metadata details modal. **No OCR/text extraction is implemented yet.** Files are private.
- **OPPOTRON AI admin assistant**, a full conversation workspace with new chats, private Firestore chat/message history, delete, suggested prompts, message composer, and a floating chat button. Users can ask questions about procurement notices, grant/CSI calls they provide, application checklists, missing details and general administration. A tender's details can be passed directly into a new assistant conversation.
- **OpenRouter AI** through server-only credentials; the free automatic model (`openrouter/free`) is the default, low-cost model selection is available in Settings, and approved selected models can fall back to a free model if the paid model fails. API errors distinguish missing/invalid keys, insufficient credits, rate limits, timeouts and provider outages. These safeguards cannot guarantee service while upstream is unavailable.
- Responsive desktop/mobile dashboard with light/dark themes.

## Planned — NOT yet implemented

- Continuous, verified CSI/grant and private-procurement source aggregation.
- OCR, document text extraction, automatic compliance/eligibility validation.
- Full application drafting across uploaded documents, portal submissions, application-status tracking, monitoring, automated follow-ups, browser automation or award predictions.
- Subscription billing and optional managed services.

The NPO mode currently adapts the profile and assistant, but the live listing is still the **public OCDS procurement feed**. The app tells users that CSI/grant ingestion is coming; never show fictitious grant matches.

## Setup

### Firebase

1. Set up Firebase Authentication (**Email/Password**) and a Firestore database on the same project.
2. Set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` in Vercel.
3. **Publish `firestore.rules` manually** under **Firebase Console → Firestore Database → Rules → Publish**, or run `npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID`. Vercel does **not** deploy Firestore rules.
4. The new rules add `organizationType` on organisation profiles, and private `contractors/{uid}/chats/{chatId}` and `messages/{messageId}` paths. The assistant cannot save chat history if these rules have not been published.

### OpenRouter

- Set `OPENROUTER_API_KEY` as a **server-side** Vercel environment variable for production/preview.
- Default `openrouter/free` is a free chat-model router; a valid API key and available rate-limit quota are still necessary.
- Check network status and the displayed AI error. HTTP 401 means invalid key; HTTP 402 means billing/credit cap; HTTP 429 rate limiting; HTTP 502/503 provider availability. Server functions report a safe diagnostic error without disclosing API keys or private prompt content in logs.
- A request may fall back to free routing, never automatically to a more expensive model. Free models may be limited by provider quotas.

### Cloudflare R2

Configure `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` as **private** Vercel environment variables. Configure the R2 bucket CORS to permit `https://builda-five.vercel.app` (current production hostname), method PUT, and Content-Type. Verify a real signed upload, Firestore metadata save, download and delete before handling real compliance documents.

### Local and CI validation

```bash
npm ci
npm run build
```

`npm run build` runs Node tests, TypeScript and Vite. A GitHub Actions workflow has been added for pull requests and feature branches.

## Trust and privacy

- Firestore company and NPO profiles, chats, chat messages, saved notices and file metadata are owner-scoped by the supplied rules.
- AI requests include the organisation's declared capabilities and selected notice as context. Document metadata is shared as hints, **not document contents**. Sensitive contact details are excluded.
- Public tender descriptions are untrusted input. OpenRouter output is explanatory, not authoritative legal, compliance or procurement advice.
- No applications are submitted or declarations signed without authorised human review.
- Live data coverage and availability depend on government/open-source providers; do not invent matches or guarantees.

## Deployment

Repository: `Mabu007/builda` (historical repository name), Vercel project: `builda` (historical project name), public URL: https://builda-five.vercel.app. Application/product brand is **OPPOTRON**. Do not change repository/project ownership or production domain implicitly during rebrand.

Vercel's Hobby deployment quota may block Git push previews and fresh production deployments with HTTP 402 until the quota is available or the owner changes the plan. Do not label a release production-ready until the exact commit's build has passed and the production alias is confirmed.
