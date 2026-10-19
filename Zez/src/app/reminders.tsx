
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAppTheme } from "@/context/ThemeContext";
import { SafeAreaView } from "react-native-safe-area-context";

const CHANNEL_ID = "zez-reminders";

type Reminder = {
  id: string;
  title: string;
  body: string;
};

export default function RemindersScreen() {
  const { darkMode, colors } = useAppTheme();

  const [title, setTitle] = useState("Drink water");
  const [message, setMessage] = useState(
    "It's time to drink some water."
  );
  const [minutes, setMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState("");
  const [daily, setDaily] = useState(false);
  const [clock, setClock] = useState("09:00");
  const [repeat, setRepeat] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [saving, setSaving] = useState(false);

  const palette = {
    background: colors.background,
    card: colors.card,
    text: colors.text,
    muted: colors.muted,
    border: colors.border,
    accent: darkMode ? "#6EE7B7" : "#047857",
    accentBg: darkMode ? "#173D35" : "#D1FAE5",
    input: darkMode ? "#111827" : "#F1F5F9",
    danger: colors.danger,
  };

  const loadReminders = useCallback(async () => {
    try {
      const items =
        await Notifications.getAllScheduledNotificationsAsync();

      setReminders(
        items
          .filter((item) => item.content.data?.zezReminder === true)
          .map((item) => ({
            id: item.identifier,
            title: item.content.title || "Reminder",
            body: item.content.body || "",
          }))
      );
    } catch (error) {
      console.error("[ZEZ] Failed to load reminders:", error);
    }
  }, []);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  async function prepareNotifications() {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(
        CHANNEL_ID,
        {
          name: "ZEZ Reminders",
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
          enableVibrate: true,
        }
      );
    }

    const permission =
      await Notifications.getPermissionsAsync();

    if (permission.granted) return true;

    const requested =
      await Notifications.requestPermissionsAsync();

    if (!requested.granted) {
      Alert.alert(
        "Permission required",
        "Enable notifications for ZEZ in Android Settings."
      );
      return false;
    }

    return true;
  }

  async function saveReminder() {
    if (saving) return;

    if (!title.trim()) {
      Alert.alert("Missing title", "Enter a reminder name.");
      return;
    }

    let interval = minutes;

    if (customMinutes.trim()) {
      interval = Number(customMinutes);

      if (
        !Number.isInteger(interval) ||
        interval < 1 ||
        interval > 10080
      ) {
        Alert.alert(
          "Invalid interval",
          "Enter a whole number from 1 to 10080 minutes."
        );
        return;
      }
    }

    let hour = 0;
    let minute = 0;

    if (daily) {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);

      if (!match) {
        Alert.alert("Invalid time", "Use HH:MM format.");
        return;
      }

      hour = Number(match[1]);
      minute = Number(match[2]);
    }

    setSaving(true);

    try {
      if (!(await prepareNotifications())) return;

      const content = {
        title: title.trim(),
        body: message.trim() || "Your reminder is due.",
        data: { zezReminder: true },
        priority: Notifications.AndroidNotificationPriority.MAX,
      };

      if (daily) {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            ...(Platform.OS === "android"
              ? { channelId: CHANNEL_ID }
              : {}),
          },
        });
      } else {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type:
              Notifications.SchedulableTriggerInputTypes
                .TIME_INTERVAL,
            seconds: interval * 60,
            repeats: repeat,
            ...(Platform.OS === "android"
              ? { channelId: CHANNEL_ID }
              : {}),
          },
        });
      }

      await loadReminders();

      Alert.alert(
        "Reminder scheduled",
        daily
          ? `Daily reminder set for ${clock}.`
          : `Reminder set for every ${interval} minute(s).`
      );
    } catch (error) {
      console.error("[ZEZ] Reminder scheduling failed:", error);
      Alert.alert("Error", "Could not schedule the reminder.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReminder(id: string) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
      await loadReminders();
    } catch {
      Alert.alert("Error", "Could not cancel this reminder.");
    }
  }

  const panel = {
    backgroundColor: palette.card,
    borderColor: palette.border,
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: palette.input,
      borderColor: palette.border,
      color: palette.text,
    },
  ];

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: palette.background },
      ]}
    >
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headingRow}>
        <View style={[styles.heroIcon, { backgroundColor: palette.accentBg }]}>
          <Ionicons
            name="water"
            size={29}
            color={palette.accent}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>
            YOUR DAILY WELLNESS
          </Text>
          <Text style={[styles.heading, { color: palette.text }]}>
            Reminders
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Build better habits, one reminder at a time.
          </Text>
        </View>
      </View>

      <View style={[styles.card, panel]}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          Create a reminder
        </Text>

        <Text style={[styles.label, { color: palette.muted }]}>
          REMINDER NAME
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Drink water"
          placeholderTextColor={palette.muted}
          style={inputStyle}
          maxLength={70}
        />

        <Text style={[styles.label, { color: palette.muted }]}>
          MESSAGE
        </Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="What do you need to remember?"
          placeholderTextColor={palette.muted}
          style={[...inputStyle, styles.message]}
          multiline
          maxLength={200}
        />

        <Text style={[styles.label, { color: palette.muted }]}>
          SCHEDULE
        </Text>

        <View style={styles.row}>
          {[
            { label: "Repeat interval", value: false, icon: "repeat-outline" as const },
            { label: "Daily alarm", value: true, icon: "alarm-outline" as const },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => setDaily(item.value)}
              style={[
                styles.mode,
                {
                  backgroundColor:
                    daily === item.value
                      ? palette.accentBg
                      : palette.input,
                  borderColor:
                    daily === item.value
                      ? palette.accent
                      : palette.border,
                },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={
                  daily === item.value
                    ? palette.accent
                    : palette.muted
                }
              />
              <Text
                style={{
                  color:
                    daily === item.value
                      ? palette.accent
                      : palette.text,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {daily ? (
          <>
            <Text style={[styles.label, { color: palette.muted }]}>
              DAILY TIME (24-HOUR)
            </Text>
            <TextInput
              value={clock}
              onChangeText={setClock}
              placeholder="09:00"
              placeholderTextColor={palette.muted}
              style={inputStyle}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: palette.muted }]}>
              QUICK INTERVALS
            </Text>

            <View style={styles.presets}>
              {[15, 30, 45, 60, 90, 120].map((value) => {
                const selected =
                  minutes === value && !customMinutes;

                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => {
                      setMinutes(value);
                      setCustomMinutes("");
                    }}
                    style={[
                      styles.preset,
                      {
                        backgroundColor: selected
                          ? palette.accentBg
                          : palette.input,
                        borderColor: selected
                          ? palette.accent
                          : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? palette.accent : palette.text,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {value < 60 ? `${value} min` : `${value / 60} hr`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: palette.muted }]}>
              CUSTOM MINUTES
            </Text>
            <TextInput
              value={customMinutes}
              onChangeText={setCustomMinutes}
              placeholder="Enter minutes, e.g. 15"
              placeholderTextColor={palette.muted}
              style={inputStyle}
              keyboardType="number-pad"
            />

            <TouchableOpacity
              onPress={() => setRepeat((value) => !value)}
              style={styles.repeatRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontWeight: "700" }}>
                  Repeat automatically
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>
                  {repeat ? "Repeats at this interval" : "One-time reminder"}
                </Text>
              </View>
              <Ionicons
                name={repeat ? "checkmark-circle" : "ellipse-outline"}
                size={25}
                color={repeat ? palette.accent : palette.muted}
              />
            </TouchableOpacity>
          </>
        )}

        <View
          style={[
            styles.soundInfo,
            { backgroundColor: palette.input },
          ]}
        >
          <Ionicons
            name="volume-high-outline"
            size={22}
            color={palette.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontWeight: "700", fontSize: 12 }}>
              Default device sound
            </Text>
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
              Uses the Android notification channel sound.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          disabled={saving}
          onPress={saveReminder}
          style={[
            styles.saveButton,
            { backgroundColor: palette.accent },
            saving && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="alarm" size={20} color="#FFFFFF" />
          <Text style={styles.saveText}>
            {saving ? "Scheduling..." : "Save reminder"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeading}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          Scheduled reminders
        </Text>
        <Text style={[styles.count, { color: palette.muted }]}>
          {reminders.length}
        </Text>
      </View>

      {reminders.length === 0 ? (
        <View style={[styles.empty, panel]}>
          <Ionicons
            name="calendar-outline"
            size={30}
            color={palette.muted}
          />
          <Text style={{ color: palette.text, fontWeight: "700", marginTop: 10 }}>
            Nothing scheduled yet
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, marginTop: 5 }}>
            Your reminders will appear here.
          </Text>
        </View>
      ) : (
        reminders.map((item) => (
          <View key={item.id} style={[styles.reminder, panel]}>
            <View
              style={[
                styles.itemIcon,
                { backgroundColor: palette.accentBg },
              ]}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={palette.accent}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontWeight: "700" }}>
                {item.title}
              </Text>
              <Text
                style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}
                numberOfLines={2}
              >
                {item.body}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                Alert.alert("Cancel reminder", `Remove "${item.title}"?`, [
                  { text: "Keep", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => void deleteReminder(item.id),
                  },
                ])
              }
              accessibilityLabel={`Remove ${item.title}`}
              style={styles.delete}
            >
              <Ionicons name="trash-outline" size={19} color={palette.danger} />
            </TouchableOpacity>
          </View>
        ))
      )}

      <Text style={[styles.footer, { color: palette.muted }]}>
        Reminders are scheduled locally on your device.
      </Text>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4FAF8" },
  page: {
    padding: 20,
    paddingBottom: 40,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 25,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 17,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 9,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 13,
    fontSize: 14,
  },
  message: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 9,
  },
  mode: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  preset: {
    width: "31%",
    minHeight: 43,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    marginTop: 8,
  },
  soundInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 13,
    marginTop: 15,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 15,
    borderRadius: 13,
    marginTop: 18,
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  count: {
    fontSize: 12,
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    padding: 25,
    borderRadius: 17,
    borderWidth: 1,
  },
  reminder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 10,
  },
  itemIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  delete: {
    padding: 8,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    marginTop: 20,
  },
});
