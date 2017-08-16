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

f.mount('./mountpoint_test');
