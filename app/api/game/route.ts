import { env } from "cloudflare:workers";
import { AI_SETTINGS, cleanCode, cleanName, distance, GATE, MAX_PLAYERS, MONSTER, stageMonsterHp, STAGES } from "@/lib/game";

export const runtime = "edge";
type Room = {
  code: string; stage: number; hp: number; host_id: string; status: string; mode: string;
  difficulty: string; slots: number; enemy_x: number; enemy_y: number; last_tick_at: number;
  round: number; winner_id: string | null; event_seq: number; message: string;
  last_hit_by: string | null; last_hit_target: string | null; last_hit_damage: number; last_hit_at: number;
  enemy_strikes: number; enemy_score: number;
};
type Player = {
  id: string; room_code: string; name: string; x: number; y: number; hp: number; strikes: number; score: number; revives: number;
  ready: number; direction: string; revive_target: string | null; revive_started_at: number; seen_at: number;
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: string, status: number, code = error) => reply({ error, code }, status);
function db() { if (!env.DB) throw new Error("Game storage unavailable"); return env.DB; }
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join("");
const newToken = () => crypto.randomUUID() + crypto.randomUUID();
const roomByCode = (code: string) => db().prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first<Room>();
const playersIn = async (code: string) => (await db().prepare("SELECT id, room_code, name, x, y, hp, strikes, score, revives, ready, direction, revive_target, revive_started_at, seen_at FROM players WHERE room_code = ? ORDER BY rowid").bind(code).all<Player>()).results;
const announce = (code: string, message: string) => db().prepare("UPDATE rooms SET event_seq = event_seq + 1, message = ? WHERE code = ?").bind(message, code).run();
const active = (p: Player, now: number) => now - p.seen_at < 60000;

async function snapshot(code: string, selfId: string) {
  const room = await roomByCode(code);
  if (!room) return fail("Room not found.", 404, "ROOM_NOT_FOUND");
  const now = Date.now();
  const players = await playersIn(code);
  return reply({
    code, stage: room.stage, hp: room.hp, maxHp: stageMonsterHp(room.stage, room.difficulty as "slow" | "medium" | "hard"),
    status: room.status, mode: room.mode, difficulty: room.difficulty, hostId: room.host_id,
    round: room.round, enemyX: room.enemy_x, enemyY: room.enemy_y,
    gateOpen: room.status === "running" && room.mode === "expedition" && room.hp === 0,
    winnerId: room.winner_id, eventSeq: room.event_seq, message: room.message, selfId,
    lastHit: { by: room.last_hit_by, target: room.last_hit_target, damage: room.last_hit_damage, at: room.last_hit_at },
    enemyStrikes: room.enemy_strikes, enemyScore: room.enemy_score,
    players: players.map(p => ({
      id:p.id, name:p.name, x:p.x, y:p.y, hp:p.hp, strikes:p.strikes, score:p.score, revives:p.revives,
      ready:!!p.ready, direction:p.direction, reviveTarget:p.revive_target,
      reviveStartedAt:p.revive_started_at, active:active(p, now),
    })),
  });
}

