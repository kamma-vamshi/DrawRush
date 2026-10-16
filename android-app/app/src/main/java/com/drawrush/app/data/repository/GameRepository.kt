package com.drawrush.app.data.repository

import android.util.Log
import com.drawrush.app.BuildConfig
import com.drawrush.app.data.model.*
import com.drawrush.app.data.network.SocketEvent
import com.drawrush.app.data.network.SocketManager
import com.drawrush.app.data.preferences.UserPreferencesRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "GameRepository"

/**
 * Central repository — bridges Firebase Auth, Socket.IO, and UI state.
 */
@Singleton
class GameRepository @Inject constructor(
    private val socketManager: SocketManager,
    private val prefsRepo: UserPreferencesRepository,
    private val firebaseAuth: FirebaseAuth
) {
    val socketEvents: SharedFlow<SocketEvent> = socketManager.events
    val connected: StateFlow<Boolean> = socketManager.connected
    val serverPlayerId = MutableStateFlow<String?>(null)

    init {
        CoroutineScope(Dispatchers.Default).launch {
            socketEvents.collect { event ->
                if (event is SocketEvent.UserProfile) {
                    val id = event.json.optString("id")
                    if (id.isNotEmpty()) {
                        serverPlayerId.value = id
                    }
                }
            }
        }
    }

    fun validateServerUrl(url: String, isDebug: Boolean = BuildConfig.DEBUG): String {
        val trimmed = url.trim()
        val uri = java.net.URI.create(trimmed)
        val scheme = uri.scheme?.lowercase() ?: throw IllegalArgumentException("Missing URL scheme in server URL")
        if (!isDebug) {
            if (scheme != "https" && scheme != "wss") {
                throw IllegalArgumentException("Cleartext HTTP/WS is disabled in release builds. HTTPS or WSS is required.")
            }
        } else {
            if (scheme != "https" && scheme != "wss" && scheme != "http" && scheme != "ws") {
                throw IllegalArgumentException("Invalid URL scheme: $scheme")
            }
        }
        return trimmed
    }

    suspend fun signInAnonymously(): Result<Unit> = withContext(Dispatchers.IO) {
        if (BuildConfig.DEV_AUTH) {
            return@withContext Result.success(Unit)
        }
        try {
            firebaseAuth.signInAnonymously().await()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Anonymous sign-in failed", e)
            Result.failure(e)
        }
    }

    suspend fun signInWithGoogle(idToken: String): Result<Unit> = withContext(Dispatchers.IO) {
        if (BuildConfig.DEV_AUTH) {
            // In dev mode, we just pretend it worked
            return@withContext Result.success(Unit)
        }
        try {
            val credential = com.google.firebase.auth.GoogleAuthProvider.getCredential(idToken, null)
            firebaseAuth.signInWithCredential(credential).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Google sign-in failed", e)
            Result.failure(e)
        }
    }

    // ─── Socket Helpers ────────────────────────────────────────────────────────

    fun emitEvent(event: String, data: JSONObject? = null) {
        socketManager.emitEvent(event, data)
    }

    suspend fun getIdToken(): String? = withContext(Dispatchers.IO) {
        try {
            if (BuildConfig.DEV_AUTH) {
                val uid = firebaseAuth.currentUser?.uid ?: prefsRepo.getOrCreateDevUid()
                return@withContext "dev:$uid"
            }
            firebaseAuth.currentUser?.getIdToken(true)?.await()?.token
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get ID token", e)
            null
        }
    }

    val currentUser: FirebaseUser? get() = firebaseAuth.currentUser
    val currentUid: String? get() = firebaseAuth.currentUser?.uid

    // ─── Connection ────────────────────────────────────────────────────────────

    suspend fun connectToServer(serverUrl: String? = null): Result<Unit> {
        val token = getIdToken() ?: return Result.failure(Exception("Not authenticated"))
        val rawUrl = serverUrl?.takeIf { it.isNotBlank() }
            ?: run {
                val prefUrl = prefsRepo.preferences.first().serverUrl
                prefUrl.takeIf { it.isNotBlank() } ?: BuildConfig.BACKEND_URL
            }
        return try {
            val url = validateServerUrl(rawUrl)
            socketManager.connect(url, token)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun disconnect() = socketManager.disconnect()

    // ─── Room actions ──────────────────────────────────────────────────────────

    fun createRoom(nickname: String, avatar: String, settings: RoomSettings? = null) =
        socketManager.createRoom(nickname, avatar, settings)

    fun joinRoom(roomCode: String, nickname: String, avatar: String) =
        socketManager.joinRoom(roomCode, nickname, avatar)

    fun leaveRoom(roomCode: String) = socketManager.leaveRoom(roomCode)
    fun setReady(roomCode: String, ready: Boolean) = socketManager.setReady(roomCode, ready)
    fun startGame(roomCode: String) = socketManager.startGame(roomCode)
    fun selectWord(roomCode: String, word: String) = socketManager.selectWord(roomCode, word)

    // ─── Drawing actions ───────────────────────────────────────────────────────

    fun sendStrokeStart(roomCode: String, strokeId: String, seq: Int,
                        color: String, width: Float, tool: String, x: Float, y: Float) =
        socketManager.sendStrokeStart(roomCode, strokeId, seq, color, width, tool, x, y)

    fun sendStrokeBatch(roomCode: String, strokeId: String, seq: Int,
                        color: String, width: Float, tool: String, points: List<DrawPoint>) =
        socketManager.sendStrokeBatch(roomCode, strokeId, seq, color, width, tool, points)

    fun sendStrokeEnd(roomCode: String, strokeId: String, seq: Int) =
        socketManager.sendStrokeEnd(roomCode, strokeId, seq)

    fun sendClearCanvas(roomCode: String, seq: Int) = socketManager.sendClearCanvas(roomCode, seq)
    fun sendUndoStroke(roomCode: String, seq: Int) = socketManager.sendUndoStroke(roomCode, seq)

    // ─── Chat/Guess actions ────────────────────────────────────────────────────

    fun submitGuess(roomCode: String, guess: String) = socketManager.submitGuess(roomCode, guess)
    fun sendChatMessage(roomCode: String, text: String) = socketManager.sendChatMessage(roomCode, text)

    // ─── Moderation ────────────────────────────────────────────────────────────

    fun kickPlayer(roomCode: String, targetId: String) = socketManager.kickPlayer(roomCode, targetId)
    fun mutePlayer(roomCode: String, targetId: String) = socketManager.mutePlayer(roomCode, targetId)
    fun banPlayer(roomCode: String, targetId: String) = socketManager.banPlayer(roomCode, targetId)

    // ─── Preferences ───────────────────────────────────────────────────────────

    fun getPreferences() = prefsRepo.preferences
    suspend fun saveNickname(nickname: String) = prefsRepo.updateNickname(nickname)
    suspend fun saveAvatar(avatar: String) = prefsRepo.updateAvatar(avatar)
    suspend fun saveSoundEnabled(enabled: Boolean) = prefsRepo.updateSoundEnabled(enabled)
    suspend fun saveHapticsEnabled(enabled: Boolean) = prefsRepo.updateHapticsEnabled(enabled)
    suspend fun saveServerUrl(url: String) = prefsRepo.updateServerUrl(validateServerUrl(url))

    // ─── Parse helpers ─────────────────────────────────────────────────────────

    fun parseRoomState(json: JSONObject): RoomState? = try {
        val players = parsePlayerList(json.optJSONArray("players"))
        val settings = parseRoomSettings(json.optJSONObject("settings"))
        RoomState(
            roomCode = json.optString("roomCode"),
            phase = runCatching { GamePhase.valueOf(json.optString("phase")) }.getOrElse { GamePhase.LOBBY },
            settings = settings,
            players = players,
            currentRound = json.optInt("currentRound"),
            currentArtistId = json.optString("currentArtistId").takeIf { it.isNotEmpty() },
            wordPattern = json.optString("wordPattern").takeIf { it.isNotEmpty() },
            wordLength = json.optInt("wordLength").takeIf { it > 0 },
            roundStartTimestamp = json.optLong("roundStartTimestamp").takeIf { it > 0 },
            roundEndTimestamp = json.optLong("roundEndTimestamp").takeIf { it > 0 },
            selectionDeadline = json.optLong("selectionDeadline").takeIf { it > 0 },
            serverTime = json.optLong("serverTime")
        )
    } catch (e: Exception) {
        Log.e(TAG, "Failed to parse room state", e)
        null
    }

    fun parsePlayerList(arr: JSONArray?): List<PlayerState> {
        arr ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            try {
                val p = arr.getJSONObject(i)
                PlayerState(
                    playerId = p.optString("playerId"),
                    nickname = p.optString("nickname"),
                    avatar = p.optString("avatar", "avatar_01"),
                    score = p.optInt("score"),
                    connected = p.optBoolean("connected", true),
                    ready = p.optBoolean("ready"),
                    isArtist = p.optBoolean("isArtist"),
                    hasGuessedCurrentWord = p.optBoolean("hasGuessedCurrentWord"),
                    correctGuessCount = p.optInt("correctGuessCount"),
                    isMuted = p.optBoolean("isMuted"),
                    isHost = p.optBoolean("isHost")
                )
            } catch (e: Exception) { null }
        }
    }

    fun parseRoomSettings(obj: JSONObject?): RoomSettings {
        obj ?: return RoomSettings()
        return RoomSettings(
            maxPlayers = obj.optInt("maxPlayers", 8),
            rounds = obj.optInt("rounds", 3),
            drawingTimeSec = obj.optInt("drawingTimeSec", 80),
            wordChoiceCount = obj.optInt("wordChoiceCount", 3),
            hintCount = obj.optInt("hintCount", 2),
            language = obj.optString("language", "en"),
            categories = emptyList(),
            customWords = emptyList(),
            exclusiveCustomWords = obj.optBoolean("exclusiveCustomWords", false)
        )
    }

    fun parseChatMessage(obj: JSONObject?): ChatMessage? {
        obj ?: return null
        val msg = obj.optJSONObject("message") ?: obj
        return try {
            ChatMessage(
                id = msg.optString("id"),
                playerId = msg.optString("playerId"),
                nickname = msg.optString("nickname"),
                text = msg.optString("text"),
                isCorrectGuess = msg.optBoolean("isCorrectGuess"),
                timestamp = msg.optLong("timestamp")
            )
        } catch (e: Exception) { null }
    }

    fun parseRoundResult(json: JSONObject): RoundResult? = try {
        val result = json.optJSONObject("result") ?: json
        val correctGuessers = (0 until (result.optJSONArray("correctGuessers")?.length() ?: 0))
            .map { i ->
                val g = result.getJSONArray("correctGuessers").getJSONObject(i)
                CorrectGuesser(g.optString("playerId"), g.optLong("timeMs"), g.optInt("points"))
            }
        RoundResult(
            roundNumber = result.optInt("roundNumber"),
            answer = result.optString("answer"),
            artistId = result.optString("artistId"),
            correctGuessers = correctGuessers,
            artistPoints = result.optInt("artistPoints"),
            scores = emptyList(),
            reason = result.optString("reason", "timerExpired")
        )
    } catch (e: Exception) { null }

    fun parseGameResult(json: JSONObject): GameResult? = try {
        val result = json.optJSONObject("result") ?: json
        val arr = result.optJSONArray("rankings")
        val rankings = if (arr != null) {
            (0 until arr.length()).map { i ->
                val r = arr.getJSONObject(i)
                GameRanking(
                    rank = r.optInt("rank"),
                    playerId = r.optString("playerId"),
                    nickname = r.optString("nickname"),
                    avatar = r.optString("avatar", "avatar_01"),
                    score = r.optInt("score"),
                    correctGuessCount = r.optInt("correctGuessCount")
                )
            }
        } else emptyList()
        GameResult(rankings)
    } catch (e: Exception) { null }
}
