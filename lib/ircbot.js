//// ircbot -- a bot

var pre = require('./prelude'),
    events = require('events'),
    irc = require('./irc');


/// ---------- Shortcuts --------------------------------------------------------

function bot(opt) {
    return (new IrcBot(opt)).connect();
}

function command(description, method) {
    method.description = description;
    return method;
}


/// ---------- IrcBot -----------------------------------------------------------

function IrcBot(opt) {
    var self = this;

    this.options = opt;
    this._patterns = [];
    this._commands = pre.extend({}, this.commands, opt.commands || {});

    this.client = new irc.Client({
        nick: opt.nick,
        host: opt.host,
        port: opt.port,
        identify: opt.identify,
        join: opt.join,

        ready: {
            privmsg: function(msg, target, text) {
                self.dispatch(this, msg, target, text);
            }
        }
    });
}

IrcBot.prototype.dispatch = function(client, msg, target, text) {
    var // Check for commands addressed to me
        // (e.g. "nodebot: command arg ...")
        probe = /^(\w+)[:,]\s*(\S+)\s*(.*)$/.exec(text),
        cmd;

    if (probe && probe[1] == client.nickname()) {
        if ((cmd = this._commands[probe[2]])) {
            msg.reply = function() {
                var args = Array.prototype.slice.call(arguments, 0);
                args.unshift(target);
                return client.privmsg.apply(client, args);
            };
            cmd.call(this, msg, probe[3]);
        }
    }
};

IrcBot.prototype.commands = {
    help: command('List available commands', function(msg) {
        msg.reply('I know about these commands:');
        for (var name in this._commands) {
            msg.reply(' ', name, '--', this._commands[name].description);
        }
    })
}

IrcBot.prototype.connect = function() {
    this.client.connect();
    return this;
};

IrcBot.prototype.command = function(name, description, handler) {
    this._commands[name] = handler;
    handler.description = description;
    return this;
};

exports.bot = bot;
exports.command = command;
exports.IrcBot = IrcBot;
