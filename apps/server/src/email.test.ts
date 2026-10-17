import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { createEmailSender, EmailDeliveryError } from './email.js';

test('a rejected SMTP delivery stays failed even when an auth hook catches it', async (context) => {
  const smtp = createServer((socket) => {
    socket.write('220 local-test SMTP\r\n');
    let pending = '';
    socket.on('data', (chunk) => {
      pending += chunk.toString();
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n');
        const command = pending.slice(0, end).toUpperCase();
        pending = pending.slice(end + 2);
        if (command.startsWith('EHLO') || command.startsWith('HELO')) socket.write('250 local-test\r\n');
        else if (command.startsWith('MAIL FROM')) socket.write('250 OK\r\n');
        else if (command.startsWith('RCPT TO')) socket.write('550 recipient rejected\r\n');
        else if (command === 'QUIT') socket.end('221 closing\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise<void>((resolve, reject) => smtp.close((error) => error ? reject(error) : resolve())));
  const address = smtp.address();
  assert.ok(address && typeof address !== 'string');
  const mail = createEmailSender({ host: '127.0.0.1', port: address.port, secure: false, from: 'noreply@example.test', credentials: null });
  context.after(() => mail.close());
  await mail.verify();
  const failed = await mail.track(async () => {
    await assert.rejects(
      mail.send('member@example.test', 'reset', 'https://example.test/reset?token=private-value'),
      (error: unknown) => {
        assert.ok(error instanceof EmailDeliveryError);
        assert.equal(error.message.includes('private-value'), false);
        assert.equal(error.message.includes('member@example.test'), false);
        return true;
      },
    );
    return 'hook-caught-error';
  });
  assert.deepEqual(failed, { result: 'hook-caught-error', failed: true });
  assert.deepEqual(await mail.track(async () => 'independent-request'), { result: 'independent-request', failed: false });
});
