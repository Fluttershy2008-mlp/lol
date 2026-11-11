package dev.fluttershy2008.messagebubbles;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.TextView;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import kotlin.Unit;

public final class MessageBubbles {
    public static final PluginBuilder messageBubbles = new PluginBuilder();
    private static final String CHAT = "com.discord.chat.";
    private static final String PRESENTATION = CHAT + "presentation.message.";
    private static Session session;

    static {
        messageBubbles.start(scope -> {
            start(scope);
            return Unit.INSTANCE;
        });
        messageBubbles.stop(scope -> {
            stop();
            return Unit.INSTANCE;
        });
    }

    private MessageBubbles() {}

    private static synchronized void start(PluginScope scope) {
        if (session != null) return;
        Session candidate = new Session();
        try {
            candidate.install(scope.getClassLoader());
            session = candidate;
        } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
            candidate.close();
            throw new IllegalStateException("Message Bubbles could not find Discord's Android chat renderer.", error);
        }
        if (scope.getStartedLate()) scope.requireReload();
    }

    private static synchronized void stop() {
        if (session == null) return;
        session.close();
        session = null;
    }

    private enum Style {
        PLUM(0xED704B86, 0xF2E8D9F3, false),
        INDIGO(0xED485681, 0xF2DEE3F7, false),
        BLUE(0xED3D6684, 0xF2D6EAF7, true);

        final int dark;
        final int light;
        final boolean outgoing;

        Style(int dark, int light, boolean outgoing) {
            this.dark = dark;
            this.light = light;
            this.outgoing = outgoing;
        }
    }

    private static final class Session {
        private final List<XC_MethodHook.Unhook> hooks = new ArrayList<>();
        private final Map<View, Style> rows = new WeakHashMap<>();
        private final Map<TextView, BodyStyle> bodies = new WeakHashMap<>();
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private volatile boolean active;
        private Class<?> bodyClass;
        private Class<?> accessoriesClass;
        private Method ownMessage;
        private Method authorId;
        private boolean reportedAuthorError;

        void install(ClassLoader loader) throws ReflectiveOperationException {
            Class<?> rowClass = loader.loadClass(PRESENTATION + "MessageView").asSubclass(ViewGroup.class);
            Class<?> messageClass = loader.loadClass(CHAT + "bridge.Message");
            bodyClass = loader.loadClass(PRESENTATION + "view.MessageContentView").asSubclass(TextView.class);
            accessoriesClass = loader.loadClass(PRESENTATION + "MessageAccessoriesView").asSubclass(ViewGroup.class);
            Method bind = findRowBind(rowClass, messageClass);
            ownMessage = messageClass.getMethod("isCurrentUserMessageAuthor");
            for (Method method : messageClass.getMethods()) {
                String name = method.getName();
                if (method.getParameterCount() == 0 && (name.equals("getAuthorId") || name.startsWith("getAuthorId-"))) {
                    authorId = method;
                    break;
                }
            }

            hooks.add(XposedBridge.hookMethod(bind, new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam param) {
                    if (!active || !onMainThread()) return;
                    rows.put((View) param.thisObject, styleOf(param.args[0]));
                }

                @Override protected void afterHookedMethod(MethodHookParam param) {
                    if (!active || !onMainThread() || param.hasThrowable()) return;
                    ViewGroup row = (ViewGroup) param.thisObject;
                    for (int i = 0; i < row.getChildCount(); i++) {
                        View child = row.getChildAt(i);
                        if (!accessoriesClass.isInstance(child)) continue;
                        ViewGroup accessories = (ViewGroup) child;
                        for (int j = 0; j < accessories.getChildCount(); j++) {
                            updateBody(accessories.getChildAt(j));
                        }
                        break;
                    }
                }
            }));

            // The accessory may be premeasured before RecyclerView gives it a parent.
            // SimpleDraweeSpanTextView supplies this Android lifecycle override.
            hooks.add(XposedBridge.hookMethod(bodyClass.getMethod("onAttachedToWindow"), new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam param) {
                    if (active && !param.hasThrowable() && bodyClass.isInstance(param.thisObject) && onMainThread()) {
                        updateBody((TextView) param.thisObject);
                    }
                }
            }));
            hooks.add(XposedBridge.hookMethod(
                TextView.class.getDeclaredMethod("onMeasure", int.class, int.class),
                new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam param) {
                        if (active && bodyClass.isInstance(param.thisObject) && onMainThread()) {
                            updateBody((TextView) param.thisObject);
                        }
                    }
                }
            ));
            hooks.add(XposedBridge.hookMethod(
                TextView.class.getDeclaredMethod("onDraw", Canvas.class),
                new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam param) {
                        if (!active || !bodyClass.isInstance(param.thisObject) || !onMainThread()) return;
                        TextView view = (TextView) param.thisObject;
                        BodyStyle body = bodies.get(view);
                        if (body != null && body.style == styleFor(view)) {
                            drawBubble(view, (Canvas) param.args[0], body.style);
                        }
                    }
                }
            ));
            active = true;
        }

        private Style styleOf(Object message) {
            if (message == null) return Style.PLUM;
            try {
                if (Boolean.TRUE.equals(ownMessage.invoke(message))) return Style.BLUE;
                Object author = authorId == null ? null : authorId.invoke(message);
                if (author != null && (author.hashCode() & 1) == 1) return Style.INDIGO;
            } catch (ReflectiveOperationException error) {
                if (!reportedAuthorError) {
                    reportedAuthorError = true;
                    XposedBridge.log("[Message Bubbles] Could not read the message author: " + error);
                }
            }
            return Style.PLUM;
        }

        private Style styleFor(TextView body) {
            ViewParent parent = body.getParent();
            if (!accessoriesClass.isInstance(parent)) return null;
            return rows.get(parent.getParent());
        }

        private void updateBody(View child) {
            if (!bodyClass.isInstance(child)) return;
            TextView view = (TextView) child;
            Style style = styleFor(view);
            if (style == null) {
                BodyStyle previous = bodies.remove(view);
                if (previous != null) previous.restore(view);
                return;
            }
            BodyStyle body = bodies.get(view);
            if (body == null) {
                body = new BodyStyle(view);
                bodies.put(view, body);
            }
            body.apply(view, style);
        }

        private void drawBubble(TextView view, Canvas canvas, Style style) {
            Layout layout = view.getLayout();
            if (layout == null || view.length() == 0 || layout.getLineCount() == 0) return;

            float left = Float.POSITIVE_INFINITY;
            float right = Float.NEGATIVE_INFINITY;
            for (int line = 0; line < layout.getLineCount(); line++) {
                float lineLeft = layout.getLineLeft(line);
                float lineRight = layout.getLineRight(line);
                if (lineRight > lineLeft) {
                    left = Math.min(left, lineLeft);
                    right = Math.max(right, lineRight);
                }
            }
            if (right <= left) return;

            int horizontal = dp(view, 10);
            int vertical = dp(view, 6);
            int scrollX = view.getScrollX();
            int scrollY = view.getScrollY();
            int originX = view.getCompoundPaddingLeft();
            int originY = view.getTotalPaddingTop();
            float x1 = Math.max(scrollX, originX + left - horizontal);
            float x2 = Math.min(scrollX + view.getWidth(), originX + right + horizontal);
            float y1 = Math.max(scrollY, originY + layout.getLineTop(0) - vertical);
            float y2 = Math.min(scrollY + view.getHeight(), originY + layout.getHeight() + vertical);
            if (x2 <= x1 || y2 <= y1) return;

            paint.setColor(Color.luminance(view.getCurrentTextColor()) < 0.35 ? style.light : style.dark);
            float radius = dp(view, 16);
            canvas.drawRoundRect(x1, y1, x2, y2, radius, radius, paint);
        }

        void close() {
            active = false;
            for (XC_MethodHook.Unhook hook : hooks) hook.unhook();
            hooks.clear();
            Runnable restore = () -> {
                for (Map.Entry<TextView, BodyStyle> entry : bodies.entrySet()) {
                    TextView view = entry.getKey();
                    if (view != null) entry.getValue().restore(view);
                }
                bodies.clear();
                rows.clear();
            };
            if (onMainThread()) restore.run();
            else new Handler(Looper.getMainLooper()).post(restore);
        }
    }

    private static Method findRowBind(Class<?> row, Class<?> message) throws NoSuchMethodException {
        Method match = null;
        boolean ambiguous = false;
        for (Method method : row.getDeclaredMethods()) {
            Class<?>[] parameters = method.getParameterTypes();
            if (Modifier.isStatic(method.getModifiers()) || method.getReturnType() != void.class
                    || parameters.length == 0 || parameters[0] != message) continue;
            if (method.getName().equals("setMessage")) return method;
            // R8 renames the renderer. Its other Message overload binds only the header.
            if (parameters.length < 5) continue;
            if (match != null) ambiguous = true;
            match = method;
        }
        if (ambiguous) throw new NoSuchMethodException("Ambiguous message row renderer");
        if (match == null) throw new NoSuchMethodException("Message row renderer");
        return match;
    }

    private static boolean onMainThread() {
        return Looper.myLooper() == Looper.getMainLooper();
    }

    private static int dp(View view, int dp) {
        return Math.round(dp * view.getResources().getDisplayMetrics().density);
    }

    private static final class BodyStyle {
        private int left, top, right, bottom;
        private int gravity, alignment;
        private int appliedHorizontal, appliedVertical, appliedGravity, appliedAlignment;
        private Style style;

        BodyStyle(TextView view) {
            gravity = appliedGravity = view.getGravity();
            alignment = appliedAlignment = view.getTextAlignment();
            left = view.getPaddingLeft();
            top = view.getPaddingTop();
            right = view.getPaddingRight();
            bottom = view.getPaddingBottom();
        }

        void apply(TextView view, Style next) {
            // Track padding and gravity updates made by the host on a recycled view.
            if (view.getPaddingLeft() != left + appliedHorizontal) left = view.getPaddingLeft();
            if (view.getPaddingRight() != right + appliedHorizontal) right = view.getPaddingRight();
            if (view.getPaddingTop() != top + appliedVertical) top = view.getPaddingTop();
            if (view.getPaddingBottom() != bottom + appliedVertical) bottom = view.getPaddingBottom();
            if (view.getGravity() != appliedGravity) gravity = view.getGravity();
            if (view.getTextAlignment() != appliedAlignment) alignment = view.getTextAlignment();
            appliedHorizontal = dp(view, 10);
            appliedVertical = dp(view, 6);
            appliedGravity = next.outgoing ? (gravity & ~Gravity.RELATIVE_HORIZONTAL_GRAVITY_MASK) | Gravity.RIGHT : gravity;
            appliedAlignment = next.outgoing ? View.TEXT_ALIGNMENT_GRAVITY : alignment;
            set(view, appliedHorizontal, appliedVertical, appliedGravity, appliedAlignment);
            if (style != next) view.invalidate();
            style = next;
        }

        void restore(TextView view) {
            int restoreLeft = restoredPadding(view.getPaddingLeft(), left, appliedHorizontal);
            int restoreRight = restoredPadding(view.getPaddingRight(), right, appliedHorizontal);
            int restoreTop = restoredPadding(view.getPaddingTop(), top, appliedVertical);
            int restoreBottom = restoredPadding(view.getPaddingBottom(), bottom, appliedVertical);
            view.setPadding(restoreLeft, restoreTop, restoreRight, restoreBottom);
            if (view.getGravity() == appliedGravity) view.setGravity(gravity);
            if (view.getTextAlignment() == appliedAlignment) view.setTextAlignment(alignment);
            view.invalidate();
        }

        private int restoredPadding(int current, int original, int extra) {
            return current == original + extra ? original : current;
        }

        private void set(TextView view, int horizontal, int vertical, int gravityValue, int alignmentValue) {
            if (view.getPaddingLeft() != left + horizontal || view.getPaddingRight() != right + horizontal
                    || view.getPaddingTop() != top + vertical || view.getPaddingBottom() != bottom + vertical) {
                view.setPadding(left + horizontal, top + vertical, right + horizontal, bottom + vertical);
            }
            if (view.getGravity() != gravityValue) view.setGravity(gravityValue);
            if (view.getTextAlignment() != alignmentValue) view.setTextAlignment(alignmentValue);
        }
    }
}
