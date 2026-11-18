@echo off
echo Uninstalling the conflicting app from the connected device/emulator...
adb uninstall com.NATSAttendance.myapp
echo.
echo If it says 'Success', you can now run 'npm run android' again!
echo If it says 'Failure [DELETE_FAILED_INTERNAL_ERROR]', make sure your phone is connected.
pause
