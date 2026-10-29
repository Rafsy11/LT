# **PRODUCT REQUIREMENTS DOCUMENT (PRD) & SYSTEM DESIGN SPECIFICATION**

**Nama Proyek:** Sistem Operasional Lapangan, Master Data Jaringan, & Monitoring FTTH Terpadu (Web & Mobile)  
**Versi Dokumen:** 1.0  
**Status:** Draft Siap Eksekusi (Menunggu Konfirmasi Infrastruktur Poin Terbuka)  
**Target Deployment:** Server Internal (_On-Premise_)  
**Skala Operasional Awal:** \~200 Teknisi Aktif Harian | \~400+ Pelanggan Awal (Pertumbuhan Berkelanjutan)

## **1\. Ringkasan Eksekutif & Tujuan Sistem**

Sistem ini adalah platform internal perusahaan ISP yang berfungsi sebagai **Sumber Data Utama (_Single Source of Truth / Master Data_)** untuk pengelolaan jaringan akses (Cluster, ODP/Splitter, Port), data pelanggan (SIA), penugasan teknisi lapangan (_Ticketing / Work Order_), pemantauan hasil ukur redaman optik secara _real-time_, serta asisten operasional berbasis **Local AI Chatbot (Agentic & Monitoring)** yang berjalan sepenuhnya di server internal perusahaan.

### **Tujuan Utama:**

1. **Sentralisasi Master Data:** Mengeliminasi duplikasi data pelanggan dan konflik penggunaan port splitter di lapangan.
2. **Integritas Data Lapangan:** Mencegah manipulasi titik lokasi pelanggan (_Fake GPS_), pemalsuan nilai redaman optik, serta perubahan riwayat laporan (_immutable history & audit log_).
3. **Visibilitas Operasional Real-Time:** Memberikan _live feed_ laporan pekerjaan teknisi yang baru masuk ke Web Dashboard Admin tanpa jeda dan tanpa membebani server.
4. **Otomasi & Kendali via AI Internal:** Memudahkan Admin melakukan pemeriksaan data dan eksekusi operasional melalui antarmuka percakapan (AI Chatbot) yang aman, terisolasi, dan mematuhi batasan hak akses (_Role-Based Access Control_).

## **2\. Arsitektur Peran & Hak Akses (RBAC & Security Scoping)**

Sistem menerapkan autentikasi multi-peran dengan fitur **Dynamic Role Editor** di Web Dashboard yang tunduk pada aturan hierarki ketat guna mencegah _Privilege Escalation_.

### **2.1 Matriks Peran Utama (Default Roles)**

| Nama Role                   | Platform Akses           | Cakupan Wilayah                         | Hak Akses Utama                                                                                                                                                                                        |
| :-------------------------- | :----------------------- | :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super Admin**             | Web Dashboard            | Global (Seluruh Cluster)                | Mengelola _Role Editor_, manajemen akun Admin & Teknisi, konfigurasi sistem, akses penuh Master Data, Tiket, Live Monitoring, dan AI Chatbot.                                                          |
| **Admin Operasional / NOC** | Web Dashboard            | Terbatas per cluster_id yang ditugaskan | Mengelola Master Data Cluster/ODP/Pelanggan di wilayahnya, membuat & menugaskan Tiket ke Teknisi, memantau _Live Feed_, mengelola status akun Teknisi, dan menggunakan AI Chatbot sesuai izinnya.      |
| **Teknisi Lapangan**        | Mobile App (Android/iOS) | Hanya Tiket yang ditugaskan kepadanya   | Menerima penugasan Tiket dari Admin, melihat detail lokasi/pelanggan terkait tiket, menginput laporan hasil kerja (LatLong, Redaman, Port Splitter, Foto Bukti), dan melihat riwayat tiket pribadinya. |

### **2.2 Aturan Keamanan Role Editor & Sesi Perangkat**

- **Anti-Privilege Escalation:** Pengguna dengan akses ke _Role Editor_ tidak dapat menambahkan izin (_permission_) yang tidak dimilikinya sendiri, dan dilarang mengubah/menghapus akun dengan level hierarki yang setara atau lebih tinggi.
-
- **Cluster Scoping (Row-Level Filtering):** Setiap query pembacaan maupun penulisan data oleh Admin Operasional dan AI Chatbot otomatis difilter berdasarkan daftar cluster_id yang melekat pada akun Admin tersebut.
- **Dual-Auth & Device Binding:**
  - **Web Admin:** Menggunakan HttpOnly, Secure, SameSite=Strict Cookie untuk mencegah serangan XSS.
  - **Mobile Teknisi:** Menggunakan mekanisme Short-lived JWT Access Token (masa aktif 15 menit) dan Refresh Token (masa aktif 7 hari) yang disimpan di database/Redis bersama atribut device_id.
