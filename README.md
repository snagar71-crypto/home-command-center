# 🏠 Nagar Family — Home Command Center

React + Firebase Firestore + GitHub Pages. Free, real-time, shared across the whole family.

**Live URL:** `https://YOUR_GITHUB_USERNAME.github.io/home-command-center/`

---

## Setup (~15 minutes, one time)

### 1. Create a Firebase project (free)
1. Go to [console.firebase.google.com](https://console.firebase.google.com) — sign in with sanmeenal.nagar@gmail.com
2. Click **Add project** → name it `home-command-center` → Continue (disable Google Analytics if you want) → Create
3. In the left sidebar → **Firestore Database** → **Create database** → Start in **test mode** → choose a region (us-central1) → Enable
4. In the left sidebar → **Project settings** (gear icon) → scroll to **Your apps** → click **</>** (Web) → register app (name it anything) → copy the `firebaseConfig` object — you'll need those 6 values

### 2. Set Firestore rules (so only your family can write)
In Firebase Console → Firestore → **Rules** tab, paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{eventId} {
      allow read, write: if true; // family app — open access
    }
  }
}
```
Click **Publish**.

### 3. Create your GitHub repo
1. [github.com](https://github.com) → **New repository** → name it exactly `home-command-center` → Public → Create
2. Upload all these files (drag-and-drop on GitHub web UI, or `git push`)

### 4. Add Firebase secrets to GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add all 6:

| Secret name | Value |
|-------------|-------|
| `VITE_FIREBASE_API_KEY` | from firebaseConfig |
| `VITE_FIREBASE_AUTH_DOMAIN` | from firebaseConfig |
| `VITE_FIREBASE_PROJECT_ID` | from firebaseConfig |
| `VITE_FIREBASE_STORAGE_BUCKET` | from firebaseConfig |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from firebaseConfig |
| `VITE_FIREBASE_APP_ID` | from firebaseConfig |

### 5. Enable GitHub Pages
Repo → **Settings → Pages → Source: GitHub Actions** → Save

### 6. Done!
Go to the **Actions** tab — watch the deploy run (~2 min). Your app is live at:
`https://YOUR_GITHUB_USERNAME.github.io/home-command-center/`

Share with the family. Every browser updates in real time when anyone adds or edits an event. ✨

---

## Local dev
```bash
cp .env.example .env.local   # fill in your Firebase values
npm install
npm run dev                   # runs at localhost:5173
```

## Stack
| | Tool | Cost |
|--|------|------|
| Frontend | React + Vite | Free |
| Database | Firebase Firestore | Free (Spark plan) |
| Real-time | Firestore onSnapshot | Included |
| Hosting | GitHub Pages | Free |
| CI/CD | GitHub Actions | Free |
