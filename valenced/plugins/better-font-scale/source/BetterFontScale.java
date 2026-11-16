// SPDX-License-Identifier: MIT
package dev.fluttershy2008.fontscale;

import android.os.Handler;
import android.os.Looper;
import android.text.Spannable;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewParent;
import android.widget.TextView;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

public final class BetterFontScale {
    private static final int MESSAGE = 0;
    private static final int COMPOSER = 1;
    private static final int AUTHOR = 2;
    private static final int TIMESTAMP = 3;
    private static final int WORD_SPACING = 4;
    private static final int SETTING_COUNT = 5;
    private static final String APPLY = "dev.fluttershy2008.better-font-scale.apply";
    private static final String CHAT_VIEW = "com.discord.chat.presentation.message.MessageView";
    private static final String BODY_VIEW = "com.discord.chat.presentation.message.view.MessageContentView";
    private static final String COMPOSER_VIEW = "com.discord.chat.input.views.DCDChatInput";

    public static PluginBuilder getPlugin() {
        final PluginBuilder plugin = new PluginBuilder();
        final NativeHook hook = new NativeHook();
        plugin.start(new Function1<PluginScope, Unit>() {
            @Override public Unit invoke(PluginScope scope) {
                hook.start(scope);
                return Unit.INSTANCE;
            }
        });
        plugin.stop(new Function1<PluginScope, Unit>() {
            @Override public Unit invoke(PluginScope scope) {
                hook.stop();
                return Unit.INSTANCE;
            }
        });
        return plugin;
    }

    private static final class NativeHook {
        private final Handler main = new Handler(Looper.getMainLooper());
        private final Map<Integer, String> names = new HashMap<Integer, String>();
        private final Map<TextView, Applied> applied = new WeakHashMap<TextView, Applied>();
        private final Map<TextView, Boolean> spacedViews = new WeakHashMap<TextView, Boolean>();
        private final ThreadLocal<Integer> bodyBindDepth = new ThreadLocal<Integer>();
        private volatile float[] sizes = new float[SETTING_COUNT];
        private volatile XC_MethodHook.Unhook measure;
        private XC_MethodHook.Unhook bindBody;
        private volatile XC_MethodHook.Unhook wordSpacing;
        private float lastRefreshedSpacing;

