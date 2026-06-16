@echo off
chcp 1252 >nul
setlocal enabledelayedexpansion
title menu
mode con: cols=65 lines=25 >nul 2>&1

:: --- ANSI COLORS ---
for /F "delims=#" %%a in ('"prompt #$E# & for %%b in (1) do rem"') do set "ESC=%%a"
set "CLR_G=%ESC%[1;32m"
set "CLR_R=%ESC%[1;31m"
set "CLR_C=%ESC%[1;36m"
set "CLR_W=%ESC%[1;37m"
set "CLR_Y=%ESC%[1;33m"
set "CLR_OFF=%ESC%[0m"

:: --- CONFIG ---
set "LAN_IP=192.168.15.109"
set "VPN_IP=100.119.122.10"
set "SRV_MAC=d0:94:66:a2:ee:38"
set "USER_SRV=rodrigo"
set "SSH_OPTS=-o ConnectTimeout=5 -o StrictHostKeyChecking=no"

:MENU
cls
set "LAN_S=%CLR_R%OFF%CLR_OFF%"
set "VPN_S=%CLR_R%OFF%CLR_OFF%"
set "TS_S=%CLR_R%OFF%CLR_OFF%"
set "TARGET="

ping -n 1 -w 1500 %LAN_IP% >nul 2>&1
if !errorlevel! EQU 0 (
    set "LAN_S=%CLR_G%ON%CLR_OFF%"
    set "TARGET=%LAN_IP%"
)
ping -n 1 -w 1500 %VPN_IP% >nul 2>&1
if !errorlevel! EQU 0 (
    set "VPN_S=%CLR_G%ON%CLR_OFF%"
    if not defined TARGET set "TARGET=%VPN_IP%"
)
tailscale status >nul 2>&1 && set "TS_S=%CLR_G%ON%CLR_OFF%"

echo.
echo  %CLR_W% SERVIDOR:%CLR_OFF% %LAN_IP% [%LAN_S%] %CLR_W%VPN:%CLR_OFF% [%VPN_S%] %CLR_W%TS:%CLR_OFF% [%TS_S%]
echo  %CLR_W% ---------------------------------------------------------------%CLR_OFF%
echo.
echo   %CLR_Y%1.%CLR_OFF% LIGAR          %CLR_Y%5.%CLR_OFF% COCKPIT       %CLR_Y%9.%CLR_OFF% ANDROID
echo   %CLR_Y%2.%CLR_OFF% DESLIGAR       %CLR_Y%6.%CLR_OFF% MONITOR       %CLR_Y%10.%CLR_OFF% BACKUP
echo   %CLR_Y%3.%CLR_OFF% REINICIAR      %CLR_Y%7.%CLR_OFF% DOCKER        %CLR_Y%11.%CLR_OFF% IA HUB
echo   %CLR_Y%4.%CLR_OFF% PASTAS         %CLR_Y%8.%CLR_OFF% SANDBOX       %CLR_Y%12.%CLR_OFF% MANUTENCAO
echo.
echo   %CLR_Y%R.%CLR_OFF% REFRESH        %CLR_Y%S.%CLR_OFF% CONSOLE       %CLR_Y%V.%CLR_OFF% VPN MGMT
echo.
set "opt="
set /p opt=" %CLR_C%>>%CLR_OFF% "

if /i "%opt%"=="r" goto MENU
if /i "%opt%"=="v" goto VPN_MGMT
if /i "%opt%"=="1" goto WOL

if not defined TARGET (
    echo %CLR_R% [!] Servidor Offline%CLR_OFF%
    timeout 2 >nul & goto MENU
)

