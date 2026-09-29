import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

export default function Settings() {
  useProxy(storage);
  const { ScrollView, View, Text, Switch } = ReactNative;
  const dark = ReactNative.useColorScheme?.() !== "light";
  const color = dark ? "#f2f3f5" : "#202225";
  // Core RN controls avoid depending on removed Discord Forms/icon components.
  return (
    <ScrollView style={{ flex: 1, backgroundColor: dark ? "#202225" : "#ffffff" }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ color, fontSize: 20, fontWeight: "600", marginBottom: 12 }}>Message Logger 1.2.0</Text>
      <Text style={{ color, marginBottom: 20 }}>
        Deleted messages use a [deleted] text label. Keeps up to 50 messages per channel and 200 total until you restart or disable the plugin. Older entries are removed automatically.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color, fontSize: 16, flex: 1 }}>Ignore PluralKit</Text>
        <Switch accessibilityLabel="Ignore PluralKit" value={Boolean(storage.nopk)} onValueChange={(value) => { storage.nopk = value; }} />
      </View>
      <Text style={{ color, marginTop: 8 }}>
        Optional: checks message IDs with PluralKit to remove proxy originals. Message text and Discord credentials are never sent.
      </Text>
    </ScrollView>
  );
}
