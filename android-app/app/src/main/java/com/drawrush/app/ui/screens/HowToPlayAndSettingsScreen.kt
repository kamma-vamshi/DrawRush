package com.drawrush.app.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drawrush.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HowToPlayScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("How To Play", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DrPrimary, titleContentColor = Color.White, navigationIconContentColor = Color.White)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text("Welcome to DrawRush! 🎨", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = DrPrimary)
            Text("DrawRush is a multiplayer drawing and guessing game. One player draws, the others guess!", style = MaterialTheme.typography.bodyLarge, color = DrOnBackground)

            listOf(
                Triple("🎭", "The Artist", "When it's your turn to draw, you'll be given 3 word choices. Pick one and draw it — but don't write the word!"),
                Triple("🔍", "The Guessers", "Type your guesses in the chat. The faster you guess, the more points you earn!"),
                Triple("⏱️", "Timer", "Each round has a time limit. Hints appear as letters are revealed over time."),
                Triple("🏆", "Scoring", "Guessers earn up to 1000 points based on speed. The artist earns bonus points for each correct guesser."),
                Triple("🔄", "Rounds", "Everyone takes a turn as artist. After all rounds, the player with the most points wins!"),
                Triple("💡", "Tips", "Use the full canvas! Clear shapes and details help others guess faster — and earn you more points!"),
            ).forEach { (emoji, title, desc) ->
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = DrSurfaceVariant)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Text(emoji, fontSize = 32.sp)
                        Column {
                            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(4.dp))
                            Text(desc, style = MaterialTheme.typography.bodyMedium, color = DrSubtext)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    soundEnabled: Boolean,
    hapticsEnabled: Boolean,
    serverUrl: String,
    onSoundChanged: (Boolean) -> Unit,
    onHapticsChanged: (Boolean) -> Unit,
    onServerUrlChanged: (String) -> Unit,
) {
    var urlInput by remember(serverUrl) { mutableStateOf(serverUrl) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DrPrimary, titleContentColor = Color.White, navigationIconContentColor = Color.White)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Audio & Haptics", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = DrPrimary)

            Card(shape = RoundedCornerShape(16.dp)) {
                Column {
                    ListItem(
                        headlineContent = { Text("Sound Effects") },
                        supportingContent = { Text("Button taps, correct guess sounds") },
                        leadingContent = { Icon(Icons.Default.VolumeUp, null, tint = DrPrimary) },
                        trailingContent = {
                            Switch(
                                checked = soundEnabled,
                                onCheckedChange = onSoundChanged,
                                colors = SwitchDefaults.colors(checkedThumbColor = DrPrimary)
                            )
                        }
                    )
                    Divider(modifier = Modifier.padding(horizontal = 16.dp))
                    ListItem(
                        headlineContent = { Text("Haptic Feedback") },
                        supportingContent = { Text("Vibration on actions") },
                        leadingContent = { Icon(Icons.Default.Vibration, null, tint = DrPrimary) },
                        trailingContent = {
                            Switch(
                                checked = hapticsEnabled,
                                onCheckedChange = onHapticsChanged,
                                colors = SwitchDefaults.colors(checkedThumbColor = DrPrimary)
                            )
                        }
                    )
                }
            }

            Text("Developer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = DrPrimary)

            Card(shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Backend URL", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text("Leave empty to use default. For development only.", style = MaterialTheme.typography.bodySmall, color = DrSubtext)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = urlInput,
                        onValueChange = { urlInput = it },
                        placeholder = { Text("http://10.0.2.2:3001") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            if (urlInput != serverUrl) {
                                IconButton(onClick = { onServerUrlChanged(urlInput) }) {
                                    Icon(Icons.Default.Check, "Save")
                                }
                            }
                        }
                    )
                }
            }

            // Version info
            Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = DrSurfaceVariant)) {
                ListItem(
                    headlineContent = { Text("DrawRush") },
                    supportingContent = { Text("Version 1.0.0 · Protocol v1.0.0") },
                    leadingContent = { Text("🎨", fontSize = 24.sp) }
                )
            }
        }
    }
}
