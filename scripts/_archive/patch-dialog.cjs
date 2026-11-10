const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Ui/Dialog.cs';
let raw = fs.readFileSync(p);
const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
let s = raw.toString('utf8');
if (bom) s = s.slice(1);
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('x' + (s.split(a).length - 1) + ': ' + a.slice(0, 60)); s = s.replace(a, b); }

rep('        Width = 440;\n        SizeToContent = SizeToContent.Height;\n        ResizeMode = ResizeMode.NoResize;',
    '        Width = 440;\n        SizeToContent = SizeToContent.Height;\n        ResizeMode = ResizeMode.NoResize;\n        WindowStyle = WindowStyle.None;\n        WindowChrome.SetWindowChrome(this, new WindowChrome\n        {\n            CaptionHeight = 0,\n            ResizeBorderThickness = 0,\n            GlassFrameThickness = new Thickness(0),\n            CornerRadius = new CornerRadius(0),\n            UseAeroCaptionButtons = false,\n        });');

rep('            Margin = new Thickness(12),\n            Padding = new Thickness(18),',
    '            Margin = new Thickness(0),\n            Padding = new Thickness(18, 14, 18, 18),');

rep('        var stack = new StackPanel();\n        stack.Children.Add(Kit.H2(title));',
    `        var stack = new StackPanel();
        var head = new Grid { Margin = new Thickness(0, 0, 0, 8) };
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var headTitle = Kit.T(title, 14, Pal.Ink, bold: true);
        headTitle.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(headTitle);
        var close = new Button
        {
            Content = "\\uE8BB",
            Style = Kit.St("CaptionCloseButton"),
            Width = 28,
            Height = 24,
            FontFamily = new FontFamily("Segoe MDL2 Assets"),
            FontSize = 10,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        close.Click += (_, _) => { DialogResult = false; Close(); };
        Grid.SetColumn(close, 1);
        head.Children.Add(close);
        head.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed) DragMove(); };
        stack.Children.Add(head);`);

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
console.log('dialog chrome ok');
