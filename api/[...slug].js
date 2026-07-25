import serverless from 'serverless-http';

let handler;

async function init() {
	try {
		const mod = await import('../backend/dist/server.js');
		const app = mod && (mod.default ?? mod);
		handler = serverless(app);
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('Backend initialization failed in serverless wrapper:', err && err.stack ? err.stack : err);
		// Fallback handler that returns a JSON error instead of timing out
		handler = async (req, res) => {
			res.statusCode = 502;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ success: false, error: 'backend_init_failed', detail: String(err) }));
		};
	}
}

// Initialize immediately but export a function that will wait for init if needed
const initPromise = init();

export default async function (req, res) {
	await initPromise;
	return handler(req, res);
}
