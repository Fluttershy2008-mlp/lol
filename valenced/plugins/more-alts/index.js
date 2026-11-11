(() => {
  var options;
  function load(valenced) {
    if (!options) {
      // source/plugins/more-alts/js/patches/nativeSwitcher.ts
      var getValenced = function () {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      };
      var module = {
        exports: {}
      };
      var exports = module.exports;
      var __defProp = Object.defineProperty;
      var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
      var __getOwnPropNames = Object.getOwnPropertyNames;
      var __hasOwnProp = Object.prototype.hasOwnProperty;
      var __export = (target, all) => {
        for (var name in all) __defProp(target, name, {
          get: all[name],
          enumerable: true
        });
      };
      var __copyProps = (to, from, except, desc) => {
        if (from && typeof from === "object" || typeof from === "function") {
          var _loop = function (key2) {
            if (!__hasOwnProp.call(to, key2) && key2 !== except) __defProp(to, key2, {
              get: () => from[key2],
              enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable
            });
          };
          for (var key2 of __getOwnPropNames(from)) {
            _loop(key2);
          }
        }
        return to;
      };
      var __toCommonJS = mod => __copyProps(__defProp({}, "__esModule", {
        value: true
      }), mod);

      // source/plugins/more-alts/js/index.ts
      var index_exports = {};
      __export(index_exports, {
        default: () => index_default
      });
      module.exports = __toCommonJS(index_exports);
      async function callNative(method, args = []) {
        try {
          var rev = getValenced();
          if (typeof rev?.modules?.native?.callNativeMethod === "function") {
            return await rev.modules.native.callNativeMethod(`dev.fluttershy2008.more-alts.${method}`, args);
          }
        } catch {}
        return null;
      }
      function syncNativeVault(storage) {
        try {
          var current = storage.cache ?? {};
          if (current.persistentStorageVault === false) return;
          var accounts = current.accounts ?? {};
          var json = JSON.stringify(Object.values(accounts));
          void callNative("saveAccounts", [json]);
        } catch {}
      }
      async function restoreFromNativeVault(storage, active) {
        try {
          if (storage.cache?.persistentStorageVault === false) return;
          var raw = await callNative("loadAccounts");
          if (!active() || storage.cache?.persistentStorageVault === false) return;
          if (typeof raw === "string" && raw.trim().startsWith("[")) {
            var list = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 0) {
              var current = storage.cache ?? {};
              var existing = {
                ...(current.accounts ?? {})
              };
              var order = [...(current.accountOrder ?? [])];
              var changed = false;
              for (var acc of list) {
                if (acc?.id && acc?.token && !existing[acc.id]) {
                  existing[acc.id] = acc;
                  if (!order.includes(acc.id)) order.push(acc.id);
                  changed = true;
                }
              }
              if (changed) {
                await storage.set({
                  accounts: existing,
                  accountOrder: order
                });
              }
            }
          }
        } catch {}
      }
      function patchNativeSwitcher(storage) {
        var cleanups = [];
        var rev = getValenced();
        try {
          var hookedTargets = /* @__PURE__ */new Set();
          var hookStore = store => {
            if (!store || hookedTargets.has(store)) return;
            hookedTargets.add(store);
            var proto = Object.getPrototypeOf(store);
            if (proto && !hookedTargets.has(proto)) {
              hookedTargets.add(proto);
              if (typeof proto.getCanUseMultiAccountMobile === "function") {
                try {
                  cleanups.push(rev.patcher.after(proto, "getCanUseMultiAccountMobile", () => {
                    if (storage.cache?.enableNativeSwitcher !== false) {
                      return true;
                    }
                  }));
                } catch {}
              }
              if (typeof proto.getHasLoggedInAccounts === "function") {
                try {
                  cleanups.push(rev.patcher.after(proto, "getHasLoggedInAccounts", ret => {
                    if (storage.cache?.enableNativeSwitcher !== false) {
                      return true;
                    }
                    return ret;
                  }));
                } catch {}
              }
            }
            if (typeof store.getCanUseMultiAccountMobile === "function") {
              try {
                cleanups.push(rev.patcher.after(store, "getCanUseMultiAccountMobile", () => {
                  if (storage.cache?.enableNativeSwitcher !== false) {
                    return true;
                  }
                }));
              } catch {}
            }
            if (typeof store.getHasLoggedInAccounts === "function") {
              try {
                cleanups.push(rev.patcher.after(store, "getHasLoggedInAccounts", ret => {
                  if (storage.cache?.enableNativeSwitcher !== false) {
                    return true;
                  }
                  return ret;
                }));
              } catch {}
            }
            try {
              var descriptor = Object.getOwnPropertyDescriptor(store, "canUseMultiAccountNotifications");
              Object.defineProperty(store, "canUseMultiAccountNotifications", {
                get: () => {
                  if (storage.cache?.blockOtherAccountNotifications !== false) {
                    return false;
                  }
                  return storage.cache?.enableNativeSwitcher !== false;
                },
                configurable: true
              });
              cleanups.push(() => {
                try {
                  if (descriptor) Object.defineProperty(store, "canUseMultiAccountNotifications", descriptor);else delete store.canUseMultiAccountNotifications;
                } catch {}
              });
            } catch {}
            try {
              store.emitChange?.();
            } catch {}
          };
          var finders = rev.modules?.finders;
          var filter = finders?.filters?.withProps?.("getCanUseMultiAccountMobile");
          if (filter && finders?.lookupModule) {
            var [match] = finders.lookupModule(filter);
            hookStore(match);
          }
          if (filter && finders?.getModules) {
            var unsub = finders.getModules(filter, m => hookStore(m), {
              returnNamespace: true
            });
            cleanups.push(() => unsub?.());
          }
          var Stores = rev.discord?.flux?.Stores;
          var MultiAccountStore = Stores?.MultiAccountStore;
          var UserStore = Stores?.UserStore;
          if (MultiAccountStore) {
            hookStore(MultiAccountStore);
          }
          var syncActiveUserToNative = () => {
            var currentUserId = UserStore?.getCurrentUser?.()?.id;
            void callNative("setActiveUser", [currentUserId ?? null]);
            var shouldBlock = storage.cache?.blockOtherAccountNotifications !== false;
            void callNative("setBlockNotifications", [shouldBlock]);
            try {
              MultiAccountStore?.emitChange?.();
            } catch {}
          };
          syncActiveUserToNative();
          var vaultEnabled = storage.cache?.persistentStorageVault !== false;
          cleanups.push(storage.subscribe(() => {
            syncActiveUserToNative();
            var enabled = storage.cache?.persistentStorageVault !== false;
            if (enabled && !vaultEnabled) syncNativeVault(storage);
            vaultEnabled = enabled;
          }));
          if (UserStore?.addChangeListener && UserStore?.removeChangeListener) {
            UserStore.addChangeListener(syncActiveUserToNative);
            cleanups.push(() => UserStore.removeChangeListener(syncActiveUserToNative));
          }
          var Dispatcher = rev.discord?.flux?.Dispatcher ?? rev.discord?.common?.flux?.Dispatcher;
          if (Dispatcher?.subscribe) {
            var handleNotification = event => {
              if (storage.cache?.blockOtherAccountNotifications === false) return;
              var currentUserId = UserStore?.getCurrentUser?.()?.id;
              if (!currentUserId) return;
              var notifUserId = event?.accountId ?? event?.account_id ?? event?.recipientId ?? event?.recipient_id;
              if (notifUserId && notifUserId !== currentUserId) {
                event.stopped = true;
                if (typeof event.stopPropagation === "function") {
                  event.stopPropagation();
                }
              }
            };
            Dispatcher.subscribe("NOTIFICATION_CREATE", handleNotification);
            cleanups.push(() => {
              Dispatcher.unsubscribe("NOTIFICATION_CREATE", handleNotification);
            });
          }
        } catch (e) {
          console.error("[MoreAlts] patchNativeSwitcher error:", e);
        }
        return () => {
          for (var fn of cleanups) {
            try {
              fn();
            } catch {}
          }
        };
      }

      // source/plugins/more-alts/js/lib/passwordUtils.ts
      function simpleHash(str) {
        var hash = 0;
        if (str.length === 0) return hash.toString();
        for (var i = 0; i < str.length; i++) {
          var char = str.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
      }

      // source/plugins/more-alts/js/lib/accountActions.ts
      function getValenced2() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      }
      function getUserStore() {
        var rev = getValenced2();
        var everest = globalThis.__everest ?? rev?.everest;
        if (typeof everest?.getUserStore === "function") {
          return everest.getUserStore();
        }
        return rev?.discord?.flux?.Stores?.UserStore;
      }
      function getMultiAccountStore() {
        return getValenced2()?.discord?.flux?.Stores?.MultiAccountStore;
      }
      function getTokenManager() {
        try {
          var finders = getValenced2()?.modules?.finders;
          return finders?.lookupModule?.(finders?.filters?.withProps?.("getToken"))?.[0];
        } catch {}
        return void 0;
      }
      function getAuthActions() {
        try {
          var finders = getValenced2()?.modules?.finders;
          return finders?.lookupModule?.(finders?.filters?.withProps?.("switchAccountToken"))?.[0];
        } catch {}
        return void 0;
      }
      function getMultiAccountActions() {
        try {
          var finders = getValenced2()?.modules?.finders;
          return finders?.lookupModule?.(finders?.filters?.withProps?.("switchAccount"))?.[0];
        } catch {}
        return void 0;
      }
      function getCurrentUser() {
        return getUserStore()?.getCurrentUser?.();
      }
      function getCurrentToken() {
        return getValenced2()?.discord?.flux?.Stores?.AuthenticationStore?.getToken?.() ?? getTokenManager()?.getToken?.();
      }
      function getAllAccounts(storage) {
        var current = storage.cache ?? {};
        var customAccounts = {
          ...(current.accounts ?? {})
        };
        var customOrder = current.accountOrder ?? [];
        var nativeStore = getMultiAccountStore();
        var users = nativeStore?.getUsers?.() ?? [];
        var nativeUsers = Array.isArray(users) ? users : Object.values(users);
        var combinedMap = {
          ...customAccounts
        };
        var combinedOrder = [...customOrder];
        for (var u of nativeUsers) {
          if (u?.id) {
            if (!combinedMap[u.id]) {
              combinedMap[u.id] = {
                id: u.id,
                username: u.username,
                discriminator: u.discriminator || "0",
                avatar: u.avatar || null,
                displayName: u.globalName || u.username,
                token: "",
                addedAt: Date.now(),
                isNative: true
              };
              if (!combinedOrder.includes(u.id)) {
                combinedOrder.push(u.id);
              }
            } else {
              combinedMap[u.id] = {
                ...combinedMap[u.id],
                avatar: u.avatar || combinedMap[u.id].avatar,
                username: u.username || combinedMap[u.id].username,
                displayName: u.globalName || combinedMap[u.id].displayName,
                isNative: true
              };
            }
          }
        }
        return combinedOrder.filter(id => combinedMap[id]).map(id => combinedMap[id]);
      }
      async function switchToAccount(account) {
        if (account.isNative) {
          var multiActions = getMultiAccountActions();
          if (typeof multiActions?.switchAccount === "function") {
            try {
              await multiActions.switchAccount(account.id);
              return true;
            } catch (e) {
              console.error("[MoreAlts] Native switchAccount error:", e);
            }
          }
        }
        if (!account.token) return false;
        var auth = getAuthActions();
        if (!auth?.switchAccountToken) {
          console.error("[MoreAlts] switchAccountToken action not found");
          return false;
        }
        try {
          await auth.switchAccountToken(account.token);
          return true;
        } catch (e) {
          console.error("[MoreAlts] Switch account error:", e);
          return false;
        }
      }
      async function addCurrentAccount(storage) {
        var user = getCurrentUser();
        var token = getCurrentToken();
        if (!user || !token) {
          return {
            success: false,
            message: "Could not resolve current account or token"
          };
        }
        var current = storage.cache ?? {};
        var accounts = {
          ...(current.accounts ?? {})
        };
        var order = [...(current.accountOrder ?? [])];
        if (accounts[user.id]?.token === token) {
          return {
            success: false,
            message: `Account "${user.username}" is already saved`
          };
        }
        var newAccount = {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator || "0",
          avatar: user.avatar ?? null,
          displayName: user.globalName || user.username,
          token,
          addedAt: accounts[user.id]?.addedAt ?? Date.now()
        };
        accounts[user.id] = newAccount;
        if (!order.includes(user.id)) order.push(user.id);
        await storage.set({
          accounts,
          accountOrder: order
        });
        syncNativeVault(storage);
        return {
          success: true,
          message: `Account "${user.username}" saved!`
        };
      }
      async function addAccountWithToken(storage, rawToken) {
        var token = rawToken.trim();
        if (!token) {
          var curr = getCurrentToken();
          if (curr) token = curr;
        }
        if (!token) {
          return {
            success: false,
            message: "Please provide a valid token"
          };
        }
        try {
          var isBot = token.startsWith("Bot ");
          var authHeader = token;
          var response = await fetch("https://discord.com/api/v9/users/@me", {
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json"
            }
          });
          if (!response.ok && !isBot) {
            var botResp = await fetch("https://discord.com/api/v9/users/@me", {
              headers: {
                Authorization: `Bot ${token}`,
                "Content-Type": "application/json"
              }
            });
            if (botResp.ok) {
              response = botResp;
              isBot = true;
              authHeader = `Bot ${token}`;
            }
          }
          if (!response.ok) {
            return {
              success: false,
              message: "Invalid or expired token"
            };
          }
          var user = await response.json();
          var current = storage.cache ?? {};
          var accounts = {
            ...(current.accounts ?? {})
          };
          var order = [...(current.accountOrder ?? [])];
          if (accounts[user.id]?.token === authHeader) {
            return {
              success: false,
              message: `Account "${user.username}" is already saved`
            };
          }
          var newAccount = {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator || "0",
            avatar: user.avatar ?? null,
            displayName: user.global_name || user.username,
            token: authHeader,
            addedAt: accounts[user.id]?.addedAt ?? Date.now(),
            isBot
          };
          accounts[user.id] = newAccount;
          if (!order.includes(user.id)) order.push(user.id);
          await storage.set({
            accounts,
            accountOrder: order
          });
          syncNativeVault(storage);
          return {
            success: true,
            message: `Account "${user.username}" added!`
          };
        } catch (e) {
          return {
            success: false,
            message: `Failed to add account: ${e?.message ?? e}`
          };
        }
      }
      async function addAccountWithCredentials(storage, email, pass) {
        var trimmedEmail = email.trim();
        var trimmedPass = pass.trim();
        if (!trimmedEmail || !trimmedPass) {
          return {
            success: false,
            message: "Please enter both email and password"
          };
        }
        try {
          var response = await fetch("https://discord.com/api/v9/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              login: trimmedEmail,
              password: trimmedPass,
              undelete: false,
              login_source: null,
              gift_code_sku_id: null
            })
          });
          var loginData = await response.json();
          if (!response.ok || !loginData.token) {
            if (loginData.captcha_key || loginData.captcha_sitekey) {
              return {
                success: false,
                message: 'Captcha challenge required by Discord. Please use "Add Current Account" or token.'
              };
            }
            if (loginData.mfa || loginData.ticket) {
              return {
                success: false,
                message: '2FA/MFA is enabled on this account. Please use "Add Current Account" or token.'
              };
            }
            if (loginData.errors) {
              try {
                var fieldErrors = [];
                for (var [field, val] of Object.entries(loginData.errors)) {
                  var errList = val?._errors;
                  if (Array.isArray(errList)) {
                    for (var err of errList) {
                      if (err?.message) fieldErrors.push(`${field}: ${err.message}`);
                    }
                  }
                }
                if (fieldErrors.length > 0) {
                  return {
                    success: false,
                    message: fieldErrors.join(" | ")
                  };
                }
              } catch {}
            }
            return {
              success: false,
              message: loginData.message || "Login failed - check credentials"
            };
          }
          return addAccountWithToken(storage, loginData.token);
        } catch (e) {
          return {
            success: false,
            message: `Login request failed: ${e?.message ?? e}`
          };
        }
      }
      async function removeAccount(storage, accountId) {
        var current = storage.cache ?? {};
        var accounts = {
          ...(current.accounts ?? {})
        };
        delete accounts[accountId];
        var order = (current.accountOrder ?? []).filter(id => id !== accountId);
        await storage.set({
          ...current,
          accounts,
          accountOrder: order
        }, true);
        syncNativeVault(storage);
        var multiActions = getMultiAccountActions();
        if (typeof multiActions?.removeAccount === "function") {
          try {
            multiActions.removeAccount(accountId);
          } catch {}
        }
      }
      async function forceLogout() {
        var auth = getAuthActions();
        if (auth?.switchAccountToken) {
          var fakeToken = ["MTExMTExMTExMTExMTExMTEx", "GxxxXx", "xXxXxXxXxXxXxXxXxXxXxXxXxXxXx"].join(".");
          try {
            await auth.switchAccountToken(fakeToken);
          } catch {}
        }
      }
      function exportAccountsJson(storage) {
        var accounts = getAllAccounts(storage);
        var exportData = {
          accounts: accounts.filter(a => a.token).map(a => ({
            id: a.id,
            username: a.username,
            discriminator: a.discriminator,
            avatar: a.avatar,
            displayName: a.displayName,
            token: a.token,
            addedAt: a.addedAt,
            isBot: a.isBot
          })),
          exportPasswordHash: storage.cache?.exportPasswordHash ?? null,
          exportedAt: Date.now(),
          version: "2.0"
        };
        return JSON.stringify(exportData, null, 2);
      }
      async function importAccountsJson(storage, rawJson, password) {
        try {
          var data = JSON.parse(rawJson.trim());
          var accountsArray = Array.isArray(data.accounts) ? data.accounts : Array.isArray(data) ? data : null;
          if (!accountsArray) {
            return {
              success: false,
              imported: 0,
              skipped: 0,
              message: "Invalid import JSON structure"
            };
          }
          var current = storage.cache ?? {};
          if (data.exportPasswordHash) {
            var expectedHash = data.exportPasswordHash;
            if (!password || simpleHash(password) !== expectedHash) {
              return {
                success: false,
                imported: 0,
                skipped: 0,
                message: "Incorrect import password"
              };
            }
          }
          var existing = {
            ...(current.accounts ?? {})
          };
          var order = [...(current.accountOrder ?? [])];
          var imported = 0;
          var skipped = 0;
          for (var acc of accountsArray) {
            if (acc.id && acc.token && acc.username) {
              if (!existing[acc.id]) {
                existing[acc.id] = {
                  id: acc.id,
                  username: acc.username,
                  discriminator: acc.discriminator ?? "0",
                  avatar: acc.avatar ?? null,
                  displayName: acc.displayName ?? acc.username,
                  token: acc.token,
                  addedAt: acc.addedAt ?? Date.now(),
                  isBot: acc.isBot
                };
                if (!order.includes(acc.id)) order.push(acc.id);
                imported++;
              } else {
                skipped++;
              }
            }
          }
          await storage.set({
            accounts: existing,
            accountOrder: order
          });
          syncNativeVault(storage);
          return {
            success: true,
            imported,
            skipped
          };
        } catch (e) {
          return {
            success: false,
            imported: 0,
            skipped: 0,
            message: e?.message ?? "JSON parse error"
          };
        }
      }

      // valenced:@valenced/externals/react-native-safe-area-context
      var react_native_safe_area_context_exports = {};
      __export(react_native_safe_area_context_exports, {
        useSafeAreaInsets: () => useSafeAreaInsets
      });
      function useSafeAreaInsets() {
        return valenced.externals?.ReactNativeSafeAreaContext?.ReactNativeSafeAreaContext?.useSafeAreaInsets?.();
      }

      // source/shared/ui/safeArea.ts
      function useBottomPadding(base = 16) {
        try {
          var mod = react_native_safe_area_context_exports;
          var insets = mod?.useSafeAreaInsets?.();
          if (typeof insets?.bottom === "number") return insets.bottom + base;
        } catch {}
        return base;
      }

      // source/plugins/more-alts/js/ui/AccountUi.tsx
      function getValenced3() {
        return typeof valenced !== "undefined" ? valenced : globalThis.valenced;
      }
      function useCurrentAccount() {
        var rev = getValenced3();
        var [, refresh] = rev.react.React.useReducer(version => version + 1, 0);
        rev.react.React.useEffect(() => {
          var stores = rev.discord.flux?.Stores;
          var observed = [stores?.UserStore, stores?.MultiAccountStore].filter(store => store?.addChangeListener && store?.removeChangeListener);
          for (var store of observed) store.addChangeListener(refresh);
          return () => {
            for (var _store of observed) _store.removeChangeListener(refresh);
          };
        }, [rev]);
        return getCurrentUser();
      }
      var DARK = {
        page: "#17151a",
        panel: "#242127",
        mutedPanel: "#2d2730",
        selected: "#3e303c",
        line: "#443b45",
        text: "#f9f0f7",
        muted: "#c6b5c4",
        danger: "#ffadb7"
      };
      var LIGHT = {
        page: "#f8f3f7",
        panel: "#ffffff",
        mutedPanel: "#f0e8ef",
        selected: "#f1dce9",
        line: "#e1d3df",
        text: "#2d202c",
        muted: "#655662",
        danger: "#a21e34"
      };
      var HERO = {
        background: "#302131",
        line: "#66445d",
        text: "#fff6fc",
        muted: "#dfc7db",
        accent: "#f7c8e2",
        ink: "#36172c",
        active: "#a6e6c1"
      };
      var useTokenStyles;
      function usePalette() {
        var rev = getValenced3();
        var fallback = rev.react.ReactNative.useColorScheme?.() === "light" ? LIGHT : DARK;
        if (!useTokenStyles) {
          var tokens = rev.discord?.common?.tokens?.Tokens;
          var colors = (tokens?.default ?? tokens)?.colors;
          var design = rev.discord?.design?.Design;
          var styles = colors && design?.createStyles?.({
            page: {
              color: colors.BACKGROUND_BASE_LOWER
            },
            panel: {
              color: colors.BACKGROUND_SURFACE_HIGHEST
            },
            mutedPanel: {
              color: colors.BACKGROUND_MOD_SUBTLE
            },
            selected: {
              color: colors.BACKGROUND_MOD_STRONG
            },
            line: {
              color: colors.BORDER_SUBTLE
            },
            text: {
              color: colors.TEXT_DEFAULT
            },
            muted: {
              color: colors.TEXT_MUTED
            },
            danger: {
              color: colors.TEXT_DANGER
            }
          });
          useTokenStyles = typeof styles === "function" ? styles : () => styles ?? {};
        }
        var themed = useTokenStyles();
        return {
          page: themed.page?.color ?? fallback.page,
          panel: themed.panel?.color ?? fallback.panel,
          mutedPanel: themed.mutedPanel?.color ?? fallback.mutedPanel,
          selected: themed.selected?.color ?? fallback.selected,
          line: themed.line?.color ?? fallback.line,
          text: themed.text?.color ?? fallback.text,
          muted: themed.muted?.color ?? fallback.muted,
          danger: themed.danger?.color ?? fallback.danger
        };
      }
      function Glyph({
        names,
        color,
        size = 18
      }) {
        var rev = getValenced3();
        var {
          Image
        } = rev.react.ReactNative;
        for (var name of names) {
          var source = rev.assets?.getAssetIdByName?.(name);
          if (source != null) return /* @__PURE__ */valenced.react.React.createElement(Image, {
            accessible: false,
            source,
            style: {
              width: size,
              height: size,
              tintColor: color
            }
          });
        }
        return null;
      }
      function Avatar({
        user,
        size = 42,
        border,
        active = false
      }) {
        var {
          Image,
          View: View2
        } = getValenced3().react.ReactNative;
        var uri = user?.id && user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : "https://cdn.discordapp.com/embed/avatars/0.png";
        return /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            width: size,
            height: size
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Image, {
          accessible: false,
          source: {
            uri
          },
          style: {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: border
          }
        }), active && /* @__PURE__ */valenced.react.React.createElement(View2, {
          accessible: false,
          style: {
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 15,
            height: 15,
            borderRadius: 8,
            backgroundColor: HERO.active,
            borderColor: HERO.background,
            borderWidth: 3
          }
        }));
      }
      function AccountRow({
        account,
        colors,
        showTag,
        detail,
        trailing,
        onPress,
        active = false,
        divider = false,
        actionLabel
      }) {
        var {
          View: View2,
          Text,
          Pressable: Pressable2
        } = getValenced3().react.ReactNative;
        var name = account.displayName || account.username;
        var tag = showTag && account.discriminator && account.discriminator !== "0" ? `#${account.discriminator}` : "";
        var handle = `@${account.username}${tag}`;
        return /* @__PURE__ */valenced.react.React.createElement(Pressable2, {
          accessibilityRole: onPress ? "button" : void 0,
          accessibilityLabel: [name, handle, account.isBot ? "Bot" : "", trailing, onPress && actionLabel].filter(Boolean).join(", "),
          accessibilityState: active ? {
            selected: true
          } : void 0,
          onPress,
          style: ({
            pressed
          }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            minHeight: 68,
            borderTopWidth: divider ? 1 : 0,
            borderColor: colors.line,
            backgroundColor: active || pressed ? colors.mutedPanel : colors.panel
          })
        }, /* @__PURE__ */valenced.react.React.createElement(Avatar, {
          user: account,
          border: colors.line
        }), /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flex: 1,
            minWidth: 0,
            gap: 3
          }
        }, /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: 7
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          numberOfLines: 2,
          style: {
            flexShrink: 1,
            color: colors.text,
            fontSize: 16,
            fontWeight: "700"
          }
        }, name), account.isBot && /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            backgroundColor: colors.selected,
            color: colors.text,
            borderRadius: 5,
            paddingHorizontal: 5,
            paddingVertical: 2,
            fontSize: 11,
            fontWeight: "700"
          }
        }, "BOT")), /* @__PURE__ */valenced.react.React.createElement(Text, {
          numberOfLines: 2,
          style: {
            color: colors.muted,
            fontSize: 13
          }
        }, detail ? `${handle} \xB7 ${detail}` : handle)), trailing && /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: colors.text,
            backgroundColor: colors.selected,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 5,
            fontSize: 12,
            fontWeight: "600"
          }
        }, trailing), onPress && /* @__PURE__ */valenced.react.React.createElement(Glyph, {
          names: actionLabel === "Account actions" ? ["MoreHorizontalIcon", "ic_more_24px"] : ["ChevronSmallRightIcon", "ChevronRightIcon"],
          color: colors.muted
        }));
      }

      // source/plugins/more-alts/js/ui/AddAccountSheet.tsx
      var sheetKey = "more-alts-add-account";
      function openAddAccountSheet(storage, onDone) {
        var rev = getValenced3();
        var actions = rev?.discord?.actions?.ActionSheetActionCreators;
        if (!actions?.openLazy) return;
        actions.openLazy(Promise.resolve({
          default: () => {
            var React2 = rev.react.React;
            var {
              View: View2,
              ScrollView: ScrollView2,
              Text
            } = rev.react.ReactNative;
            var {
              ActionSheet,
              BottomSheetTitleHeader,
              ActionSheetCloseButton,
              TableRowGroup,
              TableRow,
              Stack,
              Button,
              TextInput
            } = rev.discord.design.Design;
            var [mode, setMode] = React2.useState("choose");
            var [email, setEmail] = React2.useState("");
            var [password, setPassword] = React2.useState("");
            var [token, setToken] = React2.useState("");
            var [statusMsg, setStatusMsg] = React2.useState(null);
            var [loading, setLoading] = React2.useState(false);
            var colors = usePalette();
            var currentUser = useCurrentAccount();
            var bottomPadding = useBottomPadding(16);
            var close = () => actions.hideActionSheet(sheetKey);
            var handleAddCurrent = async () => {
              setLoading(true);
              setStatusMsg(null);
              var res = await addCurrentAccount(storage);
              setLoading(false);
              if (res.success) {
                onDone?.();
                close();
              } else {
                setStatusMsg(res.message);
              }
            };
            var handleAddCredentials = async () => {
              setLoading(true);
              setStatusMsg(null);
              var res = await addAccountWithCredentials(storage, email, password);
              setLoading(false);
              if (res.success) {
                onDone?.();
                close();
              } else {
                setStatusMsg(res.message);
              }
            };
            var handleAddToken = async () => {
              setLoading(true);
              setStatusMsg(null);
              var res = await addAccountWithToken(storage, token);
              setLoading(false);
              if (res.success) {
                onDone?.();
                close();
              } else {
                setStatusMsg(res.message);
              }
            };
            var handlePasteToken = async () => {
              try {
                var clip = rev.discord?.common?.Clipboard ?? rev.externals?.ReactNativeClipboard;
                if (clip?.getString) {
                  var text = await clip.getString();
                  if (text) setToken(text.trim());
                }
              } catch {}
            };
            return /* @__PURE__ */valenced.react.React.createElement(ActionSheet, null, /* @__PURE__ */valenced.react.React.createElement(BottomSheetTitleHeader, {
              title: "Add Account",
              trailing: /* @__PURE__ */valenced.react.React.createElement(ActionSheetCloseButton, {
                onPress: close
              })
            }), /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
              style: {
                maxHeight: 520
              },
              keyboardShouldPersistTaps: "handled",
              contentContainerStyle: {
                padding: 16,
                paddingTop: 4,
                paddingBottom: bottomPadding
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Stack, {
              spacing: 16
            }, statusMsg && /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                backgroundColor: colors.mutedPanel,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.line
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Text, {
              accessibilityLiveRegion: "polite",
              style: {
                color: colors.danger,
                fontSize: 14,
                fontWeight: "600"
              }
            }, statusMsg)), mode === "choose" && /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "Current Discord session"
            }, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "Save Currently Logged-in Account",
              subLabel: currentUser?.username ? `@${currentUser.username}` : "Save the account active in Discord.",
              icon: /* @__PURE__ */valenced.react.React.createElement(Avatar, {
                user: currentUser,
                size: 34,
                border: colors.line
              }),
              onPress: handleAddCurrent,
              disabled: loading,
              arrow: true
            })), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "Other sign-in options"
            }, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "Sign in with Email & Password",
              subLabel: "Use an email address or phone number.",
              icon: /* @__PURE__ */valenced.react.React.createElement(Glyph, {
                names: ["EnvelopeIcon", "MailIcon"],
                color: colors.muted
              }),
              disabled: loading,
              onPress: () => {
                setStatusMsg(null);
                setMode("credentials");
              },
              arrow: true
            }), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "Add with Token",
              subLabel: "Use a Discord user or bot token.",
              icon: /* @__PURE__ */valenced.react.React.createElement(Glyph, {
                names: ["KeyIcon", "LockIcon"],
                color: colors.muted
              }),
              disabled: loading,
              onPress: () => {
                setStatusMsg(null);
                setMode("token");
              },
              arrow: true
            }))), mode === "credentials" && /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "Discord credentials"
            }, /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 12
              }
            }, /* @__PURE__ */valenced.react.React.createElement(TextInput, {
              label: "Email or Phone",
              value: email,
              onChange: t => setEmail(t),
              placeholder: "user@example.com",
              keyboardType: "email-address",
              editable: !loading
            }), /* @__PURE__ */valenced.react.React.createElement(TextInput, {
              label: "Password",
              value: password,
              onChange: t => setPassword(t),
              placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
              secureTextEntry: true,
              editable: !loading
            }))), /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                flexDirection: "row",
                gap: 10
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Button, {
              variant: "secondary",
              text: "Back",
              onPress: () => setMode("choose"),
              style: {
                flex: 1
              }
            }), /* @__PURE__ */valenced.react.React.createElement(Button, {
              variant: "primary",
              text: loading ? "Logging in..." : "Sign In",
              onPress: handleAddCredentials,
              disabled: loading || !email.trim() || !password.trim(),
              style: {
                flex: 2
              }
            }))), mode === "token" && /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "Authentication token"
            }, /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 10
              }
            }, /* @__PURE__ */valenced.react.React.createElement(TextInput, {
              label: "Discord Token",
              value: token,
              onChange: t => setToken(t),
              placeholder: "Paste user or bot token...",
              secureTextEntry: true,
              editable: !loading
            }), /* @__PURE__ */valenced.react.React.createElement(Button, {
              size: "sm",
              variant: "secondary",
              text: "Paste from Clipboard",
              onPress: handlePasteToken
            }))), /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                flexDirection: "row",
                gap: 10
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Button, {
              variant: "secondary",
              text: "Back",
              onPress: () => setMode("choose"),
              style: {
                flex: 1
              }
            }), /* @__PURE__ */valenced.react.React.createElement(Button, {
              variant: "primary",
              text: loading ? "Adding..." : "Add Account",
              onPress: handleAddToken,
              disabled: loading || !token.trim(),
              style: {
                flex: 2
              }
            }))))));
          }
        }), sheetKey, {}, "replaceTopSheet");
      }

      // source/plugins/more-alts/js/ui/AccountSwitcherSheet.tsx
      var key = "more-alts-quick-switcher";
      function openAccountSwitcherSheet(storage) {
        var rev = getValenced3();
        var actions = rev.discord.actions.ActionSheetActionCreators;
        if (!actions?.openLazy) return;
        function Switcher() {
          var React2 = rev.react.React;
          var {
            View: View2,
            ScrollView: ScrollView2,
            Text,
            Alert
          } = rev.react.ReactNative;
          var {
            ActionSheet,
            BottomSheetTitleHeader,
            ActionSheetCloseButton,
            Button
          } = rev.discord.design.Design;
          var colors = usePalette();
          var bottomPadding = useBottomPadding(16);
          var [switchingId, setSwitchingId] = React2.useState(null);
          var inFlight = React2.useRef(false);
          var prefs = storage.use();
          var currentId = useCurrentAccount()?.id;
          var accounts = getAllAccounts(storage);
          var current = accounts.find(account => account.id === currentId);
          var sorted = current ? [current, ...accounts.filter(account => account !== current)] : accounts;
          var close = () => actions.hideActionSheet(key);
          var handleSwitch = async account => {
            if (account.id === currentId || inFlight.current) return;
            inFlight.current = true;
            setSwitchingId(account.id);
            try {
              if (await switchToAccount(account)) close();else Alert.alert("Could not switch accounts", "Sign into this account again in Discord, then add it to More Alts.");
            } finally {
              inFlight.current = false;
              setSwitchingId(null);
            }
          };
          return /* @__PURE__ */valenced.react.React.createElement(ActionSheet, {
            header: /* @__PURE__ */valenced.react.React.createElement(BottomSheetTitleHeader, {
              title: "Switch account",
              trailing: /* @__PURE__ */valenced.react.React.createElement(ActionSheetCloseButton, {
                onPress: close
              })
            })
          }, /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
            style: {
              maxHeight: 480
            },
            contentContainerStyle: {
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: bottomPadding,
              gap: 13
            },
            keyboardShouldPersistTaps: "handled"
          }, /* @__PURE__ */valenced.react.React.createElement(View2, {
            style: {
              borderRadius: 17,
              overflow: "hidden",
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.line
            }
          }, sorted.length ? sorted.map((account, index) => {
            var active = account.id === currentId;
            return /* @__PURE__ */valenced.react.React.createElement(AccountRow, {
              key: account.id,
              account,
              colors,
              showTag: prefs?.enableCLI !== false,
              active,
              divider: index > 0,
              trailing: active ? "Active" : switchingId === account.id ? "Switching\u2026" : void 0,
              actionLabel: "Switch account",
              onPress: !active && switchingId == null ? () => handleSwitch(account) : void 0
            });
          }) : /* @__PURE__ */valenced.react.React.createElement(Text, {
            style: {
              color: colors.muted,
              padding: 16,
              fontSize: 14
            }
          }, "Add an account to start switching.")), /* @__PURE__ */valenced.react.React.createElement(Button, {
            variant: "secondary",
            text: "Add account",
            onPress: () => openAddAccountSheet(storage),
            disabled: switchingId != null
          })));
        }
        actions.openLazy(Promise.resolve({
          default: Switcher
        }), key, {});
      }

      // source/plugins/more-alts/js/patches/tabBarLongPress.tsx
      function getValenced4() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      }
      function patchTabBarLongPress(storage) {
        var cleanups = [];
        var rev = getValenced4();
        var React2 = rev.react.React;
        var patched = /* @__PURE__ */new WeakSet();
        var patchTabItem = target => {
          var component = target?.default ?? target;
          if (!component || patched.has(component)) return;
          try {
            var unpatch = rev.patcher.after(component, typeof component === "function" ? void 0 : "type", res => {
              if (!res || !res.props) return res;
              try {
                var isYouTab = res.props.accessibilityLabel?.toLowerCase?.().includes("you") || res.props.accessibilityLabel?.toLowerCase?.().includes("profile") || res.props.accessibilityLabel?.toLowerCase?.().includes("account") || res.props.name === "you" || res.props.route?.name === "you" || res.props.tab?.id === "you" || res.props.id === "you";
                if (isYouTab) {
                  var originalLongPress = res.props.onLongPress;
                  if (storage.cache?.enableNativeSwitcher !== false && typeof originalLongPress === "function") {
                    return res;
                  }
                  return React2.cloneElement(res, {
                    onLongPress: (...lpArgs) => {
                      if (typeof originalLongPress === "function") {
                        try {
                          originalLongPress(...lpArgs);
                          return;
                        } catch {}
                      }
                      try {
                        openAccountSwitcherSheet(storage);
                      } catch (e) {
                        console.error("[MoreAlts] Failed to open switcher sheet on long press:", e);
                      }
                    }
                  });
                }
              } catch (e) {
                console.error("[MoreAlts] Tab item clone error:", e);
              }
              return res;
            });
            cleanups.push(unpatch);
            patched.add(component);
          } catch (e) {
            console.error("[MoreAlts] Failed to patch tab item:", e);
          }
        };
        var tabComponentNames = ["TabBarItem", "BottomTabBarItem", "BottomTabItem", "MobileBottomTabItem", "TabButton", "BottomTabButton", "NavigationTabButton", "YouTab", "UserAccountTab"];
        var _loop2 = function () {
          try {
            var finders = rev.modules.finders;
            var filter = finders.filters.withName(name);
            var unsub = finders.getModules(filter, patchTabItem, {
              returnNamespace: true
            });
            cleanups.push(() => unsub?.());
          } catch {}
        };
        for (var name of tabComponentNames) {
          _loop2();
        }
        return () => {
          for (var fn of cleanups) {
            try {
              fn();
            } catch {}
          }
        };
      }

      // valenced:@valenced/externals/react-navigation
      var ReactNavigationNative = valenced.externals?.ReactNavigation?.ReactNavigationNative;

      // valenced:@valenced/components
      var Page = valenced.components?.Page;

      // valenced:@valenced/discord/actions
      var {
        AlertActionCreators
      } = valenced.discord.actions;

      // valenced:@valenced/discord/design
      var {
        Design
      } = valenced.discord.design;

      // valenced:@valenced/discord/modules/settings
      var settings_exports = {};
      __export(settings_exports, {
        onSettingsModulesLoaded: () => onSettingsModulesLoaded,
        refreshSettings: () => refreshSettings,
        refreshSettingsNavigator: () => refreshSettingsNavigator,
        refreshSettingsOverviewScreen: () => refreshSettingsOverviewScreen,
        registerSettingsItem: () => registerSettingsItem
      });
      var {
        registerSettingsItem,
        onSettingsModulesLoaded,
        refreshSettings,
        refreshSettingsNavigator,
        refreshSettingsOverviewScreen
      } = valenced.discord.modules.settings;

      // valenced:@valenced/react
      var {
        React
      } = valenced.react;

      // valenced:react-native
      var react_native_exports = {};
      __export(react_native_exports, {
        Dimensions: () => Dimensions,
        Pressable: () => Pressable,
        ScrollView: () => ScrollView,
        View: () => View
      });
      var {
        Dimensions,
        Pressable,
        ScrollView,
        View
      } = valenced.react.ReactNative;

      // source/shared/report.ts
      var MAX_QUEUED = 20;
      var reporter;
      var queued = [];
      var seen = /* @__PURE__ */new Set();
      function reportError(context, error) {
        var wrapped = withContext(context, error);
        var key2 = wrapped instanceof Error ? wrapped.message : String(wrapped);
        if (seen.has(key2)) return;
        seen.add(key2);
        if (reporter) send(wrapped);else if (queued.length < MAX_QUEUED) queued.push(wrapped);
      }
      function send(error) {
        try {
          reporter?.reportError(error);
        } catch {}
      }
      function withContext(context, error) {
        if (error === void 0) return new Error(context);
        if (!context) return error;
        var message = error instanceof Error ? error.message : String(error);
        var wrapped = new Error(`${context} ${message}`);
        if (error instanceof Error && typeof error.stack === "string") {
          var frames = error.stack.split("\n").slice(1).join("\n");
          if (frames) wrapped.stack = `${wrapped.name}: ${wrapped.message}
${frames}`;
        }
        return wrapped;
      }

      // source/shared/changelog.tsx
      function getValenced5() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        try {
          if (typeof revenge !== "undefined") return revenge;
        } catch {}
        return globalThis.valenced ?? globalThis.revenge;
      }
      var registered;
      var SEEN_KEY = "changelogSeenVersion";
      var DIALOG_VERSIONS = 3;
      var changelogRoute = id => `${id}.changelog`;
      function versionString(version) {
        if (typeof version === "string") return version;
        if (version && Array.isArray(version.nums)) {
          return version.nums.join(".") + (version.label ? `-${version.label}` : "");
        }
        return String(version ?? "");
      }
      function parse(version) {
        var [main, pre] = String(version).split("-", 2);
        return {
          nums: main.split(".").map(n => Number.parseInt(n, 10) || 0),
          pre
        };
      }
      function compareVersions(a, b) {
        var x = parse(a);
        var y = parse(b);
        for (var i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
          var d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
          if (d) return d;
        }
        if (x.pre === y.pre) return 0;
        if (x.pre === void 0) return 1;
        if (y.pre === void 0) return -1;
        return x.pre.localeCompare(y.pre, void 0, {
          numeric: true
        });
      }
      function setupChangelog(api, entries, options = {}) {
        var manifest = api?.plugin?.manifest ?? {};
        var plugin2 = {
          id: manifest.id,
          name: manifest.name ?? manifest.id,
          current: versionString(manifest.version),
          entries: [...entries].sort((a, b) => compareVersions(b.version, a.version)),
          storage: api?.jsonStorage,
          latestOnly: options.latestOnly
        };
        registered = plugin2;
        var unregisterPage = registerPage(plugin2);
        checkForUpdate(plugin2).catch(error => reportError(`[${plugin2.name}] changelog check failed:`, error));
        return () => {
          if (registered === plugin2) registered = void 0;
          unregisterPage();
        };
      }
      async function checkForUpdate(plugin2) {
        if (!plugin2.storage) return;
        var data = await plugin2.storage.get();
        var seen2 = data?.[SEEN_KEY] ? versionString(data[SEEN_KEY]) : void 0;
        if (seen2 === plugin2.current) return;
        if (!seen2 || compareVersions(plugin2.current, seen2) < 0) {
          await plugin2.storage.set({
            [SEEN_KEY]: plugin2.current
          });
          return;
        }
        var fresh = plugin2.entries.filter(e => compareVersions(e.version, seen2) > 0 && compareVersions(e.version, plugin2.current) <= 0);
        if (fresh.length) {
          plugin2.pending = plugin2.latestOnly ? fresh.slice(0, 1) : fresh;
          showWhatsNew(plugin2, plugin2.pending, () => {
            try {
              var rev = getValenced5();
              var nav = rev?.discord?.modules?.mainTabsV2?.RootNavigationRef?.getRootNavigationRef?.() ?? globalThis?.valenced?.discord?.modules?.mainTabsV2?.RootNavigationRef?.getRootNavigationRef?.();
              nav?.navigate?.(changelogRoute(plugin2.id));
            } catch {}
          });
          await plugin2.storage.set({
            [SEEN_KEY]: plugin2.current
          });
        } else {
          await plugin2.storage.set({
            [SEEN_KEY]: plugin2.current
          });
        }
      }
      function Bullets({
        changes
      }) {
        var rev = getValenced5();
        var rn = rev?.react?.ReactNative ?? globalThis.ReactNative ?? react_native_exports;
        var View2 = rn.View ?? "View";
        var design = rev?.discord?.design?.Design ?? Design ?? {};
        var Text = design.Text ?? "Text";
        return /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            gap: 4
          }
        }, changes.map((change, i) => /* @__PURE__ */valenced.react.React.createElement(View2, {
          key: i,
          style: {
            flexDirection: "row"
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          variant: "text-sm/normal",
          color: "text-muted",
          style: {
            width: 14
          }
        }, "\u2022"), /* @__PURE__ */valenced.react.React.createElement(Text, {
          variant: "text-sm/normal",
          color: "text-muted",
          style: {
            flex: 1
          }
        }, change))));
      }
      function versionHeading(entry) {
        return entry.title ? `${entry.version} \xB7 ${entry.title}` : entry.version;
      }
      function showWhatsNew(plugin2, entries, openChangelog) {
        var rev = getValenced5();
        var rn = rev?.react?.ReactNative ?? globalThis.ReactNative ?? react_native_exports;
        var ScrollView2 = rn.ScrollView ?? "ScrollView";
        var View2 = rn.View ?? "View";
        var Dimensions2 = rn.Dimensions ?? {
          get: () => ({
            height: 800
          })
        };
        var design = rev?.discord?.design?.Design ?? Design ?? {};
        var {
          AlertModal = View2,
          AlertActionButton = View2,
          Text = "Text"
        } = design;
        var alerts = rev?.discord?.actions?.AlertActionCreators ?? AlertActionCreators;
        if (!alerts?.openAlert) return;
        var key2 = `rosie-whats-new-${plugin2.id}`;
        var close = () => alerts.dismissAlert(key2);
        var shown = entries.slice(0, DIALOG_VERSIONS);
        var more = entries.length - shown.length;
        var content = /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
          style: {
            maxHeight: Math.round(Dimensions2.get("window").height * 0.5)
          },
          nestedScrollEnabled: true
        }, /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            gap: 12
          }
        }, shown.map(entry => /* @__PURE__ */valenced.react.React.createElement(View2, {
          key: entry.version,
          style: {
            gap: 4
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          variant: "text-sm/semibold",
          color: "text-default"
        }, versionHeading(entry)), /* @__PURE__ */valenced.react.React.createElement(Bullets, {
          changes: entry.changes
        }))), more > 0 ? /* @__PURE__ */valenced.react.React.createElement(Text, {
          variant: "text-sm/normal",
          color: "text-muted"
        }, "And ", more, " more version", more === 1 ? "" : "s", " in the full changelog.") : null));
        try {
          alerts.openAlert(key2, /* @__PURE__ */valenced.react.React.createElement(AlertModal, {
            title: `What's new in ${plugin2.name} ${plugin2.current}`,
            extraContent: content,
            actions: /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(AlertActionButton, {
              text: "Full changelog",
              variant: "primary",
              onPress: () => {
                close();
                openChangelog();
              }
            }), /* @__PURE__ */valenced.react.React.createElement(AlertActionButton, {
              text: "Close",
              variant: "secondary",
              onPress: close
            }))
          }));
        } catch (error) {
          reportError(`[${plugin2.name}] couldn't show what's new:`, error);
        }
      }
      function refreshSettingsUI() {
        var settings = settings_exports;
        if (typeof settings.refreshSettings === "function") {
          settings.refreshSettings();
          return;
        }
        settings.refreshSettingsNavigator?.();
        settings.refreshSettingsOverviewScreen?.();
      }
      function registerPage(plugin2) {
        var {
          registerSettingsItem: registerSettingsItem2,
          onSettingsModulesLoaded: onSettingsModulesLoaded2
        } = settings_exports;
        var route = changelogRoute(plugin2.id);
        var unregister;
        var unsubscribe = onSettingsModulesLoaded2(() => {
          unregister = registerSettingsItem2(route, {
            parent: null,
            type: "route",
            useTitle: () => "Changelog",
            screen: {
              route,
              getComponent: () => ChangelogPage
            }
          });
          refreshSettingsUI();
        });
        return () => {
          unsubscribe();
          unregister?.();
          unregister = void 0;
          refreshSettingsUI();
        };
      }
      function ChangelogPage() {
        var rev = getValenced5();
        var rn = rev?.react?.ReactNative ?? globalThis.ReactNative ?? react_native_exports;
        var ScrollView2 = rn.ScrollView ?? "ScrollView";
        var View2 = rn.View ?? "View";
        var design = rev?.discord?.design?.Design ?? Design ?? {};
        var {
          Stack = View2,
          Text = "Text",
          TableRowGroup = View2,
          TableRow = View2
        } = design;
        var Page2 = Page ?? View2;
        var bottom = useBottomPadding();
        var plugin2 = registered;
        if (!plugin2) return null;
        return /* @__PURE__ */valenced.react.React.createElement(Page2, null, /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
          contentContainerStyle: {
            paddingBottom: bottom
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Stack, {
          spacing: 24
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          color: "text-muted",
          variant: "text-sm/normal"
        }, "Every version of ", plugin2.name, ", newest first. You have ", plugin2.current, "."), plugin2.entries.map(entry => {
          var tag = entry.version === plugin2.current ? " \xB7 installed" : "";
          return /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
            key: entry.version,
            title: `${entry.version}${tag}${entry.date ? ` \xB7 ${entry.date}` : ""}`
          }, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
            label: entry.title ?? `Version ${entry.version}`,
            subLabel: /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                marginTop: 6
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Bullets, {
              changes: entry.changes
            }))
          }));
        }))));
      }

      // source/plugins/more-alts/js/changelog.ts
      var CHANGELOG = [{
        version: "0.0.0.1",
        date: "2026-10-18",
        title: "Alpha Release",
        changes: ["Manage and switch between multiple Discord accounts, plus unlocks Discord's own native multi-account switcher."]
      }];

      // valenced:react
      var react_default = valenced.react.React;

      // source/plugins/more-alts/js/lib/types.ts
      var DEFAULT_STORAGE = {
        accounts: {},
        accountOrder: [],
        enableCLI: true,
        confirmBeforeDelete: true,
        enableUnsafeFeatures: false,
        addToSidebar: true,
        enableNativeSwitcher: true,
        blockOtherAccountNotifications: true,
        persistentStorageVault: true,
        sharedInboxEnabled: false
      };
      async function upgradeLegacyStorage(storage) {
        var current = storage.cache;
        if (!current?.settings) return;
        var accounts = Object.fromEntries(Object.entries(current.accounts ?? {}).map(([id, value]) => {
          var account = value;
          return [id, {
            ...account,
            addedAt: account.addedAt ?? account.updatedAt ?? Date.now()
          }];
        }));
        var {
          settings,
          ...data
        } = current;
        await storage.set({
          ...DEFAULT_STORAGE,
          ...data,
          accounts,
          enableNativeSwitcher: data.enableNativeSwitcher ?? settings.enableNativeSwitcher ?? true
        }, true);
      }

      // source/plugins/more-alts/js/ui/InboxTab.tsx
      function InboxTab({
        inbox,
        enabled,
        setEnabled,
        accounts,
        currentId,
        colors,
        switchAccount
      }) {
        var rev = getValenced3();
        var {
          View: View2,
          Text,
          Alert
        } = rev.react.ReactNative;
        var {
          TableRowGroup,
          TableSwitchRow,
          TableRow
        } = rev.discord.design.Design;
        var [refreshStatus, setRefreshStatus] = rev.react.React.useState(null);
        var summaries = inbox.use()?.summaries ?? {};
        var checkedAt = currentId ? summaries[currentId]?.checkedAt : void 0;
        var refreshMessage = refreshStatus?.accountId === currentId && (refreshStatus?.saved || refreshStatus?.previousCheck === checkedAt) ? refreshStatus?.message : void 0;
        var saved = accounts.filter(account => !account.isBot);
        var current = saved.find(account => account.id === currentId);
        var ordered = current ? [current, ...saved.filter(account => account !== current)] : saved;
        return /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            gap: 6
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          accessibilityRole: "header",
          style: {
            color: colors.text,
            fontSize: 20,
            fontWeight: "800"
          }
        }, "Shared inbox"), /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: colors.muted,
            fontSize: 14,
            lineHeight: 20
          }
        }, "See the last recorded unread DM and server mention counts for your added accounts. Each account updates while it\u2019s active.")), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, null, /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Save inbox summaries",
          subLabel: "Keep counts on this device.",
          value: enabled,
          onValueChange: value => {
            setRefreshStatus(null);
            return setEnabled(value);
          }
        }), enabled && /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Refresh active account",
          disabled: !current,
          arrow: true,
          onPress: async () => {
            var result = await inbox.refresh();
            var message = {
              saved: "Inbox summary updated.",
              connecting: "Waiting for Discord to reconnect.",
              switching: "Waiting for this account to finish switching.",
              unavailable: "Discord hasn\u2019t provided unread counts yet. Try again after your chats load."
            }[result];
            setRefreshStatus({
              accountId: currentId,
              saved: result === "saved",
              previousCheck: checkedAt,
              message
            });
          }
        })), enabled && refreshMessage ? /* @__PURE__ */valenced.react.React.createElement(Text, {
          accessibilityLiveRegion: "polite",
          style: {
            color: colors.muted,
            fontSize: 14
          }
        }, refreshMessage) : null, enabled && (ordered.length ? /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "Added accounts"
        }, ordered.map(account => {
          var summary = summaries[account.id];
          var active = account.id === currentId;
          var detail = summary ? `${summary.unreadDms ?? "\u2014"} unread DM ${summary.unreadDms === 1 ? "chat" : "chats"} \xB7 ${summary.mentions ?? "\u2014"} server ${summary.mentions === 1 ? "mention" : "mentions"}
Checked ${new Date(summary.checkedAt).toLocaleString()}` : "Waiting for the first check";
          return /* @__PURE__ */valenced.react.React.createElement(TableRow, {
            key: account.id,
            label: `${account.displayName || account.username}${active ? " \xB7 Active" : ""}`,
            subLabel: detail,
            subLabelLineClamp: 4,
            icon: /* @__PURE__ */valenced.react.React.createElement(Avatar, {
              user: account,
              border: colors.line
            }),
            arrow: !active,
            onPress: active ? void 0 : () => switchAccount(account)
          });
        })) : /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: colors.muted,
            fontSize: 14
          }
        }, "Add a Discord account to start seeing its inbox summary.")), enabled && Object.keys(summaries).length > 0 && /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, null, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Clear saved summaries",
          variant: "danger",
          onPress: () => inbox.clear().catch(() => Alert.alert("Could not clear summaries"))
        })));
      }

      // source/plugins/more-alts/js/ui/Settings.tsx
      function formatDate(ts) {
        return new Date(ts).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        });
      }
      function Settings({
        api,
        inbox
      }) {
        var rev = getValenced3();
        var {
          ScrollView: ScrollView2,
          View: View2,
          Alert,
          Text,
          Pressable: Pressable2
        } = rev.react.ReactNative;
        var {
          TableRowGroup,
          TableSwitchRow,
          TableRow
        } = rev.discord.design.Design;
        var [tab, setTab] = react_default.useState("Accounts");
        var colors = usePalette();
        var bottomPadding = useBottomPadding(24);
        var storage = {
          ...DEFAULT_STORAGE,
          ...api.jsonStorage.use()
        };
        var currentUser = useCurrentAccount();
        var currentUserId = currentUser?.id;
        var accounts = getAllAccounts(api.jsonStorage);
        var otherAccounts = accounts.filter(account => account.id !== currentUserId);
        var handleSwitch = async account => {
          if (account.id === currentUserId) return;
          if (!(await switchToAccount(account))) {
            Alert.alert("Could not switch accounts", "Sign into this account again in Discord, then add it to More Alts.");
          }
        };
        var handleRemove = account => {
          var remove = async () => {
            await removeAccount(api.jsonStorage, account.id);
            await inbox?.remove(account.id);
          };
          if (storage.confirmBeforeDelete !== false) {
            Alert.alert("Remove Account", `Are you sure you want to remove "${account.username}" from More Alts?`, [{
              text: "Cancel",
              style: "cancel"
            }, {
              text: "Remove",
              style: "destructive",
              onPress: () => {
                void remove();
              }
            }]);
          } else {
            void remove();
          }
        };
        var handleAccountPress = account => {
          if (account.id === currentUserId) return;
          Alert.alert(account.displayName || account.username, `Choose an action for @${account.username}:`, [{
            text: "Switch to this Account",
            onPress: () => void handleSwitch(account)
          }, {
            text: "Remove Account",
            style: "destructive",
            onPress: () => handleRemove(account)
          }, {
            text: "Cancel",
            style: "cancel"
          }]);
        };
        var copyToClipboard = (text, successMsg) => {
          try {
            var clip = rev.discord?.common?.Clipboard ?? rev.externals?.ReactNativeClipboard;
            if (clip?.setString) {
              clip.setString(text);
              Alert.alert("Copied", successMsg);
              return;
            }
          } catch {}
          Alert.alert("Copy Failed", "Unable to access clipboard.");
        };
        var handleExport = () => {
          var json = exportAccountsJson(api.jsonStorage);
          copyToClipboard(json, `Exported ${accounts.length} accounts to clipboard!`);
        };
        var handleImport = async () => {
          try {
            var clip = rev.discord?.common?.Clipboard ?? rev.externals?.ReactNativeClipboard;
            var clipboardText = (await clip?.getString?.()) || "";
            if (!clipboardText.trim()) {
              Alert.alert("Import", "Clipboard is empty. Please copy valid export JSON first.");
              return;
            }
            var res = await importAccountsJson(api.jsonStorage, clipboardText);
            if (res.success) {
              Alert.alert("Import Complete", `Imported ${res.imported} accounts (${res.skipped} skipped duplicates).`);
            } else {
              Alert.alert("Import Failed", res.message || "Invalid JSON format");
            }
          } catch (e) {
            Alert.alert("Import Error", e?.message ?? String(e));
          }
        };
        var confirmLogout = () => Alert.alert("Force Logout", "This signs you out of the current Discord session. Your other saved accounts stay in More Alts.", [{
          text: "Cancel",
          style: "cancel"
        }, {
          text: "Force Logout",
          style: "destructive",
          onPress: () => forceLogout()
        }]);
        var toggle = (key2, label, subLabel) => /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label,
          subLabel,
          value: storage[key2],
          onValueChange: value => api.jsonStorage.set({
            [key2]: value
          })
        });
        return /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flex: 1,
            backgroundColor: colors.page
          }
        }, /* @__PURE__ */valenced.react.React.createElement(View2, {
          accessibilityRole: "tablist",
          style: {
            flexDirection: "row",
            gap: 4,
            padding: 4,
            marginHorizontal: 16,
            marginTop: 12,
            marginBottom: 4,
            borderRadius: 16,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.line
          }
        }, ["Accounts", "Inbox", "Preferences"].map(name => /* @__PURE__ */valenced.react.React.createElement(Pressable2, {
          key: name,
          accessibilityRole: "tab",
          accessibilityLabel: name,
          accessibilityState: {
            selected: tab === name
          },
          onPress: () => setTab(name),
          style: ({
            pressed
          }) => ({
            flex: name === "Preferences" ? 1.2 : name === "Inbox" ? 0.8 : 1,
            minHeight: 44,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            paddingHorizontal: 6,
            backgroundColor: tab === name ? colors.selected : pressed ? colors.mutedPanel : "transparent"
          })
        }, /* @__PURE__ */valenced.react.React.createElement(Glyph, {
          names: name === "Accounts" ? ["UserMultipleIcon", "FriendsIcon"] : name === "Inbox" ? ["InboxIcon", "EnvelopeIcon"] : ["SettingsIcon", "CogIcon"],
          color: tab === name ? colors.text : colors.muted,
          size: 17
        }), /* @__PURE__ */valenced.react.React.createElement(Text, {
          numberOfLines: 1,
          style: {
            color: tab === name ? colors.text : colors.muted,
            fontSize: 14,
            fontWeight: "700",
            flexShrink: 1,
            textAlign: "center"
          }
        }, name)))), /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
          key: tab,
          style: {
            flex: 1
          },
          contentContainerStyle: {
            padding: 16,
            paddingBottom: bottomPadding,
            gap: 20
          },
          keyboardShouldPersistTaps: "handled"
        }, tab === "Accounts" ? /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            overflow: "hidden",
            padding: 16,
            gap: 17,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: HERO.line,
            backgroundColor: HERO.background
          }
        }, /* @__PURE__ */valenced.react.React.createElement(View2, {
          pointerEvents: "none",
          style: {
            position: "absolute",
            right: -41,
            top: -65,
            width: 187,
            height: 187,
            borderRadius: 100,
            backgroundColor: "#493047",
            borderColor: "#5b3c55",
            borderWidth: 1
          }
        }), /* @__PURE__ */valenced.react.React.createElement(View2, {
          pointerEvents: "none",
          style: {
            position: "absolute",
            right: -21,
            top: -46,
            width: 149,
            height: 149,
            borderRadius: 80,
            borderColor: "#63425c",
            borderWidth: 1
          }
        }), /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: 13
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Avatar, {
          user: currentUser,
          size: 62,
          border: HERO.line,
          active: !!currentUserId
        }), /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flex: 1,
            minWidth: 0,
            gap: 3
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: HERO.accent,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.2
          }
        }, "CURRENT ACCOUNT"), /* @__PURE__ */valenced.react.React.createElement(Text, {
          numberOfLines: 2,
          style: {
            color: HERO.text,
            fontSize: 23,
            lineHeight: 28,
            fontWeight: "800"
          }
        }, currentUser?.globalName || currentUser?.username || "No active session"), currentUser?.username && /* @__PURE__ */valenced.react.React.createElement(Text, {
          numberOfLines: 1,
          style: {
            color: HERO.muted,
            fontSize: 13
          }
        }, "@", currentUser.username))), /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flexDirection: "row",
            gap: 9
          }
        }, [["Switch account", ["SwapHorizontalIcon", "ArrowLeftRightIcon"], () => openAccountSwitcherSheet(api.jsonStorage)], ["Add account", ["PlusIcon", "ic_add_24px"], () => openAddAccountSheet(api.jsonStorage)]].map(([label, icons, onPress], index) => /* @__PURE__ */valenced.react.React.createElement(Pressable2, {
          key: label,
          accessibilityRole: "button",
          accessibilityLabel: label,
          onPress,
          style: ({
            pressed
          }) => ({
            flex: 1,
            minHeight: 46,
            borderRadius: 13,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingHorizontal: 5,
            opacity: pressed ? 0.77 : 1,
            backgroundColor: index ? "#453045" : HERO.accent,
            borderWidth: index ? 1 : 0,
            borderColor: HERO.line
          })
        }, /* @__PURE__ */valenced.react.React.createElement(Glyph, {
          names: icons,
          color: index ? HERO.text : HERO.ink,
          size: 17
        }), /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: index ? HERO.text : HERO.ink,
            fontSize: 14,
            fontWeight: "700",
            flexShrink: 1,
            textAlign: "center"
          }
        }, label))))), /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            gap: 10
          }
        }, /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            paddingHorizontal: 2
          }
        }, /* @__PURE__ */valenced.react.React.createElement(Text, {
          accessibilityRole: "header",
          style: {
            color: colors.text,
            fontSize: 18,
            fontWeight: "700"
          }
        }, currentUserId ? "Other accounts" : "Accounts"), /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: colors.muted,
            fontSize: 13
          }
        }, otherAccounts.length)), /* @__PURE__ */valenced.react.React.createElement(View2, {
          style: {
            borderRadius: 17,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.panel
          }
        }, otherAccounts.length ? otherAccounts.map((account, index) => /* @__PURE__ */valenced.react.React.createElement(AccountRow, {
          key: account.id,
          account,
          colors,
          showTag: storage.enableCLI,
          detail: account.isNative ? "Discord account" : Number.isFinite(account.addedAt) ? `Added ${formatDate(account.addedAt)}` : void 0,
          divider: index > 0,
          actionLabel: "Account actions",
          onPress: () => handleAccountPress(account)
        })) : /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: colors.muted,
            fontSize: 14,
            padding: 16
          }
        }, "Add another account to switch between your Discord sessions.")))) : tab === "Inbox" ? inbox ? /* @__PURE__ */valenced.react.React.createElement(InboxTab, {
          inbox,
          enabled: storage.sharedInboxEnabled,
          accounts,
          currentId: currentUserId,
          colors,
          switchAccount: handleSwitch,
          setEnabled: value => api.jsonStorage.set({
            sharedInboxEnabled: value
          })
        }) : /* @__PURE__ */valenced.react.React.createElement(Text, {
          style: {
            color: colors.muted,
            fontSize: 14
          }
        }, "Shared inbox is unavailable on this Valenced version.") : /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "Switching"
        }, toggle("enableNativeSwitcher", "Native Account Switcher", "Show Discord\u2019s built-in switcher on the You tab."), toggle("blockOtherAccountNotifications", "Block Background Notifications", "Mute notifications from your other accounts."), toggle("enableCLI", "Show Full Username Tag", "Show the #1234 suffix when an account has one.")), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "Storage & backup"
        }, toggle("persistentStorageVault", "Persistent Storage Vault", "Keep a local backup of saved Discord sessions."), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Import Accounts from Clipboard",
          subLabel: "Restore saved accounts from JSON.",
          arrow: true,
          onPress: handleImport
        }), toggle("enableUnsafeFeatures", "Enable Account Export", "Allow copying saved sessions and tokens as JSON."), storage.enableUnsafeFeatures && /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Export Accounts",
          subLabel: "Copy saved sessions and tokens as JSON.",
          arrow: true,
          onPress: handleExport
        })), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "Account management"
        }, toggle("confirmBeforeDelete", "Confirm Before Removing", "Ask before removing an account from More Alts."), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Force Logout Session",
          subLabel: "Sign out of the active Discord session.",
          variant: "danger",
          arrow: true,
          onPress: confirmLogout
        })))));
      }

      // source/plugins/more-alts/js/lib/inbox.ts
      function attempt(read) {
        try {
          return read();
        } catch {
          return void 0;
        }
      }
      function resolveConnection(rev, stores) {
        var gateway = attempt(() => stores.GatewayConnectionStore);
        if (typeof gateway?.isConnected === "function") return gateway;
        var exports = attempt(() => rev.discord.utils?.modules?.finders?.lookupModuleWithImportedPath?.("modules/gateway/GatewayConnectionStore.tsx")?.[0]);
        var imported = exports?.default ?? exports;
        if (typeof imported?.isConnected === "function") return imported;
        return attempt(() => stores.ConnectionStore);
      }
      function values(value) {
        if (!value || typeof value !== "object") return void 0;
        return typeof value.values === "function" ? [...value.values()] : Object.values(value);
      }
      function unreadDmCount(channels, read) {
        if (typeof read?.hasUnread !== "function") return null;
        var entries = values(attempt(() => channels?.getMutablePrivateChannels?.()) ?? attempt(() => channels?.getPrivateChannels?.()) ?? attempt(() => channels?.getSortedPrivateChannels?.()));
        if (!entries) return null;
        var ids = /* @__PURE__ */new Set();
        for (var entry of entries) {
          var item = entry?.channel ?? entry;
          var channel = typeof item === "string" ? channels.getChannel?.(item) : item;
          if (typeof channel?.id === "string" && (channel.type === 1 || channel.type === 3) && read.hasUnread(channel.id)) ids.add(channel.id);
        }
        return ids.size;
      }
      function serverMentionCount(guildRead, channels, read) {
        var total = attempt(() => guildRead?.getTotalMentionCount?.());
        if (Number.isSafeInteger(total) && total >= 0) return total;
        var states = values(read?.getAllReadStates?.(true));
        if (!states || typeof channels?.getChannel !== "function" || typeof read?.getMentionCount !== "function") return null;
        var ids = /* @__PURE__ */new Set();
        var mentions = 0;
        for (var state of states) {
          var id = state?.channelId;
          if (typeof id !== "string" || ids.has(id) || state.type != null && Number(state.type) !== 0) continue;
          var channel = channels.getChannel(id);
          if (!(channel?.guild_id ?? channel?.guildId)) continue;
          ids.add(id);
          var count = read.getMentionCount(id);
          if (Number.isSafeInteger(count) && count > 0) mentions += count;
        }
        return mentions;
      }
      function startSharedInbox(api) {
        var rev = api.unscoped;
        var storage = api.jsonStorage;
        var files = rev.jsonStorage;
        if (typeof files?.getJsonStorage !== "function" || typeof files?.pluginStoragePathFor !== "function") return void 0;
        var file = files.getJsonStorage(files.pluginStoragePathFor(api.plugin.manifest.id, "inbox.json"), {
          default: {
            summaries: {}
          }
        });
        var stores = rev.discord.flux.Stores;
        var connection = resolveConnection(rev, stores);
        var currentId = () => stores.UserStore?.getCurrentUser?.()?.id;
        var isConnected = () => attempt(() => connection?.isConnected?.()) === true;
        var cleanups = [];
        var active = true;
        var enabled = storage.cache?.sharedInboxEnabled === true;
        var connected = isConnected();
        var readyId = connected ? currentId() : void 0;
        var generation = 0;
        var timer;
        var pendingRefresh = false;
        var writes = Promise.resolve(file.get()).then(() => {}, () => {});
        function enqueue(update) {
          var write = writes.then(async () => {
            if (!active) return false;
            var next = update({
              summaries: file.cache?.summaries ?? {}
            });
            if (next) await file.set(next, true);
            return Boolean(next);
          });
          writes = write.then(() => {}, () => {});
          return write;
        }
        async function capture(force) {
          var id = currentId();
          if (!active || !enabled || !id || id !== readyId || !isConnected()) return false;
          var added = () => getAllAccounts(storage).some(account => account.id === id && !account.isBot);
          try {
            if (!added()) return false;
            var unreadDms = unreadDmCount(stores.ChannelStore, stores.ReadStateStore);
            var mentions = serverMentionCount(stores.GuildReadStateStore, stores.ChannelStore, stores.ReadStateStore);
            if (unreadDms === null && mentions === null) return false;
            var checkedAt = Date.now();
            var epoch = generation;
            return await enqueue(data => {
              if (!enabled || epoch !== generation || id !== currentId() || !isConnected() || !added()) return void 0;
              var previous = data.summaries[id];
              if (!force && previous?.unreadDms === unreadDms && previous?.mentions === mentions) return void 0;
              return {
                summaries: {
                  ...data.summaries,
                  [id]: {
                    checkedAt,
                    unreadDms,
                    mentions
                  }
                }
              };
            });
          } catch {
            return false;
          }
        }
        function cancel() {
          if (timer !== void 0) clearTimeout(timer);
          timer = void 0;
          pendingRefresh = false;
          generation++;
        }
        function schedule(force = false) {
          if (!active || !enabled || !readyId) return;
          pendingRefresh ||= force;
          if (timer !== void 0) return;
          timer = setTimeout(() => {
            timer = void 0;
            var refresh = pendingRefresh;
            pendingRefresh = false;
            void capture(refresh);
          }, 600);
        }
        function disconnected() {
          connected = false;
          readyId = void 0;
          cancel();
        }
        function connectedSession() {
          if (!active || !isConnected()) return;
          connected = true;
          var id = currentId();
          if (readyId === id) return;
          cancel();
          readyId = id;
          schedule(true);
        }
        function listen(store, fn) {
          if (!store?.addChangeListener || !store?.removeChangeListener) return;
          store.addChangeListener(fn);
          cleanups.push(() => store.removeChangeListener(fn));
        }
        listen(connection, () => {
          if (!isConnected()) disconnected();else if (!connected) connectedSession();
        });
        listen(stores.UserStore, () => {
          if (readyId && readyId !== currentId()) {
            readyId = void 0;
            cancel();
          }
        });
        for (var store of [stores.ChannelStore, stores.ReadStateStore, stores.GuildReadStateStore, stores.MultiAccountStore]) {
          listen(store, () => schedule());
        }
        var dispatcher = rev.discord.flux.Dispatcher ?? rev.discord.common?.flux?.Dispatcher;
        var onConnectionOpen = () => {
          void Promise.resolve().then(connectedSession);
        };
        if (dispatcher?.subscribe && dispatcher?.unsubscribe) {
          var _loop3 = function (event, fn) {
            dispatcher.subscribe(event, fn);
            cleanups.push(() => dispatcher.unsubscribe(event, fn));
          };
          for (var [event, fn] of [["CONNECTION_OPEN", onConnectionOpen], ["CONNECTION_RESUMED", onConnectionOpen], ["CONNECTION_CLOSED", disconnected], ["LOGOUT", disconnected]]) {
            _loop3(event, fn);
          }
        }
        async function clear() {
          cancel();
          await enqueue(data => Object.keys(data.summaries).length ? {
            summaries: {}
          } : void 0);
        }
        cleanups.push(storage.subscribe(() => {
          var previous = enabled;
          enabled = storage.cache?.sharedInboxEnabled === true;
          if (enabled) schedule(!previous);else if (previous) void clear().catch(() => {});
        }));
        if (enabled) schedule(true);else void clear().catch(() => {});
        return {
          use: () => file.use(),
          async refresh() {
            if (!isConnected()) return "connecting";
            if (currentId() !== readyId) return "switching";
            cancel();
            return (await capture(true)) ? "saved" : "unavailable";
          },
          clear,
          async remove(id) {
            await enqueue(data => {
              if (!Object.hasOwn(data.summaries, id)) return void 0;
              var summaries = {
                ...data.summaries
              };
              delete summaries[id];
              return {
                summaries
              };
            });
          },
          stop() {
            active = false;
            cancel();
            for (var cleanup of cleanups) cleanup();
          }
        };
      }

      // source/plugins/more-alts/js/index.ts
      var sharedInbox;
      var index_default = plugin({
        jsonStorage: {
          load: true,
          default: DEFAULT_STORAGE
        },
        async start(api) {
          var active = true;
          api.cleanup(() => {
            active = false;
          });
          await upgradeLegacyStorage(api.jsonStorage);
          if (!active) return;
          await restoreFromNativeVault(api.jsonStorage, () => active);
          if (!active) return;
          syncNativeVault(api.jsonStorage);
          try {
            api.cleanup(setupChangelog(api, CHANGELOG));
          } catch {}
          if (api.plugin?.startedLate) {
            try {
              api.plugin.requireReload();
            } catch {}
          }
          var everest = api.unscoped?.everest ?? api.unscoped?.roselib ?? valenced?.everest ?? valenced?.roselib ?? globalThis?.__everest ?? globalThis?.__roselib;
          everest?.setActivePlugin?.(api.plugin?.manifest?.id ?? "rosie.more-alts");
          everest?.registerPlugin?.({
            id: api.plugin?.manifest?.id ?? "rosie.more-alts",
            name: api.plugin?.manifest?.name ?? "More Alts",
            icon: api.plugin?.manifest?.icon ?? "UserMultipleIcon",
            author: api.plugin?.manifest?.author ?? "Rosie",
            description: api.plugin?.manifest?.description ?? "",
            version: api.plugin?.manifest?.version,
            getStatus: () => api.plugin?.status,
            getErrors: () => api.plugin?.errors
          });
          var unpatchNative = () => {};
          try {
            unpatchNative = patchNativeSwitcher(api.jsonStorage);
          } catch (e) {
            api.logger?.error(`[MoreAlts] Failed to apply native switcher patch: ${e}`);
          }
          var unpatchLongPress = () => {};
          try {
            unpatchLongPress = patchTabBarLongPress(api.jsonStorage);
          } catch (e) {
            api.logger?.error(`[MoreAlts] Failed to apply tab bar long press patch: ${e}`);
          }
          try {
            var inbox = startSharedInbox(api);
            sharedInbox = inbox;
            api.cleanup(() => {
              inbox?.stop();
              if (sharedInbox === inbox) sharedInbox = void 0;
            });
          } catch (error) {
            api.logger?.warn?.(`[MoreAlts] Shared inbox unavailable: ${error}`);
          }
          api.cleanup(() => {
            unpatchNative();
            unpatchLongPress();
          });
        },
        SettingsComponent(props) {
          return props.api.unscoped.react.React.createElement(Settings, {
            ...props,
            inbox: sharedInbox
          });
        }
      });
      options = module.exports.default;
    }
    return options;
  }
  return {
    default: {
      jsonStorage: {
        load: true,
        default: {
          "accounts": {},
          "accountOrder": [],
          "enableCLI": true,
          "confirmBeforeDelete": true,
          "enableUnsafeFeatures": false,
          "addToSidebar": true,
          "enableNativeSwitcher": true,
          "blockOtherAccountNotifications": true,
          "persistentStorageVault": true,
          "sharedInboxEnabled": false
        }
      },
      start(api) {
        return load(api.unscoped).start(api);
      },
      SettingsComponent(props) {
        var api = props.api.unscoped;
        return api.react.React.createElement(load(api).SettingsComponent, props);
      }
    }
  };
})();
