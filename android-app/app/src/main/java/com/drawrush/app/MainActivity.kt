package com.drawrush.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drawrush.app.data.preferences.UserPreferences
import com.drawrush.app.data.preferences.UserPreferencesRepository
import com.drawrush.app.ui.screens.*
import com.drawrush.app.ui.theme.DrawRushTheme
import com.drawrush.app.ui.theme.DrBackground
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

object Routes {
    const val HOME = "home"
    const val LOBBY = "lobby/{roomCode}"
    const val GAME = "game/{roomCode}"
    const val RESULTS = "results"
    const val HOW_TO_PLAY = "how_to_play"
    const val SETTINGS = "settings"
    const val FRIENDS = "friends"

    fun lobby(code: String) = "lobby/$code"
    fun game(code: String) = "game/$code"
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var prefsRepo: UserPreferencesRepository

    private var deepLinkRoomCode: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Extract room code from deep link
        deepLinkRoomCode = extractRoomCodeFromIntent(intent)

        setContent {
            DrawRushTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = DrBackground) {
                    DrawRushNavGraph(initialRoomCode = deepLinkRoomCode, prefsRepo = prefsRepo)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Handle deep link when app is already open
        deepLinkRoomCode = extractRoomCodeFromIntent(intent)
    }

    private fun extractRoomCodeFromIntent(intent: Intent?): String? {
        val data = intent?.data ?: return null
        return when {
            data.scheme == "drawrush" && data.host == "room" ->
                data.lastPathSegment?.uppercase()
            data.scheme == "https" && data.pathSegments.contains("room") ->
                data.lastPathSegment?.uppercase()
            else -> null
        }
    }
}

@Composable
fun DrawRushNavGraph(
    initialRoomCode: String? = null,
    prefsRepo: UserPreferencesRepository? = null
) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    var currentRoomCode by remember { mutableStateOf("") }
    
    val defaultPrefs = UserPreferences()
    val prefsState = prefsRepo?.preferences?.collectAsStateWithLifecycle(initialValue = defaultPrefs)
    val prefs = prefsState?.value ?: defaultPrefs

    NavHost(
        navController = navController,
        startDestination = Routes.HOME
    ) {
        // ─── Home ───────────────────────────────────────────────────────────
        composable(
            route = Routes.HOME,
            deepLinks = listOf(
                navDeepLink { uriPattern = "drawrush://room/{roomCode}" },
                navDeepLink { uriPattern = "https://drawrush.app/room/{roomCode}" }
            )
        ) { backStackEntry ->
            val deepCode = backStackEntry.arguments?.getString("roomCode")
                ?: initialRoomCode
            HomeScreen(
                onNavigateToLobby = { code ->
                    currentRoomCode = code
                    navController.navigate(Routes.lobby(code))
                },
                onNavigateToJoinRoom = {
                    // Join dialog is built into HomeScreen
                },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                onNavigateToHowToPlay = { navController.navigate(Routes.HOW_TO_PLAY) },
                onNavigateToFriends = { navController.navigate(Routes.FRIENDS) },
                initialRoomCode = deepCode
            )
        }

        // ─── Lobby ──────────────────────────────────────────────────────────
        composable(
            route = Routes.LOBBY,
            arguments = listOf(navArgument("roomCode") { type = NavType.StringType })
        ) { backStackEntry ->
            val code = backStackEntry.arguments?.getString("roomCode") ?: ""
            currentRoomCode = code
            LobbyScreen(
                roomCode = code,
                onNavigateToGame = {
                    navController.navigate(Routes.game(code)) {
                        launchSingleTop = true
                    }
                },
                onNavigateBack = {
                    navController.popBackStack(Routes.HOME, inclusive = false)
                }
            )
        }

        // ─── Game ───────────────────────────────────────────────────────────
        composable(
            route = Routes.GAME,
            arguments = listOf(navArgument("roomCode") { type = NavType.StringType })
        ) { backStackEntry ->
            val code = backStackEntry.arguments?.getString("roomCode") ?: currentRoomCode
            GameScreen(
                roomCode = code,
                onNavigateToResults = {
                    navController.navigate(Routes.RESULTS) {
                        launchSingleTop = true
                    }
                },
                onNavigateBack = {
                    navController.popBackStack(Routes.HOME, inclusive = false)
                }
            )
        }

        // ─── Results ────────────────────────────────────────────────────────
        composable(Routes.RESULTS) {
            ResultsScreen(
                onPlayAgain = {
                    // Return to lobby with same room code
                    navController.navigate(Routes.lobby(currentRoomCode)) {
                        popUpTo(Routes.HOME) { inclusive = false }
                    }
                },
                onReturnToLobby = {
                    navController.navigate(Routes.lobby(currentRoomCode)) {
                        popUpTo(Routes.HOME) { inclusive = false }
                    }
                }
            )
        }

        // ─── How To Play ─────────────────────────────────────────────────────
        composable(Routes.HOW_TO_PLAY) {
            HowToPlayScreen(onBack = { navController.popBackStack() })
        }

        // ─── Settings ────────────────────────────────────────────────────────
        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                soundEnabled = prefs.soundEnabled,
                hapticsEnabled = prefs.hapticsEnabled,
                serverUrl = prefs.serverUrl,
                onSoundChanged = { sound ->
                    prefsRepo?.let { scope.launch { it.updateSoundEnabled(sound) } }
                },
                onHapticsChanged = { haptic ->
                    prefsRepo?.let { scope.launch { it.updateHapticsEnabled(haptic) } }
                },
                onServerUrlChanged = { url ->
                    prefsRepo?.let { scope.launch { it.updateServerUrl(url) } }
                }
            )
        }

        // ─── Friends ────────────────────────────────────────────────────────
        composable(Routes.FRIENDS) {
            FriendsScreen(onNavigateBack = { navController.popBackStack() })
        }
    }
}
