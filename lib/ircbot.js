//// ircbot -- a bot

var pre = require('./prelude'),
    events = require('events'),
    irc = require('./irc');

exports.bot = bot;
exports.command = command;
exports.IrcBot = IrcBot;
exports.dispatcher = dispatcher;


/// --- Shortcuts

function bot(opt) {
  return (new IrcBot(opt)).connect();
}

function command(description, method) {
  method.description = description;
  return method;
}


/// --- IrcBot

function IrcBot(opt) {
  var self = this;

  this.options = opt;

  this.dispatch = dispatcher({ commands: opt.commands });
  this.command = this.dispatch.command;

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

IrcBot.prototype.connect = function() {
  this.client.connect();
  return this;
};


/// --- Command Dispatch

function dispatcher(opt) {
  var commands = pre.extend({}, DEFAULT_COMMANDS, opt.commands),
      patterns = [];

  function match(client, msg, target, text) {
    var // Check for commands addressed to me
	// (e.g. "nodebot: command arg ...")
	probe = /^(\w+)[:,]\s*(\S+)\s*(.*)$/.exec(text),
	cmd_name = probe && probe[2],
	cmd;

    function reply() {
      var args = Array.prototype.slice.call(arguments, 0);
      args.unshift(msg.nick + ':');
      args.unshift(target);
      return client.privmsg.apply(client, args);
    }

    if (probe && probe[1] == client.nickname()) {
      if ((cmd = commands[cmd_name])) {
        msg.reply = reply;
	cmd.call(this, msg, probe[3]);
      }
      else {
	reply('unrecognized command "' + cmd_name + '", try "help".');
      }
    }
  }

  match.command = function(name, description, handler) {
    commands[name] = handler;
    handler.description = description;
    return this;
  };

  return match;
}

var DEFAULT_COMMANDS = {
  help: command('List available commands', function(msg) {
    msg.reply('I know about these commands:');
    for (var name in this._commands) {
      msg.reply(' ', name, '--', this._commands[name].description);
    }
  })
};