async function tick(room: Room, now: number) {
  if (room.status !== "running" || room.mode !== "expedition") return;
  const roster = await playersIn(room.code);
  for (const healer of roster.filter(p => p.revive_target)) {
    const target = roster.find(p => p.id === healer.revive_target);
    const valid = target && healer.hp > 0 && target.hp === 0 && active(healer,now) && distance(healer,target) <= 16;
    if (!valid) {
      await db().prepare("UPDATE players SET revive_target = NULL, revive_started_at = 0 WHERE id = ?").bind(healer.id).run();
    } else if (now - healer.revive_started_at >= 3000) {
      const healed = await db().prepare("UPDATE players SET hp = 5 WHERE id = ? AND room_code = ? AND hp = 0").bind(target.id,room.code).run();
      await db().prepare("UPDATE players SET revive_target = NULL, revive_started_at = 0 WHERE id = ?").bind(healer.id).run();
      if (healed.meta.changes) {
        await db().prepare("UPDATE players SET revives = revives + 1, score = score + 50 WHERE id = ?").bind(healer.id).run();
        await announce(room.code, `${target.name} was revived by ${healer.name}. +50 points!`);
      }
    }
  }
  if (room.hp <= 0) return;
  const settings = AI_SETTINGS[room.difficulty as keyof typeof AI_SETTINGS] ?? AI_SETTINGS.slow;
  const interval = settings.interval;
  const claimed = await db().prepare("UPDATE rooms SET last_tick_at = ? WHERE code = ? AND status = 'running' AND stage = ? AND hp > 0 AND last_tick_at <= ?")
    .bind(now,room.code,room.stage,now-interval).run();
  if (!claimed.meta.changes) return;
  const living = roster.filter(p => p.hp > 0 && active(p,now));
  if (!living.length) return;
  const enemy = {x:room.enemy_x,y:room.enemy_y};
  living.sort((a,b) => distance(a,enemy)-distance(b,enemy));
  const target = living[0];
  const gap = distance(target,enemy);
  const step = settings.step;
  const x = Math.max(8,Math.min(92,Math.round(enemy.x+(target.x-enemy.x)*Math.min(1,step/Math.max(gap,1)))));
  const y = Math.max(10,Math.min(90,Math.round(enemy.y+(target.y-enemy.y)*Math.min(1,step/Math.max(gap,1)))));
  await db().prepare("UPDATE rooms SET enemy_x = ?, enemy_y = ? WHERE code = ? AND stage = ? AND status = 'running'").bind(x,y,room.code,room.stage).run();
  if (distance({x,y},target) > 13) return;
  const damage = settings.damage;
  const landed = await db().prepare("UPDATE players SET hp = MAX(0, hp - ?) WHERE id = ? AND hp > 0").bind(damage,target.id).run();
  if (!landed.meta.changes) return;
  const dealt = Math.min(damage,target.hp);
  await db().prepare("UPDATE rooms SET enemy_strikes = enemy_strikes + 1, enemy_score = enemy_score + ?, last_hit_by = 'enemy', last_hit_target = ?, last_hit_damage = ?, last_hit_at = ? WHERE code = ? AND stage = ? AND status = 'running'")
    .bind(dealt*10,target.id,dealt,now,room.code,room.stage).run();
  const remaining = await playersIn(room.code);
  if (remaining.find(p => p.id === target.id)?.hp === 0) await announce(room.code,`${target.name} is down. Get close and hold revive!`);
  if (remaining.filter(p => active(p,now)).every(p => p.hp === 0)) {
    const done = await db().prepare("UPDATE rooms SET status = 'defeat', event_seq = event_seq + 1, message = 'The crew has fallen. The host can replay.' WHERE code = ? AND status = 'running'").bind(room.code).run();
    void done;
  }
}

