/**
 * DrawRush Socket.IO Event Names — shared between backend and Android client documentation.
 */

// ─── Client → Server ─────────────────────────────────────────────────────────
export const C2S = {
  CREATE_ROOM:    "createRoom",
  JOIN_ROOM:      "joinRoom",
  LEAVE_ROOM:     "leaveRoom",
  SET_READY:      "setReady",
  START_GAME:     "startGame",
  SELECT_WORD:    "selectWord",
  STROKE_START:   "strokeStart",
  STROKE_BATCH:   "strokeBatch",
  STROKE_END:     "strokeEnd",
  CLEAR_CANVAS:   "clearCanvas",
  UNDO_STROKE:    "undoStroke",
  SUBMIT_GUESS:   "submitGuess",
  CHAT_MESSAGE:   "chatMessage",
  KICK_PLAYER:    "kickPlayer",
  MUTE_PLAYER:    "mutePlayer",
  BAN_PLAYER:     "banPlayer",
  REPORT_PLAYER:  "reportPlayer",
  REQUEST_STATE:  "requestState",
} as const;

// ─── Server → Client ─────────────────────────────────────────────────────────
export const S2C = {
  ROOM_CREATED:            "roomCreated",
  ROOM_UPDATED:            "roomUpdated",
  PLAYER_JOINED:           "playerJoined",
  PLAYER_LEFT:             "playerLeft",
  PLAYER_KICKED:           "playerKicked",
  PLAYER_MUTED:            "playerMuted",
  PLAYER_BANNED:           "playerBanned",
  GAME_STARTED:            "gameStarted",
  COUNTDOWN_STARTED:       "countdownStarted",
  WORD_CHOICES:            "wordChoices",
  WORD_PATTERN:            "wordPattern",
  DRAWING_STARTED:         "drawingStarted",
  STROKE_START:            "strokeStart",
  STROKE_BATCH:            "strokeBatch",
  STROKE_END:              "strokeEnd",
  CANVAS_CLEARED:          "canvasCleared",
  UNDO_STROKE:             "undoStroke",
  CANVAS_STATE:            "canvasState",
  GUESS_RESULT:            "guessResult",
  PLAYER_GUESSED_CORRECTLY:"playerGuessedCorrectly",
  HINT_UPDATED:            "hintUpdated",
  ROUND_ENDED:             "roundEnded",
  SCORE_UPDATED:           "scoreUpdated",
  GAME_ENDED:              "gameEnded",
  RECONNECT_STATE:         "reconnectState",
  HOST_CHANGED:            "hostChanged",
  TIMER_SYNC:              "timerSync",
  ERROR:                   "error",
  CHAT_MESSAGE:            "chatMessage",
  SYSTEM_MESSAGE:          "systemMessage",
} as const;

export type C2SEvent = typeof C2S[keyof typeof C2S];
export type S2CEvent = typeof S2C[keyof typeof S2C];
