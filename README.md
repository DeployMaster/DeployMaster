# Deploy Master
Fast, flexible, clean deployment tool

[![npm package](https://img.shields.io/npm/v/DeployMaster.svg?style=flat-square)](https://www.npmjs.com/package/deploymaster)

## Installation

##### Requirements

DeployMaster is written in [node.js](https://nodejs.org/), you should have latest stable version of node.

##### Installing from GIT

You can install DeployMaster with git, following commands:

```bash
git clone https://github.com/DeployMaster/DeployMaster.git DeployMaster
cd DeployMaster && npm install
```

..and you can run it! `node deploymaster`

## Usage

```bash
Usage: node deploymaster.js <command> [options..]

command
  init-host            Create new hosting repo
  start-host           Start server for host repo
  init-development     Initialize DeployMaster development repo on this directory
  config               Set repo config
  rm-repo              Remove repo for this directory
  repo-info            Show repository information for this directory
  track                Track for all
  status               Show track status for all
  push                 Push all to host repo
  production           Set production repo
  password             Set password for host repo
  publish              Publish from connected host repo to deployment repo
  connect              Connect this development repo to main repository
```

##### Help for a command

```
node deploymaster.js <command> --help
```

##### Create a host repository

```bash
mkdir /path/to/project_host
cd /path/to/project_host
node /path/to/deploymaster.js init-host
```

##### Define a password for host repo

```bash
node /path/to/deploymaster.js password --set NEWPASSWORD
```

##### Set TLS for host repo

Enable TLS

```bash
node /path/to/deploymaster.js config --key host.tls.use_tls --value true
```

Disable TLS

```bash
node /path/to/deploymaster.js config --key host.tls.use_tls --value false
```

##### Set SSL/TLS certificate

Set RSA Private Key file

```bash
node /path/to/deploymaster.js config --key host.tls.key_file --value "/path/to/private.key"
```

Set RSA Public Key (Cert) file

```bash
node /path/to/deploymaster.js config --key host.tls.cert_file --value "/path/to/public.crt"
```

##### Start repository hosting

```bash
node /path/to/deploymaster.js start-host
```

Or

```bash
node /path/to/deploymaster.js start-host --workdir /path/to/project_host
```

##### Create a development repository

```bash
mkdir /path/to/project_dev
cd /path/to/project_dev
node /path/to/deploymaster.js init-development
```

##### See config

```bash
node /path/to/deploymaster.js config
```

Also see

```bash
node /path/to/deploymaster.js config --help
```

##### Connect development repo to host repo

```bash
node /path/to/deploymaster.js connect --host 127.0.0.1:5053
```

##### Set TLS for development repo

Enable TLS

```bash
node /path/to/deploymaster.js config --key remote.tls.use_tls --value true
```

Disable TLS

```bash
node /path/to/deploymaster.js config --key remote.tls.use_tls --value false
```

##### Connect development repo to production

Create production directory

```bash
mkdir /path/to/production
```

Add production repo to developmen repo

```bash
node /path/to/deploymaster.js production --set production --dir /path/to/production
```

Set owner and group for production files (for POSIX)

```bash
node /path/to/deploymaster.js production --set production --dir /path/to/production --owner username --group groupname
```

##### See status

```bash
touch test
echo "test file" >> test
node /path/to/deploymaster.js status --repo production
```

If you are using TLS, you'll se this

```bash
Certificate fingerprint: 69:5B:97:20:D3:7B:56:08:8C:80:36:FE:6A:41:6F:A5:36:08:4B:E2
Do you trust it ?
(y)es (n)o (p)ermanently: 
```

If its ok, type "y" or "p" and press enter else type "n" and press enter

##### Push changes to host repo

```bash
node /path/to/deploymaster.js push
```

##### Publish all to production

```bash
node /path/to/deploymaster.js publish --repo production
```

##### Ignorelist

Create ```.ignorelist.deploymaster``` file in ```development repo``` or ```production directory```

It is like this

```bash
/config.php
/config/db.php
/temp
```

## Contributing

Patches welcome

## License
MIT