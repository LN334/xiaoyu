const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
if (s.includes('WatchAssignments')) { console.log('already patched'); process.exit(0); }

// fields
s = s.replace(
`    private void OnMarkReadClick(object sender, RoutedEventArgs e)`,
`    private readonly HashSet<string> _seenNotifications = new();
    private bool _assignmentToastSeeded;
    private DispatcherTimer? _assignmentToastTimer;
    private NotificationInfo? _assignmentToastItem;

    private void WatchAssignments()
    {
        try
        {
            var unread = _services.Data.Notifications.Where(n => !n.Read).ToList();
            var fresh = unread.Where(n => !_seenNotifications.Contains(n.Id)).ToList();
            foreach (var n in unread) _seenNotifications.Add(n.Id);

            if (!_assignmentToastSeeded)
            {
                _assignmentToastSeeded = true;
                var first = unread.FirstOrDefault(n => n.Kind == "workorder");
                if (first != null) ShowAssignmentToast(first);
                return;
            }

            var item = fresh.LastOrDefault(n => n.Kind == "workorder");
            if (item != null) ShowAssignmentToast(item);
        }
        catch
        {
            // 提示失败不影响主界面
        }
    }

    private void ShowAssignmentToast(NotificationInfo n)
    {
        _assignmentToastItem = n;
        AssignmentTitle.Text = n.Title;
        AssignmentBody.Text = n.Body;
        AssignmentToast.Visibility = Visibility.Visible;
        _assignmentToastTimer?.Stop();
        _assignmentToastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(9) };
        _assignmentToastTimer.Tick += (_, _) =>
        {
            _assignmentToastTimer?.Stop();
            AssignmentToast.Visibility = Visibility.Collapsed;
        };
        _assignmentToastTimer.Start();
    }

    private void OnAssignmentToastClose(object sender, RoutedEventArgs e)
    {
        _assignmentToastTimer?.Stop();
        AssignmentToast.Visibility = Visibility.Collapsed;
    }

    private void OnAssignmentToastView(object sender, RoutedEventArgs e)
    {
        var n = _assignmentToastItem;
        _assignmentToastTimer?.Stop();
        AssignmentToast.Visibility = Visibility.Collapsed;
        if (n == null) return;
        _services.Data.MarkNotificationRead(n.Id);
        UpdateBadges();
        ShowPage("workorders");
    }

    private void OnMarkReadClick(object sender, RoutedEventArgs e)`);

// hook into UpdateBadges
s = s.replace(
`            FooterRight.Text = "最后更新 " + _services.Data.LastUpdated.ToString("HH:mm:ss");
        }
        catch
        {
            // 徽标刷新失败不打断主界面
        }`,
`            FooterRight.Text = "最后更新 " + _services.Data.LastUpdated.ToString("HH:mm:ss");
            WatchAssignments();
        }
        catch
        {
            // 徽标刷新失败不打断主界面
        }`);

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('assignment toast patched');
