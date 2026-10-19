
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const REMINDER_TAG = "zez-wellness-reminder";

const PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

export default function RemindersScreen() {
  const [minutes, setMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState("45");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nextReminder, setNextReminder] = useState("");

  useEffect(() => {
    void loadReminderState();
  }, []);

  async function loadReminderState() {
    try {
      const scheduled =
        await Notifications.getAllScheduledNotificationsAsync();

      const existing = scheduled.find(
        (item) => item.content.data?.tag === REMINDER_TAG
      );

      if (existing) {
        setActive(true);
        const seconds = existing.trigger &&
          "seconds" in existing.trigger
          ? Number(existing.trigger.seconds)
          : 0;

        if (seconds > 0) {
          const mins = Math.round(seconds / 60);
          setMinutes(mins);
          setNextReminder(
            `Repeats every ${mins} minute${mins === 1 ? "" : "s"}`
          );
        }
      }
    } catch (error) {
      console.warn("Could not load reminder state:", error);
    }
  }

  async function cancelOurReminders() {
    const scheduled =
      await Notifications.getAllScheduledNotificationsAsync();

    for (const item of scheduled) {
      if (item.content.data?.tag === REMINDER_TAG) {
        await Notifications.cancelScheduledNotificationAsync(
          item.identifier
        );
      }
    }
  }

  async function startReminder() {
    if (busy) return;
    setBusy(true);

    try {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        Alert.alert(
          "Invalid interval",
          "Choose an interval between 1 and 1440 minutes."
        );
        return;
      }

      const currentPermission =
        await Notifications.getPermissionsAsync();

      let granted = currentPermission.granted;

      if (!granted) {
        const requested =
          await Notifications.requestPermissionsAsync();
        granted = requested.granted;
      }

      if (!granted) {
        Alert.alert(
          "Notifications are disabled",
          "Allow notifications for ZEZ in Android Settings, then try again."
        );
        return;
      }

      await Notifications.setNotificationChannelAsync("zez-reminders", {
        name: "ZEZ Wellness Reminders",
        importance: Notifications.AndroidImportance.MAX,
        // sound: soundEnabled ? "default" : null,
        vibrationPattern: [0, 250, 150, 250],
        enableVibrate: true,
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      await cancelOurReminders();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💧 Time to hydrate!",
          body: "Take a short break and drink some water.",
          sound: soundEnabled,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { tag: REMINDER_TAG, screen: "reminders" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: minutes * 60,
          repeats: true,
          channelId: "zez-reminders",
        },
      });

      setActive(true);
      setNextReminder(
        `Repeats every ${minutes} minute${minutes === 1 ? "" : "s"}`
      );

      Alert.alert(
        "Reminder enabled",
        `ZEZ will remind you every ${minutes} minute(s). The first reminder is scheduled after this interval.`
      );
    } catch (error) {
      console.error("Failed to schedule reminder:", error);
      Alert.alert(
        "Could not enable reminder",
        "Please check notification permissions and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function stopReminder() {
    try {
      await cancelOurReminders();
      setActive(false);
      setNextReminder("");
      Alert.alert("Reminder stopped", "Your hydration reminder is off.");
    } catch (error) {
      console.error("Failed to stop reminder:", error);
      Alert.alert("Error", "Could not cancel the reminder.");
    }
  }

  function choosePreset(value: number) {
    setMinutes(value);
  }

  function applyCustomInterval() {
    const value = Number(customMinutes);

    if (!Number.isInteger(value) || value < 1 || value > 1440) {
      Alert.alert(
        "Invalid interval",
        "Enter a whole number from 1 to 1440 minutes."
      );
      return;
    }

    setMinutes(value);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4FAF8" />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandIcon}>
            <Ionicons name="water" size={26} color="#087F67" />
          </View>
          <View style={styles.brandText}>
            <Text style={styles.brandTitle}>ZEZ Wellness</Text>
            <Text style={styles.brandSubtitle}>
              Small habits, better days
            </Text>
          </View>
          <View style={styles.bellIcon}>
            <Ionicons name="notifications-outline" size={23} color="#087F67" />
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.habitBadge}>
              <Text style={styles.habitBadgeText}>YOUR DAILY HABIT</Text>
            </View>
            <Ionicons name="water-outline" size={42} color="#087F67" />
          </View>

          <Text style={styles.heroTitle}>Time to hydrate!</Text>
          <Text style={styles.heroDescription}>
            A little water can make a difference. Let’s keep your hydration
            habit on track.
          </Text>

          <View style={styles.heroDivider} />

          <Text style={styles.overline}>REMIND ME EVERY</Text>
          <Text style={styles.intervalDisplay}>
            {minutes >= 60 && minutes % 60 === 0
              ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
              : `${minutes} minutes`}
          </Text>

          <View style={styles.heroFooter}>
            <View style={styles.heroFeature}>
              <Ionicons name="time-outline" size={19} color="#087F67" />
              <Text style={styles.heroFeatureText}>Custom interval</Text>
            </View>
            <View style={styles.heroFeature}>
              <Ionicons name="volume-high-outline" size={19} color="#087F67" />
              <Text style={styles.heroFeatureText}>
                {soundEnabled ? "Sound on" : "Silent"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Reminder interval</Text>
          <Text style={styles.sectionSubtitle}>
            How often should ZEZ remind you?
          </Text>
        </View>

        <View style={styles.presetGrid}>
          {PRESETS.map((preset) => {
            const selected = minutes === preset.minutes;
            return (
              <TouchableOpacity
                key={preset.minutes}
                onPress={() => choosePreset(preset.minutes)}
                style={[
                  styles.preset,
                  selected && styles.presetSelected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={selected ? "#FFFFFF" : "#648078"}
                />
                <Text
                  style={[
                    styles.presetText,
                    selected && styles.presetTextSelected,
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.customCard}>
          <View style={styles.customIcon}>
            <Ionicons name="options-outline" size={22} color="#087F67" />
          </View>
          <View style={styles.customContent}>
            <Text style={styles.cardTitle}>Custom interval</Text>
            <Text style={styles.cardDescription}>
              Set any interval from 1 minute to 24 hours.
            </Text>
            <View style={styles.customInputRow}>
              <TextInput
                value={customMinutes}
                onChangeText={setCustomMinutes}
                keyboardType="number-pad"
                placeholder="45"
                placeholderTextColor="#9BAFA8"
                style={styles.input}
                maxLength={4}
                accessibilityLabel="Custom interval in minutes"
              />
              <Text style={styles.minutesLabel}>minutes</Text>
              <TouchableOpacity
                onPress={applyCustomInterval}
                style={styles.applyButton}
              >
                <Text style={styles.applyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="volume-high-outline" size={22} color="#087F67" />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.cardTitle}>Notification sound</Text>
              <Text style={styles.cardDescription}>
                Play a sound when a reminder arrives
              </Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: "#D5E3DD", true: "#9CDAC7" }}
              thumbColor={soundEnabled ? "#087F67" : "#F5F5F5"}
            />
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color="#087F67"
              />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.cardTitle}>Runs independently</Text>
              <Text style={styles.cardDescription}>
                Scheduled locally; no internet required
              </Text>
            </View>
          </View>
        </View>

        {active && (
          <View style={styles.activeCard}>
            <Ionicons name="checkmark-circle" size={22} color="#087F67" />
            <View style={styles.activeText}>
              <Text style={styles.cardTitle}>Reminders are active</Text>
              <Text style={styles.cardDescription}>{nextReminder}</Text>
            </View>
            <TouchableOpacity onPress={stopReminder}>
              <Text style={styles.stopLink}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={startReminder}
          disabled={busy}
          accessibilityRole="button"
        >
          <Ionicons
            name={active ? "refresh-outline" : "notifications-outline"}
            size={21}
            color="#FFFFFF"
          />
          <Text style={styles.primaryButtonText}>
            {busy
              ? "Setting reminder..."
              : active
                ? "Update reminder"
                : "Enable reminders"}
          </Text>
        </TouchableOpacity>

        {active && (
          <TouchableOpacity style={styles.stopButton} onPress={stopReminder}>
            <Text style={styles.stopButtonText}>Turn off reminders</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footerNote}>
          Reminders use your phone’s notification system. Delivery depends on
          Android settings, battery restrictions and notification permissions.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4FAF8" },
  container: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#D8F3E8",
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { flex: 1, marginLeft: 12 },
  brandTitle: { fontSize: 19, fontWeight: "800", color: "#153D35" },
  brandSubtitle: { fontSize: 12, color: "#648078", marginTop: 3 },
  bellIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#E6F5EF",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: "#D8F3E8",
    borderRadius: 26,
    padding: 22,
    marginBottom: 27,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  habitBadge: {
    backgroundColor: "#B8E9D7",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },
  habitBadgeText: {
    color: "#087F67",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#153D35",
    marginTop: 15,
  },
  heroDescription: {
    fontSize: 14,
    color: "#315E52",
    lineHeight: 22,
    marginTop: 8,
  },
  heroDivider: {
    height: 1,
    backgroundColor: "#B5E0D1",
    marginVertical: 19,
  },
  overline: {
    color: "#52796D",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  intervalDisplay: {
    fontSize: 29,
    fontWeight: "800",
    color: "#087F67",
    marginTop: 7,
  },
  heroFooter: { flexDirection: "row", gap: 20, marginTop: 19 },
  heroFeature: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroFeatureText: {
    fontSize: 12,
    color: "#315E52",
    fontWeight: "600",
  },
  sectionHeading: { marginBottom: 15 },
  sectionTitle: { fontSize: 19, fontWeight: "800", color: "#153D35" },
  sectionSubtitle: { fontSize: 13, color: "#789087", marginTop: 5 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: {
    width: "31%",
    minHeight: 83,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#DCEAE4",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  presetSelected: {
    backgroundColor: "#087F67",
    borderColor: "#087F67",
  },
  presetText: { color: "#315E52", fontWeight: "700", fontSize: 13 },
  presetTextSelected: { color: "#FFFFFF" },
  customCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5EFEA",
  },
  customIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#E6F5EF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  customContent: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#153D35" },
  cardDescription: {
    fontSize: 12,
    color: "#789087",
    lineHeight: 18,
    marginTop: 4,
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  input: {
    width: 72,
    height: 43,
    borderWidth: 1,
    borderColor: "#DCEAE4",
    borderRadius: 12,
    backgroundColor: "#F8FBF9",
    paddingHorizontal: 10,
    color: "#153D35",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  minutesLabel: { flex: 1, color: "#648078", fontSize: 12 },
  applyButton: {
    backgroundColor: "#E0F4EB",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  applyText: { color: "#087F67", fontSize: 12, fontWeight: "800" },
  settingsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5EFEA",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 17,
    gap: 12,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#E6F5EF",
    alignItems: "center",
    justifyContent: "center",
  },
  settingText: { flex: 1 },
  cardDivider: { height: 1, backgroundColor: "#EDF2EF" },
  activeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E4F5EC",
    padding: 15,
    borderRadius: 16,
    marginTop: 16,
    gap: 10,
  },
  activeText: { flex: 1 },
  stopLink: { color: "#B33A3A", fontWeight: "800" },
  primaryButton: {
    minHeight: 56,
    backgroundColor: "#087F67",
    borderRadius: 17,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    elevation: 2,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: { opacity: 0.65 },
  stopButton: { alignItems: "center", padding: 15, marginTop: 2 },
  stopButtonText: { color: "#B33A3A", fontWeight: "700", fontSize: 13 },
  footerNote: {
    textAlign: "center",
    color: "#879A92",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14,
    paddingHorizontal: 8,
  },
});
