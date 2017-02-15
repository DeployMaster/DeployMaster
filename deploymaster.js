#!/usr/bin/env node
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

const util = require('util');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const fs_path = require('path');
const readline = require('readline');
const rimraf = require('rimraf');
const nomnom = require('nomnom');
const read = require('read');
const shelljs = require('shelljs');
const prompt = require('prompt-sync')({
    sigint: true
});

const config = require('./config.js');
const Api = require('./api.js');

var api;

var define_api = function (parameters) {
    if (typeof parameters == 'undefined') {
        parameters = {};
    }
    if (typeof parameters.workdir == 'undefined') {
        parameters.workdir = process.cwd();
    }

    api = new Api({
        workdir: parameters.workdir,
        config: config
    });
};

var CLI_API_EVENT_HANDLERS = {};

CLI_API_EVENT_HANDLERS.on_connection_failed = function (parameters) {
    console.log('');
    console.log('\033[91m[Error] Connection failed to host repo. ('+parameters.error.description+')\033[0m');
    console.log('');
};

CLI_API_EVENT_HANDLERS.on_ask_for_tls_certificate = function (parameters) {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('Certificate fingerprint: '+parameters.certificate.fingerprint);
    console.log('Do you trust it ?');

    rl.question(
        '(y)es (n)o (p)ermanently: ',
        function (answer) {
            rl.close();

            if (answer == 'y') {
                parameters.callback({
                    trust: true
                });
            } else if (answer == 'p') {
                parameters.callback({
                    trust: true,
                    permanently: true
                });
            } else {
                parameters.callback({
                    trust: false
                });
            }

            console.log('');
        }
    );
};

CLI_API_EVENT_HANDLERS.on_ask_for_password = function (parameters) {
    read(
        {
            prompt: 'Password:',
            input: process.stdin,
            output: process.stdout,
            silent: true,
            replace: ''
        },
        parameters.return
    );
};

CLI_API_EVENT_HANDLERS.on_authorize = function (parameters) {
    api.repo.auth({
        password: parameters.password,
        return: function (result) {
            if (!result.authorized) {
                console.log('\033[91m[Error] Authorization failed.\033[0m');
                console.log('');
                process.exit(0);
            }

            parameters.return();
        }
    });
};

var check_for_init = function () {
    if (!api.initialized) {
        console.log('\n\033[91m[Error] Repo is not initialized for this directory.\033[0m');
        console.log('');
        process.exit(0);
    }
};

var check_for_not_init = function () {
    if (api.initialized) {
        console.log('\n\033[91m[Error] Repo is already initialized for this directory. Please use it or remove and create new repo.\033[0m');
        console.log('\n\033[36m[Tip] Use deploymaster rm-repo for remove repo for this directory\033[0m');
        api.current_index();
        print_repo_info();
        process.exit(0);
    }
};

var check_for_host_repo = function () {
    if (api.parameters['repo']['config']['repo']['type'] != 'host') {
        console.log('\n\033[91m[Error] This is not host repo.\033[0m');
        api.current_index();
        print_repo_info();
        process.exit(0);
    }
};

var check_for_not_host_repo = function () {
    if (api.parameters['repo']['config']['repo']['type'] == 'host') {
        console.log('\n\033[91m[Error] This is host repo.\033[0m');
        api.current_index();
        print_repo_info();
        process.exit(0);
    }
};

var check_for_password = function () {
    if (!api.parameters['repo']['config']['repo'].hasOwnProperty('password')) {
        console.log('\n\033[91m[Error] Password should be set for this host repo.\033[0m');
        console.log('\n\033[36m[Tip] deploymaster password --set NEWPASSWORD \033[0m');
        console.log('');
        process.exit(0);
    }
};

var check_for_connected_to_host = function () {
    if (!api.parameters['repo']['config']['repo']['remote']['address'] || !api.parameters['repo']['config']['repo']['remote']['port']) {
        console.log('\n\033[91m[Error] Repo is not connected to host repo.\033[0m');
        console.log('\n\033[36m[Tip] deploymaster connect --host HOST:PORT \033[0m');
        console.log('');
        process.exit(0);
    }
};

