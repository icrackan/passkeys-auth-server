Vercel deployment and local dev notes

This file explains how to run the API locally and deploy to Vercel. It also shows how to set environment variables safely.

1) Prepare service account
- In Firebase Console -> Project settings -> Service accounts -> Generate new private key.
- Save the downloaded JSON somewhere safe (do NOT commit it).
- Base64-encode it for safe single-line storage:

  # macOS / Linux
  cat path/to/serviceAccount.json | base64

  Copy the output (a long single-line string).

2) Local development (optional)
- Create a local `.env` file (copy `.env.example` and fill values). The repo's `.gitignore` already excludes `.env`.
- Install dependencies (already present):

  npm install

- Run Vercel dev (serve serverless functions locally):

  npm i -g vercel      # if you haven't installed the Vercel CLI
  vercel login
  vercel dev

  Visit http://localhost:3000/api/webauthn/register
  and  http://localhost:3000/api/webauthn/authenticate

3) Add env vars to Vercel (Dashboard)
- In Vercel Dashboard -> Project -> Settings -> Environment Variables, add:
  - FIREBASE_SERVICE_ACCOUNT (value = the base64 string you copied)
  - FIREBASE_DATABASE_URL (e.g. https://your-project-id.firebaseio.com)
  - RP_ID (optional)

Or use the Vercel CLI:

  vercel env add FIREBASE_SERVICE_ACCOUNT production
  vercel env add FIREBASE_DATABASE_URL production
  vercel env add RP_ID production

Note: the CLI will prompt you to paste the value for each variable.

4) Deploy to Vercel
- If you connected the repo via the Vercel dashboard, pushes to the selected branch will auto-deploy.
- Or run a one-off deploy from the root:

  vercel --prod

5) CORS and frontend
- If your frontend is hosted separately (e.g. Firebase Hosting), update the API to allow that origin.
  Current example returns Access-Control-Allow-Origin with the `RP_ID` origin. Adjust as needed.

6) Security notes
- Never commit your service account JSON or the base64 string to git.
- Use Vercel Environment Variables (not hard-coded in source) to keep secrets safe.
- Monitor Firebase billing if your backend performs heavy operations.

7) Troubleshooting
- Use `vercel logs <deployment-url>` or the Vercel dashboard for function logs.
- Use `vercel dev` locally for debugging.
