# OPPOTRON — The AI Fundraising Workspace for Nonprofits

**Your funding. Your documents. Your future.**

OPPOTRON helps small and community nonprofit organisations organise their administration, documents and fundraising preparation without a full-time back-office team.

## Current release

- **Premium NPO-first landing page** introducing the four product pillars, clearly distinguishing available features from the roadmap.
- **NPO-only registration experience**. Firebase Auth provides private accounts; there is no longer a Company/NPO selection popup.
- **Organisation profile** for name, NPO/NPC/PBO registration references (where applicable), mission, focus, programmes, beneficiaries, community coverage, independently supplied achievements, fundraising priorities and contact information.
- **Private document vault** with Cloudflare R2 files and Firestore metadata; batch uploads with required name, optional description, category, and expiry. Document categories now include NPO registration, constitution, governance, financial statements, annual reports, programmes/impact and funding proposals.
- **OPPOTRON AI fundraising assistant** using OpenRouter with its existing private conversation list, saved Firestore chat history, organisation context, document **metadata**, practical proposal outlines and application checklists. The assistant occupies the main dashboard content area, without the former floating-card framing.
- **Home dashboard** with actual document counts, recorded expirations and **profile completeness** (not a verified compliance score). No fictitious opportunity metrics or public procurement feed.
- **Navigation:** Home, Opportunities, Documents, Document Creator, Applications, Organisation, OPPOTRON Assistant, Settings.
- **Light/dark themes**, responsive mobile and desktop layouts retained.

## Planned features — not available yet

1. **Document understanding:** OCR / extraction and verification of uploaded files; detailed compliance readiness against funder-specific criteria.
2. **Funding discovery:** verified scheduled ingestion of grants, CSI programmes, foundation announcements and prospective funding partners, with eligibility-first NPO matching.
3. **Document Creator:** a Tiptap-based rich text editor, AI-assisted draft workflows, private saved templates and DOCX/PDF export.
4. **Applications:** per-funder requirement checklists, user-approved submission workflows, deadlines, statuses and outcome tracking.

The previous eTenders feed has been removed from the **visible application and active client requests**. The historical backend API and saved legacy data are not automatically deleted; this is not yet a grant ingestion system. Opportunity pages clearly state that the source integrations are being built.

### Privacy and accuracy

- The **organisation profile is the declared source of truth** for AI context. It is not yet automatically enriched from file contents, because OCR and document verification are still pending.
- AI receives organisation profile fields and document metadata, **not the contents** of uploaded R2 documents. Never describe file metadata as verified evidence.
- The AI must not invent funder opportunities, closing dates, registration status, requested amounts, organisational budgets, results, beneficiary counts or past achievements. Application submissions always require human approval.
- Owner-scoped security rules isolate each user's company/NPO record, messages, saved historic notices and documents.

## Deployment

Frontend: Vite + React + TypeScript; Firebase Auth and Firestore; Cloudflare R2 for private files; Vercel server APIs; OpenRouter AI. Repository remains `Mabu007/builda`, Vercel project remains `builda`, and the current hosted URL remains https://builda-five.vercel.app/.

**Important:** Whenever `firestore.rules` changes, publish it in Firebase Console → Firestore Database → Rules. Vercel deploys frontend/API code, not Firestore rules. The NPO profile introduces validated fields `npcNumber`, `pboNumber`, `yearEstablished`, `website`, `beneficiaries`, and `fundingPriorities`. These cannot be saved until matching rules are deployed.

### Test / build

```bash
npm ci
npm run build
```

This executes Node tests, TypeScript checks and a Vite production build. A READY deployment confirms assets built successfully, **not** that Firebase rules, live OpenRouter responses or R2 upload/download were verified for a signed-in user.
