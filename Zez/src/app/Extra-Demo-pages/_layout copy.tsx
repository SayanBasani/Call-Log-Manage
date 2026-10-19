import { Slot, router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import "../../global.css";
import "react-native-get-random-values";
import "@/services/backgroundSync";
import { initializeDevice } from "@/services/deviceRegistration";
import { requestCallLogPermission } from "@/services/callPermissions";
import { syncCallLogs } from "@/services/callSync";
import { registerBackgroundSync } from "@/services/backgroundSync";

type AppPath = "/" | "/settings" | "/call-logs";

type DeviceStatus = "loading" | "registered" | "error";

export default function RootLayout() {
  const pathname = usePathname();

  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceStatus, setDeviceStatus] =
    useState<DeviceStatus>("loading");
  const [registering, setRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const colors = darkMode
    ? {
        background: "#0F172A",
        sidebar: "#111827",
        card: "#1E293B",
        text: "#F8FAFC",
        muted: "#94A3B8",
        border: "#334155",
        active: "#2563EB",
        success: "#22C55E",
        danger: "#F87171",
      }
    : {
        background: "#F8FAFC",
        sidebar: "#FFFFFF",
        card: "#FFFFFF",
        text: "#0F172A",
        muted: "#64748B",
        border: "#E2E8F0",
        active: "#2563EB",
        success: "#16A34A",
        danger: "#DC2626",
      };

  const links: {
    title: string;
    path: AppPath;
    icon: string;
  }[] = [
    { title: "Home", path: "/", icon: "⌂" },
    { title: "Call Logs", path: "/call-logs", icon: "☎" },
    { title: "Settings", path: "/settings", icon: "⚙" },
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
    let mounted = true;
    let initializing = false;

    async function initialize() {
      if (!mounted || initializing) return;

      initializing = true;

      try {
        const device = await initializeDevice();

        if (mounted) {
          setDeviceId(device.deviceId);
          setDeviceStatus("registered");
        }
      } catch (error) {
        console.error("[Zez] Device initialization failed:", error);

        if (mounted) {
          setDeviceStatus("error");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not initialize this device."
          );
        }
      } finally {
        initializing = false;
      }
    }

    void registerBackgroundSync().catch((error) => {
      console.error("[Zez] Background registration failed:", error);
    });

    void initialize();

    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void initialize();
        }
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hasPermission = false;
    let syncing = false;

    const initializeZez = async () => {
      try {
        // Ask for call-log access immediately at startup.
        hasPermission = await requestCallLogPermission();

        if (cancelled) return;

        if (!hasPermission) {
          console.warn("[Zez] Call-log permission was not granted.");
          return;
        }

        // Keep your existing device-registration initialization.
        await initializeDevice();

        if (cancelled) return;

        // Register periodic background work.
        await registerBackgroundSync();

        if (cancelled) return;

        // Perform an initial sync without requiring a button press.
        syncing = true;
        try {
          await syncCallLogs();
        } finally {
          syncing = false;
        }
      } catch (error) {
        console.error("[Zez] Startup initialization failed:", error);
      }
    };

    void initializeZez();

    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (
          state === "active" &&
          hasPermission &&
          !syncing
        ) {
          syncing = true;

          void syncCallLogs()
            .catch((error) => {
              console.error("[Zez] Foreground sync failed:", error);
            })
            .finally(() => {
              syncing = false;
            });
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  function navigate(path: AppPath) {
    setSidebarOpen(false);
    router.push(path);
  }

  const isRegistered = deviceStatus === "registered";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
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
          onPress={() => setSidebarOpen(!sidebarOpen)}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel={
            sidebarOpen ? "Close navigation" : "Open navigation"
          }
        >
          <Text style={[styles.menuText, { color: colors.text }]}>
            {sidebarOpen ? "✕" : "☰"}
          </Text>
        </Pressable>

        <Text style={[styles.logo, { color: colors.text }]}>
          Zez
        </Text>

        <View style={styles.themeControl}>
          <Text style={{ color: colors.text }}>
            {darkMode ? "☾" : "☀"}
          </Text>

          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            accessibilityLabel="Toggle dark mode"
          />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
  },
  menuText: {
    fontSize: 24,
  },
  logo: {
    fontSize: 21,
    fontWeight: "bold",
    marginLeft: 10,
  },
  themeControl: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    width: 280,
    padding: 14,
    borderRightWidth: 1,
    zIndex: 2,
    elevation: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 16,
    marginLeft: 10,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 10,
    marginBottom: 6,
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
  statusCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
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