package com.drawrush.app.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drawrush.app.data.model.*
import com.drawrush.app.ui.components.DrawingCanvas
import com.drawrush.app.ui.theme.*
import com.drawrush.app.viewmodel.GameViewModel
import com.drawrush.app.viewmodel.Stroke as StrokeVM
import kotlinx.coroutines.delay

// Available drawing colors for the palette
private val PALETTE_COLORS = listOf(
    "#2D3436", "#FFFFFF", "#FF7675", "#6C5CE7",
    "#00B894", "#FDCA40", "#0984E3", "#E17055",
    "#B2BEC3", "#FD79A8", "#00CEC9", "#A29BFE",
)

@Composable
fun GameScreen(
    roomCode: String,
    onNavigateToResults: () -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: GameViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(roomCode) {
        viewModel.setRoomCode(roomCode)
    }

    LaunchedEffect(uiState.phase) {
        if (uiState.phase == GamePhase.GAME_RESULT) onNavigateToResults()
    }

    Box(modifier = Modifier.fillMaxSize().background(DrBackground)) {
        when (uiState.phase) {
            GamePhase.COUNTDOWN -> CountdownOverlay(uiState.countdownEndsAt, uiState.serverTimeDelta)
            GamePhase.WORD_SELECTION -> {
                if (uiState.wordChoices.isNotEmpty()) {
                    WordSelectionDialog(
                        choices = uiState.wordChoices,
                        deadline = uiState.selectionDeadline ?: 0L,
                        serverTimeDelta = uiState.serverTimeDelta,
                        onSelect = viewModel::selectWord
                    )
                } else {
                    WaitingForArtistOverlay(
                        artistName = uiState.players.find { it.playerId == uiState.currentArtistId }?.nickname ?: "Artist"
                    )
                }
            }
            GamePhase.DRAWING -> DrawingPhaseContent(uiState, viewModel)
            GamePhase.ROUND_RESULT -> {
                uiState.roundResult?.let { result ->
                    RoundResultOverlay(
                        result = result,
                        players = uiState.players,
                        onDismiss = { /* auto-dismissed by server */ }
                    )
                }
            }
            GamePhase.LOBBY, GamePhase.NEXT_ROUND -> WaitingForNextRound()
            else -> {}
        }
    }
}

