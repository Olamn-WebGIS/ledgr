import fs from 'fs';
const content = fs.readFileSync('src/App.jsx', 'utf8');

// Show what we're looking for
const patterns = ['â€"', 'â€™', 'â€¢', 'Welcome back â€" ', 'Savingâ€¦'];
patterns.forEach(p => {
  if (content.includes(p)) {
    console.log(`Found: ${p}`);
  }
});

let fixed = content;
fixed = fixed.replaceAll('Welcome back â€" your', 'Welcome back — your');
fixed = fixed.replaceAll('â€"', '—');
fixed = fixed.replaceAll('â€™', "'");
fixed = fixed.replaceAll('â€¢', '•');
fixed = fixed.replaceAll('Savingâ€¦', 'Saving…');

fs.writeFileSync('src/App.jsx', fixed, 'utf8');
console.log('Done fixing');
