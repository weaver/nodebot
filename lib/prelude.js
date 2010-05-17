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

var extend = exports.extend = function(obj) {
    for (var idx = 1, lim = arguments.length; idx < lim; idx++) {
        var data = arguments[idx];
        for (var key in data) {
            obj[key] = data[key];
        }
    }
    return obj;
};

exports.merge = function() {
    return extend.apply(this, Array.prototype.concat.apply([{}], arguments));
};

exports.filtered = function(seq, pred) {
    return Array.prototype.filter.call(seq, pred || bool);
};

var bool = exports.bool = function(value) {
    return !!value;
}

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
    extend(constructor.prototype, proto);
    return constructor;
};

extend(events.EventEmitter.prototype, {
    bind: function(listeners) {
        if (typeof listeners == 'string')
            this.addListener.apply(this, arguments);
        else
            for (var name in listeners)
                this.addListener(name, listeners[name]);
        return this;
    },

    unbind: function(listeners) {
        if (typeof listeners == 'string')
            this.removeListener.apply(this, arguments);
        else
            for (var name in listeners)
                this.removeListener(name, listeners[name]);
        return this;
    },

    one: function(event, listener) {
        this.addListener(event, function() {
            this.removeListener(event, listener);
            listener.apply(this, arguments);
        });
        return this;
    }

});

