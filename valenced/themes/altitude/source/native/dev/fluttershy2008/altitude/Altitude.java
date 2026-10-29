package dev.fluttershy2008.altitude;

import android.content.Context;
import android.content.res.Resources;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.TextView;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

/** Java uses the same PluginBuilder entry point as Valenced's Kotlin DSL. */
public final class Altitude {
    public static final PluginBuilder altitude = new PluginBuilder();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final List<XC_MethodHook.Unhook> HOOKS = new ArrayList<XC_MethodHook.Unhook>();
    private static final WeakHashMap<View, AvatarState> AVATARS = new WeakHashMap<View, AvatarState>();
    private static final WeakHashMap<TextView, TextState> TEXTS = new WeakHashMap<TextView, TextState>();
    private static final WeakHashMap<View, MaskState> MASKS = new WeakHashMap<View, MaskState>();
    private static final ThreadLocal<Boolean> APPLYING = new ThreadLocal<Boolean>();
    private static final Map<Integer, Boolean> AVATAR_IDS = new HashMap<Integer, Boolean>();
    private static volatile boolean running;
    private static Typeface regular;
    private static Typeface semibold;
    private static int messageHooks;

    private static final ViewOutlineProvider SQUARE = new ViewOutlineProvider() {
        @Override public void getOutline(View view, Outline outline) {
            outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(view, 3));
        }
    };

    static {
        altitude.start(new Function1<PluginScope, Unit>() {
            @Override public Unit invoke(PluginScope scope) {
                start(scope);
                return Unit.INSTANCE;
            }
        });
        altitude.stop(new Function1<PluginScope, Unit>() {
            @Override public Unit invoke(PluginScope scope) {
                stop();
                scope.requireReload();
                return Unit.INSTANCE;
            }
        });
    }

    private Altitude() {}

    private static void start(final PluginScope scope) {
        if (running) return;
        running = true;
        messageHooks = 0;
        regular = font(scope, "LexendDeca-Regular.ttf");
        semibold = font(scope, "LexendDeca-SemiBold.ttf");
        try {
            // Android's stable View API also covers native chat, outside React.
            HOOKS.add(XposedBridge.hookMethod(
                View.class.getDeclaredMethod("setOutlineProvider", ViewOutlineProvider.class),
                new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam p) {
                        if (!running || Boolean.TRUE.equals(APPLYING.get())) return;
                        View view = (View) p.thisObject;
                        if (!isAvatar(view)) return;
                        rememberAvatar(view);
                        AVATARS.get(view).outline = (ViewOutlineProvider) p.args[0];
                        p.args[0] = SQUARE;
                    }
                }
            ));
            HOOKS.add(XposedBridge.hookMethod(
                View.class.getDeclaredMethod("setClipToOutline", Boolean.TYPE),
                new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam p) {
                        if (!running || Boolean.TRUE.equals(APPLYING.get())) return;
                        View view = (View) p.thisObject;
                        if (!isAvatar(view)) return;
                        rememberAvatar(view);
                        AVATARS.get(view).clip = ((Boolean) p.args[0]).booleanValue();
                        square(view);
                        p.args[0] = Boolean.TRUE;
                    }
                }
            ));
        } catch (Throwable error) {
            stop();
            throw new IllegalStateException("Altitude could not install native avatar clipping", error);
        }

        final ClassLoader loader = scope.getClassLoader();
        hookAvatarMasks(loader);
        hookImageUris(loader);
        hookMessageClass(loader, "com.discord.chat.presentation.message.MessageView", false);
        hookMessageClass(loader, "com.discord.chat.presentation.message.view.MessageContentView", true);

        scope.getBridge().registerMethod("dev.fluttershy2008.altitude-theme.status",
            new Function1<List<?>, Object>() {
                @Override public Object invoke(List<?> ignored) {
                    Map<String, Object> status = new HashMap<String, Object>();
                    status.put("active", running);
                    status.put("nativeHooks", HOOKS.size());
                    status.put("messageHooks", messageHooks);
                    status.put("fontLoaded", regular != null);
                    return status;
                }
            }
        );
        // Existing mounted views predate our hooks on a late enable. A reload
        // creates them through the hooked constructors without scanning the UI.
        if (scope.getStartedLate()) scope.requireReload();
    }

    private static Typeface font(PluginScope scope, String name) {
        File file = new File(scope.getPluginDir(), "assets/fonts/" + name);
        try { return Typeface.createFromFile(file); }
        catch (Throwable error) { XposedBridge.log("[Altitude] Font unavailable: " + name); return null; }
    }

    /** Profile/member avatars use Discord's native ClipView around the image. */
    private static void hookAvatarMasks(ClassLoader loader) {
        try {
            Class<?> type = loader.loadClass("com.discord.clip.ClipView");
            final Method circle = type.getDeclaredMethod("clipToCircle", Boolean.TYPE);
            final Method radius = type.getDeclaredMethod("clipToBorderRadius", Float.TYPE);
            Field radiusCandidate = null;
            try {
                radiusCandidate = type.getDeclaredField("clipPathRadius");
                radiusCandidate.setAccessible(true);
            } catch (ReflectiveOperationException ignored) {}
            final Field radiusField = radiusCandidate;
            HOOKS.add(XposedBridge.hookMethod(circle, new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam p) throws Throwable {
                    if (!running || Boolean.TRUE.equals(APPLYING.get())) return;
                    View view = (View) p.thisObject;
                    if (Boolean.TRUE.equals(p.args[0])) {
                        if (!MASKS.containsKey(view)) {
                            float original = radiusField == null ? 0 : radiusField.getFloat(view);
                            MASKS.put(view, new MaskState(circle, radius, original));
                        }
                        p.args[0] = Boolean.FALSE;
                    } else {
                        MaskState state = MASKS.remove(view);
                        if (state != null) setMaskRadius(view, state.radius, state.originalRadius);
                    }
                }
                @Override protected void afterHookedMethod(MethodHookParam p) throws Throwable {
                    if (!running || p.hasThrowable() || Boolean.TRUE.equals(APPLYING.get())) return;
                    View view = (View) p.thisObject;
                    if (MASKS.containsKey(view)) setMaskRadius(view, radius, dp(view, 3));
                }
            }));
            HOOKS.add(XposedBridge.hookMethod(radius, new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam p) {
                    if (!running || Boolean.TRUE.equals(APPLYING.get())) return;
                    View view = (View) p.thisObject;
                    MaskState state = MASKS.get(view);
                    if (state == null) return;
                    state.originalRadius = ((Number) p.args[0]).floatValue();
                    p.args[0] = Float.valueOf(dp(view, 3));
                }
            }));
        } catch (Throwable error) {
            XposedBridge.log("[Altitude] Additional profile avatar masks unavailable: " + error);
        }
    }

    private static void setMaskRadius(View view, Method radius, float value) throws Exception {
        APPLYING.set(Boolean.TRUE);
        try { radius.invoke(view, Float.valueOf(value)); }
        finally { APPLYING.remove(); }
    }

    private static void hookImageUris(ClassLoader loader) {
        try {
            Class<?> drawee = loader.loadClass("com.facebook.drawee.view.SimpleDraweeView");
            for (Method method : drawee.getDeclaredMethods()) {
                if (!method.getName().equals("setImageURI") || method.getParameterTypes().length == 0) continue;
                Class<?> first = method.getParameterTypes()[0];
                if (first != String.class && !first.getName().equals("android.net.Uri")) continue;
                HOOKS.add(XposedBridge.hookMethod(method, new XC_MethodHook() {
                    @Override protected void afterHookedMethod(MethodHookParam p) {
                        if (!running || p.hasThrowable()) return;
                        View view = (View) p.thisObject;
                        String uri = p.args[0] == null ? "" : p.args[0].toString();
                        if (isAvatarUri(uri) || isAvatarId(view)) square(view);
                        else restoreAvatar(view);
                    }
                }));
            }
        } catch (Throwable error) {
            XposedBridge.log("[Altitude] Additional avatar images unavailable: " + error);
        }
    }

    /** Excludes decorations, banners, inline emoji and attachment thumbnails. */
    public static boolean isAvatarUri(String uri) {
        return uri != null && (uri.contains("/avatars/") || uri.contains("/icons/"));
    }

    private static boolean isAvatar(View view) {
        return AVATARS.containsKey(view) || isAvatarId(view);
    }

    private static boolean isAvatarId(View view) {
        int id = view.getId();
        if (id <= 0) return false;
        Boolean saved = AVATAR_IDS.get(id);
        if (saved != null) return saved.booleanValue();
        boolean avatar = false;
        try {
            String name = view.getResources().getResourceEntryName(id);
            avatar = name.equals("author_avatar") || name.equals("reply_avatar")
                || name.equals("referenced_message_avatar");
        } catch (Resources.NotFoundException ignored) {}
        AVATAR_IDS.put(id, Boolean.valueOf(avatar));
        return avatar;
    }

    private static void rememberAvatar(View view) {
        if (!AVATARS.containsKey(view)) AVATARS.put(view, new AvatarState(view));
    }

    private static void square(View view) {
        if (!running) return;
        rememberAvatar(view);
        APPLYING.set(Boolean.TRUE);
        try {
            if (view.getOutlineProvider() != SQUARE) view.setOutlineProvider(SQUARE);
            if (!view.getClipToOutline()) view.setClipToOutline(true);
            view.invalidateOutline();
        } finally { APPLYING.remove(); }
    }

    private static void restoreAvatar(View view) {
        AvatarState state = AVATARS.remove(view);
        if (state == null) return;
        APPLYING.set(Boolean.TRUE);
        try {
            view.setOutlineProvider(state.outline);
            view.setClipToOutline(state.clip);
            view.invalidateOutline();
        } finally { APPLYING.remove(); }
    }

    private static void hookMessageClass(ClassLoader loader, String name, final boolean body) {
        try {
            Class<?> type = loader.loadClass(name);
            XC_MethodHook hook = new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam p) {
                    if (!running || p.hasThrowable()) return;
                    try {
                        if (body && p.thisObject instanceof TextView) styleText((TextView) p.thisObject, 16, regular, true);
                        else if (p.thisObject instanceof View) styleMessage((View) p.thisObject);
                    } catch (Throwable error) {
                        // A changed host view must not break message binding.
                        XposedBridge.log("[Altitude] Chat styling skipped: " + error);
                    }
                }
            };
            HOOKS.addAll(XposedBridge.hookAllConstructors(type, hook));
            for (Method method : type.getDeclaredMethods()) {
                if (Modifier.isStatic(method.getModifiers())) continue;
                if (method.getName().equals(body ? "setMessageContent" : "setMessage")) {
                    HOOKS.add(XposedBridge.hookMethod(method, hook));
                    messageHooks++;
                }
            }
        } catch (Throwable error) {
            XposedBridge.log("[Altitude] Optional chat typography hook unavailable: " + name);
        }
    }

    private static View child(View root, String name) {
        int id = root.getResources().getIdentifier(name, "id", root.getContext().getPackageName());
        return id == 0 ? null : root.findViewById(id);
    }

    private static void styleMessage(View root) {
        View avatar = child(root, "author_avatar");
        if (avatar != null) square(avatar);
        View name = child(root, "author_name");
        if (name instanceof TextView) styleText((TextView) name, 16, semibold, false);
        View timestamp = child(root, "timestamp");
        if (timestamp instanceof TextView) styleText((TextView) timestamp, 12, regular, false);
        // Discord already uses the matching classic 40dp avatar, 12dp left
        // margin and 64dp content guideline. Keep its layout and hit targets.
    }

    private static void styleText(TextView view, float sp, Typeface face, boolean body) {
        if (!TEXTS.containsKey(view)) TEXTS.put(view, new TextState(view));
        if (face != null && view.getTypeface() != face) view.setTypeface(face);
        float desired = sp * view.getResources().getDisplayMetrics().scaledDensity;
        if (Math.abs(view.getTextSize() - desired) > 0.1f) view.setTextSize(2, sp);
        if (body && (view.getLineSpacingExtra() != 0 || Math.abs(view.getLineSpacingMultiplier() - 1.2f) > 0.001f))
            view.setLineSpacing(0, 1.2f);
    }

    private static float dp(View view, float value) {
        return value * view.getResources().getDisplayMetrics().density;
    }

    private static void stop() {
        running = false;
        for (XC_MethodHook.Unhook hook : new ArrayList<XC_MethodHook.Unhook>(HOOKS)) hook.unhook();
        HOOKS.clear();
        MAIN.post(new Runnable() {
            @Override public void run() {
                // Fast re-enable may happen before this UI callback executes.
                if (running) return;
                for (Map.Entry<View, MaskState> entry : MASKS.entrySet()) {
                    View view = entry.getKey();
                    if (view == null) continue;
                    MaskState state = entry.getValue();
                    try {
                        state.radius.invoke(view, Float.valueOf(state.originalRadius));
                        state.circle.invoke(view, Boolean.TRUE);
                    } catch (Exception error) { XposedBridge.log("[Altitude] Mask restore skipped: " + error); }
                }
                MASKS.clear();
                for (View view : new ArrayList<View>(AVATARS.keySet())) if (view != null) restoreAvatar(view);
                for (Map.Entry<TextView, TextState> entry : TEXTS.entrySet()) {
                    TextView view = entry.getKey();
                    if (view == null) continue;
                    TextState state = entry.getValue();
                    view.setTypeface(state.face);
                    view.setTextSize(0, state.size);
                    view.setLineSpacing(state.extra, state.multiplier);
                }
                TEXTS.clear();
                AVATAR_IDS.clear();
            }
        });
    }

    private static final class AvatarState {
        ViewOutlineProvider outline;
        boolean clip;
        AvatarState(View view) { outline = view.getOutlineProvider(); clip = view.getClipToOutline(); }
    }

    private static final class MaskState {
        final Method circle;
        final Method radius;
        float originalRadius;
        MaskState(Method c, Method r, float original) { circle = c; radius = r; originalRadius = original; }
    }

    private static final class TextState {
        final Typeface face;
        final float size;
        final float extra;
        final float multiplier;
        TextState(TextView view) {
            face = view.getTypeface(); size = view.getTextSize();
            extra = view.getLineSpacingExtra(); multiplier = view.getLineSpacingMultiplier();
        }
    }
}