        void start(PluginScope scope) {
            try {
                Method method = TextView.class.getDeclaredMethod("onMeasure", int.class, int.class);
                measure = XposedBridge.hookMethod(method, new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam param) {
                        float[] current = sizes;
                        if (!any(current)) return;
                        TextView view = (TextView) param.thisObject;
                        int slot = target(view);
                        if (slot >= 0 && current[slot] > 0) resize(view, slot, current[slot]);
                    }
                });
            } catch (ReflectiveOperationException | RuntimeException error) {
                XposedBridge.log("Better Font Scale: TextView hook unavailable: " + error);
            }
            try {
                Class<?> body = scope.getClassLoader().loadClass(BODY_VIEW);
                for (Method method : body.getDeclaredMethods()) {
                    Class<?>[] args = method.getParameterTypes();
                    // Discord's body binder reads the paint before laying out rich
                    // text and emoji. Its name is obfuscated on newer releases.
                    if (!Modifier.isStatic(method.getModifiers()) || args.length < 15 || args[0] != body
                            || method.getReturnType() != void.class) continue;
                    bindBody = XposedBridge.hookMethod(method, new XC_MethodHook() {
                        @Override protected void beforeHookedMethod(MethodHookParam param) {
                            Integer depth = bodyBindDepth.get();
                            bodyBindDepth.set(depth == null ? 1 : depth + 1);
                            float size = sizes[MESSAGE];
                            TextView view = (TextView) param.args[0];
                            if (size > 0 && view != null) resize(view, MESSAGE, size);
                        }

                        @Override protected void afterHookedMethod(MethodHookParam param) {
                            Integer depth = bodyBindDepth.get();
                            if (depth == null || depth <= 1) bodyBindDepth.remove();
                            else bodyBindDepth.set(depth - 1);
                        }
                    });
                    break;
                }
                installWordSpacing(body);
            } catch (ReflectiveOperationException | RuntimeException error) {
                XposedBridge.log("Better Font Scale: falling back to the message measurement hook: " + error);
            }
            scope.getBridge().registerMethod(APPLY, new Function1<List<?>, Object>() {
                @Override public Object invoke(List<?> args) {
                    if (measure == null || (args.size() != 4 && args.size() != SETTING_COUNT)) return false;
                    final float[] next = new float[SETTING_COUNT];
                    for (int i = 0; i < WORD_SPACING; i++) next[i] = parse(args.get(i));
                    if (args.size() == SETTING_COUNT) next[WORD_SPACING] = parseSpacing(args.get(WORD_SPACING));
                    sizes = next;
                    main.post(new Runnable() {
                        @Override public void run() {
                            if (sizes == next) refresh(next);
                        }
                    });
                    return next[WORD_SPACING] != 0 && wordSpacing == null ? "word-spacing-unavailable" : true;
                }
            });
        }

        private void installWordSpacing(final Class<?> body) {
            try {
                for (Class<?> type = body; type != null && type != TextView.class; type = type.getSuperclass()) {
                    for (Method method : type.getDeclaredMethods()) {
                        Class<?>[] args = method.getParameterTypes();
                        if (!method.getName().equals("setDraweeSpanStringBuilder") || args.length != 1
                                || !Spannable.class.isAssignableFrom(args[0])) continue;
                        wordSpacing = XposedBridge.hookMethod(method, new XC_MethodHook() {
                            @Override protected void beforeHookedMethod(MethodHookParam param) {
                                float spacing = sizes[WORD_SPACING];
                                if (spacing == 0 || !(param.args[0] instanceof Spannable)) return;
                                TextView view = (TextView) param.thisObject;
                                boolean message = body.isInstance(view);
                                // The Android renderer also measures a temporary copy of
                                // the text for previews. Give it the same gap widths.
                                if (!message && bodyBindDepth.get() == null) return;
                                WordSpacing.apply((Spannable) param.args[0], spacing);
                                if (message) {
                                    synchronized (spacedViews) {
                                        spacedViews.put(view, true);
                                    }
                                }
                            }
                        });
                        return;
                    }
                }
            } catch (RuntimeException | LinkageError error) {
                XposedBridge.log("Better Font Scale: word spacing hook unavailable: " + error);
            }
        }

        void stop() {
            final float[] defaults = new float[SETTING_COUNT];
            sizes = defaults;
            if (measure != null) {
                measure.unhook();
                measure = null;
            }
            if (bindBody != null) {
                bindBody.unhook();
                bindBody = null;
            }
            if (wordSpacing != null) {
                wordSpacing.unhook();
                wordSpacing = null;
            }
            main.post(new Runnable() {
                @Override public void run() {
                    if (sizes == defaults) {
                        refresh(defaults);
                        names.clear();
                    }
                }
            });
        }

        private int target(TextView view) {
            String type = view.getClass().getName();
            if (type.equals(BODY_VIEW)) return MESSAGE;
            if (type.equals(COMPOSER_VIEW)) return COMPOSER;
            String id = resourceName(view);
            if (id.equals("chat_list_adapter_item_text")) return MESSAGE;
            if (id.equals("chat_list_adapter_item_text_name")) return AUTHOR;
            if (id.equals("chat_list_adapter_item_text_timestamp")) return TIMESTAMP;
            int slot = id.equals("author_name") ? AUTHOR : id.equals("timestamp") ? TIMESTAMP : -1;
            if (slot < 0) return -1;

            ViewParent parent = view.getParent();
            for (int depth = 0; parent instanceof View && depth < 8; depth++) {
                if (parent.getClass().getName().equals(CHAT_VIEW)) return slot;
                parent = parent.getParent();
            }
            return -1;
        }

        private String resourceName(View view) {
            int id = view.getId();
            if (id == View.NO_ID) return "";
            String name = names.get(id);
            if (name == null) {
                // React Native view tags reserve the high-byte-zero range.
                if ((id & 0xff000000) == 0) return "";
                try {
                    name = view.getResources().getResourceEntryName(id);
                } catch (RuntimeException ignored) {
                    name = "";
                }
                names.put(id, name);
            }
            return name;
        }

        private void resize(TextView view, int slot, float size) {
            float current = view.getTextSize();
            float pixels = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, size,
                    view.getResources().getDisplayMetrics());
            Applied previous = applied.get(view);
            if (previous != null && sameSize(current, previous.override)) {
                if (sameSize(current, pixels)) return;
                current = previous.baseline;
            }
            if (sameSize(view.getTextSize(), pixels)) return;
            setPixels(view, pixels);
            applied.put(view, new Applied(slot, current, view.getTextSize()));
        }

        private void refresh(float[] next) {
            float spacing = next[WORD_SPACING];
            if (spacing != lastRefreshedSpacing || spacing == 0) {
                List<TextView> views;
                synchronized (spacedViews) {
                    views = new ArrayList<TextView>(spacedViews.keySet());
                    if (spacing == 0) spacedViews.clear();
                }
                for (TextView view : views) {
                    CharSequence text = view.getText();
                    if (text instanceof Spannable) WordSpacing.apply((Spannable) text, spacing);
                }
                lastRefreshedSpacing = spacing;
            }

            Map<TextView, Applied> previous = new HashMap<TextView, Applied>(applied);
            for (Map.Entry<TextView, Applied> entry : previous.entrySet()) {
                TextView view = entry.getKey();
                Applied state = entry.getValue();
                if (next[state.slot] > 0) {
                    resize(view, state.slot, next[state.slot]);
                } else {
                    if (sameSize(view.getTextSize(), state.override)) setPixels(view, state.baseline);
                    applied.remove(view);
                }
            }
        }
    }

    private static void setPixels(TextView view, float pixels) {
        view.setTextSize(TypedValue.COMPLEX_UNIT_PX, pixels);
    }

    private static boolean sameSize(float first, float second) {
        return Math.abs(first - second) < 0.05f;
    }

    private static boolean any(float[] sizes) {
        return sizes[0] > 0 || sizes[1] > 0 || sizes[2] > 0 || sizes[3] > 0;
    }

    private static float parse(Object value) {
        if (!(value instanceof Number)) return 0;
        double size = ((Number) value).doubleValue();
        return size >= 8 && size <= 48 ? (float) size : 0;
    }

    private static float parseSpacing(Object value) {
        if (!(value instanceof Number)) return 0;
        double percent = ((Number) value).doubleValue();
        return percent >= -50 && percent <= 100 ? (float) percent : 0;
    }

    private static final class Applied {
        final int slot;
        final float baseline;
        final float override;

        Applied(int slot, float baseline, float override) {
            this.slot = slot;
            this.baseline = baseline;
            this.override = override;
        }
    }
}
