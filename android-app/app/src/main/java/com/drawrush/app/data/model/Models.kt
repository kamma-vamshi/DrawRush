package com.drawrush.app.data.model

import kotlinx.serialization.Serializable

/** Protocol version matching the backend */
const val PROTOCOL_VERSION = "1.0.0"

/** Brand configuration — change here to rebrand */
const val APP_NAME = "DrawRush"

@Serializable
enum class GamePhase {
    LOBBY, COUNTDOWN, WORD_SELECTION, DRAWING, ROUND_RESULT, NEXT_ROUND, GAME_RESULT
}

@Serializable
data class PlayerState(
    val playerId: String,
    val nickname: String,
    val avatar: String,
    val score: Int,
    val connected: Boolean,
    val ready: Boolean,
    val isArtist: Boolean,
    val hasGuessedCurrentWord: Boolean,
    val correctGuessCount: Int,
    val isMuted: Boolean,
    val isHost: Boolean
)

@Serializable
data class RoomSettings(
    val maxPlayers: Int = 8,
    val rounds: Int = 3,
    val drawingTimeSec: Int = 80,
    val wordChoiceCount: Int = 3,
    val hintCount: Int = 2,
    val language: String = "en",
    val categories: List<String> = emptyList(),
    val customWords: List<String> = emptyList(),
    val exclusiveCustomWords: Boolean = false
)

@Serializable
data class RoomState(
    val roomCode: String,
    val phase: GamePhase,
    val settings: RoomSettings,
    val players: List<PlayerState>,
    val currentRound: Int,
    val currentArtistId: String?,
    val wordPattern: String?,
    val wordLength: Int?,
    val roundStartTimestamp: Long?,
    val roundEndTimestamp: Long?,
    val selectionDeadline: Long?,
    val serverTime: Long
)

@Serializable
data class ChatMessage(
    val id: String,
    val playerId: String,
    val nickname: String,
    val text: String,
    val isCorrectGuess: Boolean,
    val timestamp: Long
)

@Serializable
data class DrawPoint(val x: Float, val y: Float)

@Serializable
enum class DrawTool { brush, eraser }

@Serializable
data class StrokeData(
    val strokeId: String,
    val sequenceNumber: Int,
    val color: String,
    val width: Float,
    val tool: DrawTool,
    val points: List<DrawPoint>
)

@Serializable
data class ScoreUpdate(
    val playerId: String,
    val delta: Int,
    val newScore: Int,
    val reason: String
)

@Serializable
data class CorrectGuesser(
    val playerId: String,
    val timeMs: Long,
    val points: Int
)

@Serializable
data class RoundResult(
    val roundNumber: Int,
    val answer: String,
    val artistId: String,
    val correctGuessers: List<CorrectGuesser>,
    val artistPoints: Int,
    val scores: List<ScoreUpdate>,
    val reason: String
)

@Serializable
data class GameRanking(
    val rank: Int,
    val playerId: String,
    val nickname: String,
    val avatar: String,
    val score: Int,
    val correctGuessCount: Int
)

@Serializable
data class GameResult(val rankings: List<GameRanking>)

/** Available word categories */
@Serializable
data class WordCategory(val id: String, val name: String, val wordCount: Int)

/** Error event from server */
@Serializable
data class ServerError(
    val code: String,
    val message: String,
    val requestId: String? = null
)
