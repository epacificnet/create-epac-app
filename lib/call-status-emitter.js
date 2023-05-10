const Emitter = require('events');
let singleton;

class CallStatusEmitter extends Emitter {
  constructor() {
    super();
    this.logger;
  }

  /**
   * emit call status events from child calls where event name is the parent call sid
   * @param {*} evt 
   */
  notifyStatusEvent(evt) {
    const {parent_call_sid} = evt;
    if (parent_call_sid) this.emit(parent_call_sid, evt);
  }
}

module.exports = () => {
  if (!singleton) singleton = new CallStatusEmitter();
  return singleton;
};