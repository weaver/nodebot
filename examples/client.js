var sys = require('sys'),
    pre = require('../lib/prelude'),
    irc = require('../lib/irc');

pre.withArgs(function(nick, host, port) {
    var client = irc.connect({
        nick: nick,
        host: host,
        input: process.openStdin()
    });

    client.bind({
        message: function(msg) {
            if (typeof msg.command == 'number')
                sys.puts(msg.command.toString() + ': ' + msg.params[1]);
        },

        NOTICE: function(msg, target, text)  {
            sys.puts(text);
        },

        MODE: function(msg, nick, mode) {
            sys.puts('MODE changed for ' + nick + ' to ' + mode);
        },

        PRIVMSG: function(msg, target, text) {
            sys.puts('<' + msg.prefix + '> ' + text);
        },

        JOIN: function(msg, channel) {
            sys.puts('You have joined channel ' + channel);
        },

        PART: function(msg, channel) {
            sys.puts('You have left channel ' + channel);
        }
    });
});
