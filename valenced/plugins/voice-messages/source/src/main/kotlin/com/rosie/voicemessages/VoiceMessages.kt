@file:JvmName("VoiceMessages")

package com.rosie.voicemessages

import android.app.AndroidAppHelper
import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeAsyncMethod
import java.io.File
import java.net.URL
import java.util.Locale
import java.util.UUID
import javax.net.ssl.HttpsURLConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val main = Handler(Looper.getMainLooper())

private var audio: VoiceAudio? = null

val voiceMessages = plugin {
    start {
        val session = VoiceAudio()
        audio = session
        withAppContext(session::attachContext)
        val prefix = manifest.id
        registerNativeAsyncMethod("$prefix.record") { _ ->
            withContext(Dispatchers.Main) { session.record() }
        }
        registerNativeAsyncMethod("$prefix.finish") { args ->
            val name = args[0] as String
            withContext(Dispatchers.Main) { session.finish(name) }
            session.analyze(name, "audio/ogg")
        }
        registerNativeAsyncMethod("$prefix.import") { args ->
            session.import(Uri.parse(args[0] as String), args[1] as String)
        }
        registerNativeAsyncMethod("$prefix.play") { args ->
            withContext(Dispatchers.Main) { session.play(args[0] as String); true }
        }
        registerNativeAsyncMethod("$prefix.playing") { args ->
            withContext(Dispatchers.Main) { session.playing(args[0] as String) }
        }
        registerNativeAsyncMethod("$prefix.stopPreview") { args ->
            withContext(Dispatchers.Main) { session.stopPreview(args[0] as String); true }
        }
        registerNativeAsyncMethod("$prefix.discard") { args ->
            withContext(Dispatchers.Main) { session.discard(args[0] as String) }
        }
        registerNativeAsyncMethod("$prefix.upload") { args ->
            session.upload(args[0] as String, args[1] as String, args[2] as String)
        }
    }

    stop {
        val session = audio
        audio = null
        session?.active = false
        main.post { session?.close() }
    }
}

private class VoiceAudio {
    @Volatile private var hostContext: Context? = null
    @Volatile var active = true
    private val sessionId = UUID.randomUUID().toString()
    private var recorder: MediaRecorder? = null
    private var recordingName: String? = null
    private var recordingLimitReached = false
    private var player: MediaPlayer? = null
    private var playingName: String? = null

    fun attachContext(context: Context) {
        hostContext = context.applicationContext ?: context
    }

    private fun context(): Context = hostContext ?: AndroidAppHelper.currentApplication()
        ?: error("Voice Messages couldn’t access Discord’s Android app. Fully close Discord and reopen it.")

    private fun directory(context: Context = context()) = File(context.cacheDir, "valenced-voice-messages/$sessionId")
    private fun file(name: String): File {
        require(name.matches(Regex("[0-9a-f-]{36}\\.[a-z0-9]{2,5}"))) { "Invalid voice draft." }
        return File(directory(), name)
    }

