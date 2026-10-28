// Jembatan aman antara jendela (HTML) dan proses utama (main.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  command: (cmd) => ipcRenderer.send('command', cmd),
  onState: (cb) => {
    ipcRenderer.on('state', (_e, s) => cb(s));
    ipcRenderer.send('request-state');
  },
  onFinished: (cb) => ipcRenderer.on('finished', (_e, id) => cb(id)),
  onCountdown: (cb) => ipcRenderer.on('countdown', (_e, d) => cb(d)),
  onDisplaysChanged: (cb) => ipcRenderer.on('displays-changed', () => cb()),
  outputCtl: (ctl) => ipcRenderer.send('output-ctl', ctl), // {type:'fullscreen', value:true|false|'toggle'} | {type:'onTop', value}
  onOutputInfo: (cb) => ipcRenderer.on('output-info', (_e, i) => cb(i)),
  onOutputFs: (cb) => ipcRenderer.on('output-fs', (_e, v) => cb(v)),
  addSound: () => ipcRenderer.invoke('sound:add'),
  readSound: (id) => ipcRenderer.invoke('sound:read', id),
  removeSound: (id) => ipcRenderer.invoke('sound:remove', id),
  onHotkeyStatus: (cb) => ipcRenderer.on('hotkey-status', (_e, st) => cb(st)),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  output: (opts) => ipcRenderer.send('output', opts), // {action:'open'|'close', mode, layout, displayId, displayIdB}
  serverInfo: () => ipcRenderer.invoke('server:info'),
  serverNewPin: () => ipcRenderer.invoke('server:newpin'),
  onServerChanged: (cb) => ipcRenderer.on('server-changed', () => cb()),
  onOutputStatus: (cb) => ipcRenderer.on('output-status', (_e, open) => cb(open)),
});
