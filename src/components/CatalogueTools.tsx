import { useState, type ChangeEvent } from "react";
import { ArrowDownToLine, FileSpreadsheet, Upload } from "lucide-react";
import { db, type Product } from "../lib/db";
import {
  createProductCsvTemplate,
  exportProductsCsv,
  previewProductCsv,
  PRODUCT_CSV_MAX_BYTES,
  type ProductCsvPreview
} from "../lib/catalogue-csv";

type Locale = "en" | "hi" | "mr";
const copy: Record<Locale, Record<string, string>> = {
  en: {
    export: "Export CSV", template: "CSV template", import: "Import CSV",
    title: "Import product catalogue", description: "Review the preview before adding products. Existing SKUs are never overwritten.",
    valid: "Ready to import", skipped: "Rows needing attention", read: "Rows read",
    name: "Product", sku: "SKU", sale: "Sale price", noValid: "No valid rows to import.",
    apply: "Import valid rows", cancel: "Cancel", loading: "Reading file…",
    empty: "Choose a CSV file up to 5 MB. The template shows the exact columns.",
    tooLarge: "The selected file exceeds the 5 MB limit.",
    unknown: "Could not read the selected CSV file.",
    imported: "products imported successfully.",
    duplicateChanged: "The catalogue changed after preview. Reopen the CSV preview to check duplicate SKUs.",
    issues: "Row issues", more: "more row issues",
    note: "Only valid, unique SKU rows will be added. Existing catalogue records will not be edited."
  },
  hi: {
    export: "CSV निर्यात", template: "CSV टेम्पलेट", import: "CSV आयात",
    title: "उत्पाद सूची आयात करें", description: "उत्पाद जोड़ने से पहले पूर्वावलोकन जाँचें। मौजूदा SKU बदले नहीं जाएँगे।",
    valid: "आयात के लिए तैयार", skipped: "जाँच आवश्यक पंक्तियाँ", read: "पढ़ी गई पंक्तियाँ",
    name: "उत्पाद", sku: "SKU", sale: "विक्रय मूल्य", noValid: "आयात के लिए कोई वैध पंक्ति नहीं है।",
    apply: "वैध पंक्तियाँ आयात करें", cancel: "रद्द करें", loading: "फ़ाइल पढ़ी जा रही है…",
    empty: "5 MB तक की CSV फ़ाइल चुनें। टेम्पलेट में सही कॉलम दिए गए हैं।",
    tooLarge: "चुनी गई फ़ाइल 5 MB सीमा से बड़ी है।",
    unknown: "CSV फ़ाइल पढ़ी नहीं जा सकी।",
    imported: "उत्पाद सफलतापूर्वक आयात हुए।",
    duplicateChanged: "पूर्वावलोकन के बाद सूची बदली है। डुप्लिकेट SKU जाँचने के लिए CSV फिर खोलें।",
    issues: "पंक्ति संबंधी त्रुटियाँ", more: "अन्य पंक्ति त्रुटियाँ",
    note: "केवल वैध और अलग SKU वाली पंक्तियाँ जुड़ेंगी। मौजूदा रिकॉर्ड नहीं बदलेंगे।"
  },
  mr: {
    export: "CSV निर्यात", template: "CSV नमुना", import: "CSV आयात",
    title: "उत्पादन सूची आयात करा", description: "उत्पाद जोडण्यापूर्वी पूर्वावलोकन तपासा. विद्यमान SKU बदलले जाणार नाहीत.",
    valid: "आयातीसाठी तयार", skipped: "तपासणी आवश्यक असलेल्या ओळी", read: "वाचलेल्या ओळी",
    name: "उत्पादन", sku: "SKU", sale: "विक्री किंमत", noValid: "आयात करण्यासाठी वैध ओळ नाही.",
    apply: "वैध ओळी आयात करा", cancel: "रद्द करा", loading: "फाइल वाचत आहे…",
    empty: "5 MB पर्यंतची CSV फाइल निवडा. नमुन्यात योग्य कॉलम दिले आहेत.",
    tooLarge: "निवडलेली फाइल 5 MB मर्यादेपेक्षा मोठी आहे.",
    unknown: "CSV फाइल वाचता आली नाही.",
    imported: "उत्पादने यशस्वीरित्या आयात झाली.",
    duplicateChanged: "पूर्वावलोकनानंतर यादी बदलली. डुप्लिकेट SKU तपासण्यासाठी CSV पुन्हा उघडा.",
    issues: "ओळींमधील त्रुटी", more: "अधिक ओळींच्या त्रुटी",
    note: "फक्त वैध आणि वेगळ्या SKU असलेल्या ओळी जोडल्या जातील. विद्यमान नोंदी बदलणार नाहीत."
  }
};

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CatalogueTools({
  products,
  locale,
  onImported
}: {
  products: Product[];
  locale: Locale;
  onImported: (count: number) => void;
}) {
  const t = copy[locale];
  const [preview, setPreview] = useState<ProductCsvPreview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setFilename(file.name);
    if (file.size > PRODUCT_CSV_MAX_BYTES) {
      setPreview(undefined);
      setError(t.tooLarge);
      return;
    }
    try {
      const text = await file.text();
      setPreview(previewProductCsv(text, products));
    } catch (reason) {
      setPreview(undefined);
      setError(reason instanceof Error ? reason.message : t.unknown);
    }
  }

  async function importRows() {
    if (!preview || preview.products.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const now = Date.now();
      await db.transaction("rw", [db.products, db.auditEvents], async () => {
        const current = await db.products.toArray();
        const currentSkus = new Set(current.map(product => product.sku.trim().toUpperCase()));
        const changed = preview.products.some(product => currentSkus.has(product.sku));
        if (changed) throw new Error(t.duplicateChanged);
        await db.products.bulkAdd(preview.products.map(product => ({
          ...product,
          createdAt: now,
          updatedAt: now
        })));
        await db.auditEvents.add({
          entityType: "product",
          action: "catalogue_csv_import",
          summary: "Imported " + preview.products.length + " products from CSV",
          actorLabel: "Local user",
          createdAt: now
        });
      });
      const count = preview.products.length;
      setPreview(undefined);
      setFilename("");
      onImported(count);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.unknown);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="catalogue-tools">
      <button className="secondary-button" type="button" onClick={() => downloadCsv(exportProductsCsv(products), "ainvoice-products.csv")}>
        <ArrowDownToLine size={15}/>{t.export}
      </button>
      <button className="secondary-button" type="button" onClick={() => downloadCsv(createProductCsvTemplate(), "ainvoice-products-template.csv")}>
        <FileSpreadsheet size={15}/>{t.template}
      </button>
      <label className="secondary-button catalogue-file-button">
        <Upload size={15}/>{t.import}
        <input type="file" accept=".csv,text/csv" onChange={chooseFile} aria-label={t.import}/>
      </label>
    </div>
    {preview&&<div className="catalogue-preview-backdrop">
      <section className="catalogue-preview" role="dialog" aria-modal="true" aria-labelledby="catalogue-preview-title">
        <div className="modal-heading">
          <div><div className="eyebrow">AInvoice Pro · CATALOGUE</div><h2 id="catalogue-preview-title">{t.title}</h2><p>{filename} · {t.description}</p></div>
          <button className="icon-button" type="button" onClick={() => setPreview(undefined)} aria-label={t.cancel}>×</button>
        </div>
        <div className="catalogue-preview-stats">
          <div><strong>{preview.products.length}</strong><span>{t.valid}</span></div>
          <div><strong>{preview.issues.length}</strong><span>{t.skipped}</span></div>
          <div><strong>{preview.rowsRead}</strong><span>{t.read}</span></div>
        </div>
        <p className="catalogue-note">{t.note}</p>
        {preview.products.length>0&&<div className="table-wrap catalogue-preview-table"><table className="invoice-table"><thead><tr><th>{t.name}</th><th>{t.sku}</th><th>{t.sale}</th></tr></thead><tbody>
          {preview.products.slice(0,8).map(product=><tr key={product.sku}><td>{product.name}</td><td>{product.sku}</td><td>{(product.salePriceMinor/100).toFixed(2)}</td></tr>)}
        </tbody></table>{preview.products.length>8&&<p className="catalogue-note">Showing 8 of {preview.products.length} valid rows.</p>}</div>}
        {preview.issues.length>0&&<div className="catalogue-issues"><strong>{t.issues}</strong><ul>
          {preview.issues.slice(0,8).map(issue=><li key={issue.row}>Row {issue.row}: {issue.message}</li>)}
        </ul>{preview.issues.length>8&&<small>{preview.issues.length-8} {t.more}</small>}</div>}
        {error&&<div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={() => setPreview(undefined)} disabled={busy}>{t.cancel}</button>
          <button className="primary-button" type="button" onClick={importRows} disabled={busy||preview.products.length===0}>
            {busy?t.loading:t.apply}
          </button>
        </div>
      </section>
    </div>}
    {error&&!preview&&<p className="catalogue-error" role="alert">{error}</p>}
  </>;
}
