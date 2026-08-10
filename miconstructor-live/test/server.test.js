import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

async function withServer(run) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('health endpoint is ready', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });
});

test('price estimator returns ordered EUR range', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/v1/estimate?type=pintores&sqm=100&quality=estandar`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.currency, 'EUR');
    assert.ok(data.min > 0);
    assert.ok(data.max > data.min);
  });
});

test('specialty test contains at least 12 questions', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/v1/professional-tests/electricistas`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.questions.length >= 12);
    assert.equal(data.specialty, 'electricistas');
  });
});
