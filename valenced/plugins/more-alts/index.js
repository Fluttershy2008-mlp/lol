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

      // source/plugins/more-alts/js/ui/AddAccountSheet.tsx
      function getValenced3() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      }
      function openAddAccountSheet(storage, onDone) {
        var rev = getValenced3();
        var actions = rev?.discord?.actions?.ActionSheetActionCreators;
        if (!actions?.openLazy) return;
        actions.openLazy(Promise.resolve({
          default: () => {
            var React2 = rev.react.React;
            var {
              View: View2,
              ScrollView: ScrollView2
            } = rev.react.ReactNative;
            var {
              ActionSheet,
              BottomSheetTitleHeader,
              ActionSheetCloseButton,
              TableRowGroup,
              TableRow,
              Stack,
              Button,
              Text,
              TextInput
            } = rev.discord.design.Design;
            var [mode, setMode] = React2.useState("choose");
            var [email, setEmail] = React2.useState("");
            var [password, setPassword] = React2.useState("");
            var [token, setToken] = React2.useState("");
            var [statusMsg, setStatusMsg] = React2.useState(null);
            var [loading, setLoading] = React2.useState(false);
            var handleAddCurrent = async () => {
              setLoading(true);
              setStatusMsg(null);
              var res = await addCurrentAccount(storage);
              setLoading(false);
              if (res.success) {
                onDone?.();
                actions.hideActionSheet();
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
                actions.hideActionSheet();
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
                actions.hideActionSheet();
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
                onPress: () => actions.hideActionSheet()
              })
            }), /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
              style: {
                maxHeight: 520
              },
              contentContainerStyle: {
                padding: 16
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Stack, {
              spacing: 16
            }, statusMsg && /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                backgroundColor: "rgba(237, 66, 69, 0.15)",
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: "rgba(237, 66, 69, 0.4)"
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Text, {
              variant: "text-sm/medium",
              color: "text-danger"
            }, statusMsg)), mode === "choose" && /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "CURRENT SESSION"
            }, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "Save Currently Logged-in Account",
              subLabel: "Adds the active account to your switcher vault",
              onPress: handleAddCurrent,
              disabled: loading,
              arrow: true
            })), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "NEW ACCOUNT"
            }, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "Sign in with Email & Password",
              subLabel: "Log in with Discord credentials directly",
              onPress: () => {
                setStatusMsg(null);
                setMode("credentials");
              },
              arrow: true
            }), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "Add with Token",
              subLabel: "Paste a Discord user or bot token",
              onPress: () => {
                setStatusMsg(null);
                setMode("token");
              },
              arrow: true
            }))), mode === "credentials" && /* @__PURE__ */valenced.react.React.createElement(valenced.react.React.Fragment, null, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: "DISCORD CREDENTIALS"
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
              title: "AUTHENTICATION TOKEN"
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
        }), "more-alts-add-account", {}, "replaceTopSheet");
      }

      // source/plugins/more-alts/js/ui/AccountSwitcherSheet.tsx
      function getValenced4() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      }
      function openAccountSwitcherSheet(storage) {
        var rev = getValenced4();
        var actions = rev.discord.actions.ActionSheetActionCreators;
        if (!actions?.openLazy) return;
        actions.openLazy(Promise.resolve({
          default: () => {
            var React2 = rev.react.React;
            var {
              View: View2,
              ScrollView: ScrollView2,
              Image,
              Alert
            } = rev.react.ReactNative;
            var {
              ActionSheet,
              BottomSheetTitleHeader,
              ActionSheetCloseButton,
              TableRowGroup,
              TableRow,
              Stack,
              Button,
              Text
            } = rev.discord.design.Design;
            var [loadingToken, setLoadingToken] = React2.useState(null);
            var cached = storage.cache ?? {};
            var currentUser = getCurrentUser();
            var currentUserId = currentUser?.id;
            var accounts = getAllAccounts(storage);
            var handleSwitch = async account => {
              if (account.id === currentUserId) return;
              var target = account.id;
              setLoadingToken(target);
              var ok = await switchToAccount(account);
              setLoadingToken(null);
              if (ok) {
                actions.hideActionSheet("more-alts-quick-switcher");
              } else {
                Alert.alert("Could not switch accounts", "Sign into this account again in Discord, then add it to More Alts.");
              }
            };
            return /* @__PURE__ */valenced.react.React.createElement(ActionSheet, {
              header: /* @__PURE__ */valenced.react.React.createElement(BottomSheetTitleHeader, {
                title: "Switch Account",
                subtitle: "Select an account to switch to",
                trailing: /* @__PURE__ */valenced.react.React.createElement(ActionSheetCloseButton, {
                  onPress: () => actions.hideActionSheet("more-alts-quick-switcher")
                })
              })
            }, /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
              contentContainerStyle: {
                padding: 16,
                paddingBottom: 32
              },
              keyboardShouldPersistTaps: "handled"
            }, /* @__PURE__ */valenced.react.React.createElement(Stack, {
              spacing: 16
            }, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
              title: `Accounts (${accounts.length})`
            }, accounts.length === 0 ? /* @__PURE__ */valenced.react.React.createElement(TableRow, {
              label: "No Saved Accounts",
              subLabel: "Tap '+ Add Account' below to save accounts for quick switching."
            }) : accounts.map(acc => {
              var isCurrent = acc.id === currentUserId;
              var target = acc.id;
              var isLoading = loadingToken === target;
              var avatarUrl = acc.avatar ? `https://cdn.discordapp.com/avatars/${acc.id}/${acc.avatar}.png?size=80` : "https://cdn.discordapp.com/embed/avatars/0.png";
              var displayName = cached.enableCLI !== false ? `${acc.username}${acc.discriminator && acc.discriminator !== "0" ? `#${acc.discriminator}` : ""}` : acc.displayName || acc.username;
              return /* @__PURE__ */valenced.react.React.createElement(TableRow, {
                key: acc.id,
                icon: /* @__PURE__ */valenced.react.React.createElement(Image, {
                  source: {
                    uri: avatarUrl
                  },
                  style: {
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: isCurrent ? 2 : 0,
                    borderColor: "#23A55A"
                  }
                }),
                label: /* @__PURE__ */valenced.react.React.createElement(View2, {
                  style: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6
                  }
                }, /* @__PURE__ */valenced.react.React.createElement(Text, {
                  variant: "text-md/semibold"
                }, displayName), acc.isBot && /* @__PURE__ */valenced.react.React.createElement(View2, {
                  style: {
                    backgroundColor: "#5865F2",
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1
                  }
                }, /* @__PURE__ */valenced.react.React.createElement(Text, {
                  style: {
                    color: "#FFFFFF",
                    fontSize: 9,
                    fontWeight: "bold"
                  }
                }, "BOT"))),
                subLabel: isCurrent ? "\u2713 Active Account" : acc.isNative ? "Discord Account" : `@${acc.username}`,
                onPress: isCurrent || !!loadingToken ? void 0 : () => handleSwitch(acc),
                trailing: isLoading ? /* @__PURE__ */valenced.react.React.createElement(Text, {
                  variant: "text-sm/normal",
                  color: "text-muted"
                }, "Switching...") : null
              });
            })), /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                flexDirection: "row",
                gap: 8
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Button, {
              variant: "secondary",
              text: "+ Add Account",
              style: {
                flex: 1
              },
              onPress: () => {
                openAddAccountSheet(storage);
              }
            })))));
          }
        }), "more-alts-quick-switcher", {});
      }

      // source/plugins/more-alts/js/patches/tabBarLongPress.tsx
      function getValenced5() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      }
      function patchTabBarLongPress(storage) {
        var cleanups = [];
        var rev = getValenced5();
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
        var key = wrapped instanceof Error ? wrapped.message : String(wrapped);
        if (seen.has(key)) return;
        seen.add(key);
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
      function getValenced6() {
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
              var rev = getValenced6();
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
        var rev = getValenced6();
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
        var rev = getValenced6();
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
        var key = `rosie-whats-new-${plugin2.id}`;
        var close = () => alerts.dismissAlert(key);
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
          alerts.openAlert(key, /* @__PURE__ */valenced.react.React.createElement(AlertModal, {
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
        var rev = getValenced6();
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
        persistentStorageVault: true
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

      // source/plugins/more-alts/js/ui/Settings.tsx
      function getValenced7() {
        try {
          if (typeof valenced !== "undefined") return valenced;
        } catch {}
        return globalThis.valenced;
      }
      function formatDate(ts) {
        return new Date(ts).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        });
      }
      function Settings({
        api
      }) {
        var rev = getValenced7();
        var {
          ScrollView: ScrollView2,
          View: View2,
          Image,
          Alert
        } = rev.react.ReactNative;
        var {
          TableRowGroup,
          TableSwitchRow,
          TableRow,
          Stack,
          Text,
          Button
        } = rev.discord.design.Design;
        var rawStorage = api.jsonStorage.use();
        var storage = {
          ...DEFAULT_STORAGE,
          ...(rawStorage ?? {})
        };
        var currentUser = getCurrentUser();
        var currentUserId = currentUser?.id;
        var accounts = getAllAccounts(api.jsonStorage);
        var currentAvatarUrl = currentUser?.avatar ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=80` : "https://cdn.discordapp.com/embed/avatars/0.png";
        var handleSwitch = async account => {
          if (account.id === currentUserId) return;
          if (!(await switchToAccount(account))) {
            Alert.alert("Could not switch accounts", "Sign into this account again in Discord, then add it to More Alts.");
          }
        };
        var handleRemove = account => {
          if (storage.confirmBeforeDelete !== false) {
            Alert.alert("Remove Account", `Are you sure you want to remove "${account.username}" from More Alts?`, [{
              text: "Cancel",
              style: "cancel"
            }, {
              text: "Remove",
              style: "destructive",
              onPress: () => {
                void removeAccount(api.jsonStorage, account.id);
              }
            }]);
          } else {
            void removeAccount(api.jsonStorage, account.id);
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
        return /* @__PURE__ */valenced.react.React.createElement(ScrollView2, {
          style: {
            flex: 1,
            backgroundColor: "#111214"
          },
          contentContainerStyle: {
            padding: 16,
            paddingBottom: 64
          },
          keyboardShouldPersistTaps: "handled"
        }, /* @__PURE__ */valenced.react.React.createElement(Stack, {
          spacing: 16
        }, /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "CURRENT ACCOUNT"
        }, /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          icon: /* @__PURE__ */valenced.react.React.createElement(Image, {
            source: {
              uri: currentAvatarUrl
            },
            style: {
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 2,
              borderColor: "#23a55a"
            }
          }),
          label: /* @__PURE__ */valenced.react.React.createElement(Text, {
            variant: "text-md/semibold",
            color: "text-normal"
          }, currentUser?.globalName || currentUser?.username || "Current User"),
          subLabel: currentUser?.username ? `@${currentUser.username} \u2022 Active Session` : "Active Session",
          trailing: /* @__PURE__ */valenced.react.React.createElement(Button, {
            size: "sm",
            variant: "secondary",
            text: "Switch",
            onPress: () => openAccountSwitcherSheet(api.jsonStorage)
          })
        }), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Add Another Account",
          subLabel: "Sign in with credentials, user token, or bot account",
          arrow: true,
          onPress: () => openAddAccountSheet(api.jsonStorage)
        })), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: `SAVED ACCOUNTS (${accounts.length})`
        }, accounts.length === 0 ? /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "No Accounts Saved",
          subLabel: "Tap 'Add Another Account' above or hold the YouBar tab to save accounts."
        }) : accounts.map((acc, index) => {
          var isCurrent = acc.id === currentUserId;
          var avatarUrl = acc.avatar ? `https://cdn.discordapp.com/avatars/${acc.id}/${acc.avatar}.png?size=80` : "https://cdn.discordapp.com/embed/avatars/0.png";
          var displayName = storage.enableCLI ? `${acc.username}${acc.discriminator && acc.discriminator !== "0" ? `#${acc.discriminator}` : ""}` : acc.displayName || acc.username;
          return /* @__PURE__ */valenced.react.React.createElement(TableRow, {
            key: acc.id,
            icon: /* @__PURE__ */valenced.react.React.createElement(Image, {
              source: {
                uri: avatarUrl
              },
              style: {
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: isCurrent ? 2 : 0,
                borderColor: "#23a55a"
              }
            }),
            label: /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                flexDirection: "row",
                alignItems: "center",
                gap: 6
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Text, {
              variant: "text-md/semibold",
              color: "text-normal"
            }, `${index + 1}. ${displayName}`), acc.isBot && /* @__PURE__ */valenced.react.React.createElement(View2, {
              style: {
                backgroundColor: "#5865f2",
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 1
              }
            }, /* @__PURE__ */valenced.react.React.createElement(Text, {
              style: {
                color: "#ffffff",
                fontSize: 9,
                fontWeight: "bold"
              }
            }, "BOT"))),
            subLabel: isCurrent ? "\u2713 Active Account" : acc.isNative ? "Discord Account \u2022 Tap to switch" : `Added: ${formatDate(acc.addedAt)} \u2022 Tap to switch`,
            arrow: !isCurrent,
            onPress: () => handleAccountPress(acc)
          });
        })), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "MULTI-ACCOUNT SETTINGS"
        }, /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Native Account Switcher",
          subLabel: "Automatically unlocks Discord's built-in multi-account switcher in the YouBar",
          value: storage.enableNativeSwitcher !== false,
          onValueChange: v => api.jsonStorage.set({
            enableNativeSwitcher: v
          })
        }), /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Block Background Notifications",
          subLabel: "Stop notifications from leaking from accounts you are not currently signed into",
          value: storage.blockOtherAccountNotifications !== false,
          onValueChange: v => api.jsonStorage.set({
            blockOtherAccountNotifications: v
          })
        }), /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Persistent Storage Vault",
          subLabel: "Protects accounts from clearing themselves on restart or cache wipes",
          value: storage.persistentStorageVault !== false,
          onValueChange: v => api.jsonStorage.set({
            persistentStorageVault: v
          })
        }), /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Show Full Username Tag",
          subLabel: "Display username#0000 discriminator in the accounts list",
          value: storage.enableCLI !== false,
          onValueChange: v => api.jsonStorage.set({
            enableCLI: v
          })
        }), /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Confirm Before Removing",
          subLabel: "Ask for confirmation before deleting an account from storage",
          value: storage.confirmBeforeDelete !== false,
          onValueChange: v => api.jsonStorage.set({
            confirmBeforeDelete: v
          })
        }), /* @__PURE__ */valenced.react.React.createElement(TableSwitchRow, {
          label: "Enable Unsafe Features",
          subLabel: "Allow token copying and advanced account export",
          value: !!storage.enableUnsafeFeatures,
          onValueChange: v => api.jsonStorage.set({
            enableUnsafeFeatures: v
          })
        })), /* @__PURE__ */valenced.react.React.createElement(TableRowGroup, {
          title: "BACKUP & SESSIONS"
        }, storage.enableUnsafeFeatures && /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Export Accounts",
          subLabel: "Copy all saved accounts and tokens to clipboard (JSON)",
          arrow: true,
          onPress: handleExport
        }), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Import Accounts from Clipboard",
          subLabel: "Restore accounts from previously copied export JSON",
          arrow: true,
          onPress: handleImport
        }), /* @__PURE__ */valenced.react.React.createElement(TableRow, {
          label: "Force Logout Session",
          subLabel: "Invalidate current session while preserving saved switcher accounts",
          arrow: true,
          onPress: () => {
            Alert.alert("Force Logout", "This will log you out of your current session. Your saved accounts will remain safe in the vault.", [{
              text: "Cancel",
              style: "cancel"
            }, {
              text: "Force Logout",
              style: "destructive",
              onPress: () => forceLogout()
            }]);
          }
        }))));
      }

      // source/plugins/more-alts/js/index.ts
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
          api.cleanup(() => {
            unpatchNative();
            unpatchLongPress();
          });
        },
        SettingsComponent: Settings
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
          "persistentStorageVault": true
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
