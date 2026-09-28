/* SPDX-License-Identifier: GPL-3.0-or-later */
import { ACTIVITY_TYPES, TIMESTAMP_MODES, DEFAULTS, normalizeConfig, validateConfig } from './activity.js';

export function createSettings({ React, RN, storage, controller, openURL, getTheme }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;

  function Field({ label, value, onChange, placeholder, error, numeric, url, maxLength = 128, colors }) {
    return h(RN.View, { style: { marginBottom: 14 } },
      h(RN.Text, { style: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 } }, label),
      h(RN.TextInput, {
        accessibilityLabel: label, value: String(value ?? ''), onChangeText: onChange,
        placeholder: placeholder ?? '', placeholderTextColor: colors.muted, selectionColor: colors.accent,
        maxLength, keyboardType: numeric ? 'number-pad' : url ? 'url' : 'default',
        autoCapitalize: url || numeric ? 'none' : 'sentences', autoCorrect: !url && !numeric,
        style: { color: colors.text, backgroundColor: colors.input, borderWidth: 1, borderColor: error ? colors.error : colors.border,
          borderRadius: 9, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
      }),
      error ? h(RN.Text, { accessibilityRole: 'alert', style: { color: colors.error, marginTop: 5 } }, error) : null,
    );
  }

  function Section({ title, colors, children, initialOpen = false }) {
    const [open, setOpen] = React.useState(initialOpen);
    return h(RN.View, { style: { backgroundColor: colors.card, borderRadius: 12, marginTop: 14, overflow: 'hidden' } },
      h(Pressable, { accessibilityRole: 'button', accessibilityState: { expanded: open },
        onPress: () => setOpen(!open), style: { padding: 16, flexDirection: 'row', justifyContent: 'space-between' } },
        h(RN.Text, { style: { color: colors.text, fontWeight: '700', fontSize: 17 } }, title),
        h(RN.Text, { style: { color: colors.muted, fontSize: 17 } }, open ? '−' : '+')),
      open ? h(RN.View, { style: { paddingHorizontal: 16, paddingBottom: 8 } }, children) : null,
    );
  }

  function Choices({ options, value, onChange, colors }) {
    return h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 } },
      ...options.map(([id, text]) => h(Pressable, { key: String(id), accessibilityRole: 'radio',
        accessibilityState: { selected: value === id }, onPress: () => onChange(id),
        style: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, marginRight: 6, marginBottom: 8,
          backgroundColor: value === id ? colors.accent : colors.input } },
        h(RN.Text, { style: { color: value === id ? '#ffffff' : colors.text, fontWeight: '600' } }, text))),
    );
  }

  return function CustomRPCSettings() {
    const [draft, setDraft] = React.useState(() => normalizeConfig(storage.draft ?? storage.config));
    const [status, setStatus] = React.useState(controller.getStatus);
    const [errors, setErrors] = React.useState({});
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const theme = getTheme?.() ?? scheme;
    const dark = theme !== 'light';
    const colors = dark
      ? { bg: '#18191c', card: '#24262b', input: '#1b1d21', text: '#f3f4f6', muted: '#b4bac5', border: '#515660', accent: '#5865f2', error: '#ff9b9f' }
      : { bg: '#f2f3f5', card: '#ffffff', input: '#f5f6f8', text: '#1e2025', muted: '#626873', border: '#aeb4bf', accent: '#4752c4', error: '#ba2331' };
    React.useEffect(() => controller.subscribe(setStatus), []);

    function change(key, value) {
      setDraft(previous => {
        const next = { ...previous, [key]: value };
        storage.draft = next;
        return next;
      });
      setErrors(previous => ({ ...previous, [key]: undefined }));
    }
    const note = text => h(RN.Text, { style: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 } }, text);
    const field = (key, label, props = {}) => h(Field, { key, label, value: draft[key], onChange: value => change(key, value),
      error: errors[key], colors, ...props });
    const linkField = (key, label) => field(key, label, { url: true, maxLength: 512, placeholder: 'https://…' });
    const section = (title, children, initialOpen = false) => h(Section, { key: title, title, colors, initialOpen }, ...children);
    const action = (title, onPress, primary = false, disabled = false) => h(Pressable, {
      accessibilityRole: 'button', accessibilityState: { disabled }, disabled, onPress,
      style: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10, opacity: disabled ? 0.55 : 1,
        backgroundColor: primary ? colors.accent : colors.card, borderWidth: primary ? 0 : 1, borderColor: colors.border },
    }, h(RN.Text, { style: { color: primary ? '#ffffff' : colors.text, fontWeight: '700', fontSize: 16 } }, title));
    const dirty = JSON.stringify(normalizeConfig(draft)) !== JSON.stringify(normalizeConfig(storage.config));

    async function apply() {
      RN.Keyboard?.dismiss?.();
      const checked = validateConfig(draft);
      setErrors(checked.errors);
      if (!checked.valid) {
        RN.Alert.alert('Check your activity', Object.values(checked.errors).join('\n\n'));
        return;
      }
      await controller.apply(checked.config);
    }

    return h(RN.KeyboardAvoidingView, { style: { flex: 1, backgroundColor: colors.bg },
      behavior: RN.Platform?.OS === 'ios' ? 'padding' : undefined },
      h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 16, paddingBottom: 64 } },
        h(RN.Text, { style: { color: colors.text, fontSize: 25, fontWeight: '800', marginBottom: 6 } }, 'CustomRPC'),
        note('Set the activity shown on your Discord profile. Enter a name, choose a type, then tap Save & apply.'),
        h(RN.View, { style: { backgroundColor: colors.card, padding: 16, borderRadius: 12 } },
          h(RN.Text, { style: { color: status.running ? (dark ? '#85e0ad' : '#176d3e') : colors.muted, fontWeight: '700', marginBottom: 6 } },
            status.busy ? 'APPLYING…' : status.running ? 'ACTIVE' : 'STOPPED'),
          h(RN.Text, { accessibilityLiveRegion: 'polite', style: { color: colors.text, lineHeight: 20 } }, status.message),
          ...status.warnings.map((warning, i) => h(RN.Text, { key: i, style: { color: colors.error, marginTop: 8, lineHeight: 20 } }, warning)),
          dirty ? h(RN.Text, { style: { color: colors.muted, marginTop: 8 } }, 'Edits are saved as a draft. Tap Save & apply to publish them.') : null,
        ),
        action(status.busy ? 'Applying…' : 'Save & apply', apply, true, status.busy),
        action('Stop activity', () => controller.stop(), false, !status.running && !status.busy && !storage.enabled),
        section('Activity', [
          h(Choices, { key: 'type', options: ACTIVITY_TYPES, value: draft.type, onChange: value => change('type', value), colors }),
          field('appName', 'Application name', { placeholder: 'Your game or activity name' }),
          field('appID', 'Application ID (optional for text)', { placeholder: 'Discord application ID', numeric: true, maxLength: 21 }),
          note('For application images, create an application in the Discord Developer Portal and copy its Application ID.'),
          action('Open Developer Portal', () => openURL('https://discord.com/developers/applications')),
          field('details', 'Details · line 1'),
          field('state', 'State · line 2'),
          draft.type === 1 ? linkField('streamLink', 'Stream link · Twitch or YouTube') : null,
        ], true),
        section('Images', [
          note('Use an image key uploaded to your application or a direct image/GIF URL. Gallery links will not work. Animation depends on Discord’s activity renderer.'),
          field('imageBig', 'Large image URL or key', { url: true, maxLength: 2048 }),
          field('imageBigTooltip', 'Large image text'),
          linkField('imageBigURL', 'Large image click URL (optional)'),
          field('imageSmall', 'Small image URL or key', { url: true, maxLength: 2048 }),
          field('imageSmallTooltip', 'Small image text'),
          linkField('imageSmallURL', 'Small image click URL (optional)'),
        ]),
        section('Buttons', [
          note('Add up to two buttons. Each needs both a label and a link. Discord may hide these on your own profile; check from another account.'),
          field('buttonOneText', 'Button 1 text', { maxLength: 31 }), linkField('buttonOneURL', 'Button 1 URL'),
          field('buttonTwoText', 'Button 2 text', { maxLength: 31 }), linkField('buttonTwoURL', 'Button 2 URL'),
        ]),
        section('Timer', [
          h(Choices, { key: 'timestamp', options: TIMESTAMP_MODES, value: draft.timestampMode,
            onChange: value => change('timestampMode', value), colors }),
          draft.timestampMode === 'elapsed' ? note('The timer starts when the plugin loads. Applying edits or reconnecting does not reset it.') : null,
          draft.timestampMode === 'elapsed' ? action('Restart elapsed timer', () => controller.restartTimer(), false, status.busy) : null,
          draft.timestampMode === 'midnight' ? note('Starts at local midnight on the day the plugin loads. It keeps counting past 24 hours until the plugin reloads.') : null,
          draft.timestampMode === 'custom' ? note('Use Unix timestamps in milliseconds. Leave the end empty for an elapsed timer.') : null,
          draft.timestampMode === 'custom' ? field('startTime', 'Start timestamp (milliseconds)', { numeric: true, maxLength: 16 }) : null,
          draft.timestampMode === 'custom' ? field('endTime', 'End timestamp (milliseconds)', { numeric: true, maxLength: 16 }) : null,
          draft.timestampMode === 'custom' ? action('Set start to now', () => change('startTime', String(Date.now()))) : null,
        ]),
        section('Party & text links', [
          ...(draft.type === 0 ? [
            note('Leave both sizes empty to hide the party count.'),
            field('partySize', 'Current party size', { numeric: true, maxLength: 9 }),
            field('partyMaxSize', 'Maximum party size', { numeric: true, maxLength: 9 }),
          ] : [note('Party size is available for Playing activities.')]),
          linkField('detailsURL', 'Details click URL (optional)'), linkField('stateURL', 'State click URL (optional)'),
        ]),
        h(RN.View, { style: { marginTop: 18 } }, note('Keep activity sharing enabled and your status online. Android may stop the activity when Discord is closed or suspended. Avoid running another custom RPC plugin at the same time.')),
        action('Discard draft changes', () => {
          const saved = normalizeConfig(storage.config ?? DEFAULTS);
          storage.draft = saved; setDraft(saved); setErrors({});
        }, false, status.busy || !dirty),
        action(status.busy ? 'Applying…' : 'Save & apply', apply, true, status.busy),
        h(RN.Text, { style: { color: colors.muted, marginTop: 20, fontSize: 12, textAlign: 'center' } }, 'CustomRPC 1.1.0 · Adapted from Vencord · GPL-3.0-or-later'),
      ),
    );
  };
}
