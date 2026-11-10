const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
if (s.includes('ShowAssignmentDialog')) { console.log('already'); process.exit(0); }

const start = '    private readonly HashSet<string> _seenNotifications = new();';
const end = `    private void OnAssignmentToastView(object sender, RoutedEventArgs e)
    {
        var n = _assignmentToastItem;
        _assignmentToastTimer?.Stop();
        AssignmentToast.Visibility = Visibility.Collapsed;
        if (n == null) return;
        _services.Data.MarkNotificationRead(n.Id);
        UpdateBadges();
        ShowPage("workorders");
    }`;
const i = s.indexOf(start);
const j = s.indexOf(end);
if (i < 0 || j < 0) { console.log('block missing'); process.exit(1); }
const block = `    private readonly HashSet<string> _seenNotifications = new();
    private bool _assignmentToastSeeded;

    private void WatchAssignments()
    {
        try
        {
            var unread = _services.Data.Notifications.Where(n => !n.Read).ToList();
            var fresh = unread.Where(n => !_seenNotifications.Contains(n.Id)).ToList();
            foreach (var n in unread) _seenNotifications.Add(n.Id);
            var orders = unread.Where(n => n.Kind == "workorder").ToList();

            if (!_assignmentToastSeeded)
            {
                _assignmentToastSeeded = true;
                if (orders.Count > 0) ShowAssignmentDialog(orders);
                return;
            }

            if (fresh.Any(n => n.Kind == "workorder") && orders.Count > 0) ShowAssignmentDialog(orders);
        }
        catch
        {
            // 提示失败不影响主界面
        }
    }

    private void ShowAssignmentDialog(IReadOnlyList<NotificationInfo> orders)
    {
        if (orders.Count == 0) return;
        FlashTaskbar();
        var dlg = new AssignmentDialog(this, orders[orders.Count - 1], orders.Count) { Owner = this };
        if (dlg.ShowDialog() == true)
        {
            _services.Data.MarkNotificationRead(orders[orders.Count - 1].Id);
            UpdateBadges();
            ShowPage("workorders");
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    private void FlashTaskbar()
    {
        try
        {
            var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            if (handle == IntPtr.Zero) return;
            var info = new FLASHWINFO
            {
                cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<FLASHWINFO>(),
                hwnd = handle,
                dwFlags = 0x00000003 | 0x0000000C,
                uCount = 4,
                dwTimeout = 0,
            };
            FlashWindowEx(ref info);
        }
        catch { }
    }

    private void OnAssignmentToastClose(object sender, RoutedEventArgs e)
    {
        AssignmentToast.Visibility = Visibility.Collapsed;
    }

    private void OnAssignmentToastView(object sender, RoutedEventArgs e)
    {
        AssignmentToast.Visibility = Visibility.Collapsed;
        ShowPage("workorders");
    }`;
s = s.slice(0, i) + block + s.slice(j + end.length);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('dialog patched');
