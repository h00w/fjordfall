import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { monsterStrike, playerMaxHp, stageMonsterHp } from "../lib/game.ts";

// Run the actual route against an in-memory SQLite implementation of D1's
// prepared-statement API. No deployed user room is touched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGES_HP = [12,18,24,22,42];
const sqlite = new DatabaseSync(":memory:");
for (const name of ["0000_smart_gwen_stacy.sql", "0001_amused_spiral.sql", "0002_mighty_old_lace.sql", "0003_kind_toro.sql", "0004_gigantic_bloodscream.sql"]) {
  for (const statement of readFileSync(resolve(root, "drizzle", name), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
}
globalThis.__fjordfallTestDb = {
  prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
    };
  },
};
const source = readFileSync(resolve(root, "app/api/game/route.ts"), "utf8")
  .replace('import { env } from "cloudflare:workers";', "const env = { DB: globalThis.__fjordfallTestDb };")
  .replace('from "@/lib/game"', 'from "../../../lib/game.ts"');
const temp = resolve(root, "app/api/game/.test-route.mts");
writeFileSync(temp, source);
let clock = 1_000_000;
const realNow = Date.now;
Date.now = () => clock;
try {
  const { POST } = await import(temp);
  async function call(payload) {
    const response = await POST(new Request("http://test/api/game", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) }));
    const body = await response.json();
    return {status:response.status,body};
  }
  const advance = (ms=600) => { clock += ms; };
  const create = async name => {
    const response = await call({type:"create",name});
    assert.equal(response.status,201,JSON.stringify(response.body));
    return {code:response.body.state.code, token:response.body.token, id:response.body.state.selfId};
  };
  const join = async (code,name) => {
    const response = await call({type:"join",code,name});
    assert.equal(response.status,201,JSON.stringify(response.body));
    return {code,token:response.body.token,id:response.body.state.selfId};
  };
  const state = async player => (await call({type:"state",...player})).body;
  const move = async (player,dx,dy,n=1) => {
    for(let i=0;i<n;i++){advance(100);const r=await call({type:"move",...player,dx,dy});assert.equal(r.status,200,JSON.stringify(r.body));}
  };
  const host=await create("Astrid");
  // Regression: critical boundaries preserve the 20% chance and realm scaling.
  for (const [difficulty,base] of [["slow",1],["medium",2],["hard",3]]) {
    for (const stage of [0,4]) {
      for (const [roll,bonus,critical] of [[0,2,true],[0.099999,2,true],[0.1,3,true],[0.199999,3,true],[0.2,0,false],[0.999999,0,false]]) {
        assert.deepEqual(monsterStrike(difficulty,stage,roll),{damage:base+stage+bonus,critical},`${difficulty} realm ${stage} roll ${roll}`);
      }
    }
  }
  for (const roll of [-0.01,1,NaN,Infinity]) assert.throws(()=>monsterStrike("slow",0,roll),RangeError);
  for (let stage=0;stage<5;stage++) {
    assert.equal(playerMaxHp(stage),10+stage*2);
    assert.equal(playerMaxHp(stage,"duel"),10);
    assert.deepEqual(monsterStrike("hard",stage,0.5),{damage:3+stage,critical:false});
    assert.deepEqual(monsterStrike("hard",stage,0.05),{damage:5+stage,critical:true});
    assert.deepEqual(monsterStrike("hard",stage,0.15),{damage:6+stage,critical:true});
  }
  const mate=await join(host.code,"Leif");
  assert.equal((await state(host)).players.length,2);
  assert.equal((await call({type:"join",code:"ZZZZZZ",name:"Lost"})).body.code,"ROOM_NOT_FOUND");
  assert.equal((await call({type:"state",code:host.code,token:"invalid"})).status,401);
  await call({type:"ready",...mate});
  assert.equal((await state(host)).players.find(p=>p.id===mate.id).ready,true);
  assert.equal((await call({type:"config",...mate,mode:"duel",difficulty:"medium"})).status,403);
  const before=(await state(host)).players.find(p=>p.id===mate.id).x;
  await call({type:"start",...host});
  await move(mate,1,0);
  assert.equal((await state(host)).players.find(p=>p.id===mate.id).x,before+7);

  // Five cooperative realms: every accepted strike is canonical; gates advance.
  for(let stage=0;stage<5;stage++){
    await move(host,1,0,5); await move(host,0,1,3);
    let current=await state(host), safety=0;
    const startingScore=current.players.find(p=>p.id===host.id).score;
    while(current.hp>0&&current.status==="running"&&safety++<20){
      advance(600);const response=await call({type:"attack",...host});
      assert.equal(response.status,200,JSON.stringify(response.body));
      current=response.body;
    }
    assert.equal(current.hp,0,`stage ${stage} enemy defeated`);
    assert.equal((await state(mate)).hp,0,"shared enemy health");
    assert.equal(current.players.find(p=>p.id===host.id).score-startingScore,STAGES_HP[stage]*10+80,`stage ${stage} scoring includes damage and final strike`);
    assert.deepEqual((await state(mate)).lastHit,current.lastHit,"damage feedback shared across players");
    assert.equal(current.lastHit.target,"enemy");
    assert.match(current.message,/LEVEL UP!/);
    assert.match(current.message,/\+2 HP/);
    if(stage<4){
      assert.equal(current.gateOpen,true);
      await move(host,1,0,5);
      const gate=await call({type:"interact",...host});
      assert.equal(gate.status,200,JSON.stringify(gate.body));
      assert.equal(gate.body.stage,stage+1);
      assert.ok(gate.body.players.every(p=>p.hp===12+stage*2),"all crew retain the +2 HP level reward at each gate");
      assert.equal((await state(mate)).stage,stage+1);
    } else assert.equal(current.status,"victory");
  }
  assert.equal((await state(mate)).status,"victory");
  assert.equal((await state(mate)).players.find(p=>p.id===host.id).score,STAGES_HP.reduce((a,b)=>a+b,0)*10+5*80,"final leaderboard total survives realm changes");
  assert.equal((await call({type:"start",...host})).body.round,2);
  assert.equal((await state(host)).players.length,2);
  assert.ok((await state(host)).players.every(p=>p.score===0&&p.revives===0),"new round resets the leaderboard");

  // Host can switch to PvP. Three same-room replays reset every player.
  await call({type:"leave",...mate});
  assert.equal((await call({type:"config",...host,mode:"duel",difficulty:"medium"})).status,403,"configuration cannot change mid-round");
  const rival=await join(host.code,"Rival");
  // Finish the active crew round through an independent duel room instead.
  const duelHost=await create("Duel Host");
  const duelRival=await join(duelHost.code,"Duel Rival");
  const configured=await call({type:"config",...duelHost,mode:"duel",difficulty:"medium"});
  assert.equal(configured.body.mode,"duel");
  for(let round=1;round<=3;round++){
    const started=await call({type:"start",...duelHost});
    assert.equal(started.body.round,round);
    assert.equal(started.body.players.length,2);
    assert.ok(started.body.players.every(p=>p.hp===10&&p.strikes===0&&p.score===0));
    let result=started.body;
    for(let hit=0;hit<4;hit++){advance(600);const attack=await call({type:"attack",...duelHost});assert.equal(attack.status,200,JSON.stringify(attack.body));result=attack.body;}
    assert.equal(result.status,"victory");
    assert.equal(result.winnerId,duelHost.id);
    assert.equal(result.players.find(p=>p.id===duelHost.id).score,180,"duel points use actual damage plus final blow");
    assert.equal(result.lastHit.target,duelRival.id,"duel damage target shared");
    assert.equal((await state(duelRival)).status,"victory");
  }
  const solo=await create("Solo");
  assert.equal((await call({type:"config",...solo,mode:"duel",difficulty:"slow"})).status,200);
  assert.equal((await call({type:"start",...solo})).body.code,"NEED_OPPONENT");

  // Capacity is ten, including the initiator.
  const full=await create("One");
  for(let i=2;i<=10;i++) await join(full.code,`Player ${i}`);
  assert.equal((await state(full)).players.length,10);
  assert.equal((await call({type:"join",code:full.code,name:"Eleven"})).body.code,"ROOM_FULL");

  // Slow/medium AI are server-driven. Medium reacts sooner and hits harder.
  const ai=await create("AI Target");
  await call({type:"config",...ai,mode:"expedition",difficulty:"medium"});
  await call({type:"start",...ai});
  await move(ai,1,0,5); await move(ai,0,1,3);
  const hpBefore=(await state(ai)).players[0].hp;
  advance(900);
  const medium=await state(ai);
  assert.ok(medium.enemyX<72 || medium.enemyY<50,"medium AI moves on server tick");
  let aiState=medium;
  for(let i=0;i<10&&aiState.enemyStrikes===0;i++){advance(900);aiState=await state(ai);}
  assert.ok(aiState.players[0].hp<=hpBefore,"AI owns player damage");
  assert.ok(aiState.enemyStrikes>0&&aiState.enemyScore>0,"enemy strikes and score are canonical");
  assert.equal(aiState.lastHit.by,"enemy","enemy hit feedback is shared");

  const hardHost=await create("Hard Target");
  assert.deepEqual(STAGES_HP.map((_,stage)=>stageMonsterHp(stage,"hard")),[18,27,36,33,63],"hard scales every realm");
  assert.equal(stageMonsterHp(0,"medium"),12,"medium health is unchanged");
  assert.equal((await call({type:"config",...hardHost,mode:"expedition",difficulty:"hard"})).body.difficulty,"hard");
  assert.equal((await call({type:"config",...hardHost,mode:"expedition",difficulty:"extreme"})).status,400);
  const hardStarted=await call({type:"start",...hardHost});
  assert.equal(hardStarted.body.hp,18,"hard monster has more health");
  assert.equal(hardStarted.body.maxHp,18,"hard health bar reflects server health");
  advance(600);
  let hardState=await state(hardHost);
  assert.ok(hardState.enemyX<72 || hardState.enemyY<50,"hard AI reacts in under 800 ms");
  for(let i=0;i<15&&hardState.enemyStrikes===0;i++){advance(600);hardState=await state(hardHost);}
  assert.ok(hardState.enemyStrikes>0,"hard AI closes the distance");
  assert.ok([3,5,6].includes(hardState.lastHit.damage),"hard AI deals base damage or a +2/+3 critical");

  // Down, revive after three seconds, team wipe, then clean replay.
  const rescueHost=await create("Healer");
  const victim=await join(rescueHost.code,"Victim");
  await call({type:"start",...rescueHost});
  await move(victim,1,0,6); await move(victim,0,1,4);
  await move(rescueHost,1,0,4); await move(rescueHost,0,1,5);
  for(let i=0;i<25;i++){advance(1600);await state(victim);if((await state(victim)).players.find(p=>p.id===victim.id).hp===0)break;}
  const down=(await state(rescueHost)).players.find(p=>p.id===victim.id);
  assert.equal(down.hp,0,"AI downs a player");
  const revive=await call({type:"revive",...rescueHost});
  assert.equal(revive.status,200,JSON.stringify(revive.body));
  advance(3001);
  const restored=await state(rescueHost);
  assert.ok(restored.players.find(p=>p.id===victim.id).hp>0,"three-second teammate revive");
  assert.equal(restored.players.find(p=>p.id===rescueHost.id).score,50,"revival points and leaderboard update");
  assert.equal(restored.players.find(p=>p.id===rescueHost.id).revives,1);
  const wipe=await create("Wipe");
  await call({type:"start",...wipe});
  for(let i=0;i<80;i++){advance(1600);if((await state(wipe)).status==="defeat")break;}
  assert.equal((await state(wipe)).status,"defeat");
  const replay=await call({type:"start",...wipe});
  assert.equal(replay.body.status,"running");
  assert.equal(replay.body.players.length,1);
  assert.equal(replay.body.players[0].hp,10);
  assert.equal(replay.body.stage,0);
  assert.equal(replay.body.enemyScore,0);
  assert.equal(replay.body.enemyStrikes,0);
  console.log("PASS: name-only join, 10-player cap, shared combat feedback/scoring, five hunts/gates, AI speeds, revive/defeat, PvP and three replay cycles");
} finally {
  Date.now=realNow;
  unlinkSync(temp);
  sqlite.close();
}
