const Fused = require('../');

const f = new Fused();

f.add('/meme', {
  type: 'file',
  content: 'lol memes',
  mode: {
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
  },
});

f.add('/dream', {
  type: 'file',
  // if data this this is a write op
  content(data, cb) {
    cb(`LOL ${Math.random()}`);
  },
  mode: {
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
  },
})

f.mount('./mountpoint_test');
