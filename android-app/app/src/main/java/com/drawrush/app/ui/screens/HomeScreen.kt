package com.drawrush.app.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalContext
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.CustomCredential
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.drawrush.app.BuildConfig
import com.drawrush.app.R
import com.drawrush.app.ui.theme.*
import com.drawrush.app.viewmodel.HomeViewModel

// Predefined avatar identifiers (colored emoji-style)
val AVATARS = listOf(
    "🦊", "🐼", "🦁", "🐯", "🐻", "🐸",
    "🦄", "🐙", "🦋", "🐬", "🦚", "🐧"
)

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun HomeScreen(
    onNavigateToLobby: (String) -> Unit,
    onNavigateToJoinRoom: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToHowToPlay: () -> Unit,
    onNavigateToFriends: () -> Unit,
    initialRoomCode: String? = null,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val prefs by viewModel.preferences.collectAsStateWithLifecycle(
        initialValue = com.drawrush.app.data.preferences.UserPreferences()
    )
    val keyboardController = LocalSoftwareKeyboardController.current
    val context = LocalContext.current

    var nickname by remember { mutableStateOf("") }
    var selectedAvatar by remember { mutableStateOf("🦊") }
    var showJoinDialog by remember { mutableStateOf(initialRoomCode != null) }
    var joinRoomCode by remember { mutableStateOf(initialRoomCode ?: "") }
    
    // Diagnostic State
    var showDiagnostics by remember { mutableStateOf(false) }
    var testResult by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    // Sync from preferences
    LaunchedEffect(prefs) {
        if (prefs.nickname.isNotBlank() && nickname.isBlank()) nickname = prefs.nickname
        if (prefs.avatar.isNotBlank()) selectedAvatar = prefs.avatar
    }

    // Navigation triggers
    LaunchedEffect(uiState.createdRoomCode) {
        uiState.createdRoomCode?.let { code ->
            viewModel.clearRoomNavigationState()
            onNavigateToLobby(code)
        }
    }

    LaunchedEffect(uiState.joinedRoomCode) {
        uiState.joinedRoomCode?.let { code ->
            viewModel.clearRoomNavigationState()
            onNavigateToLobby(code)
        }
    }

    // Main background gradient
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(DrPrimary, DrPrimaryDark, Color(0xFF2D1B8E))
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // ─── Logo ──────────────────────────────────────────────────────
            DrawRushLogo()

            Spacer(modifier = Modifier.height(8.dp))

            // ─── Profile Card or Google Sign In ────────────────────────────
            if (uiState.uniqueTag != null) {
                // Show Profile Card
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.15f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = uiState.avatarUrl ?: "👤",
                            fontSize = 48.sp,
                            modifier = Modifier
                                .size(64.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.2f))
                                .wrapContentSize(Alignment.Center)
                        )
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                uiState.nickname,
                                style = MaterialTheme.typography.titleLarge,
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                uiState.uniqueTag!!,
                                style = MaterialTheme.typography.bodyMedium,
                                color = DrAccent
                            )
                        }
                        IconButton(onClick = onNavigateToFriends) {
                            Icon(Icons.Default.People, "Friends", tint = Color.White)
                        }
                    }
                }
            } else {
                // ─── Avatar selector ──────────────────────────────────────────
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.15f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            "Choose Your Avatar",
                            style = MaterialTheme.typography.titleSmall,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        AvatarGrid(
                            avatars = AVATARS,
                            selected = selectedAvatar,
                            onSelect = {
                                selectedAvatar = it
                                viewModel.onAvatarChanged(it)
                            }
                        )
                    }
                }

                // ─── Nickname input ────────────────────────────────────────────
                OutlinedTextField(
                    value = nickname,
                    onValueChange = { if (it.length <= 20) nickname = it },
                    label = { Text("Nickname", color = Color.White.copy(alpha = 0.7f)) },
                    leadingIcon = {
                        Icon(Icons.Default.Person, null, tint = DrAccent)
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Words,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(onDone = { keyboardController?.hide() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = DrAccent,
                        unfocusedBorderColor = Color.White.copy(alpha = 0.4f),
                        cursorColor = DrAccent,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Nickname input field" },
                    supportingText = {
                        Text(
                            "${nickname.length}/20",
                            color = Color.White.copy(alpha = 0.5f),
                            fontSize = 11.sp
                        )
                    }
                )

                // Google Sign In Button
                Button(
                    onClick = {
                        if (BuildConfig.DEV_AUTH) {
                            viewModel.signInWithGoogle("dev:google-1234")
                        } else {
                            scope.launch {
                                try {
                                    val credentialManager = CredentialManager.create(context)
                                    val serverClientId = context.getString(R.string.default_web_client_id)
                                    val googleIdOption = GetGoogleIdOption.Builder()
                                        .setFilterByAuthorizedAccounts(false)
                                        .setServerClientId(serverClientId)
                                        .setAutoSelectEnabled(false)
                                        .build()

                                    val request = GetCredentialRequest.Builder()
                                        .addCredentialOption(googleIdOption)
                                        .build()

                                    val result = credentialManager.getCredential(request = request, context = context)
                                    val credential = result.credential
                                    if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                                        val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                                        viewModel.signInWithGoogle(googleIdTokenCredential.idToken)
                                    } else {
                                        viewModel.setError("Unsupported credential type")
                                    }
                                } catch (e: GetCredentialException) {
                                    viewModel.setError("Google Sign-In canceled or failed: ${e.message}")
                                } catch (e: Exception) {
                                    viewModel.setError("Google Sign-In error: ${e.message}")
                                }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.Black),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text(
                        if (BuildConfig.DEV_AUTH) "Sign in with Google (Dev)" else "Sign in with Google",
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // ─── Create Room button ────────────────────────────────────────
            DrushButton(
                text = "Create Room",
                icon = Icons.Default.Add,
                onClick = { viewModel.createRoom(nickname, selectedAvatar) },
                enabled = !uiState.isLoading,
                containerColor = DrAccent,
                contentColor = DrOnBackground,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Create a new room" }
            )

            // ─── Join Room button ──────────────────────────────────────────
            DrushButton(
                text = "Join Room",
                icon = Icons.Default.Login,
                onClick = { showJoinDialog = true },
                containerColor = DrSecondary,
                contentColor = Color.White,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Join an existing room" }
            )

            // ─── Row: How To Play + Settings ───────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = onNavigateToHowToPlay,
                    modifier = Modifier.weight(1f),
                    border = BorderStroke(1.5.dp, Color.White.copy(alpha = 0.5f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                ) {
                    Icon(Icons.Outlined.Help, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("How To Play")
                }
                OutlinedButton(
                    onClick = onNavigateToSettings,
                    modifier = Modifier.weight(1f),
                    border = BorderStroke(1.5.dp, Color.White.copy(alpha = 0.5f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                ) {
                    Icon(Icons.Default.Settings, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Settings")
                }
            }

            // Connection status
            AnimatedVisibility(!uiState.isConnected && uiState.isAuthenticated) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        color = DrAccent,
                        strokeWidth = 2.dp
                    )
                    Text("Connecting...", color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                }
            }

            // ─── Diagnostic Mode Toggle ───────────────────────────────
            TextButton(onClick = { showDiagnostics = !showDiagnostics }) {
                Text("Toggle Diagnostic Mode", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
            }
            
            if (showDiagnostics) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.Black.copy(alpha = 0.6f)),
                    modifier = Modifier.fillMaxWidth().padding(8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("SERVER URL: ${com.drawrush.app.BuildConfig.BACKEND_URL}", color = Color.Green, fontSize = 10.sp)
                        Text("SOCKET PATH: /socket.io/", color = Color.Green, fontSize = 10.sp)
                        Text("CONNECTION STATUS: ${if (uiState.isConnected) "CONNECTED" else "DISCONNECTED"}", color = Color.Green, fontSize = 10.sp)
                        Text("LAST CONNECTION ERROR: ${uiState.error ?: "NONE"}", color = Color.Green, fontSize = 10.sp)
                        Text("TRANSPORT: polling -> websocket", color = Color.Green, fontSize = 10.sp)
                        Text("SERVER REACHABLE: ${testResult ?: "UNKNOWN (Tap Test)"}", color = Color.Green, fontSize = 10.sp)
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        Button(
                            onClick = {
                                scope.launch(Dispatchers.IO) {
                                    try {
                                        val url = URL("${com.drawrush.app.BuildConfig.BACKEND_URL}/health")
                                        val conn = url.openConnection() as HttpURLConnection
                                        conn.requestMethod = "GET"
                                        conn.connectTimeout = 3000
                                        conn.readTimeout = 3000
                                        val code = conn.responseCode
                                        withContext(Dispatchers.Main) {
                                            if (code == 200) testResult = "YES (HTTP 200)"
                                            else testResult = "NO (HTTP $code)"
                                        }
                                    } catch (e: Exception) {
                                        withContext(Dispatchers.Main) {
                                            testResult = "NO (${e.message})"
                                        }
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)
                        ) {
                            Text("Test Server Connection", color = Color.White)
                        }
                    }
                }
            }
        }

        // Loading overlay
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = DrAccent)
            }
        }

        // Error snackbar
        uiState.error?.let { error ->
            Snackbar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(16.dp),
                action = {
                    TextButton(onClick = viewModel::clearError) {
                        Text("OK", color = DrAccent)
                    }
                },
                containerColor = DrDanger
            ) {
                Text(error, color = Color.White)
            }
        }
    }

    // ─── Join Room dialog ──────────────────────────────────────────────────
    if (showJoinDialog) {
        AlertDialog(
            onDismissRequest = { showJoinDialog = false },
            title = { Text("Join Room", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = joinRoomCode,
                        onValueChange = { joinRoomCode = it.uppercase().take(10) },
                        label = { Text("Room Code") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Room code input" }
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.joinRoom(joinRoomCode, nickname, selectedAvatar)
                        showJoinDialog = false
                    },
                    enabled = joinRoomCode.isNotBlank()
                ) {
                    Text("Join")
                }
            },
            dismissButton = {
                TextButton(onClick = { showJoinDialog = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun DrawRushLogo() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // Logo icon — paint brush + canvas + chat bubble
        Box(
            modifier = Modifier
                .size(100.dp)
                .background(
                    Brush.radialGradient(listOf(DrAccent.copy(0.3f), Color.Transparent)),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Text("🎨", fontSize = 56.sp)
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            "DrawRush",
            style = MaterialTheme.typography.displayMedium,
            color = Color.White,
            fontWeight = FontWeight.Black
        )
        Text(
            "Draw • Guess • Win!",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.7f)
        )
    }
}

@Composable
private fun AvatarGrid(
    avatars: List<String>,
    selected: String,
    onSelect: (String) -> Unit
) {
    val rows = avatars.chunked(6)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row.forEach { avatar ->
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(CircleShape)
                            .background(
                                if (avatar == selected) DrAccent.copy(alpha = 0.4f)
                                else Color.White.copy(alpha = 0.1f)
                            )
                            .border(
                                if (avatar == selected) BorderStroke(2.dp, DrAccent)
                                else BorderStroke(0.dp, Color.Transparent),
                                CircleShape
                            )
                            .clickable { onSelect(avatar) }
                            .semantics { contentDescription = "Avatar $avatar" },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(avatar, fontSize = 22.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun DrushButton(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    onClick: () -> Unit,
    enabled: Boolean = true,
    containerColor: Color = DrPrimary,
    contentColor: Color = Color.White,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.5f)
        ),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier.height(56.dp),
        elevation = ButtonDefaults.buttonElevation(4.dp, 8.dp)
    ) {
        icon?.let {
            Icon(it, null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = MaterialTheme.typography.titleMedium)
    }
}
