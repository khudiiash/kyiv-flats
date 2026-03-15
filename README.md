# Kyiv Flats

A PWA for managing apartment search in Kyiv. Store options on a Google Map, filter and sort in the sidebar, add/edit flats with photos and details.

## Setup

### 1. Firebase

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Firestore Database** and **Storage**
3. In Project Settings → General, add a web app and copy the config
4. Create `.env` from `.env.example` and fill in your Firebase config

### 2. Google Maps

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Maps JavaScript API**, **Geocoding API**, and **Places API (New)**
3. Create an API key and add it to `.env` as `VITE_GOOGLE_MAPS_API_KEY`

### 3. Firestore rules

In Firebase Console → Firestore → Rules, use (for development; tighten for production):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /flats/{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 4. Storage rules

In Firebase Console → Storage → Rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /flats/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

## Firebase Functions (parse listing from URL)

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Deploy: `cd functions && npm install && npm run build && firebase deploy --only functions`

The `parseListingUrl` function parses dom.ria.com and lun.ua links and extracts address, price, area from meta/JSON-LD.

## Run

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## GitHub Actions (auto deploy)

On push to `main` or `master`, the app deploys to Firebase Hosting.

### Setup secrets

In GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|--------|-------------|
| `FIREBASE_TOKEN` | Run `firebase login:ci` locally, paste the token |
| `VITE_FIREBASE_API_KEY` | From Firebase config |
| `VITE_FIREBASE_AUTH_DOMAIN` | From Firebase config |
| `VITE_FIREBASE_PROJECT_ID` | From Firebase config |
| `VITE_FIREBASE_STORAGE_BUCKET` | From Firebase config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | From Firebase config |
| `VITE_FIREBASE_APP_ID` | From Firebase config |
| `VITE_GOOGLE_MAPS_API_KEY` | From Google Cloud Console |

## Features

- **Map**: Google Map of Kyiv with markers for each flat
- **Sidebar**: List with filters (price, area, commission, parks) and sort options
- **Add/Edit**: Form with address geocoding, photos, contacts, details
- **PWA**: Installable, works offline for cached data
