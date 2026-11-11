const http = require('node:http');
const { Duplex } = require('node:stream');

class MockSocket extends Duplex {
  constructor() {
    super();
    this.remoteAddress = '127.0.0.1';
    this.writable = true;
  }
  _read() {}
  _write(_chunk, _encoding, callback) {
    callback();
  }
  setTimeout() {}
  destroy() {}
}

/**
 * Executa uma requisição HTTP diretamente na instância Express (em memória),
 * permitindo testes de integração rápidos e determinísticos sem depender de bind de porta TCP.
 */
function invokeApp(app, { method = 'GET', url = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new MockSocket();
    const req = new http.IncomingMessage(socket);
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;

    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = String(v);
    }

    let payloadBuffer = null;
    if (body !== null && body !== undefined) {
      const serialized = typeof body === 'string' ? body : JSON.stringify(body);
      payloadBuffer = Buffer.from(serialized, 'utf8');
      if (!normalizedHeaders['content-type']) {
        normalizedHeaders['content-type'] = 'application/json';
      }
      normalizedHeaders['content-length'] = String(payloadBuffer.length);
    }

    req.headers = normalizedHeaders;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket);

    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      return origWrite(chunk, encoding, cb);
    };

    res.end = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      origEnd(chunk, encoding, cb);

      const rawText = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        json = null;
      }

      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        text: rawText,
        body: json,
      });
    };

    try {
      app.handle(req, res, reject);
      if (payloadBuffer) {
        req.push(payloadBuffer);
      }
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  invokeApp,
};
