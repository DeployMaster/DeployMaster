# Deploy Master
Fast, flexible, clean deployment tool

[![npm package](https://img.shields.io/npm/v/deploymaster.svg?style=flat-square)](https://www.npmjs.com/package/deploymaster)

## Installation

##### Requirements

DeployMaster is written in [node.js](https://nodejs.org/), you should have latest stable version of node.

##### npm

You can install DeployMaster with npm (as root)

```bash
npm install -g deploymaster
```

..and you can run it! `deploymaster`

##### Installing from GIT

You can install DeployMaster with git, following commands:

```bash
git clone https://github.com/DeployMaster/DeployMaster.git DeployMaster
cd DeployMaster && npm install
```

## Usage

```bash
Usage: deploymaster <command> [options..]

command
  init-host            Create new hosting repo
  start-host           Start server for host repo
  init-development     Initialize DeployMaster development repo on this directory
  config               Set repo config
  rm-repo              Remove repo for this directory
  repo-info            Show repository information for this directory
  track                Track for all
  status               Show track status for all
  push                 Push new/modified files to host repo
  production           Set production repo
  password             Set password for host repo
  publish              Publish from connected host repo to deployment repo
  connect              Connect this development repo to main repository
```

##### Help for a command

```
deploymaster <command> --help
```

### Install systemd service

```bash
sudo deploymaster install-service
```

You can remove systemd service with;

```bash
sudo deploymaster remove-service
```

..or you can install/remove for specific port;

```bash
sudo deploymaster install-service --port 5053
sudo deploymaster remove-service --port 5053
```

### ..or start hosting with a directory

##### Create a host repository

```bash
mkdir /path/to/project_host
cd /path/to/project_host
deploymaster init-host
```

##### Notice!
If you did created a systemd service with "install-service" option,
you should enter host directory before set it.

It is like this;
```bash
cd /var/deploymaster/deploymaster-5053-host
```

"install-service" option creates host directories like `/var/deploymaster/deploymaster-PORT-host`

##### Define a password for host repo

```bash
deploymaster password --set NEWPASSWORD
```

##### Set TLS for host repo

Enable TLS

```bash
deploymaster config --key host.tls.use_tls --value true
```

Disable TLS

```bash
deploymaster config --key host.tls.use_tls --value false
```

##### Set SSL/TLS certificate

Set RSA Private Key file

```bash
deploymaster config --key host.tls.key_file --value "/path/to/private.key"
```

Set RSA Public Key (Cert) file

```bash
deploymaster config --key host.tls.cert_file --value "/path/to/public.crt"
```

##### Start repository hosting

If you don't use systemd service, you can start hosting for any directory.

```bash
deploymaster start-host
```

or

```bash
deploymaster start-host --workdir /path/to/project_host
```

#### Development side

##### Create a development repository

```bash
mkdir /path/to/project_dev
cd /path/to/project_dev
deploymaster init-development
```

##### See config

```bash
deploymaster config
```

Also see

```bash
deploymaster config --help
```

##### Connect development repo to host repo

```bash
deploymaster connect --host 127.0.0.1:5053
```

##### Set TLS for development repo

Enable TLS

```bash
deploymaster config --key remote.tls.use_tls --value true
```

Disable TLS

```bash
deploymaster config --key remote.tls.use_tls --value false
```

##### Connect development repo to production

Create production directory

```bash
mkdir /path/to/production
```

Add production repo to developmen repo

```bash
deploymaster production --set production --dir /path/to/production
```

Set owner and group for production files (for POSIX)

```bash
deploymaster production --set production --dir /path/to/production --owner username --group groupname
```

##### See status

```bash
touch test
echo "test file" >> test
deploymaster status --repo production
```

If you are using TLS, you'll see this

```bash
Certificate fingerprint: 69:5B:97:20:D3:7B:56:08:8C:80:36:FE:6A:41:6F:A5:36:08:4B:E2
Do you trust it ?
(y)es (n)o (p)ermanently: 
```

If its ok, type "y" or "p" and press enter else type "n" and press enter

##### Push new/modified files to host

If you have new files;

```bash
deploymaster push --repo production
```

##### Publish all to production

```bash
deploymaster publish --repo production
```

(New and modified files should be pushed.)

##### Notice!

New and modified files come from pushed files to host directory.

If you have some changes and 100 new/modified files and pushed it.

When you did;
```bash
deploymaster push --repo production
deploymaster publish --production testing
```

and after testing.. when you did;

```bash
deploymaster publish --production production
```

New/modified 100 files come from host directory.

DeployMaster prefers `Testing - Production` approach.

##### Ignorelist

Create `.ignorelist.deploymaster` file in `development repo` and `production directory`

It is like this

```bash
/config.php
/config/db.php
/temp
/static
```

The main approach is two same ignorelists at development and production directories both.<br />
But you might be want some specific ignored items for `testing` or `production` repos.

##### Notice!
In development or production sides, DeployMaster will track files in all directories and sub-directories if they are not included in ignorelist.

If you are using only ignorelist in development or production side, DeployMaster will look for all files in other side..

## Contributing

If you think you can contribute to DeployMaster, clone, code, commit and create a pull request!

## License
MIT