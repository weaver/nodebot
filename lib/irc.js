//// irc.js -- an IRC client

var pre = require('./prelude'),
    sys = require('sys'),
    events = require('events'),
    net = require('net');


/// ---------- Shortcuts --------------------------------------------------------

// connect -- Create a new IRC Stream and connect.
function connect(opt) {
    return (new Stream(opt)).connect();
};

// client -- Create a new IRC client and connect.
function client(opt) {
    return (new Client(opt)).connect();
}


/// ---------- Stream -----------------------------------------------------------

// Stream -- A stream of IRC events
//
// Events:
//   + connect -- a connection has been established
//   + reconnect -- trying to reconnect
//   + close -- the stream is disconnected
//   + message -- a message has been received
//   + error -- any numeric response between 400 and 599.
//   + NNN -- received a numeric IRC response code
//   + COMMAND -- received an IRC command
//
// Constructor Options:
//   + host -- host name
//   + port -- port number (default: '6667')
//   + reconnect -- reconnection attempts (default: 5)
//   + delay -- reconnection delay in seconds (default: 1)
//
// Methods:
//   + bindStatic(listeners) -- bind listeners on-connect
//   + connect() -- initiate a connection
//   + disconnect() -- terminate the connection
//   + write(value, ...) -- low-level write
//   + send(command, [param, ...]) -- send a command

function Stream(opt) {
    Stream.super_.call(this);
    this.options = opt;
    this._static = [];
}
sys.inherits(Stream, events.EventEmitter);

Stream.prototype.bindStatic = function(listeners) {
    this._static.push(listeners);
    return this;
}

Stream.prototype.connect = function() {
    var self = this,
        opt = this.options,
        io = self._io = new net.Stream();

    // When a connection is started, it's reset and basic handlers are
    // installed.  Client code that uses a stream should initialize
    // any stream state in a reset-listener.

    function start() {
        io.removeAllListeners();
        io.connect(opt.port || '6667', opt.host);
        io.bind({
            connect: reset,
            data: receive,
            close: reconnect,
            end: function () {
                io.end();
            }
        });
    }

    function reset() {
        self._quit = false;
        self.removeAllListeners();
        self._static.forEach(self.bind, self);

        buff = '';
        attempts = 0;
        max_attempts = opt.reconnect || 5;
        delay = opt.delay || 1;

        if (reconnecting)
            clearTimeout(reconnecting);
        reconnecting = null;
        self.emit('connect');
    }

    // IRC is a line-oriented protocol.  As data comes in, buffer it
    // and emit one line at a time as a parsed message.

    var buff;

    function receive(chunk) {
        var pattern = /(.*)\r\n/g,
            offset = 0,
            line;

        // Add the next chunk to the buffer.
        buff += chunk.toString();

        // Scan the buffer, handle each non-empty line.
        while ((line = pattern.exec(buff)) !== null) {
            if (!line) continue;
            handle(line[1]);
            offset = line.index + line[0].length;
        }

        // Throw away handled lines.
        if (offset != 0)
            buff = buff.substr(offset + 1);
    }

    function handle(line) {
        var msg = parse(line),
            event = 'message',
            cmd = msg.command;

        if (typeof cmd == 'number') {
            // Numeric responses in the range 500 to 599 are errors.
            if ((cmd >= 400) && (cmd < 600))
                event = 'error';
        }

        self.emit.apply(self, [cmd, msg].concat(msg.params));
        self.emit(event, msg);
    }

    // A stream will automatically attempt to reconnect using an
    // exponential backoff.

    var reconnecting, attempts, max_attempts, delay;

    function reconnect() {
        // If the underlying stream is already open or the quit flag
        // is set to true, don't try to reconnect.
        if ((io.readyState == 'open') || self._quit)
            return;

        // Give up if there have been too many reconnection attempts.
        if (max_attempts && (attempts > max_attempts)) {
            self.disconnect();
            return;
        }

        // Tear down what's left of the existing connection.
        io.destroy();

        // Restart the connection after a delay.
        reconnecting = setTimeout(function() {
            self.emit('reconnect');
            start();
        }, Math.exp(++attempts));
    }

    start();
    return this;
};

Stream.prototype.disconnect = function() {
    this._quit = true;
    this.emit('close');
    this._io && this._io.destroy();
    return this;
};

Stream.prototype.write = function() {
    var io = this._io;

    for (var idx = 0, lim = arguments.length; idx < lim; idx++)
        arguments[idx] && io.write(arguments[idx]);

    return this;
};

Stream.prototype.send = function(command) {
    var parts = pre.filtered(arguments),
        last = parts[parts.length - 1];

    this.write(parts[0].toUpperCase());
    for (var idx = 1, lim = parts.length - 1; idx < lim; idx++)
        this.write(' ', parts[idx].toString());
    return this.write(' :', parts[parts.length - 1], '\r\n');
};


/// ---------- Client -----------------------------------------------------------

// Client -- an IRC client protocol API
//
// Events:
//   + ready -- connection registered, ready to receive commands
//   + privmsg -- a normal message has been received
//   + action -- a CTCP ACTION has been received.
//
// Options:
//   + nick -- nickname
//   + pass -- password
//   + identify -- /msg NickServ IDENTIFY <value>
//   + user -- username (default: nick)
//   + name -- real name (default: user)
//   + join -- automatically join these channels
//   + ready -- bind these event listeners on-ready
//   + log -- use this procedure to log (default: sys.log)
//   + error - use this procedure to log errors (default: log with prefix)
//
// Methods:
//   + isMine(message) -- is this message addressed to me?
//   + isConnected() -- is a connection established?
//   + nickname() -- the current nickname
//
// Commands:
//   + register(nick, [pass, user, name]) -- log in
//   + nick(name) -- switch nicknames
//   + privmsg(target, text, ...) -- send a message
//   + identify(nick, password) -- identify as registered nickname
//   + ghost(nick) -- kick nick off after identifying
//   + quit() -- disconnect from the server
//   + join(channel, ...) -- join channels