- **Instant Session Revocation (Force Logout):** Apabila Admin menonaktifkan akun teknisi atau menekan tombol _Force Logout_ di Web Dashboard, token sesi di Redis/PostgreSQL langsung dihapus sehingga akses aplikasi mobile teknisi terputus seketika.

## **3\. Kebutuhan Fungsional (Functional Requirements)**

### **3.1 Modul Master Data Jaringan & Pelanggan (Web Admin)**

Karena aplikasi berdiri sendiri sebagai pemegang Master Data, Admin mengelola struktur hierarki jaringan berikut:

1. **Master Cluster:** Kode Cluster, Nama Area/Wilayah, Koordinat Poligon/Titik Tengah, Status Aktif.
2. **Master ODP / Splitter:** Terikat ke cluster_id, memiliki Kode ODP/Splitter, Titik Koordinat Fisik (lat, lng), dan Kapasitas Maksimal Port (misal: 8 Port atau 16 Port).
3. **Master Pelanggan (SIA):**  
   sia_number (Unique Identifier pelanggan).
   - customer_name, alamat teks, serta koordinat rumah (lat, lng).
   - Relasi ke splitter_id dan port_number yang digunakan saat ini.
   - Nilai current_attenuation (dBm) terakhir dan status layanan (PENDING_INSTALL, ACTIVE, ISOLATED, DISMANTLED).

### **3.2 Modul Sistem Penugasan Tiket / Work Order (Web Admin → Mobile Teknisi)**

Teknisi **tidak dapat** menginput atau mengubah data pelanggan secara bebas tanpa adanya Tiket penugasan aktif dari Admin. Terdapat 2 jenis tiket:

| Atribut Alur                   | 1\. Tiket Pasang Baru (Provisioning / PSB)                                                                                                                                    | 2\. Tiket Pemeliharaan / Gangguan (Maintenance)                                                                                                                                                                  |
| :----------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pembuatan oleh Admin**       | Admin menginput data registrasi awal (SIA, Nama Pelanggan, Target Cluster) dan memilih Teknisi. Status pelanggan otomatis dibuat sebagai PENDING_INSTALL.                     | Admin mencari pelanggan yang sudah berstatus ACTIVE berdasarkan SIA, mengisi keluhan/instruksi kerja, dan memilih Teknisi.                                                                                       |
| **Tampilan di Mobile Teknisi** | Menampilkan SIA, Nama Pelanggan, dan Target Cluster. Kolom LatLong, ODP/Splitter, Nomor Port, dan Redaman wajib diisi di lokasi.                                              | Menampilkan SIA, Nama, LatLong, Port Splitter Saat Ini, dan History Redaman (5 catatan terakhir) sebagai **Read-Only**. Teknisi hanya mengisi Redaman Baru, Port Baru (jika pindah port), dan Catatan Perbaikan. |
| **Efek Saat Teknisi Submit**   | Mengubah status pelanggan menjadi ACTIVE, mengunci Port Splitter yang dipilih, mengisi nilai redaman awal, serta mencatat _History Redaman_ & _Activity Log_ secara otomatis. | Memperbarui nilai current_attenuation (serta mutasi port jika berubah) pada Master Pelanggan, menutup status tiket menjadi COMPLETED, dan menambah baris baru di _History Redaman_ & _Activity Log_.             |

### **3.3 Modul Aplikasi Mobile Teknisi & Validasi Integritas Lapangan**

1. **Pencegahan Manipulasi Lokasi (Anti-Fake GPS & Geofencing):**
   - Aplikasi memeriksa bendera sistem operasi (location.mocked pada Android). Jika terdeteksi menggunakan aplikasi _Fake GPS / Mock Location_, tombol _Submit_ dikunci.
   - Saat menekan _Submit_, sistem menghitung jarak antara koordinat GPS HP teknisi dengan koordinat ODP/Splitter. Jika jarak melebihi batas toleransi (misal 100 meter), sistem menolak laporan atau menandainya dengan label LOCATION_MISMATCH_WARNING untuk ditinjau Admin.  

