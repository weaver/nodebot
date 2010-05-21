var repl = require('repl'),
    net = require('net'),
    child = require('child_process'),
    pre = require('../lib/prelude'),
    ircbot = require('../lib/ircbot');

pre.withArgs(function(nick, host, port) {
    var bot = ircbot.bot({
        nick: nick,
        host: host,
        join: ['#nodebot']
    });

    bot.command('fortune', 'Tell your fortune.', function(msg) {
        child.exec('fortune -s', function(error, stdout, stderr) {
            if (error)
                msg.reply("That didn't work out so well...");
            else
                msg.reply(stdout.trim().replace(/[\r\n]+\s*/g, ' '));
        });
    });

    // Run a REPL on a local port to allow the client to be controlled
    // externally; export the client into the global namespace.
    global.bot = bot;
    net.createServer(function(socket) {
        repl.start('bot> ', socket);
    }).listen(6665);
});


