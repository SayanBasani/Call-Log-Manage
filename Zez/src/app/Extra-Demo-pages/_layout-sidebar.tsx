import { Slot, router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View, } from "react-native";
import "../../global.css";
import "@/services/backgroundSync";
import { registerBackgroundSync } from "@/services/backgroundSync";
import { syncCallLogs } from "@/services/callSync";

import "react-native-get-random-values";

export default function RootLayout() {
  useEffect(() => {
    let running = false;
    let mounted = true;

    async function syncNow() {
      if (running || !mounted) return;

      running = true;

      try {
        const result = await syncCallLogs();

        console.log("[Zez] Automatic sync:", result);
      } catch (error) {
        console.error("[Zez] Automatic sync failed:", error);
      } finally {
        running = false;
      }
    }

    void registerBackgroundSync().catch((error) => {
      console.error("[Zez] Background registration failed:", error);
    });

    void syncNow();

    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void syncNow();
        }
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const colors = darkMode
    ? {
        background: "#0F172A",
        sidebar: "#111827",
        card: "#1E293B",
        text: "#F8FAFC",
        muted: "#94A3B8",
        border: "#334155",
        active: "#2563EB",
      }
    : {
        background: "#F8FAFC",
        sidebar: "#FFFFFF",
        card: "#E2E8F0",
        text: "#0F172A",
        muted: "#64748B",
        border: "#E2E8F0",
        active: "#2563EB",
      };

  const links : {
    title: String;
    path: "/" | "/settings" | "/call-logs";
    icon: String;
  }[] = [
    { title: "Home", path: "/", icon: "⌂" },
    { title: "Settings", path: "/settings", icon: "⚙" },
    { title: "Call Logs", path: "/call-logs", icon: "C" },
  ];

  function navigate(path: "/" | "/settings" | "/call-logs") {
    setSidebarOpen(false);
    router.push(path);
  }

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
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>
              MENU
            </Text>

            <ScrollView>
              {links.map((link) => {
                const active =
                  link.path === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.path);

                return (
                  <Pressable
                    key={link.path}
                    onPress={() => navigate(link.path)}
                    style={[
                      styles.navItem,
                      active && { backgroundColor: colors.active },
                    ]}
                  >
                    <Text style={styles.navIcon}>
                      {link.icon}
                    </Text>

                    <Text
                      style={[
                        styles.navText,
                        { color: active ? "#FFFFFF" : colors.text },
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
                styles.sidebarFooter,
                { borderTopColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.muted }}>
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
    width: 250,
    padding: 14,
    borderRightWidth: 1,
    zIndex: 2,
    elevation: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "bold",
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
    color: "#FFFFFF",
    width: 32,
  },
  navText: {
    fontSize: 15,
    fontWeight: "500",
  },
  sidebarFooter: {
    paddingTop: 16,
    borderTopWidth: 1,
  },
});
