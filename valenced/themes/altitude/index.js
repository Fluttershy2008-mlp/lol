(() => {
  const upstream = 'https://raw.githubusercontent.com/myumichi/altitude/f3c94dc11da9b60ee988d811aedd5a785c50a32c/';
  const variants = [
    {
      id: 'high',
      name: 'High Altitude',
      image: 'IMG_20240211_225656_(1200_x_2560_pixel).jpg',
      palette: {
        base: '#31364a', input: '#2a2e42', raised: '#3c425b', buttonText: '#2a2e42',
        text: '#e9dac5', heading: '#ffebce', secondary: '#cccedf', muted: '#99a1be',
        accent: '#c0a381', accentText: '#c3a47a', icon: '#f1d8b7', link: '#afc9ff',
        folder: '#55586e', online: '#ccd6df', idle: '#efb076', dnd: '#696d80',
        mention: '#f1a05633'
      }
    },
    {
      id: 'low',
      name: 'Low Altitude',
      image: 'IMG_20240211_003054_(1200_x_2560_pixel).png',
      palette: {
        base: '#404d59', input: '#35424f', raised: '#51606c', buttonText: '#2a323a',
        text: '#e9dac5', heading: '#ffebce', secondary: '#ccd6df', muted: '#99adbe',
        accent: '#c0a381', accentText: '#c3a47a', icon: '#f1d8b7', link: '#afd9ff',
        folder: '#55626e', online: '#ccd6df', idle: '#efb076', dnd: '#696d80',
        mention: '#f1a05633'
      }
    }
  ];

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
    set(alpha('#f1a056', 0.27), 'BACKGROUND_MENTIONED_HOVER');
    set(alpha(p.icon, 0.04), 'BACKGROUND_MODIFIER_HOVER BACKGROUND_MESSAGE_HOVER BACKGROUND_MOD_SUBTLE');
    set(alpha(p.icon, 0.08), 'BACKGROUND_MODIFIER_ACTIVE BACKGROUND_MOD_MUTED INTERACTIVE_BACKGROUND_HOVER');
    set(alpha(p.accent, 0.18), 'BACKGROUND_MODIFIER_SELECTED BACKGROUND_MOD_NORMAL INTERACTIVE_BACKGROUND_SELECTED MOBILE_CHANNEL_ITEM_BACKGROUND_SELECTED');
    set(alpha(p.accent, 0.24), 'BACKGROUND_MOD_STRONG INTERACTIVE_BACKGROUND_ACTIVE');
    set(alpha(p.icon, 0.12), 'BACKGROUND_MODIFIER_ACCENT BORDER_FAINT BORDER_MUTED MOBILE_HEADER_BORDER MOBILE_COMMAND_BAR_DIVIDER');
    set(alpha(p.icon, 0.18), 'BORDER_SUBTLE BORDER_NORMAL INPUT_BORDER_DEFAULT MOBILE_CHATINPUT_BORDER_DEFAULT CHAT_BORDER CARD_BORDER_DEFAULT');
    set(alpha(p.icon, 0.3), 'BORDER_STRONG');

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

    // Keep the dark palette readable even if Discord's base was Light or Onyx.
    return { semantic: { dark: { ...semantic }, darker: { ...semantic }, light: { ...semantic }, midnight: { ...semantic } }, raw };
  }

  const definitions = variants.map(variant => {
    const colors = colorsFor(variant.palette);
    return [variant.id, {
      name: variant.name,
      description: 'Original Altitude palette and background by nyraki.',
      getColors: () => colors,
      background: {
        path: upstream + 'backgrounds/' + variant.image,
        opacity: 1,
        blur: 0,
        dimming: 95 / 255
      }
    }];
  });

  const fontFiles = {
    Normal: ['LexendDeca-Regular.ttf', 400],
    Medium: ['LexendDeca-Regular.ttf', 400],
    Semibold: ['LexendDeca-SemiBold.ttf', 600],
    Bold: ['LexendDeca-Bold.ttf', 700],
    ExtraBold: ['LexendDeca-Bold.ttf', 700]
  };
  const families = {};
  for (const style of Object.keys(fontFiles)) {
    const [file, weight] = fontFiles[style];
    families['ggsans-' + style] = [{ path: 'assets/fonts/' + file, weight }];
  }

  return {
    default: {
      preInit({ themes }) {
        themes.registerGroup('altitude', { name: 'Altitude', description: 'By nyraki · Valenced port by fluttershy_simper67' });
        for (const [id, definition] of definitions) themes.registerTheme('altitude', id, definition);
        themes.registerFontPack('altitude', 'lexend-deca', {
          name: 'Altitude · Lexend Deca',
          description: 'The original Altitude body font, bundled for use after a reload.',
          families
        });
      }
    }
  };
})()
