const assert = require('assert');
assert.ok(process.env.ACCOUNT_SID, 'You must define the ACCOUNT_SID env variable');
assert.ok(process.env.API_KEY, 'You must define the API_KEY env variable');
assert.ok(process.env.REST_API_BASE_URL, 'You must define the REST_API_BASE_URL env variable');
assert.ok(process.env.WS_RECORD_PATH, 'You must define the WS_RECORD_PATH env variable');

const express = require('express');
const app = express();
const Websocket = require('ws');
const {WebhookResponse} = require('@epas/node-client');
const basicAuth = require('express-basic-auth');
const opts = Object.assign({
  timestamp: () => `, "time": "${new Date().toISOString()}"`,
  level: process.env.LOGLEVEL || 'info'
});
const logger = require('pino')(opts);
const {calculateResponse} = require('./lib/utils.js')(logger);
const port = process.env.HTTP_PORT || 3000;
const routes = require('./lib/routes');
app.locals = {
  ...app.locals,
  logger,
  calculateResponse,
  client: require('@epas/node-client')(process.env.ACCOUNT_SID, process.env.API_KEY, {
    baseUrl: process.env.REST_API_BASE_URL
  })
};

/* set up a websocket server to receive audio from the 'listen' verb */
const {recordAudio} = require('./lib/utils.js')(logger);
logger.info(`setting up record path at ${process.env.WS_RECORD_PATH}`);
const wsServer = new Websocket.Server({ noServer: true });
wsServer.setMaxListeners(0);
wsServer.on('connection', recordAudio.bind(null, logger));
if (process.env.HTTP_USERNAME && process.env.HTTP_PASSWORD) {
  const users = {};
  users[process.env.HTTP_USERNAME] = process.env.HTTP_PASSWORD;
  app.use(basicAuth({users}));
}
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
if (process.env.WEBHOOK_SECRET) {
  app.use(WebhookResponse.verifyePasSignature(process.env.WEBHOOK_SECRET));
}
app.use('/', routes);
app.use((err, req, res, next) => {
  logger.error(err, 'burped error');
  res.status(err.status || 500).json({msg: err.message});
});

const server = app.listen(port, () => {
  logger.info(`Example app listening at http://localhost:${port}`);
});
server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (socket) => {
    if (request.url !== process.env.WS_RECORD_PATH) return socket.destroy();
    wsServer.emit('connection', socket, request);
  });
});
