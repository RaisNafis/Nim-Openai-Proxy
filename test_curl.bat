@echo off
echo Mengirim request curl ke proxy localhost:3000...
echo.
curl -N http://localhost:3000/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\": \"nvidia/nemotron-3.5-lightning-30b-a3b\", \"messages\": [{\"role\": \"user\", \"content\": \"Halo, jelaskan apa itu GPU dalam 1 kalimat!\"}], \"stream\": true}"
echo.
echo.
pause
