# BTMEDYA Gmail haber alımı

## Amaç

`busetuncay74@gmail.com` gelen kutusundan seçilen Balıkesir haber adayları, Gmail erişim bilgileri Worker'a taşınmadan BTMEDYA'nın editoryal kuyruğuna alınır.

## Mimari

- Gmail/MCP veya Google Apps Script yalnızca read-only okuma köprüsüdür.
- Cloudflare Worker Gmail OAuth tokenı tutmaz.
- Köprü, `/api/integrations/gmail/news` uç noktasına imzalı JSON gönderir.
- Worker mesaj kimliği ve nonce ile tekrar oynatmayı engeller.
- Balıkesir/ilçe ilgisi olmayan iletiler yok sayılır.
- Kamuya açık kaynak URL'si yoksa ileti `needs_source` durumunda kalır; editör kaynak URL'sini eklemeden yayınlanmaz.
- Kaynak URL'si olan adaylar `news_intelligence` tablosuna `source_tier=gmail` olarak alınır.
- Mevcut autopilot ve 08:00 Sabah Masası kalite, hassas konu, kaynak ve medya kapılarını uygular.
- Gmail kaynağı varsayılan olarak otomatik yayınlanmaz; admin panelinden manuel düzenleme ve onay gerekir.

## İleti sözleşmesi

```json
{
  "messages": [{
    "provider_message_id": "gmail-message-id",
    "thread_id": "gmail-thread-id",
    "mailbox": "busetuncay74@gmail.com",
    "sender": "Balıkesir Tv <leventozenc@gmail.com>",
    "subject": "Haber başlığı",
    "received_at": "2026-10-20T10:21:00Z",
    "body_text": "Temizlenmiş haber gövdesi",
    "source_urls": ["https://kurum.example/haber"]
  }]
}
```

Başlık ve gövde içinde Balıkesir veya ilçe adı aranır. `source_urls` alanı yoksa gövdedeki `http(s)` bağlantıları çıkarılır.

## HMAC

İstek başlıkları:

- `X-Btmedya-Timestamp`: Unix saniyesi
- `X-Btmedya-Nonce`: her istek için benzersiz değer
- `X-Btmedya-Signature`: `sha256=` + Base64URL(HMAC-SHA256(`timestamp.nonce.raw_body`))

Secret yalnız Cloudflare Worker Secret olarak `GMAIL_INGEST_SECRET` adıyla tutulur. Secret, Gmail OAuth/refresh tokenı değildir.

## Admin

- `GET /api/admin/gmail/messages` yalnız imzalı admin oturumu ile çalışır.
- Panel yolu: `/admin/autopilot/`
- Gmail adayları burada görülür; tam metin public API ile döndürülmez.
- Yayın öncesi kaynak, başlık, spot, gövde, kapak, alt metin ve SEO alanları editörde kontrol edilir.

## Canlıya alma kapıları

1. `0031_gmail_ingest.sql` uzak D1'e uygulanır.
2. `GMAIL_INGEST_SECRET` Worker Secret olarak eklenir.
3. Gmail bridge read-only yetkiyle kurulup HMAC isteği test edilir.
4. İmzasız, eski imzalı ve tekrar istekler reddedilir.
5. Aynı `provider_message_id` ikinci haber oluşturmaz.
6. Public `/api/news` ham Gmail gövdesini döndürmez.
7. Kaynak URL'siz Gmail adayı yayınlanamaz.
