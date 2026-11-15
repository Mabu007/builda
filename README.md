# BUILDA

A construction opportunities platform. This repository contains an initial React, Vite and Firebase foundation, not a production-ready marketplace.

## Setup

1. Install Node.js 20 or newer and run `npm install`.
2. Create a Firebase project, enable email/password Authentication and Firestore.
3. Copy `.env.example` to `.env.local` and fill in the Firebase web app settings.
4. Deploy `firestore.rules` using the Firebase CLI. Configure Firestore App Check and an abuse-protected server endpoint before accepting public job submissions in production; client-side submissions alone cannot provide robust rate limiting.
5. Run `npm run dev`, or `npm run build` for a production build. Deploy the frontend to Vercel with the same `VITE_FIREBASE_*` settings.

The admin role is a Firebase Auth custom claim `admin: true` that must only be assigned by trusted server-side code. The interface does not let users grant themselves access.

## Current scope and next steps

The foundation provides a public landing page, customer job intake, email/password auth, a private basic company profile, a published opportunities feed and admin review of incoming jobs. Public customer contact details are visible only to administrators. New customer jobs are not automatically published.

Private R2 document uploads, phone intake, matching, notifications, responses, AI summaries, public contractor directory, CSV imports, PWA, stronger validation and abuse protections, and automated end-to-end and security-rules tests remain to be implemented. Do not collect sensitive documents or launch publicly until these are implemented and independently verified. Firebase and Vercel credentials are not included.
