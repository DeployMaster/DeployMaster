/*
 * https://github.com/rohanrhu/json-tcp-socket
 *
 * json-tcp-socket is a node.js module for send-retrieve json
 * at single message over tcp sockets
 * this module is a wrapper for node's net/tls socket
 * 
 * Copyright (C) 2014 Oğuzhan Eroğlu <rohanrhu2@gmail.com>
 * 
 * Licensed under The MIT License (MIT)
 *
 */

/*

-------------------------------------------------
|              JSONTCPSOCKET PROTOCOL           |
-------------------------------------------------

                   6 BYTE HEADER
           ----------------------------
                 16 Bit Signature
                        +
                32 Bit Data Length
           ----------------------------
                   DATA STREAM
           ----------------------------
                   Data Chunks
                      ...
           ----------------------------

! Data can be max. 4294967295 bytes, 3.9 GB

*/

var util = require('util');
var events = require('events');
var net = require('net');
var tls = require('tls');

var JSONTCPSOCKET = function (parameters) {
    var t_JSONTCPSOCKET = this;

    if (typeof parameters == 'undefined') {
        parameters = {};
    }

    if (typeof parameters.tls == 'undefined') {
        parameters.tls = false;
    }

    t_JSONTCPSOCKET.is_tls = parameters.tls;

    if (t_JSONTCPSOCKET.is_tls) {
        t_JSONTCPSOCKET.net_or_tls = tls;
    } else {
        t_JSONTCPSOCKET.net_or_tls = net;
    }

    // -------------------------------------------------------------------

    /**
     * JSONTCPSOCKET.Server()
     * This is a wrapper for net/tls.Server()
     * This class contains only specific methods,
     * others are in the JSONTCPSOCKET.Server.server (net/tls.Server)
     * Param: options (to net/tls.Server)
     */
    t_JSONTCPSOCKET.Server = function (options) {
        events.EventEmitter.call(this);
        var t_Server = this;
        t_Server.server = new t_JSONTCPSOCKET.net_or_tls.Server(options);

        t_Server.listen = function (port, host, backlog) {
            t_Server.server.listen(port, host, backlog);
        };

        t_Server.server.on('connection', function (socket) {
            t_Server.emit('connection', new t_JSONTCPSOCKET.Socket({
                socket: socket
            }));
        });

        t_Server.server.on('secureConnection', function (socket) {
            t_Server.emit('secureConnection', new t_JSONTCPSOCKET.Socket({
                socket: socket
            }));
        });
    };

    util.inherits(t_JSONTCPSOCKET.Server, events.EventEmitter);


    // -------------------------------------------------------------------

    /**
     * JSONTCPSOCKET.Socket()
     * This is a wrapper for net.Socket() or tls.ClearTextStream()
     * Param: parameters (Object) {
     *    socket: (net/tls.Socket)
     * }
     */
    t_JSONTCPSOCKET.Socket = function (parameters) {
        events.EventEmitter.call(this);
        var t_Socket = this;

        if (typeof parameters == 'undefined') {
            parameters = {};
        }

        if (typeof parameters.socket == 'undefined') {
            if (t_JSONTCPSOCKET.is_tls) {
                parameters.socket = null;
            } else {
                parameters.socket = new t_JSONTCPSOCKET.net_or_tls.Socket();
            }
        }

        t_Socket.socket = parameters.socket;
        t_Socket.closed = false;

        var event_handlers_defined = false;

        var define_event_handlers = function () {
            if (event_handlers_defined) {
                return;
            }
            event_handlers_defined = true;

            t_Socket.socket.on('connect', function () {
                t_Socket.emit('connect');
            });

            t_Socket.socket.on('secureConnect', function () {
                t_Socket.emit('secureConnect');
            });

            t_Socket.socket.on('close', function (socket) {
                t_Socket.closed = true;
            });

            t_Socket.socket.on('data', function (packet) {
                t_Socket.read_stream_state.packets.push(packet);
            });
        };

        if (t_Socket.socket) {
            define_event_handlers();
        }

        if (t_JSONTCPSOCKET.is_tls) {
            t_Socket.connect = function (options, callback) {
                t_Socket.socket = t_JSONTCPSOCKET.net_or_tls.connect(options, callback);
                define_event_handlers();
            };
        } else {
            t_Socket.connect = function (port, host) {
                t_Socket.socket.connect(port, host);
            };

            define_event_handlers();
        }

        // -------------------------------------------------------------------

        t_Socket.read_stream_state = {};
        t_Socket.read_stream_state.packet = new Buffer(0);
        t_Socket.read_stream_state.data = new Buffer(0);
        t_Socket.read_stream_state.status = JSONTCPSOCKET.STREAM_STATUS_PENDING;
        t_Socket.read_stream_state.data_length = null;
        t_Socket.read_stream_state.packets = [];
        t_Socket.read_stream_state.rest_packet = false;
        
        var retriever = function () {
            setImmediate(function () {
                if (t_Socket.closed) {
                    return;
                }

                if ((t_Socket.read_stream_state.packets.length > 0) || Buffer.isBuffer(t_Socket.read_stream_state.rest_packet)) {
                    var packet;
                    if (Buffer.isBuffer(t_Socket.read_stream_state.rest_packet)) {
                        packet = new Buffer(t_Socket.read_stream_state.rest_packet);
                        t_Socket.read_stream_state.rest_packet = false;
                    } else {
                        packet = new Buffer(t_Socket.read_stream_state.packets[0]);
                        t_Socket.read_stream_state.packets.splice(0, 1);
                    }

                    if (t_Socket.read_stream_state.status == JSONTCPSOCKET.STREAM_STATUS_PENDING) {
                        t_Socket.read_stream_state.packet = Buffer.concat([t_Socket.read_stream_state.packet, packet]);

                        if (t_Socket.read_stream_state.packet.length >= 6) {
                            if (t_Socket.read_stream_state.packet.readUInt16LE(0) == JSONTCPSOCKET.PACKET_SIGNATURE) {
                                t_Socket.read_stream_state.status = JSONTCPSOCKET.STREAM_STATUS_STREAMING;
                                t_Socket.read_stream_state.data_length = t_Socket.read_stream_state.packet.readUInt32LE(2);
                                t_Socket.read_stream_state.data = new Buffer(0);
                                t_Socket.read_stream_state.packet = t_Socket.read_stream_state.packet.slice(6);
                            } else {
                                t_Socket.read_stream_state.packet = new Buffer(0);
                            }

                            if (t_Socket.read_stream_state.packet.length > 6) {
                                var _check_length = t_Socket.read_stream_state.data.length+t_Socket.read_stream_state.packet.length;
                                var _diff_bytes = _check_length - t_Socket.read_stream_state.data_length;
                                var _bytes_to_rest = t_Socket.read_stream_state.packet.length - _diff_bytes;
                                if (_diff_bytes < 0) {
                                    t_Socket.read_stream_state.data = Buffer.concat([
                                        t_Socket.read_stream_state.data,
                                        t_Socket.read_stream_state.packet
                                    ]);
                                } if (_diff_bytes == 0) {
                                    t_Socket.read_stream_state.data = Buffer.concat([
                                        t_Socket.read_stream_state.data,
                                        t_Socket.read_stream_state.packet
                                    ]);
                                    t_Socket.emit(
                                        'data',
                                        JSON.parse(t_Socket.read_stream_state.data.toString())
                                    );
                                    t_Socket.read_stream_state.packet = new Buffer(0);
                                    t_Socket.read_stream_state.status = JSONTCPSOCKET.STREAM_STATUS_PENDING;
                                } else if (_diff_bytes > 0) {
                                    t_Socket.read_stream_state.data = Buffer.concat([
                                        t_Socket.read_stream_state.data,
                                        t_Socket.read_stream_state.packet.slice(0, _bytes_to_rest)
                                    ]);
                                    t_Socket.read_stream_state.rest_packet = new Buffer(t_Socket.read_stream_state.packet.slice(_bytes_to_rest));
                                    t_Socket.emit(
                                        'data',
                                        JSON.parse(t_Socket.read_stream_state.data.toString())
                                    );
                                    t_Socket.read_stream_state.packet = new Buffer(0);
                                    t_Socket.read_stream_state.status = JSONTCPSOCKET.STREAM_STATUS_PENDING;
                                }
                            }
                        }
                    } else if (t_Socket.read_stream_state.status == JSONTCPSOCKET.STREAM_STATUS_STREAMING) {
                        var _check_length = t_Socket.read_stream_state.data.length+packet.length;
                        var _diff_bytes = _check_length - t_Socket.read_stream_state.data_length;
                        var _bytes_to_rest = packet.length - _diff_bytes;
                        if (_diff_bytes < 0) {
                            t_Socket.read_stream_state.data = Buffer.concat([
                                t_Socket.read_stream_state.data,
                                packet
                            ]);
                        } if (_diff_bytes == 0) {
                            t_Socket.read_stream_state.data = Buffer.concat([
                                t_Socket.read_stream_state.data,
                                packet
                            ]);
                            t_Socket.emit(
                                'data',
                                JSON.parse(t_Socket.read_stream_state.data.toString())
                            );
                            t_Socket.read_stream_state.packet = new Buffer(0);
                            t_Socket.read_stream_state.status = JSONTCPSOCKET.STREAM_STATUS_PENDING;
                        } else if (_diff_bytes > 0) {
                            t_Socket.read_stream_state.data = Buffer.concat([
                                t_Socket.read_stream_state.data,
                                packet.slice(0, _bytes_to_rest)
                            ]);
                            t_Socket.read_stream_state.rest_packet = new Buffer(packet.slice(_bytes_to_rest));
                            t_Socket.emit(
                                'data',
                                JSON.parse(t_Socket.read_stream_state.data.toString())
                            );
                            t_Socket.read_stream_state.packet = new Buffer(0);
                            t_Socket.read_stream_state.status = JSONTCPSOCKET.STREAM_STATUS_PENDING;
                        }
                    }
                }

                retriever();
            });
        };

        retriever();

        // -------------------------------------------------------------------

        /**
         * JSONTCPSOCKET.Socket.write()
         * Param: json
         * Param: encoding
         * Param: callback (for net.Socket.write() callback param)
         * Return: net.Socket.write()
         */
        t_Socket.write = function (json, encoding, cb) {
            var json_buffer;
            var data_buffer;

            if (typeof json == 'object' && !Buffer.isBuffer(json)) {
                json_buffer = new Buffer(JSON.stringify(json));
            } else if (typeof json == 'string') {
                json_buffer = new Buffer(json);
            } else {
                json_buffer = json;
            }

            data_buffer = new Buffer(json_buffer.length+6);
            data_buffer.writeUInt16LE(JSONTCPSOCKET.PACKET_SIGNATURE, 0);
            data_buffer.writeUInt32LE(json_buffer.length, 2);
            data_buffer.write(json_buffer.toString(), 6);
            return t_Socket.socket.write(data_buffer, encoding, cb);
        };
    };

    util.inherits(t_JSONTCPSOCKET.Socket, events.EventEmitter);

    // -------------------------------------------------------------------
};

/*
 * 16 Bit JSONTCPSOCKET Protocol Packet Signature
 * This can be max. 2^^16-1
 * 0000011111101000
 */
JSONTCPSOCKET.PACKET_SIGNATURE = 2024;

JSONTCPSOCKET.STREAM_STATUS_PENDING = 1;
JSONTCPSOCKET.STREAM_STATUS_STREAMING = 2;

module.exports = JSONTCPSOCKET;