var print_repo_info = function () {
    console.log('\nRepository Information\n');
    console.log('  Repo type:\t\t\t', api.parameters['repo']['config']['repo']['type']);
    console.log('  Working Directory:\t\t', api.parameters['workdir']);
    console.log('  DeployMaster directory:\t', api.parameters['deploymaster_path']);
    console.log('  Repo DeployMaster version:\t', api.parameters['repo']['config']['version']);
    console.log('  Tracked files:\t\t', Object.keys(api.index).length);
    console.log('');
};

var commandless = true;

var cmd_init_host = function () {
    commandless = false;
    
    if (typeof parameters == 'undefined') {
        parameters = {};
    }

    define_api();
    api.current_repo();
    check_for_not_init();

    var host_repo = new api.HostRepo({
        port: parameters.port
    });

    host_repo.init();
};

var cmd_start_host = function (parameters) {
    commandless = false;

    if (typeof parameters == 'undefined') {
        parameters = {};
    }

    var workdir;

    if (parameters['create-workdir']) {
        var new_password;

        var prompt_pw = () => {
            new_password = prompt.hide('Set a new password: ');
            var new_password_again = prompt.hide('Type again: ');

            if (new_password != new_password_again) {
                console.log('\n\033[91mPasswords are not same.\033[0m');
                prompt_pw();
            }
        };

        prompt_pw();

        workdir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME']+'/.deploymaster-'+parameters.port+'-host';

        define_api({
            workdir: workdir
        });

        var host_repo;

        if (!fs.existsSync(workdir)) {
            fs.mkdirSync(workdir);

            api.current_repo();

            host_repo = new api.HostRepo({
                port: parameters.port
            });

            host_repo.init();

            api.current_repo();

            host_repo.set_password({password: new_password});
            api.save_repo_config();
            api.current_repo();
        } else {
            host_repo = new api.HostRepo({
                port: parameters.port
            });

            api.current_repo();

            if (!api.initialized) {
                host_repo.init();
            }
        }
    } else {
        workdir = parameters.workdir;
        
        define_api({
            workdir: workdir
        });
    }

    api.current_repo();

    check_for_init();
    check_for_host_repo();
    check_for_password();

    if (api.parameters['repo']['config']['repo']['type'] != 'host') {
        console.log('\n\033[91m[Error] This is not host repo.\033[0m');
        print_repo_info();
        process.exit(0);
    }

    console.log('');
    console.log('Starting the server..');
    console.log('');
    console.log('Server Information');
    console.log('');
    console.log('  Name: '+api.parameters['repo']['config']['repo']['host']['name']);
    console.log('  Port: '+api.parameters['repo']['config']['repo']['host']['port']);
    console.log('  Workdir: '+api.parameters['workdir']);
    console.log('');
    console.log('Server is listening from 0.0.0.0:'+api.parameters['repo']['config']['repo']['host']['port']);

    var result = api.repo.host();

    if (result.error) {
        console.log('\n\033[91m[Error] Host can not be started.\033[0m');
        console.log('\n\033[91m'+result.error.description+'\033[0m');
    }
    
    console.log('');
};

var cmd_init_development = function () {
    commandless = false;

    define_api();
    api.current_repo();
    check_for_not_init();

    var development_repo = new api.DevelopmentRepo({

    });

    development_repo.init();
    
    commandless = false;
};

var cmd_rm_repo = function () {
    commandless = false;

    define_api();
    api.remove_repo();
};

var cmd_repo_info = function () {
    commandless = false;
    
    define_api();
    api.current_repo();
    check_for_init();
    api.current_index();

    print_repo_info();
};

var cmd_config = function (parameters) {
    commandless = false;
    
    define_api();
    api.current_repo();
    check_for_init();
    api.current_index();

    if (parameters.key === undefined) {
        console.log(util.inspect(t_Api.parameters['repo']['config']['repo'], true, null));
    } else {
        var configception = parameters.key.split('.');

        var key;
        var key_index;
        var setat = t_Api.parameters['repo']['config']['repo'];
        var key_index_last = configception.length-1;

        var is_set = false;

        for (key_index in configception) {
            key = configception[key_index];

            if (!setat.hasOwnProperty(key)) {
                console.log('\n\033[91m[Error] Key "'+key+'" is not exists.\033[0m');
                console.log('');
                process.exit(0);
            }

            if (key_index == key_index_last) {
                if (parameters.value !== undefined) {
                    setat[key] = parameters.value;
                    is_set = true;
                } else if (parameters.add !== undefined) {
                    setat[key].push(parameters.add);
                    is_set = true;
                } else if (parameters.delete) {
                    var remove_index = setat[key].indexOf(parameters.delete);
                    if (remove_index != -1) {
                        setat[key].splice(remove_index, 1);
                    }
                    is_set = true;
                } else {
                    console.log(util.inspect(setat[key], true, null));
                }
            } else {
                setat = setat[key];
            }
        }

        if (is_set) {
            api.save_repo_config();
        }
    }
};

