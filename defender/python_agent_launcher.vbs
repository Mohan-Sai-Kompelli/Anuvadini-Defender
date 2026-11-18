' Anuvadini Detector - Silent Workstation Agent Launcher
' Launches the Anuvadini Detector agent completely hidden with SW_HIDE
' Zero console window, zero taskbar entry, 100% stealth background telemetry

Option Explicit

Dim WshShell, fso, strCurDir, venvPythonw, agentScript
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurDir

venvPythonw = strCurDir & "\.venv\Scripts\pythonw.exe"
agentScript = strCurDir & "\desktop\app.py"

On Error Resume Next
' Use the same headless entry point the watchdog recognises. This avoids a
' second agent being spawned beside a manually started `-m anuvadini_detector.agent`.
If fso.FileExists(venvPythonw) And fso.FileExists(agentScript) Then
    WshShell.Run """" & venvPythonw & """ """ & agentScript & """ --agent", 0, False
ElseIf fso.FileExists(agentScript) Then
    WshShell.Run "pythonw """ & agentScript & """ --agent", 0, False
Else
    WshShell.Run "pythonw -m anuvadini_detector.agent", 0, False
End If
