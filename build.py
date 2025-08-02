#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для автоматической сборки расширения браузера для Chrome и Firefox
Создает два ZIP архива с соответствующими манифестами
"""

import os
import shutil
import zipfile
import json
import fnmatch
from pathlib import Path

class ExtensionBuilder:
    def __init__(self):
        self.root_dir = Path(__file__).parent
        self.src_dir = self.root_dir / "src"
        self.build_dir = self.root_dir / "build"
        self.chrome_dir = self.build_dir / "chrome"
        self.firefox_dir = self.build_dir / "firefox"
        self.ignore_patterns = []
        
    def load_ignore_patterns(self):
        """Загружает паттерны игнорируемых файлов из .compile-ignore"""
        ignore_file = self.root_dir / ".compile-ignore"
        if ignore_file.exists():
            with open(ignore_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        self.ignore_patterns.append(line)
        print(f"Загружено {len(self.ignore_patterns)} паттернов игнорирования")
        
    def should_ignore(self, file_path):
        """Проверяет, нужно ли игнорировать файл"""
        relative_path = str(file_path.relative_to(self.root_dir))
        
        for pattern in self.ignore_patterns:
            # Проверяем точное совпадение имени файла/папки
            if relative_path == pattern:
                return True
                
            # Проверяем если файл находится в игнорируемой папке
            if relative_path.startswith(pattern + '/') or relative_path.startswith(pattern + '\\'):
                return True
                
            # Проверяем glob паттерны
            if fnmatch.fnmatch(relative_path, pattern) or fnmatch.fnmatch(file_path.name, pattern):
                return True
                
        return False
        
    def copy_files(self, target_dir):
        """Копирует файлы из папки src в целевую директорию, исключая игнорируемые"""
        target_dir.mkdir(parents=True, exist_ok=True)
        
        copied_files = 0
        for item in self.src_dir.rglob('*'):
            if item.is_file():
                relative_path = item.relative_to(self.src_dir)
                
                # Проверяем игнорирование относительно src папки (без добавления src/ в начало)
                if self.should_ignore_in_src(relative_path):
                    continue
                    
                target_path = target_dir / relative_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target_path)
                copied_files += 1
                
        print(f"Скопировано {copied_files} файлов в {target_dir.name}")
        
    def should_ignore_in_src(self, relative_path):
        """Проверяет, нужно ли игнорировать файл в папке src"""
        # Преобразуем path в строку для проверки
        path_str = str(relative_path)
        
        for pattern in self.ignore_patterns:
            # Проверяем точное совпадение имени файла/папки
            if path_str == pattern:
                return True
                
            # Проверяем если файл находится в игнорируемой папке
            if path_str.startswith(pattern + '/') or path_str.startswith(pattern + '\\'):
                return True
                
            # Проверяем glob паттерны
            if fnmatch.fnmatch(path_str, pattern) or fnmatch.fnmatch(Path(relative_path).name, pattern):
                return True
                
        return False
        
    def copy_manifest(self, target_dir, browser):
        """Копирует соответствующий манифест для браузера"""
        if browser == "chrome":
            manifest_source = self.src_dir / "archive" / "manifest.chrome.json"
        elif browser == "firefox":
            manifest_source = self.src_dir / "archive" / "manifest.firefox.json"
        else:
            raise ValueError(f"Неизвестный браузер: {browser}")
            
        if not manifest_source.exists():
            raise FileNotFoundError(f"Манифест не найден: {manifest_source}")
            
        manifest_target = target_dir / "manifest.json"
        shutil.copy2(manifest_source, manifest_target)
        print(f"Скопирован манифест для {browser}")
        
    def create_zip(self, source_dir, output_name):
        """Создает ZIP архив из папки"""
        zip_path = self.root_dir / f"{output_name}.zip"
        
        # Удаляем старый архив если существует
        if zip_path.exists():
            zip_path.unlink()
            
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_path in source_dir.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(source_dir)
                    zipf.write(file_path, arcname)
                    
        print(f"Создан архив: {zip_path} ({self.get_file_size(zip_path)})")
        
    def get_file_size(self, file_path):
        """Возвращает размер файла в человеческом формате"""
        size = file_path.stat().st_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"
        
    def cleanup(self):
        """Очищает временные файлы с обработкой ошибок Windows"""
        if self.build_dir.exists():
            try:
                # Для Windows нужно сначала убрать read-only атрибуты
                def handle_remove_readonly(func, path, exc):
                    os.chmod(path, 0o777)
                    func(path)
                
                shutil.rmtree(self.build_dir, onerror=handle_remove_readonly)
                print("Временные файлы очищены")
            except Exception as e:
                print(f"Предупреждение: не удалось полностью очистить временные файлы: {e}")
            
    def get_version_from_manifest(self):
        """Получает версию из манифеста Chrome"""
        manifest_path = self.src_dir / "archive" / "manifest.chrome.json"
        if manifest_path.exists():
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
                return manifest.get('version', '1.0')
        return '1.0'
        
    def build(self):
        """Основной метод сборки"""
        print("=" * 50)
        print("Начинаем сборку расширения браузера")
        print("=" * 50)
        
        # Загружаем паттерны игнорирования
        self.load_ignore_patterns()
        
        # Получаем версию
        version = self.get_version_from_manifest()
        print(f"Версия расширения: {version}")
        
        try:
            # Очищаем старые файлы
            self.cleanup()
            
            # Сборка для Chrome
            print("\n--- Сборка для Chrome ---")
            self.copy_files(self.chrome_dir)
            self.copy_manifest(self.chrome_dir, "chrome")
            self.create_zip(self.chrome_dir, f"DK-NEWS-HUNTERS-Chrome-v{version}")
            
            # Сборка для Firefox
            print("\n--- Сборка для Firefox ---")
            self.copy_files(self.firefox_dir)
            self.copy_manifest(self.firefox_dir, "firefox")
            self.create_zip(self.firefox_dir, f"DK-NEWS-HUNTERS-Firefox-v{version}")
            
            # Очищаем временные файлы
            self.cleanup()
            
            print("\n" + "=" * 50)
            print("Сборка завершена успешно!")
            print("Созданы архивы:")
            print(f"  - DK-NEWS-HUNTERS-Chrome-v{version}.zip")
            print(f"  - DK-NEWS-HUNTERS-Firefox-v{version}.zip")
            print("=" * 50)
            
        except Exception as e:
            print(f"\nОшибка при сборке: {e}")
            self.cleanup()
            return False
            
        return True

def main():
    """Главная функция"""
    builder = ExtensionBuilder()
    success = builder.build()
    
    if not success:
        exit(1)

if __name__ == "__main__":
    main()
