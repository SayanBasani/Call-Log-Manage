
import * as SecureStore from "expo-secure-store";
import {
  getDeviceDetails,
  initDeviceIdentifiers,
} from "@/services/deviceDetails";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");

const DEVICE_ID_KEY = "zez_device_id";
const DEVICE_TOKEN_KEY = "zez_device_token";
const PERSISTENT_ID_KEY = "device_persistent_uuid";

export type DeviceCredentials = {
  deviceId: string;
  token: string;
};

let initializationPromise: Promise<DeviceCredentials> | null = null;

export async function initializeDevice(): Promise<DeviceCredentials> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = registerOrRestoreDevice();

  try {
    return await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

async function registerOrRestoreDevice(): Promise<DeviceCredentials> {
  const [savedId, savedToken] = await Promise.all([
    SecureStore.getItemAsync(DEVICE_ID_KEY),
    SecureStore.getItemAsync(DEVICE_TOKEN_KEY),
  ]);

  // Keep existing credentials. Do not silently rotate them.
  if (savedId && savedToken) {
    return { deviceId: savedId, token: savedToken };
  }

  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  // Remove only incomplete credentials.
  await Promise.all([
    SecureStore.deleteItemAsync(DEVICE_ID_KEY),
    SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY),
  ]);

  const details = await getDeviceDetails();
  const ids = await initDeviceIdentifiers();
  type SimSlot = {
    slot: number;
    phoneNumber: string | null;
    carrierName: string | null;
    countryIso: string | null;
    status: string;
  };
  const simSlots = details.simInformation.simSlots as SimSlot[];

  const sim1 = simSlots.find((sim) => sim.slot === 1);
  const sim2 = simSlots.find((sim) => sim.slot === 2);

  const response = await fetch(`${API_URL}/api/devices/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ids,
      deviceName: details.device.deviceName,
      deviceModel: details.device.modelName,
      manufacturer: details.device.manufacturer,
      brand: details.device.brand,
      platform: details.operatingSystem.name ?? "Android",
      osVersion: details.operatingSystem.version,
      appVersion: details.application.appVersion,

      primaryPhoneNumber:
        details.simInformation.primaryPhoneNumber,

      sim1PhoneNumber: sim1?.phoneNumber ?? null,
      sim2PhoneNumber: sim2?.phoneNumber ?? null,
      sim1Carrier: sim1?.carrierName ?? null,
      sim2Carrier: sim2?.carrierName ?? null,
      sim1CountryIso: sim1?.countryIso ?? null,
      sim2CountryIso: sim2?.countryIso ?? null,

      deviceDetails: details,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Device registration failed: HTTP ${response.status}` +
        (message ? ` - ${message.slice(0, 200)}` : ""),
    );
  }

  const result = (await response.json()) as {
    success: boolean;
    deviceId: string;
    token: string;
    persistentId?: string | null;
  };

  if (!result.success || !result.deviceId || !result.token) {
    throw new Error("Invalid device registration response.");
  }

  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, result.deviceId);
    await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, result.token);

    if (result.persistentId) {
      await SecureStore.setItemAsync(
        PERSISTENT_ID_KEY,
        result.persistentId,
      );
    }
  } catch (error) {
    await Promise.all([
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY),
    ]);
    throw error;
  }

  return {
    deviceId: result.deviceId,
    token: result.token,
  };
}

export async function getDeviceToken(): Promise<string> {
  console.log("DeviceToken function called ")
  const credentials = await initializeDevice();
  console.log("tokens are :");
  console.log(credentials.token);
  return credentials.token;
}