async function enter(body: Record<string,unknown>) {
  const name = cleanName(body.name);
  if (!name) return fail("Enter a Viking name.",400,"NAME_REQUIRED");
  const now = Date.now(), id = crypto.randomUUID(), token = newToken();
  let code = cleanCode(body.code);
  if (body.type === "create") {
    for (let i=0;i<5;i++) {
      code = randomCode();
      try {
        await db().prepare("INSERT INTO rooms (code,stage,hp,host_id,status,mode,difficulty,slots,enemy_x,enemy_y,last_tick_at,round,winner_id,event_seq,message,created_at,updated_at) VALUES (?,0,?,?,'lobby','expedition','slow',1,72,50,0,0,NULL,0,'',?,?)")
          .bind(code,STAGES[0].hp,id,now,now).run();
        break;
      } catch (error) { if (i===4) throw error; }
    }
  } else {
    if (code.length !== 6 || !(await roomByCode(code))) return fail("Room not found. Check the six-character code.",404,"ROOM_NOT_FOUND");
    // Expire abandoned tabs so a room does not remain full forever.
    const pruned=await db().prepare("DELETE FROM players WHERE room_code = ? AND seen_at < ?").bind(code,now-600000).run();
    if(pruned.meta.changes) await db().prepare("UPDATE rooms SET slots = MAX(0,slots-?) WHERE code = ?").bind(pruned.meta.changes,code).run();
    await db().prepare("UPDATE rooms SET slots = (SELECT COUNT(*) FROM players WHERE room_code = ?) WHERE code = ? AND slots = 0").bind(code,code).run();
    const previousHost=await db().prepare("SELECT id FROM players WHERE room_code = ? AND id = (SELECT host_id FROM rooms WHERE code = ?)").bind(code,code).first();
    if (!previousHost) {
      const next=await db().prepare("SELECT id FROM players WHERE room_code = ? ORDER BY rowid LIMIT 1").bind(code).first<{id:string}>();
      await db().prepare("UPDATE rooms SET host_id = ? WHERE code = ?").bind(next?.id??id,code).run();
    }
    const reserved = await db().prepare("UPDATE rooms SET slots = slots + 1 WHERE code = ? AND slots < ?").bind(code,MAX_PLAYERS).run();
    if (!reserved.meta.changes) return fail("This room is full (10 players).",409,"ROOM_FULL");
  }
  try {
    const count = await db().prepare("SELECT COUNT(*) AS n FROM players WHERE room_code = ?").bind(code).first<{n:number}>();
    await db().prepare("INSERT INTO players (id,room_code,token,name,x,y,hp,strikes,score,revives,ready,direction,revive_target,revive_started_at,last_attack_at,last_move_at,seen_at) VALUES (?,?,?,?,18,?,10,0,0,0,0,'right',NULL,0,0,0,?)")
      .bind(id,code,token,name,25+((count?.n??0)%10)*6,now).run();
  } catch (error) {
    await db().prepare("UPDATE rooms SET slots = MAX(0,slots-1) WHERE code = ?").bind(code).run();
    throw error;
  }
  return reply({token,state:await (await snapshot(code,id)).json()},201);
}

