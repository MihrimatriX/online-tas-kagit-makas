# RPS Arena

Gerçek zamanlı, eleme usulü **taş-kağıt-makas** turnuva uygulaması.

React + Node.js + Socket.io. Tek Docker container ile ayağa kalkar.

## Özellikler

- Lobi oluştur / koda katıl (`/?code=ABC12`) / rastgele lobi (en fazla 8 kişilik waiting lobiler)
- 2–64 oyuncu, BYE destekli single-elimination (BYE her zaman gerçek oyuncuyla eşleşir)
- İlk 3 puana ulaşan kazanır; 3 sn hazırlık + 10 sn hamle süresi
- Admin: seed, aşama, pause/resume, kazanan ata, kick, test odası, overlay aç/kapa
- Canlı bracket, activity feed, oturumsuz OBS overlay (`/overlay/KOD` ve `?chroma=1`)
- Reconnect, 30 sn grace walkover, admin düşerse yetki devri
- Disk persist (`DATA_FILE`) — restart sonrası timer’lar yeniden kurulur

## Hızlı başlangıç (Docker)

```bash
docker compose up -d --build
```

Aç: [http://localhost:4000](http://localhost:4000)

```bash
docker compose logs -f   # log
docker compose down      # durdur
```

Kalıcı veri: Docker volume `tmk-data` → `/data/store.json`

Yayın overlay (lobiye girmeden): `http://localhost:4000/overlay/ABC12`  
OBS chroma: `http://localhost:4000/overlay/ABC12?chroma=1`

## Geliştirme

Gereksinimler: Node.js 22+, npm

```bash
npm install
npm run dev
```

| Servis   | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:5173    |
| Backend  | http://localhost:4000    |

```bash
npm run typecheck
npm run self-check
npm run build
```

## Proje yapısı

```text
backend/          Express + Socket.io API
frontend/         React (Vite) istemci
docs/             Tasarım / mimari notları
Dockerfile        Tek image (UI + API)
docker-compose.yml
```

## Ortam değişkenleri

Örnek: [`.env.example`](.env.example)

| Değişken           | Açıklama                                      | Varsayılan            |
|--------------------|-----------------------------------------------|-----------------------|
| `PORT`             | HTTP port                                     | `4000`                |
| `HOST`             | Bind adresi                                   | `0.0.0.0`             |
| `SERVE_FRONTEND`   | `1` = backend `frontend/dist` sunar           | Docker’da `1`         |
| `FRONTEND_ORIGIN`  | CORS (`*` = Origin yansıt)                    | `*` / dev’de Vite     |
| `DATA_FILE`        | Persist dosyası                               | `./data/store.json`   |
| `VITE_SOCKET_URL`  | Build-time socket URL (boş = same-origin)     | boş                   |

## npm scriptleri

| Script            | Ne yapar                          |
|-------------------|-----------------------------------|
| `npm run dev`     | Backend + frontend birlikte       |
| `npm run build`   | Production build                  |
| `npm start`       | Backend’i başlat                  |
| `npm run self-check` | Temel invariant kontrolü       |
| `npm run docker:up`  | Compose build + up              |

## Tipik turnuva akışı

1. Lobi kur veya koda katıl (`/?code=ABC12`)
2. Oyuncular **Hazırım** desin (admin bracket’i ancak o zaman hazırlar)
3. Admin bracket hazırlar (veya Test Turnuvasını Başlat)
4. Turnuvayı aktif et → aşamayı başlat
5. Maçlar oynanır; aşama bitince sonraki aşama (veya otomatik geçiş)
6. Şampiyonu yayınla
