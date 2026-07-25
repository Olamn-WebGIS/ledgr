const fs = require('fs');
const path = require('path');
const filePath = path.join('src', 'App.jsx');
let text = fs.readFileSync(filePath, 'utf8');
const original = text;
text = text.replace(/(['"`])http:\/\/localhost:5000([^'"`]*)\1/g, (match, quote, tail) => {
  return `\`${apiBaseUrl}${tail}\``;
});
fs.writeFileSync(filePath, text, 'utf8');
console.log('done', text !== original ? 'changed' : 'unchanged');
