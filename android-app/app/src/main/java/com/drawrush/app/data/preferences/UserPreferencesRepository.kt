package com.drawrush.app.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "drawrush_prefs")

data class UserPreferences(
    val nickname: String = "",
    val avatar: String = "🦊",
    val soundEnabled: Boolean = true,
    val hapticsEnabled: Boolean = true,
    val serverUrl: String = "",   // empty = use BuildConfig.BACKEND_URL
    val devAuthUid: String = ""
)

@Singleton
class UserPreferencesRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val NICKNAME = stringPreferencesKey("nickname")
        val AVATAR = stringPreferencesKey("avatar")
        val SOUND_ENABLED = booleanPreferencesKey("sound_enabled")
        val HAPTICS_ENABLED = booleanPreferencesKey("haptics_enabled")
        val SERVER_URL = stringPreferencesKey("server_url")
        val DEV_AUTH_UID = stringPreferencesKey("dev_auth_uid")
    }

    val preferences: Flow<UserPreferences> = context.dataStore.data
        .catch { e ->
            if (e is IOException) emit(emptyPreferences()) else throw e
        }
        .map { prefs ->
            val rawAvatar = prefs[Keys.AVATAR] ?: "🦊"
            val effectiveAvatar = if (rawAvatar == "avatar_01" || rawAvatar.isBlank()) "🦊" else rawAvatar
            UserPreferences(
                nickname = prefs[Keys.NICKNAME] ?: "",
                avatar = effectiveAvatar,
                soundEnabled = prefs[Keys.SOUND_ENABLED] ?: true,
                hapticsEnabled = prefs[Keys.HAPTICS_ENABLED] ?: true,
                serverUrl = prefs[Keys.SERVER_URL] ?: "",
                devAuthUid = prefs[Keys.DEV_AUTH_UID] ?: ""
            )
        }

    suspend fun updateNickname(nickname: String) {
        context.dataStore.edit { it[Keys.NICKNAME] = nickname }
    }

    suspend fun updateAvatar(avatar: String) {
        context.dataStore.edit { it[Keys.AVATAR] = avatar }
    }

    suspend fun updateSoundEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.SOUND_ENABLED] = enabled }
    }

    suspend fun updateHapticsEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.HAPTICS_ENABLED] = enabled }
    }

    suspend fun updateServerUrl(url: String) {
        context.dataStore.edit { it[Keys.SERVER_URL] = url }
    }

    suspend fun getOrCreateDevUid(): String {
        var uid = ""
        context.dataStore.edit { prefs ->
            val existing = prefs[Keys.DEV_AUTH_UID]
            if (existing.isNullOrEmpty()) {
                uid = "dev-user-${System.currentTimeMillis()}"
                prefs[Keys.DEV_AUTH_UID] = uid
            } else {
                uid = existing
            }
        }
        return uid
    }
}
