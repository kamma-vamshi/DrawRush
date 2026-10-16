package com.drawrush.app.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drawrush.app.data.model.GameRanking
import com.drawrush.app.ui.theme.*
import com.drawrush.app.viewmodel.GameViewModel

@Composable
fun ResultsScreen(
    onPlayAgain: () -> Unit,
    onReturnToLobby: () -> Unit,
    viewModel: GameViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val rankings = uiState.gameResult?.rankings ?: emptyList()
    val myPlayerId = uiState.myPlayerId

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(DrPrimary, DrPrimaryDark)))
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("🏆 Game Over!", color = Color.White, style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Black)
            Text("Final Rankings", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.titleMedium)

            Spacer(Modifier.height(8.dp))

            // Podium top 3
            if (rankings.size >= 3) {
                Podium(rankings = rankings.take(3))
            }

            Spacer(Modifier.height(8.dp))

            // Full ranking list
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.15f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    rankings.forEach { ranking ->
                        RankingRow(ranking = ranking, isMe = ranking.playerId == myPlayerId)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Action buttons
            DrushButton(
                text = "Play Again",
                icon = Icons.Default.Replay,
                onClick = onPlayAgain,
                containerColor = DrAccent,
                contentColor = DrOnBackground,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedButton(
                onClick = onReturnToLobby,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                border = BorderStroke(1.5.dp, Color.White.copy(alpha = 0.5f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
            ) {
                Icon(Icons.Default.Home, null)
                Spacer(Modifier.width(8.dp))
                Text("Return to Lobby", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun Podium(rankings: List<GameRanking>) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.Bottom
    ) {
        // 2nd place
        if (rankings.size >= 2) PodiumPlace(rankings[1], podiumHeight = 100.dp, medal = "🥈", medalColor = DrSilver)
        Spacer(Modifier.width(8.dp))
        // 1st place (tallest)
        PodiumPlace(rankings[0], podiumHeight = 130.dp, medal = "🥇", medalColor = DrGold)
        Spacer(Modifier.width(8.dp))
        // 3rd place
        if (rankings.size >= 3) PodiumPlace(rankings[2], podiumHeight = 80.dp, medal = "🥉", medalColor = DrBronze)
    }
}

@Composable
private fun PodiumPlace(
    ranking: GameRanking,
    podiumHeight: androidx.compose.ui.unit.Dp,
    medal: String,
    medalColor: Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(100.dp)
    ) {
        Text(ranking.avatar, fontSize = 32.sp)
        Text(ranking.nickname, color = Color.White, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, maxLines = 1)
        Text("${ranking.score} pts", color = DrAccent, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(podiumHeight)
                .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                .background(medalColor.copy(alpha = 0.3f))
                .border(BorderStroke(2.dp, medalColor), RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(medal, fontSize = 28.sp)
        }
    }
}

@Composable
private fun RankingRow(ranking: GameRanking, isMe: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (isMe) DrAccent.copy(alpha = 0.2f) else Color.Transparent,
                RoundedCornerShape(10.dp)
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            "#${ranking.rank}",
            color = when (ranking.rank) {
                1 -> DrGold; 2 -> DrSilver; 3 -> DrBronze; else -> Color.White.copy(alpha = 0.7f)
            },
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(36.dp)
        )
        Text(ranking.avatar, fontSize = 24.sp)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                ranking.nickname + if (isMe) " (You)" else "",
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (isMe) FontWeight.Bold else FontWeight.Normal
            )
            Text(
                "${ranking.correctGuessCount} correct guesses",
                color = Color.White.copy(alpha = 0.6f),
                style = MaterialTheme.typography.bodySmall
            )
        }
        Text(
            "${ranking.score}",
            color = DrAccent,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Black
        )
    }
}
