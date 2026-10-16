package com.drawrush.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drawrush.app.ui.theme.DrAccent
import com.drawrush.app.ui.theme.DrPrimary
import com.drawrush.app.ui.theme.DrPrimaryDark
import com.drawrush.app.viewmodel.Friend
import com.drawrush.app.viewmodel.FriendRequest
import com.drawrush.app.viewmodel.FriendsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendsScreen(
    onNavigateBack: () -> Unit,
    viewModel: FriendsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    val tabs = listOf("My Friends", "Incoming", "Sent")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Friends", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        },
        containerColor = Color.Transparent
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(DrPrimary, DrPrimaryDark)))
                .padding(padding)
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                // Add Friend Search Bar
                OutlinedTextField(
                    value = uiState.addFriendInput,
                    onValueChange = { viewModel.updateAddFriendInput(it) },
                    placeholder = { Text("Add by tag (e.g. VAMSHI#1234)", color = Color.White.copy(0.6f)) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = DrAccent,
                        unfocusedBorderColor = Color.White.copy(0.4f)
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = {
                        IconButton(onClick = { viewModel.addFriend(uiState.addFriendInput) }) {
                            Icon(Icons.Default.PersonAdd, "Add Friend", tint = DrAccent)
                        }
                    }
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Tabs
                TabRow(
                    selectedTabIndex = selectedTabIndex,
                    containerColor = Color.Transparent,
                    contentColor = DrAccent,
                    divider = { HorizontalDivider(color = Color.White.copy(0.2f)) }
                ) {
                    tabs.forEachIndexed { index, title ->
                        val count = when(index) {
                            0 -> uiState.friends.size
                            1 -> uiState.incomingRequests.size
                            2 -> uiState.sentRequests.size
                            else -> 0
                        }
                        Tab(
                            selected = selectedTabIndex == index,
                            onClick = { selectedTabIndex = index },
                            text = { Text("$title ($count)", color = if (selectedTabIndex == index) DrAccent else Color.White) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (uiState.isLoading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = DrAccent)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        when (selectedTabIndex) {
                            0 -> {
                                if (uiState.friends.isEmpty()) item { EmptyState("No friends yet.") }
                                items(uiState.friends) { friend ->
                                    FriendItem(
                                        avatar = friend.avatar,
                                        name = friend.name,
                                        tag = friend.tag,
                                        onRemove = { viewModel.removeFriend(friend.id) }
                                    )
                                }
                            }
                            1 -> {
                                if (uiState.incomingRequests.isEmpty()) item { EmptyState("No incoming requests.") }
                                items(uiState.incomingRequests) { req ->
                                    RequestItem(
                                        avatar = req.avatar,
                                        name = req.name,
                                        tag = req.tag,
                                        onAccept = { viewModel.acceptFriend(req.id) },
                                        onReject = { viewModel.rejectFriend(req.id) }
                                    )
                                }
                            }
                            2 -> {
                                if (uiState.sentRequests.isEmpty()) item { EmptyState("No sent requests.") }
                                items(uiState.sentRequests) { req ->
                                    RequestItem(
                                        avatar = req.avatar,
                                        name = req.name,
                                        tag = req.tag,
                                        onReject = { viewModel.cancelRequest(req.id) }, // Cancel
                                        isSent = true
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyState(text: String) {
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White.copy(0.6f))
    }
}

@Composable
fun FriendItem(avatar: String, name: String, tag: String, onRemove: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(0.1f)),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(12.dp)
        ) {
            Text(avatar, fontSize = 28.sp, modifier = Modifier.clip(CircleShape).background(Color.White.copy(0.2f)).padding(8.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(name, color = Color.White, fontWeight = FontWeight.Bold)
                Text(tag, color = DrAccent, fontSize = 12.sp)
            }
            IconButton(onClick = onRemove) {
                Icon(Icons.Default.PersonRemove, "Remove", tint = Color.Red.copy(0.8f))
            }
        }
    }
}

@Composable
fun RequestItem(avatar: String, name: String, tag: String, onAccept: (() -> Unit)? = null, onReject: () -> Unit, isSent: Boolean = false) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(0.1f)),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(12.dp)
        ) {
            Text(avatar, fontSize = 28.sp, modifier = Modifier.clip(CircleShape).background(Color.White.copy(0.2f)).padding(8.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(name, color = Color.White, fontWeight = FontWeight.Bold)
                Text(tag, color = DrAccent, fontSize = 12.sp)
            }
            if (onAccept != null) {
                IconButton(onClick = onAccept) {
                    Icon(Icons.Default.Check, "Accept", tint = Color.Green)
                }
            }
            IconButton(onClick = onReject) {
                Icon(Icons.Default.Close, if (isSent) "Cancel" else "Reject", tint = Color.Red)
            }
        }
    }
}
