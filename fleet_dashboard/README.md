# Fleet Dashboard

Real-time vehicle tracking dashboard that displays truck locations on an interactive map.

## Features

- 🗺️ Interactive map with Leaflet.js
- 📍 Real-time truck location tracking
- 📊 Sidebar with active trucks list
- 🔄 Auto-refresh every 10 seconds
- 🚚 Click on trucks to focus map

## Installation

```bash
cd fleet_dashboard
npm install
```

## Configuration

Update `.env` file with your database credentials:

```env
PORT=5000
DB_USER=admin
DB_HOST=localhost
DB_DATABASE=freight_platform
DB_PASSWORD=secret_password
DB_PORT=5432
```

## Usage

```bash
npm start
```

Then open `http://localhost:5000` in your browser.

## API Endpoints

- `GET /api/trucks` - Get all truck locations
- `GET /api/trucks/:plate_number` - Get specific truck location

## Dependencies

- Express.js - Web framework
- PostgreSQL (pg) - Database client
- CORS - Cross-origin resource sharing
- Leaflet.js - Interactive maps library
