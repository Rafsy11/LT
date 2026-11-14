# Panduan Deployment Apple Silicon M5 (macOS ARM64) — FiberOps FTTH

Panduan operasional dan deployment komprehensif sistem FiberOps FTTH pada perangkat keras Apple Silicon M5 (macOS ARM64), dirancang untuk keandalan on-premise, akselerasi Metal GPU native, dan proteksi keausan media penyimpanan SSD.

---

## 1. Profil Perangkat Keras Target & Alokasi Resource

### 1.1 Spesifikasi Mesin Target
- **Model**: MacBook Air 13-inch (M5, 2026)
- **CPU**: 10-core CPU (kinerja tinggi + efisiensi daya, fanless thermal envelope)
- **GPU**: 10-core GPU terintegrasi dengan arsitektur Unified Memory
- **RAM**: 24 GB Unified Memory (bandwidth tinggi untuk CPU & GPU)
- **Penyimpanan**: 512 GB PCIe NVMe SSD onboard
- **Sistem Operasi**: macOS Sonoma / Sequoia (ARM64)

### 1.2 Strategi Alokasi Memori (Budgeting 24GB Unified Memory)
Pada arsitektur Apple Silicon fanless, memori dibagi bersama (unified) antara komputasi OS, grafis, dan model AI. Strategi pemisahan resource dirancang tanpa memicu memory swap ke SSD:

| Alokasi Komponen | Batas Memori (RAM) | vCPU / Core | Deskripsi & Peran |
|---|---|---|---|
| **macOS Host OS & Background Apps** | 4.0 – 5.0 GB | 2–4 Cores | Menjalankan sistem operasi macOS, terminal, VSCode, dan layanan sistem. |
| **Ollama Native (Metal Framework)** | ~5.0 GB | 10 GPU Cores | Inferensi LLM `qwen2.5:7b` langsung mengakses Apple Metal GPU. |
| **Docker Desktop Linux VM** | 8.0 – 10.0 GB | 6–8 vCPUs | Menjalankan seluruh container aplikasi (Nginx, Web, DB, Redis, MinIO). |
| **Headroom Bebas (Safety Margin)** | 4.0 – 6.0 GB | Dinamis | Buffer aman untuk fluktuasi komputasi dan mencegah SSD swap wear. |

### 1.3 Proteksi Keausan Media Penyimpanan (512GB SSD Protection)
Untuk mencegah degradasi cell SSD NVMe 512GB dari penulisan log dan build context berlebih:
1. **JSON Log Rotation**: Seluruh container Docker dibatasi dengan opsi driver logging `json-file` (`max-size: "10m"`, `max-file: "3"`). Total footprint log tidak akan melebihi 150 MB across services.
2. **Docker Build Context Pruning**: File `.dockerignore` di root repository mengecualikan direktori `node_modules`, `.next`, `.turbo`, artifacts mobile, dan backups, mereduksi context build dari ~4 GB menjadi <15 MB.
3. **Backup Retensi 30 Hari**: Skrip `docker/scripts/backup.sh` membersihkan arsip lokal yang berumur lebih dari 30 hari secara otomatis (`-mtime +30`).

---

## 2. Konfigurasi Docker Desktop for Mac

Buka aplikasi **Docker Desktop** pada macOS, masuk ke **Settings (ikon roda gigi)**, dan lakukan konfigurasi berikut:

### 2.1 Tab General
- Aktifkan **Use Virtualization framework** (wajib untuk Apple Silicon ARM64).

### 2.2 Tab Resources
- **Virtualization CPU & Memory**:
  - **CPUs**: Setel ke **6 vCPU** (atau **8 vCPU**).
  - **Memory**: Setel ke **8 GB** (maksimal **10 GB**).
  - **Swap**: Setel ke **1 GB** (jangan setel lebih tinggi untuk meminimalkan penulisan disk).
  - **Virtual disk limit**: 64 GB.
- **File Sharing Implementation**:
  - Pilih **VirtioFS** (wajib aktif; memberikan peningkatan performa I/O volume mount hingga 10x lipat dibanding gRPC FUSE pada macOS).

