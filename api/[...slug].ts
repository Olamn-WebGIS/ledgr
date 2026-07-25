import serverless from 'serverless-http';
import backendApp from '../backend/dist/server.js';

export default serverless(backendApp);
