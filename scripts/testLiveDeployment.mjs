/**
 * Live Deployment Verification Script for DrawRush Vercel Production Backend.
 *
 * Usage:
 *   node scripts/testLiveDeployment.mjs <DEPLOYMENT_URL> [AUTH_TOKEN]
 *
 * Example:
 *   node scripts/testLiveDeployment.mjs https://drawrush.vercel.app
 */

import { io as Client } from "socket.io-client";

const targetUrl = process.argv[2]?.replace(/\/$/, "");
const authToken = process.argv[3] || "dev:live-test-user";

if (!targetUrl) {
  console.error("❌ Error: Target deployment URL is required.");
  console.error("Usage: node scripts/testLiveDeployment.mjs <DEPLOYMENT_URL> [AUTH_TOKEN]");
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`🚀 Starting Live Production Tests against: ${targetUrl}`);
console.log(`======================================================\n`);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function testRestEndpoints() {
  console.log(`\n--- Step 1: Testing REST Endpoints ---`);

  // 1. GET /health
  const healthRes = await fetch(`${targetUrl}/health`);
  assert(healthRes.status === 200, "GET /health responds with HTTP 200");
  const healthData = await healthRes.json();
  assert(healthData.status === "ok", "Health status is 'ok'");
  assert(typeof healthData.version === "string", `Version reported: ${healthData.version}`);
  console.log(`     Health payload:`, JSON.stringify(healthData));

  // 2. GET /api/version
  const versionRes = await fetch(`${targetUrl}/api/version`);
  assert(versionRes.status === 200, "GET /api/version responds with HTTP 200");
  const versionData = await versionRes.json();
  assert(versionData.protocolVersion === "1.0.0", "Protocol version matches 1.0.0");

  // 3. GET /api/categories
  const catRes = await fetch(`${targetUrl}/api/categories`);
  assert(catRes.status === 200, "GET /api/categories responds with HTTP 200");
  const catData = await catRes.json();
  assert(Array.isArray(catData.categories) && catData.categories.length > 0, "Word categories loaded successfully");
}

function connectClient(token, name) {
  return new Promise((resolve, reject) => {
    const socket = Client(targetUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      timeout: 10000,
    });

    socket.on("connect", () => {
      console.log(`  🔌 Client '${name}' connected (socket ID: ${socket.id})`);
      resolve(socket);
    });

    socket.on("connect_error", (err) => {
      console.error(`  ❌ Client '${name}' connection error:`, err.message);
      reject(err);
    });
  });
}

async function testRealtimeMultiplayer() {
  console.log(`\n--- Step 2: Testing Real-Time Multiplayer & State Machine ---`);

  const tokenA = `${authToken}-host`;
  const tokenB = `${authToken}-guesser`;

  console.log(`\n[Multiplayer] Connecting Client A (Host)...`);
  const clientA = await connectClient(tokenA, "Host");

  console.log(`\n[Multiplayer] Client A creates room...`);
  let roomCode = "";

  await new Promise((resolve, reject) => {
    clientA.emit("createRoom", { nickname: "HostPlayer", avatar: "avatar_01" });
    clientA.on("roomCreated", (data) => {
      roomCode = data.roomCode;
      assert(!!roomCode, `Room created successfully with code: ${roomCode}`);
      resolve();
    });
    clientA.on("error", reject);
  });

  console.log(`\n[Multiplayer] Connecting Client B (Guesser)...`);
  const clientB = await connectClient(tokenB, "Guesser");

  console.log(`\n[Multiplayer] Client B joins room ${roomCode}...`);
  await new Promise((resolve, reject) => {
    clientB.emit("joinRoom", { roomCode, nickname: "GuesserPlayer", avatar: "avatar_02" });
    clientB.on("roomUpdated", (data) => {
      if (data.players && data.players.length === 2) {
        assert(true, "Client B joined; room has 2 players");
        resolve();
      }
    });
    clientB.on("error", reject);
  });

  console.log(`\n--- Step 3: Testing Drawing Event Distribution ---`);
  // Host draws a stroke
  await new Promise((resolve) => {
    clientB.on("strokeStart", (data) => {
      assert(data.color === "#00FF00", "Client B received broadcast strokeStart from Client A");
      resolve();
    });

    clientA.emit("strokeStart", {
      roomCode,
      strokeId: "test-stroke-1",
      color: "#00FF00",
      size: 5,
      startPoint: { x: 0.25, y: 0.35 },
      sequenceNumber: 1,
    });
  });

  console.log(`\n--- Step 4: Testing Disconnection and Reconnection ---`);
  // Disconnect Client B
  console.log(`  🔌 Disconnecting Client B...`);
  clientB.disconnect();

  // Reconnect Client B with a new socket
  console.log(`  🔌 Reconnecting Client B with new socket...`);
  const clientBReconnect = await connectClient(tokenB, "Guesser-Reconnected");

  await new Promise((resolve, reject) => {
    clientBReconnect.on("reconnectState", (data) => {
      assert(data.roomCode === roomCode, `Reconnected into existing room ${roomCode}`);
      assert(Array.isArray(data.drawingHistory), "Received full drawing history on reconnect");
      resolve();
    });
    clientBReconnect.on("error", reject);

    clientBReconnect.emit("joinRoom", { roomCode, nickname: "GuesserPlayer", avatar: "avatar_02" });
  });

  // Cleanup
  clientA.disconnect();
  clientBReconnect.disconnect();
  console.log(`\n  🧹 Cleaned up sockets.`);
}

async function main() {
  try {
    await testRestEndpoints();
    await testRealtimeMultiplayer();

    console.log(`\n======================================================`);
    console.log(`🎉 ALL LIVE VERIFICATION TESTS PASSED! (${passedTests}/${totalTests})`);
    console.log(`======================================================\n`);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Live test failed:`, err);
    process.exit(1);
  }
}

main();