@Composable
private fun DrawingPhaseContent(
    uiState: com.drawrush.app.viewmodel.GameUiState,
    viewModel: GameViewModel
) {
    val keyboardController = LocalSoftwareKeyboardController.current

    Column(modifier = Modifier.fillMaxSize()) {
        // ─── Header: round info + timer ───────────────────────────────────
        GameHeader(
            roundNumber = uiState.currentRound,
            totalRounds = uiState.totalRounds,
            roundEndTimestamp = uiState.roundEndTimestamp,
            serverTimeDelta = uiState.serverTimeDelta,
            wordPattern = uiState.wordPattern,
            wordLength = uiState.wordLength,
            artistName = uiState.players.find { it.playerId == uiState.currentArtistId }?.nickname,
            isArtist = uiState.isArtist
        )

        // ─── Drawing canvas ───────────────────────────────────────────────
        DrawingCanvas(
            localStrokes = uiState.strokes,
            remoteStrokes = uiState.remoteStrokes,
            isArtist = uiState.isArtist,
            onPointerDown = viewModel::onPointerDown,
            onPointerMove = viewModel::onPointerMove,
            onPointerUp = viewModel::onPointerUp,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(8.dp)
                .clip(RoundedCornerShape(12.dp))
                .border(1.5.dp, DrCanvasBorder, RoundedCornerShape(12.dp))
        )

        // ─── Drawing tools (artist only) ──────────────────────────────────
        if (uiState.isArtist) {
            DrawingToolbar(
                drawingTool = uiState.drawingTool,
                onColorSelect = viewModel::setColor,
                onWidthChange = viewModel::setBrushWidth,
                onToolChange = viewModel::setTool,
                onClear = viewModel::clearCanvas,
                onUndo = viewModel::undoStroke
            )
        }

        // ─── Chat + Guess input ───────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(0.5f)
                .background(DrChatBg)
        ) {
            // Chat history
            val chatListState = rememberLazyListState()
            val allMessages = uiState.chatMessages + uiState.systemMessages.map { msg ->
                com.drawrush.app.data.model.ChatMessage(
                    id = msg, playerId = "", nickname = "System",
                    text = msg, isCorrectGuess = false, timestamp = 0L
                )
            }
            LaunchedEffect(allMessages.size) {
                if (allMessages.isNotEmpty()) chatListState.animateScrollToItem(allMessages.size - 1)
            }
            LazyColumn(
                state = chatListState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
                contentPadding = PaddingValues(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                items(allMessages, key = { it.id }) { msg ->
                    ChatBubble(msg, myPlayerId = uiState.myPlayerId)
                }
            }

            // Guess/chat input
            if (!uiState.isArtist && !(uiState.players.find { it.playerId == uiState.myPlayerId }?.hasGuessedCurrentWord == true)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = uiState.guessInput,
                        onValueChange = viewModel::onGuessInputChanged,
                        placeholder = { Text("Type your guess…", color = DrSubtext) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = {
                            viewModel.submitGuess()
                            keyboardController?.hide()
                        }),
                        modifier = Modifier
                            .weight(1f)
                            .semantics { contentDescription = "Guess input" },
                        shape = RoundedCornerShape(24.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = DrPrimary
                        )
                    )
                    IconButton(
                        onClick = { viewModel.submitGuess(); keyboardController?.hide() },
                        modifier = Modifier
                            .background(DrPrimary, CircleShape)
                            .size(48.dp)
                    ) {
                        Icon(Icons.Default.Send, "Submit guess", tint = Color.White)
                    }
                }
            } else if (!uiState.isArtist) {
                // Already guessed correctly
                Box(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("🎉 You guessed correctly!", color = DrCorrectGreen, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    // Correct guess feedback overlay
    uiState.guessResult?.let { (correct, points) ->
        LaunchedEffect(uiState.guessResult) {
            delay(2000)
            viewModel.clearGuessResult()
        }
        Box(
            modifier = Modifier.fillMaxSize().background(
                if (correct) DrCorrectGreen.copy(alpha = 0.8f) else DrWrongRed.copy(alpha = 0.7f)
            ),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (correct) "✅ Correct!" else "❌ Wrong!", fontSize = 36.sp, color = Color.White, fontWeight = FontWeight.Black)
                if (correct) Text("+$points pts", fontSize = 24.sp, color = Color.White)
            }
        }
    }
}

@Composable
private fun GameHeader(
    roundNumber: Int, totalRounds: Int,
    roundEndTimestamp: Long?, serverTimeDelta: Long,
    wordPattern: String?, wordLength: Int?,
    artistName: String?, isArtist: Boolean
) {
    var remainingMs by remember { mutableStateOf(0L) }

    LaunchedEffect(roundEndTimestamp) {
        while (true) {
            val now = System.currentTimeMillis() + serverTimeDelta
            remainingMs = maxOf(0L, (roundEndTimestamp ?: 0L) - now)
            delay(250)
        }
    }

    val remainingSec = (remainingMs / 1000).toInt()
    val timerColor = when {
        remainingSec > 30 -> DrSecondary
        remainingSec > 10 -> DrAccent
        else -> DrDanger
    }

    Surface(
        color = DrPrimary,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Round $roundNumber/$totalRounds",
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodyMedium
                )
                // Timer
                Box(
                    modifier = Modifier
                        .background(timerColor, RoundedCornerShape(20.dp))
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                ) {
                    Text(
                        "$remainingSec",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.semantics { contentDescription = "Time remaining: $remainingSec seconds" }
                    )
                }
                Text(
                    if (isArtist) "You're drawing!" else "🎨 ${artistName ?: ""}",
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            // Word pattern / word display
            Spacer(Modifier.height(8.dp))
            Text(
                text = wordPattern ?: wordLength?.let { "_ ".repeat(it).trim() } ?: "",
                color = Color.White,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                letterSpacing = 4.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Word pattern: ${wordPattern ?: "unknown"}" }
            )
        }
    }
}