Setelah mengubah pengaturan, klik **Apply & restart**.

---

## 3. Instalasi & Konfigurasi Ollama Native (10-Core Metal GPU)

### 3.1 Mengapa Wajib Menjalankan Ollama Secara Native di macOS?
Di dalam lingkungan Docker Desktop for Mac, mesin container berjalan di dalam Linux VM virtual. Hypervisor Docker Desktop saat ini **tidak dapat meneruskan Apple Metal framework** ke dalam container Linux. Jika Ollama dijalankan di dalam Docker, eksekusi LLM akan jatuh ke CPU emulation yang lambat dan memicu panas tinggi pada MacBook Air tanpa kipas.

Dengan menjalankan Ollama langsung pada host macOS:
- Model AI diproses langsung oleh **10-core Metal GPU** dengan Unified Memory bandwidth penuh.
- Kecepatan token output mencapai >45 tokens/detik untuk model `qwen2.5:7b`.
- Konsumsi daya sangat hemat dan suhu MacBook Air tetap dingin.

### 3.2 Langkah Instalasi Ollama Host
1. Instalasi melalui Homebrew:
   ```bash
   brew install ollama
   ```
   *(Atau unduh aplikasi resmi dari https://ollama.com/download/mac)*

2. Download model target `qwen2.5:7b`:
   ```bash
   ollama pull qwen2.5:7b
   ```

3. Jalankan Ollama daemon dengan binding `0.0.0.0` (agar dapat diakses oleh container Docker melalui `host.docker.internal`):
   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```

4. *(Opsional - Daemon Otomatis via launchd)*:
   Jika ingin Ollama otomatis aktif saat startup macOS dengan binding `0.0.0.0`, buat file `~/Library/LaunchAgents/com.ollama.daemon.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.ollama.daemon</string>
       <key>ProgramArguments</key>
       <array>
           <string>/opt/homebrew/bin/ollama</string>
           <string>serve</string>
       </array>
       <key>EnvironmentVariables</key>
       <dict>
           <key>OLLAMA_HOST</key>
           <string>0.0.0.0:11434</string>
       </dict>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
   </dict>
   </plist>
   ```
   Aktifkan via launchctl:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.ollama.daemon.plist
   ```

5. Verifikasi konektivitas Ollama:
   ```bash
   curl http://localhost:11434/api/version
   # Output: {"version":"0.x.x"}
   ```

---

## 4. Konfigurasi Environment (`.env`)

1. Salin template `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```

2. Konfigurasi nilai kunci dalam file `.env`:
   ```env
   # Reverse Proxy & Host Port (Menghindari konflik port privilegi 80 pada macOS)
   WEB_HTTP_PORT=8080

   # Database (PostgreSQL 16)
   DATABASE_URL="postgresql://fiberops:fiberops_secure_pass@localhost:5432/fiberops_db?schema=public"
   SEED_DEFAULT_PASSWORD="FiberOps#2026"

   # Redis
   REDIS_URL="redis://localhost:6379"

   # MinIO Object Storage
   MINIO_ENDPOINT="localhost"
   MINIO_PORT=9000
   MINIO_USE_SSL=false
   MINIO_ACCESS_KEY="fiberops_minio_admin"
   MINIO_SECRET_KEY="fiberops_minio_secret_pass"
   MINIO_BUCKET="fiberops-proofs"
   # URL Gateway Publik untuk presigned URL upload teknisi mobile (via reverse proxy Nginx /s3/)
   MINIO_PUBLIC_URL="http://localhost:8080/s3"

   # Ollama / Local LLM (Koneksi ke host native macOS)
   # PENTING: DILARANG menyertakan akhiran /api
   OLLAMA_BASE_URL="http://host.docker.internal:11434"
   OLLAMA_MODEL="qwen2.5:7b"

   # Nginx Gateway Health Probe
   NGINX_HEALTH_URL="http://127.0.0.1:8080/api/v1/health"

   # Keamanan & JWT
   JWT_SECRET="fiberops_on_premise_super_secure_jwt_secret_key_32chars"
   HMAC_ACTION_SECRET="fiberops_action_secret_token_default_32_chars"
   SESSION_EXPIRY_SECONDS=28800

   # Mode Data Ketat
   STRICT_LIVE_DATA="true"
   ```

---

## 5. Prosedur Step-by-Step Deployment

Ikuti langkah-langkah berikut untuk meluncurkan stack sistem secara bersih:

### Langkah 1: Pastikan Ollama Native Berjalan
Pastikan port `11434` telah aktif di host macOS:
```bash
lsof -i :11434
```

### Langkah 2: Bangun & Jalankan Docker Compose
Jalankan stack Docker dalam mode background:
```bash
docker compose -f docker/docker-compose.yml up -d --build
```
Proses ini akan membangun image `apps/web/Dockerfile` dengan multi-stage ARM64 cache, membuat user non-root `nextjs` (UID 1001), dan meluncurkan container `fiberops-nginx`, `fiberops-web`, `fiberops-postgres`, `fiberops-redis`, serta `fiberops-minio`.

### Langkah 3: Verifikasi Health Status Container
Periksa apakah seluruh healthcheck bernilai `healthy`:
```bash
docker compose -f docker/docker-compose.yml ps
```
*Pastikan kolom STATUS menampilkan `Up (healthy)` untuk semua service.*

### Langkah 4: Migrasi Schema & Seeding Database
Jalankan sinkronisasi schema Prisma dan master data:
```bash
pnpm db:push
pnpm db:seed
```
Perintah ini akan membuat tabel relasional dan menanam data awal (akun superadmin, tiket `WO-2025-0841`, `WO-2025-0842`, teknisi `tech.andi`, dan konfigurasi workspace default).

### Langkah 5: Akses Web Dashboard
Buka browser Safari atau Chrome pada macOS, akses:
- **URL**: `http://localhost:8080`
- **Username**: `superadmin`
- **Password**: `FiberOps#2026`

### Langkah 6: Verifikasi Status Sistem di Dashboard `/settings`
Navigasi ke menu **Pengaturan Sistem** (`/settings`):
- **Database (PostgreSQL)**: `HEALTHY` (Hijau)
- **Cache (Redis)**: `HEALTHY` (Hijau)
- **Object Storage (MinIO)**: `HEALTHY` (Hijau)
- **Reverse Proxy (Nginx)**: `HEALTHY` (Hijau)
- **Local AI (Ollama)**: `HEALTHY` (Hijau), model aktif `qwen2.5:7b`, VRAM terdeteksi.

---

## 6. Acceptance Criteria & Prosedur Verifikasi

Lakukan pengujian independen berikut untuk memastikan seluruh parameter sistem terpenuhi:

### 6.1 Uji Konfigurasi Compose
```bash
docker compose -f docker/docker-compose.yml config
```
- **Kriteria Lulus**: Exit code `0`, resource limits tercetak (~5.0 GB total), healthcheck terdefinisi pada 4 service, dan logging `json-file` terkonfigurasi.

### 6.2 Uji Typecheck Monorepo
```bash
npm run typecheck
```
- **Kriteria Lulus**: Exit code `0`, 4/4 packages pass (`@repo/database`, `@repo/shared`, `@repo/mobile`, `@repo/web`).

### 6.3 Uji Keamanan & Audit Idempotensi
```bash
pnpm --filter @repo/web run test:security
```
- **Kriteria Lulus**: 6/6 test suites pass (`[✓ PASS]`):
  - Test A: Anti-Header Spoofing
  - Test B: Sliding-Window Rate Limiter
  - Test C: Technician Anti-IDOR
  - Test D: AI Action Token Anti-Replay
  - Test E: Identical GPS Spoofing Detection
  - Test F: Cross-Ticket Idempotency & IDOR Defense

### 6.4 Uji Presigned URL MinIO Mobile
Uji normalisasi endpoint MinIO dan presigned upload:
```bash
pnpm --filter @repo/web exec tsx -e "
import { normalizeMinioEndpoint } from './src/server/lib/minio';
console.assert(normalizeMinioEndpoint('http://minio:9000') === 'minio', 'Failed 1');
console.assert(normalizeMinioEndpoint('http://http://minio:9000:9000') === 'minio', 'Failed 2');
console.log('MinIO Normalization Verified.');
"
```

### 6.5 Uji Akselerasi Metal GPU Ollama
Buka **Activity Monitor** -> **Window** -> **GPU History**. Kirim prompt di menu AI Assistant Web. Grafik pemakaian GPU akan melonjak membuktikan komputasi dieksekusi oleh 10-core Metal GPU M5 tanpa melibatkan CPU virtualization.

---

## 7. Runbook Operasional & Maintenance

### 7.1 Prosedur Backup & Pemulihan Harian (Disaster Recovery)
Sistem dilengkapi skrip backup otomatis yang mendukung strategi 3-2-1 backup:
```bash
bash docker/scripts/backup.sh
```
- Skrip mendeteksi mount drive eksternal NVMe di `/Volumes/FiberOpsBackup`.
- Jika terpasang, arsip database (`.sql.gz`) dan mirror bucket MinIO (`.tar.gz`) disalin ke drive eksternal.
- Jika tidak terpasang, skrip otomatis fallback ke direktori lokal `./backups`.
- Retensi otomatis membersihkan file lokal berumur >30 hari untuk melindungi kapasitas 512GB SSD.

### 7.2 Pemantauan Log & Troubleshooting
- **Melihat log real-time**:
  ```bash
  docker compose -f docker/docker-compose.yml logs -f nextjs-web
  docker compose -f docker/docker-compose.yml logs -f nginx
  ```
- **Restart service tertentu**:
  ```bash
  docker compose -f docker/docker-compose.yml restart nextjs-web
  ```
- **Kendala Port 8080 Conflict**:
  Ubah `WEB_HTTP_PORT=8081` pada file `.env` dan jalankan `docker compose -f docker/docker-compose.yml up -d`.
- **Kendala Koneksi Ollama (`host.docker.internal`)**:
  Pastikan Ollama pada host dijalankan dengan `OLLAMA_HOST=0.0.0.0:11434`. Jika menggunakan firewall macOS, izinkan incoming connection untuk binary `ollama`.

---

## 8. Panduan Deployment Aplikasi Mobile Teknisi & Distribusi APK

Bagian ini mendokumentasikan prosedur deployment aplikasi mobile lapangan (`apps/mobile`), eksekusi development server (LAN & Tunnel), konfigurasi dynamic server URL pada perangkat teknisi, build APK internal mandiri, dan integrasi endpoint distribusi Next.js.

### 8.1 Panduan Eksekusi Mobile Development Server (LAN & Tunnel)

Aplikasi mobile teknisi dikonfigurasi menggunakan Expo Metro bundler dalam arsitektur monorepo Turborepo. Terdapat dua mode eksekusi server pengembangan yang dapat dipilih sesuai topologi jaringan:

1. **Mode Local Area Network (LAN Wi-Fi)**:
   Gunakan mode ini ketika laptop development macOS M5 dan perangkat Android fisik teknisi terhubung pada jaringan Wi-Fi atau hotspot lokal yang sama.
   ```bash
   # Jalankan server Expo dengan IP LAN lokal
   pnpm --filter @repo/mobile run start:lan
   ```
   Expo CLI akan menampilkan QR code terminal. Scan QR code menggunakan aplikasi Expo Go pada perangkat Android atau pasang URL bundle ke build development client.

2. **Mode Cloud Tunnel (Expo Tunnel via ngrok/localtunnel)**:
   Gunakan mode ini ketika perangkat teknisi berada di luar jangkauan Wi-Fi lokal (misalnya menggunakan paket data seluler 4G/5G di lapangan) tanpa memerlukan port-forwarding router:
   ```bash
   # Jalankan server Expo melalui secure tunnel
   pnpm --filter @repo/mobile run start:tunnel
   ```

3. **Mode Pengembangan Standar & Platform Lainnya**:
   ```bash
   pnpm --filter @repo/mobile run start      # Expo interactive CLI
   pnpm --filter @repo/mobile run android    # Luncurkan langsung ke Android emulator/device
   pnpm --filter @repo/mobile run web        # Preview antarmuka teknisi di browser desktop
   ```

### 8.2 Prosedur Konfigurasi Dynamic Server URL pada Perangkat Mobile Teknisi

Aplikasi mobile teknisi mendukung konfigurasi dinamis endpoint server API saat login, memungkinkan transisi seamless antara lingkungan staging lokal, server on-premise kantor cabang, dan domain produksi publik:

1. **Akses Menu Pengaturan Koneksi Server**:
   Pada layar login mobile (`LoginScreen`), ketuk ikon gear atau tombol "Server Config" pada bagian bawah layar untuk membuka modal konfigurasi URL.
2. **Input Alamat Server Target**:
   - **Lingkungan macOS M5 Host (LAN)**: `http://192.168.1.X:8080` (ganti `192.168.1.X` dengan IP lokal Wi-Fi MacBook M5).
   - **Lingkungan Nginx On-Premise Produksi**: `https://ftth-ops.lintasarta.co.id`.
3. **Uji Validasi Konektivitas (Health Check)**:
   Aplikasi secara otomatis mengirimkan request `GET /api/v1/health` ke endpoint target untuk memastikan:
   - Server web Next.js aktif dan dapat dijangkau.
   - Database dan redis berstatus sehat.
   - Versi aplikasi mobile kompatibel dengan `minRequiredVersion` server.
4. **Penyimpanan Terenkripsi**:
   Setelah health check berhasil, URL server disimpan secara persisten dan aman pada SecureStore lokal perangkat untuk request-request berikutnya.

### 8.3 Prosedur Build Internal APK Standalone via EAS CLI

Untuk mendistribusikan aplikasi secara mandiri kepada teknisi lapangan tanpa ketergantungan Google Play Store, gunakan profil build internal APK yang telah dikonfigurasi pada `apps/mobile/eas.json`:

1. **Persiapan EAS CLI**:
   Pastikan EAS CLI terpasang dan login ke akun Expo organisasi:
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Eksekusi Build APK Lokal (Tanpa Cloud Queue)**:
   Jalankan build APK secara lokal pada mesin macOS M5:
   ```bash
   # Build profil preview internal APK secara lokal
   pnpm --filter @repo/mobile run build:apk
   ```
   Perintah ini setara dengan:
   ```bash
   eas build -p android --profile preview --local
   ```
   Hasil kompilasi akan menghasilkan binary APK mandiri (bukan Android App Bundle `.aab`) yang siap dipasang langsung pada perangkat Android teknisi.

3. **Build APK Produksi**:
   ```bash
   eas build -p android --profile production --local
   ```

### 8.4 Distribusi APK dan Verifikasi Manifest OTA Update

1. **Penempatan Binary APK pada Server Web**:
   Setelah file APK berhasil dikompilasi, salin binary ke direktori publik server web Next.js:
   ```bash
   mkdir -p apps/web/public/downloads
   cp apps/mobile/build/*.apk apps/web/public/downloads/mobile-latest.apk
   ```

2. **Endpoint Distribusi Mandiri (`/download/mobile-latest.apk`)**:
   Server web menyediakan endpoint cerdas di `apps/web/src/app/download/mobile-latest.apk/route.ts`:
   - **Jika binary APK tersedia di disk**: Menyajikan file secara langsung dengan streaming header `Content-Type: application/vnd.android.package-archive` dan `Content-Disposition: attachment; filename="mobile-latest.apk"`.
   - **Jika binary APK belum dikompilasi**: Mengembalikan HTTP 200 (tidak pernah 404) berisi panduan build terstruktur berformat JSON yang memuat spesifikasi versi, target package, dan panduan perintah CLI.

3. **Uji Verifikasi Endpoint Unduhan**:
   ```bash
   # Verifikasi respons endpoint unduhan APK
   curl -i http://localhost:8080/download/mobile-latest.apk
   ```

4. **Verifikasi Manifest OTA Updates**:
   Periksa kecocokan runtime version aplikasi mobile dengan manifest OTA server:
   ```bash
   curl -s http://localhost:8080/api/v1/ota/manifest | jq .
   ```
   Pastikan `runtimeVersion` bernilai `"1.0.0"` sesuai konfigurasi pada `apps/mobile/app.json`.
