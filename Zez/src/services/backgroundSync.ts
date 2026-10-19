
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { syncCallLogs } from "@/services/callSync";
import { sendBackgroundPost } from "@/services/backgroundPost";

export const CALL_SYNC_TASK = "ZEZ_CALL_LOG_SYNC";
const MINIMUM_INTERVAL_MINUTES = 15;

// Define this at module scope so Android can find it when
// the app starts in the background without mounting the UI.
if (!TaskManager.isTaskDefined(CALL_SYNC_TASK)) {
  TaskManager.defineTask(CALL_SYNC_TASK, async () => {
    console.log("[ZEZ] Background task started.");

    try {
      // Uses the same call-sync service as foreground syncing.
      // await syncCallLogs();
      // console.log("[ZEZ] Call-log sync completed.");
      const result = await syncCallLogs();

      if (result.failed > 0) {
        throw new Error(
          `Call-log sync incomplete: ${result.failed} calls remain in a failed batch.`
        );
      }

      console.log("[ZEZ] Call-log sync completed:", result);

      // This is a separate POST request, not the call upload itself.
      await sendBackgroundPost();
      console.log("[ZEZ] Background POST completed.");

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.error("[ZEZ] Background task failed:", error);

      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();

  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error(
      "[ZEZ] Android background tasks are unavailable."
    );
  }

  const alreadyRegistered =
    await TaskManager.isTaskRegisteredAsync(CALL_SYNC_TASK);

  if (!alreadyRegistered) {
    await BackgroundTask.registerTaskAsync(CALL_SYNC_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  }

  const confirmed =
    await TaskManager.isTaskRegisteredAsync(CALL_SYNC_TASK);

  if (!confirmed) {
    throw new Error("[ZEZ] Background task registration failed.");
  }

  console.log(
    `[ZEZ] Background task registered: ${CALL_SYNC_TASK}; ` +
    `minimum interval: ${MINIMUM_INTERVAL_MINUTES} minutes.`
  );
}

export async function unregisterBackgroundSync(): Promise<void> {
  const registered =
    await TaskManager.isTaskRegisteredAsync(CALL_SYNC_TASK);

  if (registered) {
    await BackgroundTask.unregisterTaskAsync(CALL_SYNC_TASK);
    console.log("[ZEZ] Background task unregistered.");
  }
}
