const fs = require('fs');
function edit(rel, fn) {
  const p = 'D:/小禹/' + rel;
  let s = fs.readFileSync(p, 'utf8');
  const out = fn(s);
  if (out === s) { console.log('unchanged ' + rel); return; }
  fs.writeFileSync(p, out, 'utf8');
  console.log('updated ' + rel);
}

edit('native/ZhifuWater.Desktop/Data/IDesktopData.cs', s => s.replace(
  '    void MarkNotificationsRead();',
  '    void MarkNotificationsRead();\n    void MarkNotificationRead(string id);'));

edit('native/ZhifuWater.Desktop/Data/CoreDesktopData.cs', s => {
  const anchor = `    public void MarkNotificationsRead()
    {
        try
        {
            _core.Admin.MarkNotificationsRead(_user, new JsonObject { ["all"] = true });
            _notificationsAt = 0;
            _notifications = new JsonObject();
        }
        catch (CoreException) { }
    }`;
  if (!s.includes(anchor)) throw new Error('core anchor missing');
  const add = anchor + `

    public void MarkNotificationRead(string id)
    {
        try
        {
            _core.Admin.MarkNotificationsRead(_user, new JsonObject { ["ids"] = new JsonArray(id) });
            _notificationsAt = 0;
            _notifications = new JsonObject();
        }
        catch (CoreException) { }
    }`;
  return s.replace(anchor, add);
});

edit('native/ZhifuWater.Desktop/Data/DemoDesktopData.Content.cs', s => {
  const anchor = `    public void MarkNotificationsRead()
    {
        foreach (var n in _notifications) n.Read = true;
        Touch();
    }`;
  if (!s.includes(anchor)) throw new Error('demo anchor missing');
  return s.replace(anchor, anchor + `

    public void MarkNotificationRead(string id)
    {
        var item = _notifications.FirstOrDefault(n => n.Id == id);
        if (item == null || item.Read) return;
        item.Read = true;
        Touch();
    }`);
});

edit('native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs', s => {
  const anchor = `            var border = new Border
            {
                Padding = new Thickness(8, 6, 8, 6),
                Background = n.Read ? System.Windows.Media.Brushes.Transparent : Kit.Br("Surface2"),
                Child = rowGrid,
            };
            BellList.Children.Add(border);`;
  if (!s.includes(anchor)) throw new Error('bell anchor missing');
  const add = `            var border = new Border
            {
                Padding = new Thickness(8, 6, 8, 6),
                Background = n.Read ? System.Windows.Media.Brushes.Transparent : Kit.Br("Surface2"),
                Child = rowGrid,
                Cursor = System.Windows.Input.Cursors.Hand,
            };
            var item = n;
            border.MouseLeftButtonUp += (_, _) =>
            {
                if (item.Read) return;
                _services.Data.MarkNotificationRead(item.Id);
                BuildBellList();
                UpdateBadges();
            };
            BellList.Children.Add(border);`;
  return s.replace(anchor, add);
});
console.log('notification read-by-item patched');
