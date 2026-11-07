import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, BarChart3, Check, ChevronDown, ClipboardList, Download, FilePlus2, FileText, Globe2, LayoutDashboard, LockKeyhole, LogOut, Package, Plus, Printer, Receipt, Search, Settings2, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { db, getDeviceSettings, saveDeviceSettings, type AuditEvent, type Customer, type DeviceSettings, type Invoice, type Payment, type Product } from "./lib/db";
import { calculateInvoiceTotals, createInvoice, parseMoneyToMinor, recordPayment, saveCustomer, saveProduct, voidInvoice, type DraftLineInput } from "./lib/billing";
import { createPinCredential, verifyPin } from "./lib/security";
import { createEncryptedBackup, restoreEncryptedBackup } from "./lib/backup";
import { translate, type Locale, type MessageKey } from "./i18n";

type Page = "dashboard" | "invoices" | "products" | "customers" | "cashBook" | "reports" | "settings";
type Modal = "bill" | "product" | "customer" | "payment" | "invoice" | null;
const nav: { id: Page; key: MessageKey; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", key: "dashboard", icon: LayoutDashboard },
  { id: "invoices", key: "invoices", icon: FileText },
  { id: "products", key: "products", icon: Package },
  { id: "customers", key: "customers", icon: Users },
  { id: "cashBook", key: "cashBook", icon: Wallet },
  { id: "reports", key: "reports", icon: BarChart3 },
  { id: "settings", key: "settings", icon: Settings2 }
];
function todayISO() { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); }
function money(n: number, code = "INR", locale = "en-IN") { try { return new Intl.NumberFormat(locale,{style:"currency",currency:code,maximumFractionDigits:2}).format(n/100); } catch { return code + " " + (n/100).toFixed(2); } }
function dateLabel(v: string | number, locale = "en-IN") { const d = typeof v === "number" ? new Date(v) : new Date(v.slice(0,10)+"T12:00:00"); return new Intl.DateTimeFormat(locale,{day:"2-digit",month:"short",year:"numeric"}).format(d); }
function localLocale(l: Locale) { return l === "hi" ? "hi-IN" : l === "mr" ? "mr-IN" : "en-IN"; }

