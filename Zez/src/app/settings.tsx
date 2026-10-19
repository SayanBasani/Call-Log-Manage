import { useState } from "react";
import { Pressable, Text, View, ActivityIndicator, ScrollView } from "react-native";
import {
  testDatabase,
  insertTestRecord,
  fetchTestRecords,
} from "@/database";
import { collectCallLogs } from "@/services/callCollection";

export default function SettingsScreen() {
  const [message, setMessage] = useState("Not tested");
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<unknown[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);

  async function insertRecord() {
    try {
      const result = await insertTestRecord();
      console.log("Inserted:", result);
      setMessage(`Inserted successfully: ${JSON.stringify(result)}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Insert failed"
      );
    }
  }

  async function loadRecords() {
    try {
      const result = await fetchTestRecords();
      setRecords(result);
      setMessage(`Loaded ${result.length} records`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Fetch failed"
      );
    }
  }

  async function connect() {
    setLoading(true);
    setMessage("Connecting to Neon...");

    try {
      const result = await testDatabase();
      console.log("Database connected:", result);
      setMessage(`Connected: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error("Database connection failed:", error);
      setMessage(
        error instanceof Error
          ? `Failed: ${error.message}`
          : "Failed: Unknown error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCollectCallLogs() {
    try {
      setLoading(true);
      setMessage("Collecting call logs...");
      const logs = await collectCallLogs();
      setCallLogs(logs);
      setMessage(`Collected ${logs.length} call logs`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to collect call logs"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerClassName="flex-1 items-center justify-center p-4">
      <Pressable 
        onPress={connect} 
        disabled={loading} 
        className="bg-blue-500 p-3 rounded mb-4"
      >
        <Text className="text-white font-bold">Test Neon Database</Text>
      </Pressable>

      {loading && <ActivityIndicator className="mb-4" />}

      <Text className="mb-4 text-center">{message}</Text>

      <Pressable 
        onPress={insertRecord} 
        className="bg-green-500 p-3 rounded mb-4"
      >
        <Text className="text-white font-bold">Insert Test Record</Text>
      </Pressable>

      <Pressable 
        onPress={loadRecords} 
        className="bg-purple-500 p-3 rounded mb-4"
      >
        <Text className="text-white font-bold">Fetch Records</Text>
      </Pressable>

      <Pressable 
        onPress={handleCollectCallLogs} 
        className="bg-orange-500 p-3 rounded mb-4"
      >
        <Text className="text-white font-bold">Collect Call Logs</Text>
      </Pressable>

      <Text className="font-mono text-xs mb-4">
        {JSON.stringify(records, null, 2)}
      </Text>

      <View className="w-full flex gap-3">
        {callLogs.map((log, index) => (
          <Text key={index} className="text-sm py-1">
            {JSON.stringify(log)}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
// import { useState } from "react";
// import { Pressable, Text, View, ActivityIndicator, ScrollView } from "react-native";
// import {
//   testDatabase,
//   insertTestRecord,
//   fetchTestRecords,
// } from "@/database";
// import { collectCallLogs } from "@/services/callCollection";

// export default function SettingsScreen() {
//   const [message, setMessage] = useState("Not tested");
//   const [loading, setLoading] = useState(false);

//   const [records, setRecords] = useState<unknown[]>([]);

//   async function insertRecord() {
//     try {
//       const result = await insertTestRecord();
//       console.log("Inserted:", result);
//       setMessage(`Inserted successfully: ${JSON.stringify(result)}`);
//     } catch (error) {
//       setMessage(
//         error instanceof Error ? error.message : "Insert failed"
//       );
//     }
//   }

//   async function loadRecords() {
//     try {
//       const result = await fetchTestRecords();
//       setRecords(result);
//       setMessage(`Loaded ${result.length} records`);
//     } catch (error) {
//       setMessage(
//         error instanceof Error ? error.message : "Fetch failed"
//       );
//     }
//   }

//   async function connect() {
//     setLoading(true);
//     setMessage("Connecting to Neon...");

//     try {
//       const result = await testDatabase();

//       console.log("Database connected:", result);
//       setMessage(`Connected: ${JSON.stringify(result)}`);
//     } catch (error) {
//       console.error("Database connection failed:", error);

//       setMessage(
//         error instanceof Error
//           ? `Failed: ${error.message}`
//           : "Failed: Unknown error"
//       );
//     } finally {
//       setLoading(false);
//     }
//   }

//   const [callLogs,setCallLogs]=useState<any[]>([]);
// async function handleCollectCallLogs() {
//     try {
//       setLoading(true);
//       setMessage("Collecting call logs...");
//       const logs = await collectCallLogs();
//       setCallLogs(logs);
//       setMessage(`Collected ${logs.length} call logs`);
//     } catch (error) {
//       setMessage(
//         error instanceof Error ? error.message : "Failed to collect call logs"
//       );
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <ScrollView>
//       <View className="flex-1 items-center justify-center">

//         <Pressable onPress={connect} disabled={loading}>
//           <Text>Test Neon Database</Text>
//         </Pressable>

//         {loading && <ActivityIndicator />}

//         <Text>{message}</Text>

//         <Pressable onPress={insertRecord}>
//           <Text>Insert Test Record</Text>
//         </Pressable>

//         <Pressable onPress={loadRecords}>
//           <Text>Fetch Records</Text>
//         </Pressable>

//         <Text>{JSON.stringify(records, null, 2)}</Text>
//           <View className="w-full">
//           {callLogs.map((log, index) => (
//             <Text key={index} className="text-sm py-1">
//               {JSON.stringify(log)}
//             </Text>
//           ))}
//         </View>
//       </View>
//     </ScrollView>
//   );
// }
