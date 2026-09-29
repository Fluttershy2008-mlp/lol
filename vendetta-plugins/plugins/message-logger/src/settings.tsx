/* MessageLogger mobile adaptation. SPDX-License-Identifier: GPL-3.0-or-later */
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { history, subscribeLogs, clearHistory } from "./state";
import type { Log, Version } from "./history";

function usePalette() {
  const dark = RN.useColorScheme?.() !== "light";
  return { bg: dark ? "#17191c" : "#ffffff", card: dark ? "#272a30" : "#f0f1f5", fg: dark ? "#f2f3f5" : "#202225", muted: dark ? "#b5bac1" : "#535865", red: dark ? "#ffa0a0" : "#a3162c", accent: dark ? "#c5c9ff" : "#343cab" };
}
const time = (value: string | null) => value ? new Date(value).toLocaleString() : "Time unavailable";
function Button({ label, onPress, color, background }: any) {
  return <RN.Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ padding: 12, borderRadius: 8, marginVertical: 4, backgroundColor: background }}>
    <RN.Text style={{ color, fontSize: 15, fontWeight: "600" }}>{label}</RN.Text>
  </RN.Pressable>;
}
function confirmClear(label: string, action: () => void) {
  RN.Alert.alert("Clear message history?", label, [
    { text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: action },
  ]);
}
function openAttachment(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  try { Promise.resolve(RN.Linking.openURL(url)).catch(() => RN.Alert.alert("Message Logger", "This attachment link could not be opened. It may have expired.")); }
  catch { RN.Alert.alert("Message Logger", "This attachment link could not be opened."); }
}
function VersionCard({ version, title, palette }: { version: Version; title: string; palette: any }) {
  return <RN.View style={{ padding: 14, marginBottom: 12, borderRadius: 10, backgroundColor: palette.card }}>
    <RN.Text style={{ color: palette.accent, fontWeight: "700", marginBottom: 5 }}>{title}</RN.Text>
    <RN.Text style={{ color: palette.muted, fontSize: 12, marginBottom: 10 }}>{time(version.time)}</RN.Text>
    <RN.Text selectable style={{ color: palette.fg, fontSize: 16 }}>{version.content || "[No text]"}</RN.Text>
    {version.attachments.map((a, i) => <RN.View key={a.id + ":" + i} style={{ marginTop: 8 }}>
      <RN.Text selectable style={{ color: palette.muted }}>Attachment: {a.filename}</RN.Text>
      {/^https?:\/\//i.test(a.url) && <Button label={"Open " + a.filename} color={palette.accent} onPress={() => openAttachment(a.url)} />}
    </RN.View>)}
  </RN.View>;
}
export function HistoryView({ initialChannel, onBack }: { initialChannel?: string; onBack?: () => void }) {
  const palette = usePalette();
  const [query, setQuery] = React.useState("");
  const [channelOnly, setChannelOnly] = React.useState(Boolean(initialChannel));
  const [filter, setFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<{ id: string; channelId: string } | null>(null);
  const [, refresh] = React.useState(0);
  React.useEffect(() => subscribeLogs(() => refresh((n: number) => n + 1)), []);
  const detail = selected && history.get(selected.channelId, selected.id);
  const needle = query.trim().toLowerCase();
  const logs = history.list().filter(log => {
    if (channelOnly && initialChannel && log.channelId !== initialChannel) return false;
    if (filter === "deleted" && !log.deletedAt) return false;
    if (filter === "edited" && !log.edits.length) return false;
    if (!needle) return true;
    return [log.authorName, log.authorId, log.channelName, log.channelId, log.id,
      ...[...log.edits, log.current].map(v => v.content + " " + v.attachments.map(a => a.filename).join(" ")),
    ].join(" ").toLowerCase().includes(needle);
  });
  const label = (log: Log) => (log.deletedAt ? "DELETED" : "EDITED") + (log.edits.length ? " · " + log.edits.length + " saved edits" : "");
  const heading = (value: string) => <RN.Text style={{ color: palette.fg, fontSize: 21, fontWeight: "700", marginVertical: 12 }}>{value}</RN.Text>;
  if (detail) return <RN.ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ padding: 18 }}>
    <Button label="Back to history" color={palette.accent} onPress={() => setSelected(null)} />
    {heading(detail.authorName)}
    <RN.Text selectable style={{ color: palette.muted, marginBottom: 8 }}>{detail.channelName + "\nUser: " + detail.authorId + "\nMessage: " + detail.id}</RN.Text>
    {detail.deletedAt && <RN.Text style={{ color: palette.red, marginBottom: 12 }}>Deleted {time(detail.deletedAt)}</RN.Text>}
    {(detail.earlierEditsMissing || detail.droppedEdits > 0) && <RN.Text style={{ color: palette.muted, marginBottom: 12 }}>Earlier versions are unavailable or exceeded the history limit.</RN.Text>}
    {detail.edits.map((version, i) => <VersionCard key={i} version={version} title={i === 0 ? "Earlier version" : "Edit " + i} palette={palette} />)}
    <VersionCard version={detail.current} title={detail.deletedAt ? "Last version before deletion" : "Latest recorded version"} palette={palette} />
    <Button label="Clear this message" color={palette.red} background={palette.card} onPress={() => confirmClear("Remove this message's saved history from this device.", () => { clearHistory(detail.channelId, detail.id); setSelected(null); })} />
    <Button label="Clear this channel" color={palette.red} onPress={() => confirmClear("Remove all saved history for this channel.", () => { clearHistory(detail.channelId); setSelected(null); })} />
  </RN.ScrollView>;
  return <RN.View style={{ flex: 1, backgroundColor: palette.bg, padding: 16 }}>
    {onBack && <Button label="Back to settings" color={palette.accent} onPress={onBack} />}
    {heading("Message history · " + logs.length)}
    <RN.Text style={{ color: palette.muted, marginBottom: 12 }}>Local, temporary history. Tap a message to see its versions. Attachment links may expire.</RN.Text>
    <RN.TextInput accessibilityLabel="Search message history" value={query} onChangeText={setQuery} placeholder="Search text, author, channel or ID" placeholderTextColor={palette.muted}
      style={{ color: palette.fg, backgroundColor: palette.card, borderRadius: 8, padding: 12, marginBottom: 8 }} />
    <RN.View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {[['all', 'All'], ['deleted', 'Deleted'], ['edited', 'Edited']].map(([id, name]) => <Button key={id} label={(filter === id ? "✓ " : "") + name} color={palette.accent} background={palette.card} onPress={() => setFilter(id)} />)}
    </RN.View>
    {initialChannel && <Button label={channelOnly ? "This channel · Show all channels" : "All channels · Show this channel"} color={palette.accent} onPress={() => setChannelOnly(!channelOnly)} />}
    <RN.FlatList data={logs} keyExtractor={(log: Log) => log.channelId + ":" + log.id} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
      keyboardShouldPersistTaps="handled" ListEmptyComponent={<RN.Text style={{ color: palette.muted, paddingVertical: 24 }}>No matching history yet. Only messages cached while this plugin is running can be recorded.</RN.Text>}
      renderItem={({ item }: { item: Log }) => <RN.Pressable accessibilityRole="button" accessibilityLabel={item.authorName + ", " + label(item)}
        onPress={() => setSelected({ id: item.id, channelId: item.channelId })} style={{ backgroundColor: palette.card, borderRadius: 10, padding: 14, marginVertical: 5 }}>
        <RN.Text style={{ color: item.deletedAt ? palette.red : palette.accent, fontSize: 12, fontWeight: "700" }}>{label(item)}</RN.Text>
        <RN.Text numberOfLines={1} style={{ color: palette.fg, fontWeight: "600", marginTop: 6 }}>{item.authorName + " · " + item.channelName}</RN.Text>
        <RN.Text numberOfLines={3} style={{ color: palette.fg, marginTop: 6 }}>{item.current.content || "[Attachment / no text]"}</RN.Text>
        <RN.Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>{time(new Date(item.changedAt).toISOString())}</RN.Text>
      </RN.Pressable>} />
    <Button label={channelOnly && initialChannel ? "Clear this channel's history" : "Clear all history"} color={palette.red}
      onPress={() => confirmClear("This also removes retained deleted messages from your chat view. It does not delete any messages on Discord.", () => clearHistory(channelOnly ? initialChannel : undefined))} />
  </RN.View>;
}

