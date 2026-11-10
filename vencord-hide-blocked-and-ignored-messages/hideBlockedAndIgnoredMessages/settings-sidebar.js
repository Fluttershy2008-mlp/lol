// SPDX-License-Identifier: GPL-3.0-or-later
export function registerSettingsSidebar(host, Component, Icon) {
    let entries, entry;
    if (Array.isArray(host.customEntries)) {
        entries = host.customEntries;
        entry = { key: 'vencord_hidden_users_servers', title: 'Hidden users & servers', Component, Icon };
    } else if (Array.isArray(host.customSections)) {
        entries = host.customSections;
        entry = () => ({ section: 'Hidden users & servers', label: 'Hidden users & servers', element: Component });
    } else {
        throw new Error('This Vencord build does not expose custom settings sections.');
    }
    entries.push(entry);
    return () => {
        const index = entries.indexOf(entry);
        if (index !== -1) entries.splice(index, 1);
    };
}
