package com.drawrush.app.viewmodel

import com.drawrush.app.data.model.GamePhase
import com.drawrush.app.data.model.PlayerState
import com.drawrush.app.data.model.RoomSettings
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
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelArtistSyncTest {

    private lateinit var repo: GameRepository
    private val socketEventsFlow = MutableSharedFlow<SocketEvent>()
    private val connectedFlow = MutableStateFlow(true)
    private val serverPlayerIdFlow = MutableStateFlow<String?>("my-player-id-123")

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        repo = mockk(relaxed = true)
        every { repo.socketEvents } returns socketEventsFlow
        every { repo.connected } returns connectedFlow
        every { repo.serverPlayerId } returns serverPlayerIdFlow
    }

    @Test
    fun `isArtist is reactively derived when currentArtistId matches myPlayerId in RoomUpdated`() = runTest {
        val viewModel = GameViewModel(repo)

        val roomState = RoomState(
            roomCode = "TEST01",
            phase = GamePhase.WORD_SELECTION,
            settings = RoomSettings(),
            players = listOf(
                PlayerState(
                    playerId = "my-player-id-123",
                    nickname = "Me",
                    avatar = "a1",
                    score = 0,
                    connected = true,
                    ready = true,
                    isArtist = false,
                    hasGuessedCurrentWord = false,
                    correctGuessCount = 0,
                    isMuted = false,
                    isHost = false
                )
            ),
            currentRound = 1,
            currentArtistId = "my-player-id-123",
            wordPattern = "",
            wordLength = 0,
            roundStartTimestamp = 0L,
            roundEndTimestamp = 0L,
            selectionDeadline = 0L,
            serverTime = 0L
        )
        every { repo.parseRoomState(any()) } returns roomState

        socketEventsFlow.emit(SocketEvent.RoomUpdated(JSONObject()))

        assertTrue("ViewModel should compute isArtist = true when currentArtistId matches myPlayerId", viewModel.uiState.value.isArtist)
    }

    @Test
    fun `WordChoices event sets isArtist to true and updates choices`() = runTest {
        val viewModel = GameViewModel(repo)

        socketEventsFlow.emit(SocketEvent.WordChoices(listOf("apple", "banana", "cherry"), 15000L))

        assertTrue("isArtist should be true upon receiving WordChoices", viewModel.uiState.value.isArtist)
        assertEquals(listOf("apple", "banana", "cherry"), viewModel.uiState.value.wordChoices)
        assertEquals(GamePhase.WORD_SELECTION, viewModel.uiState.value.phase)
    }

    @Test
    fun `Artist preserves secretWord when HintUpdated arrives`() = runTest {
        val viewModel = GameViewModel(repo)

        val drawingStartedJson = JSONObject().apply {
            put("isArtist", true)
            put("secretWord", "PLANET")
            put("wordPattern", "_ _ _ _ _ _")
            put("wordLength", 6)
            put("startTimestamp", 1000L)
            put("endTimestamp", 60000L)
            put("serverTime", 1000L)
        }
        socketEventsFlow.emit(SocketEvent.DrawingStarted(drawingStartedJson))

        assertEquals("PLANET", viewModel.uiState.value.wordPattern)
        assertEquals("PLANET", viewModel.uiState.value.secretWord)

        socketEventsFlow.emit(SocketEvent.HintUpdated("P _ _ _ E _", 1))

        // For the artist, the displayed wordPattern must remain the secretWord, not the partial hint
        assertEquals("PLANET", viewModel.uiState.value.wordPattern)
        assertEquals("P _ _ _ E _", viewModel.uiState.value.hintPattern)
    }

    @Test
    fun `reconstructCanvas properly handles undoStroke`() = runTest {
        val viewModel = GameViewModel(repo)

        val history = JSONArray().apply {
            put(JSONObject().apply {
                put("type", "strokeStart")
                put("data", JSONObject().apply {
                    put("strokeId", "s1")
                    put("color", "#000000")
                    put("width", 0.02)
                    put("point", JSONObject().apply { put("x", 0.1); put("y", 0.1) })
                })
            })
            put(JSONObject().apply {
                put("type", "strokeStart")
                put("data", JSONObject().apply {
                    put("strokeId", "s2")
                    put("color", "#FF0000")
                    put("width", 0.02)
                    put("point", JSONObject().apply { put("x", 0.5); put("y", 0.5) })
                })
            })
            put(JSONObject().apply {
                put("type", "undoStroke")
            })
        }

        val reconnectJson = JSONObject().apply {
            put("drawingHistory", history)
            put("roomCode", "ROOM1")
            put("phase", "DRAWING")
            put("players", JSONArray())
            put("settings", JSONObject())
        }
        every { repo.parseRoomState(any()) } returns RoomState(
            roomCode = "ROOM1", phase = GamePhase.DRAWING, settings = RoomSettings(),
            players = emptyList(), currentRound = 1, currentArtistId = "other",
            wordPattern = "_ _ _", wordLength = 3, roundStartTimestamp = 0L,
            roundEndTimestamp = 0L, selectionDeadline = 0L, serverTime = 0L
        )

        socketEventsFlow.emit(SocketEvent.ReconnectState(reconnectJson))

        assertEquals("Only 1 stroke should remain after undoStroke in drawing history", 1, viewModel.uiState.value.remoteStrokes.size)
        assertEquals("s1", viewModel.uiState.value.remoteStrokes.first().id)
    }
}
