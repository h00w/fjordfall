"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Copy, Crosshair, Shield, Swords, Users, Volume2 } from "lucide-react";
import { GameState, GATE, STAGES } from "@/lib/game";

type Session = { code: string; token: string };
const maps = ["isles", "falls", "sea", "deep", "dragon"];
export default function Home() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sound, setSound] = useState(false);
  const serial = useRef(0);
  const seenEvent = useRef(0);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    setCode(new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "");
    setName(sessionStorage.getItem("fjordfall-name") ?? "");
    const saved = sessionStorage.getItem("fjordfall-session");
    if (saved) { try { const s = JSON.parse(saved) as Session; if (s.code && s.token) setSession(s); } catch { sessionStorage.removeItem("fjordfall-session"); } }
  }, []);
  useEffect(() => {
    type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => Promise<object> };
    const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (type: "create" | "join") => {
      const tool: Tool = {
        name: type === "create" ? "create_fjordfall_room" : "join_fjordfall_room",
        title: type === "create" ? "Create Fjordfall room" : "Join Fjordfall room",
        description: type === "create" ? "Create a multiplayer Fjordfall room and enter as a named Viking." : "Join an existing Fjordfall room by six-character code.",
        inputSchema: { type: "object", properties: { name: { type: "string" }, ...(type === "join" ? { code: { type: "string" } } : {}) }, required: type === "join" ? ["name", "code"] : ["name"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const value = input as { name?: unknown; code?: unknown };
          if (typeof value.name !== "string" || !value.name.trim() || (type === "join" && (typeof value.code !== "string" || !/^[A-Z2-9]{6}$/i.test(value.code)))) throw new Error("Enter a name and valid room code.");
          const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, name: value.name, code: value.code }) });
          const body = await response.json() as { token: string; state: GameState; error?: string };
          if (!response.ok) throw new Error(body.error || "Could not enter the room.");
          const next = { code: body.state.code, token: body.token };
          sessionStorage.setItem("fjordfall-session", JSON.stringify(next)); sessionStorage.setItem("fjordfall-name", value.name.trim());
          history.replaceState(null, "", `?room=${next.code}`);
          setName(value.name.trim()); setSession(next); setGame(body.state); setError("");
          return { code: next.code, player: value.name.trim(), stage: body.state.stage };
        },
      };
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    };
    register("create"); register("join");
    return () => lifecycle.abort();
  }, []);
  const beep = useCallback(() => {
    if (!sound) return;
    try {
      const ctx = audio.current ?? new AudioContext(); audio.current = ctx;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "triangle"; osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + .15);
      gain.gain.setValueAtTime(.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .18);
    } catch {}
  }, [sound]);
  const apply = useCallback((next: GameState, requestId: number) => {
    if (requestId < serial.current) return;
    setGame(next);
    if (next.eventSeq > seenEvent.current && next.message) {
      seenEvent.current = next.eventSeq;
      setNotice(next.message);
      window.setTimeout(() => setNotice(""), 3200);
    }
  }, []);
  const action = useCallback(async (type: string, extra: Record<string, unknown> = {}) => {
    if (!session) return;
    const requestId = ++serial.current;
    try {
      const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, ...session, ...extra }) });
      const body = await response.json() as GameState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Connection lost.");
      apply(body, requestId); setError("");
      if (type === "attack") beep();
    } catch (e) { if(type === "state") setError("Connection interrupted. Reconnecting…"); else { setNotice(e instanceof Error ? e.message : "Action failed."); window.setTimeout(() => setNotice(""), 2800); } }
  }, [session, apply, beep]);
  useEffect(() => {
    if (!session) return;
    void action("state"); const timer = window.setInterval(() => void action("state"), 700);
    return () => window.clearInterval(timer);
  }, [session, action]);
  useEffect(() => {
    if (!game || game.status !== "running") return;
    const handle = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      const key = event.key.toLowerCase();
      const direction: Record<string, [number, number]> = { w:[0,-1], arrowup:[0,-1], a:[-1,0], arrowleft:[-1,0], s:[0,1], arrowdown:[0,1], d:[1,0], arrowright:[1,0] };
      if (direction[key]) { event.preventDefault(); void action("move", { dx: direction[key][0], dy: direction[key][1] }); }
      if (key === " " || key === "enter") { event.preventDefault(); void action("attack"); }
      if (key === "e") { event.preventDefault(); void action("interact"); }
      if (key === "r") { event.preventDefault(); void action("revive"); }
    };
    window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle);
  }, [game, action]);
  async function enter(type: "create" | "join") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/game", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type,name,code}) });
      const body = await response.json() as { token: string; state: GameState; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not join.");
      const next = { code: body.state.code as string, token: body.token as string };
      sessionStorage.setItem("fjordfall-session", JSON.stringify(next)); sessionStorage.setItem("fjordfall-name", name.trim());
      history.replaceState(null, "", `?room=${next.code}`); setSession(next); setGame(body.state);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join."); }
    finally { setBusy(false); }
  }
  async function copyInvite() {
    if (!game) return;
    try { await navigator.clipboard.writeText(`${location.origin}/?room=${game.code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Copy unavailable. Share the room code above."); }
  }
  function exitRoom() {
    if (session) void fetch("/api/game", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"leave",...session})}).catch(()=>{});
    serial.current++;
    sessionStorage.removeItem("fjordfall-session"); history.replaceState(null, "", "/"); setSession(null); setGame(null); setCode("");
  }
  const stage = game ? STAGES[Math.min(game.stage, STAGES.length - 1)] : STAGES[0];
  const won = game?.status === "victory";
  const self = game?.players.find(p => p.id === game.selfId);
  const isHost = !!game && game.selfId === game.hostId;
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">ᚠ</span><span>FJORDFALL</span><small>THE FIVE HUNTS</small></div>
      <div className="top-actions">{game && <div className="room-pill"><span>ROOM</span><strong>{game.code}</strong><button aria-label="Copy invite link" onClick={copyInvite}>{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div>}
        <button className="icon-button" title={sound ? "Mute sound" : "Enable sound"} aria-label={sound ? "Mute sound" : "Enable sound"} aria-pressed={sound} onClick={() => setSound(!sound)}><Volume2 size={18} className={sound ? "" : "muted"}/></button></div>
    </header>
    {!game ? <section className="entry">
      <div className="cover" role="img" aria-label="Viking crew facing a dragon across a stormy fjord with floating waterfall islands"><div className="cover-shade"/>
        <div className="cover-copy"><p className="eyebrow">A VIKING MULTIPLAYER HUNT</p><h1>FJORDFALL</h1><p className="cover-line">Gather a crew. Hunt the dragon. Or challenge a rival.</p></div>
        <div className="cover-bottom">THE FJORD WAITS FOR YOUR CREW <span>ᚠ ᚢ ᚦ ᚨ ᚱ</span></div></div>
      <div className="join-panel"><div className="panel-heading"><span className="ornament">✦</span><p className="eyebrow">YOUR EXPEDITION BEGINS HERE</p><h2>Gather your crew</h2><p>Enter a name to play. The room creator chooses the hunt.</p></div>
        <label htmlFor="viking-name">VIKING NAME</label><input id="viking-name" value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="Your name" autoComplete="nickname"/>
        <button className="primary-button" onClick={() => void enter("create")} disabled={busy || !name.trim()}>Create a room <span>→</span></button>
        <div className="divider"><span>OR JOIN YOUR CREW</span></div>
        <label htmlFor="room-code">SIX-CHARACTER ROOM CODE</label><div className="join-line"><input id="room-code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="ABC234" maxLength={6} autoCapitalize="characters"/><button onClick={() => void enter("join")} disabled={busy || !name.trim() || code.length !== 6}>Join room</button></div>
        {error && <p className="error" role="alert">{error}</p>}<p className="tiny-note"><Users size={15}/> 1–10 players · No account · Keyboard and touch controls</p>
      </div>
    </section> : game.status === "lobby" ? <section className="lobby-layout">
      <div className="lobby-art"><div className="cover-shade"/><div className="lobby-art-copy"><p className="eyebrow">ROOM {game.code}</p><h1>The warband gathers</h1><p>{game.players.length} / 10 Vikings joined</p><button className="invite-button" onClick={copyInvite}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Invite copied" : "Copy invite link"}</button></div></div>
      <div className="lobby-panel"><p className="eyebrow">PREPARE YOUR HUNT</p><h2>{isHost ? "Choose the battle" : "Await the room creator"}</h2><p className="lobby-intro">The creator can start whenever they wish. Ready is a signal to the crew, not a requirement.</p>
        <div className="lobby-roster">{game.players.map((p,i)=><div key={p.id} className="lobby-player"><span className="crew-avatar" style={{color:["#ffd492","#98dcf2","#ddabf3","#b9e8af"][i%4]}}>ᛉ</span><strong>{p.name}{p.id===game.hostId?" · creator":""}{p.id===game.selfId?" · you":""}</strong><small>{p.ready?"READY":"GATHERING"}</small></div>)}</div>
        <button className="ready-button" onClick={()=>void action("ready")}>{self?.ready?"✓ Ready — click to change":"Mark me ready"}</button>
        <div className="mode-controls"><label htmlFor="game-mode">BATTLE MODE</label><select id="game-mode" value={game.mode} disabled={!isHost} onChange={e=>void action("config",{mode:e.target.value,difficulty:game.difficulty})}><option value="expedition">Crew vs AI · five hunts</option><option value="duel">Player duel · last Viking standing</option></select>
          <label htmlFor="ai-speed">AI SPEED</label><select id="ai-speed" value={game.difficulty} disabled={!isHost||game.mode==="duel"} onChange={e=>void action("config",{mode:game.mode,difficulty:e.target.value})}><option value="slow">Slow · relaxed</option><option value="medium">Medium · challenging</option></select></div>
        {isHost ? <button className="primary-button" onClick={()=>void action("start")} disabled={game.mode==="duel"&&game.players.filter(p=>p.active).length<2}>Start {game.mode==="duel"?"duel":"hunt"} <span>→</span></button> : <p className="waiting">Waiting for {game.players.find(p=>p.id===game.hostId)?.name ?? "the creator"} to start…</p>}
        {game.mode==="duel"&&game.players.length<2&&<p className="tiny-note">Invite another player to begin a duel.</p>}
        <button className="leave-link" onClick={exitRoom}>Leave room</button>
      </div>
    </section> : <div className="game-layout"><section className="play-column">
      <div className="chapter-line"><div><p className="eyebrow">{game.mode==="duel"?"PLAYER DUEL":`CHAPTER ${game.stage+1} / 5`} <span className="chapter-sep">◆</span> {stage.map} · {game.mode==="expedition"?`AI ${game.difficulty.toUpperCase()}`:"PVP"}</p><h1>{won ? (game.mode==="duel"?"The duel is won":"The fjord is free") : game.status==="defeat"?"The crew has fallen":game.mode==="duel"?"Last Viking standing":stage.realm}</h1><p>{game.status==="running" ? game.mode==="duel"?"Strike opponents at close range. The last survivor wins.":game.gateOpen?"The Rune Gate is open. Reach it and press Interact.":stage.lore : game.message}</p></div><span className="stage-count">{game.mode==="duel"?"⚔":String(game.stage+1).padStart(2,"0")} <small>{game.mode==="duel"?"PVP":"/ 05"}</small></span></div>
      <div className={`arena ${maps[Math.min(game.stage, 4)]}`} role="group" aria-label={`${stage.realm} battle arena`}>
        <div className="terrain terrain-a"/><div className="terrain terrain-b"/><div className="terrain terrain-c"/><div className="map-rune rune-a">ᚦ</div><div className="map-rune rune-b">ᚠ</div>
        {game.mode==="expedition"&&<><div className="npc npc-one" title="Astrid, shieldmaiden"><span>⚔</span><small>ASTRID</small></div><div className="npc npc-two" title="Leif, warrior"><span>🛡</span><small>LEIF</small></div></>}
        {game.mode==="expedition"&&game.status==="running"&&game.hp>0&&<div className={`monster monster-${game.stage}`} style={{ left: `${game.enemyX}%`, top: `${game.enemyY}%` }}><div className="monster-aura"/><span className="monster-glyph">{game.stage === 4 ? "♜" : ["✣","♜","◈","♛"][game.stage]}</span><small>{stage.monster}</small></div>}
        {game.gateOpen&&<div className="rune-gate" style={{left:`${GATE.x}%`,top:`${GATE.y}%`}}><span>◇</span><small>RUNE GATE · E</small></div>}
        {game.players.filter(p => p.active).map((p, index) => <div key={p.id} className={`player-token ${p.id === game.selfId ? "self" : ""} ${p.hp===0?"downed":""}`} style={{ left: `${p.x}%`, top: `${p.y}%`, ["--player-color" as string]: ["#ffd492","#98dcf2","#ddabf3","#b9e8af"][index % 4] }}><span className="player-helm">{p.hp===0?"✕":"ᛉ"}</span><small>{p.name}{p.id === game.selfId ? " (you)" : ""}{p.hp===0?" · DOWN":""}</small></div>)}
        {game.status!=="running"&&<div className="victory"><span>{won?"✦":"⚔"}</span><h2>{won?"VICTORY":"DEFEAT"}</h2><p>{game.message}</p>{isHost&&<button onClick={()=>void action("start")}>PLAY AGAIN · SAME ROOM</button>}</div>}
        <div className="arena-corner top-left">FJORDFALL <span> / {stage.map}</span></div><div className="arena-corner bottom-right">ᚠ ᚢ ᚦ ᚨ ᚱ</div>
      </div>
      <div className="under-arena"><div className="battle-status">{game.mode==="duel"?<><span className="status-icon">⚔</span><strong>{game.players.filter(p=>p.hp>0&&p.active).length} VIKINGS STANDING</strong></>:game.gateOpen?<><span className="status-icon">◇</span><strong>RUNE GATE OPEN · INTERACT TO SAIL ON</strong></>:<><span className="status-icon"><Crosshair size={19}/></span><div><strong>{stage.monster}</strong><small>{stage.size} MONSTER</small></div><div className="health-track"><span style={{ width: `${game.maxHp?game.hp/game.maxHp*100:0}%` }}/></div><b>{game.hp} / {game.maxHp}</b></>}</div>
        <div className="control-bar"><div className="key-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>MOVE</span></div><div className="key-hint"><kbd>SPACE</kbd><span>ATTACK</span></div><div className="key-hint"><kbd>R</kbd><span>REVIVE</span></div><div className="key-hint"><kbd>E</kbd><span>GATE</span></div></div></div>
      {game.status==="running"&&<div className="touch-controls"><div className="dpad"><button aria-label="Move up" onClick={() => void action("move", {dx:0,dy:-1})}><ArrowUp/></button><div><button aria-label="Move left" onClick={() => void action("move", {dx:-1,dy:0})}><ArrowLeft/></button><button aria-label="Move down" onClick={() => void action("move", {dx:0,dy:1})}><ArrowDown/></button><button aria-label="Move right" onClick={() => void action("move", {dx:1,dy:0})}><ArrowRight/></button></div></div><div className="touch-actions">{game.mode==="expedition"&&<><button onClick={()=>void action("revive")}>REVIVE · 3s</button><button onClick={()=>void action("interact")} disabled={!game.gateOpen}>INTERACT</button></>}<button className="attack-button" onClick={() => void action("attack")}><Swords size={22}/> ATTACK</button></div></div>}
    </section><aside className="side-panel"><div className="side-section"><div className="side-title"><span>01 / {game.mode==="duel"?"RIVALS":"CREW"}</span><Shield size={17}/></div><h2>{game.mode==="duel"?"The contenders":"Your warband"}</h2><p className="side-sub">Room <strong>{game.code}</strong> · round {game.round} · {game.players.length}/10 players</p>
        <div className="crew-list">{game.players.map((p, index) => <div key={p.id} className={`crew-row ${p.active ? "" : "offline"}`}><span className="crew-avatar" style={{ color: ["#ffd492","#98dcf2","#ddabf3","#b9e8af"][index % 4] }}>ᛉ</span><div><strong>{p.name}{p.id === game.selfId ? " · you" : ""}{p.id===game.hostId?" · creator":""}</strong><small>{p.active ? p.hp===0?"DOWN":`${p.strikes} strikes · ${p.hp}/10 health` : "Away"}</small></div><span className={`live-dot ${p.active ? "" : "idle"}`}/></div>)}</div>
        <button className="invite-button" onClick={copyInvite}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Link copied" : "Copy invite link"}</button></div>
      {game.mode==="expedition"?<div className="side-section quest-section"><div className="side-title"><span>02 / THE JOURNEY</span><span>✧</span></div><h2>Five hunts</h2><ol className="quest-list">{STAGES.map((s, i) => <li key={s.realm} className={i === game.stage ? "current" : i < game.stage ? "done" : ""}><span className="quest-index">{i < game.stage ? "✓" : String(i + 1).padStart(2,"0")}</span><div><strong>{s.realm}</strong><small>{s.map} · {s.monster}</small></div></li>)}</ol></div>:<div className="side-section"><div className="side-title"><span>02 / DUEL RULES</span><span>✧</span></div><h2>One survivor</h2><p className="side-sub">Close the distance, strike rivals, and stay on your feet. The creator can replay in this room.</p></div>}
      {game.mode==="expedition"&&<div className="allies"><span>✦</span><div><strong>VIKING ALLIES</strong><p>Astrid and Leif add damage to every landed strike. Stand beside a downed teammate and press Revive; stay close for three seconds.</p></div></div>}<div className="side-footer"><span>{self ? `${self.strikes} strikes · ${self.hp}/10 health` : "Joining crew…"}</span><button onClick={exitRoom}>Leave room</button></div>
    </aside></div>}
    {(notice || (game && error)) && <div className="toast" role="status">{error || notice}</div>}
  </main>;
}
