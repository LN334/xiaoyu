const fs = require('fs');
function edit(rel, oldText, newText) {
  const p = 'D:/小禹/' + rel;
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  if (s.includes(newText)) { console.log('already ' + rel); return; }
  if (!s.includes(oldText)) { console.log('MISS ' + rel); process.exitCode = 1; return; }
  s = s.replace(oldText, newText);
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(p, s, 'utf8');
  console.log('updated ' + rel);
}

edit('native/ZhifuWater.Desktop/Data/Models.cs',
'    public bool Read { get; set; }\n    public string Kind { get; set; } = "system";',
'    public bool Read { get; set; }\n    public string Kind { get; set; } = "system";\n    public string Link { get; set; } = "";');

edit('native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs',
`                if (item.Read) return;
                _services.Data.MarkNotificationRead(item.Id);
                BuildBellList();
                UpdateBadges();
            };`,
`                if (!item.Read)
                {
                    _services.Data.MarkNotificationRead(item.Id);
                    BuildBellList();
                    UpdateBadges();
                }
                var link = item.Link.TrimStart('/');
                if (link.Length > 0)
                {
                    BellPopup.IsOpen = false;
                    ShowPage(link);
                }
            };`);
