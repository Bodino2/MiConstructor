# NextGen Logistic 🚚📍

Live tracking platform for logistics operations — **Node.js/Express gateway + NestJS tracking module + Flutter mobile apps** fully integrated.

---

## 🧱 Project Structure

```
logistics-project/
├── backend/                          # Node.js gateway & NestJS modules
│   ├── index.js                      # Express gateway (port 3000)
│   ├── auth-service.js               # Auth service (port 3001)
│   ├── package.json                  # Dependencies: express, cors, typeorm, nestjs, axios
│   ├── src/
│   │   ├── modules/tracking/         # NestJS tracking module
│   │   │   ├── tracking.entity.ts    # TrackingEntity: orderId, lat, lng, isFinal, trackingActive
│   │   │   ├── tracking.service.ts   # Service: saveLocation, getLastLocation, getHistory, markFinal
│   │   │   ├── tracking.controller.ts # Routes: POST /tracking/update, GET /tracking/:orderId, GET /tracking/history/:orderId
│   │   │   ├── tracking.gateway.ts   # WebSocket gateway w/ JWT guard, emits order-{orderId}
│   │   │   └── tracking.module.ts    # NestJS module setup
│   │   ├── common/guards/
│   │   │   └── jwt-ws.guard.ts       # JWT WebSocket guard (verifies token from handshake)
│   │   ├── services/
│   │   │   ├── eta.service.ts        # Google Directions API integration (duration, distance, polyline)
│   │   │   └── AuthService.js
│   │   ├── entities/
│   │   │   ├── User.ts
│   │   │   ├── Truck.ts
│   │   │   └── LocationHistory.ts
│   │   ├── routes/
│   │   │   └── auth.js
│   │   └── database.ts
│   └── update_admin.sql
│
├── driver_app/                       # Flutter driver tracking app
│   ├── pubspec.yaml                  # Deps: geolocator, http, google_maps_flutter, socket_io_client, firebase_core, cloud_firestore, flutter_background_service
│   ├── lib/
│   │   ├── main.dart                 # App entry point + LoginPage + TrackingPage
│   │   ├── driver_tracking_service.dart # Service: startTracking, attachBackgroundListener, _sendLocation (HTTP + Firestore)
│   │   └── client_tracking_map.dart  # Google Map widget + route polyline + ETA/distance overlay
│   ├── android/app/src/main/AndroidManifest.xml # Permissions: FINE_LOCATION, COARSE_LOCATION, BACKGROUND_LOCATION, INTERNET
│   └── README.md
│
├── fleet_tracker/                    # Flutter fleet admin app
│   ├── pubspec.yaml
│   ├── lib/main.dart
│   └── android/
│
├── fleet_dashboard/                  # Node.js web dashboard
│   ├── package.json
│   ├── server.js
│   └── public/
│       ├── index.html
│       ├── app.js
│       └── styles.css
│
└── dashboard.html
```

---

## ⚡ Features

- **JWT Authentication**: Secure driver & client login with token-based access
- **Real-time GPS Tracking**: Driver location updates every 10s via geolocator
- **WebSocket Broadcasting**: Order-specific channels (`order-{orderId}`) for live location
- **Firebase Fallback**: All tracking data synced to Firestore (`tracking/{orderId}`)
- **ETA & Route Calculation**: Google Directions API integration with polyline visualization
- **Historical Route Storage**: PostgreSQL persistence for analytics & auditing
- **Background Tracking**: Flutter background service for continuous location posting (Android & iOS)
- **Order Integration**: Automatic tracking activation/deactivation with order status
- **Scalable Architecture**: Modular NestJS design for large fleet operations
- **Multi-App Support**: Driver app (tracking), fleet dashboard (admin), fleet tracker (monitoring)

---

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express (gateway)
- NestJS (tracking module)
- TypeORM (PostgreSQL/database abstraction)
- Socket.io (WebSocket)
- Axios (HTTP client)
- JWT (authentication)

**Frontend:**
- Flutter 3.10+ (driver_app, fleet_tracker)
- Google Maps Flutter
- Geolocator
- Socket.io Client
- Firebase (Core + Firestore)
- Flutter Background Service

**Services:**
- Google Cloud Maps API (directions, polylines)
- Firebase (Firestore + Authentication)
- PostgreSQL (planned)

---

## 🔧 Prerequisites

- **Node.js** v20+ (backend & gateway)
- **NestJS CLI** (optional: `npm install -g @nestjs/cli`)
- **PostgreSQL** 15+ (database)
- **Flutter** 3.13+ (mobile apps)
- **Firebase Project** (Authentication + Firestore)
- **Google Maps API Key** (Directions & Maps)
- **Git** & **GitHub Account** (version control)

---

## 📝 Setup Instructions

