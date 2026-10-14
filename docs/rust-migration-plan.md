# Rencana Migrasi Arsitektur Rust (safe-change)

> Historical research/design snapshot, not current operational instructions or live-runtime certification. For current behavior use [Verification integrity](verification-integrity.md), [MCP setup](mcp-setup.md), and the [runtime evidence matrix](runtime-verification.md). Earlier phase/test-count statements below describe that snapshot.

Status: Active  
Tanggal: 2026-09-27  
Lisensi: AGPL-3.0-only  
Atribusi: ZACK.PRATAMA PT ZYNTRIX ARTIFICIAL INTELLIGENCE INDONESIA (SAFE-CHANGE)

## 1. Prinsip Utama Arsitektur

Migrasi ke Rust dilakukan secara bertahap dengan mematuhi prinsip non-negotiable:
1. "Sekali install via npm, langsung jalan tanpa konfigurasi tambahan."
2. Pengguna akhir tidak diwajibkan menginstal Rust, cargo, atau build tools C/C++.
3. Seluruh interface publik TypeScript dan CLI behavior tetap stabil tanpa breaking changes.
4. Pure TypeScript fallback wajib berfungsi penuh 100% jika modul native tidak tersedia.
5. Setiap penambahan fitur native wajib menyertakan unit test native dan pengujian fallback kontraktual.

## 2. Peta Jalan Migrasi Bertahap (Milestone R.1 - R.5)

### Milestone R.1 (Selesai): Proof of Concept via napi-rs
- Evaluasi arsitektur napi-rs dan multi-platform packaging (7 arsitektur target).
- Pembuktian ekspor fungsi Rust pertama (`version` dan `check_path_boundary`).
- Implementasi TypeScript wrapper dengan pemanggilan dinamis via `node:module createRequire`.
- Integrasi proteksi batas path awal pada `src/installer/core/path-safety.ts`.
- Penyediaan suite pengujian ketersediaan modul native dan fallback murni.

### Milestone R.2 (Milestone Saat Ini): Rust Production Filesystem Layer
- Implementasi resolusi symlink kanonikal (`resolve_and_check_boundary`) menggunakan `std::fs::canonicalize`.
- Deteksi symlink dan NTFS reparse point/junction (`is_symlink_or_junction`) via `std::os::windows::fs::MetadataExt` dan `FileType::is_symlink`.
- Implementasi atomic write (`atomic_write_file`):
  - POSIX: `std::fs::rename` dengan verifikasi pra-kondisi.
  - Windows: `MoveFileExW` dengan flag `MOVEFILE_REPLACE_EXISTING` dan `MOVEFILE_WRITE_THROUGH`.
- Implementasi file locking (`lock_file`, `unlock_file`):
  - POSIX: `flock(fd, LOCK_EX | LOCK_NB)`.
  - Windows: `CreateFileW` dan `LockFileEx` non-blocking.
- Integrasi ke `src/installer/core/path-safety.ts` dan `src/installer/core/transaction.ts`.
- Konfigurasi pipeline CI multi-platform GitHub Actions dengan pengujian `cargo test` dan pengujian fallback tanpa binary.

### Milestone R.3 (Tahap Berikutnya): Full Installer Transaction di Rust
- Pemindahan seluruh alur transaksi instalasi (`InstallationTransaction`) ke engine Rust:
  - Manajemen staging directory yang terisolasi di level kernel.
  - Verifikasi integritas file SHA-256 langsung di level memori native sebelum commit.
  - Mekanisme atomic rollback otomatis jika terjadi gangguan proses (interruption/crash recovery).
  - Penghapusan backup direktori sementara secara aman.
- Interface TypeScript dipertahankan sebagai orkestrator tingkat tinggi.

### Milestone R.4 (Masa Depan): Git Inspection di Rust untuk Repositori Skala Besar
- Optimasi pemindaian status Git pada repositori dengan puluhan ribu file.
- Pemanggilan libgit2 atau pembacaan langsung git index binary format di Rust.
- Eliminasi overhead parsing subprocess `git status` dan `git ls-files` pada repository enterprise.
- Tetap menyediakan fallback subprocess Git berbasis TypeScript.

### Milestone R.5 (Masa Depan): Baseline Hashing di Rust
- Perhitungan multithreaded SHA-256 hash untuk ribuan file menggunakan thread pool native Rust (Rayon).
- Hashing streaming zero-copy langsung dari disk ke hasher kriptografi.
- Reduksi waktu pembuatan baseline (`safe-change save`) hingga 5-10x lebih cepat pada monorepo.

## 3. Disiplin Keamanan dan Unsafe Code

1. Setiap blok `unsafe` wajib menyertakan komentar justifikasi `// SAFETY:` yang menjelaskan:
   - Mengapa blok `unsafe` dibutuhkan (misalnya pemanggilan Win32 FFI atau libc POSIX syscall).
   - Bagaimana invariansi keselamatan memori dijamin (validitas pointer, null termination, siklus hidup handle).
   - Tindakan pencegahan kebocoran resource (resource leak mitigation) pada skenario kegagalan.
2. Setiap fungsi Rust mengembalikan `Result<T, String>` dan dilarang memicu `panic!` yang tidak tertangani.
3. Error message wajib bersifat generik dan tidak mengekspos path privat pengguna.

## 4. Matriks Kompatibilitas dan Distribusi

Target biner yang didistribusikan melalui `optionalDependencies`:
- `@safe-change/win32-x64-msvc`
- `@safe-change/win32-arm64-msvc`
- `@safe-change/darwin-x64`
- `@safe-change/darwin-arm64`
- `@safe-change/linux-x64-gnu`
- `@safe-change/linux-arm64-gnu`
- `@safe-change/linux-x64-musl`

Jika salah satu platform target tidak memiliki binary yang cocok atau sistem berada di lingkungan terisolasi, sistem runtime secara otomatis mengeksekusi implementasi TypeScript murni tanpa intervensi manual dari pengguna.
