let app;
let initError;

try {
  console.log('API wrapper: importing backend dist server');
  const mod = await import('../backend/dist/server.js');
  app = mod && (mod.default ?? mod);

  if (!app || typeof app !== 'function') {
    throw new Error('Imported backend server does not export an Express request handler.');
  }

  console.log('API wrapper: backend server imported successfully');
} catch (err) {
  initError = err;
  // eslint-disable-next-line no-console
  console.error('Backend initialization failed in API wrapper:', err && err.stack ? err.stack : err);
}

export default async function handler(req, res) {
  console.log('API wrapper request:', req.method, req.url);

  if (initError) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'backend_init_failed', detail: String(initError) }));
    return;
  }

  try {
    const result = app(req, res);
    if (result && typeof result.then === 'function') {
      await result;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('API wrapper handler error:', err && err.stack ? err.stack : err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'backend_handler_failed', detail: String(err) }));
    }
  }
}
