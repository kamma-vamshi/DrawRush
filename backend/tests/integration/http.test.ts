import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('HTTP Layer and Fastify Coexistence', () => {
  let serverProcess: ChildProcess;
  const PORT = 3123; // Use a distinct port to avoid conflicts
  let serverUrl = `http://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    // Start the compiled backend with DEV_AUTH
    serverProcess = spawn(process.execPath, ['dist/index.js'], {
      env: { ...process.env, PORT: PORT.toString(), DEV_AUTH: 'true' },
      cwd: process.cwd(),
      stdio: 'ignore',
    });

    // Wait for the server to start (check /health until it responds)
    let retries = 30;
    while (retries > 0) {
      try {
        await new Promise(r => setTimeout(r, 300));
        const res = await fetch(`${serverUrl}/health`);
        if (res.ok) break;
      } catch (e) {
        // Ignore and retry
      }
      retries--;
    }
  }, 20000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('GET /health returns correctly', async () => {
    const res = await fetch(`${serverUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
  });

  it('GET /api/version returns correctly', async () => {
    const res = await fetch(`${serverUrl}/api/version`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.protocolVersion).toBeDefined();
  });
});
