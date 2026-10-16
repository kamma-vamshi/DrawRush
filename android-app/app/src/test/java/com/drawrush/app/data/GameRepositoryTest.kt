package com.drawrush.app.data

import com.drawrush.app.data.network.SocketManager
import com.drawrush.app.data.preferences.UserPreferencesRepository
import com.drawrush.app.data.repository.GameRepository
import com.google.firebase.auth.FirebaseAuth
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class GameRepositoryTest {

    private lateinit var repo: GameRepository

    @Before
    fun setup() {
        val socketManager = mockk<SocketManager>(relaxed = true)
        val prefsRepo = mockk<UserPreferencesRepository>(relaxed = true)
        val firebaseAuth = mockk<FirebaseAuth>(relaxed = true)
        repo = GameRepository(socketManager, prefsRepo, firebaseAuth)
    }

    @Test
    fun `validateServerUrl allows https and wss in release mode`() {
        assertEquals("https://api.drawrush.app", repo.validateServerUrl("https://api.drawrush.app", isDebug = false))
        assertEquals("wss://api.drawrush.app/socket", repo.validateServerUrl("wss://api.drawrush.app/socket", isDebug = false))
    }

    @Test
    fun `validateServerUrl rejects cleartext http and ws in release mode`() {
        assertThrows(IllegalArgumentException::class.java) {
            repo.validateServerUrl("http://api.drawrush.app", isDebug = false)
        }
        assertThrows(IllegalArgumentException::class.java) {
            repo.validateServerUrl("ws://api.drawrush.app", isDebug = false)
        }
    }

    @Test
    fun `validateServerUrl permits cleartext http and ws in debug mode`() {
        assertEquals("http://10.0.2.2:3000", repo.validateServerUrl("http://10.0.2.2:3000", isDebug = true))
        assertEquals("ws://10.0.2.2:3000", repo.validateServerUrl("ws://10.0.2.2:3000", isDebug = true))
    }
}
