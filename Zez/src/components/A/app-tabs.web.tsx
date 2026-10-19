import { Tabs, TabList, TabSlot, TabTrigger } from "expo-router/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

const tabs = [
  { name: "index", href: "/", label: "Home" },
  { name: "call-logs", href: "/call-logs", label: "Call Logs" },
  { name: "reminders", href: "/reminders", label: "Reminders" },
  { name: "settings", href: "/settings", label: "Settings" },
] as const;

export default function AppTabs() {
  return (
    <Tabs>
      <View style={styles.container}>
        <TabSlot />
      </View>

      <TabList style={styles.tabList}>
        {tabs.map((tab) => (
          <TabTrigger
            key={tab.name}
            name={tab.name}
            href={tab.href}
            asChild
          >
            <Pressable style={styles.tab}>
              <Text style={styles.label}>{tab.label}</Text>
            </Pressable>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabList: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#888",
    backgroundColor: "#fff",
  },
  tab: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  label: {
    fontSize: 12,
    color: "#222",
  },
});