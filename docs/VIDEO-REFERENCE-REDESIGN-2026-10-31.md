# BTMEDYA video referanslı ana sayfa tasarımı

**Tarih:** 31 Ekim 2026  
**Kapsam:** Ana sayfa görsel katmanı; mevcut içerik, CMS, rotalar ve medya kaynakları korunur.

## Tasarım yönü

Kullanıcının sağladığı video/görsel referanstaki koyu ekran, tek sıcak vurgu rengi, büyük beyaz tipografi ve sade ürün-sahne hissi ana sayfaya taşındı. Yeni katman; kömür siyahı/antrasit zemin, sıcak turuncu sinyal rengi, daha az neon, düşük yoğunluklu hareket ve keskin editoryal modüller kullanır.

## Uygulanan değişiklikler

- `public/video-reference-v1.css` eklendi ve ana sayfada son override katmanı olarak bağlandı.
- Hero alanına turuncu yıldız patlaması/radial sinyal motifi ve dikey editoryal etiket eklendi.
- Önceki mavi, cyan ve lime vurgular ana sayfa kapsamında sıcak turuncu palete çekildi.
- Kart ve modüllerdeki büyük yuvarlak köşeler azaltılarak referanstaki ekran/frame hissi güçlendirildi.
- Haber, hizmet, portföy, AI LAB, durum bandı ve ticker yüzeyleri aynı kömür-antrasit sistemde hizalandı.
- Mobilde safe-area, mevcut içerik akışı ve reduced-motion davranışı korunarak hero ve kartlar sadeleştirildi.
- Yeni rota, yeni haber, yeni görsel veya uydurma içerik eklenmedi.

## Korunan sözleşmeler

Mevcut `/haberler/`, `/hizmetler/`, `/sosyal-medya/`, `/video-produksiyon/`, `/admin/` ve diğer rotalar; CMS bağlantıları, SEO metadata, haber slug'ları, gerçek medya kaynakları ve admin güvenlik akışı değiştirilmedi.