export default function App() {
  const [settings,setSettings] = useState<DeviceSettings>();
  const [loading,setLoading] = useState(true);
  const [unlocked,setUnlocked] = useState(false);
  const [locale,setLocale] = useState<Locale>("en");
  const [page,setPage] = useState<Page>("dashboard");
  const [invoices,setInvoices] = useState<Invoice[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [customers,setCustomers] = useState<Customer[]>([]);
  const [payments,setPayments] = useState<Payment[]>([]);
  const [events,setEvents] = useState<AuditEvent[]>([]);
  const [modal,setModal] = useState<Modal>(null);
  const [pickedInvoice,setPickedInvoice] = useState<Invoice>();
  const [pickedProduct,setPickedProduct] = useState<Product>();
  const [pickedCustomer,setPickedCustomer] = useState<Customer>();
  const [query,setQuery] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [toast,setToast] = useState("");
  const t = (key: MessageKey) => translate(locale,key);
  const tag = localLocale(locale);
  const code = settings?.currencyCode || "INR";
  const fmt = (v: number) => money(v,code,tag);

  async function load() {
    const values = await Promise.all([
      db.invoices.orderBy("createdAt").reverse().toArray(),
      db.products.orderBy("name").toArray(),
      db.customers.orderBy("name").toArray(),
      db.payments.orderBy("paidAt").reverse().toArray(),
      db.auditEvents.orderBy("createdAt").reverse().limit(20).toArray(),
      db.settings.get("main")
    ]);
    setInvoices(values[0]); setProducts(values[1]); setCustomers(values[2]); setPayments(values[3]); setEvents(values[4]);
    if (values[5]) setSettings(values[5]);
  }
  useEffect(() => {
    let alive = true;
    getDeviceSettings().then(v => { if (!alive) return; setSettings(v); if (v?.locale) setLocale(v.locale); })
      .catch(() => { if (alive) setToast("Could not read local business data."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    let alive = true;
    load().catch(() => { if (alive) setToast("Could not load local business data."); });
    return () => { alive = false; };
  }, [unlocked,refresh]);

  const issued = invoices.filter(x => x.status === "issued");
  const todayBills = issued.filter(x => x.dateISO === todayISO());
  const todaySales = todayBills.reduce((a,x)=>a+x.totalMinor,0);
  const due = issued.reduce((a,x)=>a+Math.max(0,x.totalMinor-x.paidMinor),0);
  const receivedToday = payments.filter(x => new Date(x.paidAt).toLocaleDateString("en-CA") === todayISO()).reduce((a,x)=>a+x.amountMinor,0);
  const monthSales = issued.filter(x => x.dateISO.startsWith(todayISO().slice(0,7))).reduce((a,x)=>a+x.totalMinor,0);
  const lowStock = products.filter(x=>x.active&&x.trackStock&&x.stockQuantityMilli<=x.reorderLevelMilli).length;
  const visibleInvoices = invoices.filter(x=>!query || x.invoiceNo.toLowerCase().includes(query.toLowerCase()) || x.customerName.toLowerCase().includes(query.toLowerCase()));

  async function setup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f=new FormData(e.currentTarget);
    const name=String(f.get("businessName")||"").trim(), pin=String(f.get("pin")||"");
    const confirm=String(f.get("confirmPin")||"");
    const lang=String(f.get("locale")||"en") as Locale;
    if(!name){setToast("Enter the business name.");return;}
    if(pin!==confirm){setToast("PINs do not match.");return;}
    try{
      const c=await createPinCredential(pin);
      const next:DeviceSettings={id:"main",businessName:name,locale:lang,currencyCode:"INR",countryCode:"IN",address:"",phone:"",taxId:"",invoicePrefix:"AI",invoiceSequence:0,pinSalt:c.salt,pinHash:c.hash,createdAt:Date.now(),updatedAt:Date.now()};
      await saveDeviceSettings(next); setSettings(next);setLocale(lang);setUnlocked(true);setToast(t("noConnectionNeeded"));
    }catch(err){setToast(err instanceof Error?err.message:"Could not save settings.");}
  }
  async function unlock(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(!settings?.pinSalt||!settings.pinHash)return;
    const pin=String(new FormData(e.currentTarget).get("pin")||"");
    try{if(await verifyPin(pin,settings.pinSalt,settings.pinHash)){setUnlocked(true);setToast("");}else setToast("Incorrect PIN.");}
    catch(err){setToast(err instanceof Error?err.message:"PIN check failed.");}
  }
  async function changeLocale(next:Locale) {
    setLocale(next);if(!settings)return;
    const updated={...settings,locale:next,updatedAt:Date.now()};
    await saveDeviceSettings(updated);setSettings(updated);
  }
  function done(message?:string) {
    setModal(null);setPickedInvoice(undefined);setPickedProduct(undefined);setPickedCustomer(undefined);
    setRefresh(v=>v+1);if(message)setToast(message);
  }

  if(loading)return <div className="boot-screen"><div className="brand-mark">A</div><span>AInvoice</span></div>;
  if(!settings||!unlocked)return <div className="auth-screen"><div className="auth-orb auth-orb-one"/><div className="auth-orb auth-orb-two"/>
    <section className="auth-card"><div className="brand-lockup"><div className="brand-mark">A</div><span>AInvoice</span></div>
      <div className="auth-eyebrow"><ShieldCheck size={14}/> OFFLINE-FIRST BUSINESS SOFTWARE</div>
      <h1>{settings?t("unlock"):t("welcome")}</h1><p className="auth-subtitle">{settings?settings.businessName:t("setupTitle")}</p>
      {settings?<form onSubmit={unlock} className="auth-form"><label>{t("enterPin")}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoFocus required/></label><button className="primary-button full-button">{t("unlock")} <ArrowUpRight size={16}/></button></form>
      :<form onSubmit={setup} className="auth-form">
        <label>{t("businessName")}<input name="businessName" placeholder="e.g. City Stores" required autoFocus/></label>
        <label>{t("language")}<select name="locale" defaultValue="en"><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>
        <label>{t("choosePin")}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required/></label>
        <label>{t("confirmPin")}<input name="confirmPin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required/></label>
        <p className="field-note">{t("pinHint")}</p><button className="primary-button full-button">{t("continue")} <ArrowUpRight size={16}/></button>
      </form>}
      <div className="auth-footnote"><LockKeyhole size={14}/>{t("setupHint")}</div><div className="auth-footnote muted"><WifiIcon/>{t("noConnectionNeeded")}</div>
      {toast&&<div className="toast error-toast">{toast}</div>}
    </section></div>;

  const pageTitle=t(nav.find(x=>x.id===page)?.key||"dashboard");
  const hour=new Date().getHours(), greeting=hour<12?t("goodMorning"):hour<17?t("goodAfternoon"):t("goodEvening");

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup sidebar-brand"><div className="brand-mark">A</div><div><strong>AInvoice</strong><small>BUSINESS, MADE SIMPLE</small></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">{settings.businessName.slice(0,1).toUpperCase()}</div><div className="workspace-copy"><strong>{settings.businessName}</strong><small>On-device workspace</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div><nav className="main-nav" aria-label="Main navigation">
        {nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={page===item.id?"nav-item active":"nav-item"} onClick={()=>setPage(item.id)}><Icon size={18}/><span>{t(item.key)}</span>{item.id==="products"&&lowStock>0&&<small>{lowStock}</small>}</button>;})}
      </nav>
      <div className="sidebar-bottom"><div className="local-card"><div className="local-icon"><ShieldCheck size={16}/></div><div><strong>{t("localOnly")}</strong><small>{t("offline")}</small></div><span className="status-dot"/></div>
        <button className="nav-item lock-action" onClick={()=>setUnlocked(false)}><LogOut size={18}/><span>{t("lock")}</span></button><div className="sidebar-version">AInvoice · Early access</div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
        <div className="topbar-actions"><div className="connection-state"><span className="status-dot"/> {t("localOnly")}</div><div className="topbar-divider"/>
          <select className="topbar-locale" value={locale} onChange={e=>changeLocale(e.target.value as Locale)} aria-label={t("language")}><option value="en">EN</option><option value="hi">हि</option><option value="mr">मर</option></select>
          <button className="avatar-button" title={settings.businessName}>{settings.businessName.slice(0,1).toUpperCase()}</button>
        </div>
      </header>
      <div className="page-content">
        {page==="dashboard"&&<Dashboard t={t} greeting={greeting} businessName={settings.businessName} invoices={invoices} products={products} todaySales={todaySales} todayCount={todayBills.length} due={due} received={receivedToday} monthSales={monthSales} lowStock={lowStock} fmt={fmt} onNew={()=>setModal("bill")} onPage={setPage} onInvoice={x=>{setPickedInvoice(x);setModal("invoice");}}/>}
        {page==="invoices"&&<section className="page-section"><div className="page-heading compact"><div><div className="eyebrow">SALES</div><h1>{t("allBills")}</h1><p>{t("searchBills")}</p></div><button className="primary-button" onClick={()=>setModal("bill")}><Plus size={17}/>{t("newBill")}</button></div>
          <div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("searchBills")}/></div><span>{visibleInvoices.length} {t("invoicesCount")}</span></div>
            <InvoiceTable rows={visibleInvoices} t={t} fmt={fmt} onView={x=>{setPickedInvoice(x);setModal("invoice");}} onPay={x=>{setPickedInvoice(x);setModal("payment");}}/>
          </div></section>}
        {page==="products"&&<section className="page-section"><div className="page-heading compact"><div><div className="eyebrow">CATALOGUE</div><h1>{t("products")}</h1><p>{products.length} {t("productsCount")} · {lowStock} {t("lowStock")}</p></div><button className="primary-button" onClick={()=>{setPickedProduct(undefined);setModal("product");}}><Plus size={17}/>{t("addItem")}</button></div>
          <div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("search")}/></div><span>{products.length} {t("productsCount")}</span></div>
            <ProductTable rows={products.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())||x.sku.toLowerCase().includes(query.toLowerCase()))} t={t} fmt={fmt} onEdit={x=>{setPickedProduct(x);setModal("product");}}/>
          </div></section>}
        {page==="customers"&&<section className="page-section"><div className="page-heading compact"><div><div className="eyebrow">RELATIONSHIPS</div><h1>{t("customers")}</h1><p>{customers.length} {t("customersCount")}</p></div><button className="primary-button" onClick={()=>{setPickedCustomer(undefined);setModal("customer");}}><Plus size={17}/>{t("addCustomer")}</button></div>
          <div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("search")}/></div><span>{customers.length} {t("customersCount")}</span></div>
            <CustomerTable rows={customers.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())||x.phone.includes(query))} invoices={invoices} t={t} fmt={fmt} onEdit={x=>{setPickedCustomer(x);setModal("customer");}}/>
          </div></section>}
        {page==="cashBook"&&<section className="page-section"><div className="page-heading compact"><div><div className="eyebrow">PAYMENTS</div><h1>{t("cashBook")}</h1><p>{t("collections")}</p></div><button className="primary-button" onClick={()=>setPage("invoices")}><Wallet size={17}/>{t("collectPayment")}</button></div>
          <section className="stats-grid two-stats"><Stat title={t("receivedToday")} value={fmt(receivedToday)} hint={t("collections")} tone="green"/><Stat title={t("receivables")} value={fmt(due)} hint={t("amountDue")} tone="orange"/></section>
          <div className="panel list-panel"><div className="panel-heading"><div><h2>{t("payment")} history</h2><p>{t("localOnly")}</p></div></div><PaymentTable rows={payments} t={t} fmt={fmt} onView={id=>{const found=invoices.find(x=>x.id===id);if(found){setPickedInvoice(found);setModal("invoice");}}}/></div></section>}
        {page==="reports"&&<Reports invoices={invoices} payments={payments} t={t} fmt={fmt}/>}
        {page==="settings"&&<SettingsPage settings={settings} t={t} onSaved={next=>{setSettings(next);setLocale(next.locale);setToast(t("settingsSaved"));}} onRefresh={()=>setRefresh(v=>v+1)}/>}
        <footer className="page-footer"><span>Made for the counter, ready for the business.</span><span><ShieldCheck size={13}/> Local-first · Open source · Apache-2.0</span></footer>
      </div>
    </main>
    {modal==="bill"&&<BillModal locale={locale} products={products.filter(x=>x.active)} customers={customers.filter(x=>x.active)} fmt={fmt} onClose={()=>setModal(null)} onSaved={()=>done(t("billSaved"))}/>}
    {modal==="product"&&<ProductModal locale={locale} product={pickedProduct} onClose={()=>setModal(null)} onSaved={()=>done(t("itemSaved"))}/>}
    {modal==="customer"&&<CustomerModal locale={locale} customer={pickedCustomer} onClose={()=>setModal(null)} onSaved={()=>done(t("customerSaved"))}/>}
    {modal==="payment"&&pickedInvoice&&<PaymentModal invoice={pickedInvoice} locale={locale} fmt={fmt} onClose={()=>setModal(null)} onSaved={()=>done(t("paymentSaved"))}/>}
    {modal==="invoice"&&pickedInvoice&&<InvoiceModal invoice={pickedInvoice} settings={settings} locale={locale} fmt={fmt} onClose={()=>setModal(null)} onPay={()=>setModal("payment")} onVoided={()=>done(t("invoiceVoided"))}/>}
    {toast&&<div className="toast" role="status"><Check size={15}/>{toast}<button onClick={()=>setToast("")} aria-label="Dismiss"><X size={14}/></button></div>}
  </div>;
}

