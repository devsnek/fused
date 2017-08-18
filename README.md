# Fused
#### Amazingly simple and effective bindings for fuse

```js
const Fused = require('fused');

const f = new Fused();

const defaultMode = {
  owner: {
    read: true,
    write: true,
    execute: true,
  },
  group: {
    read: true,
    execute: true,
  },
  others: {
    read: true,
    execute: true,
  },
};

// these options are much more powerful but more on that later
f.add('/static', {
  type: 'file',
  content: 'some static content',
  mode: defaultMode,
});

let pings = 0;
f.add('/dynamic', {
  type: 'file',
  content(data, cb) {
    // if data is not null, this is a write op
    // callback with data for read ops
    cb(`Number of pings: ${pings++}`);
  },
  mode: defaultMode,
});

f.add('/promise', {
  type: 'file',
  content() {
    return Promise.resolve('wow look it works with promises too!');
  },
  mode: defaultMode,
});

f.mount('./magic').then(() => console.log('Mounted!'));
```

```js
{
  type: String[dir, directory, file, block, character, symlink, fifo, socket],
  content: String|Function,
  modifiedAt: Date =new Date,
  changedAt: Date =new Date,
  createdAt: Date =new Date,
  mode: {
    owner: {},
    group: {},
    others: {},
  },
  setuid: Number =process.setuid(),
  setgid: Number =process.setgid(),
}
```
