var assert = require('assert'),
    irc = require('../lib/irc');

assert.deepEqual(irc.parse(':a.net NOTICE * :*** Found your hostname'), {
    prefix: 'a.net',
    command: 'NOTICE',
    params: ['*', '*** Found your hostname']
});

assert.deepEqual(irc.parse('251 nodebot :Hello'), {
    prefix: undefined,
    command: 251,
    params: ['nodebot', 'Hello']
});
