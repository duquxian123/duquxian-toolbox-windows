# Sends HID output reports through HidD_SetOutputReport.
param([string]$Path, [string]$Reports)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class BatteryHidOutput {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("hid.dll", SetLastError = true)]
  public static extern bool HidD_SetOutputReport(SafeFileHandle h, byte[] buffer, int length);
}
'@
$handle = [BatteryHidOutput]::CreateFile($Path, 0xC0000000L, 3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
if ($handle.IsInvalid) { exit 2 }
$sent = 0
try {
  foreach ($hex in $Reports.Split(',')) {
    $report = New-Object byte[] ($hex.Length / 2)
    for ($i = 0; $i -lt $report.Length; $i++) {
      $report[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)
    }
    if ([BatteryHidOutput]::HidD_SetOutputReport($handle, $report, $report.Length)) { $sent++ }
    Start-Sleep -Milliseconds 60
  }
  [Console]::Out.WriteLine("sent $sent")
  if ($sent -eq 0) { exit 3 }
} finally {
  $handle.Dispose()
}
