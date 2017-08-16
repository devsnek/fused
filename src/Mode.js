/**
 * Constants (defined in `stat.h`).
 */

const S_IFMT = 61440; /* 0170000 type of file */
const S_IFIFO = 4096; /* 0010000 named pipe (fifo) */
const S_IFCHR = 8192; /* 0020000 character special */
const S_IFDIR = 16384; /* 0040000 directory */
const S_IFBLK = 24576; /* 0060000 block special */
const S_IFREG = 32768; /* 0100000 regular */
const S_IFLNK = 40960; /* 0120000 symbolic link */
const S_IFSOCK = 49152; /* 0140000 socket */
const S_IFWHT = 57344; /* 0160000 whiteout */
const S_ISUID = 2048; /* 0004000 set user id on execution */
const S_ISGID = 1024; /* 0002000 set group id on execution */
const S_ISVTX = 512; /* 0001000 save swapped text even after use */
const S_IRUSR = 256; /* 0000400 read permission, owner */
const S_IWUSR = 128; /* 0000200 write permission, owner */
const S_IXUSR = 64; /* 0000100 execute/search permission, owner */
const S_IRGRP = 32; /* 0000040 read permission, group */
const S_IWGRP = 16; /* 0000020 write permission, group */
const S_IXGRP = 8; /* 0000010 execute/search permission, group */
const S_IROTH = 4; /* 0000004 read permission, others */
const S_IWOTH = 2; /* 0000002 write permission, others */
const S_IXOTH = 1; /* 0000001 execute/search permission, others */

class Mode {
  constructor(options = {}) {
    this.mode = typeof options === 'number' ? options : 0;
    this.owner = new Permissions(this, S_IRUSR, S_IWUSR, S_IXUSR, options.owner);
    this.group = new Permissions(this, S_IRGRP, S_IWGRP, S_IXGRP, options.group);
    this.others = new Permissions(this, S_IROTH, S_IWOTH, S_IXOTH, options.others);
    if (options.type) {
      switch (options.type) {
        case 'dir':
        case 'directory':
          this.isDirectory(true);
          break;
        case 'file':
          this.isFile(true);
          break;
        case 'block':
          this.isBlockDevice(true);
          break;
        case 'character':
          this.isCharacterDevice(true);
          break;
        case 'symlink':
          this.isSymbolicLink(true);
          break;
        case 'fifo':
          this.isFIFO(true);
          break;
        case 'socket':
          this.isSocket(true);
          break;
      }
    }

    if (options && Reflect.has(options, 'setuid')) this.setuid = options.setuid;
    if (options && Reflect.has(options, 'setgid')) this.setgid = options.setgid;
  }

  valueOf() {
    return this.mode;
  }

  toString() {
    const str = [];
    // file type
    if (this.isDirectory()) {
      str.push('d');
    } else if (this.isFile()) {
      str.push('-');
    } else if (this.isBlockDevice()) {
      str.push('b');
    } else if (this.isCharacterDevice()) {
      str.push('c');
    } else if (this.isSymbolicLink()) {
      str.push('l');
    } else if (this.isFIFO()) {
      str.push('p');
    } else if (this.isSocket()) {
      str.push('s');
    } else {
      throw new TypeError('unexpected "file type"');
    }
    // owner read, write, execute
    str.push(this.owner.read ? 'r' : '-');
    str.push(this.owner.write ? 'w' : '-');
    if (this.setuid) {
      str.push(this.owner.execute ? 's' : 'S');
    } else {
      str.push(this.owner.execute ? 'x' : '-');
    }
    // group read, write, execute
    str.push(this.group.read ? 'r' : '-');
    str.push(this.group.write ? 'w' : '-');
    if (this.setgid) {
      str.push(this.group.execute ? 's' : 'S');
    } else {
      str.push(this.group.execute ? 'x' : '-');
    }
    // others read, write, execute
    str.push(this.others.read ? 'r' : '-');
    str.push(this.others.write ? 'w' : '-');
    if (this.sticky) {
      str.push(this.others.execute ? 't' : 'T');
    } else {
      str.push(this.others.execute ? 'x' : '-');
    }
    return str.join('');
  }

  _checkModeProperty(property, set) {
    const mode = this.mode;
    if (set) {
      this.mode = (mode | S_IFMT) & property | mode & ~S_IFMT;
    }
    return (mode & S_IFMT) === property;
  }

  isDirectory(v) {
    return this._checkModeProperty(S_IFDIR, v);
  }

  isFile(v) {
    return this._checkModeProperty(S_IFREG, v);
  }

  isBlockDevice(v) {
    return this._checkModeProperty(S_IFBLK, v);
  }

  isCharacterDevice(v) {
    return this._checkModeProperty(S_IFCHR, v);
  }

  isSymbolicLink(v) {
    return this._checkModeProperty(S_IFLNK, v);
  }

  isFIFO(v) {
    return this._checkModeProperty(S_IFIFO, v);
  }

  isSocket(v) {
    return this._checkModeProperty(S_IFSOCK, v);
  }

  get setuid() {
    return Boolean(this.mode & S_ISUID);
  }
  set setuid(v) {
    if (v) {
      this.mode |= S_ISUID;
    } else {
      this.mode &= ~S_ISUID;
    }
  }

  get setgid() {
    return Boolean(this.mode & S_ISGID);
  }
  set setgid(v) {
    if (v) {
      this.mode |= S_ISGID;
    } else {
      this.mode &= ~S_ISGID;
    }
  }

  get sticky() {
    return Boolean(this.mode & S_ISVTX);
  }
  set sticky(v) {
    if (v) {
      this.mode |= S_ISVTX;
    } else {
      this.mode &= ~S_ISVTX;
    }
  }
}

function Permissions(mode, READ, WRITE, EXECUTE, options = {}) {
  const ret = {
    get read() { return Boolean(mode.mode & READ); },
    set read(v) {
      if (v) {
        mode.mode |= READ;
      } else {
        mode.mode &= ~READ;
      }
    },

    get write() { return Boolean(mode.mode & WRITE); },
    set write(v) {
      if (v) {
        mode.mode |= WRITE;
      } else {
        mode.mode &= ~WRITE;
      }
    },

    get execute() { return Boolean(mode.mode & EXECUTE); },
    set execute(v) {
      if (v) {
        mode.mode |= EXECUTE;
      } else {
        mode.mode &= ~EXECUTE;
      }
    },
  };

  if (options && Reflect.has(options, 'read')) ret.read = options.read;
  if (options && Reflect.has(options, 'write')) ret.write = options.write;
  if (options && Reflect.has(options, 'execute')) ret.execute = options.execute;

  return ret;
}

module.exports = Mode;
