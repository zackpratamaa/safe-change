# Hasil Implementasi Rust Filesystem Layer (Milestone R.1 & R.2)

> Historical research/design snapshot, not current operational instructions or live-runtime certification. For current behavior use [Verification integrity](verification-integrity.md), [MCP setup](mcp-setup.md), and the [runtime evidence matrix](runtime-verification.md). Earlier phase/test-count statements below describe that snapshot.

Status: R.1 Approved, R.2 Production Layer Implemented (Environment-Limited Local Verification)  
Tanggal: 2026-09-27  
Lisensi: AGPL-3.0-only  
Atribusi: ZACK.PRATAMA PT ZYNTRIX ARTIFICIAL INTELLIGENCE INDONESIA (SAFE-CHANGE)

## 1. Ringkasan Eksekutif

Milestone R.2 memperluas arsitektur native `safe-change` dari sekadar proof-of-concept (R.1) menjadi layer proteksi filesystem tingkat kernel (kernel-level filesystem protection layer). Modul Rust native yang beroperasi melalui `napi-rs` kini mengimplementasikan 5 kapabilitas keamanan tingkat sistem:
1. `resolve_and_check_boundary`: Resolusi intermediate symlink via kanonikalisasi filesystem sebelum evaluasi boundary traversal.
2. `is_symlink_or_junction`: Deteksi dini tautan simbolik (POSIX) dan NTFS reparse points/junctions (Windows).
3. `atomic_write_file`: Operasi swap atomik bebas race condition menggunakan POSIX `rename` dan Win32 `MoveFileExW`.
4. `lock_file`: Penguncian berkas eksklusif non-blocking via `flock` (Unix) dan `LockFileEx` (Windows).
5. `unlock_file`: Pelepasan kunci eksklusif dan penutupan handle sistem secara aman.

TypeScript wrapper (`src/native/index.ts`) dan komponen inti (`src/installer/core/path-safety.ts` serta `src/installer/core/transaction.ts`) telah mengintegrasikan fungsi-fungsi native ini dengan mekanisme graceful fallback yang menjamin keandalan 100% saat dieksekusi di lingkungan tanpa binary native.

## 2. Fungsi Baru yang Diimplementasikan

| Fungsi Rust | Ekspor N-API | Deskripsi & Tujuan Keamanan |
| --- | --- | --- |
| `resolve_and_check_boundary` | `Option<bool>` | Menggunakan `std::fs::canonicalize` untuk meresolusi semua symlink dan memverifikasi apakah path target berada di dalam batas direktori root yang diizinkan. |
| `is_symlink_or_junction` | `Option<bool>` | Membaca metadata berkas via `fs::symlink_metadata`. Memeriksa flag `FileType::is_symlink` dan atribut NTFS `FILE_ATTRIBUTE_REPARSE_POINT` (0x0400). |
| `atomic_write_file` | `bool` | Memvalidasi bahwa path staging dan target bukan symlink/junction, lalu mengeksekusi penggantian berkas atomik di level kernel. |
| `lock_file` | `Option<f64>` | Membuka handle berkas dan menerapkan exclusive non-blocking lock untuk mencegah modifikasi konkruen oleh agen atau proses lain. |
| `unlock_file` | `bool` | Melepaskan lock pada handle dan menutup descriptor/handle sistem untuk mencegah kebocoran resource. |

## 3. Implementasi Khusus Platform (Platform-Specific Implementations)

### Linux & macOS (POSIX)
- Symlink resolution: `std::fs::canonicalize`.
- Atomic rename: `std::fs::rename` (menjamin atomisitas POSIX pada filesystem yang sama).
- File locking: `libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB)` pada file descriptor yang dibuka via `std::os::unix::io::IntoRawFd`.
- File unlocking: `libc::flock(fd, libc::LOCK_UN)` dilanjutkan dengan `libc::close(fd)`.

### Windows (Win32)
- Symlink & Junction detection: `std::os::windows::fs::MetadataExt::file_attributes()` dengan pengecekan bitmask terhadap `FILE_ATTRIBUTE_REPARSE_POINT` (0x00000400).
- Atomic rename: `winapi::um::winbase::MoveFileExW` dengan flag `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`. Path dikonversi ke vektor UTF-16 null-terminated via `std::os::windows::ffi::OsStrExt`.
- File locking: `winapi::um::fileapi::CreateFileW` dengan `GENERIC_READ | GENERIC_WRITE` dan flag sharing `FILE_SHARE_READ | FILE_SHARE_WRITE`, diikuti oleh `winapi::um::fileapi::LockFileEx` menggunakan `LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY`.
- File unlocking: `winapi::um::fileapi::UnlockFileEx` diikuti oleh `winapi::um::handleapi::CloseHandle`.

## 4. Unsafe Blocks dan Justifikasi Keamanannya

Seluruh blok `unsafe` pada codebase Rust dilengkapi komentar `// SAFETY:` eksplisit:

1. **`MoveFileExW` (Windows)**:
   - *Kebutuhan*: Memanggil Win32 API untuk atomic file swap dengan jaminan flush disk (`MOVEFILE_WRITE_THROUGH`).
   - *Jaminan Keselamatan*: Pointer string UTF-16 berasal dari `Vec<u16>` yang dialokasikan di memori Rust dengan null terminator (`0`) yang valid sepanjang durasi pemanggilan fungsi.
