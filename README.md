# TEKE TEK

**TEKE TEK**, beş kurgusal karakterin karşı karşıya geldiği, çizgi film tarzında görsellere ve mizahi anlatıma sahip 2D tarayıcı dövüş oyunudur.

Oyuncu karakterini seçer, diğer karakterlerden biri rastgele rakip olarak belirlenir ve arenada yumruklarını konuşturur.

## Özellikler

- Beş oynanabilir karakter: Türk, Kürt, Azeri, İngiliz ve Fransız.
- Tek oyunculu dövüş sistemi.
- Rastgele rakip seçimi.
- Canvas tabanlı 2D arena.
- Yumruk, hasar ve geri savrulma mekanikleri.
- Rakip hareket ve saldırı sistemi.
- Can göstergeleri ve maç sonu ekranı.
- Masaüstü klavye kontrolleri.
- Mobil dokunmatik kontroller.
- PWA desteği.

## Kontroller

| İşlem | Kontrol |
|---|---|
| Hareket | W, A, S, D veya ok tuşları |
| Yumruk | Space |
| Duraklatma | Esc veya P |
| Ses açma/kapatma | M |

Mobil cihazlarda ekrandaki yön kontrolünü ve yumruk butonunu kullanabilirsiniz.

## Kullanılan Teknolojiler

- React 19
- TypeScript
- Vite
- HTML Canvas
- Tailwind CSS

## Kurulum

Node.js 22.12 veya üzeri gereklidir.

```bash
git clone https://github.com/ccanyilmaz/teke-tek.git
cd teke-tek
npm install
npm run dev
```

## Üretim Derlemesi

```bash
npm run build
```

Derleme çıktısı `dist/` klasörüne oluşturulur.

## Proje Yapısı

```text
src/
├── components/
├── game/
├── hooks/
├── App.tsx
├── index.css
└── main.tsx
```

## Geliştirme Durumu

TEKE TEK aktif olarak geliştirilen bir projedir. Yeni karakterler, mekanikler ve özellikler ilerleyen sürümlerde eklenebilir.

---

**TEKE TEK — Farklı karakterler, aynı arena.**
