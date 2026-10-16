package com.drawrush.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drawrush.app.data.model.GamePhase
import com.drawrush.app.data.model.PlayerState
import com.drawrush.app.ui.theme.*
import com.drawrush.app.viewmodel.LobbyViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LobbyScreen(
    roomCode: String,
    onNavigateToGame: () -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: LobbyViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(roomCode) { viewModel.setRoomCode(roomCode) }

    LaunchedEffect(uiState.gameStarted) {
        if (uiState.gameStarted) onNavigateToGame()
    }

    LaunchedEffect(uiState.kickedOut) {
        if (uiState.kickedOut) onNavigateBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Room: $roomCode",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        viewModel.leaveRoom()
                        onNavigateBack()
                    }) {
                        Icon(Icons.Default.ArrowBack, "Leave room")
                    }
                },
                actions = {
                    // Share room code
                    IconButton(
                        onClick = { shareRoom(context, roomCode) },
                        modifier = Modifier.semantics { contentDescription = "Share room" }
                    ) {
                        Icon(Icons.Default.Share, "Share")
                    }
                    // Copy room code
                    IconButton(
                        onClick = { copyToClipboard(context, roomCode) },
                        modifier = Modifier.semantics { contentDescription = "Copy room code" }
                    ) {
                        Icon(Icons.Default.ContentCopy, "Copy code")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DrPrimary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(DrBackground)
        ) {
            // ─── Room code banner ─────────────────────────────────────────
            Surface(
                color = DrPrimaryDark,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Room Code: ",
                        color = Color.White.copy(alpha = 0.8f),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        roomCode,
                        color = DrAccent,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 4.sp
                    )
                }
            }

            // ─── Settings summary ─────────────────────────────────────────
            SettingsSummary(
                rounds = uiState.settings.rounds,
                drawingTimeSec = uiState.settings.drawingTimeSec,
                maxPlayers = uiState.settings.maxPlayers,
                playerCount = uiState.players.size
            )

            // ─── Player list ──────────────────────────────────────────────
            Text(
                "Players (${uiState.players.size}/${uiState.settings.maxPlayers})",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )

            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.players, key = { it.playerId }) { player ->
                    PlayerRow(
                        player = player,
                        isMe = player.playerId == uiState.myPlayerId,
                        amHost = uiState.isHost,
                        onKick = { viewModel.kickPlayer(player.playerId) },
                        onMute = { viewModel.mutePlayer(player.playerId) },
                        onBan = { viewModel.banPlayer(player.playerId) }
                    )
                }
            }

            // ─── Bottom actions ───────────────────────────────────────────
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DrSurface)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (uiState.isHost) {
                    Button(
                        onClick = { viewModel.startGame() },
                        enabled = uiState.canStart && !uiState.isLoading,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = DrSecondary),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
                        } else {
                            Icon(Icons.Default.PlayArrow, null)
                            Spacer(Modifier.width(8.dp))
                            Text("Start Game", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                    if (!uiState.canStart) {
                        Text(
                            "Need at least 2 players to start",
                            style = MaterialTheme.typography.bodySmall,
                            color = DrSubtext,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                } else {
                    // Ready toggle
                    val me = uiState.players.find { it.playerId == uiState.myPlayerId }
                    OutlinedButton(
                        onClick = { viewModel.toggleReady() },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = if (me?.ready == true) DrSecondary else DrSubtext
                        ),
                        border = BorderStroke(2.dp, if (me?.ready == true) DrSecondary else DrCanvasBorder)
                    ) {
                        Icon(
                            if (me?.ready == true) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                            null,
                            tint = if (me?.ready == true) DrSecondary else DrSubtext
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(if (me?.ready == true) "Ready!" else "Click when ready")
                    }
                    Text(
                        "Waiting for the host to start the game...",
                        style = MaterialTheme.typography.bodySmall,
                        color = DrSubtext,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        // Error
        uiState.error?.let {
            LaunchedEffect(it) {
                // Could show SnackBar here
            }
        }
    }
}

@Composable
private fun SettingsSummary(
    rounds: Int, drawingTimeSec: Int, maxPlayers: Int, playerCount: Int
) {
    Surface(
        color = DrSurfaceVariant,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            SettingChip("Rounds", "$rounds")
            SettingChip("Draw Time", "${drawingTimeSec}s")
            SettingChip("Players", "$playerCount/$maxPlayers")
        }
    }
}

@Composable
private fun SettingChip(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, color = DrPrimary, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = DrSubtext)
    }
}

@Composable
private fun PlayerRow(
    player: PlayerState,
    isMe: Boolean,
    amHost: Boolean,
    onKick: () -> Unit,
    onMute: () -> Unit,
    onBan: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isMe) DrPrimary.copy(alpha = 0.08f) else DrSurface
        ),
        border = if (isMe) BorderStroke(1.5.dp, DrPrimary.copy(alpha = 0.3f)) else null,
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Player ${player.nickname}" }
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Avatar
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(DrPrimary.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(player.avatar, fontSize = 24.sp)
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        player.nickname + if (isMe) " (You)" else "",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (isMe) FontWeight.Bold else FontWeight.Medium
                    )
                    if (player.isHost) {
                        Surface(
                            color = DrAccent.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                "HOST",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = DrAccentDark,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    if (player.isMuted) {
                        Icon(Icons.Default.VolumeOff, "Muted", tint = DrDanger, modifier = Modifier.size(14.dp))
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(
                                if (player.connected) DrSecondary else DrDanger,
                                CircleShape
                            )
                    )
                    Text(
                        if (player.connected) "Connected" else "Disconnected",
                        style = MaterialTheme.typography.bodySmall,
                        color = DrSubtext
                    )
                    if (player.ready) {
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Default.CheckCircle, "Ready", tint = DrSecondary, modifier = Modifier.size(14.dp))
                    }
                }
            }

            // Score
            Text(
                "${player.score}",
                style = MaterialTheme.typography.titleMedium,
                color = DrPrimary,
                fontWeight = FontWeight.Bold
            )

            // Host actions
            if (amHost && !isMe) {
                Box {
                    IconButton(onClick = { showMenu = true }) {
                        Icon(Icons.Default.MoreVert, "Player options")
                    }
                    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                        DropdownMenuItem(
                            text = { Text("Kick") },
                            leadingIcon = { Icon(Icons.Default.PersonRemove, null, tint = DrDanger) },
                            onClick = { onKick(); showMenu = false }
                        )
                        DropdownMenuItem(
                            text = { Text(if (player.isMuted) "Unmute" else "Mute") },
                            leadingIcon = { Icon(Icons.Default.VolumeOff, null) },
                            onClick = { onMute(); showMenu = false }
                        )
                        DropdownMenuItem(
                            text = { Text("Ban", color = DrDanger) },
                            leadingIcon = { Icon(Icons.Default.Block, null, tint = DrDanger) },
                            onClick = { onBan(); showMenu = false }
                        )
                    }
                }
            }
        }
    }
}

private fun shareRoom(context: Context, roomCode: String) {
    val text = "Join my DrawRush game!\nRoom: $roomCode\ndrawrush://room/$roomCode"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share Room Code"))
}

private fun copyToClipboard(context: Context, roomCode: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("DrawRush Room Code", roomCode))
}
