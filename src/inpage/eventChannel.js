import EventEmitter from 'events';

class EventChannel extends EventEmitter {
    constructor(channelKey = false) {
        super();
        if (!channelKey) {
            throw "No channel scope provider";
        }
        this._channelKey = channelKey;

    }
    _registerEventListener() {
        window.addEventListener('message', ({ data: { isMetamask = false, message, source } }) => {
            if (!isEzDefi || (!message && !source))
                return;

            if (source === this._channelKey)
                return;

            const {
                action,
                data
            } = message;

            this.emit(action, data);
        })
    }

}