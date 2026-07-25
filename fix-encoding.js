import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// First pass: fix mojibake with regex
content = content.replace(/â€™/g, "'");
content = content.replace(/â€¢/g, '•');
content = content.replace(/â€"/g, '—');
content = content.replace(/â€…/g, '…');
content = content.replace(/â‹¯/g, '…');
content = content.replace(/â€¦/g, '…');

// Second pass: fix specific known instances
content = content.replace("Welcome back â€" your", "Welcome back — your");
content = content.replace("Saving", "Saving…");  
content = content.replace("Don't", "Don't");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed all encoding issues');
