@echo off
chcp 65001 >nul
title HospAudit - Atualizar Código via Git Pull (git-pull.bat)
color 0B

echo ========================================================================
echo   🏥 HOSPAUDIT - SCRIPT AUTOMÁTICO DE ATUALIZAÇÃO (GIT PULL + NPM INSTALL)
echo ========================================================================
echo.

echo [1/3] Executando 'git pull origin main' para obter os arquivos mais recentes...
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [❌ ERRO] O Git não foi encontrado no PATH do seu computador!
    echo Instale o Git em https://git-scm.com/ e tente novamente.
    echo.
    pause
    exit /b 1
)

git pull origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [⚠ AVISO] Falha ao puxar da branch 'main'. Tentando 'git pull' sem branch especificada...
    git pull
)

echo.
echo [2/3] Instalando e atualizando dependências com 'npm install'...
call npm install

echo.
echo [3/3] Recompilando o projeto para produção ('npm run build')...
call npm run build

echo.
echo ========================================================================
echo  🎉 ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!
echo ========================================================================
echo.
echo Seu repositório HospAudit foi atualizado e recompilado.
echo Você pode rodar 'node sync-db.js' para sincronizar o banco do XAMPP
echo e em seguida 'node server.js' para rodar o servidor.
echo.
pause
