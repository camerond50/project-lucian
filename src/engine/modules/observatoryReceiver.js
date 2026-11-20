'use strict';

const http = require('http');
const crypto = require('crypto');

// Opt-in loopback listener. Events are telemetry ONLY, never executable jobs.
function startObservatoryReceiver({ observatory, token, port = 8791, host = '127.0.0.1' }) {
  if (!observatory || typeof observatory.ingest !== 'function') {
    throw new TypeError('Observatory is required.');
  }
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) {
    throw new TypeError('Ingestion requires a secret of at least 32 bytes.');
  }
  if (host !== '127.0.0.1' && host !== '::1') {
    throw new TypeError('Receiver must bind to loopback only.');
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const maxBytes = 4096;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const provided = Buffer.from(req.headers.authorization || '');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      res.writeHead(401);
      res.end('{"error":"unauthorized"}');
      req.resume();
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end('{"status":"ready"}');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/events') {
      res.writeHead(404);
      res.end('{"error":"not_found"}');
      req.resume();
      return;
    }
    const chunks = [];
    let bytes = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        rejected = true;
        res.writeHead(413);
        res.end('{"error":"too_large"}');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const event = observatory.ingest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(202);
        res.end(JSON.stringify({ accepted: true, id: event.id }));
      } catch {
        res.writeHead(400);
        res.end('{"error":"invalid_event"}');
      }
    });
    req.on('error', () => {
      if (!res.writableEnded) {
        res.writeHead(400);
        res.end('{"error":"bad_request"}');
      }
    });
  });
  server.listen(port, host);
  return server;
}

module.exports = { startObservatoryReceiver };
