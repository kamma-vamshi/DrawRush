package com.drawrush.app.viewmodel

import androidx.compose.ui.geometry.Offset
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drawrush.app.data.model.*
import com.drawrush.app.data.network.SocketEvent
import com.drawrush.app.data.repository.GameRepository
import com.drawrush.app.util.HapticsManager
import com.drawrush.app.util.SoundManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import org.json.JSONObject
import java.util.UUID
import javax.inject.Inject
import kotlin.math.max
import kotlin.math.round

// ─── Drawing state ────────────────────────────────────────────────────────────

data class Stroke(
    val id: String,
    val color: String,
    val width: Float,
    val tool: DrawTool,
    val points: List<Offset> = emptyList()
)

data class DrawingToolState(
    val selectedColor: String = "#6C5CE7",
    val brushWidth: Float = 0.015f,
    val tool: DrawTool = DrawTool.brush
)

// ─── Game UI state ────────────────────────────────────────────────────────────

data class GameUiState(
    val roomCode: String = "",
    val phase: GamePhase = GamePhase.LOBBY,
    val players: List<PlayerState> = emptyList(),
    val myPlayerId: String = "",
    val currentArtistId: String? = null,
    val isArtist: Boolean = false,
    val secretWord: String? = null,          // Only set for the artist
    val wordPattern: String? = null,
    val wordLength: Int? = null,
    val wordChoices: List<String> = emptyList(),
    val selectionDeadline: Long? = null,
    val roundStartTimestamp: Long? = null,
    val roundEndTimestamp: Long? = null,
    val serverTimeDelta: Long = 0L,           // localTime = serverTime + delta
    val currentRound: Int = 0,
    val totalRounds: Int = 3,
    val chatMessages: List<ChatMessage> = emptyList(),
    val chatInput: String = "",
    val strokes: List<Stroke> = emptyList(),
    val remoteStrokes: List<Stroke> = emptyList(),
    val drawingTool: DrawingToolState = DrawingToolState(),
    val roundResult: RoundResult? = null,
    val gameResult: GameResult? = null,
    val guessInput: String = "",
    val guessResult: Pair<Boolean, Int>? = null, // (correct, points)
    val hintPattern: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val systemMessages: List<String> = emptyList(),
    val settings: RoomSettings = RoomSettings(),
    val countdownEndsAt: Long? = null,
)

