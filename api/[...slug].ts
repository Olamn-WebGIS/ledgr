import serverless from 'serverless-http';
import backendApp from '../backend/src/server.ts';

export default serverless(backendApp);
