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
//   + welcome -- connection registered, ready to receive commands
//   + newnick -- nickname changed
//   + reconnect -- the client is reconnecting
//   + disconnect -- the client gave up trying to connect
//   + data -- a chunk of data has been received
//   + message -- a message has been received
//   + NNN -- received a numeric IRC response code
//   + COMMAND -- received an IRC command
//
// Options:
//   + host -- host name
//   + port -- port number (default: '6667')
//   + nick -- nickname
//   + pass -- password
//   + identify -- /msg NickServ IDENTIFY <value>
//   + user -- username (default: nick)
//   + name -- real name (default: user)
//   + join -- automatically join these channels
//   + maxAttempts -- reconnection attempts (default: 5)
//   + delay -- reconnection delay in seconds (default: 1)
//   + input -- send messages from this stream to the server
//   + debug -- show debugging information in the log (default: false)
//   + log -- use this procedure to log (default: sys.log)
//   + error - use this procedure to log errors (default: log with prefix)
//
var Client = exports.Client = pre.defclass(events.EventEmitter, {

    init: function(opt) {
        Client.super_.call(this);
        this.options = opt;
        this.log = opt.log || sys.log,
        this.error = opt.error || this.error;
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
                self.emit('connect');
                self._register();
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
                    self._handle(line[1]);
                    offset = line.index + line[0].length;
                }

                // Throw away handled lines.
                if (offset != 0)
                    buff = buff.substr(offset + 1);
            },

            end: function() {
                io.end();
            },

            close: function() {
                self.reconnect();
            }
        });

        return this.bind(this.handlers);
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
        var parts = pre.filtered(arguments),
            last = parts[parts.length - 1];

        // If the last argument is an object, stash it away as reply
        // handlers.  See _handle().
        this._reply = (typeof last == 'object') ? parts.pop() : null;

        this.write(parts[0].toUpperCase());
        for (var idx = 1, lim = parts.length - 1; idx < lim; idx++)
            this.write(' ', parts[idx].toString());
        return this.write(' :', parts[parts.length - 1], '\r\n');
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

    // Bind LISTENERS until EVENT is seen.
    bindUntil: function(event, listeners) {
        var self = this;
        return this.bind(listeners).bind(event, function() {
            self.unbind(listeners);
        });
    },

    isMine: function(msg) {
        return msg.nick == this._nick;
    },

    error: function(message) {
        this.log('ERROR: ' + message);
    },

    // ---------- Commands ---------------------------------------------------

    // Register the connection (log in); nick is the only required
    // parameter.
    register: function(nick, password, user, name) {
        password && this.send('PASS', password);
        return this
            .nick(nick)
            .send('USER', user || nick, 8, '*', name || user || nick);
    },

    nick: function(name) {
        var self = this,
            nick = name,
            attempts = 1;

        function success() {
            self._nick = nick;
            self.unbind(listeners).emit('newnick', nick);
            return self;
        }

        function try_again(msg, description) {
            if (++attempts > 3) {
                give_up(msg, description);
            }
            else {
                nick = name + '_' + Math.floor(Math.random() * 1000);
                self.send('NICK', nick);
            }
        }

        function give_up(msg, description) {
            self.error(msg.params.join(' '));
            self.disconnect();
        }

        // Watch for errors until a success event is received.
        var listeners = {
            432: give_up,   // Erroneous nickname
            484: give_up,   // Restricted connection
            433: try_again, // Nickname in use
            436: try_again, // Nickname collision
            437: try_again  // Nickname unavailable
        };

        if (!this._connected) {
            this.bind(listeners)
                .one(001, success)         // Success is RPL_WELCOME (001).
                .one(376, this._identify); // Identify on /MOTD
        }
        else {
            // Success is NICK.
            function maybe_success(msg) {
                if (msg.nick == self._nick) {
                    success().unbind('NICK', maybe_success)._identify();
                }
            }

            this.bind(listeners)
                .bind('NICK', maybe_success);

        }

        return this.send('NICK', name);
    },

    privmsg: function(target) {
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
    },

    identify: function(password) {
        return this.privmsg('NickServ', 'IDENTIFY', password);
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

    // Handle incoming messages by parsing the line and dispatching on
    // the command.
    _handle: function(line) {
        var msg = parse(line),
            event = 'message',
            cmd = msg.command,
            reply = this._reply;

        this.options.debug && sys.log('DEBUG: ' + line);

        if (typeof cmd == 'number') {
            // Numeric responses in the range 500 to 599 are errors.
            if ((cmd >= 400) && (cmd < 600))
                event = 'error';
        }

        // When dispatching, first check to see if the last send() is
        // expecting a reply that matches this message.  If so, call
        // the reply handlers, and don't emit the message.
        if (reply && reply[cmd])
            reply[cmd].apply(this, [msg].concat(msg.params));
        else if (reply && reply[event])
            reply[cmd].apply(this, [cmd, msg].concat(msg.params));

        // This is not an expected reply; emit the message.
        else {
            this.emit.apply(this, [cmd, msg].concat(msg.params));
            this.emit(event, msg);
        }
    },

    // These event handlers are installed when a connection has been
    // successfully established.
    handlers: {
        connect: function() {
            this._input();
            this.one(001, this._welcome);
        },

        error: function(msg) {
            // Slice off the nickname.
            this.error(msg.params.slice(1).join(' '));
        },

        NOTICE: function(msg, who) {
            if (!this._connected)
                this.log(msg.params.slice(1).join(' '));
        },

        PING: function(msg, s1, s2) {
            this.log('Ping Pong!');
            this.send('PONG', s1, s2);
        }
    },

    // ---------- Private Methods --------------------------------------------

    _reset: function() {
        var opt = this.options;

        this.removeAllListeners();

        this._connected = null;
        this._reply = null;
        this._quit = false;
        this._attempts = 0;
        this._maxAttempts = opt.maxAttempts || 5;
        this._delay = opt.delay || 1;
        this._nick = opt.nick;

        if (this._reconnecting)
            clearTimeout(this._reconnecting);
        this._reconnecting = null;
    },

    _giveup: function() {
        this.emit('disconnect');
        return this;
    },

    _register: function() {
        var opt = this.options;
        if (opt.nick)
            this.register(opt.nick, opt.pass, opt.user, opt.name);
    },

    _identify: function() {
        var opt = this.options;
        if (opt.identify && (this._nick == opt.nick))
            this.identify(opt.identify);
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

    _welcome: function(msg) {
        var opt = this.options;
        this._connected = new Date();
        opt.bind && this.bind(opt.bind);
        opt.join && this.join.apply(this, opt.join);
        this.emit('welcome', msg);
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