if /i "%opt%"=="s" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% & goto MENU)
if /i "%opt%"=="2" (
    echo %CLR_R% Atencao: Isso vai DESLIGAR o servidor remoto!%CLR_OFF%
    set "conf="
    set /p conf=" Confirme digitando SIM (maiusculo): "
    if "!conf!"=="SIM" ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo poweroff"
    goto MENU
)
if /i "%opt%"=="3" (
    echo %CLR_R% Atencao: Isso vai REINICIAR o servidor remoto!%CLR_OFF%
    set "conf="
    set /p conf=" Confirme digitando SIM (maiusculo): "
    if "!conf!"=="SIM" ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo reboot"
    goto MENU
)
if /i "%opt%"=="4" (start "" "\\%TARGET%\Arquivos_Servidor" & goto MENU)
if /i "%opt%"=="5" (start "" "https://%TARGET%:9090" & goto MENU)
if /i "%opt%"=="6" (ssh -t %SSH_OPTS% %USER_SRV%@%TARGET% "btop" & goto MENU)
if /i "%opt%"=="7" goto DOCKER_MGMT
if /i "%opt%"=="8" goto SANDBOX
if /i "%opt%"=="9" goto ANDROID_TOOLS
if /i "%opt%"=="10" goto BACKUP
if /i "%opt%"=="11" goto IA_HUB
if /i "%opt%"=="12" goto MAINTENANCE
goto MENU

:SANDBOX
cls
echo  %CLR_W% --- SANDBOX ---%CLR_OFF%
echo   %CLR_Y%1.%CLR_OFF% VS CODE        %CLR_Y%4.%CLR_OFF% VNC / WEBTOP
echo   %CLR_Y%2.%CLR_OFF% ANTIGRAVITY    %CLR_Y%5.%CLR_OFF% TERMINAL
echo   %CLR_Y%3.%CLR_OFF% STEAM          %CLR_Y%6.%CLR_OFF% NEOVIM
echo   %CLR_Y%0.%CLR_OFF% VOLTAR
set "s_opt="
set /p s_opt=" >> "
if "%s_opt%"=="0" goto MENU
if "%s_opt%"=="1" goto START_VSCODE
if "%s_opt%"=="2" goto START_ANTIGRAVITY
if "%s_opt%"=="3" goto START_STEAM
if "%s_opt%"=="4" goto START_WEBTOP
if "%s_opt%"=="5" goto START_TERMINAL
if "%s_opt%"=="6" goto START_NVIM
goto SANDBOX

:START_VSCODE
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker ps -q --filter publish=8443 | xargs -r sudo docker rm -f"
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker run -d --rm -p 8443:8443 --name srv_vscode_sandbox --env AUTH=none --tmpfs /home/coder:exec,mode=1777 --tmpfs /tmp:exec,mode=1777 --tmpfs /run:exec,mode=1777 lscr.io/linuxserver/code-server:latest"
timeout /t 5 >nul
start "" "http://%TARGET%:8443"
goto SB_EXIT

:START_ANTIGRAVITY
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker ps -q --filter publish=2222 | xargs -r sudo docker rm -f"
taskkill /F /IM Antigravity.exe /T >nul 2>&1
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker run -d --rm -p 2222:22 --name srv_ag_sandbox -v ~/.ssh/authorized_keys:/root/.ssh/authorized_keys:ro alpine sh -c 'apk update && apk add openssh git neovim && ssh-keygen -A && /usr/sbin/sshd -D'"
if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"
echo Host srv_ag_sandbox > "%USERPROFILE%\.ssh\ag_sandbox_config"
echo     HostName %TARGET% >> "%USERPROFILE%\.ssh\ag_sandbox_config"
echo     Port 2222 >> "%USERPROFILE%\.ssh\ag_sandbox_config"
echo     User root >> "%USERPROFILE%\.ssh\ag_sandbox_config"
echo     StrictHostKeyChecking no >> "%USERPROFILE%\.ssh\ag_sandbox_config"
echo     UserKnownHostsFile /dev/null >> "%USERPROFILE%\.ssh\ag_sandbox_config"
if not exist "%USERPROFILE%\.ssh\config" type nul > "%USERPROFILE%\.ssh\config"
findstr /B /C:"Include ag_sandbox_config" "%USERPROFILE%\.ssh\config" >nul 2>&1
if !errorlevel! NEQ 0 (
    echo. >> "%USERPROFILE%\.ssh\config"
    echo Include ag_sandbox_config >> "%USERPROFILE%\.ssh\config"
)
timeout /t 5 >nul
start antigravity --transient --remote ssh-remote+srv_ag_sandbox "/root"
goto SB_EXIT

