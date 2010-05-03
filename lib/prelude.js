var sys = require('sys'),
    events = require('events');

// method -- close over the method of an object
exports.method = function(obj, name) {
    return function() {
        return obj[name].apply(obj, arguments);
    };
};

exports.withArgs = function(main) {
    var names = /\(([^\)]+)\)/.exec(main.toString())[1].split(/\s*,\s*/),
        argv = process.argv;

    if (argv.length != (names.length + 2)) {
        sys.puts('usage: ' + argv[0] + ' ' + argv[1] + ' ' + names.join(' '));
        process.exit(1);
    }

    return main.apply(null, argv.slice(2));
};

// deflcass -- declare a class in one statement
//
// Instead of this:
//
//     exports.Foo = function() {}
//     sys.inherits(Foo, Super);
//     Foo.prototype.method = function() {}
//     ...
//
// Do this:
//
//     exports.Foo = defclass(Super, {
//         init: function() {},
//         method: function() {},
//         ...
//     });
exports.defclass = function(base, proto) {
    var constructor = proto.init;
    delete proto.init;
    sys.inherits(constructor, base);
    for (var key in proto) constructor.prototype[key] = proto[key];
    return constructor;
};

events.EventEmitter.prototype.bind = function(listeners) {
    if (typeof listeners == 'string')
        this.addListener.apply(this, arguments);
    else
        for (var name in listeners)
            this.addListener(name, listeners[name]);
    return this;
};

events.EventEmitter.prototype.one = function(event, listener) {
    this.addListener(event, function() {
        this.removeListener(event, listener);
        listener.apply(this, arguments);
    });
    return this;
}

