package dev.fluttershy2008.messagebubbles;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.icu.lang.UCharacter;
import android.icu.lang.UProperty;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.text.Spanned;
import android.text.style.ReplacementSpan;
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
        PLUM(0xF1714E78, 0xF2E8D9F3, false),
        INDIGO(0xF149577E, 0xF2DEE3F7, false),
        BERRY(0xF1794964, 0xF2F1D9E7, false),
        BLUE(0xF13D657F, 0xF2D6EAF7, true);

        final int dark;
        final int light;
        final boolean own;

        Style(int dark, int light, boolean own) {
            this.dark = dark;
            this.light = light;
            this.own = own;
        }
    }

    private static final class Session {
        private final List<XC_MethodHook.Unhook> hooks = new ArrayList<>();
        private final Map<View, Style> rows = new WeakHashMap<>();
        private final Map<TextView, BodyStyle> bodies = new WeakHashMap<>();
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path shape = new Path();
        private final RectF bounds = new RectF();
        private final float[] corners = new float[8];
        private final MessageRowLayout rowLayout = new MessageRowLayout();
        private volatile boolean active;
        private Class<?> bodyClass;
        private Class<?> accessoriesClass;
        private Method ownMessage;
        private Method authorId;
        private Method messageContent;
        private Method hasContent;
        private Method forwardInfo;
        private Method firstForumPost;
        private boolean reportedAuthorError;

        void install(ClassLoader loader) throws ReflectiveOperationException {
            Class<?> rowClass = loader.loadClass(PRESENTATION + "MessageView").asSubclass(ViewGroup.class);
            Class<?> messageClass = loader.loadClass(CHAT + "bridge.Message");
            bodyClass = loader.loadClass(PRESENTATION + "view.MessageContentView").asSubclass(TextView.class);
            accessoriesClass = loader.loadClass(PRESENTATION + "MessageAccessoriesView").asSubclass(ViewGroup.class);
            Method bind = findRowBind(rowClass, messageClass);
            ownMessage = messageClass.getMethod("isCurrentUserMessageAuthor");
            findContentGetters(messageClass);
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
                    ViewGroup row = (ViewGroup) param.thisObject;
                    rowLayout.restoreRow(row);
                    rows.put(row, styleOf(param.args[0]));
                }

                @Override protected void afterHookedMethod(MethodHookParam param) {
                    if (!active || !onMainThread() || param.hasThrowable()) return;
                    ViewGroup row = (ViewGroup) param.thisObject;
                    if (isRegularTextMessage(param.args[0])) {
                        rowLayout.applyRow(row, rows.get(row).own);
                    }
                    for (int i = 0; i < row.getChildCount(); i++) {
                        View child = row.getChildAt(i);
                        if (!accessoriesClass.isInstance(child)) continue;
                        ViewGroup accessories = (ViewGroup) child;
                        for (int j = 0; j < accessories.getChildCount(); j++) {
                            View accessory = accessories.getChildAt(j);
                            updateBody(accessory);
                            rowLayout.updateReaction(accessory);
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
                bodyClass.getMethod("setText", CharSequence.class, TextView.BufferType.class),
                new XC_MethodHook() {
                    @Override protected void afterHookedMethod(MethodHookParam param) {
                        if (active && !param.hasThrowable() && onMainThread()) updateBody((View) param.thisObject);
                    }
                }
            ));
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
                        if (body != null && !body.emojiOnly && body.style == styleFor(view)) {
                            drawBubble(view, (Canvas) param.args[0], body.style);
                        }
                    }
                }
            ));
            rowLayout.install(loader, hooks);
            active = true;
        }

        private void findContentGetters(Class<?> messageClass) {
            try {
                messageContent = messageClass.getMethod("getContent");
                forwardInfo = messageClass.getMethod("getForwardInfo");
                firstForumPost = messageClass.getMethod("isFirstForumPostMessage");
                for (Method method : messageContent.getReturnType().getDeclaredMethods()) {
                    if (Modifier.isAbstract(method.getModifiers()) && method.getParameterCount() == 0
                            && method.getReturnType() == boolean.class) {
                        if (hasContent != null) {
                            hasContent = null;
                            return;
                        }
                        hasContent = method;
                    }
                }
            } catch (NoSuchMethodException error) {
                XposedBridge.log("[Message Bubbles] Compact rows unavailable: " + error);
            }
        }

        private boolean isRegularTextMessage(Object message) {
            if (message == null || hasContent == null) return false;
            try {
                Object content = messageContent.invoke(message);
                return content != null && Boolean.TRUE.equals(hasContent.invoke(content))
                    && forwardInfo.invoke(message) == null && !Boolean.TRUE.equals(firstForumPost.invoke(message));
            } catch (ReflectiveOperationException error) {
                XposedBridge.log("[Message Bubbles] Could not identify a text message: " + error);
                hasContent = null;
                return false;
            }
        }

        private Style styleOf(Object message) {
            if (message == null) return Style.PLUM;
            try {
                if (Boolean.TRUE.equals(ownMessage.invoke(message))) return Style.BLUE;
                Object author = authorId == null ? null : authorId.invoke(message);
                if (author != null) {
                    int hash = author.hashCode();
                    switch (Math.floorMod(hash ^ (hash >>> 12), 3)) {
                        case 1: return Style.INDIGO;
                        case 2: return Style.BERRY;
                        default: return Style.PLUM;
                    }
                }
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

            int horizontal = dp(view, 11);
            int vertical = dp(view, 7);
            int scrollX = view.getScrollX();
            int scrollY = view.getScrollY();
            int originX = view.getCompoundPaddingLeft();
            int originY = view.getTotalPaddingTop();
            float x1 = Math.max(scrollX, originX + left - horizontal);
            float x2 = Math.min(scrollX + view.getWidth(), originX + right + horizontal);
            float y1 = Math.max(scrollY, originY + layout.getLineTop(0) - vertical);
            float y2 = Math.min(scrollY + view.getHeight(), originY + layout.getHeight() + vertical);
            if (x2 <= x1 || y2 <= y1) return;

            boolean light = Color.luminance(view.getCurrentTextColor()) < 0.35;
            float radius = dp(view, 16);
            java.util.Arrays.fill(corners, radius);
            int near = style.own ? 6 : 4;
            corners[near] = corners[near + 1] = dp(view, 8);
            // Inset the outline so it stays inside the native text view's clip.
            bounds.set(x1 + 0.5f, y1 + 0.5f, x2 - 0.5f, y2 - 0.5f);
            shape.rewind();
            shape.addRoundRect(bounds, corners, Path.Direction.CW);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(light ? style.light : style.dark);
            canvas.drawPath(shape, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(Math.max(1f, dp(view, 1) * 0.65f));
            paint.setColor(light ? 0x240F111A : 0x26FFFFFF);
            canvas.drawPath(shape, paint);
        }

        void close() {
            active = false;
            for (XC_MethodHook.Unhook hook : hooks) hook.unhook();
            hooks.clear();
            Runnable restore = () -> {
                rowLayout.close();
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

    static boolean onMainThread() {
        return Looper.myLooper() == Looper.getMainLooper();
    }

    static int dp(View view, int dp) {
        return Math.round(dp * view.getResources().getDisplayMetrics().density);
    }

    private static final class BodyStyle {
        private int left, top, right, bottom;
        private int gravity, alignment;
        private int appliedHorizontal, appliedVertical, appliedGravity, appliedAlignment;
        private Style style;
        private boolean emojiOnly;

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
            boolean onlyEmoji = isEmojiOnly(view.getText());
            appliedHorizontal = onlyEmoji ? 0 : dp(view, 11);
            appliedVertical = dp(view, onlyEmoji ? 3 : 7);
            int side = next.own ? Gravity.LEFT : Gravity.RIGHT;
            appliedGravity = (gravity & ~Gravity.RELATIVE_HORIZONTAL_GRAVITY_MASK) | side;
            appliedAlignment = View.TEXT_ALIGNMENT_GRAVITY;
            set(view, appliedHorizontal, appliedVertical, appliedGravity, appliedAlignment);
            if (style != next || emojiOnly != onlyEmoji) view.invalidate();
            style = next;
            emojiOnly = onlyEmoji;
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

    private static boolean isEmojiOnly(CharSequence text) {
        boolean emoji = false;
        for (int i = 0; i < text.length();) {
            int code = Character.codePointAt(text, i);
            int next = i + Character.charCount(code);
            if (code == 0x200B || code == 0xFFFC) {
                if (text instanceof Spanned
                        && ((Spanned) text).getSpans(i, next, ReplacementSpan.class).length != 0) emoji = true;
            } else if ((code >= '0' && code <= '9') || code == '#' || code == '*') {
                int keycap = next < text.length() && text.charAt(next) == 0xFE0F ? next + 1 : next;
                if (keycap >= text.length() || text.charAt(keycap) != 0x20E3) return false;
                next = keycap + 1;
                emoji = true;
            } else if (UCharacter.hasBinaryProperty(code, UProperty.EMOJI_PRESENTATION)
                    || (next < text.length() && text.charAt(next) == 0xFE0F
                        && UCharacter.hasBinaryProperty(code, UProperty.EMOJI))) {
                emoji = true;
            } else if (!Character.isWhitespace(code) && code != 0x200D && code != 0xFE0F
                    && (code < 0xE0020 || code > 0xE007F)) {
                return false;
            }
            i = next;
        }
        return emoji;
    }
}
