# Рабочая платформа на Play2Go

## Автодеплой

После push в `main` workflow CI запускает аудиты, backend/frontend тесты,
Playwright e2e и проверку конфигурации рабочей ВМ. Только успешный push в main
получает ключ из GitHub environment `vm-production`, разрешённого для main.
Тестированная сборка передаётся по SSH пользователю `pool-deploy`.
Ключ ограничен forced command: нет обычной SSH-сессии, PTY и перенаправления портов.
Host key закреплён по ранее проверенному ключу сервера, StrictHostKeyChecking=yes.

Root-owned receiver `/usr/local/sbin/school21-deploy` принимает только backend
и собранный frontend, без env/ссылок/произвольных путей. Сначала собирает образ
и проверяет его в отдельном контейнере с read-only GET-проверками на текущей БД;
в этом контейнере default_transaction_read_only=on, что отдельно проверяется;
затем делает backup, обновляет API/интерфейс и проверяет их снова.
При ошибке после переключения восстанавливает прежний образ и frontend.
База, секреты, HTTPS и host-конфигурация не заменяются и не восстанавливаются
из старого dump: новые пользовательские данные при откате сохраняются.
Обновления выполняются последовательно, без отмены работающего деплоя.

Автоматические изменения схемы БД выключены. Изменения, требующие миграции,
сначала согласуются и применяются отдельно; несовместимая версия должна быть
отклонена проверкой до переключения. Dockerfile/compose/deploy receiver меняются
отдельно через административный доступ, а не через прикладной SSH-ключ.
Версии остаются в `releases/`; автоматическая очистка пока не настроена.

Сервер `31.77.148.136`, каталог `/opt/school21-pool-copy`.
Рабочий адрес: **https://school21pool.ru**.
Временный адрес `https://pool.31.77.148.136.nip.io` сохранён.
В Beget A-записи корня и www направлены на ВМ; MX/TXT не изменены.
HTTPS обоих имён выпущен и проверен; www и временный веб-адрес перенаправляются
на основной домен. Старый API на временном адресе оставлен для совместимости.
FRONTEND_URL первым содержит основной домен, webhook Telegram обновлён и проверен.
Основа приложения: production commit `59d181058a9d09265931871d5c787e9633834cf0`.

08.10.2026 владелец разрешил сделать ВМ основной, не удаляя Vercel.
Старая API переведена в maintenance (503), задания GitHub
`Dispatch Notifications` и `Export to Google Sheets` приостановлены.
В обоих проектах Vercel `commandForIgnoringBuildStep = "exit 0"`:
автоматические Git-сборки остановлены, чтобы не запустить старую платформу.
Проекты, старые deployment и исходная Supabase-база **не удалены**.
Frontend Vercel перенаправляет пользователей на рабочий адрес ВМ.

## Данные и проверка

После остановки старой API сделан свежий read-only dump public schema.
Он восстановлен в отдельную базу **`pool_live_20261008`**; числа записей
совпали во всех 24 таблицах. Предыдущая проверочная база `pool` сохранена.
Свежий dump и результаты сравнения лежат в `secure/source-cutover-*` и
`secure/live-cutover-counts.txt`. Временный файл доступа к Supabase удалён.

Проверены вход администратора и GET-разделы auth/me, pools/active, dashboard,
schedule, volunteers, students, tribes, tribe-events, penalties, notifications/overview.
Telegram test mode в рабочей базе выключен. Бот `@school21_pool_bot` переключён
на `/api/telegram/webhook` ВМ; setWebhook и getWebhookInfo проверены.
Изменения на ВМ не синхронизируются обратно в старую Supabase-базу.

## Сервисы и изоляция

