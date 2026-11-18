@echo off
echo Clearing checkin and checkout data for UID 9716272321...
cd server
node clear_uid.js
echo.
echo Done! You can now restart your app and test again.
pause
