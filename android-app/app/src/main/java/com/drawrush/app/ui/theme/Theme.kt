package com.drawrush.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary           = DrPrimary,
    onPrimary         = DrOnPrimary,
    primaryContainer  = DrPrimaryLight,
    onPrimaryContainer= DrOnPrimary,
    secondary         = DrSecondary,
    onSecondary       = DrOnPrimary,
    secondaryContainer= DrSecondaryLight,
    tertiary          = DrAccent,
    onTertiary        = DrOnBackground,
    error             = DrDanger,
    background        = DrBackground,
    onBackground      = DrOnBackground,
    surface           = DrSurface,
    onSurface         = DrOnSurface,
    surfaceVariant    = DrSurfaceVariant,
    outline           = DrCanvasBorder,
)

private val DarkColorScheme = darkColorScheme(
    primary           = DrPrimaryLight,
    onPrimary         = DrDarkBg,
    primaryContainer  = DrPrimaryDark,
    secondary         = DrSecondaryLight,
    onSecondary       = DrDarkBg,
    tertiary          = DrAccent,
    onTertiary        = DrDarkBg,
    error             = DrDanger,
    background        = DrDarkBg,
    onBackground      = Color(0xFFE8E9F3),
    surface           = DrDarkSurface,
    onSurface         = Color(0xFFE8E9F3),
    surfaceVariant    = DrDarkSurfaceVariant,
)

@Composable
fun DrawRushTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