2. **Validasi Port Splitter Anti-Bentrokan:**
   - Teknisi memilih Cluster → ODP/Splitter → Nomor Port dari menu _dropdown_ (bukan ketik teks bebas).
   - Port yang sudah terisi oleh pelanggan aktif lain otomatis ditandai _Occupied (Terisi)_ dan tidak dapat dipilih.
3. **Bukti Foto In-App & Kompresi:**
   - Teknisi wajib memotret layar alat ukur OPM (_Optical Power Meter_) atau kondisi ODP langsung dari kamera di dalam aplikasi (_akses galeri dinonaktifkan_).
   - Aplikasi menyematkan _watermark_ (SIA, Timestamp, LatLong) pada gambar dan mengompres ukuran file menjadi sekitar 200–300 KB sebelum dikirim.
4. **Penyimpanan Lokal Saat Tanpa Sinyal (Offline-First Queue):**
   - Daftar tiket yang sudah diterima teknisi disimpan di penyimpanan lokal perangkat.
   - Jika teknisi menyelesaikan pekerjaan di titik tanpa sinyal seluler, laporan beserta foto disimpan di dalam _Offline Queue_ lokal dan disinkronkan otomatis ke server begitu koneksi kembali tersedia.

### **3.4 Modul Live Monitoring Dashboard (Web Admin)**

- **Real-Time Activity & Report Stream:** Setiap laporan tiket yang baru masuk dari teknisi langsung muncul di panel _Live Monitoring_ Admin secara _real-time_ menggunakan protokol **Server-Sent Events (SSE)** tanpa perlu me-refresh halaman.
- **Indikator Visual Kualitas Redaman:**
  - **Normal (Hijau):** Rentang \-15.0 dBm hingga \-22.0 dBm.
  - **Warning (Kuning):** Rentang \-22.1 dBm hingga \-25.0 dBm.
  - **Critical / Drop (Merah):** Nilai redaman lebih buruk dari \-25.0 dBm (otomatis disorot di bagian atas _feed_ dan memicu notifikasi visual kepada Admin).
- **Filter Cepat:** Admin dapat menyaring _live feed_ berdasarkan Cluster, Nama Teknisi, Tipe Tiket, atau Status Redaman.

### **3.5 Modul On-Premise Agentic AI Chatbot (Web Admin)**

AI Chatbot berjalan menggunakan model bahasa lokal (_Self-Hosted Open-Weight LLM_) di server internal dan memiliki 2 mode kapabilitas yang dikendalikan melalui **Function Calling (Tools)**:

1. **Mode Monitoring (Read-Only — Eksekusi Langsung):**  
   Menjawab pertanyaan analitik dan pencarian data secara langsung.
   - _Contoh:_ "Tampilkan daftar pelanggan di Cluster A yang redamannya lebih buruk dari \-25 dBm hari ini", "Siapa teknisi yang masih memiliki tiket menggantung?", "Tampilkan riwayat redaman untuk SIA 100245".
2. **Mode Eksekusi Aksi (Write/Mutating — Wajib Konfirmasi / Human-in-the-Loop):**
   - Membantu Admin mengeksekusi tugas operasional seperti membuat tiket penugasan, mengubah status akun teknisi, atau memindahkan alokasi teknisi.
   - **Aturan Keamanan Mutlak:** AI **dilarang** mengubah isi database secara langsung saat memanggil fungsi _Write_. AI wajib menghasilkan komponen **Draft Action Card** di layar chat Admin yang berisi rincian parameter perubahan beserta tombol **\[Setujui & Eksekusi\]** dan **\[Batalkan\]**. Perubahan database hanya dieksekusi oleh Backend setelah Admin mengklik tombol persetujuan.

## **4\. Arsitektur Teknis & Tech Stack (System Design)**

### **4.1 Spesifikasi Tech Stack**

