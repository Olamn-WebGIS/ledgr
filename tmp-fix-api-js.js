const fs = require('fs');
const path = require('path');
const file = path.join('src', 'App.jsx');
let text = fs.readFileSync(file, 'utf8');
const before = text;
text = text.replace(/(["'`])http:\/\/localhost:5000([^"'`]*)\1/g, (match, quote, tail) => {
  return `
` + '${apiBaseUrl}' + tail + `
`;
});
if (text !== before) {
  fs.writeFileSync(file, text, 'utf8');
  console.log('Replaced localhost API URLs in src/App.jsx');
} else {
  console.log('No replacements were needed');
}
