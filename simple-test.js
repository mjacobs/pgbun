const net = require('net');

const client = new net.Socket();

client.connect(6432, 'localhost', () => {
    console.log('Connected to pgbun proxy');
    
    // Send a simple startup message
    const buffer = Buffer.alloc(100);
    let offset = 0;
    
    // Length (placeholder)
    buffer.writeUInt32BE(0, offset);
    offset += 4;
    
    // Protocol version
    buffer.writeUInt32BE(0x00030000, offset);
    offset += 4;
    
    // Parameters
    buffer.write('user\0postgres\0database\0postgres\0\0', offset);
    offset += 'user\0postgres\0database\0postgres\0\0'.length;
    
    // Update length
    buffer.writeUInt32BE(offset, 0);
    
    const actualBuffer = buffer.slice(0, offset);
    console.log('Sending startup message:', actualBuffer.length, 'bytes');
    client.write(actualBuffer);
});

client.on('data', (data) => {
    console.log('Received:', data.length, 'bytes');
    console.log('First few bytes:', data.slice(0, Math.min(20, data.length)));
});

client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
});

client.on('error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    client.destroy();
    process.exit(0);
}, 5000);