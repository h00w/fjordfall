import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  stage: integer("stage").notNull().default(0),
  hp: integer("hp").notNull().default(12),
  hostId: text("host_id"),
  status: text("status").notNull().default("lobby"),
  mode: text("mode").notNull().default("expedition"),
  difficulty: text("difficulty").notNull().default("slow"),
  slots: integer("slots").notNull().default(0),
  enemyX: integer("enemy_x").notNull().default(72),
  enemyY: integer("enemy_y").notNull().default(50),
  lastTickAt: integer("last_tick_at").notNull().default(0),
  round: integer("round").notNull().default(0),
  winnerId: text("winner_id"),
  eventSeq: integer("event_seq").notNull().default(0),
  message: text("message").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull().references(() => rooms.code),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  x: integer("x").notNull().default(18),
  y: integer("y").notNull().default(50),
  hp: integer("hp").notNull().default(10),
  strikes: integer("strikes").notNull().default(0),
  ready: integer("ready").notNull().default(0),
  direction: text("direction").notNull().default("right"),
  reviveTarget: text("revive_target"),
  reviveStartedAt: integer("revive_started_at").notNull().default(0),
  lastAttackAt: integer("last_attack_at").notNull().default(0),
  lastMoveAt: integer("last_move_at").notNull().default(0),
  seenAt: integer("seen_at").notNull(),
}, table => [index("idx_players_room_code").on(table.roomCode)]);
