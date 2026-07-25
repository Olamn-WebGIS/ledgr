const fs = require('fs');
const path = require('path');
const filePath = path.join('src', 'App.jsx');
let text = fs.readFileSync(filePath, 'utf8');
const original = text;
text = text.replace(/(['"`])http:\/\/localhost:5000([^'"`]*)\1/g, (match, quote, tail) => {
  if (quote === '`') {
    return `\${apiBaseUrl}${tail}`;
  }
  return `\${apiBaseUrl}${tail}`;
});
if (text !== original) {
  fs.writeFileSync(filePath, text, 'utf8');
  console.log('Replaced localhost API URLs in src/App.jsx.');
} else {
  console.log('No replacements were made.');
}
