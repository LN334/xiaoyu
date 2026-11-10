const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Windows/UpdateDialog.cs';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('    private static string CleanNotes(string? raw)');
const end = s.indexOf('    private async void OnPrimaryClick()');
if (start < 0 || end < 0 || end < start) { console.log('markers missing'); process.exit(1); }
const method = [
'    private static string CleanNotes(string? raw)',
'    {',
'        if (string.IsNullOrWhiteSpace(raw)) return "（本次更新没有附加说明）";',
'        var lines = raw.Replace("\\r\\n", "\\n").Split(\'\\n\')',
'            .Select(x => x.TrimEnd())',
'            .Where(x => !x.TrimStart().StartsWith(\'#\'))',
'            .Select(x => x.TrimStart().StartsWith("- ") ? "· " + x.TrimStart().Substring(2) : x)',
'            .ToList();',
'        var body = string.Join("\\n", lines).Trim();',
'        return body.Length == 0 ? "（本次更新没有附加说明）" : body;',
'    }',
'',
''
].join('\n');
s = s.slice(0, start) + method + s.slice(end);
fs.writeFileSync(p, s, 'utf8');
console.log('clean notes restored');
