package com.drawrush.app.data.network

import android.util.Log
import com.drawrush.app.BuildConfig
import com.drawrush.app.data.model.*
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import org.json.JSONObject
import org.json.JSONArray
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "SocketManager"

// ─── Event names (mirrors backend protocol) ───────────────────────────────────
object Events {
    // C2S
    const val CREATE_ROOM = "createRoom"
    const val JOIN_ROOM = "joinRoom"
    const val LEAVE_ROOM = "leaveRoom"
    const val SET_READY = "setReady"
    const val START_GAME = "startGame"
    const val SELECT_WORD = "selectWord"
    const val STROKE_START = "strokeStart"
    const val STROKE_BATCH = "strokeBatch"
    const val STROKE_END = "strokeEnd"
    const val CLEAR_CANVAS = "clearCanvas"
    const val UNDO_STROKE = "undoStroke"
    const val SUBMIT_GUESS = "submitGuess"
    const val CHAT_MESSAGE = "chatMessage"
    const val KICK_PLAYER = "kickPlayer"
    const val MUTE_PLAYER = "mutePlayer"
    const val BAN_PLAYER = "banPlayer"
    const val REPORT_PLAYER = "reportPlayer"
    const val REQUEST_STATE = "requestState"

    // S2C
    const val ROOM_CREATED = "roomCreated"
    const val ROOM_UPDATED = "roomUpdated"
    const val PLAYER_JOINED = "playerJoined"
    const val PLAYER_LEFT = "playerLeft"
    const val PLAYER_KICKED = "playerKicked"
    const val PLAYER_MUTED = "playerMuted"
    const val PLAYER_BANNED = "playerBanned"
    const val GAME_STARTED = "gameStarted"
    const val COUNTDOWN_STARTED = "countdownStarted"
    const val WORD_CHOICES = "wordChoices"
    const val DRAWING_STARTED = "drawingStarted"
    const val STROKE_START_S2C = "strokeStart"
    const val STROKE_BATCH_S2C = "strokeBatch"
    const val STROKE_END_S2C = "strokeEnd"
    const val CANVAS_CLEARED = "canvasCleared"
    const val UNDO_STROKE_S2C = "undoStroke"
    const val CANVAS_STATE = "canvasState"
    const val GUESS_RESULT = "guessResult"
    const val PLAYER_GUESSED_CORRECTLY = "playerGuessedCorrectly"
    const val HINT_UPDATED = "hintUpdated"
    const val ROUND_ENDED = "roundEnded"
    const val SCORE_UPDATED = "scoreUpdated"
    const val GAME_ENDED = "gameEnded"
    const val RECONNECT_STATE = "reconnectState"
    const val HOST_CHANGED = "hostChanged"
    const val TIMER_SYNC = "timerSync"
    const val ERROR_EVENT = "error"
    const val CHAT_MESSAGE_S2C = "chatMessage"
    const val SYSTEM_MESSAGE = "systemMessage"
}

sealed class SocketEvent {
    data class RoomCreated(val json: JSONObject) : SocketEvent()
    data class RoomUpdated(val json: JSONObject) : SocketEvent()
    data class PlayerJoined(val json: JSONObject) : SocketEvent()
    data class PlayerLeft(val json: JSONObject) : SocketEvent()
    data class PlayerKicked(val playerId: String) : SocketEvent()
    data class CountdownStarted(val endsAt: Long, val serverTime: Long) : SocketEvent()
    data class WordChoices(val choices: List<String>, val deadline: Long) : SocketEvent()
    data class DrawingStarted(val json: JSONObject) : SocketEvent()
    data class StrokeStart(val json: JSONObject) : SocketEvent()
    data class StrokeBatch(val json: JSONObject) : SocketEvent()
    data class StrokeEnd(val json: JSONObject) : SocketEvent()
    data object CanvasCleared : SocketEvent()
    data object UndoStroke : SocketEvent()
    data class CanvasState(val json: JSONObject) : SocketEvent()
    data class GuessResult(val correct: Boolean, val points: Int) : SocketEvent()
    data class PlayerGuessedCorrectly(val playerId: String, val nickname: String) : SocketEvent()
    data class HintUpdated(val wordPattern: String, val hintsGiven: Int) : SocketEvent()
    data class RoundEnded(val json: JSONObject) : SocketEvent()
    data class ScoreUpdated(val json: JSONObject) : SocketEvent()
    data class GameEnded(val json: JSONObject) : SocketEvent()
    data class ReconnectState(val json: JSONObject) : SocketEvent()
    data class HostChanged(val newHostId: String) : SocketEvent()
    data class ChatMessageReceived(val json: JSONObject) : SocketEvent()
    data class ServerError(val code: String, val message: String) : SocketEvent()
    data class UserProfile(val json: JSONObject) : SocketEvent()
    data class FriendsList(val json: JSONObject) : SocketEvent()
    data object Connected : SocketEvent()
    data class Disconnected(val reason: String) : SocketEvent()
    data class ConnectError(val message: String) : SocketEvent()
}

