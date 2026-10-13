const fs = require('fs'), path = require('path');
const files = fs.readdirSync(path.join(__dirname, 'js')).filter(f => f.endsWith('.js')).sort();
const v = Date.now().toString(36);
const tags = files.map(f => `<script src="js/${f}?v=${v}"></script>`).join('\n');
const html = fs.readFileSync(path.join(__dirname, 'shell.html'), 'utf8').replace('/*SCRIPTS*/', tags);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
for (const f of files) { try { new Function(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8')); } catch (e) { console.log('SYNTAX', f, e.message); } }
console.log('built index.html with', files.length, 'scripts');
