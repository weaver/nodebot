var sys = require('sys'),
    repl = require('repl'),
    net = require('net'),
    pre = require('../lib/prelude'),
    irc = require('../lib/irc');

pre.withArgs(function(nick, host, port) {
    var client = irc.client({
        nick: nick,
        host: host,
        join: ['#nodebot'],

        ready: {
            connect: function() {
                sys.log('Connected.');
            },

            reconnect: function() {
                sys.log('Reconnecting...');
            },

            close: function() {
                sys.log('Client disconnected.  Goodbye.');
                process.exit(0);
            },

            message: function(msg) {
                if (typeof msg.command == 'number')
                    sys.puts(msg.command.toString() + ' ' + msg.params.slice(1).join(' '));
            },

            privmsg: function(msg, target, text) {
                sys.log('<' + msg.nick + '> ' + text);
            },

            action: function(msg, target, text) {
                sys.log('* ' + msg.nick + ' ' + text);
            },

            NOTICE: function(msg, target, text)  {
                sys.puts(text);
            },

            MODE: function(msg, nick, mode) {
                sys.log('MODE changed for ' + nick + ' to ' + mode);
            },

            JOIN: function(msg, channel) {
                activity(this, msg, 'joined ' + channel);
            },

            PART: function(msg, channel) {
                activity(this, msg, 'left ' + channel);
            },

            QUIT: function(msg, reason) {
                activity(this, msg, 'quit, ' + reason);
            }
        }
    });

    function activity(client, msg, action) {
        var who = client.isMine(msg) ? 'You have ' : msg.nick + ' has ';
        sys.log(who + action);
    }

    // Run a REPL on a local port to allow the client to be controlled
    // externally; export the client into the global namespace.
    global.client = client;
    net.createServer(function(socket) {
        repl.start('client> ', socket);
    }).listen(6665);


    // Users type in an exact IRC message that's sent to the server.
    process.openStdin().bind('data', function(chunk) {
        client.write(chunk.toString().replace(/\n/, "\r\n"));
    });
});


