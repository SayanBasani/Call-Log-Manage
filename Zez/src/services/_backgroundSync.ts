import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { syncCallLogs } from "@/services/callSync";
import { sendBackgroundPost } from "@/services/backgroundPost";
const CALL_SYNC_TASK = "ZEZ_CALL_LOG_SYNC";

TaskManager.defineTask(CALL_SYNC_TASK, async () => {
  try {
    await syncCallLogs();
    const SilentTask = await sendBackgroundPost();
    console.log("SilentTask")
    console.log(SilentTask)
    console.log("-------------SilentTask")

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("[Zez] Background call sync failed:", error);

    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();

  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    console.warn("[Zez] Background tasks are unavailable.");
    return;
  }

  const alreadyRegistered =
    await TaskManager.isTaskRegisteredAsync(CALL_SYNC_TASK);

  if (!alreadyRegistered) {
    await BackgroundTask.registerTaskAsync(CALL_SYNC_TASK, {
      minimumInterval: 1,
    });
  }

  console.log("[Zez] Background call sync is registered.");
}


export async function unregisterBackgroundSync() {
  const registered =
    await TaskManager.isTaskRegisteredAsync(CALL_SYNC_TASK);

  if (registered) {
    await BackgroundTask.unregisterTaskAsync(CALL_SYNC_TASK);
  }
}
