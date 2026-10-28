'use strict';

function installSettingsSection(world) {
    const native = world.U.discord.modules.settings;
    const core = ['Valenced', 'ValencedPlugins', 'ValencedThemes', 'ValencedDeveloper'];
    const section = { label: 'Valenced', settings: [...core] };
    const other = { label: 'Another section', settings: ['OtherSetting'] };
    const sections = { VALENCED: section, OTHER: other };
    native.addSettingsItemToSection = (key, item, index = -1) => {
        const target = sections[key];
        if (!target) throw new Error('Section does not exist: ' + key);
        if (!world.registeredScreens.has(item)) throw new Error('Register a renderer before showing its row');
        const position = index < 0 ? target.settings.length + index + 1 : index;
        target.settings.splice(position, 0, item);
        return () => { const at = target.settings.indexOf(item); if (at >= 0) target.settings.splice(at, 1); };
    };
    return { native, section, other, core, sections };
}
module.exports = { installSettingsSection };
