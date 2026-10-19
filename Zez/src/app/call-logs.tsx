import { useState } from "react";
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import CallLogs from "react-native-call-log";
import { syncCallLogs } from "@/services/callSync";

type CallRecord = {
  id?: string;
  name?: string;
  phoneNumber?: string;
  timestamp?: string;
  dateTime?: string;
  type?: string;
  duration?: string | number;
};

export default function CallLogsScreen() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [message, setMessage] = useState("No call logs loaded yet.");
  const [loading, setLoading] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  async function handleSync() {
    setSyncing(true);
    setSyncMessage("Syncing call history with Neon...");

    try {
      const result = await syncCallLogs();
      
      setSyncMessage(
        `Collected: ${result.collected} | ` +
        `Uploaded: ${result.inserted} | ` +
        `Duplicates: ${result.duplicates} | ` +
        `Batches: ${result.batches}`
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Synchronization failed."
      );
    } finally {
      setSyncing(false);
    }
  }

  async function loadCallLogs() {
    if (Platform.OS !== "android") {
      setMessage("Call logs are supported here only on Android.");
      return;
    }

    setLoading(true);
    setMessage("Requesting call-log permission...");

    try {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
      );

      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setMessage("Call-log permission was not granted.");
        return;
      }

      const result = await CallLogs.load(100);

      const records = result as CallRecord[];
      setCalls(records);
      setMessage(`Loaded ${records.length} call records.`);
    } catch (error) {
      console.error("Failed to read call logs:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not read call logs."
      );
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp?: string, dateTime?: string) {
    const value = timestamp ?? dateTime;

    if (!value) return "Date unavailable";

    const date = new Date(Number(value));

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
  }

  return (
    <ScrollView className="flex-1 dark:bg-slate-950">
      <View className="p-5 pt-12 flex gap-3">
        <Text className="text-3xl font-bold ">
          Call History
        </Text>
        <View className="border-[1px] border-gray-400 p-2 rounded-sm">
          <Pressable
            onPress={handleSync}
            disabled={syncing}
            className="mt-3 items-center rounded-xl bg-emerald-600 px-4 py-4"
          >
            {syncing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-semibold text-white">
                Sync with Neon
              </Text>
            )}
          </Pressable>

          <Text className="mt-3 text-sm text-slate-300">
            {syncMessage}
          </Text>
        </View>
        
        <ScrollView className="border-[1px] border-gray-400 p-2 rounded-sm">
          <Pressable
            onPress={loadCallLogs}
            disabled={loading}
            className="mt-6 items-center rounded-xl bg-blue-600 px-4 py-4 active:bg-blue-700"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-semibold text-white">
                Read Call Logs
              </Text>
            )}
          </Pressable>

          <Text className="mt-4 text-sm text-slate-300">
            {message}
          </Text>

          <View className="mt-5 gap-3">
            {calls.map((call, index) => (
              <View
                key={`${call.id ?? "call"}-${index}`}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
              >
                <Text className="text-lg font-semibold text-white">
                  {call.name || call.phoneNumber || "Unknown caller"}
                </Text>

                <Text className="mt-1 text-sm text-slate-400">
                  {call.phoneNumber || "No phone number"}
                </Text>

                <View className="mt-3 flex-row flex-wrap gap-2">
                  <Text className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-blue-300">
                    {call.type || "Unknown type"}
                  </Text>

                  <Text className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300">
                    {call.duration ?? 0}s
                  </Text>
                </View>

                <Text className="mt-3 text-xs text-slate-500">
                  {formatDate(call.timestamp, call.dateTime)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        
      </View>
    </ScrollView>
  );
}