@Singleton
class SocketManager @Inject constructor() {

    private var socket: Socket? = null
    private val _events = MutableSharedFlow<SocketEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<SocketEvent> = _events.asSharedFlow()

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    fun connect(serverUrl: String, idToken: String) {
        disconnect()
        try {
            Log.d(TAG, "Attempting to connect to Server URL: $serverUrl")
            val options = IO.Options().apply {
                auth = mapOf("token" to idToken)
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 1000
                reconnectionDelayMax = 30000
            }
            socket = IO.socket(URI.create(serverUrl), options).also { s ->
                registerHandlers(s)
                s.connect()
            }
            Log.d(TAG, "Connecting to $serverUrl with path /socket.io/")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect to $serverUrl", e)
            _events.tryEmit(SocketEvent.ConnectError(e.message ?: "Unknown error"))
        }
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        _connected.value = false
    }

    fun isConnected(): Boolean = socket?.connected() == true

    // ─── Emit helpers ─────────────────────────────────────────────────────────

    fun createRoom(nickname: String, avatar: String, settings: RoomSettings? = null) {
        val payload = JSONObject().apply {
            put("nickname", nickname)
            put("avatar", avatar)
            settings?.let {
                put("settings", JSONObject().apply {
                    put("maxPlayers", it.maxPlayers)
                    put("rounds", it.rounds)
                    put("drawingTimeSec", it.drawingTimeSec)
                    put("wordChoiceCount", it.wordChoiceCount)
                    put("hintCount", it.hintCount)
                    put("language", it.language)
                    put("categories", JSONArray(it.categories))
                    put("customWords", JSONArray(it.customWords))
                    put("exclusiveCustomWords", it.exclusiveCustomWords)
                })
            }
        }
        emit(Events.CREATE_ROOM, payload)
    }

    fun joinRoom(roomCode: String, nickname: String, avatar: String) {
        emit(Events.JOIN_ROOM, JSONObject().apply {
            put("roomCode", roomCode.uppercase().trim())
            put("nickname", nickname)
            put("avatar", avatar)
        })
    }

    fun leaveRoom(roomCode: String) {
        emit(Events.LEAVE_ROOM, JSONObject().apply { put("roomCode", roomCode) })
    }

    fun setReady(roomCode: String, ready: Boolean) {
        emit(Events.SET_READY, JSONObject().apply {
            put("roomCode", roomCode)
            put("ready", ready)
        })
    }

    fun startGame(roomCode: String) {
        emit(Events.START_GAME, JSONObject().apply { put("roomCode", roomCode) })
    }

    fun selectWord(roomCode: String, word: String) {
        emit(Events.SELECT_WORD, JSONObject().apply {
            put("roomCode", roomCode)
            put("word", word)
        })
    }

    fun sendStrokeStart(roomCode: String, strokeId: String, seq: Int, color: String,
                        width: Float, tool: String, x: Float, y: Float) {
        emit(Events.STROKE_START, JSONObject().apply {
            put("roomCode", roomCode)
            put("strokeId", strokeId)
            put("sequenceNumber", seq)
            put("color", color)
            put("width", width)
            put("tool", tool)
            put("point", JSONObject().apply { put("x", x); put("y", y) })
        })
    }

