param(
  [string]$Hotkey = 'Ctrl+Alt+R',
  [string]$TriggerFile = "$env:USERPROFILE\.dsh\recorder\trigger.txt",
  [string]$LogFile = "$env:USERPROFILE\.dsh\recorder\hotkey.log"
)

$src = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RecHotkey
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }

    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG lpMsg);

    static string _trigger;
    static string _log;

    static void Log(string msg)
    {
        try { Directory.CreateDirectory(Path.GetDirectoryName(_log)); File.AppendAllText(_log, "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine); }
        catch { }
    }

    public static void Run(uint mod, uint vk, string triggerFile, string logFile)
    {
        _trigger = triggerFile; _log = logFile;
        Directory.CreateDirectory(Path.GetDirectoryName(_trigger));
        Directory.CreateDirectory(Path.GetDirectoryName(_log));

        if (!RegisterHotKey(IntPtr.Zero, 2, mod, vk))
        {
            Log("录屏热键注册失败 vk=" + vk + " mod=" + mod);
            return;
        }
        Log("录屏热键已注册 mod=" + mod + " vk=" + vk);

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0))
        {
            if (msg.message == 0x0312)
            {
                try { File.AppendAllText(_trigger, DateTime.Now.Ticks.ToString() + Environment.NewLine); Log("触发"); }
                catch (Exception e) { Log("触发失败: " + e.Message); }
            }
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }
}
'@

if (-not ("RecHotkey" -as [type])) {
  Add-Type -TypeDefinition $src
}

$mod = 0
$parts = $Hotkey -split '\+'
$key = $parts[-1].Trim().ToUpper()
if ($parts -match 'CTRL')  { $mod = $mod -bor 0x0002 }
if ($parts -match 'ALT')   { $mod = $mod -bor 0x0001 }
if ($parts -match 'SHIFT') { $mod = $mod -bor 0x0004 }
if ($parts -match 'WIN')   { $mod = $mod -bor 0x0008 }

if ($key.Length -eq 1 -and $key -match '[A-Z0-9]') { $vk = [int][char]$key }
elseif ($key -match '^F(\d{1,2})$') { $vk = 0x70 + [int]$Matches[1] - 1 }
else {
  $map = @{ 'PRINTSCREEN' = 0x2C; 'SPACE' = 0x20; 'ENTER' = 0x0D; 'TAB' = 0x09; 'ESC' = 0x1B }
  if ($map.ContainsKey($key)) { $vk = $map[$key] } else { $vk = [int][char]$key[0] }
}

[RecHotkey]::Run([uint32]$mod, [uint32]$vk, $TriggerFile, $LogFile)
