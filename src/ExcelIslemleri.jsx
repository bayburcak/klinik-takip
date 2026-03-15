import { useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";

const vki = (boy, kilo) => boy && kilo ? (kilo / ((boy / 100) ** 2)).toFixed(1) : null;
const ewl = (onc, mev, boy) => {
  const ideal = Math.round((boy - 100) * 0.9);
  const fazla = onc - ideal;
  return fazla > 0 ? (((onc - mev) / fazla) * 100).toFixed(1) : null;
};

export default function ExcelIslemleri({ hastalar, onYuklendi, showMesaj }) {
  const fileRef = useRef();

  // ─── EXCEL'E AKTAR ───────────────────────────────────────
  const excelAktar = () => {
    const wb = XLSX.utils.book_new();

    // Sekme 1: Hastalar
    const hastaRows = hastalar.map(h => ({
      "Ad": h.ad,
      "Soyad": h.soyad,
      "Doğum Tarihi": h.dogum_tarihi || "",
      "Telefon": h.tel || "",
      "Boy (cm)": h.boy || "",
      "Ameliyat Öncesi Kilo (kg)": h.ameliyat_oncesi_kilo || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hastaRows), "Hastalar");

    // Sekme 2: Ameliyatlar
    const ameliyatRows = hastalar.flatMap(h =>
      (h.ameliyatlar || []).map(a => ({
        "Hasta Adı": `${h.ad} ${h.soyad}`,
        "Ameliyat Türü": a.tur,
        "Tarih": a.tarih,
        "Cerrah": a.cerrah || "",
        "Notlar": a.notlar || "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ameliyatRows.length ? ameliyatRows : [{}]), "Ameliyatlar");

    // Sekme 3: Kilo Takip
    const kiloRows = hastalar.flatMap(h =>
      (h.kiloTakip || []).map(k => ({
        "Hasta Adı": `${h.ad} ${h.soyad}`,
        "Kontrol": k.kontrol_adi || k.kontrolAdi,
        "Tarih": k.tarih,
        "Kilo (kg)": k.kilo,
        "VKİ": h.boy ? vki(h.boy, k.kilo) : "",
        "EWL %": h.ameliyat_oncesi_kilo && h.boy ? ewl(h.ameliyat_oncesi_kilo, k.kilo, h.boy) : "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kiloRows.length ? kiloRows : [{}]), "Kilo Takip");

    XLSX.writeFile(wb, `klinik_veriler_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "-")}.xlsx`);
    showMesaj("✅ Excel dosyası indirildi!");
  };

  // ─── ŞABLON İNDİR ────────────────────────────────────────
  const sablonIndir = () => {
    const wb = XLSX.utils.book_new();

    const hastaOrnek = [{
      "Ad": "Ayşe", "Soyad": "Yılmaz", "Doğum Tarihi": "1990-01-15",
      "Telefon": "0532 111 2233", "Boy (cm)": 165, "Ameliyat Öncesi Kilo (kg)": 112,
      "Ameliyat Türü": "Sleeve Gastrektomi", "Ameliyat Tarihi": "2025-03-01", "Cerrah": "Op. Dr. Ahmet"
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hastaOrnek), "Hastalar");

    const kiloOrnek = [{
      "Hasta Adı (Ad Soyad)": "Ayşe Yılmaz", "Kontrol": "1. Ay",
      "Tarih": "2025-04-01", "Kilo (kg)": 98
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kiloOrnek), "Kilo Takip");

    XLSX.writeFile(wb, "klinik_sablon.xlsx");
    showMesaj("✅ Şablon indirildi!");
  };

  // ─── EXCEL'DEN İÇE AKTAR ─────────────────────────────────
  const excelOku = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showMesaj("⏳ Veriler yükleniyor...");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });

        // Hastalar sekmesi
        const hastaSheet = wb.Sheets["Hastalar"];
        if (!hastaSheet) return showMesaj("❌ 'Hastalar' sekmesi bulunamadı!");
        const hastaData = XLSX.utils.sheet_to_json(hastaSheet);

        let eklenenHasta = 0;
        let eklenenAmeliyat = 0;
        let eklenenKilo = 0;

        for (const row of hastaData) {
          const ad = row["Ad"]?.toString().trim();
          const soyad = row["Soyad"]?.toString().trim();
          if (!ad || !soyad) continue;

          // Hasta ekle
          const { data: yeniHasta, error } = await supabase.from("hastalar").insert({
            ad,
            soyad,
            yas: row["Doğum Tarihi"] ? new Date().getFullYear() - new Date(row["Doğum Tarihi"]).getFullYear() : null,
dogum_tarihi: row["Doğum Tarihi"] ? row["Doğum Tarihi"].toString() : null,
            tel: row["Telefon"]?.toString() || null,
            boy: row["Boy (cm)"] ? Number(row["Boy (cm)"]) : null,
            ameliyat_oncesi_kilo: row["Ameliyat Öncesi Kilo (kg)"] ? Number(row["Ameliyat Öncesi Kilo (kg)"]) : null,
          }).select().single();

          if (error || !yeniHasta) continue;
          eklenenHasta++;

          // Ameliyat bilgisi aynı satırda varsa ekle
          if (row["Ameliyat Türü"] && row["Ameliyat Tarihi"]) {
            await supabase.from("ameliyatlar").insert({
              hasta_id: yeniHasta.id,
              tur: row["Ameliyat Türü"].toString(),
              tarih: row["Ameliyat Tarihi"].toString(),
              cerrah: row["Cerrah"]?.toString() || null,
              notlar: null,
            });
            eklenenAmeliyat++;
          }
        }

        // Kilo Takip sekmesi
        const kiloSheet = wb.Sheets["Kilo Takip"];
        if (kiloSheet) {
          const kiloData = XLSX.utils.sheet_to_json(kiloSheet);
          for (const row of kiloData) {
            const hastaAd = row["Hasta Adı (Ad Soyad)"]?.toString().trim();
            if (!hastaAd) continue;
            const [ad, ...soyadArr] = hastaAd.split(" ");
            const soyad = soyadArr.join(" ");
            const { data: hasta } = await supabase.from("hastalar").select("id").eq("ad", ad).eq("soyad", soyad).single();
            if (!hasta) continue;
            await supabase.from("kilo_takip").insert({
              hasta_id: hasta.id,
              kontrol_adi: row["Kontrol"]?.toString() || "",
              tarih: row["Tarih"]?.toString(),
              kilo: Number(row["Kilo (kg)"]),
            });
            eklenenKilo++;
          }
        }

        await onYuklendi();
        showMesaj(`✅ ${eklenenHasta} hasta, ${eklenenAmeliyat} ameliyat, ${eklenenKilo} kilo kaydı eklendi!`);
      } catch (err) {
        showMesaj("❌ Dosya okunamadı, şablonu kullandığınızdan emin olun.");
      }
    };
    reader.readAsBinaryString(file);
    fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Açıklama */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <h3 className="font-semibold text-blue-700 mb-2">📊 Excel İşlemleri</h3>
        <p className="text-sm text-blue-600">Mevcut hastalarınızı Excel'e aktarabilir, ya da Excel şablonunu doldurup sisteme toplu yükleyebilirsiniz.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Aktar */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center gap-4">
          <div className="text-4xl">📤</div>
          <div>
            <h3 className="font-semibold text-gray-800">Verileri Dışa Aktar</h3>
            <p className="text-xs text-gray-400 mt-1">Tüm hasta, ameliyat ve kilo verilerini Excel'e indir</p>
          </div>
          <button onClick={excelAktar} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
            ⬇️ Excel'e Aktar
          </button>
        </div>

        {/* Şablon */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center gap-4">
          <div className="text-4xl">📋</div>
          <div>
            <h3 className="font-semibold text-gray-800">Şablon İndir</h3>
            <p className="text-xs text-gray-400 mt-1">Boş şablonu indirin, doldurun ve sisteme yükleyin</p>
          </div>
          <button onClick={sablonIndir} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
            ⬇️ Şablon İndir
          </button>
        </div>

        {/* İçe Aktar */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center gap-4">
          <div className="text-4xl">📥</div>
          <div>
            <h3 className="font-semibold text-gray-800">Veri Yükle</h3>
            <p className="text-xs text-gray-400 mt-1">Doldurduğunuz şablonu seçin, veriler otomatik aktarılır</p>
          </div>
          <button onClick={() => fileRef.current.click()} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
            ⬆️ Excel Yükle
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={excelOku} />
        </div>
      </div>

      {/* Uyarı */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
        <p className="text-xs text-yellow-700">
          ⚠️ <strong>Önemli:</strong> Excel'den yüklemeden önce mutlaka şablonu indirin ve o formatta doldurun. Farklı formatlarda yükleme hatalara yol açabilir. Aynı hasta iki kez yüklenirse sistemde tekrar oluşur.
        </p>
      </div>
    </div>
  );
}