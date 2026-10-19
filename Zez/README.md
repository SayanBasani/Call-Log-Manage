# check error
```sh
npx tsc --noEmit
```
# restart and rebuild the app:
```bash
npx expo start --dev-client --clear

```

# rebuild in another terminal:
```bash
npx expo run:android
```

cd android
.\gradlew.bat clean
cd ..

npx expo run:android


```env

DATABASE_URL=Neon_atabase_url

EXPO_PUBLIC_DATABASE_URL=Neon_atabase_url

PORTABLE_ENCRYPTION_KEY=64_digit_key

EXPO_PUBLIC_PORTABLE_ENCRYPTION_KEY=64_digit_key


# EXPO_PUBLIC_API_URL=http://192.168.0.103:3000
EXPO_PUBLIC_API_URL=backend_url

```


# for generate apk for use
```sh
npx tsc --noEmit
npx expo run:android
cd android
.\gradlew.bat assembleRelease
```
now the apk path is 

android\app\build\outputs\apk\release\app-release.apk 



## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```
