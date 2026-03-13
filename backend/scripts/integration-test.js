const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const serverEntry = path.join(projectRoot, 'server.js');
const dataFilePath = path.join(projectRoot, 'tmp', `integration-${process.pid}.json`);

const port = 3400 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const adminPassword = process.env.ADMIN_PASSWORD || 'integration-test-password';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // ignore
    }
    await delay(200);
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms`);
}

function onceWithTimeout(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`timeout waiting for ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };

    socket.once(eventName, onEvent);
  });
}

function emitAck(socket, eventName, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ack for ${eventName}`)), timeoutMs);
    socket.emit(eventName, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function connectSocket(io, url) {
  const socket = io(url, {
    transports: ['websocket'],
    timeout: 5000,
    forceNew: true,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return socket;
}

async function main() {
  let socketClientEntry;
  try {
    socketClientEntry = require.resolve('socket.io-client', {
      paths: [path.join(projectRoot, 'admin')],
    });
  } catch {
    throw new Error('socket.io-client not found for backend/admin; run npm install in backend/admin');
  }

  const server = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ADMIN_PASSWORD: adminPassword,
      DISCORD_WEBHOOK_URL: '',
      DATA_FILE: dataFilePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const sockets = [];

  try {
    await waitForServer(`${baseUrl}/`);
    const { io } = require(socketClientEntry);

    const userSocket = await connectSocket(io, baseUrl);
    sockets.push(userSocket);

    const attachResult = await emitAck(userSocket, 'attach-client', { clientId: 'integration-client' });
    if (!attachResult || attachResult.ok !== true) {
      throw new Error(`attach-client failed: ${JSON.stringify(attachResult)}`);
    }

    const registerResult = await emitAck(userSocket, 'register-user', { clientId: 'integration-client' });
    if (!registerResult || registerResult.ok !== true || registerResult.recordId !== 1) {
      throw new Error(`register-user failed: ${JSON.stringify(registerResult)}`);
    }

    userSocket.emit('join-page', 'home');

    const adminSocket = await connectSocket(io, baseUrl);
    sockets.push(adminSocket);

    const adminUpdatePromise = onceWithTimeout(adminSocket, 'admin-update');
    const joinAdminResult = await emitAck(adminSocket, 'join-admin', { password: adminPassword });
    if (!joinAdminResult || joinAdminResult.ok !== true) {
      throw new Error(`join-admin failed: ${JSON.stringify(joinAdminResult)}`);
    }

    const initialAdminUpdate = await adminUpdatePromise;
    if (!Array.isArray(initialAdminUpdate.records) || initialAdminUpdate.records.length < 1) {
      throw new Error('admin-update did not include initial records');
    }

    const mainRecord = initialAdminUpdate.records.find((record) => String(record.id) === '1');
    if (!mainRecord) {
      throw new Error('main record missing from admin-update');
    }

    const noteUpdatePromise = onceWithTimeout(adminSocket, 'admin-update');
    const noteResult = await emitAck(adminSocket, 'admin-set-note', { recordId: 1, note: 'checked by integration test' });
    if (!noteResult || noteResult.ok !== true) {
      throw new Error(`admin-set-note failed: ${JSON.stringify(noteResult)}`);
    }

    const noteUpdate = await noteUpdatePromise;
    const notedRecord = noteUpdate.records.find((record) => String(record.id) === '1');
    if (!notedRecord || notedRecord.note !== 'checked by integration test') {
      throw new Error('note was not applied to main record');
    }

    const forceRefillEvent = onceWithTimeout(userSocket, 'force-refill');
    const refillUpdatePromise = onceWithTimeout(adminSocket, 'admin-update');
    const refillResult = await emitAck(adminSocket, 'request-refill', { socketId: userSocket.id, reason: 'integration refill' });
    if (!refillResult || refillResult.ok !== true) {
      throw new Error(`request-refill failed: ${JSON.stringify(refillResult)}`);
    }

    const refillEvent = await forceRefillEvent;
    if (!refillEvent || refillEvent.recordId !== '1.1') {
      throw new Error(`unexpected force-refill event: ${JSON.stringify(refillEvent)}`);
    }

    const refillUpdate = await refillUpdatePromise;
    const subRecord = refillUpdate.records.find((record) => String(record.id) === '1.1');
    if (!subRecord || subRecord.refillReason !== 'integration refill') {
      throw new Error('sub record missing after request-refill');
    }

    const forceCheckoutRefillEvent = onceWithTimeout(userSocket, 'force-checkout-refill');
    const checkoutRefillUpdatePromise = onceWithTimeout(adminSocket, 'admin-update');
    const checkoutRefillResult = await emitAck(adminSocket, 'request-checkout-refill', {
      socketId: userSocket.id,
      recordId: '1.1',
    });
    if (!checkoutRefillResult || checkoutRefillResult.ok !== true) {
      throw new Error(`request-checkout-refill failed: ${JSON.stringify(checkoutRefillResult)}`);
    }

    const checkoutRefillEvent = await forceCheckoutRefillEvent;
    if (!checkoutRefillEvent || checkoutRefillEvent.recordId !== '1.2') {
      throw new Error(`unexpected force-checkout-refill event: ${JSON.stringify(checkoutRefillEvent)}`);
    }

    const checkoutRefillUpdate = await checkoutRefillUpdatePromise;
    const sourceRefillRecord = checkoutRefillUpdate.records.find((record) => String(record.id) === '1.1');
    if (!sourceRefillRecord) {
      throw new Error('source refill record missing after checkout refill');
    }
    const checkoutRefillRecord = checkoutRefillUpdate.records.find((record) => String(record.id) === '1.2');
    if (!checkoutRefillRecord || checkoutRefillRecord.page !== 'checkout') {
      throw new Error('checkout refill did not move record to checkout');
    }

    sockets.forEach((socket) => socket.disconnect());
    console.log('integration-test passed');
  } finally {
    try {
      fs.rmSync(dataFilePath, { force: true });
    } catch {
      // ignore cleanup failures
    }
    sockets.forEach((socket) => {
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    });
    server.kill();
    await delay(200);
    if (server.exitCode && server.exitCode !== 0 && stderr.trim()) {
      console.error(stderr.trim());
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
