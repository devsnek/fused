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

function check(paths, query) {
  // separate loops because order matters
  for (const path of paths.keys()) {
    if (typeof path !== 'string') continue;
    if (path === query) return paths.get(query);
  }
  for (const path of paths.keys()) {
    if (!(path instanceof RegExp)) continue;
    if (path.test(query)) {
      const ret = paths.get(path)(query);
      ret.temp = true;
      return ret;
    }
  }
  return null;
}

function makeInfo(options, info) {
  return {
    cache: {},
    content: info.content,
    size() {
      const c = this.cache || this.content;
      return typeof c === 'string' ? Buffer.byteLength(c) : options.pseudoSize || 0;
    },
    mtime: new Date(),
    ctime: new Date(),
    atime: new Date(),
    mode: new Mode(Object.assign({ type: info.type }, info.mode || {})),
  };
}

class Fused extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      pseudoSize: options.pseudoSize || 2 << 12,
    };
    this.paths = new Map();
    this.paths.set('/', {
      cache: null,
      mtime: new Date(),
      ctime: new Date(),
      atime: new Date(),
      size: () => this.getChildren('/').reduce((a, b) => {
        if (typeof b !== 'string') return a;
        return a + this.paths.get(b).size();
      }, 0),
      mode: new Mode(16877),
    });
    this.fdOffset = 42;
  }

  async mount(path) {
    await cleanup(path, true);
    await mkdir(path);
    await fuseMount(path, [
      'getattr', 'readdir',
      'create', 'unlink',
      'open', 'read', 'write',
      'truncate', 'ftruncate',
      'release',
    ].reduce((o, n) => {
      o[n] = this[n].bind(this);
      return o;
    }, {}));
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
    } else if (path instanceof RegExp) {
      this.paths.set(path, (p) => makeInfo(this.options, info(p)));
    } else if (typeof path === 'string') {
      if (path === '/') throw new Error('Cannot mount to root path');
      path = path.replace(/\/$/, '');
      if (check(this.paths, path)) return;
      this.paths.set(path, makeInfo(this.options, info));
    }
  }

  getChildren(query) {
    const ret = [];
    for (const path of this.paths.keys()) {
      if (typeof path !== 'string') continue;
      if (path === query || !path.startsWith(query)) continue;
      const p = query === '/' ? path : path.replace(query, '');
      ret.push(p);
    }
    return ret;
  }

  getattr(path, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
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
    if (!check(this.paths, path)) return cb(fuse.ENOENT);
    cb(0, this.getChildren(path).map((p) => p.slice(1)));
  }

  create(path, flags, cb) {
    if (check(this.paths, path)) return cb(fuse.EEXIST);
    cb(fuse.EPERM);
  }

  unlink(path, cb) {
    if (!check(this.paths, path)) return cb(fuse.ENOENT);
    cb(fuse.EPERM);
  }

  open(path, flags, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
    const fd = this.fdOffset++;
    new Promise((resolve) => {
      if (typeof file.content === 'function') {
        const ret = file.content(null, resolve);
        if (ret instanceof Promise) ret.then(resolve);
      } else {
        resolve(file.content);
      }
    }).then((data) => {
      if (file.temp) this.paths.set(path, file);
      file.cache[fd] = data ? Buffer.from(data) : Buffer.alloc(0).fill(0);
      return cb(0, fd);
    });
  }

  read(path, fd, buffer, length, position, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
    if (!file.cache[fd]) return cb(0);
    const part = file.cache[fd].slice(position, position + length);
    part.copy(buffer, position, 0, part.length);
    cb(part.length);
  }

  write(path, fd, buffer, length, position, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
    if (!file.cache[fd]) file.cache[fd] = Buffer.alloc(length).fill(0);
    const part = buffer.slice(0, length);
    if (file.cache[fd].length < part.length) {
      file.cache[fd] = Buffer.from(part);
    } else {
      part.copy(file.cache[fd], position, 0, length);
    }
    cb(part.length);
  }

  truncate(path, len, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
    const buffer = Buffer.alloc(len).fill(0);
    if (len === 0) {
      file.content = buffer.toString();
    } else {
      Buffer.from(file.content).copy(buffer, 0, 0, len);
      file.content = buffer.toString();
    }
    cb(0);
  }

  ftruncate(path, fd, len, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
    if (!file.cache[fd]) return cb(0);
    const buffer = Buffer.alloc(len).fill(0);
    if (len === 0) {
      file.cache[fd] = buffer;
    } else {
      file.cache[fd].copy(buffer, 0, 0, len);
      file.cache[fd] = buffer;
    }
    cb(0);
  }

  release(path, fd, cb) {
    const file = check(this.paths, path);
    if (!file) return cb(fuse.ENOENT);
    if (!file.cache[fd]) return cb(0);
    if (file.temp) this.paths.delete(path);
    new Promise((resolve) => {
      const cleaned = file.cache[fd].toString().trim().replace(/\u0000+$/, '');
      if (typeof file.content === 'function') {
        const ret = file.content(cleaned, resolve);
        if (ret instanceof Promise) ret.then(resolve);
      } else {
        file.content = cleaned;
        resolve();
      }
    }).then(() => cb(0));
  }
}

module.exports = Fused;

function cleanup(mountDir, force) {
  return (force ? Promise.resolve() : stat(mountDir))
    .then(() => fuseUnmount(mountDir))
    .then(() => rmdir(mountDir))
    .then(() => true)
    .catch(async(err) => {
      if (err.code === 'ENOENT') return true;
      console.error(err); // eslint-disable-line no-console
      try { await rmdir(mountDir); } catch (err) {} // eslint-disable-line no-empty, no-shadow
      return false;
    });
}
