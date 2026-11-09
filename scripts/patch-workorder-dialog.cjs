const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Pages/WorkordersPage.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
function rep(oldText, newText, label) {
  if (!s.includes(oldText)) { console.log('MISS ' + label); process.exitCode = 1; return; }
  s = s.replace(oldText, newText);
  console.log('ok ' + label);
}

// 1. single column grid, no right detail card
rep(`        var grid = new Grid { Margin = new Thickness(0, 10, 0, 0) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.05, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });`,
`        var grid = new Grid { Margin = new Thickness(0, 10, 0, 0) };`, 'grid columns');

rep(`        _table.SelectionChanged += (_, _) =>
        {
            if (_table.SelectedItem is UiRow row && row.Data is WorkOrderInfo wo)
            {
                _selected = wo;
                ShowDetail();
            }
        };`,
`        _table.SelectionChanged += (_, _) =>
        {
            if (_suppressOpen) return;
            if (_table.SelectedItem is UiRow row && row.Data is WorkOrderInfo wo)
            {
                _selected = wo;
                OpenDetail(wo);
            }
        };`, 'selection');

rep(`        _detail = new StackPanel();
        var detailScroll = Kit.Scroll(_detail, 12);
        detailScroll.MinHeight = 540;
        var detailCard = Kit.Card("工单详情", detailScroll, null, null, new Thickness(10, 8, 10, 8));

        Grid.SetColumn(tableCard, 0);
        Grid.SetColumn(detailCard, 2);
        grid.Children.Add(tableCard);
        grid.Children.Add(detailCard);`,
`        grid.Children.Add(tableCard);`, 'remove detail card');

// 2. suppress auto-open during refresh
rep(`        _selected = all.FirstOrDefault(w => w.Id == keep) ?? all.FirstOrDefault();
        _table.SelectedItem = rows.FirstOrDefault(r => r.Data == _selected) ?? rows.FirstOrDefault();
        ShowDetail();`,
`        _selected = all.FirstOrDefault(w => w.Id == keep) ?? all.FirstOrDefault();
        _suppressOpen = true;
        _table.SelectedItem = rows.FirstOrDefault(r => r.Data == _selected) ?? rows.FirstOrDefault();
        _suppressOpen = false;`, 'refresh suppress');

// 3. detail builder parameterised
rep('    private void ShowDetail()\n    {\n        if (_detail == null) return;\n        _detail.Children.Clear();',
    '    private void ShowDetail(StackPanel host, System.Action? close = null)\n    {\n        var target = host;\n        target.Children.Clear();', 'signature');
s = s.split('_detail.Children').join('target.Children');
s = s.split('            _detail.Children').join('            target.Children');

// 4. close dialog after actions
rep('        if (w.Status is "pending" or "accepted" or "processing") actions.Children.Add(ActionButton("派发", () => Assign(w)));',
    '        if (w.Status is "pending" or "accepted" or "processing") actions.Children.Add(ActionButton("派发", () => { Assign(w); close?.Invoke(); }));', 'assign close');
rep('        if (w.Status == "pending") actions.Children.Add(ActionButton("接单", () => Advance(w, "accept", null)));',
    '        if (w.Status == "pending") actions.Children.Add(ActionButton("接单", () => { Advance(w, "accept", null); close?.Invoke(); }));', 'accept close');
rep('        if (w.Status == "accepted") actions.Children.Add(ActionButton("开始处理", () => Advance(w, "process", false)));',
    '        if (w.Status == "accepted") actions.Children.Add(ActionButton("开始处理", () => { Advance(w, "process", false); close?.Invoke(); }));', 'process close');
rep('        if (w.Status is "accepted" or "processing") actions.Children.Add(ActionButton("完成", () => Advance(w, "done", true)));',
    '        if (w.Status is "accepted" or "processing") actions.Children.Add(ActionButton("完成", () => { Advance(w, "done", true); close?.Invoke(); }));', 'done close');
rep('        if (w.Status == "done") actions.Children.Add(ActionButton("验收关闭", () => Advance(w, "close", null)));',
    '        if (w.Status == "done") actions.Children.Add(ActionButton("验收关闭", () => { Advance(w, "close", null); close?.Invoke(); }));', 'close close');

// 5. OpenDetail helper before ActionButton
rep('    private Button ActionButton(string text, Action click)',
`    private void OpenDetail(WorkOrderInfo wo)
    {
        var dlg = new DetailDialog(Host, "工单详情");
        ShowDetail(dlg.Body, dlg.Close);
        dlg.ShowDialog();
    }

    private Button ActionButton(string text, Action click)`, 'open helper');

// 6. field + suppress flag
rep('    private StackPanel _detail = null!;', '    private bool _suppressOpen;', 'field');

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('done');
