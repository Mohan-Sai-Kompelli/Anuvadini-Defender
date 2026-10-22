' Anuvadini Detector - Silent Background Agent Launcher
' Launches Python agent or ApexMonitor.exe without spawning a visible CMD/DOS window

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strPath = fso.GetParentFolderName(WScript.ScriptFullName)

If fso.FileExists(strPath & "\ApexMonitor.exe") Then
    WshShell.Run """" & strPath & "\ApexMonitor.exe"" --silent", 0, False
ElseIf fso.FileExists(strPath & "\client\agent.py") Then
    WshShell.Run "pythonw.exe """ & strPath & "\client\agent.py""", 0, False
Else
    WshShell.Run "python.exe """ & strPath & "\client\agent.py""", 0, False
End If
