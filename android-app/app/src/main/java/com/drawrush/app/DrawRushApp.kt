package com.drawrush.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * DrawRush Application class.
 * Initializes Hilt dependency injection.
 * Brand name: DrawRush (change in res/values/strings.xml and BuildConfig.APP_NAME)
 */
@HiltAndroidApp
class DrawRushApp : Application()
