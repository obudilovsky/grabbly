// Visual check: `npx electron test/ui-shot.js out.png [zoom]` fills the UI with fake cards and saves a screenshot.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
require('../src/main.js');
const out = process.argv.find((a) => a.endsWith('.png')) || 'shot.png';
const zoom = process.argv.find((a) => /^\d+$/.test(a)) || '170';
const media = process.argv.find((a) => ['photos','videos','both'].includes(a)) || 'both';
app.whenReady().then(() => setTimeout(async () => {
  const w = BrowserWindow.getAllWindows()[0];
  const js = `
    const cols = ['#ff8a3d','#8a4dff','#1c1d26','#2a6df4','#34d399','#f43f5e'];
    for (let i = 0; i < 120; i++) {
      addCard({ id: 'id' + i, kind: ['video','video','carousel','photo'][i % 4], count: 3, title: i % 3 ? 'Dance practice number ' + i + ' #pole #fitness' : '', thumbnail: null });
      const rec = items.get('id' + i);
      rec.el.querySelector('.thumb').style.backgroundImage = 'linear-gradient(160deg,' + cols[i % 6] + ',#0b0b10)';
      if (i % 4 === 0) setSelected(rec, true);
    }
    document.querySelector('#mediaType [data-v=${media}]').click(); document.getElementById('zoom').value = ${zoom}; document.getElementById('zoom').oninput();
    mode = 'downloading'; setTask('Downloading 7 of 30', 24); document.getElementById('mediaType').querySelector('[data-v=both]').click(); batch = [...items.values()].filter(r => r.sel); batch.forEach((r,i)=>{ r.status = i < 6 ? 'done' : i < 9 ? 'downloading' : 'idle'; r.percent = r.status==='done'?100:40; });
    items.get('id0').bar.style.width='100%'; setBadgeTest = 1;
    updateOverall(); refresh(); setMsg('');
    setDir('/Users/me/Downloads/Grabbly');
  `;
  await w.webContents.executeJavaScript(js);
  await new Promise((r) => setTimeout(r, 600));
  fs.writeFileSync(out, (await w.webContents.capturePage()).toPNG());
  app.exit(0);
}, 1500));
