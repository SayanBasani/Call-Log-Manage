# Zez updated prototype

This version adds API batch upload, upload-pending tracking, retry on later sync, API health check, search, call-type filters, last-7-days filter, local notes, statistics, and CSV text export.

## Install / run

1. Make a backup of your existing `Zez` folder.
2. Extract this ZIP to a new folder first (recommended), then copy/merge the updated source into your project.
3. Keep your backend running in its own terminal.
4. From the Zez project root:
   ```powershell
   npm install
   npx react-native start
   ```
5. In a second terminal:
   ```powershell
   npx react-native run-android
   ```

## API URL

Edit `API_BASE_URL` near the top of `App.tsx`.

- Android emulator running on the same computer: `http://10.0.2.2:3000`
- Physical Android phone on the same Wi-Fi: use the computer's LAN IPv4 address, e.g. `http://192.168.1.20:3000`. Find it on Windows using `ipconfig`; allow Node/port 3000 through Windows Firewall for private networks.
- Hosted deployment: use an HTTPS URL and authentication.

The backend must be reachable from the Android device. `localhost` inside Android refers to the Android device/emulator itself, not your PC.

## Features / behaviour

- Existing SQLite database is migrated in place to add `note` and `sync_status`; old call rows are preserved.
- New imports read up to 5,000 call-log entries per pass (not unlimited; increase `CALL_LOG_LIMIT` only after testing memory/performance).
- Newly imported rows are marked pending. Successful POST responses mark them synced; failed requests keep them pending for the next manual, startup, foreground, or call-log-triggered sync.
- The GET endpoint refreshes the displayed server record count.
- Search looks across contact, number, type, and note. Filters include call type and last 7 days.
- Notes are stored locally in SQLite.
- Export uses Android's share sheet with CSV text. Depending on the receiving app, choose a compatible app to save it as a `.csv` file.

## Important limitations / security

- The Kotlin `ContentObserver` works while the app process and React Native runtime are alive. This is **not** a guaranteed always-running background service. Force-stop, process death, Android battery restrictions, permission revocation, and device-specific policies can delay syncing. A WorkManager recovery worker is not included in this patch.
- HTTP cleartext is enabled for local development. Do not release this configuration publicly; use HTTPS, authentication, and appropriate access controls before sending real call history to a hosted server.
- `READ_CALL_LOG` is a sensitive permission. Google Play distribution is subject to its current Call Log permissions policy and review; a working sideloaded build does not guarantee Play Store approval.
- The initial backend has no authentication. Do not expose it publicly or send real personal call records to an internet-accessible unauthenticated endpoint.
