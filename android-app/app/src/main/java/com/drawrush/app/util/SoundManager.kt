package com.drawrush.app.util

import android.media.AudioManager
import android.media.ToneGenerator
import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "SoundManager"

/**
 * Programmatic audio tone synthesizer for DrawRush.
 * Synthesizes sounds via ToneGenerator without relying on copyrighted samples.
 */
@Singleton
class SoundManager @Inject constructor() {

    private var toneGenerator: ToneGenerator? = null
    var isEnabled: Boolean = true

    init {
        try {
            toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 75)
        } catch (e: Exception) {
            Log.w(TAG, "ToneGenerator initialization failed", e)
        }
    }

    fun playTick() {
        playTone(ToneGenerator.TONE_PROP_BEEP, 60)
    }

    fun playSuccess() {
        playTone(ToneGenerator.TONE_PROP_ACK, 180)
    }

    fun playError() {
        playTone(ToneGenerator.TONE_PROP_NACK, 180)
    }

    fun playWordPrompt() {
        playTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 150)
    }

    fun playRoundEnd() {
        playTone(ToneGenerator.TONE_CDMA_ONE_MIN_BEEP, 250)
    }

    fun playGameOver() {
        playTone(ToneGenerator.TONE_CDMA_HIGH_L, 350)
    }

    fun playWarning() {
        playTone(ToneGenerator.TONE_PROP_BEEP2, 100)
    }

    private fun playTone(toneType: Int, durationMs: Int) {
        if (!isEnabled) return
        try {
            toneGenerator?.startTone(toneType, durationMs)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to play tone $toneType", e)
        }
    }

    fun release() {
        try {
            toneGenerator?.release()
            toneGenerator = null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to release ToneGenerator", e)
        }
    }
}
