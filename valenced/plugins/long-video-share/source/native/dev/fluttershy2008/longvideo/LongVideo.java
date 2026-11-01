package dev.fluttershy2008.longvideo;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.provider.OpenableColumns;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

/** Native work stays off the React thread. Only small status maps cross the bridge. */
public final class LongVideo {
    public static final PluginBuilder longVideo = new PluginBuilder();
    private static final String PREFIX = "dev.fluttershy2008.long-video-share.";
    private static final int PICK = 27971, SAVE = 27972;
    private static Engine current;
    static {
        longVideo.start(new Function1<PluginScope, Unit>() {
            public Unit invoke(PluginScope scope) { start(scope); return Unit.INSTANCE; }
        });
        longVideo.stop(new Function1<PluginScope, Unit>() {
            public Unit invoke(PluginScope scope) { stop(); return Unit.INSTANCE; }
        });
    }
    private LongVideo() {}
    private static synchronized void start(final PluginScope scope) {
        stop();
        final Engine engine = new Engine(scope); current = engine;
        scope.withAppContext(new Function1<Context, Unit>() {
            public Unit invoke(Context context) { if (engine.active) engine.context = context.getApplicationContext(); return Unit.INSTANCE; }
        });
        for (final String name : new String[] { "status", "pick", "compress", "cancel", "save", "clear" }) {
            scope.getBridge().registerMethod(PREFIX + name, new Function1<List<?>, Object>() {
                public Object invoke(List<?> args) { return engine.call(name, args); }
            });
        }
    }
    private static synchronized void stop() {
        if (current != null) { current.close(); current = null; }
    }
    static final class Media {
        Uri uri; String name; long size, durationUs, audioBytes; int width, height, rotation, videoTrack = -1, audioTrack = -1;
        MediaFormat video, audio;
    }
    static final class Job implements Transcoder.Progress {
        volatile boolean cancelled;
        volatile int progress, attempt;
        volatile String phase = "idle", error;
        volatile File output;
        volatile Media media;
        volatile long limit;
        public boolean cancelled() { return cancelled || Thread.currentThread().isInterrupted(); }
        public void update(long time, long duration) { progress = Math.max(progress, Math.min(97, (int) (time * 97.0 / duration))); }
    }
    private static final class Engine {
        final PluginScope scope;
        final ExecutorService worker = Executors.newSingleThreadExecutor();
        final List<XC_MethodHook.Unhook> hooks = new ArrayList<XC_MethodHook.Unhook>();
        final List<Class<?>> hooked = new ArrayList<Class<?>>();
        volatile boolean active = true;
        volatile Context context;
        volatile Job job = new Job();
        Engine(PluginScope scope) { this.scope = scope; }
        synchronized Object call(String name, List<?> args) {
            if (!active) throw new IllegalStateException("Long Video Share is stopped. Reopen its settings.");
            final Job j = job;
            if (name.equals("status")) return status(j);
            if (name.equals("cancel")) {
                if (j.phase.equals("compressing") || j.phase.equals("inspecting")) { j.cancelled = true; j.phase = "cancelling"; }
                return status(j);
            }
            if (busy(j)) throw new IllegalStateException("Wait for the current video operation to finish.");
            if (name.equals("clear")) { remove(j.output); job = new Job(); return status(job); }
            if (name.equals("pick")) {
                remove(j.output); final Job next = new Job(); next.phase = "picking"; job = next;
                launch(PICK, next); return status(next);
            }
            if (name.equals("save")) {
                if (j.output == null || !j.output.isFile() || j.output.length() >= j.limit)
                    throw new IllegalStateException("Compress a video successfully before saving it.");
                j.phase = "choosing-save"; j.error = null; launch(SAVE, j); return status(j);
            }
            if (name.equals("compress")) {
                if (j.media == null) throw new IllegalStateException("Choose a video first.");
                if (args.size() != 2 || !(args.get(0) instanceof Number) || !(args.get(1) instanceof Number))
                    throw new IllegalArgumentException("Choose a target size and resolution.");
                final long limit = ((Number) args.get(0)).longValue(); final int side = ((Number) args.get(1)).intValue();
                Budget.bitrate(limit, j.media.audioBytes, j.media.durationUs);
                Budget.dimensions(j.media.width, j.media.height, side);
                j.limit = limit; j.cancelled = false; j.progress = 0; j.phase = "compressing"; j.error = null;
                worker.execute(new Runnable() { public void run() { compress(j, side); } });
                return status(j);
            }
            throw new IllegalArgumentException("Unknown video action.");
        }
        boolean busy(Job j) {
            return j.phase.equals("picking") || j.phase.equals("inspecting") || j.phase.equals("compressing")
                || j.phase.equals("cancelling") || j.phase.equals("choosing-save") || j.phase.equals("saving");
        }
        synchronized Map<String, Object> status(Job j) {
            Map<String, Object> out = new HashMap<String, Object>();
            out.put("phase", j.phase); out.put("progress", j.progress); out.put("attempt", j.attempt);
            out.put("error", j.error); out.put("limitBytes", (double) j.limit);
            if (j.media != null) {
                Media m = j.media; out.put("name", m.name); out.put("sourceBytes", (double) m.size);
                out.put("durationSeconds", m.durationUs / 1000000.0); out.put("width", m.width); out.put("height", m.height);
                out.put("audioBytes", (double) m.audioBytes);
            }
            File f = j.output;
            out.put("outputBytes", f != null && f.isFile() ? (double) f.length() : 0.0);
            return out;
        }
        void launch(final int code, final Job j) {
            scope.withAppActivity(new Function1<Activity, Unit>() {
                public Unit invoke(final Activity activity) {
                    activity.runOnUiThread(new Runnable() { public void run() {
                        if (!active || job != j) return;
                        try {
                            hook(activity);
                            Intent intent = new Intent(code == PICK ? Intent.ACTION_OPEN_DOCUMENT : Intent.ACTION_CREATE_DOCUMENT);
                            intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(code == PICK ? "video/*" : "video/mp4");
                            if (code == PICK) intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            else intent.putExtra(Intent.EXTRA_TITLE, "discord-video-" + System.currentTimeMillis() + ".mp4");
                            activity.startActivityForResult(intent, code);
                        } catch (Throwable error) { fail(j, "Could not open Android's file picker. Return to Discord and try again."); }
                    } });
                    return Unit.INSTANCE;
                }
            });
        }
        synchronized void hook(Activity activity) throws Exception {
            Class<?> type = activity.getClass();
            Method method = null;
            while (type != null) {
                try { method = type.getDeclaredMethod("onActivityResult", Integer.TYPE, Integer.TYPE, Intent.class); break; }
                catch (NoSuchMethodException e) { type = type.getSuperclass(); }
            }
            if (method == null) throw new IllegalStateException("Activity results unavailable.");
            if (hooked.contains(type)) return;
            hooked.add(type);
            hooks.add(XposedBridge.hookMethod(method, new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam p) {
                    int request = ((Number) p.args[0]).intValue();
                    if (!active || request != PICK && request != SAVE) return;
                    final Job j = job;
                    if (request == PICK && !j.phase.equals("picking") || request == SAVE && !j.phase.equals("choosing-save")) return;
                    int result = ((Number) p.args[1]).intValue(); final Intent data = (Intent) p.args[2];
                    if (result != Activity.RESULT_OK || data == null || data.getData() == null) {
                        j.phase = j.output == null ? "idle" : "ready"; return;
                    }
                    final Uri uri = data.getData();
                    final boolean inspecting = request == PICK;
                    j.phase = request == PICK ? "inspecting" : "saving";
                    worker.execute(new Runnable() { public void run() {
                        try {
                            if (inspecting) {
                                Media media = inspect(context, uri, j);
                                if (active && job == j && !j.cancelled()) { j.media = media; j.phase = "selected"; }
                                else { j.phase = "cancelled"; }
                            } else {
                                try { save(j, uri); }
                                catch (Exception error) {
                                    // This URI was just created by our Save picker. Remove a partial export.
                                    try { context.getContentResolver().delete(uri, null, null); } catch (Throwable ignored) {}
                                    throw error;
                                }
                            }
                        } catch (Throwable error) { fail(j, message(error)); }
                    } });
                }
            }));
        }
        void compress(Job j, int side) {
            File output = null;
            try {
                if (context == null) throw new IllegalStateException("Android context is not ready. Restart Discord and retry.");
                int bitrate = Budget.bitrate(j.limit, j.media.audioBytes, j.media.durationUs);
                File dir = new File(context.getCacheDir(), "long-video-share");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("Could not create a temporary video file.");
                remove(j.output); j.output = null;
                for (int attempt = 1; attempt <= 3; attempt++) {
                    if (!active || j.cancelled()) throw new InterruptedException();
                    j.attempt = attempt; j.progress = 0;
                    output = File.createTempFile("long-video-", ".mp4", dir);
                    Transcoder.encode(context, j.media, output, bitrate, side, j);
                    if (!active || j.cancelled()) throw new InterruptedException();
                    long bytes = output.length();
                    if (bytes > 0 && bytes < j.limit) { j.output = output; j.progress = 100; j.phase = "ready"; return; }
                    bitrate = Budget.retry(bitrate, Math.max(1, bytes), j.limit);
                    remove(output); output = null;
                }
                throw new IllegalStateException("The encoder could not meet this target. Try 480p or a larger size limit, or share a hosted link.");
            } catch (Throwable error) { remove(output); fail(j, message(error)); }
        }
        void save(Job j, Uri uri) throws Exception {
            if (!active || j.cancelled()) throw new InterruptedException();
            OutputStream out = context.getContentResolver().openOutputStream(uri, "wt");
            if (out == null) throw new IllegalStateException("Could not open the save location.");
            try {
                FileInputStream in = new FileInputStream(j.output);
                try {
                    byte[] buffer = new byte[131072]; int count;
                    while ((count = in.read(buffer)) != -1) {
                        if (!active || j.cancelled()) throw new InterruptedException();
                        out.write(buffer, 0, count);
                    }
                    out.flush();
                } finally { in.close(); }
            } finally { out.close(); }
            if (active && job == j) j.phase = "saved";
        }
        void fail(Job j, String error) {
            if (job != j || !active) return;
            j.error = j.cancelled() ? null : error;
            j.phase = j.cancelled() ? "cancelled" : "error";
        }
        synchronized void close() {
            active = false; job.cancelled = true;
            worker.shutdownNow();
            for (XC_MethodHook.Unhook hook : hooks) { try { hook.unhook(); } catch (Throwable ignored) {} }
            hooks.clear(); hooked.clear();
            // Deletion runs after a worker has released its codecs and file handles.
            final File output = job.output;
            remove(output);
        }
    }
    private static void remove(File file) { if (file != null) file.delete(); }
    private static String message(Throwable e) {
        String msg = e.getMessage();
        if (e instanceof InterruptedException) return "Video processing was cancelled.";
        return msg == null || msg.length() > 260 ? "Android could not process this video. Try an SDR MP4 with AAC audio, or share a hosted link." : msg;
    }
    private static long number(MediaFormat f, String key, long fallback) {
        if (!f.containsKey(key)) return fallback;
        try { return f.getLong(key); } catch (RuntimeException e) { return f.getInteger(key); }
    }
    private static Media inspect(Context context, Uri uri, Job job) throws Exception {
        if (context == null) throw new IllegalStateException("Android context is not ready. Restart Discord.");
        Media m = new Media(); m.uri = uri; m.name = "Video";
        Cursor cursor = context.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null);
        if (cursor != null) {
            try { if (cursor.moveToFirst()) { m.name = cursor.getString(0); m.size = cursor.isNull(1) ? 0 : cursor.getLong(1); } }
            finally { cursor.close(); }
        }
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(context, uri, null);
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat f = extractor.getTrackFormat(i); String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/") && m.videoTrack == -1) { m.videoTrack = i; m.video = f; }
                if (mime != null && mime.startsWith("audio/") && m.audioTrack == -1) { m.audioTrack = i; m.audio = f; }
            }
            if (m.videoTrack < 0) throw new IllegalArgumentException("This file does not contain a supported video track.");
            m.width = m.video.getInteger(MediaFormat.KEY_WIDTH); m.height = m.video.getInteger(MediaFormat.KEY_HEIGHT);
            m.durationUs = number(m.video, MediaFormat.KEY_DURATION, 0);
            m.rotation = (int) number(m.video, "rotation-degrees", 0);
            int transfer = (int) number(m.video, "color-transfer", 0);
            if (transfer == 6 || transfer == 7) throw new IllegalArgumentException("This is an HDR video. Export an SDR copy first to preserve its colours, or share a hosted link.");
            if (m.durationUs <= 0) throw new IllegalArgumentException("Android could not read this video's duration.");
            if (m.audio != null) {
                if (!"audio/mp4a-latm".equals(m.audio.getString(MediaFormat.KEY_MIME)))
                    throw new IllegalArgumentException("This video's audio is not AAC. Export an MP4 with AAC audio first, or share a hosted link.");
                extractor.selectTrack(m.audioTrack);
                while (extractor.getSampleTime() >= 0) {
                    if (job.cancelled()) throw new InterruptedException();
                    int flags = extractor.getSampleFlags();
                    if ((flags & MediaExtractor.SAMPLE_FLAG_ENCRYPTED) != 0) throw new IllegalArgumentException("Protected videos cannot be compressed.");
                    long size = extractor.getSampleSize();
                    if (size > 0) m.audioBytes += size;
                    if (!extractor.advance()) break;
                }
            }
            Budget.dimensions(m.width, m.height, 720);
            return m;
        } finally { extractor.release(); }
    }
}
