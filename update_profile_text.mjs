import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appPath, 'utf-8');

// Replace the description text to be conditional based on profile
// Using regex to match the apostrophe regardless of which character encoding is used
content = content.replace(
  /Sign up to sync your workspace, or keep working locally until you.{1,2}re ready\./,
  '{profile ? \'Manage your account or reset your workspace.\' : \'Sign up to sync your workspace, or keep working locally until you\\\'re ready.\'}'
);

fs.writeFileSync(appPath, content, 'utf-8');
console.log('Updated profile description text');