:START_STEAM
echo %CLR_C%  [*] Preparando container Steam...%CLR_OFF%
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker rm -f srv_steam_sandbox" >nul 2>&1
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker run -d --rm --name srv_steam_sandbox -p 8083:8083 -p 5900:5900 josh5/steam-headless:latest"
echo %CLR_G%  [*] Container iniciado. Aguardando 5s...%CLR_OFF%
timeout /t 5 >nul
start "" "http://%TARGET%:8083"
goto SB_EXIT

:START_WEBTOP
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker ps -q --filter publish=3000 | xargs -r sudo docker rm -f"
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker run -d --rm -p 3000:3000 --name srv_webtop_sandbox --tmpfs /config:exec,mode=1777 --tmpfs /tmp:exec,mode=1777 --tmpfs /run:exec,mode=1777 lscr.io/linuxserver/webtop:ubuntu-xfce"
timeout /t 8 >nul
start "" "http://%TARGET%:3000"
goto SB_EXIT

:START_TERMINAL
ssh -t %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker run --rm -it --name srv_terminal_sandbox --tmpfs /root:exec,mode=1777 --tmpfs /tmp:exec,mode=1777 --tmpfs /run:exec,mode=1777 alpine:latest sh"
goto SB_EXIT

:START_NVIM
ssh -t %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker run --rm -it --name srv_nvim_sandbox --tmpfs /root:exec,mode=1777 --tmpfs /tmp:exec,mode=1777 --tmpfs /run:exec,mode=1777 alpine:latest sh -c 'apk update && apk add neovim git && nvim'"
goto SB_EXIT

:SB_EXIT
pause
goto MENU

:DOCKER_MGMT
cls
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo   %CLR_Y%1.%CLR_OFF% VER ATIVOS      %CLR_Y%4.%CLR_OFF% MONITOR
echo   %CLR_Y%2.%CLR_OFF% VER TUDO        %CLR_Y%5.%CLR_OFF% PARAR CONTAINER
echo   %CLR_Y%3.%CLR_OFF% VER IMAGENS     %CLR_Y%6.%CLR_OFF% REINICIAR DOCKER
echo   %CLR_Y%0.%CLR_OFF% VOLTAR
set "d_opt="
set /p d_opt=" >> "
if "%d_opt%"=="0" goto MENU
if "%d_opt%"=="1" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker ps" & pause & goto DOCKER_MGMT)
if "%d_opt%"=="2" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker ps -a" & pause & goto DOCKER_MGMT)
if "%d_opt%"=="3" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker images" & pause & goto DOCKER_MGMT)
if "%d_opt%"=="4" (ssh -t %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker stats" & goto DOCKER_MGMT)
if "%d_opt%"=="5" (set /p c_name="ID/Nome: " & ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo docker rm -f !c_name!" & pause & goto DOCKER_MGMT)
if "%d_opt%"=="6" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo systemctl restart docker" & pause & goto DOCKER_MGMT)
goto DOCKER_MGMT

:ANDROID_TOOLS
cls
echo   %CLR_Y%1.%CLR_OFF% LIGAR EMULADOR   %CLR_Y%4.%CLR_OFF% CONECTAR ADB
echo   %CLR_Y%2.%CLR_OFF% DESLIGAR EMUL    %CLR_Y%5.%CLR_OFF% LOGCAT
echo   %CLR_Y%3.%CLR_OFF% TELA VNC         %CLR_Y%0.%CLR_OFF% VOLTAR
set "a_opt="
set /p a_opt=" >> "
if "%a_opt%"=="0" goto MENU
if "%a_opt%"=="1" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "cd ~/Automation/Apps/Emulator && sudo docker-compose up -d" & pause & goto ANDROID_TOOLS)
if "%a_opt%"=="2" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "cd ~/Automation/Apps/Emulator && sudo docker-compose down" & pause & goto ANDROID_TOOLS)
if "%a_opt%"=="3" (start "" "http://%TARGET%:6080" & goto ANDROID_TOOLS)
if "%a_opt%"=="4" (set /p a_ip="IP: " & adb connect !a_ip!:5555 & pause & goto ANDROID_TOOLS)
if "%a_opt%"=="5" (adb logcat *:V & pause & goto ANDROID_TOOLS)
goto ANDROID_TOOLS

