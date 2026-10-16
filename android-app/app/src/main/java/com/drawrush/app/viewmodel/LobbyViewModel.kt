package com.drawrush.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drawrush.app.data.model.*
import com.drawrush.app.data.network.SocketEvent
import com.drawrush.app.data.repository.GameRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LobbyUiState(
    val roomCode: String = "",
    val phase: GamePhase = GamePhase.LOBBY,
    val players: List<PlayerState> = emptyList(),
    val settings: RoomSettings = RoomSettings(),
    val myPlayerId: String = "",
    val isHost: Boolean = false,
    val canStart: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val gameStarted: Boolean = false,
    val kickedOut: Boolean = false,
    val systemMessage: String? = null,
)

@HiltViewModel
class LobbyViewModel @Inject constructor(
    private val repo: GameRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LobbyUiState())
    val uiState: StateFlow<LobbyUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repo.serverPlayerId.collect { id ->
                _uiState.update { it.copy(myPlayerId = id ?: "") }
                
                // Re-evaluate host status based on the new ID if players are already loaded
                val me = _uiState.value.players.find { it.playerId == id }
                _uiState.update { s -> s.copy(
                    isHost = me?.isHost == true,
                    canStart = me?.isHost == true && s.players.count { it.connected } >= 2
                )}
            }
        }
        observeEvents()
    }

    private fun observeEvents() {
        viewModelScope.launch {
            repo.socketEvents.collect { event ->
                when (event) {
                    is SocketEvent.RoomCreated -> handleRoomUpdate(event.json)
                    is SocketEvent.RoomUpdated -> {
                        val state = repo.parseRoomState(event.json)
                        if (state != null) updateFromRoomState(state)
                        if (state?.phase == GamePhase.COUNTDOWN || state?.phase == GamePhase.WORD_SELECTION) {
                            _uiState.update { it.copy(gameStarted = true) }
                        }
                    }
                    is SocketEvent.PlayerJoined -> {
                        val player = repo.parsePlayerList(event.json.optJSONArray("players"))
                        if (player.isNotEmpty()) {
                            _uiState.update { s -> s.copy(players = player) }
                        }
                        // Reparse full room from json
                        handleRoomUpdate(event.json)
                    }
                    is SocketEvent.PlayerLeft -> {
                        val playerId = event.json.optString("playerId")
                        val temporary = event.json.optBoolean("temporary")
                        if (!temporary) {
                            _uiState.update { s ->
                                s.copy(players = s.players.filter { it.playerId != playerId })
                            }
                        } else {
                            _uiState.update { s ->
                                s.copy(players = s.players.map {
                                    if (it.playerId == playerId) it.copy(connected = false) else it
                                })
                            }
                        }
                    }
                    is SocketEvent.PlayerKicked -> {
                        if (event.playerId == _uiState.value.myPlayerId) {
                            _uiState.update { it.copy(kickedOut = true) }
                        } else {
                            _uiState.update { s ->
                                s.copy(players = s.players.filter { it.playerId != event.playerId })
                            }
                        }
                    }
                    is SocketEvent.HostChanged -> {
                        val newHostId = event.newHostId
                        val myId = _uiState.value.myPlayerId
                        _uiState.update { s ->
                            s.copy(
                                isHost = newHostId == myId,
                                players = s.players.map { p ->
                                    p.copy(isHost = p.playerId == newHostId)
                                },
                                systemMessage = if (newHostId == myId) "You are now the host!" else null
                            )
                        }
                    }
                    is SocketEvent.CountdownStarted -> {
                        _uiState.update { it.copy(gameStarted = true) }
                    }
                    is SocketEvent.ServerError -> {
                        _uiState.update { it.copy(isLoading = false, error = event.message) }
                    }
                    is SocketEvent.ReconnectState -> handleRoomUpdate(event.json)
                    else -> {}
                }
            }
        }
    }

    private fun handleRoomUpdate(json: org.json.JSONObject) {
        val state = repo.parseRoomState(json) ?: return
        updateFromRoomState(state)
    }

    private fun updateFromRoomState(state: RoomState) {
        val myId = _uiState.value.myPlayerId
        val me = state.players.find { it.playerId == myId }
        _uiState.update { s ->
            s.copy(
                roomCode = state.roomCode,
                phase = state.phase,
                players = state.players,
                settings = state.settings,
                isHost = me?.isHost == true,
                canStart = me?.isHost == true && state.players.count { it.connected } >= 2
            )
        }
    }

    fun setRoomCode(code: String) {
        _uiState.update { it.copy(roomCode = code) }
    }

    fun toggleReady() {
        val roomCode = _uiState.value.roomCode
        val myId = _uiState.value.myPlayerId
        val me = _uiState.value.players.find { it.playerId == myId }
        repo.setReady(roomCode, !(me?.ready == true))
    }

    fun startGame() {
        repo.startGame(_uiState.value.roomCode)
        _uiState.update { it.copy(isLoading = true) }
    }

    fun kickPlayer(targetId: String) = repo.kickPlayer(_uiState.value.roomCode, targetId)
    fun mutePlayer(targetId: String) = repo.mutePlayer(_uiState.value.roomCode, targetId)
    fun banPlayer(targetId: String) = repo.banPlayer(_uiState.value.roomCode, targetId)

    fun leaveRoom() {
        repo.leaveRoom(_uiState.value.roomCode)
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
    fun clearSystemMessage() = _uiState.update { it.copy(systemMessage = null) }
}
