@echo off
:: Opens Blob's ports ONLY to the Tailscale network (100.64.0.0/10) and your home network.
:: Nobody on the open internet can reach them. Right-click > Run as administrator.
net session >nul 2>&1 || (echo This must be run as ADMINISTRATOR. Right-click ^> Run as administrator. & pause & exit /b)
netsh advfirewall firewall delete rule name="Blob" >nul 2>&1
netsh advfirewall firewall add rule name="Blob" dir=in action=allow protocol=TCP localport=3000,7880,7881 remoteip=100.64.0.0/10,LocalSubnet
netsh advfirewall firewall add rule name="Blob" dir=in action=allow protocol=UDP localport=50000-50200 remoteip=100.64.0.0/10,LocalSubnet
echo.
echo Blob ports opened for Tailscale and the home network only.
pause
