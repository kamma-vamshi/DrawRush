/**
 * DrawRush Structured Error Codes
 */
export enum ErrorCode {
  // Room errors
  ROOM_NOT_FOUND          = "ROOM_NOT_FOUND",
  ROOM_FULL               = "ROOM_FULL",
  GAME_ALREADY_STARTED    = "GAME_ALREADY_STARTED",
  INVALID_ROOM_CODE       = "INVALID_ROOM_CODE",

  // Auth errors
  NOT_AUTHORIZED          = "NOT_AUTHORIZED",
  INVALID_TOKEN           = "INVALID_TOKEN",
  BANNED                  = "BANNED",

  // Game-flow errors
  NOT_YOUR_TURN           = "NOT_YOUR_TURN",
  INVALID_PHASE           = "INVALID_PHASE",
  NOT_IN_ROOM             = "NOT_IN_ROOM",
  ALREADY_IN_ROOM         = "ALREADY_IN_ROOM",
  ALREADY_GUESSED         = "ALREADY_GUESSED",
  IS_ARTIST               = "IS_ARTIST",
  ROUND_EXPIRED           = "ROUND_EXPIRED",
  INVALID_WORD_CHOICE     = "INVALID_WORD_CHOICE",

  // Input errors
  INVALID_PAYLOAD         = "INVALID_PAYLOAD",
  NICKNAME_REQUIRED       = "NICKNAME_REQUIRED",
  NICKNAME_TOO_LONG       = "NICKNAME_TOO_LONG",
  NICKNAME_TAKEN          = "NICKNAME_TAKEN",
  NICKNAME_INVALID        = "NICKNAME_INVALID",
  MESSAGE_TOO_LONG        = "MESSAGE_TOO_LONG",
  CUSTOM_WORD_INVALID     = "CUSTOM_WORD_INVALID",

  // Rate limiting
  RATE_LIMITED            = "RATE_LIMITED",
  MUTED                   = "MUTED",

  // Drawing errors
  INVALID_COORDINATE      = "INVALID_COORDINATE",
  PAYLOAD_TOO_LARGE       = "PAYLOAD_TOO_LARGE",
  SEQUENCE_GAP            = "SEQUENCE_GAP",

  // Host errors
  NOT_HOST                = "NOT_HOST",
  NOT_ENOUGH_PLAYERS      = "NOT_ENOUGH_PLAYERS",

  // Server errors
  INTERNAL_ERROR          = "INTERNAL_ERROR",
  PROTOCOL_VERSION_MISMATCH = "PROTOCOL_VERSION_MISMATCH",
}
