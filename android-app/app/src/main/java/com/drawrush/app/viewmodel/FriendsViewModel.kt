package com.drawrush.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drawrush.app.data.network.SocketEvent
import com.drawrush.app.data.repository.GameRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

data class Friend(
    val id: String,
    val tag: String,
    val name: String,
    val avatar: String,
    val isOnline: Boolean = false // Future feature
)

data class FriendRequest(
    val id: String,
    val senderId: String? = null,
    val receiverId: String? = null,
    val tag: String,
    val name: String,
    val avatar: String
)

data class FriendsUiState(
    val isLoading: Boolean = false,
    val friends: List<Friend> = emptyList(),
    val sentRequests: List<FriendRequest> = emptyList(),
    val incomingRequests: List<FriendRequest> = emptyList(),
    val error: String? = null,
    val addFriendInput: String = ""
)

@HiltViewModel
class FriendsViewModel @Inject constructor(
    private val repo: GameRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FriendsUiState())
    val uiState: StateFlow<FriendsUiState> = _uiState.asStateFlow()

    init {
        observeEvents()
        fetchFriends()
    }

    private fun observeEvents() {
        viewModelScope.launch {
            repo.socketEvents.collect { event ->
                // To keep it simple, we will just re-fetch friends list on any friend-related event
                when (event) {
                    is SocketEvent.Connected -> fetchFriends()
                    is SocketEvent.FriendsList -> {
                        val friendsArray = event.json.optJSONArray("friends")
                        val sentArray = event.json.optJSONArray("sentRequests")
                        val incomingArray = event.json.optJSONArray("incomingRequests")
                        
                        val parsedFriends = mutableListOf<Friend>()
                        if (friendsArray != null) {
                            for (i in 0 until friendsArray.length()) {
                                val obj = friendsArray.getJSONObject(i)
                                parsedFriends.add(Friend(obj.getString("id"), obj.getString("tag"), obj.getString("name"), obj.getString("avatar")))
                            }
                        }
                        
                        val parsedSent = mutableListOf<FriendRequest>()
                        if (sentArray != null) {
                            for (i in 0 until sentArray.length()) {
                                val obj = sentArray.getJSONObject(i)
                                parsedSent.add(FriendRequest(obj.getString("id"), tag = obj.getString("tag"), name = obj.getString("name"), avatar = obj.getString("avatar")))
                            }
                        }
                        
                        val parsedIncoming = mutableListOf<FriendRequest>()
                        if (incomingArray != null) {
                            for (i in 0 until incomingArray.length()) {
                                val obj = incomingArray.getJSONObject(i)
                                parsedIncoming.add(FriendRequest(obj.getString("id"), tag = obj.getString("tag"), name = obj.getString("name"), avatar = obj.getString("avatar")))
                            }
                        }
                        
                        _uiState.update { it.copy(isLoading = false, friends = parsedFriends, sentRequests = parsedSent, incomingRequests = parsedIncoming) }
                    }
                    else -> {}
                }
            }
        }
    }

    fun fetchFriends() {
        _uiState.update { it.copy(isLoading = true) }
        repo.emitEvent("getFriends")
    }

    fun addFriend(tag: String) {
        if (tag.isBlank()) return
        repo.emitEvent("addFriend", JSONObject().apply { put("targetTag", tag) })
        _uiState.update { it.copy(addFriendInput = "") }
    }

    fun acceptFriend(requestId: String) {
        repo.emitEvent("acceptFriend", JSONObject().apply { put("requestId", requestId) })
    }

    fun rejectFriend(requestId: String) {
        repo.emitEvent("rejectFriend", JSONObject().apply { put("requestId", requestId) })
    }

    fun cancelRequest(requestId: String) {
        repo.emitEvent("cancelFriendRequest", JSONObject().apply { put("requestId", requestId) })
    }

    fun removeFriend(friendId: String) {
        repo.emitEvent("removeFriend", JSONObject().apply { put("friendId", friendId) })
    }

    fun updateAddFriendInput(input: String) {
        _uiState.update { it.copy(addFriendInput = input) }
    }
}