PostgreSQL 17 доступен только в Docker-сети `database`, internal=true.
Прикладной пользователь `pool_app` не superuser. API не публикует порт.
Сеть `application` также internal=true. В production backend дополнительно
подключён к `egress`, чтобы обращаться к Telegram и Google через HTTPS;
база к этой сети не подключена. Только Caddy публикует TCP 80/443.
UDP 443 существующего VPN, firewall, SSH и другие контейнеры не изменены.

Production запускается **с override**, а не только базовым compose:

```sh
bash infra/play2go/compose-live.sh ps
bash infra/play2go/compose-live.sh up -d --no-build
bash infra/play2go/compose-live.sh logs --tail=30 backend
```

Не выполнять `down -v`: это удаляет базу. Не выводить `config` или `docker inspect`
целиком в общий лог: они могут раскрыть секреты. Использовать `config --quiet`.

`pool-notifications.timer` доставляет уведомления раз в минуту;
`pool-sheets.timer` запускает export раз в пять минут. Первые запуски успешны.
Сейчас нет активного неархивного бассейна с включённым Google Sheets export,
поэтому его проверка была без выгрузки. SYNC_SECRET взят из локального `.env`;
его совместимость с Apps Script не подтверждена реальной выгрузкой.
Не обещать работоспособность Google-интеграции до такой проверки.

## Секреты и резервные копии

Все секретные файлы имеют права 600, родительский `secure` — 700.
`infra/play2go/.env` содержит локальные ключи БД/сессий.
`secure/telegram-bot.env` — предоставленный владельцем токен.
`secure/runtime-integrations.env` — новые webhook/internal secrets, имя рабочей
базы и локальный SYNC_SECRET. Значения не выводились в чат и не входят в Git.

Прежние Sensitive/write-only ключи Vercel не удалось экспортировать;
`secure/integration-settings-status.json` сохраняет `complete:false`
для **архива прежних секретов**, не для новой конфигурации ВМ.
Четыре локальных `.env` отдельно сохранены в `secure/local-project-settings.tar.gz`;
они не загружаются в приложение. Не устанавливать `[SENSITIVE]` как значение.

`pool-copy-backup.timer` включён ежедневно в 05:00–05:05 Москвы. Скрипт выбирает
имя базы из текущего контейнера API, не из старого имени `pool`, сохраняет
dump и защищённый архив конфигурации/ключей, проверяет dump и SHA-256.
Однократные внешние копии хранятся на Mac в `backups/play2go-copy/`.
Автоматической внешней системы backup пока нет. Полный tracked source и
Excel-экспорт исходной платформы сохранены в `secure/source-code-*` и
`secure/source-export-20261008.xlsx`.

Production backup `pool-20261008T200520Z.dump` проверен восстановлением:
24 таблицы, 51 пользователь, 132 блока. Временная проверочная база удалена,
рабочая база не затронута. Этот dump, конфигурация с ключами, исходный снимок
переключения и архив production-кода дополнительно сохранены на Mac.

## Откат (не выполнять автоматически)

Перед откатом остановить запись и задания ВМ, сделать свежий backup.
После начала работы пользователей на ВМ старая Supabase-база уже устаревает:
**просто включить Vercel нельзя**, сначала согласовать перенос новых данных обратно.

Сохранённые старые production deployment:

- API: `https://school21-pool-management-d0axrk05m-denissadykov.vercel.app`
- frontend: `https://school21-pool-management-cmp2x6scb-denissadykov.vercel.app`

При согласованном откате восстановить их через `vercel promote`, снять
`commandForIgnoringBuildStep` обратно в `null`, восстановить webhook с
оригинальным секретом Vercel и включить два GitHub workflow. Оригинальный
webhook-secret неизвестен: использовать старый авторизованный endpoint
регистрации webhook на восстановленной API, который сам возьмёт его из env.
Не вращать токен бота и секреты Vercel без отдельной необходимости.

Для нового домена позднее заменить PUBLIC_HOST/FRONTEND_URL, перевыпустить
сертификат и обновить webhook/redirect. Перенос базы повторно не требуется.
