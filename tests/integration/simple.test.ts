import { test, expect } from 'bun:test';
import net from 'net';

test('raw protocol connection', async () => {
  await new Promise<void>((resolve, reject) => {
    const client = new net.Socket();

    client.connect(6432, 'localhost', () => {
      const buffer = Buffer.alloc(100);
      let offset = 0;

      // Length (placeholder)
      buffer.writeUInt32BE(0, offset);
      offset += 4;

      // Protocol version
      buffer.writeUInt32BE(0x00030000, offset);
      offset += 4;

      // Parameters
      const user = 'user\0postgres\0';
      const database = 'database\0postgres\0';
      const term = '\0';
      const params = user + database + term;
      buffer.write(params, offset);
      offset += params.length;

      // Update length
      buffer.writeUInt32BE(offset, 0);

      const actualBuffer = buffer.slice(0, offset);
      client.write(actualBuffer);
    });

    client.on('data', (data) => {
      // We expect an AuthenticationOk message, which starts with 'R'
      expect(data[0]).toBe(0x52); // 'R'
      client.end();
    });

    client.on('close', () => {
      resolve();
    });

    client.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      reject(new Error("Test timed out"));
      client.destroy();
    }, 5000);
  });
}, 10000); // 10 second timeout