    @Suppress("DEPRECATION")
    fun record(): String {
        check(active && recorder == null) { "A recording is already active." }
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { "Recording in this panel requires Android 10 or newer." }
        stopPreview()
        val name = "${UUID.randomUUID()}.ogg"
        val file = file(name)
        file.parentFile?.mkdirs()
        val next = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context()) else MediaRecorder()
        try {
            next.setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            next.setMaxDuration(MAX_DURATION_SECONDS * 1000 - 100)
            next.setOnInfoListener { source, info, _ ->
                if (source === recorder && info == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                    recordingLimitReached = true
                }
            }
            next.setOutputFormat(MediaRecorder.OutputFormat.OGG)
            next.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
            next.setAudioChannels(1)
            next.setAudioSamplingRate(48_000)
            next.setAudioEncodingBitRate(32_000)
            next.setOutputFile(file.absolutePath)
            next.prepare()
            next.start()
            recorder = next
            recordingName = name
            recordingLimitReached = false
            return name
        } catch (error: Exception) {
            next.release()
            file.delete()
            throw error
        }
    }

    fun finish(name: String) {
        check(active && name == recordingName) { "There is no active recording." }
        val current = checkNotNull(recorder)
        recorder = null
        recordingName = null
        try {
            current.stop()
        } catch (error: RuntimeException) {
            if (!recordingLimitReached) {
                file(name).delete()
                throw IllegalArgumentException("The recording was too short or could not be saved.", error)
            }
        } finally {
            current.release()
        }
    }

    suspend fun import(uri: Uri, filename: String): Map<String, Any> = withContext(Dispatchers.IO) {
        check(active)
        require(uri.scheme == "content" || uri.scheme == "file") { "Select a local audio file." }
        val extension = filename.substringAfterLast('.', "").lowercase(Locale.ROOT)
        val type = formats[extension] ?: error("Choose an Ogg, Opus, MP3, M4A, AAC, WAV, FLAC, WebM, AMR or 3GP audio file.")
        val name = "${UUID.randomUUID()}.$extension"
        val file = file(name)
        file.parentFile?.mkdirs()
        try {
            checkNotNull(context().contentResolver.openInputStream(uri)) { "Could not open that audio file." }.use { source ->
                file.outputStream().use { destination ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var copied = 0L
                    while (true) {
                        check(active) { "Voice Messages is disabled." }
                        val read = source.read(buffer)
                        if (read < 0) break
                        copied += read
                        require(copied <= 1_073_741_824) { "This audio file is larger than Discord’s upload limit." }
                        destination.write(buffer, 0, read)
                    }
                }
            }
            analyze(name, type)
        } catch (error: Exception) {
            file.delete()
            throw error
        }
    }

    suspend fun analyze(name: String, type: String): Map<String, Any> = withContext(Dispatchers.IO) {
        val file = file(name)
        try {
            check(active)
            val metadata = readAudioMetadata(file)
            check(active)
            mapOf(
                "id" to name,
                "filename" to "voice-message.${name.substringAfterLast('.')}",
                "mimeType" to type,
                "size" to file.length().toDouble(),
                "duration" to metadata.duration,
                "waveform" to metadata.waveform,
                "bars" to metadata.bars,
                "isOggOpus" to file.inputStream().use { input ->
                    val header = ByteArray(36)
                    input.read(header) == header.size &&
                        String(header, 0, 4, Charsets.US_ASCII) == "OggS" &&
                        String(header, 28, 8, Charsets.US_ASCII) == "OpusHead"
                },
            )
        } catch (error: Exception) {
            file.delete()
            throw error
        }
    }

    fun play(name: String) {
        check(active)
        stopPreview()
        val next = MediaPlayer()
        try {
            next.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
            next.setDataSource(file(name).absolutePath)
            next.setOnPreparedListener {
                if (player === it) runCatching { it.start() }.onFailure { stopPreview(name) }
            }
            next.setOnCompletionListener { if (player === it) stopPreview() }
            next.setOnErrorListener { failed, _, _ ->
                if (player === failed) stopPreview()
                true
            }
            player = next
            playingName = name
            next.prepareAsync()
        } catch (error: Exception) {
            if (player === next) {
                player = null
                playingName = null
            }
            next.release()
            throw error
        }
    }

    fun playing(name: String) = playingName == name && player != null

    fun stopPreview(name: String? = null) {
        if (name != null && playingName != name) return
        val current = player
        player = null
        playingName = null
        current?.release()
    }

    fun discard(name: String): Boolean {
        stopPreview(name)
        if (recordingName == name) {
            recorder?.release()
            recorder = null
            recordingName = null
        }
        return file(name).delete()
    }

    fun close() {
        stopPreview()
        recorder?.release()
        recorder = null
        recordingName = null
        val context = hostContext ?: AndroidAppHelper.currentApplication()
        if (context != null) directory(context).deleteRecursively()
    }

    suspend fun upload(name: String, url: String, type: String): Boolean = withContext(Dispatchers.IO) {
        check(active)
        require(type == formats[name.substringAfterLast('.')]) { "Invalid audio type." }
        val endpoint = URL(url)
        require(
            endpoint.protocol == "https" && endpoint.userInfo == null && endpoint.port in listOf(-1, 443) &&
                endpoint.host == "discord-attachments-uploads-prd.storage.googleapis.com",
        ) { "Invalid Discord upload URL." }
        val file = file(name)
        val connection = endpoint.openConnection() as HttpsURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 30_000
            connection.readTimeout = 60_000
            connection.doOutput = true
            connection.requestMethod = "PUT"
            connection.setRequestProperty("Content-Type", type)
            connection.setFixedLengthStreamingMode(file.length())
            file.inputStream().use { input -> connection.outputStream.use { input.copyTo(it) } }
            val status = connection.responseCode
            check(status in 200..299) { "Discord’s upload server returned HTTP $status." }
            true
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private val formats = mapOf(
            "ogg" to "audio/ogg", "oga" to "audio/ogg", "opus" to "audio/ogg",
            "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "aac" to "audio/aac",
            "wav" to "audio/wav", "flac" to "audio/flac", "webm" to "audio/webm",
            "amr" to "audio/amr", "3gp" to "audio/3gpp",
        )
    }
}
