@echo off
chcp 65001 > nul

title HospAudit - Servidor de Produção Local
cls

echo =======================================================================
echo              🏥 HOSPAUDIT - INICIANDO SISTEMA LOCAL
echo =======================================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js não está instalado ou não está configurado no PATH do Windows!
    echo Por favor, dê um duplo clique no arquivo "instalar.bat" para instalar o Node.js
    echo e todas as dependências automaticamente de forma guiada.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] Pasta "node_modules" não encontrada. Instalação necessária.
    echo Executando o instalador completo automaticamente...
    echo.
    timeout /t 3 > nul
    call instalar.bat
    exit /b 0
)

echo Executando diagnóstico rápido do ambiente...
echo.
call node diag-env.js
echo.

rem Obter URL de acesso configurada no .env (ou usar localhost padrão)
set "APP_ACCESS_URL=http://localhost:3000"
if exist .env (
    for /f "usebackq tokens=2 delims==" %%A in (`findstr /i "APP_URL" .env 2^>nul`) do (
        set "TEMP_URL=%%~A"
    )
)
if defined TEMP_URL (
    set "APP_ACCESS_URL=%TEMP_URL%"
)

if exist dist\server.cjs (
    echo [✓] Versão de Produção de Alta Performance detectada.
    echo [✓] Iniciando servidor HospAudit...
    echo 👉 Acesse em: %APP_ACCESS_URL%
    echo.
    
    start "" cmd /c "timeout /t 2 > nul && start %APP_ACCESS_URL%"
    
    call npm start
) else (
    echo [AVISO] Compilação de Produção não encontrada.
    echo Executando o servidor em Modo de Desenvolvimento...
    echo 👉 Acesse em: %APP_ACCESS_URL%
    echo.
    
    start "" cmd /c "timeout /t 3 > nul && start %APP_ACCESS_URL%"
    
    call npm run dev
)

pause
