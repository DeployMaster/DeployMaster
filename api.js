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

const os = require('os');
const fs = require('fs');
const fs_path = require('path');
const glob = require('glob');
const crypto = require('crypto');
const util = require('util');
const JSONTCPSOCKET = require('json-tcp-socket');
const clone = require('clone');
const uniqid = require('uniqid');
const JSZip = require('jszip');
const zlib = require('zlib');
const rimraf = require('rimraf');
const shelljs = require('shelljs');

const config = require('./config.js');
const tools = require('./tools.js');

module.exports = function (_parameters) {
    var t_Api = this;

    t_Api.debug_print_enabled = true;

    t_Api.debug_print = function () {
        if (!t_Api.debug_print_enabled) {return;}
        console.log.apply(this, arguments);
    };

    t_Api.FILE_STATUS_NEW = 1;
    t_Api.FILE_STATUS_MODIFIED = 2;
    t_Api.FILE_STATUS_UNMODIFIED = 3;
    t_Api.FILE_STATUS_COPIED = 4;
    t_Api.FILE_STATUS_DELETED = 5;
    t_Api.FILE_STATUS_CHMOD = 6;

    t_Api.FILE_MODIFY_ORDER = [
        t_Api.FILE_STATUS_NEW,
        t_Api.FILE_STATUS_COPIED,
        t_Api.FILE_STATUS_MODIFIED,
        t_Api.FILE_STATUS_DELETED,
        t_Api.FILE_STATUS_CHMOD,
    ];
    
    t_Api.real_path = function (path) {
        if (os.platform() == 'win32') {
            path = path.split(':');
            var _section = path[0].toLowerCase();
            path = _section+':'+path.slice(1);
        }
        if (fs.existsSync(path)) {
            return fs.realpathSync(path);
        }
        return false;
    };

    t_Api.absolute_path = function (path) {
        if (os.platform() == 'win32') {
            path = path.split(':');
            var _section = path[0].toLowerCase();
            path = _section+':'+path.slice(1);
        }
        return fs_path.resolve(path);
    };

    t_Api.relative_index_path = function (path, workdir) {
        return t_Api.absolute_path(path).replace(workdir, '').replace(new RegExp('\\\\', 'g'), '/');
    };

    t_Api.index_abs_path = function (relative_path, workdir) {
        return t_Api.absolute_path(workdir+'/'+relative_path);
    };

    t_Api.parameters = _parameters || {};

    var workdir_path = t_Api.real_path(t_Api.parameters['workdir']);

    t_Api.parameters['workdir'] = workdir_path ? workdir_path: t_Api.parameters['workdir'];
    t_Api.parameters['deploymaster_path'] = t_Api.parameters['workdir']+fs_path.sep+t_Api.parameters['config']['deploymaster_dir'];

    t_Api.parameters['file_config'] = t_Api.parameters['deploymaster_path']+fs_path.sep+'deploymaster.config';
    t_Api.parameters['file_index'] = t_Api.parameters['deploymaster_path']+fs_path.sep+'index.json';
    t_Api.parameters['file_ignorelist'] = t_Api.parameters['workdir']+fs_path.sep+'.ignorelist.deploymaster';

    /**
     * Api.parameters['repo'] (Object) {
     *     config: {
     *         remote: {
     *             address: (String),
     *             port: (Integer),
     *             repo: (String)
     *         }
     *     }
     * }
     *
     */
    t_Api.parameters['repo'] = {
        
    };

    t_Api.parameters['host_repo'] = {
        hostable: false
    };

    t_Api.config_initial = {
        version: t_Api.parameters['config']['version']
    };
    t_Api.parameters['repo']['config'] = false;

    t_Api.index = false;

    t_Api.unpushed_status = false;

    t_Api.tmp = {};
    t_Api.tmp.is_ready = false;
    t_Api.tmp.dir = null;
    t_Api.tmp.path = null;

    t_Api.pack = {};
    t_Api.pack.is_ready = false;
    t_Api.pack.path = null;

    // Helpers

    /**
     * Method: Api.sort_index_by_status()
     *
     * Param: index (Difference Index) (Deploymaster Index Object) (Object)
     * Param: order_status (File Status Order) (Array)
     * 
     * Return: index_keys_sorted (Sorted Keys of Difference Index) (Array)
     *
     */
    t_Api.sort_index_by_status = function (index, order_status) {
        var index_keys_sorted = [];

        var order;
        var order_value;

        var file;
        var file_i;

        for (order=0; order < t_Api.FILE_MODIFY_ORDER.length; order++) {
            order_value = t_Api.FILE_MODIFY_ORDER[order];

            for (file_i in index) {
                file = index[file_i];

                if (file['pull']['status'] == order_value) {
                    index_keys_sorted.push(file_i);
                }
            }
        }

        return index_keys_sorted;
    };

    /**
     * Method: Api.index_key()
     *
     * Param: parameters (Object) {
     *     type: (String) ['file', 'direcotry'],
     *     path: (DeployMaster relative index path) (String)
     *           (Creates with Api.relative_index_path(path, workdir))
     * }
     * 
     * Return: key (String)
     *
     */
    t_Api.index_key = function (parameters) {
        return parameters['type']+':'+parameters['path'];
    };

    /**
     * Method: Api.save_repo_config()
     * Save current config (Api.parameters['repo']['config']) to repo
     * 
     * Return: result (Boolean)
     *
     */
    t_Api.save_repo_config = function () {
        try {
            fs.writeFileSync(
                t_Api.parameters['file_config'],
                JSON.stringify(t_Api.parameters['repo']['config'])
            );
        } catch (e) {
            return false;
        } finally {
            return true;
        }
    };

    /**
     * Method: Api.current_repo()
     * Determines repo for the working directory
     * Return: result (Boolean)
     */
    t_Api.current_repo = function () {
        t_Api.initialized = fs.existsSync(t_Api.parameters['deploymaster_path']);
        if (!t_Api.initialized) {
            return false;
        }

        t_Api.parameters['repo']['config'] = JSON.parse(fs.readFileSync(t_Api.parameters['file_config'], 'utf8'));

        if (fs.existsSync(t_Api.parameters['file_ignorelist'])) {
            var ignorelist = fs.readFileSync(t_Api.parameters['file_ignorelist'], 'utf8').toString().replace(new RegExp('\r', 'g'), '');
            t_Api.parameters['repo']['ignorelist'] = ignorelist !== '' ? ignorelist.split('\n'): [];
        } else {
            t_Api.parameters['repo']['ignorelist'] = [];
        }

        if (t_Api.parameters['repo']['config']['repo']['type'] == 'host') {
            t_Api.repo = new t_Api.HostRepo();
        } else if (t_Api.parameters['repo']['config']['repo']['type'] == 'development') {
            t_Api.repo = new t_Api.DevelopmentRepo();
        }

        return true;
    };

    /**
     * Method: Api.current_index()
     * Updates Api.index from pushed index db
     */
    t_Api.current_index = function () {
        t_Api.index = JSON.parse(fs.readFileSync(t_Api.parameters['file_index'], 'utf8'));
    };

    /**
     * Method: Api.is_path_at()
     * Return is path in path_source
     * return: result (Boolean)
     */
    t_Api.is_path_at = function (path, path_source) {
        if ((path == path_source) || (path.substr(0, path_source.length+1) == path_source+'/')) {
            return true;
        }
        return false;
    };

    /**
     * Method: Api.create_index()
     * Param: parameters (Object) {
     *     workdir: (String),
     *     ignorelist: [Optional] (DeployMaster Ignorelist Object) (Object)
     * }
     * Creates new index
     * Return: index (Deploymaster Index Object) (Object)
     */
    t_Api.create_index = function (parameters) {
        if (typeof parameters.ignorelist == 'undefined') {
            parameters.ignorelist = [];

            var ignorelist_path = t_Api.index_abs_path('.ignorelist.deploymaster', parameters.workdir);

            if (fs.existsSync(ignorelist_path)) {
                fs.readFileSync(ignorelist_path).toString().split('\n').forEach((_ignore_path, _ignore_path_i) => {
                    if ((_ignore_path.length > 1) && _ignore_path[0] == '/') {
                        parameters.ignorelist.push(_ignore_path);
                    }
                });
            }
        }
        
        var new_index = {};
        glob.sync(parameters.workdir+fs_path.sep+'**', {dot: true}).forEach(function (_file_path, file_path_index) {
            var file_path = t_Api.real_path(_file_path);
            var file_stat = fs.lstatSync(file_path);
            var file_path_relative = t_Api.relative_index_path(file_path, parameters.workdir);

            // ignore current path "."
            if (file_path_relative === '') {return;}

            if (t_Api.is_path_at(file_path_relative, '/.deploymaster')) {
                return true;
            }

            if (file_path_relative == '/.ignorelist.deploymaster') {
                return true;
            }

            var key;
            var ignored;
            for (key in parameters.ignorelist) {
                ignored = parameters.ignorelist[key];
                if (t_Api.is_path_at(file_path_relative, ignored)) {
                    return true;
                }
            }
            
            var sha1sum = crypto.createHash('sha1');
            sha1sum.update(file_path_relative);
            var file_path_sha1sum = sha1sum.digest('hex');

            if (file_stat.isDirectory()) {
                new_index[t_Api.index_key({type: 'directory', path: file_path_relative})] = {
                    type: 'directory',
                    path: {
                        sha1sum: file_path_sha1sum,
                        path: file_path_relative
                    },
                    stat: {mode: file_stat.mode},
                    platform: process.platform
                };
            } else {
                var sha1sum = crypto.createHash('sha1');
                sha1sum.update(fs.readFileSync(file_path, 'utf8'));
                var file_sha1sum = sha1sum.digest('hex');
                new_index[t_Api.index_key({type: 'file', path: file_path_relative})] = {
                    type: 'file',
                    path: {
                        sha1sum: file_path_sha1sum,
                        path: file_path_relative
                    },
                    content: {
                        sha1sum: file_sha1sum
                    },
                    stat: {mode: file_stat.mode},
                    platform: process.platform
                };
            }
        });

        return new_index;
    };

    /**
     * Method: Api.update_index()
     * Updates Api.index for unpushed state and save it to index db of the repo
     */
    t_Api.update_index = function () {
        t_Api.index = t_Api.create_index({
            workdir: t_Api.parameters['workdir']
        });
        fs.writeFileSync(t_Api.parameters['file_index'], JSON.stringify(t_Api.index));
    };

    /**
     * Method: Api.get_unpushed_status()
     * Param: index_to_diff (Difference Index) (Deploymaster Index Object) (Object)
     * Return: unpushed_status (Deploymaster Status Object) (Object)
     */
    t_Api.get_unpushed_status = function (index_to_diff) {
        var unpushed_status = {
            index: {
                count: {},
                index: {}
            },
        };

        unpushed_status['index']['count']['total'] = Object.keys(index_to_diff).length;
        unpushed_status['index']['count']['new'] = 0;
        unpushed_status['index']['count']['unmodified'] = 0;
        unpushed_status['index']['count']['modified'] = 0;
        unpushed_status['index']['count']['copied'] = 0;
        unpushed_status['index']['count']['deleted'] = 0;
        unpushed_status['index']['count']['chmod'] = 0;

        var file;
        var file_i;

        for (file_i in index_to_diff) {
            file = index_to_diff[file_i];

            if (file['pull']['status'] == t_Api.FILE_STATUS_NEW) {
                unpushed_status['index']['count']['new']++;
            } else if (file['pull']['status'] == t_Api.FILE_STATUS_MODIFIED) {
                unpushed_status['index']['count']['modified']++;
            } else if (file['pull']['status'] == t_Api.FILE_STATUS_UNMODIFIED) {
                unpushed_status['index']['count']['unmodified']++;
            } else if (file['pull']['status'] == t_Api.FILE_STATUS_COPIED) {
                unpushed_status['index']['count']['copied']++;
            } else if (file['pull']['status'] == t_Api.FILE_STATUS_DELETED) {
                unpushed_status['index']['count']['deleted']++;
            } else if (file['pull']['status'] == t_Api.FILE_STATUS_CHMOD) {
                unpushed_status['index']['count']['chmod']++;
            }
        }

        return unpushed_status;
    };

    /**
     * Method: Api.set_unpushed_status()
     * Updates Api.unpushed_status
     */
    t_Api.set_unpushed_status = function (unpushed_status) {
        t_Api.unpushed_status = unpushed_status;
    };

    /**
     * Method: Api.remove_repo()
     * Removes current repo
     */
    t_Api.remove_repo = function () {
        rimraf.sync(t_Api.parameters['workdir']);
    };

    /**
     * Method: Api.create_index_diff(
     *     index_source (DeployMaster Index Object) (Object),
     *     index_destination (DeployMaster Index Object) (Object)
     * )
     * Return index_diff (Difference index) (DeployMaster Index Object) (Object)
     */
    t_Api.create_index_diff = function (index_source, index_destination, ignorelist) {
        var index_diff = {};

        var _file_source_i;
        var _file_source;

        var _file_destination_i;
        var _file_destination;

        var _is_linked_on_dest;
        var _is_linked_on_source;

        var _file_status;

        var _is_same_path;
        var _is_same_content;
        var _is_same_mode;

        var _file_diff;

        var _deleted_dirs = [];
        var _deleted_dirs_dir_i;
        var _deleted_dirs_dir;
        var _is_parent_not_deleted;

        if (typeof ignorelist == 'undefined') {
            ignorelist = [];
        }

        for (_file_source_i in index_source) {
            _file_source = index_source[_file_source_i];

            var key;
            var ignored;
            var _continue = false;
            for (key in ignorelist) {
                ignored = ignorelist[key];

                if (ignored.length < 2) {
                    continue;
                }

                if (t_Api.is_path_at(_file_source.path.path, ignored)) {
                    _continue = true;
                }
            }
            if (_continue) {
                continue;
            }

            _is_linked_on_dest = false;

            _file_diff = {};
            _file_diff['pull'] = {};

            // looking for "unmodified", "modified", "copied", "new" files

            for (_file_destination_i in index_destination) {
                _file_destination = index_destination[_file_destination_i];

                var key;
                var ignored;
                var _continue = false;
                for (key in ignorelist) {
                    ignored = ignorelist[key];

                    if (ignored.length < 2) {
                        continue;
                    }

                    if (t_Api.is_path_at(_file_destination.path.path, ignored)) {
                        _continue = true;
                    }
                }
                if (_continue) {
                    continue;
                }

                if (_file_source['type'] == 'file' && _file_destination['type'] == 'file') {
                    if (_file_source['path']['sha1sum'] == _file_destination['path']['sha1sum']) {
                        _is_same_path = true;
                    } else {
                        _is_same_path = false;
                    }

                    if (_file_source['content']['sha1sum'] == _file_destination['content']['sha1sum']) {
                        _is_same_content = true;
                    } else {
                        _is_same_content = false;
                    }

                    if (_file_source['stat']['mode'] == _file_destination['stat']['mode']) {
                        _is_same_mode = true;
                    } else {
                        _is_same_mode = false;
                    }

                    if (_is_same_path && _is_same_content && _is_same_mode) {
                        _file_diff['pull']['status'] = t_Api.FILE_STATUS_UNMODIFIED;
                        _is_linked_on_dest = true;
                    } else if (_is_same_path && !_is_same_content) {
                        _file_diff['pull']['status'] = t_Api.FILE_STATUS_MODIFIED;
                        _is_linked_on_dest = true;
                    } else if (_is_same_path && !_is_same_mode) {
                        _file_diff['pull']['status'] = t_Api.FILE_STATUS_CHMOD;
                        _is_linked_on_dest = true;
                    } else if (_is_same_content) {
                        var _same_on_dest = index_destination[t_Api.index_key({
                            path: _file_source.path.path,
                            type: 'file'
                        })];
                        if (typeof _same_on_dest != 'undefined' && (_same_on_dest.content.sha1sum == _file_source.content.sha1sum)) {

                        } else {
                            _file_diff['pull']['status'] = t_Api.FILE_STATUS_COPIED;
                            _file_diff['pull']['copy'] = {};
                            _file_diff['pull']['copy']['source'] = {};
                            _file_diff['pull']['copy']['source']['path'] = {};
                            _file_diff['pull']['copy']['source']['path']['path'] = _file_destination['path']['path'];

                            _is_linked_on_dest = true;
                        }
                    }
                } else if (_file_source['type'] == 'directory' && _file_destination['type'] == 'directory') {
                    if (_file_source['path']['sha1sum'] == _file_destination['path']['sha1sum']) {
                        _file_diff['pull']['status'] = t_Api.FILE_STATUS_UNMODIFIED;

                        _is_linked_on_dest = true;
                    }
                } else if (_file_source['type'] == 'file') {
                    if (_file_source['path']['sha1sum'] == _file_destination['path']['sha1sum']) {
                        _file_diff['pull']['status'] = t_Api.FILE_STATUS_NEW;

                        /*
                        index_diff[t_Api.index_key({type: 'directory', path: _file_destination['path']['path']})] = {
                            pull: {
                                status: t_Api.FILE_STATUS_DELETED
                            },
                            type: 'directory',
                            path: _file_destination['path']
                        };
                        */

                        _is_linked_on_dest = true;
                    }
                } else if (_file_source['type'] == 'directory') {
                    if (_file_source['path']['sha1sum'] == _file_destination['path']['sha1sum']) {
                        _file_diff['pull']['status'] = t_Api.FILE_STATUS_NEW;

                        /*
                        index_diff[t_Api.index_key({type: 'file', path: _file_destination['path']['path']})] = {
                            pull: {
                                status: t_Api.FILE_STATUS_DELETED
                            },
                            type: 'file',
                            path: _file_destination['path'],
                            content: _file_destination['content']
                        };
                        */

                        _is_linked_on_dest = true;
                    }
                }
            }

            if (!_is_linked_on_dest) {
                _file_diff['pull']['status'] = t_Api.FILE_STATUS_NEW;
            }

            _file_diff['type'] = _file_source['type'];
            _file_diff['path'] = _file_source['path'];

            if (_file_source['type'] == 'file') {
                _file_diff['content'] = {};
                _file_diff['content']['sha1sum'] = _file_source['content']['sha1sum'];
            }

            _file_diff.stat = _file_source.stat;
            _file_diff.platform = _file_source.platform;

            if (_file_diff['pull']['status'] != t_Api.FILE_STATUS_UNMODIFIED) {
                index_diff[t_Api.index_key({type: _file_diff['type'], path: _file_source['path']['path']})] = _file_diff;
            }
        }

        // looking for deleted files..

        for (_file_destination_i in index_destination) {
            _file_destination = index_destination[_file_destination_i];

            var key;
            var ignored;
            var _continue = false;
            for (key in ignorelist) {
                ignored = ignorelist[key];
                if (t_Api.is_path_at(_file_destination.path.path, ignored)) {
                    _continue = true;
                }
            }
            if (_continue) {
                continue;
            }

            _is_linked_on_source = false;

            _file_diff = {};
            _file_diff['pull'] = {};

            for (_file_source_i in index_source) {
                _file_source = index_source[_file_source_i];

                var key;
                var ignored;
                var _continue = false;
                for (key in ignorelist) {
                    ignored = ignorelist[key];
                    if (t_Api.is_path_at(_file_source.path.path, ignored)) {
                        _continue = true;
                    }
                }
                if (_continue) {
                    continue;
                }

                if (_file_destination['path']['sha1sum'] == _file_source['path']['sha1sum']) {
                    _is_linked_on_source = true;
                }
            }

            if (!_is_linked_on_source) {
                _is_parent_not_deleted = true;

                for (_deleted_dirs_dir_i in _deleted_dirs) {
                    _deleted_dirs_dir = _deleted_dirs[_deleted_dirs_dir_i];

                    if (t_Api.is_path_at(_file_destination.path.path, _deleted_dirs_dir)) {
                        _is_parent_not_deleted = false;
                    }
                }

                if (_is_parent_not_deleted) {
                    _file_diff['pull']['status'] = t_Api.FILE_STATUS_DELETED;
                    _file_diff['type'] = _file_destination['type'];
                    _file_diff['path'] = _file_destination['path'];
                    
                    if (_file_destination['type'] == 'file') {
                        _file_diff['content'] = {};
                        _file_diff['content']['sha1sum'] = _file_destination['content']['sha1sum'];
                    }

                    _deleted_dirs.push(_file_destination.path.path);
                    index_diff[t_Api.index_key({type: _file_diff['type'], path: _file_destination['path']['path']})] = _file_diff;
                }
            }
        }

        return index_diff;
    };

    /**
     * Method: Api.get_ignorelist()
     * Param: workdir (String)
     * Return: ignorelist (Array)
     */
    t_Api.get_ignorelist = function (workdir) {
        var production_dir_ignorelist_file_path = fs_path.resolve(workdir+fs_path.sep+'.ignorelist.deploymaster');
        var production_dir_ignorelist;
        if (fs.existsSync(production_dir_ignorelist_file_path)) {
            production_dir_ignorelist = fs.readFileSync(production_dir_ignorelist_file_path).toString().replace(new RegExp('\r', 'g'), '');
            production_dir_ignorelist = production_dir_ignorelist !== '' ? production_dir_ignorelist.split('\n'): [];
        } else {
            production_dir_ignorelist = [];
        }
        return production_dir_ignorelist;
    };
    /**
     * Method: Api.create_pack()
     * Param: parameters (Object) {
     *    index: index (Difference Index) (Deploymaster Index Object) (Object),
     *    as: undefined or 'gzip',
     *    return: function (parameters) {
     *       Param: parameters (Object) {
     *          index: [new object] (Index Pack) (Difference Index) (DeployMaster Index Object) (Buffer),
     *          ok: (Boolean)
     *       }
     *    }
     * }
     */
    t_Api.create_pack = function (parameters) {
        t_Api.need_tmp_dir();
        t_Api.pack.path = t_Api.tmp.path+fs_path.sep+'dpack.zip';

        var zip = new JSZip();

        for (var _key in parameters.index) {
            _file = parameters.index[_key];

            if (
                (_file.pull.status == t_Api.FILE_STATUS_NEW)
                ||
                (_file.pull.status == t_Api.FILE_STATUS_MODIFIED)
            ) {
                if (_file.type == 'file') {
                    zip.file(_file.path.path, fs.createReadStream(
                        t_Api.index_abs_path(_file.path.path, t_Api.parameters['workdir'])
                    ));
                } else if (_file.type == 'directory') {
                    zip.folder(_file.path.path);
                }
            }
        }

        zip
        .generateNodeStream({type: 'nodebuffer', streamFiles: true})
        .pipe(fs.createWriteStream(t_Api.pack.path))
        .on('finish', function () {
            t_Api.pack.is_ready = true;

            var pack = clone(parameters.index);

            if (typeof parameters.as != 'undefined' && parameters.as == 'gzip') {
                var pack_buffer = new Buffer(JSON.stringify(pack));
                zlib.gzip(pack_buffer, function (error, result) {
                    parameters.return({
                        index: result,
                        ok: true
                    });
                });
            } else {
                parameters.return({
                    index: pack,
                    ok: true
                });
            }
        });
    };

    t_Api.need_tmp_dir = function () {
        if (t_Api.tmp.is_ready) {
            return false;
        }

        t_Api.tmp.dir = uniqid('deploymaster-');
        t_Api.tmp.path = os.tmpdir()+fs_path.sep+t_Api.tmp.dir;
        fs.mkdirSync(t_Api.tmp.path);
        t_Api.tmp.is_ready = true;

        return true;
    };

    t_Api.clear_tmp_dir = function () {
        if (t_Api.tmp.is_ready) {
            try {
                rimraf.sync(t_Api.tmp.path);
            } catch (error) {}

            t_Api.tmp.is_ready = false;
            t_Api.tmp.path = null;

            t_Api.pack.is_ready = false;
            t_Api.pack.path = null;
        }
    };

    t_Api.DevelopmentRepo = function (_parameters) {
        var t_DevelopmentRepo = this;

        t_DevelopmentRepo.parameters = _parameters || {};

        t_DevelopmentRepo.parameters['remote'] = {
            address: false,
            port: false,
            repo: false,
            is_connected: false,
        };

        t_DevelopmentRepo.config_initial = t_Api.config_initial;
        t_DevelopmentRepo.config_initial['repo'] = {
            type: 'development',
            remote: {
                address: false,
                port: false,
                tls: {
                    use_tls: true,
                    trusted_certs: []
                },
                password: false,
                production_repos: {
                    /*
                    "production": {
                        "directory": ""
                    }
                    */
                },
            }
        };

        t_DevelopmentRepo.initialized = false;
        t_DevelopmentRepo.config = t_Api.parameters['repo']['config'];

        t_DevelopmentRepo.remote_index = false;

        t_DevelopmentRepo.init = function () {
            var result = true;

            result = result && (fs.mkdirSync(t_Api.parameters['deploymaster_path']) === undefined)
            && (fs.writeFileSync(t_Api.parameters['file_config'], JSON.stringify(t_Api.config_initial)) === undefined)
            && (fs.writeFileSync(t_Api.parameters['file_index'], '{}') === undefined);

            t_Api.update_index();

            return result;
        };

        /**
         * Method: Api.DevelopmentRepo.auth()
         * Param: parameters (Object) {
         *     return: function (result) {...},
         *         Param: result (Object) {
         *            authorized: (Boolean)
         *         }
         *     password: (String)
         * }
         */
        t_DevelopmentRepo.auth = function (parameters) {
            t_DevelopmentRepo.parameters['remote']['callbacks']['authorize_return'] = parameters['return'];
            t_DevelopmentRepo.parameters['remote']['socket'].write({
                event: 'authorize',
                data: {
                    password: parameters.password
                }
            });
        };

        /**
         * Method: Api.DevelopmentRepo.get_remote_index()
         * Param: parameters (Object) {
         *     return: function (result) {...}
         * }
         * Return: remote_index (Deploymaster Index Object) (Object)
         */
        t_DevelopmentRepo.get_remote_index = function (parameters) {
            t_DevelopmentRepo.parameters['remote']['callbacks']['get_index_return'] = parameters['return'];
            t_DevelopmentRepo.parameters['remote']['socket'].write({
                event: 'get_index',
                data: {
                    workdir: parameters.workdir
                }
            });
        };

        /**
         * Method: Api.DevelopmentRepo.set_remote_index()
         * Param: index to set (Deploymaster Index Object) (Object)
         */
        t_DevelopmentRepo.set_remote_index = function (index) {
            t_DevelopmentRepo.remote_index = index;
        };

        /**
         * Method: Api.DevelopmentRepo.connect()
         * Param: parameters (Object) {
         *     on_connected: function () {...},
         *     on_disconnected: function () {...},
         *     on_error: function () {...},
         * }
         * Connect to host repo
         */
        t_DevelopmentRepo.connect = function (parameters) {
            var result = true;

            var protocol;

            t_DevelopmentRepo.parameters['remote']['callbacks'] = {};

            if (t_Api.parameters['repo']['config']['repo']['remote']['tls']['use_tls']) {
                var connect_parameters = {};

                connect_parameters['port'] = t_Api.parameters['repo']['config']['repo']['remote']['port'];
                connect_parameters['host'] = t_Api.parameters['repo']['config']['repo']['remote']['address'];
                connect_parameters['rejectUnauthorized'] = false;

                t_DevelopmentRepo.parameters['remote']['socket'] = new (new JSONTCPSOCKET({tls: true})).Socket();
                t_DevelopmentRepo.parameters['remote']['socket'].connect(
                    connect_parameters,
                    function () {
                        if (!t_DevelopmentRepo.parameters['remote']['socket'].socket.authorized) {
                            var certificate = t_DevelopmentRepo.parameters['remote']['socket'].socket.getPeerCertificate();

                            is_trusted = false;
                            t_Api.parameters['repo']['config']['repo']['remote']['tls']['trusted_certs'].forEach(function (trusted_cert) {
                                if (trusted_cert.fingerprint == certificate.fingerprint) {
                                    is_trusted = true;
                                    return false;
                                }
                            });

                            if (!is_trusted) {
                                if (parameters.on_ask_for_tls_certificate) {
                                    parameters.on_ask_for_tls_certificate({
                                        certificate: certificate,
                                        callback: function (answer) {
                                            if (answer.permanently) {
                                                t_Api.parameters['repo']['config']['repo']['remote']['tls']['trusted_certs'].push({
                                                    fingerprint: certificate.fingerprint
                                                });
                                                t_Api.save_repo_config();
                                            }

                                            if (answer.trust) {
                                                t_DevelopmentRepo.parameters['remote']['is_connected'] = true;
                                                if (parameters['on_connected']) {
                                                    parameters['on_connected']();
                                                }
                                            } else {
                                                t_DevelopmentRepo.parameters['remote']['is_connected'] = false;
                                                t_DevelopmentRepo.disconnect(); // ...
                                            }
                                        }
                                    });
                                } else {
                                    t_DevelopmentRepo.parameters['remote']['is_connected'] = false;
                                    t_DevelopmentRepo.disconnect(); // ...
                                }
                            } else {
                                t_DevelopmentRepo.parameters['remote']['is_connected'] = true;
                                if (parameters['on_connected']) {
                                    parameters['on_connected']();
                                }
                            }
                        } else {
                            t_DevelopmentRepo.parameters['remote']['is_connected'] = true;
                            if (parameters['on_connected']) {
                                parameters['on_connected']();
                            }
                        }
                    }
                );
            } else {
                t_DevelopmentRepo.parameters['remote']['socket'] = new (new JSONTCPSOCKET()).Socket();

                t_DevelopmentRepo.parameters['remote']['socket'].on('connect', function () {
                    t_DevelopmentRepo.parameters['remote']['is_connected'] = true;
                    if (parameters['on_connected']) {
                        parameters['on_connected']();
                    }
                });

                t_DevelopmentRepo.parameters['remote']['socket'].connect(
                    t_Api.parameters['repo']['config']['repo']['remote']['port'],
                    t_Api.parameters['repo']['config']['repo']['remote']['address']
                );
            }

            t_DevelopmentRepo.parameters['remote']['callbacks']['error'] = function () {
                t_DevelopmentRepo.disconnect();
                if (parameters['on_error']) {
                    parameters['on_error']();
                }
            };

            t_DevelopmentRepo.parameters['remote']['socket'].on('data', function (data) {
                if (t_DevelopmentRepo.parameters['remote']['callbacks'].hasOwnProperty(data.event)) {
                    t_DevelopmentRepo.parameters['remote']['callbacks'][data.event](data.data);
                }
            });

            t_DevelopmentRepo.parameters['remote']['socket'].socket.on('error', function (error) {
                t_DevelopmentRepo.disconnect(); // ...
                if (parameters['on_connection_failed']) {
                    parameters['on_connection_failed']({
                        error: {
                            error: error,
                            description: error.toString()
                        }
                    });
                }
            });

            t_DevelopmentRepo.parameters['remote']['socket'].socket.on('close', function () {
                t_DevelopmentRepo.parameters['remote']['is_connected'] = false;
                if (parameters['on_disconnected']) {
                    parameters['on_disconnected']();
                }
            });
        };

        /**
         * Method: Api.DevelopmentRepo.disconnect()
         * Disonnect from host repo
         */
        t_DevelopmentRepo.disconnect = function () {
            t_DevelopmentRepo.parameters['remote']['socket'].socket.destroy();
        };

        /**
         * Method: Api.DevelopmentRepo.set_remote(parameters)
         * Set remote host repo for current development repo
         *
         * Param: parameters (Object) {
         *     address: (String),
         *     port: (Integer),
         *     repo: (String)
         * }
         * 
         * Return: null
         */
        t_DevelopmentRepo.set_remote = function (parameters) {
            if (parameters.hasOwnProperty('address')) {
                t_Api.parameters['repo']['config']['remote']['address'] = parameters['address'];
            }

            if (parameters.hasOwnProperty('port')) {
                t_Api.parameters['repo']['config']['remote']['port'] = parameters['port'];
            }

            if (parameters.hasOwnProperty('repo')) {
                t_Api.parameters['repo']['config']['remote']['repo'] = parameters['repo'];
            }
        };

        /**
         * Method: Api.DevelopmentRepo.push_to_host_repo()
         * Push differrent pack to host repo. Host repo pushed to save all changes.
         * Param: parameters (Object) {
         *     pack: (Index Pack) (Difference Index) (DeployMaster Index Object) (Buffer),
         *     as: undefined or 'gzip',
         *     return: function (result) {...} {
         *         Param: result (Object) {
         *            ok: (Boolean)
         *         }
         *     }
         * }
         */
        t_DevelopmentRepo.push_to_host_repo = function (parameters) {
            t_DevelopmentRepo.parameters['remote']['callbacks']['start_stream_index_return'] = function (data) {
                if (data.ok) {
                    t_DevelopmentRepo.parameters['remote']['socket'].write({
                        event: 'data_stream_index',
                        data: {
                            pack: parameters.pack
                        }
                    });

                    t_DevelopmentRepo.parameters['remote']['callbacks']['end_stream_index'] = function () {
                        
                    };

                    t_DevelopmentRepo.parameters['remote']['callbacks']['index_unpacked'] = function (data) {
                        t_DevelopmentRepo.parameters['remote']['socket'].write({
                            event: 'start_stream_pack'
                        });

                        t_DevelopmentRepo.parameters['remote']['callbacks']['pack_unpacked'] = function () {
                            parameters.unpacked({
                                ok: true
                            });
                        };

                        var zip_stats = fs.statSync(t_Api.pack.path);

                        var byte_offset = 0;

                        t_DevelopmentRepo.parameters['remote']['callbacks']['start_stream_pack_return'] = function () {
                            var read_stream = fs.createReadStream(t_Api.pack.path, {
                                // highWaterMark: 1 * 64,
                            });

                            read_stream.on('data', function (chunk) {
                                byte_offset += chunk.length;

                                t_DevelopmentRepo.parameters['remote']['socket'].write({
                                    event: 'chunk_stream_pack',
                                    chunk: chunk
                                });

                                parameters.on_data(byte_offset, zip_stats.size);
                            }).on('end', function () {
                                t_DevelopmentRepo.parameters['remote']['socket'].write({
                                    event: 'end_stream_pack'
                                });

                                parameters.on_data_sended();
                            });
                        };
                    };
                } else {
                    t_Api.debug_print('\n  \033[91m[Error] Remote error: Remote host did not accept data.');
                    t_DevelopmentRepo.disconnect();
                }
            };
            t_DevelopmentRepo.parameters['remote']['socket'].write({
                event: 'start_stream_index',
                data: {
                    size: parameters.pack.length,
                    as: parameters.as
                }
            });
        };

        /**
         * Method: Api.DevelopmentRepo.publish()
         * Publish to remote directory from host repo.
         * Param: parameters (Object) {
         *     dir: (String),
         *     owner: (String) or false (Boolean),
         *     group: (String) or false (Boolean),
         *     return: function (result) {...} {
         *         Param: result (Object) {
         *            ok: (Boolean)
         *         }
         *     }
         * }
         */
        t_DevelopmentRepo.publish = function (parameters) {
            t_DevelopmentRepo.parameters['remote']['socket'].write({
                event: 'publish',
                data: {
                    dir: parameters.dir,
                    ignorelist: parameters.ignorelist,
                    owner: parameters.owner,
                    group: parameters.group,
                }
            });

            t_DevelopmentRepo.parameters['remote']['callbacks']['publish_return'] = function (data) {
                parameters.return({
                    ok: data.ok
                });
            };
        };
    };

    /**
     * Method: Api.apply_pack()
     * Applies difference index pack to working directory
     * Param: parameters (Object) {
     *     index: (Index Pack) (Difference Index) (DeployMaster Index Object) (Buffer),
     *     pack: (Zip Pack Details) {path: (String)} (Object),
     *     workdir: path (String),
     *     ignorelist: [Optional] (DeployMaster Ignorelist Object) (Object),
     *     owner: (String) or false (Default) (Boolean),
     *     group: (String) or false (Default) (Boolean)
     * }
     */
    t_Api.apply_pack = function (parameters) {
        if (Object.keys(parameters.index).length === 0) {
            return;
        }

        if (typeof parameters.owner == 'undefined') {
            parameters.owner = false;
        }
        if (typeof parameters.group == 'undefined') {
            parameters.group = false;
        }

        if (parameters.ignorelist === undefined) {
            parameters.ignorelist = [];
        }

        var sorted_index_keys = t_Api.sort_index_by_status(parameters.index);

        var zip_path = parameters.pack.path || t_Api.pack.path;

        new JSZip.external.Promise(function (resolve, reject) {
            fs.readFile(zip_path, function (error, data) {
                if (error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        }).then(function (data) {
            return JSZip.loadAsync(data);
        }).then(function (zip) {
            var offset;
            var length;
            var file;
            var file_content_buffer;
            var file_path_absolute;

            var uid = parseInt(shelljs.exec('id -u '+parameters.owner, {silent: true, async: false}).toString().trim());
            var gid = parameters.group ? parseInt(shelljs.exec('id -g '+parameters.group, {silent: true, async: false}).toString().trim()): uid;

            offset = -1;
            length = sorted_index_keys.length;

            // for (offset in sorted_index_keys)
            var loop = () => {
                offset++;

                file = parameters.index[sorted_index_keys[offset]];

                var _key;
                var ignored;
                var _continue = false;
                for (_key in parameters.ignorelist) {
                    ignored = parameters.ignorelist[_key];
                    if (t_Api.is_path_at(file.path.path, ignored)) {
                        _continue = true;
                    }
                }
                if (_continue) {
                    if (offset >= length-1) {
                        parameters.return({ok: true});
                        return;
                    }

                    loop();
                    return;
                }

                var continue_after_writing = () => {
                    var file_mode;

                    if ((file.stat !== undefined) && (file.stat.mode !== undefined)) {
                        if (file.platform != 'win32') {
                            file_mode = parseInt(parseInt(parseInt(file.stat.mode).toString(8))%1000).toString();
                        } else {
                            file_mode = '770';
                        }
                    } else {
                        file_mode = '770';
                    }

                    if ((process.platform != 'win32') && (file.pull.status != t_Api.FILE_STATUS_UNMODIFIED) && (file.pull.status != t_Api.FILE_STATUS_DELETED)) {
                        if (parameters.owner) {
                            fs.chownSync(
                                file_path_absolute,
                                uid,
                                gid
                            );
                        }
                        fs.chmodSync(file_path_absolute, file_mode);
                    }

                    if (offset >= length-1) {
                        parameters.return({ok: true});
                        return;
                    }

                    loop();
                };
                
                file_content_buffer = undefined;
                file_path_absolute = t_Api.index_abs_path(file.path.path, parameters.workdir);

                if (file.pull.status == t_Api.FILE_STATUS_NEW) {
                    if (file.type == 'file') {
                        zip
                        .file(file.path.path)
                        .nodeStream()
                        .pipe(
                            fs.createWriteStream(file_path_absolute)
                        ).on('finish', continue_after_writing);
                    } else if (file.type == 'directory') {
                        if (!fs.existsSync(file_path_absolute)) {
                            fs.mkdirSync(file_path_absolute);
                        }
                        continue_after_writing();
                    }
                } else if (file.pull.status == t_Api.FILE_STATUS_COPIED) {
                    if (fs.existsSync(file_path_absolute)) {
                        rimraf.sync(file_path_absolute);
                    }

                    fs.createReadStream(t_Api.index_abs_path(file.pull.copy.source.path.path, parameters.workdir))
                    .pipe(
                        fs.createWriteStream(file_path_absolute)
                    ).on('finish', continue_after_writing);
                } else if (file.pull.status == t_Api.FILE_STATUS_MODIFIED) {
                    zip
                    .file(file.path.path)
                    .nodeStream()
                    .pipe(
                        fs.createWriteStream(file_path_absolute)
                    ).on('finish', continue_after_writing);
                } else if (file.pull.status == t_Api.FILE_STATUS_DELETED) {
                    rimraf.sync(file_path_absolute);
                    continue_after_writing();
                }
            };

            loop();
        }).catch(function (error) {
            console.log('[Error]:', error);
            parameters.return({ok: false});
        });
    };

    t_Api.HostRepo = function (_parameters) {
        var t_HostRepo = this;

        t_HostRepo.parameters = _parameters || {};

        var init_config = t_Api.config_initial;

        var port;

        if (t_HostRepo.parameters.port === undefined) {
            port = config.port;
        } else {
            port = t_HostRepo.parameters.port;
        }

        init_config['repo'] = {
            type: 'host',
            host: {
                "name": "",
                "port": port,
                "tls": {
                    "use_tls": true,
                    "key_file": "",
                    "cert_file": ""
                }
            }
        };

        t_HostRepo.initialized = false;
        t_HostRepo.config = t_Api.parameters['repo']['config']['repo'];

        t_HostRepo.init = function () {
            var result = true;

            result = result && (fs.mkdirSync(t_Api.parameters['deploymaster_path']) === undefined)
            && (fs.writeFileSync(t_Api.parameters['file_config'], JSON.stringify(init_config)) === undefined)
            && (fs.writeFileSync(t_Api.parameters['file_index'], '{}') === undefined);

            t_Api.update_index();

            return result;
        };

        /**
         * Method: Api.HostRepo.host()
         * Start repo hosting
         * 
         * Return: result (Object) {
         *    error: false or (Object) {
         *       description: (String)
         *    }
         * }
         */
        t_HostRepo.host = function () {
            var result = {};

            var server;

            if (t_HostRepo.config['host']['tls']['use_tls']) {
                var tls_parameters = {};

                if (
                    t_HostRepo.config['host']['tls']['key_file'] === '' &&
                    t_HostRepo.config['host']['tls']['cert_file'] === ''
                ) {
                    tls_parameters['key'] = fs.readFileSync(__dirname+'/config/ssl/deploymaster.key');
                    tls_parameters['cert'] = fs.readFileSync(__dirname+'/config/ssl/deploymaster.crt');
                } else {
                    if (!fs.existsSync(t_HostRepo.config['host']['tls']['key_file'])) {
                        result['error'] = {
                            description: 'Certificate Error: Key file is not found. ('+t_HostRepo.config['host']['tls']['key_file']+')'
                        };
                    } else if (!fs.existsSync(t_HostRepo.config['host']['tls']['cert_file'])) {
                        result['error'] = {
                            description: '[Certificate Error] Cert file is not found. ('+t_HostRepo.config['host']['tls']['cert_file']+')'
                        };
                    }

                    if (result['error']) {
                        return result;
                    }

                    tls_parameters['key'] = fs.readFileSync(t_HostRepo.config['host']['tls']['key_file']);
                    tls_parameters['cert'] = fs.readFileSync(t_HostRepo.config['host']['tls']['cert_file']);
                }

                server = new (new JSONTCPSOCKET({tls: true})).Server(tls_parameters);

                server.on('secureConnection', function (socket) {
                    server.emit('connected', socket);
                });
            } else {
                server = new (new JSONTCPSOCKET()).Server();

                server.on('connection', function (socket) {
                    server.emit('connected', socket);
                });
            }

            server.on('connected', function (socket) {
                var client = {};
                client.ip = socket.socket.remoteAddress;
                client.authorized = false;

                client.push = {};

                client.push.index = {};
                client.push.index.is_streaming = false;
                client.push.index.pack = undefined;
                client.push.index.as = undefined; // undefined or 'gzip'

                client.push.pack = {};
                client.push.pack.is_streaming = false;
                client.push.pack.path = null;

                t_Api.debug_print('['+client.ip+'] '+'connected');

                socket.socket.on('error', function (error) {
                    t_Api.debug_print('\n  \033[91m['+client.ip+']: [Error] Socket error: '+util.inspect(error, true, null)+'\033[0m');
                });

                socket.on('data', function (data) {
                    t_Api.debug_print('['+client.ip+'] event: '+data.event);

                    if (data.event == 'authorize') {
                        t_Api.debug_print('['+client.ip+'] '+'trying auth..');

                        var password_hash = crypto.createHash('md5').update(data.data.password).digest('hex');

                        if (password_hash == t_Api.parameters['repo']['config']['repo']['password']) {
                            client.authorized = true;
                            socket.write({
                                event: 'authorize_return',
                                data: {
                                    authorized: true
                                }
                            });
                            t_Api.debug_print('['+client.ip+'] '+'authorized');
                        } else {
                            socket.write({
                                event: 'authorize_return',
                                data: {
                                    authorized: false
                                }
                            });
                            socket.socket.destroy();
                            t_Api.debug_print('['+client.ip+'] '+'auth rejected');
                        }
                    } else if (!client.authorized) {
                        socket.write({
                            event: 'not_authorized'
                        });
                        socket.socket.destroy();
                        t_Api.debug_print('['+client.ip+'] '+'is not authorized');
                    } else {
                        if (data.event == 'get_index') {
                            var _index;
                            if (typeof data.data.workdir == 'undefined') {
                                t_Api.update_index();
                                _index = t_Api.index;
                            } else {
                                _index = t_Api.create_index({
                                    workdir: data.data.workdir
                                });
                            }
                            socket.write({
                                event: 'get_index_return',
                                data: {
                                    index: _index
                                }
                            });
                        } else if (data.event == 'start_stream_index') {
                            client.push.index.is_streaming = true;
                            client.push.index.as = 'gzip';

                            socket.write({
                                event: 'start_stream_index_return',
                                data: {
                                    ok: true
                                }
                            });
                        } else if (data.event == 'data_stream_index') {
                            client.push.index.pack = new Buffer(data.data.pack);

                            socket.write({
                                event: 'end_stream_index',
                                data: {
                                    ok: true
                                }
                            });

                            var _continue = function () {
                                var index_unpacked_ok = true;

                                try {
                                    client.push.index.pack = JSON.parse(client.push.index.pack.toString());
                                } catch (exception) {
                                    index_unpacked_ok = false;
                                    t_Api.debug_print('\n  \033[91m['+client.ip+']: [Error] Pack json could not be parsed.', exception);
                                    t_Api.debug_print('\033[0m');
                                } finally {
                                    
                                }

                                client.push.index.is_streaming = false;
                                
                                socket.write({
                                    event: 'index_unpacked',
                                    data: {
                                        ok: index_unpacked_ok
                                    }
                                });
                            };

                            if (client.push.index.as == 'gzip') {
                                zlib.gunzip(client.push.index.pack, function (error, pack) {
                                    client.push.index.pack = pack;
                                    _continue();
                                });
                            } else {
                                _continue();
                            }
                        } else if (data.event == 'start_stream_pack') {
                            t_Api.need_tmp_dir();
                            t_Api.pack.path = t_Api.tmp.path+fs_path.sep+'hpack.zip';
                            t_Api.pack.write_stream = fs.createWriteStream(t_Api.pack.path);
                            t_Api.pack.write_stream.on('open', function () {
                                socket.write({
                                    event: 'start_stream_pack_return',
                                    data: {
                                        ok: true
                                    }
                                });
                            });
                        } else if (data.event == 'chunk_stream_pack') {
                            t_Api.pack.write_stream.write(new Buffer(data.chunk.data));
                        } else if (data.event == 'end_stream_pack') {
                            t_Api.pack.write_stream.end();

                            t_Api.apply_pack({
                                index: client.push.index.pack,
                                workdir: t_Api.parameters['workdir'],
                                pack: {
                                    path: client.push.pack.path
                                },
                                return: function (parameters) {
                                    socket.write({
                                        event: 'pack_unpacked',
                                        data: {
                                            ok: parameters.ok
                                        }
                                    });
                                }
                            });
                        } else if (data.event == 'publish') {
                            if (!fs.existsSync(data.data.dir)) {
                                socket.write({
                                    event: 'publish_return',
                                    data: {
                                        ok: false,
                                        error: {
                                            message: 'Target dir does not exists.'
                                        }
                                    }
                                });
                            } else {
                                var production_dir_ignorelist = t_Api.get_ignorelist(data.data.dir);
                                var total_ignorelist = production_dir_ignorelist;
                                data.data.ignorelist.forEach(function (_file) {
                                    if (total_ignorelist.indexOf(_file) == -1) {
                                        total_ignorelist.push(_file);
                                    }
                                });

                                var host_index = t_Api.create_index({
                                    workdir: t_Api.parameters['workdir']
                                });

                                var production_dir_index = t_Api.create_index({
                                    workdir: data.data.dir
                                });

                                var production_dir_index_diff = t_Api.create_index_diff(host_index, production_dir_index, total_ignorelist);

                                t_Api.create_pack({
                                    index: production_dir_index_diff,
                                    return: function (parameters) {
                                        t_Api.apply_pack({
                                            index: parameters.index,
                                            workdir: data.data.dir,
                                            owner: data.data.owner,
                                            group: data.data.group,
                                            pack: {
                                                path: t_Api.pack.path
                                            },
                                            return: function (parameters) {
                                                socket.write({
                                                    event: 'publish_return',
                                                    data: {
                                                        ok: parameters.ok
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    }
                });

                socket.socket.on('close', function () {
                    t_Api.debug_print('['+client.ip+'] '+'disconnected');
                });
            });

            server.listen(t_HostRepo.config['host']['port']);

            result['error'] = false;
            return result;
        };

        t_HostRepo.set_password = function (parameters) {
            t_Api.parameters['repo']['config']['repo']['password'] = crypto.createHash('md5').update(parameters.password).digest('hex');
        };
    };

    t_Api.install_service = function (parameters) {
        var service_file_path = '/etc/systemd/system/'+'deploymaster-'+parameters.port+'.service';
        var service_file_content =
`
[Unit]
Description=Deploy Master Service (Port: `+parameters.port+`)

[Service]
Type=simple
ExecStart=/usr/bin/deploymaster start-host --workdir `+t_Api.real_path(t_Api.parameters['workdir'])+`

[Install]
WantedBy=multi-user.target

`;
    
        fs.writeFileSync(service_file_path, service_file_content);
        shelljs.exec('systemctl daemon-reload', {silent: false, async: false});
    };

    t_Api.remove_service = function (parameters) {
        var service_file_path = '/etc/systemd/system/'+'deploymaster-'+parameters.port+'.service';

        shelljs.exec('systemctl stop deploymaster-'+parameters.port+'.service', {silent: false, async: false});

        if (fs.existsSync(service_file_path)) {
            rimraf.sync(service_file_path);
        }

        shelljs.exec('systemctl daemon-reload', {silent: false, async: false});
    };
};