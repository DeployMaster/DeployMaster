# json-tcp-socket
JSON messaging over TCP sockets for node.js

###Without TLS

Server:

```javascript
var JSONTCPSOCKET = require('json-tcp-socket');

var JSONTCPSOCKET = new JSONTCPSOCKET({tls: false});
var server = new JSONTCPSOCKET.Server();

server.on('connection', function (socket) {
    console.log('client connected: ', socket.socket.remoteAddress);

    socket.on('data', function (data) {
        console.log('json:', data.item);
    });

    var a = {item: 'A', a: 'asda'};
    var b = {item: 'B', b: 'asdasa'};
    var c = {item: 'asdadsadsadsasd87a8ds7ads67ad6sa6dsa', a: 1, b: 2, c: 3, d: 'asda', d: 'asdadsa'};
    var d = '{"item": "asdaasda", "a": "1", "b": "2", "c": "3", "d": "asda", "d": "asdasda"}';
    var e = '{"item": "ee", "a": "1", "d": "643", "d": "123"}';
    var f = '{"item": "dd", "a": "1", "d": "643", "d": "123"}';

    socket.write(a);
    socket.write(a);
    socket.write(a);
    socket.write(b);

    setInterval(function () {
        socket.write(e);
    }, 1000);

    setInterval(function () {
        socket.write(f);
    }, 1500);

    socket.write(d);
    socket.write(c);
    socket.write(b);
    socket.write(b);
});

server.listen(5055, '0.0.0.0');

console.log('Server listening 0.0.0.0:5055');
```

Client:

```javascript
var JSONTCPSOCKET = require('json-tcp-socket');

var JSONTCPSOCKET = new JSONTCPSOCKET({tls: false});
var socket = new JSONTCPSOCKET.Socket();

socket.on('connect', function () {
    console.log('connected');

    socket.on('data', function (data) {
        console.log('json:', data.item);
    });

    var a = {item: 'A', a: 'asda'};
    var b = {item: 'B', b: 'asda'};
    var c = {item: 'asda', a: 1, b: 2, c: 3, d: 'asda', d: 'asda'};
    var d = '{"item": "98989182391829381", "a": "1", "b": "2", "c": "3", "d": "asda", "d": "1231321"}';
    var e = '{"item": "ee", "a": "1", "d": "643", "d": "123"}';
    var f = '{"item": "dd", "a": "1", "d": "643", "d": "123"}';

    socket.write(a);
    socket.write(d);
    socket.write(b);

    setInterval(function () {
        socket.write(e);
    }, 1000);

    setInterval(function () {
        socket.write(f);
    }, 1500);

    socket.write(b);
    socket.write(a);
    socket.write(a);
    socket.write(a);
    socket.write(c);
});

socket.connect(5055, '127.0.0.1');
```

### TLS

Server:

```javascript
var fs = require('fs');
var JSONTCPSOCKET = require('json-tcp-socket');

var JSONTCPSOCKET = new JSONTCPSOCKET({tls: true});
var server = new JSONTCPSOCKET.Server({
    key: fs.readFileSync(__dirname+'/cert/tls.key'),
    cert: fs.readFileSync(__dirname+'/cert/tls.crt')
});

server.on('secureConnection', function (socket) {
    console.log('client connected: ', socket.socket.remoteAddress);

    socket.on('data', function (data) {
        console.log('json:', data.item);
    });

    var a = {item: 'A', a: 'asdasda'};
    var b = {item: 'B', b: 'asdasda'};
    var c = {item: '1231', a: 1, b: 2, c: 3, d: '1231321', d: '1231321'};
    var d = '{"item": "98989182391829381", "a": "1", "b": "2", "c": "3", "d": "1231", "d": "1231231"}';
    var e = '{"item": "ee", "a": "1", "d": "643", "d": "123"}';
    var f = '{"item": "dd", "a": "1", "d": "643", "d": "123"}';

    socket.write(a);
    socket.write(a);
    socket.write(a);
    socket.write(b);

    setInterval(function () {
        socket.write(e);
    }, 1000);

    setInterval(function () {
        socket.write(f);
    }, 1500);

    socket.write(d);
    socket.write(c);
    socket.write(b);
    socket.write(b);
});

server.listen(5055, '0.0.0.0');

console.log('Server listening 0.0.0.0:5055 over TLS');
```

Client:

```javascript
var JSONTCPSOCKET = require('json-tcp-socket');

var JSONTCPSOCKET = new JSONTCPSOCKET({tls: true});
var socket = new JSONTCPSOCKET.Socket();

socket.on('secureConnect', function () {
    console.log('connected');

    socket.on('data', function (data) {
        console.log('json:', data.item);
    });

    var a = {item: 'A', a: 'asda'};
    var b = {item: 'B', b: 'asda'};
    var c = {item: '1231', a: 1, b: 2, c: 3, d: '1231', d: '1231'};
    var d = '{"item": "1231", "a": "1", "b": "2", "c": "3", "d": "123", "d": "123132"}';
    var e = '{"item": "ee", "a": "1", "d": "643", "d": "123"}';
    var f = '{"item": "dd", "a": "1", "d": "643", "d": "123"}';

    socket.write(a);
    socket.write(d);
    socket.write(b);

    setInterval(function () {
        socket.write(e);
    }, 1000);

    setInterval(function () {
        socket.write(f);
    }, 1500);

    socket.write(b);
    socket.write(a);
    socket.write(a);
    socket.write(a);
    socket.write(c);
});

socket.connect({
    port: 5055,
    host: '127.0.0.1',
    rejectUnauthorized: false
});
```

##License
MIT