async function command(body: Record<string,unknown>) {
  const code = cleanCode(body.code), token = typeof body.token === "string" ? body.token : "";
  if (code.length !== 6 || token.length < 60) return fail("Join a room first.",401);
  let player = await db().prepare("SELECT * FROM players WHERE room_code = ? AND token = ?").bind(code,token).first<Player>();
  if (!player) return fail("Your room session ended. Join again.",401,"SESSION_ENDED");
  const now = Date.now();
  await db().prepare("UPDATE players SET seen_at = ? WHERE id = ?").bind(now,player.id).run();
  let room = await roomByCode(code);
  if (!room) return fail("Room not found.",404,"ROOM_NOT_FOUND");
  if (body.type === "leave") {
    await db().prepare("DELETE FROM players WHERE id = ?").bind(player.id).run();
    await db().prepare("UPDATE rooms SET slots = MAX(0,slots-1) WHERE code = ?").bind(code).run();
    if (room.host_id === player.id) {
      const next = await db().prepare("SELECT id FROM players WHERE room_code = ? ORDER BY rowid LIMIT 1").bind(code).first<{id:string}>();
      await db().prepare("UPDATE rooms SET host_id = ? WHERE code = ?").bind(next?.id??"",code).run();
    }
    if (room.mode==="duel"&&room.status==="running") {
      const survivors=(await playersIn(code)).filter(p=>p.hp>0&&active(p,now));
      if(survivors.length===1) await db().prepare("UPDATE rooms SET status = 'victory', winner_id = ?, event_seq = event_seq + 1, message = ? WHERE code = ? AND status = 'running'")
        .bind(survivors[0].id,`${survivors[0].name} wins the duel!`,code).run();
    }
    return reply({left:true});
  }
  if (body.type === "ready") {
    await db().prepare("UPDATE players SET ready = 1-ready WHERE id = ?").bind(player.id).run();
    return snapshot(code,player.id);
  }
  if (body.type === "config") {
    if (room.host_id !== player.id || room.status === "running") return fail("Only the room creator can configure the next hunt.",403);
    const mode = body.mode === "duel" ? "duel" : body.mode === "expedition" ? "expedition" : null;
    const difficulty = body.difficulty === "hard" ? "hard" : body.difficulty === "medium" ? "medium" : body.difficulty === "slow" ? "slow" : null;
    if (!mode || !difficulty) return fail("Choose a valid mode and AI speed.",400);
    await db().prepare("UPDATE rooms SET mode = ?, difficulty = ? WHERE code = ?").bind(mode,difficulty,code).run();
    return snapshot(code,player.id);
  }
  if (body.type === "start" || body.type === "reset") {
    if (room.host_id !== player.id) return fail("Only the room creator can start or replay.",403);
    if (room.status === "running") return fail("The hunt is already running.",409);
    const roster = await playersIn(code);
    if (room.mode === "duel" && roster.filter(p => active(p,now)).length < 2) return fail("A duel needs at least two players.",409,"NEED_OPPONENT");
    await db().prepare("UPDATE rooms SET stage = 0, hp = ?, status = 'running', enemy_x = ?, enemy_y = ?, last_tick_at = ?, round = round + 1, winner_id = NULL, last_hit_by = NULL, last_hit_target = NULL, last_hit_damage = 0, last_hit_at = 0, enemy_strikes = 0, enemy_score = 0, event_seq = event_seq + 1, message = ?, updated_at = ? WHERE code = ?")
      .bind(stageMonsterHp(0,room.difficulty as "slow" | "medium" | "hard"),MONSTER.x,MONSTER.y,now,room.mode === "duel" ? "The duel begins!" : "The crew lands on Raven Shore.",now,code).run();
    await db().prepare("UPDATE players SET x = 18, y = 20 + ((rowid - 1) % 10) * 6, hp = 10, strikes = 0, score = 0, revives = 0, ready = 0, direction = 'right', revive_target = NULL, revive_started_at = 0, last_attack_at = 0, last_move_at = 0 WHERE room_code = ?").bind(code).run();
    return snapshot(code,player.id);
  }
  await tick(room,now);
  if (body.type === "state") return snapshot(code,player.id);
  room = (await roomByCode(code))!;
  player = (await db().prepare("SELECT * FROM players WHERE id = ?").bind(player.id).first<Player>())!;
  if (room.status !== "running") return fail("The host has not started a hunt.",409,"NOT_RUNNING");
  if (player.hp <= 0) return fail("You are down. A teammate can revive you.",409,"PLAYER_DOWN");
  if (body.type === "move") {
    const dx=Number(body.dx),dy=Number(body.dy);
    if (!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)>1||Math.abs(dy)>1||(!dx&&!dy)) return fail("Invalid movement.",400);
    const direction = dx<0?"left":dx>0?"right":dy<0?"up":"down";
    await db().prepare("UPDATE players SET x = MAX(8,MIN(92,x+?)), y = MAX(10,MIN(90,y+?)), direction = ?, revive_target = NULL, revive_started_at = 0, last_move_at = ? WHERE id = ? AND hp > 0 AND last_move_at <= ?")
      .bind(dx*7,dy*7,direction,now,player.id,now-85).run();
    return snapshot(code,player.id);
  }
  if (body.type === "revive") {
    if (room.mode !== "expedition") return fail("Revival is available in crew hunts.",409);
    const roster = await playersIn(code);
    const downed = roster.filter(p => p.hp===0 && p.id!==player!.id && distance(p,player!)<=16);
    if (!downed.length) return fail("Move beside a downed teammate.",409,"NO_REVIVE_TARGET");
    const target = downed[0];
    await db().prepare("UPDATE players SET revive_target = ?, revive_started_at = ? WHERE id = ? AND hp > 0")
      .bind(target.id,now,player.id).run();
    await announce(code,`${player.name} is reviving ${target.name}…`);
    return snapshot(code,player.id);
  }
  if (body.type === "interact") {
    if (room.mode !== "expedition" || room.hp!==0 || room.stage>=STAGES.length-1) return fail("The Rune Gate is sealed.",409);
    if (distance(player,GATE)>18) return fail("Move closer to the Rune Gate.",409);
    const next=room.stage+1;
    const changed = await db().prepare("UPDATE rooms SET stage = ?, hp = ?, enemy_x = 72, enemy_y = 50, last_tick_at = ?, updated_at = ?, event_seq = event_seq + 1, message = ? WHERE code = ? AND stage = ? AND hp = 0 AND status = 'running'")
      .bind(next,stageMonsterHp(next,room.difficulty as "slow" | "medium" | "hard"),now,now,`The crew enters ${STAGES[next].realm}.`,code,room.stage).run();
    if (changed.meta.changes) await db().prepare("UPDATE players SET x = 18, y = 20 + ((rowid - 1) % 10) * 6, hp = 10, revive_target = NULL, revive_started_at = 0 WHERE room_code = ?").bind(code).run();
    return snapshot(code,player.id);
  }
  if (body.type === "attack") {
    const cooldown = await db().prepare("UPDATE players SET last_attack_at = ?, revive_target = NULL, revive_started_at = 0 WHERE id = ? AND hp > 0 AND last_attack_at <= ?")
      .bind(now,player.id,now-550).run();
    if (!cooldown.meta.changes) return snapshot(code,player.id);
    if (room.mode === "duel") {
      const rivals = (await playersIn(code)).filter(p => p.id!==player!.id && p.hp>0 && active(p,now) && distance(p,player!)<=20);
      if (!rivals.length) return fail("Move closer to an opponent.",409,"OUT_OF_RANGE");
      rivals.sort((a,b) => distance(a,player!)-distance(b,player!));
      const target=rivals[0];
      const damage = Math.min(3,target.hp);
      const landed = await db().prepare("UPDATE players SET hp = MAX(0,hp-3) WHERE id = ? AND hp > 0").bind(target.id).run();
      if (!landed.meta.changes) return snapshot(code,player.id);
      await db().prepare("UPDATE players SET strikes = strikes + 1, score = score + ? WHERE id = ?").bind(damage*10+(target.hp<=3?80:0),player.id).run();
      await db().prepare("UPDATE rooms SET last_hit_by = ?, last_hit_target = ?, last_hit_damage = ?, last_hit_at = ? WHERE code = ?").bind(player.id,target.id,damage,now,code).run();
      const alive=(await playersIn(code)).filter(p => p.hp>0 && active(p,now));
      if (alive.length===1) await db().prepare("UPDATE rooms SET status = 'victory', winner_id = ?, event_seq = event_seq + 1, message = ? WHERE code = ? AND status = 'running'")
        .bind(alive[0].id,`${alive[0].name} wins the duel!`,code).run();
      else if (target.hp<=3) await announce(code,`${target.name} is out of the duel.`);
      return snapshot(code,player.id);
    }
    if (room.hp===0 || distance(player,{x:room.enemy_x,y:room.enemy_y})>22) return fail(room.hp===0?"The Rune Gate is open.":"Move closer to the monster.",409,"OUT_OF_RANGE");
    // The server applies the player's strike and Viking ally support as one hit.
    const hit=await db().prepare("UPDATE rooms SET hp = MAX(0,hp-4), updated_at = ? WHERE code = ? AND stage = ? AND status = 'running' AND hp > 0")
      .bind(now,code,room.stage).run();
    if (!hit.meta.changes) return snapshot(code,player.id);
    const damage = Math.min(4,room.hp);
    await db().prepare("UPDATE players SET strikes = strikes + 1, score = score + ? WHERE id = ?").bind(damage*10+(room.hp<=4?80:0),player.id).run();
    await db().prepare("UPDATE rooms SET last_hit_by = ?, last_hit_target = 'enemy', last_hit_damage = ?, last_hit_at = ? WHERE code = ?").bind(player.id,damage,now,code).run();
    const after=await roomByCode(code);
    if (after?.hp===0) {
      if (room.stage===STAGES.length-1) await db().prepare("UPDATE rooms SET status = 'victory', event_seq = event_seq + 1, message = 'Fjordwyrm defeated. The fjord is free!' WHERE code = ? AND stage = ? AND hp = 0 AND status = 'running'").bind(code,room.stage).run();
      else await announce(code,`${STAGES[room.stage].monster} defeated! Reach the Rune Gate.`);
    }
    return snapshot(code,player.id);
  }
  return fail("Unknown action.",400);
}

export async function POST(request: Request) {
  try {
    const body=await request.json() as Record<string,unknown>;
    return body.type==="create"||body.type==="join" ? enter(body) : command(body);
  } catch(error) {
    console.error("Fjordfall request failed",error);
    return fail("The expedition is temporarily unavailable. Try again.",500);
  }
}
