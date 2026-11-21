# YTAGENT Integration

> Ditulis berdasarkan pembacaan langsung repo `monliev/ytagent` (November 2026).  
> Konfirmasi ulang jika ada perubahan pada repo.

## Cara ytagent menerima video

**Mode: File Drop + HTTP Notify (dua langkah)**

```
comparison-studio (kita)
   │
   ├─ 1. Tulis file video ke folder NAS/lokal yang dipantau
   │      path: <channel_folder>/<nama_video>.mp4
   │
   └─ 2. POST ke FastAPI backend
          POST http://<ytagent_host>:8000/api/v1/videos/detect
          {
            "filename": "samsung-vs-xiaomi-long.mp4",
            "file_path": "/mnt/omv/<channel>/<file>.mp4",
            "file_size_bytes": 123456789,
            "channel_name": "/mnt/omv/<channel>"
          }
```

Setelah `detect` berhasil:
- ytagent mencatat video ke DB-nya (MySQL)
- Memulai ekstraksi metadata dan frame (screenshot)
- Men-generate judul/deskripsi/tag via AI-nya sendiri (Cloudflare AI / Hermes)
- Status menjadi `STAGING` → owner review di dashboard ytagent → upload ke YouTube

## Struktur folder yang harus kita tulis

```
<OMV_MOUNT_PATH>/
└── <channel_name>/           ← nama folder = nama channel di ytagent
    ├── samsung-vs-xiaomi.mp4  ← file Long
    └── samsung-vs-xiaomi-short.mp4  ← file Short (pisah)
```

> **Penting:** File harus masuk ke subfolder named-channel, bukan langsung ke root mount.

## FolderDropPublisher yang perlu diimplementasikan

```typescript
// packages/publisher/src/folder-drop.ts
// Langkah 1: salin file ke folder channel
// Langkah 2: POST ke /api/v1/videos/detect
// Langkah 3: poll status lewat GET /api/v1/videos/ sampai status != STAGING

const payload: VideoDetectRequest = {
  filename: path.basename(videoPath),
  file_path: destPath,          // path absolut di sisi ytagent
  file_size_bytes: statSync(videoPath).size,
  channel_name: channelFolderPath,
};
await fetch(`${YTAGENT_BASE_URL}/api/v1/videos/detect`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

## Metadata

ytagent **menggenerate sendiri** title/description/tags via AI-nya (Cloudflare AI). Tapi kita bisa pre-set metadata via `VideoMetadataUpdate`:

```
PATCH /api/v1/videos/{id}/metadata
{
  "title": "Samsung Galaxy A55 vs Xiaomi 14T: Which is Better?",
  "description": "...",
  "tags": ["samsung", "xiaomi", "phone comparison"],
  "ai_generated": true,
  "category_id": "28"    ← Science & Technology
}
```

> **Rekomendasi:** Kita kirim metadata kita (dari Copy Generator) via PATCH setelah detect berhasil, agar tidak bergantung pada AI ytagent untuk konten kita.

## Scheduling

Channel ytagent sudah punya:
- `preferred_time`: jam upload harian (default 10:00)
- `upload_days_interval`: interval hari antar upload
- `preferred_upload_times`: jadwal custom

Upload dilakukan otomatis oleh ytagent sesuai jadwal channel. Kita tidak perlu mengatur jadwal dari sisi kita — cukup pastikan channel yang benar sudah dikonfigurasi di ytagent.

## Status tracking

```
GET /api/v1/videos/?channel_id=<id>
```

Field `status` pada `VideoResponse`:
- `STAGING` → ytagent sedang proses
- `PENDING` → menunggu jadwal
- `UPLOADING` → sedang upload (progress via Redis)
- `PUBLISHED` → selesai, ada `youtube_video_id`
- `FAILED` → gagal, ada `last_error`

## ENV yang perlu ditambah ke `.env`

```
PUBLISH_MODE=http                        # atau folder atau manual
YTAGENT_BASE_URL=http://127.0.0.1:8000  # jika pakai HTTP mode
YTAGENT_WATCH_DIR=/mnt/omv/<channel>    # jika pakai folder drop mode
YTAGENT_CHANNEL_NAME=phone-reviews      # nama channel di ytagent
```

## Catatan penting

1. **ytagent pakai MySQL + Redis** (bukan SQLite). Pastikan Docker stack ytagent berjalan sebelum kita coba handoff.
2. **Endpoint `/detect` tidak butuh auth** (tidak ada `get_current_user` dependency di sana) — cocok untuk caller internal.
3. **ai_generated flag**: set `true` di metadata kita → sesuai kebijakan YouTube disclosure.
4. **category_id**: kita pakai `"28"` (Science & Technology), bukan `"10"` (Music) yang jadi default ytagent.
5. Thumbnail harus diupload **terpisah** — ytagent punya sistem thumbnail draft sendiri. Kita bisa kirim `thumbnail_id` via `POST /api/v1/videos/{id}/thumbnail`.
