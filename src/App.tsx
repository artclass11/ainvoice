import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp,
  ClipboardList, CreditCard, FilePlus2, FileText, Globe2, LayoutDashboard,
  LockKeyhole, LogOut, Package, Plus, Search, Settings2, ShieldCheck,
  ShoppingBag, Users, Wifi, X
} from "lucide-react";
import { db, getDeviceSettings, saveDeviceSettings, type DeviceSettings, type Invoice } from "./lib/db";
import { calculateInvoiceTotals, createInvoice, parseMoneyToMinor, type DraftLineInput } from "./lib/billing";
import { createPinCredential, verifyPin } from "./lib/security";
import { translate, type Locale } from "./i18n";

type Page = "dashboard" | "invoices" | "products" | "customers" | "reports" | "settings";

const navItems: { id: Page; key: "dashboard" | "invoices" | "products" | "customers" | "reports" | "settings"; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", key: "dashboard", icon: LayoutDashboard },
  { id: "invoices", key: "invoices", icon: FileText },
  { id: "products", key: "products", icon: Package },
  { id: "customers", key: "customers", icon: Users },
  { id: "reports", key: "reports", icon: BarChart3 },
  { id: "settings", key: "settings", icon: Settings2 }
];

const currency = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(minor / 100);

const dateLabel = (value: string) => {
  const parts = value.slice(0, 10).split("-").map(Number);
  const localDate = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(localDate);
};

const localToday = new Date();
const todayKey = [localToday.getFullYear(), String(localToday.getMonth() + 1).padStart(2, "0"), String(localToday.getDate()).padStart(2, "0")].join("-");

