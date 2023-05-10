const router = require('express').Router();

router.use('/call-status', require('./call-status'));
router.use('/hello-world', require('./tts-hello-world'));
router.use('/auth', require('./auth'));
router.use('/record', require('./record'));
router.use('/gather', require('./gather'));
router.use('/dial', require('./dial'));

module.exports = router;