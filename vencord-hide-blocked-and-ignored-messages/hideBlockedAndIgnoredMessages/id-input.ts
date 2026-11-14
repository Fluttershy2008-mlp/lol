// SPDX-License-Identifier: GPL-3.0-or-later
export function parseIds(value: string, mentions = false) {
    const tokens = value.trim().split(/[\s,;]+/).filter(Boolean);
    const ids: string[] = [];
    const seen = new Set<string>();
    const invalid: string[] = [];
    for (const token of tokens) {
        const id = mentions ? token.replace(/^<@!?([0-9]+)>$/, "$1") : token;
        if (!/^[0-9]{17,20}$/.test(id)) invalid.push(token);
        else if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
    return { ids, invalid, value: ids.join("\n") };
}

export function validIds(value: string, mentions = false) {
    return !parseIds(value, mentions).invalid.length
        || "Use 17–20 digit Discord IDs, separated by spaces, commas or new lines.";
}
