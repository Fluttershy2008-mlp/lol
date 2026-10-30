/* SPDX-License-Identifier: GPL-3.0-or-later */
import { validId } from './core.mjs';

export function createAccountSwitcher(React, RN) {
    const h = React.createElement;
    return function AccountSwitcher({ accounts, currentUser, busy, light, error, notice, expiredAccountId,
        onSwitch, onSaveCurrent, onAddAccount, onManage, onReauth }) {
        const c = light
            ? { card: '#ffffff', text: '#18191c', muted: '#515460', line: '#d7dae3', selected: '#e9ecff', danger: '#a11932' }
            : { card: '#2c2e36', text: '#f3f4f7', muted: '#bec0cb', line: '#454853', selected: '#31364d', danger: '#ffb0b9' };
        const text = (value, style = {}, props = {}) => h(RN.Text,
            { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...props }, value);
        const currentId = currentUser?.id;
        const savedCurrent = accounts.some(account => account.id === currentId);
        const rows = [...accounts];
        if (validId(currentId) && !savedCurrent && typeof currentUser.username === 'string') rows.unshift({
            id: currentId, username: currentUser.username,
            displayName: currentUser.global_name || currentUser.globalName || currentUser.username,
            avatar: currentUser.avatar,
        });
        rows.sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : 0));
        const action = (title, onPress, primary = false, disabled = false) => h(RN.TouchableOpacity, {
            accessibilityRole: 'button', accessibilityLabel: title, onPress, disabled: busy || disabled,
            accessibilityState: { disabled: busy || disabled },
            style: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, marginTop: 12, borderRadius: 10,
                backgroundColor: primary ? '#4d59cd' : c.card, opacity: busy || disabled ? 0.5 : 1 },
        }, text(title, { color: primary ? '#ffffff' : c.text, fontWeight: '700', textAlign: 'center' }));
        return h(RN.View, { testID: 'more-alts-account-switcher' },
            text('Switch accounts', { fontSize: 26, fontWeight: '800', lineHeight: 32, marginBottom: 8 }),
            text('Choose the account you want to use.', { color: c.muted, marginBottom: 20 }),
            error ? text(error, { color: c.danger, marginBottom: 12 }, { accessibilityRole: 'alert' }) : null,
            notice ? text(notice, { marginBottom: 12 }, { accessibilityLiveRegion: 'polite' }) : null,
            busy ? h(RN.ActivityIndicator, { color: '#8993ff', accessibilityLabel: 'Updating accounts', style: { marginBottom: 12 } }) : null,
            rows.length ? h(RN.View, { style: { backgroundColor: c.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.line } },
                ...rows.map((account, index) => {
                    const selected = currentId === account.id;
                    const expired = expiredAccountId === account.id;
                    const label = selected ? `@${account.username}, current account` : `Switch to @${account.username}`;
                    const avatar = validId(account.id) && typeof account.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(account.avatar);
                    return h(RN.View, { key: account.id, style: { borderTopWidth: index ? 1 : 0, borderTopColor: c.line } },
                        h(RN.TouchableOpacity, {
                            testID: `more-alts-account-${account.id}`, accessibilityRole: 'button', accessibilityLabel: label,
                            accessibilityState: { selected, disabled: busy || selected }, disabled: busy || selected,
                            onPress: () => onSwitch(account),
                            style: { flexDirection: 'row', alignItems: 'center', minHeight: 76, padding: 14,
                                backgroundColor: selected ? c.selected : c.card, opacity: busy ? 0.6 : 1 },
                        },
                        avatar ? h(RN.Image, { accessible: false, source: { uri: `https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.png?size=128` },
                            style: { width: 40, height: 40, borderRadius: 20, marginRight: 12 } })
                            : h(RN.View, { accessible: false, style: { width: 40, height: 40, borderRadius: 20, marginRight: 12,
                                backgroundColor: '#4d59cd', alignItems: 'center', justifyContent: 'center' } },
                                text((account.displayName || account.username || '?').slice(0, 1).toUpperCase(), { color: '#ffffff', fontSize: 19, fontWeight: '700' })),
                        h(RN.View, { style: { flex: 1, minWidth: 0, paddingRight: 12 } },
                            text(account.displayName || account.username, { fontWeight: '700', fontSize: 16 }, { numberOfLines: 1 }),
                            text(`@${account.username}`, { color: c.muted, fontSize: 13, lineHeight: 19 }, { numberOfLines: 1 }),
                            selected ? text(savedCurrent ? 'Current account' : 'Current account · Not saved', { color: c.muted, fontSize: 12, lineHeight: 18 }) : null,
                            expired ? text('Sign in again to refresh this account', { color: c.danger, fontSize: 12, lineHeight: 18 }) : null),
                        selected ? text('✓', { color: light ? '#197b4d' : '#66d6a0', fontSize: 24, fontWeight: '700' }, { accessible: false }) : null),
                        expired ? h(RN.View, { style: { paddingHorizontal: 14, paddingBottom: 14 } },
                            action('Re-sign in', () => onReauth(account))) : null);
                })) : text('Save your current account or add an account to get started.', { color: c.muted, marginBottom: 12 }),
            action('Add another account', onAddAccount, true),
            action('Save current account', onSaveCurrent, false, !validId(currentId)),
            action('Manage accounts', onManage),
            text(`${accounts.length} saved account${accounts.length === 1 ? '' : 's'} · More Alts!`, { color: c.muted, fontSize: 12, marginTop: 16, textAlign: 'center' }));
    };
}