| Lapisan Sistem                     | Teknologi yang Digunakan                      | Alasan Pemilihan & Peran                                                                                                |
| :--------------------------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **Monorepo Manager**               | **Turborepo** \+ pnpm                         | Menyatukan kode Web, API, dan Mobile dalam satu repositori serta berbagi validasi skema (packages/shared).              |
| **Web Frontend & Backend API**     | **Next.js (App Router)** \+ TypeScript        | Menyajikan antarmuka Web Dashboard Admin sekaligus menyediakan REST API (app/api/v1/...) untuk Mobile App.              |
| **Mobile App Teknisi**             | **React Native (Expo Prebuild)**              | Pengembangan aplikasi mobile lintas platform dengan akses modul perangkat keras (_Camera, GPS, SQLite/MMKV_).           |
| **Validasi & Kontrak Data**        | **Zod**                                       | Satu skema validasi yang dipakai bersama oleh form Web, form React Native, validasi API Backend, dan parameter Tool AI. |
| **Database Utama**                 | **PostgreSQL 16** \+ **Prisma / Drizzle ORM** | Penyimpanan relasional dengan dukungan transaksi ACID, _Row Locking_, dan _Partial Unique Index_.                       |
| **Cache, Session, & Realtime Bus** | **Redis 7**                                   | Menyimpan daftar sesi aktif teknisi (_token revocation_) dan jalur _Pub/Sub_ untuk menyuplai _Live Feed_ SSE.           |
| **Object Storage (Foto Bukti)**    | **MinIO (Self-Hosted S3 Compatible)**         | Menyimpan foto bukti OPM/ODP dari teknisi secara terpisah dari container aplikasi Next.js.                              |
| **Local AI Inference Engine**      | **Ollama** atau **vLLM** \+ **Vercel AI SDK** | Menjalankan model LLM lokal (Qwen 2.5 7B/14B Instruct atau Llama 3.1 8B) dengan fitur _native Tool/Function Calling_.   |
| **Reverse Proxy & Gateway**        | **Nginx**                                     | Mengelola terminasi SSL/HTTPS, batas ukuran unggahan file, dan penerusan stream SSE tanpa _buffering_.                  |

### **4.2 Struktur Direktori Monorepo**

Plaintext  
isp-ops-monorepo/  
├── apps/  
│ ├── web/ \# Next.js App (Web Dashboard Admin \+ REST API Backend)  
│ │ ├── src/app/(dashboard)/ \# UI Halaman Admin (Master Data, Tiket, Live Feed, Role Editor, AI Chat)  
│ │ ├── src/app/api/v1/ \# REST API Endpoints untuk Mobile App & SSE Stream  
│ │ ├── src/services/ \# Core Business Logic Layer (Dipakai bersama oleh Web & API Mobile)  
│ │ └── src/ai/ \# Definisi Tools AI Chatbot, System Prompt, & RBAC Context Filter  
│ └── mobile/ \# React Native (Expo) untuk Teknisi Lapangan  
│ ├── src/screens/ \# Daftar Tiket, Form Submit Laporan, Kamera In-App, Riwayat  
│ ├── src/sync/ \# Offline Queue Manager (MMKV / SQLite \+ Background Sync)  
│ └── src/security/ \# Mock Location Detector & App Version Interceptor  
├── packages/  
│ ├── shared/ \# Shared Zod Schemas, TypeScript Interfaces, & Constants  
│ └── database/ \# Skema Prisma/Drizzle, Script Migrasi, & Seeder  
└── docker/  
 ├── docker-compose.yml \# Orkestrasi On-Premise (Next.js, Postgres, Redis, MinIO, Ollama, Nginx)  
 └── nginx/nginx.conf \# Konfigurasi Reverse Proxy

## **5\. Skema Database Inti & Aturan Integritas Data**

Seluruh tabel menggunakan UUID atau BigInt sebagai Primary Key, dan kolom waktu (created_at, updated_at) wajib di-generate oleh waktu server PostgreSQL (DEFAULT NOW()) untuk mencegah manipulasi jam HP teknisi.

### **5.1 Spesifikasi Tabel Utama**

1. roles
   - id (PK), name (Unique), permissions (JSONB — contoh: \["ticket:create", "ticket:read", "tech:manage", "role:edit"\]), hierarchy_level (Int), created_at.
2. users
   - id (PK), username (Unique), full_name, password_hash, role_id (FK → roles), user_type (SUPER_ADMIN | ADMIN | TECHNICIAN), is_active (Boolean), assigned_clusters (Array of cluster_id), created_at.
3. user_sessions
   - id (PK), user_id (FK → users), refresh_token_hash, device_id, device_model, app_version, expires_at, revoked_at.
