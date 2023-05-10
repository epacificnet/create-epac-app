const router = require('express').Router();
const { WebhookResponse } = require('epac/node-client');

router.post('/', (req, res) => {
  const { logger } = req.app.locals;
  logger.debug({ payload: req.body }, 'POST/dial-time');
  try {
    const app = new WebhookResponse();
    app.dial({
      callerId: req.body.from,
      answerOnBridge: true,
      target: [
        {
          type: 'user',
          name: 'extension_number@yourdomain'
        }
      ]
    });
    res.status(200).json(app);
  } catch (err) {
    logger.error({ err }, 'Error');
    res.sendStatus(503);
  }
});

module.exports = router;