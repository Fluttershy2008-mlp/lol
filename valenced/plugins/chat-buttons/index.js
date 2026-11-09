(() => {
  // Chat Buttons by mlemception; local compatibility changes. See LICENSE and NOTICE.txt.
  var runtime;
  function load(valenced) {
    if (!runtime) runtime = (() => {
      var module = {
        exports: {}
      };
      var exports = module.exports;
      var __defProp = Object.defineProperty;
      var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
      var __getOwnPropNames = Object.getOwnPropertyNames;
      var __hasOwnProp = Object.prototype.hasOwnProperty;
      var __export = (target2, all) => {
        for (var name in all) __defProp(target2, name, {
          get: all[name],
          enumerable: true
        });
      };
      var __copyProps = (to, from, except, desc) => {
        if (from && typeof from === "object" || typeof from === "function") {
          var _loop = function (key) {
            if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
              get: () => from[key],
              enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
            });
          };
          for (var key of __getOwnPropNames(from)) {
            _loop(key);
          }
        }
        return to;
      };
      var __toCommonJS = mod => __copyProps(__defProp({}, "__esModule", {
        value: true
      }), mod);

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/index.ts
      var index_exports = {};
      __export(index_exports, {
        default: () => index_default,
        target: () => target
      });
      module.exports = __toCommonJS(index_exports);

      // valenced-api:@valenced/discord/utils/modules/finders
      var getModuleWithImportedPath = valenced.discord.utils.modules.finders.getModuleWithImportedPath;

      // valenced-api:@valenced/patcher
      var after = valenced.patcher.after;
      var instead = valenced.patcher.instead;
      var HookPriority = valenced.patcher.HookPriority;

      // valenced-api:@valenced/react/jsx-runtime
      var afterJSX = valenced.react.jsxRuntime.afterJSX;

      // valenced-api:react
      var createElement = valenced.react.React.createElement;
      var createContext = valenced.react.React.createContext;
      var cloneElement = valenced.react.React.cloneElement;
      var isValidElement = valenced.react.React.isValidElement;
      var Children = valenced.react.React.Children;
      var useContext = valenced.react.React.useContext;
      var useLayoutEffect = valenced.react.React.useLayoutEffect;
      var useEffect = valenced.react.React.useEffect;
      var useRef = valenced.react.React.useRef;
      var useState = valenced.react.React.useState;
      var useSyncExternalStore = valenced.react.React.useSyncExternalStore;

      // valenced-api:@valenced/discord/design
      var Design = valenced.discord.design.Design;

      // valenced-api:react-native
      var Animated = valenced.react.ReactNative.Animated;
      var BackHandler = valenced.react.ReactNative.BackHandler;
      var Easing = valenced.react.ReactNative.Easing;
      var Pressable = valenced.react.ReactNative.Pressable;
      var ScrollView = valenced.react.ReactNative.ScrollView;
      var StatusBar = valenced.react.ReactNative.StatusBar;
      var StyleSheet = valenced.react.ReactNative.StyleSheet;
      var useWindowDimensions = valenced.react.ReactNative.useWindowDimensions;
      var View = valenced.react.ReactNative.View;
      var Image = valenced.react.ReactNative.Image;

      // valenced-api:@valenced/assets
      var getAssetIdByName = valenced.assets.getAssetIdByName;

      // valenced-api:@valenced/discord/common/tokens
      var Tokens = valenced.discord.common.tokens.Tokens;

      // valenced-api:react/jsx-runtime
      var jsx = valenced.react.ReactJSXRuntime.jsx;
      var jsxs = valenced.react.ReactJSXRuntime.jsxs;
      var Fragment = valenced.react.ReactJSXRuntime.Fragment;

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/icons.tsx
      var asset = name => ({
        style
      }) => /* @__PURE__ */jsx(Image, {
        source: getAssetIdByName(name),
        style: [{
          width: 24,
          height: 24
        }, style]
      });
      var MenuIcon = asset("GridSquareIcon");
      var EmojiIcon = asset("ReactionIcon");
      var HiddenSettingsIcon = asset("WrenchIcon");
      var EditIcon = asset("PencilIcon");
      var MoreIcon = asset("MoreHorizontalIcon");
      var box = {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center"
      };
      var tints = /* @__PURE__ */new WeakMap();
      function tint(Icon) {
        var Tinted = tints.get(Icon);
        if (!Tinted) {
          Tinted = () => {
            var t = Tokens.default ?? Tokens;
            var tintColor = Design.useToken(t.colors.INTERACTIVE_ICON_DEFAULT);
            return /* @__PURE__ */jsx(View, {
              pointerEvents: "none",
              style: box,
              children: /* @__PURE__ */jsx(Icon, {
                style: {
                  width: 20,
                  height: 20,
                  tintColor
                }
              })
            });
          };
          tints.set(Icon, Tinted);
        }
        return Tinted;
      }

      // valenced-api:@valenced/discord/actions
      var ActionSheetActionCreators = valenced.discord.actions.ActionSheetActionCreators;
      var AlertActionCreators = valenced.discord.actions.AlertActionCreators;

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/store.ts
      var defaults = {
        names: {},
        kept: {},
        seen: {}
      };
      var storage;
      var setStorage = v => {
        storage = v;
      };
      var active = false;
      var activity = /* @__PURE__ */new Set();
      var isActive = () => active;
      function setActive(value) {
        active = value;
        for (var notify of activity) notify();
      }
      var subscribeActivity = notify => {
        activity.add(notify);
        return () => {
          activity.delete(notify);
        };
      };
      var useActive = () => useSyncExternalStore(subscribeActivity, isActive, isActive);
      var icons = /* @__PURE__ */new Map();
      var iconFor = id => icons.get(id);
      function note({
        id,
        label,
        Icon
      }) {
        if (Icon) icons.set(id, Icon);
        if (active && storage?.cache?.seen?.[id] !== label) storage?.set({
          seen: {
            [id]: label
          }
        });
      }
      function createBar() {
        var refs = /* @__PURE__ */new Set();
        var subs = /* @__PURE__ */new Set();
        var version = 0;
        var bump = () => {
          version++;
          for (var sub of subs) sub();
        };
        return {
          add(ref) {
            refs.add(ref);
            note(ref.current);
            bump();
            return () => {
              refs.delete(ref);
              bump();
            };
          },
          touch(entry) {
            note(entry);
            bump();
          },
          list: () => [...refs].map(x => x.current),
          subscribe(sub) {
            subs.add(sub);
            return () => {
              subs.delete(sub);
            };
          },
          version: () => version
        };
      }
      var never = () => () => {};
      var zero = () => 0;
      function useLive(bar) {
        useSyncExternalStore(bar?.subscribe ?? never, bar?.version ?? zero);
        return bar?.list() ?? [];
      }
      function inOrder(list, s) {
        var order = Object.keys(s?.seen ?? {});
        var at = x => {
          var i = order.indexOf(x.id);
          return i === -1 ? order.length : i;
        };
        return [...list].sort((a, b) => at(a) - at(b));
      }

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/hidden-settings.tsx
      var hiddenSettingsId = "dev.fluttershy2008.hide-blocked-and-ignored-messages";
      var hiddenSettingsLabel = "Hidden users & servers";
      var host;
      var cancelReady;
      var setSettingsHost = api => {
        cancelReady?.();
        cancelReady = void 0;
        host = api;
      };
      var optional = read => {
        try {
          return read();
        } catch {}
      };
      function rootNavigation(api) {
        var U = api?.unscoped;
        var direct = optional(() => U.discord.modules.mainTabsV2.RootNavigationRef.getRootNavigationRef());
        if (typeof direct?.navigate === "function") return direct;
        var paths = U?.discord?.utils?.modules?.finders;
        var imported = optional(() => paths.lookupModuleWithImportedPath("modules/main_tabs_v2/RootNavigationRef.native.tsx")[0]);
        var fromPath = optional(() => (imported?.default ?? imported)?.getRootNavigationRef?.());
        if (typeof fromPath?.navigate === "function") return fromPath;
        var finders = U?.modules?.finders;
        var found = optional(() => finders.lookupModule(finders.filters.withProps("getRootNavigationRef"), {
          initialize: false
        })[0]);
        return optional(() => (found?.default ?? found)?.getRootNavigationRef?.());
      }
      function openHiddenSettings() {
        if (!isActive() || !host) return;
        var api = host;
        var settings = optional(() => api.pluginSettings);
        try {
          if (typeof settings?.openPluginSettings === "function" && (typeof settings.hasPluginSettings !== "function" || settings.hasPluginSettings(hiddenSettingsId))) {
            settings.openPluginSettings(hiddenSettingsId);
            return;
          }
        } catch {}
        try {
          var navigation = rootNavigation(api);
          if (typeof navigation?.navigate === "function") {
            var open = () => {
              if (host === api && isActive()) navigation.navigate(hiddenSettingsId);
            };
            if (navigation.isReady?.() === false) {
              if (typeof navigation.addListener !== "function") throw Error("Navigation is not ready");
              if (!cancelReady) {
                var remove;
                var cancel = () => {
                  if (typeof remove === "function") remove();
                };
                var ready = () => {
                  if (cancelReady !== cancel) return;
                  cancel();
                  cancelReady = void 0;
                  try {
                    open();
                  } catch {}
                };
                cancelReady = cancel;
                var unsubscribe = navigation.addListener("ready", ready);
                remove = typeof unsubscribe === "function" ? unsubscribe : () => navigation.removeListener?.("ready", ready);
              }
            } else open();
            return;
          }
        } catch {}
        var {
          AlertModal,
          AlertActionButton
        } = Design;
        AlertActionCreators.openAlert("chatbuttons-hidden-settings-unavailable", createElement(AlertModal, {
          title: hiddenSettingsLabel,
          content: "Could not open the native settings page. Use the plugin\u2019s gear icon for now.",
          actions: createElement(AlertActionButton, {
            text: "OK",
            variant: "primary"
          })
        }));
      }

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/bar.tsx
      var Bar = createContext(null);
      var Free = createContext(false);
      var Slot = createContext(null);
      function useHeld(entry) {
        var bar = useContext(Bar);
        var slot = useContext(Slot);
        var s = storage.use();
        var kept = !bar || !!s?.kept?.[entry.id];
        var ref = useRef(entry);
        ref.current = entry;
        useLayoutEffect(() => bar?.add(ref), [bar, entry.id]);
        useLayoutEffect(() => bar?.touch(ref.current), [bar, entry.id, entry.label, entry.on, entry.Icon, !!entry.hold]);
        useLayoutEffect(() => {
          slot?.(!kept);
        }, [kept, slot]);
        return kept;
      }
      var hiddenStyle = {
        position: "absolute",
        right: 56,
        opacity: 0
      };
      function Stash({
        hidden,
        children
      }) {
        return /* @__PURE__ */jsx(View, {
          collapsable: false,
          pointerEvents: hidden ? "none" : "auto",
          style: hidden ? hiddenStyle : void 0,
          accessibilityElementsHidden: hidden,
          importantForAccessibility: hidden ? "no-hide-descendants" : "auto",
          children
        });
      }
      var stateOf = p => p.accessibilityState?.checked ?? p.accessibilityState?.selected ?? p.active;
      var touch = {
        nativeEvent: {},
        persist() {}
      };
      var replay = (p, fire) => () => {
        if (!isActive() || typeof fire !== "function") return;
        p.onPressIn?.(touch);
        try {
          fire(touch);
        } finally {
          p.onPressOut?.(touch);
        }
      };
      var replayGesture = h => () => {
        if (!isActive()) return;
        h.onBegin?.(touch);
        h.onStart?.(touch);
        h.onEnd?.(touch, true);
        h.onFinalize?.(touch, true);
      };
      var longGesture = g => {
        if (!g) return;
        if (g.handlerName === "LongPressGestureHandler") return g.handlers?.onStart || g.handlers?.onBegin ? replayGesture(g.handlers) : void 0;
        for (var x of g.gestures ?? []) {
          var hit = longGesture(x);
          if (hit) return hit;
        }
      };
      var findHold = node => {
        if (Array.isArray(node)) {
          for (var x of node) {
            var hit = findHold(x);
            if (hit) return hit;
          }
          return;
        }
        if (!isValidElement(node)) return;
        var p = node.props;
        if (typeof p.onLongPress === "function") return replay(p, p.onLongPress);
        return longGesture(p.gesture) ?? findHold(p.children);
      };
      var forced = {
        on: false
      };
      var Button;
      var setButton = v => {
        Button = v;
      };
      function Hold({
        real: Real2,
        ...props
      }) {
        var active2 = useActive();
        var bar = useContext(Bar);
        var free = useContext(Free);
        return !active2 || !bar || free ? /* @__PURE__ */jsx(Plain, {
          real: Real2,
          ...props
        }) : /* @__PURE__ */jsx(Held, {
          real: Real2,
          ...props
        });
      }
      var run = (Real2, props) => {
        var out2 = Real2(props);
        return props.onLongPress && isValidElement(out2) ? cloneElement(out2, {
          onLongPress: props.onLongPress
        }) : out2;
      };
      function Plain({
        real,
        ...props
      }) {
        return run(real, props);
      }
      function Held({
        real: Real2,
        ...props
      }) {
        var gift = !!useContext(Slot);
        var out2 = run(Real2, props);
        var kept = useHeld({
          id: props.chatButtonsId ?? props.accessibilityLabel ?? props.IconComponent?.name ?? "button",
          label: props.chatButtonsLabel ?? props.accessibilityLabel ?? "Button",
          Icon: props.IconComponent,
          on: gift ? void 0 : stateOf(props),
          press: replay(props, props.onPress),
          hold: findHold(out2)
        });
        return /* @__PURE__ */jsx(Stash, {
          hidden: !kept,
          children: out2
        });
      }
      var markOwn = node => {
        if (Array.isArray(node)) {
          for (var [i, x] of node.entries()) {
            var hit = markOwn(x);
            if (hit !== x) {
              var next = [...node];
              next[i] = hit;
              return next;
            }
          }
          return node;
        }
        if (!isValidElement(node)) return node;
        var p = node.props;
        if (node.type === Popup) return {
          ...node,
          props: {
            ...p,
            [mine]: true
          }
        };
        var children = markOwn(p.children);
        return children === p.children ? node : {
          ...node,
          props: {
            ...p,
            children
          }
        };
      };
      var mine = /* @__PURE__ */Symbol("own");
      var Real;
      var setMenu = v => {
        Real = v;
      };
      function Popup({
        [mine]: own,
        ...props
      }) {
        var active2 = useActive();
        var bar = useContext(Bar);
        var free = useContext(Free);
        var p = bar && !free && !own ? props.children?.({})?.props : null;
        var button = p?.accessibilityLabel || p?.IconComponent;
        if (!active2 || !button || p.keep || p.accessibilityActions) return createElement(Real, props);
        return /* @__PURE__ */jsx(Caught, {
          props,
          p
        });
      }
      function Caught({
        props,
        p
      }) {
        var handle = useRef(null);
        var timer = useRef(null);
        useEffect(() => () => clearTimeout(timer.current), []);
        var [open] = useState(() => () => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            if (!isActive()) return;
            forced.on = true;
            try {
              handle.current?.onPress?.();
            } finally {
              forced.on = false;
            }
          }, 160);
        });
        var long = !!props.triggerOnLongPress;
        var kept = useHeld({
          id: p.chatButtonsId ?? p.accessibilityLabel ?? p.IconComponent?.name ?? "menu",
          label: p.chatButtonsLabel ?? p.accessibilityLabel ?? "Menu",
          Icon: p.IconComponent,
          on: stateOf(p),
          press: long && p.onPress ? p.onPress : open,
          hold: long ? open : void 0
        });
        return /* @__PURE__ */jsx(Free.Provider, {
          value: true,
          children: /* @__PURE__ */jsx(Stash, {
            hidden: !kept,
            children: createElement(Real, {
              ...props,
              children: x => {
                handle.current = x;
                return props.children(x);
              }
            })
          })
        });
      }
      var skips = p => p.keep || !p.onPress || !!p.accessibilityActions;
      function Emoji({
        el
      }) {
        var kept = useHeld({
          id: "emoji",
          label: "Emoji",
          Icon: EmojiIcon,
          press: el.props.onPress
        });
        return /* @__PURE__ */jsx(Stash, {
          hidden: !kept,
          children: el
        });
      }
      function Gift({
        children
      }) {
        var [gone, setGone] = useState(false);
        return /* @__PURE__ */jsx(Slot.Provider, {
          value: setGone,
          children: /* @__PURE__ */jsx(Stash, {
            hidden: gone,
            children
          })
        });
      }
      var pressable = node => {
        if (Array.isArray(node)) {
          for (var x of node) {
            var hit = pressable(x);
            if (hit) return hit;
          }
          return;
        }
        if (!isValidElement(node)) return;
        var p = node.props;
        return typeof p.onPress === "function" ? p : pressable(p.children);
      };
      var longPress = node => {
        if (Array.isArray(node)) return node.some(longPress);
        if (!isValidElement(node) || node.type === Popup) return false;
        var p = node.props;
        return !!p.triggerOnLongPress || longPress(p.children);
      };
      var hasButton = node => {
        if (Array.isArray(node)) return node.some(hasButton);
        if (!isValidElement(node)) return false;
        return node.type === Button || hasButton(node.props.children);
      };
      var inner = type => {
        if (typeof type === "function") return type.prototype?.isReactComponent ? void 0 : type;
        if (type?.type) return inner(type.type);
        return type?.render;
      };
      var leaf = node => {
        if (Array.isArray(node)) {
          for (var x of node) {
            var hit = leaf(x);
            if (hit) return hit;
          }
          return;
        }
        if (!isValidElement(node)) return;
        return leaf(node.props.children) ?? node;
      };
      function Foreign({
        render,
        id,
        props
      }) {
        var out2 = render(props, props.ref);
        if (longPress(out2)) return /* @__PURE__ */jsx(Free.Provider, {
          value: true,
          children: out2
        });
        var hit = pressable(out2);
        if (!hit || hasButton(out2) && !findHold(out2)) return out2;
        return /* @__PURE__ */jsx(Picked, {
          id,
          out: out2,
          hit
        });
      }
      function Picked({
        id,
        out: out2,
        hit
      }) {
        var name = hit.chatButtonsLabel ?? hit.accessibilityLabel ?? id;
        var icon = useRef(hit.children);
        icon.current = hit.children;
        var [Drawn] = useState(() => ({
          style
        }) => {
          var x = leaf(icon.current);
          return x ? cloneElement(x, {
            style: [x.props.style, style]
          }) : null;
        });
        var kept = useHeld({
          id: hit.chatButtonsId ?? name,
          label: name,
          Icon: hit.IconComponent ?? Drawn,
          on: stateOf(hit),
          press: replay(hit, hit.onPress),
          hold: findHold(out2)
        });
        return /* @__PURE__ */jsx(Free.Provider, {
          value: true,
          children: /* @__PURE__ */jsx(Stash, {
            hidden: !kept,
            children: out2
          })
        });
      }
      var wrapped = /* @__PURE__ */new WeakMap();
      function wrap(el) {
        var render = inner(el.type);
        if (!render) return el;
        var Comp = wrapped.get(el.type);
        if (!Comp) {
          Comp = ({
            id: id2,
            props
          }) => /* @__PURE__ */jsx(Foreign, {
            render,
            id: id2,
            props
          });
          wrapped.set(el.type, Comp);
        }
        var name = el.type.displayName ?? render.displayName ?? render.name;
        var id = name?.length > 2 ? name : el.key ?? "Button";
        return createElement(Comp, {
          key: el.key,
          id,
          props: el.props
        });
      }
      function swap(el, As) {
        if (!isValidElement(el)) return el;
        var p = el.props;
        if (el.type === As) return el;
        if ("onSendMessage" in p) return /* @__PURE__ */jsx(Free.Provider, {
          value: true,
          children: el
        }, "send");
        if ("renderItem" in p) return /* @__PURE__ */jsx(Gift, {
          children: el
        }, "gift");
        if ("showKeyboardIcon" in p) return /* @__PURE__ */jsx(Emoji, {
          el
        }, "emoji");
        return wrap(el);
      }
      var hasExpr = x => isValidElement(x) && !!x.props.onPressExpression;
      var isRight = x => {
        if (!isValidElement(x)) return false;
        var c = x.props.children;
        if (hasExpr(c)) return true;
        if (!isValidElement(c)) return false;
        var kids = c.props.children;
        return Array.isArray(kids) ? kids.some(hasExpr) : hasExpr(kids);
      };
      function HiddenSettings() {
        var kept = useHeld({
          id: hiddenSettingsId,
          label: hiddenSettingsLabel,
          Icon: HiddenSettingsIcon,
          press: openHiddenSettings
        });
        return kept ? /* @__PURE__ */jsx(Free.Provider, {
          value: true,
          children: /* @__PURE__ */jsx(Button, {
            keep: true,
            accessibilityLabel: hiddenSettingsLabel,
            IconComponent: HiddenSettingsIcon,
            onPress: openHiddenSettings
          })
        }) : null;
      }
      function Menu({
        bar
      }) {
        var {
          ContextMenu
        } = Design;
        var [items] = useState(() => [{
          label: "Buttons",
          bar
        }]);
        return /* @__PURE__ */jsx(ContextMenu, {
          align: "above",
          triggerOnTap: true,
          items,
          children: p => /* @__PURE__ */jsx(Button, {
            ...p,
            keep: true,
            accessibilityLabel: "Buttons",
            IconComponent: MenuIcon
          })
        });
      }
      function Row({
        as: As,
        menu,
        children,
        ...props
      }) {
        var active2 = useActive();
        var [bar] = useState(createBar);
        if (!active2 || menu && (!Button || !Design.ContextMenu)) return /* @__PURE__ */jsx(As, {
          ...props,
          children
        });
        var list = Children.toArray(children);
        var out2 = list.map(x => swap(x, As));
        if (!menu) return /* @__PURE__ */jsx(As, {
          ...props,
          children: out2
        });
        out2.splice(Math.max(0, list.findIndex(isRight)), 0, /* @__PURE__ */jsx(HiddenSettings, {}, "hidden-settings"), /* @__PURE__ */jsx(Menu, {
          bar
        }, "menu"));
        return /* @__PURE__ */jsx(Bar.Provider, {
          value: bar,
          children: /* @__PURE__ */jsx(As, {
            ...props,
            children: out2
          })
        });
      }
      function swapRow(node) {
        if (!isValidElement(node)) return node;
        var {
          children
        } = node.props;
        var list = Array.isArray(children) ? children : [children];
        if (list.some(isRight)) return {
          ...node,
          type: Row,
          props: {
            ...node.props,
            as: node.type,
            menu: true
          }
        };
        for (var [i, child] of list.entries()) {
          var patched = swapRow(child);
          if (patched === child) continue;
          var next = [...list];
          next[i] = patched;
          return {
            ...node,
            props: {
              ...node.props,
              children: Array.isArray(children) ? next : patched
            }
          };
        }
        return node;
      }

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/manage.tsx
      function Nickname({
        id,
        label
      }) {
        var {
          AlertModal,
          AlertActionButton,
          TextInput
        } = Design;
        var [text, setText] = useState(storage.cache?.names?.[id] ?? "");
        return /* @__PURE__ */jsx(AlertModal, {
          title: "Nickname",
          content: label,
          extraContent: /* @__PURE__ */jsx(TextInput, {
            autoFocus: true,
            placeholder: label,
            value: text,
            onChange: setText
          }),
          actions: /* @__PURE__ */jsxs(Fragment, {
            children: [/* @__PURE__ */jsx(AlertActionButton, {
              text: "Save",
              variant: "primary",
              onPress: () => storage.set({
                names: {
                  [id]: text.trim()
                }
              })
            }), /* @__PURE__ */jsx(AlertActionButton, {
              text: "Cancel",
              variant: "secondary"
            })]
          })
        });
      }
      function ButtonList({
        bar
      }) {
        var {
          FormSwitch,
          TableRow,
          TableRowGroup
        } = Design;
        var s = storage.use();
        var live = inOrder(useLive(bar), s);
        if (!s) return null;
        var here = new Map(live.map(x => [x.id, x]));
        var rest = Object.keys(s.seen ?? {}).filter(id => !here.has(id));
        var ids = [...here.keys(), ...rest];
        var hint = id => {
          if (bar && !here.has(id)) return "Not in this chat";
          return s.names?.[id] ? s.seen?.[id] : "Tap to add a nickname";
        };
        return /* @__PURE__ */jsxs(TableRowGroup, {
          title: "In the menu",
          children: [!ids.length && /* @__PURE__ */jsx(TableRow, {
            label: "Open a chat to see your buttons"
          }), ids.map(id => {
            var label = here.get(id)?.label ?? s.seen?.[id] ?? id;
            var name = s.names?.[id];
            var Icon = here.get(id)?.Icon ?? iconFor(id);
            return /* @__PURE__ */jsx(TableRow, {
              label: name || label,
              subLabel: hint(id),
              icon: Icon ? /* @__PURE__ */jsx(TableRow.Icon, {
                IconComponent: tint(Icon)
              }) : void 0,
              trailing: /* @__PURE__ */jsx(FormSwitch, {
                value: !s.kept?.[id],
                onValueChange: v => storage.set({
                  kept: {
                    [id]: !v
                  }
                })
              }),
              onPress: () => AlertActionCreators.openAlert("chatbuttons-nickname", createElement(Nickname, {
                id,
                label
              }))
            }, id);
          })]
        });
      }
      function ManageSheet({
        bar
      }) {
        var {
          ActionSheet,
          ActionSheetCloseButton,
          BottomSheetTitleHeader
        } = Design;
        return /* @__PURE__ */jsx(ActionSheet, {
          header: /* @__PURE__ */jsx(BottomSheetTitleHeader, {
            title: "Chat buttons",
            trailing: /* @__PURE__ */jsx(ActionSheetCloseButton, {
              onPress: () => ActionSheetActionCreators.hideActionSheet()
            })
          }),
          children: /* @__PURE__ */jsx(View, {
            style: {
              paddingBottom: 16
            },
            children: /* @__PURE__ */jsx(ButtonList, {
              bar
            })
          })
        });
      }
      var openManage = bar => ActionSheetActionCreators.openLazy(Promise.resolve({
        default: ManageSheet
      }), "ChatButtons", {
        bar
      });
      function Settings() {
        return /* @__PURE__ */jsx(ScrollView, {
          contentContainerStyle: {
            padding: 16,
            paddingBottom: 64
          },
          children: /* @__PURE__ */jsx(ButtonList, {})
        });
      }

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/menu.tsx
      var edge = 12;
      var wide = 244;
      var gap = 8;
      var hold = 350;
      var fillDelay = 100;
      var out = Easing.bezier(0.23, 1, 0.32, 1);
      var Moving = Animated.createAnimatedComponent(View);
      var haptics;
      var setHaptics = v => {
        haptics = v;
      };
      var made;
      var useStyles = () => {
        if (!made) {
          var t = Tokens.default ?? Tokens;
          made = Design.createStyles({
            shade: {
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(0, 0, 0, 0.24)"
            },
            sheet: {
              position: "absolute",
              overflow: "hidden",
              backgroundColor: t.colors.BACKGROUND_SURFACE_HIGHEST,
              borderWidth: 1,
              borderColor: t.colors.BORDER_SUBTLE,
              borderRadius: t.radii.lg,
              ...t.shadows.SHADOW_HIGH
            },
            row: {
              minHeight: 44,
              paddingHorizontal: 12,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 10
            },
            pressed: {
              backgroundColor: t.colors.BACKGROUND_MOD_SUBTLE
            },
            fill: {
              ...StyleSheet.absoluteFillObject,
              backgroundColor: t.colors.BACKGROUND_MOD_NORMAL,
              transformOrigin: "left"
            },
            label: {
              flex: 1
            },
            more: {
              width: 16,
              height: 16,
              tintColor: t.colors.ICON_MUTED
            },
            line: {
              height: 1,
              backgroundColor: t.colors.BORDER_SUBTLE
            },
            track: {
              width: 30,
              height: 18,
              borderRadius: 9,
              justifyContent: "center",
              backgroundColor: t.colors.BACKGROUND_MOD_STRONG
            },
            trackOn: {
              backgroundColor: t.colors.SWITCH_BACKGROUND_SELECTED_DEFAULT
            },
            thumb: {
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: t.colors.SWITCH_THUMB_BACKGROUND_DEFAULT
            },
            thumbOn: {
              backgroundColor: t.colors.SWITCH_THUMB_BACKGROUND_SELECTED_DEFAULT
            }
          });
        }
        return made();
      };
      var run2 = (v, toValue, ms, delay = 0) => Animated.timing(v, {
        toValue,
        duration: ms,
        delay,
        easing: out,
        useNativeDriver: true
      });
      function Toggle({
        on
      }) {
        var s = useStyles();
        var [v] = useState(() => new Animated.Value(on ? 1 : 0));
        useEffect(() => {
          run2(v, on ? 1 : 0, 160).start();
        }, [on]);
        var x = v.interpolate({
          inputRange: [0, 1],
          outputRange: [2, 14]
        });
        return /* @__PURE__ */jsx(View, {
          style: [s.track, on && s.trackOn],
          children: /* @__PURE__ */jsx(Moving, {
            style: [s.thumb, on && s.thumbOn, {
              transform: [{
                translateX: x
              }]
            }]
          })
        });
      }
      function Row2({
        label,
        Icon,
        on,
        press,
        held
      }) {
        var s = useStyles();
        var [v] = useState(() => new Animated.Value(0));
        var [down, setDown] = useState(false);
        var Tinted = Icon && tint(Icon);
        var toggle = typeof on === "boolean";
        return /* @__PURE__ */jsxs(Pressable, {
          style: [s.row, down && s.pressed],
          accessibilityLabel: label,
          accessibilityRole: toggle ? "switch" : "button",
          accessibilityState: toggle ? {
            checked: on
          } : void 0,
          accessibilityActions: held ? [{
            name: "longpress",
            label: "Hold"
          }] : void 0,
          onAccessibilityAction: () => held?.(),
          delayLongPress: hold,
          onPress: press,
          onLongPress: held ? () => {
            haptics?.triggerHapticFeedback(haptics.HapticFeedbackTypes.IMPACT_LIGHT);
            held();
          } : void 0,
          onPressIn: () => {
            setDown(true);
            if (!held) return;
            v.setValue(0);
            Animated.timing(v, {
              toValue: 1,
              delay: fillDelay,
              duration: hold - fillDelay,
              easing: Easing.linear,
              useNativeDriver: true
            }).start();
          },
          onPressOut: () => {
            setDown(false);
            if (held) run2(v, 0, 140).start();
          },
          children: [held && /* @__PURE__ */jsx(Moving, {
            pointerEvents: "none",
            style: [s.fill, {
              transform: [{
                scaleX: v
              }]
            }]
          }), Tinted && /* @__PURE__ */jsx(Tinted, {}), /* @__PURE__ */jsx(Design.Text, {
            variant: "text-md/medium",
            color: "text-strong",
            numberOfLines: 1,
            style: s.label,
            children: label
          }), held && /* @__PURE__ */jsx(MoreIcon, {
            style: s.more
          }), toggle && /* @__PURE__ */jsx(Toggle, {
            on
          })]
        });
      }
      function Sheet({
        menu,
        transitionState,
        cleanUp
      }) {
        var active2 = useActive();
        var s = useStyles();
        var bar = menu.items[0].bar;
        var opts = storage.use();
        var rows = inOrder(useLive(bar), opts).filter(x => !opts?.kept?.[x.id]);
        var {
          width,
          height
        } = useWindowDimensions();
        var [v] = useState(() => new Animated.Value(0));
        var yeeted = transitionState === Design.TransitionStates.YEETED;
        var done = useRef({
          cleanUp,
          onClose: menu.onClose
        });
        done.current = {
          cleanUp,
          onClose: menu.onClose
        };
        var close = () => menu.requestClose(true);
        var find = id => bar.list().find(x => x.id === id);
        useEffect(() => {
          if (!yeeted) return void run2(v, 1, 170).start();
          run2(v, 0, 110).start(() => {
            done.current.cleanUp();
            done.current.onClose?.();
          });
        }, [yeeted]);
        useEffect(() => {
          var sub = BackHandler.addEventListener("hardwareBackPress", () => {
            close();
            return true;
          });
          return () => sub.remove();
        }, []);
        useEffect(() => {
          if (!active2) close();
        }, [active2]);
        var top = (StatusBar.currentHeight ?? 44) + edge;
        var place = {
          [menu.positionX]: menu.x,
          bottom: menu.y + gap,
          width: Math.min(wide, width - edge - menu.x),
          maxHeight: height - menu.y - gap - top,
          transformOrigin: `${menu.positionX} bottom`
        };
        var scale = v.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1]
        });
        return !active2 ? null : /* @__PURE__ */jsxs(Fragment, {
          children: [/* @__PURE__ */jsx(Pressable, {
            style: StyleSheet.absoluteFill,
            accessibilityLabel: "Close",
            onPress: close,
            children: /* @__PURE__ */jsx(Moving, {
              style: [s.shade, {
                opacity: v
              }]
            })
          }), /* @__PURE__ */jsxs(Moving, {
            accessibilityRole: "menu",
            style: [s.sheet, place, {
              opacity: v,
              transform: [{
                scale
              }]
            }],
            children: [!!rows.length && /* @__PURE__ */jsx(ScrollView, {
              bounces: false,
              overScrollMode: "never",
              showsVerticalScrollIndicator: false,
              keyboardShouldPersistTaps: "handled",
              children: rows.map(x => /* @__PURE__ */jsx(Row2, {
                label: opts?.names?.[x.id] || x.label,
                Icon: x.Icon,
                on: x.on,
                press: () => {
                  if (!isActive()) return;
                  if (typeof x.on !== "boolean") close();
                  find(x.id)?.press();
                },
                held: x.hold && (() => {
                  if (!isActive()) return;
                  close();
                  find(x.id)?.hold?.();
                })
              }, x.id))
            }), !!rows.length && /* @__PURE__ */jsx(View, {
              style: s.line
            }), /* @__PURE__ */jsx(Row2, {
              label: "Manage buttons",
              Icon: EditIcon,
              press: () => {
                close();
                openManage(bar);
              }
            })]
          })]
        });
      }

      // chat-settings-fix/valenced/plugins/chat-buttons/source/js/index.ts
      function target(mod, name = "default") {
        var holder = mod,
          key = name;
        for (var i = 0; i < 8; i++) {
          var value = holder?.[key];
          if (value?.type) {
            holder = value;
            key = "type";
          } else if (typeof value?.render === "function") return [value, "render"];else return typeof value === "function" ? [holder, key] : void 0;
        }
      }
      var index_default = plugin({
        jsonStorage: {
          load: true,
          default: defaults
        },
        SettingsComponent: Settings,
        async start(api) {
          var {
            cleanup,
            jsonStorage,
            logger
          } = api;
          var active2 = true;
          var removers = [];
          var own = remove => {
            if (typeof remove !== "function") return;
            if (active2) removers.push(remove);else remove();
          };
          cleanup(() => {
            active2 = false;
            setActive(false);
            setSettingsHost(void 0);
            forced.on = false;
            for (var remove of removers.splice(0).reverse()) {
              try {
                remove();
              } catch (error) {
                logger?.warn?.(error);
              }
            }
          });
          if (!jsonStorage.loaded) await jsonStorage.get();
          if (!active2) return;
          setStorage(jsonStorage);
          setSettingsHost(api);
          setActive(true);
          var watch = (path2, callback) => {
            own(getModuleWithImportedPath(path2, mod => {
              if (active2) callback(mod);
            }));
          };
          var patch = (mod, make) => {
            var hit = target(mod);
            if (hit) own(make(...hit));
          };
          var path = "modules/chat_input/native";
          var menu = "design/components/ContextMenu/native";
          watch(`${path}/action_buttons/ChatInputActionButton.tsx`, mod => {
            setButton(mod.default);
            patch(mod, (holder, key) => instead(holder, key, ([p], real) => !active2 || skips(p) ? createElement(real, p) : createElement(Hold, {
              ...p,
              real
            }), {
              priority: HookPriority.HIGHEST
            }));
          });
          watch(`${path}/action_buttons/ChatInputActions.tsx`, mod => {
            patch(mod, (holder, key) => after(holder, key, result => active2 ? markOwn(result) : result));
          });
          watch(`${path}/action_buttons/ChatInputRightActions.tsx`, mod => {
            patch(mod, (holder, key) => after(holder, key, result => active2 && isValidElement(result) ? {
              ...result,
              type: Row,
              props: {
                ...result.props,
                as: result.type
              }
            } : result));
          });
          watch(`${path}/ChatInput.tsx`, mod => {
            patch(mod, (holder, key) => after(holder, key, result => active2 ? swapRow(result) : result));
          });
          watch(`${menu}/ContextMenu.native.tsx`, mod => {
            if (!mod?.ContextMenu) return;
            setMenu(mod.ContextMenu);
            own(afterJSX(mod.ContextMenu, el => active2 && el ? {
              ...el,
              type: Popup
            } : el));
          });
          watch(`${menu}/ContextMenuPopout.native.tsx`, mod => {
            if (typeof mod?.ContextMenuPopout !== "function") return;
            own(instead(mod, "ContextMenuPopout", ([p], real) => active2 && p?.menu?.items?.[0]?.bar ? createElement(Sheet, p) : real(p)));
          });
          watch("modules/haptics/HapticUtils.native.tsx", setHaptics);
          watch("modules/a11y/native/useIsScreenReaderEnabled.native.tsx", mod => {
            if (typeof mod?.getIsScreenReaderEnabled !== "function") return;
            own(instead(mod, "getIsScreenReaderEnabled", (args, real) => active2 && forced.on || real(...args)));
          });
        }
      });
      return module.exports.default;
    })();
    return runtime;
  }
  return {
    default: {
      jsonStorage: {
        load: true,
        default: {
          names: {},
          kept: {},
          seen: {}
        }
      },
      start(api) {
        return load(api.unscoped).start(api);
      },
      SettingsComponent(props) {
        var U = props.api.unscoped;
        return U.react.React.createElement(load(U).SettingsComponent, props);
      }
    }
  };
})();