var cmd_connect = function (parameters) {
    commandless = false;

    define_api();
    api.current_repo();
    check_for_init();
    api.current_index();

    check_for_not_host_repo();

    if (api.parameters['repo']['config']['repo']['type'] != 'development') {
        console.log('\n\033[91m[Error] This is not development repo.\033[0m');
        print_repo_info();
        process.exit(0);
    }

    var _split = parameters.host.split(':');

    var remote_new = {};
    remote_new['address'] = _split[0];
    var ports = _split[1].split(',');
    remote_new['port'] = ports[0];
    if (ports.length > 1) {
        remote_new['transfer_port'] = ports[1];
    }


    api.parameters['repo']['config']['repo']['remote']['address'] = remote_new['address'];
    api.parameters['repo']['config']['repo']['remote']['port'] = remote_new['port'];
    api.parameters['repo']['config']['repo']['remote']['repo'] = remote_new['repo'];

    var result = api.save_repo_config();

    if (result) {
        console.log('\n\033[32mOk.\033[0m');
    } else {
        console.log('\n\033[91m[Error] An error has been occured while saving repo config on file system.\033[0m');
    }

    console.log('');
};

var cmd_track = function () {
    commandless = false;

    define_api();
    api.current_repo();
    check_for_init();

    console.log('\n Tracking for all..');

    console.log('');

    api.update_index();
};

var cmd_status = function (parameters) {
    commandless = false;

    define_api();
    api.current_repo();

    check_for_init();
    check_for_not_host_repo();
    check_for_connected_to_host();

    var production_repo = api.parameters['repo']['config']['repo']['remote']['production_repos'][parameters.repo];

    if (typeof production_repo == 'undefined') {
        console.log('');
        console.log('\033[91m[Error] "'+parameters.repo+'" is not exists.\033[0m');
        console.log('\n\033[36m[Tip] Use deploymaster production --set REPONAME --dir REMOTEDIR --owner USER --group GROUP\033[0m');
        console.log('\n\033[36m[Tip] Use deploymaster production for list repos\033[0m');
        console.log('\033[36m[Tip] Also see deploymaster production --help\033[0m');
        console.log('');
        return;
    }

    CLI_API_EVENT_HANDLERS.on_ask_for_password({
        return: function (error, password) {
            console.log('');

            api.repo.connect({
                on_connected: function () {
                    CLI_API_EVENT_HANDLERS.on_authorize({
                        password: password,
                        return: function () {
                            console.log('Updating index..');
                            console.log('');

                            api.update_index();

                            console.log('Fetching remote index..');

                            api.repo.get_remote_index({
                                workdir: production_repo.directory,
                                return: function (data) {
                                    api.repo.disconnect();

                                    var index_diff = api.create_index_diff(api.index, data.index, api.parameters['repo']['ignorelist']);
                                    var index_diff_sorted = api.sort_index_by_status(index_diff);
                                    api.set_unpushed_status(api.get_unpushed_status(index_diff));

                                    console.log('\nTrack Status\n');

                                    console.log('  Total files: '+api.unpushed_status['index']['count']['total']);
                                    console.log('  New files: '+api.unpushed_status['index']['count']['new']);
                                    console.log('  Modified files: '+api.unpushed_status['index']['count']['modified']);
                                    console.log('  Copied files: '+api.unpushed_status['index']['count']['copied']);
                                    console.log('  Deleted files: '+api.unpushed_status['index']['count']['deleted']);
                                    console.log('  Modified mode files: '+api.unpushed_status['index']['count']['chmod']);
                                    console.log('');

                                    if (typeof parameters['show-files'] != 'undefined') {
                                        if (index_diff_sorted.length === 0) {
                                            console.log('There is no modified file');
                                        } else {
                                            console.log('Modified Files\n');

                                            var file;
                                            var file_i;

                                            index_diff_sorted.forEach(function (file_i) {
                                                file = index_diff[file_i];

                                                if (
                                                    (file.pull.status == api.FILE_STATUS_UNMODIFIED) ||
                                                    (
                                                        (typeof parameters['show-files-state-chmod'] == 'undefined')
                                                        &&
                                                        (file.pull.status == api.FILE_STATUS_CHMOD)
                                                    )
                                                ) {
                                                    return true;
                                                }

                                                process.stdout.write('    ');

                                                if (file['pull']['status'] == api.FILE_STATUS_NEW) {
                                                    process.stdout.write('\033[32mnew\033[0m ');
                                                } else if (file['pull']['status'] == api.FILE_STATUS_MODIFIED) {
                                                    process.stdout.write('\033[34mmodified\033[0m ');
                                                } else if (file['pull']['status'] == api.FILE_STATUS_CHMOD) {
                                                    process.stdout.write('chmod ');
                                                } else if (file['pull']['status'] == api.FILE_STATUS_COPIED) {
                                                    process.stdout.write('copied ');
                                                } else if (file['pull']['status'] == api.FILE_STATUS_DELETED) {
                                                    process.stdout.write('\033[91mdeleted\033[0m ');
                                                }

                                                process.stdout.write(file.type);
                                                process.stdout.write(':');
                                                process.stdout.write(file.path.path+'\n');
                                            });
                                        }

                                        console.log('');
                                    }
                                }
                            });
                        }
                    });
                },
                on_error: function () {
                    console.log('\033[91m[Error] Remote error.\033[0m');
                },
                on_connection_failed: CLI_API_EVENT_HANDLERS.on_connection_failed,
                on_ask_for_tls_certificate: CLI_API_EVENT_HANDLERS.on_ask_for_tls_certificate
            });
        }
    });
};

