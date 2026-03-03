# Transkribator 🎙️

Desktop-приложение для транскрибации русских аудио/видео файлов через [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

> **Стек:** Tauri v2 + React + TypeScript (фронтенд) / Rust (бэкенд) / Python (worker в toolbx)

![License](https://img.shields.io/badge/license-MIT-blue)

Хотите помочь в разработке? См. [CONTRIBUTING.md](CONTRIBUTING.md) — окружение, тесты, сборка, архитектура.

---

## Возможности

- 📁 **File picker** или **drag & drop** для входных медиафайлов
- 📝 **Мультиформат** — экспорт в TXT, SRT, VTT, JSON
- 🎯 **Пресеты** — «Быстро», «Качественно», «Субтитры» для типовых сценариев
- 📊 **Прогресс в реальном времени** — progress bar, ETA, RTF, скорость ×realtime
- 📈 **Live мониторинг** — CPU/RAM системы и процесса (графики каждые 1 сек)
- 📋 **Очередь задач** — история, статусы, повтор (retry), отмена, toast-уведомления
- ⚡ **Пресеты моделей** — base, small, medium, large-v3, distil-large-v3 с подсказками по RAM
- 🔧 **Гибкие параметры** — VAD, beam size, threads, language, word timestamps, compute type
- 🗂️ **Настройки** — сохраняются между запусками
- 🌐 **Локализация (i18n)** — интерфейс на русском и английском (переключатель в Настройках)
- 🔗 **Fedora Atomic совместимость** — автоматическое разрешение `/home` ↔ `/var/home`

---

## Предварительные требования

### На хосте (Fedora Atomic)

- **Node.js** ≥ 18 и **npm**
- **Rust** и **Cargo** ([rustup.rs](https://rustup.rs))
- **Tauri v2 CLI**: `cargo install tauri-cli --version "^2.0"`
- Системные зависимости для Tauri:
  ```bash
  # В toolbx или через rpm-ostree:
  sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel
  ```

### В toolbx-контейнере «asr»

```bash
# Создать контейнер (если ещё нет):
toolbox create -c asr

# Внутри контейнера:
toolbox enter asr
python3 -m venv ~/.venvs/faster-whisper
source ~/.venvs/faster-whisper/bin/activate
pip install faster-whisper av
```

---

## Запуск (разработка)

```bash
cd /path/to/Segmenta

# 1. Установить JS-зависимости
npm install

# 2. Запустить в dev-режиме
npm run tauri dev
```

> При первом запуске Cargo скачает и скомпилирует зависимости — это может занять несколько минут.

---

## Сборка (продакшен)

```bash
npm run tauri build
```

Бинарник будет в `src-tauri/target/release/transkribator`.

---

## CI

При пуше в `main`/`master` и при PR запускается GitHub Actions (см. [.github/workflows/ci.yml](.github/workflows/ci.yml)): линт Rust (clippy), тесты Rust (`cargo test`), тесты фронта (`npm run test`), сборка Tauri (`npm run tauri build`).

---

## Релиз

Готовые сборки публикуются в [GitHub Releases](https://github.com/USER/transkribator/releases) (после настройки репозитория подставьте свой URL). Процесс выпуска релиза (создание репозитория, тег, автоматическая сборка и публикация артефактов) описан в [docs/RELEASE.md](docs/RELEASE.md).

Кратко: обновите версию в `package.json` и `src-tauri/tauri.conf.json`, обновите `CHANGELOG.md`, закоммитьте, создайте тег `vX.Y.Z` и запушьте его — workflow создаст релиз с бинарником и AppImage.

---

## Структура проекта

```
Segmenta/
├── src/                     # React фронтенд
│   ├── App.tsx              # Главный компонент (3 вкладки)
│   ├── main.tsx             # Точка входа React
│   ├── index.css            # Тёмная тема + стили
│   ├── extra.css            # Модалки, тосты, анимации
│   ├── types.ts             # TypeScript типы
│   ├── components/
│   │   ├── NewTaskTab.tsx   # Вкладка «Новая задача»
│   │   ├── ProgressPanel.tsx # Прогресс + графики
│   │   ├── QueueTab.tsx     # Очередь/история
│   │   ├── ResultViewer.tsx # Просмотр и редактирование результатов
│   │   └── SettingsTab.tsx  # Настройки
│   ├── hooks/
│   │   └── useJobEvents.ts  # Хук для Tauri events
│   ├── i18n/
│   │   ├── config.ts        # Настройка i18next (ru/en)
│   │   └── locales/         # ru.json, en.json
│   └── stores/
│       └── jobStore.tsx     # React Context store
├── src-tauri/               # Rust бэкенд
│   ├── src/
│   │   ├── main.rs          # Точка входа
│   │   ├── lib.rs           # Tauri app setup
│   │   ├── commands.rs     # Tauri commands (start/cancel/list/get/remove/retry/…)
│   │   ├── job.rs           # Типы данных задач
│   │   ├── worker.rs        # Спавн и чтение JSONL от Python
│   │   ├── metrics.rs      # CPU/RAM мониторинг (sysinfo)
│   │   ├── paths.rs         # Утилиты путей
│   │   └── store.rs         # Персистентность очереди (jobs.json)
│   └── Cargo.toml
├── python/                  # Python worker (запускается в toolbx)
│   ├── fw_worker.py         # Основной скрипт транскрибации
│   └── exporters.py         # Экспорт в TXT/SRT/VTT/JSON
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Архитектура

Схема: React UI ↔ Rust Backend (Tauri) ↔ Python Worker (toolbx). Подробное описание, таблицы команд и событий — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Troubleshooting

### Проблема: `/var/home` vs `/home`

На Fedora Atomic `/home` — это симлинк на `/var/home`. Внутри toolbx-контейнера `$HOME` может быть `/home/user`, а на хосте — `/var/home/user`. Приложение автоматически проверяет оба варианта.

### Проблема: «toolbox: command not found»

На Fedora Atomic команда называется `toolbox` (не `toolbx`). Убедитесь, что пакет `toolbox` установлен.

### Проблема: «faster-whisper not installed»

Убедитесь, что venv активируется правильно:
```bash
toolbox run -c asr -- ~/.venvs/faster-whisper/bin/python3 -c "import faster_whisper; print('OK')"
```

### Проблема: Файлы результатов не появляются

Проверьте, что папка результатов существует и доступна для записи. Приложение автоматически создаёт папку, но убедитесь в правах доступа.

---

## Лицензия

MIT
