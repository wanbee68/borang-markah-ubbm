import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  query,
  orderBy 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Save, Printer, Trash2, FileText, History, 
  AlertCircle, Loader2, UserCheck, ShieldCheck, 
  PenTool, CheckCircle2, Upload, Info, X, Search, Users
} from 'lucide-react';

// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

// Firebase Configuration
const app = initializeApp(firebaseConfig);
// @ts-ignore
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const appId = 'ubbm-system-001';

const App = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [masterStudents, setMasterStudents] = useState<any[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [isPdfReady, setIsPdfReady] = useState(false);
  // @ts-ignore
  const [isExcelReady, setIsExcelReady] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '' });
  const [resetConfirm, setResetConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [header, setHeader] = useState({
    noPusat: '',
    namaMaktab: 'MAKTAB RENDAH SAINS MARA ',
    sidang: '1',
    tarikhMasa: '',
    pemeriksaNama: '',
    penyemakNama: '',
    pengesahNama: ''
  });

  const emptyCandidate = () => ({
    nama: '',
    jantina: 'L',
    tingkatan: '',
    kelas: '',
    angkaGiliran: '',
    analitik: { tatabahasa: 0, sebutan: 0, kefasihan: 0, idea: 0 },
    holistik: 0,
    penyelarasan: 0
  });

  const [candidates, setCandidates] = useState(Array(5).fill(null).map(emptyCandidate));

  // Dynamically load libraries
  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise<void>((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const loadExternalLibraries = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        
        setIsPdfReady(true);
        setIsExcelReady(true);
        // @ts-ignore
        if (window.pdfjsLib) {
          // @ts-ignore
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
      } catch (err) {
        console.error("Gagal memuatkan perpustakaan luar:", err);
      }
    };

    loadExternalLibraries();
  }, []);

  // Auth & Records Initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      if (currUser) {
        setUser(currUser);
      } else {
        try {
          // Attempt silent sign-in
          await signInAnonymously(auth);
        } catch (err) {
          // Silently fail auth; Firestore rules are set to public for this preview
        }
      }
      setLoading(false);
    });

    const testConnection = async () => {
      try {
        const { getDocFromServer, doc: firestoreDoc } = await import('firebase/firestore');
        await getDocFromServer(firestoreDoc(db, 'artifacts', appId, 'public', 'data', 'connection_test', 'status'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // We listen for changes regardless of auth state because Firestore rules are public for this collection
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'ubbm_records'));
    const path = `artifacts/${appId}/public/data/ubbm_records`;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const sortedData = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRecords(sortedData);

      if (sortedData.length > 0 && !header.pemeriksaNama) {
        const last = sortedData[0].header;
        setHeader(prev => ({
          ...prev,
          pemeriksaNama: last.pemeriksaNama || '',
          pemeriksaJawatan: last.pemeriksaJawatan || prev.pemeriksaJawatan,
          penyemakNama: last.penyemakNama || '',
          penyemakJawatan: last.penyemakJawatan || prev.penyemakJawatan,
          pengesahNama: last.pengesahNama || '',
          pengesahJawatan: last.pengesahJawatan || prev.pengesahJawatan
        }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    // Fetch master student list
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
    const path = `artifacts/${appId}/public/data/students`;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      // Sort by Tingkatan first, then Kelas, then Name
      const sorted = data.sort((a, b) => {
        // 1. Level (Tingkatan)
        const aTing = String(a.tingkatan || '');
        const bTing = String(b.tingkatan || '');
        if (aTing !== bTing) return aTing.localeCompare(bTing, undefined, { numeric: true });
        
        // 2. Class Name (Kelas)
        const aKelas = String(a.kelas || '');
        const bKelas = String(b.kelas || '');
        if (aKelas !== bKelas) return aKelas.localeCompare(bKelas);

        // 3. Alphabetical Order (Name)
        return a.name.localeCompare(b.name);
      });
      setMasterStudents(sorted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, []);

  const showToast = (msg: string) => {
    setNotification({ show: true, message: msg });
    setTimeout(() => setNotification({ show: false, message: '' }), 4000);
  };

  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId?: string | null;
      email?: string | null;
      emailVerified?: boolean | null;
      isAnonymous?: boolean | null;
      tenantId?: string | null;
      providerInfo?: {
        providerId?: string | null;
        email?: string | null;
      }[];
    }
  }

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  // File Upload Logic
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (fileType === 'xlsx' || fileType === 'xls') processExcel(file);
    else if (fileType === 'pdf') processPdf(file);
    else alert("Sila muat naik fail Excel atau PDF sahaja.");
    e.target.value = '';
  };

  const processExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        // @ts-ignore
        const wb = window.XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // @ts-ignore
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
        const rows = (data as any[]).filter(row => Array.isArray(row) && row.length > 0);
        mapDataToCandidates(rows);
      } catch (err) { showToast("Ralat memproses fail Excel."); }
    };
    reader.readAsBinaryString(file);
  };

  const processPdf = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const typedarray = new Uint8Array(evt.target?.result as ArrayBuffer);
        // @ts-ignore
        const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
        }
        const lines = fullText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
        mapDataToCandidates(lines.map(line => line.split(/\s{2,}/)));
      } catch (err) { showToast("Ralat memproses fail PDF."); }
    };
    reader.readAsArrayBuffer(file);
  };

  const mapDataToCandidates = (rows: any[][]) => {
    const newCandidates = [...candidates];
    
    // Attempt to find meaningful rows (discarding headers)
    const dataRows = rows.filter(row => {
      const rowStr = row.join(' ').toUpperCase();
      return !rowStr.includes('BIL') && !rowStr.includes('NAMA') && !rowStr.includes('UBBM');
    });

    dataRows.slice(0, 5).forEach((row, i) => {
      let name = "", giliran = "";
      
      // Heuristic parsing
      for (const cell of row) {
        const s = String(cell).trim();
        if (!s) continue;
        
        // Number only cells are probably 'Bil' or scores
        if (/^\d+$/.test(s) && s.length < 3) continue;

        // Long text without many numbers is likely a name
        if (s.length > 3 && !/^\d+$/.test(s) && !name) {
           name = s;
        } else if (/^[A-Z]\d+/.test(s) || /^\d{5,}/.test(s)) {
           // Likely index number or giliran
           giliran = s;
        }
      }

      if (name) {
        newCandidates[i] = {
          ...newCandidates[i],
          nama: name.toUpperCase(),
          tingkatan: '', 
          kelas: '',
          angkaGiliran: giliran || newCandidates[i].angkaGiliran
        };
      }
    });

    setCandidates(newCandidates);
    showToast("Pelajar berjaya dimetakan ke borang (Maksimum 5)");
  };

  // State Handlers
  const handleAnalitikChange = (idx: number, field: string, val: string) => {
    const newVal = Math.min(10, Math.max(0, parseInt(val) || 0));
    const newCandidates = [...candidates];
    // @ts-ignore
    newCandidates[idx].analitik[field] = newVal;
    setCandidates(newCandidates);
  };

  const handleHolistikChange = (idx: number, val: string) => {
    const newVal = Math.min(30, Math.max(0, parseInt(val) || 0));
    const newCandidates = [...candidates];
    newCandidates[idx].holistik = newVal;
    setCandidates(newCandidates);
  };

  const handlePenyelarasanChange = (idx: number, val: string) => {
    const newVal = parseInt(val) || 0;
    const newCandidates = [...candidates];
    newCandidates[idx].penyelarasan = newVal;
    setCandidates(newCandidates);
  };

  const handleInfoChange = (idx: number, field: string, val: string) => {
    const newCandidates = [...candidates];
    // @ts-ignore
    newCandidates[idx][field] = val;
    setCandidates(newCandidates);
  };

  const calculateAnalitikTotal = (c: any) => {
    return (c.analitik.tatabahasa || 0) + (c.analitik.sebutan || 0) + (c.analitik.kefasihan || 0) + (c.analitik.idea || 0);
  };

  const saveRecord = async () => {
    const path = `artifacts/${appId}/public/data/ubbm_records`;
    try {
      const saveDate = new Date();
      // Only keep non-empty candidates
      const validCandidates = candidates.filter(c => c.nama.trim() !== '');
      
      if (validCandidates.length === 0) {
        showToast("Sila masukkan sekurang-kurangnya satu calon");
        return;
      }

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'ubbm_records'), {
        header: { ...header, tarikhSimpan: saveDate.toLocaleDateString('ms-MY'), masaSimpan: saveDate.toLocaleTimeString('ms-MY') },
        candidates: validCandidates,
        createdAt: saveDate.toISOString(),
        userId: user?.uid || 'anonymous'
      });

      // Optional: Ask to save to master list if they aren't there?
      // For now, we just save the session record.
      showToast("Rekod berjaya disimpan");
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, path);
      showToast("Gagal menyimpan rekod."); 
    }
  };

  const saveToMasterList = async () => {
    const path = `artifacts/${appId}/public/data/students`;
    const validCandidates = candidates.filter(c => c.nama.trim() !== '');
    
    if (validCandidates.length === 0) {
      showToast("Tiada data calon untuk disimpan ke Master List");
      return;
    }

    let savedCount = 0;
    for (const c of validCandidates) {
      // Check if already exists in master students (local cache)
      const exists = masterStudents.some(ms => ms.name.toUpperCase() === c.nama.toUpperCase());
      if (!exists) {
        try {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'students'), {
            name: c.nama.toUpperCase(),
            tingkatan: c.tingkatan || '',
            kelas: c.kelas.toUpperCase(),
            maktabId: c.angkaGiliran || '', // Use giliran as fallback ID if no maktabId field
            jantina: c.jantina || 'L'
          });
          savedCount++;
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
    }
    
    if (savedCount > 0) showToast(`${savedCount} calon baru ditambah ke Master List`);
    else showToast("Semua calon sudah ada dalam Master List");
  };

  const deleteRecord = async (id: string) => {
    const path = `artifacts/${appId}/public/data/ubbm_records/${id}`;
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      showToast("Klik sekali lagi untuk PADAM");
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    
    try { 
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ubbm_records', id)); 
      showToast("Rekod dipadam");
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, path);
      showToast("Gagal memadam rekod."); 
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const loadRecord = (record: any) => {
    setHeader(record.header);
    setCandidates(record.candidates);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Rekod telah dipanggil semula");
  };

  const resetForm = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      showToast("Klik sekali lagi untuk RESET");
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    
    setCandidates(Array(5).fill(null).map(emptyCandidate));
    setHeader(prev => ({ 
      ...prev, 
      noPusat: '', 
      tarikhMasa: '',
      sidang: '1'
    }));
    setResetConfirm(false);
    showToast("Borang telah dikosongkan");
  };

  const selectStudent = (student: any) => {
    if (activeSlot === null) return;
    const newCandidates = [...candidates];
    newCandidates[activeSlot] = {
      ...newCandidates[activeSlot],
      nama: student.name,
      tingkatan: student.tingkatan || '',
      kelas: student.kelas || '',
    };
    setCandidates(newCandidates);
    setShowSearchModal(false);
    setActiveSlot(null);
    showToast(`Calon ${student.name} telah dipilih`);
  };

  const filteredStudents = masterStudents.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.maktabId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.kelas.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.tingkatan && String(s.tingkatan).includes(searchQuery))
  );

  // Group filtered students by Tingkatan
  const groupedStudents = filteredStudents.reduce((acc: any, student: any) => {
    const level = student.tingkatan || 'TIDAK DIKETAHUI';
    if (!acc[level]) acc[level] = [];
    acc[level].push(student);
    return acc;
  }, {});

  const sortedLevels = Object.keys(groupedStudents).sort();

  const generatePDF = () => {
    try {
      // @ts-ignore
      const jsPDFLib = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPDFLib) {
        alert("Sistem PDF masih memulakan... Sila tunggu sebentar atau muat semula halaman.");
        return;
      }

      const doc = new jsPDFLib('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(14);
      doc.text("MAKTAB RENDAH SAINS MARA", pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(12);
      doc.text("BORANG UJIAN BERTUTUR BAHASA MELAYU (UBBM)", pageWidth / 2, 22, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`NO PUSAT: ${header.noPusat || '-'}`, 20, 32);
      doc.text(`NAMA MAKTAB: ${header.namaMaktab}`, 20, 38);
      doc.text(`SIDANG: ${header.sidang}`, pageWidth - 75, 32);
      doc.text(`TARIKH/MASA: ${header.tarikhMasa || '-'}`, pageWidth - 75, 38);

      const tableData = candidates.map((c, i) => [
        i + 1, 
        `${c.nama || "-"}\nT: ${c.tingkatan || "-"} K: ${c.kelas || "-"}\nGil: ${c.angkaGiliran || "-"}`,
        c.jantina,
        c.analitik.tatabahasa, c.analitik.sebutan, c.analitik.kefasihan, c.analitik.idea,
        calculateAnalitikTotal(c), c.holistik, calculateAnalitikTotal(c) + c.holistik, 
        c.penyelarasan
      ]);

      const autoTableOptions = {
        startY: 45,
        head: [['BIL', 'MAKLUMAT CALON', 'JNT', 'TATABAHASA (10)', 'SEBUT (10)', 'FASIH (10)', 'IDEA (10)', 'JUM A', 'HOL (30)', 'JUM BSR', 'MARKAH PENYELARASAN']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
        columnStyles: { 
          1: { halign: 'left', cellWidth: 50 },
          2: { cellWidth: 10 },
          10: { fontSize: 13, fontStyle: 'bold', halign: 'center', cellWidth: 35 } 
        }
      };

      // Robust call to autoTable
      // @ts-ignore
      if (typeof doc.autoTable === 'function') {
        // @ts-ignore
        doc.autoTable(autoTableOptions);
      } else {
        // @ts-ignore
        const at = window.jspdf?.autoTable || window.autoTable;
        if (at) {
          at(doc, autoTableOptions);
        } else {
          showToast("Ralat: Plugin autoTable tidak dijumpai.");
          return;
        }
      }

      // @ts-ignore
      const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 150) + 15;
      doc.setFontSize(9);
      doc.text("Disediakan Oleh:", 20, finalY); doc.text("__________________________", 20, finalY + 15);
      doc.text(`Nama: ${header.pemeriksaNama}`, 20, finalY + 20);
      doc.text("Disemak Oleh:", pageWidth / 2 - 40, finalY); doc.text("__________________________", pageWidth / 2 - 40, finalY + 15);
      doc.text(`Nama: ${header.penyemakNama}`, pageWidth / 2 - 40, finalY + 20);
      doc.text("Disahkan Oleh:", pageWidth - 80, finalY); doc.text("__________________________", pageWidth - 80, finalY + 15);
      doc.text(`Nama: ${header.pengesahNama}`, pageWidth - 80, finalY + 20);

      const fileName = `UBBM_${header.noPusat || 'BORANG'}_SIDANG${header.sidang}.pdf`;
      doc.save(fileName);
      showToast("PDF sedang dimuat turun");
    } catch (error) {
      console.error("PDF Error:", error);
      showToast("Gagal menjana PDF.");
    }
  };

  const generateMasterPDF = (targetKelas: string) => {
    try {
      // @ts-ignore
      const jsPDFLib = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPDFLib) {
        showToast("PDF Library loading...");
        return;
      }

      const doc = new jsPDFLib('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Cari semua calon dari rekod yang mempunyai kelas ini
      const uniqueResults = new Map();
      records.forEach(rec => {
        rec.candidates.forEach((c: any) => {
          if (c.nama && c.kelas && String(c.kelas).toUpperCase().includes(targetKelas.toUpperCase())) {
            const total = calculateAnalitikTotal(c) + (c.holistik || 0);
            // Simpan markah terbaru (since records are sorted by date desc)
            if (!uniqueResults.has(c.nama)) {
               uniqueResults.set(c.nama, {
                 ...c,
                 total,
                 sidang: rec.header.sidang
               });
            }
          }
        });
      });

      const sortedMarks = Array.from(uniqueResults.values()).sort((a, b) => a.nama.localeCompare(b.nama));

      if (sortedMarks.length === 0) {
        showToast(`Tiada markah ditemui untuk kelas ${targetKelas}`);
        return;
      }

      doc.setFontSize(14);
      doc.text("MAKTAB RENDAH SAINS MARA", pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`BORANG MARKAH INDUK UBBM - KELAS: ${targetKelas}`, pageWidth / 2, 22, { align: 'center' });

      const tableRows = sortedMarks.map((c, i) => [
        i + 1,
        c.nama.toUpperCase(),
        c.jantina,
        c.tingkatan,
        c.angkaGiliran,
        c.total,
        c.penyelarasan || '-'
      ]);

      const autoTableOptions = {
        startY: 30,
        head: [['BIL', 'NAMA CALON', 'JNT', 'TING', 'GILIRAN', 'MARKAH (70m)', 'PENYELARASAN']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [4, 120, 87], fontSize: 9, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
        columnStyles: { 1: { halign: 'left', cellWidth: 70 } }
      };

      // @ts-ignore
      if (typeof doc.autoTable === 'function') {
        // @ts-ignore
        doc.autoTable(autoTableOptions);
      } else {
        // @ts-ignore
        const at = window.jspdf?.autoTable || window.autoTable;
        if (at) at(doc, autoTableOptions);
      }

      doc.save(`Markah_Indur_UBBM_${targetKelas}.pdf`);
      showToast(`Laporan Induk ${targetKelas} dijana`);
    } catch (error) {
      console.error(error);
      showToast("Gagal menjana laporan induk.");
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
      <Loader2 className="animate-spin text-blue-600" size={48} />
      <p className="text-slate-500 font-black uppercase tracking-widest animate-pulse">Memulakan Sistem UBBM...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 relative">
      <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.pdf" onChange={handleFileSelect} />

      {notification.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] animate-bounce">
          <div className="bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-emerald-400">
             <CheckCircle2 size={24} />
             <span className="font-black uppercase tracking-widest text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      <div className="flex-grow p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-blue-900 p-6 text-white text-center border-b-4 border-yellow-500">
              <h1 className="text-2xl font-black uppercase tracking-widest">Maktab Rendah Sains Mara</h1>
              <h2 className="text-lg font-bold opacity-90 mt-1 italic underline decoration-yellow-500 underline-offset-8">Borang Markah Ujian Bertutur Bahasa Melayu (UBBM)</h2>
            </div>

            <div className="p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-xl border-2 border-slate-200">
                <div className="space-y-2">
                  <label className="text-xs font-black text-blue-900 uppercase">No Pusat</label>
                  <input type="text" placeholder="MY00" value={header.noPusat} onChange={(e) => setHeader({...header, noPusat: e.target.value})} className="w-full p-2.5 border-2 border-slate-300 rounded-lg focus:border-blue-500 outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-blue-900 uppercase">Sidang</label>
                  <select value={header.sidang} onChange={(e) => setHeader({...header, sidang: e.target.value})} className="w-full p-2.5 border-2 border-slate-300 rounded-lg focus:border-blue-500 outline-none font-bold">
                    {[1,2,3,4,5].map(n => <option key={n} value={String(n)}>SIDANG {n}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-blue-900 uppercase">Tarikh / Masa</label>
                  <input type="text" placeholder="Contoh: 15 Mac 2026 (8:00 Pagi)" value={header.tarikhMasa} onChange={(e) => setHeader({...header, tarikhMasa: e.target.value})} className="w-full p-2.5 border-2 border-slate-300 rounded-lg focus:border-blue-500 outline-none font-bold" />
                </div>
              </div>

              <div className="overflow-x-auto shadow-sm rounded-lg border border-slate-400">
                <table className="w-full border-collapse min-w-[1200px] text-sm text-center">
                  <thead>
                    <tr className="bg-blue-950 text-white text-[11px] font-black uppercase tracking-wider">
                      <th className="border border-blue-800 p-4 w-12" rowSpan={2}>Bil</th>
                      <th className="border border-blue-800 p-4 text-left" rowSpan={2}>
                        <div className="flex items-center justify-between">
                            Calon (Nama / Ting / Kelas / Giliran)
                            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[10px] shadow-md active:scale-95">
                                <Upload size={14} /> Muat Naik Senarai
                            </button>
                        </div>
                      </th>
                      <th className="border border-blue-800 p-4 w-20" rowSpan={2}>JNT</th>
                      <th className="border border-blue-800 p-4 bg-blue-900" colSpan={5}>A. INDIVIDU (ANALITIK) [40m]</th>
                      <th className="border border-blue-800 p-4 bg-emerald-800" rowSpan={2}>B. KUMP [30m]</th>
                      <th className="border border-blue-800 p-4 bg-yellow-600" rowSpan={2}>JUMLAH</th>
                      <th className="border border-blue-800 p-4" rowSpan={2}>Markah Penyelarasan</th>
                    </tr>
                    <tr className="bg-slate-300 text-[10px] font-black text-slate-800 uppercase">
                      <th className="border border-slate-400 p-2 w-16">Tatabahasa (10)</th>
                      <th className="border border-slate-400 p-2 w-20">Sebutan (10)</th>
                      <th className="border border-slate-400 p-2 w-16">Fasihan (10)</th>
                      <th className="border border-slate-400 p-2 w-20">Idea (10)</th>
                      <th className="border border-slate-400 p-2 w-16 bg-blue-100">JUM A</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {candidates.map((c, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-all border-b border-slate-200">
                        <td className="border-x border-slate-300 p-3 font-black text-slate-500">{idx + 1}</td>
                        <td className="border-x border-slate-300 p-3 text-left space-y-2 relative group-cell">
                          <div className="flex items-center gap-2">
                             <input placeholder="NAMA PENUH" className="w-full text-sm font-black p-1 border-b uppercase outline-none focus:border-blue-500 bg-transparent" value={c.nama} onChange={(e) => handleInfoChange(idx, 'nama', e.target.value.toUpperCase())} />
                             <button onClick={() => { setActiveSlot(idx); setShowSearchModal(true); }} className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Cari Master List">
                                <Search size={16} />
                             </button>
                          </div>
                          <div className="flex gap-2">
                            <input placeholder="TING" className="w-1/4 text-[10px] p-1.5 border rounded bg-slate-50 uppercase" value={c.tingkatan} onChange={(e) => handleInfoChange(idx, 'tingkatan', e.target.value)} />
                            <input placeholder="KELAS" className="w-2/4 text-[10px] p-1.5 border rounded bg-slate-50 uppercase" value={c.kelas} onChange={(e) => handleInfoChange(idx, 'kelas', e.target.value)} />
                            <input placeholder="GILIRAN" className="w-1/4 text-[10px] p-1.5 border rounded bg-slate-50 uppercase" value={c.angkaGiliran} onChange={(e) => handleInfoChange(idx, 'angkaGiliran', e.target.value)} />
                          </div>
                        </td>
                        <td className="border-x border-slate-300 p-2">
                           <select className="p-2 border-2 border-slate-200 rounded-lg font-black text-sm outline-none focus:border-blue-500" value={c.jantina} onChange={(e) => handleInfoChange(idx, 'jantina', e.target.value)}>
                              <option value="L">L</option>
                              <option value="P">P</option>
                           </select>
                        </td>
                        <td className="border-x border-slate-300 p-1">
                          <input type="number" min="0" max="10" className="w-full text-center p-2 font-black text-blue-800 text-lg outline-none bg-transparent" value={c.analitik.tatabahasa} onChange={(e) => handleAnalitikChange(idx, 'tatabahasa', e.target.value)} />
                        </td>
                        <td className="border-x border-slate-300 p-1">
                          <input type="number" min="0" max="10" className="w-full text-center p-2 font-black text-blue-800 text-lg outline-none bg-transparent" value={c.analitik.sebutan} onChange={(e) => handleAnalitikChange(idx, 'sebutan', e.target.value)} />
                        </td>
                        <td className="border-x border-slate-300 p-1">
                          <input type="number" min="0" max="10" className="w-full text-center p-2 font-black text-blue-800 text-lg outline-none bg-transparent" value={c.analitik.kefasihan} onChange={(e) => handleAnalitikChange(idx, 'kefasihan', e.target.value)} />
                        </td>
                        <td className="border-x border-slate-300 p-1">
                          <input type="number" min="0" max="10" className="w-full text-center p-2 font-black text-blue-800 text-lg outline-none bg-transparent" value={c.analitik.idea} onChange={(e) => handleAnalitikChange(idx, 'idea', e.target.value)} />
                        </td>
                        <td className="border-x border-slate-300 p-1 bg-blue-100 font-black text-blue-900 text-lg">{calculateAnalitikTotal(c)}</td>
                        <td className="border-x border-slate-300 p-1 bg-emerald-50">
                          <input type="number" min="0" max="30" className="w-full text-center p-2 font-black text-emerald-800 text-lg outline-none bg-transparent" value={c.holistik} onChange={(e) => handleHolistikChange(idx, e.target.value)} />
                        </td>
                        <td className="border-x border-slate-300 p-1 bg-yellow-200 font-black text-2xl text-blue-950">{calculateAnalitikTotal(c) + c.holistik}</td>
                        <td className="border-x border-slate-300 p-1">
                           <input type="number" placeholder="Saiz 13 Arial" className="w-full text-center p-2 font-black text-slate-400 text-lg outline-none bg-transparent placeholder:text-slate-300 placeholder:italic" value={c.penyelarasan || ''} onChange={(e) => handlePenyelarasanChange(idx, e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-8 border-t-2 border-slate-200">
                 <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest mb-6 flex items-center gap-3">
                  <UserCheck size={22} className="text-yellow-600" /> Profil Pengesahan Markah (Sesi 2026)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-blue-800 font-black text-xs uppercase"><PenTool size={16} /> Guru Pemeriksa</div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Nama Penyimpan</label>
                      <input type="text" value={header.pemeriksaNama} onChange={(e) => setHeader({...header, pemeriksaNama: e.target.value})} className="w-full p-2.5 text-xs border-2 rounded-lg font-bold outline-none border-slate-100" />
                    </div>
                  </div>
                  <div className="p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-blue-800 font-black text-xs uppercase"><ShieldCheck size={16} /> Penyemak Markah</div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Nama Penyemak</label>
                      <input type="text" value={header.penyemakNama} onChange={(e) => setHeader({...header, penyemakNama: e.target.value})} className="w-full p-2.5 text-xs border-2 rounded-lg font-bold outline-none border-slate-100" />
                    </div>
                  </div>
                  <div className="p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-blue-800 font-black text-xs uppercase"><UserCheck size={16} /> Pengesah Markah</div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Nama Pengesah</label>
                      <input type="text" value={header.pengesahNama} onChange={(e) => setHeader({...header, pengesahNama: e.target.value})} className="w-full p-2.5 text-xs border-2 rounded-lg font-bold outline-none border-slate-100" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-8 border-t-2 border-slate-200 justify-center">
                <div className="flex flex-col items-center gap-2">
                  <button onClick={saveRecord} className="flex items-center gap-3 px-10 py-4 bg-blue-700 text-white rounded-2xl hover:bg-blue-800 font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"><Save size={24} /> Simpan Rekod</button>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Simpan markah sidang ini</p>
                </div>
                
                <div className="flex flex-col items-center gap-2">
                  <button onClick={saveToMasterList} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"><UserCheck size={24} /> Kemaskini Master List</button>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Tambah calon ke pangkalan data</p>
                </div>

                <button onClick={generatePDF} disabled={!isPdfReady} className="flex items-center gap-3 px-10 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 h-fit self-start"><Printer size={24} /> Cetak PDF</button>
                <button onClick={resetForm} className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all ${resetConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
                  {resetConfirm ? 'Pasti?' : 'Reset Borang'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl border-2 border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 p-6 text-white flex justify-between items-center border-b-4 border-emerald-600">
               <div className="flex items-center gap-4">
                  <FileText size={24} className="text-yellow-500" />
                  <h3 className="font-black uppercase tracking-[0.2em] text-lg">Jana Laporan Induk Kelas</h3>
               </div>
            </div>
            <div className="p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-grow space-y-2 w-full">
                  <label className="text-xs font-black text-emerald-900 uppercase tracking-widest">Pilih Kelas Untuk Dijana</label>
                  <select id="master-report-select" className="w-full p-4 border-2 border-emerald-100 rounded-2xl focus:border-emerald-500 outline-none font-bold text-lg bg-emerald-50/30">
                    <option value="">-- PILIH KELAS --</option>
                    {Array.from(new Set(masterStudents.map(s => s.kelas).filter(Boolean))).sort().map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={() => {
                    const select = document.getElementById('master-report-select') as HTMLSelectElement;
                    if (!select.value) {
                      showToast("Sila pilih kelas terlebih dahulu");
                      return;
                    }
                    generateMasterPDF(select.value);
                  }}
                  className="w-full md:w-auto flex items-center justify-center gap-3 px-12 py-5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 whitespace-nowrap"
                >
                  <Upload size={24} className="rotate-180" /> Jana Laporan Induk
                </button>
              </div>
              <div className="mt-4 flex items-start gap-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                <Info size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-yellow-800 leading-relaxed font-medium">
                  Fungsi ini akan mengumpulkan semua markah calon dari pangkalan data bagi kelas yang dipilih, menyusunnya mengikut abjad, dan menjana satu fail PDF ringkasan. Pastikan rekod markah telah disimpan sebelum menjana laporan ini.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl border-2 border-slate-200 overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center border-b-4 border-blue-600">
               <div className="flex items-center gap-4">
                  <History size={24} className="text-yellow-500" />
                  <h3 className="font-black uppercase tracking-[0.2em] text-lg">Senarai Simpanan Rekod</h3>
               </div>
               <span className="bg-blue-600 px-6 py-2 rounded-full text-xs font-black shadow-inner">{records.length} TOTAL REKOD</span>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                  <thead className="text-[10px] text-slate-500 uppercase font-black bg-slate-50 border-b">
                     <tr>
                        <th className="px-6 py-4">Tarikh / Masa Simpan</th>
                        <th className="px-6 py-4">Pemeriksa (Penyimpan)</th>
                        <th className="px-6 py-4">Penyemak (Tarikh)</th>
                        <th className="px-6 py-4">Pengesah (Tarikh)</th>
                        <th className="px-6 py-4 text-center">Tindakan</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                     {records.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic font-medium">Tiada rekod ditemui.</td></tr>
                     ) : (
                        records.map((rec) => (
                           <tr key={rec.id} className="hover:bg-slate-50/50 transition-all group">
                              <td className="px-6 py-4">
                                 <div className="font-black text-blue-700">{rec.header.tarikhSimpan}</div>
                                 <div className="text-[10px] text-slate-400 font-bold">{rec.header.masaSimpan}</div>
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-800 uppercase text-xs">{rec.header.pemeriksaNama || '---'}</td>
                              <td className="px-6 py-4 font-bold text-slate-800 uppercase text-xs">{rec.header.penyemakNama || '---'}</td>
                              <td className="px-6 py-4 font-bold text-slate-800 uppercase text-xs">{rec.header.pengesahNama || '---'}</td>
                              <td className="px-6 py-4">
                                 <div className="flex items-center justify-center gap-3">
                                    <button onClick={() => loadRecord(rec)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><FileText size={18} /></button>
                                    <button onClick={() => deleteRecord(rec.id)} className={`p-2 rounded-lg transition-all ${deleteConfirmId === rec.id ? 'bg-red-600 text-white animate-pulse' : 'bg-red-50 text-red-400 hover:bg-red-500 hover:text-white'}`}>
                                        <Trash2 size={18} />
                                     </button>
                                 </div>
                              </td>
                           </tr>
                        ))
                     )}
                  </tbody>
               </table>
            </div>
          </div>
        </div>
      </div>

      <footer className="bg-white border-t-2 border-slate-200 py-10 text-center">
         <div className="max-w-7xl mx-auto px-4">
            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.4em]">Sistem dibangunkan oleh Cikgu Wan Bee 2026</p>
         </div>
      </footer>

      {showSearchModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh] border-4 border-blue-900 animate-in zoom-in-95 duration-200">
            <div className="bg-blue-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
                  <Users size={24} /> Senarai Induk Pelajar
                </h3>
                <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mt-1">Sila pilih calon untuk Slot {activeSlot !== null ? activeSlot + 1 : '-'}</p>
              </div>
              <button onClick={() => setShowSearchModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-6 border-b bg-slate-50">
               <div className="relative">
                 <input 
                  autoFocus
                  type="text" 
                  placeholder="Cari Nama, No Maktab atau Kelas..." 
                  className="w-full p-4 pl-12 border-2 border-slate-200 rounded-2xl focus:border-blue-500 outline-none font-bold text-lg"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                 />
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
               </div>
            </div>

            <div className="flex-grow overflow-y-auto p-2">
               {filteredStudents.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 p-8">
                    <AlertCircle size={48} className="text-slate-300" />
                    <div className="text-center">
                      <p className="font-black uppercase text-sm tracking-widest text-slate-500">Tiada pelajar ditemui</p>
                      <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">Cuba cari dengan kata kunci lain atau tambah calon baru di bawah</p>
                    </div>
                    <button 
                      onClick={() => {
                        const name = searchQuery.toUpperCase();
                        const newCandidates = [...candidates];
                        if (activeSlot !== null) {
                          newCandidates[activeSlot] = {
                            ...newCandidates[activeSlot],
                            nama: name,
                          };
                          setCandidates(newCandidates);
                          setShowSearchModal(false);
                          setActiveSlot(null);
                          showToast(`Calon ${name} ditambah secara manual`);
                        }
                      }}
                      className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2"
                    >
                      <PenTool size={18} /> Tambah "{searchQuery}" Secara Manual
                    </button>
                 </div>
               ) : (
                 <div className="space-y-6">
                    {sortedLevels.map(level => (
                      <div key={level} className="space-y-2">
                        <div className="px-4 py-2 bg-blue-50 text-blue-900 font-black text-xs uppercase tracking-widest rounded-lg flex items-center justify-between sticky top-0 z-10">
                           <span>TINGKATAN {level}</span>
                           <span className="bg-blue-200 px-3 py-0.5 rounded-full text-[10px]">{groupedStudents[level].length} CALON</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {groupedStudents[level].map((s: any, i: number) => {
                            const prevStudent = i > 0 ? groupedStudents[level][i-1] : null;
                            const isNewClass = !prevStudent || prevStudent.kelas !== s.kelas;

                            return (
                              <React.Fragment key={s.id || i}>
                                {isNewClass && (
                                  <div className="px-2 pt-2 pb-1 text-[9px] font-black text-blue-400 uppercase tracking-tighter flex items-center gap-2">
                                     <div className="h-[1px] flex-grow bg-slate-100"></div>
                                     KELAS {s.kelas || 'TIADA KELAS'}
                                     <div className="h-[1px] flex-grow bg-slate-100"></div>
                                  </div>
                                )}
                                <button 
                                 onClick={() => selectStudent(s)}
                                 className="w-full p-4 flex items-center justify-between hover:bg-slate-50 border border-slate-100 rounded-xl transition-all group active:scale-[0.98] bg-white shadow-sm"
                                >
                                  <div className="text-left">
                                     <div className="font-black text-blue-950 uppercase group-hover:text-blue-700 transition-colors">{s.name}</div>
                                     <div className="text-[10px] font-black bg-blue-100 px-2 py-0.5 rounded text-blue-700 uppercase mt-1 inline-block">{s.kelas || 'TIADA KELAS'}</div>
                                  </div>
                                  <div className="text-right">
                                     <div className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">No. Maktab</div>
                                     <div className="font-mono font-bold text-blue-900">{s.maktabId}</div>
                                  </div>
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-end">
               <button onClick={() => setShowSearchModal(false)} className="px-8 py-3 bg-slate-200 text-slate-700 rounded-xl font-black uppercase tracking-widest hover:bg-slate-300 transition-all">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
