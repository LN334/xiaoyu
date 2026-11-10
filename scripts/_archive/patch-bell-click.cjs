const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
if (s.includes('MarkNotificationRead(item.Id)')) { console.log('already'); process.exit(0); }
const oldBlock = [
'                Background = n.Read ? System.Windows.Media.Brushes.Transparent : Kit.Br("Surface2"),',
'                Child = rowGrid,',
'            };',
'            BellList.Children.Add(border);',
].join('\n');
if (!s.includes(oldBlock)) { console.log('block missing'); process.exit(1); }
const newBlock = [
'                Background = n.Read ? System.Windows.Media.Brushes.Transparent : Kit.Br("Surface2"),',
'                Child = rowGrid,',
'                Cursor = System.Windows.Input.Cursors.Hand,',
'            };',
'            var item = n;',
'            border.MouseLeftButtonUp += (_, _) =>',
'            {',
'                if (item.Read) return;',
'                _services.Data.MarkNotificationRead(item.Id);',
'                BuildBellList();',
'                UpdateBadges();',
'            };',
'            BellList.Children.Add(border);',
].join('\n');
s = s.replace(oldBlock, newBlock);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('bell click patched');
