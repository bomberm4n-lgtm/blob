@echo off
:: Libera as portas do Blob SOMENTE para a rede da Tailscale (100.64.0.0/10) e para a sua rede de casa.
:: Ninguem da internet aberta consegue acessar. Clique com o botao direito > Executar como administrador.
net session >nul 2>&1 || (echo Precisa executar como ADMINISTRADOR. Clique com o botao direito ^> Executar como administrador. & pause & exit /b)
netsh advfirewall firewall delete rule name="Blob" >nul 2>&1
netsh advfirewall firewall add rule name="Blob" dir=in action=allow protocol=TCP localport=3000,7880,7881 remoteip=100.64.0.0/10,LocalSubnet
netsh advfirewall firewall add rule name="Blob" dir=in action=allow protocol=UDP localport=50000-50200 remoteip=100.64.0.0/10,LocalSubnet
echo.
echo Portas do Blob liberadas apenas para a Tailscale e a rede de casa.
pause
