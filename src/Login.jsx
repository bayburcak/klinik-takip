import { useState } from "react";

const KULLANICI_ADI = "doktor";
const SIFRE = "klinik2026";

export default function Login({ onGiris }) {
  const [kullanici, setKullanici] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");

  const girisYap = () => {
    if (kullanici === KULLANICI_ADI && sifre === SIFRE) {
      onGiris();
    } else {
      setHata("Kullanıcı adı veya şifre hatalı!");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🩺</div>
          <h1 className="text-2xl font-bold text-gray-800">KlinikApp</h1>
          <p className="text-sm text-gray-400 mt-1">Hasta Takip Sistemi</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Kullanıcı Adı</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={kullanici}
              onChange={e => setKullanici(e.target.value)}
              onKeyDown={e => e.key === "Enter" && girisYap()}
              placeholder="Kullanıcı adı"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Şifre</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={sifre}
              onChange={e => setSifre(e.target.value)}
              onKeyDown={e => e.key === "Enter" && girisYap()}
              placeholder="Şifre"
            />
          </div>
          {hata && <p className="text-xs text-red-500 text-center">{hata}</p>}
          <button
            onClick={girisYap}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
          >
            Giriş Yap
          </button>
        </div>
      </div>
    </div>
  );
}