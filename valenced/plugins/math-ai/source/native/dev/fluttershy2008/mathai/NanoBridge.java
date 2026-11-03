package dev.fluttershy2008.mathai;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

/** No AI SDK is loaded into Discord: a foreground companion owns Nano. */
public final class NanoBridge {
    public static final PluginBuilder nanoBridge = new PluginBuilder();
    private static final String PREFIX = "dev.fluttershy2008.math-ai.nano.";
    private static final String COMPANION = "dev.fluttershy2008.mathnano";
    private static final int REQUEST = 28374;
    private static Engine current;
    static {
        nanoBridge.start(new Function1<PluginScope, Unit>() { public Unit invoke(PluginScope scope) { start(scope); return Unit.INSTANCE; } });
        nanoBridge.stop(new Function1<PluginScope, Unit>() { public Unit invoke(PluginScope scope) { stop(); return Unit.INSTANCE; } });
    }
    private static synchronized void start(final PluginScope scope) {
        stop(); final Engine engine = new Engine(scope); current = engine;
        engine.currency = new CurrencyPreview(scope);
        scope.withAppContext(new Function1<Context, Unit>() { public Unit invoke(Context context) { if (engine.active) engine.context = context.getApplicationContext(); return Unit.INSTANCE; } });
        for (final String action : new String[] { "status", "solve", "setup", "cancel", "clear" })
            scope.getBridge().registerMethod(PREFIX + action, new Function1<List<?>, Object>() { public Object invoke(List<?> args) { return engine.call(action, args); } });
    }
    private static synchronized void stop() { if (current != null) { current.close(); current = null; } }
    private static final class Engine {
        final PluginScope scope;
        final List<XC_MethodHook.Unhook> hooks = new ArrayList<XC_MethodHook.Unhook>();
        final List<Class<?>> hooked = new ArrayList<Class<?>>();
        volatile boolean active = true;
        volatile Context context;
        CurrencyPreview currency;
        String phase = "idle", nonce = "", answer = "", error = "", availability = "unknown";
        boolean setup;
        Engine(PluginScope scope) { this.scope = scope; }
        synchronized Map<String, Object> snapshot() {
            Map<String, Object> out = new HashMap<String, Object>();
            out.put("phase", phase); out.put("jobId", nonce); out.put("answer", answer); out.put("error", error); out.put("availability", availability); return out;
        }
        synchronized Object call(String action, List<?> args) {
            if (!active) throw new IllegalStateException("Math Nano bridge is stopped. Restart Valenced.");
            if (action.equals("status")) return snapshot();
            if ((action.equals("cancel") || action.equals("clear")) && !args.isEmpty() && !nonce.equals(args.get(0))) return snapshot();
            if (action.equals("cancel")) { cancel(); return snapshot(); }
            if (action.equals("clear")) { if (!phase.equals("opening")) { answer = ""; error = ""; phase = "idle"; } return snapshot(); }
            if (phase.equals("opening")) throw new IllegalStateException("Finish or cancel the current Nano screen first.");
            if (!action.equals("solve") && !action.equals("setup")) throw new IllegalArgumentException("Unknown Nano action.");
            setup = action.equals("setup");
            final String question, angle; final boolean steps;
            if (setup) { question = ""; angle = "DEG"; steps = true; }
            else {
                if (args.size() != 3 || !(args.get(0) instanceof String) || !(args.get(1) instanceof String) || !(args.get(2) instanceof Boolean)) throw new IllegalArgumentException("Enter a math question first.");
                question = ((String) args.get(0)).trim(); angle = "RAD".equals(args.get(1)) ? "RAD" : "DEG"; steps = ((Boolean) args.get(2)).booleanValue();
                if (question.length() < 1 || question.length() > 6000) throw new IllegalArgumentException("Use 1 to 6,000 characters.");
            }
            nonce = UUID.randomUUID().toString(); final String request = nonce; answer = ""; error = ""; phase = "opening";
            scope.withAppActivity(new Function1<Activity, Unit>() { public Unit invoke(final Activity activity) {
                activity.runOnUiThread(new Runnable() { public void run() {
                    synchronized (Engine.this) {
                        if (!active || !nonce.equals(request) || !phase.equals("opening")) return;
                        try {
                            hook(activity);
                            Intent intent = new Intent().setClassName(COMPANION, COMPANION + ".NanoActivity")
                                .putExtra("question", question).putExtra("angle", angle).putExtra("steps", steps)
                                .putExtra("nonce", request).putExtra("setup", setup);
                            activity.startActivityForResult(intent, REQUEST);
                        } catch (android.content.ActivityNotFoundException e) { phase = "error"; error = "Install the Math Nano companion APK first, then try again."; }
                        catch (Throwable e) { phase = "error"; error = "Could not open Math Nano. Restart Discord and check the companion installation."; }
                    }
                } }); return Unit.INSTANCE;
            } });
            return snapshot();
        }
        private synchronized void hook(Activity activity) throws Exception {
            Class<?> type = activity.getClass(); Method method = null;
            while (type != null) { try { method = type.getDeclaredMethod("onActivityResult", Integer.TYPE, Integer.TYPE, Intent.class); break; } catch (NoSuchMethodException e) { type = type.getSuperclass(); } }
            if (method == null) throw new IllegalStateException("Activity results unavailable.");
            if (hooked.contains(type)) return; hooked.add(type);
            hooks.add(XposedBridge.hookMethod(method, new XC_MethodHook() { @Override protected void afterHookedMethod(MethodHookParam p) {
                synchronized (Engine.this) {
                    if (!active || !phase.equals("opening") || ((Number) p.args[0]).intValue() != REQUEST) return;
                    Intent data = (Intent) p.args[2];
                    if (data == null) { phase = "cancelled"; return; }
                    if (!nonce.equals(data.getStringExtra("nonce"))) return;
                    String state = data.getStringExtra("availability"); if (state != null) availability = state;
                    String text = data.getStringExtra("answer");
                    if (setup) { phase = "done"; return; }
                    if (((Number) p.args[1]).intValue() != Activity.RESULT_OK || text == null || text.trim().isEmpty()) { phase = "cancelled"; return; }
                    if (text.length() > 16000) { phase = "error"; error = "Nano's answer was too long. Try a shorter question."; return; }
                    answer = text; phase = "done";
                }
            } }));
        }
        private synchronized void cancel() {
            if (context != null && !nonce.isEmpty()) {
                try { context.sendBroadcast(new Intent(COMPANION + ".CANCEL").setPackage(COMPANION).putExtra("nonce", nonce)); } catch (Throwable ignored) { }
            }
            phase = "cancelled"; nonce = ""; answer = "";
        }
        synchronized void close() {
            cancel(); active = false;
            if (currency != null) { currency.close(); currency = null; }
            for (XC_MethodHook.Unhook hook : hooks) try { hook.unhook(); } catch (Throwable ignored) { }
            hooks.clear(); hooked.clear(); context = null;
        }
    }
}
