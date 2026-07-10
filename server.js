// SAT Explore — Axiom-7 mission server.
// Serves the game and coordinates multiplayer crews over WebSockets.
//   Compete: relays each pilot's progress; first to launch wins.
//   Co-op:   owns the shared strike counter; 3 strikes => broadcast reset;
//            crew wins when every member has launched.
const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');

const MAX_STRIKES = 3;
const app = express();
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3200;
const server = app.listen(PORT, () => console.log(`Axiom-7 mission server at http://localhost:${PORT}`));

const wss = new WebSocketServer({ server });
const rooms = new Map();
let nextId = 1;

function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
}

function lobbyMsg(room) {
  return { t: 'lobby', host: room.host, players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })) };
}

function playersMsg(room) {
  return { t: 'players', players: [...room.players.values()].map(p =>
    ({ id: p.id, name: p.name, color: p.color, cleared: p.cleared, strikes: p.strikes, finished: p.finished })) };
}

function assignColor(room) {
  const used = new Set([...room.players.values()].map(p => p.color));
  let i = 0; while (used.has(i)) i++;
  return i; // 0-based palette index; client maps to a hex color
}

function checkCrewWin(room) {
  if (room.mode !== 'coop' || room.crewWon || room.players.size === 0) return;
  if ([...room.players.values()].every(p => p.finished)) {
    room.crewWon = true;
    broadcast(room, { t: 'crewWin' });
  }
}

wss.on('connection', ws => {
  let room = null, player = null;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    switch (m.t) {
      case 'create': {
        const code = makeCode();
        player = { id: nextId++, name: String(m.name).slice(0, 14), ws, color: 0, cleared: 0, strikes: 0, finished: false, pos: null };
        room = { code, mode: m.mode === 'coop' ? 'coop' : 'compete', host: player.id,
                 started: false, winner: null, crewWon: false, sharedStrikes: 0,
                 players: new Map([[player.id, player]]) };
        rooms.set(code, room);
        ws.send(JSON.stringify({ t: 'created', code, mode: room.mode, playerId: player.id, color: player.color,
          host: room.host, players: [{ id: player.id, name: player.name, color: player.color }] }));
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code).toUpperCase());
        if (!r) { ws.send(JSON.stringify({ t: 'error', msg: 'NO MISSION FOUND WITH THAT CODE.' })); return; }
        player = { id: nextId++, name: String(m.name).slice(0, 14), ws, color: 0, cleared: 0, strikes: 0, finished: false, pos: null };
        room = r;
        player.color = assignColor(room);
        room.players.set(player.id, player);
        ws.send(JSON.stringify({ t: 'joined', code: room.code, mode: room.mode, playerId: player.id, color: player.color,
          host: room.host, started: room.started,
          players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })) }));
        if (room.started) {
          // Late join: drop the new pilot straight into the mission.
          ws.send(JSON.stringify({ t: 'start' }));
          if (room.mode === 'coop') ws.send(JSON.stringify({ t: 'strikes', n: room.sharedStrikes }));
          broadcast(room, playersMsg(room));
        } else {
          broadcast(room, lobbyMsg(room));
        }
        break;
      }
      case 'startGame': {
        if (!room || player.id !== room.host || room.started) return;
        room.started = true;
        broadcast(room, { t: 'start' });
        broadcast(room, playersMsg(room));
        break;
      }
      case 'progress': {
        if (!room || !room.started) return;
        player.cleared = m.cleared | 0;
        player.strikes = m.strikes | 0;
        if (m.finished) player.finished = true;
        broadcast(room, playersMsg(room));
        if (room.mode === 'compete' && player.finished && !room.winner) {
          room.winner = player.id;
          broadcast(room, { t: 'winner', playerId: player.id, name: player.name });
        }
        checkCrewWin(room);
        break;
      }
      case 'pos': { // relay a pilot's map position to everyone else in the room
        if (!room || !room.started) return;
        player.pos = { x: m.x, y: m.y, facing: m.facing, af: m.af | 0, inRoom: m.inRoom, cleared: m.cleared | 0 };
        const msg = JSON.stringify({ t: 'peer', id: player.id, name: player.name, color: player.color,
          x: m.x, y: m.y, facing: m.facing, af: m.af | 0, inRoom: m.inRoom, cleared: m.cleared | 0 });
        for (const p of room.players.values()) if (p.id !== player.id && p.ws.readyState === 1) p.ws.send(msg);
        break;
      }
      case 'strike': { // co-op shared hull integrity — relay the running total
        if (!room || room.mode !== 'coop' || !room.started) return;
        room.sharedStrikes++;
        broadcast(room, { t: 'strikes', n: room.sharedStrikes });
        break;
      }
      case 'resetStrikes': { // a client's room hit its limit — clear the shared pool
        if (!room || room.mode !== 'coop') return;
        room.sharedStrikes = 0;
        broadcast(room, { t: 'strikes', n: 0 });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!room || !player) return;
    room.players.delete(player.id);
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.host === player.id) room.host = [...room.players.keys()][0];
    if (!room.started) broadcast(room, lobbyMsg(room));
    else { broadcast(room, playersMsg(room)); checkCrewWin(room); }
  });
});
