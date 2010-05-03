// irc.js -- an IRC client

var pre = require('./prelude'),
    sys = require('sys'),
    events = require('events'),
    net = require('net');

// connect -- Create a new IRC Client connection.
exports.connect = function(opt) {
    return (new Client(opt)).connect();
};

// Client -- A stream of IRC events
//
// Emits:
//   + connect -- the client has connected
//   + reconnect -- the client is reconnecting
//   + disconnect -- the client gave up trying to connect
//   + data -- a chunk of data has been received
//   + message -- a message has been received
//   + welcome -- connection registered, ready to receive commands
//   + NNN -- received a numeric IRC response code
//   + COMMAND -- received an IRC command
//
// Options:
//   + host -- host name
//   + port -- port number (default: '6667')
//   + nick -- nickname
//   + pass -- password (default: *)
//   + user -- username (default: nick)
//   + name -- real name (default: user)
//   + join -- automatically join these channels
//   + maxAttempts -- reconnection attempts (default: 5)
//   + delay -- reconnection delay in seconds (default: 1)
//
var Client = exports.Client = pre.defclass(events.EventEmitter, {

    init: function(opt) {
        Client.super_.call(this);
        this.options = opt;
        this.log = opt.log || sys.log;
    },

    connect: function() {
        var self = this,
            opt = this.options,
            io = this.io = net.createConnection(opt.port || '6667', opt.host),
            buff = '';

        io.setEncoding('utf8');

        io.bind({
            connect: function() {
                self._reset();
                self._input();
                self._login();
                self.emit('connect');
            },

            data: function(chunk) {
                var pattern = /(.*)\r\n/g,
                    offset = 0,
                    line;

                // Add the next chunk to the buffer.
                buff += chunk;

                // Scan the buffer, handle each non-empty line.
                while ((line = pattern.exec(buff)) !== null) {
                    if (!line) continue;
                    self._handle(line);
                    offset = line.index + line[0].length;
                }

                // Throw away lines handled lines.
                if (offset != 0)
                    buff = buff.substr(offset + 1);

                self.emit('data', chunk);
            },

            end: function() {
                io.end();
            },

            close: function() {
                self.reconnect();
            }
        });

        return this.bind(this.handlers).one(001, function(msg) {
            if (opt.join)
                this.join.apply(this, opt.join);

            self.emit('welcome', msg);
        });
    },

    disconnect: function() {
        this._quit = true;
        this.io.end();
        return this._giveup();
    },

    write: function() {
        var io = this.io;
        for (var idx = 0, lim = arguments.length; idx < lim; idx++)
            arguments[idx] && io.write(arguments[idx]);
        return this;
    },

    send: function(command) {
        var last = arguments.length - 1,
            param;

        this.write(command.toUpperCase());

        for (var idx = 1; idx < last; idx++) {
            if (!(param = arguments[idx]))
                continue;
            this.write(' ', param.toString());
        }

        if (arguments[last])
            this.write(' :', arguments[last].toString());

        return this.write('\r\n');
    },

    // reconnect -- attempt to reconnect using an exponential backoff
    reconnect: function() {
        var self = this,
            io = this.io;

        if ((io.readable && io.writable) || this._quit)
            return this;

        if (this._maxAttempts && (this._attempts > this._maxAttempts))
            return this._giveup();

        this._reconnecting = setTimeout(function() {
            self.emit('reconnect');
            self.connect();
        }, this._delay);

        this._attempts += 1;
        this._delay *= 2;

        return this;
    },

    // ---------- Commands ---------------------------------------------------

    // register -- nick is the only required argument
    register: function(nick, password, user, name) {
        return this
            .send('PASS', password || '*')
            .send('NICK', nick)
            .send('USER', user || nick, 8, '*', name || user || nick);
    },

    quit: function() {
        var self = this,
            io = this.io;

        io.one('drain', function() {
            self.disconnect();
        });

        return this.send('QUIT');
    },

    join: function() {
        for (var idx = 0, lim = arguments.length; idx < lim; idx++) {
            this.send('JOIN', arguments[idx]);
        }
        return this;
    },

    // ---------- Message Handlers -------------------------------------------

    handlers: {
        PING: function(msg, s1, s2) {
            this.log('Ping Pong!');
            this.send('PONG', s1, s2);
        }
    },

    // ---------- Private Methods --------------------------------------------

    _reset: function() {
        var opt = this.options;

        this._quit = false;
        this._attempts = 0;
        this._maxAttempts = opt.maxAttempts || 5;
        this._delay = opt.delay || 1;

        if (this._reconnecting)
            clearTimeout(this._reconnecting);
        this._reconnecting = null;
    },

    _giveup: function() {
        this.emit('disconnect');
        return this;
    },

    _input: function() {
        var self = this,
            input = this.options.input;

        if (input) {
            input.setEncoding('utf8');
            input.bind('data', function(chunk) {
                self.write(chunk.replace(/\n/, "\r\n"));
            });
        }
    },

    _login: function() {
        var opt = this.options;
        if (opt.nick)
            this.register(opt.nick, opt.pass, opt.user, opt.name);
    },

    _handle: function(line) {
        var msg = parse(line);
        this.emit('message', msg);
        this.emit.apply(this, [msg.command, msg].concat(msg.params));
    }
});

// parse -- parse an IRC message
var parse = exports.parse = function (line) {
    // A message looks like this: PREFIX? COMMAND [PARAM ...]
    var parts = /(?:\:(\S+)\s)?(?:(\d{3})|(\w+))(.*)/.exec(line);

    if (!parts) throw new Error('Badly formatted message: "' + line + '".');

    // Parameters are delimited by a single space.  The last parameter
    // begins with ':'.
    var pattern = /\s([^\:\s]\S*)|\:(.*)$/g,
        probe,
        params = [];

    while ((probe = pattern.exec(parts[4]))) {
        params.push(probe[1] || probe[2]);
    }

    return {
        prefix: parts[1],
        command: parts[3] || parseInt(parts[2]),
        params: params
    };
};