:IA_HUB
cls
echo   %CLR_Y%1.%CLR_OFF% OLLAMA STATUS    %CLR_Y%3.%CLR_OFF% PULL MODELO
echo   %CLR_Y%2.%CLR_OFF% LISTAR MODELOS   %CLR_Y%0.%CLR_OFF% VOLTAR
set "ia_opt="
set /p ia_opt=" >> "
if "%ia_opt%"=="0" goto MENU
if "%ia_opt%"=="1" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "systemctl status ollama --no-pager" & pause & goto IA_HUB)
if "%ia_opt%"=="2" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "ollama list" & pause & goto IA_HUB)
if "%ia_opt%"=="3" (set /p m_name="Nome: " & ssh %SSH_OPTS% %USER_SRV%@%TARGET% "ollama pull !m_name!" & pause & goto IA_HUB)
goto IA_HUB

:BACKUP
cls
echo   %CLR_Y%1.%CLR_OFF% INICIAR BACKUP FULL
echo   %CLR_Y%2.%CLR_OFF% STATUS STORAGE
echo   %CLR_Y%0.%CLR_OFF% VOLTAR
set "bkp_opt="
set /p bkp_opt=" >> "
if "%bkp_opt%"=="0" goto MENU
if "%bkp_opt%"=="1" goto BKP_FULL_SYNC
if "%bkp_opt%"=="2" goto STORAGE_STATS
goto BACKUP

:MAINTENANCE
cls
echo   %CLR_Y%1.%CLR_OFF% LIMPAR LIXO      %CLR_Y%3.%CLR_OFF% UPDATE NOTEBOOK
echo   %CLR_Y%2.%CLR_OFF% UPDATE SRV       %CLR_Y%0.%CLR_OFF% VOLTAR
set /p m_opt=" >> "
if "%m_opt%"=="1" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "find /home/rodrigo -maxdepth 2 \( -name '*test*' -o -name '*tmp*' -o -name '*junk*' \) -exec rm -rf {} +" & pause & goto MAINTENANCE)
if "%m_opt%"=="2" (ssh %SSH_OPTS% %USER_SRV%@%TARGET% "sudo apt-get update && sudo apt-get upgrade -y" & pause & goto MAINTENANCE)
if "%m_opt%"=="3" (winget upgrade --all & pause & goto MAINTENANCE)
goto MENU

:WOL
powershell -Command "$m='%SRV_MAC%'-split':';$p=[Byte[]](@(0xFF)*6)+($m|%%{[Convert]::ToByte($_,16)})*16;$u=New-Object System.Net.Sockets.UdpClient;$u.Connect('255.255.255.255',9);$u.Send($p,$p.Length);$u.Connect('192.168.15.255',9);$u.Send($p,$p.Length);$u.Close()"
echo [+] WOL Enviado.
pause & goto MENU

:VPN_MGMT
cls
echo   %CLR_Y%1.%CLR_OFF% LIGAR            %CLR_Y%3.%CLR_OFF% STATUS
echo   %CLR_Y%2.%CLR_OFF% DESLIGAR         %CLR_Y%0.%CLR_OFF% VOLTAR
set "v_opt="
set /p v_opt=" >> "
if "%v_opt%"=="1" (tailscale up & goto MENU)
if "%v_opt%"=="2" (tailscale down & goto MENU)
if "%v_opt%"=="3" (tailscale status & pause & goto VPN_MGMT)
goto MENU

:BKP_FULL_SYNC
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "python3 ~/Automation/Apps/Backup/run_headless.py"
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "python3 ~/Automation/Core/Scripts/Icloud.py"
pause & goto BACKUP

:STORAGE_STATS
ssh %SSH_OPTS% %USER_SRV%@%TARGET% "df -h | grep -E '/dev/sd|/mnt/'"
powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='Free(GB)';E={'{0:N2}' -f ($_.Free/1GB)}}"
pause & goto BACKUP