function WifiIcon(){return <Globe2 size={14}/>;}
function Stat({title,value,hint,tone}:{title:string;value:string;hint:string;tone:"green"|"blue"|"orange"}) {return <article className="stat-card"><div className="stat-top"><span>{title}</span><span className={"stat-icon "+tone}>{tone==="green"?<ArrowUpRight size={17}/>:tone==="blue"?<FileText size={17}/>:<ArrowDownLeft size={17}/>}</span></div><strong>{value}</strong><small>{hint}</small></article>;}

function Dashboard({t,greeting,businessName,invoices,products,todaySales,todayCount,due,received,monthSales,lowStock,fmt,onNew,onPage,onInvoice}:{t:(k:MessageKey)=>string;greeting:string;businessName:string;invoices:Invoice[];products:Product[];todaySales:number;todayCount:number;due:number;received:number;monthSales:number;lowStock:number;fmt:(v:number)=>string;onNew:()=>void;onPage:(p:Page)=>void;onInvoice:(x:Invoice)=>void}) {
  return <><section className="page-heading"><div><div className="eyebrow">{dateLabel(todayISO())}</div><h1>{greeting}, {businessName}</h1><p>{t("welcomeBack")}</p></div><button className="primary-button" onClick={onNew}><Plus size={17}/>{t("newBill")}</button></section>
    <section className="stats-grid"><Stat title={t("todaySales")} value={fmt(todaySales)} hint={todayCount+" "+t("invoicesCount")} tone="green"/><Stat title={t("receivedToday")} value={fmt(received)} hint={t("collections")} tone="blue"/><Stat title={t("outstanding")} value={fmt(due)} hint={t("receivables")} tone="orange"/></section>
    <section className="stats-grid three-stats-secondary"><div className="mini-stat"><span>{t("salesThisMonth")}</span><strong>{fmt(monthSales)}</strong></div><div className="mini-stat"><span>{t("productsCount")}</span><strong>{products.length}</strong></div><div className="mini-stat"><span>{t("lowStock")}</span><strong className={lowStock>0?"warning-number":""}>{lowStock}</strong></div></section>
    <section className="content-grid"><article className="panel recent-panel"><div className="panel-heading"><div><h2>{t("recentBills")}</h2><p>{t("localOnly")}</p></div><button className="text-button" onClick={()=>onPage("invoices")}>{t("viewAll")} <ArrowUpRight size={14}/></button></div><InvoiceTable rows={invoices.slice(0,6)} t={t} fmt={fmt} onView={onInvoice} onPay={onInvoice}/></article>
      <aside className="panel quick-panel"><div className="panel-heading"><div><h2>{t("quickActions")}</h2><p>{t("noConnectionNeeded")}</p></div></div>
        <button className="quick-action" onClick={onNew}><span className="quick-icon accent"><FilePlus2 size={18}/></span><span><strong>{t("newBill")}</strong><small>{t("createFirst")}</small></span><ArrowUpRight size={16}/></button>
        <button className="quick-action" onClick={()=>onPage("products")}><span className="quick-icon"><Package size={18}/></span><span><strong>{t("addItem")}</strong><small>{t("products")}</small></span><ArrowUpRight size={16}/></button>
        <button className="quick-action" onClick={()=>onPage("customers")}><span className="quick-icon"><Users size={18}/></span><span><strong>{t("addCustomer")}</strong><small>{t("customers")}</small></span><ArrowUpRight size={16}/></button>
      </aside></section></>;
}
function InvoiceTable({rows,t,fmt,onView,onPay}:{rows:Invoice[];t:(k:MessageKey)=>string;fmt:(v:number)=>string;onView:(x:Invoice)=>void;onPay:(x:Invoice)=>void}) {
  return <div className="table-wrap"><table className="invoice-table"><thead><tr><th>{t("invoice")}</th><th>{t("customer")}</th><th>{t("date")}</th><th>{t("amount")}</th><th>{t("status")}</th><th>{t("actions")}</th></tr></thead><tbody>
    {rows.length===0?<tr><td colSpan={6}><div className="empty-state"><div className="empty-icon"><ClipboardList size={22}/></div><strong>{t("emptyBills")}</strong><span>{t("createFirst")}</span></div></td></tr>:rows.map(x=><tr key={x.id} className={x.status==="void"?"void-row":""}><td><button className="table-link" onClick={()=>onView(x)}>{x.invoiceNo}</button></td><td>{x.customerName}</td><td>{dateLabel(x.dateISO)}</td><td className="amount-cell">{fmt(x.totalMinor)}</td><td><span className={"status-pill "+(x.status==="void"?"void":x.paymentStatus)}><span/>{t(x.status==="void"?"void":x.paymentStatus)}</span></td><td><div className="row-actions"><button className="row-action" onClick={()=>onView(x)} title={t("viewBill")}><Receipt size={14}/></button>{x.status==="issued"&&x.totalMinor>x.paidMinor&&<button className="row-action" onClick={()=>onPay(x)} title={t("collectPayment")}><Wallet size={14}/></button>}</div></td></tr>)}</tbody></table></div>;
}
function ProductTable({rows,t,fmt,onEdit}:{rows:Product[];t:(k:MessageKey)=>string;fmt:(v:number)=>string;onEdit:(x:Product)=>void}) {
  return <div className="table-wrap"><table className="invoice-table"><thead><tr><th>{t("itemName")}</th><th>{t("sku")}</th><th>{t("salePrice")}</th><th>{t("stock")}</th><th>{t("status")}</th><th>{t("actions")}</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={6}><div className="empty-state"><div className="empty-icon"><Package size={22}/></div><strong>{t("noItems")}</strong></div></td></tr>:rows.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small className="cell-sub">{p.unit}</small></td><td>{p.sku}</td><td className="amount-cell">{fmt(p.salePriceMinor)}</td><td>{p.trackStock?(p.stockQuantityMilli/1000).toFixed(3):t("service")}</td><td><span className={"status-pill "+(p.trackStock&&p.stockQuantityMilli<=p.reorderLevelMilli?"due":"paid")}><span/>{p.trackStock&&p.stockQuantityMilli<=p.reorderLevelMilli?t("lowStock"):t("active")}</span></td><td><button className="row-action" onClick={()=>onEdit(p)}><Settings2 size={14}/></button></td></tr>)}</tbody></table></div>;
}
function CustomerTable({rows,invoices,t,fmt,onEdit}:{rows:Customer[];invoices:Invoice[];t:(k:MessageKey)=>string;fmt:(v:number)=>string;onEdit:(x:Customer)=>void}) {
  return <div className="table-wrap"><table className="invoice-table"><thead><tr><th>{t("customer")}</th><th>{t("phone")}</th><th>{t("taxId")}</th><th>{t("receivables")}</th><th>{t("actions")}</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={5}><div className="empty-state"><div className="empty-icon"><Users size={22}/></div><strong>{t("noCustomers")}</strong></div></td></tr>:rows.map(c=>{const balance=c.openingBalanceMinor+invoices.filter(i=>i.customerId===c.id&&i.status==="issued").reduce((a,i)=>a+Math.max(0,i.totalMinor-i.paidMinor),0);return <tr key={c.id}><td><strong>{c.name}</strong><small className="cell-sub">{c.email}</small></td><td>{c.phone||"—"}</td><td>{c.taxId||"—"}</td><td className="amount-cell">{fmt(balance)}</td><td><button className="row-action" onClick={()=>onEdit(c)}><Settings2 size={14}/></button></td></tr>;})}</tbody></table></div>;
}
function PaymentTable({rows,t,fmt,onView}:{rows:Payment[];t:(k:MessageKey)=>string;fmt:(v:number)=>string;onView:(id:number)=>void}) {
  return <div className="table-wrap"><table className="invoice-table"><thead><tr><th>{t("date")}</th><th>{t("customer")}</th><th>{t("invoice")}</th><th>{t("paymentMethod")}</th><th>{t("amount")}</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={5}><div className="empty-state"><div className="empty-icon"><Wallet size={22}/></div><strong>{t("noPayments")}</strong></div></td></tr>:rows.map(p=><tr key={p.id}><td>{dateLabel(p.paidAt)}</td><td>{p.customerName}</td><td><button className="table-link" onClick={()=>onView(p.invoiceId)}>{p.invoiceNo}</button></td><td>{t(p.method)}</td><td className="amount-cell">{fmt(p.amountMinor)}</td></tr>)}</tbody></table></div>;
}
function Reports({invoices,payments,t,fmt}:{invoices:Invoice[];payments:Payment[];t:(k:MessageKey)=>string;fmt:(v:number)=>string}) {
  const active=invoices.filter(i=>i.status==="issued");
  const total=active.reduce((a,i)=>a+i.totalMinor,0),tax=active.reduce((a,i)=>a+i.taxMinor,0),discount=active.reduce((a,i)=>a+i.discountMinor,0);
  const methods=payments.reduce<Record<string,number>>((a,p)=>{a[p.method]=(a[p.method]||0)+p.amountMinor;return a;},{});
  const items=new Map<string,number>();active.forEach(i=>i.lines.forEach(l=>items.set(l.description,(items.get(l.description)||0)+l.totalMinor)));
  const top=[...items.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  return <section className="page-section"><div className="page-heading compact"><div><div className="eyebrow">BUSINESS INTELLIGENCE</div><h1>{t("reports")}</h1><p>{t("sales")} · {t("collections")} · {t("receivables")}</p></div></div>
    <section className="stats-grid"><Stat title={t("sales")} value={fmt(total)} hint={active.length+" "+t("invoicesCount")} tone="green"/><Stat title={t("taxCollected")} value={fmt(tax)} hint={t("taxAmount")} tone="blue"/><Stat title={t("discount")} value={fmt(discount)} hint={t("discount")} tone="orange"/></section>
    <section className="content-grid"><div className="panel report-panel"><div className="panel-heading"><div><h2>{t("topItems")}</h2></div></div>{top.map(([name,n],i)=><div className="report-row" key={name}><span className="report-rank">{i+1}</span><span>{name}</span><strong>{fmt(n)}</strong></div>)}</div>
      <div className="panel report-panel"><div className="panel-heading"><div><h2>{t("collections")}</h2></div></div>{Object.entries(methods).map(([method,n])=><div className="report-row" key={method}><span>{t(method as MessageKey)}</span><strong>{fmt(n)}</strong></div>)}</div></section>
  </section>;
}
function ModalFrame({children,onClose,wide=false}:{children:ReactNode;onClose:()=>void;wide?:boolean}) {return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={"bill-modal "+(wide?"wide-modal":"")} role="dialog" aria-modal="true">{children}</section></div>;}
function ModalHeader({title,subtitle,eyebrow,onClose}:{title:string;subtitle?:string;eyebrow:string;onClose:()=>void}) {return <div className="modal-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><X size={19}/></button></div>;}
function Field({label,children}:{label:string;children:ReactNode}) {return <div className="form-field"><label>{label}</label>{children}</div>;}

function BillModal({locale,products,customers,fmt,onClose,onSaved}:{locale:Locale;products:Product[];customers:Customer[];fmt:(v:number)=>string;onClose:()=>void;onSaved:()=>void}) {
  const t=(k:MessageKey)=>translate(locale,k);
  const [customerId,setCustomerId]=useState("");const [customerName,setCustomerName]=useState("");
  const [lines,setLines]=useState<{id:number;productId?:number;description:string;sku:string;unit:string;qty:string;price:string;tax:string;discount:string}[]>([{id:1,description:"",sku:"",unit:"pcs",qty:"1",price:"",tax:"0",discount:"0"}]);
  const [next,setNext]=useState(2);const [paid,setPaid]=useState("");const [method,setMethod]=useState<Payment["method"]>("cash");const [notes,setNotes]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  function change(i:number,key:string,value:string){setLines(current=>current.map((line,n)=>n===i?(key==="description"?{...line,description:value,productId:undefined,sku:""}:{...line,[key]:value}):line));}
  function pickProduct(i:number,value:string){const p=products.find(x=>String(x.id)===value);if(!p)return;setLines(current=>current.map((line,n)=>n===i?{...line,productId:p.id,description:p.name,sku:p.sku,unit:p.unit,price:(p.salePriceMinor/100).toFixed(2),tax:String(p.taxRateBps/100)}:line));}
  const draft=useMemo(()=>{try{return lines.map((l):DraftLineInput=>({productId:l.productId,sku:l.sku,description:l.description,unit:l.unit,quantity:Number(l.qty),unitPriceMinor:parseMoneyToMinor(l.price),discountMinor:parseMoneyToMinor(l.discount||"0"),taxRateBps:Math.round(Number(l.tax)*100)}));}catch{return null;}},[lines]);
  const totals=useMemo(()=>{if(!draft)return null;try{return calculateInvoiceTotals(draft);}catch{return null;}},[draft]);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");try{if(!draft)throw new Error("Complete every item with a valid price and quantity.");const c=customers.find(x=>String(x.id)===customerId);const amount=paid.trim()?parseMoneyToMinor(paid):0;await createInvoice({customerId:c?.id,customerName:c?.name||customerName.trim()||t("walkIn"),lines:draft,paidMinor:amount,paymentMethod:method,notes});onSaved();}catch(err){setError(err instanceof Error?err.message:"Could not save bill.");}finally{setBusy(false);}}
  return <ModalFrame onClose={onClose} wide><ModalHeader eyebrow="NEW SALE" title={t("newBill")} subtitle={t("issueBill")} onClose={onClose}/><form onSubmit={submit}>
    <div className="form-grid-two"><Field label={t("customer")}><select value={customerId} onChange={e=>{setCustomerId(e.target.value);setCustomerName("");}}><option value="">{t("walkIn")}</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label={t("customerName")}><input value={customerName} onChange={e=>{setCustomerName(e.target.value);setCustomerId("");}} placeholder={t("walkIn")}/></Field></div>
    <div className="form-divider"/><div className="form-section-title"><strong>{t("item")}</strong><span>{lines.length} {t("productsCount")}</span></div>
    {lines.map((l,i)=><div className="bill-line" key={l.id}><div className="bill-line-heading"><span>ITEM {String(i+1).padStart(2,"0")}</span>{lines.length>1&&<button className="remove-line" type="button" onClick={()=>setLines(current=>current.filter((_,n)=>n!==i))}><X size={13}/> {t("remove")}</button>}</div>
      {products.length>0&&<Field label={t("products")}><select value={l.productId||""} onChange={e=>pickProduct(i,e.target.value)}><option value="">Manual item / service</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {fmt(p.salePriceMinor)}</option>)}</select></Field>}
      <Field label={t("item")}><input value={l.description} onChange={e=>change(i,"description",e.target.value)} placeholder={t("itemName")} required/></Field>
      <div className="form-grid-four"><Field label={t("quantity")}><input type="number" min="0.001" step="0.001" value={l.qty} onChange={e=>change(i,"qty",e.target.value)} required/></Field><Field label={t("unitPrice")}><input inputMode="decimal" value={l.price} onChange={e=>change(i,"price",e.target.value)} placeholder="0.00" required/></Field><Field label={t("discount")}><input inputMode="decimal" value={l.discount} onChange={e=>change(i,"discount",e.target.value)}/></Field><Field label={t("tax")}><select value={l.tax} onChange={e=>change(i,"tax",e.target.value)}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></Field></div>
    </div>)}
    <button className="add-line-button" type="button" onClick={()=>{setLines(current=>[...current,{id:next,description:"",sku:"",unit:"pcs",qty:"1",price:"",tax:"0",discount:"0"}]);setNext(n=>n+1);}}><Plus size={14}/>{t("addAnotherItem")}</button>
    <div className="form-grid-two"><Field label={t("paymentReceived")}><input inputMode="decimal" value={paid} onChange={e=>setPaid(e.target.value)} placeholder="0.00"/></Field><Field label={t("paymentMethod")}><select value={method} onChange={e=>setMethod(e.target.value as Payment["method"])}><option value="cash">{t("cash")}</option><option value="upi">UPI</option><option value="bank">{t("bank")}</option><option value="card">{t("card")}</option><option value="other">{t("other")}</option></select></Field></div>
    <Field label={t("notes")}><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
    <div className="totals-box"><div><span>{t("subtotal")}</span><strong>{fmt(totals?.subtotalMinor||0)}</strong></div><div><span>{t("discount")}</span><strong>{fmt(totals?.discountMinor||0)}</strong></div><div><span>{t("taxAmount")}</span><strong>{fmt(totals?.taxMinor||0)}</strong></div><div className="total-line"><span>{t("total")}</span><strong>{fmt(totals?.totalMinor||0)}</strong></div></div>
    {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("cancel")}</button><button type="submit" className="primary-button" disabled={busy}>{busy?"Saving…":t("issueBill")} <ArrowUpRight size={16}/></button></div>
  </form></ModalFrame>;
}

