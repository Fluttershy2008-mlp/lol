(() => {
  // Rainbow Dash colours; no global render patches or startup notifications.
  const palette = {
    base: '#102b40', input: '#10263a', raised: '#1c3b53', buttonText: '#072339',
    text: '#f0f9ff', heading: '#ffffff', secondary: '#d3e9f6', muted: '#a9c6d9',
    accent: '#6cd6f8', accentText: '#8ee5ff', icon: '#a5e7ff', link: '#8ee5ff',
    folder: '#719bb4', online: '#82d66c', idle: '#ffdf70', dnd: '#ff8793',
    mention: '#ffdf702b'
  };
  function mix(left, right, amount) {
    let value = '#';
    for (let i = 1; i < 7; i += 2) {
      const a = parseInt(left.slice(i, i + 2), 16);
      const b = parseInt(right.slice(i, i + 2), 16);
      value += Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
    }
    return value;
  }

  function alpha(color, opacity) {
    return color.slice(0, 7) + Math.round(opacity * 255).toString(16).padStart(2, '0');
  }

  function colorsFor(p) {
    const semantic = {};
    function set(value, names) {
      for (const name of names.split(' ')) semantic[name] = value;
    }

    set(p.base, 'BACKGROUND_PRIMARY BACKGROUND_MOBILE_PRIMARY BACKGROUND_BASE_LOWER CHAT_BACKGROUND CHANNEL_BACKGROUND_DEFAULT MOBILE_KEYBOARD_PANEL_BACKGROUND MOBILE_KEYBOARD_GAP_BACKGROUND MOBILE_VOICE_PANEL_BACKGROUND');
    set(p.input, 'BACKGROUND_SECONDARY BACKGROUND_SECONDARY_ALT BACKGROUND_TERTIARY BACKGROUND_MOBILE_SECONDARY BACKGROUND_BASE_LOWEST CHANNELTEXTAREA_BACKGROUND INPUT_BACKGROUND INPUT_BACKGROUND_DEFAULT CHAT_INPUT_BACKGROUND MOBILE_CHATINPUT_BACKGROUND_DEFAULT MOBILE_CHATINPUT_BACKGROUND_ACTIVE MOBILE_COMMAND_BAR_BACKGROUND MOBILE_COMMAND_CATEGORIES_BACKGROUND MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT MOBILE_FLOATINGBAR_BACKGROUND');
    set(p.raised, 'BACKGROUND_BASE_LOW BACKGROUND_SURFACE_HIGH BACKGROUND_FLOATING BACKGROUND_NESTED_FLOATING BACKGROUND_ACCENT BACKGROUND_CODE CARD_PRIMARY_BG CARD_SECONDARY_BG CARD_BACKGROUND_DEFAULT CARD_SECONDARY_BACKGROUND_DEFAULT MOBILE_ACTIONSHEET_BACKGROUND MOBILE_ACTIONSHEET_GRADIENT_BACKGROUND_DEFAULT MOBILE_ALERT_BACKGROUND_DEFAULT MOBILE_EXPRESSION_PICKER_BACKGROUND_DEFAULT MOBILE_EMBED_BACKGROUND_DEFAULT MOBILE_THREAD_EMBED_BACKGROUND MOBILE_TOAST_BACKGROUND_DEFAULT MOBILE_FLOATING_ACCESSORY_BACKGROUND MOBILE_FLOATINGBAR_BACKGROUND_HIGHER MOBILE_TYPING_INDICATOR_BACKGROUND_DEFAULT');
    set(mix(p.raised, p.heading, 0.06), 'BACKGROUND_SURFACE_HIGHER BACKGROUND_SURFACE_HIGHEST CARD_PRIMARY_PRESSED_BG CARD_SECONDARY_PRESSED_BG CARD_SECONDARY_BACKGROUND_ACTIVE');
    set(p.text, 'TEXT_DEFAULT TEXT_NORMAL TEXT_PRIMARY INPUT_TEXT_DEFAULT');
    set(p.heading, 'TEXT_STRONG TEXT_BRIGHT HEADER_PRIMARY MOBILE_TEXT_HEADING_PRIMARY');
    set(p.secondary, 'TEXT_SECONDARY HEADER_SECONDARY INTERACTIVE_NORMAL INTERACTIVE_TEXT_DEFAULT');
    set(p.muted, 'TEXT_MUTED TEXT_SUBTLE TEXT_TERTIARY CHANNELS_DEFAULT CHANNEL_TEXT_AREA_PLACEHOLDER INPUT_PLACEHOLDER_TEXT_DEFAULT INPUT_PLACEHOLDER_TEXT ICON_SUBTLE INTERACTIVE_TEXT_MUTED');
    set(p.icon, 'ICON_DEFAULT ICON_PRIMARY ICON_STRONG ICON_SECONDARY INTERACTIVE_ICON_DEFAULT INTERACTIVE_ICON_HOVER INTERACTIVE_ICON_ACTIVE INTERACTIVE_HOVER INTERACTIVE_ACTIVE INTERACTIVE_TEXT_HOVER INTERACTIVE_TEXT_ACTIVE CHANNEL_ICON MOBILE_GUILDBAR_ICON_DEFAULT MOBILE_HEADER_ICON_DEFAULT CHAT_INPUT_ICON_DEFAULT_TINT CHAT_INPUT_ACTION_BUTTON_ICON_DEFAULT_TINT CHAT_INPUT_ACTION_ICON_ACTIVE_TINT');
    set(p.folder, 'ICON_MUTED ICON_TERTIARY INTERACTIVE_MUTED INTERACTIVE_ICON_MUTED ICON_STATUS_OFFLINE TEXT_STATUS_OFFLINE STATUS_OFFLINE');
    set(p.accent, 'BACKGROUND_BRAND ICON_BRAND BUTTON_PRIMARY_BACKGROUND BUTTON_FILLED_BRAND_BACKGROUND CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND INTERACTIVE_ACCENT_BACKGROUND_DEFAULT INTERACTIVE_ACCENT_BACKGROUND_ACTIVE INTERACTIVE_ACCENT_BACKGROUND_SELECTED INPUT_BORDER_ACTIVE INPUT_FOCUSED_BORDER BORDER_FOCUS');
    set(mix(p.accent, p.heading, 0.12), 'BUTTON_PRIMARY_BACKGROUND_HOVER BUTTON_FILLED_BRAND_BACKGROUND_HOVER');
    set(mix(p.accent, p.input, 0.12), 'BUTTON_PRIMARY_BACKGROUND_ACTIVE');
    set(p.buttonText, 'BUTTON_PRIMARY_TEXT BUTTON_FILLED_BRAND_TEXT CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT TEXT_ON_BRAND');
    set(p.accentText, 'TEXT_BRAND BUTTON_OUTLINE_BRAND_TEXT BUTTON_OUTLINE_BRAND_BORDER');
    set(p.link, 'TEXT_LINK TEXT_LINK_LOW_SATURATION TEXT_FEEDBACK_INFO ICON_FEEDBACK_INFO');
    set(p.online, 'STATUS_POSITIVE STATUS_POSITIVE_BACKGROUND TEXT_POSITIVE ICON_STATUS_ONLINE TEXT_STATUS_ONLINE ICON_VOICE_CONNECTED ICON_VOICE_SPEAKING TEXT_VOICE_CONNECTED TEXT_VOICE_SPEAKING');
    set(p.idle, 'STATUS_WARNING STATUS_WARNING_BACKGROUND TEXT_WARNING ICON_STATUS_IDLE TEXT_STATUS_IDLE');
    set(p.dnd, 'ICON_STATUS_DND TEXT_STATUS_DND');
    set(p.input, 'STATUS_POSITIVE_TEXT STATUS_WARNING_TEXT');
    set(p.mention, 'BACKGROUND_MENTIONED');
    set(alpha(p.idle, 0.27), 'BACKGROUND_MENTIONED_HOVER');
    set(alpha(p.icon, 0.04), 'BACKGROUND_MODIFIER_HOVER BACKGROUND_MESSAGE_HOVER BACKGROUND_MOD_SUBTLE');
    set(alpha(p.icon, 0.08), 'BACKGROUND_MODIFIER_ACTIVE BACKGROUND_MOD_MUTED INTERACTIVE_BACKGROUND_HOVER');
    set(alpha(p.accent, 0.18), 'BACKGROUND_MODIFIER_SELECTED BACKGROUND_MOD_NORMAL INTERACTIVE_BACKGROUND_SELECTED MOBILE_CHANNEL_ITEM_BACKGROUND_SELECTED');
    set(alpha(p.accent, 0.24), 'BACKGROUND_MOD_STRONG INTERACTIVE_BACKGROUND_ACTIVE');
    set(alpha(p.icon, 0.12), 'BACKGROUND_MODIFIER_ACCENT BORDER_FAINT BORDER_MUTED MOBILE_HEADER_BORDER MOBILE_COMMAND_BAR_DIVIDER');
    set(alpha(p.icon, 0.18), 'BORDER_SUBTLE BORDER_NORMAL INPUT_BORDER_DEFAULT MOBILE_CHATINPUT_BORDER_DEFAULT CHAT_BORDER CARD_BORDER_DEFAULT');
    set(alpha(p.icon, 0.3), 'BORDER_STRONG');

    set(p.dnd, 'STATUS_DANGER TEXT_DANGER STATUS_DANGER_BACKGROUND ICON_FEEDBACK_CRITICAL');
    set(p.input, 'STATUS_DANGER_TEXT');
    set(p.idle, 'MENTION_FOREGROUND');
    set(p.mention, 'MENTION_BACKGROUND');
    set(p.base, 'HOME_BACKGROUND BG_BASE_PRIMARY');
    set(p.input, 'BG_BASE_SECONDARY PANEL_BG KEYBOARD');
    set(p.raised, 'BG_BASE_TERTIARY BG_SURFACE_RAISED BG_SURFACE_OVERLAY BG_SURFACE_OVERLAY_TMP EMBED_BACKGROUND');
    set(p.accent, 'REDESIGN_BUTTON_PRIMARY_BACKGROUND');
    set(mix(p.accent, p.input, 0.15), 'REDESIGN_BUTTON_PRIMARY_PRESSED_BACKGROUND');
    set(p.buttonText, 'REDESIGN_BUTTON_PRIMARY_TEXT');
    set(p.raised, 'REDESIGN_BUTTON_SECONDARY_BACKGROUND REDESIGN_BUTTON_SECONDARY_ALT_BACKGROUND');
    set(p.dnd, 'REDESIGN_BUTTON_DANGER_BACKGROUND');
    set(p.muted, 'REDESIGN_CHANNEL_CATEGORY_NAME_TEXT');
    set(p.secondary, 'REDESIGN_CHANNEL_NAME_TEXT');
    set(p.accent, 'SCROLLBAR_THIN_THUMB');
    set(alpha(p.accent, 0.6), 'SCROLLBAR_AUTO_THUMB');
    set('#00000000', 'SCROLLBAR_THIN_TRACK SCROLLBAR_AUTO_TRACK');
    const raw = { BRAND_500: p.accent, WHITE_500: p.text, BLACK_500: p.input };
    const stops = [[1, p.heading], [8, p.text], [20, p.secondary], [40, p.muted],
      [60, p.folder], [70, p.raised], [80, p.base], [90, p.input], [100, mix(p.input, '#000000', 0.5)]];
    for (let i = 1; i <= 100; i++) {
      const next = stops.findIndex(stop => stop[0] >= i);
      const right = stops[next];
      const left = stops[Math.max(0, next - 1)];
      raw['NEUTRAL_' + i] = mix(left[1], right[1], left[0] === right[0] ? 0 : (i - left[0]) / (right[0] - left[0]));
    }
    for (const shade of [100, 130, 160, 200, 230, 260, 300, 330, 345, 360, 400, 430, 460, 500, 530, 560, 600, 630, 645, 660, 700, 730, 760, 800, 830, 860, 900]) {
      raw['PRIMARY_' + shade] = raw['NEUTRAL_' + Math.round(shade / 10)];
      raw['BRAND_' + shade] = shade <= 500
        ? mix(p.heading, p.accent, (shade - 100) / 400)
        : mix(p.accent, p.input, (shade - 500) / 500);
    }
    for (const percent of [1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96]) {
      raw['OPACITY_' + percent] = alpha(p.icon, percent / 100);
      raw['OPACITY_BLURPLE_' + percent] = alpha(p.accent, percent / 100);
    }

    const rainbow = { RED: '#ef5966', ORANGE: '#ff9f50', YELLOW: '#ffdf70',
      GREEN: '#82d66c', BLUE: '#6cd6f8', PURPLE: '#bc9cff' };
    for (const [name, hue] of Object.entries(rainbow)) {
      for (const shade of [100, 130, 160, 200, 230, 260, 300, 330, 345, 360, 400, 430, 460, 500, 530, 560, 600, 630, 660, 700, 730, 800, 900]) {
        raw[name + '_' + shade] = shade <= 400 ? mix(p.heading, hue, shade / 400)
          : mix(hue, p.input, (shade - 400) / 600);
      }
    }
    for (let i = 1; i <= 25; i++) raw['PLUM_' + i] = raw['NEUTRAL_' + Math.min(100, i * 4)];
    raw.GUILD_BOOSTING_PINK = '#f6a3d4';
    raw.GUILD_BOOSTING_PURPLE = '#bc9cff';
    raw.GUILD_BOOSTING_PURPLE_FOR_GRADIENTS = '#bc9cff';
    raw.ROLE_DEFAULT = p.secondary;
    raw.WHITE = '#ffffff';
    // Keep the dark palette readable even if Discord's base was Light or Onyx.
    return { semantic: { dark: { ...semantic }, darker: { ...semantic }, light: { ...semantic }, midnight: { ...semantic } }, raw };
  }


  const colors = colorsFor(palette);
  const background = {
    path: 'assets/backgrounds/rainbow-dash-collage.jpg',
    opacity: 1, blur: 0, dimming: 0.68
  };
  function families(sporty) {
    const result = {};
    const styles = { Normal: ['Regular', 400], Medium: ['Medium', 500],
      Semibold: ['SemiBold', 600], Bold: ['Bold', 700], ExtraBold: ['ExtraBold', 800] };
    for (const prefix of ['ggsans-', 'ABCGintoNormal-', 'ABCGintoNord-', 'Ginto-']) {
      for (const [style, [file, weight]] of Object.entries(styles)) {
        const heading = prefix !== 'ggsans-' && sporty;
        result[prefix + style] = [{
          path: 'assets/fonts/Barlow-' + (heading ? 'BoldItalic' : file) + '.ttf',
          weight: heading ? 700 : weight
        }];
      }
    }
    return result;
  }
  return { default: { preInit({ themes }) {
    // Preserve the previously installed Rainbow Dash theme's selection IDs.
    themes.registerGroup('fluttershy', { name: "Fluttershy's Themes" });
    themes.registerTheme('fluttershy', 'rainbow-dash-theme', {
      name: 'Rainbow Dash · Sonic Collage',
      description: 'Your Rainbow Dash collage, cyan accents, navy panels and rainbow details.',
      background, getColors: () => colors
    });
    themes.registerTheme('fluttershy', 'rainbow-dash-clear', {
      name: 'Rainbow Dash · Clear Chat',
      description: 'The same collage and colours with a darker wallpaper for busy chats.',
      background: { ...background, dimming: 0.84 }, getColors: () => colors
    });
    themes.registerFontPack('fluttershy', 'rainbow-dash-sonic', {
      name: 'Rainbow Dash · Sonic',
      description: 'Sporty Barlow body text with bold italic display headings. Fonts bundled offline.',
      families: families(true)
    });
    themes.registerFontPack('fluttershy', 'rainbow-dash-clear', {
      name: 'Rainbow Dash · Clear',
      description: 'Upright Barlow in five weights for a calmer reading option.',
      families: families(false)
    });
  } } };
})()
