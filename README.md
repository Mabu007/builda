# OPPOTRON — Fundraising Administration for Nonprofits

**Your funding. Your documents. Your future.**

OPPOTRON is an NPO-focused SaaS workspace for secure organisational records, reviewed funding opportunities, fundraising document creation and application tracking. Its public website and existing design system are intentionally preserved.

## Funding administration release

### User workspace
- **Home**: displays published funding calls immediately, including for new accounts with an empty profile; after 30% of ten profile fields are completed, the same feed is ranked by relevance.
- **Funding opportunities**: every published record is visible without an onboarding gate. Closed deadlines appear after open calls. After 3 of 10 profile fields are provided, results receive profile-relevance ranking without suppressing unmatched calls. Records show source-review status, official application links, and private saving/application tracking.
- **Documents**: existing secure Cloudflare R2 vault remains unchanged.
- **Document Creator**: working AI-assisted proposal drafting from the declared organisation profile; editable text; drafts stored in user-private Firestore; export to Word-compatible `.doc` HTML or browser print/PDF. **Tiptap rich text and native DOCX/PDF generation are still planned.** Document drafting uses organisation profile and document metadata, not the uploaded file contents.
- **Applications**: private application-status tracking, notes, and funding requirement checklists. OPPOTRON does **not** submit applications, sign declarations or collect actual funding awards automatically.
- **Organisation**: optional NPO profile drives funding relevance from 30% completion onward. The general-purpose Q&A chatbot, floating Ask OPPOTRON launcher, chat navigation and `/api/assistant` endpoint have been retired; previously stored chat records are not deleted.

### Admin Dashboard
From the regular `/login` page, use the small **Admin access** link to open `/admin/login`; or visit `/admin` when signed in using an account with a **Firebase Authentication custom claim `admin: true`**. The backend cryptographically verifies the claim and Firestore rules check it again. Regular users are denied and the API keys are never passed to clients.

- **Overview**: organisation count, opportunity count, published/active counts, review queue, activity. Large dataset counts are marked partial after the current cap.
- **Users**: Firestore organisation profiles. Full Firebase Authentication users (including accounts without profiles), actual signup/last-login timestamps and claims require a **Firebase service account**. The dashboard provides user search and account/profile detail inspection. It does not claim a subscription state without a provider.
- **Opportunities**: admin-only manual creation/editing, publication, unpublication, archiving, deletion, duplicate prevention and bounded PDF downloads. **A website, external verification and a funder name are optional for manual records**; title is required. Admins can supply a contact email, telephone/WhatsApp or application instructions instead. The application link is never inferred from an informational source URL.
- **Discovery**: Firecrawl v2 search first, Tavily fallback for search, Firecrawl v2 JSON extraction for source URLs. Discovery jobs, candidates, errors, source URLs, progress, and explicit import/review actions persist in Firestore. **Imported records start in draft/unverified state.**
- **Provider test**: the “Test Firecrawl & Tavily” action makes **real, small authenticated server-side calls** (these consume provider quota). The status is visible only to a verified admin.

## Set up the required infrastructure

### 1. Publish Firestore rules (mandatory)

Vercel **cannot** automatically publish Firebase database rules.

In **Firebase Console → Firestore Database → Rules**, replace existing rules with the exact `firestore.rules` file in this repository and **Publish**.

New paths are:
- Shared `/opportunities/{id}` and `/funders/{id}`. Only verified Firebase admins may write. Users may read published records.
- Private `/contractors/{uid}/savedFunding/{opportunityId}`.
- Private `/contractors/{uid}/applications/{opportunityId}`.
- Private `/contractors/{uid}/fundingDrafts/{id}`.
- Admin-only `/opportunityKeys`, `/discoveryJobs`, `/discoveryCandidates`, `/discoveryLocks`.

The storage scheme intentionally keeps **one shared opportunity per funder/title/application round** and uses a canonical source URL alias to reject duplicate imported entries. User applications and saved opportunities remain in private account subcollections.

### 2. Assign your first Firebase admin (mandatory)