function ProductModal({locale,product,onClose,onSaved}:{locale:Locale;product?:Product;onClose:()=>void;onSaved:()=>void}) {
  const t=(k:MessageKey)=>translate(locale,k);const [error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await saveProduct({name:String(f.get("name")||""),sku:String(f.get("sku")||""),unit:String(f.get("unit")||"pcs"),salePriceMinor:parseMoneyToMinor(String(f.get("sale")||"0")),purchasePriceMinor:parseMoneyToMinor(String(f.get("purchase")||"0")),taxRateBps:Math.round(Number(f.get("tax")||0)*100),stockQuantityMilli:Math.round(Number(f.get("stock")||0)*1000),reorderLevelMilli:Math.round(Number(f.get("reorder")||0)*1000),trackStock:f.get("track")==="on",active:f.get("active")==="on"},product?.id);onSaved();}catch(err){setError(err instanceof Error?err.message:"Could not save item.");}}
  return <ModalFrame onClose={onClose}><ModalHeader eyebrow="CATALOGUE" title={product?t("edit"):t("addItem")} onClose={onClose}/><form onSubmit={submit}>
    <Field label={t("itemName")}><input name="name" defaultValue={product?.name||""} required autoFocus/></Field>
    <div className="form-grid-two"><Field label={t("sku")}><input name="sku" defaultValue={product?.sku||""} required/></Field><Field label={t("unit")}><select name="unit" defaultValue={product?.unit||"pcs"}><option value="pcs">{t("unitPcs")}</option><option value="kg">{t("unitKg")}</option><option value="litre">{t("unitLitre")}</option><option value="hour">{t("unitHour")}</option><option value="box">{t("unitBox")}</option></select></Field></div>
    <div className="form-grid-two"><Field label={t("salePrice")}><input name="sale" inputMode="decimal" defaultValue={product?(product.salePriceMinor/100).toFixed(2):""} required/></Field><Field label={t("purchasePrice")}><input name="purchase" inputMode="decimal" defaultValue={product?(product.purchasePriceMinor/100).toFixed(2):"0.00"} required/></Field></div>
    <div className="form-grid-two"><Field label={t("tax")}><select name="tax" defaultValue={String((product?.taxRateBps||0)/100)}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></Field><Field label={t("openingStock")}><input name="stock" type="number" min="0" step="0.001" defaultValue={(product?.stockQuantityMilli||0)/1000}/></Field></div>
    <Field label={t("reorderLevel")}><input name="reorder" type="number" min="0" step="0.001" defaultValue={(product?.reorderLevelMilli||0)/1000}/></Field>
    <label className="check-row"><input name="track" type="checkbox" defaultChecked={product?.trackStock??true}/><span>{t("trackStock")}</span></label><label className="check-row"><input name="active" type="checkbox" defaultChecked={product?.active??true}/><span>{t("active")}</span></label>
    {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("cancel")}</button><button type="submit" className="primary-button">{t("saveItem")}</button></div>
  </form></ModalFrame>;
}