    fun sendStrokeBatch(roomCode: String, strokeId: String, seq: Int, color: String,
                        width: Float, tool: String, points: List<DrawPoint>) {
        emit(Events.STROKE_BATCH, JSONObject().apply {
            put("roomCode", roomCode)
            put("strokeId", strokeId)
            put("sequenceNumber", seq)
            put("color", color)
            put("width", width)
            put("tool", tool)
            put("points", JSONArray(points.map { p -> JSONObject().apply { put("x", p.x); put("y", p.y) } }))
        })
    }

    fun sendStrokeEnd(roomCode: String, strokeId: String, seq: Int) {
        emit(Events.STROKE_END, JSONObject().apply {
            put("roomCode", roomCode)
            put("strokeId", strokeId)
            put("sequenceNumber", seq)
        })
    }

    fun sendClearCanvas(roomCode: String, seq: Int) {
        emit(Events.CLEAR_CANVAS, JSONObject().apply {
            put("roomCode", roomCode)
            put("sequenceNumber", seq)
        })
    }

    fun sendUndoStroke(roomCode: String, seq: Int) {
        emit(Events.UNDO_STROKE, JSONObject().apply {
            put("roomCode", roomCode)
            put("sequenceNumber", seq)
        })
    }

    fun submitGuess(roomCode: String, guess: String) {
        emit(Events.SUBMIT_GUESS, JSONObject().apply {
            put("roomCode", roomCode)
            put("guess", guess)
        })
    }

    fun sendChatMessage(roomCode: String, text: String) {
        emit(Events.CHAT_MESSAGE, JSONObject().apply {
            put("roomCode", roomCode)
            put("text", text)
        })
    }

    fun kickPlayer(roomCode: String, targetPlayerId: String) {
        emit(Events.KICK_PLAYER, JSONObject().apply {
            put("roomCode", roomCode)
            put("targetPlayerId", targetPlayerId)
        })
    }

    fun mutePlayer(roomCode: String, targetPlayerId: String) {
        emit(Events.MUTE_PLAYER, JSONObject().apply {
            put("roomCode", roomCode)
            put("targetPlayerId", targetPlayerId)
        })
    }

    fun banPlayer(roomCode: String, targetPlayerId: String) {
        emit(Events.BAN_PLAYER, JSONObject().apply {
            put("roomCode", roomCode)
            put("targetPlayerId", targetPlayerId)
        })
    }

