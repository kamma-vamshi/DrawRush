/**
 * DrawRush Game State Machine Phases
 */
export enum GamePhase {
  LOBBY          = "LOBBY",
  COUNTDOWN      = "COUNTDOWN",
  WORD_SELECTION = "WORD_SELECTION",
  DRAWING        = "DRAWING",
  ROUND_RESULT   = "ROUND_RESULT",
  NEXT_ROUND     = "NEXT_ROUND",
  GAME_RESULT    = "GAME_RESULT",
}

/**
 * Drawing tool types
 */
export enum DrawTool {
  BRUSH  = "brush",
  ERASER = "eraser",
}

/**
 * Player state inside a room
 */
export interface PlayerState {
  playerId: string;
  nickname: string;
  avatar: string;
  score: number;
  connected: boolean;
  ready: boolean;
  isArtist: boolean;
  hasGuessedCurrentWord: boolean;
  correctGuessCount: number;
  isMuted: boolean;
  isHost: boolean;
}

/**
 * Room settings configurable by the host
 */
export interface RoomSettings {
  maxPlayers: number;          // 2–20
  rounds: number;              // 1–10
  drawingTimeSec: number;      // 15–240
  wordChoiceCount: number;     // 1–5
  hintCount: number;           // 0–5
  language: string;            // "en"
  categories: string[];
  customWords: string[];
  exclusiveCustomWords: boolean;
}

/**
 * Public room state broadcast to all clients
 */
export interface RoomState {
  roomId: string;
  roomCode: string;
  phase: GamePhase;
  settings: Omit<RoomSettings, 'customWords'> & { customWords?: string[], customWordCount?: number };
  players: PlayerState[];
  currentRound: number;
  totalRounds: number;
  currentArtistId: string | null;
  wordPattern: string | null;        // e.g. "_ _ _ _ _"  (guessers only)
  wordLength: number | null;
  roundStartTimestamp: number | null; // server ms epoch
  roundEndTimestamp: number | null;
  selectionDeadline: number | null;
  serverTime: number;
}

/**
 * Drawing stroke event (normalized coordinates 0.0–1.0)
 */
export interface DrawPoint {
  x: number;
  y: number;
}

export interface StrokeStartEvent {
  version: 1;
  type: "strokeStart";
  strokeId: string;
  sequenceNumber: number;
  color: string;
  width: number;
  tool: DrawTool;
  point: DrawPoint;
}

export interface StrokeBatchEvent {
  version: 1;
  type: "strokeBatch";
  strokeId: string;
  sequenceNumber: number;
  color: string;
  width: number;
  tool: DrawTool;
  points: DrawPoint[];
}

export interface StrokeEndEvent {
  version: 1;
  type: "strokeEnd";
  strokeId: string;
  sequenceNumber: number;
}

export interface ClearCanvasEvent {
  version: 1;
  type: "clearCanvas";
  sequenceNumber: number;
}

export interface UndoStrokeEvent {
  version: 1;
  type: "undoStroke";
  sequenceNumber: number;
}

export type DrawingEvent =
  | StrokeStartEvent
  | StrokeBatchEvent
  | StrokeEndEvent
  | ClearCanvasEvent
  | UndoStrokeEvent;

/**
 * Guess result event
 */
export interface GuessResultEvent {
  playerId: string;
  correct: boolean;
  message?: string; // only for incorrect guesses (public chat)
}

/**
 * Score update event
 */
export interface ScoreUpdate {
  playerId: string;
  delta: number;
  newScore: number;
  reason: "correctGuess" | "artistReward" | "speedBonus";
}

/**
 * Round result summary
 */
export interface RoundResult {
  roundNumber: number;
  answer: string;
  artistId: string;
  correctGuessers: Array<{ playerId: string; timeMs: number; points: number }>;
  artistPoints: number;
  scores: ScoreUpdate[];
  reason: "timerExpired" | "allGuessed" | "artistDisconnected";
}

/**
 * Game result summary
 */
export interface GameResult {
  rankings: Array<{
    rank: number;
    playerId: string;
    nickname: string;
    avatar: string;
    score: number;
    correctGuessCount: number;
  }>;
}

/**
 * Default room settings
 */
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawingTimeSec: 80,
  wordChoiceCount: 3,
  hintCount: 2,
  language: "en",
  categories: [],
  customWords: [],
  exclusiveCustomWords: false,
};
