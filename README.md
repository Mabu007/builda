# BUILDA

A contractor workspace for tender administration and compliance. This repository contains an initial React, Vite and Firebase foundation, not a production-ready marketplace.

## Setup

1. Install Node.js 20 or newer and run `npm install`.
2. Create a Firebase project, enable email/password Authentication and Firestore.
3. Copy `.env.example` to `.env.local` and fill in the Firebase web app settings.
4. Deploy `firestore.rules` using the Firebase CLI. Configure Firestore App Check and an abuse-protected server endpoint before accepting public job submissions in production; client-side submissions alone cannot provide robust rate limiting.
5. Run `npm run dev`, or `npm run build` for a production build. Deploy the frontend to Vercel with the same `VITE_FIREBASE_*` settings.

The admin role is a Firebase Auth custom claim `admin: true` that must only be assigned by trusted server-side code. The interface does not let users grant themselves access.

## Current scope and next steps

The foundation provides a contractor-focused landing page, email/password authentication and a private company profile. The landing page includes a clearly labelled illustrative preview of the planned workspace. The live dashboard does not yet provide agent activity, approvals, or a document vault.

Private R2 document uploads, tender sourcing, AI-assisted tender preparation, human review, approvals, notifications, activity reports, PWA, stronger validation and abuse protections, and automated end-to-end and security-rules tests remain to be implemented. Do not collect sensitive documents or launch publicly until these are implemented and independently verified. Firebase and Vercel credentials are not included.
