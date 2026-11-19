# Медицинский дашборд 2.0 — GitHub Pages

Публичный репозиторий содержит только тестовый интерфейс, без медицинских данных.

1. Supabase → Project Settings → API Keys: возьми `sb_publishable_...` (публичный ключ).
2. Впиши его в `config.js`. Никогда не добавляй `service_role`, `sb_secret_...`, пароли, JWT или медицинские документы.
3. GitHub → Settings → Pages → Deploy from a branch → main → /(root) → Save.
4. Открой https://sypkov.github.io/medical-dashboard-2/ после публикации.
5. Supabase → Authentication → URL Configuration: настрой Site URL и Redirect URLs.
6. До полного аудита и сквозных тестов используй только синтетический JSON.

Данные хранятся в Supabase с RLS, а не в GitHub. GitHub Pages публичен.
