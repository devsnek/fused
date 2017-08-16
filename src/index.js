const fs = require('fs');
const util = require('util');
const EventEmitter = require('events');
const fuse = require('fuse-bindings');

const Mode = require('./Mode');

const stat = util.promisify(fs.stat.bind(fs));
const mkdir = util.promisify(fs.mkdir.bind(fs));
const rmdir = util.promisify(fs.rmdir.bind(fs));
const fuseMount = util.promisify(fuse.mount.bind(fuse));
const fuseUnmount = util.promisify(fuse.unmount.bind(fuse));

class Fused extends EventEmitter {
  constructor() {
    super();
    this.paths = {
      '/': {
        cache: null,
        mtime: new Date(),
        ctime: new Date(),
        atime: new Date(),
        size: () => this.getChildren('/').reduce((a, b) => a + this.paths[b].size(), 0),
        mode: new Mode(16877),
      },
    };
  }

  async mount(path) {
    await cleanup(path, true);
    await mkdir(path);
    await fuseMount(path, {
      getattr: this.getattr.bind(this),
      readdir: this.readdir.bind(this),
      create: this.create.bind(this),
      unlink: this.unlink.bind(this),
      open: this.open.bind(this),
      read: this.read.bind(this),
      write: this.write.bind(this),
      release: this.release.bind(this),
    });
    process.on('exit', (code) => cleanup(path).then(() => process.reallyExit(code)));
    process.on('SIGINT', () => cleanup(path, true).then(() => process.reallyExit(0)));
    process.on('SIGTERM', () => cleanup(path).then(() => process.reallyExit(0)));
    process.on('uncaughtException', (err) => {
      console.error(err); // eslint-disable-line no-console
      cleanup(path, true).then(() => process.reallyExit(1));
    });
    process.on('unhandledRejection', (err) => {
      console.error(err); // eslint-disable-line no-console
      cleanup(path, true).then(() => process.reallyExit(1));
    });
    this.emit('mounted', this);
    return this;
  }

  add(path, info) {
    if (Array.isArray(path)) {
      for (const item of path) this.add(item.path, item.info);
      return;
    }
    if (path === '/') throw new Error('Cannot mount to root path');
    path = path.replace(/\/$/, '');
    if (Reflect.has(this.paths, path)) return;
    this.paths[path] = {
      cache: null,
      content: info.content,
      size() {
        const c = this.cache || this.content;
        return c ? Buffer.byteLength(c) : 0;
      },
      mtime: info.modifiedTime || new Date(),
      ctime: info.changedTime || new Date(),
      atime: info.accessedTime || new Date(),
      mode: new Mode(Object.assign({ type: info.type }, info.mode || {})),
    };
  }

  getChildren(query) {
    const ret = [];
    for (const path of Object.keys(this.paths)) {
      if (typeof path !== 'string') continue;
      if (path === query || !path.startsWith(query)) continue;
      const p = query === '/' ? path : path.replace(query, '');
      ret.push(p);
    }
    return ret;
  }

  getattr(path, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    const file = this.paths[path];
    cb(0, {
      mtime: file.mtime,
      atime: file.atime,
      ctime: file.ctime,
      mode: file.mode.mode,
      size: file.size(),
      uid: process.getuid ? process.getuid() : 0,
      gid: process.getgid ? process.getgid() : 0,
    });
  }

  readdir(path, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    cb(0, this.getChildren(path).map((p) => p.slice(1)));
  }

  create(path, flags, cb) {
    if (Reflect.has(this.paths, path)) return cb(fuse.EEXIST);
    cb(fuse.EPERM);
  }

  unlink(path, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    cb(fuse.EPERM);
  }

  open(path, flags, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    const file = this.paths[path];
    file.cache = file.content ? Buffer.from(file.content) : null;
    cb(0);
  }

  read(path, fd, buffer, length, position, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    const file = this.paths[path];
    if (!file.cache) return cb(0);
    const part = file.cache.slice(position, position + length);
    part.copy(buffer, position, 0, part.length);
    cb(part.length);
  }

  write(path, fd, buffer, length, position, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    const file = this.paths[file];
    if (!file.cache) file.cache = new Buffer();
    const part = buffer.slice(0, length);
    part.copy(file.cache, position);
    cb(part.length);
  }

  release(path, fd, cb) {
    if (!Reflect.has(this.paths, path)) return cb(fuse.ENOENT);
    const file = this.paths[path];
    if (!file.cache) return cb(0);
    file.content = file.cache.toString();
    file.cache = null;
    cb(0);
  }
}

module.exports = Fused;

function cleanup(mountDir, force) {
  return (force ? Promise.resolve() : stat(mountDir))
    .then(() => {
      console.log('UNMOUNTING', mountDir); // eslint-disable-line no-console
      return fuseUnmount(mountDir);
    })
    .then(() => rmdir(mountDir))
    .then(() => true)
    .catch(async(err) => {
      if (err.code === 'ENOENT') return true;
      console.error(err); // eslint-disable-line no-console
      try { await rmdir(mountDir); } catch (err) {} // eslint-disable-line no-empty, no-shadow
      return false;
    });
}
