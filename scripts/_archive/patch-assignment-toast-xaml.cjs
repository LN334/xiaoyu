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

edit('native/ZhifuWater.Desktop/Windows/MainWindow.xaml',
`        <!-- 轻提示 -->`,
`        <!-- 新工单提示 -->
        <Border x:Name="AssignmentToast" Visibility="Collapsed" Width="330" Panel.ZIndex="95"
                HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,70,20,0"
                Background="{DynamicResource Surface}" BorderBrush="{DynamicResource Line}" BorderThickness="1"
                CornerRadius="3" Padding="14,11">
            <StackPanel>
                <DockPanel LastChildFill="False">
                    <TextBlock Text="新工单" FontSize="11.5" FontWeight="SemiBold" Foreground="{DynamicResource Accent}" />
                    <Button Content="关闭" Style="{DynamicResource LinkButton}" HorizontalAlignment="Right"
                            Click="OnAssignmentToastClose" />
                </DockPanel>
                <TextBlock x:Name="AssignmentTitle" FontSize="12.5" FontWeight="SemiBold"
                           Foreground="{DynamicResource Ink}" Margin="0,6,0,0" TextWrapping="Wrap" />
                <TextBlock x:Name="AssignmentBody" FontSize="11" Foreground="{DynamicResource Muted}"
                           Margin="0,4,0,0" TextWrapping="Wrap" />
                <Button Content="查看工单" Style="{DynamicResource LinkButton}" HorizontalAlignment="Right"
                        Margin="0,6,0,0" Click="OnAssignmentToastView" />
            </StackPanel>
        </Border>

        <!-- 轻提示 -->`);