function CustomerModal({locale,customer,onClose,onSaved}:{locale:Locale;customer?:Customer;onClose:()=>void;onSaved:()=>void}) {
  const t=(k:MessageKey)=>translate(locale,k);const [error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await saveCustomer({name:String(f.get("name")||""),phone:String(f.get("phone")||""),email:String(f.get("email")||""),address:String(f.get("address")||""),taxId:String(f.get("tax")||""),creditLimitMinor:parseMoneyToMinor(String(f.get("limit")||"0")),openingBalanceMinor:parseMoneyToMinor(String(f.get("balance")||"0")),active:f.get("active")==="on"},customer?.id);onSaved();}catch(err){setError(err instanceof Error?err.message:"Could not save customer.");}}
  return <ModalFrame onClose={onClose}><ModalHeader eyebrow="RELATIONSHIPS" title={customer?t("edit"):t("addCustomer")} onClose={onClose}/><form onSubmit={submit}>
    <Field label={t("customerName")}><input name="name" defaultValue={customer?.name||""} required autoFocus/></Field>
    <div className="form-grid-two"><Field label={t("phone")}><input name="phone" defaultValue={customer?.phone||""}/></Field><Field label={t("email")}><input type="email" name="email" defaultValue={customer?.email||""}/></Field></div>
    <Field label={t("address")}><textarea name="address" rows={2} defaultValue={customer?.address||""}/></Field>
    <div className="form-grid-two"><Field label={t("taxId")}><input name="tax" defaultValue={customer?.taxId||""}/></Field><Field label={t("creditLimit")}><input name="limit" inputMode="decimal" defaultValue={((customer?.creditLimitMinor||0)/100).toFixed(2)}/></Field></div>
    <Field label={t("balance")}><input name="balance" inputMode="decimal" defaultValue={((customer?.openingBalanceMinor||0)/100).toFixed(2)}/></Field>
    <label className="check-row"><input name="active" type="checkbox" defaultChecked={customer?.active??true}/><span>{t("active")}</span></label>
    {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("cancel")}</button><button type="submit" className="primary-button">{t("saveCustomer")}</button></div>
  </form></ModalFrame>;
}