@Composable
private fun DrawingToolbar(
    drawingTool: com.drawrush.app.viewmodel.DrawingToolState,
    onColorSelect: (String) -> Unit,
    onWidthChange: (Float) -> Unit,
    onToolChange: (DrawTool) -> Unit,
    onClear: () -> Unit,
    onUndo: () -> Unit
) {
    Surface(color = DrSurface, shadowElevation = 4.dp) {
        Column(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            // Color palette
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                PALETTE_COLORS.forEach { hex ->
                    val selected = drawingTool.selectedColor == hex
                    Box(
                        modifier = Modifier
                            .size(if (selected) 36.dp else 30.dp)
                            .background(
                                try { Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { Color.Black },
                                CircleShape
                            )
                            .then(if (selected) Modifier.border(2.dp, DrPrimary, CircleShape) else Modifier)
                            .border(1.dp, Color.Gray.copy(alpha = 0.3f), CircleShape)
                            .clickable { onColorSelect(hex) }
                            .semantics { contentDescription = "Color $hex" }
                    )
                }
            }

            Spacer(Modifier.height(4.dp))

            // Brush width + tools
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Brush size
                Icon(Icons.Default.LineWeight, "Brush size", tint = DrSubtext, modifier = Modifier.size(18.dp))
                Slider(
                    value = drawingTool.brushWidth,
                    onValueChange = onWidthChange,
                    valueRange = 0.005f..0.05f,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = DrPrimary, activeTrackColor = DrPrimary)
                )

                // Brush / Eraser toggle
                IconToggleButton(
                    checked = drawingTool.tool == DrawTool.brush,
                    onCheckedChange = { onToolChange(if (it) DrawTool.brush else DrawTool.eraser) }
                ) {
                    Icon(
                        Icons.Default.Edit,
                        "Brush",
                        tint = if (drawingTool.tool == DrawTool.brush) DrPrimary else DrSubtext
                    )
                }
                IconToggleButton(
                    checked = drawingTool.tool == DrawTool.eraser,
                    onCheckedChange = { onToolChange(if (it) DrawTool.eraser else DrawTool.brush) }
                ) {
                    Icon(
                        Icons.Default.AutoFixOff,
                        "Eraser",
                        tint = if (drawingTool.tool == DrawTool.eraser) DrPrimary else DrSubtext
                    )
                }

                // Undo
                IconButton(onClick = onUndo) {
                    Icon(Icons.Default.Undo, "Undo", tint = DrSubtext)
                }
                // Clear
                IconButton(onClick = onClear) {
                    Icon(Icons.Default.Delete, "Clear canvas", tint = DrDanger)
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(msg: com.drawrush.app.data.model.ChatMessage, myPlayerId: String) {
    val isSystem = msg.playerId.isEmpty()
    val isMe = msg.playerId == myPlayerId
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp),
        horizontalArrangement = if (isMe) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = when {
                isSystem -> DrAccent.copy(alpha = 0.2f)
                msg.isCorrectGuess -> DrCorrectGreen.copy(alpha = 0.2f)
                isMe -> DrPrimary.copy(alpha = 0.15f)
                else -> DrSurface
            },
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)) {
                if (!isSystem && !isMe) {
                    Text(msg.nickname, style = MaterialTheme.typography.labelSmall,
                        color = DrPrimary, fontWeight = FontWeight.SemiBold)
                }
                Text(msg.text, style = MaterialTheme.typography.bodySmall,
                    color = if (isSystem) DrAccentDark else DrOnSurface)
            }
        }
    }
}

@Composable
private fun CountdownOverlay(endsAt: Long?, serverTimeDelta: Long) {
    var remaining by remember { mutableStateOf(3) }
    LaunchedEffect(endsAt) {
        while (true) {
            val now = System.currentTimeMillis() + serverTimeDelta
            remaining = maxOf(0, ((endsAt ?: now) - now).div(1000).toInt() + 1)
            delay(100)
        }
    }
    Box(
        modifier = Modifier.fillMaxSize().background(DrPrimary),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Get Ready!", color = Color.White, style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(16.dp))
            Text(
                "$remaining",
                color = DrAccent,
                fontSize = 96.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun WordSelectionDialog(
    choices: List<String>,
    deadline: Long,
    serverTimeDelta: Long,
    onSelect: (String) -> Unit
) {
    var remaining by remember { mutableStateOf(15) }
    LaunchedEffect(deadline) {
        while (true) {
            val now = System.currentTimeMillis() + serverTimeDelta
            remaining = maxOf(0, ((deadline - now) / 1000).toInt())
            delay(200)
        }
    }
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = DrSurface),
            modifier = Modifier.fillMaxWidth(0.9f).padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Choose a Word", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Time remaining: ${remaining}s", color = DrSubtext)
                choices.forEach { word ->
                    Button(
                        onClick = { onSelect(word) },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = DrPrimary)
                    ) {
                        Text(word, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun WaitingForArtistOverlay(artistName: String) {
    Box(
        modifier = Modifier.fillMaxSize().background(DrBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = DrPrimary)
            Spacer(Modifier.height(16.dp))
            Text("$artistName is choosing a word…",
                style = MaterialTheme.typography.bodyLarge,
                color = DrOnBackground)
        }
    }
}

@Composable
private fun WaitingForNextRound() {
    Box(
        modifier = Modifier.fillMaxSize().background(DrBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = DrPrimary)
            Spacer(Modifier.height(16.dp))
            Text("Next round starting…", style = MaterialTheme.typography.bodyLarge, color = DrOnBackground)
        }
    }
}

@Composable
private fun RoundResultOverlay(
    result: com.drawrush.app.data.model.RoundResult,
    players: List<PlayerState>,
    onDismiss: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth(0.92f)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Round ${result.roundNumber} Over!", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("The word was:", color = DrSubtext, style = MaterialTheme.typography.bodyMedium)
                Text(result.answer.uppercase(), color = DrPrimary, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)

                Divider()

                result.correctGuessers.forEach { guesser ->
                    val player = players.find { it.playerId == guesser.playerId }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(player?.avatar ?: "🏆")
                            Text(player?.nickname ?: "Unknown")
                        }
                        Text("+${guesser.points}", color = DrCorrectGreen, fontWeight = FontWeight.Bold)
                    }
                }

                if (result.artistPoints > 0) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Artist bonus")
                        Text("+${result.artistPoints}", color = DrAccent, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