function Client(opt) {
    Client.super_.call(this, opt);
    this.log = opt.log || sys.log;
    this.error = opt.error || function(msg) { this.log('ERROR: ' + msg); };
    this.bindStatic(this.ready);
}
sys.inherits(Client, Stream);

Client.prototype.ready = {
    connect: function() {
        var opt = this.options;

        this._nick = null;
        if (opt.nick)
            this.register(opt.nick, opt.pass, opt.user, opt.name);

        this.one(001, function(msg) {
            opt.ready && this.bind(opt.ready);
            opt.join && this.join.apply(this, opt.join);
            this.emit('ready', msg);
        });
    },

    error: function(msg) {
        // Slice off the nickname.
        this.error(msg.params.slice(1).join(' '));
    },

    NOTICE: function(msg, who) {
        if (!this.isConnected())
            this.log(msg.params.slice(1).join(' '));
    },

    PRIVMSG: function(msg, target, text) {
        var probe = /^\u0001ACTION\s(.*)\u0001$/.exec(text);

        if (probe)
            this.emit('action', msg, target, probe[1]);
        else
            this.emit('privmsg', msg, target, text);
    },

    PING: function(msg, s1, s2) {
        this.log('Ping Pong!');
        this.send('PONG', s1, s2);
    }
};

Client.prototype.isMine = function(msg) {
    return msg.nick == this._nick;
};

Client.prototype.isConnected = function() {
    return !!this._nick;
};

Client.prototype.nickname = function() {
    return this._nick;
};

// Register the connection (log in); nick is the only required
// parameter.
Client.prototype.register = function(nick, password, user, name) {
    password && this.send('PASS', password);
    return this
        .nick(nick)
        .send('USER', user || nick, 8, '*', name || user || nick);
};

Client.prototype.nick = function(name) {
    var self = this,
        opt = this.options,
        nick = name,
        attempts = 1;

    function done() {
        self._nick = nick;
        self.unbind(listeners);
        return self;
    }

    function retry(msg, description) {
        if (++attempts > 3) {
            fail(msg, description);
        }
        else {
            nick = name + '_' + Math.floor(Math.random() * 1000);
            self.send('NICK', nick);
        }
    }

    function fail(msg, description) {
        self.error(msg.params.join(' '));
        if (!self.isConnected())
            self.disconnect();
    }

    function identify() {
        if (opt.identify)
            self.identify(opt.nick, opt.identify).ghost(opt.nick);
    }

    // Watch for errors until a done event is received.
    var listeners = {
        432: fail,   // Erroneous nickname
        484: fail,   // Restricted connection
        433: retry,  // Nickname in use
        436: retry,  // Nickname collision
        437: retry   // Nickname unavailable
    };

    if (!this.isConnected()) {
        this.bind(listeners)
            .one(001, done)   // Done is RPL_WELCOME (001).
            .one(376, identify); // Identify on /MOTD
    }
    else {
        // Done is NICK.
        function maybe_done(msg) {
            if (self.isMine(msg)) {
                done().unbind('NICK', maybe_done);
            }
        }

        this.bind(listeners)
            .bind('NICK', maybe_done);
    }

    return this.send('NICK', name);
};

Client.prototype.privmsg = function(target) {
    var text = Array.prototype.slice.call(arguments, 1).join(' '),
        // The maximum message size is 512, subtract:
        //   * 8 for 'PRIVMSG '
        //   * target.length
        //   * 2 for ' :'
        //   * 2 for '\r\n'
        limit = 500 - target.length;

    while (text.length > limit) {
        this.send('PRIVMSG', target, text.substr(0, limit));
        text = text.substr(limit, text.length);
    }
    return this.send('PRIVMSG', target, text);
};

Client.prototype.identify = function(nick, password) {
    return this.privmsg('NickServ', 'IDENTIFY', nick, password);
};

Client.prototype.ghost = function(nick) {
    if (this._nick != nick)
        this.privmsg('NickServ', 'GHOST', nick).nick(nick);
    return this;
},

Client.prototype.quit = function() {
    var self = this;

    this._io.one('drain', function() {
        self.disconnect();
    });

    return this.send('QUIT');
};

Client.prototype.join = function() {
    for (var idx = 0, lim = arguments.length; idx < lim; idx++) {
        this.send('JOIN', arguments[idx]);
    }
    return this;
};

Client.prototype.me = function(target, action) {
    return this.privmsg(target, '\u0001ACTION ' + action + '\u0001');
};


/// ---------- Extra Methods ----------------------------------------------------

// parse -- parse an IRC message
function parse(line) {
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

    // A message may be addressed to nick!user@host; extract "nick".
    var msgto = /^([^!]+)!/.exec(parts[1]);

    return {
        line: line,
        prefix: parts[1],
        nick: msgto ? msgto[1] : parts[1],
        command: parts[3] || parseInt(parts[2]),
        params: params
    };
};


/// ---------- Exports ----------------------------------------------------------

exports.connect = connect;
exports.client = client;
exports.Stream = Stream;
exports.Client = Client;
exports.parse = parse;
