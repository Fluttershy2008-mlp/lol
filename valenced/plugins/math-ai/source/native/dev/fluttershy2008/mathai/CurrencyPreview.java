package dev.fluttershy2008.mathai;

import android.content.Context;
import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.style.ReplacementSpan;
import android.widget.TextView;
import android.view.View;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.lang.ref.WeakReference;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

/** Displays a fetched conversion with an owned span; never edits draft characters. */
final class CurrencyPreview {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final PluginScope scope;
    private final WeakHashMap<TextView, State> states = new WeakHashMap<TextView, State>();
    private final ArrayList<XC_MethodHook.Unhook> hooks = new ArrayList<XC_MethodHook.Unhook>();
    private volatile boolean active = true, ready;
    private volatile Class<?> inputClass;
    private volatile String source = "", label = "", error = "";
    private long revision;

    CurrencyPreview(final PluginScope scope) {
        this.scope = scope;
        scope.getBridge().registerMethod("dev.fluttershy2008.math-ai.currency.preview", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) { return update(args); }
        });
        scope.withAppContext(new Function1<Context, Unit>() {
            public Unit invoke(Context context) {
                begin(context);
                return Unit.INSTANCE;
            }
        });
    }

    private synchronized void begin(Context context) {
        if (!active) return;
        try {
            inputClass = context.getClassLoader().loadClass("com.discord.chat.input.views.DCDChatInput");
            hook(TextView.class.getDeclaredMethod("onTextChanged", CharSequence.class, Integer.TYPE, Integer.TYPE, Integer.TYPE));
            hook(TextView.class.getDeclaredMethod("onSelectionChanged", Integer.TYPE, Integer.TYPE));
            ready = true;
        } catch (Throwable failure) { error = "Currency input hook unavailable: " + failure.getClass().getSimpleName(); }
    }

    private void hook(Method method) {
        hooks.add(XposedBridge.hookMethod(method, new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (!active || inputClass == null || !inputClass.isInstance(param.thisObject)) return;
                final TextView view = (TextView) param.thisObject;
                main.post(new Runnable() { public void run() { attach(view); } });
            }
        }));
    }

    private synchronized Object update(List<?> args) {
        if (active && args.size() == 3 && args.get(0) instanceof Number && args.get(1) instanceof String && args.get(2) instanceof String) {
            final long next = ((Number) args.get(0)).longValue();
            String raw = (String) args.get(1), display = (String) args.get(2);
            if (next > revision && raw.length() <= 2000 && display.length() <= 300) {
                revision = next; source = raw; label = display;
                main.post(new Runnable() {
                    public void run() {
                        synchronized (CurrencyPreview.this) {
                            if (!active || next != revision) return;
                            for (State state : new ArrayList<State>(states.values())) state.apply();
                        }
                    }
                });
                // Also attach the focused input if the draft already existed
                // before our text hook was installed.
                scope.withAppActivity(new Function1<Activity, Unit>() {
                    public Unit invoke(final Activity activity) {
                        main.post(new Runnable() {
                            public void run() {
                                synchronized (CurrencyPreview.this) {
                                    if (!active || next != revision || inputClass == null) return;
                                    View focus = activity.getCurrentFocus();
                                    if (focus instanceof TextView && inputClass.isInstance(focus)) attach((TextView) focus);
                                }
                            }
                        });
                        return Unit.INSTANCE;
                    }
                });
            }
        }
        Map<String, Object> result = new HashMap<String, Object>();
        result.put("ready", active && ready); result.put("error", error); return result;
    }

    private void attach(TextView view) {
        if (!active || view.getEditableText() == null) return;
        State state = states.get(view);
        if (state == null) { state = new State(view); states.put(view, state); view.addTextChangedListener(state); }
        state.apply();
    }

    private final class State implements TextWatcher {
        final WeakReference<TextView> view;
        boolean applying;
        State(TextView view) { this.view = new WeakReference<TextView>(view); }
        public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
        public void onTextChanged(CharSequence s, int start, int before, int count) { }
        public void afterTextChanged(Editable text) { apply(); }
        void apply() {
            TextView editor = view.get(); if (editor == null || applying) return;
            Editable text = editor.getEditableText(); if (text == null) return;
            applying = true;
            try {
                boolean selected = editor.getSelectionStart() != editor.getSelectionEnd();
                if (restyle(text, active && editor.hasFocus() && !selected ? source : "", label)) {
                    editor.requestLayout(); editor.invalidate();
                }
            } finally { applying = false; }
        }
    }

    static final class ConversionSpan extends ReplacementSpan {
        final String label;
        ConversionSpan(String label) { this.label = label; }
        @Override public int getSize(Paint paint, CharSequence text, int start, int end, Paint.FontMetricsInt metrics) {
            if (metrics != null) paint.getFontMetricsInt(metrics);
            return (int) Math.ceil(paint.measureText(label));
        }
        @Override public void draw(Canvas canvas, CharSequence text, int start, int end, float x, int top, int y, int bottom, Paint paint) {
            canvas.drawText(label, x, y, paint);
        }
    }

    static boolean restyle(Editable text, String expected, String display) {
        if (text == null) return false;
        boolean show = !expected.isEmpty() && !display.isEmpty() && expected.equals(text.toString());
        if (show) for (Object span : text.getSpans(0, text.length(), Object.class)) {
            if ((text.getSpanFlags(span) & 256) != 0) { show = false; break; }
        }
        ConversionSpan[] previous = text.getSpans(0, text.length(), ConversionSpan.class);
        if (show && previous.length == 1 && previous[0].label.equals(display)
                && text.getSpanStart(previous[0]) == 0 && text.getSpanEnd(previous[0]) == text.length()) return false;
        for (ConversionSpan span : previous) text.removeSpan(span);
        if (show) text.setSpan(new ConversionSpan(display), 0, text.length(), 33);
        return previous.length != 0 || show;
    }

    synchronized void close() {
        active = false; ready = false; source = ""; label = "";
        for (XC_MethodHook.Unhook hook : hooks) try { hook.unhook(); } catch (Throwable ignored) { }
        hooks.clear();
        main.post(new Runnable() {
            public void run() {
                for (Map.Entry<TextView, State> entry : new ArrayList<Map.Entry<TextView, State>>(states.entrySet())) {
                    entry.getKey().removeTextChangedListener(entry.getValue());
                    if (restyle(entry.getKey().getEditableText(), "", "")) { entry.getKey().requestLayout(); entry.getKey().invalidate(); }
                }
                states.clear();
            }
        });
    }
}
