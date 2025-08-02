@echo off
echo Запуск сборки расширения браузера...
python build.py
if %errorlevel% equ 0 (
    echo.
    echo Сборка завершена успешно!
    echo Архивы готовы к загрузке в магазины расширений.
) else (
    echo.
    echo Произошла ошибка при сборке!
)
pause
