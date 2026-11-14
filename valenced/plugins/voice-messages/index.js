({
  default: {
    start(api) {
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

      // source/js/index.tsx
      var index_exports = {};
      __export(index_exports, {
        default: () => index_default
      });
      module.exports = __toCommonJS(index_exports);

      // valenced:@valenced/assets
      var {
        getAssetIdByName
      } = valenced.assets;

      // valenced:@valenced/discord/actions
      var {
        AlertActionCreators
      } = valenced.discord.actions;

      // valenced:@valenced/discord/design
      var {
        Design
      } = valenced.discord.design;

      // valenced:@valenced/discord/flux
      var {
        Stores
      } = valenced.discord.flux;

      // valenced:@valenced/discord/utils/modules/finders
      var {
        getModuleWithImportedPath,
        lookupModuleWithImportedPath
      } = valenced.discord.utils.modules.finders;

      // valenced:@valenced/react/jsx-runtime
      var {
        afterJSX
      } = valenced.react.jsxRuntime;

      // valenced:react
      var {
        useEffect,
        useRef,
        useState
      } = valenced.react.React;

      // valenced:react-native
      var {
        AppState,
        Image,
        PermissionsAndroid,
        Platform,
        StyleSheet,
        View
      } = valenced.react.ReactNative;

      // valenced:@valenced/modules/native
      var {
        callNativeMethod,
        getNativeModule
      } = valenced.modules.native;

      // source/js/audio.ts
      var audio = {
        record: () => callNativeMethod("rosie.voice-messages.record", []),
        finish: id => callNativeMethod("rosie.voice-messages.finish", [id]),
        play: id => callNativeMethod("rosie.voice-messages.play", [id]),
        playing: id => callNativeMethod("rosie.voice-messages.playing", [id]),
        stopPreview: id => callNativeMethod("rosie.voice-messages.stopPreview", [id]),
        discard: id => callNativeMethod("rosie.voice-messages.discard", [id]),
        upload: (draft, url) => callNativeMethod("rosie.voice-messages.upload", [draft.id, url, draft.mimeType])
      };
      async function importAudio() {
        var picker = getNativeModule("RNDocumentPicker");
        if (!picker) throw new Error("Discord\u2019s file picker is unavailable.");
        var file;
        try {
          var files = await picker.pick({
            mode: "open",
            type: ["audio/*", "application/ogg"],
            allowMultiSelection: false,
            requestLongTermAccess: false,
            allowVirtualFiles: false,
            localOnly: false
          });
          file = files[0];
        } catch (error) {
          var reason = error;
          if (/cancel/i.test(reason?.code ?? "") || /cancel/i.test(reason?.message ?? "")) return;
          throw error;
        }
        if (file?.uri) {
          return callNativeMethod("rosie.voice-messages.import", [file.uri, file.name ?? ""]);
        }
      }
      function audioError(error, fallback) {
        if (error instanceof Error) {
          return error.message.split("\n", 1)[0].replace(/^Call failed: (?:[\w.$]+: )?/, "");
        }
        if (error && typeof error === "object" && "body" in error) {
          var body = error.body;
          if (typeof body?.message === "string") return body.message;
        }
        return fallback;
      }

      // valenced:@valenced/discord/common/constants
      var {
        Constants
      } = valenced.discord.common.constants;

      // valenced:@valenced/modules/finders
      var {
        lookupModule
      } = valenced.modules.finders;

      // valenced:@valenced/modules/finders/filters
      var {
        withProps
      } = valenced.modules.finders.filters;

      // source/js/send.ts
      function selectedChannelId() {
        return Stores.SelectedChannelStore?.getCurrentlySelectedChannelId();
      }
      function currentUserId() {
        return Stores.UserStore?.getCurrentUser()?.id;
      }
      function canSendVoice(channel) {
        if (!channel.guild_id) return channel.type === 1 || channel.type === 3;
        var permissionStore = Stores.PermissionStore;
        if (!permissionStore?.can) return false;
        var isThread = channel.type === 10 || channel.type === 11 || channel.type === 12;
        var sendPermission = isThread ? 1n << 38n : 1n << 11n;
        return permissionStore.can(sendPermission, channel) && permissionStore.can(1n << 46n, channel);
      }
      function newNonce() {
        return ((BigInt(Date.now() - 14200704e5) << 22n) + BigInt(Math.floor(Math.random() * 4194304))).toString();
      }
      async function sendVoice(channel, userId, draft, nonce, isOpen) {
        var checkDestination = () => {
          if (!isOpen() || selectedChannelId() !== channel.id || currentUserId() !== userId) {
            throw new Error("Open the original chat before sending this voice message.");
          }
          if (!canSendVoice(channel)) throw new Error("You can\u2019t send voice messages in this chat.");
        };
        checkDestination();
        var http = lookupModule(withProps("post", "getAPIBaseURL", "del"))[0];
        var knownEndpoints = Constants?.Endpoints;
        var endpoints = knownEndpoints ?? lookupModule(withProps("Endpoints"))[0]?.Endpoints;
        if (!http?.post || !endpoints?.MESSAGES) {
          throw new Error("Discord\u2019s message uploader is unavailable on this version.");
        }
        var replies = Stores.PendingReplyStore;
        var pending = replies?.getPendingReply?.(channel.id);
        var messageId = pending?.message?.id ?? pending?.messageId;
        if (pending && !messageId) {
          throw new Error("Discord couldn\u2019t resolve the reply for this voice message.");
        }
        var {
          body
        } = await http.post({
          url: endpoints.MESSAGE_CREATE_ATTACHMENT_UPLOAD?.(channel.id) ?? `/channels/${channel.id}/attachments`,
          body: {
            files: [{
              id: "0",
              filename: draft.filename,
              file_size: draft.size
            }]
          }
        });
        var slot = body?.attachments?.[0];
        if (!slot?.upload_url || !slot.upload_filename) {
          throw new Error("Discord didn\u2019t return an audio upload URL.");
        }
        checkDestination();
        await audio.upload(draft, slot.upload_url);
        checkDestination();
        await http.post({
          url: endpoints.MESSAGES(channel.id),
          body: {
            content: "",
            flags: 1 << 13,
            nonce,
            enforce_nonce: true,
            attachments: [{
              id: String(slot.id),
              filename: draft.filename,
              uploaded_filename: slot.upload_filename,
              duration_secs: draft.duration,
              waveform: draft.waveform
            }],
            ...(messageId && {
              message_reference: {
                message_id: messageId,
                channel_id: channel.id,
                guild_id: channel.guild_id
              },
              allowed_mentions: {
                parse: [],
                replied_user: pending?.shouldMention === true
              }
            })
          }
        });
        try {
          if (pending && replies.getPendingReply(channel.id) === pending) {
            lookupModule(withProps("deletePendingReply"))[0]?.deletePendingReply(channel.id);
          }
        } catch {}
      }

      // valenced:react/jsx-runtime
      var {
        jsx,
        jsxs,
        Fragment
      } = valenced.react.ReactJSXRuntime;

      // source/js/index.tsx
      var alertKey = "rosie.voice-messages";
      var voiceButtonPath = "modules/voice_messages/native/components/VoiceMessageButton.tsx";
      var actionButtonPath = "modules/chat_input/native/action_buttons/ChatInputActionButton.tsx";
      var index_default = plugin({
        start({
          cleanup
        }) {
          if (Platform.OS !== "android") return;
          cleanup(getModuleWithImportedPath(voiceButtonPath, ({
            default: VoiceButton
          }) => {
            if (!VoiceButton) return;
            cleanup(afterJSX(VoiceButton, element => {
              if (element.props.disabled) return element;
              var channelStore = Stores.ChannelStore;
              var channel = channelStore?.getChannel(element.props.channelId);
              if (!channel || !canSendVoice(channel)) return element;
              var [module2] = lookupModuleWithImportedPath(actionButtonPath);
              var ActionButton = module2?.default;
              if (!ActionButton || !microphoneAsset()) return element;
              var open = () => {
                var userId = currentUserId();
                if (userId && canSendVoice(channel)) {
                  AlertActionCreators.openAlert(alertKey, /* @__PURE__ */jsx(VoicePanel, {
                    channel,
                    userId
                  }));
                }
              };
              return /* @__PURE__ */jsx(ActionButton, {
                IconComponent: MicrophoneIcon,
                accessibilityLabel: "Send voice message",
                onPress: open
              }, element.key);
            }));
          }), () => AlertActionCreators.dismissAlert(alertKey));
        }
      });
      function microphoneAsset() {
        return getAssetIdByName("MicrophoneIcon") || getAssetIdByName("VoiceMessageIcon");
      }
      function MicrophoneIcon({
        style
      }) {
        return /* @__PURE__ */jsx(Image, {
          source: microphoneAsset(),
          style
        });
      }
      function VoicePanel({
        channel,
        userId
      }) {
        var [draft, setDraft] = useState();
        var [recording, setRecording] = useState();
        var [playing, setPlaying] = useState(false);
        var [busy, setBusy] = useState("");
        var [status, setStatus] = useState("");
        var [elapsed, setElapsed] = useState(0);
        var open = useRef(true);
        var lock = useRef(false);
        var files = useRef(/* @__PURE__ */new Set());
        var recordingId = useRef(void 0);
        var nonce = useRef("");
        var startedAt = useRef(0);
        useEffect(() => {
          open.current = true;
          var cachedFiles = files.current;
          var app = AppState.addEventListener("change", state => {
            if (state !== "active" && recordingId.current) {
              var id = recordingId.current;
              recordingId.current = void 0;
              void audio.discard(id).catch(() => {});
              cachedFiles.delete(id);
              setRecording(void 0);
              setStatus("Recording ended when Discord went into the background.");
            }
          });
          return () => {
            open.current = false;
            app.remove();
            for (var id of cachedFiles) void audio.discard(id).catch(() => {});
            cachedFiles.clear();
          };
        }, []);
        useEffect(() => {
          if (!playing || !draft) return;
          var timer = setInterval(() => {
            audio.playing(draft.id).then(active => {
              if (!active && open.current) setPlaying(false);
            }).catch(() => {
              if (open.current) setPlaying(false);
            });
          }, 300);
          return () => clearInterval(timer);
        }, [playing, draft]);
        useEffect(() => {
          if (!recording) return;
          var timer = setInterval(() => {
            setElapsed(Math.min(1200, Math.floor((performance.now() - startedAt.current) / 1e3)));
          }, 250);
          return () => clearInterval(timer);
        }, [recording]);
        var run = async (label, task) => {
          if (!open.current || lock.current) return;
          lock.current = true;
          setBusy(label);
          setStatus("");
          try {
            await task();
          } catch (error) {
            if (open.current) setStatus(audioError(error, "Something went wrong. Please try again."));
          } finally {
            lock.current = false;
            if (open.current) setBusy("");
          }
        };
        var keepDraft = next => {
          if (!open.current) {
            void audio.discard(next.id).catch(() => {});
            return;
          }
          if (draft && draft.id !== next.id) {
            void audio.discard(draft.id).catch(() => {});
            files.current.delete(draft.id);
          }
          files.current.add(next.id);
          nonce.current = newNonce();
          setDraft(next);
        };
        var stopPreview = async () => {
          if (draft && playing) {
            await audio.stopPreview(draft.id);
            if (open.current) setPlaying(false);
          }
        };
        var record = () => run("Starting microphone\u2026", async () => {
          if (Number(Platform.Version) < 29) {
            throw new Error("Recording here requires Android 10. You can still choose an audio file.");
          }
          await stopPreview();
          var permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (!open.current) return;
          if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
            throw new Error("Allow Discord to use the microphone to record a voice message.");
          }
          var id = await audio.record();
          if (!open.current || AppState.currentState && AppState.currentState !== "active") {
            await audio.discard(id);
            return;
          }
          files.current.add(id);
          recordingId.current = id;
          startedAt.current = performance.now();
          setElapsed(0);
          setRecording(id);
        });
        var finish = () => run("Preparing recording\u2026", async () => {
          var id = recordingId.current;
          if (!id) return;
          recordingId.current = void 0;
          setRecording(void 0);
          try {
            keepDraft(await audio.finish(id));
          } catch (error) {
            files.current.delete(id);
            throw error;
          }
        });
        var choose = () => run("Opening audio file\u2026", async () => {
          await stopPreview();
          var next = await importAudio();
          if (next) keepDraft(next);
        });
        var preview = () => run("Opening preview\u2026", async () => {
          if (!draft) return;
          if (playing) {
            await stopPreview();
          } else {
            await audio.play(draft.id);
            if (open.current) setPlaying(true);
          }
        });
        var send = () => run("Sending voice message\u2026", async () => {
          if (!draft) return;
          await stopPreview();
          await sendVoice(channel, userId, draft, nonce.current, () => open.current);
          if (open.current) AlertActionCreators.dismissAlert(alertKey);
        });
        var time = recording ? elapsed : draft?.duration;
        var description = recording ? "Recording\u2026" : draft ? "Preview" : "Record with your microphone or choose an audio file.";
        var notice = status || busy || (draft && !draft.isOggOpus ? "Use Ogg Opus for playback on iPhone and iPad." : "");
        return /* @__PURE__ */jsx(Design.AlertModal, {
          title: "Send voice message",
          content: description,
          extraContent: /* @__PURE__ */jsxs(View, {
            style: styles.panel,
            children: [time !== void 0 && /* @__PURE__ */jsx(Design.Text, {
              variant: "text-sm/medium",
              children: formatTime(time)
            }), draft && !recording && /* @__PURE__ */jsx(View, {
              accessibilityElementsHidden: true,
              importantForAccessibility: "no-hide-descendants",
              style: styles.waveform,
              children: draft.bars.map((bar, index) => /* @__PURE__ */jsx(View, {
                style: [styles.bar, {
                  height: 3 + 27 * bar / 255,
                  opacity: playing ? 1 : 0.65
                }]
              }, index))
            }), notice ? /* @__PURE__ */jsx(Design.Text, {
              variant: "text-sm/medium",
              accessibilityLiveRegion: "polite",
              children: notice
            }) : null, recording ? /* @__PURE__ */jsx(Design.Button, {
              text: "Stop recording",
              disabled: !!busy,
              onPress: finish
            }) : /* @__PURE__ */jsxs(Fragment, {
              children: [/* @__PURE__ */jsx(Design.Button, {
                text: draft ? "Record again" : "Record",
                variant: "secondary",
                disabled: !!busy,
                onPress: record
              }), /* @__PURE__ */jsx(Design.Button, {
                text: "Choose audio file",
                variant: "secondary",
                disabled: !!busy,
                onPress: choose
              }), draft && /* @__PURE__ */jsx(Design.Button, {
                text: playing ? "Stop preview" : "Play preview",
                variant: "secondary",
                disabled: !!busy,
                onPress: preview
              })]
            })]
          }),
          actions: /* @__PURE__ */jsxs(Fragment, {
            children: [/* @__PURE__ */jsx(Design.AlertActionButton, {
              text: "Cancel",
              variant: "secondary",
              onPress: () => {
                open.current = false;
                AlertActionCreators.dismissAlert(alertKey);
              }
            }), /* @__PURE__ */jsx(Design.AlertActionButton, {
              text: "Send",
              variant: "primary",
              disabled: !draft || !!recording || !!busy,
              onPress: send
            })]
          })
        });
      }
      function formatTime(seconds) {
        var whole = Math.floor(seconds);
        return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
      }
      var styles = StyleSheet.create({
        panel: {
          gap: 8
        },
        waveform: {
          height: 32,
          gap: 2,
          flexDirection: "row",
          alignItems: "center"
        },
        bar: {
          flex: 1,
          maxWidth: 8,
          borderRadius: 3,
          backgroundColor: "#5865F2"
        }
      });
      return module.exports.default.start(api);
    }
  }
})