4. network_clusters
   - id (PK), cluster_code (Unique), name, center_lat, center_lng, is_active (Boolean).
5. network_splitters
   - id (PK), cluster_id (FK → network_clusters), splitter_code (Unique, misal: ODP-CL01-08), lat (Decimal), lng (Decimal), max_ports (Int, default: 8 atau 16), is_active (Boolean).
6. customers **(Master Data Pelanggan)**
   - id (PK), sia_number (Unique, Indexed), full_name, address, lat (Decimal), lng (Decimal), cluster_id (FK → network_clusters), splitter_id (FK → network_splitters, Nullable saat PENDING_INSTALL), port_number (Int, Nullable saat PENDING_INSTALL), current_attenuation (Decimal, misal \-19.45), status (PENDING_INSTALL | ACTIVE | ISOLATED | DISMANTLED), updated_at.
7. tickets **(Work Orders)**
   - id (PK), ticket_number (Unique), ticket_type (PSB | MAINTENANCE), customer_id (FK → customers), assigned_tech_id (FK → users), created_by_admin_id (FK → users), status (OPEN | IN_PROGRESS | COMPLETED | CANCELLED), admin_notes, assigned_at, completed_at.
8. attenuation_histories **(Append-Only / Immutable)**
   - id (PK), submission_id (UUID **Unique** — _Idempotency Key_ dari HP teknisi), ticket_id (FK → tickets), customer_id (FK → customers), tech_id (FK → users), old_attenuation (Decimal, Nullable), new_attenuation (Decimal), splitter_id (FK), port_number (Int), photo_object_key (Path foto di MinIO), submitted_lat (Decimal), submitted_lng (Decimal), distance_to_splitter_m (Decimal), is_location_flagged (Boolean), client_recorded_at (Timestamp saat tombol ditekan di HP), created_at (Server Timestamp).
9. activity_logs **(Immutable Audit Trail)**
   - id (PK), actor_user_id (FK → users), actor_role, action_type (misal: TICKET_SUBMITTED, PORT_MUTATED, TECH_DEACTIVATED, AI_ACTION_EXECUTED), target_entity (customer | ticket | user), target_id, old_payload (JSONB), new_payload (JSONB), ip_address, created_at (Server Timestamp).
10. client_error_logs
    - id (PK), user_id (FK), app_version, device_info, error_message, stack_trace, created_at.

### **5.2 Constraint Database Kritis (Wajib Dipasang di PostgreSQL)**

Untuk mencegah dua pelanggan aktif menempati Port Splitter yang sama pada waktu bersamaan (_Race Condition_), pasang _Partial Unique Index_ berikut pada migrasi SQL:

SQL  
CREATE UNIQUE INDEX idx_unique_active_splitter_port  
ON customers (splitter_id, port_number)  
WHERE status \= 'ACTIVE' AND splitter_id IS NOT NULL AND port_number IS NOT NULL;

##

## **6\. Spesifikasi API & Daftar Tool AI Chatbot**

### **6.1 Standar Header & Endpoint REST API (Mobile & Web)**

Seluruh request dari aplikasi React Native wajib menyertakan header berikut:

- Authorization: Bearer \<access_token\>
- X-App-Version: 1.0.0 (Dicek oleh middleware; jika di bawah versi minimum, kembalikan HTTP 426 Upgrade Required).
- X-Device-ID: \<unique_device_id\>

| Method & Endpoint                    | Akses Role | Fungsi & Mekanisme Validasi                                                                                                                                                                                                              |
| :----------------------------------- | :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST /api/v1/auth/login              | Semua      | Autentikasi akun, memvalidasi device_id teknisi, mengembalikan JWT / Cookie.                                                                                                                                                             |
| GET /api/v1/tech/tickets             | Teknisi    | Mengambil daftar tiket aktif (OPEN / IN_PROGRESS) milik teknisi bersangkutan beserta daftar Master ODP & Port yang tersedia di cluster terkait.                                                                                          |
| POST /api/v1/tech/upload-url         | Teknisi    | Menghasilkan _Presigned Upload URL_ ke MinIO agar HP teknisi mengunggah foto bukti langsung ke storage objek.                                                                                                                            |
| POST /api/v1/tech/tickets/:id/submit | Teknisi    | Menerima laporan penyelesaian tiket. Memvalidasi submission_id (_Idempotency Key_), mengunci port dalam _Database Transaction_, otomatis menulis ke attenuation_histories & activity_logs, serta mempublikasikan event ke Redis Pub/Sub. |
| GET /api/v1/admin/stream/reports     | Admin      | Endpoint **Server-Sent Events (SSE)** yang mengalirkan data laporan terbaru dari Redis Pub/Sub ke layar Live Monitoring Admin secara _real-time_.                                                                                        |
| POST /api/v1/admin/ai/chat           | Admin      | Menerima pesan chat Admin, menyuntikkan filter RBAC (allowed_clusters & permissions), dan memanggil Local LLM dengan _Streaming Response_.                                                                                               |
| POST /api/v1/admin/ai/confirm-action | Admin      | Mengeksekusi perubahan database setelah Admin menekan tombol **\[Setujui & Eksekusi\]** pada _Draft Action Card_ di ruang chat AI.                                                                                                       |

