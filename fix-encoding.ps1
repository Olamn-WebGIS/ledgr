$content = [System.IO.File]::ReadAllText('src/App.jsx', [System.Text.Encoding]::UTF8)

# Replace mojibake characters
$content = $content -replace 'â€™', "'"
$content = $content -replace 'â€¢', '•'
$content = $content -replace 'â€"', '—'
$content = $content -replace 'â€…', '…'
$content = $content -replace 'â‹¯', '…'
$content = $content -replace 'Savingâ€¦', 'Saving…'
$content = $content -replace 'Donâ€™t', "Don't"

[System.IO.File]::WriteAllText('src/App.jsx', $content, [System.Text.Encoding]::UTF8)
Write-Host 'All encoding issues fixed'
