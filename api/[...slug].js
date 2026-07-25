import serverless from 'serverless-http';

let serverlessHandler;
let initError;

const initPromise = (async () => {
  try {
    console.log('API wrapper: importing backend dist server');
    const mod = await import('../backend/dist/server.js');
    const app = mod && (mod.default ?? mod);

    if (!app || typeof app !== 'function') {
      throw new Error('Imported backend server does not export an Express request handler.');
    }

    serverlessHandler = serverless(app);
    console.log('API wrapper: backend server imported successfully');
  } catch (err) {
    initError = err;
    // eslint-disable-next-line no-console
    console.error('Backend initialization failed in API wrapper:', err && err.stack ? err.stack : err);
  }
})();

export default async function (req, res) {
  await initPromise;

  console.log('API wrapper request:', req.method, req.url);

  if (initError) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'backend_init_failed', detail: String(initError) }));
    return;
  }

  return serverlessHandler(req, res);
}