No normal user is an administrator by default, including the account that created the project.

First download a Firebase service-account JSON from **Firebase Console → Project Settings → Service Accounts → Generate new private key**, securely store it outside the repo, and find your account UID in **Authentication → Users**.

Run locally, replacing the placeholders with your own Firebase project and UID:

```bash
export FIREBASE_PROJECT_ID='YOUR_PROJECT_ID'
export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat ./service-account.json)"
node scripts/grant-admin.mjs 'YOUR_FIREBASE_AUTH_UID' --grant
```

The script only changes the Firebase custom claim for the **UID supplied**, preserving existing custom claims. After granting, sign out and back in to refresh your session.

To revoke access, run the same command with `--revoke`. Never commit service-account JSON or private keys to GitHub.

### 3. Production Vercel environment variables

Already detected in production (values have **not** been read):
- `FIRECRAWL_API_KEY`
- `TAVILY_API_KEY`
- `OPENROUTER_API_KEY`
- `VITE_FIREBASE_PROJECT_ID` and other existing Firebase variables
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Firecrawl/Tavily API keys were set only for the **Production** environment; Preview deployments may build correctly but cannot perform provider calls with absent Preview keys.

**Optional for complete user inventory and unattended jobs**:
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the service-account JSON string (or separate `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_PROJECT_ID`).
- `CRON_SECRET`: long, random secret required by the scheduled endpoint.

Keep both as **server-only secrets**. Never prefix them with `VITE_`.

### 4. Scheduled discovery and refresh

`vercel.json` configures a daily trigger for `/api/cron-discovery`. It creates the two defined, location-appropriate funding searches once per Monday, processes persisted pending jobs and creates a **review candidate** when rechecking a published opportunity. **It will not overwrite verified/published records without review**. It requires a service-account credential and a `CRON_SECRET`; without them, cron responds with an error and cannot process jobs unattended.

The Admin Discovery interface processes individual pages on demand and displays progress. Jobs persist across UI sessions, so admin-initiated discovery does not need one long frontend request. Large jobs still depend on background cron processing once configured. Use modest result limits to control Firecrawl and Tavily credits.

### 5. Verify the release

1. Publish the latest Firestore rules.
2. Assign the admin claim and sign out/in.
3. Open `https://builda-five.vercel.app/admin` and confirm a regular account is denied.
4. Use **Discovery → Test Firecrawl & Tavily** and inspect each real provider response.
5. Run a 5-result search and then a direct source URL extraction. Verify that candidates are saved but not published automatically.
6. Review an extracted funding call and import it as draft. Confirm duplicates are rejected when reimporting.
7. Publish one **manual, unverified funding call with no website**, using only a title and optionally an email/phone contact. Confirm a new NPO with an empty profile sees it; the contact method and instructions appear in opportunity details and application tracking. Add 3 of 10 profile fields and confirm ranking changes without hiding other calls. Separately verify and publish a website-sourced call.
8. Try signing in as another account and confirm saved opportunities, applications and drafts do not cross accounts.

## Security and important limits

- **Do not confuse admin review with independent verification of grant legitimacy.** OPPOTRON does not guarantee a funder's trustworthiness or award probability.
- Firecrawl and Tavily results are untrusted. Discovery uses HTTPS-only source URLs, output validation, limits and human review. Direct PDF import caps size, checks DNS destinations and restricts uploads to signed R2 keys.
- **OCR is not available yet**. Files' categories and names can indicate possible gaps, but no actual file contents are checked.
- Automated form filling or submission is not implemented.
- No subscription provider is integrated, so subscription metadata can be absent.
- Avoid promises about all registered Firebase Auth users until the service-account integration is configured.
- Browser preview builds, unit tests and static checks cannot prove live provider keys work. Use the verified admin-only connectivity check in production.

## Local checks

```bash
npm ci
npm run build
```

Build includes Node unit/integration tests, TypeScript compilation and the Vite frontend build.

Repository remains `Mabu007/builda`; production Vercel project and existing URL `https://builda-five.vercel.app` are retained.
