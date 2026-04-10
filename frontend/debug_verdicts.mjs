import { Client } from '@heroiclabs/nakama-js';

const client = new Client('defaultkey', '127.0.0.1', '7350', false);

const OpCode = {
  GAME_STATE: 1,
  MOVE: 2,
  MOVE_RESULT: 3,
  GAME_OVER: 4,
  PLAYER_JOINED: 5,
  FORFEIT: 9,
  START_GAME: 10,
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeUser(tag) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
  const id = `dbg-${tag}-${suffix}`;
  const username = `${tag}-${suffix}`;
  const session = await client.authenticateCustom(id, true, username);
  const socket = client.createSocket(false, false);
  await socket.connect(session, true);
  return { session, socket, tag };
}

function parsePayload(data) {
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    return null;
  }
}

function installLogger(socket, label) {
  socket.onmatchdata = (m) => {
    const payload = parsePayload(m.data);
    console.log(`[${label}] op=${m.op_code}`, payload);
  };
}

function waitForGameOver(socket, label, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout waiting GAME_OVER`)), timeoutMs);
    const prev = socket.onmatchdata;
    socket.onmatchdata = (m) => {
      if (typeof prev === 'function') prev(m);
      if (m.op_code === OpCode.GAME_OVER) {
        clearTimeout(timer);
        resolve(parsePayload(m.data));
      }
    };
  });
}

async function createPrivateMatch(hostSession) {
  const res = await client.rpc(hostSession, 'create_room', { mode: 'classic' });
  const payload = typeof res.payload === 'string' ? JSON.parse(res.payload) : res.payload;
  if (!payload?.matchId) throw new Error('create_room missing matchId');
  return payload.matchId;
}

async function joinBoth(host, guest, matchId) {
  await host.socket.joinMatch(matchId);
  await guest.socket.joinMatch(matchId);
  await delay(300);
  host.socket.sendMatchState(matchId, OpCode.START_GAME, '{}');
  await delay(500);
}

async function testWinVerdict() {
  console.log('\n--- testWinVerdict ---');
  const host = await makeUser('host-win');
  const guest = await makeUser('guest-win');
  installLogger(host.socket, 'host-win');
  installLogger(guest.socket, 'guest-win');

  const matchId = await createPrivateMatch(host.session);
  await joinBoth(host, guest, matchId);

  const hostGO = waitForGameOver(host.socket, 'host-win');
  const guestGO = waitForGameOver(guest.socket, 'guest-win');

  // X win sequence: X0 O3 X1 O4 X2
  host.socket.sendMatchState(matchId, OpCode.MOVE, JSON.stringify({ cellIndex: 0 }));
  await delay(200);
  guest.socket.sendMatchState(matchId, OpCode.MOVE, JSON.stringify({ cellIndex: 3 }));
  await delay(200);
  host.socket.sendMatchState(matchId, OpCode.MOVE, JSON.stringify({ cellIndex: 1 }));
  await delay(200);
  guest.socket.sendMatchState(matchId, OpCode.MOVE, JSON.stringify({ cellIndex: 4 }));
  await delay(200);
  host.socket.sendMatchState(matchId, OpCode.MOVE, JSON.stringify({ cellIndex: 2 }));

  const [h, g] = await Promise.all([hostGO, guestGO]);
  console.log('WIN verdict host:', h);
  console.log('WIN verdict guest:', g);

  await host.socket.disconnect();
  await guest.socket.disconnect();
}

async function testDrawVerdict() {
  console.log('\n--- testDrawVerdict ---');
  const host = await makeUser('host-draw');
  const guest = await makeUser('guest-draw');
  installLogger(host.socket, 'host-draw');
  installLogger(guest.socket, 'guest-draw');

  const matchId = await createPrivateMatch(host.session);
  await joinBoth(host, guest, matchId);

  const hostGO = waitForGameOver(host.socket, 'host-draw');
  const guestGO = waitForGameOver(guest.socket, 'guest-draw');

  // Draw sequence
  const seq = [
    [host, 0], [guest, 1], [host, 2], [guest, 4], [host, 3], [guest, 5], [host, 7], [guest, 6], [host, 8],
  ];
  for (const [u, idx] of seq) {
    u.socket.sendMatchState(matchId, OpCode.MOVE, JSON.stringify({ cellIndex: idx }));
    await delay(180);
  }

  const [h, g] = await Promise.all([hostGO, guestGO]);
  console.log('DRAW verdict host:', h);
  console.log('DRAW verdict guest:', g);

  await host.socket.disconnect();
  await guest.socket.disconnect();
}

async function testForfeitVerdict() {
  console.log('\n--- testForfeitVerdict ---');
  const host = await makeUser('host-forfeit');
  const guest = await makeUser('guest-forfeit');
  installLogger(host.socket, 'host-forfeit');
  installLogger(guest.socket, 'guest-forfeit');

  const matchId = await createPrivateMatch(host.session);
  await joinBoth(host, guest, matchId);

  const hostGO = waitForGameOver(host.socket, 'host-forfeit');
  const guestGO = waitForGameOver(guest.socket, 'guest-forfeit');

  guest.socket.sendMatchState(matchId, OpCode.FORFEIT, JSON.stringify({ reason: 'disconnect' }));

  const [h, g] = await Promise.all([hostGO, guestGO]);
  console.log('FORFEIT verdict host:', h);
  console.log('FORFEIT verdict guest:', g);

  await host.socket.disconnect();
  await guest.socket.disconnect();
}

async function main() {
  await testWinVerdict();
  await delay(400);
  await testDrawVerdict();
  await delay(400);
  await testForfeitVerdict();
  console.log('\nAll verdict tests completed.');
}

main().catch((e) => {
  console.error('Verdict test failed:', e);
  process.exit(1);
});