export default function App() {
  const [settings, setSettings] = useState<DeviceSettings>();
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [page, setPage] = useState<Page>("dashboard");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showBill, setShowBill] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  useEffect(() => {
    let active = true;
    getDeviceSettings()
      .then((value) => {
        if (!active) return;
        setSettings(value);
        if (value?.locale) setLocale(value.locale);
        setUnlocked(false);
      })
      .catch(() => {
        if (active) setToast("Could not open local data. Check browser storage permissions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    db.invoices.orderBy("createdAt").reverse().toArray().then((rows) => {
      if (active) setInvoices(rows);
    }).catch(() => {
      if (active) setToast("Could not read local bills.");
    });
    return () => { active = false; };
  }, [unlocked, refreshKey]);

  const todayInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.dateISO.slice(0, 10) === todayKey && invoice.status === "issued"),
    [invoices]
  );
  const todaySales = todayInvoices.reduce((sum, invoice) => sum + invoice.totalMinor, 0);
  const receivable = invoices
    .filter((invoice) => invoice.status === "issued")
    .reduce((sum, invoice) => sum + Math.max(0, invoice.totalMinor - invoice.paidMinor), 0);
  const visibleInvoices = invoices.filter((invoice) => {
    const needle = searchTerm.trim().toLowerCase();
    return !needle || invoice.invoiceNo.toLowerCase().includes(needle) || invoice.customerName.toLowerCase().includes(needle);
  });

  async function finishSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const businessName = String(form.get("businessName") || "").trim();
    const pin = String(form.get("pin") || "");
    const confirm = String(form.get("confirmPin") || "");
    const selectedLocale = String(form.get("locale") || "en") as Locale;
    if (!businessName) { setToast("Enter your business name."); return; }
    if (pin !== confirm) { setToast("The PINs do not match."); return; }

    try {
      const credential = await createPinCredential(pin);
      const next: DeviceSettings = {
        id: "main",
        businessName,
        locale: selectedLocale,
        pinSalt: credential.salt,
        pinHash: credential.hash,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await saveDeviceSettings(next);
      setSettings(next);
      setLocale(selectedLocale);
      setUnlocked(true);
      setToast(t("noConnectionNeeded"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not save settings.");
    }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings?.pinHash || !settings.pinSalt) return;
    const form = new FormData(event.currentTarget);
    const pin = String(form.get("pin") || "");
    try {
      const valid = await verifyPin(pin, settings.pinSalt, settings.pinHash);
      if (valid) {
        setUnlocked(true);
        setToast("");
      } else {
        setToast("That PIN is not correct. Try again.");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not verify PIN.");
    }
  }

  async function updateLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    if (!settings) return;
    const next = { ...settings, locale: nextLocale, updatedAt: Date.now() };
    await saveDeviceSettings(next);
    setSettings(next);
  }

  if (loading) {
    return <div className="boot-screen"><div className="brand-mark">A</div><span>AInvoice</span></div>;
  }

  if (!settings || !unlocked) {
    const isFirstRun = !settings;
    return (
      <div className="auth-screen">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <section className="auth-card">
          <div className="brand-lockup">
            <div className="brand-mark">A</div>
            <span>AInvoice</span>
          </div>
          <div className="auth-eyebrow"><ShieldCheck size={14} /> LOCAL-FIRST BILLING</div>
          <h1>{isFirstRun ? t("welcome") : t("unlock")}</h1>
          <p className="auth-subtitle">{isFirstRun ? t("setupTitle") : settings.businessName}</p>
          {isFirstRun ? (
            <form onSubmit={finishSetup} className="auth-form">
              <label>{t("businessName")}<input name="businessName" placeholder="e.g. City Stores" required autoFocus /></label>
              <label>{t("language")}
                <select name="locale" defaultValue="en">
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                  <option value="mr">मराठी</option>
                </select>
              </label>
              <label>{t("choosePin")}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} placeholder="••••" required /></label>
              <label>{t("confirmPin")}<input name="confirmPin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} placeholder="••••" required /></label>
              <p className="field-note">{t("pinHint")}</p>
              <button className="primary-button full-button" type="submit">{t("continue")} <ArrowUpRight size={16} /></button>
            </form>
          ) : (
            <form onSubmit={unlock} className="auth-form">
              <label>{t("enterPin")}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} placeholder="••••" autoFocus required /></label>
              <button className="primary-button full-button" type="submit">{t("unlock")} <ArrowUpRight size={16} /></button>
            </form>
          )}
          <div className="auth-footnote"><LockKeyhole size={14} /> {t("setupHint")}</div>
          <div className="auth-footnote muted"><Wifi size={14} /> {t("noConnectionNeeded")}</div>
          {toast && <div className="toast error-toast">{toast}</div>}
        </section>
      </div>
    );
  }

  const pageTitle = t(page as Parameters<typeof translate>[1]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <div className="brand-mark">A</div>
          <div><strong>AInvoice</strong><small>BUSINESS, MADE SIMPLE</small></div>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-avatar">{(settings.businessName[0] || "A").toUpperCase()}</div>
          <div className="workspace-copy"><strong>{settings.businessName}</strong><small>Local workspace</small></div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => setPage(item.id)}>
                <Icon size={18} strokeWidth={1.8} /><span>{t(item.key)}</span>
                {item.id === "invoices" && invoices.length > 0 && <small>{invoices.length}</small>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card"><div className="local-icon"><ShieldCheck size={16} /></div><div><strong>{t("localOnly")}</strong><small>{t("offline")}</small></div><span className="status-dot" /></div>
          <button className="nav-item lock-action" onClick={() => setUnlocked(false)}><LogOut size={18} /><span>{t("lock")}</span></button>
          <div className="sidebar-version">AInvoice Preview · 0.1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <div className="connection-state"><span className="status-dot" /> {t("localOnly")}</div>
            <div className="topbar-divider" />
            <button className="language-button" onClick={() => updateLocale(locale === "en" ? "hi" : locale === "hi" ? "mr" : "en")} aria-label="Change language"><Globe2 size={16} /><span>{locale.toUpperCase()}</span></button>
            <button className="avatar-button" title={settings.businessName}>{settings.businessName.slice(0, 1).toUpperCase()}</button>
          </div>
        </header>

        <div className="page-content">
          {page === "dashboard" && (
            <>
              <section className="page-heading">
                <div><div className="eyebrow">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</div><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</h1><p>Here is what is happening with your business today.</p></div>
                <button className="primary-button" onClick={() => setShowBill(true)}><Plus size={17} /> {t("newBill")}</button>
              </section>

              <section className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span>{t("todaySales")}</span><span className="stat-icon green"><ArrowUpRight size={17} /></span></div><strong>{currency(todaySales)}</strong><small>From {todayInvoices.length} bills today</small></article>
                <article className="stat-card"><div className="stat-top"><span>{t("billsCreated")}</span><span className="stat-icon blue"><FileText size={17} /></span></div><strong>{todayInvoices.length}</strong><small>{invoices.length} total bills saved</small></article>
                <article className="stat-card"><div className="stat-top"><span>{t("outstanding")}</span><span className="stat-icon orange"><ArrowDownLeft size={17} /></span></div><strong>{currency(receivable)}</strong><small>Across unpaid bills</small></article>
              </section>

              <section className="content-grid">
                <article className="panel recent-panel">
                  <div className="panel-heading"><div><h2>{t("recentBills")}</h2><p>Your latest billing activity</p></div><button className="text-button" onClick={() => setPage("invoices")}>View all <ArrowUpRight size={14} /></button></div>
                  <InvoiceTable rows={invoices.slice(0, 6)} locale={locale} emptyText={t("emptyBills")} onSelect={() => setPage("invoices")} />
                </article>
                <aside className="panel quick-panel">
                  <div className="panel-heading"><div><h2>Quick actions</h2><p>Common tasks, one tap away</p></div></div>
                  <button className="quick-action" onClick={() => setShowBill(true)}><span className="quick-icon accent"><FilePlus2 size={18} /></span><span><strong>Create a bill</strong><small>Make a new customer invoice</small></span><ArrowUpRight size={16} /></button>
                  <button className="quick-action" onClick={() => setPage("products")}><span className="quick-icon"><ShoppingBag size={18} /></span><span><strong>Add an item</strong><small>Build your product list</small></span><ArrowUpRight size={16} /></button>
                  <button className="quick-action" onClick={() => setPage("customers")}><span className="quick-icon"><Users size={18} /></span><span><strong>Add a customer</strong><small>Save customer details</small></span><ArrowUpRight size={16} /></button>
                  <div className="privacy-note"><ShieldCheck size={16} /><span>Your records are saved locally on this device. Create backups regularly.</span></div>
                </aside>
              </section>
            </>
          )}

          {page === "invoices" && (
            <section className="page-section">
              <div className="page-heading compact"><div><div className="eyebrow">SALES</div><h1>{t("invoices")}</h1><p>Find and manage bills saved on this device.</p></div><button className="primary-button" onClick={() => setShowBill(true)}><Plus size={17} /> {t("newBill")}</button></div>
              <div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={16} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search bill number or customer" /></div><span>{visibleInvoices.length} bills</span></div><InvoiceTable rows={visibleInvoices} locale={locale} emptyText={t("emptyBills")} onSelect={() => {}} /></div>
            </section>
          )}

          {page === "settings" && (
            <section className="page-section narrow-section">
              <div className="page-heading compact"><div><div className="eyebrow">PREFERENCES</div><h1>{t("settings")}</h1><p>Keep your workspace comfortable and easy to use.</p></div></div>
              <div className="panel settings-panel"><div className="settings-row"><div><strong>{t("businessName")}</strong><small>{settings.businessName}</small></div><span className="settings-readonly">Saved locally</span></div><div className="settings-row"><div><strong>{t("language")}</strong><small>Choose your preferred app language</small></div><select value={locale} onChange={(event) => updateLocale(event.target.value as Locale)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></div><div className="settings-row"><div><strong>App lock</strong><small>Use the lock control in the sidebar when leaving your counter.</small></div><button className="secondary-button" onClick={() => setUnlocked(false)}><LockKeyhole size={15} /> Lock now</button></div><div className="settings-warning"><CircleHelp size={17} /><p>The current preview stores billing records in this browser profile. Browser data can be cleared, and local storage is not automatically encrypted. Export and encrypted backup are planned before production use.</p></div></div>
            </section>
          )}

          {(page === "products" || page === "customers" || page === "reports") && (
            <section className="page-section">
              <div className="page-heading compact"><div><div className="eyebrow">WORKSPACE</div><h1>{t(page)}</h1><p>This area is being prepared for the first complete release.</p></div></div>
              <div className="panel coming-soon"><div className="coming-icon">{page === "products" ? <Package size={22} /> : page === "customers" ? <Users size={22} /> : <BarChart3 size={22} />}</div><h2>{page === "products" ? "Your item catalogue" : page === "customers" ? "Your customer book" : "Business reports"}</h2><p>{page === "products" ? "Add and organize products, services, SKUs and prices." : page === "customers" ? "Keep customer information and track outstanding balances." : "Understand sales, collections, dues and business performance."}</p><span className="coming-label">Coming in the next build</span></div>
            </section>
          )}

          <footer className="page-footer"><span>Made for the counter, ready for the business.</span><span><ShieldCheck size={13} /> Local-first preview</span></footer>
        </div>
      </main>

      {showBill && <BillModal locale={locale} onClose={() => setShowBill(false)} onSaved={() => { setShowBill(false); setRefreshKey((value) => value + 1); setToast(t("billSaved")); }} />}
      {toast && <div className="toast" role="status"><Check size={15} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}

function InvoiceTable({ rows, locale, emptyText, onSelect }: { rows: Invoice[]; locale: Locale; emptyText: string; onSelect: () => void }) {
  return (
    <div className="table-wrap">
      <table className="invoice-table">
        <thead><tr><th>{translate(locale, "invoice")}</th><th>{translate(locale, "customer")}</th><th>{translate(locale, "date")}</th><th>{translate(locale, "amount")}</th><th>{translate(locale, "status")}</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon"><ClipboardList size={22} /></div><strong>{emptyText}</strong><span>Create a bill to see your activity here.</span></div></td></tr> :
            rows.map((row) => <tr key={row.id} onClick={onSelect}><td><strong className="invoice-number">{row.invoiceNo}</strong></td><td>{row.customerName}</td><td>{dateLabel(row.dateISO)}</td><td className="amount-cell">{currency(row.totalMinor)}</td><td><span className={row.paymentStatus === "paid" ? "status-pill paid" : "status-pill due"}><span />{translate(locale, row.paymentStatus === "paid" ? "paid" : "due")}</span></td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function BillModal({ locale, onClose, onSaved }: { locale: Locale; onClose: () => void; onSaved: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [customerName, setCustomerName] = useState("");
  const [lines, setLines] = useState<{ id: number; description: string; quantity: string; price: string; taxRate: string }[]>([
    { id: 1, description: "", quantity: "1", price: "", taxRate: "0" }
  ]);
  const [nextLineId, setNextLineId] = useState(2);
  const [paidInFull, setPaidInFull] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateLine(index: number, key: "description" | "quantity" | "price" | "taxRate", value: string) {
    setLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, [key]: value } : line
    ));
  }

  const draftLines = useMemo((): DraftLineInput[] | null => {
    try {
      if (lines.some((line) => !line.description.trim() || !line.price.trim())) return null;
      return lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPriceMinor: parseMoneyToMinor(line.price),
        taxRateBps: Number(line.taxRate) * 100
      }));
    } catch {
      return null;
    }
  }, [lines]);

  const totals = useMemo(() => {
    if (!draftLines) return null;
    try { return calculateInvoiceTotals(draftLines); } catch { return null; }
  }, [draftLines]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!price.trim()) throw new Error("Enter the item price.");
      const invoiceLines: DraftLineInput[] = lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPriceMinor: parseMoneyToMinor(line.price),
        taxRateBps: Number(line.taxRate) * 100
      }));
      await createInvoice({ customerName: customerName || t("walkIn"), lines: invoiceLines, paidInFull });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this bill.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="bill-modal" role="dialog" aria-modal="true" aria-labelledby="bill-modal-title">
        <div className="modal-heading"><div><div className="eyebrow">NEW SALE</div><h2 id="bill-modal-title">{t("newBill")}</h2><p>Create and save a bill on this device.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <form onSubmit={submit}>
          <div className="form-field"><label>{t("customer")}</label><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t("walkIn")} /></div>
          <div className="form-divider" />
          <div className="form-section-title"><strong>Bill items</strong><span>{String(lines.length).padStart(2, "0")} items</span></div>
          {lines.map((line, index) => (
            <div className="bill-line" key={line.id}>
              <div className="bill-line-heading"><span>ITEM {String(index + 1).padStart(2, "0")}</span>
                {lines.length > 1 && <button className="remove-line" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X size={13} /> Remove</button>}
              </div>
              <div className="form-field"><label>{t("item")}</label><input value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} placeholder="e.g. Product or service name" required autoFocus={index === 0} /></div>
              <div className="form-grid-three">
                <div className="form-field"><label>{t("quantity")}</label><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required /></div>
                <div className="form-field"><label>{t("unitPrice")} (₹)</label><input inputMode="decimal" value={line.price} onChange={(event) => updateLine(index, "price", event.target.value)} placeholder="0.00" required /></div>
                <div className="form-field"><label>{t("tax")}</label><select value={line.taxRate} onChange={(event) => updateLine(index, "taxRate", event.target.value)}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></div>
              </div>
            </div>
          ))}
          <button className="add-line-button" type="button" onClick={() => { setLines((current) => [...current, { id: nextLineId, description: "", quantity: "1", price: "", taxRate: "0" }]); setNextLineId((value) => value + 1); }}><Plus size={14} /> Add another item</button>
          <label className="check-row"><input type="checkbox" checked={paidInFull} onChange={(event) => setPaidInFull(event.target.checked)} /><span>{t("markPaid")}</span><small>{paidInFull ? "Paid in full" : "Payment pending"}</small></label>
          <div className="totals-box"><div><span>{t("subtotal")}</span><strong>{currency(totals?.subtotalMinor || 0)}</strong></div><div><span>{t("taxAmount")}</span><strong>{currency(totals?.taxMinor || 0)}</strong></div><div className="total-line"><span>{t("total")}</span><strong>{currency(totals?.totalMinor || 0)}</strong></div></div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>{t("cancel")}</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : t("save")} <ArrowUpRight size={16} /></button></div>
        </form>
      </section>
    </div>
  );
}
