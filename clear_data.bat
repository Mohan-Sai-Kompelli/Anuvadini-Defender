@echo off
echo Clearing checkin and checkout data...
cd server
node clear_data.js
echo.
echo Done! Please restart the app on your phone to test again.
pause
