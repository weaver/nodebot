var sys = require('sys'),
    pre = require('../lib/prelude'),
    irc = require('../lib/irc');

pre.withArgs(function(nick, host, port) {
    var client = irc.connect({
        host: host,
        input: process.openStdin()
    });

    client.bind({
        connect: function() {
            client
                .send('PASS', '*')
                .send('NICK', nick)
                .send('USER', nick, 8, '*', nick);
        },

        message: function(msg) {
            if (typeof msg.command == 'number')
                sys.puts(msg.params[1]);
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
});