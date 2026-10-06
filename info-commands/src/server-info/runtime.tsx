/** Compatibility adapter for the uploaded kmmiio99o Server Info UI. */
const { React, ReactNative: RN } = vendetta.metro.common;
const optional = (fn: () => any) => { try { return fn(); } catch { return undefined; } };
function color(name: string, fallback: string) {
  const theme = optional(() => vendetta.metro.findByStoreName("ThemeStore")?.theme);
  return optional(() => vendetta.metro.findByProps("colors", "meta")?.meta?.resolveSemanticColor(
    theme, vendetta.ui.semanticColors?.[name],
  )) ?? fallback;
}
function Text({ children, color: semantic, variant, lineClamp, style, ...props }: any) {
  const light = optional(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
  const name = semantic === "text-link" ? "TEXT_LINK" : semantic === "text-subtle" ? "TEXT_MUTED" : "TEXT_NORMAL";
  return React.createElement(RN.Text, {
    ...props, numberOfLines: lineClamp,
    style: [{ color: color(name, name === "TEXT_LINK" ? "#8ea1ff" : light ? "#1e1f22" : "#f2f3f5"),
      fontSize: variant?.includes("lg") ? 20 : variant?.includes("sm") ? 13 : 15,
      fontWeight: /semibold|medium/.test(variant ?? "") ? "600" : "400" }, style],
  }, children);
}
function TrailingText({ text }: any) { return React.createElement(Text, { color: "text-subtle" }, text ?? "—"); }
function TableRow({ label, subLabel, trailing, onPress, disabled }: any) {
  return React.createElement(RN.TouchableOpacity, {
    onPress, disabled: disabled || !onPress,
    accessibilityRole: onPress ? "button" : undefined, accessibilityLabel: label,
    style: { padding: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  }, React.createElement(RN.View, { style: { flex: 1 } },
    React.createElement(Text, { variant: "text-md/medium" }, label),
    subLabel ? React.createElement(Text, { color: "text-subtle", style: { marginTop: 4 } }, subLabel) : null,
  ), trailing);
}
TableRow.TrailingText = TrailingText;
function TableRowGroup({ title, children }: any) {
  const light = optional(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
  return React.createElement(RN.View, { style: { paddingHorizontal: 16, gap: 8 } },
    React.createElement(Text, { variant: "text-sm/normal", color: "text-subtle" }, title),
    React.createElement(RN.View, { style: { borderRadius: 12, overflow: "hidden",
      backgroundColor: color("BACKGROUND_SECONDARY", light ? "#f2f3f5" : "#2b2d31") } }, children),
  );
}
const nativeRow = optional(() => vendetta.metro.findByProps("TableRow")?.TableRow);
const NativeGroup = optional(() => vendetta.metro.findByProps("TableRowGroup")?.TableRowGroup);
const useReRender = () => React.useReducer((value: number) => value + 1, 0)[1];
export const runtime = {
  react: { React, ReactNative: RN },
  utils: { react: { useReRender } },
  discord: { design: { Design: {
    get ActionSheet() { return optional(() => vendetta.metro.findByProps("ActionSheet")?.ActionSheet) ?? RN.View; },
    Text, TableRow: nativeRow?.TrailingText ? nativeRow : TableRow,
    TableRowGroup: nativeRow?.TrailingText && NativeGroup ? NativeGroup : TableRowGroup,
    space: { PX_16: 16, PX_12: 12 },
  } } },
  modules: { finders: {
    filters: { withProps: (...props: string[]) => props },
    lookupModule: (props: string[]) => [optional(() => vendetta.metro.findByProps(...props))],
  } },
};
