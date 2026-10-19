
import * as Device from "expo-device";
import * as Application from "expo-application";
import * as Network from "expo-network";
import * as Localization from "expo-localization";
import * as Battery from "expo-battery";
import { Platform } from "react-native";
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

async function safeGet<T>(
  getter: () => Promise<T>
): Promise<T | null> {
  try {
    return await getter();
  } catch {
    return null;
  }
}

export async function getDeviceDetails() {
  const [
    network,
    batteryLevel,
    batteryState,
    lowPowerMode,
  ] = await Promise.all([
    safeGet(() => Network.getNetworkStateAsync()),
    safeGet(() => Battery.getBatteryLevelAsync()),
    safeGet(() => Battery.getBatteryStateAsync()),
    safeGet(() => Battery.isLowPowerModeEnabledAsync()),
  ]);

  const locales = Localization.getLocales();

  const details = {
    collectedAt: new Date().toISOString(),

    device: {
      deviceName: Device.deviceName ?? null,
      manufacturer: Device.manufacturer ?? null,
      brand: Device.brand ?? null,
      modelName: Device.modelName ?? null,
      modelId: Device.modelId ?? null,
      deviceYearClass: Device.deviceYearClass ?? null,
      deviceType: Device.deviceType ?? null,
      isPhysicalDevice: Device.isDevice,
      totalMemoryBytes: Device.totalMemory ?? null,
      supportedCpuArchitectures:
        Device.supportedCpuArchitectures ?? [],
    },

    operatingSystem: {
      name: Device.osName ?? null,
      version: Device.osVersion ?? null,
      androidApiLevel: Device.platformApiLevel ?? null,
    },

    application: {
      applicationId: Application.applicationId ?? null,
      appName: Application.applicationName ?? null,
      appVersion:
        Application.nativeApplicationVersion ?? null,
      buildVersion:
        Application.nativeBuildVersion ?? null,
    },

    network: network
      ? {
          type: network.type,
          isConnected: network.isConnected,
          isInternetReachable: network.isInternetReachable,
        }
      : null,

    battery: {
      level: batteryLevel,
      state: batteryState,
      isLowPowerModeEnabled: lowPowerMode,
    },

    localization: {
      locales: locales.map((locale) => ({
        languageTag: locale.languageTag,
        languageCode: locale.languageCode,
        regionCode: locale.regionCode,
        textDirection: locale.textDirection,
        measurementSystem: locale.measurementSystem,
        currencyCode: locale.currencyCode,
      })),
    },

    simInformation: {
      availability: "not_collected",
      primaryPhoneNumber: null,
      simSlots: [
        {
          slot: 1,
          phoneNumber: null,
          carrierName: null,
          countryIso: null,
          status: "unknown",
        },
        {
          slot: 2,
          phoneNumber: null,
          carrierName: null,
          countryIso: null,
          status: "unknown",
        },
      ],
      note:
        "SIM information requires a separate native Android implementation.",
    },
  };

  console.log("-------------------details");
  console.log(JSON.stringify(details));
  console.log("!!!!!!!!!!!!!!!!!!!details");

  // Ensure the returned value can be serialized as JSON.
  return JSON.parse(JSON.stringify(details));
}



const SECURE_UUID_KEY = 'device_persistent_uuid';

/**
 * Retrieves the native androidId and initializes a persistent UUID in SecureStore.
 * - If the UUID already exists in SecureStore, it returns it.
 * - If not, it creates a new UUID v4, saves it to SecureStore, and returns it.
 */
export async function initDeviceIdentifiers() {
  try {
    // 1. Fetch native Android ID (Android only)
    let androidId = null;
    if (Platform.OS === 'android') {
      androidId = Application.getAndroidId() ?? null;
    }

    // 2. Check if a generated UUID already exists in SecureStore
    let persistentId = await SecureStore.getItemAsync(SECURE_UUID_KEY);

    // 3. If no persistent UUID exists, generate and store a new one
    if (!persistentId) {
      persistentId = Crypto.randomUUID();
      await SecureStore.setItemAsync(SECURE_UUID_KEY, persistentId, {
        keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,
      });
    }
    console.log("androidId,persistentId")
    console.log(androidId,persistentId)
    return {
      androidId,
      persistentId,
    };
  } catch (error) {
    console.error('Failed to initialize device identifiers:', error);
    return {
      androidId: Platform.OS === 'android' ? Application.getAndroidId() ?? null : null,
      persistentId: null,
    };
  }
}

/**
 * Fast lookup function to retrieve previously initialized values anywhere in your app.
 */
export async function getStoredIdentifiers() {
  const androidId = Platform.OS === 'android' ? Application.getAndroidId() ?? null : null;
  const persistentId = await SecureStore.getItemAsync(SECURE_UUID_KEY);

  return {
    androidId,
    persistentId,
  };
}