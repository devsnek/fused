const request = require('snekfetch');
const Fused = require('../');

const f = new Fused();

const mode = {
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

f.add('/meme', {
  type: 'file',
  content: 'lol memes',
  mode,
});

f.add('/dream', {
  type: 'file',
  // if data this this is a write op
  content(data, cb) {
    cb(`LOL ${Math.random()}`);
  },
  mode,
});

f.add('/httpbin', {
  type: 'file',
  content: () => request.get('https://httpbin.org/get').then((r) => r.text),
  mode,
});

f.add(/\/dynamic(\/[^/]+)?/, (path) => ({
  type: path === '/dynamic' ? 'dir' : 'file',
  content: `wow look content from ${path}`,
  mode,
}));

f.mount('./mountpoint_test');
