import { PermissionsAndroid, Platform } from "react-native";

export async function requestCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  const permission = PermissionsAndroid.PERMISSIONS.READ_CALL_LOG;

  const alreadyGranted = await PermissionsAndroid.check(permission);

  if (alreadyGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: "Allow Zez to access call history",
    message:
      "Zez needs call-log access to collect your call history and synchronize it with your registered device.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}
