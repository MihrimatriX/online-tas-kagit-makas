# RPS Arena

Gerçek zamanlı, eleme usulü **taş-kağıt-makas** turnuvası. React + Node.js + Socket.io; tek Docker container ile ayağa kalkar.

## Özellikler

- Lobi kur / koda katıl (`/?code=ABC12`) / açık bir lobiye rastgele gir (en fazla 8 kişilik lobiler)
- 2–64 oyuncu, BYE destekli tek eleme (BYE her zaman gerçek bir oyuncuyla eşleşir)
- Ayarlanabilir kurallar: ilk 2–5 puan, 5–20 sn hamle, 0–5 sn geri sayım, tur geçişi elle veya otomatik
- Her round sonrası iki oyuncuya da sonucu gösteren kısa bir ara; süre dolarsa hamle sistemce atanır
- Yönetici: kura çek / boz, başlat, duraklat / devam, sonraki tur, kazanan ata, maçı baştan başlat, oyuncu çıkar, aynı lobiyle yeni turnuva
- Test botları (1–2 saniyede oynar), canlı tablo, akış, podyum
- Oturumsuz OBS overlay: `/overlay/KOD` (yeşil fon: `?chroma=1`)
- Yeniden bağlanma (sekme kapansa bile), yönetici düşerse 30 sn sonra yetki devri, `Ayrıl` ile turnuvadan çekilme
- Disk persist (`DATA_FILE`): restart sonrası saatler yeniden kurulur, SIGTERM'de anında yazılır; 3 saat boyunca kimsenin olmadığı lobiler silinir

## Hızlı başlangıç (Docker)

```bash
docker compose up -d --build
```

Aç: [http://localhost:4000](http://localhost:4000) · Kalıcı veri: Docker volume `tmk-data` → `/data/store.json`

## Geliştirme

Node.js 22+ ve npm.

```bash
npm install
npm run dev
```

| Servis   | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:5173 |
| Backend  | http://localhost:4000 |

```bash
npm run typecheck
npm run self-check   # turnuva akışı, kopma/ayrılma, persist, SEO kaçışları
npm run build
```

## Proje yapısı

```text
backend/src/
  tournament/flow.service.ts      Turnuva akışı: hamle, round saati, faz geçişi, admin komutları
  tournament/match.service.ts     Maç kuralları (saf fonksiyonlar)
  tournament/presence.service.ts  Bağlantı, yönetici devri, restart kurtarma, lobi temizliği
  tournament/timer.service.ts     Tüm sunucu zamanlayıcıları (tek kayıt defteri)
  tournament/tournament.types.ts  Tel formatı — frontend de buradan `import type` eder
  socket/                         İnce Socket.io handler'ları
  state/                          Bellek deposu + disk persist
frontend/src/
  pages/                          Arena (lobi / maç / durum / sonuç), Yönetim, Overlay
  tokens.css, styles.css          Tasarım sistemi (bkz. design.md)
design.md                         Kilitli tasarım sistemi
```

## Ortam değişkenleri

Örnek: [`.env.example`](.env.example)

| Değişken          | Açıklama                                  | Varsayılan          |
|-------------------|-------------------------------------------|---------------------|
| `PORT`            | HTTP port                                 | `4000`              |
| `HOST`            | Bind adresi                               | `0.0.0.0`           |
| `SERVE_FRONTEND`  | `1` = backend `frontend/dist` sunar       | Docker'da `1`       |
| `FRONTEND_ORIGIN` | CORS (`*` = Origin yansıt)                | `*` / dev'de Vite   |
| `DATA_FILE`       | Persist dosyası                           | `./data/store.json` |
| `PERSIST`         | `0` = diske yazma                         | açık                |
| `PUBLIC_ORIGIN`   | Canonical / Open Graph origin             | istek başlıkları    |
| `VITE_SOCKET_URL` | Build-time socket URL (boş = same-origin) | boş                 |

## Tipik turnuva akışı

1. Lobi kur, kodu paylaş. Herkes **Hazırım** der.
2. Yönetici **Kurayı çek** → tabloyu kontrol eder (gerekirse **Kurayı boz**).
3. **Turnuvayı başlat** → ilk turun bütün maçları aynı anda açılır.
4. Tur bitince yönetici sıradaki turu başlatır (veya otomatik geçiş açıksa kendiliğinden başlar).
5. Final bitince şampiyon ilan edilir; **Yeni turnuva** aynı kodla lobiyi yeniden açar.

Yöneticinin her an tek bir "Sıradaki adım" butonu vardır; Arena sekmesinde de görünür.
