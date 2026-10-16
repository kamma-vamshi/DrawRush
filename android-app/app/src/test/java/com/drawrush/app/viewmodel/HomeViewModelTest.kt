package com.drawrush.app.viewmodel

import com.drawrush.app.data.preferences.UserPreferences
import com.drawrush.app.data.repository.GameRepository
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {

    private lateinit var repo: GameRepository
    private val connectedFlow = MutableStateFlow(true)
    private val serverPlayerIdFlow = MutableStateFlow<String?>("test-player-id")

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        repo = mockk(relaxed = true)
        every { repo.connected } returns connectedFlow
        every { repo.socketEvents } returns MutableSharedFlow()
        every { repo.serverPlayerId } returns serverPlayerIdFlow
        every { repo.getPreferences() } returns flowOf(UserPreferences())
    }

    @Test
    fun `setError updates error message and clears loading`() = runTest {
        val viewModel = HomeViewModel(repo)
        
        viewModel.setError("Google Sign-In canceled")
        
        assertEquals("Google Sign-In canceled", viewModel.uiState.value.error)
        assertFalse(viewModel.uiState.value.isLoading)
        
        viewModel.clearError()
        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun `avatar and nickname updates update uiState`() = runTest {
        val viewModel = HomeViewModel(repo)
        
        viewModel.onNicknameChanged("SpeedyArtist")
        assertEquals("SpeedyArtist", viewModel.uiState.value.nickname)
        
        viewModel.onAvatarChanged("🦁")
        assertEquals("🦁", viewModel.uiState.value.avatar)
    }

    @Test
    fun `createRoom with empty nickname sets error`() = runTest {
        val viewModel = HomeViewModel(repo)
        
        viewModel.createRoom("", "🦁")
        assertEquals("Please enter a nickname", viewModel.uiState.value.error)
    }

    @Test
    fun `joinRoom with empty roomCode sets error`() = runTest {
        val viewModel = HomeViewModel(repo)
        
        viewModel.joinRoom("", "SpeedyArtist", "🦁")
        assertEquals("Please enter a room code", viewModel.uiState.value.error)
    }
}