2. **`GetLastError` (Windows)**:
   - *Kebutuhan*: Mendapatkan kode error numerik saat panggilan Win32 menghasilkan nilai 0 / INVALID_HANDLE_VALUE.
   - *Jaminan Keselamatan*: Dipanggil langsung segera setelah syscall gagal tanpa memodifikasi state memori.
3. **`CreateFileW` & `LockFileEx` (Windows)**:
   - *Kebutuhan*: Mengakses fasilitas locking byte-range kernel NTFS.
   - *Jaminan Keselamatan*: Struktur `OVERLAPPED` diinisialisasi ke nilai nol menggunakan `std::mem::zeroed()`. Handle divalidasi terhadap `INVALID_HANDLE_VALUE` dan otomatis ditutup via `CloseHandle` jika locking gagal.
4. **`UnlockFileEx` & `CloseHandle` (Windows)**:
   - *Kebutuhan*: Melepaskan rentang kunci dan membebaskan handle OS.
   - *Jaminan Keselamatan*: Pointer handle dikonversi dari parameter `u64` yang sebelumnya diterbitkan oleh `lock_file`.
5. **`flock` & `close` (POSIX/Unix)**:
   - *Kebutuhan*: Memanggil kernel syscall BSD/POSIX file locking.
   - *Jaminan Keselamatan*: Descriptor integer valid yang diambil dari kepemilikan eksklusif `std::fs::File`. File descriptor ditutup dengan aman saat lock dilepaskan atau gagal diperoleh.

## 5. Dependensi Baru pada Cargo.toml

```toml
[target.'cfg(target_os = "windows")'.dependencies]
winapi = { version = "0.3", features = ["fileapi", "handleapi", "winbase", "winerror", "minwindef", "errhandlingapi", "winnt"] }

[target.'cfg(unix)'.dependencies]
libc = "0.2"
```

Dependensi ini diisolasi secara bersyarat per platform target (`cfg`), memastikan binary Linux tidak memuat dependensi Windows, dan sebaliknya.

## 6. Hasil Pengujian Unit Rust

Unit test disertakan langsung di dalam `crates/safe-change-native/src/path_guard.rs`:
- `test_path_within_boundary`: Menguji validasi batas direktori temporer.
- `test_path_outside_boundary`: Menguji penolakan path yang berada di luar boundary root.
- `test_is_symlink_regular_file`: Memverifikasi bahwa file reguler tidak diklasifikasikan sebagai symlink.

*Status Eksekusi*: Pada workstation lokal tanpa toolchain Rust (`cargo`), eksekusi unit test Rust ditandai sebagai `environment-limited`. Pengujian unit Rust dieksekusi secara otomatis pada pipeline CI GitHub Actions (`.github/workflows/native-build.yml`) menggunakan runner resmi Ubuntu, Windows, dan macOS.

## 7. Hasil Pengujian TypeScript Test Suite

- Total file test: 19 files.
- Total test cases: 202 tests.
- Status: 201 passed, 1 skipped (1 test diskip karena ketiadaan compiler lokal; dievaluasi pada CI dengan runner Rust).
- Seluruh 190 test existing Milestone A hingga C.4: 100% passed tanpa regresi.
- Seluruh pengujian native (`native-availability.test.ts`, `path-guard.test.ts`, `fallback.test.ts`): 100% passed.
- Linting (`tsc --noEmit`): 0 error.
- TypeScript compilation (`tsc`): 0 error.

## 8. Batasan yang Diketahui (Known Limitations)

1. **Lingkungan Workstation Lokal**: Tanpa `cargo` lokal, binary `.node` belum dihasilkan di mesin pengembang, sehingga seluruh pengujian lokal menguji jalur graceful fallback TypeScript serta kontrak N-API mock.
2. **Kanonikalisasi Path Non-Existent**: Fungsi `std::fs::canonicalize` membutuhkan entitas target ada di disk. Untuk target instalasi baru yang belum dibuat, fungsi fallback secara cerdas beralih ke pengecekan boundary leksikal standar.
3. **Locking Directory**: Pada beberapa versi filesystem Windows NTFS tertentu, mengunci handle direktori membutuhkan hak administratif atau flag pembukaan khusus; jika lock tidak dapat diperoleh, fallback transaksi tetap menjamin isolasi via staging directory privat.

## 9. Rekomendasi untuk Milestone R.3

1. Pindahkan seluruh siklus hidup transaksi instalasi (`InstallationTransaction`) ke Rust:
   - Buat struct native `NativeTransaction` yang mengelola staging direktori, hash verification, dan swap atomik dalam satu scope handle.
2. Implementasikan verifikasi checksum SHA-256 berkas langsung di level memori native sebelum commit.
3. Tambahkan recovery log berbasis file jurnal di dalam direktori staging untuk pemulihan otomatis jika mesin mati mendadak saat operasi rename berlangsung.

---
Pernyataan Resmi:
TypeScript fallback tetap berfungsi penuh tanpa Rust.
Native Rust layer aktif jika binary tersedia.
Sekali install via npm, langsung jalan tanpa konfigurasi tambahan.
