import bunyan from "bunyan";

class Log {
    static #logger: bunyan;

    static init() {
        this.#logger = bunyan.createLogger({
            name: "server_app",
            stream: process.stdout
        });
    }

    static get log() {
        if (!this.#logger) {
            this.init();
        }
        return this.#logger;
    }

    static setLogger(logger: bunyan) {
        this.#logger = logger;
    }

}

const log = Log.log;

export {
    log,
    Log
};

