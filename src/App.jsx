import ExcelIslemleri from "./ExcelIslemleri";
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";

const AMELIYAT_TURLERI = ["Sleeve Gastrektomi", "MGB", "Roux-en-Y", "Revizyon RnY", "Resleeve", "Diğer"];
const KONTROL_ADLARI = ["1. Ay", "3. Ay", "6. Ay", "9. Ay", "12. Ay", "18. Ay", "24. Ay"];
const BELGE_TURLERI = ["Kan Tahlili", "Görüntüleme (Röntgen/MR/USG)", "Ameliyat Raporu", "Diğer"];

const HATIRLATMA_KURALLARI = [
  { gun: 5,   ad: "İlk Hatırlatma" },
  { gun: 16,  ad: "İkinci Hatırlatma" },
  { gun: 23,  ad: "Üçüncü Hatırlatma" },
  { gun: 30,  ad: "1. Ay Hatırlatma" },
  { gun: 90,  ad: "3. Ay Hatırlatma" },
  { gun: 180, ad: "6. Ay Hatırlatma" },
  { gun: 270, ad: "9. Ay Hatırlatma" },
  { gun: 365, ad: "12. Ay Hatırlatma" },
];

const today = new Date(); today.setHours(0,0,0,0);
const todayStr = today.toISOString().split("T")[0];
const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split("T")[0];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function hatirlatmalariHesapla(hasta) {
  const sonuclar = [];
  (hasta.ameliyatlar || []).forEach(a => {
    HATIRLATMA_KURALLARI.forEach(k => {
      const hedefTarih = addDays(a.tarih, k.gun);
      sonuclar.push({
        id: `${a.id}-${k.gun}`,
        hastaId: hasta.id,
        hastaAd: `${hasta.ad} ${hasta.soyad}`,
        ameliyatTur: a.tur,
        ameliyatTarih: a.tarih,
        ad: k.ad,
        tarih: hedefTarih,
      });
    });
  });
  return sonuclar;
}

function tarihDurumu(tarih) {
  if (tarih === todayStr) return "bugun";
  if (tarih === tomorrowStr) return "yarin";
  if (tarih < todayStr) return "gecti";
  return "gelecek";
}

