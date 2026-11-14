// Waveform gain adapted from Vencord VoiceMessages.
// Copyright (c) 2023 Vendicated and contributors.
// SPDX-License-Identifier: GPL-3.0-or-later

package com.rosie.voicemessages

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.SystemClock
import android.util.Base64
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.ensureActive

internal const val MAX_DURATION_SECONDS = 20 * 60

internal data class AudioMetadata(val duration: Double, val waveform: String, val bars: List<Int>)

internal suspend fun readAudioMetadata(file: File): AudioMetadata {
    val extractor = MediaExtractor()
    try {
        extractor.setDataSource(file.absolutePath)
        val track = (0 until extractor.trackCount).firstOrNull {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        } ?: error("The selected file has no readable audio track.")
        require((0 until extractor.trackCount).none {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
        }) { "Choose an audio file." }
        extractor.selectTrack(track)
        val format = extractor.getTrackFormat(track)
        check(format.containsKey(MediaFormat.KEY_DURATION)) { "Android could not read this file’s duration." }
        val duration = format.getLong(MediaFormat.KEY_DURATION) / 1_000_000.0
        require(duration > 0 && duration <= MAX_DURATION_SECONDS) {
            "Voice messages must be longer than 0 seconds and at most 20 minutes."
        }

        val waveform = Waveform((duration * 10).toInt().coerceIn(1, 256))
        val decoder = MediaCodec.createDecoderByType(requireNotNull(format.getString(MediaFormat.KEY_MIME)))
        try {
            decoder.configure(format, null, null, 0)
            decoder.start()

            val info = MediaCodec.BufferInfo()
            var inputEnded = false
            var outputEnded = false
            var lastProgress = SystemClock.elapsedRealtime()
            var frameCount = 0L
            var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var encoding = AudioFormat.ENCODING_PCM_16BIT
            check(sampleRate > 0 && channels > 0) { "Invalid audio format." }
            while (!outputEnded) {
                coroutineContext.ensureActive()
                check(SystemClock.elapsedRealtime() - lastProgress < 10_000) { "Android could not decode this audio." }
                if (!inputEnded) {
                    val index = decoder.dequeueInputBuffer(0)
                    if (index >= 0) {
                        val input = requireNotNull(decoder.getInputBuffer(index))
                        val size = extractor.readSampleData(input, 0)
                        if (size < 0) {
                            decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputEnded = true
                        } else {
                            decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                        lastProgress = SystemClock.elapsedRealtime()
                    }
                }
                when (val index = decoder.dequeueOutputBuffer(info, 10_000)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val output = decoder.outputFormat
                        sampleRate = output.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channels = output.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        encoding = if (output.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                            output.getInteger(MediaFormat.KEY_PCM_ENCODING)
                        } else {
                            AudioFormat.ENCODING_PCM_16BIT
                        }
                        check(sampleRate > 0 && channels > 0) { "Invalid audio format." }
                    }
                    else -> if (index >= 0) {
                        if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                            val output = requireNotNull(decoder.getOutputBuffer(index)).order(ByteOrder.nativeOrder())
                            output.limit(info.offset + info.size)
                            output.position(info.offset)
                            frameCount += waveform.add(output, encoding, channels, sampleRate, frameCount, duration)
                        }
                        decoder.releaseOutputBuffer(index, false)
                        outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        lastProgress = SystemClock.elapsedRealtime()
                    }
                }
            }
            check(frameCount > 0) { "This audio file is empty." }
            require(frameCount.toDouble() / sampleRate <= MAX_DURATION_SECONDS + 0.1) {
                "Voice messages must be 20 minutes or shorter."
            }
        } finally {
            decoder.release()
        }
        return waveform.metadata(duration)
    } finally {
        extractor.release()
    }
}

private class Waveform(private val size: Int) {
    private val squares = DoubleArray(size)
    private val counts = IntArray(size)

    fun add(buffer: ByteBuffer, encoding: Int, channels: Int, rate: Int, start: Long, duration: Double): Long {
        val bytes = when (encoding) {
            AudioFormat.ENCODING_PCM_8BIT -> 1
            AudioFormat.ENCODING_PCM_16BIT -> 2
            AudioFormat.ENCODING_PCM_FLOAT -> 4
            else -> error("Unsupported decoded audio format.")
        }
        val end = start + buffer.remaining() / (bytes * channels)
        require(end.toDouble() / rate <= MAX_DURATION_SECONDS + 0.1) {
            "Voice messages must be 20 minutes or shorter."
        }
        val framesPerBin = duration * rate / size
        for (frame in start until end) {
            val bin = (frame / framesPerBin).toInt().coerceAtMost(size - 1)
            repeat(channels) {
                val sample = when (encoding) {
                    AudioFormat.ENCODING_PCM_8BIT -> ((buffer.get().toInt() and 255) - 128) / 128.0
                    AudioFormat.ENCODING_PCM_16BIT -> buffer.short / 32768.0
                    else -> buffer.float.toDouble().takeIf { it.isFinite() } ?: 0.0
                }
                squares[bin] += sample * sample
            }
            counts[bin] += channels
        }
        return end - start
    }

    fun metadata(duration: Double): AudioMetadata {
        val rms = DoubleArray(size) { sqrt(squares[it] / counts[it].coerceAtLeast(1)).coerceAtMost(1.0) }
        val peak = rms.max()
        val gain = if (peak > 0) 1 + (1 / peak - 1) * (100 * peak * peak * peak).coerceAtMost(1.0) else 1.0
        val samples = List(size) { (rms[it] * gain * 255).roundToInt().coerceIn(0, 255) }
        val bars = samples.chunked(ceil(size / 40.0).toInt()).map { it.max() }
        return AudioMetadata(duration, Base64.encodeToString(ByteArray(size) { samples[it].toByte() }, Base64.NO_WRAP), bars)
    }
}
