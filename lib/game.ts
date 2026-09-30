export const STAGES = [
  { realm: "Raven Shore", map: "ISLANDS", monster: "Mossling", size: "SMALL", hp: 12, accent: "#a6d69f", lore: "Defeat the Mossling and open the Rune Gate." },
  { realm: "The Hanging Falls", map: "SKY ISLANDS", monster: "Storm Troll", size: "MEDIUM", hp: 18, accent: "#a8ddf4", lore: "Hold the bridge above the clouds." },
  { realm: "The Whale Road", map: "SEA", monster: "Deepjaw", size: "LARGE", hp: 24, accent: "#79c7d9", lore: "Hunt the beast beneath the waves." },
  { realm: "The Sunken Hall", map: "UNDERWATER", monster: "Abyss Warden", size: "LARGE", hp: 22, accent: "#79dfc3", lore: "Recover the fire rune in the drowned hall." },
  { realm: "Dragon's Roost", map: "SKY ISLANDS", monster: "Fjordwyrm", size: "BOSS", hp: 42, accent: "#f6ad67", lore: "The final hunt. Stand together." },
] as const;

export type GameState = {
  code: string;
  stage: number;
  hp: number;
  maxHp: number;
  status: "lobby" | "running" | "victory" | "defeat";
  mode: "expedition" | "duel";
  difficulty: "slow" | "medium" | "hard";
  hostId: string;
  round: number;
  enemyX: number;
  enemyY: number;
  gateOpen: boolean;
  winnerId: string | null;
  eventSeq: number;
  message: string;
  lastHit: { by: string | null; target: string | null; damage: number; at: number };
  enemyStrikes: number;
  enemyScore: number;
  players: { id: string; name: string; x: number; y: number; hp: number; strikes: number; score: number; revives: number; ready: boolean; direction: string; reviveTarget: string | null; reviveStartedAt: number; active: boolean }[];
  selfId: string;
};

export const MAX_PLAYERS = 10;
export const AI_SETTINGS = {
  slow: { interval: 1600, step: 3, damage: 1 },
  medium: { interval: 800, step: 5, damage: 2 },
  hard: { interval: 550, step: 7, damage: 3 },
} as const;
export function stageMonsterHp(stage: number, difficulty: GameState["difficulty"]) {
  const base = STAGES[stage]?.hp ?? 0;
  return difficulty === "hard" ? Math.ceil(base * 1.5) : base;
}
export const playerMaxHp = (stage: number, mode: GameState["mode"] = "expedition") =>
  10 + (mode === "expedition" ? stage : 0);

export function monsterStrike(difficulty: GameState["difficulty"], stage: number, roll: number) {
  const base = AI_SETTINGS[difficulty].damage + stage;
  if (roll < 0 || roll >= 1 || !Number.isFinite(roll)) throw new RangeError("critical roll must be in [0, 1)");
  return { damage: base + (roll < 0.1 ? 2 : roll < 0.2 ? 3 : 0), critical: roll < 0.2 };
}
export const MONSTER = { x: 72, y: 50 };
export const GATE = { x: 88, y: 50 };
export const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
export function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 18) : "";
}
export function cleanCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6) : "";
}