function formatTarih(str) {
  return new Date(str).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

const vki = (boy, kilo) => boy && kilo ? (kilo / ((boy / 100) ** 2)).toFixed(1) : null;
const ewl = (onc, mev, boy) => {
  const ideal = Math.round((boy - 100) * 0.9);
  const fazla = onc - ideal;
  return fazla > 0 ? (((onc - mev) / fazla) * 100).toFixed(1) : null;
};

function Badge({ children, color }) {
  const c = { blue: "bg-blue-100 text-blue-700", green: "bg-green-100 text-green-700", red: "bg-red-100 text-red-700", gray: "bg-gray-100 text-gray-600", purple: "bg-purple-100 text-purple-700", yellow: "bg-yellow-100 text-yellow-800", orange: "bg-orange-100 text-orange-700" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c[color] || c.gray}`}>{children}</span>;
}

function Input({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
      <input type={type} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || label} />
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function belgeIkonu(tur) {
  if (tur === "Kan Tahlili") return "🩸";
  if (tur === "Görüntüleme (Röntgen/MR/USG)") return "🫁";
  if (tur === "Ameliyat Raporu") return "📋";
  return "📄";
}
function belgeBadgeRengi(tur) {
  if (tur === "Kan Tahlili") return "red";
  if (tur === "Görüntüleme (Röntgen/MR/USG)") return "blue";
  if (tur === "Ameliyat Raporu") return "purple";
  return "gray";
}

export default function App() {
  const [girisYapildi, setGirisYapildi] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [hastalar, setHastalar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [seciliHasta, setSeciliHasta] = useState(null);
  const [detayTab, setDetayTab] = useState("bilgiler");
  const [aramaMetni, setAramaMetni] = useState("");
  const [sidebarAcik, setSidebarAcik] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const [silOnayModal, setSilOnayModal] = useState(null);
  const [manuelModal, setManuelModal] = useState(false);
  const [yeniManuel, setYeniManuel] = useState({ tarih: "", aciklama: "" });
  const [ameliyatModal, setAmeliyatModal] = useState(false);
  const [kiloModal, setKiloModal] = useState(false);
  const [randevuModal, setRandevuModal] = useState(false);
  const [belgeModal, setBelgeModal] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [dosyaYukleniyor, setDosyaYukleniyor] = useState(false);
  const fileRef = useRef();

  const [yeniHasta, setYeniHasta] = useState({ ad: "", soyad: "", dogumTarihi: "", tel: "", boy: "", ameliyatOncesiKilo: "" });
  const [yeniAmeliyat, setYeniAmeliyat] = useState({ tur: AMELIYAT_TURLERI[0], tarih: "", cerrah: "", notlar: "" });
  const [yeniKilo, setYeniKilo] = useState({ kontrolAdi: KONTROL_ADLARI[0], tarih: "", kilo: "" });
  const [yeniRandevu, setYeniRandevu] = useState({ tarih: "", saat: "", notlar: "" });
  const [yeniBelge, setYeniBelge] = useState({ tur: BELGE_TURLERI[0], aciklama: "", tarih: todayStr, dosyaAdi: "", dataUrl: "", dosyaTipi: "" });

  const showMesaj = m => { setMesaj(m); setTimeout(() => setMesaj(""), 2800); };

  // Tüm verileri yükle
  const veriYukle = async () => {
    setYukleniyor(true);
    try {
      const { data: hastaData } = await supabase.from("hastalar").select("*").order("id");
      const { data: ameliyatData } = await supabase.from("ameliyatlar").select("*").order("tarih");
      const { data: kiloData } = await supabase.from("kilo_takip").select("*").order("tarih");
      const { data: randevuData } = await supabase.from("randevular").select("*").order("tarih");
      const { data: manuelData } = await supabase.from("manuel_hatirlatmalar").select("*").order("tarih");
      const { data: belgeData } = await supabase.from("belgeler").select("*").order("tarih");

      const birlesik = (hastaData || []).map(h => ({
        ...h,
        ameliyatOncesiKilo: h.ameliyat_oncesi_kilo,
        ameliyatlar: (ameliyatData || []).filter(a => a.hasta_id === h.id),
        kiloTakip: (kiloData || []).filter(k => k.hasta_id === h.id).map(k => ({ ...k, kontrolAdi: k.kontrol_adi })),
        randevular: (randevuData || []).filter(r => r.hasta_id === h.id),
        manuelHatirlatmalar: (manuelData || []).filter(m => m.hasta_id === h.id).map(m => ({ ...m, not: m.aciklama })),
        belgeler: (belgeData || []).filter(b => b.hasta_id === h.id).map(b => ({ ...b, dosyaAdi: b.dosya_adi, dataUrl: b.dosya_url, dosyaTipi: b.dosya_tipi })),
      }));
      setHastalar(birlesik);
    } catch (e) {
      showMesaj("⚠️ Veriler yüklenemedi!");
    }
    setYukleniyor(false);
  };

  useEffect(() => { veriYukle(); }, []);
  if (!girisYapildi) return <Login onGiris={() => setGirisYapildi(true)} />;

  const hastaDetay = h => { setSeciliHasta(h); setDetayTab("bilgiler"); setPage("detay"); };

  const refreshSeciliHasta = (yeniHastalar, id) => {
    const yeni = yeniHastalar.find(h => h.id === id);
    if (yeni) setSeciliHasta(yeni);
  };


  // Hasta ekle
  const hastaEkle = async () => {
    if (!yeniHasta.ad || !yeniHasta.soyad || !yeniHasta.tc) return showMesaj("Ad, soyad ve TC zorunludur!");
    const { error } = await supabase.from("hastalar").insert({
      ad: yeniHasta.ad, soyad: yeniHasta.soyad, yas: yeniHasta.dogumTarihi ? new Date().getFullYear() - new Date(yeniHasta.dogumTarihi).getFullYear() : null,
dogum_tarihi: yeniHasta.dogumTarihi,
      tc: yeniHasta.tc, tel: yeniHasta.tel, kan: yeniHasta.kan,
      boy: Number(yeniHasta.boy), ameliyat_oncesi_kilo: Number(yeniHasta.ameliyatOncesiKilo)
    });
    if (error) return showMesaj("⚠️ Hasta eklenemedi!");
    setYeniHasta({ ad: "", soyad: "", yas: "", tc: "", tel: "", kan: "", boy: "", ameliyatOncesiKilo: "" });
    await veriYukle();
    showMesaj("✅ Hasta eklendi!"); setPage("hastalar");
  };

  // Hasta sil
  const hastaSil = async id => {
    await supabase.from("hastalar").delete().eq("id", id);
    await veriYukle();
    setPage("hastalar"); setSilOnayModal(null); showMesaj("🗑️ Hasta silindi.");
  };

  // Ameliyat ekle
  const ameliyatEkle = async () => {
    if (!yeniAmeliyat.tarih) return showMesaj("Tarih zorunludur!");
    await supabase.from("ameliyatlar").insert({ hasta_id: seciliHasta.id, tur: yeniAmeliyat.tur, tarih: yeniAmeliyat.tarih, cerrah: yeniAmeliyat.cerrah, notlar: yeniAmeliyat.notlar });
    setYeniAmeliyat({ tur: AMELIYAT_TURLERI[0], tarih: "", cerrah: "", notlar: "" });
    await veriYukle(); refreshSeciliHasta(hastalar, seciliHasta.id);
    setAmeliyatModal(false); showMesaj("✅ Ameliyat kaydedildi!");
    await veriYukle();
  };

  // Ameliyat sil
  const ameliyatSil = async id => {
    await supabase.from("ameliyatlar").delete().eq("id", id);
    await veriYukle(); setSilOnayModal(null); showMesaj("🗑️ Kayıt silindi.");
  };

  // Kilo ekle
  const kiloEkle = async () => {
    if (!yeniKilo.tarih || !yeniKilo.kilo) return showMesaj("Tarih ve kilo zorunludur!");
    await supabase.from("kilo_takip").insert({ hasta_id: seciliHasta.id, kontrol_adi: yeniKilo.kontrolAdi, tarih: yeniKilo.tarih, kilo: Number(yeniKilo.kilo) });
    setYeniKilo({ kontrolAdi: KONTROL_ADLARI[0], tarih: "", kilo: "" });
    await veriYukle(); setKiloModal(false); showMesaj("✅ Kilo takibi eklendi!");
  };

  // Kilo sil
  const kiloSil = async id => {
    await supabase.from("kilo_takip").delete().eq("id", id);
    await veriYukle(); setSilOnayModal(null); showMesaj("🗑️ Kayıt silindi.");
  };

  // Randevu ekle
  const randevuEkle = async () => {
    if (!yeniRandevu.tarih || !yeniRandevu.saat) return showMesaj("Tarih ve saat zorunludur!");
    await supabase.from("randevular").insert({ hasta_id: seciliHasta.id, tarih: yeniRandevu.tarih, saat: yeniRandevu.saat, notlar: yeniRandevu.notlar });
    setYeniRandevu({ tarih: "", saat: "", notlar: "" });
    await veriYukle(); setRandevuModal(false); showMesaj("✅ Randevu eklendi!");
  };

  // Randevu sil
  const randevuSil = async id => {
    await supabase.from("randevular").delete().eq("id", id);
    await veriYukle(); setSilOnayModal(null); showMesaj("🗑️ Kayıt silindi.");
  };

  // Manuel hatırlatıcı ekle
  const manuelEkle = async () => {
    if (!yeniManuel.tarih || !yeniManuel.aciklama) return showMesaj("Tarih ve not zorunludur!");
    await supabase.from("manuel_hatirlatmalar").insert({ hasta_id: seciliHasta.id, tarih: yeniManuel.tarih, aciklama: yeniManuel.aciklama });
    setYeniManuel({ tarih: "", aciklama: "" });
    await veriYukle(); setManuelModal(false); showMesaj("✅ Hatırlatıcı eklendi!");
  };

  // Manuel hatırlatıcı sil
  const manuelSil = async id => {
    await supabase.from("manuel_hatirlatmalar").delete().eq("id", id);
    await veriYukle(); setSilOnayModal(null); showMesaj("🗑️ Kayıt silindi.");
  };

  // Belge ekle
  const dosyaSec = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showMesaj("❌ Dosya 5MB'dan küçük olmalı!");
    setDosyaYukleniyor(true);
    const reader = new FileReader();
    reader.onload = ev => { setYeniBelge(b => ({ ...b, dosyaAdi: file.name, dataUrl: ev.target.result, dosyaTipi: file.type })); setDosyaYukleniyor(false); };
    reader.readAsDataURL(file);
  };

  const belgeEkle = async () => {
    if (!yeniBelge.dosyaAdi) return showMesaj("Lütfen bir dosya seçin!");
    await supabase.from("belgeler").insert({
      hasta_id: seciliHasta.id, tur: yeniBelge.tur, aciklama: yeniBelge.aciklama,
      tarih: yeniBelge.tarih, dosya_adi: yeniBelge.dosyaAdi,
      dosya_url: yeniBelge.dataUrl, dosya_tipi: yeniBelge.dosyaTipi
    });
    setYeniBelge({ tur: BELGE_TURLERI[0], aciklama: "", tarih: todayStr, dosyaAdi: "", dataUrl: "", dosyaTipi: "" });
    if (fileRef.current) fileRef.current.value = "";
    await veriYukle(); setBelgeModal(false); showMesaj("✅ Belge yüklendi!");
  };

  // Belge sil
  const belgeSil = async id => {
    await supabase.from("belgeler").delete().eq("id", id);
    await veriYukle(); setSilOnayModal(null); showMesaj("🗑️ Belge silindi.");
  };

  // Silme onayı işle
  const silmeOnayla = async () => {
    const { tur, id } = silOnayModal;
    if (tur === "hasta") await hastaSil(id);
    else if (tur === "ameliyat") await ameliyatSil(id);
    else if (tur === "kilo") await kiloSil(id);
    else if (tur === "randevu") await randevuSil(id);
    else if (tur === "manuel") await manuelSil(id);
    else if (tur === "belge") await belgeSil(id);
  };

  // Güncel seciliHasta'yı hastalar listesinden al
  const aktifHasta = seciliHasta ? hastalar.find(h => h.id === seciliHasta.id) || seciliHasta : null;

  const tumOtomatikHatirlatmalar = hastalar.flatMap(h => hatirlatmalariHesapla(h));
  const bugunOtomatik = tumOtomatikHatirlatmalar.filter(h => h.tarih === todayStr);
  const yarinOtomatik = tumOtomatikHatirlatmalar.filter(h => h.tarih === tomorrowStr);
  const bugunManuel = hastalar.flatMap(h => (h.manuelHatirlatmalar || []).filter(m => m.tarih === todayStr).map(m => ({ ...m, hastaAd: `${h.ad} ${h.soyad}`, hastaId: h.id, tip: "manuel" })));
  const yarinManuel = hastalar.flatMap(h => (h.manuelHatirlatmalar || []).filter(m => m.tarih === tomorrowStr).map(m => ({ ...m, hastaAd: `${h.ad} ${h.soyad}`, hastaId: h.id, tip: "manuel" })));
  const bugunYarinToplam = bugunOtomatik.length + bugunManuel.length + yarinOtomatik.length + yarinManuel.length;

  const filtreliHastalar = hastalar.filter(h => `${h.ad} ${h.soyad} ${h.tc}`.toLowerCase().includes(aramaMetni.toLowerCase()));

  const isResim = t => t && t.startsWith("image/");
  const isPdf = t => t === "application/pdf";

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: "🏠" },
    { key: "gunluk", label: "Günlük Hatırlatmalar", icon: "🔔", badge: bugunOtomatik.length + bugunManuel.length },
    { key: "hatirlatici", label: "Tüm Takvim", icon: "📋" },
    { key: "hastalar", label: "Hastalar", icon: "👥" },
    { key: "ekle", label: "Hasta Ekle", icon: "➕" },
    { key: "excel", label: "Excel İşlemleri", icon: "📊" },
  ];

  const tabs = [
    { key: "bilgiler", label: "👤 Bilgiler" },
    { key: "ameliyat", label: "🔪 Ameliyatlar" },
    { key: "kilo", label: "⚖️ Kilo Takibi" },
    { key: "randevu", label: "📅 Randevular" },
    { key: "belgeler", label: "📁 Belgeler" },
  ];

  if (yukleniyor) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center space-y-3">
        <div className="text-5xl animate-pulse">🩺</div>
        <p className="text-gray-500 font-medium">Veriler yükleniyor...</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarAcik ? "w-56" : "w-16"} bg-gradient-to-b from-blue-700 to-blue-900 text-white flex flex-col transition-all duration-300 shadow-xl`}>
        <div className="flex items-center justify-between p-4 border-b border-blue-600">
          {sidebarAcik && <span className="font-bold text-lg tracking-tight">🩺 KlinikApp</span>}
          <button onClick={() => setSidebarAcik(!sidebarAcik)} className="text-blue-200 hover:text-white ml-auto">{sidebarAcik ? "◀" : "▶"}</button>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map(n => (
            <button key={n.key} onClick={() => setPage(n.key)} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${page === n.key || (page === "detay" && n.key === "hastalar") ? "bg-white/20 border-r-4 border-white" : "hover:bg-white/10"}`}>
              <span className="text-lg">{n.icon}</span>
              {sidebarAcik && <span className="flex-1 text-left">{n.label}</span>}
              {n.badge > 0 && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-blue-600 text-xs text-blue-200">{sidebarAcik && <span>Dr. Panel v4.0</span>}</div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <h1 className="text-xl font-bold text-gray-800">
            {page === "dashboard" && "Dashboard"}
            {page === "gunluk" && "🔔 Günlük Hatırlatmalar"}
            {page === "hatirlatici" && "📋 Tüm Takvim"}
            {page === "excel" && "📊 Excel İşlemleri"}
            {page === "hastalar" && "Hasta Listesi"}
            {page === "ekle" && "Yeni Hasta Ekle"}
            {page === "detay" && aktifHasta && `${aktifHasta.ad} ${aktifHasta.soyad}`}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</span>
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">DR</div>
          </div>
        </header>

        {mesaj && <div className="absolute top-4 right-4 z-50 bg-blue-700 text-white px-5 py-3 rounded-xl shadow-lg text-sm">{mesaj}</div>}

        <div className="flex-1 overflow-y-auto p-6">

          {/* DASHBOARD */}
          {page === "dashboard" && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Toplam Hasta", val: hastalar.length, icon: "👥" },
                  { label: "Toplam Ameliyat", val: hastalar.reduce((a, h) => a + (h.ameliyatlar || []).length, 0), icon: "🔪" },
                  { label: "Bugünkü Hatırlatma", val: bugunOtomatik.length + bugunManuel.length, icon: "🔔", alert: bugunOtomatik.length + bugunManuel.length > 0 },
                  { label: "Yaklaşan Randevu", val: hastalar.flatMap(h => (h.randevular || []).filter(r => r.tarih >= todayStr)).length, icon: "📅" },
                ].map(c => (
                  <div key={c.label} className={`bg-white rounded-2xl p-5 shadow-sm border ${c.alert ? "border-orange-200 bg-orange-50" : "border-gray-100"} flex items-center gap-4`}>
                    <div className="text-3xl">{c.icon}</div>
                    <div><div className={`text-2xl font-bold ${c.alert ? "text-orange-600" : "text-gray-800"}`}>{c.val}</div><div className="text-sm text-gray-500">{c.label}</div></div>
                  </div>
                ))}
              </div>

              {(bugunOtomatik.length + bugunManuel.length) > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
                  <h3 className="font-semibold text-orange-700 mb-4">🔔 Bugünkü Hatırlatmalar</h3>
                  <div className="space-y-2">
                    {[...bugunOtomatik, ...bugunManuel].map(h => (
                      <div key={h.id} className="flex justify-between items-center bg-white rounded-xl px-4 py-3 shadow-sm">
                        <div>
                          <span className="text-sm font-semibold text-gray-800">{h.hastaAd}</span>
                          <span className="text-xs text-gray-400 ml-2">• {h.tip === "manuel" ? h.not || h.aciklama : `${h.ad} (${h.ameliyatTur})`}</span>
                        </div>
                        <Badge color="red">🔴 Bugün</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-700 mb-4">📅 Yaklaşan Randevular</h3>
                  {hastalar.flatMap(h => (h.randevular || []).filter(r => r.tarih >= todayStr).map(r => ({ ...r, hasta: `${h.ad} ${h.soyad}` }))).sort((a, b) => a.tarih.localeCompare(b.tarih)).slice(0, 5).length === 0
                    ? <p className="text-sm text-gray-400">Yaklaşan randevu yok.</p>
                    : hastalar.flatMap(h => (h.randevular || []).filter(r => r.tarih >= todayStr).map(r => ({ ...r, hasta: `${h.ad} ${h.soyad}` }))).sort((a, b) => a.tarih.localeCompare(b.tarih)).slice(0, 5).map(r => (
                      <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm font-medium text-gray-700">{r.hasta}</span>
                        <div className="flex gap-2"><Badge color="gray">{new Date(r.tarih).toLocaleDateString("tr-TR")}</Badge><Badge color="blue">{r.saat}</Badge></div>
                      </div>
                    ))}
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-700 mb-4">🔔 Yarınki Hatırlatmalar</h3>
                  {(yarinOtomatik.length + yarinManuel.length) === 0
                    ? <p className="text-sm text-gray-400">Yarın için hatırlatma yok.</p>
                    : [...yarinOtomatik, ...yarinManuel].map(h => (
                      <div key={h.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <span className="text-sm font-medium text-gray-700">{h.hastaAd}</span>
                          <span className="text-xs text-gray-400 ml-1">• {h.tip === "manuel" ? h.aciklama : h.ad}</span>
                        </div>
                        <Badge color="yellow">Yarın</Badge>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* GÜNLÜK HATIRLATMALAR */}
          {page === "gunluk" && (() => {
            const tumBugun = [...bugunOtomatik, ...bugunManuel];
            const tumYarin = [...yarinOtomatik, ...yarinManuel];
            return (
              <div className="space-y-5">
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-5 text-white flex items-center justify-between">
                  <div>
                    <p className="text-blue-200 text-sm font-medium">Bugünün Tarihi</p>
                    <p className="text-2xl font-bold mt-1">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-200 text-sm">Bugün</p>
                    <p className="text-4xl font-bold mt-1">{tumBugun.length}</p>
                  </div>
                </div>

                {tumBugun.length === 0 ? (
                  <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-gray-100">
                    <div className="text-5xl mb-4">🎉</div>
                    <p className="text-lg font-semibold text-gray-700">Bugün için hatırlatma yok!</p>
                    <p className="text-sm text-gray-400 mt-1">Tüm takipler güncel görünüyor.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tumBugun.map(h => {
                      const hasta = hastalar.find(x => x.id === h.hastaId);
                      return (
                        <div key={h.id} className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-blue-500 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-600">{h.hastaAd.charAt(0)}</div>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{h.hastaAd}</p>
                              <p className="text-sm text-blue-600 font-semibold mt-0.5">{h.tip === "manuel" ? `📌 ${h.aciklama}` : `🔔 ${h.ad}`}</p>
                              {h.ameliyatTur && <p className="text-xs text-gray-400 mt-0.5">Ameliyat: {h.ameliyatTur} — {formatTarih(h.ameliyatTarih)}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge color="red">🔴 Bugün</Badge>
                            {hasta && <button onClick={() => hastaDetay(hasta)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">Hastaya Git →</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {tumYarin.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
                    <h3 className="font-semibold text-yellow-700 mb-3">🟡 Yarın — {tumYarin.length} Hatırlatma</h3>
                    <div className="space-y-2">
                      {tumYarin.map(h => (
                        <div key={h.id} className="flex justify-between items-center bg-white rounded-xl px-4 py-3 shadow-sm">
                          <div>
                            <span className="text-sm font-semibold text-gray-800">{h.hastaAd}</span>
                            <span className="text-xs text-gray-400 ml-2">• {h.tip === "manuel" ? h.aciklama : h.ad}</span>
                          </div>
                          <Badge color="yellow">Yarın</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TÜM TAKVİM */}
          {page === "hatirlatici" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-4 text-base">📋 Tüm Otomatik Hatırlatma Takvimi</h3>
                {hastalar.filter(h => (h.ameliyatlar || []).length > 0).map(hasta => (
                  <div key={hasta.id} className="mb-6 last:mb-0">
                    <button onClick={() => hastaDetay(hasta)} className="text-sm font-bold text-blue-700 hover:underline mb-2 block">👤 {hasta.ad} {hasta.soyad}</button>
                    <div className="grid grid-cols-4 gap-2">
                      {hatirlatmalariHesapla(hasta).map(h => {
                        const durum = tarihDurumu(h.tarih);
                        return (
                          <div key={h.id} className={`rounded-xl px-3 py-2 border text-xs ${durum === "bugun" ? "bg-red-50 border-red-200" : durum === "yarin" ? "bg-yellow-50 border-yellow-200" : durum === "gecti" ? "bg-gray-50 border-gray-100 opacity-50" : "bg-blue-50 border-blue-100"}`}>
                            <p className="font-semibold text-gray-700">{h.ad}</p>
                            <p className="text-gray-500 mt-0.5">{new Date(h.tarih).toLocaleDateString("tr-TR")}</p>
                            {durum === "bugun" && <p className="text-red-500 font-bold">● Bugün</p>}
                            {durum === "yarin" && <p className="text-yellow-600 font-bold">● Yarın</p>}
                            {durum === "gecti" && <p className="text-gray-400">✓ Geçti</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {hastalar.filter(h => (h.ameliyatlar || []).length > 0).length === 0 && <p className="text-sm text-gray-400">Ameliyat kaydı olan hasta bulunamadı.</p>}
              </div>
            </div>
          )}

          {/* HASTA LİSTESİ */}
          {page === "hastalar" && (
            <div className="space-y-4">
              <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white shadow-sm" placeholder="🔍 Ad, soyad veya TC ile ara..." value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} />
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{["Ad Soyad", "Yaş", "TC No", "Boy", "Amel. Öncesi Kilo", "Son Ameliyat", "Belgeler", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filtreliHastalar.map((h, i) => (
                      <tr key={h.id} className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                        <td className="px-4 py-3 font-medium text-gray-800">{h.ad} {h.soyad}</td>
                        <td className="px-4 py-3 text-gray-600">{h.yas}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{h.tc}</td>
                        <td className="px-4 py-3 text-gray-600">{h.boy ? `${h.boy} cm` : "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{h.ameliyat_oncesi_kilo ? `${h.ameliyat_oncesi_kilo} kg` : "—"}</td>
                        <td className="px-4 py-3">{(h.ameliyatlar || []).length > 0 ? <Badge color="purple">{h.ameliyatlar[h.ameliyatlar.length - 1].tur}</Badge> : <span className="text-gray-400 text-xs">—</span>}</td>
                        <td className="px-4 py-3"><Badge color="orange">{(h.belgeler || []).length} belge</Badge></td>
                        <td className="px-4 py-3"><button onClick={() => hastaDetay(h)} className="text-blue-600 hover:text-blue-800 font-medium text-xs">Detay →</button></td>
                      </tr>
                    ))}
                    {filtreliHastalar.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Hasta bulunamadı.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

         {page === "excel" && (
  <ExcelIslemleri
    hastalar={hastalar}
    onYuklendi={veriYukle}
    showMesaj={showMesaj}
  />
)}   



          {/* HASTA EKLE */}
          {page === "ekle" && (
            <div className="max-w-xl">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[["Ad *", "ad"], ["Soyad *", "soyad"], [["Doğum Tarihi", "dogumTarihi"], ["Telefon", "tel"], ["Boy (cm)", "boy"], ["Ameliyat Öncesi Kilo (kg)", "ameliyatOncesiKilo"]].map(([lbl, key]) => (
                    <Input key={key} label={lbl} value={yeniHasta[key]} onChange={v => setYeniHasta({ ...yeniHasta, [key]: v })} type={["boy", "ameliyatOncesiKilo"].includes(key) ? "number" : key === "dogumTarihi" ? "date" : "text"}/>
                  ))}
                </div>
                <button onClick={hastaEkle} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm">➕ Hasta Ekle</button>
              </div>
            </div>
          )}

          {/* HASTA DETAY */}
          {page === "detay" && aktifHasta && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <button onClick={() => setPage("hastalar")} className="text-sm text-blue-600 hover:underline">← Listeye Dön</button>
                <button onClick={() => setSilOnayModal({ tur: "hasta", id: aktifHasta.id, mesaj: `"${aktifHasta.ad} ${aktifHasta.soyad}" adlı hastayı silmek istediğinize emin misiniz?` })} className="text-xs bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg font-medium">🗑️ Hastayı Sil</button>
              </div>
              <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => setDetayTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detayTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t.label}</button>
                ))}
              </div>

              {/* Bilgiler */}
              {detayTab === "bilgiler" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 className="font-semibold text-gray-700 mb-4">👤 Kişisel Bilgiler</h3>
                      {[["Ad Soyad", `${aktifHasta.ad} ${aktifHasta.soyad}`], ["Yaş", aktifHasta.yas], ["TC No", aktifHasta.tc], ["Telefon", aktifHasta.tel || "—"], ["Kan Grubu", aktifHasta.kan || "—"], ["Boy", aktifHasta.boy ? `${aktifHasta.boy} cm` : "—"], ["Ameliyat Öncesi Kilo", aktifHasta.ameliyat_oncesi_kilo ? `${aktifHasta.ameliyat_oncesi_kilo} kg` : "—"], ["Ameliyat Öncesi VKİ", aktifHasta.boy && aktifHasta.ameliyat_oncesi_kilo ? `${vki(aktifHasta.boy, aktifHasta.ameliyat_oncesi_kilo)} kg/m²` : "—"]].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-500">{k}</span>
                          <span className="text-sm font-medium text-gray-800">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 className="font-semibold text-gray-700 mb-4">📊 Özet</h3>
                      {(() => {
                        const sonKilo = (aktifHasta.kiloTakip || []).length > 0 ? [...aktifHasta.kiloTakip].sort((a, b) => b.tarih.localeCompare(a.tarih))[0].kilo : null;
                        const kayip = sonKilo && aktifHasta.ameliyat_oncesi_kilo ? (aktifHasta.ameliyat_oncesi_kilo - sonKilo).toFixed(1) : null;
                        const ewlVal = sonKilo ? ewl(aktifHasta.ameliyat_oncesi_kilo, sonKilo, aktifHasta.boy) : null;
                        return (
                          <div className="space-y-1">
                            {[["Toplam Ameliyat", <Badge color="purple">{(aktifHasta.ameliyatlar || []).length}</Badge>],
                              ["Toplam Kontrol", <Badge color="blue">{(aktifHasta.kiloTakip || []).length}</Badge>],
                              ["Toplam Belge", <Badge color="orange">{(aktifHasta.belgeler || []).length}</Badge>],
                              ["Son Kilo", <span className="text-sm font-medium text-gray-800">{sonKilo ? `${sonKilo} kg` : "—"}</span>],
                              ["Toplam Kayıp", <span className="text-sm font-bold text-green-600">{kayip ? `- ${kayip} kg` : "—"}</span>],
                              ["EWL %", <span className="text-sm font-bold text-blue-600">{ewlVal ? `% ${ewlVal}` : "—"}</span>]
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                                <span className="text-sm text-gray-500">{k}</span>{v}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {(aktifHasta.ameliyatlar || []).length > 0 && (
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-700">🔔 Hatırlatma Takvimi</h3>
                        <button onClick={() => setManuelModal(true)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">+ Manuel Ekle</button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {hatirlatmalariHesapla(aktifHasta).map(h => {
                          const durum = tarihDurumu(h.tarih);
                          return (
                            <div key={h.id} className={`rounded-xl px-3 py-2 border text-xs ${durum === "bugun" ? "bg-red-50 border-red-200" : durum === "yarin" ? "bg-yellow-50 border-yellow-200" : durum === "gecti" ? "bg-gray-50 border-gray-100 opacity-60" : "bg-blue-50 border-blue-100"}`}>
                              <p className="font-semibold text-gray-700">{h.ad}</p>
                              <p className="text-gray-500 mt-0.5">{new Date(h.tarih).toLocaleDateString("tr-TR")}</p>
                              {durum === "bugun" && <p className="text-red-500 font-bold mt-1">● Bugün</p>}
                              {durum === "yarin" && <p className="text-yellow-600 font-bold mt-1">● Yarın</p>}
                              {durum === "gecti" && <p className="text-gray-400 mt-1">✓ Geçti</p>}
                            </div>
                          );
                        })}
                      </div>
                      {(aktifHasta.manuelHatirlatmalar || []).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Manuel Hatırlatmalar</p>
                          {(aktifHasta.manuelHatirlatmalar || []).map(m => (
                            <div key={m.id} className="flex justify-between items-center py-1.5">
                              <span className="text-sm text-gray-700">📌 {m.aciklama}</span>
                              <div className="flex gap-2 items-center">
                                <Badge color={tarihDurumu(m.tarih) === "gecti" ? "gray" : "blue"}>{new Date(m.tarih).toLocaleDateString("tr-TR")}</Badge>
                                <button onClick={() => setSilOnayModal({ tur: "manuel", id: m.id, mesaj: `"${m.aciklama}" hatırlatıcısını silmek istiyor musunuz?` })} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Ameliyatlar */}
              {detayTab === "ameliyat" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setAmeliyatModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl font-semibold">+ Ameliyat Ekle</button>
                  </div>
                  {(aktifHasta.ameliyatlar || []).length === 0
                    ? <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">Henüz ameliyat kaydı yok.</div>
                    : [...(aktifHasta.ameliyatlar || [])].sort((a, b) => b.tarih.localeCompare(a.tarih)).map(a => (
                      <div key={a.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge color="purple">{a.tur}</Badge>
                            <p className="text-sm font-semibold text-gray-800 mt-2">{formatTarih(a.tarih)}</p>
                            {a.cerrah && <p className="text-sm text-gray-500 mt-0.5">👨‍⚕️ {a.cerrah}</p>}
                          </div>
                          <button onClick={() => setSilOnayModal({ tur: "ameliyat", id: a.id, mesaj: `"${a.tur}" ameliyat kaydını silmek istediğinize emin misiniz?` })} className="text-xs text-red-400 hover:text-red-600">🗑️</button>
                        </div>
                        {a.notlar && <p className="text-sm text-gray-500 mt-3 bg-gray-50 rounded-lg px-3 py-2">{a.notlar}</p>}
                      </div>
                    ))}
                </div>
              )}

              {/* Kilo Takibi */}
              {detayTab === "kilo" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setKiloModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl font-semibold">+ Kontrol Ekle</button>
                  </div>
                  {(aktifHasta.kiloTakip || []).length === 0
                    ? <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">Henüz kilo kaydı yok.</div>
                    : (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>{["Kontrol", "Tarih", "Kilo", "VKİ", "Kilo Kaybı", "EWL %", ""].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {[...(aktifHasta.kiloTakip || [])].sort((a, b) => a.tarih.localeCompare(b.tarih)).map((k, i) => {
                              const kayip = aktifHasta.ameliyat_oncesi_kilo ? (aktifHasta.ameliyat_oncesi_kilo - k.kilo).toFixed(1) : null;
                              const ewlVal = ewl(aktifHasta.ameliyat_oncesi_kilo, k.kilo, aktifHasta.boy);
                              return (
                                <tr key={k.id} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                                  <td className="px-4 py-3"><Badge color="blue">{k.kontrol_adi || k.kontrolAdi}</Badge></td>
                                  <td className="px-4 py-3 text-gray-600">{new Date(k.tarih).toLocaleDateString("tr-TR")}</td>
                                  <td className="px-4 py-3 font-semibold text-gray-800">{k.kilo} kg</td>
                                  <td className="px-4 py-3 text-gray-600">{aktifHasta.boy ? vki(aktifHasta.boy, k.kilo) : "—"}</td>
                                  <td className="px-4 py-3 font-semibold text-green-600">{kayip ? `- ${kayip} kg` : "—"}</td>
                                  <td className="px-4 py-3 font-semibold text-blue-600">{ewlVal ? `% ${ewlVal}` : "—"}</td>
                                  <td className="px-4 py-3"><button onClick={() => setSilOnayModal({ tur: "kilo", id: k.id, mesaj: `Kilo kaydını silmek istediğinize emin misiniz?` })} className="text-red-400 hover:text-red-600 text-xs">🗑️</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              )}

              {/* Randevular */}
              {detayTab === "randevu" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setRandevuModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl font-semibold">+ Randevu Ekle</button>
                  </div>
                  {(aktifHasta.randevular || []).length === 0
                    ? <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">Henüz randevu yok.</div>
                    : [...(aktifHasta.randevular || [])].sort((a, b) => b.tarih.localeCompare(a.tarih)).map(r => (
                      <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{formatTarih(r.tarih)}</p>
                          {r.notlar && <p className="text-xs text-gray-400 mt-0.5">{r.notlar}</p>}
                        </div>
                        <div className="flex gap-2 items-center">
                          <Badge color="blue">{r.saat}</Badge>
                          <Badge color={r.tarih < todayStr ? "gray" : "green"}>{r.tarih < todayStr ? "Geçmiş" : "Gelecek"}</Badge>
                          <button onClick={() => setSilOnayModal({ tur: "randevu", id: r.id, mesaj: `${formatTarih(r.tarih)} tarihli randevuyu silmek istediğinize emin misiniz?` })} className="text-red-400 hover:text-red-600 text-xs ml-1">🗑️</button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Belgeler */}
              {detayTab === "belgeler" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setBelgeModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl font-semibold">+ Belge Yükle</button>
                  </div>
                  {(aktifHasta.belgeler || []).length === 0
                    ? <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-dashed border-gray-300"><div className="text-4xl mb-3">📁</div><p className="text-gray-400 text-sm">Henüz belge yüklenmedi.</p></div>
                    : (
                      <div className="grid grid-cols-3 gap-4">
                        {(aktifHasta.belgeler || []).map(b => (
                          <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group">
                            <div className="h-36 bg-gray-50 flex items-center justify-center cursor-pointer relative overflow-hidden hover:bg-gray-100 transition-colors" onClick={() => setLightbox(b)}>
                              {isResim(b.dosya_tipi || b.dosyaTipi) ? <img src={b.dosya_url || b.dataUrl} alt={b.dosya_adi || b.dosyaAdi} className="w-full h-full object-cover" />
                                : isPdf(b.dosya_tipi || b.dosyaTipi) ? <div className="flex flex-col items-center gap-2"><span className="text-5xl">📄</span><span className="text-xs text-gray-400">PDF</span></div>
                                : <div className="flex flex-col items-center gap-2"><span className="text-5xl">📝</span><span className="text-xs text-gray-400">DOC</span></div>}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded-lg">🔍 Görüntüle</span>
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="flex items-center gap-1.5 mb-1"><span>{belgeIkonu(b.tur)}</span><Badge color={belgeBadgeRengi(b.tur)}>{b.tur}</Badge></div>
                              <p className="text-xs font-medium text-gray-700 truncate mt-1">{b.dosya_adi || b.dosyaAdi}</p>
                              {b.aciklama && <p className="text-xs text-gray-400 truncate">{b.aciklama}</p>}
                              <div className="flex justify-between items-center mt-2">
                                <span className="text-xs text-gray-400">{new Date(b.tarih).toLocaleDateString("tr-TR")}</span>
                                <button onClick={() => setSilOnayModal({ tur: "belge", id: b.id, mesaj: `Belgeyi silmek istediğinize emin misiniz?` })} className="text-xs text-red-400 hover:text-red-600">🗑️</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Silme Onay */}
      {silOnayModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-xl">🗑️</div>
              <h3 className="font-bold text-gray-800">Silme Onayı</h3>
            </div>
            <p className="text-sm text-gray-600">{silOnayModal.mesaj}</p>
            <div className="flex gap-3 pt-1">
              <button onClick={silmeOnayla} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm">Evet, Sil</button>
              <button onClick={() => setSilOnayModal(null)} className="flex-1 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl text-sm text-gray-600">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => setLightbox(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-3xl w-full max-h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span>{belgeIkonu(lightbox.tur)}</span>
                <span className="font-semibold text-gray-800 text-sm">{lightbox.dosya_adi || lightbox.dosyaAdi}</span>
              </div>
              <div className="flex gap-2 items-center">
                <a href={lightbox.dosya_url || lightbox.dataUrl} download={lightbox.dosya_adi || lightbox.dosyaAdi} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">⬇️ İndir</a>
                <button onClick={() => setLightbox(null)} className="text-gray-400 hover:text-gray-600 text-xl ml-2">✕</button>
              </div>
            </div>
            <div className="overflow-auto flex-1 flex items-center justify-center bg-gray-50 p-4" style={{ minHeight: 300 }}>
              {isResim(lightbox.dosya_tipi || lightbox.dosyaTipi) ? <img src={lightbox.dosya_url || lightbox.dataUrl} alt="" className="max-w-full max-h-96 rounded-xl shadow" />
                : isPdf(lightbox.dosya_tipi || lightbox.dosyaTipi) ? <iframe src={lightbox.dosya_url || lightbox.dataUrl} title="pdf" className="w-full rounded-xl" style={{ height: 480 }} />
                : <div className="text-center space-y-3"><div className="text-6xl">📝</div><p className="text-gray-500 text-sm">Bu dosya türü önizlenemiyor.</p><a href={lightbox.dosya_url || lightbox.dataUrl} download className="inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded-xl">⬇️ İndir</a></div>}
            </div>
          </div>
        </div>
      )}

      {/* Manuel Hatırlatıcı Modal */}
      {manuelModal && (
        <Modal title="📌 Manuel Hatırlatıcı Ekle" onClose={() => setManuelModal(false)}>
          <Input label="Tarih *" value={yeniManuel.tarih} onChange={v => setYeniManuel({ ...yeniManuel, tarih: v })} type="date" />
          <Input label="Not *" value={yeniManuel.aciklama} onChange={v => setYeniManuel({ ...yeniManuel, aciklama: v })} placeholder="Örn: Kan tahlili sonucu ara" />
          <div className="flex gap-3 pt-2">
            <button onClick={manuelEkle} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm">Kaydet</button>
            <button onClick={() => setManuelModal(false)} className="flex-1 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl text-sm text-gray-600">İptal</button>
          </div>
        </Modal>
      )}

      {/* Ameliyat Modal */}
      {ameliyatModal && (
        <Modal title="🔪 Ameliyat Ekle" onClose={() => setAmeliyatModal(false)}>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Ameliyat Türü</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={yeniAmeliyat.tur} onChange={e => setYeniAmeliyat({ ...yeniAmeliyat, tur: e.target.value })}>
              {AMELIYAT_TURLERI.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Input label="Ameliyat Tarihi *" value={yeniAmeliyat.tarih} onChange={v => setYeniAmeliyat({ ...yeniAmeliyat, tarih: v })} type="date" />
          <Input label="Cerrah Adı" value={yeniAmeliyat.cerrah} onChange={v => setYeniAmeliyat({ ...yeniAmeliyat, cerrah: v })} />
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Notlar</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" rows={3} value={yeniAmeliyat.notlar} onChange={e => setYeniAmeliyat({ ...yeniAmeliyat, notlar: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={ameliyatEkle} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm">Kaydet</button>
            <button onClick={() => setAmeliyatModal(false)} className="flex-1 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl text-sm text-gray-600">İptal</button>
          </div>
        </Modal>
      )}

      {/* Kilo Modal */}
      {kiloModal && (
        <Modal title="⚖️ Kilo Kontrolü Ekle" onClose={() => setKiloModal(false)}>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Kontrol Dönemi</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={yeniKilo.kontrolAdi} onChange={e => setYeniKilo({ ...yeniKilo, kontrolAdi: e.target.value })}>
              {KONTROL_ADLARI.map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <Input label="Kontrol Tarihi *" value={yeniKilo.tarih} onChange={v => setYeniKilo({ ...yeniKilo, tarih: v })} type="date" />
          <Input label="Mevcut Kilo (kg) *" value={yeniKilo.kilo} onChange={v => setYeniKilo({ ...yeniKilo, kilo: v })} type="number" />
          <div className="flex gap-3 pt-2">
            <button onClick={kiloEkle} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm">Kaydet</button>
            <button onClick={() => setKiloModal(false)} className="flex-1 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl text-sm text-gray-600">İptal</button>
          </div>
        </Modal>
      )}

      {/* Randevu Modal */}
      {randevuModal && (
        <Modal title="📅 Randevu Ekle" onClose={() => setRandevuModal(false)}>
          <Input label="Tarih *" value={yeniRandevu.tarih} onChange={v => setYeniRandevu({ ...yeniRandevu, tarih: v })} type="date" />
          <Input label="Saat *" value={yeniRandevu.saat} onChange={v => setYeniRandevu({ ...yeniRandevu, saat: v })} type="time" />
          <Input label="Notlar" value={yeniRandevu.notlar} onChange={v => setYeniRandevu({ ...yeniRandevu, notlar: v })} />
          <div className="flex gap-3 pt-2">
            <button onClick={randevuEkle} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm">Kaydet</button>
            <button onClick={() => setRandevuModal(false)} className="flex-1 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl text-sm text-gray-600">İptal</button>
          </div>
        </Modal>
      )}

      {/* Belge Modal */}
      {belgeModal && (
        <Modal title="📁 Belge Yükle" onClose={() => setBelgeModal(false)}>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Belge Türü</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={yeniBelge.tur} onChange={e => setYeniBelge({ ...yeniBelge, tur: e.target.value })}>
              {BELGE_TURLERI.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Input label="Tarih" value={yeniBelge.tarih} onChange={v => setYeniBelge({ ...yeniBelge, tarih: v })} type="date" />
          <Input label="Açıklama" value={yeniBelge.aciklama} onChange={v => setYeniBelge({ ...yeniBelge, aciklama: v })} placeholder="Örn: 6. ay kan tahlili" />
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Dosya Seç *</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => fileRef.current.click()}>
              {dosyaYukleniyor ? <p className="text-sm text-blue-500">Yükleniyor...</p>
                : yeniBelge.dosyaAdi ? <div><p className="text-sm font-medium text-blue-600">✅ {yeniBelge.dosyaAdi}</p><p className="text-xs text-gray-400 mt-1">Değiştirmek için tıklayın</p></div>
                : <div><p className="text-2xl mb-2">📂</p><p className="text-sm text-gray-500">Dosya seçmek için tıklayın</p><p className="text-xs text-gray-300 mt-1">PDF, JPEG, PNG, DOC — maks. 5MB</p></div>}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={dosyaSec} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={belgeEkle} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm">Yükle</button>
            <button onClick={() => setBelgeModal(false)} className="flex-1 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl text-sm text-gray-600">İptal</button>
          </div>
        </Modal>
      )}
    </div>
  );
}