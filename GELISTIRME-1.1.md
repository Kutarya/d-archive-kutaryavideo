# Kutarya Video 1.1.0 geliştirme ve kabul planı

1. Mevcut 1.0.0 kodu, YouTube bağlantı doğrulaması, yt-dlp/Deno/FFmpeg, sıralı
   kuyruk, MP4, iptal/devam ve sandbox IPC korunarak ilerlenir.
2. Tek isim/link alanı: yapıştırılan geçerli link otomatik iner; isim Enter veya
   Video bul ile altı gerçek YouTube sonucu getirir. Başlık/kanal/süre/kapakla
   seçilen video İndir düğmesinden aynı kuyruğa eklenir. Arama iptal edilebilir.
3. Yerel ayarlarda klasör ve tema saklanır. Her iş kendi kayıt klasörünü taşır;
   klasör değişince mevcut iş/önceki videoyu açma bozulmaz. Sistem klasör seçicisi
   iptali mevcut seçimi korur. Açık/koyu/canlı/sistem temaları Türkçedir.
4. Ana ekranda yalnız kuyruk ve son tamamlanan indirme görünür. Geçmiş ayrı
   sekmede 20 kayıtlık sayfalıdır; tek kayıt ve tüm bitmiş kayıtlar temizlenir.
   Temizleme video dosyalarını silmez ve etkin kuyruğa dokunmaz.
5. Her uygulama açılışında sabit HTTPS gamesService kamu kataloğundaki
   kutarya-video sürümü karşılaştırılır. Yeni sürüm uygulama içi bildirim ve
   desteklenirse Windows bildirimi gösterir; sitedeki sabit proje sayfasını açar.
   Ağ hatası indirmeyi engellemez. Otomatik kurulum/ücretli API gerekmez.
6. Çekirdek kabul: eski geçmiş göçü, klasör değişirken indirme/önceki açma,
   temizleme sırasında kuyruk, arama normalizasyonu/iptal/ağ hatası, sürüm
   karşılaştırması/yeni-güncel-çevrimdışı durumları ve ayar kalıcılığı.
7. Gerçek Electron kabulü: sandbox IPC, isimle gerçek arama ve sonuç seçerek
   YouTube MP4 video+ses indirmesi, yapıştırma, pencere daraltma, dört tema,
   geçmiş sayfalama/temizleme, açılışta kontrol, ayrı profil yeniden açma.
   Gerçek ekranlar incelenir. Portable ve Setup payload'ı kaynak/motor SHA eşleşir.
8. Sitede 1.1.0 Setup/portable, gerçek ekranlar ve doğru açıklama/sürüm notu
   mevcut admin/Storage hattından yayımlanır; eski 1.0 dosyaları korunur.
   Hedef kutarya-ai-3169 / kutarya.com, gamesService europe-west1, Storage
   US-EAST1; PC sunucusu yok. Mevcut ücretli Firebase'de depolama/trafik maliyeti
   vardır. Kurallar/Auth/servisler ve diğer kataloglar öncesi/sonrası doğrulanır.
   Site check/build, SEO Hosting helper ve gerçek HTTPS/İndir SHA kabulü yapılır.

10 Ekim sonucu:1.1.0 geliştirildi ve yayımlandı.22 çekirdek, geliştirme/
unpacked/gerçek portable30 kontrol, Setup payload SHA ve site58/build geçti.
Gerçek arama/sonuç seçimi geçti; YouTube429/bot doğrulaması yüzünden gerçek
MP4 video+ses indirmesi tamamlanmadı, başarı sayılmadı. Windows chooser/OS
bildirimi/kurulum-kaldırma ayrıca ölçülmedi. Güncel kanıt ve sınırlar DEVIR.md
ile web docs/KUTARYA-VIDEO-1.1-YAYIN.md içinde; bu plan geçmiş kabulü değiştirmez.