###

### **6.2 Spesifikasi Function Calling (Tools) pada AI Chatbot**

Backend menyaring daftar _Tools_ di bawah ini sesuai izin Admin sebelum diteruskan ke Local LLM:

| Nama Tool (Function)         | Tipe Eksekusi                | Parameter Input (Zod Schema)                                  | Perilaku Sistem                                                                                                                           |
| :--------------------------- | :--------------------------- | :------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| get_recent_reports           | **Read (Otomatis)**          | cluster_code?, min_attenuation?, limit                        | Mengambil laporan redaman terbaru dari database (dibatasi maksimal 50 baris agar konteks LLM tidak penuh).                                |
| get_customer_detail          | **Read (Otomatis)**          | sia_number atau customer_name                                 | Menampilkan detail pelanggan, port splitter saat ini, dan 10 riwayat redaman terakhir.                                                    |
| get_technician_workload      | **Read (Otomatis)**          | cluster_code?, status? (IDLE                                  | BUSY)                                                                                                                                     | Menampilkan daftar teknisi beserta jumlah tiket aktif dan waktu _log activity_ terakhirnya. |
| prepare_create_ticket        | **Write (Wajib Konfirmasi)** | ticket_type, sia_number, customer_name?, tech_username, notes | Memvalidasi ketersediaan teknisi dan SIA, lalu mengembalikan payload JSON untuk merender kartu konfirmasi pembuatan tiket di UI Admin.    |
| prepare_toggle_tech_account  | **Write (Wajib Konfirmasi)** | tech_username, set_active (Boolean), reason                   | Memvalidasi izin Admin, lalu menampilkan kartu konfirmasi untuk menonaktifkan/mengaktifkan akun teknisi beserta pencabutan sesi loginnya. |
| prepare_mutate_splitter_port | **Write (Wajib Konfirmasi)** | sia_number, new_splitter_code, new_port_number                | Memeriksa apakah port tujuan kosong, lalu menampilkan kartu konfirmasi mutasi port kepada Admin.                                          |

##

## **7\. Infrastruktur On-Premise, DevOps & Mitigasi Operasional**

### **7.1 Spesifikasi Server Internal (Hardware Sizing)**

Mengingat seluruh pemrosesan (Aplikasi \+ Database \+ Model AI Internal) berjalan di server internal perusahaan, berikut adalah spesifikasi perangkat keras yang dibutuhkan:

| Komponen                  | Opsi A: Rekomendasi Standar (AI Responsif)                                            | Opsi B: Minimum / Tanpa GPU Khusus (Fallback)                                |
| :------------------------ | :------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------- |
| **CPU**                   | 12–16 Core / 32 Thread (Intel Xeon / AMD EPYC / Ryzen 9\)                             | 8 Core / 16 Thread                                                           |
| **RAM**                   | 64 GB DDR4/DDR5 ECC                                                                   | 32 GB DDR4/DDR5                                                              |
| **GPU (Kartu Grafis AI)** | **1x NVIDIA GPU 16GB–24GB VRAM** (RTX 4060 Ti 16GB / RTX 3090 / RTX 4090 / NVIDIA L4) | _Tanpa GPU_ (Menggunakan CPU Inference)                                      |
| **Model AI Lokal**        | Qwen 2.5 7B / 14B Instruct (via Ollama/vLLM) — Waktu respons: **1–3 detik**           | Qwen 2.5 1.5B / 3B Q4_K_M \+ _Intent Parser_ — Waktu respons: **8–15 detik** |
| **Storage**               | 2 TB NVMe SSD (RAID 1 Mirroring)                                                      | 1 TB NVMe SSD (RAID 1 Mirroring)                                             |