var cmd_status_files = function (parameters) {
    commandless = false;

    parameters.show_files = true;

    cmd_status(parameters);
};

var cmd_push = function () {
    commandless = false;

    define_api();
    api.current_repo();
    
    check_for_init();
    check_for_not_host_repo();
    check_for_connected_to_host();

    CLI_API_EVENT_HANDLERS.on_ask_for_password({
        return: function (error, password) {
            api.repo.connect({
                on_connected: function () {
                    CLI_API_EVENT_HANDLERS.on_authorize({
                        password: password,
                        return: function () {
                            console.log('Updating index..');
                            console.log('\nChecking for changes..');

                            api.update_index();

                            api.repo.get_remote_index({
                                return: function (data) {
                                    var index_diff = api.create_index_diff(api.index, data.index, api.parameters['repo']['ignorelist']);
                                    var index_diff_sorted = api.sort_index_by_status(index_diff);

                                    api.set_unpushed_status(api.get_unpushed_status(index_diff));
                                    
                                    console.log('');
                                    console.log('Packing all data..');

                                    api.create_pack({
                                        index: index_diff,
                                        as: 'gzip',
                                        return: function (parameters) {
                                            if (!parameters.ok) {
                                                console.log('\033[91m[Error] Packer error.\033[0m');
                                                console.log('');
                                                process.exit(0);
                                            }

                                            console.log('Uploading all data..');
                                            api.repo.push_to_host_repo({
                                                pack: parameters.index,
                                                as: 'gzip',
                                                on_data: function (sended, total) {
                                                    var percent = parseInt(sended*100/total);
                                                    process.stdout.clearLine();
                                                    process.stdout.cursorTo(0);
                                                    process.stdout.write('  Pushing all data.. ('+percent+' / 100%)');
                                                },
                                                on_data_sended: function () {
                                                    process.stdout.clearLine();
                                                    process.stdout.cursorTo(0);
                                                    console.log('All data is uploaded..');
                                                    console.log('Unpacking all data..');
                                                },
                                                unpacked: function (parameters) {
                                                    if (parameters.ok) {
                                                        console.log('Pushing completed.');
                                                        console.log('');
                                                    } else {
                                                        console.log('\033[91m[Error] Unpacker error.\033[0m');
                                                        console.log('');
                                                    }
                                                    
                                                    api.repo.disconnect();
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                },
                on_connection_failed: CLI_API_EVENT_HANDLERS.on_connection_failed,
                on_ask_for_tls_certificate: CLI_API_EVENT_HANDLERS.on_ask_for_tls_certificate
            });
        }
    });
};

var cmd_production = function (parameters) {
    commandless = false;

    define_api();
    api.current_repo();
    api.current_index();

    check_for_init();
    check_for_not_host_repo();

    if (typeof parameters.set != 'undefined') {
        var set_to;

        if (typeof api.parameters['repo']['config']['repo']['remote']['production_repos'][parameters.set] == 'undefined') {
            api.parameters['repo']['config']['repo']['remote']['production_repos'][parameters.set] = {
                owner: false,
                group: false
            };
        }

        set_to = api.parameters['repo']['config']['repo']['remote']['production_repos'][parameters.set];

        if (typeof parameters.dir != 'undefined') {
            set_to.directory = parameters.dir;
        }
        if (typeof parameters.owner != 'undefined') {
            set_to.owner = parameters.owner;
        }
        if (typeof parameters.group != 'undefined') {
            set_to.group = parameters.group;
        }
        api.save_repo_config();
        console.log('Repo is set.');
    } else if (typeof parameters.remove != 'undefined') {
        delete api.parameters['repo']['config']['repo']['remote']['production_repos'][parameters.remove];
        api.save_repo_config();
        console.log('Repo is removed.');
    } else {
        var keys = Object.keys(api.parameters['repo']['config']['repo']['remote']['production_repos']);
        if (keys.length === 0) {
            console.log('');
            console.log('There is not production repo.');
            console.log('\n\033[36m[Tip] Use deploymaster production --set REPONAME --dir REMOTEDIR --owner USER --group GROUP\033[0m');
            console.log('\033[36m[Tip] Also see deploymaster production.\033[0m');
            console.log('');
        } else {
            console.log('');
            keys.forEach(function (key) {
                var repo = api.parameters['repo']['config']['repo']['remote']['production_repos'][key];
                console.log(''+key+': '+repo.directory+', Owner: '+repo.owner+', Group: '+repo.group);
            });
            console.log('');
        }
    }
};

var cmd_password = function (parameters) {
    commandless = false;

    parameters.set = parameters.set.toString();

    define_api();
    api.current_repo();

    check_for_init();
    check_for_host_repo();

    (new api.HostRepo()).set_password({password: parameters.set});
    api.save_repo_config();

    console.log('');
    console.log('\033[32mOk.\033[0m');
    console.log('');
};

var cmd_publish = function (parameters) {
    commandless = false;

    define_api();
    api.current_repo();
    
    check_for_init();
    check_for_not_host_repo();
    check_for_connected_to_host();

    var production_repo = api.parameters['repo']['config']['repo']['remote']['production_repos'][parameters.repo];

    if (typeof production_repo == 'undefined') {
        console.log('');
        console.log('\033[91m[Error] "'+parameters.repo+'" is not exists.\033[0m');
        console.log('\n\033[36m[Tip] Use deploymaster production --set REPONAME --dir REMOTEDIR --owner USER --group GROUP\033[0m');
        console.log('\n\033[36m[Tip] Use deploymaster production for list repos\033[0m');
        console.log('\033[36m[Tip] Also see deploymaster production --help\033[0m');
        console.log('');
        process.exit(0);
    }

    CLI_API_EVENT_HANDLERS.on_ask_for_password({
        return: function (error, password) {
            api.repo.connect({
                on_connected: function () {
                    CLI_API_EVENT_HANDLERS.on_authorize({
                        password: password,
                        return: function () {
                            console.log('Updating index..');
                            console.log('');

                            api.update_index();

                            console.log('Fetching remote index..');
                            console.log('');

                            api.repo.get_remote_index({
                                workdir: production_repo.directory,
                                return: function (data) {
                                    var index_diff = api.create_index_diff(api.index, data.index, api.parameters['repo']['ignorelist']);
                                    var index_diff_sorted = api.sort_index_by_status(index_diff);
                                    api.set_unpushed_status(api.get_unpushed_status(index_diff));

                                    console.log('Track Status\n');

                                    console.log('  Total files: '+api.unpushed_status['index']['count']['total']);
                                    console.log('  New files: '+api.unpushed_status['index']['count']['new']);
                                    console.log('  Modified files: '+api.unpushed_status['index']['count']['modified']);
                                    console.log('  Copied files: '+api.unpushed_status['index']['count']['copied']);
                                    console.log('  Deleted files: '+api.unpushed_status['index']['count']['deleted']);
                                    console.log('  Modified mode files: '+api.unpushed_status['index']['count']['chmod']);
                                    console.log('');

                                    console.log('Publishing from remote..');
                                    console.log('');

                                    api.repo.publish({
                                        dir: production_repo.directory,
                                        ignorelist: api.parameters['repo']['ignorelist'],
                                        owner: production_repo.owner,
                                        group: production_repo.group,
                                        return: function (parameters) {
                                            console.log('Everything is ok.. Check the product :/');
                                            console.log('');
                                            api.repo.disconnect();
                                        }
                                    });
                                }
                            });
                        }
                    });
                },
                on_connection_failed: CLI_API_EVENT_HANDLERS.on_connection_failed,
                on_ask_for_tls_certificate: CLI_API_EVENT_HANDLERS.on_ask_for_tls_certificate
            });
        }
    });
};

var cmd_install_service = function (parameters) {
    commandless = false;

    if (os.platform() == 'win32') {
        console.log('\n\t\033[91mThis feature is for POSIX-like operating systems with systemd.\033[0m\n');
        process.exit(0);
    }

    if (process.getuid && process.getuid() !== 0) {
        console.log('\n\t\033[91mThis command should run as root.\033[0m\n');
        process.exit(0);
    }

    var new_password;

    var prompt_pw = () => {
        new_password = prompt.hide('Set a new password: ');
        var new_password_again = prompt.hide('Type again: ');

        if (new_password != new_password_again) {
            console.log('\n\033[91mPasswords are not same.\033[0m');
            prompt_pw();
        }
    };

    prompt_pw();

    parameters = (parameters === undefined) ? {}: parameters;
    parameters.port = (parameters.port === undefined) ? '5053': parameters.port;

    if (!fs.existsSync('/var/deploymaster')) {
        fs.mkdirSync('/var/deploymaster');
    }

    var workdir = '/var/deploymaster/deploymaster-'+parameters.port+'-host';

    console.log('\n\033[36mCreating workdir \033[97m('+workdir+')\033[0m');

    var host_repo;

    if (!fs.existsSync(workdir)) {
        fs.mkdirSync(workdir);

        define_api({
            workdir: workdir
        });

        api.current_repo();

        host_repo = new api.HostRepo({
            port: parameters.port
        });

        host_repo.init();

        api.current_repo();

        host_repo.set_password({password: new_password});
        api.save_repo_config();
        api.current_repo();

        console.log('\n\033[36mInstalling systemd service \033[97m(deploymaster-'+parameters.port+'.service)\033[0m');

        api.install_service({
            port: parameters.port
        });
    } else {
        define_api({
            workdir: workdir
        });

        host_repo = new api.HostRepo({
            port: parameters.port
        });

        api.current_repo();

        if (!api.initialized) {
            host_repo.init();
        }

        console.log('\n\033[36mInstalling systemd service \033[97m(deploymaster-'+parameters.port+'.service)\033[0m');

        api.install_service({
            port: parameters.port
        });
    }

    console.log('\n\033[36mStarting service..\033[0m');

    shelljs.exec('systemctl start deploymaster-'+parameters.port+'.service', {silent: false, async: false});

    console.log('\n\033[32mService is successfully installed.\033[0m');
    console.log('\n\033[36mYou can control it like:\033[0m \033[97msudo systemctl [start|stop|status] deploymaster-'+parameters.port+'.service\033[0m');

    console.log();
};

var cmd_remove_service = function (parameters) {
    commandless = false;

    if (os.platform() == 'win32') {
        console.log('\n\t\033[91mThis feature is for POSIX-like operating systems with systemd.\033[0m\n');
        process.exit(0);
    }

    if (process.getuid && process.getuid() !== 0) {
        console.log('\n\t\033[91mThis command should run as root.\033[0m\n');
        process.exit(0);
    }

    parameters = (parameters === undefined) ? {}: parameters;
    parameters.port = (parameters.port === undefined) ? '5053': parameters.port;

    console.log('\n\033[36mRemoving systemd service \033[97m(deploymaster-'+parameters.port+'.service)\033[0m');

    define_api();

    api.remove_service({
        port: parameters.port
    });

    var workdir = '/var/deploymaster/deploymaster-'+parameters.port+'-host';

    console.log('\n\033[36mRemoving workdir \033[97m('+workdir+')\033[0m');

    if (fs.existsSync(workdir)) {
        rimraf.sync(workdir);
    }

    console.log();
};

nomnom.script('deploymaster');

nomnom.command('init-host')
    .callback(cmd_init_host)
    .help('Create new hosting repo')
    .option('port', {
        required: false,
        metavar: 'PORT',
        default: '5053',
        help: 'Port to listen'
    });


nomnom.command('start-host')
    .callback(cmd_start_host)
    .help('Start server for host repo')
    .option('workdir', {
        required: false,
        metavar: 'PATH',
        help: 'Host repo directory'
    })
    .option('port', {
        required: false,
        metavar: 'PORT',
        default: '5053',
        help: 'Port to listen'
    })
    .option('create-workdir', {
        flag: true,
        required: false,
        help: 'Create a workdir before starting server'
    });

nomnom.command('init-development')
    .callback(cmd_init_development)
    .help('Initialize DeployMaster development repo on this directory');

nomnom.command('config')
    .option('key', {
        required: false,
        metavar: 'KEY',
    })
    .option('value', {
        required: false,
        metavar: 'VALUE',
    })
    .option('add', {
        required: false,
        metavar: 'VALUE',
    })
    .option('delete', {
        required: false,
        metavar: 'VALUE',
    })
    .callback(cmd_config)
    .help('Set repo config');

nomnom.command('rm-repo')
    .callback(cmd_rm_repo)
    .help('Remove repo for this directory');

nomnom.command('repo-info')
    .callback(cmd_repo_info)
    .help('Show repository information for this directory');

nomnom.command('track')
    .callback(cmd_track)
    .help('Track for all');

nomnom.command('status')
    .callback(cmd_status)
    .help('Show track status for all')
    .option('repo', {
        required: true,
        metavar: 'REPONAME',
        help: 'Production repo'
    })
    .option('show-files', {
        flag: true,
        required: false,
        help: 'Show modified files'
    })
    .option('show-files-state-chmod', {
        flag: true,
        required: false,
        help: 'Show chmod modified files'
    });

nomnom.command('push')
    .callback(cmd_push)
    .help('Push all to host repo');

nomnom.command('production')
    .option('set', {
        required: false,
        metavar: 'REPO NAME',
        help: 'Production repo alias to set'
    })
    .option('remove', {
        required: false,
        metavar: 'REPO NAME',
        help: 'Production repo alias to delete'
    })
    .option('dir', {
        required: false,
        metavar: 'REPO DIRECTORY',
        help: 'Production repo directory'
    })
    .option('owner', {
        required: false,
        metavar: 'USER',
        help: 'Owner for production files'
    })
    .option('group', {
        required: false,
        metavar: 'GROUP',
        help: 'Group for production files'
    })
    .callback(cmd_production)
    .help('Set production repo');

nomnom.command('password')
    .option('set', {
        required: true,
        metavar: 'PASSWORD',
        help: 'New password'
    })
    .callback(cmd_password)
    .help('Set password for host repo');

nomnom.command('publish')
    .option('repo', {
        required: true,
        metavar: 'REPO',
        help: 'Remote repo'
    })
    .callback(cmd_publish)
    .help('Publish from connected host repo to deployment repo');

nomnom.command('connect')
    .option('host', {
        required: true,
        metavar: 'HOST:PORT',
        help: 'Remote host:port'
    })
    .callback(cmd_connect)
    .help('Connect this development repo to main repository');

nomnom.command('install-service')
    .option('host', {
        required: false,
        metavar: 'PORT',
        help: 'Port to listen'
    })
    .callback(cmd_install_service)
    .help('Create a systemd service');

nomnom.command('remove-service')
    .option('host', {
        required: false,
        metavar: 'PORT',
        help: 'Port to listen'
    })
    .callback(cmd_remove_service)
    .help('Remove a deploymaster systemd service');

nomnom.parse();