function PaymentModal({invoice,locale,fmt,onClose,onSaved}:{invoice:Invoice;locale:Locale;fmt:(v:number)=>string;onClose:()=>void;onSaved:()=>void}) {
  const t=(k:MessageKey)=>translate(locale,k);const due=invoice.totalMinor-invoice.paidMinor;const [error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await recordPayment({invoiceId:invoice.id!,amountMinor:parseMoneyToMinor(String(f.get("amount")||"0")),method:String(f.get("method")||"cash") as Payment["method"],reference:String(f.get("ref")||""),note:String(f.get("note")||"")});onSaved();}catch(err){setError(err instanceof Error?err.message:"Could not record payment.");}}
  return <ModalFrame onClose={onClose}><ModalHeader eyebrow={invoice.invoiceNo} title={t("collectPayment")} subtitle={invoice.customerName} onClose={onClose}/>
    <div className="payment-summary"><span>{t("billTotal")} <strong>{fmt(invoice.totalMinor)}</strong></span><span>{t("alreadyPaid")} <strong>{fmt(invoice.paidMinor)}</strong></span><span className="due-summary">{t("amountDue")} <strong>{fmt(due)}</strong></span></div>
    <form onSubmit={submit}><Field label={t("amount")}><input name="amount" inputMode="decimal" defaultValue={(due/100).toFixed(2)} required autoFocus/></Field><Field label={t("paymentMethod")}><select name="method"><option value="cash">{t("cash")}</option><option value="upi">UPI</option><option value="bank">{t("bank")}</option><option value="card">{t("card")}</option><option value="other">{t("other")}</option></select></Field><Field label={t("reference")}><input name="ref"/></Field><Field label={t("note")}><input name="note"/></Field>
      {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("cancel")}</button><button type="submit" className="primary-button">{t("recordPayment")}</button></div>
    </form></ModalFrame>;
}