export function openHistory(channelId?: string) {
  try {
    const navigation = findByProps("getRootNavigationRef")?.getRootNavigationRef?.();
    if (typeof navigation?.navigate !== "function") throw new Error("Navigation unavailable");
    navigation.navigate("BUNNY_CUSTOM_PAGE", { title: "Message Logger", render: () => <HistoryView initialChannel={channelId} /> });
  } catch {
    RN.Alert.alert("Message Logger", "Open Revenge Settings → Plugins → Message Logger → settings → Open message history.");
  }
}

export default function Settings() {
  useProxy(storage);
  const palette = usePalette();
  const [showHistory, setShowHistory] = React.useState(false);
  if (showHistory) return <HistoryView onBack={() => setShowHistory(false)} />;
  const switches = [
    ["logDeletes", "Log deleted messages"], ["logEdits", "Log edits"],
    ["logDeletedAttachments", "Save attachment details"], ["keepDeletedInChat", "Keep deleted messages in chat"],
    ["ignoreBots", "Ignore bots"], ["ignoreSelf", "Ignore my messages"], ["nopk", "Ignore PluralKit originals"],
  ];
  return <RN.ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
    <RN.Text style={{ color: palette.fg, fontSize: 23, fontWeight: "700", marginBottom: 12 }}>Message Logger 2.0.0</RN.Text>
    <RN.Text style={{ color: palette.muted, marginBottom: 12 }}>Deleted messages and edit history for Revenge, adapted from Vencord. Use /messagelogger in any chat to open its history privately.</RN.Text>
    <Button label="Open message history" color={palette.accent} background={palette.card} onPress={() => setShowHistory(true)} />
    <RN.Text style={{ color: palette.muted, marginVertical: 14 }}>History clears when you restart, disable the plugin or log out. Limits: 200 messages total, 50 per channel, 10 older versions per message, plus a total memory cap. Text is limited to 4,000 characters per version.</RN.Text>
    {switches.map(([key, label]) => <RN.View key={key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }}>
      <RN.Text style={{ color: palette.fg, fontSize: 16, flex: 1, paddingRight: 12 }}>{label}</RN.Text>
      <RN.Switch accessibilityLabel={label} value={Boolean(storage[key])} onValueChange={value => { storage[key] = value; }} />
    </RN.View>)}
    <RN.Text style={{ color: palette.muted, marginVertical: 10 }}>PluralKit is optional and only checks IDs for messages retained in chat. It sends no message text or Discord credentials. Attachment records store names and links, not media files.</RN.Text>
    <RN.Text style={{ color: palette.fg, fontSize: 18, fontWeight: "600", marginTop: 16 }}>Ignore lists</RN.Text>
    <RN.Text style={{ color: palette.muted, marginVertical: 10 }}>Separate IDs with commas or spaces. Channel IDs also support categories. Settings apply to future events; clear history to remove existing records.</RN.Text>
    {[["ignoreUsers", "User IDs"], ["ignoreChannels", "Channel / category IDs"], ["ignoreGuilds", "Server IDs"]].map(([key, label]) => <RN.View key={key} style={{ marginVertical: 8 }}>
      <RN.Text style={{ color: palette.fg, marginBottom: 5 }}>{label}</RN.Text>
      <RN.TextInput accessibilityLabel={label} multiline autoCorrect={false} autoCapitalize="none" maxLength={10000}
        value={String(storage[key] ?? "")} onChangeText={value => { storage[key] = value; }} placeholder={label} placeholderTextColor={palette.muted}
        style={{ color: palette.fg, backgroundColor: palette.card, padding: 12, borderRadius: 8, minHeight: 48 }} />
    </RN.View>)}
    <Button label="Clear all history" color={palette.red} onPress={() => confirmClear("Remove all locally saved history and retained deleted chat messages.", () => clearHistory())} />
  </RN.ScrollView>;
}
