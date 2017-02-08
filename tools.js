/*
 * This file is part of DeployMaster (https://github.com/DeployMaster/DeployMaster)
 * 
 * DeployMaster is fast, simple and clean deployment system
 * 
 * Copyright (C) 2014 Oğuzhan Eroğlu <rohanrhu2@gmail.com>
 * 
 * The MIT License (MIT)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

var tools = {};
module.exports = tools;

/*
 * Class: tools.Asem
 * Async semaphore class
 */
tools.Asem = function (callback, this_arg, parameters) {
    this.lock_count = 0;
    if (callback) this.callback = callback;
    if (parameters === null) {
        this_arg = null;
        parameters = this_arg;
    }
    this.this_arg = this_arg;
    this.parameters = parameters;
};

tools.Asem.prototype.lock = function (increment) {
    this.lock_count += increment ? increment: 1;
};

tools.Asem.prototype.leave = function (args) {
    if (args) {
        Object.keys(args).forEach(function (key) {
            this.callback[key] = args[key];
        }, this);
    }
    
    if (--this.lock_count === 0)
        this.callback.apply(this.this_arg, this.parameters);
};

tools.Asem.prototype.leave_or_call = function (args) {
    if (args) {
        Object.keys(args).forEach(function (key) {
            this.callback[key] = args[key];
        }, this);
    }
    
    if (this.lock_count > 0) {
        this.lock_count = this.lock_count-1;
    }
    
    if (this.lock_count === 0)
        this.callback.apply(this.this_arg, this.parameters);
};

/*
 * Class: tools.PromiseQueue
 * Promise runner
 */
tools.PromiseQueue = function () {
    this.queue = [];
    this.is_done = false;
};

tools.PromiseQueue.prototype.run = function (callback) {
    if (this.is_done) {
        callback.call();
    } else {
        this.queue.push(callback);
    }
};

tools.PromiseQueue.prototype.done = function () {
    this.is_done = true;

    this.queue.forEach(function (_callback) {
        _callback.call();
    });
};