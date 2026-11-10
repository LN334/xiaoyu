const fs = require('fs');
function edit(rel, fn) {
  const p = 'D:/小禹/' + rel;
  let s = fs.readFileSync(p, 'utf8');
  const out = fn(s);
  if (out === s) console.log('unchanged ' + rel);
  else { fs.writeFileSync(p, out, 'utf8'); console.log('updated ' + rel); }
}
edit('native/ZhifuWater.Desktop/Data/Models.cs', s => s.replace(
'    public bool Read { get; set; }\n    public string Kind { get; set; } = "system";',
'    public bool Read { get; set; }\n    public string Kind { get; set; } = "system";\n    public string Link { get; set; } = "";'));
edit('native/ZhifuWater.Desktop/Data/CoreDesktopData.cs', s => s.replace(
'            Kind = J.Str(n, "type", "system"),',
'            Kind = J.Str(n, "type", "system"),\n            Link = J.Str(n, "link"),'));
edit('native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs', s => {
  const old = `                if (item.Read) return;
                _services.Data.MarkNotificationRead(item.Id);
                BuildBellList();
                UpdateBadges();
            };`;
  if (!s.includes(old)) throw new Error('handler anchor missing');
  const neu = `                if (!item.Read)
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
            };`;
  return s.replace(old, neu);
});
console.log('notification link patched');
