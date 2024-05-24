const {Server, ServerResponse} = require('http');
const debug = require('debug')('unit:patch')

const _server_listen = Server.prototype.listen;
const server_is_listen = Symbol('server_is_listen');
Server.prototype.listen = function (...args) {
    const cb = args[args.length - 1];
    const new_callback = function (err, ...args) {
        if (!err) {
            debug("listen success")
            this[server_is_listen] = true;
            this.once('close', function () {
                debug("server.on('close')")
                this[server_is_listen] = false;
                process.emit('SIGTERM');
                // process.emit('SIGINT');
            });
        }
        if (typeof cb === 'function') {
            return cb(err, ...args)
        }
    };
    if (typeof cb !== 'function') {
        args.push(new_callback)
    } else {
        args[args.length - 1] = new_callback
    }
    return _server_listen.call(this, ...args)
}

Server.prototype.close = function (callback) {
    if (this[server_is_listen]) {
        debug('wait unit server...')
        this.once('close', function () {
            debug("server.close OK")
            this[server_is_listen] = false;
            callback && callback()
        });
    } else {
        callback && callback();
    }
}

const _writeBody = ServerResponse.prototype._writeBody;
ServerResponse.prototype._writeBody = function (chunk, encoding, callback) {
    const chunk_type = typeof chunk;
    if (chunk_type === 'function') {
        callback = chunk;
        chunk = null;
    } else if (typeof encoding === 'function') {
        callback = encoding;
        encoding = null;
    }

    if (chunk_type === 'string'
        && encoding && (['utf8', 'utf-8'].includes(encoding.toLowerCase()) === false)) {
        chunk = Buffer.from(chunk, encoding);
    }
    return _writeBody.call(this, chunk, encoding, callback);
};

ServerResponse.prototype.end = function end(chunk, encoding, callback) {
    if (!this.finished) {
        if (typeof chunk === 'function') {
            callback = chunk;
            chunk = null;
            encoding = null;
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = null;
        }

        this._writeBody(chunk, encoding, () => {
            this._end();
            this.writableEnded = true; //兼容fastify.reply
            if (typeof callback === 'function') {
                callback();
            }

            this.emit("finish");

            this.emit("close"); //兼容opentelemetry
        });

        this.finished = true;
    }

    return this;
};

ServerResponse.prototype._sendHeaders = function _sendHeaders() {
    if (!this.headersSent) {
        if (this.headers['transfer-encoding']) {
            debug("remove transfer-encoding")
            this._removeHeader('transfer-encoding')
        }
        this._send_headers(this.statusCode, this.headers, this.headers_count,
            this.headers_len);

        this.headersSent = true;
    }
};