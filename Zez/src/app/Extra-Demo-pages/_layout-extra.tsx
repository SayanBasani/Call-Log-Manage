import { Slot, router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import "../../global.css";
import "@/services/backgroundSync";

import { registerBackgroundSync } from "@/services/backgroundSync";
import { syncCallLogs } from "@/services/callSync";

import "react-native-get-random-values";

type BarPosition = "top" | "bottom";
type ThemeMode = "light" | "dark";

export default function RootLayout() {
  const pathname = usePathname();

  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [barPosition, setBarPosition] =
    useState<BarPosition>("bottom");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const syncLock = useRef(false);

  const darkMode = themeMode === "dark";

  const colors = darkMode
    ? {
        background: "#0B1120",
        surface: "#111B2E",
        surfaceElevated: "#172338",
        text: "#F1F5F9",
        muted: "#94A3B8",
        border: "#26354B",
        accent: "#60A5FA",
        accentBackground: "#172F50",
        success: "#34D399",
        overlay: "rgba(0,0,0,0.65)",
      }
    : {
        background: "#F4F7FC",
        surface: "#FFFFFF",
        surfaceElevated: "#F1F5F9",
        text: "#172033",
        muted: "#718096",
        border: "#E2E8F0",
        accent: "#2563EB",
        accentBackground: "#E8F0FF",
        success: "#059669",
        overlay: "rgba(15,23,42,0.42)",
      };

  const tabs = [
    {
      title: "Home",
      icon: "⌂",
      path: "/" as const,
    },
    {
      title: "History",
      icon: "◷",
      path: "/call-logs" as const,
    },
    {
      title: "Sync",
      icon: "↻",
      path: null,
    },
    {
      title: "Settings",
      icon: "⚙",
      path: "/settings" as const,
    },
  ];

  async function runSync() {
    if (syncLock.current) {
      return;
    }

    syncLock.current = true;
    setSyncing(true);

    try {
      const result = await syncCallLogs();
      console.log("[Zez] Sync completed:", result);
    } catch (error) {
      console.error("[Zez] Sync failed:", error);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    void registerBackgroundSync().catch((error) => {
      console.error("[Zez] Background registration failed:", error);
    });

    void runSync();

    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active" && mounted) {
          void runSync();
        }
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  function handleTabPress(
    path: "/" | "/call-logs" | "/settings" | null
  ) {
    if (path === null) {
      void runSync();
      return;
    }

    if (path !== pathname) {
      router.navigate(path);
    }
  }

  function renderNavigation() {
    return (
      <View
        style={[
          styles.navigation,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {tabs.map((tab) => {
          const active =
            tab.path !== null &&
            (tab.path === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.path));

          const isSync = tab.path === null;

          return (
            <Pressable
              key={tab.title}
              onPress={() => handleTabPress(tab.path)}
              accessibilityRole="button"
              accessibilityLabel={tab.title}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.tab,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View
                style={[
                  styles.tabIconContainer,
                  active && {
                    backgroundColor: colors.accentBackground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabIcon,
                    {
                      color: active ? colors.accent : colors.muted,
                    },
                  ]}
                >
                  {isSync && syncing ? "…" : tab.icon}
                </Text>
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  {
                    color: active ? colors.accent : colors.muted,
                    fontWeight: active ? "700" : "500",
                  },
                ]}
              >
                {isSync && syncing ? "Syncing" : tab.title}
              </Text>

              {active && (
                <View
                  style={[
                    styles.activeDot,
                    { backgroundColor: colors.accent },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderOption(
    title: string,
    description: string,
    icon: string,
    selected: boolean,
    onPress: () => void
  ) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.option,
          {
            backgroundColor: selected
              ? colors.accentBackground
              : colors.surfaceElevated,
            borderColor: selected
              ? colors.accent
              : colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.optionIcon,
            {
              backgroundColor: colors.surface,
            },
          ]}
        >
          <Text
            style={[
              styles.optionIconText,
              { color: colors.text },
            ]}
          >
            {icon}
          </Text>
        </View>

        <View style={styles.optionContent}>
          <Text
            style={[
              styles.optionTitle,
              { color: colors.text },
            ]}
          >
            {title}
          </Text>

          <Text
            style={[
              styles.optionDescription,
              { color: colors.muted },
            ]}
          >
            {description}
          </Text>
        </View>

        <View
          style={[
            styles.radio,
            {
              borderColor: selected
                ? colors.accent
                : colors.muted,
              backgroundColor: selected
                ? colors.accent
                : "transparent",
            },
          ]}
        >
          {selected && <View style={styles.radioInner} />}
        </View>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* App header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.brandContainer}>
          <View
            style={[
              styles.brandIcon,
              { backgroundColor: colors.accent },
            ]}
          >
            <Text style={styles.brandIconText}>Z</Text>
          </View>

          <View>
            <Text
              style={[
                styles.brandTitle,
                { color: colors.text },
              ]}
            >
              Zez
            </Text>

            <Text
              style={[
                styles.brandSubtitle,
                { color: colors.muted },
              ]}
            >
              Call manager
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: syncing
                    ? "#F59E0B"
                    : colors.success,
                },
              ]}
            />

            <Text
              style={[
                styles.statusText,
                { color: colors.muted },
              ]}
            >
              {syncing ? "Syncing" : "Ready"}
            </Text>
          </View>

          <Pressable
            onPress={() => setSettingsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open appearance and navigation settings"
            style={({ pressed }) => [
              styles.settingsButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.settingsButtonIcon,
                { color: colors.text },
              ]}
            >
              ⚙
            </Text>

            <View
              style={[
                styles.settingsBadge,
                { backgroundColor: colors.accent },
              ]}
            />
          </Pressable>
        </View>
      </View>

      {/* Navigation can be placed above the page */}
      {barPosition === "top" && (
        <View style={styles.navigationWrapper}>
          {renderNavigation()}
        </View>
      )}

      {/* Screen receives all remaining space */}
      <View style={styles.screen}>
        <Slot />
      </View>

      {/* Navigation can be placed below the page */}
      {barPosition === "bottom" && (
        <View style={styles.navigationWrapper}>
          {renderNavigation()}
        </View>
      )}

      {/* Quick settings modal */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View
          style={[
            styles.modalRoot,
            { backgroundColor: colors.overlay },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsVisible(false)}
            accessibilityLabel="Close settings"
          />

          <View
            style={[
              styles.settingsPanel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHandleContainer}>
              <View
                style={[
                  styles.modalHandle,
                  { backgroundColor: colors.border },
                ]}
              />
            </View>

            <View style={styles.modalHeader}>
              <View style={styles.modalHeadingContent}>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: colors.text },
                  ]}
                >
                  Quick settings
                </Text>

                <Text
                  style={[
                    styles.modalSubtitle,
                    { color: colors.muted },
                  ]}
                >
                  Personalize your Zez experience
                </Text>
              </View>

              <Pressable
                onPress={() => setSettingsVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={[
                  styles.closeButton,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Text
                  style={[
                    styles.closeButtonText,
                    { color: colors.text },
                  ]}
                >
                  ×
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text },
                ]}
              >
                APPEARANCE
              </Text>

              <View style={styles.themeOptions}>
                <Pressable
                  onPress={() => setThemeMode("light")}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: themeMode === "light",
                  }}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      backgroundColor:
                        themeMode === "light"
                          ? colors.accentBackground
                          : colors.surfaceElevated,
                      borderColor:
                        themeMode === "light"
                          ? colors.accent
                          : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text style={styles.themeOptionIcon}>☀️</Text>

                  <Text
                    style={[
                      styles.themeOptionTitle,
                      { color: colors.text },
                    ]}
                  >
                    Light
                  </Text>

                  <Text
                    style={[
                      styles.themeOptionSubtitle,
                      { color: colors.muted },
                    ]}
                  >
                    Bright and clear
                  </Text>

                  {themeMode === "light" && (
                    <View
                      style={[
                        styles.themeSelected,
                        { backgroundColor: colors.accent },
                      ]}
                    >
                      <Text style={styles.themeSelectedText}>✓</Text>
                    </View>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setThemeMode("dark")}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: themeMode === "dark",
                  }}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      backgroundColor:
                        themeMode === "dark"
                          ? colors.accentBackground
                          : colors.surfaceElevated,
                      borderColor:
                        themeMode === "dark"
                          ? colors.accent
                          : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text style={styles.themeOptionIcon}>🌙</Text>

                  <Text
                    style={[
                      styles.themeOptionTitle,
                      { color: colors.text },
                    ]}
                  >
                    Dark
                  </Text>

                  <Text
                    style={[
                      styles.themeOptionSubtitle,
                      { color: colors.muted },
                    ]}
                  >
                    Easy on the eyes
                  </Text>

                  {themeMode === "dark" && (
                    <View
                      style={[
                        styles.themeSelected,
                        { backgroundColor: colors.accent },
                      ]}
                    >
                      <Text style={styles.themeSelectedText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <Text
                style={[
                  styles.sectionTitle,
                  styles.navigationSectionTitle,
                  { color: colors.text },
                ]}
              >
                NAVIGATION POSITION
              </Text>

              {renderOption(
                "Top navigation",
                "Keep the tabs above the page",
                "↑",
                barPosition === "top",
                () => setBarPosition("top")
              )}

              {renderOption(
                "Bottom navigation",
                "Keep the tabs below the page",
                "↓",
                barPosition === "bottom",
                () => setBarPosition("bottom")
              )}

              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Text
                  style={[
                    styles.infoIcon,
                    { color: colors.accent },
                  ]}
                >
                  ⓘ
                </Text>

                <Text
                  style={[
                    styles.infoText,
                    { color: colors.muted },
                  ]}
                >
                  Your navigation stays outside the page content.
                  Changing its position will resize the available
                  screen space rather than cover your content.
                </Text>
              </View>

              <Pressable
                onPress={() => setSettingsVisible(false)}
                style={({ pressed }) => [
                  styles.doneButton,
                  {
                    backgroundColor: colors.accent,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={styles.doneButtonText}>
                  Done
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  brandIconText: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
  },

  brandTitle: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  brandSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },

  settingsButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  settingsButtonIcon: {
    fontSize: 22,
  },

  settingsBadge: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    right: 7,
    top: 7,
  },

  screen: {
    flex: 1,
    minHeight: 0,
  },

  navigationWrapper: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  navigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 5,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },

  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    gap: 3,
  },

  tabIconContainer: {
    width: 38,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  tabIcon: {
    fontSize: 21,
    fontWeight: "600",
  },

  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },

  activeDot: {
    position: "absolute",
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  modalRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },

  settingsPanel: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingBottom: 20,
    overflow: "hidden",
  },

  modalHandleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 18,
  },

  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 4,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },

  modalHeadingContent: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  modalSubtitle: {
    fontSize: 12,
    marginTop: 5,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  closeButtonText: {
    fontSize: 26,
    lineHeight: 29,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 12,
  },

  themeOptions: {
    flexDirection: "row",
    gap: 12,
  },

  themeOption: {
    flex: 1,
    minHeight: 132,
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  themeOptionIcon: {
    fontSize: 23,
    marginBottom: 10,
  },

  themeOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },

  themeOptionSubtitle: {
    fontSize: 10,
    marginTop: 4,
  },

  themeSelected: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  themeSelectedText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  navigationSectionTitle: {
    marginTop: 27,
  },

  option: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    padding: 11,
    marginBottom: 10,
  },

  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  optionIconText: {
    fontSize: 23,
    fontWeight: "600",
  },

  optionContent: {
    flex: 1,
    marginLeft: 12,
  },

  optionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },

  optionDescription: {
    fontSize: 11,
    marginTop: 4,
  },

  radio: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  radioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 13,
    padding: 12,
    marginTop: 8,
  },

  infoIcon: {
    fontSize: 17,
    fontWeight: "700",
  },

  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },

  doneButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
