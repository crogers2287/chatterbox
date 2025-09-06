@echo off
setlocal

rem Performance and Debugging Section
rem =================================
rem Enable CUDA_LAUNCH_BLOCKING for detailed error reports, but it hurts performance.
rem set "CUDA_LAUNCH_BLOCKING=1"
rem set "TORCH_USE_CUDA_DSA=1"

echo Checking for virtual environment...
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found!
    echo Please run install.bat first to set up the environment.
    echo.
    echo Make sure you're in the chatterbox repository directory.
    pause
    exit /b 1
)

echo Checking repository structure...
if not exist "gradio_tts_app_audiobook.py" (
    echo ERROR: gradio_tts_app_audiobook.py not found!
    echo Please make sure you're in the chatterbox repository root.
    pause
    exit /b 1
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo Starting Chatterbox TTS Audiobook Edition (NETWORK MODE)...
echo Features: Voice Library, Character Management, Audiobook Tools
echo Audio Cleaning Available in "Clean Samples" Tab
echo.
echo SECURITY MODE: LOCAL NETWORK ACCESS
echo - Accessible from other devices on your local network
echo - No public sharing enabled
echo - Find your local IP address and use port 7860
echo - Example: http://192.168.1.100:7860
echo.
echo This may take a moment to load the models...
echo.
echo Current directory: %CD%
echo Python environment: %VIRTUAL_ENV%
echo Voice library will be created at: %CD%\voice_library
echo.

rem Get local IP address for display
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set "ip=%%a"
    set "ip=!ip: =!"
    echo Access URL: http://!ip!:7860
    goto :found_ip
)
:found_ip

python launchers\launch_network_app.py

echo.
echo Chatterbox TTS Audiobook Edition (NETWORK MODE) has stopped.
echo Deactivating virtual environment...
deactivate
echo.
echo Thanks for using Chatterbox TTS Audiobook Edition! 🎧✨
echo Your voice profiles are saved in the voice_library folder.
echo Audio cleaning features are in the "Clean Samples" tab!
pause 