const router = require('express').Router();
const WebhookResponse = require('@epac/node-client').WebhookResponse;
const callStatusEmitter = require('../../call-status-emitter')();


router.post('/', (req, res) => {
  const {logger} = req.app.locals;
  logger.info({payload: req.body}, 'POST /dial');
  try {
    const app = new WebhookResponse();
    app
      .say({text: 'Hi there.  Please hold while we connect your call'})
      .dial({
        answerOnBridge: true,
        callerId: process.env.CALLER_ID,
        referHook: '/dial/refer',
        target: [
          {
            type: 'user',
            name: 'your-extension@yourdomain.com',
          }
        ]
      });
    res.status(200).json(app);
  } catch (err) {
    logger.error({err}, 'Error');
    res.sendStatus(503);
  }
});

router.post('/refer', async(req, res) => {
  const {logger, client} = req.app.locals;
  const {refer_details = {}, parent_call_sid} = req.body;
  const {refer_to_user, referring_call_sid} = refer_details;

  logger.info({payload: req.body}, '/dial/refer - got REFER');
  res.sendStatus(200);

  try {
    /* outdial the requested number and park the party doing the transfer so we can send NOTIFYs*/
    const transferringChild = (!parent_call_sid || referring_call_sid === parent_call_sid);
    const obj = transferringChild ?
      {
        child_call_hook: `/dial/outdial?number=${refer_to_user}&referringCallSid=${referring_call_sid}`,
        call_hook: '/dial/park'
      } :
      {
        call_hook: `/dial/outdial?number=${refer_to_user}&referringCallSid=${referring_call_sid}`,
        child_call_hook: '/dial/park'
      };
    await client.calls.update(req.body.call_sid, obj);

  } catch (err) {
    logger.error({err}, '/dial/refer: Error performing LCC');
  }
});

/* no need for queueing in this scenario, simply outdial the C party */
router.post('/outdial', async(req, res) => {
  const {logger, client} = req.app.locals;
  const {number, referringCallSid} = req.query;
  logger.info({payload: req.body, query: req.query}, 'POST /dial/outdial');
  try {
    const app = new WebhookResponse();
    app.dial({
      answerOnBridge: true,
      callerId: req.body.from,
      referHook: '/dial/refer',
      target: [
        {
          type: 'user',
          name: `${number}@yourdomain.com`
        }
      ]
    });
    res.status(200).json(app);

    /* listen for call-status notifications on the new outdial leg */
    callStatusEmitter.on(req.body.call_sid,
      _onNewCallStatusChange.bind(this, logger, client, req.body.call_sid, referringCallSid));

  } catch (err) {
    logger.error({err}, 'Error');
    res.sendStatus(503);
  }
});

router.post('/park', async(req, res) => {
  const {logger} = req.app.locals;
  logger.info({payload: req.body}, 'POST /dial/park');
  try {
    const app = new WebhookResponse();
    app.enqueue({name: req.body.call_sid});
    res.status(200).json(app);
  } catch (err) {
    logger.error({err}, 'Error');
    res.sendStatus(503);
  }
});

router.post('/hangup', async(req, res) => {
  const {logger} = req.app.locals;
  logger.info({payload: req.body}, 'POST /dial/hangup');
  try {
    const app = new WebhookResponse();
    app.hangup();
    res.status(200).json(app);
  } catch (err) {
    logger.error({err}, 'Error');
    res.sendStatus(503);
  }
});

const _onNewCallStatusChange = async(logger, client, call_sid, referringCallSid, evt) => {
  const {sip_status, sip_reason} = evt;
  if (sip_status > 100) {
    logger.info(`sending NOTIFY with status ${sip_status} ${sip_reason}`);
    try {
      const response = await client.calls.update(referringCallSid, {
        sip_request: {
          method: 'NOTIFY',
          content_type: 'message/sipfrag;version=2.0',
          content: `SIP/2.0 ${sip_status} ${sip_reason}`,
          headers: {
            'Event': 'refer'
          }
        }
      });
      logger.info({response}, 'response to NOTIFY');
    } catch (err) {
      logger.info({err}, 'Failed to send NOTITFY to referring client');
    }
  }
  if (sip_status >= 200) {
    /* hang up referring party */
    callStatusEmitter.removeAllListeners(call_sid);
    logger.info({referringCallSid}, 'hanging up after REFER is complete');
    try {
      await client.calls.update(referringCallSid, {call_hook: '/dial/hangup'});
    } catch (err) {
      logger.info({err}, 'Error hanging up referring party');
    }
  }
};

module.exports = router;