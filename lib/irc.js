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
// Options:
//   + host -- host name
//   + port -- port number (default: '6667')
//   + nick -- nickname
//   + pass -- password (default: *)
//   + user -- username (default: nick)
//   + name -- real name (default: user)
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
                self._input();
                self._login();
                self.emit('connect');
            },

            data: function(chunk) {
                var pattern = /(.*)\r\n/g,
                    line;

                buff += chunk;
                while ((line = pattern.exec(buff)) !== null) {
                    if (!line) continue;
                    self._handle(line);
                }

                self.emit('data', chunk);
            }
        });

        this.bind({
            PING: pre.method(this, '_PING')
        });

        return this;
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
            this.write(' :', arguments[last].toString(), '\r\n');

        return this;
    },

    // ---------- Private Methods --------------------------------------------

    _input: function() {
        var input = this.options.input;
        input && input.bind('data', pre.method(this, 'write'));
    },

    _login: function() {
        var opt = this.options,
            user = opt.user || opt.nick,
            name = opt.name || user;

        if (opt.nick) {
            this.send('PASS', opt.pass || '*')
                .send('NICK', opt.nick)
                .send('USER', user, 8, '*', name);
        }
    },

    _handle: function(line) {
        var msg = parse(line);
        this.emit('message', msg);
        this.emit.apply(this, [msg.command, msg].concat(msg.params));
    },

    // ---------- Message Handlers -------------------------------------------

    _PING: function(msg, s1, s2) {
        this.log('Ping Pong!');
        this.send('PONG', s1, s2);
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
}