###

### **7.2 Isolasi Container (Mencegah AI Mematikan Database & API)**

Seluruh layanan dijalankan di atas **Docker Compose** dengan pembatasan sumber daya (_Hard Resource Limits_) agar beban komputasi AI tidak pernah mengganggu trafik 200 teknisi lapangan:

- **Container** postgres **&** nextjs-app**:** Diberikan prioritas CPU dan reservasi RAM khusus.
- **Container** ollama-ai**:** Dibatasi dengan parameter environment OLLAMA_NUM_PARALLEL=1 (memproses permintaan chat secara antrean satu per satu) dan memory_limit ketat (misal maksimal 16 GB RAM).
- **Konfigurasi Nginx Reverse Proxy:**
  - client_max_body_size 20M; (mencegah error 413 Payload Too Large saat unggah foto).
  - proxy_buffering off; pada jalur /api/v1/admin/stream/reports agar _Live Feed_ SSE mengalir seketika tanpa tertahan di Nginx.

### **7.3 Distribusi Aplikasi Mobile & Strategi Backup Master Data**

1. **Distribusi & Pembaruan Aplikasi Teknisi:**
   - Menyediakan halaman unduh .apk internal resmi di domain perusahaan.
   - Mengintegrasikan _Self-Hosted OTA (Over-The-Air) Update_ (expo-updates yang mengarah ke server internal) agar perbaikan antarmuka dan logika JavaScript dapat langsung terpasang di 200 HP teknisi tanpa perlu menginstal ulang APK.

2. **Strategi Backup Otomatis 3-2-1 (Disaster Recovery):**
   - _Cronjob_ otomatis berjalan setiap pukul 02.00 dini hari untuk mengeksekusi pg_dump (terkompresi & terenkripsi) serta menyinkronkan bucket foto MinIO.
   - File backup wajib disalin secara otomatis ke media penyimpanan di luar server utama (misalnya ke NAS di gedung/ruangan terpisah atau _encrypted cloud storage_) untuk mencegah kehilangan Master Data jika SSD server utama mengalami kerusakan fisik.

## **8\. Daftar Keputusan Terbuka (Open Items untuk Pihak Manajemen ISP)**

Bagian ini perlu dikonfirmasi oleh pihak manajemen/IT perusahaan sebelum konfigurasi akhir _deployment_ dikunci:

| No    | Item Konfirmasi                           | Opsi / Pertanyaan untuk Perusahaan                                                                                                                                | Dampak Teknis pada Sistem                                                                                                                                             |
| :---- | :---------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Ketersediaan GPU pada Server Internal** | Apakah server internal sudah memiliki GPU NVIDIA (minimal VRAM 16 GB) atau ada anggaran pengadaan GPU?                                                            | Menentukan apakah sistem menggunakan model Qwen 2.5 7B/14B penuh atau model mikro 1.5B/3B berbasis CPU.                                                               |
| **2** | **Metode Akses Publik untuk 200 Teknisi** | Apakah perusahaan menyediakan **IP Publik Statis \+ Subdomain Resmi (HTTPS)** untuk diarahkan ke server internal, atau menggunakan jalur Cloudflare Tunnel / VPN? | Aplikasi mobile Android/iOS mewajibkan koneksi terenkripsi **HTTPS** agar kamera, GPS, dan komunikasi API diizinkan oleh sistem operasi.                              |
| **3** | **Toleransi Jarak Geofencing Teknisi**    | Berapa meter batas maksimal toleransi jarak lokasi teknisi terhadap titik ODP/Pelanggan saat menekan tombol Submit (misal: 50m, 100m, atau 200m)?                 | Menentukan apakah laporan di luar radius akan langsung **ditolak (hard block)** atau tetap diterima dengan **tanda peringatan merah (soft flag)** di dashboard Admin. |
| **4** | **Lokasi Penyimpanan Backup Eksternal**   | Di mana lokasi penyimpanan cadangan kedua (NAS terpisah atau Cloud Bucket) untuk menampung backup harian Master Data?                                             | Menjamin pemulihan data (_Disaster Recovery_) jika server fisik internal mengalami gangguan perangkat keras.                                                          |
