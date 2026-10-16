package com.drawrush.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drawrush.app.data.model.GamePhase
import com.drawrush.app.data.model.RoomSettings
import com.drawrush.app.data.network.SocketEvent
import com.drawrush.app.data.preferences.UserPreferences
import com.drawrush.app.data.repository.GameRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val isConnected: Boolean = false,
    val nickname: String = "",
    val avatar: String = "avatar_01",
    val error: String? = null,
    val createdRoomCode: String? = null,
    val joinedRoomCode: String? = null,
    val uniqueTag: String? = null,
    val avatarUrl: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repo: GameRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    val preferences: Flow<UserPreferences> = repo.getPreferences()

    init {
        observeEvents()
        observeConnection()
        authenticateIfNeeded()
    }

    private fun observeConnection() {
        viewModelScope.launch {
            repo.connected.collect { connected ->
                _uiState.update { it.copy(isConnected = connected) }
            }
        }
    }

    private fun observeEvents() {
        viewModelScope.launch {
            repo.socketEvents.collect { event ->
                when (event) {
                    is SocketEvent.RoomCreated -> {
                        val code = event.json.optString("roomCode")
                        _uiState.update { it.copy(isLoading = false, createdRoomCode = code) }
                    }
                    is SocketEvent.RoomUpdated -> {
                        // Joined an existing room
                        val code = event.json.optString("roomCode")
                        _uiState.update { it.copy(isLoading = false, joinedRoomCode = code) }
                    }
                    is SocketEvent.ServerError -> {
                        _uiState.update { it.copy(isLoading = false, error = event.message) }
                    }
                    is SocketEvent.Connected -> {
                        _uiState.update { it.copy(isConnected = true) }
                    }
                    is SocketEvent.ConnectError -> {
                        _uiState.update { it.copy(isLoading = false, error = "Connection failed: ${event.message}") }
                    }
                    is SocketEvent.UserProfile -> {
                        val uniqueTag = event.json.optString("uniqueTag")
                        val avatarUrl = event.json.optString("avatarUrl")
                        val displayName = event.json.optString("displayName")
                        val id = event.json.optString("id")
                        if (id.isNotEmpty()) repo.serverPlayerId.value = id
                        _uiState.update { it.copy(uniqueTag = uniqueTag, avatarUrl = avatarUrl, nickname = displayName.ifEmpty { it.nickname }) }
                    }
                    else -> {}
                }
            }
        }
    }

    fun authenticateIfNeeded() {
        if (repo.currentUser != null) {
            _uiState.update { it.copy(isAuthenticated = true) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val result = repo.signInAnonymously()
            if (result.isSuccess) {
                _uiState.update { it.copy(isAuthenticated = true, isLoading = false) }
            } else {
                _uiState.update { it.copy(isLoading = false, error = "Authentication failed. Check your internet connection.") }
            }
        }
    }

    fun signInWithGoogle(idToken: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val result = repo.signInWithGoogle(idToken)
            if (result.isSuccess) {
                _uiState.update { it.copy(isAuthenticated = true, isLoading = false) }
                ensureConnected()
            } else {
                _uiState.update { it.copy(isLoading = false, error = "Google Sign-In failed.") }
            }
        }
    }

    fun onNicknameChanged(nickname: String) {
        viewModelScope.launch { repo.saveNickname(nickname) }
        _uiState.update { it.copy(nickname = nickname) }
    }

    fun onAvatarChanged(avatar: String) {
        viewModelScope.launch { repo.saveAvatar(avatar) }
        _uiState.update { it.copy(avatar = avatar) }
    }

    fun createRoom(nickname: String, avatar: String, settings: RoomSettings? = null) {
        if (nickname.isBlank()) {
            _uiState.update { it.copy(error = "Please enter a nickname") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            ensureConnected()
            repo.createRoom(nickname.trim(), avatar, settings)
        }
    }

    fun joinRoom(roomCode: String, nickname: String, avatar: String) {
        if (nickname.isBlank()) {
            _uiState.update { it.copy(error = "Please enter a nickname") }
            return
        }
        if (roomCode.isBlank()) {
            _uiState.update { it.copy(error = "Please enter a room code") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            ensureConnected()
            repo.joinRoom(roomCode.uppercase().trim(), nickname.trim(), avatar)
        }
    }

    private suspend fun ensureConnected() {
        if (!repo.connected.value) {
            repo.connectToServer()
        }
    }

    fun setError(msg: String) = _uiState.update { it.copy(error = msg, isLoading = false) }
    fun clearError() = _uiState.update { it.copy(error = null) }
    fun clearRoomNavigationState() = _uiState.update { it.copy(createdRoomCode = null, joinedRoomCode = null) }
}
