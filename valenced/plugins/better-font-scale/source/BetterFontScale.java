package dev.fluttershy2008.fontscale;

import android.content.Context;
import android.content.res.Resources;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.ViewParent;
import android.widget.TextView;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import kotlin.Unit;

public final class BetterFontScale {
    public static final PluginBuilder betterFontScale = new PluginBuilder();
    private static final String BRIDGE_METHOD = "dev.fluttershy2008.better-font-scale.update";
    private static volatile Session current;

    static {
        betterFontScale.start(scope -> {
            start(scope);
            return Unit.INSTANCE;
        });
        betterFontScale.stop(scope -> {
            Session session = current;
            current = null;
            if (session != null) session.close();
            return Unit.INSTANCE;
        });
    }

    private BetterFontScale() {}

    private static void start(PluginScope scope) {
        Session session;
        try {
            session = new Session(scope.getClassLoader());
        } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
            // The JS controls for profiles and the sidebar can still work.
            return;
        }
        current = session;
        scope.withAppContext(context -> {
            session.main.post(() -> session.resolveIds(context));
            return Unit.INSTANCE;
        });
        scope.getBridge().registerMethod(BRIDGE_METHOD, args -> {
            Session active = current;
            if (active == null) return false;
            active.update(args);
            return true;
        });
    }

    private static final class Session {
        private static final int MESSAGES = 0;
        private static final int CHATBOX = 1;
        private static final int USERNAME = 2;
        private static final int TIMESTAMPS = 3;

        final Handler main = new Handler(Looper.getMainLooper());
        private final Map<TextView, TextSize> views = new WeakHashMap<>();
        private final Class<? extends TextView> body;
        private final Class<? extends TextView> composer;
        private final Class<?> messageRow;
        private final XC_MethodHook.Unhook measure;
        private final int[] scales = {100, 100, 100, 100};
        private int authorId;
        private int timestampId;

        Session(ClassLoader loader) throws ReflectiveOperationException {
            body = loader.loadClass("com.discord.chat.presentation.message.view.MessageContentView")
                .asSubclass(TextView.class);
            composer = loader.loadClass("com.discord.chat.input.views.DCDChatInput").asSubclass(TextView.class);
            messageRow = loader.loadClass("com.discord.chat.presentation.message.MessageView");
            measure = XposedBridge.hookMethod(
                TextView.class.getDeclaredMethod("onMeasure", int.class, int.class),
                new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam param) {
                        if (current == Session.this && Looper.myLooper() == Looper.getMainLooper()) {
                            apply((TextView) param.thisObject);
                        }
                    }
                });
        }

        void resolveIds(Context context) {
            Resources resources = context.getResources();
            String packageName = context.getPackageName();
            authorId = resources.getIdentifier("author_name", "id", packageName);
            timestampId = resources.getIdentifier("timestamp", "id", packageName);
            // Patched APKs can retain Discord's original resource package.
            if (authorId == 0) authorId = resources.getIdentifier("author_name", "id", "com.discord");
            if (timestampId == 0) timestampId = resources.getIdentifier("timestamp", "id", "com.discord");
        }

        private int role(TextView view) {
            if (body.isInstance(view)) return MESSAGES;
            if (composer.isInstance(view)) return CHATBOX;
            int id = view.getId();
            if (id == 0 || (id != authorId && id != timestampId)) return -1;
            for (ViewParent parent = view.getParent(); parent != null; parent = parent.getParent()) {
                if (messageRow.isInstance(parent)) return id == authorId ? USERNAME : TIMESTAMPS;
            }
            return -1;
        }

        private void apply(TextView view) {
            int role = role(view);
            if (role < 0) {
                TextSize previous = views.remove(view);
                if (previous != null) previous.apply(view, 100);
                return;
            }
            TextSize size = views.get(view);
            if (size == null) {
                size = new TextSize(view.getTextSize());
                views.put(view, size);
            }
            size.apply(view, scales[role]);
        }

        void update(List<?> args) {
            int[] values = new int[scales.length];
            for (int i = 0; i < values.length; i++) {
                Object value = i < args.size() ? args.get(i) : null;
                int scale = value instanceof Number ? ((Number) value).intValue() : 100;
                values[i] = Math.max(60, Math.min(180, scale));
            }
            main.post(() -> {
                if (current != this) return;
                System.arraycopy(values, 0, scales, 0, values.length);
                // Snapshot because detached headers can lose their message-row role.
                for (TextView view : views.keySet().toArray(new TextView[0])) apply(view);
            });
        }

        void close() {
            measure.unhook();
            main.post(() -> {
                for (Map.Entry<TextView, TextSize> entry : views.entrySet()) {
                    TextView view = entry.getKey();
                    if (view != null) entry.getValue().apply(view, 100);
                }
                views.clear();
            });
        }
    }

    private static final class TextSize {
        private float base;
        private float applied;

        TextSize(float pixels) {
            base = applied = pixels;
        }

        void apply(TextView view, int percent) {
            float currentSize = view.getTextSize();
            // Respect changes from Discord, Android accessibility and recycled rows.
            if (Math.abs(currentSize - applied) > 0.01f) base = currentSize;
            applied = base * percent / 100f;
            if (Math.abs(currentSize - applied) > 0.01f) {
                view.setTextSize(TypedValue.COMPLEX_UNIT_PX, applied);
            }
        }
    }
}