function InvoiceModal({invoice,settings,locale,fmt,onClose,onPay,onVoided}:{invoice:Invoice;settings:DeviceSettings;locale:Locale;fmt:(v:number)=>string;onClose:()=>void;onPay:()=>void;onVoided:()=>void}) {
  const t=(k:MessageKey)=>translate(locale,k);const [showVoid,setShowVoid]=useState(false);const [reason,setReason]=useState("");const [error,setError]=useState("");
  async function doVoid(){try{await voidInvoice(invoice.id!,reason);onVoided();}catch(err){setError(err instanceof Error?err.message:"Could not void bill.");}}
  return <ModalFrame onClose={onClose} wide><ModalHeader eyebrow={invoice.invoiceNo} title={t("billDetails")} subtitle={invoice.customerName} onClose={onClose}/>
    <div className="bill-print-area"><div className="receipt-header"><div><h2>{settings.businessName}</h2>{settings.address&&<p>{settings.address}</p>}{settings.phone&&<p>{settings.phone}</p>}{settings.taxId&&<p>{t("taxId")}: {settings.taxId}</p>}</div><div className="receipt-brand">AInvoice</div></div>
      <div className="receipt-meta"><span><strong>{t("invoice")}:</strong> {invoice.invoiceNo}</span><span><strong>{t("date")}:</strong> {dateLabel(invoice.dateISO)}</span><span><strong>{t("customer")}:</strong> {invoice.customerName}</span></div>
      <div className="table-wrap"><table className="invoice-table receipt-table"><thead><tr><th>{t("item")}</th><th>{t("quantity")}</th><th>{t("unitPrice")}</th><th>{t("discount")}</th><th>{t("tax")}</th><th>{t("amount")}</th></tr></thead><tbody>{invoice.lines.map((l,i)=><tr key={i}><td>{l.description}</td><td>{l.quantity} {l.unit}</td><td>{fmt(l.unitPriceMinor)}</td><td>{fmt(l.discountMinor)}</td><td>{l.taxRateBps/100}%</td><td>{fmt(l.totalMinor)}</td></tr>)}</tbody></table></div>
      <div className="receipt-totals"><div><span>{t("subtotal")}</span><strong>{fmt(invoice.subtotalMinor)}</strong></div><div><span>{t("discount")}</span><strong>{fmt(invoice.discountMinor)}</strong></div><div><span>{t("taxAmount")}</span><strong>{fmt(invoice.taxMinor)}</strong></div><div className="receipt-grand"><span>{t("total")}</span><strong>{fmt(invoice.totalMinor)}</strong></div><div><span>{t("alreadyPaid")}</span><strong>{fmt(invoice.paidMinor)}</strong></div><div><span>{t("amountDue")}</span><strong>{fmt(invoice.totalMinor-invoice.paidMinor)}</strong></div></div>
      {invoice.notes&&<p className="receipt-note">{t("notes")}: {invoice.notes}</p>}<div className="receipt-foot">Thank you for your business.</div>
    </div>
    {error&&<div className="form-error">{error}</div>}{showVoid&&<div className="void-box"><Field label={t("voidReason")}><input value={reason} onChange={e=>setReason(e.target.value)}/></Field><button className="danger-button" onClick={doVoid}>{t("confirmVoid")}</button></div>}
    <div className="modal-actions print-actions"><button className="secondary-button" onClick={onClose}>{t("close")}</button>{invoice.status==="issued"&&invoice.totalMinor>invoice.paidMinor&&<button className="secondary-button" onClick={onPay}><Wallet size={15}/>{t("collectPayment")}</button>}{invoice.status==="issued"&&invoice.paidMinor===0&&<button className="danger-button" onClick={()=>setShowVoid(v=>!v)}>{t("void")}</button>}<button className="primary-button" onClick={()=>window.print()}><Printer size={15}/>{t("printBill")}</button></div>
  </ModalFrame>;
}

