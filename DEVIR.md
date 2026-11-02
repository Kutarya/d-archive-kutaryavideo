# Kutarya Video — devir kaydı

## 10 Ekim 2026 — 1.1.0 geliştirme

- Kullanıcı açılışta yeni uygulama sürümü bildirimi, seçilebilir kayıt klasörü,
  temizlenebilir/kısa geçmiş, video adıyla arama, sade canlı renkler ve temalar
  istedi. Bitmiş sürümü sitede yayımlama talimatı bu kapsam için verilmiştir.
- Eski D:/KutaryaVideo kaynak klasörü yoktu. Mevcut web artifacts klasöründeki
  SHA doğrulanmış 1.0.0 portable EXE'den uygulama kaynakları ve motorlar çıkarıldı.
  Kurtarilan-1.0.0 referans kopyasıdır; kaynak/electron ve kaynak/ui mevcut kodun
  devamıdır. Orijinal sitedeki EXE'ler, geçmiş veya kişisel videolar değiştirilmez.
- Ayrıntılı çalışma/kabul planı GELISTIRME-1.1.md. Yayın öncesi yeni gerçek
  arama/indirme, bağımsız profil, paket içeriği ve web kabulü ölçümleri aşağıda.
- Testler yalnız Kanitlar altındaki ayrı profil/video klasörlerinde. Kurulum
  çalıştırılmaz, açık eski uygulama veya kullanıcı verisi değiştirilmez. Port yok.
- 1.0.0 uygulama sürüm bildirimi içermez; yeni bildirim 1.1.0 yüklendikten sonra
  sonraki yayımlanan sürümler için çalışır. Motor güncellemesi uygulama sürümünden ayrıdır.

## 10 Ekim 2026 — 1.1.0 paket ve site teslimi

- Tek video adı/link alanı, altı gerçek YouTube arama sonucu ve seçimle indirme;
  kalıcı klasör, her işte ayrı downloadDir, açık/koyu/canlı/sistem temaları.
  Ana ekran etkin/son işler;20 satırlık sayfalı Geçmiş ve tek/toplu temizleme.
  Geçmiş temizliği video dosyasını veya etkin motor işini silmez.
- HTTPS kamu kataloğundan her açılışta uygulama sürüm kontrolü, kapatılabilir
  yeni sürüm bildirimi ve sabit kutarya.com proje sayfası; ağ hatası engellemez.
- kaynak/tests:22/22. Geliştirme/unpacked/gerçek portable:30/30.
  Kanitlar/{development-1791647750344,unpacked-1791648096321,
  portable-1791648303996}/. Seçici/gelecek bildirim yanıtları kontrollüdür;
  gerçek Windows chooser/OS bildirimi/kurulum-kaldırma ölçülmedi.
- Kanitlar/development-1791647768049: gerçek isim araması altı sonuç ve
  seçimle doğru klasörde kuyruk geçti. YouTube429/bot doğrulaması yüzünden
  tamamlanan gerçek indirme yok; ikinci video da engellendi. Eski1.0
  downloadArgs sözleşmesi aynı, bu eski başarı yeni gerçek kabul sayılmaz.
- Kanitlar/release-1.1.0.json:13 uygulama ve18 vendor dosyası paket SHA aynı;
  Setup93 dosyalı çıkarılan payload win-unpacked ile aynı. Setup çalıştırılmadı,
  NotSigned. AppId com.kutarya.video/executableName KutaryaVideo korunur.
  install-safe.nsh açık KutaryaVideo.exe veya Kutarya Video.exe varsa Abort;
  zorla kapatma yok. Portable Veriler/Videolar EXE yanında, kurulu profil
  AppData/Roaming/Kutarya Video; varsayılan İndirilenler/Kutarya Video/Videolar.
- Paketler/ ve kökte aynı SHA'lı1.1 Setup191940786 bayt, portable191783659 bayt.
  SHA'lar web artifacts/kutarya-video/1.1.0/paket-bilgisi-1.1.0.json içinde.
  Setup DEA049B17FFEF79C92159D383C907CD78AA892B81DF23425FAA532163E79F059;
  Portable9E37F6E29E53E0E462A893899C3B0D2E68EA588BE67DAA8DC1BB890FA2502B9E.
- https://kutarya.com/proje/kutarya-video yayımlandı; Hosting1de14f25e4536bb1.
  Yeni iki EXE/dört ekran tam bayt/SHA ile kontrol edildi; eski1.0 iki dosya
  korunur. Diğer11 proje, sekiz Functions, kurallar/Auth/admin/IAM aynı.
  Site58/build ve önizleme1280/390 geçti. Canlı24 HTML SHA/sitemap/robots/
  canonical, anonim admin401 ve Edge1280/390 kart/detay/dört görsel/Dosyalar/
  iki gerçek İndir düğmesi tam bayt/SHA geçti; renderer/taşma0.
  Canlı sürüm karşılaştırması1.1 güncel/1.0 girdisi için1.1 yeni geçti.
  Web kanıtı artifacts/releases/kutarya-video/1.1.0/live-acceptance.json,
  cloud-acceptance.json ve live-update-check.json.
- Aynı yayımlanmış sürüm paketini yeniden üretme; build.cjs production-upload
  kaydı varsa durur. scripts sıkıştırma varsayılanı3 sonraki sürümler içindir;
  yayımlanmış EXE değiştirilmedi. Ayrıntı web docs/KUTARYA-VIDEO-1.1-YAYIN.md.
  Kullanıcı profili/açık eski app değiştirilmedi; parola/secret/PC portu yok.