@HiltViewModel
class GameViewModel @Inject constructor(
    private val repo: GameRepository,
    private val soundManager: SoundManager? = null,
    private val hapticsManager: HapticsManager? = null
) : ViewModel() {

    private val _uiState = MutableStateFlow(GameUiState())
    val uiState: StateFlow<GameUiState> = _uiState.asStateFlow()

    // Local drawing sequence counter
    private var drawingSeq = 0
    private var currentStrokeId: String? = null
    private var pendingBatchPoints = mutableListOf<DrawPoint>()
    private var batchJob: kotlinx.coroutines.Job? = null
    private var reconnectJob: kotlinx.coroutines.Job? = null

    init {
        viewModelScope.launch {
            repo.getPreferences().collect { prefs ->
                soundManager?.isEnabled = prefs.soundEnabled
                hapticsManager?.isEnabled = prefs.hapticsEnabled
            }
        }
        viewModelScope.launch {
            repo.serverPlayerId.collect { id ->
                val myId = id ?: ""
                _uiState.update { s ->
                    val isArtist = (s.currentArtistId != null && s.currentArtistId == myId) || s.isArtist
                    s.copy(myPlayerId = myId, isArtist = isArtist)
                }
            }
        }
        observeEvents()
    }

    fun setRoomCode(code: String, totalRounds: Int = 3) {
        _uiState.update { it.copy(roomCode = code, totalRounds = totalRounds) }
    }

    // ─── Event handling ───────────────────────────────────────────────────────

    private fun observeEvents() {
        viewModelScope.launch {
            repo.socketEvents.collect { event ->
                when (event) {
                    is SocketEvent.RoomUpdated -> {
                        val state = repo.parseRoomState(event.json) ?: return@collect
                        syncServerTime(state.serverTime)
                        _uiState.update { s ->
                            val isArtist = (state.currentArtistId != null && state.currentArtistId == s.myPlayerId) || s.isArtist
                            val effectivePattern = if (isArtist && !s.secretWord.isNullOrEmpty()) s.secretWord else state.wordPattern
                            s.copy(
                                phase = state.phase,
                                players = state.players,
                                settings = state.settings,
                                currentArtistId = state.currentArtistId,
                                isArtist = isArtist,
                                wordPattern = effectivePattern,
                                wordLength = state.wordLength,
                                roundStartTimestamp = state.roundStartTimestamp,
                                roundEndTimestamp = state.roundEndTimestamp,
                                totalRounds = state.settings.rounds,
                            )
                        }
                    }

                    is SocketEvent.CountdownStarted -> {
                        syncServerTime(event.serverTime)
                        soundManager?.playTick()
                        hapticsManager?.vibrateClick()
                        _uiState.update { it.copy(
                            phase = GamePhase.COUNTDOWN,
                            countdownEndsAt = event.endsAt
                        )}
                    }

                    is SocketEvent.WordChoices -> {
                        // Only the artist receives this
                        soundManager?.playWordPrompt()
                        hapticsManager?.vibrateClick()
                        _uiState.update { it.copy(
                            phase = GamePhase.WORD_SELECTION,
                            isArtist = true,
                            wordChoices = event.choices,
                            selectionDeadline = event.deadline
                        )}
                    }

                    is SocketEvent.DrawingStarted -> {
                        val json = event.json
                        val isArtist = json.optBoolean("isArtist")
                        val secretWord = if (isArtist) json.optString("secretWord") else null
                        val pattern = json.optString("wordPattern")
                        syncServerTime(json.optLong("serverTime"))
                        drawingSeq = 0
                        _uiState.update { s -> s.copy(
                            phase = GamePhase.DRAWING,
                            isArtist = isArtist,
                            secretWord = secretWord,
                            wordPattern = if (isArtist) secretWord else pattern,
                            wordLength = json.optInt("wordLength").takeIf { it > 0 },
                            roundStartTimestamp = json.optLong("startTimestamp"),
                            roundEndTimestamp = json.optLong("endTimestamp"),
                            strokes = emptyList(),
                            remoteStrokes = emptyList(),
                            wordChoices = emptyList(),
                            hintPattern = null,
                            guessResult = null,
                        )}
                    }

                    is SocketEvent.StrokeStart -> handleRemoteStrokeStart(event.json)
                    is SocketEvent.StrokeBatch -> handleRemoteStrokeBatch(event.json)
                    is SocketEvent.StrokeEnd -> handleRemoteStrokeEnd(event.json)

                    is SocketEvent.CanvasCleared -> {
                        _uiState.update { it.copy(remoteStrokes = emptyList()) }
                    }

                    is SocketEvent.UndoStroke -> {
                        _uiState.update { s ->
                            val newStrokes = s.remoteStrokes.toMutableList()
                            if (newStrokes.isNotEmpty()) newStrokes.removeLast()
                            s.copy(remoteStrokes = newStrokes)
                        }
                    }

                    is SocketEvent.GuessResult -> {
                        if (event.correct) {
                            soundManager?.playSuccess()
                            hapticsManager?.vibrateSuccess()
                        } else {
                            soundManager?.playError()
                            hapticsManager?.vibrateError()
                        }
                        _uiState.update { it.copy(guessResult = Pair(event.correct, event.points), guessInput = "") }
                    }

                    is SocketEvent.PlayerGuessedCorrectly -> {
                        addSystemMessage("${event.nickname} guessed correctly! 🎉")
                    }

                    is SocketEvent.HintUpdated -> {
                        _uiState.update { s ->
                            val pattern = if (s.isArtist && !s.secretWord.isNullOrEmpty()) s.secretWord else event.wordPattern
                            s.copy(hintPattern = event.wordPattern, wordPattern = pattern)
                        }
                    }

                    is SocketEvent.RoundEnded -> {
                        soundManager?.playRoundEnd()
                        val result = repo.parseRoundResult(event.json)
                        _uiState.update { it.copy(
                            phase = GamePhase.ROUND_RESULT,
                            roundResult = result,
                            currentRound = it.currentRound + 1
                        )}
                    }

                    is SocketEvent.ScoreUpdated -> {
                        val updatesArr = event.json.optJSONArray("updates") ?: return@collect
                        _uiState.update { s ->
                            val updated = s.players.map { p ->
                                for (i in 0 until updatesArr.length()) {
                                    val upd = updatesArr.getJSONObject(i)
                                    if (upd.optString("playerId") == p.playerId) {
                                        return@map p.copy(score = upd.optInt("newScore"))
                                    }
                                }
                                p
                            }
                            s.copy(players = updated)
                        }
                    }

                    is SocketEvent.GameEnded -> {
                        soundManager?.playGameOver()
                        val result = repo.parseGameResult(event.json)
                        _uiState.update { it.copy(
                            phase = GamePhase.GAME_RESULT,
                            gameResult = result
                        )}
                    }

                    is SocketEvent.ReconnectState -> {
                        val json = event.json
                        val state = repo.parseRoomState(json) ?: return@collect
                        syncServerTime(state.serverTime)
                        val isArtist = json.optBoolean("isArtist") || (state.currentArtistId != null && state.currentArtistId == _uiState.value.myPlayerId)
                        val secretWord = if (isArtist) json.optString("secretWord").takeIf { it.isNotEmpty() } else null
                        val pattern = if (isArtist && secretWord != null) secretWord else state.wordPattern
                        _uiState.update { s -> s.copy(
                            phase = state.phase,
                            players = state.players,
                            settings = state.settings,
                            currentArtistId = state.currentArtistId,
                            wordPattern = pattern,
                            wordLength = state.wordLength,
                            roundStartTimestamp = state.roundStartTimestamp,
                            roundEndTimestamp = state.roundEndTimestamp,
                            isArtist = isArtist,
                            secretWord = secretWord,
                        )}
                        // Rebuild canvas from drawing history
                        reconstructCanvas(json)
                        // Restore chat
                        restoreChat(json)
                    }

                    is SocketEvent.ChatMessageReceived -> {
                        val msg = repo.parseChatMessage(event.json) ?: return@collect
                        _uiState.update { s -> s.copy(chatMessages = (s.chatMessages + msg).takeLast(100)) }
                    }

                    is SocketEvent.PlayerLeft -> {
                        val playerId = event.json.optString("playerId")
                        _uiState.update { s ->
                            s.copy(players = s.players.filter { it.playerId != playerId })
                        }
                    }

                    is SocketEvent.ServerError -> {
                        _uiState.update { it.copy(error = "${event.code}: ${event.message}") }
                    }

                    is SocketEvent.Disconnected -> {
                        _uiState.update { it.copy(isLoading = true, error = "Reconnecting...") }
                        repo.disconnect() // Eagerly kill the old socket to prevent stale internal reconnects
                        reconnectJob?.cancel()
                        reconnectJob = viewModelScope.launch {
                            var success = false
                            while (!success && isActive) {
                                if (repo.connectToServer().isSuccess) {
                                    success = true
                                } else {
                                    kotlinx.coroutines.delay(2000)
                                }
                            }
                        }
                    }

                    is SocketEvent.Connected -> {
                        reconnectJob?.cancel()
                        reconnectJob = null
                        _uiState.update { it.copy(isLoading = false, error = null) }
                        if (_uiState.value.roomCode.isNotEmpty()) {
                            val me = _uiState.value.players.find { it.playerId == _uiState.value.myPlayerId }
                            if (me != null) {
                                repo.joinRoom(_uiState.value.roomCode, me.nickname, me.avatar)
                            }
                        }
                    }

                    else -> {}
                }
            }
        }
    }

    // ─── Drawing (artist only) ────────────────────────────────────────────────

    fun onPointerDown(x: Float, y: Float, canvasW: Float, canvasH: Float) {
        if (!_uiState.value.isArtist) return
        val nx = (x / canvasW).coerceIn(0f, 1f)
        val ny = (y / canvasH).coerceIn(0f, 1f)
        val tool = _uiState.value.drawingTool
        val strokeId = UUID.randomUUID().toString()
        currentStrokeId = strokeId
        val stroke = Stroke(
            id = strokeId,
            color = tool.selectedColor,
            width = tool.brushWidth,
            tool = tool.tool,
            points = listOf(Offset(nx, ny))
        )
        hapticsManager?.vibrateClick()
        _uiState.update { s -> s.copy(strokes = s.strokes + stroke) }
        val seq = drawingSeq++
        repo.sendStrokeStart(
            _uiState.value.roomCode, strokeId, seq,
            tool.selectedColor, tool.brushWidth, tool.tool.name, nx, ny
        )
    }

    fun onPointerMove(x: Float, y: Float, canvasW: Float, canvasH: Float) {
        if (!_uiState.value.isArtist) return
        val strokeId = currentStrokeId ?: return
        val nx = (x / canvasW).coerceIn(0f, 1f)
        val ny = (y / canvasH).coerceIn(0f, 1f)

        // Update local stroke
        _uiState.update { s ->
            val strokes = s.strokes
            val last = strokes.lastOrNull()
            if (last?.id == strokeId) {
                val updated = last.copy(points = last.points + Offset(nx, ny))
                s.copy(strokes = strokes.dropLast(1) + updated)
            } else {
                s
            }
        }

        // Batch points for network
        pendingBatchPoints.add(DrawPoint(nx, ny))
        if (pendingBatchPoints.size >= 10) {
            flushBatch(strokeId)
        }
    }

    fun onPointerUp(x: Float, y: Float, canvasW: Float, canvasH: Float) {
        if (!_uiState.value.isArtist) return
        val strokeId = currentStrokeId ?: return
        flushBatch(strokeId)
        val seq = drawingSeq++
        repo.sendStrokeEnd(_uiState.value.roomCode, strokeId, seq)
        currentStrokeId = null
    }

    private fun flushBatch(strokeId: String) {
        if (pendingBatchPoints.isEmpty()) return
        val tool = _uiState.value.drawingTool
        val seq = drawingSeq++
        repo.sendStrokeBatch(
            _uiState.value.roomCode, strokeId, seq,
            tool.selectedColor, tool.brushWidth, tool.tool.name,
            pendingBatchPoints.toList()
        )
        pendingBatchPoints.clear()
    }

    fun clearCanvas() {
        if (!_uiState.value.isArtist) return
        _uiState.update { it.copy(strokes = emptyList()) }
        repo.sendClearCanvas(_uiState.value.roomCode, drawingSeq++)
    }

    fun undoStroke() {
        if (!_uiState.value.isArtist) return
        _uiState.update { s ->
            val newStrokes = s.strokes.toMutableList()
            if (newStrokes.isNotEmpty()) newStrokes.removeLast()
            s.copy(strokes = newStrokes)
        }
        repo.sendUndoStroke(_uiState.value.roomCode, drawingSeq++)
    }

    fun setColor(color: String) {
        _uiState.update { it.copy(drawingTool = it.drawingTool.copy(selectedColor = color)) }
    }

    fun setBrushWidth(width: Float) {
        _uiState.update { it.copy(drawingTool = it.drawingTool.copy(brushWidth = width)) }
    }

    fun setTool(tool: DrawTool) {
        _uiState.update { it.copy(drawingTool = it.drawingTool.copy(tool = tool)) }
    }

    // ─── Remote drawing ───────────────────────────────────────────────────────

    private fun handleRemoteStrokeStart(json: JSONObject) {
        val tool = runCatching { DrawTool.valueOf(json.optString("tool", "brush")) }.getOrElse { DrawTool.brush }
        val point = json.optJSONObject("point")
        val stroke = Stroke(
            id = json.optString("strokeId"),
            color = json.optString("color", "#333333"),
            width = json.optDouble("width", 0.015).toFloat(),
            tool = tool,
            points = listOf(
                Offset(point?.optDouble("x", 0.0)?.toFloat() ?: 0f,
                    point?.optDouble("y", 0.0)?.toFloat() ?: 0f)
            )
        )
        _uiState.update { s -> s.copy(remoteStrokes = s.remoteStrokes + stroke) }
    }

    private fun handleRemoteStrokeBatch(json: JSONObject) {
        val strokeId = json.optString("strokeId")
        val pointsArr = json.optJSONArray("points") ?: return
        val newPoints = (0 until pointsArr.length()).map { i ->
            val p = pointsArr.getJSONObject(i)
            Offset(p.optDouble("x", 0.0).toFloat(), p.optDouble("y", 0.0).toFloat())
        }
        _uiState.update { s ->
            val idx = s.remoteStrokes.indexOfLast { it.id == strokeId }
            if (idx >= 0) {
                val target = s.remoteStrokes[idx]
                val updated = target.copy(points = target.points + newPoints)
                val newStrokes = s.remoteStrokes.toMutableList()
                newStrokes[idx] = updated
                s.copy(remoteStrokes = newStrokes)
            } else {
                s
            }
        }
    }

    private fun handleRemoteStrokeEnd(json: JSONObject) {
        // No UI change needed — stroke is already accumulated
    }

    private fun reconstructCanvas(json: JSONObject) {
        val historyArr = json.optJSONArray("drawingHistory") ?: return
        val strokes = mutableListOf<Stroke>()

        for (i in 0 until historyArr.length()) {
            val evt = historyArr.getJSONObject(i)
            when (evt.optString("type")) {
                "strokeStart" -> {
                    val data = evt.optJSONObject("data") ?: continue
                    val tool = runCatching { DrawTool.valueOf(data.optString("tool", "brush")) }.getOrElse { DrawTool.brush }
                    val point = data.optJSONObject("point")
                    val stroke = Stroke(
                        id = data.optString("strokeId"),
                        color = data.optString("color", "#333333"),
                        width = data.optDouble("width", 0.015).toFloat(),
                        tool = tool,
                        points = listOf(
                            Offset(point?.optDouble("x", 0.0)?.toFloat() ?: 0f,
                                point?.optDouble("y", 0.0)?.toFloat() ?: 0f)
                        )
                    )
                    strokes.add(stroke)
                }
                "strokeBatch" -> {
                    val data = evt.optJSONObject("data") ?: continue
                    val pointsArr = data.optJSONArray("points") ?: continue
                    val strokeId = data.optString("strokeId")
                    val idx = strokes.indexOfLast { it.id == strokeId }
                    if (idx >= 0) {
                        val target = strokes[idx]
                        val newPoints = (0 until pointsArr.length()).map { j ->
                            val p = pointsArr.getJSONObject(j)
                            Offset(p.optDouble("x", 0.0).toFloat(), p.optDouble("y", 0.0).toFloat())
                        }
                        strokes[idx] = target.copy(points = target.points + newPoints)
                    }
                }
                "clearCanvas" -> strokes.clear()
                "undoStroke" -> if (strokes.isNotEmpty()) strokes.removeLast()
            }
        }

        _uiState.update { it.copy(remoteStrokes = strokes) }
    }

    private fun restoreChat(json: JSONObject) {
        val chatArr = json.optJSONArray("chatHistory") ?: return
        val messages = (0 until chatArr.length()).mapNotNull { i ->
            repo.parseChatMessage(chatArr.getJSONObject(i))
        }
        _uiState.update { it.copy(chatMessages = messages) }
    }

    // ─── Guess / Chat ─────────────────────────────────────────────────────────

    fun onGuessInputChanged(text: String) = _uiState.update { it.copy(guessInput = text) }

    fun submitGuess() {
        val guess = _uiState.value.guessInput.trim()
        if (guess.isBlank()) return
        repo.submitGuess(_uiState.value.roomCode, guess)
        _uiState.update { it.copy(guessInput = "") }
    }

    fun onChatInputChanged(text: String) = _uiState.update { it.copy(chatInput = text) }

    fun sendChat() {
        val text = _uiState.value.chatInput.trim()
        if (text.isBlank()) return
        repo.sendChatMessage(_uiState.value.roomCode, text)
        _uiState.update { it.copy(chatInput = "") }
    }

    // ─── Word selection (artist) ──────────────────────────────────────────────

    fun selectWord(word: String) {
        repo.selectWord(_uiState.value.roomCode, word)
        _uiState.update { it.copy(wordChoices = emptyList()) }
    }

    // ─── Timer helpers ────────────────────────────────────────────────────────

    fun getRemainingMs(): Long {
        val endTs = _uiState.value.roundEndTimestamp ?: return 0L
        val now = System.currentTimeMillis() + _uiState.value.serverTimeDelta
        return max(0L, endTs - now)
    }

    private fun syncServerTime(serverTime: Long) {
        val delta = serverTime - System.currentTimeMillis()
        _uiState.update { it.copy(serverTimeDelta = delta) }
    }

    // ─── Misc ─────────────────────────────────────────────────────────────────

    private fun addSystemMessage(msg: String) {
        _uiState.update { s -> s.copy(systemMessages = (s.systemMessages + msg).takeLast(20)) }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
    fun clearGuessResult() = _uiState.update { it.copy(guessResult = null) }

    fun requestStateRefresh() {
        if (_uiState.value.roomCode.isNotEmpty()) {
            val me = _uiState.value.players.find { it.playerId == _uiState.value.myPlayerId }
            if (me != null) {
                _uiState.update { it.copy(isLoading = true, error = "Reconnecting...") }
                repo.disconnect()
                reconnectJob?.cancel()
                reconnectJob = viewModelScope.launch {
                    var success = false
                    while (!success && isActive) {
                        if (repo.connectToServer().isSuccess) {
                            success = true
                        } else {
                            kotlinx.coroutines.delay(2000)
                        }
                    }
                }
            }
        }
    }
}
