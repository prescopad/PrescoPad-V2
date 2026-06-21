@echo off
REM PrescoPad Development Startup Script (Windows)
REM This script starts both backend and frontend services

echo ===================================
echo    PrescoPad Development Server
echo ===================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python from https://www.python.org
    pause
    exit /b 1
)

echo [1/5] Checking environment versions...
echo Node: 
node --version
echo Python:
python --version
echo.

REM Check if backend exists
if not exist "backend_python\main.py" (
    echo [ERROR] Backend not found in backend_python\
    pause
    exit /b 1
)

REM Check if frontend exists
if not exist "frontend\package.json" (
    echo [ERROR] Frontend not found in frontend\
    pause
    exit /b 1
)

REM Check if backend venv exists
if not exist "backend_python\.venv\Scripts\python.exe" (
    echo [WARNING] Python virtual environment not found in backend_python\.venv
    echo Creating virtual environment and installing dependencies...
    cd backend_python
    python -m venv .venv
    call .venv\Scripts\activate
    pip install -r requirements.txt
    cd ..
)

echo [2/5] Starting Backend Server (FastAPI)...
echo.
start "PrescoPad Backend" cmd /k "cd backend_python && .venv\Scripts\python main.py"
timeout /t 3 /nobreak >nul

echo [3/5] Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

REM Test backend health
echo [4/5] Testing backend connection...
curl -s http://localhost:3000/api/health >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Backend is running!
) else (
    echo [WARNING] Backend may still be starting...
)
echo.

echo [5/5] Starting Frontend (Expo)...
echo.
start "PrescoPad Frontend" cmd /k "cd frontend && npm start"

echo.
echo ===================================
echo  Services Started Successfully!
echo ===================================
echo.
echo Backend:  http://localhost:3000/api
echo Frontend: http://localhost:8081
echo.
echo Two new windows have opened:
echo   1. Backend Server (Python FastAPI)
echo   2. Frontend Dev Server (Expo)
echo.
echo Press 'a' in the Expo window to run on Android
echo Press 'i' in the Expo window to run on iOS
echo Press 'w' in the Expo window to run on Web
echo.
echo To stop: Close both terminal windows
echo.
pause
