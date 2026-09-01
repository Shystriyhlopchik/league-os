# League OS

League OS состоит из NestJS backend, Angular frontend и PostgreSQL. Production-
окружение запускается через Docker Compose из файла
`infrastructure/docker/docker-compose.prod.yml`.

## Обновление production

Инструкция рассчитана на уже развёрнутый сервер, где репозиторий находится в
`~/league-os`, а production-настройки записаны в корневом файле `.env`.

### 1. Подключиться к серверу и проверить рабочую копию

```bash
ssh <пользователь>@<адрес-сервера>
cd ~/league-os
git branch --show-current
git status --short
git rev-parse HEAD
```

Сохраните выведенный хеш коммита: он понадобится, если придётся вернуться к
предыдущей версии. Перед обновлением `git status --short` не должен показывать
неизвестные локальные изменения. Не удаляйте и не заменяйте `.env`.

### 2. Создать резервную копию PostgreSQL

```bash
mkdir -p backups
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  exec -T database sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "backups/league_os_$(date +%F_%H-%M-%S).dump"
```

Убедитесь, что файл создан и не пустой:

```bash
ls -lh backups/
```

Папка `backups/` находится внутри репозитория и не должна отправляться в Git.
Для долгосрочного хранения скопируйте backup за пределы сервера.

### 3. Получить новую версию

```bash
git pull --ff-only
```

Команда обновит текущую ветку из её upstream-ветки и остановится, если для
обновления требуется merge. После обновления проверьте, не появились ли новые
переменные окружения:

```bash
git diff ORIG_HEAD..HEAD -- league-os-backend/.env.example
```

Новые переменные вручную добавляются в корневой `.env`. Значения паролей,
токенов и SMTP-ключей нельзя коммитить в репозиторий.

Для отправки ссылок восстановления пароля через Yandex Cloud Postbox нужны:

```dotenv
FRONTEND_URL=https://liga-dvora.ru
SMTP_HOST=postbox.cloud.yandex.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<идентификатор API-ключа>
SMTP_PASSWORD=<секретная часть API-ключа>
SMTP_FROM="Арман Лига <no-reply@liga-dvora.ru>"
```

### 4. Собрать и запустить новую версию

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --build --remove-orphans
```

Compose последовательно:

1. собирает новые образы backend и frontend;
2. запускает PostgreSQL и проверяет его готовность;
3. выполняет все ожидающие TypeORM-миграции;
4. запускает backend только после успешных миграций;
5. запускает frontend после прохождения healthcheck backend.

Данные PostgreSQL и загруженные файлы находятся в Docker volumes
`postgres_data` и `uploads_data`. Обычная пересборка их не удаляет.

> Не выполняйте `docker compose down -v`: параметр `-v` удаляет volumes вместе
> с базой данных и загруженными файлами.

### 5. Проверить результат

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml ps

docker compose -f infrastructure/docker/docker-compose.prod.yml \
  logs --since 10m migrations backend frontend

curl -fsS https://liga-dvora.ru/api/health
```

У сервисов `database`, `backend` и `frontend` должен быть статус `Up`, у
`database` и `backend` — `healthy`. Контейнер `migrations` должен завершиться с
кодом `0`. В логах не должно быть ошибок миграций, подключения к PostgreSQL или
SMTP.

После технической проверки откройте сайт и проверьте основные сценарии:

- вход и регистрацию;
- открытие списка турниров и матчей;
- создание или редактирование заявки;
- запрос восстановления пароля и получение письма;
- загрузку ранее сохранённых изображений.

Для наблюдения за backend в реальном времени:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  logs -f --tail 100 backend
```

Завершить просмотр можно сочетанием `Ctrl+C`; контейнер при этом продолжит
работать.

## Если обновление не запустилось

Сначала изучите состояние и логи, не удаляя контейнеры или volumes:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml ps -a
docker compose -f infrastructure/docker/docker-compose.prod.yml logs migrations
docker compose -f infrastructure/docker/docker-compose.prod.yml logs backend
```

Типовые причины:

- в `.env` отсутствует новая обязательная переменная;
- миграция базы данных завершилась с ошибкой;
- Docker не смог собрать frontend или backend;
- закончились место на диске или память;
- SMTP-адрес, порт или ключ указаны неверно.

Если нужно временно вернуть предыдущий код, используйте сохранённый перед
обновлением хеш только при чистой рабочей копии:

```bash
git status --short
git switch --detach <предыдущий-хеш-коммита>
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --build --remove-orphans
```

Такой откат возвращает код, но не отменяет уже применённые миграции. Не
запускайте `migration:revert` без проверки конкретной миграции. Если новая
схема несовместима со старым кодом, оставьте сервис остановленным и
восстановите базу из backup по согласованной процедуре.

Чтобы после диагностики снова продолжить обновления из Git:

```bash
git switch <production-ветка>
git pull --ff-only
```

## Полезные команды

Перезапустить только backend после изменения `.env`:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --force-recreate backend
```

Посмотреть последние ошибки отправки писем:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  logs --since 30m backend
```

Остановить проект без удаления данных:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml down
```

Запустить его снова:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --build
```
