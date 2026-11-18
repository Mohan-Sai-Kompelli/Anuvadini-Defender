@echo off
echo Setting up adb port forwards...
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5001 tcp:5001
adb reverse tcp:50011 tcp:50011
echo.
echo Done! Please force-stop and restart the app on your phone.
pause
