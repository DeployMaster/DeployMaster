
var fs = require('fs');

module.exports = {
    version: 1.0,
    deploymaster_dir: '.deploymaster',
    host_config_file: '.host.config.deploymaster',
    tls: {
        default: {
            key: fs.readFileSync(__dirname+'/config/ssl/deploymaster.key'),
            cert: fs.readFileSync(__dirname+'/config/ssl/deploymaster.crt')
        }
    },
    host: '127.0.0.1',
    port: 5053
};