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
            sys.puts('MODE changed for ' + nick + ' to ' + mode);
        },

        PRIVMSG: function(msg, target, text) {
            sys.puts('<' + msg.prefix + '> ' + text);
        }
    });

    global.client = client;
    net.createServer(function(socket) {
        repl.start('client> ', socket);
    }).listen(6665);
});