    fun requestState() {
        socket?.emit(Events.REQUEST_STATE)
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private fun emit(event: String, data: JSONObject) {
        emitEvent(event, data)
    }

    fun emitEvent(event: String, data: JSONObject? = null) {
        if (socket?.connected() == true) {
            if (data != null) {
                socket?.emit(event, data)
            } else {
                socket?.emit(event)
            }
        } else {
            Log.w(TAG, "Tried to emit '$event' but socket not connected")
        }
    }

    private fun registerHandlers(s: Socket) {
        s.on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Socket connected")
            _connected.value = true
            _events.tryEmit(SocketEvent.Connected)
        }

        s.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args?.firstOrNull()?.toString() ?: "unknown"
            Log.d(TAG, "Socket disconnected: $reason")
            _connected.value = false
            _events.tryEmit(SocketEvent.Disconnected(reason))
        }

        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val errorObj = args?.firstOrNull()
            val msg = errorObj?.toString() ?: "connect error"
            val errorType = if (errorObj is Exception) errorObj.javaClass.simpleName else "UnknownType"
            val errorDesc = if (errorObj is Exception) errorObj.localizedMessage else msg
            Log.w(TAG, "Connection error: $msg")
            Log.w(TAG, "Error Type: $errorType")
            Log.w(TAG, "Error Description: $errorDesc")
            if (errorObj is Exception) {
                Log.w(TAG, "Exception/Stack Trace: ", errorObj)
            }
            _events.tryEmit(SocketEvent.ConnectError(msg))
        }

        s.on(io.socket.client.Manager.EVENT_RECONNECT_ATTEMPT) { args ->
            val attempt = args?.firstOrNull() ?: 0
            Log.d(TAG, "Reconnect attempt: $attempt")
        }

        s.on(io.socket.client.Manager.EVENT_RECONNECT_ERROR) { args ->
            val errorObj = args?.firstOrNull()
            Log.e(TAG, "Reconnect error: $errorObj")
        }

        s.on("userProfile") { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.UserProfile(it))
            }
        }

        s.on("friendsList") { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.FriendsList(it))
            }
        }

        s.on("friendRequestReceived") { _ -> emitEvent("getFriends") }
        s.on("friendAdded") { _ -> emitEvent("getFriends") }
        s.on("friendRemoved") { _ -> emitEvent("getFriends") }
        s.on("friendRequestRemoved") { _ -> emitEvent("getFriends") }

        s.on(Events.ROOM_CREATED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.RoomCreated(it))
            }
        }

        s.on(Events.ROOM_UPDATED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.RoomUpdated(it))
            }
        }

        s.on(Events.PLAYER_JOINED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.PlayerJoined(it))
            }
        }

        s.on(Events.PLAYER_LEFT) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.PlayerLeft(it))
            }
        }

        s.on(Events.PLAYER_KICKED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.PlayerKicked(it.optString("playerId")))
            }
        }

        s.on(Events.COUNTDOWN_STARTED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.CountdownStarted(
                    endsAt = it.optLong("endsAt"),
                    serverTime = it.optLong("serverTime")
                ))
            }
        }

        s.on(Events.WORD_CHOICES) { args ->
            (args?.firstOrNull() as? JSONObject)?.let { obj ->
                val choices = (0 until obj.optJSONArray("choices")!!.length())
                    .map { i -> obj.getJSONArray("choices").getString(i) }
                _events.tryEmit(SocketEvent.WordChoices(choices, obj.optLong("deadline")))
            }
        }

        s.on(Events.DRAWING_STARTED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.DrawingStarted(it))
            }
        }

        s.on(Events.STROKE_START_S2C) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.StrokeStart(it))
            }
        }

        s.on(Events.STROKE_BATCH_S2C) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.StrokeBatch(it))
            }
        }

        s.on(Events.STROKE_END_S2C) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.StrokeEnd(it))
            }
        }

        s.on(Events.CANVAS_CLEARED) { _ ->
            _events.tryEmit(SocketEvent.CanvasCleared)
        }

        s.on(Events.UNDO_STROKE_S2C) { _ ->
            _events.tryEmit(SocketEvent.UndoStroke)
        }

        s.on(Events.CANVAS_STATE) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.CanvasState(it))
            }
        }

        s.on(Events.GUESS_RESULT) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.GuessResult(
                    correct = it.optBoolean("correct"),
                    points = it.optInt("points")
                ))
            }
        }

        s.on(Events.PLAYER_GUESSED_CORRECTLY) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.PlayerGuessedCorrectly(
                    playerId = it.optString("playerId"),
                    nickname = it.optString("nickname")
                ))
            }
        }

        s.on(Events.HINT_UPDATED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.HintUpdated(
                    wordPattern = it.optString("wordPattern"),
                    hintsGiven = it.optInt("hintsGiven")
                ))
            }
        }

        s.on(Events.ROUND_ENDED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.RoundEnded(it))
            }
        }

        s.on(Events.SCORE_UPDATED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.ScoreUpdated(it))
            }
        }

        s.on(Events.GAME_ENDED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.GameEnded(it))
            }
        }

        s.on(Events.RECONNECT_STATE) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.ReconnectState(it))
            }
        }

        s.on(Events.HOST_CHANGED) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.HostChanged(it.optString("newHostId")))
            }
        }

        s.on(Events.CHAT_MESSAGE_S2C) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.ChatMessageReceived(it))
            }
        }

        s.on(Events.ERROR_EVENT) { args ->
            (args?.firstOrNull() as? JSONObject)?.let {
                _events.tryEmit(SocketEvent.ServerError(
                    code = it.optString("code"),
                    message = it.optString("message")
                ))
            }
        }
    }
}
