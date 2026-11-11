/* SPDX-License-Identifier: GPL-3.0-or-later */
// Account groups and native settings controls adapted from Rosie's More Alts Settings.tsx.
// Source: https://code.is-your.app/SheWhoReignsSupreme/Valenced-Plugins/src/commit/19b5f3267c05e24c12c65c59c5bcdaf3e21dc104/plugins/more-alts/js/ui/Settings.tsx

function renderMoreAltsSettings({ V, view, setView, currentUser, accounts, query, setQuery,
    busy, error, notice, expiredAccountId, nativeReady, settings, setPreference,
    saveCurrent, addAccount, switchAccount, beginReauth, remove, importAccounts, nativeLoginHelp,
    input, text, colors }) {
    const { React, ReactNative: RN } = V.metro.common;
    const h = React.createElement;
    const { FormSection, FormRow, FormSwitchRow } = V.ui.components.Forms;
    const group = (title, ...rows) => h(RN.View, { key: title, style: { marginBottom: 16 } },
        h(FormSection, { title }, ...rows));
    const row = (label, onPress, props = {}) => h(FormRow, {
        key: label, label, accessibilityLabel: label, onPress,
        arrow: !!onPress, disabled: !!onPress && busy, ...props,
    });
    const preference = (label, subLabel, key) => h(FormSwitchRow, {
        key, label, subLabel, accessibilityLabel: label, disabled: busy,
        value: !!settings[key], onValueChange: value => { if (!busy) setPreference(key, value); },
    });
    const status = [
        error ? h(RN.View, { key: 'error', accessibilityRole: 'alert' }, text(error, { color: colors.error })) : null,
        notice ? h(RN.View, { key: 'notice', accessibilityLiveRegion: 'polite' }, text(notice)) : null,
        busy ? h(RN.ActivityIndicator, { key: 'busy', color: '#8993ff', accessibilityLabel: 'Updating accounts' }) : null,
    ];

    if (view === 'preferences') return [
        ...status,
        group('Account switching',
            row('Back to manage accounts', () => setView('accounts')),
            preference('Discord’s account switcher', nativeReady
                ? 'Show Discord’s own account menu. Reopen Discord settings after changing this.'
                : 'Availability depends on your Discord build.', 'enableNativeSwitcher'),
            preference('Refresh saved sessions', 'Update saved sign-ins when you use those accounts.', 'refreshSavedSessions')),
        group('Account help',
            row('Import accounts from old More Alts', importAccounts, { subLabel: 'Keep the original Apex plugin installed and disabled.' }),
            row('Help with Discord verification', nativeLoginHelp)),
    ];

    const currentId = currentUser?.id;
    const search = query.trim().toLowerCase();
    const matches = accounts.filter(account => `${account.username} ${account.displayName} ${account.id}`.toLowerCase().includes(search));
    function avatar(account) {
        if (!/^\d{17,20}$/.test(account?.id) || !/^[a-zA-Z0-9_]+$/.test(account?.avatar ?? '')) return undefined;
        return h(RN.Image, { accessible: false, style: { width: 36, height: 36, borderRadius: 18 },
            source: { uri: `https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.png?size=80` } });
    }
    const savedRows = matches.flatMap(account => {
        const current = currentId === account.id;
        const details = [`@${account.username}`];
        if (current) details.push('Current account');
        if (account.isNative) details.push('Signed in through Discord');
        if (Number.isFinite(account.updatedAt)) details.push(`Last saved: ${new Date(account.updatedAt).toLocaleString()}`);
        const switchAction = current ? undefined : () => switchAccount(account);
        return [
            row(account.displayName || account.username, switchAction, {
                key: account.id, icon: avatar(account), subLabel: details.join(' · '),
                accessibilityLabel: switchAction ? `Switch to @${account.username}` : `@${account.username}, current account`,
            }),
            expiredAccountId === account.id ? row('Re-sign in', () => beginReauth(account),
                { key: `${account.id}.reauth`, subLabel: `Refresh the saved session for @${account.username}.` }) : null,
            account.saved ? row('Remove saved account', () => remove(account), {
                key: `${account.id}.remove`, subLabel: `@${account.username}`,
                accessibilityLabel: `Remove saved account @${account.username}`,
            }) : null,
        ].filter(Boolean);
    });
    return [
        ...status,
        group('Current account',
            row(currentUser?.global_name || currentUser?.globalName || currentUser?.username || 'Discord is loading', undefined,
                { icon: avatar(currentUser), subLabel: currentUser?.username && `@${currentUser.username}` }),
            row('Back to account switcher', () => setView('switcher')),
            row('Save current account', saveCurrent, { disabled: busy || !currentId }),
            row('Add another account', addAccount),
            row('Account preferences', () => setView('preferences'))),
        h(RN.View, { key: 'search' }, input('Search saved accounts', query, setQuery, { placeholder: 'Username, display name or user ID' })),
        group(`Saved accounts (${accounts.length})`, ...(savedRows.length ? savedRows : [
            row(search ? 'No matching accounts' : 'No saved accounts', undefined,
                { subLabel: search ? undefined : 'Save your current account or add another account.' }),
        ])),
    ];
}
