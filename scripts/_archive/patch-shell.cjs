const fs = require('fs');

function edit(p, subs) {
  const raw = fs.readFileSync(p);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8');
  if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  for (const [a, b] of subs) {
    if (s.split(a).length !== 2) throw new Error('anchor x' + (s.split(a).length - 1) + ' in ' + p + ': ' + a.slice(0, 60));
    s = s.replace(a, b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
  console.log('patched', p);
}

const root = 'D:/小禹/native/ZhifuWater.Desktop/';

edit(root + 'Windows/MainWindow.xaml.cs', [
  [`        SidebarSource.Text = "本机业务层 · 每 5 秒刷新";\n        FooterSource.Text = "本机业务层";\n`, ''],
  [`        PageTitle.Text = nav.Title ?? id;\n        PageCrumb.Text = (nav.Group ?? "页面") + " / " + (nav.Title ?? id);\n        UpdateFooter();`,
   `        PageTitle.Text = nav.Title ?? id;\n        UpdateFooter();`],
  [`        FooterSource.Text = "站点：" + _services.Data.Site.Name;\n`, ''],
]);

edit(root + 'Windows/LoginWindow.xaml.cs', [
  [`    private void OnFillClick(object sender, RoutedEventArgs e)\n    {\n        AccountBox.Text = "admin";\n        PasswordBox.Password = "water123";\n        PasswordBox.Focus();\n        ErrorText.Visibility = Visibility.Collapsed;\n    }\n\n`, ''],
]);