### Backend Setup (Express Gateway + NestJS)

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   npm install axios
   ```

3. **Configure environment variables:**
   ```bash
   # Create .env file in backend/
   JWT_SECRET=your_jwt_secret_key_here
   GOOGLE_MAPS_KEY=your_google_maps_api_key
   DB_HOST=localhost
   DB_USER=postgres
   DB_PASSWORD=password
   DB_NAME=nextgen_logistics
   DB_PORT=5432
   NODE_ENV=development
   ```

4. **Initialize database (PostgreSQL):**
   ```bash
   # Ensure PostgreSQL is running
   psql -U postgres -c "CREATE DATABASE nextgen_logistics;"
   
   # Run migrations (if using TypeORM CLI)
   npm run typeorm migration:run
   ```

5. **Start auth service (port 3001):**
   ```bash
   node auth-service.js
   ```

6. **In another terminal, start gateway (port 3000):**
   ```bash
   node index.js
   ```

   **Expected output:**
   ```
   Gateway deschis pentru telefon la portul 3000
   ```

---

## 📱 Driver App Setup (Flutter)

1. **Navigate to driver app:**
   ```bash
   cd driver_app
   ```

2. **Install Flutter dependencies:**
   ```bash
   flutter pub get
   ```

3. **Configure Firebase:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use existing
   - Download `google-services.json` for Android
   - Place file in `driver_app/android/app/`
   - Update `android/build.gradle` with Google Services plugin:
     ```gradle
     plugins {
       id 'com.google.gms.google-services' version '4.4.0'
     }
     ```

4. **Update backend URL:**
   - Edit `lib/main.dart` and `lib/driver_tracking_service.dart`
   - Replace `192.168.1.141` with your local machine IP (for LAN testing) or production server URL

5. **Build & run:**
   ```bash
   # Debug mode (emulator or connected device)
   flutter run

   # Release APK
   flutter build apk --release
   
   # Release app bundle (Google Play)
   flutter build appbundle --release
   ```

---

## 🌐 Fleet Dashboard Setup (Node.js Web)

1. **Navigate to fleet dashboard:**
   ```bash
   cd fleet_dashboard
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start server (port 3002):**
   ```bash
   node server.js
   ```

4. **Open in browser:**
   ```
   http://localhost:3002
   ```

---



## 📡 API Endpoints

### Tracking REST

- **POST** `/tracking/update` — Save driver location
  ```json
  { "orderId": "order-123", "lat": 40.7128, "lng": -74.0060 }
  ```

- **GET** `/tracking/:orderId` — Get last location
- **GET** `/tracking/history/:orderId` — Get all historical locations (ASC by timestamp)

### WebSocket Gateway

- **Channel:** `order-{orderId}`
- **Message:** Location broadcast on SubscribeMessage('location')
  ```json
  { "orderId": "order-123", "lat": 40.7128, "lng": -74.0060, "timestamp": "2026-01-10T..." }
  ```

### Authentication

- **POST** `/api/auth/login` — Login (proxied to auth-service)
  ```json
  { "email": "driver@example.com", "password": "password123" }
  ```

---

## 🔐 Security

- **JWT Guards**: WebSocket connections verified via `JwtWsGuard`
- **CORS Enabled**: WebSocket gateway allows cross-origin requests
- **Background Location**: Request at runtime on Android 10+
- **Token Storage**: Client-side in driver app (from login response)

---

## 📍 Key Modules

### TrackingService (NestJS)
- `saveLocation(orderId, lat, lng)` — Create tracking record
- `getLastLocation(orderId)` — Fetch latest position
- `getHistory(orderId)` — Full position history
- `markFinal(orderId)` — Flag tracking as complete when order status = 'DONE'

### DriverTrackingService (Flutter)
- `startTracking(orderId)` — 10s periodic geolocator updates
- `attachBackgroundListener(service, orderId)` — Listen to background service events
- `_sendLocation(orderId, pos)` — POST to backend + Firestore

### ClientTrackingMap (Flutter)
- Real-time marker updates from WebSocket
- Route polyline rendering (Google Directions)
- ETA & distance overlay
- Camera animation to truck position

### ETA Service (TypeScript)
- `getETA(origin, destination)` — Google Directions API call
- Returns: `{ duration, distance, polyline }`

---

## 🔄 Workflow

1. **Driver logs in** → receives JWT token
2. **Driver starts tracking** → `DriverTrackingService.startTracking(orderId)` begins
3. **Every 10s:** Geolocator fetches position → POST to `/tracking/update` + Firestore
4. **WebSocket broadcasts:** Tracking gateway emits on `order-{orderId}`
5. **Admin/client listens:** `ClientTrackingMap` subscribes to `order-{orderId}`, renders marker + route
6. **Order completes:** Backend calls `trackingService.markFinal(orderId)` → sets `isFinal=true`, `trackingActive=false`

---

## 📦 Dependencies Summary

**Backend (backend/package.json):**
```json
{
  "express": "^5.2.1",
  "cors": "^2.8.5",
  "jsonwebtoken": "^9.0.3",
  "typeorm": "^0.3.28",
  "pg": "^8.16.3",
  "axios": "^1.6.8",
  "node-fetch": "^3.3.2"
}
```

**Driver App (driver_app/pubspec.yaml):**
```yaml
dependencies:
  flutter: sdk
  http: ^1.1.0
  geolocator: ^10.1.0
  google_maps_flutter: ^2.6.0
  socket_io_client: ^2.0.3
  firebase_core: ^2.25.0
  cloud_firestore: ^4.13.0
  flutter_background_service: ^5.0.5
```

---

## 🐛 Troubleshooting

- **Backend fails to start:** Ensure `node_fetch@3.3.2` is installed; check `JWT_SECRET` & `GOOGLE_MAPS_KEY` env vars
- **Driver app won't track:** Verify location permissions granted at runtime; ensure backend URL is reachable from device
- **WebSocket disconnects:** Check `JwtWsGuard` — confirm token passed in handshake; restart auth-service if 3001 hangs
- **Polyline not showing:** Validate encoded polyline format from Google Directions API

---

## 📝 License

NextGen Logistics — Internal Use Only

---

## 👥 Team

Built with NestJS, Flutter, and Firebase for real-time fleet operations.

Last updated: **2026-01-10**
