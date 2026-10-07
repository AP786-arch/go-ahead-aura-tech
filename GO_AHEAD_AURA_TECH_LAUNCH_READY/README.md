# GO AHEAD × AURA TECH — Launch-ready Web App

This package upgrades the front-end prototype into a real same-origin Node/Express web app with server-side accounts and telemetry.

## What is real now

- Register/Login is handled by the Node server.
- Passwords are stored as salted scrypt hashes (not plain text).
- Login uses an HttpOnly session cookie.
- Accounts persist on the server's data file.
- Browser GPS can send real latitude/longitude/accuracy to `/api/telemetry`.
- Browser battery/charging status is sent when the browser exposes the Battery API.
- Online/offline status is recorded.
- Check-ins and demo SOS events are saved to the server.
- The live location can open in Google Maps.
- Web Bluetooth can request/Connect to BLE devices in supported browsers.
- If a connected BLE device exposes the standard Battery Service, its battery level can be read.
- `/health` is available for deployment health checks.
- `render.yaml` is included for a Node web service deployment.

## Run locally

1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

For geolocation on a deployed site, use HTTPS. `localhost` is also treated as a secure development origin by modern browsers.

## Deployment

Push this folder to GitHub and connect the repository to a Node host such as Render. The included `render.yaml` provides the build/start settings.

The app stores its demo database in `data/db.json`. For a serious public launch with multiple instances, replace this with PostgreSQL/Supabase/another managed database and use a shared session store.

## AURA-GUARD hardware

The website cannot invent physical hardware telemetry. For genuinely live hardware data, the device must expose a compatible BLE GATT service (or send telemetry to a backend API). The current UI already supports:

- BLE connection selection
- Standard Battery Service reading when available
- Server telemetry endpoint

Custom AURA-GUARD motion/biometric sensors would need their actual BLE service/characteristic UUIDs and firmware protocol added.

## Safety note

The SOS route is a project/demo event logger. It does NOT contact police, emergency services, or real people. Real emergency integrations would require separate verified services, consent, testing, and legal/compliance review.
