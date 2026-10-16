package com.drawrush.app.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "HapticsManager"

/**
 * Haptic feedback manager for DrawRush.
 * Provides tactile feedback for taps, drawing strokes, countdown, correct/wrong guesses.
 */
@Singleton
class HapticsManager @Inject constructor(
    @ApplicationContext private val context: Context
) {

    private val vibrator: Vibrator? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    } catch (e: Exception) {
        Log.w(TAG, "Failed to get vibrator service", e)
        null
    }

    var isEnabled: Boolean = true

    fun vibrateClick() {
        if (!isEnabled || vibrator == null || !vibrator.hasVibrator()) return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
            } else {
                vibrator.vibrate(VibrationEffect.createOneShot(20, 100))
            }
        } catch (e: Exception) {
            Log.w(TAG, "vibrateClick failed", e)
        }
    }

    fun vibrateSuccess() {
        if (!isEnabled || vibrator == null || !vibrator.hasVibrator()) return
        try {
            val timings = longArrayOf(0, 40, 60, 80)
            val amplitudes = intArrayOf(0, 120, 0, 200)
            vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        } catch (e: Exception) {
            Log.w(TAG, "vibrateSuccess failed", e)
        }
    }

    fun vibrateError() {
        if (!isEnabled || vibrator == null || !vibrator.hasVibrator()) return
        try {
            val timings = longArrayOf(0, 70, 50, 70)
            val amplitudes = intArrayOf(0, 180, 0, 180)
            vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        } catch (e: Exception) {
            Log.w(TAG, "vibrateError failed", e)
        }
    }

    fun vibrateWarning() {
        if (!isEnabled || vibrator == null || !vibrator.hasVibrator()) return
        try {
            vibrator.vibrate(VibrationEffect.createOneShot(45, 150))
        } catch (e: Exception) {
            Log.w(TAG, "vibrateWarning failed", e)
        }
    }
}
