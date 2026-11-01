package dev.fluttershy2008.longvideo;

import android.content.Context;
import android.graphics.SurfaceTexture;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.view.Surface;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/** Surface-to-surface decoding avoids loading a complete video (or raw frames) into JS. */
final class Transcoder {
    interface Progress { boolean cancelled(); void update(long timeUs, long durationUs); }
    private Transcoder() {}
    static void encode(Context context, LongVideo.Media media, File output, int bitrate, int shortSide, Progress progress) throws Exception {
        MediaExtractor video = new MediaExtractor(), audio = null;
        MediaCodec decoder = null, encoder = null;
        MediaMuxer muxer = null;
        Frames frames = null; Surface input = null;
        boolean muxing = false;
        try {
            check(progress);
            video.setDataSource(context, media.uri, null); video.selectTrack(media.videoTrack);
            if (media.audio != null) {
                audio = new MediaExtractor(); audio.setDataSource(context, media.uri, null); audio.selectTrack(media.audioTrack);
            }
            int[] size = Budget.dimensions(media.width, media.height, shortSide);
            MediaFormat format = MediaFormat.createVideoFormat("video/avc", size[0], size[1]);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate); format.setInteger(MediaFormat.KEY_FRAME_RATE, 30);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
            encoder = MediaCodec.createEncoderByType("video/avc");
            MediaCodecInfo.EncoderCapabilities caps = encoder.getCodecInfo().getCapabilitiesForType("video/avc").getEncoderCapabilities();
            if (caps.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR))
                format.setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR);
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            input = encoder.createInputSurface();
            frames = new Frames(input, size[0], size[1]);
            encoder.start();
            // Let the MP4 orientation hint handle rotation exactly once.
            media.video.setInteger("rotation-degrees", 0);
            decoder = MediaCodec.createDecoderByType(media.video.getString(MediaFormat.KEY_MIME));
            decoder.configure(media.video, frames.surface, null, 0); decoder.start();
            muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            if (media.rotation == 90 || media.rotation == 180 || media.rotation == 270) muxer.setOrientationHint(media.rotation);
            MediaCodec.BufferInfo decInfo = new MediaCodec.BufferInfo(), encInfo = new MediaCodec.BufferInfo();
            boolean inputDone = false, decodeDone = false, encodeDone = false;
            int videoTrack = -1, audioTrack = -1; long lastFrameUs = Long.MIN_VALUE, lastInputUs = 0;
            long activity = SystemClock.elapsedRealtime(), lastOutputUs = 0; int written = 0;
            while (!encodeDone) {
                check(progress); boolean moved = false;
                // Drain the encoder before submitting another surface frame: its buffers are finite.
                for (;;) {
                    int index = encoder.dequeueOutputBuffer(encInfo, decodeDone ? 10000 : 0);
                    if (index == MediaCodec.INFO_TRY_AGAIN_LATER) break;
                    if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        if (muxing) throw new IllegalStateException("The encoder changed format unexpectedly.");
                        videoTrack = muxer.addTrack(encoder.getOutputFormat());
                        if (media.audio != null) audioTrack = muxer.addTrack(media.audio);
                        muxer.start(); muxing = true; moved = true; continue;
                    }
                    if (index < 0) continue;
                    ByteBuffer buffer = encoder.getOutputBuffer(index);
                    if ((encInfo.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) encInfo.size = 0;
                    if (encInfo.size > 0) {
                        if (!muxing || buffer == null) throw new IllegalStateException("The encoder produced an invalid stream.");
                        buffer.position(encInfo.offset); buffer.limit(encInfo.offset + encInfo.size);
                        muxer.writeSampleData(videoTrack, buffer, encInfo); written++;
                        lastOutputUs = Math.max(lastOutputUs, encInfo.presentationTimeUs);
                        progress.update(encInfo.presentationTimeUs, media.durationUs);
                    }
                    encodeDone = (encInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    encoder.releaseOutputBuffer(index, false); moved = true;
                    if (encodeDone) break;
                }
                if (!inputDone) {
                    int index = decoder.dequeueInputBuffer(1000);
                    if (index >= 0) {
                        ByteBuffer buffer = decoder.getInputBuffer(index);
                        if (buffer == null) throw new IllegalStateException("The decoder has no input buffer.");
                        buffer.clear();
                        int count = video.readSampleData(buffer, 0);
                        if (count < 0) {
                            decoder.queueInputBuffer(index, 0, 0, lastInputUs + 1, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true;
                        } else {
                            if ((video.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_ENCRYPTED) != 0)
                                throw new IllegalArgumentException("Protected videos cannot be compressed.");
                            lastInputUs = Math.max(0, video.getSampleTime());
                            decoder.queueInputBuffer(index, 0, count, lastInputUs, 0); video.advance();
                        }
                        moved = true;
                    }
                }
                if (!decodeDone) {
                    int index = decoder.dequeueOutputBuffer(decInfo, 1000);
                    if (index >= 0) {
                        long pts = Math.max(0, decInfo.presentationTimeUs);
                        boolean render = decInfo.size > 0 && (lastFrameUs == Long.MIN_VALUE || pts - lastFrameUs >= 33000);
                        decoder.releaseOutputBuffer(index, render);
                        if (render) { frames.draw(pts, progress); lastFrameUs = pts; }
                        if ((decInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) { decodeDone = true; encoder.signalEndOfInputStream(); }
                        moved = true;
                    }
                }
                if (moved) activity = SystemClock.elapsedRealtime();
                else if (SystemClock.elapsedRealtime() - activity > 45000)
                    throw new IllegalStateException("Android's video encoder stopped responding. Try 480p, or restart Discord.");
            }
            if (!muxing || written == 0) throw new IllegalStateException("Android did not produce a playable video.");
            // AAC is copied unchanged, with its original timestamps and channel layout.
            if (audio != null) {
                int capacity = media.audio.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? media.audio.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) : 65536;
                ByteBuffer buffer = ByteBuffer.allocateDirect(Math.max(65536, Math.min(capacity, 4194304)));
                MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
                long previous = -1;
                while (audio.getSampleTime() >= 0) {
                    check(progress); buffer.clear();
                    int count = audio.readSampleData(buffer, 0);
                    if (count < 0) break;
                    long pts = audio.getSampleTime();
                    if (pts >= 0 && pts > previous) {
                        info.set(0, count, pts, 0); muxer.writeSampleData(audioTrack, buffer, info); previous = pts;
                    }
                    if (!audio.advance()) break;
                }
            }
            muxer.stop(); muxing = false;
            if (media.durationUs > 10000000L && lastOutputUs < media.durationUs * 0.98 - 1000000L)
                throw new IllegalStateException("The encoder did not preserve the full video's duration. Try another resolution or share a hosted link.");
            check(progress);
        } finally {
            if (decoder != null) { try { decoder.stop(); } catch (Throwable ignored) {} try { decoder.release(); } catch (Throwable ignored) {} }
            if (frames != null) { try { frames.close(); } catch (Throwable ignored) {} }
            if (input != null) { try { input.release(); } catch (Throwable ignored) {} }
            if (encoder != null) { try { encoder.stop(); } catch (Throwable ignored) {} try { encoder.release(); } catch (Throwable ignored) {} }
            if (muxer != null) { if (muxing) { try { muxer.stop(); } catch (Throwable ignored) {} } try { muxer.release(); } catch (Throwable ignored) {} }
            video.release(); if (audio != null) audio.release();
        }
    }
    private static void check(Progress progress) throws InterruptedException {
        if (progress.cancelled()) throw new InterruptedException();
    }
    private static final class Frames implements SurfaceTexture.OnFrameAvailableListener {
        final Object lock = new Object();
        final int width, height;
        final float[] matrix = new float[16];
        final FloatBuffer vertices;
        EGLDisplay display = EGL14.EGL_NO_DISPLAY;
        EGLContext eglContext = EGL14.EGL_NO_CONTEXT;
        EGLSurface window = EGL14.EGL_NO_SURFACE;
        SurfaceTexture texture; Surface surface;
        HandlerThread callbacks;
        int program, textureId, position, texPosition, transform, sampler;
        boolean available;
        Frames(Surface target, int width, int height) {
            this.width = width; this.height = height;
            vertices = ByteBuffer.allocateDirect(16 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
            vertices.put(new float[] { -1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1 }).position(0);
            try {
                display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
                int[] version = new int[2];
                if (display == EGL14.EGL_NO_DISPLAY || !EGL14.eglInitialize(display, version, 0, version, 1)) throw new IllegalStateException("OpenGL is unavailable.");
                EGLConfig[] configs = new EGLConfig[1]; int[] count = new int[1];
                int[] config = { EGL14.EGL_RED_SIZE,8, EGL14.EGL_GREEN_SIZE,8, EGL14.EGL_BLUE_SIZE,8,
                    EGL14.EGL_RENDERABLE_TYPE,EGL14.EGL_OPENGL_ES2_BIT, 0x3142,1, EGL14.EGL_NONE };
                if (!EGL14.eglChooseConfig(display, config, 0, configs, 0, 1, count, 0) || count[0] == 0)
                    throw new IllegalStateException("A video recording surface is unavailable.");
                eglContext = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT,
                    new int[] { EGL14.EGL_CONTEXT_CLIENT_VERSION,2, EGL14.EGL_NONE }, 0);
                window = EGL14.eglCreateWindowSurface(display, configs[0], target, new int[] { EGL14.EGL_NONE }, 0);
                if (eglContext == EGL14.EGL_NO_CONTEXT || window == EGL14.EGL_NO_SURFACE || !EGL14.eglMakeCurrent(display, window, window, eglContext))
                    throw new IllegalStateException("Could not initialise video rendering.");
                program = GLES20.glCreateProgram();
                int vertex = shader(GLES20.GL_VERTEX_SHADER, "attribute vec4 p;attribute vec4 t;uniform mat4 m;varying vec2 uv;void main(){gl_Position=p;uv=(m*t).xy;}");
                int fragment = shader(GLES20.GL_FRAGMENT_SHADER, "#extension GL_OES_EGL_image_external : require\nprecision mediump float;varying vec2 uv;uniform samplerExternalOES s;void main(){gl_FragColor=texture2D(s,uv);}");
                GLES20.glAttachShader(program, vertex); GLES20.glAttachShader(program, fragment); GLES20.glLinkProgram(program);
                GLES20.glDeleteShader(vertex); GLES20.glDeleteShader(fragment);
                int[] linked = new int[1]; GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0);
                if (linked[0] == 0) throw new IllegalStateException("Could not create the video renderer.");
                position = GLES20.glGetAttribLocation(program, "p"); texPosition = GLES20.glGetAttribLocation(program, "t");
                transform = GLES20.glGetUniformLocation(program, "m"); sampler = GLES20.glGetUniformLocation(program, "s");
                int[] textures = new int[1]; GLES20.glGenTextures(1, textures, 0); textureId = textures[0];
                GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
                GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
                texture = new SurfaceTexture(textureId);
                callbacks = new HandlerThread("LongVideoFrames"); callbacks.start();
                texture.setOnFrameAvailableListener(this, new Handler(callbacks.getLooper()));
                surface = new Surface(texture);
            } catch (RuntimeException error) { close(); throw error; }
        }
        public void onFrameAvailable(SurfaceTexture ignored) { synchronized(lock) { available = true; lock.notifyAll(); } }
        void draw(long pts, Progress progress) throws Exception {
            long deadline = SystemClock.elapsedRealtime() + 10000;
            synchronized(lock) {
                while (!available) {
                    check(progress);
                    if (SystemClock.elapsedRealtime() > deadline) throw new IllegalStateException("Android could not decode the next video frame.");
                    lock.wait(100);
                }
                available = false;
            }
            check(progress); texture.updateTexImage(); texture.getTransformMatrix(matrix);
            GLES20.glViewport(0, 0, width, height); GLES20.glUseProgram(program);
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0); GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
            GLES20.glUniform1i(sampler, 0);
            vertices.position(0); GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 16, vertices);
            GLES20.glEnableVertexAttribArray(position);
            vertices.position(2); GLES20.glVertexAttribPointer(texPosition, 2, GLES20.GL_FLOAT, false, 16, vertices);
            GLES20.glEnableVertexAttribArray(texPosition); GLES20.glUniformMatrix4fv(transform, 1, false, matrix, 0);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
            if (GLES20.glGetError() != GLES20.GL_NO_ERROR) throw new IllegalStateException("Android could not render this video frame.");
            if (!EGLExt.eglPresentationTimeANDROID(display, window, pts * 1000L) || !EGL14.eglSwapBuffers(display, window))
                throw new IllegalStateException("Android could not encode this video frame.");
        }
        private int shader(int kind, String code) {
            int id = GLES20.glCreateShader(kind); GLES20.glShaderSource(id, code); GLES20.glCompileShader(id);
            int[] compiled = new int[1]; GLES20.glGetShaderiv(id, GLES20.GL_COMPILE_STATUS, compiled, 0);
            if (compiled[0] == 0) { GLES20.glDeleteShader(id); throw new IllegalStateException("Android does not support this video renderer."); }
            return id;
        }
        void close() {
            if (surface != null) { surface.release(); surface = null; }
            if (texture != null) { texture.release(); texture = null; }
            if (callbacks != null) { callbacks.quitSafely(); callbacks = null; }
            if (display != EGL14.EGL_NO_DISPLAY) {
                if (program != 0) GLES20.glDeleteProgram(program);
                if (textureId != 0) GLES20.glDeleteTextures(1, new int[] { textureId }, 0);
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
                if (window != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, window);
                if (eglContext != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, eglContext);
                EGL14.eglReleaseThread(); EGL14.eglTerminate(display);
                display = EGL14.EGL_NO_DISPLAY;
            }
        }
    }
}
