package com.drawrush.app.viewmodel

import com.drawrush.app.data.model.GamePhase
import com.drawrush.app.data.model.PlayerState
import com.drawrush.app.data.model.RoomState
import com.drawrush.app.data.network.SocketEvent
import com.drawrush.app.data.repository.GameRepository
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test
import app.cash.turbine.test

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerIdentityTest {

    private lateinit var repo: GameRepository
    private val socketEventsFlow = MutableSharedFlow<SocketEvent>()
    private val connectedFlow = MutableStateFlow(true)
    private val serverPlayerIdFlow = MutableStateFlow<String?>("server-id-456")

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        repo = mockk(relaxed = true)
        every { repo.socketEvents } returns socketEventsFlow
        every { repo.connected } returns connectedFlow
        every { repo.currentUid } returns "firebase-uid-123"
        every { repo.serverPlayerId } returns serverPlayerIdFlow
    }

    @Test
    fun `host test - host server ID causes isHost to be true`() = runTest {
        val viewModel = LobbyViewModel(repo)
        
        // Before the fix, the viewmodel uses currentUid as myPlayerId. 
        // After the fix, it will use serverPlayerId.
        // We simulate parsing a room state where "server-id-456" is the host.
        val roomState = RoomState(
            roomCode = "ABC123",
            phase = GamePhase.LOBBY,
            settings = com.drawrush.app.data.model.RoomSettings(),
            players = listOf(
                PlayerState(
                    playerId = "server-id-456", 
                    isHost = true, 
                    nickname = "Host", 
                    connected = true,
                    avatar = "avatar",
                    score = 0,
                    ready = false,
                    isArtist = false,
                    hasGuessedCurrentWord = false,
                    correctGuessCount = 0,
                    isMuted = false
                )
            ),
            currentRound = 1,
            currentArtistId = "",
            wordPattern = "",
            wordLength = 0,
            roundStartTimestamp = 0L,
            roundEndTimestamp = 0L,
            selectionDeadline = 0L,
            serverTime = 0L
        )
        every { repo.parseRoomState(any()) } returns roomState
        
        socketEventsFlow.emit(SocketEvent.RoomUpdated(JSONObject()))
        
        // Assert that the viewmodel recognized us as the host
        assertTrue("isHost should be true if serverPlayerId matches host playerId", viewModel.uiState.value.isHost)
    }

    @Test
    fun `kick detection test - kicked server ID causes kickedOut to be true`() = runTest {
        val viewModel = LobbyViewModel(repo)
        
        socketEventsFlow.emit(SocketEvent.PlayerKicked("server-id-456"))
        
        assertTrue("kickedOut should be true if kicked playerId matches serverPlayerId", viewModel.uiState.value.kickedOut)
    }
}