function SettingsPage({settings,t,onSaved,onRefresh}:{settings:DeviceSettings;t:(k:MessageKey)=>string;onSaved:(s:DeviceSettings)=>void;onRefresh:()=>void}) {
  const [password,setPassword]=useState("");const [file,setFile]=useState<File>();const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const next:DeviceSettings={...settings,businessName:String(f.get("name")||"").trim(),phone:String(f.get("phone")||""),address:String(f.get("address")||""),taxId:String(f.get("tax")||""),currencyCode:String(f.get("currency")||"INR"),invoicePrefix:String(f.get("prefix")||"AI").trim().toUpperCase(),updatedAt:Date.now()};if(!next.businessName){setError("Enter the business name.");return;}await saveDeviceSettings(next);await db.auditEvents.add({entityType:"settings",action:"updated",summary:"Updated business settings",actorLabel:"Local user",createdAt:Date.now()});onSaved(next);}
  async function backup(){setError("");setBusy(true);try{const blob=await createEncryptedBackup(password);const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ainvoice-backup-"+todayISO()+".ainvoice-backup.json";a.click();URL.revokeObjectURL(url);}catch(err){setError(err instanceof Error?err.message:"Backup failed.");}finally{setBusy(false);}}
  async function restore(){if(!file){setError("Select a backup file.");return;}if(!window.confirm(t("restoreWarning")))return;setError("");setBusy(true);try{await restoreEncryptedBackup(file,password);await db.auditEvents.add({entityType:"backup",action:"restored",summary:"Restored encrypted backup",actorLabel:"Local user",createdAt:Date.now()});onRefresh();}catch(err){setError(err instanceof Error?err.message:"Restore failed.");}finally{setBusy(false);}}
  return <section className="page-section narrow-section"><div className="page-heading compact"><div><div className="eyebrow">PREFERENCES</div><h1>{t("settings")}</h1><p>{t("businessDetails")}</p></div></div><div className="panel settings-panel">
    <form onSubmit={save}><div className="settings-section-title">{t("businessDetails")}</div><Field label={t("businessName")}><input name="name" defaultValue={settings.businessName} required/></Field>
      <div className="form-grid-two"><Field label={t("businessPhone")}><input name="phone" defaultValue={settings.phone}/></Field><Field label={t("taxId")}><input name="tax" defaultValue={settings.taxId}/></Field></div>
      <Field label={t("businessAddress")}><textarea name="address" rows={2} defaultValue={settings.address}/></Field>
      <div className="form-grid-two"><Field label={t("currency")}><select name="currency" defaultValue={settings.currencyCode}><option value="INR">INR — Indian Rupee</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound Sterling</option><option value="AED">AED — Dirham</option></select></Field><Field label={t("invoicePrefix")}><input name="prefix" defaultValue={settings.invoicePrefix}/></Field></div>
      <div className="modal-actions"><button type="submit" className="primary-button">{t("saveSettings")}</button></div>
    </form>
    <div className="settings-divider"/><div className="settings-section-title">{t("dataPrivacy")}</div><p className="settings-description">{t("secureBackup")}. {t("settingsSecurity")}</p>
    <Field label={t("backupPassword")}><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></Field>
    <div className="backup-actions"><button className="secondary-button" onClick={backup} disabled={busy}><Download size={15}/>{t("backupExport")}</button><label className="secondary-button file-picker"><UploadIcon/><span>{t("chooseBackup")}</span><input type="file" accept=".json,application/json" onChange={e=>setFile(e.target.files?.[0])}/></label><button className="primary-button" onClick={restore} disabled={busy||!file}>{t("restore")}</button></div>
    {file&&<p className="settings-description">{file.name}</p>}<div className="settings-warning"><CircleHelp size={17}/><p>{t("restoreWarning")} {t("settingsSecurity")}</p></div>
    <div className="settings-divider"/><div className="settings-section-title">{t("recentActivity")}</div><p className="settings-description">{t("noCloud")} · {t("localData")}</p>
  </div>{error&&<div className="form-error settings-error">{error}</div>}</section>;
}
function UploadIcon(){return <Download size={15}/>;}
