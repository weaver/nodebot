var sys = require('sys'),
    repl = require('repl'),
    net = require('net'),
    pre = require('../lib/prelude'),
    irc = require('../lib/irc');

pre.withArgs(function(nick, host, port) {
    var client = irc.connect({
        nick: nick,
        host: host,
        input: process.openStdin(),
        join: ['#nodebot']
    });

    client.bind({
        connect: function() {
            sys.log('Connected.');
        },

        reconnect: function() {
            sys.log('Reconnecting...');
        },

        disconnect: function() {
            sys.log('Client disconnected.  Goodbye.');
            process.exit(0);
        },

        message: function(msg) {
            if (typeof msg.command == 'number')
                sys.puts(msg.command.toString() + ' ' + msg.params.slice(1).join(' '));
        },

        NOTICE: function(msg, target, text)  {
            sys.puts(text);
        },

        MODE: function(msg, nick, mode) {
            sys.log('MODE changed for ' + nick + ' to ' + mode);
        },

        PRIVMSG: function(msg, target, text) {
            sys.log('<' + msg.nick + '> ' + text);
        },

        JOIN: function(msg, channel) {
            activity(client, msg, 'joined ' + channel);
        },

        PART: function(msg, channel) {
            activity(client, msg, 'left ' + channel);
        },

        QUIT: function(msg, reason) {
            activity(client, msg, 'quit, ' + reason);
        }
    });

    function activity(client, msg, action) {
        var who = client.isMine(msg) ? 'You have ' : msg.nick + ' has ';
        log(who + action);
    }

    function log(msg) {
        sys.puts('[' + timestamp() + '] ' + msg);
    }

    function pad (n) {
        return n < 10 ? '0' + n.toString(10) : n.toString(10);
    }

    function timestamp() {
        var now = new Date();
        return [
            [now.getFullYear(), pad(now.getMonth()), pad(now.getDay())].join('.'),
            [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(':')
        ].join(' ');
    }

    global.client = client;
    net.createServer(function(socket) {
        repl.start('client> ', socket);
    }).listen(6665);
});


